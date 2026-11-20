import { test, expect, navigate, returningData, storedData, storageKey } from './fixtures';
for (const outcome of ['success', 'failure'] as const) {
  test(`account deletion ${outcome} requires confirmation and preserves the right data`, async ({ page, isolatedApp }, testInfo) => {
    const data = returningData(); data.settings = { ...data.settings, theme: testInfo.project.name === 'phone' ? 'light' : 'dark' };
    await isolatedApp(data, { accountDeletion: outcome });
    await page.evaluate(() => localStorage.setItem('ft_master_data_v1_other-account', 'other owner cache'));
    await navigate(page, 'Account'); await page.getByRole('button', { name: 'Open Settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'App Settings' });
    await settings.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: /^Account/ }).click();
    await settings.getByRole('button', { name: 'Delete account', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete Finance Tracker account', exact: true });
    await expect(dialog.getByRole('textbox', { name: 'Type DELETE to confirm' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Permanently delete' })).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(settings).toBeVisible();
    expect(await storedData(page)).toEqual(data);
    await settings.getByRole('button', { name: 'Delete account', exact: true }).click();
    await page.setViewportSize({ width: 320, height: 568 });
    await dialog.getByRole('textbox', { name: 'Type DELETE to confirm' }).fill('DELETE');
    await page.screenshot({ path: testInfo.outputPath(`delete-account-${outcome}.png`) });
    await dialog.getByRole('button', { name: 'Permanently delete' }).click();
    if (outcome === 'failure') {
      await expect(dialog.getByRole('alert')).toHaveText('Synthetic deletion unavailable');
      expect(await storedData(page)).toEqual(data);
      expect(await page.evaluate(() => Boolean(localStorage.getItem('ft_app_session')))).toBe(true);
    } else {
      await expect(dialog).toBeHidden(); await expect(page.getByRole('button', { name: 'Open Settings', exact: true })).toHaveCount(0);
      expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
      expect(await page.evaluate(() => localStorage.getItem('ft_app_session'))).toBeNull();
    }
    expect(await page.evaluate(() => localStorage.getItem('ft_master_data_v1_other-account'))).toBe('other owner cache');
  });
}
