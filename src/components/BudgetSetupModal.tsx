import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Wallet, X } from 'lucide-react';
import type { BudgetCashPlan, FinanceTransitionCommitter, MonthlyBudget, UnifiedFinanceData } from '../types/finance';
import { applyMonthlyBudget, BUDGET_CATEGORIES, budgetCash, budgetDateKey, budgetDays, budgetMonthRange, calculateCashGuidance, effectiveBudget, isMonthlyBudget, readBudgetSpending, readDailyBudget } from '../utils/budgeting';
import { expenseCents } from '../utils/expenseChanges';
import { isValidDateKey, parseDateKey } from '../utils/dateHelpers';
import { readWalletSavings } from '../utils/walletSavings';
import { formatPHP } from '../utils/currency';
import { Modal } from './ui/Modal';
import { entryDialogStyles } from './ui/dialogStyles';
import { useBudgetDate } from '../hooks/useBudgetDate';

interface Props {
  data: UnifiedFinanceData; month: string; unpaidCommitments: number;
  commitTransition?: FinanceTransitionCommitter; onSaved: (message: string) => void; onClose: () => void;
}
const STEPS = ['Your money', 'Your dates', 'Daily needs', 'Payments', 'Savings', 'Your plan'];
export function BudgetSetupModal({ data, month, unpaidCommitments, commitTransition, onSaved, onClose }: Props) {
  const id = useId(); const today = useBudgetDate();
  const budget = effectiveBudget(data, month).budget;
  const allCash = budgetCash(data);
  const [step, setStep] = useState(0);
  const [manual, setManual] = useState(false);
  const [limit, setLimit] = useState(budget ? String(budget.limit) : '');
  const [categories, setCategories] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(budget?.categoryLimits ?? {}).map(([key, value]) => [key, String(value)])));
  const dates = budget?.cashPlan ?? budgetMonthRange(month);
  const [walletIds, setWalletIds] = useState(budget?.cashPlan?.walletIds ?? allCash.wallets.map(wallet => wallet.id));
  const [startDate, setStartDate] = useState(dates.startDate);
  const [endDate, setEndDate] = useState(dates.endDate);
  const [essentials, setEssentials] = useState(budget?.cashPlan ? String(budget.cashPlan.dailyEssentials) : '');
  const [commitments, setCommitments] = useState(String(budget?.cashPlan?.commitmentsReserve ?? 0));
  const [savings, setSavings] = useState(String(budget?.cashPlan?.savingsTarget ?? 0));
  const [cushion, setCushion] = useState(String(budget?.cashPlan?.cushion ?? 0));
  const [rollover, setRollover] = useState(budget?.rollover ?? true);
  const [cashPlan, setCashPlan] = useState<BudgetCashPlan>();
  const [proposal, setProposal] = useState<ReturnType<typeof calculateCashGuidance>>(null);
  const [error, setError] = useState('');
  const expected = useRef(data.settings?.monthlyBudgets?.[month]);
  const reviewed = useRef<{ wallets: string; spending: string; day: string } | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step, manual]);
  const selectedCash = budgetCash(data, walletIds);
  const inputClass = 'min-h-11 w-full min-w-0 rounded-xl border border-subtle bg-surface-input px-3 text-base text-primary';
  const change = () => { setProposal(null); reviewed.current = undefined; setCashPlan(undefined); setError(''); };
  const fingerprint = (current: UnifiedFinanceData, plan: BudgetCashPlan) => ({
    day: budgetDateKey(),
    wallets: JSON.stringify(plan.walletIds.map(wallet => [wallet, current.wallets[wallet], current.settings?.walletSavings?.[wallet]])),
    spending: JSON.stringify(readBudgetSpending(current, month, { ...plan, walletIds: plan.walletIds })),
  });
  const save = (next: MonthlyBudget | undefined) => {
    if (!commitTransition) { setError('Budget saving is unavailable until your account is ready.'); return; }
    const result = commitTransition(prev => {
      if (next?.cashPlan && reviewed.current) {
        const current = fingerprint(prev, next.cashPlan);
        if (current.wallets !== reviewed.current.wallets || current.spending !== reviewed.current.spending || current.day !== reviewed.current.day) return { ok: false as const, data: prev, error: 'Cash, spending or the day changed. Recalculate the plan before saving.' };
      }
      return applyMonthlyBudget(prev, month, next, expected.current);
    });
    if (!result.ok) { setError(result.error || 'The budget could not be saved.'); return; }
    onSaved(next ? `Budget saved for ${month}.` : `Budget removed for ${month}.`); onClose();
  };
  const calculate = () => {
    setError('');
    if (!walletIds.length || !startDate || !endDate || essentials.trim() === '') { setError('Choose wallets, dates, and your usual daily essentials first. Enter 0 if none.'); return false; }
    const today = budgetDateKey();
    const from = today > startDate ? today : startDate;
    const cash = budgetCash(data, walletIds);
    const result = calculateCashGuidance(cash.available, budgetDays(from, endDate), Number(essentials), Number(commitments), Number(savings), Number(cushion));
    if (!result || cash.needsReview || startDate > endDate) { setError('Review wallet balances, dates and amounts. Choose a period of up to one year that has not ended.'); return false; }
    setProposal(result);
    if (result.shortfall > 0) { setError(`Your estimates exceed available cash by ${formatPHP(result.shortfall)}. Adjust savings, the period, or flexible spending.`); return false; }
    const spent = readBudgetSpending(data, month, { startDate, endDate, walletIds });
    if (spent.excluded) { setError('Some spending records need review before a cash-based plan can be calculated. Go back to Your money and choose Enter a manual limit if needed.'); return false; }
    const nextCashPlan: BudgetCashPlan = { walletIds, startDate, endDate, dailyEssentials: Number(essentials), savingsTarget: Number(savings), commitmentsReserve: Number(commitments), cushion: Number(cushion),
      baselineSpent: spent.spent, baselineCommitments: spent.byCategory.Commitments,
      baselineDailyFlexible: Object.fromEntries(Object.entries(spent.byDay).map(([day, entry]) => [day, Math.round((entry.spent - entry.commitments) * 100) / 100])) };
    // Keep the chosen reporting dates, but pace available cash from the review day onward.
    nextCashPlan.pacingStartDate = from;
    const baseline = spent;
    setLimit(String(Math.round((baseline.spent + result.spendingLimit) * 100) / 100));
    setCashPlan(nextCashPlan); reviewed.current = fingerprint(data, nextCashPlan);
    setCategories(current => ({ ...current, Commitments: String(Math.round((baseline.byCategory.Commitments + Number(commitments)) * 100) / 100) }));
    return true;
  };
  const datesValid = isValidDateKey(startDate) && isValidDateKey(endDate);
  const dateIssue = !datesValid ? 'Choose a valid start date and end date.'
    : startDate > endDate ? 'End date comes before start date. Move the end later, or correct the start date.'
    : endDate < today ? 'This period has already ended. Choose today or a later end date.'
    : budgetDays(startDate, endDate) > 366 ? 'Choose a period of up to 366 days.' : '';
  const dateLabel = (date: string) => parseDateKey(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const advance = () => {
    setError('');
    if (step === 0 && (!walletIds.length || selectedCash.needsReview)) { setError('Choose at least one available wallet. Review any flagged balance or Savings amount in Wallets first.'); return; }
    if (step === 1 && dateIssue) return;
    if (step === 2 && (essentials.trim() === '' || expenseCents(Number(essentials)) === null)) { setError('Enter your daily essentials, or 0 if none, with at most two decimal places.'); return; }
    if (step === 3 && expenseCents(Number(commitments)) === null) { setError('Enter a nonnegative payment reserve with at most two decimal places.'); return; }
    if (step === 4 && !calculate()) return;
    setStep(current => current + 1);
  };
  const manualLimit = () => { setManual(true); setError(''); setProposal(null); setCashPlan(budget?.cashPlan); reviewed.current = undefined; };
  const draft: MonthlyBudget = { limit: Number(limit), rollover, ...(cashPlan ? { cashPlan } : {}), categoryLimits: Object.fromEntries(Object.entries(categories).filter(([, amount]) => amount.trim() !== '').map(([category, amount]) => [category, Number(amount)])) };
  const preview = isMonthlyBudget(draft) ? readDailyBudget(data, month, draft, today) : undefined;
  const periodDays = budgetDays(today > startDate ? today : startDate, endDate);
  const moneyInput = (key: string, label: string, value: string, setter: React.Dispatch<React.SetStateAction<string>>) => <div>
    <label htmlFor={`${id}-${key}`} className="mb-2 block text-xs font-semibold text-primary">{label}</label>
    <div className="relative"><span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg text-faint">₱</span><input id={`${id}-${key}`} type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={event => { setter(event.target.value); change(); }} placeholder="0.00" className={entryDialogStyles.amount} /></div>
  </div>;
  const limitFields = <>
    <label htmlFor={`${id}-limit`} className="mb-1 block text-xs text-primary">Period spending limit (₱)</label><input id={`${id}-limit`} required type="number" min="0" step="0.01" value={limit} onChange={event => { setLimit(event.target.value); setProposal(null); setError(''); }} className={inputClass} />
    <p className="my-2 text-xs text-muted">Category limits are optional and must fit inside the total. Leave a category blank to use the total only.</p>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">{BUDGET_CATEGORIES.map((category, index) => <div key={category} className="min-w-0"><label htmlFor={`${id}-category-${index}`} className="mb-1 block text-xs text-muted">{category} limit (₱)</label><input id={`${id}-category-${index}`} type="number" inputMode="decimal" min="0" step="0.01" value={categories[category] ?? ''} onChange={event => setCategories(current => ({ ...current, [category]: event.target.value }))} className={inputClass} /></div>)}</div>
  </>;
  const titles = ['Which money can you use?', 'How long should it last?', 'What do you need each day?', 'What payments must come first?', 'Want to set anything extra aside?', 'Here’s your spending guide'];
  const descriptions = ['Choose the wallets that cover everyday spending. Money already set aside as Savings is excluded.', 'Choose when this plan starts and the last day it needs to cover. A regular payday is optional.', 'Estimate food, transport and other everyday essentials. This helps check whether the plan is realistic.', 'Keep enough for unpaid bills and installments you expect to pay during these dates.', 'This is additional to Savings already set aside in Wallets. Enter 0 or leave blank if none.', 'Review your estimates. Saving a plan moves no money.'];
  return <Modal isOpen onClose={onClose} manageFocus initialFocusRef={heading} ariaLabel="Budget setup">
    <form aria-label="Budget setup questions" onSubmit={event => { event.preventDefault(); if (manual || step === 5) save(draft); else advance(); }} className={`${entryDialogStyles.card} max-w-lg !overflow-hidden flex min-h-0 flex-col gap-4`}>
      <header className="flex shrink-0 items-center justify-between gap-3"><div className="flex items-center gap-3"><span className={entryDialogStyles.icon}><Wallet size={18} /></span><div><p className="text-xs text-muted">Budget setup · {month}</p><p className="text-sm font-semibold text-primary">{manual ? 'Manual spending limit' : `Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}</p></div></div><button type="button" onClick={onClose} aria-label="Close budget setup" className={entryDialogStyles.close}><X size={18} /></button></header>
      {!manual && <ol aria-label="Budget setup progress" className="grid shrink-0 grid-cols-6 gap-1">{STEPS.map((title, index) => <li key={title} aria-label={title} aria-current={index === step ? 'step' : undefined} className={`h-1 rounded-full ${index <= step ? 'bg-[var(--bg-selection)]' : 'bg-fill'}`} />)}</ol>}
      <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain">
        <div><h2 ref={heading} tabIndex={-1} className="text-xl font-bold leading-snug text-primary outline-none">{manual ? 'Choose your spending limit' : titles[step]}</h2><p className="mt-2 text-sm leading-relaxed text-muted">{manual ? (cashPlan ? 'Adjust the limit and optional category caps. Your saved cash-plan dates, reserves and savings target stay attached.' : 'Use this option if you already know your limit. It does not calculate a cash-based plan.') : descriptions[step]}</p></div>
        {manual ? limitFields : <>
          {step === 0 && <>
            <div className="rounded-2xl bg-fill p-4"><p className="text-xs text-muted">Selected cash available after Savings</p><p className="privacy-blur mt-1 break-words font-mono text-3xl font-bold text-primary">{formatPHP(selectedCash.available)}</p></div>
            <fieldset className="space-y-2"><legend className="mb-2 text-xs font-semibold text-primary">Spending wallets</legend>{allCash.wallets.map(wallet => <label key={wallet.id} className="flex min-h-14 min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-subtle p-3 text-sm text-primary"><span className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={walletIds.includes(wallet.id)} onChange={event => { setWalletIds(current => event.target.checked ? [...current, wallet.id] : current.filter(value => value !== wallet.id)); change(); }} /><span className="privacy-blur min-w-0 break-words">{wallet.label}</span></span><span className="privacy-blur break-all font-mono text-xs">{formatPHP(readWalletSavings(data, wallet.id).available)}</span></label>)}</fieldset>
            {!allCash.wallets.length && <p className="text-sm text-warning">Add a wallet and its current balance in Wallets first, or enter a manual limit below.</p>}
            <p className="text-xs text-muted">Expected income stays separate until received. If a balance is out of date, update it in Wallets first.</p>
            <details><summary className="min-h-11 cursor-pointer content-center text-xs text-muted">Already know your spending limit?</summary><button type="button" onClick={manualLimit} className="min-h-11 rounded-xl bg-fill px-3 text-sm font-semibold text-primary">Enter a manual limit</button></details>
          </>}
          {step === 1 && <>
            <label htmlFor={`${id}-start`} className="block text-sm font-semibold text-primary">Start date</label><input id={`${id}-start`} type="date" required value={startDate} onChange={event => { setStartDate(event.target.value); change(); }} aria-describedby={`${id}-date-help${dateIssue ? ` ${id}-date-error` : ''}`} aria-invalid={!isValidDateKey(startDate)} className={inputClass} />
            <label htmlFor={`${id}-end`} className="block text-sm font-semibold text-primary">End date</label><input id={`${id}-end`} type="date" required value={endDate} onChange={event => { setEndDate(event.target.value); change(); }} aria-describedby={`${id}-date-help${dateIssue ? ` ${id}-date-error` : ''}`} aria-invalid={Boolean(dateIssue)} className={inputClass} />
            {datesValid && <div role="status" aria-label="Selected budget dates" className="rounded-xl bg-fill p-3 text-sm text-primary"><p>Starts {dateLabel(startDate)}</p><p>Ends {dateLabel(endDate)}</p>{!dateIssue && <p className="mt-1 text-xs text-muted">{budgetDays(startDate, endDate)} {budgetDays(startDate, endDate) === 1 ? 'day' : 'days'} in this period</p>}</div>}
            <p id={`${id}-date-help`} className="text-xs text-muted">Choose the start first, then the last day this money must cover. Daily guidance begins today, or on your start date if later.</p>
            {dateIssue && <p id={`${id}-date-error`} role="alert" className="rounded-xl bg-fill p-3 text-sm text-negative">{dateIssue}</p>}
          </>}
          {step === 2 && <>{moneyInput('essentials', 'Usual daily essentials (₱)', essentials, setEssentials)}<p className="text-xs text-muted">An estimate is fine. Enter 0 if you have no daily essentials to budget for.</p></>}
          {step === 3 && <>{moneyInput('commitments', 'Upcoming payments to reserve (₱)', commitments, setCommitments)}<div className="rounded-xl bg-fill p-3"><p className="privacy-blur text-xs text-muted">Your {month} view lists {formatPHP(unpaidCommitments)} in unpaid commitments across wallets. Check which ones belong in this period before using that amount.</p><button type="button" disabled={expenseCents(unpaidCommitments) === null} onClick={() => { setCommitments(String(unpaidCommitments)); change(); }} className="mt-2 min-h-11 rounded-xl px-3 text-sm font-semibold text-primary">Use listed unpaid amount</button></div><p className="text-xs text-muted">Already-paid items are reflected in your balances. Enter 0 if no upcoming payments need a reserve.</p></>}
          {step === 4 && <>{moneyInput('savings', 'Extra savings target (₱)', savings, setSavings)}<details open={Number(cushion) > 0}><summary className="min-h-11 cursor-pointer content-center text-sm text-primary">Optional cushion for surprises</summary>{moneyInput('cushion', 'Extra cushion (₱)', cushion, setCushion)}<p className="mt-2 text-xs text-muted">Keep this amount outside your daily spending allowance.</p></details></>}
          {step === 5 && <>
            <div className="rounded-2xl bg-fill p-4 text-center"><p className="text-xs text-muted">{proposal ? 'Starting daily spending guide' : 'Daily allowance after your adjustments'}</p><p className="privacy-blur mt-2 break-words font-mono text-3xl font-bold text-positive">{formatPHP(proposal?.dailyAllowance ?? preview?.todayCap ?? 0)}</p><p className="mt-2 text-xs text-muted">For food, transport and everyday extras. Unused allowance can carry into later days.</p></div>
            <dl className="space-y-2 text-xs">{[['Cash after Wallet Savings', formatPHP(selectedCash.available)], ['Upcoming payments reserved', formatPHP(Number(commitments))], ['Extra savings target', formatPHP(Number(savings))], ['Cushion', formatPHP(Number(cushion))], ['Days covered from review day', String(periodDays)], ['Period spending limit', formatPHP(Number(limit))]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt className="text-muted">{label}</dt><dd className="privacy-blur font-mono text-primary">{value}</dd></div>)}</dl>
            <details><summary className="min-h-11 cursor-pointer content-center text-sm text-primary">How the guide is calculated</summary>
            {proposal && <p className="privacy-blur text-xs text-muted">Potential savings before optional spending: {formatPHP(proposal.affordableSavings)}</p>}
            <p className="text-xs leading-relaxed text-muted">Daily guide = (available cash − payments − extra savings − cushion) ÷ days. Expenses, dated commitment payments and transfer fees count as spending. Transfers between your own wallets do not.</p>
            </details>
            <details><summary className="min-h-11 cursor-pointer content-center text-sm text-primary">Adjust spending and category limits</summary>{limitFields}</details>
            <button type="button" onClick={calculate} className="min-h-11 rounded-xl bg-fill px-3 text-xs font-semibold text-primary">Recalculate plan</button>
          </>}
        </>}
        {(manual || step === 5) && <><label className="flex min-h-11 items-center gap-2 text-xs text-primary"><input type="checkbox" checked={rollover} onChange={event => setRollover(event.target.checked)} />Carry unused allowance into the next month</label>{expected.current != null && <button type="button" onClick={() => save(undefined)} className="min-h-11 rounded-xl px-3 text-xs text-negative">Remove budget</button>}</>}
        {error && <p role="alert" className="rounded-xl bg-fill p-3 text-sm text-negative">{error}</p>}
      </div>
      <footer className="flex shrink-0 flex-wrap gap-2 border-t border-subtle pt-3">
        {manual || step > 0 ? <button type="button" onClick={() => { setError(''); if (manual) { setManual(false); setStep(0); } else setStep(current => current - 1); }} className="flex min-h-11 items-center gap-1 rounded-xl bg-fill px-4 text-sm font-semibold text-primary"><ArrowLeft size={16} />Back</button> : <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-fill px-4 text-sm text-primary">Cancel</button>}
        <button type="submit" disabled={!commitTransition || ((manual || step === 5) && (!limit || (!manual && !cashPlan)))} className={`${entryDialogStyles.primary} min-w-0 flex-1`}>{manual || step === 5 ? <><Check size={16} />Save budget</> : <>Continue<ArrowRight size={16} /></>}</button>
      </footer>
    </form>
  </Modal>;
}
