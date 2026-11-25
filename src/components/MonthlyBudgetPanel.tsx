import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { BudgetCashPlan, FinanceTransitionCommitter, MonthlyBudget, UnifiedFinanceData } from '../types/finance';
import { applyMonthlyBudget, BUDGET_CATEGORIES, isMonthlyBudget, readBudgetSpending, budgetCash, budgetDateKey, budgetDays, budgetMonthRange, calculateCashGuidance, effectiveBudget, readDailyBudget } from '../utils/budgeting';
import { formatPHP } from '../utils/currency';
import { entryDialogStyles } from './ui/dialogStyles';

interface Props { data: UnifiedFinanceData; month: string; commitTransition?: FinanceTransitionCommitter; onSaved: (message: string) => void; unpaidCommitments?: number; }
export function MonthlyBudgetPanel({ data, month, commitTransition, onSaved, unpaidCommitments = 0 }: Props) {
  const id = useId();
  const [today, setToday] = useState(budgetDateKey);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer); setToday(budgetDateKey());
      const next = new Date(); next.setHours(24, 0, 0, 50);
      timer = setTimeout(update, Math.max(50, next.getTime() - Date.now()));
    };
    update(); window.addEventListener('focus', update); window.addEventListener('pageshow', update); document.addEventListener('visibilitychange', update);
    return () => { clearTimeout(timer); window.removeEventListener('focus', update); window.removeEventListener('pageshow', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  const effective = useMemo(() => effectiveBudget(data, month), [data, month]);
  const budget = effective.budget;
  const raw = data.settings?.monthlyBudgets?.[month];
  const allCash = useMemo(() => budgetCash(data), [data]);
  const daily = useMemo(() => budget ? readDailyBudget(data, month, budget, today) : undefined, [data, month, budget, today]);
  const [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState('');
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [walletIds, setWalletIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [essentials, setEssentials] = useState('');
  const [commitments, setCommitments] = useState('0');
  const [savings, setSavings] = useState('0');
  const [cushion, setCushion] = useState('0');
  const [rollover, setRollover] = useState(true);
  const [cashPlan, setCashPlan] = useState<BudgetCashPlan>();
  const [proposal, setProposal] = useState<ReturnType<typeof calculateCashGuidance>>(null);
  const [error, setError] = useState('');
  const [needsCalculation, setNeedsCalculation] = useState(true);
  const expected = useRef<unknown>(undefined);
  const reviewed = useRef<{ wallets: string; spending: string } | undefined>(undefined);
  const opener = useRef<HTMLButtonElement>(null);
  const inputClass = 'min-h-11 w-full min-w-0 rounded-xl border border-subtle bg-surface-input px-3 text-base text-primary sm:text-sm';
  const open = () => {
    expected.current = raw; reviewed.current = undefined;
    setLimit(budget ? String(budget.limit) : '');
    setCategories(Object.fromEntries(Object.entries(budget?.categoryLimits ?? {}).map(([key, value]) => [key, String(value)])));
    const dates = budget?.cashPlan ?? budgetMonthRange(month);
    setStartDate(dates.startDate); setEndDate(dates.endDate);
    setWalletIds(budget?.cashPlan?.walletIds ?? allCash.wallets.map(wallet => wallet.id));
    setEssentials(budget?.cashPlan ? String(budget.cashPlan.dailyEssentials) : '');
    setCommitments(String(budget?.cashPlan?.commitmentsReserve ?? 0));
    setSavings(String(budget?.cashPlan?.savingsTarget ?? 0)); setCushion(String(budget?.cashPlan?.cushion ?? 0));
    setNeedsCalculation(!budget);
    setRollover(budget?.rollover ?? true); setCashPlan(budget?.cashPlan); setProposal(null); setError(''); setEditing(true);
  };
  const close = () => { setEditing(false); setError(''); requestAnimationFrame(() => opener.current?.focus()); };
  const fingerprint = (current: UnifiedFinanceData, plan: BudgetCashPlan) => ({
    wallets: JSON.stringify(plan.walletIds.map(wallet => [wallet, current.wallets[wallet]])),
    spending: JSON.stringify(readBudgetSpending(current, month, { ...plan, walletIds: plan.walletIds })),
  });
  const save = (next: MonthlyBudget | undefined) => {
    if (!commitTransition) { setError('Budget saving is unavailable until your account is ready.'); return; }
    const result = commitTransition(prev => {
      if (next?.cashPlan && reviewed.current) {
        const current = fingerprint(prev, next.cashPlan);
        if (current.wallets !== reviewed.current.wallets || current.spending !== reviewed.current.spending) return { ok: false as const, data: prev, error: 'Cash or spending changed. Calculate the plan again before saving.' };
      }
      return applyMonthlyBudget(prev, month, next, expected.current);
    });
    if (!result.ok) { setError(result.error || 'The budget could not be saved.'); return; }
    close(); onSaved(next ? `Budget saved for ${month}.` : `Budget removed for ${month}.`);
  };
  const invalidateProposal = () => { setNeedsCalculation(true); setProposal(null); reviewed.current = undefined; setCashPlan(undefined); };
  const calculate = () => {
    setError(''); setNeedsCalculation(true);
    if (!walletIds.length || !startDate || !endDate || essentials.trim() === '') { setError('Choose wallets, dates, and your usual daily essentials first. Enter 0 if none.'); return; }
    const today = budgetDateKey();
    const from = today > startDate ? today : startDate;
    const cash = budgetCash(data, walletIds);
    const result = calculateCashGuidance(cash.available, budgetDays(from, endDate), Number(essentials), Number(commitments), Number(savings), Number(cushion));
    if (!result || cash.needsReview || startDate > endDate) { setError('Review wallet balances, dates and amounts. Choose a period of up to one year that has not ended.'); return; }
    setProposal(result);
    if (result.shortfall > 0) { setError(`Your estimates exceed available cash by ${formatPHP(result.shortfall)}. Adjust savings, the period, or flexible spending.`); return; }
    const spent = readBudgetSpending(data, month, { startDate, endDate, walletIds });
    if (spent.excluded) { setError('Some spending records need review before a cash-based plan can be calculated. You can still enter a manual limit below.'); return; }
    const nextCashPlan: BudgetCashPlan = { walletIds, startDate, endDate, dailyEssentials: Number(essentials), savingsTarget: Number(savings), commitmentsReserve: Number(commitments), cushion: Number(cushion),
      baselineSpent: spent.spent, baselineCommitments: spent.byCategory.Commitments,
      baselineDailyFlexible: Object.fromEntries(Object.entries(spent.byDay).map(([day, entry]) => [day, Math.round((entry.spent - entry.commitments) * 100) / 100])) };
    // Keep the chosen reporting dates, but pace available cash from the review day onward.
    nextCashPlan.pacingStartDate = from;
    const baseline = spent;
    setLimit(String(Math.round((baseline.spent + result.spendingLimit) * 100) / 100));
    setNeedsCalculation(false); setCashPlan(nextCashPlan); reviewed.current = fingerprint(data, nextCashPlan);
    setCategories(current => ({ ...current, Commitments: String(Math.round((baseline.byCategory.Commitments + Number(commitments)) * 100) / 100) }));
  };
  const remaining = budget && daily ? Math.round((budget.limit - daily.spending.spent) * 100) / 100 : 0;
  return <section aria-label="Budget guidance" data-guide-target="budget-plan" tabIndex={-1} className="min-w-0 space-y-4">
    <p className="text-xs leading-relaxed text-muted">Plan with cash already in your wallets. A salary is optional. Savings here are a target; money moves only when you choose a transfer.</p>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-primary">{month}</h3>
      {!editing && <button ref={opener} type="button" onClick={open} disabled={!commitTransition} className="min-h-11 rounded-xl bg-fill px-3 text-xs font-semibold text-primary disabled:opacity-50">{budget ? 'Edit budget' : 'Build my budget'}</button>}
    </div>
    {raw != null && !isMonthlyBudget(raw) && <p role="status" className="text-xs text-warning">This saved budget needs review. Open the editor to replace it.</p>}
    {!budget && !editing && <p className="text-xs text-muted">Answer a few questions about daily needs, commitments and savings to get a plan you can adjust.</p>}
    {effective.needsReview && <p role="status" className="text-xs text-warning">Rollover needs review because older spending or wallet balances are incomplete. You can review those records or create a new plan.</p>}
    {effective.carriedFrom && <p role="status" className="text-xs text-positive">{effective.projected ? 'Projected unused allowance' : 'Unused allowance carried'} from {effective.carriedFrom}. Daily guidance is limited to current wallet cash; no wallet credit is added. {effective.projected && 'This projection changes as spending is logged.'}</p>}
    {budget && daily && <div className="space-y-3">
      <p className="text-xs text-muted">Period: {budget.cashPlan?.startDate ?? budgetMonthRange(month).startDate} – {budget.cashPlan?.endDate ?? budgetMonthRange(month).endDate}</p>
      <div className="rounded-xl border border-subtle bg-surface-low p-3">
        <div className="flex flex-wrap justify-between gap-2 text-xs"><span>Recorded spending</span><span className="privacy-blur font-mono">{formatPHP(daily.spending.spent)} / {formatPHP(budget.limit)}</span></div>
        <progress aria-label={`${month} budget used`} max={100} value={budget.limit > 0 ? Math.min(100, daily.spending.spent / budget.limit * 100) : daily.spending.spent > 0 ? 100 : 0} className={`privacy-blur mt-2 h-1.5 w-full accent-current ${remaining < 0 ? 'text-negative' : 'text-positive'}`} />
        <p className={`privacy-blur mt-1 text-xs font-semibold ${remaining < 0 ? 'text-negative' : 'text-positive'}`}>{remaining < 0 ? `${formatPHP(-remaining)} over budget` : `${formatPHP(remaining)} remains in this plan`}</p>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2">
        {[['Today’s allowance', daily.ended || daily.future ? 'Period not active' : formatPHP(daily.todayCap)], ['Spent today', formatPHP(daily.todaySpent)], ['Left today', formatPHP(daily.remainingToday)], ['Average per remaining day', formatPHP(daily.averageRemaining)], ['Next 7 days, including today', formatPHP(daily.nextSevenDays)], ['Days left in this period', String(daily.daysLeft)]].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-fill p-3"><p className="text-[11px] text-muted">{label}</p><p className="privacy-blur mt-1 break-words font-mono text-sm font-semibold text-primary">{value}</p></div>)}
      </div>
      {!daily.ended && !daily.future && daily.todaySpent > daily.todayCap && <p role="status" className="text-xs text-warning">Today’s cap is exceeded. Later allowances absorb the excess; recorded expenses stay intact.</p>}
      {budget.cashPlan && !daily.ended && !daily.future && daily.averageRemaining < budget.cashPlan.dailyEssentials && <p role="status" className="text-xs text-warning">The remaining daily average is below your estimated essentials. Review flexible spending, savings or the period before reducing essential needs.</p>}
      <p className="text-[11px] leading-relaxed text-muted">Daily allowance includes unused earlier days. Commitments are reserved separately. The average shows another way to spread remaining money over {daily.daysLeft} days. Expected inflows are excluded until received.</p>
      {daily.funding.needsReview ? <p role="status" className="text-xs text-warning">A selected wallet is unavailable or needs review. Check Wallets before relying on this guide.</p> : daily.funding.available < Math.max(0, remaining) && <p role="status" className="text-xs text-warning">Available wallet cash is below the remaining plan. Daily guidance is limited to that cash; review the wallets or your plan.</p>}
      {budget.cashPlan && <p className="privacy-blur text-xs text-muted">Planned savings: {formatPHP(budget.cashPlan.savingsTarget)} · Commitment reserve left: {formatPHP(daily.reserveLeft)}</p>}
      {daily.spending.excluded > 0 && <p role="status" className="text-xs text-warning">{daily.spending.excluded} older or invalid records need review and are excluded. Spending may be incomplete.</p>}
      {daily.reviews.map(([category, amount]) => <p key={category} className="text-xs text-warning">Review optional spending in {category}: <span className="privacy-blur">{formatPHP(daily.spending.byCategory[category] - amount)}</span> above your category limit. Protect essentials before reducing them.</p>)}
      {daily.spending.spent > 0 && <details><summary className="min-h-11 cursor-pointer content-center text-xs font-medium text-primary">Spending areas to review</summary>
        <p className="mb-2 text-[11px] text-muted">Largest categories first. Review optional purchases within them; essentials and required payments come first.</p>
        <ul className="space-y-2 text-xs">{Object.entries(daily.spending.byCategory).filter(([, amount]) => amount > 0).sort(([, a], [, b]) => b - a).map(([category, amount]) => <li key={category} className="flex flex-wrap justify-between gap-1"><span className="text-muted">{category}</span><span className="privacy-blur font-mono text-primary">{formatPHP(amount)}</span></li>)}</ul>
      </details>}
      {(Object.keys(budget.categoryLimits ?? {}).length > 0 || daily.spending.spent > 0) && <details><summary className="min-h-11 cursor-pointer content-center text-xs font-medium text-primary">Category spending and limits</summary>
        <ul className="space-y-2 text-xs">{BUDGET_CATEGORIES.filter(category => budget.categoryLimits?.[category] !== undefined || daily.spending.byCategory[category] > 0).map(category => {
          const amount = budget.categoryLimits?.[category];
          return <li key={category} className="flex flex-wrap justify-between gap-1"><span className="text-muted">{category}</span><span className={`privacy-blur font-mono ${amount !== undefined && daily.spending.byCategory[category] > amount ? 'text-negative' : 'text-primary'}`}>{formatPHP(daily.spending.byCategory[category])}{amount !== undefined ? ` / ${formatPHP(amount)}` : ' · no individual cap'}</span></li>;
        })}</ul>
      </details>}
      <p className="text-[11px] text-muted">Counts expenses, dated commitment payments and transfer fees. Transfers are excluded. {budget.rollover ? 'Unused allowance carries forward; existing cash is never added twice.' : 'Monthly rollover is off.'}</p>
    </div>}
    {editing && <form aria-label={`Edit ${month} budget`} className="space-y-4" onSubmit={event => {
      event.preventDefault(); save({ limit: Number(limit), rollover, ...(cashPlan ? { cashPlan } : {}), categoryLimits: Object.fromEntries(Object.entries(categories).filter(([, amount]) => amount.trim() !== '').map(([category, amount]) => [category, Number(amount)])) });
    }}>
      <fieldset className="min-w-0"><legend className="mb-2 text-xs font-semibold text-primary">1. Which wallets fund your everyday spending?</legend>
        <div className="space-y-1">{allCash.wallets.map(wallet => <label key={wallet.id} className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-xl bg-fill px-3 text-xs">
          <span className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={walletIds.includes(wallet.id)} onChange={event => { setWalletIds(current => event.target.checked ? [...current, wallet.id] : current.filter(value => value !== wallet.id)); invalidateProposal(); }} /><span className="privacy-blur break-words">{wallet.label}</span></span><span className="privacy-blur shrink-0 font-mono">{formatPHP(wallet.balance)}</span>
        </label>)}</div>
        <p className="privacy-blur mt-2 text-xs text-muted">Selected liquid cash: {formatPHP(budgetCash(data, walletIds).available)}</p>
      </fieldset>
      <fieldset className="min-w-0"><legend className="mb-2 text-xs font-semibold text-primary">2. How long should this money last?</legend><div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label htmlFor={`${id}-start`} className="mb-1 block text-xs text-muted">Start date</label><input id={`${id}-start`} type="date" required value={startDate} onChange={event => { setStartDate(event.target.value); invalidateProposal(); }} className={inputClass} /></div>
        <div><label htmlFor={`${id}-end`} className="mb-1 block text-xs text-muted">Last day to cover</label><input id={`${id}-end`} type="date" required value={endDate} onChange={event => { setEndDate(event.target.value); invalidateProposal(); }} className={inputClass} /></div>
      </div><p className="mt-1 text-[11px] text-muted">Use a week, month, or a date before your next expected payment. That payment is not counted as available cash.</p></fieldset>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{[
        ['essentials', '3. Usual daily essentials (₱)', essentials, setEssentials], ['bills', '4. Upcoming commitments to reserve (₱)', commitments, setCommitments],
        ['savings', '5. Savings target for this period (₱)', savings, setSavings], ['cushion', 'Extra cushion (optional, ₱)', cushion, setCushion],
      ].map(([key, label, value, setter]) => <div key={key as string} className="min-w-0"><label htmlFor={`${id}-${key}`} className="mb-1 block text-xs text-primary">{label as string}</label><input id={`${id}-${key}`} type="number" min="0" step="0.01" value={value as string} onChange={event => { (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value); invalidateProposal(); }} className={inputClass} /></div>)}</div>
      <p className="privacy-blur text-[11px] text-muted">The app currently lists {formatPHP(unpaidCommitments)} in unpaid commitments across wallets. Review what belongs in this period; the reserve is your estimate.</p>
      <button type="button" onClick={calculate} className="min-h-11 w-full rounded-xl bg-fill px-3 text-sm font-semibold text-primary">Calculate my plan</button>
      {proposal && <div role="status" className="space-y-1 rounded-xl bg-fill p-3 text-xs"><p>Based on your estimates:</p><p className="privacy-blur">Potential savings before optional spending: {formatPHP(proposal.affordableSavings)}</p><p className="privacy-blur">Daily spending guide after your savings target: {formatPHP(proposal.dailyAllowance)}</p><p className="text-muted">Review these estimates before saving. No funds move when you save a plan.</p></div>}
      <details><summary className="min-h-11 cursor-pointer content-center text-xs font-semibold text-primary">Spending limit and optional category limits</summary>
        <div><label htmlFor={`${id}-limit`} className="mb-1 block text-xs text-primary">Period spending limit (₱)</label><input id={`${id}-limit`} required type="number" min="0" step="0.01" value={limit} onChange={event => { setLimit(event.target.value); setProposal(null); setNeedsCalculation(false); }} className={inputClass} /></div>
        <p className="my-2 text-[11px] text-muted">You can adjust the suggested limit. Category limits must fit inside it; leave a category blank to use the total only.</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">{BUDGET_CATEGORIES.map((category, index) => <div key={category} className="min-w-0"><label htmlFor={`${id}-category-${index}`} className="mb-1 block text-xs text-muted">{category} limit (₱)</label><input id={`${id}-category-${index}`} type="number" min="0" step="0.01" value={categories[category] ?? ''} onChange={event => setCategories(current => ({ ...current, [category]: event.target.value }))} className={inputClass} /></div>)}</div>
      </details>
      <label className="flex min-h-11 items-center gap-2 text-xs text-primary"><input type="checkbox" checked={rollover} onChange={event => setRollover(event.target.checked)} />Carry unused allowance into the next month</label>
      {error && <p role="alert" className="text-xs text-negative">{error}</p>}
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={needsCalculation || !limit || !commitTransition} className={`${entryDialogStyles.primary} flex-1`}>Save budget</button><button type="button" onClick={close} className="min-h-11 rounded-xl bg-fill px-4 text-sm text-primary">Cancel</button>{raw != null && <button type="button" onClick={() => save(undefined)} className="min-h-11 rounded-xl px-3 text-xs text-negative">Remove budget</button>}</div>
    </form>}
  </section>;
}
