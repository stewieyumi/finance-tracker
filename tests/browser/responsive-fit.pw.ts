import { writeFileSync } from "node:fs";
import { test, expect, navigate, returningData, storedData } from './fixtures';
import type { Locator } from '@playwright/test';

const profiles = [
  [320, 320], [375, 400], [320, 568], [360, 640], [375, 812], [390, 844], [430, 932], [568, 320],
  [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1920, 1080], [640, 450],
] as const;

for (const [width, height] of profiles) for (const theme of ['light', 'dark'] as const) {
  test(`responsive fit ${width}x${height} ${theme}`, async ({ page, isolatedApp }, testInfo) => {
    test.skip(testInfo.project.name === "phone" ? width >= 640 : width < 640, "Use the matching touch/desktop context for each viewport.");
    test.setTimeout(120000);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const seed = returningData();
    seed.wallets.main = 12345678.90;
    seed.settings = { ...seed.settings, theme, perPayoutSalary: 10000, grossPerPayoutSalary: 10000,
      paydayDays: [15, 30], milestoneWallet: 'main', goalName: 'Long term savings and travel milestone' };
    seed.library.bills = [{ id: 'fit-bill', name: 'Equipment installment and monthly production expenses', amount: 2450.25, dueDay: '25', type: 'Bill', wallet: 'main' }];
    seed.library.receivables = [{ id: 'fit-inflow', name: 'International production project with a longer client name', amount: 8000, frequency: 'By Date', date: '2026-11-22', category: 'Edit', wallet: 'main' }];
    seed.library.shoots = [{ id: 'fit-gig', title: 'Location production and client meeting with a long name', date: '2026-11-22', category: 'Shoot', status: 'Confirmed', completed: false }];
    seed.library.expenses = Array.from({ length: 30 }, (_, i) => ({ id: `fit-${i}`, merchant: 'Production supplies and delivery to the shooting location', amount: 1234.56, category: 'Other', wallet: 'main', date: '2026-11-19', loggedAt: `2026-11-19T08:${String(i).padStart(2, '0')}:00.000Z` }));
    await isolatedApp(seed);
    await page.addStyleTag({ content: "*,*::before,*::after { animation: none !important; transition: none !important; }" });
    await expect(page.getByRole('button', { name: 'Dashboard guide' })).toBeVisible();
    const snapshot = await storedData(page);
    const issues: string[] = [];
    const visited: string[] = [];
    const check = async (label: string, modal?: Locator) => {
      visited.push(label);
      const detected = await page.evaluate(() => {
        const failures: string[] = [];
        const vw = window.innerWidth;
        if (document.documentElement.scrollWidth > vw + 1) failures.push(`page width ${document.documentElement.scrollWidth} > ${vw}`);
        const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter(e => e.getClientRects().length);
        const root = dialogs.at(-1) ?? document.querySelector<HTMLElement>('[data-guide-screen]') ?? document.body;
        for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
          const rect = el.getBoundingClientRect();
          if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') continue;
          if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX) && !el.classList.contains('overflow-x-auto') && !el.classList.contains('overflow-auto') && !el.closest('pre')) {
            failures.push(`unintended horizontal scroller ${el.tagName}.${el.className.toString().slice(0, 65)} (${el.scrollWidth}/${el.clientWidth})`);
          }
          if (!el.matches('button,input,select,textarea,h1,h2,h3,h4')) continue;
          let clipped = false;
          for (let parent = el.parentElement; parent && parent !== root.parentElement; parent = parent.parentElement) {
            const overflow = getComputedStyle(parent).overflowX;
            if (/hidden|auto|scroll|clip/.test(overflow) && parent.scrollWidth > parent.clientWidth + 1) { clipped = true; break; }
          }
          if (!clipped && (rect.left < -1 || rect.right > vw + 1)) failures.push(`offscreen ${el.tagName} ${el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 45)} (${Math.round(rect.left)}..${Math.round(rect.right)})`);
        }
        return [...new Set(failures)];
      });
      issues.push(...detected.map(issue => `${label}: ${issue}`));
      if (modal) {
        const heading = modal.getByRole('heading').first();
        const controls = modal.locator('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)').filter({ visible: true });
        const fields = await modal.locator('input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled)').filter({ visible: true }).all();
        const targets: [string, Locator][] = [['heading', heading], ['first control', controls.first()], ['last control', controls.last()], ...fields.map((field, index): [string, Locator] => [`field ${index}`, field])];
        for (const [name, control] of targets) {
          if (!await control.count()) continue;
          await control.scrollIntoViewIfNeeded();
          const box = await control.boundingBox();
          if (box && (box.y < -1 || box.y + box.height > height + 1 || box.x < -1 || box.x + box.width > width + 1)) issues.push(`${label}: unreachable ${name} (${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)})`);
          if (name !== 'heading' && box && box.y >= 0 && box.y + box.height <= height) {
            const covered = await control.evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit !== el && !el.contains(hit); });
            if (covered) issues.push(`${label}: covered ${name}`);
          }
        }
      }
      if (!modal && !await page.getByRole('dialog').count()) {
        const last = page.locator('[data-guide-screen]').filter({ visible: true }).last().locator('button:not(:disabled)').filter({ visible: true }).last();
        if (await last.count()) {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          const box = await last.boundingBox();
          const nav = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
          if (box && nav && box.y < height && box.y + box.height > nav.y + 1) issues.push(`${label}: final action overlaps bottom navigation`);
          await page.evaluate(() => window.scrollTo(0, 0));
        }
      }
      writeFileSync(testInfo.outputPath("layout-audit.json"), JSON.stringify({ width, height, theme, visited, issues }, null, 2));
    };
    const dialog = (name: string) => page.getByRole('dialog', { name, exact: true });
    const openCheck = async (button: Locator, name: string) => {
      await button.click(); await expect(dialog(name)).toBeVisible(); await check(name, dialog(name));
    };
    const clippedLabels = await page.getByRole('navigation', { name: 'Main navigation' }).locator('button span').evaluateAll(labels => labels.filter(label => label.scrollWidth > label.clientWidth + 1).map(label => label.textContent));
    issues.push(...clippedLabels.map(label => `Bottom navigation: clipped label ${label}`));
    await check('Dashboard');
    await page.screenshot({ path: testInfo.outputPath('dashboard.png') });
    await openCheck(page.getByRole('button', { name: 'Getting Started', exact: true }), 'Getting Started');
    await page.screenshot({ path: testInfo.outputPath('getting-started.png') });
    await dialog('Getting Started').getByRole('button', { name: 'Done', exact: true }).click();
    await openCheck(page.getByRole('button', { name: 'Configure savings goal' }), 'Goal Configuration Modal');
    await page.getByRole('button', { name: 'Close goal setup modal' }).click();
    await openCheck(page.getByRole('button', { name: 'Runway', exact: true }), 'Financial Intelligence Modal');
    for (const tab of ['Cashflow', 'Debt', 'Goals']) { await dialog('Financial Intelligence Modal').getByRole('button', { name: tab, exact: true }).click(); await check(`Runway ${tab}`, dialog('Financial Intelligence Modal')); }
    await page.getByRole('button', { name: 'Close analytics modal' }).click();
    await openCheck(page.getByRole('button', { name: 'Yearly', exact: true }), 'Yearly Overview Modal');
    await dialog('Yearly Overview Modal').getByRole('button', { name: 'Done', exact: true }).click();
    await openCheck(page.getByRole('button', { name: /^Budget Plan/ }), 'Budget Plan');
    await page.getByRole('button', { name: 'Close budget plan' }).click();
    await openCheck(page.getByRole('button', { name: /^Upcoming/ }), 'Upcoming Commitments Modal');
    await page.getByRole('button', { name: 'Close upcoming modal' }).click();
    await openCheck(page.getByRole('button', { name: 'Quick Add', exact: true }), 'Quick Add Menu');
    await page.getByRole('button', { name: 'Close quick add menu' }).click();
    await openCheck(page.getByRole('button', { name: 'Notifications', exact: true }), 'Notification Center');
    await page.getByRole('button', { name: 'Close notification center' }).click();
    await navigate(page, 'Wallets'); await check('Wallets');
    await openCheck(page.locator('.wallet-balance-row').first(), 'Edit Balance');
    await page.getByRole('button', { name: 'Close balance editor' }).click();
    await openCheck(page.getByRole('button', { name: 'Transfer', exact: true }), 'Transfer');
    await dialog('Transfer').getByRole('button', { name: 'Add transfer fee' }).click(); await check('Transfer with fee', dialog('Transfer'));
    await page.screenshot({ path: testInfo.outputPath('transfer.png') });
    await dialog('Transfer').getByRole('button', { name: 'Cancel', exact: true }).click();
    await navigate(page, 'Expenses'); await check('Expenses');
    await openCheck(page.getByRole('button', { name: /^Manual\b/ }), 'Log Expense');
    await page.screenshot({ path: testInfo.outputPath('expense.png') });
    await dialog('Log Expense').getByRole('button', { name: 'Cancel', exact: true }).click();
    await navigate(page, 'Operations'); await check('Commitments');
    await openCheck(page.getByRole('button', { name: /Add New Commitment/i }), 'Add New Commitment');
    await page.getByRole('button', { name: 'Cancel new commitment' }).click();
    await page.getByRole('button', { name: 'Inflows', exact: true }).click(); await check('Inflows');
    await openCheck(page.getByRole('button', { name: /Add New Inflow/i }), 'Add New Inflow');
    await page.getByRole('button', { name: 'Cancel new inflow' }).click();
    await page.getByRole('button', { name: 'Gigs & Tasks', exact: true }).click(); await check('Gigs');
    await page.getByRole('button', { name: /Add New Gig/i }).click();
    await check('Add New Gig', page.locator('.fixed.inset-0').filter({ has: page.getByRole('button', { name: 'Close new gig' }) }).last());
    await page.getByRole('button', { name: 'Close new gig' }).click();
    await navigate(page, 'Account'); await check('Account');
    await openCheck(page.getByRole('button', { name: 'View Full History', exact: true }), 'Transaction History');
    await dialog('Transaction History').locator('summary').filter({ hasText: 'Date range' }).click(); await check('History expanded', dialog('Transaction History'));
    await dialog('Transaction History').getByRole('button', { name: 'Manage Ledger' }).click();
    await check('Historical Ledger', dialog('Historical Ledger'));
    await dialog('Historical Ledger').getByRole('button', { name: 'Add Manual Transaction' }).click();
    await check('New historical transaction', dialog('Historical Ledger'));
    await dialog('Historical Ledger').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Close ledger' }).click();
    await openCheck(page.getByRole('button', { name: 'Open Settings', exact: true }), 'App Settings');
    const settings = dialog('App Settings');
    await page.screenshot({ path: testInfo.outputPath('settings.png') });
    const sections = settings.getByRole('navigation', { name: 'Settings sections' });
    for (const tab of ['Payday', 'Wallet Defaults', 'Calendar', 'Cloud Sync', 'Account', 'General']) {
      await sections.getByRole('button', { name: new RegExp(`^${tab}`) }).click(); await check(`Settings ${tab}`, settings);
    }
    await settings.getByRole('button', { name: 'Settings guide' }).click();
    const guide = dialog('General settings walkthrough'); await expect(guide).toBeVisible();
    await check('Settings guide', guide);
    let step = 0;
    while (await guide.getByRole('button', { name: 'Next', exact: true }).count()) {
      expect(++step).toBeLessThan(8);
      await guide.getByRole('button', { name: 'Next', exact: true }).click();
      await check(`Settings guide step ${step + 1}`, guide);
    }
    await page.keyboard.press('Escape');
    await settings.getByRole('button', { name: 'Close settings modal' }).click();
    expect(await storedData(page)).toEqual(snapshot);
    await testInfo.attach('layout-audit', { body: JSON.stringify({ width, height, theme, visited, issues }, null, 2), contentType: 'application/json' });
    expect(issues, `${width}x${height} ${theme} layout issues`).toEqual([]);
  });
}

for (const [width, height] of [[320, 568], [568, 320], [1280, 720]] as const) for (const theme of ['light', 'dark'] as const) {
  test(`setup and full tour fit ${width}x${height} ${theme}`, async ({ page, isolatedApp }, testInfo) => {
    test.skip(testInfo.project.name === 'phone' ? width >= 640 : width < 640, 'Use the matching viewport context.');
    test.setTimeout(90000);
    await page.setViewportSize({ width, height });
    await isolatedApp();
    await page.addStyleTag({ content: '*,*::before,*::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(theme => { document.documentElement.classList.remove('dark', 'light'); document.documentElement.classList.add(theme); }, theme);
    const fit = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await fit();
    await page.getByRole('button', { name: 'Get Started' }).click();
    await page.getByRole('button', { name: /^Regular income/ }).click();
    await page.getByRole('spinbutton', { name: 'Gross Salary' }).fill('12345678.90');
    await fit();
    await page.screenshot({ path: testInfo.outputPath('setup-income.png') });
    await page.getByRole('button', { name: 'Next: Wallets' }).click(); await fit();
    await page.getByRole('button', { name: 'Next: Milestone Goal' }).click(); await fit();
    await page.getByRole('textbox', { name: 'Goal Name' }).fill('Savings for a long term career and family milestone');
    await page.getByRole('button', { name: 'Next: Appearance' }).click(); await fit();
    await page.getByRole('button', { name: theme === 'light' ? 'Light' : 'Dark', exact: true }).click();
    await page.getByRole('button', { name: 'Finish Setup & Launch' }).click();
    const tour = page.getByRole('dialog', { name: 'App tour' });
    await expect(tour).toBeVisible();
    const snapshot = await storedData(page);
    await tour.getByRole('button', { name: 'All features', exact: true }).click();
    for (let step = 0; step < 10; step++) {
      const details = tour.locator('details');
      if (!await details.evaluate(el => (el as HTMLDetailsElement).open)) await details.locator('summary').click();
      await fit();
      const heading = tour.getByRole('heading'); await heading.scrollIntoViewIfNeeded();
      const box = (await heading.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(height);
      const next = tour.getByRole('button', { name: step === 9 ? 'Finish tour' : 'Next', exact: true });
      await next.scrollIntoViewIfNeeded(); await next.click();
    }
    await expect(tour.getByRole('heading', { name: 'Quick Expense and app access' })).toBeVisible();
    await tour.getByRole('button', { name: 'Install app / see steps' }).click();
    await fit();
    await page.screenshot({ path: testInfo.outputPath('install-help.png') });
    await page.keyboard.press('Escape');
    expect(await storedData(page)).toEqual(snapshot);
  });
}


for (const theme of ['light', 'dark'] as const) {
  test(`navigation labels fit wider fonts in ${theme} mode`, async ({ page, isolatedApp }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Narrow touch navigation check.');
    await page.setViewportSize({ width: 320, height: 568 });
    const data = returningData(); data.settings = { ...data.settings, theme };
    await isolatedApp(data);
    await page.addStyleTag({ content: 'body { font-family: Verdana, sans-serif; }' });
    const labels = page.getByRole('navigation', { name: 'Main navigation' }).locator('button span');
    await expect(labels).toHaveCount(5);
    for (const width of [320, 360, 375]) {
      await page.setViewportSize({ width, height: 568 });
      await expect.poll(() => labels.evaluateAll(items => items.filter(item => item.scrollWidth > item.clientWidth + 1).map(item => item.textContent))).toEqual([]);
    }
  });
}
