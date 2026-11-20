import { test, expect, navigate, returningData, storedData } from './fixtures';

for (const theme of ['light', 'dark'] as const) {
  test(`top controls stay fixed while expense and history lists scroll in ${theme} mode`, async ({ page, isolatedApp }, testInfo) => {
    const seed = returningData();
    seed.settings = { ...seed.settings, theme };
    seed.library.expenses = Array.from({ length: 65 }, (_, index) => ({
      id: `scroll-${index}`, merchant: `Scroll expense ${String(index).padStart(2, '0')}`,
      amount: 10, category: 'Other', wallet: 'main', date: '2026-11-19',
      loggedAt: new Date(Date.UTC(2026, 10, 19, 0, index)).toISOString(),
    }));
    await isolatedApp(seed);
    await navigate(page, 'Expenses');
    const entry = page.getByRole('region', { name: 'Add an expense' });
    const recent = page.getByRole('region', { name: 'Recent expenses' });
    await expect(recent).toBeVisible();
    const snapshot = await storedData(page);
    const entryTop = (await entry.boundingBox())!.y;
    const pageTop = await page.evaluate(() => document.scrollingElement!.scrollTop);
    const recentBox = (await recent.boundingBox())!;
    // Layout rectangles can differ from CSS pixels by a tiny subpixel rounding amount.
    expect(Math.round(recentBox.height)).toBeGreaterThanOrEqual(160);
    await page.mouse.move(recentBox.x + recentBox.width / 2, recentBox.y + Math.min(recentBox.height - 20, 60));
    await page.mouse.wheel(0, 600);
    await expect.poll(() => recent.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
    expect(Math.abs((await entry.boundingBox())!.y - entryTop)).toBeLessThan(1);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(pageTop);
    await page.screenshot({ path: testInfo.outputPath(`expenses-fixed-${theme}.png`) });

    await navigate(page, 'Account');
    await page.getByRole('button', { name: 'View Full History', exact: true }).click();
    const history = page.getByRole('dialog', { name: 'Transaction History' });
    const records = history.getByRole('region', { name: 'History transactions' });
    const heading = history.getByRole('heading', { name: 'Transaction History', exact: true });
    const search = history.getByRole('textbox', { name: 'Search transactions' });
    await expect(records).toBeVisible();
    const headingTop = (await heading.boundingBox())!.y;
    const searchTop = (await search.boundingBox())!.y;
    const listBox = (await records.boundingBox())!;
    await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + Math.min(listBox.height - 20, 60));
    await page.mouse.wheel(0, 600);
    await expect.poll(() => records.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
    expect(Math.abs((await heading.boundingBox())!.y - headingTop)).toBeLessThan(1);
    expect(Math.abs((await search.boundingBox())!.y - searchTop)).toBeLessThan(1);
    const scrollers = await history.evaluate(root => [root, ...root.querySelectorAll('*')].filter(element => {
      const box = element as HTMLElement;
      return /^(auto|scroll)$/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight + 1;
    }).length);
    expect(scrollers).toBe(1);
    await records.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await history.getByRole('button', { name: /Load More/ }).click();
    await expect(history.getByText('Showing all 65 transactions')).toHaveCount(1);
    await records.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(history.getByText('Showing all 65 transactions')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`history-fixed-${theme}.png`) });
    await search.fill('Scroll expense 00');
    await expect(records.getByText('Scroll expense 00', { exact: true })).toBeVisible();
    await expect(records.getByText('Scroll expense 01', { exact: true })).toBeHidden();
    // Expanded filters on a short/zoomed viewport remain reachable rather than clipping the list.
    await page.setViewportSize({ width: 320, height: 568 });
    await history.locator('summary').filter({ hasText: 'Date range' }).click();
    await history.getByRole('textbox', { name: 'From date' }).fill('2026-11-19');
    await history.getByRole('textbox', { name: 'To date' }).fill('2026-11-19');
    await records.scrollIntoViewIfNeeded();
    expect(Math.round((await records.boundingBox())!.height)).toBeGreaterThanOrEqual(160);
    await history.getByRole('button', { name: 'Close transaction history' }).click();
    await expect(history).toBeHidden();
    expect(await storedData(page)).toEqual(snapshot);
  });
}
