import { describe, it, expect } from "vitest";
import {
  isReturningUser,
  shouldShowOnboarding,
  hasFinancialData,
  hasConfiguredSettings,
} from "./onboardingHelpers";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import { UnifiedFinanceData } from "../types/finance";

describe("onboardingHelpers", () => {
  describe("isReturningUser", () => {
    it("returns false for null or undefined data", () => {
      expect(isReturningUser(null)).toBe(false);
      expect(isReturningUser(undefined)).toBe(false);
    });

    it("returns false for stock INITIAL_UNIFIED_DATA", () => {
      expect(isReturningUser(INITIAL_UNIFIED_DATA)).toBe(false);
    });

    it("returns false when freshly initialized dataset has an updatedAt > 0 timestamp but no custom settings or financial records", () => {
      const freshDataWithTimestamp: UnifiedFinanceData = {
        ...INITIAL_UNIFIED_DATA,
        updatedAt: 1780000000000,
      };
      // Must not falsely mark this user as returning
      expect(isReturningUser(freshDataWithTimestamp)).toBe(false);
    });

    it("returns true when hasCompletedOnboarding is explicitly true", () => {
      const data: UnifiedFinanceData = {
        ...INITIAL_UNIFIED_DATA,
        settings: {
          ...INITIAL_UNIFIED_DATA.settings,
          hasCompletedOnboarding: true,
        },
      };
      expect(isReturningUser(data)).toBe(true);
    });

    describe("Returning user with NO wallet balance, NO transactions, NO bills, NO receivables", () => {
      it("returns true if user configured custom perPayoutSalary", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          wallets: { main: 0, savings: 0, cash: 0 },
          library: { bills: [], receivables: [], shoots: [], expenses: [], manualTransactions: [] },
          settings: {
            ...INITIAL_UNIFIED_DATA.settings,
            perPayoutSalary: 25000,
          },
        };
        expect(isReturningUser(data)).toBe(true);
      });

      it("returns true if user configured custom goalName", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          wallets: { main: 0, savings: 0, cash: 0 },
          settings: {
            ...INITIAL_UNIFIED_DATA.settings,
            goalName: "Emergency Fund 2026",
          },
        };
        expect(isReturningUser(data)).toBe(true);
      });

      it("returns true if user configured custom targetFund", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          wallets: { main: 0, savings: 0, cash: 0 },
          settings: {
            ...INITIAL_UNIFIED_DATA.settings,
            targetFund: 200000,
          },
        };
        expect(isReturningUser(data)).toBe(true);
      });

      it("returns true if user configured custom payday schedule", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          wallets: { main: 0, savings: 0, cash: 0 },
          settings: {
            ...INITIAL_UNIFIED_DATA.settings,
            paydayDays: [10, 25],
          },
        };
        expect(isReturningUser(data)).toBe(true);
      });

      it("returns true if user configured custom theme", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          wallets: { main: 0, savings: 0, cash: 0 },
          settings: {
            ...INITIAL_UNIFIED_DATA.settings,
            theme: "light",
          },
        };
        expect(isReturningUser(data)).toBe(true);
      });

      it("returns true if user customized customWallets labels", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          wallets: { bdo: 0 },
          settings: {
            ...INITIAL_UNIFIED_DATA.settings,
            customWallets: [{ id: "bdo", label: "BDO Savings", color: "text-blue-400" }],
          },
        };
        expect(isReturningUser(data)).toBe(true);
      });
    });

    describe("Financial data detection", () => {
      it("returns true when library has bills", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          library: {
            ...INITIAL_UNIFIED_DATA.library,
            bills: [{ id: "b1", name: "Rent", amount: 10000, dueDay: "1", type: "Bill" }],
          },
        };
        expect(isReturningUser(data)).toBe(true);
      });

      it("returns true when library has receivables", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          library: {
            ...INITIAL_UNIFIED_DATA.library,
            receivables: [{ id: "r1", name: "Client A", amount: 5000, frequency: "Monthly" }],
          },
        };
        expect(isReturningUser(data)).toBe(true);
      });

      it("returns true when library has expenses", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          library: {
            ...INITIAL_UNIFIED_DATA.library,
            expenses: [{ id: "e1", merchant: "Store", amount: 100, category: "Other", wallet: "main", date: "2026-09-01" }],
          },
        };
        expect(isReturningUser(data)).toBe(true);
      });

      it("returns true when library has shoots", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          library: {
            ...INITIAL_UNIFIED_DATA.library,
            shoots: [{ id: "s1", title: "Commercial", status: "Confirmed", completed: false }],
          },
        };
        expect(isReturningUser(data)).toBe(true);
      });

      it("returns true when library has manual transactions", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          library: {
            ...INITIAL_UNIFIED_DATA.library,
            manualTransactions: [{ id: "mt1", title: "ATM Cash", amount: 500, type: "expense", date: "2026-09-01", createdAt: 1 }],
          },
        };
        expect(isReturningUser(data)).toBe(true);
      });

      it("returns true when paydaySplitExecutions is populated", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          paydaySplitExecutions: ["2026-09-15"],
        };
        expect(isReturningUser(data)).toBe(true);
      });

      it("returns true when month logs exist", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          logs: {
            "September 2026": { billsPaid: ["b1"] },
          },
        };
        expect(isReturningUser(data)).toBe(true);
      });

      it("returns true when any wallet has a non-zero balance", () => {
        const data: UnifiedFinanceData = {
          ...INITIAL_UNIFIED_DATA,
          wallets: { main: 5000, savings: 0, cash: 0 },
        };
        expect(isReturningUser(data)).toBe(true);
      });
    });
  });

  describe("shouldShowOnboarding", () => {
    it("returns false if user is not authenticated", () => {
      expect(
        shouldShowOnboarding({
          globalData: INITIAL_UNIFIED_DATA,
          isAuth: false,
          hasInitialSyncCompleted: true,
        })
      ).toBe(false);
    });

    it("returns false if user is a returning user, even if initial sync is done", () => {
      const returningData: UnifiedFinanceData = {
        ...INITIAL_UNIFIED_DATA,
        settings: {
          ...INITIAL_UNIFIED_DATA.settings,
          goalName: "House",
        },
      };

      expect(
        shouldShowOnboarding({
          globalData: returningData,
          isAuth: true,
          hasInitialSyncCompleted: true,
        })
      ).toBe(false);
    });

    it("returns false while initial sync has not completed (prevents race condition)", () => {
      expect(
        shouldShowOnboarding({
          globalData: INITIAL_UNIFIED_DATA,
          isAuth: true,
          hasInitialSyncCompleted: false,
        })
      ).toBe(false);
    });

    it("returns true when authenticated, sync has completed, and user is genuinely new", () => {
      expect(
        shouldShowOnboarding({
          globalData: INITIAL_UNIFIED_DATA,
          isAuth: true,
          hasInitialSyncCompleted: true,
        })
      ).toBe(true);
    });
  });
});
