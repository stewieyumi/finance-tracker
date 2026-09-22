/**
 * App.auth.test.tsx
 *
 * Regression tests for the P0 auth-expired fix:
 *  1. Concurrent auth-expired events must not trigger concurrent prompts.
 *  2. Both ft_google_token and ft_google_user must be removed on auth-expired.
 *  3. Successful silent re-auth clears the guard and restores the session.
 *  4. Failed re-auth triggers logout, clears the guard for future attempts.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

// @react-oauth/google: prevent real network calls and DOM embedding
vi.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GoogleLogin: () => <div data-testid="google-login" />,
  googleLogout: vi.fn(),
  useGoogleOneTapLogin: vi.fn(),
}));

// All hooks that touch cloud sync, keyboard shortcuts, etc. — keep tests focused
vi.mock("./hooks/useCloudSync", () => ({
  useCloudSync: () => ({
    commitDataChange: vi.fn(),
    isSyncing: false,
    isOnline: true,
    debugLog: "",
    setDebugLog: vi.fn(),
    forceManualSync: vi.fn(),
    pullLatestData: vi.fn(),
    pushToCloud: vi.fn(),
    promptPasscode: vi.fn(),
  }),
  getLocalPasscode: vi.fn(() => "eyJtest.token.here"),
}));

vi.mock("./hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock("./hooks/usePullToRefresh", () => ({
  usePullToRefresh: vi.fn(() => ({ pullProgress: 0 })),
}));

vi.mock("./hooks/useAppUpdate", () => ({
  useAppUpdate: vi.fn(() => ({ updateAvailable: false })),
}));

vi.mock("./hooks/useTheme", () => ({
  useTheme: vi.fn(),
}));

vi.mock("./hooks/useFinanceCalculations", () => ({
  useFinanceCalculations: vi.fn(() => ({
    activeBills: [],
    activeReceivables: [],
    activeShoots: [],
    totalLiquid: 0,
    targetMilestoneFund: 0,
    fundProgressPercent: 0,
    totalPendingReceivables: 0,
    monthIncomeCollected: 0,
    totalUnpaidCommitments: 0,
    priorityUnpaidSum: 0,
    overdueBills: [],
    overdueSum: 0,
    cashShortfall: 0,
    paydayAllocations: [],
    remainingBuffer: 0,
    billPaydayAllocations: [],
    allTransactions: [],
    recentTransactions: [],
  })),
}));

vi.mock("./hooks/useWalletActions", () => ({
  useWalletActions: vi.fn(() => ({ commitWallet: vi.fn(), incrementWallet: vi.fn() })),
}));

vi.mock("./hooks/useBillActions", () => ({
  useBillActions: vi.fn(() => ({
    addBill: vi.fn(),
    toggleBillStatus: vi.fn(),
    deleteBill: vi.fn(),
  })),
}));

vi.mock("./hooks/useReceivableActions", () => ({
  useReceivableActions: vi.fn(() => ({
    addReceivable: vi.fn(),
    toggleReceivableStatus: vi.fn(),
    addPayment: vi.fn(),
    deleteReceivable: vi.fn(),
  })),
}));

vi.mock("./hooks/useShootActions", () => ({
  useShootActions: vi.fn(() => ({
    addShoot: vi.fn(),
    toggleShootCompletion: vi.fn(),
    deleteShoot: vi.fn(),
  })),
}));

vi.mock("./hooks/useBillEditActions", () => ({
  useBillEditActions: vi.fn(() => ({ resetMonthOverride: vi.fn() })),
}));

vi.mock("./hooks/useBillSaveActions", () => ({
  useBillSaveActions: vi.fn(() => ({ saveBillEdit: vi.fn() })),
}));

vi.mock("./hooks/useReceivableSaveActions", () => ({
  useReceivableSaveActions: vi.fn(() => ({ saveReceivableEdit: vi.fn() })),
}));

vi.mock("./hooks/useShootSaveActions", () => ({
  useShootSaveActions: vi.fn(() => ({ saveShootEdit: vi.fn() })),
}));

vi.mock("./hooks/usePaydayActions", () => ({
  usePaydayActions: vi.fn(() => ({
    handleExecutePaydaySplit: vi.fn(),
    handleUndoPaydaySplit: vi.fn(),
  })),
}));

// Tab components — render nothing so tests stay fast
vi.mock("./components/DashboardTab", () => ({ DashboardTab: () => <div data-testid="dashboard-tab" /> }));
vi.mock("./components/OperationsTab", () => ({ OperationsTab: () => <div data-testid="ops-tab" /> }));
vi.mock("./components/WalletsTab", () => ({ WalletsTab: () => <div data-testid="wallets-tab" /> }));
vi.mock("./components/ExpensesTab", () => ({ ExpensesTab: () => <div data-testid="expenses-tab" /> }));
vi.mock("./components/AccountTab", () => ({ AccountTab: () => <div data-testid="account-tab" /> }));
vi.mock("./components/LandingPage", () => ({ LandingPage: () => <div data-testid="landing-page" /> }));
vi.mock("./components/BottomNav", () => ({ BottomNav: () => <div data-testid="bottom-nav" /> }));
vi.mock("./components/BillsTable", () => ({ BillsTable: () => null }));
vi.mock("./components/ReceivablesTable", () => ({ ReceivablesTable: () => null }));
vi.mock("./components/ShootsTable", () => ({ ShootsTable: () => null }));
vi.mock("./components/DateJumpModal", () => ({ DateJumpModal: () => null }));
vi.mock("./components/YearlyOverviewModal", () => ({ YearlyOverviewModal: () => null }));
vi.mock("./components/FinancialAnalyticsModal", () => ({ FinancialAnalyticsModal: () => null }));
vi.mock("./components/SettingsModal", () => ({ SettingsModal: () => null }));
vi.mock("./components/HistoricalLedgerModal", () => ({ HistoricalLedgerModal: () => null }));
vi.mock("./components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Now import App after all mocks are registered
import App from "./App";
import { googleLogout } from "@react-oauth/google";

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------

let store: Record<string, string> = {};
const mockStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { store = {}; }),
};
vi.stubGlobal("localStorage", mockStorage);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock Google GIS prompt that calls its callback with the given
 * notification state.
 */
function makePromptMock(state: "success" | "notDisplayed" | "skipped" | "dismissed") {
  return vi.fn((callback?: (notification: any) => void) => {
    if (callback) {
      callback({
        isNotDisplayed: () => state === "notDisplayed",
        isSkippedMoment: () => state === "skipped",
        isDismissedMoment: () => state === "dismissed",
      });
    }
  });
}

function seedAuthenticatedStorage() {
  store = {
    ft_google_token: "eyJtoken.valid.here",
    ft_google_user: JSON.stringify({ name: "Test User", email: "t@t.com", picture: "" }),
    ft_master_data_v1: JSON.stringify({
      wallets: { main: 0 },
      library: { bills: [], receivables: [], shoots: [] },
      logs: {},
      settings: {},
      updatedAt: 1000,
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("App — auth-expired handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedAuthenticatedStorage();
    // Default: no GIS available (tests opt-in per case)
    (window as any).google = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", mockStorage);
    (window as any).google = undefined;
    store = {};
  });

  // -------------------------------------------------------------------------
  // Test 1 — Duplicate auth-expired events must not trigger concurrent prompts
  // -------------------------------------------------------------------------
  it("Test 1: dispatching auth-expired twice calls the GIS prompt exactly once", async () => {
    // Use a prompt mock that never calls its callback, simulating a prompt
    // that is displayed and awaiting user interaction (i.e., still "in progress").
    // This is the exact scenario the guard exists to protect: two 401 responses
    // arrive before the first prompt has resolved. The guard must be true when
    // the second event fires.
    const neverResolvingPromptMock = vi.fn((_callback?: (n: any) => void) => {
      // Intentionally does NOT call _callback — the prompt is displayed but
      // the user has not interacted yet.
    });
    (window as any).google = { accounts: { id: { prompt: neverResolvingPromptMock } } };

    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      // First event: starts recovery (guard → true), calls prompt once.
      window.dispatchEvent(new Event("auth-expired"));
      // Second event: guard is still true (prompt hasn't resolved), must be dropped.
      window.dispatchEvent(new Event("auth-expired"));
    });

    expect(neverResolvingPromptMock).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 2 — Both localStorage keys must be removed on auth-expired
  // -------------------------------------------------------------------------
  it("Test 2: auth-expired removes both ft_google_token and ft_google_user", async () => {
    // No GIS — takes the else branch which calls handleGoogleLogout immediately
    (window as any).google = undefined;

    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      window.dispatchEvent(new Event("auth-expired"));
    });

    expect(mockStorage.removeItem).toHaveBeenCalledWith("ft_google_token");
    expect(mockStorage.removeItem).toHaveBeenCalledWith("ft_google_user");
  });

  // -------------------------------------------------------------------------
  // Test 3 — Successful silent re-auth: guard is cleared; future events work
  // -------------------------------------------------------------------------
  it("Test 3: after a successful prompt the guard is cleared and a subsequent auth-expired can trigger recovery", async () => {
    // First prompt succeeds (callback receives a non-failure notification —
    // i.e., none of isNotDisplayed/isSkipped/isDismissed are true).
    // We model this by not firing any of those methods as true.
    const successfulPromptMock = vi.fn((callback?: (n: any) => void) => {
      if (callback) {
        callback({
          isNotDisplayed: () => false,
          isSkippedMoment: () => false,
          isDismissedMoment: () => false,
        });
      }
    });
    (window as any).google = { accounts: { id: { prompt: successfulPromptMock } } };

    await act(async () => {
      render(<App />);
    });

    // First auth-expired → prompt fires once
    await act(async () => {
      window.dispatchEvent(new Event("auth-expired"));
    });

    expect(successfulPromptMock).toHaveBeenCalledTimes(1);

    // Guard should be cleared now (callback was called with success).
    // A second independent auth-expired event should trigger a second prompt.
    await act(async () => {
      window.dispatchEvent(new Event("auth-expired"));
    });

    expect(successfulPromptMock).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Test 4 — Failed re-auth: logout occurs, guard is cleared for future events
  // -------------------------------------------------------------------------
  it("Test 4: when the prompt is dismissed, logout runs and the guard is cleared for future events", async () => {
    const dismissedPromptMock = makePromptMock("dismissed");
    (window as any).google = { accounts: { id: { prompt: dismissedPromptMock } } };

    await act(async () => {
      render(<App />);
    });

    // First auth-expired → prompt fires and is dismissed → logout
    await act(async () => {
      window.dispatchEvent(new Event("auth-expired"));
    });

    expect(dismissedPromptMock).toHaveBeenCalledTimes(1);
    // googleLogout (from @react-oauth/google) should have been called
    expect(googleLogout).toHaveBeenCalledTimes(1);

    // Guard should be cleared — a subsequent auth-expired event should attempt
    // recovery again (another prompt call).
    await act(async () => {
      window.dispatchEvent(new Event("auth-expired"));
    });

    expect(dismissedPromptMock).toHaveBeenCalledTimes(2);
  });
});
