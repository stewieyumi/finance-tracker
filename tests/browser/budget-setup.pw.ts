import { test, expect, returningData, storedData } from './fixtures';
import { reviewBudgetSetup } from './budgetSetupHelpers';

for (const theme of ['light', 'dark'] as const) {
  test(`budget setup is a separate guided dialog with safe Back, cancel, review and save in ${theme}`, async ({ page, isolatedApp }, info) => {
    await page.clock.setFixedTime(new Date('2026-11-27T04:00:00Z'));
    const data = returningData(); data.wallets = { main: 5000, cash: 1000 }; data.library.bills = []; data.library.expenses = [];
    data.settings = { ...data.settings, theme, walletSavings: { main: 1000 } };
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as typeof window & { budgetSummary?: string }).budgetSummary = text; } } }));
    const app = await isolatedApp(data); const before = (await storedData(page))!;
    await page.getByRole('button', { name: /^Budget Plan/ }).click();
    const overview = page.getByRole('dialog', { name: 'Budget Plan', exact: true });
    await overview.getByRole('button', { name: 'Build my budget' }).click();
    const setup = page.getByRole('dialog', { name: 'Budget setup', exact: true });
    await expect(page.getByRole('dialog')).toHaveCount(1); await expect(setup.getByRole('heading', { name: 'Which money can you use?' })).toBeFocused();
    await expect(setup.getByText('Selected cash available after Savings').locator('..')).toContainText('₱5,000.00');
    await expect(setup.getByLabel('Usual daily essentials (₱)')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`wallet-step-${theme}.png`) });
    const next = () => setup.getByRole('button', { name: 'Continue', exact: true }).click();
    await next(); await next(); await setup.getByLabel('Usual daily essentials (₱)', { exact: true }).fill('123.45'); await next();
    await setup.getByRole('button', { name: 'Back', exact: true }).click(); await expect(setup.getByLabel('Usual daily essentials (₱)', { exact: true })).toHaveValue('123.45');
    await page.keyboard.press('Escape'); await expect(setup).toHaveCount(0); await expect(overview).toBeVisible(); await expect(overview.getByRole('button', { name: 'Build my budget' })).toBeFocused(); expect(await storedData(page)).toEqual(before);
    await overview.getByRole('button', { name: 'Build my budget' }).click();
    await reviewBudgetSetup(page, { essentials: '200', commitments: '1000', savings: '1000' });
    await expect(setup.getByText('₱750.00', { exact: true })).toBeVisible(); expect(await storedData(page)).toEqual(before);
    await page.screenshot({ path: info.outputPath(`review-step-${theme}.png`) });
    await setup.getByRole('button', { name: 'Save budget', exact: true }).click(); await expect(overview).toBeVisible();
    const saved = (await storedData(page))!;
    expect(saved.settings?.monthlyBudgets?.['November 2026']?.limit).toBe(4000);
    expect(saved.wallets).toEqual(before.wallets); expect(saved.library).toEqual(before.library); expect(saved.logs).toEqual(before.logs);
    await expect(overview.getByText('Left today', { exact: true }).locator('..')).toContainText('₱750.00');
    await overview.getByRole('button', { name: 'Close budget plan' }).click();
    await page.getByRole('button', { name: 'Copy Summary', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { budgetSummary?: string }).budgetSummary)).toContain('Today (2026-11-27): allowance ₱750.00; everyday spending ₱0.00; left ₱750.00');
    await app.waitForSaved(); await page.reload(); expect((await storedData(page))?.settings?.monthlyBudgets).toEqual(saved.settings?.monthlyBudgets);
  });

  test(`all budget setup steps and manual limits fit small, landscape, tablet and desktop screens in ${theme}`, async ({ page, isolatedApp }, info) => {
    test.skip(info.project.name === 'phone', 'The viewport matrix runs once per theme.'); test.setTimeout(90000);
    await page.clock.setFixedTime(new Date('2026-11-27T04:00:00Z'));
    const data = returningData(); data.settings = { ...data.settings, theme }; await isolatedApp(data); const before = await storedData(page);
    for (const [width, height] of [[320, 320], [320, 568], [844, 390], [768, 1024], [1280, 800]]) {
      await page.setViewportSize({ width, height }); await page.getByRole('button', { name: /^Budget Plan/ }).click();
      const overview = page.getByRole('dialog', { name: 'Budget Plan', exact: true }); await overview.getByRole('button', { name: 'Build my budget' }).click();
      const setup = page.getByRole('dialog', { name: 'Budget setup', exact: true });
      for (let step = 0; step < 6; step++) {
        await expect(page.getByRole('dialog')).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        expect(await setup.getByRole('form').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        const action = setup.getByRole('button', { name: step === 5 ? 'Save budget' : 'Continue', exact: true }); await expect(action).toBeInViewport();
        for (const input of await setup.locator('input').filter({ visible: true }).all()) { await input.scrollIntoViewIfNeeded(); await expect(input).toBeInViewport(); }
        if (step === 2) await setup.getByLabel('Usual daily essentials (₱)', { exact: true }).fill('0');
        if (step < 5) await action.click();
      }
      await setup.getByRole('button', { name: 'Close budget setup' }).click(); await overview.getByRole('button', { name: 'Build my budget' }).click();
      await setup.getByText('Already know your spending limit?', { exact: true }).click(); await setup.getByRole('button', { name: 'Enter a manual limit' }).click();
      const save = setup.getByRole('button', { name: 'Save budget', exact: true }); await expect(save).toBeInViewport();
      for (const input of await setup.locator('input').all()) { await input.scrollIntoViewIfNeeded(); await expect(input).toBeInViewport(); }
      await setup.getByRole('button', { name: 'Close budget setup' }).click(); await overview.getByRole('button', { name: 'Close budget plan' }).click();
    }
    expect(await storedData(page)).toEqual(before);
  });
}
