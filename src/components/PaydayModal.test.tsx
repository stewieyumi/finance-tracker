import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PaydayModal } from './PaydayModal';
import { INITIAL_UNIFIED_DATA } from '../constants/initialData';
import { applyMonthlyBudget } from '../utils/budgeting';
import type { UnifiedFinanceData, FinanceTransitionCommitter } from '../types/finance';

function setup(overrides: Record<string, unknown> = {}) {
  let data: UnifiedFinanceData = structuredClone(INITIAL_UNIFIED_DATA);
  data.wallets = { main: 5000, cash: 1000 };
  data.settings = { ...data.settings, customWallets: [{ id: 'main', label: 'Bank' }, { id: 'cash', label: 'Cash' }], perPayoutSalary: 0 };
  const commit: FinanceTransitionCommitter = transition => { const result = transition(data); if (result.ok) data = result.data; return result; };
  const close = vi.fn(), message = vi.fn(), legacyExecute = vi.fn(), undo = vi.fn();
  const props = { isOpen: true, onClose: close, globalData: data, selectedMonth: 'November 2026', commitBudgetTransition: commit, onBudgetMessage: message,
    paydayAllocations: {}, remainingBuffer: 0, onConfigureBaselines: vi.fn(), onExecutePaydaySplit: legacyExecute, onUndoSplit: undo, ...overrides };
  const view = render(<PaydayModal {...props} />);
  return { ...view, read: () => data, close, message, legacyExecute, undo };
}
afterEach(() => vi.useRealTimers());

describe('Budget Plan', () => {
  it('opens on Budget without requiring salary and supports tab keyboard navigation', () => {
    const app = setup(); const dialog = screen.getByRole('dialog', { name: 'Budget Plan' });
    expect(dialog).toHaveFocus(); expect(screen.getByRole('tab', { name: 'Budget' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Build my budget' })).toBeEnabled();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Auto-Distribute' })).toHaveFocus();
    expect(screen.getByRole('form', { name: 'Distribute money' })).toBeVisible();
    expect(app.legacyExecute).not.toHaveBeenCalled();
  });
  it('does not render when closed and closes through its accessible button', () => {
    const closed = setup({ isOpen: false }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); closed.unmount();
    const app = setup(); fireEvent.click(screen.getByRole('button', { name: 'Close budget plan' })); expect(app.close).toHaveBeenCalledOnce();
  });
  it('saves a guided cash budget without changing wallets, receipts, or transactions', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
    const app = setup(); const before = structuredClone(app.read());
    fireEvent.click(screen.getByRole('button', { name: 'Build my budget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Usual daily essentials (₱)'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Upcoming payments to reserve (₱)'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Extra savings target (₱)'), { target: { value: '1000' } });
    expect(screen.queryByRole('button', { name: 'Save budget' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/Potential savings before optional spending: ₱3,000.00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save budget' })).toBeEnabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Save budget' }).closest('form')!);
    expect(app.read().settings!.monthlyBudgets!['November 2026']!.limit).toBe(5000);
    expect(app.read().wallets).toEqual(before.wallets); expect(app.read().library).toEqual(before.library); expect(app.read().logs).toEqual(before.logs);
  });
  it('can plan to save all available cash with a zero spending cap', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
    const app = setup(); fireEvent.click(screen.getByRole('button', { name: 'Build my budget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Usual daily essentials (₱)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Extra savings target (₱)'), { target: { value: '6000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.submit(screen.getByRole('button', { name: 'Save budget' }).closest('form')!);
    expect(app.read().settings!.monthlyBudgets!['November 2026']!.limit).toBe(0);
    expect(app.read().wallets).toEqual({ main: 5000, cash: 1000 });
  });
  it('keeps Cancel and stale-plan failures from overwriting another saved plan', () => {
    const app = setup(); const before = structuredClone(app.read());
    fireEvent.click(screen.getByRole('button', { name: 'Build my budget' })); fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(app.read()).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: 'Build my budget' }));
    fireEvent.click(screen.getByText('Already know your spending limit?'));
    fireEvent.click(screen.getByRole('button', { name: 'Enter a manual limit' }));
    fireEvent.change(screen.getByLabelText('Period spending limit (₱)'), { target: { value: '100' } });
    const current = applyMonthlyBudget(app.read(), 'November 2026', { limit: 200 }, undefined); Object.assign(app.read(), current.data);
    fireEvent.submit(screen.getByRole('button', { name: 'Save budget' }).closest('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent('This budget changed'); expect(app.read().settings!.monthlyBudgets!['November 2026']!.limit).toBe(200);
  });
  it('requires zero unassigned and distributes existing cash with no new income', () => {
    const app = setup(); const before = structuredClone(app.read()); fireEvent.click(screen.getByRole('tab', { name: 'Auto-Distribute' }));
    fireEvent.change(screen.getByLabelText('Amount to allocate (₱)'), { target: { value: '1000' } });
    expect(screen.getByRole('button', { name: 'Distribute existing cash' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Allocate to Cash'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Put the remainder in'), { target: { value: 'main' } }); fireEvent.click(screen.getByRole('button', { name: 'Assign remainder' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Distribute money' }));
    expect(app.read().wallets).toEqual({ main: 4500, cash: 1500 });
    expect(app.read().library.receivables).toEqual(before.library.receivables);
    expect(screen.getByText('Distribution recorded. Unassigned: ₱0.00.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Distribute existing cash' })).not.toBeInTheDocument();
  });
  it('uses configured transfer defaults instead of always choosing the first wallet', () => {
    setup({ globalData: { ...INITIAL_UNIFIED_DATA, wallets: { main: 1000, cash: 500 }, settings: { ...INITIAL_UNIFIED_DATA.settings, customWallets: [{ id: 'main', label: 'Bank' }, { id: 'cash', label: 'Cash' }], transferFromWallet: 'cash', transferToWallet: 'main' } } });
    fireEvent.click(screen.getByRole('tab', { name: 'Auto-Distribute' }));
    expect(screen.getByLabelText('From wallet')).toHaveValue('cash');
    fireEvent.change(screen.getByLabelText('Amount to allocate (₱)'), { target: { value: '100' } });
    expect(screen.getByLabelText('Put the remainder in')).toHaveValue('main');
  });
  it('records and allocates actual irregular income and preserves the source balance', () => {
    const app = setup(); fireEvent.click(screen.getByRole('tab', { name: 'Auto-Distribute' }));
    fireEvent.change(screen.getByLabelText('Which money are you allocating?'), { target: { value: 'received' } });
    fireEvent.change(screen.getByLabelText('Where did the income come from?'), { target: { value: 'Freelance client' } });
    fireEvent.change(screen.getByLabelText('Amount received (₱)'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Allocate to Cash'), { target: { value: '1000' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Distribute money' }));
    expect(app.read().wallets).toEqual({ main: 5000, cash: 2000 });
    expect(app.read().library.receivables[0].name).toBe('Freelance client'); expect(app.legacyExecute).not.toHaveBeenCalled();
  });
  it('preserves optional payday calendar export for regular-pay users', () => {
    const exported = vi.fn();
    setup({ globalData: { ...INITIAL_UNIFIED_DATA, settings: { ...INITIAL_UNIFIED_DATA.settings, perPayoutSalary: 1000 } }, paydayDays: [5, 20], onExportCalendar: exported });
    fireEvent.click(screen.getByRole('tab', { name: 'Auto-Distribute' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export Paydays (.ics)' }));
    expect(exported).toHaveBeenCalledWith([5, 20]);
  });
  it('keeps earlier salary reversals available without silently distributing on open', () => {
    const app = setup({ latestExecution: { id: 'old', date: '2026-11-15', timestamp: 1, allocations: { main: 100 }, billContributions: [] } });
    fireEvent.click(screen.getByRole('tab', { name: 'Auto-Distribute' }));
    fireEvent.click(screen.getByText('Earlier regular-pay distribution')); fireEvent.click(screen.getByRole('button', { name: 'Undo earlier distribution' }));
    expect(app.undo).toHaveBeenCalledWith('old'); expect(app.legacyExecute).not.toHaveBeenCalled(); expect(app.close).not.toHaveBeenCalled();
  });
});
