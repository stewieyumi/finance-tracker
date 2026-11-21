import { test, expect, navigate, returningData, storedData } from './fixtures';

for (const theme of ['light', 'dark'] as const) {
  test(`navigation remains at the viewport bottom through scroll and resize in ${theme}`, async ({ page, isolatedApp }, info) => {
    const seed = returningData();
    seed.settings = { ...seed.settings, theme };
    seed.library.bills = Array.from({ length: 30 }, (_, index) => ({
      id: `navigation-${index}`, name: `Scroll commitment ${index}`, amount: 100,
      dueDay: '25', type: 'Bill', wallet: 'main',
    }));
    await isolatedApp(seed);
    await navigate(page, 'Operations');
    await expect(page.getByRole('button', { name: 'Add New Commitment', exact: true })).toBeVisible();
    const snapshot = await storedData(page);
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    const sizes = info.project.name === 'phone'
      ? [{ width: 375, height: 812 }, { width: 375, height: 450 }, { width: 812, height: 375 }, { width: 375, height: 812 }]
      : [{ width: 1280, height: 800 }, { width: 1280, height: 450 }, { width: 1280, height: 800 }];

    for (const size of sizes) {
      await page.setViewportSize(size);
      for (const position of [0, 500, 1500, Number.MAX_SAFE_INTEGER, 0]) {
        await page.evaluate(y => window.scrollTo(0, Math.min(y, document.documentElement.scrollHeight)), position);
        if (position > 0) await expect.poll(() => page.evaluate(y => { window.scrollTo(0, Math.min(y, document.documentElement.scrollHeight)); return window.scrollY; }, position), { message: `scroll at ${position} in ${size.width}x${size.height}` }).toBeGreaterThan(0);
        await expect.poll(() => navigation.evaluate(element =>
          Math.abs(element.getBoundingClientRect().bottom - window.innerHeight)
        )).toBeLessThan(2);
        const button = navigation.getByRole('button', { name: 'Operations', exact: true });
        await expect(button).toBeInViewport({ ratio: 1 });
        await button.click({ trial: true });
      }
    }
    // The viewport rail must not intercept ordinary page controls or final list actions.
    await page.getByRole('button', { name: 'Add New Commitment', exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Add New Commitment', exact: true }).click({ trial: true });
    await page.screenshot({ path: info.outputPath('navigation-after-scroll.png') });
    await navigate(page, 'Wallets');
    await page.locator('.wallet-balance-row').first().click();
    const dialog = page.getByRole('dialog', { name: 'Edit Balance', exact: true });
    await dialog.locator('input').first().focus();
    await dialog.getByRole('button', { name: 'Close balance editor', exact: true }).click();
    await navigate(page, 'Operations');
    await expect.poll(() => navigation.evaluate(element =>
      Math.abs(element.getBoundingClientRect().bottom - window.innerHeight)
    )).toBeLessThan(2);
    expect(await storedData(page)).toEqual(snapshot);
  });
}
