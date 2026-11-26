import { test, expect, returningData, storedData, navigate } from './fixtures';

for (const theme of ['light', 'dark'] as const) {
  test(`commitment amounts stay blank after clearing and keep their edit scope in ${theme}`, async ({ page, isolatedApp }, info) => {
    await page.clock.setFixedTime(new Date('2026-11-26T04:00:00Z'));
    const data = returningData(); const month = 'November 2026';
    data.settings = { ...data.settings, theme };
    data.library.bills = [{ id: 'amount-edit', name: 'Internet', amount: 1000, dueDay: '30', type: 'Bill', wallet: 'main', startMonth: month }];
    const app = await isolatedApp(data); const before = (await storedData(page))!;
    await navigate(page, 'Operations');
    const open = () => page.locator('[data-commitment-id="amount-edit"]').filter({ visible: true }).getByRole('button', { name: 'Edit', exact: true }).click();
    await open();
    const dialog = page.getByRole('dialog', { name: 'Edit Commitment', exact: true });
    const amount = dialog.getByRole('spinbutton', { name: 'Amount (₱)' });
    await amount.fill(''); await expect(amount).toHaveValue('');
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toBeVisible(); expect(await storedData(page)).toEqual(before);
    await amount.pressSequentially('123'); expect(await amount.inputValue()).toBe('123');
    await amount.fill(''); await amount.pressSequentially('237.05'); expect(await amount.inputValue()).toBe('237.05');
    await dialog.getByRole('button', { name: 'Default Base', exact: true }).click(); await expect(amount).toHaveValue('1000');
    await amount.fill(''); await dialog.getByRole('button', { name: 'November Only', exact: true }).click(); await expect(amount).toHaveValue('237.05');
    await dialog.getByRole('button', { name: 'Default Base', exact: true }).click(); await expect(amount).toHaveValue('');
    await amount.pressSequentially('0.05'); expect(await amount.inputValue()).toBe('0.05');
    await page.screenshot({ path: info.outputPath(`commitment-edit-${theme}.png`) });
    await dialog.getByRole('button', { name: 'November Only', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save Changes' }).click(); await expect(dialog).toBeHidden();
    let saved = (await storedData(page))!;
    expect(saved.logs[month].billOverrides?.['amount-edit']).toBe(237.05); expect(saved.library.bills[0].amount).toBe(1000); expect(saved.wallets).toEqual(before.wallets);
    await open(); await dialog.getByRole('button', { name: 'Default Base', exact: true }).click();
    await amount.fill(''); await amount.pressSequentially('123.45'); expect(await amount.inputValue()).toBe('123.45');
    await amount.press('Enter'); await expect(dialog).toBeHidden();
    saved = (await storedData(page))!; expect(saved.library.bills[0].amount).toBe(123.45); expect(saved.logs[month].billOverrides?.['amount-edit']).toBe(237.05); expect(saved.wallets).toEqual(before.wallets);
    await app.waitForSaved(); await page.reload(); expect((await storedData(page))?.library.bills[0].amount).toBe(123.45);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`bill and inflow entry dialogs use the compact amount layout in ${theme}`, async ({ page, isolatedApp }, info) => {
    test.skip(info.project.name === 'phone', 'The viewport matrix runs once per theme.');
    test.setTimeout(60000);
    const data = returningData(); data.settings = { ...data.settings, theme };
    data.library.bills = [{ id: 'layout-bill', name: 'Internet', amount: 1000, dueDay: '30', type: 'Bill', wallet: 'main' }];
    data.library.receivables = [{ id: 'layout-inflow', name: 'Client project', amount: 1000, frequency: 'Monthly', wallet: 'main' }];
    await isolatedApp(data); const before = await storedData(page);
    await navigate(page, 'Operations');
    for (const [width, height] of [[320, 320], [375, 812], [844, 390], [768, 1024], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      await page.getByRole('button', { name: 'Commitments', exact: true }).click();
      const forms = [
        { title: 'Add New Commitment', open: () => page.getByRole('button', { name: /Add New Commitment/i }).click(), amount: 'Amount (₱)', save: 'Add Commitment', close: 'Cancel new commitment' },
        { title: 'Edit Commitment', open: () => page.locator('[data-commitment-id="layout-bill"]').filter({ visible: true }).getByRole('button', { name: 'Edit', exact: true }).click(), amount: 'Amount (₱)', save: 'Save Changes', close: 'Cancel commitment edit' },
        { title: 'Add New Inflow', open: async () => { await page.getByRole('button', { name: 'Inflows', exact: true }).click(); await page.getByRole('button', { name: /Add New Inflow/i }).click(); }, amount: 'Amount (₱)', save: 'Add Inflow', close: 'Cancel new inflow' },
        { title: 'Edit Inflow', open: () => page.locator('[data-testid^="receivable-"]').filter({ hasText: 'Client project', visible: true }).getByRole('button', { name: 'Edit', exact: true }).click(), amount: 'Gross Amount', save: 'Save Changes', close: 'Cancel inflow edit' },
      ];
      for (const form of forms) {
        await form.open(); const dialog = page.getByRole('dialog', { name: form.title, exact: true });
        const amount = dialog.getByRole('spinbutton', { name: form.amount, exact: true });
        expect(await amount.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(24); await amount.scrollIntoViewIfNeeded(); await expect(amount).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        const save = dialog.getByRole('button', { name: form.save, exact: true }); await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport();
        if (width === 375 || width === 1280) {
          await dialog.locator('h3').scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`${form.title.replaceAll(' ', '-')}-${width}-${theme}.png`) });
        }
        await dialog.getByRole('button', { name: form.close, exact: true }).click(); await expect(dialog).toBeHidden();
        expect(await storedData(page)).toEqual(before);
      }
    }
  });
}
