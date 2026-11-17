import { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Expense, FinanceTransitionCommitter, UnifiedFinanceData } from '../types/finance';
import { INITIAL_UNIFIED_DATA } from '../constants/initialData';
import { useExpenseActions } from '../hooks/useExpenseActions';
import { recordPaymentAction, type PaymentHistory, type PaymentHistoryAction } from '../utils/paymentHistory';
import { ExpensesTab } from './ExpensesTab';
import { PaymentHistoryMenu } from './PaymentHistoryMenu';

const original: Expense = { id: 'original', merchant: 'Lunch', amount: 100, deductedAmount: 100, category: 'Food & Dining', wallet: 'a', date: '2026-11-01', loggedAt: '2026-11-01T04:00:00.000Z' };
const fixture = (record = original): UnifiedFinanceData => ({ ...structuredClone(INITIAL_UNIFIED_DATA), wallets: { a: 900, b: 500 },
  settings: { defaultWallet: 'b', expenseWallets: { Shopping: 'b' }, customWallets: [{ id: 'a', label: 'Wallet A' }, { id: 'b', label: 'Wallet B' }] },
  library: { bills: [], receivables: [], shoots: [], expenses: [{ ...record }] }, logs: {} });
const state = () => JSON.parse(screen.getByTestId('current-state').textContent!);
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
function Harness({ initial = fixture() }: { initial?: UnifiedFinanceData }) {
  const [data, setData] = useState(initial), latest = useRef(initial), blocked = useRef(false);
  const [history, setHistory] = useState<PaymentHistory>({ owner: null, undo: [], redo: [] });
  const [message, setMessage] = useState('');
  const [showExpenses, setShowExpenses] = useState(true);
  const commit: FinanceTransitionCommitter = transition => {
    if (blocked.current) return { ok: false, data: latest.current, error: 'Resolve the active conflict first.' } as unknown as ReturnType<typeof transition>;
    const result = transition(latest.current);
    if (result.ok) { latest.current = result.data; setData(result.data); }
    return result;
  };
  return <>
    <PaymentHistoryMenu undo={history.undo.at(-1)} redo={history.redo.at(-1)} isPrivate={false} onSelect={action => action.onClick()} />
    {showExpenses && <ExpensesTab globalData={data} selectedMonth="November 2026" setGlobalData={setData} commitExpenseTransition={commit}
      showToast={(text, action) => { setMessage(text); if (action) setHistory(previous => recordPaymentAction(previous, 'test-owner', action)); }} />}
    <output data-testid="current-state">{JSON.stringify(data)}</output><output data-testid="message">{message}</output>
    <button onClick={() => setShowExpenses(false)}>Leave Expenses</button>
    <button onClick={() => {
      const next = { ...latest.current, expenseRevisions: { ...latest.current.expenseRevisions, original: 'remote-roundtrip' } };
      latest.current = next; setData(next);
    }}>Simulate remote roundtrip</button>
    <button onClick={() => { blocked.current = true; }}>Block changes</button>
    <button onClick={() => {
      const next = { ...latest.current, library: { ...latest.current.library, expenses: latest.current.library.expenses!.map(expense => ({ ...expense, merchant: 'Changed elsewhere' })) } };
      latest.current = next; setData(next);
    }}>Simulate remote change</button>
  </>;
}
const openEdit = () => { fireEvent.click(screen.getByRole('button', { name: 'Edit expense at Lunch' })); return screen.getByRole('form', { name: 'Edit Expense' }); };
const replay = (direction: 'Undo' | 'Redo') => {
  fireEvent.click(screen.getByRole('button', { name: 'Payment history' }));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${direction} expense at`) }));
};

describe('saved-expense correction UI and history', () => {
  it('cancels a changed edit without saving, and reopens original values', () => {
    render(<Harness />); const edit = screen.getByRole('button', { name: 'Edit expense at Lunch' }); edit.focus();
    const form = openEdit(); fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: '250' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(edit).toHaveFocus();
    expect(state().wallets).toEqual({ a: 900, b: 500 }); expect(state().library.expenses).toEqual([original]);
    const reopened = openEdit(); expect(within(reopened).getByRole('spinbutton')).toHaveValue(100);
    fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('saves details and net cents without resetting the wallet on a category change, then undoes and redoes', () => {
    const confirm = vi.spyOn(window, 'confirm'); render(<Harness />); const form = openEdit();
    fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: '80' } });
    fireEvent.change(within(form).getByLabelText('Merchant / Name'), { target: { value: 'Correct lunch' } });
    fireEvent.change(within(form).getByLabelText('Category'), { target: { value: 'Shopping' } });
    expect(within(form).getByLabelText('Deduct From')).toHaveValue('a');
    fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2026-11-02' } });
    fireEvent.submit(form); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(confirm).not.toHaveBeenCalled();
    expect(state().wallets).toEqual({ a: 920, b: 500 });
    expect(state().library.expenses).toEqual([{ ...original, merchant: 'Correct lunch', amount: 80, deductedAmount: 80, category: 'Shopping', date: '2026-11-02' }]);
    replay('Undo'); expect(state().wallets.a).toBe(900); expect(state().library.expenses).toEqual([original]);
    replay('Redo'); expect(state().wallets.a).toBe(920); expect(state().library.expenses[0].loggedAt).toBe(original.loggedAt);
  });
  it('changes the selected wallet as one acknowledged save', () => {
    render(<Harness />); const form = openEdit();
    fireEvent.change(within(form).getByLabelText('Deduct From'), { target: { value: 'b' } }); fireEvent.submit(form);
    expect(state().wallets).toEqual({ a: 1000, b: 400 }); expect(state().library.expenses[0].wallet).toBe('b');
    replay('Undo'); expect(state().wallets).toEqual({ a: 900, b: 500 });
  });
  it('leaves an insufficient-funds edit open and unchanged', () => {
    render(<Harness />); const form = openEdit();
    fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: '1001' } }); fireEvent.submit(form);
    expect(screen.getByRole('alert')).toHaveTextContent(/insufficient balance/i); expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(state().wallets).toEqual({ a: 900, b: 500 }); expect(state().library.expenses).toEqual([original]);
  });
  it('does not overwrite a record changed after opening the editor', () => {
    render(<Harness />); const form = openEdit();
    fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simulate remote change' })); fireEvent.submit(form);
    expect(screen.getByRole('alert')).toHaveTextContent(/expense changed/i); expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(state().wallets.a).toBe(900); expect(state().library.expenses[0].merchant).toBe('Changed elsewhere');
  });
  it('keeps the editor open without offering Undo when the authoritative committer rejects', () => {
    render(<Harness />); const form = openEdit(); fireEvent.click(screen.getByRole('button', { name: 'Block changes' }));
    fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: '80' } }); fireEvent.submit(form);
    expect(screen.getByRole('alert')).toHaveTextContent(/active conflict/i); expect(state().wallets.a).toBe(900);
    expect(screen.getByTestId('message')).toHaveTextContent('');
  });
  it('rejects a stale editor after another device returns the record to identical field values', () => {
    render(<Harness />); const form = openEdit();
    fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simulate remote roundtrip' })); fireEvent.submit(form);
    expect(screen.getByRole('alert')).toHaveTextContent(/newer history/i);
    expect(state().wallets.a).toBe(900); expect(state().library.expenses).toEqual([original]);
  });
  it('can undo from the shared history after leaving the Expenses tab', () => {
    render(<Harness />); const form = openEdit();
    fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: '80' } }); fireEvent.submit(form);
    fireEvent.click(screen.getByRole('button', { name: 'Leave Expenses' }));
    replay('Undo'); expect(state().wallets.a).toBe(900); expect(state().library.expenses).toEqual([original]);
  });
  it('keeps separate historical deductions locked but allows a name correction', () => {
    render(<Harness initial={fixture({ ...original, deductedAmount: 0 })} />); const form = openEdit();
    expect(within(form).getByRole('spinbutton')).toBeDisabled(); expect(within(form).getByLabelText('Deduct From')).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('Merchant / Name'), { target: { value: 'Historical lunch' } }); fireEvent.submit(form);
    expect(state().wallets).toEqual({ a: 900, b: 500 }); expect(state().library.expenses[0].deductedAmount).toBe(0);
    replay('Undo'); expect(state().library.expenses[0].merchant).toBe('Lunch'); expect(state().wallets.a).toBe(900);
  });
  it('offers deletion undo/redo with the original record and its original-wallet debit', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true); render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete expense' }));
    expect(state().wallets.a).toBe(1000); expect(state().library.expenses).toEqual([]);
    replay('Undo'); expect(state().wallets.a).toBe(900); expect(state().library.expenses).toEqual([original]);
    replay('Redo'); expect(state().wallets.a).toBe(1000); expect(state().library.expenses).toEqual([]);
  });
  it('keeps a deletion-undo available after insufficient funds until it can safely be applied', () => {
    let data = fixture(); const actions: PaymentHistoryAction[] = [], toast = vi.fn((_: string, action?: PaymentHistoryAction) => { if (action) actions.push(action); });
    const commit: FinanceTransitionCommitter = transition => { const result = transition(data); if (result.ok) data = result.data; return result; };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const hook = renderHook(() => useExpenseActions({ globalData: data, commitExpenseTransition: commit, showToast: toast }));
    act(() => hook.result.current.handleDeleteExpense(original)); data.wallets.a = 0;
    act(() => actions[0].onClick()); expect(data.library.expenses).toEqual([]); expect(actions).toHaveLength(1);
    data.wallets.a = 100; act(() => actions[0].onClick()); expect(data.wallets.a).toBe(0); expect(data.library.expenses).toEqual([original]);
    expect(actions[1].label).toBe('Redo'); hook.unmount();
  });
  it('rejects a consumed callback even after a legitimate redo returns to the same record state', () => {
    let data = fixture(); const actions: PaymentHistoryAction[] = [];
    const commit: FinanceTransitionCommitter = transition => { const result = transition(data); if (result.ok) data = result.data; return result; };
    const hook = renderHook(() => useExpenseActions({ globalData: data, commitExpenseTransition: commit, showToast: (_, action) => { if (action) actions.push(action); } }));
    act(() => hook.result.current.handleEditExpense(original, { ...original, amount: '80' }, vi.fn()));
    act(() => actions[0].onClick()); expect(data.wallets.a).toBe(900);
    act(() => actions[1].onClick()); expect(data.wallets.a).toBe(920);
    act(() => actions[0].onClick()); expect(data.wallets.a).toBe(920); expect(actions).toHaveLength(3);
    act(() => actions[2].onClick()); expect(data.wallets.a).toBe(900); hook.unmount();
  });
});
