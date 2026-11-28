import { test, expect, returningData, storedData, navigate } from './fixtures';

for (const [width, height] of [[320, 320], [375, 400], [320, 568], [360, 640], [375, 812], [390, 844], [430, 932], [568, 320], [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1920, 1080], [640, 450]]) for (const theme of ['light', 'dark'] as const) {
  test(`wallet cards and debt overview fit ${width}x${height} ${theme}`, async ({ page, isolatedApp }, info) => {
    test.skip(info.project.name === 'phone' ? width >= 640 : width < 640, 'Matching touch/desktop profile only.');
    await page.setViewportSize({ width, height });
    await page.clock.setFixedTime(new Date('2026-11-27T04:00:00Z'));
    const data = returningData();
    data.wallets = { main: 12345678.90, cash: 100, other: 250, card: 1250.75, travel: 0 };
    data.settings = { ...data.settings, theme, savingsWalletIds: ['main'], walletSavings: { main: 1000 },
      customWallets: [{ id: 'main', label: 'Test Bank', color: 'text-blue-400' }, { id: 'cash', label: 'Cash', color: 'text-amber-400' },
        { id: 'other', label: 'A longer named personal wallet for everyday needs', color: 'text-emerald-400' },
        { id: 'card', label: 'Digital account', color: 'text-purple-400' }, { id: 'travel', label: 'Travel account' }] };
    data.library.bills = [
      { id: 'loan-a', name: 'Phone installment', amount: 100, dueDay: '15', type: 'Loan / Installment', wallet: 'main', startMonth: 'November 2026', endMonth: 'December 2026' },
      { id: 'loan-b', name: 'Laptop installment with a longer name', amount: 200, dueDay: '20', type: 'Loan / Installment', wallet: 'main', startMonth: 'November 2026', endMonth: 'January 2027' },
      { id: 'loan-c', name: 'Upcoming plan', amount: 500, dueDay: '20', type: 'Loan / Installment', wallet: 'main', startMonth: 'June 2027', endMonth: 'July 2027' }
    ];
    data.logs = {}; data.updatedAt = Date.parse('2026-11-27T04:00:00Z');
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { (window as typeof window & { debtSummary?: string }).debtSummary = value; } } }));
    await isolatedApp(data); const before = await storedData(page);
    await navigate(page, 'Wallets');
    const cards = page.locator('.wallet-account-card'); await expect(cards).toHaveCount(5);
    await expect(cards.first()).toContainText('₱12,345,678.90'); await expect(cards.first()).toContainText('₱12,344,678.90');
    await expect(page.getByRole('button', { name: /^Set savings for/ })).toHaveCount(1);
    const boxes = await cards.evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width }; }));
    const firstRow = boxes.filter(box => Math.abs(box.y - boxes[0].y) < 1);
    expect(firstRow.length).toBe(width < 640 ? 1 : width < 1280 ? 2 : 3);
    for (const box of boxes) { expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width + 1); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`wallets-${theme}-${width}.png`), fullPage: true });
    await cards.first().screenshot({ path: info.outputPath(`wallet-card-${theme}-${width}.png`) });
    const balance = page.getByRole('button', { name: /^Test Bank.*Total balance/ });
    await balance.focus(); await page.keyboard.press("Enter");
    await page.getByRole('dialog', { name: 'Edit Balance', exact: true }).getByRole('button', { name: 'Close balance editor' }).click();
    await expect(balance).toBeFocused(); expect(await storedData(page)).toEqual(before);
    await navigate(page, 'Dashboard'); await page.getByLabel('Go to slide 3').click();
    await page.getByRole('button', { name: 'Active Debt, View Debt Runway' }).click();
    const modal = page.getByRole('dialog', { name: 'Financial Intelligence Modal' });
    const hero = modal.getByRole('region', { name: 'Debt overview' });
    await expect(hero).toContainText('₱800.00'); await expect(hero).toContainText('Scheduled in November 2026₱300.00');
    await expect(hero).toContainText('Last planned paymentJuly 2027');
    const breakdown = modal.getByRole('region', { name: 'Active debt breakdown' });
    await expect(breakdown.getByRole('listitem').first()).toContainText('Laptop installment');
    await expect(breakdown.getByRole('listitem').first()).toContainText('75.0%');
    await expect(breakdown.getByRole('listitem').last()).toContainText('25.0%');
    await expect(modal).toContainText('1 upcoming plan'); await expect(modal).toContainText('₱1,000.00');
    const modalBox = await modal.boundingBox(); expect(modalBox!.x).toBeGreaterThanOrEqual(0); expect(modalBox!.x + modalBox!.width).toBeLessThanOrEqual(width + 1);
    expect(await modal.locator('[data-guide-screen]').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await hero.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`debt-${theme}-${width}.png`) });
    await modal.getByRole('button', { name: 'Close analytics modal' }).click();
    await page.getByRole('button', { name: 'Copy Summary', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { debtSummary?: string }).debtSummary)).toContain('INSTALLMENT PLANS');
    const text = await page.evaluate(() => (window as typeof window & { debtSummary?: string }).debtSummary);
    expect(text).toContain('Scheduled in November 2026: ₱300.00'); expect(text).toContain('Last planned payment: July 2027');
    expect(text).toContain('Upcoming plans: 1; ₱1,000.00'); expect(text).toContain('Active debt breakdown: Laptop installment with a longer name: 75.0%; Phone installment: 25.0%');
    expect(await storedData(page)).toEqual(before);
  });
}
