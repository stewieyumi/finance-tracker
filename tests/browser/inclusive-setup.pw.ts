import { test, expect, navigate, storedData } from './fixtures';

for (const theme of ['light', 'dark'] as const) {
  test(`freelance setup and the full feature guide work in ${theme} mode`, async ({ page, isolatedApp }, testInfo) => {
    const app = await isolatedApp();
    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeFocused();
    // A visual-only pre-setup theme fixture: saved appearance is selected below.
    await page.evaluate(theme => { document.documentElement.classList.remove('dark', 'light'); document.documentElement.classList.add(theme); }, theme);
    await page.screenshot({ path: testInfo.outputPath(`work-presets-${theme}.png`), fullPage: true });
    await page.getByRole('button', { name: /^Freelancer Client/ }).click();
    await page.getByRole('button', { name: 'Get Started' }).click();
    await expect(page.getByRole('button', { name: /^Set up later/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^Irregular income/ }).click();
    await expect(page.getByRole('spinbutton', { name: 'Gross Salary' })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`irregular-income-${theme}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Next: Wallets' }).click();
    await page.getByRole('button', { name: 'Next: Milestone Goal' }).click();
    await page.getByRole('button', { name: 'Next: Appearance' }).click();
    await expect(page.getByText('No fixed pay', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: theme === 'light' ? 'Light' : 'Dark', exact: true }).click();
    await page.getByRole('button', { name: 'Finish Setup & Launch' }).click();
    const tour = page.getByRole('dialog', { name: 'App tour' });
    await expect(tour.getByRole('heading', { name: 'Your dashboard' })).toBeFocused();
    const snapshot = await storedData(page);
    expect(snapshot?.settings).toMatchObject({ perPayoutSalary: 0, grossPerPayoutSalary: 0, paydayDays: [], inflowsLabel: 'INVOICES & PAYMENTS' });
    expect(Object.values(snapshot!.wallets).every(balance => balance === 0)).toBe(true);
    expect(snapshot!.library.receivables).toEqual([]);
    await tour.getByRole('button', { name: 'All features' }).click();
    await expect(tour.getByText('1 of 10', { exact: true })).toBeVisible();
    for (const title of ['Your dashboard', 'Your wallets', 'Record your spending', 'Track incoming money', 'Manage commitments', 'Organize gigs and tasks', 'Goals and planning', 'Review transaction history', 'Settings and backups', 'Optional calendar tools']) {
      await expect(tour.getByRole('heading', { name: title })).toBeVisible();
      const details = tour.locator('details');
      if (!(await details.getAttribute('open'))) {
        // Boolean attributes can be the empty string; inspect the DOM property.
        if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) await details.locator('summary').click();
      }
      await page.setViewportSize({ width: 320, height: 568 });
      const next = tour.getByRole('button', { name: title === 'Optional calendar tools' ? 'Finish tour' : 'Next', exact: true });
      await next.scrollIntoViewIfNeeded();
      await expect(next).toBeVisible();
      if (title === 'Track incoming money') await page.screenshot({ path: testInfo.outputPath(`full-tour-inflows-${theme}.png`) });
      await next.click();
    }
    await expect(tour.getByRole('heading', { name: 'Quick Expense and app access' })).toBeVisible();
    await tour.getByRole('button', { name: 'Install app / see steps' }).click();
    const install = page.getByRole('dialog', { name: 'Install Finance Tracker' });
    await expect(install).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await storedData(page)).toEqual(snapshot);
    await expect(page.getByRole('heading', { name: 'Income at your pace' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Budget Plan/ })).toBeVisible();
    await app.waitForSaved();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Get Started', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Track an inflow', exact: true }).click();
    await page.getByRole('button', { name: /Add New Inflow/ }).click();
    const inflow = page.getByRole('dialog', { name: 'Add New Inflow' });
    await inflow.getByRole('textbox', { name: 'Inflow Name' }).fill('First freelance project');
    await inflow.getByRole('button', { name: 'Add Inflow', exact: true }).click();
    await expect.poll(async () => (await storedData(page))?.library.receivables.length).toBe(1);
    expect((await storedData(page))?.wallets).toEqual(snapshot?.wallets);
    await navigate(page, 'Dashboard');
    await page.getByRole('button', { name: 'Getting Started', exact: true }).click();
    await page.getByRole('button', { name: 'Take a quick tour' }).click();
    await expect(tour.getByText('1 of 5', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tour).toBeHidden();
  });
}
