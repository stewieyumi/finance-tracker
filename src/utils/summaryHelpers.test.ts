import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillViewModel, ReceivableViewModel, UnifiedFinanceData } from '../types/finance';
import { reconcileDebt } from './debtReconciliation';
import { buildFinancialSummary } from './summaryHelpers';
import { reconcileWalletBalances } from './financeHelpers';
import { readBudgetSpending, readDailyBudget } from './budgeting';

const month = 'November 2026';
function seed(): UnifiedFinanceData {
  return { wallets: { main: 1000, cash: 200, old: 50, extra: 25 }, settings: {
    customWallets: [{ id: 'main', label: 'Bank' }, { id: 'cash', label: 'Cash' }],
    archivedWallets: [{ id: 'old', label: 'Old bank' }], defaultWallet: 'main', milestoneWallet: 'cash', targetFund: 1000,
    goalName: 'Emergency fund', monthlyBudgets: { [month]: { limit: 600, rollover: true,
      categoryLimits: { 'Food & Dining': 80, Commitments: 200 },
      cashPlan: { walletIds: ['main'], startDate: '2026-11-01', endDate: '2026-11-30', dailyEssentials: 20,
        savingsTarget: 200, commitmentsReserve: 200, cushion: 50, baselineSpent: 0, baselineCommitments: 0, baselineDailyFlexible: {} } } }
  }, library: { bills: [{ id: 'paid', name: 'Internet', amount: 200, dueDay: '2', type: 'Bill', wallet: 'main' }],
    receivables: [{ id: 'client', name: 'Client', amount: 1000, frequency: 'Monthly', wallet: 'main' }],
    expenses: [{ id: 'lunch', merchant: 'Lunch', amount: 100.25, category: 'Food & Dining', date: '2026-11-25', wallet: 'main', loggedAt: '2026-12-01T12:00:00Z' },
      { id: 'outside', merchant: 'October', amount: 999, category: 'Other', date: '2026-10-31', wallet: 'main' }],
    manualTransactions: [
      { id: 'manual', title: 'Fare', amount: 50, type: 'expense', category: 'Transport', date: '2026-11-25', wallet: 'main', createdAt: 1 },
      { id: 'move', title: 'Move', amount: 500, transferFee: 10, type: 'transfer', wallet: 'main', destinationWallet: 'cash', date: '2026-11-25', createdAt: 1 },
      { id: 'income', title: 'Historical cash', amount: 90, type: 'income', wallet: 'main', postingMode: 'history-only', date: '2026-11-25', createdAt: 1 }
    ], shoots: [{ id: 'shoot', title: 'Wedding', date: '2026-12-01', status: 'Confirmed', completed: false },
      { id: 'done', title: 'Edit', status: 'Confirmed', completed: true }]
  }, logs: { [month]: { billsPaid: ['paid'], billSettlements: { paid: [{ id: 'paid-receipt', amount: 200, paidAt: '2026-11-25', wallet: 'main', walletDebit: 200 }] },
    recsCollected: { client: { amountReceived: 700, collected: false } }, receivableSettlements: {
      client: [{ id: 'income-receipt', amount: 600, receivedAt: '2026-11-25T04:00:00Z', wallet: 'main', walletCredit: 600 }]
    } } } };
}
const bills: BillViewModel[] = [
  { id: 'unpaid', name: 'Rent', amount: 400, baseAmount: 400, dueDay: '30', type: 'Bill', paid: false, daysLeft: 5, targetMonthForDue: month, isOverridden: false },
  { id: 'paid', name: 'Internet', amount: 200, baseAmount: 200, dueDay: '2', type: 'Bill', paid: true, daysLeft: -23, targetMonthForDue: month, isOverridden: false }
];
const inflows: ReceivableViewModel[] = [{ id: 'client', name: 'Client', amount: 1000, amountReceived: 700, collected: false, frequency: 'Monthly', targetMonthForDue: month }];
const summary = (data = seed(), selectedMonth = month) => buildFinancialSummary({ globalData: data, selectedMonth,
  totalLiquid: reconcileWalletBalances(data).totalLiquid, activeBills: bills, activeReceivables: inflows,
  totalUnpaidCommitments: 400, overdueBills: [], targetMilestoneFund: 1000, fundProgressPercent: '20.0' });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 25, 12)); });
afterEach(() => vi.useRealTimers());

describe('comprehensive copied financial summary', () => {
  it('leads with an actual summary and covers spending, balances, plans, statuses, transfers, goals and tasks without mutations', () => {
    const data = seed(); const before = structuredClone(data); const text = summary(data);
    expect(text).toContain('AT A GLANCE\nYou have ₱1,275.00');
    expect(text).toContain('Inflows receipts total ₱600.00 and recorded spending totals ₱360.25');
    expect(text).toContain('Cash after savings and these unpaid commitments: ₱875.00');
    expect(text).toContain('Old bank [archived]: ₱50.00'); expect(text).toContain('extra [unlisted]: ₱25.00');
    expect(text).toContain('Month Income Collected: ₱600.00 (actual Inflows receipts)');
    expect(text).toContain('Historical income — date unverified: ₱100.00');
    expect(text).toContain('Expenses (including manual ledger expenses): ₱150.25');
    expect(text).toContain('Paid commitments by actual payment date: ₱200.00');
    expect(text).toContain('Transfer fees: ₱10.00'); expect(text).toContain('TOTAL RECORDED SPENDING: ₱360.25');
    expect(text).toContain('Food & Dining: ₱100.25'); expect(text).toContain('80.00 limit — over limit');
    expect(text).toContain('Bank → Cash: ₱500.00; fee ₱10.00');
    expect(text).toContain('Historical cash: ₱90.00 [history only]');
    expect(text).toContain('Internet: Settled'); expect(text).toContain('Client: Partial');
    expect(text).toContain('Emergency fund: ₱200.00 / ₱1,000.00 (20.0%) · Cash');
    expect(text).toContain('1/2 completed'); expect(text).toContain('Wedding: 2026-12-01 · Confirmed');
    expect(data).toEqual(before);
  });
  it('matches the live budget reader while distinguishing planned savings, current cash and unspent allowance', () => {
    const data = seed(); const plan = data.settings!.monthlyBudgets![month]!;
    const daily = readDailyBudget(data, month, plan, '2026-11-25'); const text = summary(data);
    expect(text).toContain(`recorded spending in plan: ₱${daily.spending.spent.toFixed(2)}`);
    expect(text).toContain(`allowance ₱${daily.todayCap.toFixed(2)}`);
    expect(text).toContain('Unspent allowance: ₱239.75');
    expect(text).toContain('Savings target: ₱200.00; cushion: ₱50.00 (planned amounts, not transfers)');
    expect(text).toContain('Wallet balances are current, not historical month-end balances');
    expect(text).not.toContain('₱1,860.25');
  });
  it('uses transaction dates, excludes reversed payments, and flags unknown/duplicate spending', () => {
    const data = seed(); data.logs[month].billSettlements!.paid[0].reversedAt = '2026-11-26';
    data.logs[month].billsPaid = ['legacy'];
    data.library.expenses!.push({ id: 'dup', merchant: 'Bad', amount: 70, category: 'Other', date: '2026-11-25', wallet: 'main' },
      { id: 'dup', merchant: 'Bad', amount: 70, category: 'Other', date: '2026-11-25', wallet: 'main' });
    expect(readBudgetSpending(data, month).spent).toBe(160.25);
    expect(summary(data)).toContain('TOTAL RECORDED SPENDING: ₱160.25');
    expect(summary(data)).toContain('3 spending record(s) need review and were excluded');
    expect(summary(data, 'December 2026')).toContain('TOTAL RECORDED SPENDING: ₱0.00');
  });
  it('handles no plan, zero caps, future/ended plans and inherited rollover without inventing current daily amounts', () => {
    const data = seed(); delete data.settings!.monthlyBudgets;
    expect(summary(data)).toContain('No budget set for November 2026');
    data.settings!.monthlyBudgets = { [month]: { limit: 0 } };
    expect(summary(data)).toContain('Over limit: ₱360.25');
    expect(summary(data)).not.toContain('NaN');
    data.settings!.monthlyBudgets = { [month]: { limit: 600, rollover: true } };
    expect(summary(data, 'December 2026')).toContain('carried from November 2026; projected');
    expect(summary(data, 'December 2026')).toContain('has not started; no current daily allowance');
    vi.setSystemTime(new Date(2026, 11, 1, 12));
    expect(summary(data)).toContain('has ended; no current daily allowance');
  });
  it('shows incomplete wallet/debt history honestly and does not report corrupt balances as zero', () => {
    const data = seed(); data.wallets.main = NaN;
    data.library.bills.push({ id: 'loan', name: 'Laptop plan', amount: 100, dueDay: '15', type: 'Loan / Installment' });
    const text = summary(data);
    expect(text).toContain('Bank: Balance needs review');
    expect(text).toContain('Budget spending or selected wallets need review');
    expect(text).toContain('Laptop plan'); expect(text).toContain('history needs review / estimate');
    expect(text).not.toContain('₱NaN');
  });
  it('keeps all-wallet monthly spending distinct from a selected-wallet budget with its own date range', () => {
    const data = seed(); const plan = data.settings!.monthlyBudgets![month]!;
    plan.cashPlan!.walletIds = ['cash']; plan.cashPlan!.startDate = '2026-11-25';
    const text = summary(data);
    expect(text).toContain('TOTAL RECORDED SPENDING: ₱360.25');
    expect(text).toContain('Selected wallets: Cash; available now: ₱200.00');
    expect(text).toContain('recorded spending in plan: ₱0.00');
    expect(text).toContain('Plan period: 2026-11-25 to 2026-11-30');
    expect(text).toContain('Unspent allowance: ₱600.00');
  });
  it('omits duplicate or undated manual records and flags invalid transfer fees', () => {
    const data = seed();
    const row = data.library.manualTransactions![1];
    data.library.manualTransactions!.push({ ...row, title: 'Duplicate transfer' },
      { ...row, id: 'undated', title: 'Undated', date: '' },
      { ...row, id: 'bad-fee', transferFee: NaN });
    const text = summary(data);
    expect(text).not.toContain('Duplicate transfer');
    expect(text).toContain('Bank → Cash: ₱500.00; fee needs review');
    expect(text).toContain('Some manual income or transfer records need review');
    expect(text).not.toContain('₱NaN');
  });
  it('reports savings inside total balances and excludes them from the spending outlook', () => {
    const data = seed(); data.settings!.walletSavings = { main: 800 };
    const text = summary(data);
    expect(text).toContain('TOTAL WALLET CASH: ₱1,275.00');
    expect(text).toContain('SAVINGS WITHIN THESE BALANCES: ₱800.00');
    expect(text).toContain('AVAILABLE AFTER SAVINGS: ₱475.00');
    expect(text).toContain('Cash after savings and these unpaid commitments: ₱75.00');
    expect(text).toContain('Selected wallets: Bank; available now: ₱200.00');
    expect(text).toContain('TOTAL RECORDED SPENDING: ₱360.25');
  });
  it('includes the checkup, enabled Savings wallets and emergency-goal progress from the same readers as the UI', () => {
    const data = seed(); data.settings!.walletSavings = { main: 800 }; data.settings!.savingsWalletIds = ['main'];
    data.settings!.emergencyFundGoal = { target: 1000, walletIds: ['main'] };
    const text = summary(data);
    expect(text).toContain('FINANCIAL CHECKUP — CURRENT CASH / NOVEMBER 2026 ACTIVITY');
    expect(text).toContain('Wallets with Savings controls enabled: Bank');
    expect(text).toContain('Target: ₱1,000.00; existing Savings counted: ₱800.00; remaining: ₱200.00');
    expect(text).toContain('Selected Savings wallets: Bank'); expect(text).toContain('Progress: 80.00%');
    expect(text).toContain('AVAILABLE AFTER SAVINGS: ₱475.00');
    expect(text).toContain('no additional money is added or reserved');
  });
  it('preserves unknown expected amounts and confirmed month-only receipt notes', () => {
    const data = seed(); const text = buildFinancialSummary({ globalData: data, selectedMonth: month, totalLiquid: 1275,
      activeBills: [], activeReceivables: [{ ...inflows[0], amount: 0, amountReceived: 0, amountUnspecified: true }],
      totalUnpaidCommitments: 0, overdueBills: [], targetMilestoneFund: 0, fundProgressPercent: '0',
      incomeReport: { actual: 600, confirmedMonthOnly: 600, historicalDateUnverified: 0, needsReview: false } });
    expect(text).toContain('TOTAL PENDING INFLOWS: ₱0.00 (excludes inflows with no amount)');
    expect(text).toContain('— (amount not set)'); expect(text).toContain('exact day unknown');
    expect(text).toContain('No savings goal set');
  });
});


it('copies the same debt totals, schedule, upcoming plans and breakdown as the overview reader', () => {
  const d = seed();
  d.library.bills = [
    { id: 'debt-a', name: 'Phone', amount: 100, dueDay: '15', type: 'Loan / Installment', startMonth: 'November 2026', endMonth: 'December 2026' },
    { id: 'debt-b', name: 'Laptop', amount: 200, dueDay: '15', type: 'Loan / Installment', startMonth: 'December 2026', endMonth: 'January 2027' }
  ];
  const debt = reconcileDebt(d, month); const text = summary(d);
  expect(text).toContain(`Scheduled in November 2026: ₱${debt.monthlyScheduled!.toFixed(2)} (includes settled payments)`);
  expect(text).toContain(`Last planned payment: ${debt.scheduledFinish}`);
  expect(text).toContain('Upcoming plans: 1; ₱400.00 remaining scheduled separately from active debt');
  expect(text).toContain('Active debt breakdown: Phone: 100.0%');
  expect(text).toContain('not a lender payoff quote');
  d.library.bills[0].startMonth = 'January 2026'; d.library.bills[0].endMonth = 'March 2026';
  expect(summary(d)).toContain('Overdue schedule — unpaid installments in an ended plan');
  d.library.bills[0].endMonth = undefined;
  expect(summary(d)).toContain('Scheduled in November 2026: Review needed');
});
