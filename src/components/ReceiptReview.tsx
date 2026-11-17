import { useId, useState } from 'react';
import type { ScanResult } from '../hooks/useExpenseScanner';
import { isValidDateKey } from '../utils/dateHelpers';
import { formatPHP } from '../utils/currency';
import { entryDialogStyles } from './ui/dialogStyles';

export interface ReceiptTransferDraft {
  amount: string;
  fee: string;
  date: string;
  source: string;
  destination: string;
}
interface Props {
  result: ScanResult;
  onCancel: () => void;
  onExpense: (result: ScanResult, fee: number) => void;
  onTransfer?: (draft: ReceiptTransferDraft) => void;
}
export function ReceiptReview({ result, onCancel, onExpense, onTransfer }: Props) {
  const id = useId();
  const [kind, setKind] = useState<'expense' | 'transfer' | ''>('');
  const [amount, setAmount] = useState(result.amount);
  const [fee, setFee] = useState(result.review?.fee == null ? '' : String(result.review.fee));
  const [date, setDate] = useState(result.review?.dateKnown ? result.date : '');
  const [error, setError] = useState('');
  const money = (text: string) => /^\d+(?:\.\d{1,2})?$/.test(text) && Number(text) <= 10_000_000;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!kind) { setError('Choose expense/payment or a transfer between your wallets.'); return; }
    if (!money(amount) || Number(amount) <= 0 || !money(fee) || !isValidDateKey(date)) {
      setError('Check the amount, fee and payment date. Enter 0 if there was no fee.'); return;
    }
    if (kind === 'transfer') {
      if (!onTransfer) { setError('Open Wallets → Transfer to record this between your wallets.'); return; }
      onTransfer({ amount, fee, date, source: result.review?.source ?? '', destination: result.review?.destination ?? '' });
    } else onExpense({ ...result, amount, date }, Number(fee));
  };
  return <form aria-labelledby={`${id}-title`} noValidate onSubmit={submit} className="space-y-4">
    <h2 id={`${id}-title`} className="text-sm font-semibold text-strong">Review receipt</h2>
    <p className="text-xs text-muted">{result.review?.kind === 'transfer' ? 'This looks like a money transfer. ' : ''}A payment to someone else is an expense. Choose a transfer only if both wallets belong to you.</p>
    <p className="break-words text-sm font-medium text-primary privacy-blur">{result.merchant || 'Receipt'}{result.review?.source || result.review?.destination ? ` · ${result.review.source || '?'} → ${result.review.destination || '?'}` : ''}</p>
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Receipt type">
      <button type="button" aria-pressed={kind === 'expense'} onClick={() => { setKind('expense'); setError(''); }} className={`min-h-11 rounded-xl border p-3 text-xs font-medium ${kind === 'expense' ? 'border-strong bg-fill-strong text-strong' : 'border-subtle text-muted'}`}>Expense / payment</button>
      <button type="button" aria-pressed={kind === 'transfer'} onClick={() => { setKind('transfer'); setError(''); }} className={`min-h-11 rounded-xl border p-3 text-xs font-medium ${kind === 'transfer' ? 'border-strong bg-fill-strong text-strong' : 'border-subtle text-muted'}`}>Between my wallets</button>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs text-muted">Amount before fee (₱)<input aria-label="Receipt amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-strong bg-surface-input px-3 text-primary" /></label>
      <label className="text-xs text-muted">Fee (₱)<input aria-label="Receipt fee" type="number" inputMode="decimal" min="0" step="0.01" value={fee} placeholder="0 if none" onChange={event => setFee(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-strong bg-surface-input px-3 text-primary" /></label>
      <label className="col-span-2 text-xs text-muted">Payment date<input aria-label="Receipt payment date" type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-strong bg-surface-input px-3 text-primary" /></label>
    </div>
    {fee === '' && <p className="text-xs text-muted">The fee wasn’t readable. Check your receipt and enter 0 if there was no fee.</p>}
    {money(amount) && money(fee) && <p className="text-xs text-muted">Total deducted: <span className="privacy-blur font-mono">{formatPHP((Math.round(Number(amount) * 100) + Math.round(Number(fee) * 100)) / 100)}</span></p>}
    {error && <p role="alert" className="text-xs text-primary">{error}</p>}
    <p className="text-xs text-muted">Nothing is saved yet. You’ll choose the wallet and confirm on the next screen.</p>
    <div className="flex gap-2"><button type="button" onClick={onCancel} className="min-h-11 flex-1 rounded-xl bg-fill text-xs font-semibold text-primary">Cancel</button><button type="submit" className={`${entryDialogStyles.primary} flex-1`}>Continue</button></div>
  </form>;
}
