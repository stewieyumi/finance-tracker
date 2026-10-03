import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";
import { INITIAL_UNIFIED_DATA } from "./constants/initialData";
import { UnifiedFinanceData } from "./types/finance";

// Module mocks
vi.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GoogleLogin: () => <div data-testid="google-login" />,
  googleLogout: vi.fn(),
  useGoogleOneTapLogin: vi.fn(),
}));

vi.mock("./hooks/useCloudSync", () => ({
  useCloudSync: (_data: any, setGlobalData: any) => ({
    commitDataChange: vi.fn((action: any) => {
      setGlobalData((prev: any) => {
        const next = typeof action === "function" ? action(prev) : action;
        localStorage.setItem("ft_master_data_v1", JSON.stringify(next));
        return next;
      });
    }),
    isSyncing: false,
    isOnline: true,
    debugLog: "",
    setDebugLog: vi.fn(),
    forceManualSync: vi.fn(),
    pullLatestData: vi.fn(),
    pushToCloud: vi.fn(),
    promptPasscode: vi.fn(),
    hasInitialSyncCompleted: true,
  }),
  getLocalPasscode: vi.fn(() => "mock-token"),
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

let store: Record<string, string> = {};
const mockStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { store = {}; }),
};
vi.stubGlobal("localStorage", mockStorage);

describe("App - Notifications Integration", () => {
  beforeEach(() => {
    localStorage.clear();
    const testData: UnifiedFinanceData = {
      ...INITIAL_UNIFIED_DATA,
      library: {
        ...INITIAL_UNIFIED_DATA.library,
        bills: [
          { id: "b1", name: "Gym Membership", amount: 1200, dueDay: "1", type: "Subscription" },
        ],
        expenses: [],
        manualTransactions: [],
      },
      logs: {},
      settings: {
        ...INITIAL_UNIFIED_DATA.settings,
        hasCompletedOnboarding: true,
      },
    };
    localStorage.setItem("ft_master_data_v1", JSON.stringify(testData));
  });

  it("renders notification bell in header and opens notification modal", () => {
    render(<App />);

    const bellBtn = screen.getByRole("button", { name: "Notifications" });
    expect(bellBtn).toBeInTheDocument();

    // Click to open notification center
    fireEvent.click(bellBtn);

    const dialog = screen.getByRole("dialog", { name: "Notification Center" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Overdue: Gym Membership")).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByRole("button", { name: /close notification center/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole("dialog", { name: "Notification Center" })).not.toBeInTheDocument();
  });

  it("navigates to operations/bills when clicking View Bills on commitment notification", () => {
    render(<App />);

    const bellBtn = screen.getByRole("button", { name: "Notifications" });
    fireEvent.click(bellBtn);

    const viewBillsBtn = screen.getByRole("button", { name: /view bills/i });
    fireEvent.click(viewBillsBtn);

    // Modal should close and operations tab should become active
    expect(screen.queryByRole("dialog", { name: "Notification Center" })).not.toBeInTheDocument();
  });

  it("dismisses grouped notification by persisting constituent IDs to settings", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));

      const groupData: UnifiedFinanceData = {
        ...INITIAL_UNIFIED_DATA,
        library: {
          ...INITIAL_UNIFIED_DATA.library,
          bills: [
            { id: "b1", name: "Bill 1", amount: 100, dueDay: "16", type: "Bill" },
            { id: "b2", name: "Bill 2", amount: 200, dueDay: "16", type: "Bill" },
            { id: "b3", name: "Bill 3", amount: 300, dueDay: "17", type: "Bill" },
            { id: "b4", name: "Bill 4", amount: 400, dueDay: "17", type: "Bill" },
          ],
          expenses: [],
          manualTransactions: [],
        },
        logs: {},
        settings: {
          ...INITIAL_UNIFIED_DATA.settings,
          hasCompletedOnboarding: true,
        },
      };
      localStorage.setItem("ft_master_data_v1", JSON.stringify(groupData));

      render(<App />);

      const bellBtn = screen.getByRole("button", { name: "Notifications" });
      fireEvent.click(bellBtn);

      expect(screen.getByText("4 Upcoming Bills")).toBeInTheDocument();

      const dismissBtn = screen.getByRole("button", { name: "Dismiss 4 Upcoming Bills" });
      fireEvent.click(dismissBtn);

      // Modal should show empty state
      expect(screen.getByText("All caught up!")).toBeInTheDocument();

      // Verify localStorage was updated with all 4 constituent IDs
      const saved = JSON.parse(mockStorage.setItem.mock.calls.at(-1)?.[1] || "{}");
      const dismissed = saved.settings?.dismissedNotifications || {};

      expect(dismissed["upcoming_bill_b1_October 2026"]).toBeDefined();
      expect(dismissed["upcoming_bill_b2_October 2026"]).toBeDefined();
      expect(dismissed["upcoming_bill_b3_October 2026"]).toBeDefined();
      expect(dismissed["upcoming_bill_b4_October 2026"]).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears all notifications including constituent IDs when Clear All is clicked", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));

      const groupData: UnifiedFinanceData = {
        ...INITIAL_UNIFIED_DATA,
        library: {
          ...INITIAL_UNIFIED_DATA.library,
          bills: [
            { id: "b1", name: "Bill 1", amount: 100, dueDay: "16", type: "Bill" },
            { id: "b2", name: "Bill 2", amount: 200, dueDay: "16", type: "Bill" },
            { id: "b3", name: "Bill 3", amount: 300, dueDay: "17", type: "Bill" },
            { id: "b4", name: "Bill 4", amount: 400, dueDay: "17", type: "Bill" },
          ],
          expenses: [],
          manualTransactions: [],
        },
        logs: {},
        settings: {
          ...INITIAL_UNIFIED_DATA.settings,
          hasCompletedOnboarding: true,
        },
      };
      localStorage.setItem("ft_master_data_v1", JSON.stringify(groupData));

      render(<App />);

      const bellBtn = screen.getByRole("button", { name: "Notifications" });
      fireEvent.click(bellBtn);

      const clearAllBtn = screen.getByRole("button", { name: /clear all/i });
      fireEvent.click(clearAllBtn);

      expect(screen.getByText("All caught up!")).toBeInTheDocument();

      const saved = JSON.parse(mockStorage.setItem.mock.calls.at(-1)?.[1] || "{}");
      const dismissed = saved.settings?.dismissedNotifications || {};

      expect(dismissed["upcoming_bill_b1_October 2026"]).toBeDefined();
      expect(dismissed["upcoming_bill_b2_October 2026"]).toBeDefined();
      expect(dismissed["upcoming_bill_b3_October 2026"]).toBeDefined();
      expect(dismissed["upcoming_bill_b4_October 2026"]).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
