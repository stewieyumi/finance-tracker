import { test, expect, navigate, returningData, storedData } from './fixtures';
import type { Page, TestInfo } from '@playwright/test';

async function tryStep(page: Page, area: string, label: string, screenshot?: { info: TestInfo; name: string }) {
  const guide = page.getByRole('dialog', { name: `${area} walkthrough`, exact: true });
  await expect(guide).toBeVisible();
  for (let count = 0; count < 8; count++) {
    const action = guide.getByRole('button', { name: label, exact: true });
    if (await action.count()) {
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport();
      if (screenshot) await page.screenshot({ path: screenshot.info.outputPath(screenshot.name) });
      await action.click();
      await expect(guide).toBeHidden();
      await expect(page.locator('#root')).not.toHaveAttribute('inert');
      return;
    }
    await guide.getByRole('button', { name: 'Next', exact: true }).click();
  }
  throw new Error(`Missing interactive guide action: ${area} / ${label}`);
}

for (const theme of ['light', 'dark'] as const) {
  test(`wallet-first setup leads to a reviewed first expense in ${theme} mode`, async ({ page, isolatedApp }, testInfo) => {
    const app = await isolatedApp(undefined, { guides: true });
    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeFocused();
    await page.evaluate(theme => { document.documentElement.classList.remove('dark', 'light'); document.documentElement.classList.add(theme); }, theme);
    await page.getByRole('button', { name: 'Start with a wallet', exact: true }).click();
    await tryStep(page, 'Wallets', 'Set a starting balance', { info: testInfo, name: `first-wallet-${theme}.png` });
    const balance = page.getByRole('dialog', { name: 'Edit Balance', exact: true });
    await expect(balance.getByRole('spinbutton', { name: 'Balance', exact: true })).toBeFocused();
    const initial = await storedData(page);
    expect(initial?.settings?.hasCompletedOnboarding).toBe(true);
    expect(initial?.settings?.perPayoutSalary).toBe(0);
    expect(initial?.library.expenses).toEqual([]);
    expect(initial?.wallets).toEqual({ main: 0, savings: 0, cash: 0 });
    await balance.getByRole('button', { name: 'Close balance editor', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Record your first expense', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Set starting balance', exact: true }).click();
    await expect(balance.getByRole('spinbutton', { name: 'Balance', exact: true })).toBeFocused();
    expect(await storedData(page)).toEqual(initial);
    await balance.getByRole('spinbutton', { name: 'Balance', exact: true }).fill('1000');
    await balance.getByRole('button', { name: 'Save Balance', exact: true }).click();
    await expect.poll(async () => (await storedData(page))?.wallets.main).toBe(1000);
    const beforeExpense = await storedData(page);
    await page.getByRole('button', { name: 'Record your first expense', exact: true }).click();
    await tryStep(page, 'Expenses', 'Record your first expense', { info: testInfo, name: `first-expense-${theme}.png` });
    const expense = page.getByRole('dialog', { name: 'Log Expense', exact: true });
    await expense.getByRole('textbox', { name: 'Merchant / Name', exact: true }).fill('Discard this draft');
    await page.keyboard.press('Escape');
    await expect(expense).toBeHidden();
    expect(await storedData(page)).toEqual(beforeExpense);
    await page.getByRole('button', { name: 'Expenses guide', exact: true }).click();
    await tryStep(page, 'Expenses', 'Record your first expense');
    await expect(expense.getByRole('textbox', { name: 'Merchant / Name', exact: true })).toHaveValue('');
    await expense.getByRole('textbox', { name: 'Merchant / Name', exact: true }).fill('First coffee');
    await expense.getByRole('spinbutton', { name: 'Amount (₱)', exact: true }).fill('125');
    expect(await storedData(page)).toEqual(beforeExpense);
    await expense.getByRole('button', { name: 'Save & Deduct', exact: true }).click();
    await expect.poll(async () => (await storedData(page))?.wallets.main).toBe(875);
    expect((await storedData(page))?.library.expenses).toEqual([expect.objectContaining({ amount: 125, merchant: 'First coffee', wallet: 'main' })]);
    await app.waitForSaved();
    await page.reload();
    await navigate(page, 'Wallets');
    await expect(page.getByRole('button', { name: 'Record your first expense', exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Wallets walkthrough', exact: true })).toHaveCount(0);
    expect((await storedData(page))?.wallets.main).toBe(875);
  });

  test(`all 22 guide areas hand off to real controls without saving in ${theme} mode`, async ({ page, isolatedApp }, testInfo) => {
    test.setTimeout(120000);
    const data = returningData();
    data.settings = { ...data.settings, theme, perPayoutSalary: 10000, grossPerPayoutSalary: 10000, paydayDays: [15, 30] };
    const app = await isolatedApp(data, { guides: true });
    await expect(page.getByRole('dialog', { name: 'Dashboard walkthrough', exact: true })).toBeVisible();
    const snapshot = await storedData(page);
    await tryStep(page, 'Dashboard', 'Start with a wallet');
    await tryStep(page, 'Wallets', 'Set a starting balance');
    await expect(page.getByRole('spinbutton', { name: 'Balance', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Close balance editor', exact: true }).click();
    await page.getByRole('button', { name: 'Wallets guide', exact: true }).click();
    await tryStep(page, 'Wallets', 'Add your first wallet');
    await expect(page.getByRole('combobox', { name: 'Account Name', exact: true })).toBeFocused();
    await page.getByRole('form', { name: 'Add wallet', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Wallets guide', exact: true }).click();
    await tryStep(page, 'Wallets', 'Try a transfer');
    const transfer = page.getByRole('dialog', { name: 'Transfer', exact: true });
    await expect(transfer).toBeVisible();
    await transfer.getByRole('button', { name: 'Cancel', exact: true }).click();
    await navigate(page, 'Expenses');
    await tryStep(page, 'Expenses', 'Record your first expense');
    await expect(page.getByRole('dialog', { name: 'Log Expense', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Expenses guide', exact: true }).click();
    await tryStep(page, 'Expenses', 'Try scanning a receipt');
    await expect(page.getByRole('heading', { name: 'Scan receipt', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await navigate(page, 'Operations');
    await tryStep(page, 'Commitments', 'Add your first commitment');
    await expect(page.getByRole('dialog', { name: 'Add New Commitment', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Inflows', exact: true }).click();
    await tryStep(page, 'Inflows', 'Add your first inflow');
    await expect(page.getByRole('textbox', { name: 'Inflow Name', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Gigs & Tasks', exact: true }).click();
    await tryStep(page, 'Gigs and tasks', 'Add your first gig or task');
    await expect(page.getByRole('heading', { name: 'Add New Gig', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close new gig', exact: true }).click();
    await navigate(page, 'Account');
    await tryStep(page, 'Account', 'Explore settings');
    await tryStep(page, 'General settings', 'Set up Quick Expense');
    const settings = page.getByRole('dialog', { name: 'App Settings', exact: true });
    await expect(settings.locator('[data-guide-target=quick-expense]')).toHaveAttribute('open');
    await settings.locator('[data-guide-target=quick-expense] > summary').click();
    const nav = settings.getByRole('navigation', { name: 'Settings sections' });
    for (const [tab, area, action, selector] of [
      ['Payday', 'Payday settings', 'Set up regular pay', '[aria-label="Gross Salary / Pay Period"]'],
      ['Wallet Defaults', 'Wallet settings', 'Choose a default wallet', '[data-guide-target=wallet-routing]'],
      ['Cloud Sync', 'Cloud and backup settings', 'Find backup tools', '#settings-backups'],
      ['Account', 'Account settings', 'Find the backup option', '[data-guide-target=account-backup]'],
    ]) {
      await nav.getByRole('button', { name: new RegExp(`^${tab}`) }).click();
      await tryStep(page, area, action);
      await expect(settings.locator(selector)).toBeFocused();
    }
    await nav.getByRole('button', { name: /^Calendar/ }).click();
    await tryStep(page, 'Calendar settings', 'Explore Add to Calendar');
    await expect(settings).toBeHidden();
    await expect(page.getByRole('button', { name: /Add New Gig/, exact: true })).toBeVisible();
    await navigate(page, 'Account');
    await page.getByRole('button', { name: 'Account guide', exact: true }).click();
    await tryStep(page, 'Account', 'See installation steps');
    await expect(page.getByRole('dialog', { name: 'Install Finance Tracker', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Account guide', exact: true }).click();
    await tryStep(page, 'Account', 'Explore transaction history');
    await tryStep(page, 'Transaction history', 'Try searching history');
    await expect(page.getByRole('textbox', { name: 'Search transactions', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Close transaction history', exact: true }).click();
    await navigate(page, 'Dashboard');
    await page.getByRole('button', { name: 'Runway', exact: true }).click();
    await tryStep(page, 'Runway overview', 'Explore your overview');
    const analytics = page.getByRole('dialog', { name: 'Financial Intelligence Modal', exact: true });
    for (const [tab, area, action] of [
      ['Cashflow', 'Cashflow', 'Explore your cashflow'], ['Debt', 'Debt runway', 'Explore your debt plan'], ['Goals', 'Goal projections', 'Explore goal projections'],
    ]) {
      await analytics.getByRole('button', { name: tab, exact: true }).click();
      await tryStep(page, area, action);
      await expect(analytics.locator('[data-guide-target=analytics-content]')).toBeFocused();
    }
    await page.getByRole('button', { name: 'Close analytics modal', exact: true }).click();
    await page.getByRole('button', { name: 'Yearly', exact: true }).click();
    await tryStep(page, 'Yearly overview', 'Choose a year');
    const yearly = page.getByRole('dialog', { name: 'Yearly Overview Modal', exact: true });
    await expect(yearly.locator('[data-guide-target=year-choice]')).toBeVisible();
    await yearly.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: /^Budget Plan/ }).click();
    await tryStep(page, 'Budget Plan', 'Review your budget plan');
    await expect(page.locator('[data-guide-target=budget-content]')).toBeFocused();
    await page.getByRole('button', { name: 'Close budget plan', exact: true }).click();
    await page.getByRole('button', { name: /^Upcoming/ }).click();
    await tryStep(page, 'Upcoming commitments', 'Review commitments');
    await expect(page.getByRole('button', { name: /Add New Commitment/, exact: true })).toBeVisible();
    await navigate(page, 'Dashboard');
    await page.getByRole('button', { name: 'Configure savings goal', exact: true }).click();
    await tryStep(page, 'Savings goal', 'Set your first goal', { info: testInfo, name: `interactive-goal-${theme}.png` });
    await expect(page.getByRole('textbox', { name: 'Goal Name', exact: true })).toBeFocused();
    await page.getByRole('textbox', { name: 'Goal Name', exact: true }).fill('Discarded goal');
    await page.getByRole('button', { name: 'Close goal setup modal', exact: true }).click();
    expect(await storedData(page)).toEqual(snapshot);
    await app.waitForSaved();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Dashboard guide', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /walkthrough/ })).toHaveCount(0);
    // An unmarked launcher must never be activated through a guide.
    await navigate(page, 'Expenses');
    await page.locator('[data-guide-target=manual]').evaluate(element => element.removeAttribute('data-guide-interactive'));
    await page.getByRole('button', { name: 'Expenses guide', exact: true }).click();
    const guide = page.getByRole('dialog', { name: 'Expenses walkthrough', exact: true });
    await guide.getByRole('button', { name: 'Next', exact: true }).click();
    await guide.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(guide.getByRole('heading', { name: 'Enter an expense manually', exact: true })).toBeVisible();
    await expect(guide.getByRole('button', { name: 'Record your first expense', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(await storedData(page)).toEqual(snapshot);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`interactive controls remain reachable on a short phone in ${theme} mode`, async ({ page, isolatedApp }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'The short viewport is covered once per theme.');
    await page.setViewportSize({ width: 320, height: 320 });
    const data = returningData();
    data.settings = { ...data.settings, theme, customWallets: [{ id: 'main', label: 'Test Bank' }] };
    data.wallets = { main: 2000 };
    await isolatedApp(data, { guides: true });
    await expect(page.getByRole('dialog', { name: 'Dashboard walkthrough', exact: true })).toBeVisible();
    const snapshot = await storedData(page);
    await tryStep(page, 'Dashboard', 'Start with a wallet');
    await tryStep(page, 'Wallets', 'Set a starting balance', { info: testInfo, name: `short-phone-${theme}.png` });
    await page.getByRole('button', { name: 'Close balance editor', exact: true }).click();
    await page.getByRole('button', { name: 'Wallets guide', exact: true }).click();
    const guide = page.getByRole('dialog', { name: 'Wallets walkthrough', exact: true });
    await guide.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(guide.getByRole('heading', { name: 'Move money between wallets', exact: true })).toBeVisible();
    await expect(guide.getByRole('button', { name: 'Try a transfer', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(await storedData(page)).toEqual(snapshot);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`zero balance recovery and checklist reflect saved data in ${theme} mode`, async ({ page, isolatedApp }, testInfo) => {
    if (testInfo.project.name === 'phone') await page.setViewportSize({ width: 320, height: 568 });
    const data = returningData();
    data.settings = { ...data.settings, theme, defaultWallet: 'cw_browser_wallet', customWallets: [{ id: 'cw_browser_wallet', label: 'Lunch Wallet' }, { id: 'cash', label: 'Cash' }] };
    data.wallets = { cw_browser_wallet: 0, cash: 250 };
    const app = await isolatedApp(data);
    await navigate(page, 'Expenses');
    await page.getByRole('button', { name: /^Manual\b/ }).click();
    const expense = page.getByRole('dialog', { name: 'Log Expense', exact: true });
    const wallet = expense.getByRole('combobox', { name: 'Deduct From', exact: true });
    await expect(wallet).toHaveAccessibleDescription('Current balance: ₱0.00');
    await expense.getByRole('textbox', { name: 'Merchant / Name', exact: true }).fill('Lunch');
    await expense.getByRole('spinbutton', { name: 'Amount (₱)', exact: true }).fill('150');
    const snapshot = await storedData(page);
    await expense.getByRole('button', { name: 'Save & Deduct', exact: true }).click();
    await expect(expense.getByRole('alert')).toHaveText('Lunch Wallet has ₱0.00. Check its balance in Wallets or choose another wallet.');
    expect(await storedData(page)).toEqual(snapshot);
    await wallet.selectOption('cash');
    await expect(wallet).toHaveAccessibleDescription('Current balance: ₱250.00');
    await wallet.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`selected-balance-${theme}.png`) });
    await expense.getByRole('button', { name: 'Save & Deduct', exact: true }).click();
    await expect(expense).toBeHidden();
    await expect.poll(async () => (await storedData(page))?.wallets).toEqual({ cw_browser_wallet: 0, cash: 100 });
    await navigate(page, 'Dashboard');
    await page.getByRole('button', { name: 'Getting Started', exact: true }).click();
    const guide = page.getByRole('dialog', { name: 'Getting Started', exact: true });
    await expect(guide.getByRole('button', { name: /^Start with a wallet/ })).toContainText('Balance ready');
    await expect(guide.getByRole('button', { name: /^Record your first expense/ })).toContainText('Already added');
    await expect(guide.getByRole('button', { name: /^Track incoming money/ })).toContainText('Not added yet');
    await expect(guide.getByRole('button', { name: /^Set up a commitment/ })).toContainText('Not added yet');
    await page.screenshot({ path: testInfo.outputPath(`getting-started-checks-${theme}.png`) });
    await guide.getByRole('button', { name: 'Done', exact: true }).click();
    await app.waitForSaved();
    await page.reload();
    expect((await storedData(page))?.wallets).toEqual({ cw_browser_wallet: 0, cash: 100 });
    expect((await storedData(page))?.library.expenses).toEqual([expect.objectContaining({ merchant: 'Lunch', amount: 150, wallet: 'cash' })]);
  });
}
