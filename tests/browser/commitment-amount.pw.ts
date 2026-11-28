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


for (const theme of ['light', 'dark'] as const) {
  test(`All commitments form one unpaid-first list in ${theme}`, async ({ page, isolatedApp }, info) => {
    await page.clock.setFixedTime(new Date('2026-11-28T04:00:00Z'));
    const data = returningData(); const month = 'November 2026';
    data.settings = { ...data.settings, theme };
    data.library.bills = [
      { id: 'paid-early', name: 'Paid early', amount: 1000, dueDay: '5', type: 'Bill', wallet: 'main', startMonth: month },
      { id: 'unpaid-late', name: 'Unpaid late', amount: 200, dueDay: '25', type: 'Bill', wallet: 'main', startMonth: month },
      { id: 'paid-late', name: 'Paid late', amount: 50, dueDay: '20', type: 'Bill', wallet: 'main', startMonth: month },
      { id: 'unpaid-early', name: 'Unpaid early', amount: 400, dueDay: '10', type: 'Bill', wallet: 'main', startMonth: month }
    ];
    data.logs = { [month]: { billsPaid: ['paid-early', 'paid-late'] } };
    await isolatedApp(data); await navigate(page, 'Operations');
    const rows = page.locator('[data-commitment-id]').filter({ visible: true });
    await expect(rows).toHaveCount(4); const before = await storedData(page);
    const order = () => rows.evaluateAll(elements => elements.map(el => el.getAttribute('data-commitment-id')));
    await expect(page.getByText('Days 1–15', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Days 16–31', { exact: true })).toHaveCount(0);
    const ids = await order(); expect(ids.slice(0, 2).sort()).toEqual(['unpaid-early', 'unpaid-late']); expect(ids.slice(2).sort()).toEqual(['paid-early', 'paid-late']);
    await page.getByRole('combobox', { name: 'Sort commitments' }).selectOption('amountDesc');
    expect(await order()).toEqual(['unpaid-early', 'unpaid-late', 'paid-early', 'paid-late']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`all-commitments-${theme}.png`), fullPage: true });
    await page.getByRole('button', { name: '1–15', exact: true }).click(); expect(await order()).toEqual(['paid-early', 'unpaid-early']);
    await page.getByRole('button', { name: '16–31', exact: true }).click(); expect(await order()).toEqual(['unpaid-late', 'paid-late']);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByRole('button', { name: 'Hide paid commitments' }).click(); expect(await order()).toEqual(['unpaid-early', 'unpaid-late']);
    await page.getByPlaceholder('Search...', { exact: true }).fill('late'); expect(await order()).toEqual(['unpaid-late']);
    expect(await storedData(page)).toEqual(before);
  });
}


for (const theme of ['light', 'dark'] as const) {
  test(`inflow deductions collapse without losing draft values in ${theme}`, async ({ page, isolatedApp }, info) => {
    if (info.project.name === 'phone') await page.setViewportSize({ width: 320, height: 568 });
    const data = returningData(); data.settings = { ...data.settings, theme };
    data.library.receivables = [{ id: 'deduction-edit', name: 'Client payment', amount: 900, grossAmount: 1000, deductions: [{ id: 'tax', name: 'Tax', type: 'percentage', value: 10 }], frequency: 'Monthly', wallet: 'main' }];
    await isolatedApp(data); await navigate(page, 'Operations'); await page.getByRole('button', { name: 'Inflows', exact: true }).click();
    const open = () => page.locator('[data-testid^="receivable-"]').filter({ hasText: 'Client payment', visible: true }).getByRole('button', { name: 'Edit', exact: true }).click();
    await open(); const before = await storedData(page);
    const dialog = page.getByRole('dialog', { name: 'Edit Inflow', exact: true });
    const fold = dialog.locator('details').filter({ hasText: 'Deductions' });
    await expect(fold).not.toHaveAttribute('open', ''); await expect(fold.locator('summary')).toContainText('-₱100.00');
    await expect(dialog.getByLabel('Deduction value')).toBeHidden();
    await page.screenshot({ path: info.outputPath(`deductions-collapsed-${theme}.png`) });
    await fold.locator('summary').click(); await dialog.getByLabel('Deduction value').fill('20');
    await expect(dialog.getByTestId('receivable-net-display')).toHaveText('₱800.00');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`deductions-expanded-${theme}.png`) });
    await fold.locator('summary').click(); await expect(dialog.getByLabel('Deduction value')).toBeHidden();
    await expect(fold.locator('summary')).toContainText('-₱200.00');
    await fold.locator('summary').click(); await expect(dialog.getByLabel('Deduction value')).toHaveValue('20');
    await dialog.getByRole('button', { name: 'Cancel inflow edit' }).click(); expect(await storedData(page)).toEqual(before);
    await open(); await dialog.locator('summary').filter({ hasText: 'Deductions' }).click(); await expect(dialog.getByLabel('Deduction value')).toHaveValue('10');
    await dialog.getByRole('button', { name: 'Cancel inflow edit' }).click();
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Next 7 Days is a compact card with a complete modal and safe navigation in ${theme}`, async ({ page, isolatedApp }, info) => {
    test.setTimeout(60000);
    await page.clock.setFixedTime(new Date('2026-11-28T04:00:00Z'));
    const data = returningData(); data.settings = { ...data.settings, theme };
    data.library.bills = [
      { id: 'today', name: 'Due today', amount: 100, dueDay: '28', type: 'Bill', wallet: 'main', startMonth: 'November 2026' },
      { id: 'tomorrow', name: 'Due tomorrow', amount: 200, dueDay: '29', type: 'Bill', wallet: 'main', startMonth: 'November 2026' },
      { id: 'two-days', name: 'Due in two days', amount: 300, dueDay: '30', type: 'Bill', wallet: 'main', startMonth: 'November 2026' },
      ...Array.from({ length: 4 }, (_, i) => ({ id: `dec-${i + 1}`, name: `December payment ${i + 1}`, amount: (i + 4) * 100, dueDay: String(i + 1), type: 'Bill' as const, wallet: 'main', startMonth: 'December 2026' })),
      { id: 'paid', name: 'Already paid', amount: 900, dueDay: '29', type: 'Bill', wallet: 'main', startMonth: 'November 2026' },
    ];
    data.logs = { 'November 2026': { billsPaid: ['paid'] } };
    await isolatedApp(data); await navigate(page, 'Operations');
    const card = page.getByRole('button', { name: 'Next 7 Days, view commitments', exact: true });
    await expect(card).toContainText('7 commitments'); const before = await storedData(page);
    await card.screenshot({ path: info.outputPath(`next-seven-card-${theme}.png`) });
    const modal = page.getByRole('dialog', { name: 'Next 7 Days', exact: true });
    const sizes = [[320, 320], [375, 400], [320, 568], [360, 640], [375, 812], [390, 844], [430, 932], [568, 320], [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1920, 1080], [640, 450]];
    for (const [width, height] of sizes.filter(([width]) => info.project.name === 'phone' ? width < 640 : width >= 640)) {
      await page.setViewportSize({ width, height }); await card.focus(); await page.keyboard.press('Enter');
      await expect(modal.getByRole('heading', { name: 'Next 7 Days' })).toBeFocused();
      await expect(modal.getByRole('listitem')).toHaveCount(7); await expect(modal).not.toContainText('Already paid');
      const labels = await modal.getByRole('listitem').allTextContents(); expect(labels[0]).toContain('Due today'); expect(labels.at(-1)).toContain('December payment 4');
      for (const control of [modal.getByRole('button', { name: 'Close next 7 days' }), modal.getByRole('button', { name: 'View all commitments' })]) {
        await control.scrollIntoViewIfNeeded(); const box = await control.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (width === 375 && height === 812 || width === 1280) { await modal.getByRole('heading').scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`next-seven-days-${width}-${theme}.png`) }); }
      await page.keyboard.press('Escape'); await expect(card).toBeFocused();
    }
    await card.focus(); await page.keyboard.press('Enter'); await modal.getByRole('button', { name: 'View all commitments' }).click();
    await expect(page.locator('#plan-commitments')).toBeFocused();
    await page.clock.setFixedTime(new Date('2026-11-29T04:00:00Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(card).toContainText('6 commitments');
    await card.focus(); await page.keyboard.press('Enter'); await modal.getByRole('button', { name: /^December payment 1/ }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByRole('combobox').first()).toHaveValue('December 2026');
    await expect(page.locator('[data-commitment-id="dec-1"]').filter({ visible: true })).toBeFocused();
    expect(await storedData(page)).toEqual(before);
  });
}
