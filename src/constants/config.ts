// Global Application Constants & Data Types

export const MONTH_LIST = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const MONTHS = MONTH_LIST;

export const YEAR_LIST = [
  "2024", "2025", "2026", "2027", "2028", "2029", "2030"
];

// Generate dynamic month/year combinations (e.g., "September 2026")
export const ALL_MONTH_YEAR_OPTIONS: string[] = [];
YEAR_LIST.forEach(y => {
  MONTH_LIST.forEach(m => {
    ALL_MONTH_YEAR_OPTIONS.push(`${m} ${y}`);
  });
});

export const CATEGORIES = [
  "Subscription",
  "Bill",
  "Loan / Debt",
  "Savings / Target",
  "Credit Card",
  "Other"
] as const;

export const FUND_MILESTONES = [
  1000, 5000, 10000, 20000, 40000, 60000, 80000
];
