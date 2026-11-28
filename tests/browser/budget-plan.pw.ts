import { reviewBudgetSetup } from './budgetSetupHelpers';
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
    const setup = await reviewBudgetSetup(page, { essentials: '200', commitments: '1000', savings: '1000' });
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(setup).toContainText('Potential savings before optional spending: ₱3,000.00');
    await setup.getByText('Adjust spending and category limits', { exact: true }).click();
    await checkFit(page, setup);
    await setup.getByRole('button', { name: 'Save budget', exact: true }).click();
    await expect(dialog).toBeVisible();
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

  test(`received income waits two minutes, stays in notifications, and distributes existing cash once in ${theme}`, async ({ page, isolatedApp }, info) => {
    await page.clock.install({ time: new Date('2026-11-21T08:00:00Z') });
    const data = returningData(); data.settings = { ...data.settings, theme, perPayoutSalary: 0 };
    data.library.bills = [];
    data.library.receivables = [{ id: 'first', name: 'First client', amount: 1000, date: '2026-11-21', frequency: 'By Date', wallet: 'main' }];
    const app = await isolatedApp(data);
    await navigate(page, 'Operations'); await page.getByRole('button', { name: 'Inflows', exact: true }).click();
    await page.getByRole('button', { name: 'Mark First client as received', exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('dialog', { name: 'Distribute received income', exact: true })).toHaveCount(0);
    await expect(page.getByRole('status', { name: 'Income reminder' })).toHaveCount(0);
    expect((await storedData(page))?.wallets).toEqual({ main: 3000, cash: 100 });
    await page.clock.fastForward(119000);
    await expect(page.getByRole('status', { name: 'Income reminder' })).toHaveCount(0);
    await page.clock.fastForward(2000);
    const reminder = page.getByRole('status', { name: 'Income reminder' });
    await expect(reminder).toContainText('New inflow received');
    await expect(reminder).toContainText('was already added to your wallet');
    await page.screenshot({ path: info.outputPath(`income-reminder-${theme}.png`) });
    await page.clock.fastForward(12001); await expect(reminder).toHaveCount(0);
    await app.waitForSaved(); await page.reload();
    await expect(page.getByRole('status', { name: 'Income reminder' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    const notices = page.getByRole('dialog', { name: 'Notification Center', exact: true });
    await expect(notices).toContainText('Inflow received: First client');
    await page.screenshot({ path: info.outputPath(`received-income-notification-${theme}.png`) });
    await notices.getByRole('button', { name: 'Distribute', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Budget Plan', exact: true });
    await expect(dialog.getByRole('tab', { name: 'Auto-Distribute' })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByLabel('Which money are you allocating?', { exact: true })).toHaveValue('existing');
    await expect(dialog.getByLabel('Which money are you allocating?', { exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('Amount to allocate (₱)', { exact: true })).toHaveValue('1000');
    await dialog.getByLabel('Allocate to Test Cash', { exact: true }).fill('1000');
    await dialog.getByRole('button', { name: 'Distribute existing cash', exact: true }).click();
    expect((await storedData(page))?.wallets).toEqual({ main: 2000, cash: 1100 });
    expect((await storedData(page))?.library.receivables).toHaveLength(1);
    await dialog.getByRole('button', { name: 'Close budget plan' }).click();
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    await expect(notices).not.toContainText('Inflow received: First client');
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
      const setup = await reviewBudgetSetup(page);
      await setup.getByText('Adjust spending and category limits', { exact: true }).click();
      await checkFit(page, setup);
      await page.screenshot({ path: info.outputPath(`budget-form-${size.width}x${size.height}-${theme}.png`) });
      await setup.getByRole('button', { name: 'Close budget setup', exact: true }).click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole('tab', { name: 'Auto-Distribute' }).click();
      await dialog.getByLabel('Which money are you allocating?', { exact: true }).selectOption('received');
      await checkFit(page, dialog);
      await page.screenshot({ path: info.outputPath(`income-form-${size.width}x${size.height}-${theme}.png`) });
      await dialog.getByRole('button', { name: 'Close budget plan' }).click();
    }
    expect(await storedData(page)).toEqual(snapshot);
  });

}

test('Budget Plan downloads on demand and delayed loading can be dismissed by navigation', async ({ page, isolatedApp }) => {
  const requests: string[] = [];
  page.on('request', request => { if (/\/assets\/PaydayModal-[^/]+\.js$/.test(new URL(request.url()).pathname)) requests.push(request.url()); });
  await isolatedApp(returningData());
  expect(requests).toEqual([]);
  const before = await storedData(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/PaydayModal-*.js', async route => { await gate; await route.continue(); });
  await page.getByRole('button', { name: /^Budget Plan/ }).click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(page.getByRole('status').filter({ hasText: 'Loading Budget Plan' })).toBeAttached();
  await navigate(page, 'Operations');
  await expect(page.getByRole('button', { name: 'Commitments', exact: true })).toBeVisible();
  const loaded = page.waitForResponse(response => /\/assets\/PaydayModal-[^/]+\.js$/.test(new URL(response.url()).pathname));
  release();
  await loaded;
  await expect(page.getByRole('dialog', { name: 'Budget Plan', exact: true })).toHaveCount(0);
  await navigate(page, 'Dashboard');
  const dialog = await openBudget(page);
  await expect(dialog.getByRole('tab', { name: 'Budget', exact: true })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('button', { name: 'Close budget plan' }).click();
  expect(requests).toHaveLength(1);
  expect(await storedData(page)).toEqual(before);
});
