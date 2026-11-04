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
const mockCommitDataChange = vi.fn();
let mockHasInitialSyncCompleted = true;
let mockHasActiveConflict: boolean | undefined = undefined;
let mockConflictState: any = null;
const mockResolveConflict = vi.fn();
let mockSyncActiveSub: string | null | undefined = undefined;
const mockNotifyAuthTokenChanged = vi.fn();

vi.mock("./hooks/useCloudSync", () => ({
  useCloudSync: () => ({
    commitDataChange: mockCommitDataChange,
    isSyncing: false,
    isOnline: true,
    debugLog: "",
    setDebugLog: vi.fn(),
    forceManualSync: vi.fn(),
    pullLatestData: vi.fn(),
    pushToCloud: vi.fn(),
    promptPasscode: vi.fn(),
    hasInitialSyncCompleted: mockHasInitialSyncCompleted,
    hasActiveConflict: mockHasActiveConflict,
    conflictState: mockConflictState,
    resolveConflict: mockResolveConflict,
    activeSub: mockSyncActiveSub,
  }),
  getLocalPasscode: vi.fn(() => store["ft_google_token"] ?? ""),
  notifyAuthTokenChanged: (...args: any[]) => mockNotifyAuthTokenChanged(...args),
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

// Tab components — render nothing so tests stay fast, while capturing props for B2 assertions
const renderedDashboardTargetFunds: number[] = [];
let lastLandingOnGoogleSuccess: ((res: any) => void) | null = null;
let lastAccountOnGoogleLogout: (() => void) | null = null;

vi.mock("./components/DashboardTab", () => ({
  DashboardTab: (props: any) => {
    renderedDashboardTargetFunds.push(props.globalData?.targetFund);
    return <div data-testid="dashboard-tab" data-target-fund={props.globalData?.targetFund} />;
  },
}));
vi.mock("./components/OperationsTab", () => ({ OperationsTab: () => <div data-testid="ops-tab" /> }));
vi.mock("./components/WalletsTab", () => ({ WalletsTab: () => <div data-testid="wallets-tab" /> }));
vi.mock("./components/ExpensesTab", () => ({ ExpensesTab: () => <div data-testid="expenses-tab" /> }));
vi.mock("./components/AccountTab", () => ({
  AccountTab: (props: any) => {
    lastAccountOnGoogleLogout = props.onGoogleLogout;
    return <div data-testid="account-tab" />;
  },
}));
vi.mock("./components/LandingPage", () => ({
  LandingPage: (props: any) => {
    lastLandingOnGoogleSuccess = props.onGoogleSuccess;
    return <div data-testid="landing-page" />;
  },
}));
vi.mock("./components/BottomNav", () => ({
  BottomNav: (props: any) => (
    <div data-testid="bottom-nav">
      <button data-testid="nav-account" onClick={() => props.onChange("account")} />
    </div>
  ),
}));
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
    ft_google_token: "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig",
    ft_google_user: JSON.stringify({ sub: "user_123", name: "Test User", email: "t@t.com", picture: "" }),
    ft_master_data_v1_user_123: JSON.stringify({
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
    mockHasInitialSyncCompleted = true;
    mockHasActiveConflict = undefined;
    mockConflictState = null;
    mockSyncActiveSub = undefined;
    renderedDashboardTargetFunds.length = 0;
    lastLandingOnGoogleSuccess = null;
    lastAccountOnGoogleLogout = null;
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

  // -------------------------------------------------------------------------
  // P0-B2 Test 1 (App UI) — Same-tab A logout -> B login without stale-data flash
  // -------------------------------------------------------------------------
  it("B2-Test 1 (App UI): same-tab logout from A and login to B clears A's data before B data is shown and gates UI until B hydration completes", async () => {
    const tokenA = "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig";
    const tokenB = "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig";

    store = {
      ft_google_token: tokenA,
      ft_google_user: JSON.stringify({ sub: "user_123", name: "User A", email: "a@t.com", picture: "" }),
      ft_master_data_v1_user_123: JSON.stringify({
        wallets: { main: 55000 },
        library: { bills: [], receivables: [], shoots: [] },
        logs: {},
        settings: { hasCompletedOnboarding: true, hasMigratedBaseWallets: true },
        targetFund: 55000,
        updatedAt: 5000,
      }),
    };
    mockSyncActiveSub = "user_123";
    mockHasInitialSyncCompleted = true;

    let container!: HTMLElement;
    let rerender!: (ui: React.ReactElement) => void;
    await act(async () => {
      const rendered = render(<App />);
      container = rendered.container;
      rerender = rendered.rerender;
    });

    // Account A's dashboard is rendered with targetFund: 55000
    expect(container.querySelector('[data-testid="dashboard-tab"]')?.getAttribute("data-target-fund")).toBe("55000");

    // Navigate to Account tab to invoke same-tab logout
    await act(async () => {
      (container.querySelector('[data-testid="nav-account"]') as HTMLElement)?.click();
    });
    expect(lastAccountOnGoogleLogout).toBeTypeOf("function");

    // 1. Same-tab logout from Account A
    await act(async () => {
      mockSyncActiveSub = null;
      lastAccountOnGoogleLogout!();
    });

    // Landing page is rendered; no authenticated finance UI remains visible
    expect(container.querySelector('[data-testid="landing-page"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="dashboard-tab"]')).toBeNull();
    expect(mockNotifyAuthTokenChanged).toHaveBeenCalled();

    // 2. Same-tab login to Account B while B's initial cloud sync is still incomplete
    renderedDashboardTargetFunds.length = 0;
    mockHasInitialSyncCompleted = false;
    mockSyncActiveSub = "user_456";

    await act(async () => {
      lastLandingOnGoogleSuccess!({ credential: tokenB });
    });

    // Account A's 55000 was NEVER rendered for even a single intermediate frame under Account B,
    // and the hydration gate ("Checking for existing cloud data...") remains closed!
    expect(renderedDashboardTargetFunds).not.toContain(55000);
    expect(renderedDashboardTargetFunds).toHaveLength(0);
    expect(container.querySelector('[data-testid="dashboard-tab"]')).toBeNull();
    expect(container.textContent).toContain("Checking for existing cloud data...");

    // 3. Complete Account B's hydration with B's scoped data -> B's data renders cleanly
    store["ft_master_data_v1_user_456"] = JSON.stringify({
      wallets: { main: 24000 },
      library: { bills: [], receivables: [], shoots: [] },
      logs: {},
      settings: { hasCompletedOnboarding: true, hasMigratedBaseWallets: true },
      targetFund: 24000,
      updatedAt: 2000,
    });
    mockHasInitialSyncCompleted = true;

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "ft_google_token",
          newValue: tokenB,
        })
      );
      rerender(<App />);
    });

    expect(renderedDashboardTargetFunds).not.toContain(55000);
  });

  // -------------------------------------------------------------------------
  // P0-B2 Test 11 — Auto-migration gate in App.tsx
  // -------------------------------------------------------------------------
  it("B2-Test 11 (Auto-migration gate): migration effects do not run signed out or before hydration, and run only on hydrated active-account data", async () => {
    const tokenA = "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig";
    const unmigratedSnapshot = {
      wallets: { main: 1000 },
      library: {
        bills: [{ id: "b1", name: "Internet", amount: 1500, dueDay: 5 }], // missing .wallet
        receivables: [],
        shoots: [],
      },
      logs: {},
      settings: {
        hasCompletedOnboarding: true,
        hasMigratedBaseWallets: false, // unmigrated base wallets
      },
      targetFund: 10000,
      updatedAt: 1000,
    };

    // 1. Signed out (even if unscoped legacy key or user_123 key has unmigrated data)
    store = {
      ft_master_data_v1: JSON.stringify(unmigratedSnapshot),
      ft_master_data_v1_user_123: JSON.stringify(unmigratedSnapshot),
    };
    mockSyncActiveSub = null;
    mockHasInitialSyncCompleted = true;

    let rerender!: (ui: React.ReactElement) => void;
    await act(async () => {
      const rendered = render(<App />);
      rerender = rendered.rerender;
    });

    expect(mockCommitDataChange).not.toHaveBeenCalled();

    // 2. Signed in as user_123, but initial hydration is NOT yet complete (hasInitialSyncCompleted = false)
    store["ft_google_token"] = tokenA;
    store["ft_google_user"] = JSON.stringify({ sub: "user_123", name: "User A", email: "a@t.com", picture: "" });
    mockSyncActiveSub = "user_123";
    mockHasInitialSyncCompleted = false;

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "ft_google_token",
          newValue: tokenA,
        })
      );
      rerender(<App />);
    });

    expect(mockCommitDataChange).not.toHaveBeenCalled();

    // 3. Signed in as user_123, hydration is complete, but hook activeSub mismatches token sub (stale transition frame)
    mockSyncActiveSub = "user_999";
    mockHasInitialSyncCompleted = true;

    await act(async () => {
      rerender(<App />);
    });

    expect(mockCommitDataChange).not.toHaveBeenCalled();

    // 4. Active subject matches displayed data owner AND initial hydration is complete -> auto-migrations run!
    mockSyncActiveSub = "user_123";
    mockHasInitialSyncCompleted = true;

    await act(async () => {
      rerender(<App />);
    });

    expect(mockCommitDataChange).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // P0-B2 Follow-up — Persisted Conflict Recovery UI Reachability (Cases A, B, C, D)
  // -------------------------------------------------------------------------
  it("Case A (App UI): valid persisted conflict with absent/invalid scoped local snapshot reaches SyncConflictModal without deadlock or foreign data leak", async () => {
    const tokenA = "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig";
    const conflictA = {
      baseRevision: 4,
      localSnapshot: {
        wallets: { main: 0 },
        library: { bills: [], receivables: [], shoots: [] },
        logs: {},
        settings: {},
        targetFund: 33000,
        updatedAt: 2100,
      },
      cloudSnapshot: {
        wallets: { main: 0 },
        library: { bills: [], receivables: [], shoots: [] },
        logs: {},
        settings: {},
        targetFund: 44000,
        updatedAt: 2600,
      },
      cloudRevision: 9,
      detectedAt: 150000,
    };

    // Scoped local snapshot is absent; unscoped legacy key has unrelated user_B data (99000)
    store = {
      ft_google_token: tokenA,
      ft_google_user: JSON.stringify({ sub: "user_123", name: "User A", email: "a@t.com", picture: "" }),
      ft_sync_conflict_user_123: JSON.stringify(conflictA),
      ft_master_data_v1: JSON.stringify({
        wallets: { main: 99000 },
        library: { bills: [], receivables: [], shoots: [] },
        logs: {},
        settings: { hasCompletedOnboarding: true },
        targetFund: 99000,
        updatedAt: 9900,
      }),
    };
    mockSyncActiveSub = "user_123";
    mockHasInitialSyncCompleted = false;
    mockHasActiveConflict = true;
    mockConflictState = conflictA;

    let container!: HTMLElement;
    await act(async () => {
      const rendered = render(<App />);
      container = rendered.container;
    });

    // App does not deadlock on "Checking for existing cloud data..." or show OnboardingWizard
    expect(container.textContent).not.toContain("Checking for existing cloud data...");
    expect(document.body.textContent).toContain("Sync Conflict Detected");
    expect(document.body.textContent).toContain("Keep This Device Data");
    expect(document.body.textContent).toContain("Use Cloud Data");
    expect(document.body.textContent).toContain("Revision: 9");

    // Local state comes from user_123's validated conflict localSnapshot (33000), never unscoped 99000
    expect(renderedDashboardTargetFunds).toEqual([33000]);
    // Auto-migrations are suppressed while conflict is unresolved
    expect(mockCommitDataChange).not.toHaveBeenCalled();
  });

  it("Case B (App UI): valid persisted conflict with scoped local snapshot present preserves scoped snapshot and exposes SyncConflictModal", async () => {
    const tokenA = "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig";
    const conflictA = {
      baseRevision: 4,
      localSnapshot: {
        wallets: { main: 0 },
        library: { bills: [], receivables: [], shoots: [] },
        logs: {},
        settings: {},
        targetFund: 33000,
        updatedAt: 2100,
      },
      cloudSnapshot: {
        wallets: { main: 0 },
        library: { bills: [], receivables: [], shoots: [] },
        logs: {},
        settings: {},
        targetFund: 44000,
        updatedAt: 2600,
      },
      cloudRevision: 9,
      detectedAt: 150000,
    };

    store = {
      ft_google_token: tokenA,
      ft_google_user: JSON.stringify({ sub: "user_123", name: "User A", email: "a@t.com", picture: "" }),
      ft_master_data_v1_user_123: JSON.stringify({
        wallets: { main: 0 },
        library: { bills: [], receivables: [], shoots: [] },
        logs: {},
        settings: {},
        targetFund: 37500,
        updatedAt: 2400,
      }),
      ft_sync_conflict_user_123: JSON.stringify(conflictA),
    };
    mockSyncActiveSub = "user_123";
    mockHasInitialSyncCompleted = false;
    mockHasActiveConflict = true;
    mockConflictState = conflictA;

    let container!: HTMLElement;
    await act(async () => {
      const rendered = render(<App />);
      container = rendered.container;
    });

    expect(container.textContent).not.toContain("Checking for existing cloud data...");
    expect(document.body.textContent).toContain("Sync Conflict Detected");
    // Scoped snapshot (37500) remains the displayed local state
    expect(renderedDashboardTargetFunds).toEqual([37500]);
    expect(mockResolveConflict).not.toHaveBeenCalled();
  });

  it("Case C & Case D (App UI): account transition with persisted conflict exposes only B's conflict, and invalid conflict does not bypass hydration gate", async () => {
    const tokenA = "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig";
    const tokenB = "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig";
    const conflictB = {
      baseRevision: 8,
      localSnapshot: {
        wallets: { main: 0 },
        library: { bills: [], receivables: [], shoots: [] },
        logs: {},
        settings: {},
        targetFund: 61000,
        updatedAt: 6100,
      },
      cloudSnapshot: {
        wallets: { main: 0 },
        library: { bills: [], receivables: [], shoots: [] },
        logs: {},
        settings: {},
        targetFund: 68000,
        updatedAt: 6800,
      },
      cloudRevision: 14,
      detectedAt: 200000,
    };

    // Case D first: user_123 has a malformed conflict record and unhydrated state -> stays behind loading gate
    store = {
      ft_google_token: tokenA,
      ft_google_user: JSON.stringify({ sub: "user_123", name: "User A", email: "a@t.com", picture: "" }),
      ft_sync_conflict_user_123: JSON.stringify({
        baseRevision: 1,
        localSnapshot: { invalidSchema: true },
        cloudSnapshot: {},
        cloudRevision: "bad",
        detectedAt: -1,
      }),
      ft_sync_conflict_user_456: JSON.stringify(conflictB),
    };
    mockSyncActiveSub = "user_123";
    mockHasInitialSyncCompleted = false;
    mockHasActiveConflict = false;
    mockConflictState = null;

    let container!: HTMLElement;
    let rerender!: (ui: React.ReactElement) => void;
    await act(async () => {
      const rendered = render(<App />);
      container = rendered.container;
      rerender = rendered.rerender;
    });

    // Invalid conflict does not bypass normal hydration
    expect(container.textContent).toContain("Checking for existing cloud data...");
    expect(document.body.textContent).not.toContain("Sync Conflict Detected");
    expect(renderedDashboardTargetFunds).toHaveLength(0);

    // Case C: switch to user_456 where user_456 has a valid persisted conflict (conflictB)
    store["ft_google_token"] = tokenB;
    store["ft_google_user"] = JSON.stringify({ sub: "user_456", name: "User B", email: "b@t.com", picture: "" });
    mockSyncActiveSub = "user_456";
    mockHasInitialSyncCompleted = false;
    mockHasActiveConflict = true;
    mockConflictState = conflictB;

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "ft_google_token",
          newValue: tokenB,
        })
      );
      rerender(<App />);
    });

    expect(container.textContent).not.toContain("Checking for existing cloud data...");
    expect(document.body.textContent).toContain("Sync Conflict Detected");
    expect(document.body.textContent).toContain("Revision: 14");
    expect(renderedDashboardTargetFunds).toEqual([61000]);
  });
});
