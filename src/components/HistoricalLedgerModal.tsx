import React, { useId, useState } from 'react';
import { X, Plus, Trash2, Edit2, ArrowRight, ArrowRightLeft } from 'lucide-react';
import { UnifiedFinanceData, ManualTransaction } from '../types/finance';
import { compareTransactionsNewestFirst, formatTransactionDateTime, transactionDay } from "../utils/transactionDates";
import { generateId } from '../utils/idHelpers';
import { Modal } from './ui/Modal';
import { entryDialogStyles } from './ui/dialogStyles';
import { formatPHP } from '../utils/currency';
import { getDefaultTransferWallets, parseWalletBalance, validateActiveWalletAssignment } from '../utils/financeHelpers';

export type LedgerTransitionResult =
  | { ok: true; data: UnifiedFinanceData; transaction?: ManualTransaction }
  | { ok: false; data: UnifiedFinanceData; error: string };

export type LedgerTransitionCommitter = (
  transition: (prev: UnifiedFinanceData) => LedgerTransitionResult,
) => LedgerTransitionResult;

export interface LedgerTransitionUpdater {
  (prev: UnifiedFinanceData): UnifiedFinanceData;
  evaluate: (prev: UnifiedFinanceData) => LedgerTransitionResult;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  globalData: UnifiedFinanceData;
  commitLedgerTransition: LedgerTransitionCommitter;
  showToast: (msg: string) => void;
  initialType?: ManualTransaction['type'];
}

export interface LedgerSaveInput {
  id: string;
  editingId: string | null;
  expectedOldTx?: ManualTransaction | null;
  title: string;
  amount: string | number;
  type: ManualTransaction['type'];
  date: string;
  wallet: string;
  destinationWallet?: string;
  category?: string;
  note?: string;
  updateWallets: boolean;
  now?: number;
}

export interface LedgerDeleteInput {
  id: string;
  expectedTx?: ManualTransaction | null;
  now?: number;
}

const getLocalDateKey = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const toValidCents = (value: string | number): number | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
    const [wholePart, fracPart = ''] = trimmed.split('.');
    const whole = Number(wholePart);
    const frac = Number(fracPart.padEnd(2, '0'));
    if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(frac)) return null;
    const cents = whole * 100 + frac;
    if (!Number.isSafeInteger(cents) || cents <= 0) return null;
    return cents;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents / 100 !== value) {
    return null;
  }
  return cents;
};

const walletBalanceCents = (
  wallets: Record<string, number> | undefined,
  walletId?: string,
): number | null => {
  if (!walletId) return null;
  const raw = wallets?.[walletId];
  const parsed = parseWalletBalance(raw);
  if (!parsed.isValid) return null;
  const balance = parsed.balance;
  const cents = Math.round(balance * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(balance * 100 - cents) > 1e-6) {
    return null;
  }
  return cents;
};

const isArchivedWallet = (data: UnifiedFinanceData, id?: string): boolean =>
  Boolean(id && data.settings?.archivedWallets?.some(wallet => wallet.id === id));

const hasReversibleWallet = (data: UnifiedFinanceData, id?: string): id is string =>
  Boolean(id && walletBalanceCents(data.wallets, id) !== null);

const hasActiveWallet = (data: UnifiedFinanceData, id?: string): id is string =>
  Boolean(
    id && validateActiveWalletAssignment(id, data.settings, data.wallets).ok,
  );

const resolveWalletLabel = (data: UnifiedFinanceData, id?: string): string =>
  data.settings?.customWallets?.find(wallet => wallet.id === id)?.label ??
  data.settings?.archivedWallets?.find(wallet => wallet.id === id)?.label ??
  data.settings?.walletLabels?.[id || ''] ??
  id ??
  'wallet';

const isSameManualTransaction = (a: ManualTransaction, b: ManualTransaction): boolean =>
  a.id === b.id &&
  a.title === b.title &&
  a.amount === b.amount &&
  a.type === b.type &&
  a.date === b.date &&
  (a.wallet || undefined) === (b.wallet || undefined) &&
  (a.destinationWallet || undefined) === (b.destinationWallet || undefined) &&
  (a.category || '') === (b.category || '') &&
  (a.note || '') === (b.note || '') &&
  (a.postingMode ?? 'wallet') === (b.postingMode ?? 'wallet') &&
  a.createdAt === b.createdAt;

export const applyLedgerSave = (
  data: UnifiedFinanceData,
  input: LedgerSaveInput,
): LedgerTransitionResult => {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) {
    return { ok: false, data, error: 'Please enter a title.' };
  }
  if (input.type !== 'expense' && input.type !== 'income' && input.type !== 'transfer') {
    return { ok: false, data, error: 'Choose a valid transaction type.' };
  }
  const newCents = toValidCents(input.amount);
  if (newCents === null) {
    return { ok: false, data, error: 'Enter a valid positive amount.' };
  }
  if (
    typeof input.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    transactionDay(input.date) !== input.date
  ) {
    return { ok: false, data, error: 'Enter a valid date.' };
  }
  if (input.type === 'transfer') {
    if (!input.destinationWallet) {
      return { ok: false, data, error: 'Please select a destination wallet.' };
    }
    if (input.wallet === input.destinationWallet) {
      return { ok: false, data, error: 'Choose a different destination wallet.' };
    }
  }

  const existingTxs = data.library?.manualTransactions || [];
  let oldTx: ManualTransaction | undefined;
  if (input.editingId !== null) {
    oldTx = existingTxs.find(t => t.id === input.editingId);
    if (!oldTx) {
      return { ok: false, data, error: 'This transaction no longer exists.' };
    }
    if (
      input.expectedOldTx !== undefined &&
      (!input.expectedOldTx || !isSameManualTransaction(oldTx, input.expectedOldTx))
    ) {
      return {
        ok: false,
        data,
        error: 'This transaction changed. Review the latest entry before trying again.',
      };
    }
  } else if (existingTxs.some(t => t.id === input.id)) {
    return { ok: false, data, error: 'This transaction was already recorded.' };
  }

  if (
    isArchivedWallet(data, input.wallet) ||
    (input.type === 'transfer' && isArchivedWallet(data, input.destinationWallet))
  ) {
    return {
      ok: false,
      data,
      error: input.editingId
        ? 'Restore the archived wallet before editing this transaction.'
        : 'Restore the archived wallet before recording this transaction.',
    };
  }
  if (!hasActiveWallet(data, input.wallet)) {
    return { ok: false, data, error: 'Please select a valid wallet.' };
  }
  if (input.type === 'transfer' && !hasActiveWallet(data, input.destinationWallet)) {
    return { ok: false, data, error: 'Please select a destination wallet.' };
  }

  const deltas = new Map<string, number>();
  const addDelta = (walletId: string, deltaCents: number) => {
    deltas.set(walletId, (deltas.get(walletId) ?? 0) + deltaCents);
  };

  if (oldTx && oldTx.postingMode !== 'history-only') {
    const oldCents = toValidCents(oldTx.amount);
    if (oldCents === null) {
      return { ok: false, data, error: 'The existing transaction amount is invalid.' };
    }
    if (
      !hasReversibleWallet(data, oldTx.wallet) ||
      (oldTx.type === 'transfer' && !hasReversibleWallet(data, oldTx.destinationWallet))
    ) {
      return { ok: false, data, error: 'The original transaction wallet is unavailable.' };
    }
    if (oldTx.type === 'income') {
      addDelta(oldTx.wallet, -oldCents);
    } else if (oldTx.type === 'expense') {
      addDelta(oldTx.wallet, oldCents);
    } else if (oldTx.type === 'transfer') {
      addDelta(oldTx.wallet, oldCents);
      addDelta(oldTx.destinationWallet!, -oldCents);
    }
  }

  if (input.updateWallets) {
    if (input.type === 'income') {
      addDelta(input.wallet, newCents);
    } else if (input.type === 'expense') {
      addDelta(input.wallet, -newCents);
    } else if (input.type === 'transfer') {
      addDelta(input.wallet, -newCents);
      addDelta(input.destinationWallet!, newCents);
    }
  }

  const nextWallets = { ...data.wallets };
  for (const [walletId, deltaCents] of deltas.entries()) {
    const currentCents = walletBalanceCents(data.wallets, walletId);
    if (currentCents === null) {
      return { ok: false, data, error: 'Please select a valid wallet.' };
    }
    const finalCents = currentCents + deltaCents;
    if (!Number.isSafeInteger(finalCents)) {
      return { ok: false, data, error: 'Wallet balance is out of range.' };
    }
    // Preserve pre-existing negative balances; allow improvements (deltaCents > 0)
    // and reject operations that newly create or worsen an overdraft (deltaCents < 0 && finalCents < 0).
    if (deltaCents < 0 && finalCents < 0) {
      return {
        ok: false,
        data,
        error: `Insufficient balance in ${resolveWalletLabel(data, walletId)}.`,
      };
    }
    if (deltaCents !== 0) {
      nextWallets[walletId] = finalCents / 100;
    }
  }

  const now = input.now ?? Date.now();
  const prevUpdatedAt =
    typeof data.updatedAt === 'number' && Number.isFinite(data.updatedAt) ? data.updatedAt : 0;
  const newTx: ManualTransaction = {
    id: input.editingId || input.id,
    title,
    amount: newCents / 100,
    type: input.type,
    date: input.date,
    wallet: input.wallet,
    destinationWallet: input.type === 'transfer' ? input.destinationWallet : undefined,
    category: input.category,
    note: input.note,
    postingMode: input.updateWallets ? 'wallet' : 'history-only',
    createdAt: oldTx ? oldTx.createdAt : now,
  };

  const updatedTxs = input.editingId
    ? existingTxs.map(t => (t.id === input.editingId ? newTx : t))
    : [newTx, ...existingTxs];

  return {
    ok: true,
    transaction: newTx,
    data: {
      ...data,
      wallets: nextWallets,
      library: {
        ...data.library,
        manualTransactions: updatedTxs.sort(
          (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
        ),
      },
      updatedAt: Math.max(now, prevUpdatedAt),
    },
  };
};

export const applyLedgerDelete = (
  data: UnifiedFinanceData,
  input: LedgerDeleteInput,
): LedgerTransitionResult => {
  const existingTxs = data.library?.manualTransactions || [];
  const currentTx = existingTxs.find(t => t.id === input.id);
  if (!currentTx) {
    return { ok: false, data, error: 'This transaction no longer exists.' };
  }
  if (
    input.expectedTx !== undefined &&
    (!input.expectedTx || !isSameManualTransaction(currentTx, input.expectedTx))
  ) {
    return {
      ok: false,
      data,
      error: 'This transaction changed. Review the latest entry before trying again.',
    };
  }

  const nextWallets = { ...data.wallets };
  if (currentTx.postingMode !== 'history-only') {
    const cents = toValidCents(currentTx.amount);
    if (cents === null) {
      return { ok: false, data, error: 'The transaction amount is invalid.' };
    }
    if (
      !hasReversibleWallet(data, currentTx.wallet) ||
      (currentTx.type === 'transfer' && !hasReversibleWallet(data, currentTx.destinationWallet))
    ) {
      return { ok: false, data, error: 'The original transaction wallet is unavailable.' };
    }

    const deltas = new Map<string, number>();
    const addDelta = (walletId: string, deltaCents: number) => {
      deltas.set(walletId, (deltas.get(walletId) ?? 0) + deltaCents);
    };
    if (currentTx.type === 'income') {
      addDelta(currentTx.wallet, -cents);
    } else if (currentTx.type === 'expense') {
      addDelta(currentTx.wallet, cents);
    } else if (currentTx.type === 'transfer') {
      addDelta(currentTx.wallet, cents);
      addDelta(currentTx.destinationWallet!, -cents);
    }

    for (const [walletId, deltaCents] of deltas.entries()) {
      const currentCents = walletBalanceCents(data.wallets, walletId);
      if (currentCents === null) {
        return { ok: false, data, error: 'The original transaction wallet is unavailable.' };
      }
      const finalCents = currentCents + deltaCents;
      if (!Number.isSafeInteger(finalCents)) {
        return { ok: false, data, error: 'Wallet balance is out of range.' };
      }
      if (deltaCents < 0 && finalCents < 0) {
        return {
          ok: false,
          data,
          error: `Insufficient balance in ${resolveWalletLabel(data, walletId)} to reverse this transaction.`,
        };
      }
      if (deltaCents !== 0) {
        nextWallets[walletId] = finalCents / 100;
      }
    }
  }

  const now = input.now ?? Date.now();
  const prevUpdatedAt =
    typeof data.updatedAt === 'number' && Number.isFinite(data.updatedAt) ? data.updatedAt : 0;
  return {
    ok: true,
    data: {
      ...data,
      wallets: nextWallets,
      library: {
        ...data.library,
        manualTransactions: existingTxs.filter(t => t.id !== input.id),
      },
      updatedAt: Math.max(now, prevUpdatedAt),
    },
  };
};

export const createLedgerSaveUpdater = (input: LedgerSaveInput): LedgerTransitionUpdater => {
  const evaluate = (prev: UnifiedFinanceData): LedgerTransitionResult =>
    applyLedgerSave(prev, input);
  const updater = ((prev: UnifiedFinanceData): UnifiedFinanceData => {
    const result = evaluate(prev);
    return result.ok ? result.data : prev;
  }) as LedgerTransitionUpdater;
  updater.evaluate = evaluate;
  return updater;
};

export const createLedgerDeleteUpdater = (input: LedgerDeleteInput): LedgerTransitionUpdater => {
  const evaluate = (prev: UnifiedFinanceData): LedgerTransitionResult =>
    applyLedgerDelete(prev, input);
  const updater = ((prev: UnifiedFinanceData): UnifiedFinanceData => {
    const result = evaluate(prev);
    return result.ok ? result.data : prev;
  }) as LedgerTransitionUpdater;
  updater.evaluate = evaluate;
  return updater;
};

export const HistoricalLedgerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  globalData,
  commitLedgerTransition,
  showToast,
  initialType,
}) => {
  const formId = useId();
  const isWalletTransfer = initialType === 'transfer';
  const transferDefaults = getDefaultTransferWallets(globalData.settings);
  const localDate = getLocalDateKey();
  const [view, setView] = useState<'list' | 'form'>(initialType ? 'form' : 'list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<ManualTransaction | null>(null);
  const [saveError, setSaveError] = useState('');

  const [form, setForm] = useState({
    title: isWalletTransfer ? 'Transfer' : '',
    amount: '',
    type: initialType ?? ('expense' as ManualTransaction['type']),
    date: localDate,
    wallet: isWalletTransfer
      ? transferDefaults.wallet
      : globalData.settings?.defaultWallet || 'main',
    destinationWallet: isWalletTransfer ? transferDefaults.destinationWallet : '',
    category: '',
    note: '',
    updateWallets: true,
  });

  if (!isOpen) return null;

  const transactions = [...(globalData.library?.manualTransactions || [])].sort(compareTransactionsNewestFirst);
  const customWallets = globalData.settings?.customWallets || [];
  const archivedWallets = globalData.settings?.archivedWallets ?? [];
  const walletLabel = (id?: string) => customWallets.find(wallet => wallet.id === id)?.label ??
    archivedWallets.find(wallet => wallet.id === id)?.label ?? id;
  const walletBalance = (id: string) => typeof globalData.wallets[id] === 'number' && Number.isFinite(globalData.wallets[id])
    ? formatPHP(globalData.wallets[id]) : '—';
  const usesArchivedWallet = (data: UnifiedFinanceData, tx: ManualTransaction) =>
    tx.postingMode !== "history-only" && data.settings?.archivedWallets?.some(wallet => wallet.id === tx.wallet || wallet.id === tx.destinationWallet);


  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const input: LedgerSaveInput = {
      id: editingId || generateId('mtx'),
      editingId,
      expectedOldTx: editingId !== null ? editingTx : undefined,
      title: form.title,
      amount: form.amount,
      type: form.type,
      date: form.date,
      wallet: form.wallet,
      destinationWallet: form.type === 'transfer' ? form.destinationWallet : undefined,
      category: form.category,
      note: form.note,
      updateWallets: isWalletTransfer ? true : form.updateWallets,
      now: Date.now(),
    };

    const updater = createLedgerSaveUpdater(input);
    const outcome = commitLedgerTransition(updater.evaluate);

    if (!outcome.ok) {
      setSaveError(outcome.error);
      showToast(outcome.error);
      return;
    }

    setSaveError('');
    showToast(editingId ? 'Transaction updated' : 'Transaction recorded');
    if (isWalletTransfer) {
      onClose();
    } else {
      setEditingId(null);
      setEditingTx(null);
      setView('list');
    }
  };

  const handleDelete = (tx: ManualTransaction) => {
    const prompt = tx.postingMode === "history-only"
      ? `Delete "${tx.title}" from history?`
      : `Delete "${tx.title}" and reverse its wallet impact?`;
    if (!confirm(prompt)) return;

    const input: LedgerDeleteInput = {
      id: tx.id,
      expectedTx: tx,
      now: Date.now(),
    };

    const updater = createLedgerDeleteUpdater(input);
    const outcome = commitLedgerTransition(updater.evaluate);

    if (!outcome.ok) {
      showToast(outcome.error);
      return;
    }

    showToast('Transaction deleted');
  };

  const openEdit = (tx: ManualTransaction) => {
    if (usesArchivedWallet(globalData, tx)) {
      showToast("Restore the archived wallet before editing this transaction.");
      return;
    }
    const sourceWallet = tx.wallet || 'main';
    setEditingId(tx.id);
    setEditingTx(tx);
    setSaveError('');
    setForm({
      title: tx.title,
      amount: String(tx.amount),
      type: tx.type,
      date: tx.date,
      wallet: sourceWallet,
      destinationWallet: tx.destinationWallet === sourceWallet ? '' : (tx.destinationWallet || ''),
      category: tx.category || '',
      note: tx.note || '',
      updateWallets: tx.postingMode !== 'history-only',
    });
    setView('form');
  };

  const openAdd = () => {
    setEditingId(null);
    setEditingTx(null);
    setSaveError('');
    setForm({
      title: '', amount: '', type: 'expense',
      date: getLocalDateKey(),
      wallet: globalData.settings?.defaultWallet || 'main',
      destinationWallet: '', category: '', note: '', updateWallets: true
    });
    setView('form');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant={isWalletTransfer ? 'floating' : 'sheet'}
      ariaLabel={isWalletTransfer ? 'Transfer' : 'Historical Ledger'}
      manageFocus
    >
      <div className={isWalletTransfer ? `${entryDialogStyles.card} max-w-sm` : 'bg-surface-elevated border border-inverse/[0.08] rounded-t-3xl sm:rounded-3xl w-full max-w-lg mx-auto shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4'}>
        <div className={isWalletTransfer ? entryDialogStyles.header : 'flex items-center justify-between p-5 border-b border-inverse/[0.05]'}>
          <div className="flex min-w-0 items-center gap-3">
            {isWalletTransfer && <span className={entryDialogStyles.icon}><ArrowRightLeft size={18} aria-hidden="true" /></span>}
            <h2 className={isWalletTransfer ? 'text-sm font-semibold text-strong' : 'text-sm font-bold text-strong uppercase tracking-wider'}>{isWalletTransfer ? 'Transfer' : view === 'form' ? (editingId ? 'Edit Transaction' : 'New Transaction') : 'Historical Ledger'}</h2>
          </div>
          <button type="button" aria-label={isWalletTransfer ? 'Close transfer' : 'Close ledger'} onClick={onClose} className={isWalletTransfer ? entryDialogStyles.close : 'text-faint hover:text-strong p-2 rounded-full hover:bg-inverse/[0.05] transition'}><X size={18} /></button>
        </div>

        <div className={isWalletTransfer ? '' : 'overflow-y-auto p-5'}>
          {view === 'list' ? (
            <div className="space-y-4">
              <button onClick={openAdd} className="w-full py-3.5 border border-dashed border-inverse/[0.15] hover:border-emerald-500/50 hover:bg-emerald-500/10 text-muted hover:text-emerald-400 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2">
                <Plus size={15} /> Add Manual Transaction
              </button>
              <div className="space-y-2">
                {transactions.length === 0 && <div className="text-center text-xs text-faint py-6 italic">No manual transactions recorded.</div>}
                {transactions.map(tx => (
                  <div key={tx.id} className="bg-surface border border-inverse/[0.04] p-3.5 rounded-xl">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-bold text-primary">{tx.title}</div>
                        <div className="text-[10px] text-faint mt-0.5">{formatTransactionDateTime(tx.date, tx.createdAt)} • {tx.type.toUpperCase()}{tx.postingMode === 'history-only' ? ' • HISTORY ONLY' : ''}</div>
                      </div>
                      <div className={`text-xs font-mono font-bold ${tx.type === 'income' ? 'text-emerald-400' : tx.type === 'expense' ? 'text-strong' : 'text-blue-400'}`}>
                        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}₱{tx.amount.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-inverse/[0.02]">
                      <div className="text-[10px] text-muted flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 bg-fill-strong rounded">{walletLabel(tx.wallet)}</span>
                        {tx.type === 'transfer' && (
                          <>
                            <ArrowRight size={10} />
                            <span className="px-1.5 py-0.5 bg-fill-strong rounded">{walletLabel(tx.destinationWallet)}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(tx)} className="p-1.5 text-faint hover:text-amber-400 rounded hover:bg-amber-500/10 transition"><Edit2 size={13}/></button>
                        <button onClick={() => handleDelete(tx)} className="p-1.5 text-faint hover:text-rose-400 rounded hover:bg-rose-500/10 transition"><Trash2 size={13}/></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <form noValidate onChange={() => setSaveError('')} onSubmit={handleSave} className="space-y-4">
              {saveError && <p role="alert" className="rounded-lg bg-fill px-3 py-2 text-xs text-rose-500">{saveError}</p>}
              {!isWalletTransfer && <>
                <div className="grid grid-cols-3 gap-2 bg-surface-lowest p-1.5 rounded-xl border border-inverse/[0.05]">
                {['expense', 'income', 'transfer'].map(t => (
                  <button key={t} type="button" aria-pressed={form.type === t} onClick={() => { setSaveError(''); setForm(current => ({...current, type: t as ManualTransaction['type'], destinationWallet: t === 'transfer' && current.destinationWallet === current.wallet ? '' : current.destinationWallet})); }} className={`min-h-11 py-2 text-[10px] font-bold uppercase rounded-lg transition ${form.type === t ? (t === 'income' ? 'chip-emerald' : t === 'expense' ? 'bg-fill-strong text-primary' : 'chip-blue') : 'text-faint hover:bg-inverse/[0.02]'}`}>
                    {t}
                  </button>
                ))}
              </div>
              <div>
                <label htmlFor={`${formId}-title`} className="text-[10px] text-faint uppercase font-semibold mb-1 block">Title / Description</label>
                <input id={`${formId}-title`} type="text" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500" placeholder="e.g., Backdated Salary, Bank Transfer..." />
              </div>
              </>}
              <div className={isWalletTransfer ? '' : 'grid grid-cols-2 gap-3'}>
                <div>
                  <label htmlFor={`${formId}-amount`} className="text-[10px] text-faint uppercase font-semibold mb-1 block">Amount</label>
                  <div className="relative">
                    {isWalletTransfer && <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg text-muted">₱</span>}
                    <input id={`${formId}-amount`} type="number" inputMode="decimal" step="0.01" min={isWalletTransfer ? '0.01' : undefined} required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className={isWalletTransfer ? entryDialogStyles.amount : 'w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500 font-mono'} placeholder="0.00" />
                  </div>
                </div>
                {!isWalletTransfer && <div>
                  <label htmlFor={`${formId}-date`} className="text-[10px] text-faint uppercase font-semibold mb-1 block">Date</label>
                  <input id={`${formId}-date`} type="date" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500" />
                </div>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label htmlFor={`${formId}-from`} className="text-[10px] text-faint uppercase font-semibold mb-1 block">{isWalletTransfer ? 'From' : form.type === 'transfer' ? 'From Wallet' : 'Wallet'}</label>
                  <select id={`${formId}-from`} aria-describedby={isWalletTransfer ? `${formId}-from-balance` : undefined} required value={form.wallet} onChange={e => setForm({...form, wallet: e.target.value, destinationWallet: e.target.value === form.destinationWallet ? '' : form.destinationWallet})} className="min-h-11 w-full min-w-0 bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500">
                    {customWallets.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                  </select>
                  {isWalletTransfer && <p id={`${formId}-from-balance`} className="mt-1.5 break-words text-[11px] text-muted">Balance: <span className="privacy-blur font-mono tabular-nums">{walletBalance(form.wallet)}</span></p>}
                </div>
                {form.type === 'transfer' && (
                  <div className="min-w-0">
                    <label htmlFor={`${formId}-to`} className="text-[10px] text-faint uppercase font-semibold mb-1 block">{isWalletTransfer ? 'To' : 'To Wallet'}</label>
                    <select id={`${formId}-to`} aria-describedby={isWalletTransfer ? `${formId}-to-balance` : undefined} required value={form.destinationWallet} onChange={e => setForm({...form, destinationWallet: e.target.value})} className="min-h-11 w-full min-w-0 bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500">
                      <option value="" disabled>Select...</option>
                      {customWallets.filter(w => w.id !== form.wallet).map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                    </select>
                    {isWalletTransfer && <p id={`${formId}-to-balance`} className="mt-1.5 break-words text-[11px] text-muted">Balance: <span className="privacy-blur font-mono tabular-nums">{form.destinationWallet ? walletBalance(form.destinationWallet) : '—'}</span></p>}
                  </div>
                )}
              </div>
              {!isWalletTransfer && <><label className="flex items-center gap-2 text-xs text-primary">
                <input type="checkbox" checked={form.updateWallets} onChange={event => setForm({ ...form, updateWallets: event.target.checked })} />
                Update wallet balances
              </label>
              <p className="text-xs text-muted">Turn this off to record history without applying a wallet movement.</p></>}
              <div className="flex gap-2 pt-3">
                <button type="button" onClick={() => { setSaveError(''); if (isWalletTransfer) onClose(); else { setEditingId(null); setEditingTx(null); setView('list'); } }} className="flex-1 py-3 bg-inverse/[0.05] hover:bg-inverse/[0.1] text-xs font-semibold rounded-xl transition">Cancel</button>
                <button type="submit" className={isWalletTransfer ? `${entryDialogStyles.primary} flex-1` : 'flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-emerald-900/20'}>{isWalletTransfer ? 'Transfer' : editingId ? 'Update' : 'Save'}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
};
