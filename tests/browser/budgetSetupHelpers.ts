import { expect, type Page } from '@playwright/test';

/** Walk the real setup while keeping the caller's default wallet and date choices. */
export async function reviewBudgetSetup(page: Page, amounts: { essentials?: string; commitments?: string; savings?: string } = {}) {
  const setup = page.getByRole('dialog', { name: 'Budget setup', exact: true });
  await expect(setup).toBeVisible();
  const next = () => setup.getByRole('button', { name: 'Continue', exact: true }).click();
  await next(); await next();
  await setup.getByLabel('Usual daily essentials (₱)', { exact: true }).fill(amounts.essentials ?? '0'); await next();
  await setup.getByLabel('Upcoming payments to reserve (₱)', { exact: true }).fill(amounts.commitments ?? '0'); await next();
  await setup.getByLabel('Extra savings target (₱)', { exact: true }).fill(amounts.savings ?? '0'); await next();
  await expect(setup.getByRole('button', { name: 'Save budget', exact: true })).toBeVisible();
  return setup;
}
