export type BillType = "Bill" | "Subscription" | "Loan / Installment";
export type ReceivableFrequency = "By Date" | "Monthly" | "Bi-monthly";
export type ReceivableCategory = string;
export type ShootCategory = string;
export type ShootStatus = "Pencil" | "Confirmed" | "Moved" | "Cancelled";

export type ExpenseCategory = "Food & Dining" | "Transport" | "Utilities" | "Laundry & Home" | "Shopping" | "Other";

export interface Expense {
  id: string;
  merchant: string;
  amount: number;
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
}

export interface Receivable {
  id: string;
  name: string;
  amount: number;
  category?: ReceivableCategory;
  frequency: ReceivableFrequency;
  biMonthlyDays?: string;
  monthlyDay?: string;
  date?: string;
  startMonth?: string;
}

export interface ReceivableViewModel extends Receivable {
  amountReceived: number;
  collected: boolean;
  targetMonthForDue: string;
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
  maribank: number;
  gcash: number;
  maya: number;
  gotyme: number;
  bpi: number;
  cash: number;
  [key: string]: number;
}

export interface MonthLog {
  billsPaid?: string[];
  billOverrides?: {
    [billId: string]: number;
  };
  recsCollected?: {
    [receivableId: string]: {
      amountReceived: number;
      collected: boolean;
    };
  };
  billPaydayContributions?: {
    [billId: string]: number;
  };
}

export interface CustomWallet {
  id: string;
  label: string;
  color?: string;
}

export interface AppSettings {
  targetFund: number;
  goalName?: string;
  milestoneWallet?: string;
  inflowsLabel?: string;
  gigsLabel?: string;
  inflowCategories?: string[];
  gigCategories?: string[];
  perPayoutSalary: number;
  phpToJpyRate: number;
  defaultTransitAllocation: number;
  baseLivingAllowance?: number;
  baseSavingsTarget?: number;
  livingWallet?: string;
  savingsWallet?: string;
  transitWallet?: string;
  walletLabels?: Record<string, string>;
  customWallets?: CustomWallet[];
}

export interface UnifiedFinanceData {
  settings?: AppSettings;
  targetFund?: number;
  updatedAt?: number;
  paydaySplitExecutions?: string[];
  wallets: WalletState;
  library: {
    bills: Bill[];
    receivables: Receivable[];
    shoots: Shoot[];
    expenses?: Expense[];
  };
  logs: {
    [monthKey: string]: MonthLog;
  };
}

export interface EditFormData {
  id?: string;
  name?: string;
  title?: string;
  amount?: number;
  dueDay?: string;
  type?: BillType;
  wallet?: string;
  category?: ReceivableCategory | ShootCategory;
  frequency?: ReceivableFrequency;
  biMonthlyDays?: string;
  monthlyDay?: string;
  date?: string;
  status?: ShootStatus;
  startMonth?: string;
  endMonth?: string;
  paid?: boolean;
  completed?: boolean;
  baseAmount?: number;
  monthAmount?: number | string;
}
