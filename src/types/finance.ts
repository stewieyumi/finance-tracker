export type BillType = "Bill" | "Subscription" | "Loan / Installment";
export type ReceivableFrequency = "By Date" | "Monthly" | "Bi-monthly";
export type ReceivableCategory = "Salary" | "Edit" | "Shoot" | "Payment" | "Other";
export type ShootCategory = "Solo Shoot" | "Assistant" | "Video Edit" | "Event" | "Commercial" | "Other";
export type ShootStatus = "Pencil" | "Confirmed" | "Moved" | "Cancelled";

export interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDay: string;
  type: BillType;
  startMonth?: string;
  endMonth?: string;
  paid?: boolean;
  targetMonthForDue?: string;
  daysLeft?: number;
  isOverridden?: boolean;
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
  amountReceived?: number;
  collected?: boolean;
  targetMonthForDue?: string;
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
}

export interface AppSettings {
  targetFund: number;
  perPayoutSalary: number;
  phpToJpyRate: number;
  defaultTransitAllocation: number;
}

export interface UnifiedFinanceData {
  settings?: AppSettings;
  targetFund?: number;
  updatedAt?: number;
  wallets: WalletState;
  library: {
    bills: Bill[];
    receivables: Receivable[];
    shoots: Shoot[];
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
  category?: ReceivableCategory | ShootCategory | string;
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
  [key: string]: any;
}
