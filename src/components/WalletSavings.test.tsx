import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WalletGrid } from './WalletGrid';
import { applyWalletSavings } from '../utils/walletSavings';
import type { UnifiedFinanceData } from '../types/finance';

const seed = (): UnifiedFinanceData => ({ wallets: { main: 1000 }, settings: { customWallets: [{ id: 'main', label: 'MariBank' }] }, library: { bills: [], receivables: [], shoots: [] }, logs: {} });

describe('wallet Savings controls', () => {
  it('keeps edits local until Save and supports set-all and release without changing balances', () => {
    let current = seed(); const commit = vi.fn(); const increment = vi.fn();
    const onSaveSavings = vi.fn((id, amount, expected) => { const result = applyWalletSavings(current, id, amount, expected); if (result.ok) current = result.data; return result; });
    const props = () => ({ wallets: current.wallets, savings: current.settings?.walletSavings, customWallets: current.settings?.customWallets, onSaveSavings, onCommit: commit, onIncrement: increment });
    const view = render(<WalletGrid {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set savings for MariBank' }));
    expect(screen.getByRole('dialog', { name: 'Savings' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Set all aside' }));
    expect(screen.getByRole('spinbutton', { name: 'Savings amount' })).toHaveValue(1000);
    expect(onSaveSavings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close balance editor' }));
    expect(current.settings?.walletSavings).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Set savings for MariBank' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set all aside' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Savings' }));
    expect(current.wallets.main).toBe(1000); expect(current.settings!.walletSavings!.main).toBe(1000);
    view.rerender(<WalletGrid {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set savings for MariBank' }));
    fireEvent.click(screen.getByRole('button', { name: 'Release savings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Savings' }));
    expect(current.settings!.walletSavings!.main).toBe(0);
    expect(commit).not.toHaveBeenCalled(); expect(increment).not.toHaveBeenCalled();
  });
  it('keeps the editor open on excessive savings or a concurrently changed wallet', () => {
    let current = seed();
    const onSaveSavings = (id: string, amount: number, expected: { balance: unknown; savings: unknown }) => applyWalletSavings(current, id, amount, expected);
    render(<WalletGrid wallets={current.wallets} customWallets={current.settings?.customWallets} onSaveSavings={onSaveSavings} onCommit={vi.fn()} onIncrement={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set savings for MariBank' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Savings amount' }), { target: { value: '1001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Savings' }));
    expect(screen.getByRole('alert')).toHaveTextContent('between zero');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Savings amount' }), { target: { value: '500' } });
    current = { ...current, wallets: { main: 900 } };
    fireEvent.click(screen.getByRole('button', { name: 'Save Savings' }));
    expect(screen.getByRole('alert')).toHaveTextContent('changed');
    expect(screen.getByRole('dialog', { name: 'Savings' })).toBeVisible();
    expect(current.settings?.walletSavings).toBeUndefined();
  });
});
