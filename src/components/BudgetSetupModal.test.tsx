import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BudgetSetupModal } from './BudgetSetupModal';
import type { FinanceTransitionCommitter, UnifiedFinanceData } from '../types/finance';

const seed = (): UnifiedFinanceData => ({ wallets: { main: 5000, cash: 1000 }, settings: { customWallets: [{ id: 'main', label: 'Bank' }, { id: 'cash', label: 'Cash' }] }, library: { bills: [], receivables: [], shoots: [], expenses: [] }, logs: {} });
function setup(initial = seed()) {
  let data = initial; const close = vi.fn(), saved = vi.fn();
  const commit: FinanceTransitionCommitter = transition => { const result = transition(data); if (result.ok) data = result.data; return result; };
  const view = render(<BudgetSetupModal data={data} month="November 2026" unpaidCommitments={1000} commitTransition={commit} onClose={close} onSaved={saved} />);
  return { ...view, read: () => data, close, saved };
}
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
function review() {
  next(); next(); fireEvent.change(screen.getByLabelText('Usual daily essentials (₱)'), { target: { value: '200' } }); next();
  fireEvent.click(screen.getByRole('button', { name: 'Use listed unpaid amount' })); next();
  fireEvent.change(screen.getByLabelText('Extra savings target (₱)'), { target: { value: '1000' } }); next();
}
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 21, 12)); });
afterEach(() => vi.useRealTimers());
it('guides one question at a time, keeps answers on Back and discards all work on Escape', () => {
  const app = setup(); const before = structuredClone(app.read());
  expect(screen.getByRole('heading', { name: 'Which money can you use?' })).toHaveFocus();
  expect(screen.queryByLabelText('Usual daily essentials (₱)')).not.toBeInTheDocument();
  next(); next(); fireEvent.change(screen.getByLabelText('Usual daily essentials (₱)'), { target: { value: '123.45' } }); next();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByLabelText('Usual daily essentials (₱)')).toHaveValue(123.45);
  fireEvent.keyDown(window, { key: 'Escape' }); expect(app.close).toHaveBeenCalledOnce(); expect(app.read()).toEqual(before); expect(app.saved).not.toHaveBeenCalled();
});
it('validates wallets, date range and daily needs before a review or save is available', () => {
  const app = setup(); const before = structuredClone(app.read());
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
  next(); expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one');
  fireEvent.click(screen.getByRole('checkbox', { name: /Bank/ })); next();
  fireEvent.change(screen.getByLabelText('Last day to cover'), { target: { value: '2026-10-01' } }); next(); expect(screen.getByRole('alert')).toHaveTextContent('Choose valid dates');
  fireEvent.change(screen.getByLabelText('Last day to cover'), { target: { value: '2026-11-30' } }); next(); next();
  expect(screen.getByRole('alert')).toHaveTextContent('Enter your daily essentials'); expect(screen.queryByRole('button', { name: 'Save budget' })).not.toBeInTheDocument(); expect(app.read()).toEqual(before);
});
it('explains a shortfall and never offers Save until the plan is affordable', () => {
  const app = setup(); const before = structuredClone(app.read()); next(); next();
  fireEvent.change(screen.getByLabelText('Usual daily essentials (₱)'), { target: { value: '1000' } }); next(); next(); next();
  expect(screen.getByRole('alert')).toHaveTextContent('exceed available cash by ₱4,000.00');
  expect(screen.queryByRole('button', { name: 'Save budget' })).not.toBeInTheDocument(); expect(app.read()).toEqual(before);
});
it('shows a guide before saving and rejects changes in wallet cash or the review day', () => {
  const app = setup(); const before = structuredClone(app.read()); review();
  expect(screen.getByText('₱400.00')).toBeInTheDocument(); expect(app.read()).toEqual(before);
  app.read().wallets.main = 5100;
  fireEvent.click(screen.getByRole('button', { name: 'Save budget' })); expect(screen.getByRole('alert')).toHaveTextContent('Recalculate'); expect(app.saved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Recalculate plan' }));
  vi.setSystemTime(new Date(2026, 10, 22, 12));
  fireEvent.click(screen.getByRole('button', { name: 'Save budget' })); expect(screen.getByRole('alert')).toHaveTextContent('Recalculate');
  fireEvent.click(screen.getByRole('button', { name: 'Recalculate plan' })); fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
  expect(app.saved).toHaveBeenCalledOnce(); expect(app.read().settings?.monthlyBudgets?.['November 2026']?.cashPlan?.pacingStartDate).toBe('2026-11-22');
  expect(app.read().wallets).toEqual({ main: 5100, cash: 1000 }); expect(app.read().library).toEqual(before.library); expect(app.read().logs).toEqual(before.logs);
});
it('keeps manual limits and category validation available', () => {
  const app = setup(); fireEvent.click(screen.getByText('Already know your spending limit?')); fireEvent.click(screen.getByRole('button', { name: 'Enter a manual limit' }));
  fireEvent.change(screen.getByLabelText('Period spending limit (₱)'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Food & Dining limit (₱)'), { target: { value: '101' } }); fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Category limits must fit');
  fireEvent.change(screen.getByLabelText('Food & Dining limit (₱)'), { target: { value: '' } }); fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
  expect(app.read().settings?.monthlyBudgets?.['November 2026']).toEqual({ limit: 100, rollover: true, categoryLimits: {} });
});

it('removes only the saved budget when explicitly requested', () => {
  const data = seed(); data.settings!.monthlyBudgets = { 'November 2026': { limit: 100 } };
  const app = setup(data); const before = structuredClone(app.read());
  fireEvent.click(screen.getByText('Already know your spending limit?')); fireEvent.click(screen.getByRole('button', { name: 'Enter a manual limit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove budget' }));
  expect(app.read().settings?.monthlyBudgets?.['November 2026']).toBeNull(); expect(app.read().wallets).toEqual(before.wallets); expect(app.read().library).toEqual(before.library); expect(app.read().logs).toEqual(before.logs);
});

it('preserves an existing cash plan when only manual limits are adjusted', () => {
  const data = seed(); const cashPlan = { walletIds: ['main'], startDate: '2026-11-01', endDate: '2026-11-30', pacingStartDate: '2026-11-21', dailyEssentials: 100, savingsTarget: 1000, commitmentsReserve: 500, cushion: 100, baselineSpent: 0, baselineCommitments: 0, baselineDailyFlexible: {} };
  data.settings!.monthlyBudgets = { 'November 2026': { limit: 3900, cashPlan, rollover: true } };
  const app = setup(data); const before = structuredClone(app.read());
  fireEvent.click(screen.getByText('Already know your spending limit?')); fireEvent.click(screen.getByRole('button', { name: 'Enter a manual limit' }));
  fireEvent.change(screen.getByLabelText('Period spending limit (₱)'), { target: { value: '3800' } }); fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
  expect(app.read().settings?.monthlyBudgets?.['November 2026']?.cashPlan).toEqual(cashPlan); expect(app.read().settings?.monthlyBudgets?.['November 2026']?.limit).toBe(3800); expect(app.read().wallets).toEqual(before.wallets);
});
