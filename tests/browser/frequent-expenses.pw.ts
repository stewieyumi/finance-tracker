import { test, expect, navigate, returningData, storedData } from './fixtures';

for (const theme of ['light', 'dark'] as const) {
  test(`frequent expense drafts are reviewable and save through normal wallet and summary logic in ${theme}`, async ({ page, isolatedApp }, info) => {
    await page.clock.setFixedTime(new Date(2026, 10, 28, 12));
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { (window as typeof window & { copiedSummary?: string }).copiedSummary = value; } } }));
    const data = returningData(); data.wallets.cash = 500; data.settings!.theme = theme;
    data.library.expenses = [
      { id: 'coffee-old', merchant: 'COFFEE', amount: 50, category: 'Food & Dining', wallet: 'main', date: '2026-11-20' },
      { id: 'coffee-latest', merchant: 'Coffee', amount: 60.25, category: 'Food & Dining', wallet: 'cash', date: '2026-11-27' },
      ...['Lunch at the neighborhood cafe', 'Commute', 'Laundry'].flatMap((merchant, index) => [20, 24].map(day => ({ id: `${index}-${day}`, merchant, amount: 30, category: 'Other', wallet: 'main', date: `2026-11-${day}` }))),
    ];
    const app = await isolatedApp(data);
    await navigate(page, 'Expenses'); const before = await storedData(page);
    await page.getByRole('button', { name: /^Manual/ }).click();
    const form = page.getByRole('dialog', { name: 'Log Expense', exact: true });
    const choices = form.getByRole('group', { name: 'Frequent expenses', exact: true });
    await expect(choices.getByRole('button')).toHaveCount(4);
    for (const button of await choices.getByRole('button').all()) {
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox(); expect(box).toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(await button.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    }
    await choices.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`frequent-expenses-${theme}.png`) });
    await form.getByLabel('Date', { exact: true }).fill('2026-11-26');
    await choices.getByRole('button', { name: /^Use Coffee,/ }).click();
    await expect(form).toBeFocused();
    await expect(form.getByLabel('Merchant / Name', { exact: true })).toHaveValue('Coffee');
    await expect(form.getByLabel('Amount (₱)', { exact: true })).toHaveValue('60.25');
    await expect(form.getByLabel('Category', { exact: true })).toHaveValue('Food & Dining');
    await expect(form.getByLabel('Deduct From', { exact: true })).toHaveValue('cash');
    await expect(form.getByLabel('Date', { exact: true })).toHaveValue('2026-11-26');
    expect(await storedData(page)).toEqual(before);
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: /^Manual/ }).click();
    await expect(form.getByLabel('Merchant / Name', { exact: true })).toHaveValue('');
    await expect(form.getByLabel('Date', { exact: true })).toHaveValue('2026-11-28');
    await choices.getByRole('button', { name: /^Use Coffee,/ }).click();
    await form.getByLabel('Amount (₱)', { exact: true }).fill('9999');
    await form.getByRole('button', { name: 'Save & Deduct', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('Insufficient balance');
    expect(await storedData(page)).toEqual(before);
    await form.getByLabel('Amount (₱)', { exact: true }).fill('65.5');
    await form.getByRole('button', { name: 'Save & Deduct', exact: true }).click();
    await expect(form).toBeHidden();
    const saved = await storedData(page);
    expect(saved!.wallets).toEqual({ ...before!.wallets, cash: 434.5 });
    expect(saved!.library.expenses).toHaveLength(data.library.expenses.length + 1);
    expect(saved!.library.expenses![0]).toMatchObject({ merchant: 'Coffee', amount: 65.5, deductedAmount: 65.5, category: 'Food & Dining', wallet: 'cash', date: '2026-11-28' });
    expect(saved!.library.expenses!.slice(1)).toEqual(before!.library.expenses);
    await app.waitForSaved();
    await navigate(page, 'Dashboard');
    await page.getByRole('button', { name: 'Copy Summary', exact: true }).click();
    const total = (data.library.expenses.reduce((sum, row) => sum + row.amount, 0) + 65.5).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await expect.poll(() => page.evaluate(() => (window as typeof window & { copiedSummary?: string }).copiedSummary)).toContain(`TOTAL RECORDED SPENDING: ₱${total}`);
    await page.reload();
    expect((await storedData(page))!.wallets.cash).toBe(434.5);
    expect((await storedData(page))!.library.expenses).toHaveLength(data.library.expenses.length + 1);
  });
}
