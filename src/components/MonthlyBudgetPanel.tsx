import React, { useMemo } from 'react';
import { useBudgetDate } from '../hooks/useBudgetDate';
import type { FinanceTransitionCommitter, UnifiedFinanceData } from '../types/finance';
import { BUDGET_CATEGORIES, isMonthlyBudget, budgetMonthRange, effectiveBudget, readDailyBudget } from '../utils/budgeting';
import { formatPHP } from '../utils/currency';
import { entryDialogStyles } from './ui/dialogStyles';

interface Props { data: UnifiedFinanceData; month: string; commitTransition?: FinanceTransitionCommitter; onSetup?: () => void; setupButtonId?: string; }
export function MonthlyBudgetPanel({ data, month, commitTransition, onSetup, setupButtonId }: Props) {
  const today = useBudgetDate();
  const effective = useMemo(() => effectiveBudget(data, month), [data, month]);
  const budget = effective.budget;
  const raw = data.settings?.monthlyBudgets?.[month];
  const daily = useMemo(() => budget ? readDailyBudget(data, month, budget, today) : undefined, [data, month, budget, today]);
  const remaining = budget && daily ? Math.round((budget.limit - daily.spending.spent) * 100) / 100 : 0;
  return <section aria-label="Budget guidance" data-guide-target="budget-plan" tabIndex={-1} className="min-w-0 space-y-4">
    <p className="text-xs leading-relaxed text-muted">Plan with cash already in your wallets. A salary is optional. Savings here are a target; money moves only when you choose a transfer.</p>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-primary">{month}</h3>
      <button id={setupButtonId} type="button" onClick={onSetup} disabled={!commitTransition || !onSetup} className={entryDialogStyles.primary}>{budget ? 'Edit budget' : 'Build my budget'}</button>
    </div>
    <details className="rounded-xl border border-subtle bg-surface-low p-3 text-xs leading-relaxed">
      <summary className="min-h-11 cursor-pointer content-center font-semibold text-primary">How to start</summary>
      <ol className="list-decimal space-y-2 pl-5 text-muted">
        <li>Choose wallets containing money you can spend now. Check their current balances first.</li>
        <li>Choose the last day this money must cover, such as the day before your next income.</li>
        <li>Reserve unpaid bills due during that period. Paid expenses already reflected in your balances should not be subtracted again.</li>
        <li>Estimate daily food, transport and other essentials. Add a savings target or cushion if you want to protect some money.</li>
        <li>Follow the setup questions, review your daily guide, then choose Save budget.</li>
      </ol>
      <p className="mt-3 font-medium text-primary">Starting daily guide = (available cash − unpaid payments − extra savings target − cushion) ÷ days to cover.</p>
      <p className="mt-2 text-muted">Money already set aside as Savings in Wallets is excluded from available cash. Food, transport and everyday extras come from that daily amount. Upcoming income stays separate until received. Daily carry-forward can change the amount shown for a particular day.</p>
    </details>
    {raw != null && !isMonthlyBudget(raw) && <p role="status" className="text-xs text-warning">This saved budget needs review. Open the editor to replace it.</p>}
    {!budget && <p className="text-xs text-muted">Answer a few questions about daily needs, commitments and savings to get a plan you can adjust.</p>}
    {effective.needsReview && <p role="status" className="text-xs text-warning">Rollover needs review because older spending or wallet balances are incomplete. You can review those records or create a new plan.</p>}
    {effective.carriedFrom && <p role="status" className="text-xs text-positive">{effective.projected ? 'Projected unused allowance' : 'Unused allowance carried'} from {effective.carriedFrom}. Daily guidance is limited to current wallet cash; no wallet credit is added. {effective.projected && 'This projection changes as spending is logged.'}</p>}
    {budget && daily && <div className="space-y-3">
      <p className="text-xs text-muted">Period: {budget.cashPlan?.startDate ?? budgetMonthRange(month).startDate} – {budget.cashPlan?.endDate ?? budgetMonthRange(month).endDate}</p>
      <div className="rounded-xl border border-subtle bg-surface-low p-3">
        <div className="flex flex-wrap justify-between gap-2 text-xs"><span>Recorded spending</span><span className="privacy-blur font-mono">{formatPHP(daily.spending.spent)} / {formatPHP(budget.limit)}</span></div>
        <progress aria-label={`${month} budget used`} max={100} value={budget.limit > 0 ? Math.min(100, daily.spending.spent / budget.limit * 100) : daily.spending.spent > 0 ? 100 : 0} className={`privacy-blur mt-2 h-1.5 w-full accent-current ${remaining < 0 ? 'text-negative' : 'text-positive'}`} />
        <p className={`privacy-blur mt-1 text-xs font-semibold ${remaining < 0 ? 'text-negative' : 'text-positive'}`}>{remaining < 0 ? `${formatPHP(-remaining)} over budget` : `${formatPHP(remaining)} remains in this plan`}</p>
      </div>
      <div className="rounded-2xl bg-fill p-4"><p className="text-xs text-muted">Left today</p><p className="privacy-blur mt-1 break-words font-mono text-3xl font-bold text-positive">{daily.ended || daily.future ? 'Period not active' : formatPHP(daily.remainingToday)}</p><p className="mt-2 text-xs text-muted">Your guide for everyday spending after reserved payments and savings.</p></div>
      <div className="grid min-w-0 grid-cols-2 gap-2">
        {[['Today’s allowance', daily.ended || daily.future ? 'Period not active' : formatPHP(daily.todayCap)], ['Spent today', formatPHP(daily.todaySpent)]].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-fill p-3"><p className="text-[11px] text-muted">{label}</p><p className="privacy-blur mt-1 break-words font-mono text-sm font-semibold text-primary">{value}</p></div>)}
      </div>
      <details><summary className="min-h-11 cursor-pointer content-center text-xs font-medium text-primary">Weekly and period details</summary><dl className="space-y-2 text-xs">{[['Average per remaining day', formatPHP(daily.averageRemaining)], ['Next 7 days, including today', formatPHP(daily.nextSevenDays)], ['Days left in this period', String(daily.daysLeft)]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt className="text-muted">{label}</dt><dd className="privacy-blur font-mono text-primary">{value}</dd></div>)}</dl></details>
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
  </section>;
}
