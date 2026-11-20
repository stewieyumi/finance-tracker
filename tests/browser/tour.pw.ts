import { test, expect, navigate, returningData, storedData } from './fixtures';

for (const theme of ['light', 'dark'] as const) {
  test(`guided tour and direct shortcut setup preserve data in ${theme} mode`, async ({ page, isolatedApp }, testInfo) => {
    const seed = returningData();
    seed.settings = { ...seed.settings, theme };
    const app = await isolatedApp(seed);
    await page.getByRole('button', { name: 'Getting Started', exact: true }).click();
    await page.getByRole('button', { name: 'Take a quick tour' }).click();
    const tour = page.getByRole('dialog', { name: 'App tour' });
    await expect(tour).toBeVisible();
    await expect(tour.getByRole('heading', { name: 'Your dashboard' })).toBeFocused();
    const originalSize = page.viewportSize()!;
    await page.setViewportSize({ width: 320, height: 568 });
    const card = tour.getByRole('heading').locator('..');
    const positioned = async () => expect.poll(() => card.evaluate(element => {
      const box = element.getBoundingClientRect();
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0;
      const y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const spotlight = document.querySelector('[data-testid="tour-spotlight"]')!.getBoundingClientRect();
      const targetId = document.querySelector('[data-testid="tour-spotlight"]')!.getAttribute('data-target');
      const target = document.querySelector(`[data-tour="${targetId}"]`)!.getBoundingClientRect();
      return box.left >= x && box.top >= y && box.right <= x + width + 1 && box.bottom <= y + height + 1 &&
        Math.abs(spotlight.left - (target.left - 4)) < 1 &&
        (box.bottom <= spotlight.top || box.top >= spotlight.bottom || box.right <= spotlight.left || box.left >= spotlight.right);
    })).toBe(true);
    await positioned();
    await page.setViewportSize(originalSize);
    await positioned();
    await page.keyboard.press('4');
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`tour-${theme}.png`) });
    const snapshot = await storedData(page);
    for (const target of ['home', 'wallets', 'expenses', 'operations']) {
      await expect(tour.getByTestId('tour-spotlight')).toHaveAttribute('data-target', target);
      await tour.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await tour.getByRole('button', { name: 'Finish tour' }).click();
    await expect(tour.getByRole('heading', { name: 'Quick Expense and app access' })).toBeFocused();
    await positioned();
    await page.screenshot({ path: testInfo.outputPath(`quick-expense-${theme}.png`) });
    await tour.getByRole('button', { name: 'Set up Quick Expense' }).click();
    const settings = page.getByRole('dialog', { name: 'App Settings' });
    await expect(settings).toBeVisible();
    const details = settings.locator('details').filter({ hasText: 'Add to Apple Shortcuts' });
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator(':scope > summary')).toBeFocused();
    const link = settings.getByRole('link', { name: 'Add to Apple Shortcuts' });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(settings.getByText(/To return here on iPhone/)).toBeVisible();
    const originalUrl = page.url();
    const downloading = page.waitForEvent('download');
    await link.click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('Finance Tracker Quick Expense.shortcut');
    expect(page.url()).toBe(originalUrl);
    await expect(settings).toBeVisible();
    await settings.getByRole('button', { name: 'Close settings modal' }).click();
    await app.waitForSaved();
    expect(await storedData(page)).toEqual(snapshot);
    // Tour can be replayed or skipped without opening settings or mutating data.
    await page.getByRole('button', { name: 'Getting Started', exact: true }).click();
    await page.getByRole('button', { name: 'Take a quick tour' }).click();
    await page.keyboard.press('Escape');
    await expect(tour).toBeHidden();
    await navigate(page, 'Wallets');
    await expect(page.getByRole('region', { name: 'Total Wallet Balance' })).toContainText('₱2,100.00');
  });
}
