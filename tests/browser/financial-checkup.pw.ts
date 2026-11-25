import { test, expect, returningData, storedData, navigate } from './fixtures';

for (const theme of ['light', 'dark'] as const) {
  test(`Checkup and emergency goal match Copy Summary in ${theme}`, async ({ page, isolatedApp }, info) => {
    await page.clock.setFixedTime(new Date('2026-11-25T04:00:00Z'));
    const month = 'November 2026'; const data = returningData();
    data.wallets = { main: 1000, cash: 500 };
    data.settings = { ...data.settings, theme, savingsWalletIds: ['main'], walletSavings: { main: 400 } };
    data.library.bills = [{ id: 'bill', name: 'Internet', amount: 100, dueDay: '30', type: 'Bill', wallet: 'main', startMonth: month }];
    data.library.receivables = []; data.library.expenses = [];
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as typeof window & { copiedCheckup?: string }).copiedCheckup = text; } } }));
    const app = await isolatedApp(data); const before = (await storedData(page))!;
    await page.getByRole('button', { name: /^Budget Plan/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Budget Plan', exact: true });
    await dialog.getByRole('tab', { name: 'Checkup', exact: true }).click();
    await expect(dialog.getByText('Available after Savings (active wallets, now)').locator('..')).toContainText('₱1,100.00');
    await expect(dialog.getByText('Cash after those commitments', { exact: true }).locator('..')).toContainText('₱1,000.00');
    await dialog.getByRole('button', { name: 'Set emergency goal' }).click();
    await dialog.getByRole('spinbutton', { name: 'Emergency-fund target (₱)' }).fill('2000');
    await dialog.getByRole('button', { name: 'Cancel goal edit' }).click(); expect(await storedData(page)).toEqual(before);
    await dialog.getByRole('button', { name: 'Set emergency goal' }).click();
    await dialog.getByRole('spinbutton', { name: 'Emergency-fund target (₱)' }).fill('2000');
    await dialog.getByRole('button', { name: 'Save emergency goal' }).click();
    await expect(dialog.getByText('₱400.00 of ₱2,000.00', { exact: true })).toBeVisible();
    const saved = (await storedData(page))!; expect(saved.settings?.emergencyFundGoal).toEqual({ target: 2000, walletIds: ['main'] });
    expect(saved.wallets).toEqual(before.wallets); expect(saved.library).toEqual(before.library); expect(saved.logs).toEqual(before.logs); expect(saved.settings?.walletSavings).toEqual(before.settings?.walletSavings);
    await dialog.getByRole('button', { name: 'Edit emergency goal' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`emergency-goal-${theme}.png`) });
    await dialog.getByRole('heading', { name: 'Your financial checkup' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`checkup-${theme}.png`) });
    await dialog.getByRole('button', { name: 'Close budget plan' }).click();
    await page.getByRole('button', { name: 'Copy Summary', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { copiedCheckup?: string }).copiedCheckup)).toContain('Target: ₱2,000.00; existing Savings counted: ₱400.00; remaining: ₱1,600.00');
    const summary = await page.evaluate(() => (window as typeof window & { copiedCheckup?: string }).copiedCheckup);
    expect(summary).toContain('Available after Savings (active wallets, now): ₱1,100.00');
    expect(summary).toContain('Wallets with Savings controls enabled: Test Bank');
    expect(summary).toContain('Selected Savings wallets: Test Bank');
    await app.waitForSaved(); await page.reload();
    expect((await storedData(page))?.settings?.emergencyFundGoal).toEqual(saved.settings?.emergencyFundGoal);
    await page.getByRole('button', { name: /^Budget Plan/ }).click(); await dialog.getByRole('tab', { name: 'Checkup', exact: true }).click();
    await dialog.getByRole('button', { name: 'Edit emergency goal' }).click();
    await dialog.getByRole('button', { name: 'Remove emergency goal' }).click();
    expect((await storedData(page))?.settings?.emergencyFundGoal).toBeNull();
    expect((await storedData(page))?.settings?.walletSavings).toEqual(before.settings?.walletSavings);
  });

  test(`Checkup guides Savings setup and fits compact screens in ${theme}`, async ({ page, isolatedApp }, info) => {
    test.skip(info.project.name === 'phone', 'The viewport matrix runs once per theme.');
    const data = returningData(); data.settings = { ...data.settings, theme };
    await isolatedApp(data); const before = await storedData(page);
    await page.getByRole('button', { name: /^Budget Plan/ }).click();
    let dialog = page.getByRole('dialog', { name: 'Budget Plan', exact: true });
    await dialog.getByRole('tab', { name: 'Checkup', exact: true }).click();
    await dialog.getByRole('button', { name: 'Set emergency goal' }).click();
    await dialog.getByRole('button', { name: 'Choose Savings wallets in Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'App Settings', exact: true });
    await expect(settings.getByRole('checkbox', { name: 'Savings for Test Bank' })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`savings-settings-${theme}.png`) });
    await settings.getByRole('checkbox', { name: 'Savings for Test Bank' }).check();
    await settings.getByRole('button', { name: 'Close settings modal' }).click(); expect(await storedData(page)).toEqual(before);
    for (const [width, height] of [[320, 320], [320, 568], [844, 390], [768, 1024], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await page.getByRole('button', { name: /^Budget Plan/ }).click();
      dialog = page.getByRole('dialog', { name: 'Budget Plan', exact: true });
      await dialog.getByRole('tab', { name: 'Budget', exact: true }).press('End');
      await expect(dialog.getByRole('tab', { name: 'Checkup', exact: true })).toBeFocused();
      await dialog.getByRole('button', { name: 'Set emergency goal' }).click();
      const form = dialog.getByRole('form', { name: 'Emergency-fund goal' });
      expect(await form.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      const save = form.getByRole('button', { name: 'Save emergency goal' }); await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await dialog.getByRole('button', { name: 'Close budget plan' }).click();
    }
    expect(await storedData(page)).toEqual(before);
  });
}
