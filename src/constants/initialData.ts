import { UnifiedFinanceData } from "../types/finance";
import { DEFAULT_TARGET_FUND } from "./config";

export const INITIAL_UNIFIED_DATA: UnifiedFinanceData = {
  settings: {
    targetFund: DEFAULT_TARGET_FUND,
    perPayoutSalary: 15000,
    phpToJpyRate: 2.70,
    defaultTransitAllocation: 1500,
    hasMigratedBaseWallets: true,
    milestoneWallet: "main",
    livingWallet: "main",
    savingsWallet: "savings",
    transitWallet: "main",
    defaultWallet: "main",
    customWallets: [
      { id: "main", label: "Main Account", color: "text-blue-400" },
      { id: "savings", label: "Savings", color: "text-emerald-400" },
      { id: "cash", label: "Cash On-Hand", color: "text-zinc-300" }
    ]
  },
  targetFund: DEFAULT_TARGET_FUND,
  updatedAt: 0,
  wallets: { main: 0, savings: 0, cash: 0 },
library: {
  bills: [],
  receivables: [],
  shoots: [],
  expenses: []
},
  logs: {}
};