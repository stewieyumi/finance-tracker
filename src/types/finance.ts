export type BillType = "Bill" | "Subscription" | "Loan / Installment";
export type ReceivableFrequency = "By Date" | "Monthly" | "Bi-monthly" | "No Specific Date";
export type ReceivableCategory = string;

export type DeductionType = "fixed" | "percentage";

export interface Deduction {
  id: string;
  name: string;
  type: DeductionType;
  value: number;
}

export type ShootCategory = string;
export type ShootStatus = "Pencil" | "Confirmed" | "Moved" | "Cancelled";

export type ExpenseCategory = "Food & Dining" | "Transport" | "Utilities" | "Laundry & Home" | "Shopping" | "Other";

export interface ManualTransaction {
  id: string;
  title: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  date: string;
  wallet?: string;
  destinationWallet?: string;
  /** Separate charge on the source wallet; principal amount remains unchanged. */
  transferFee?: number;
  category?: string;
  note?: string;
  createdAt: number;
  postingMode?: "history-only" | "wallet";
}

export interface Expense {
  /** Actual save time; absent on older records. date remains the chosen transaction date. */
  loggedAt?: string;
  id: string;
  merchant: string;
  amount: number;
  deductedAmount?: number;
  category: ExpenseCategory | string;
  wallet: string;
  date: string;
}

export interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDay: string;
  type: BillType;
  wallet?: string;
  startMonth?: string;
  endMonth?: string;
}

export interface BillViewModel extends Bill {
  baseAmount: number;
  paid: boolean;
  targetMonthForDue: string;
  daysLeft: number;
  isOverridden: boolean;
  totalLoanPaid?: number;
  paidLoanInstallments?: number;
  remainingLoanScheduled?: number | null;
  loanHistoryApproximate?: boolean;
  loanHistoryIncomplete?: boolean;
}

export interface Receivable {
  /** Unknown expected amount; numeric zero is a compatibility placeholder, never a receipt. */
  amountUnspecified?: boolean;
  id: string;
  name: string;
  amount: number;
  grossAmount?: number;
  deductions?: Deduction[];
  category?: ReceivableCategory;
  frequency: ReceivableFrequency;
  wallet?: string;
  biMonthlyDays?: number[];
  monthlyDay?: number;
  date?: string;
  startMonth?: string;
}

export interface ReceivableViewModel extends Receivable {
  paydayReceived?: Record<number, number>;
  amountReceived: number;
  collected: boolean;
  targetMonthForDue: string;
  needsDate?: boolean;
  needsScheduleReview?: boolean;
}

export interface Shoot {
  id: string;
  title: string;
  date?: string;
  category?: ShootCategory;
  status: ShootStatus;
  completed: boolean;
}

export interface WalletState {
  [key: string]: number;
}

export interface BillSettlement {
  id: string;
  paidAt: string;
  amount: number;
  wallet: string | null;
  walletDebit: number;
  priorConfirmation?: boolean;
  /** Append-only payment state changes; old records may have incomplete timing. */
  statusHistory?: { paid: boolean; at: string }[];
  historyComplete?: boolean;
  reversedAt?: string;
}

export interface ReceivableSettlement {
  id?: string;
  receivedAt: string;
  amount: number;
  wallet: string | null;
  walletCredit: number;
  paydayDay?: number;
  reversedAt?: string;
}

/** A reviewed reporting correction; original receipt and wallet provenance stay unchanged. */
export interface ConfirmedIncomeMonth {
  /** Confirmed payment day, when known; original receipt provenance remains unchanged. */
  date?: string;
  month: string;
  confirmedAt: string;
  amount: number;
}
export type IncomeReceiptSource = Omit<ReceivableSettlement, "reversedAt">;
export interface ReceivableIncomeMonths {
  receipts?: Record<string, ConfirmedIncomeMonth & { source: IncomeReceiptSource }>;
  legacy?: ConfirmedIncomeMonth & { paymentDate?: string; sourceReceipts: IncomeReceiptSource[] };
}

export interface MonthLog {
  receivableIncomeMonths?: Record<string, ReceivableIncomeMonths>;
  receivableSettlements?: Record<string, ReceivableSettlement[]>;
  billsPaid?: string[];
  billSettlements?: Record<string, BillSettlement[]>;
  billOverrides?: {
    [billId: string]: number;
  };
  recsCollected?: {
    [receivableId: string]: {
      amountReceived: number;
      collected: boolean;
    };
  };
  paymentDates?: Record<string, string>;
  billPaydayContributions?: {
    [billId: string]: number;
  };
}

export interface CustomWallet {
  id: string;
  label: string;
  color?: string;
}

export interface ReceivedIncomeDraft {
  receiptId: string;
  inflowId: string;
  month: string;
  wallet: string;
  amount: number;
  name: string;
}

export interface BudgetCashPlan {
  pacingStartDate?: string;
  walletIds: string[];
  startDate: string;
  endDate: string;
  dailyEssentials: number;
  savingsTarget: number;
  commitmentsReserve: number;
  cushion: number;
  baselineSpent: number;
  baselineCommitments: number;
  baselineDailyFlexible: Record<string, number>;
}

export interface MonthlyBudget {
  rollover?: boolean;
  cashPlan?: BudgetCashPlan;
  limit: number;
  categoryLimits?: Record<string, number>;
}

export interface EmergencyFundGoal {
  target: number;
  walletIds: string[];
}

export interface AppSettings {
  /** Explicit opt-in for Savings controls; existing set-aside amounts remain visible. */
  savingsWalletIds?: string[];
  emergencyFundGoal?: EmergencyFundGoal | null;
  /** Money set aside within existing balances; planning only, not a spending lock. */
  walletSavings?: Record<string, number>;
  monthlyBudgets?: Record<string, MonthlyBudget | null>;
  theme?: "dark" | "light" | "system";
  paydayDays?: number[];
  targetFund?: number;
  goalName?: string;
  milestoneWallet?: string;
  /** Track the selected wallet balance by default, or only its existing Savings reserve. */
  milestoneSource?: "balance" | "savings";
  inflowsLabel?: string;
  gigsLabel?: string;
  inflowCategories?: string[];
  gigCategories?: string[];
  perPayoutSalary?: number;
  grossPerPayoutSalary?: number;
  salaryDeductions?: Deduction[];
  phpToJpyRate?: number;
  defaultTransitAllocation?: number;
  baseLivingAllowance?: number;
  baseSavingsTarget?: number;
  livingWallet?: string;
  savingsWallet?: string;
  transitWallet?: string;
  defaultWallet?: string;
  transferFromWallet?: string;
  transferToWallet?: string;
  expenseWallets?: Record<string, string>;
  walletLabels?: Record<string, string>;
  hasMigratedBaseWallets?: boolean;
  hasCompletedOnboarding?: boolean;
  customWallets?: CustomWallet[];
  archivedWallets?: CustomWallet[];
  dismissedNotifications?: Record<string, number>;
}

export interface PaydayExecution {
  id: string;
  date: string;
  timestamp: number;
  allocations: Record<string, number>;
  billContributions: { month: string; id: string; amount: number }[];
}

export interface UnifiedFinanceData {
  /** Durable idempotency markers for explicit cash/income distributions. */
  budgetDistributionIds?: string[];
  /** Last acknowledged expense change, retained after deletion to reject stale replay. */
  expenseRevisions?: Record<string, string>;
  settings?: AppSettings;
  targetFund?: number;
  updatedAt?: number;
  paydaySplitExecutions?: (string | PaydayExecution)[];
  wallets: WalletState;
  library: {
    bills: Bill[];
    archivedBills?: Bill[];
    receivables: Receivable[];
    archivedReceivables?: Receivable[];
    shoots: Shoot[];
    expenses?: Expense[];
  manualTransactions?: ManualTransaction[];
  };
  logs: {
    [monthKey: string]: MonthLog;
  };
}

export interface EditFormData {
  amountUnspecified?: boolean;
  id?: string;
  name?: string;
  title?: string;
  amount?: number;
  grossAmount?: number;
  deductions?: Deduction[];
  dueDay?: string;
  type?: BillType;
  wallet?: string;
  category?: ReceivableCategory | ShootCategory;
  frequency?: ReceivableFrequency;
  biMonthlyDays?: number[];
  monthlyDay?: number;
  date?: string;
  status?: ShootStatus;
  startMonth?: string;
  endMonth?: string;
  paid?: boolean;
  completed?: boolean;
  baseAmount?: number;
  monthAmount?: number | string;
}

export interface TransactionHistoryItem {
  isTransfer?: boolean;
  /** Derived from a guarded confirmation; never implies an exact receipt day. */
  confirmedIncomeMonth?: string;
  loggedAt?: string;
  id: string;
  title: string;
  amount: number;
  date: string;
  type: "expense" | "bill" | "inflow";
  wallet?: string;
  category?: string;
}

export type NotificationType =
  | "overdue_commitment"
  | "upcoming_commitment"
  | "pending_receivable"
  | "received_income"
  | "log_reminder";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  amount?: number;
  date?: string;
  actionRoute?: "operations/bills" | "operations/inflows" | "expenses" | "budget/distribute";
  incomeReceipt?: ReceivedIncomeDraft;
  targetId?: string;
  isGroup?: boolean;
  count?: number;
  groupedIds?: string[];
}

export interface SyncRecord {
  data: UnifiedFinanceData;
  revision: number;
}

export interface SyncConflictState {
  baseRevision: number | null;
  localSnapshot: UnifiedFinanceData;
  cloudSnapshot: UnifiedFinanceData;
  cloudRevision: number;
  detectedAt: number;
}

export interface LastResolvedConflict {
  localSnapshot: UnifiedFinanceData;
  cloudSnapshot: UnifiedFinanceData;
  detectedAt: number;
  resolvedAt: number;
  resolution: "local" | "cloud";
  cloudRevision: number;
}

export type FinanceTransitionResult<TExtra = Record<string, unknown>> =
  | ({ ok: true; data: UnifiedFinanceData } & TExtra)
  | ({ ok: false; error: string; data: UnifiedFinanceData } & Partial<TExtra>);

export type FinanceTransitionCommitter = <T extends { ok: boolean; data: UnifiedFinanceData }>(
  transition: (prev: UnifiedFinanceData) => T
) => T;

export type WalletMutationOutcome = { ok: true } | { ok: false; error: string };
export type WalletMutationHandler = (walletId: string, amount: number) => WalletMutationOutcome | void;
