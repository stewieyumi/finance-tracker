import { test, expect, returningData, storedData } from './fixtures';
import { budgetDateKey } from '../../src/utils/budgeting';
import { getMonthKey } from '../../src/utils/dateHelpers';

for (const theme of ['light', 'dark'] as const) test(`copy a complete financial summary without changing records in ${theme}`, async ({ page, isolatedApp }) => {
  const data = returningData(); const today = budgetDateKey(); const month = getMonthKey(new Date());
  data.settings = { ...data.settings, theme, monthlyBudgets: { [month]: { limit: 1000 } } };
  data.library.expenses = [{ id: 'summary-expense', merchant: 'Lunch', amount: 150, category: 'Food & Dining', wallet: 'main', date: today }];
  data.library.manualTransactions = [{ id: 'summary-transfer', title: 'Transfer', amount: 300, transferFee: 5, type: 'transfer', wallet: 'main', destinationWallet: 'cash', date: today, createdAt: Date.now() }];
  data.library.shoots = [{ id: 'summary-task', title: 'Client edit', completed: false, status: 'Confirmed' }];
  await page.addInitScript(() => {
    const state = window as typeof window & { copiedSummary?: string; failCopy?: boolean; activeAtCopy?: boolean };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      write: async (items: ClipboardItem[]) => {
        state.activeAtCopy = navigator.userActivation.isActive;
        if (state.failCopy) throw new Error('Synthetic clipboard unavailable');
        state.copiedSummary = await (await items[0].getType('text/plain')).text();
      },
      writeText: async (value: string) => { if (state.failCopy) throw new Error('Synthetic clipboard unavailable'); state.copiedSummary = value; }
    } });
  });
  await isolatedApp(data); const before = await storedData(page);
  await page.getByRole('button', { name: 'Copy Summary', exact: true }).click();
  await expect(page.getByText('📋 Detailed summary copied to clipboard!', { exact: true })).toBeVisible();
  const text = await page.evaluate(() => (window as typeof window & { copiedSummary?: string }).copiedSummary);
  expect(await page.evaluate(() => (window as typeof window & { activeAtCopy?: boolean }).activeAtCopy)).toBe(true);
  expect(text).toContain(`FINANCIAL STATUS REPORT: ${month.toUpperCase()}`);
  expect(text).toContain('AT A GLANCE');
  expect(text).toContain('TOTAL RECORDED SPENDING: ₱155.00');
  expect(text).toContain('Food & Dining: ₱150.00');
  expect(text).toContain('Spending limit: ₱1,000.00');
  expect(text).toContain('Unspent allowance: ₱845.00');
  expect(text).toContain('Test Bank → Test Cash: ₱300.00; fee ₱5.00');
  expect(text).toContain('Client edit: Date not set · Confirmed');
  expect(await storedData(page)).toEqual(before);
  // Exercise the text-only fallback too, without accessing the real clipboard.
  await page.evaluate(() => { Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: undefined }); });
  await page.getByRole('button', { name: 'Copy Summary', exact: true }).click();
  expect(await page.evaluate(() => (window as typeof window & { copiedSummary?: string }).copiedSummary)).toBe(text);
  await page.evaluate(() => { (window as typeof window & { failCopy?: boolean }).failCopy = true; });
  await page.getByRole('button', { name: 'Copy Summary', exact: true }).click();
  await expect(page.getByText('Could not copy summary', { exact: true })).toBeVisible();
  expect(await storedData(page)).toEqual(before);
});
