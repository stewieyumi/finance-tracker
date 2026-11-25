import { test, expect, navigate, returningData, storedData } from './fixtures';
import type { Page } from '@playwright/test';

async function finishGuide(page: Page, name: string) {
  await page.locator('[data-context-guide]').waitFor({ state: 'visible' });
  const guide = page.getByRole('dialog', { name: `${name} walkthrough`, exact: true });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('heading')).toBeFocused();
  let count = 0;
  while (await guide.getByRole('button', { name: 'Next', exact: true }).count()) {
    expect(++count).toBeLessThan(8);
    const box = await guide.getByTestId('context-spotlight').boundingBox();
    expect(box?.width).toBeGreaterThan(0); expect(box?.height).toBeGreaterThan(0);
    await guide.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await guide.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(guide).toBeHidden();
}

for (const theme of ['light', 'dark'] as const) {
  test(`first-visit guides highlight controls, remember progress, and preserve data in ${theme} mode`, async ({ page, isolatedApp }, testInfo) => {
    test.setTimeout(90000);
    const data = returningData(); data.settings = { ...data.settings, theme, perPayoutSalary: 10000, grossPerPayoutSalary: 10000, paydayDays: [15, 30] };
    const app = await isolatedApp(data, { guides: true });
    await finishGuide(page, 'Dashboard');
    const snapshot = await storedData(page);
    await navigate(page, 'Wallets');
    const wallets = page.getByRole('dialog', { name: 'Wallets walkthrough' });
    await expect(wallets.getByRole('heading', { name: 'Total wallet balance' })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`wallet-guide-${theme}.png`) });
    await finishGuide(page, 'Wallets');
    await navigate(page, 'Expenses'); await finishGuide(page, 'Expenses');
    await navigate(page, 'Operations'); await finishGuide(page, 'Commitments');
    await page.getByRole('button', { name: 'Inflows', exact: true }).click(); await finishGuide(page, 'Inflows');
    await page.getByRole('button', { name: 'Gigs & Tasks', exact: true }).click(); await finishGuide(page, 'Gigs and tasks');
    await navigate(page, 'Account'); await finishGuide(page, 'Account');
    await page.getByRole('button', { name: 'Open Settings', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'General settings walkthrough' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`settings-guide-${theme}.png`) });
    // Escape dismisses just the guide, not the settings dialog behind it.
    await page.keyboard.press('Escape');
    const settings = page.getByRole('dialog', { name: 'App Settings', exact: true });
    await expect(settings).toBeVisible();
    await settings.getByRole('button', { name: 'Settings guide' }).click(); await finishGuide(page, 'General settings');
    const nav = settings.getByRole('navigation', { name: 'Settings sections' });
    for (const [tab, title] of [['Payday', 'Payday settings'], ['Wallet Defaults', 'Wallet settings'], ['Calendar', 'Calendar settings'], ['Cloud Sync', 'Cloud and backup settings'], ['Account', 'Account settings']]) {
      await nav.getByRole('button', { name: new RegExp(`^${tab}`) }).click(); await finishGuide(page, title);
    }
    await settings.getByRole('button', { name: 'Close settings modal' }).click();
    await page.getByRole('button', { name: 'View Full History', exact: true }).click(); await finishGuide(page, 'Transaction history');
    await page.getByRole('button', { name: 'Close transaction history' }).click();
    await navigate(page, 'Dashboard');
    await page.getByRole('button', { name: 'Runway', exact: true }).click(); await finishGuide(page, 'Runway overview');
    const analytics = page.getByRole('dialog', { name: 'Financial Intelligence Modal' });
    for (const [tab, title] of [['Cashflow', 'Cashflow'], ['Debt', 'Debt runway'], ['Goals', 'Goal projections']]) {
      await analytics.getByRole('button', { name: tab, exact: true }).click(); await finishGuide(page, title);
    }
    await page.getByRole('button', { name: 'Close analytics modal' }).click();
    await page.getByRole('button', { name: 'Yearly', exact: true }).click(); await finishGuide(page, 'Yearly overview');
    await page.getByRole('dialog', { name: 'Yearly Overview Modal' }).getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: /^Budget Plan/ }).click(); await finishGuide(page, 'Budget Plan');
    await page.getByRole('button', { name: 'Close budget plan' }).click();
    await page.getByRole('button', { name: /^Upcoming/ }).click(); await finishGuide(page, 'Upcoming commitments');
    await page.getByRole('button', { name: 'Close upcoming modal' }).click();
    await page.getByRole('button', { name: 'Configure savings goal' }).click(); await finishGuide(page, 'Savings goal');
    await page.getByRole('button', { name: 'Close goal setup modal' }).click();
    expect(await storedData(page)).toEqual(snapshot);
    await app.waitForSaved(); await page.reload();
    await expect(page.getByRole('button', { name: 'Dashboard guide' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /walkthrough/ })).toHaveCount(0);
    await navigate(page, 'Wallets'); await expect(page.getByRole('dialog', { name: 'Wallets walkthrough' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Wallets guide' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Wallets guide' })).toBeFocused();
    await navigate(page, 'Account'); await page.getByRole('button', { name: 'Open Settings', exact: true }).click();
    await settings.getByRole('checkbox', { name: 'Show first-visit guides' }).uncheck();
    await settings.getByRole('button', { name: 'Close settings modal' }).click();
    await page.reload(); await navigate(page, 'Wallets');
    await expect(page.getByRole('dialog', { name: /walkthrough/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Wallets guide' }).click(); await finishGuide(page, 'Wallets');
    expect(await storedData(page)).toEqual(snapshot);
  });
}
