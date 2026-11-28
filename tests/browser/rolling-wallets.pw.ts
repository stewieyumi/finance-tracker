import { test, expect, navigate, returningData, storedData } from './fixtures';
for (const theme of ['light', 'dark'] as const) test(`wallet cards roll vertically with complete cards and account totals in ${theme}`, async ({ page, isolatedApp }, info) => {
  const data = returningData(); data.settings!.theme = theme;
  data.settings!.customWallets = Array.from({ length: 6 }, (_, index) => ({ id: index ? `bank-${index}` : 'main', label: index ? `Savings bank ${index}` : 'Everyday bank with a longer name' }));
  data.wallets = Object.fromEntries(data.settings!.customWallets.map(wallet => [wallet.id, 1000]));
  data.settings!.savingsWalletIds = data.settings!.customWallets.map(wallet => wallet.id);
  data.settings!.walletSavings = Object.fromEntries(data.settings!.customWallets.map(wallet => [wallet.id, 200]));
  data.library.expenses = [{ id: 'existing', merchant: 'Lunch', amount: 50, category: 'Other', wallet: 'main', date: '2026-11-28' }];
  await isolatedApp(data); await navigate(page, 'Wallets'); const before = await storedData(page);
  const stack = page.getByRole('region', { name: 'Wallet cards', exact: true });
  await stack.scrollIntoViewIfNeeded();
  const mobile = page.viewportSize()!.width < 640;
  if (mobile) await expect.poll(() => stack.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  for (const card of await stack.locator('article').all()) {
    await card.scrollIntoViewIfNeeded();
    if (mobile) {
      // Snap to this card inside the block, while retaining enough height for its whole contents.
      await card.evaluate(element => { const parent = element.parentElement!; parent.scrollTop += element.getBoundingClientRect().top - parent.getBoundingClientRect().top - 12; });
      await expect.poll(() => card.evaluate(element => {
        const box = element.getBoundingClientRect(), frame = element.parentElement!.getBoundingClientRect();
        return box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1;
      })).toBe(true);
    }
    const box = await card.boundingBox(); expect(box).toBeTruthy(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  if (mobile) {
    await stack.evaluate(element => { element.scrollTop = 120; });
    await expect.poll(() => stack.locator('article').evaluateAll(cards => cards.some(card => getComputedStyle(card).transform.startsWith('matrix3d')))).toBe(true);
    await page.screenshot({ path: info.outputPath(`wallet-roll-${theme}.png`) });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => stack.locator('article').first().evaluate(element => getComputedStyle(element).transform)).toBe('none');
  }
  const first = stack.locator('article').first(); await first.scrollIntoViewIfNeeded();
  await first.getByRole('button', { name: /Total balance/ }).click();
  await expect(page.getByRole('dialog', { name: 'Edit Balance', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close balance editor', exact: true }).click();
  const total = page.getByRole('heading', { name: 'Total Wallet Balance', exact: true });
  await total.scrollIntoViewIfNeeded(); await expect(total).toBeVisible();
  expect(await total.evaluate(element => element.parentElement!.parentElement!.textContent)).toContain('₱6,000.00');
  expect(await page.getByRole('heading', { name: 'Account Management', exact: true }).evaluate(element => element.closest('div.rounded-2xl')!.textContent)).toContain('₱1,000.00');
  await page.screenshot({ path: info.outputPath(`wallet-accounts-${theme}.png`) });
  expect(await storedData(page)).toEqual(before);
});
