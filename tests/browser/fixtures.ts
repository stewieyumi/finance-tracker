import { test as base, expect, type Page } from '@playwright/test';
import { INITIAL_UNIFIED_DATA } from '../../src/constants/initialData';
import type { UnifiedFinanceData } from '../../src/types/finance';

const origin = 'http://127.0.0.1:5188';
const subject = 'browser-smoke-only';
const binding = 'a'.repeat(32);
export const storageKey = `ft_master_data_v1_${subject}`;
const session = { profile: { sub: subject, name: 'Browser Test', email: 'browser@example.invalid' }, binding };

export function returningData(): UnifiedFinanceData {
  const data = structuredClone(INITIAL_UNIFIED_DATA);
  data.wallets = { main: 2000, cash: 100 };
  data.settings = { ...data.settings, hasCompletedOnboarding: true, defaultWallet: 'main',
    theme: 'dark', customWallets: [{ id: 'main', label: 'Test Bank' }, { id: 'cash', label: 'Test Cash' }] };
  data.updatedAt = Date.now();
  return data;
}

export const test = base.extend<{ isolatedApp: (data?: UnifiedFinanceData, options?: { guides?: boolean; accountDeletion?: "success" | "failure" }) => Promise<{ waitForSaved: () => Promise<void> }> }>({
  isolatedApp: async ({ context, page }, use) => {
    const unexpected: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(async (data, options) => {
      let record = data ? structuredClone(data) : null;
      let revision = record ? 1 : 0;
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === 'https://accounts.google.com' && url.pathname === '/gsi/client') {
          await route.fulfill({ contentType: 'application/javascript', body: '/* Identity provider is simulated for browser smoke tests. */' });
          return;
        }
        if (url.origin === origin && url.pathname === '/api/account' && options?.accountDeletion) {
          expect(request.method()).toBe('DELETE');
          expect(request.headers()['x-finance-session']).toBe(binding);
          expect(request.postDataJSON()).toEqual({ confirmation: 'DELETE', expectedSub: subject });
          if (options.accountDeletion === 'failure') await route.fulfill({ status: 503, json: { error: 'Synthetic deletion unavailable' } });
          else { record = null; revision = 0; await route.fulfill({ json: { deleted: true, sub: subject } }); }
          return;
        }
        if (url.origin === origin && url.pathname === '/api/sync') {
          expect(request.headers()['x-finance-session']).toBe(binding);
          if (request.method() === 'GET') {
            await route.fulfill({ json: url.searchParams.has('version_only')
              ? { updatedAt: record?.updatedAt ?? 0, revision }
              : { record, revision } });
            return;
          }
          if (request.method() === 'PUT') {
            const payload = request.postDataJSON();
            if (payload.baseRevision !== revision && !(revision === 0 && payload.baseRevision === null)) {
              await route.fulfill({ status: 409, json: { error: 'conflict', data: record, revision } });
              return;
            }
            record = payload.data;
            revision++;
            await route.fulfill({ json: { success: true, accepted: true, revision } });
            return;
          }
        }
        const isStatic = url.origin === origin && request.method() === 'GET' &&
          (url.pathname === '/' || url.pathname.startsWith('/assets/') ||
            ['/manifest.json', '/icon-192.png', '/icon-512.png', '/shortcuts/Finance%20Tracker%20Quick%20Expense.shortcut'].includes(url.pathname));
        if (isStatic) { await route.continue(); return; }
        unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
        await route.abort('blockedbyclient');
      });
      await context.addInitScript(({ key, session, initial, guides }) => {
        const guideKey = `ft_context_guides_v1_${encodeURIComponent(session.profile.sub)}`;
        if (!localStorage.getItem(guideKey)) localStorage.setItem(guideKey, JSON.stringify({ automatic: guides, completed: [] }));
        if (!localStorage.getItem('ft_app_session')) localStorage.setItem('ft_app_session', JSON.stringify(session));
        if (initial && !localStorage.getItem(key)) {
          localStorage.setItem(key, JSON.stringify(initial));
          localStorage.setItem('ft_sync_base_revision_browser-smoke-only', '1');
        }
      }, { key: storageKey, session, initial: data ?? null, guides: options?.guides ?? false });
      await page.goto('/');
      return {
        waitForSaved: async () => {
          await expect.poll(async () => {
            const local = await page.evaluate(({ key, revisionKey }) => ({
              data: JSON.parse(localStorage.getItem(key) ?? 'null'),
              revision: Number(localStorage.getItem(revisionKey)),
            }), { key: storageKey, revisionKey: `ft_sync_base_revision_${subject}` });
            return record !== null && local.revision === revision &&
              JSON.stringify(local.data) === JSON.stringify(record);
          }, { message: 'Wait for the simulated cloud acceptance before reopening' }).toBe(true);
        },
      };
    });
    expect(unexpected, 'Unmocked or external network requests').toEqual([]);
    expect(errors, 'Uncaught browser errors').toEqual([]);
  },
});

export { expect };
export async function storedData(page: Page): Promise<UnifiedFinanceData | null> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), storageKey);
}
export async function navigate(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
}
