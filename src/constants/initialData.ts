import { UnifiedFinanceData } from "../types/finance";
import { DEFAULT_TARGET_FUND } from "./config";

export const INITIAL_UNIFIED_DATA: UnifiedFinanceData = {
  settings: {
    targetFund: DEFAULT_TARGET_FUND,
    perPayoutSalary: 15000,
    phpToJpyRate: 2.70,
    defaultTransitAllocation: 1500
  },
  targetFund: DEFAULT_TARGET_FUND,
  updatedAt: Date.now(),
  wallets: { 
    maribank: 0, 
    gcash: 0, 
    maya: 0, 
    gotyme: 0, 
    bpi: 0, 
    cash: 0 
  },
library: {
  bills: [],
  receivables: [],
  shoots: []
},
  logs: {}
};