import { UnifiedFinanceData } from "../types/finance";

export const INITIAL_UNIFIED_DATA: UnifiedFinanceData = {
  settings: {
    targetFund: 100000,
    perPayoutSalary: 15000,
    phpToJpyRate: 2.70,
    defaultTransitAllocation: 1500
  },
  targetFund: 100000,
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
    bills: [
      { id: "b1", name: "Sample Utility Bill", amount: 1500, dueDay: "15", type: "Bill", startMonth: "September 2026", endMonth: "" },
      { id: "b2", name: "Sample Subscription", amount: 499, dueDay: "20", type: "Subscription", startMonth: "September 2026", endMonth: "" },
      { id: "b3", name: "Sample Equipment Loan", amount: 2500, dueDay: "10", type: "Loan / Installment", startMonth: "September 2026", endMonth: "March 2027" }
    ],
    receivables: [
      { id: "r1", name: "Sample Monthly Retainer", amount: 15000, category: "Salary", frequency: "Monthly", startMonth: "September 2026" },
      { id: "r2", name: "Sample Video Project", amount: 5000, category: "Shoot", frequency: "By Date", date: "2026-09-15" }
    ],
    shoots: [
      { id: "s1", title: "Sample Production Shoot", date: "2026-09-15", category: "Solo Shoot", status: "Confirmed", completed: false }
    ]
  },
  logs: {}
};