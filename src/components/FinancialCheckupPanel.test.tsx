import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialCheckupPanel } from './FinancialCheckupPanel';
import type { FinanceTransitionCommitter, UnifiedFinanceData } from '../types/finance';

const seed = (): UnifiedFinanceData => ({ wallets: { main: 1000, cash: 100 }, settings: { customWallets: [{ id: 'main', label: 'MariBank' }, { id: 'cash', label: 'Cash' }], savingsWalletIds: ['main'], walletSavings: { main: 400 } }, library: { bills: [], receivables: [], shoots: [] }, logs: {} });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 25, 12)); });
afterEach(() => vi.useRealTimers());
describe('financial checkup and emergency goal', () => {
  it('shows real facts and saves/removes only an explicitly chosen emergency goal', () => {
    let data = seed(); const before = structuredClone(data); const onSaved = vi.fn(); const onBuildBudget = vi.fn();
    const commit: FinanceTransitionCommitter = transition => { const result = transition(data); if (result.ok) data = result.data; return result; };
    const props = () => ({ data, month: 'November 2026', unpaidCommitments: 200, commitTransition: commit, onSaved, onBuildBudget });
    const view = render(<FinancialCheckupPanel {...props()} />);
    expect(screen.getByText('₱700.00')).toBeInTheDocument(); expect(screen.getByText('₱500.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review my budget' })); expect(onBuildBudget).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Set emergency goal' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Emergency-fund target (₱)' }), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel goal edit' })); expect(data).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: 'Set emergency goal' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Emergency-fund target (₱)' }), { target: { value: '1000' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Emergency-fund goal' }));
    expect(data.settings!.emergencyFundGoal).toEqual({ target: 1000, walletIds: ['main'] });
    expect(data.wallets).toEqual(before.wallets); expect(data.settings!.walletSavings).toEqual(before.settings!.walletSavings);
    view.rerender(<FinancialCheckupPanel {...props()} />);
    expect(screen.getByText('₱400.00 of ₱1,000.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit emergency goal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove emergency goal' }));
    expect(data.settings!.emergencyFundGoal).toBeNull(); expect(data.wallets).toEqual(before.wallets);
  });
  it('offers Settings when Savings is not configured and refuses stale goal edits', () => {
    let data = seed(); data.settings!.savingsWalletIds = []; delete data.settings!.walletSavings;
    const settings = vi.fn(); const commit: FinanceTransitionCommitter = transition => { const result = transition(data); if (result.ok) data = result.data; return result; };
    const props = () => ({ data, month: 'November 2026', unpaidCommitments: 0, commitTransition: commit, onSaved: vi.fn(), onBuildBudget: vi.fn(), onConfigureSavings: settings });
    const view = render(<FinancialCheckupPanel {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set emergency goal' }));
    expect(screen.getByText(/Enable a Savings wallet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Savings wallets in Settings' })); expect(settings).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel goal edit' }));
    data = seed(); view.rerender(<FinancialCheckupPanel {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set emergency goal' }));
    data = { ...data, settings: { ...data.settings, emergencyFundGoal: { target: 2000, walletIds: ['main'] } } };
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Emergency-fund target (₱)' }), { target: { value: '1000' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Emergency-fund goal' }));
    expect(screen.getByRole('alert')).toHaveTextContent('changed');
    expect(data.settings!.emergencyFundGoal!.target).toBe(2000);
  });
});
