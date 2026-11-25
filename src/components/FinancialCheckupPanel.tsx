import { useBudgetDate } from "../hooks/useBudgetDate";
import React, { useId, useRef, useState } from 'react';
import type { FinanceTransitionCommitter, UnifiedFinanceData } from '../types/finance';
import { applyEmergencyFundGoal, readFinancialCheckup } from '../utils/financialCheckup';
import { enabledSavingsWalletIds, readWalletSavings } from '../utils/walletSavings';
import { validateActiveWalletAssignment } from '../utils/financeHelpers';
import { formatPHP } from '../utils/currency';
import { entryDialogStyles } from './ui/dialogStyles';

interface Props {
  data: UnifiedFinanceData; month: string; unpaidCommitments: number;
  commitTransition?: FinanceTransitionCommitter; onSaved: (message: string) => void;
  onBuildBudget: () => void; onConfigureSavings?: () => void;
}
export function FinancialCheckupPanel({ data, month, unpaidCommitments, commitTransition, onSaved, onBuildBudget, onConfigureSavings }: Props) {
  const id = useId();
  const today = useBudgetDate();
  const report = readFinancialCheckup(data, month, unpaidCommitments, today);
  const fund = report.emergency;
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState('');
  const [walletIds, setWalletIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const expected = useRef<unknown>(undefined);
  const opener = useRef<HTMLButtonElement>(null);
  const enabled = enabledSavingsWalletIds(data.settings);
  const wallets = (data.settings?.customWallets ?? []).filter(wallet => enabled.includes(wallet.id) && validateActiveWalletAssignment(wallet.id, data.settings, data.wallets).ok);
  const open = () => {
    expected.current = data.settings?.emergencyFundGoal;
    setTarget(fund.goal ? String(fund.goal.target) : '');
    setWalletIds(fund.goal?.walletIds ?? (wallets.length === 1 ? [wallets[0].id] : []));
    setError(''); setEditing(true);
  };
  const close = () => { setEditing(false); setError(''); requestAnimationFrame(() => opener.current?.focus()); };
  const save = (remove = false) => {
    if (!commitTransition) { setError('Goal saving is unavailable until your account is ready.'); return; }
    const result = commitTransition(prev => applyEmergencyFundGoal(prev, remove ? null : { target: Number(target), walletIds }, expected.current));
    if (!result.ok) { setError(result.error || 'The goal could not be saved.'); return; }
    close(); onSaved(remove ? 'Emergency-fund goal removed. Savings is unchanged.' : 'Emergency-fund goal saved. No money was moved.');
  };
  const daily = report.daily;
  const guideActive = daily && !daily.ended && !daily.future;
  const fields = [
    ['Available after Savings (active wallets, now)', formatPHP(report.cash.available)],
    [`Unpaid commitments (${month} view)`, report.unpaid === null ? 'Needs review' : formatPHP(report.unpaid)],
    [report.afterCommitments !== null && report.afterCommitments < 0 ? 'Cash shortfall for those commitments' : 'Cash after those commitments', report.afterCommitments === null ? 'Needs review' : formatPHP(Math.abs(report.afterCommitments))],
    [`Recorded spending (${month})`, formatPHP(report.spending.spent)],
    [`Inflows received (${month})`, formatPHP(report.income.actual)],
    ['Left in today’s guide', guideActive ? formatPHP(daily.remainingToday) : 'Build or review your budget period'],
  ];
  return <section aria-label="Financial checkup" className="min-w-0 space-y-4">
    <div><h3 className="text-sm font-semibold text-primary">Your financial checkup</h3><p className="mt-1 text-xs leading-relaxed text-muted">Current cash, the selected view’s commitments, and recorded activity. Expected income stays separate until received.</p></div>
    <dl className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-fill p-3"><dt className="text-xs text-muted">{label}</dt><dd className="privacy-blur mt-1 break-words font-mono text-sm font-semibold text-primary">{value}</dd></div>)}</dl>
    {report.needsReview && <p role="status" className="text-xs text-warning">Some figures need review. Missing or unclear history is not treated as complete.</p>}
    <div className="rounded-xl border border-subtle p-3"><h4 className="text-xs font-semibold text-primary">Your next step</h4><p className="mt-1 text-xs leading-relaxed text-muted">{report.nextAction}</p><button type="button" onClick={onBuildBudget} className="mt-2 min-h-11 rounded-xl bg-fill px-3 text-xs font-semibold text-primary">Review my budget</button></div>
    <p className="text-xs leading-relaxed text-muted">Cash after commitments is before any extra savings target, cushion or daily needs. Daily guidance uses your plan’s own dates and wallets. Transfers between your wallets are not spending; their fees are included.</p>
    <section aria-labelledby={`${id}-goal`} className="min-w-0 space-y-3 rounded-xl border border-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 id={`${id}-goal`} className="text-sm font-semibold text-primary">Emergency fund (optional)</h3>{!editing && <button ref={opener} type="button" disabled={!commitTransition} onClick={open} className="min-h-11 rounded-xl bg-fill px-3 text-xs font-semibold text-primary disabled:opacity-50">{fund.goal ? 'Edit emergency goal' : 'Set emergency goal'}</button>}</div>
      <p className="text-xs leading-relaxed text-muted">Choose your own target and which Savings wallets count toward it. This tracks existing Savings rather than creating another balance.</p>
      {fund.goal && !editing && <>
        <p className="privacy-blur break-words font-mono text-sm text-primary">{formatPHP(fund.saved)} of {formatPHP(fund.goal.target)}</p>
        <progress aria-label="Emergency-fund goal progress" max={100} value={fund.percent ?? 0} className="h-2 w-full accent-current text-positive" />
        <p className="privacy-blur text-xs text-muted">{fund.reached ? 'Your chosen target is reached.' : `${formatPHP(fund.remaining ?? 0)} left to your target.`}</p>
        <p className="privacy-blur break-words text-xs text-muted">Wallets: {fund.goal.walletIds.map(walletId => data.settings?.customWallets?.find(wallet => wallet.id === walletId)?.label ?? `${walletId} (needs review)`).join(', ')}</p>
      </>}
      {!fund.goal && !editing && <p className="text-xs text-muted">No emergency-fund goal set. Your regular Savings still counts in Wallets.</p>}
      {fund.needsReview && <p role="status" className="text-xs text-warning">Review this goal’s Savings wallets before relying on its progress.</p>}
      {editing && <form aria-label="Emergency-fund goal" onSubmit={event => { event.preventDefault(); save(); }} className="space-y-3">
        <label className="block text-xs text-primary" htmlFor={`${id}-target`}>Emergency-fund target (₱)</label><input id={`${id}-target`} autoFocus type="number" inputMode="decimal" min="0.01" step="0.01" required value={target} onChange={event => { setTarget(event.target.value); setError(''); }} className="min-h-11 w-full min-w-0 rounded-xl border border-subtle bg-surface-input px-3 text-base text-primary" />
        <fieldset className="min-w-0"><legend className="mb-2 text-xs font-semibold text-primary">Use Savings from these wallets</legend>{wallets.map(wallet => <label key={wallet.id} className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1 text-xs text-primary"><input type="checkbox" checked={walletIds.includes(wallet.id)} onChange={event => setWalletIds(current => event.target.checked ? [...current, wallet.id] : current.filter(value => value !== wallet.id))} /><span className="privacy-blur min-w-0 break-words">{wallet.label} · Savings {formatPHP(readWalletSavings(data, wallet.id).savings ?? 0)}</span></label>)}{!wallets.length && <p className="text-xs text-muted">Enable a Savings wallet in Settings → Wallet Defaults first. You can set its Savings amount in Wallets afterward.</p>}</fieldset>
        {onConfigureSavings && <button type="button" onClick={onConfigureSavings} className="min-h-11 rounded-lg bg-fill px-3 text-xs text-primary">Choose Savings wallets in Settings</button>}
        {error && <p role="alert" className="text-xs text-negative">{error}</p>}
        <div className="flex flex-wrap gap-2"><button type="submit" className={`${entryDialogStyles.primary} flex-1`}>Save emergency goal</button><button type="button" onClick={close} className="min-h-11 rounded-lg bg-fill px-3 text-xs text-primary">Cancel goal edit</button>{data.settings?.emergencyFundGoal != null && <button type="button" onClick={() => save(true)} className="min-h-11 rounded-lg px-3 text-xs text-negative">Remove emergency goal</button>}</div>
      </form>}
    </section>
  </section>;
}
