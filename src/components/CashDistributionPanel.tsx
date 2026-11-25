import { getDefaultTransferWallets } from "../utils/financeHelpers";
import React, { useId, useRef, useState } from 'react';
import type { FinanceTransitionCommitter, ReceivedIncomeDraft, UnifiedFinanceData } from '../types/finance';
import { applyBudgetDistribution } from '../utils/budgetDistribution';
import { budgetCash } from '../utils/budgeting';
import { expenseCents } from '../utils/expenseChanges';
import { formatPHP } from '../utils/currency';
import { generateId } from '../utils/idHelpers';
import { entryDialogStyles } from './ui/dialogStyles';

interface Props {
  data: UnifiedFinanceData;
  commitTransition?: FinanceTransitionCommitter;
  onSaved: (message: string) => void;
  initialReceipt?: ReceivedIncomeDraft;
  suggestedAllocations?: Record<string, number>;
}
export function CashDistributionPanel({ data, commitTransition, onSaved, initialReceipt, suggestedAllocations }: Props) {
  const formId = useId();
  const cash = budgetCash(data);
  const defaults = getDefaultTransferWallets(data.settings);
  const [receiptContext, setReceiptContext] = useState(initialReceipt);
  const [mode, setMode] = useState<'existing' | 'received'>('existing');
  const [source, setSource] = useState(initialReceipt?.wallet ?? (cash.wallets.some(wallet => wallet.id === defaults.wallet) ? defaults.wallet : cash.wallets[0]?.id ?? ''));
  const [amount, setAmount] = useState(initialReceipt ? String(initialReceipt.amount) : '');
  const [name, setName] = useState(initialReceipt?.name ?? '');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [destination, setDestination] = useState(cash.wallets.some(wallet => wallet.id === defaults.destinationWallet) ? defaults.destinationWallet : cash.wallets.find(wallet => wallet.id !== source)?.id ?? source);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const executionId = useRef(generateId('budget-distribution'));
  const busy = useRef(false);
  const amountCents = expenseCents(Number(amount));
  const parts = Object.values(allocations).map(value => value.trim() ? expenseCents(Number(value)) : 0);
  const validParts = parts.every(value => value !== null);
  const allocatedCents = validParts ? (parts as number[]).reduce((sum, value) => sum + value, 0) : NaN;
  const unassigned = amountCents === null || !Number.isSafeInteger(allocatedCents) ? NaN : (amountCents - allocatedCents) / 100;
  const inputClass = 'min-h-11 w-full min-w-0 rounded-xl border border-subtle bg-surface-input px-3 text-base text-primary sm:text-sm';
  const canDistribute = amountCents !== null && amountCents > 0 && unassigned === 0 && Boolean(source) && !done && Boolean(commitTransition);
  const execute = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current || done || !commitTransition) return;
    setError(''); busy.current = true;
    try {
      const outcome = commitTransition(prev => applyBudgetDistribution(prev, {
        id: executionId.current, mode, sourceWallet: source, amount: Number(amount), name,
        allocations: Object.fromEntries(Object.entries(allocations).map(([wallet, value]) => [wallet, value.trim() ? Number(value) : 0])),
        ...(receiptContext ? { receipt: receiptContext } : {}),
      }, data.wallets));
      if (!outcome.ok) { setError(outcome.error || 'Distribution failed.'); return; }
      setDone(true); onSaved(mode === 'received' ? 'Income recorded and allocated. Unassigned: ₱0.00.' : 'Cash allocated. Unassigned: ₱0.00.');
    } finally { busy.current = false; }
  };
  return <form aria-label="Distribute money" onSubmit={execute} className="space-y-4">
    <p className="text-xs leading-relaxed text-muted">Allocate an actual amount. Every peso needs a destination, including money you keep in the source wallet.</p>
    {receiptContext && <p role="status" className="rounded-xl bg-fill p-3 text-xs text-primary">This receipt is already in your wallet. This step only moves existing cash.</p>}
    <fieldset disabled={done} className="min-w-0 space-y-3">
      <div><label htmlFor={`${formId}-mode`} className="mb-1 block text-xs text-muted">Which money are you allocating?</label>
        <select id={`${formId}-mode`} disabled={Boolean(receiptContext)} className={inputClass} value={mode} onChange={event => { setMode(event.target.value as typeof mode); setError(''); }}>
          <option value="existing">Money already in a wallet</option><option value="received">New income received — not logged yet</option>
        </select>
      </div>
      {mode === 'received' && <div><label htmlFor={`${formId}-name`} className="mb-1 block text-xs text-muted">Where did the income come from?</label>
        <input id={`${formId}-name`} required value={name} onChange={event => setName(event.target.value)} className={inputClass} placeholder="Client payment, sale, or salary" />
        <p className="mt-1 text-[11px] text-muted">Records a received inflow today. Use existing money if you already logged it.</p>
      </div>}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label htmlFor={`${formId}-source`} className="mb-1 block text-xs text-muted">{mode === 'received' ? 'Receive into' : 'From wallet'}</label>
          <select id={`${formId}-source`} disabled={Boolean(receiptContext)} required className={inputClass} value={source} onChange={event => setSource(event.target.value)}>
            <option value="">Choose a wallet</option>{cash.wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.label}</option>)}
          </select><p className="privacy-blur mt-1 break-words text-xs text-muted">Current balance: {formatPHP(cash.wallets.find(wallet => wallet.id === source)?.balance ?? 0)}</p>
        </div>
        <div><label htmlFor={`${formId}-amount`} className="mb-1 block text-xs text-muted">{mode === 'received' ? 'Amount received (₱)' : 'Amount to allocate (₱)'}</label>
          <input id={`${formId}-amount`} required type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className={inputClass} />
        </div>
      </div>
      {mode === 'received' && (data.settings?.perPayoutSalary ?? 0) > 0 && <button type="button" onClick={() => {
        setAmount(String(data.settings!.perPayoutSalary)); setName('Salary');
        setAllocations(Object.fromEntries(Object.entries(suggestedAllocations ?? {}).map(([wallet, value]) => [wallet, String(value)])));
      }} className="min-h-11 rounded-lg bg-fill px-3 text-xs text-primary">Use regular pay settings</button>}
      <fieldset className="min-w-0 space-y-2"><legend className="mb-2 text-xs font-semibold text-primary">Where should it go?</legend>
        {!cash.wallets.length && <p className="text-xs text-warning">Add a wallet and set its current balance in Wallets first.</p>}
        {cash.wallets.map((wallet, index) => <div key={wallet.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
          <label htmlFor={`${formId}-wallet-${index}`} className="min-w-0 break-words text-xs text-primary">{wallet.label}{wallet.id === source && <span className="block text-[11px] text-muted">Keep here</span>}</label>
          <input id={`${formId}-wallet-${index}`} aria-label={`Allocate to ${wallet.label}`} className={inputClass} type="number" min="0" step="0.01" value={allocations[wallet.id] ?? ''} onChange={event => setAllocations(current => ({ ...current, [wallet.id]: event.target.value }))} />
        </div>)}
      </fieldset>
      {Number.isFinite(unassigned) && unassigned > 0 && <div className="flex min-w-0 flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1"><label htmlFor={`${formId}-remainder`} className="mb-1 block text-xs text-muted">Put the remainder in</label>
          <select id={`${formId}-remainder`} className={inputClass} value={destination} onChange={event => setDestination(event.target.value)}>
            <option value="">Choose a wallet</option>{cash.wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.label}</option>)}
          </select>
        </div>
        <button type="button" disabled={!destination} onClick={() => setAllocations(current => ({ ...current, [destination]: String((Math.round((Number(current[destination]) || 0) * 100) + Math.round(unassigned * 100)) / 100) }))}
          className="min-h-11 rounded-xl bg-fill px-3 text-xs font-semibold text-primary disabled:opacity-50">Assign remainder</button>
      </div>}
    </fieldset>
    <div role="status" aria-live="polite" className="rounded-xl border border-subtle bg-surface-low p-3 text-xs">
      <div className="flex flex-wrap justify-between gap-2"><span>Total allocated</span><span className="privacy-blur font-mono">{Number.isFinite(allocatedCents) ? formatPHP(allocatedCents / 100) : 'Review amounts'}</span></div>
      <div className={`mt-2 flex flex-wrap justify-between gap-2 font-semibold ${unassigned === 0 && amountCents ? 'text-positive' : 'text-warning'}`}><span>{unassigned < 0 ? 'Overallocated' : 'Unassigned'}</span><span className="privacy-blur font-mono">{Number.isFinite(unassigned) ? formatPHP(Math.abs(unassigned)) : 'Review amounts'}</span></div>
      {unassigned !== 0 && <p className="mt-2 text-muted">Assign the remainder or reduce allocations until Unassigned is ₱0.00.</p>}
    </div>
    {error && <p role="alert" className="text-xs text-negative">{error}</p>}
    {done ? <div className="space-y-2"><p role="status" className="text-sm font-semibold text-positive">Distribution recorded. Unassigned: ₱0.00.</p><button type="button" onClick={() => {
      executionId.current = generateId('budget-distribution'); setDone(false); setReceiptContext(undefined); setAmount(''); setAllocations({}); setName(''); setError('');
    }} className={entryDialogStyles.primary}>New allocation</button></div> : <button data-guide-target="payday-save" type="submit" disabled={!canDistribute} className={`${entryDialogStyles.primary} w-full`}>{mode === 'received' ? 'Record income & distribute' : 'Distribute existing cash'}</button>}
    <p className="text-[11px] leading-relaxed text-muted">Records tracking entries here; use your bank or wallet app for actual money transfers. Income is only added in the “New income received” flow.</p>
  </form>;
}
