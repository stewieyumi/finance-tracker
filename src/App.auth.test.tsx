import { getGoogleSubFromToken } from "./utils/financeAuth";
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

// @react-oauth/google: prevent real network calls and DOM embedding
vi.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GoogleLogin: ({ onSuccess }: { onSuccess: (response: { credential: string }) => void }) => {
    reconnectWithGoogle = onSuccess;
    return <div data-testid="google-login" />;
  },
  googleLogout: vi.fn(),
  useGoogleOneTapLogin: vi.fn(),
}));

// All hooks that touch cloud sync, keyboard shortcuts, etc. — keep tests focused
const mockCommitDataChange = vi.fn();
let mockSyncNeedsSignIn = false;
let mockUpdateAvailable = false;
let mockCanReloadSafely = true;
let mockIsSyncing = false;
let reconnectWithGoogle: ((response: { credential: string }) => void) | undefined;
let mockHasInitialSyncCompleted = true;
let mockHasActiveConflict: boolean | undefined = undefined;
let mockConflictState: any = null;
const mockResolveConflict = vi.fn();
let mockSyncActiveSub: string | null | undefined = undefined;
const mockNotifyAuthTokenChanged = vi.fn();

vi.mock("./hooks/useCloudSync", () => ({
  useCloudSync: () => ({
    commitDataChange: mockCommitDataChange,
    canReloadSafely: () => mockCanReloadSafely,
    isSyncing: mockIsSyncing,
    isOnline: true,
    syncNeedsSignIn: mockSyncNeedsSignIn,
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
  useAppUpdate: vi.fn(() => ({ updateAvailable: mockUpdateAvailable })),
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

function seedAuthenticatedStorage() {
  store = {
    ft_google_token: "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig",
    ft_google_user: JSON.stringify({ sub: "user_123", name: "Test User", email: "t@t.com", picture: "" }),
    ft_master_data_v1_user_123: JSON.stringify({
      wallets: { main: 0 },
      library: { bills: [], receivables: [], shoots: [] },
      logs: {},
      settings: { hasCompletedOnboarding: true },
      updatedAt: 1000,
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("App — Google session recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedAuthenticatedStorage();
    mockSyncNeedsSignIn = false;
    mockUpdateAvailable = false;
    mockCanReloadSafely = true;
    mockIsSyncing = false;
    reconnectWithGoogle = undefined;
    mockHasInitialSyncCompleted = true;
    mockHasActiveConflict = undefined;
    mockConflictState = null;
    mockSyncActiveSub = undefined;
    renderedDashboardTargetFunds.length = 0;
    lastLandingOnGoogleSuccess = null;
    lastAccountOnGoogleLogout = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url !== "/api/session") throw new Error("Unexpected request");
      const { credential, expectedSub, action } = JSON.parse(String(init.body));
      if (action === "logout") return new Response(null, { status: 204 });
      const sub = getGoogleSubFromToken(credential);
      if (!sub || (expectedSub && sub !== expectedSub)) return new Response(null, { status: 409 });
      return Response.json({ profile: { sub, name: "Test User" }, binding: "a".repeat(32) });
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", mockStorage);
    store = {};
  });

  it.each(['form', 'dialog'])("preserves an open %s when the update banner is pressed", async kind => {
    mockUpdateAvailable = true;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const draft = document.createElement(kind === "form" ? "form" : "div");
    if (kind === "dialog") draft.setAttribute("aria-modal", "true");
    draft.innerHTML = '<input value="Unsaved entry" />';
    document.body.append(draft);
    try {
      render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: /new update available/i }));
      expect(screen.getByText("Finish or cancel your open entry before updating the app.")).toBeInTheDocument();
      expect(draft.querySelector("input")?.value).toBe("Unsaved entry");
      expect(confirm).not.toHaveBeenCalled();
    } finally {
      draft.remove();
    }
  });

  it.each(["pending", "syncing", "sign-in", "conflict", "hydrating"])("blocks update reload during %s", async state => {
    mockUpdateAvailable = true;
    mockCanReloadSafely = state !== "pending";
    mockIsSyncing = state === "syncing";
    mockSyncNeedsSignIn = state === "sign-in";
    mockHasActiveConflict = state === "conflict";
    mockHasInitialSyncCompleted = state !== "hydrating";
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /new update available/i }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText(state === "sign-in"
      ? "Reconnect cloud sync before updating the app."
      : state === "conflict"
        ? "Resolve the sync conflict before updating the app."
        : "Wait for your changes to finish syncing before updating the app.")).toBeInTheDocument();
  });

  it("asks before refreshing a clean app and respects Cancel", async () => {
    mockUpdateAvailable = true;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /new update available/i }));
    expect(confirm).toHaveBeenCalledWith("Refresh Finance Tracker to install the update?");
    expect(screen.getByRole("button", { name: /new update available/i })).toBeInTheDocument();
  });

  it("keeps the dashboard and account open while cloud sync needs sign-in", () => {
    mockSyncNeedsSignIn = true;
    const token = store.ft_google_token;

    render(<App />);

    expect(screen.getByTestId("dashboard-tab")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Cloud sync paused" })).toBeInTheDocument();
    expect(store.ft_google_token).toBe(token);
    expect(googleLogout).not.toHaveBeenCalled();
  });

  it("accepts a fresh credential for the open account without reloading its data", async () => {
    mockSyncNeedsSignIn = true;
    render(<App />);
    const freshToken = "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.fresh";
    // An out-of-date persisted copy should not replace the current dashboard.
    store.ft_master_data_v1_user_123 = JSON.stringify({
      ...JSON.parse(store.ft_master_data_v1_user_123), targetFund: 999,
    });
    await act(async () => reconnectWithGoogle!({ credential: freshToken }));

    expect(store.ft_google_token).toBeUndefined();
    expect(JSON.parse(store.ft_app_session)).toMatchObject({ profile: { sub: "user_123" } });
    expect(mockNotifyAuthTokenChanged).toHaveBeenCalled();
    expect(renderedDashboardTargetFunds).not.toContain(999);
  });

  it("rejects another Google account during reconnect", async () => {
    mockSyncNeedsSignIn = true;
    const token = store.ft_google_token;
    render(<App />);
    await act(async () => reconnectWithGoogle!({ credential: "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig" }));

    expect(store.ft_google_token).toBe(token);
    expect(mockNotifyAuthTokenChanged).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Cloud sync paused" })).toBeInTheDocument();
  });

  it("reopens a remembered app session without a Google token and revokes it on sign-out", async () => {
    delete store.ft_google_token;
    delete store.ft_google_user;
    const binding = "a".repeat(32);
    store.ft_app_session = JSON.stringify({ profile: { sub: "user_123", name: "Test User" }, binding });
    render(<App />);
    expect(screen.getByTestId("dashboard-tab")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => screen.getByTestId("nav-account").click());
    await act(async () => lastAccountOnGoogleLogout!());
    expect(fetch).toHaveBeenCalledWith("/api/session", expect.objectContaining({
      headers: expect.objectContaining({ "X-Finance-Session": binding }),
      body: JSON.stringify({ action: "logout" }),
    }));
    expect(store.ft_app_session).toBeUndefined();
    expect(screen.getByTestId("landing-page")).toBeInTheDocument();
  });

  it("offers reconnect instead of onboarding when the first cloud pull needs sign-in", () => {
    mockSyncNeedsSignIn = true;
    mockHasInitialSyncCompleted = false;
    delete store.ft_master_data_v1_user_123;
    render(<App />);

    expect(screen.getByRole("region", { name: "Cloud sync paused" })).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-tab")).not.toBeInTheDocument();
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
