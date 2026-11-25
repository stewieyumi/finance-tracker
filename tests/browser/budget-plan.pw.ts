import { test, expect, navigate, returningData, storedData } from './fixtures';
import type { Locator, Page } from '@playwright/test';

async function openBudget(page: Page) {
  await page.getByRole('button', { name: /^Budget Plan/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Budget Plan', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function checkFit(page: Page, dialog: Locator) {
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  for (const control of await dialog.locator('button,input,select,summary').filter({ visible: true }).all()) {
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    expect(box, 'control has a layout box').toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(-1); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(box!.y).toBeGreaterThanOrEqual(-1); expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  }
}
for (const theme of ['light', 'dark'] as const) {
  test(`cash guidance and both distribution modes preserve real balances in ${theme}`, async ({ page, isolatedApp }, info) => {
    test.setTimeout(60000);
    await page.clock.setFixedTime(new Date('2026-11-21T08:00:00Z'));
    const data = returningData(); data.wallets = { main: 5000, cash: 1000 }; data.settings = { ...data.settings, theme, perPayoutSalary: 0 };
    const app = await isolatedApp(data);
    const dialog = await openBudget(page);
    await expect(dialog.getByRole('tab', { name: 'Budget', exact: true })).toHaveAttribute('aria-selected', 'true');
    await dialog.getByRole('button', { name: 'Build my budget' }).click();
    await dialog.getByLabel('3. Usual daily essentials (₱)', { exact: true }).fill('200');
    await dialog.getByLabel('4. Upcoming commitments to reserve (₱)', { exact: true }).fill('1000');
    await dialog.getByLabel('5. Savings target for this period (₱)', { exact: true }).fill('1000');
    await dialog.getByRole('button', { name: 'Calculate my plan' }).click();
    await expect(dialog).toContainText('Potential savings before optional spending: ₱3,000.00');
    await dialog.getByText('Spending limit and optional category limits', { exact: true }).click();
    await checkFit(page, dialog);
    await dialog.getByRole('button', { name: 'Save budget', exact: true }).click();
    await expect.poll(async () => (await storedData(page))?.settings?.monthlyBudgets?.['November 2026']?.limit).toBe(5000);
    await expect(dialog).toContainText('Today’s allowance');
    expect((await storedData(page))?.wallets).toEqual(data.wallets);
    await page.screenshot({ path: info.outputPath(`budget-guidance-${theme}.png`) });
    await dialog.getByRole('tab', { name: 'Auto-Distribute' }).click();
    await dialog.getByLabel('Amount to allocate (₱)', { exact: true }).fill('1000');
    await expect(dialog.getByRole('button', { name: 'Distribute existing cash' })).toBeDisabled();
    await dialog.getByLabel('Allocate to Test Cash', { exact: true }).fill('500');
    await dialog.getByLabel('Put the remainder in', { exact: true }).selectOption('main');
    await dialog.getByRole('button', { name: 'Assign remainder', exact: true }).click();
    await dialog.getByRole('button', { name: 'Distribute existing cash', exact: true }).click();
    await expect(dialog).toContainText('Distribution recorded. Unassigned: ₱0.00.');
    expect((await storedData(page))?.wallets).toEqual({ main: 4500, cash: 1500 });
    expect((await storedData(page))?.library.receivables).toHaveLength(0);
    await dialog.getByRole('button', { name: 'New allocation', exact: true }).click();
    await dialog.getByLabel('Which money are you allocating?', { exact: true }).selectOption('received');
    await dialog.getByLabel('Where did the income come from?', { exact: true }).fill('Irregular browser payment');
    await dialog.getByLabel('Amount received (₱)', { exact: true }).fill('750');
    await dialog.getByLabel('Allocate to Test Cash', { exact: true }).fill('750');
    await dialog.getByRole('button', { name: 'Record income & distribute', exact: true }).click();
    await expect(dialog).toContainText('Distribution recorded. Unassigned: ₱0.00.');
    const after = await storedData(page);
    expect(after?.wallets).toEqual({ main: 4500, cash: 2250 });
    expect(after?.library.receivables).toHaveLength(1);
    expect(after?.budgetDistributionIds).toHaveLength(2);
    await page.screenshot({ path: info.outputPath(`distribution-${theme}.png`) });
    await dialog.getByRole('button', { name: 'Close budget plan' }).click();
    await app.waitForSaved(); await page.reload();
    await expect(page.getByRole('button', { name: /^Budget Plan/ })).toBeVisible();
    expect((await storedData(page))?.wallets).toEqual(after?.wallets);
    expect((await storedData(page))?.settings?.monthlyBudgets).toEqual(after?.settings?.monthlyBudgets);
  });

  test(`receiving income offers Later or existing-cash distribution without double credit in ${theme}`, async ({ page, isolatedApp }) => {
    await page.clock.setFixedTime(new Date('2026-11-21T08:00:00Z'));
    const data = returningData(); data.settings = { ...data.settings, theme, perPayoutSalary: 0 };
    data.library.receivables = [{ id: 'first', name: 'First client', amount: 1000, date: '2026-11-21', frequency: 'By Date', wallet: 'main' }, { id: 'second', name: 'Second client', amount: 500, date: '2026-11-21', frequency: 'By Date', wallet: 'main' }];
    const app = await isolatedApp(data);
    await navigate(page, 'Operations'); await page.getByRole('button', { name: 'Inflows', exact: true }).click();
    await page.getByRole('button', { name: 'Mark First client as received', exact: true }).filter({ visible: true }).click();
    const prompt = page.getByRole('dialog', { name: 'Distribute received income', exact: true });
    await expect(prompt).toBeVisible();
    expect((await storedData(page))?.wallets.main).toBe(3000);
    await prompt.getByRole('button', { name: 'Later', exact: true }).click();
    expect((await storedData(page))?.wallets).toEqual({ main: 3000, cash: 100 });
    await page.getByRole('button', { name: 'Mark Second client as received', exact: true }).filter({ visible: true }).click();
    await prompt.getByRole('button', { name: 'Distribute', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Budget Plan', exact: true });
    await expect(dialog.getByRole('tab', { name: 'Auto-Distribute' })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByLabel('Which money are you allocating?', { exact: true })).toHaveValue('existing');
    await expect(dialog.getByLabel('Which money are you allocating?', { exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('Amount to allocate (₱)', { exact: true })).toHaveValue('500');
    await dialog.getByLabel('Allocate to Test Cash', { exact: true }).fill('500');
    await dialog.getByRole('button', { name: 'Distribute existing cash', exact: true }).click();
    expect((await storedData(page))?.wallets).toEqual({ main: 3000, cash: 600 });
    expect((await storedData(page))?.library.receivables).toHaveLength(2);
    await app.waitForSaved();
  });
  test(`budget forms fit compact portrait and landscape in ${theme}`, async ({ page, isolatedApp }, info) => {
    test.setTimeout(60000);
    await page.clock.setFixedTime(new Date('2026-11-21T08:00:00Z'));
    const data = returningData(); data.settings = { ...data.settings, theme, perPayoutSalary: 0 };
    await isolatedApp(data);
    const snapshot = await storedData(page);
    for (const size of info.project.name === 'phone' ? [{ width: 320, height: 568 }, { width: 568, height: 320 }] : [{ width: 640, height: 450 }, { width: 820, height: 1180 }]) {
      await page.setViewportSize(size);
      const dialog = await openBudget(page);
      await dialog.getByRole('button', { name: 'Build my budget' }).click();
      await dialog.getByLabel('3. Usual daily essentials (₱)', { exact: true }).fill('0');
      await dialog.getByRole('button', { name: 'Calculate my plan' }).click();
      await dialog.getByText('Spending limit and optional category limits', { exact: true }).click();
      await checkFit(page, dialog);
      await page.screenshot({ path: info.outputPath(`budget-form-${size.width}x${size.height}-${theme}.png`) });
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await dialog.getByRole('tab', { name: 'Auto-Distribute' }).click();
      await dialog.getByLabel('Which money are you allocating?', { exact: true }).selectOption('received');
      await checkFit(page, dialog);
      await page.screenshot({ path: info.outputPath(`income-form-${size.width}x${size.height}-${theme}.png`) });
      await dialog.getByRole('button', { name: 'Close budget plan' }).click();
    }
    expect(await storedData(page)).toEqual(snapshot);
  });

}
