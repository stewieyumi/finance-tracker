import React, { useId, useState } from 'react';
import { X, Plus, Trash2, Edit2, ArrowRight, ArrowRightLeft } from 'lucide-react';
import { UnifiedFinanceData, ManualTransaction } from '../types/finance';
import { compareTransactionsNewestFirst, formatTransactionDateTime } from "../utils/transactionDates";
import { generateId } from '../utils/idHelpers';
import { Modal } from './ui/Modal';
import { entryDialogStyles } from './ui/dialogStyles';
import { formatPHP } from '../utils/currency';
import { getDefaultTransferWallets } from '../utils/financeHelpers';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  showToast: (msg: string) => void;
  initialType?: ManualTransaction['type'];
}

const applyManualTransactionWalletEffect = (
  wallets: Record<string, number>,
  transaction: ManualTransaction,
  direction: 1 | -1,
) => {
  if (transaction.postingMode === "history-only" || !transaction.wallet) return wallets;
  const nextWallets = { ...wallets };
  const amount = Number(transaction.amount) || 0;

  if (transaction.type === "income") {
    nextWallets[transaction.wallet] =
      (nextWallets[transaction.wallet] || 0) + amount * direction;
  } else if (transaction.type === "expense") {
    nextWallets[transaction.wallet] =
      (nextWallets[transaction.wallet] || 0) - amount * direction;
  } else if (transaction.type === "transfer") {
    nextWallets[transaction.wallet] =
      (nextWallets[transaction.wallet] || 0) - amount * direction;

    if (transaction.destinationWallet) {
      nextWallets[transaction.destinationWallet] =
        (nextWallets[transaction.destinationWallet] || 0) +
        amount * direction;
    }
  }

  Object.keys(nextWallets).forEach((wallet) => {
    nextWallets[wallet] = Math.round(nextWallets[wallet] * 100) / 100;
  });

  return nextWallets;
};

export const HistoricalLedgerModal: React.FC<Props> = ({ isOpen, onClose, globalData, setGlobalData, showToast, initialType }) => {
  const formId = useId();
  const isWalletTransfer = initialType === 'transfer';
  const transferDefaults = getDefaultTransferWallets(globalData.settings);
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [view, setView] = useState<'list' | 'form'>(initialType ? 'form' : 'list');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: isWalletTransfer ? 'Transfer' : '',
    amount: '',
    type: initialType ?? ('expense' as ManualTransaction['type']),
    date: isWalletTransfer ? localDate : today.toISOString().split('T')[0],
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
    const amt = parseFloat(form.amount);
    if (!form.title || isNaN(amt) || amt <= 0) return;
    if (form.type === 'transfer' && !form.destinationWallet) {
       showToast("Please select a destination wallet.");
       return;
    }

    setGlobalData(prev => {
      const newTx: ManualTransaction = {
        id: editingId || generateId('mtx'),
        title: form.title.trim(),
        amount: amt,
        type: form.type,
        date: form.date,
        wallet: form.wallet,
        destinationWallet: form.type === 'transfer' ? form.destinationWallet : undefined,
        category: form.category,
        note: form.note,
        postingMode: form.updateWallets ? "wallet" : "history-only",
        createdAt: editingId ? (prev.library?.manualTransactions?.find(t => t.id === editingId)?.createdAt || Date.now()) : Date.now()
      };

      if (usesArchivedWallet(prev, newTx)) return prev;
      let nextWallets = { ...prev.wallets };

      // REVERSE OLD TRANSACTION EFFECT
      if (editingId) {
        const oldTx = prev.library?.manualTransactions?.find(t => t.id === editingId);
        if (oldTx) {
          if (usesArchivedWallet(prev, oldTx)) return prev;
          nextWallets = applyManualTransactionWalletEffect(nextWallets, oldTx, -1);
        }
      }

      // APPLY NEW TRANSACTION EFFECT
      nextWallets = applyManualTransactionWalletEffect(
        nextWallets,
        newTx,
        1,
      );

      const existingTxs = prev.library?.manualTransactions || [];
      const updatedTxs = editingId
         ? existingTxs.map(t => t.id === editingId ? newTx : t)
         : [newTx, ...existingTxs];

      return {
         ...prev,
         wallets: nextWallets,
         library: { ...prev.library, manualTransactions: updatedTxs.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt) },
         updatedAt: Date.now()
      };
    });

    showToast(editingId ? "Transaction updated" : "Transaction recorded");
    if (isWalletTransfer) onClose();
    else setView('list');
  };

  const handleDelete = (tx: ManualTransaction) => {
    if (usesArchivedWallet(globalData, tx)) {
      showToast("Restore the archived wallet before reversing this transaction.");
      return;
    }
    const prompt = tx.postingMode === "history-only"
      ? `Delete "${tx.title}" from history?`
      : `Delete "${tx.title}" and reverse its wallet impact?`;
    if (!confirm(prompt)) return;
    setGlobalData(prev => {
      if (usesArchivedWallet(prev, tx)) return prev;
      const nextWallets = applyManualTransactionWalletEffect(
        prev.wallets,
        tx,
        -1,
      );

      return {
         ...prev,
         wallets: nextWallets,
         library: { ...prev.library, manualTransactions: (prev.library?.manualTransactions || []).filter(t => t.id !== tx.id) },
         updatedAt: Date.now()
      };
    });
    showToast("Transaction deleted");
  };

  const openEdit = (tx: ManualTransaction) => {
    if (usesArchivedWallet(globalData, tx)) {
      showToast("Restore the archived wallet before editing this transaction.");
      return;
    }
    setEditingId(tx.id);
    setForm({
      title: tx.title,
      amount: String(tx.amount),
      type: tx.type,
      date: tx.date,
      wallet: tx.wallet || 'main',
      destinationWallet: tx.destinationWallet || '',
      category: tx.category || '',
      note: tx.note || '',
      updateWallets: tx.postingMode !== 'history-only',
    });
    setView('form');
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({
      title: '', amount: '', type: 'expense',
      date: new Date().toISOString().split('T')[0],
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
            <form onSubmit={handleSave} className="space-y-4">
              {!isWalletTransfer && <>
                <div className="grid grid-cols-3 gap-2 bg-surface-lowest p-1.5 rounded-xl border border-inverse/[0.05]">
                {['expense', 'income', 'transfer'].map(t => (
                  <button key={t} type="button" aria-pressed={form.type === t} onClick={() => setForm({...form, type: t as any})} className={`min-h-11 py-2 text-[10px] font-bold uppercase rounded-lg transition ${form.type === t ? (t === 'income' ? 'chip-emerald' : t === 'expense' ? 'bg-fill-strong text-primary' : 'chip-blue') : 'text-faint hover:bg-inverse/[0.02]'}`}>
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
                  <select id={`${formId}-from`} aria-describedby={isWalletTransfer ? `${formId}-from-balance` : undefined} required value={form.wallet} onChange={e => setForm({...form, wallet: e.target.value, destinationWallet: isWalletTransfer && e.target.value === form.destinationWallet ? '' : form.destinationWallet})} className="min-h-11 w-full min-w-0 bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500">
                    {customWallets.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                  </select>
                  {isWalletTransfer && <p id={`${formId}-from-balance`} className="mt-1.5 break-words text-[11px] text-muted">Balance: <span className="privacy-blur font-mono tabular-nums">{walletBalance(form.wallet)}</span></p>}
                </div>
                {form.type === 'transfer' && (
                  <div className="min-w-0">
                    <label htmlFor={`${formId}-to`} className="text-[10px] text-faint uppercase font-semibold mb-1 block">{isWalletTransfer ? 'To' : 'To Wallet'}</label>
                    <select id={`${formId}-to`} aria-describedby={isWalletTransfer ? `${formId}-to-balance` : undefined} required value={form.destinationWallet} onChange={e => setForm({...form, destinationWallet: e.target.value})} className="min-h-11 w-full min-w-0 bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500">
                      <option value="" disabled>Select...</option>
                      {customWallets.filter(w => !isWalletTransfer || w.id !== form.wallet).map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
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
                <button type="button" onClick={() => isWalletTransfer ? onClose() : setView('list')} className="flex-1 py-3 bg-inverse/[0.05] hover:bg-inverse/[0.1] text-xs font-semibold rounded-xl transition">Cancel</button>
                <button type="submit" className={isWalletTransfer ? `${entryDialogStyles.primary} flex-1` : 'flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-emerald-900/20'}>{isWalletTransfer ? 'Transfer' : editingId ? 'Update' : 'Save'}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
};
