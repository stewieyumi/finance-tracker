import { test, expect, navigate, returningData, storedData } from './fixtures';

for (const theme of ['light', 'dark'] as const) {
  test(`pay next month's early bills without leaving the current month in ${theme} mode`, async ({ page, isolatedApp }, info) => {
    await page.clock.setFixedTime(new Date(2026, 11, 30, 12));
    const data = returningData(); data.settings!.theme = theme;
    data.library.bills = [
      { id: 'ready', name: 'January Internet', amount: 100, dueDay: '1', type: 'Bill', wallet: 'main', startMonth: 'December 2026' },
      { id: 'blocked', name: 'Pending Phone', amount: 50, dueDay: '5', type: 'Bill', wallet: 'main', startMonth: 'December 2026' },
      { id: 'late', name: 'Later Rent', amount: 400, dueDay: '20', type: 'Bill', wallet: 'main', startMonth: 'December 2026' },
    ];
    data.logs = { 'December 2026': { billsPaid: ['ready', 'late'], recsCollected: {} }, 'January 2027': { billsPaid: [], recsCollected: {}, billOverrides: { ready: 125 } } };
    const app = await isolatedApp(data);
    await navigate(page, 'Operations');
    const initial = await storedData(page);
    await page.getByRole('button', { name: 'Pay ahead', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`commitments-top-${theme}.png`) });
    await page.getByRole('button', { name: 'Pay ahead', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Pay bills ahead', exact: true });
    await expect(modal.getByRole('heading', { name: 'Pay bills ahead', exact: true })).toBeFocused();
    await expect(modal.getByText('For January 2027', { exact: true })).toBeVisible();
    await expect(modal.getByText('Pending Phone · December 2026')).toBeVisible();
    await expect(modal.getByText('Later Rent', { exact: true })).toHaveCount(0);
    await modal.getByRole('button', { name: 'Whole month', exact: true }).click();
    await expect(modal.getByText('Later Rent', { exact: true })).toBeVisible();
    await modal.getByRole('button', { name: '1–15 dues', exact: true }).click();
    expect(await storedData(page)).toEqual(initial);
    await page.screenshot({ path: info.outputPath(`pay-ahead-list-${theme}.png`) });
    await modal.getByRole('button', { name: 'Pay January Internet for January 2027', exact: true }).click();
    await expect(modal.getByRole('heading', { name: 'January Internet', exact: true })).toBeFocused();
    await expect(modal.getByText('Current balance: ₱2,000.00', { exact: true })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Confirm payment', exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath(`pay-ahead-review-${theme}.png`) });
    await modal.getByRole('button', { name: 'Confirm payment', exact: true }).click();
    await expect(modal.getByText('Paid', { exact: true })).toBeVisible();
    await expect.poll(async () => (await storedData(page))?.wallets.main).toBe(1875);
    const paid = await storedData(page);
    expect(paid!.logs['January 2027'].billsPaid).toEqual(['ready']);
    expect(paid!.logs['December 2026']).toEqual(initial!.logs['December 2026']);
    expect(paid!.logs['January 2027'].billSettlements!.ready[0]).toMatchObject({ amount: 125, wallet: 'main', walletDebit: 125, paidAt: new Date(2026, 11, 30, 12).toISOString() });
    await modal.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await storedData(page))?.wallets.main).toBe(2000);
    await modal.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(async () => (await storedData(page))?.wallets.main).toBe(1875);
    await modal.getByRole('button', { name: 'Close pay bills ahead', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'December 2026 Commitments', exact: true })).toBeVisible();
    await app.waitForSaved();
    await page.reload();
    await navigate(page, 'Operations');
    await page.getByRole('button', { name: 'Pay ahead', exact: true }).click();
    await expect(modal.getByText('Paid', { exact: true })).toBeVisible();
    expect((await storedData(page))!.logs['January 2027'].billSettlements!.ready).toHaveLength(1);
    expect((await storedData(page))!.wallets.main).toBe(1875);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
