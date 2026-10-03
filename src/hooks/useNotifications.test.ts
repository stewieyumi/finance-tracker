import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { deriveNotifications, useNotifications, calculateDaysUntil } from "./useNotifications";
import { UnifiedFinanceData } from "../types/finance";

const createMockData = (overrides: Partial<UnifiedFinanceData> = {}): UnifiedFinanceData => ({
  wallets: { main: 1000 },
  library: {
    bills: [],
    receivables: [],
    shoots: [],
    expenses: [],
    manualTransactions: [],
  },
  logs: {},
  settings: {
    theme: "dark",
  },
  ...overrides,
});

describe("calculateDaysUntil", () => {
  it("calculates exact days relative to given today date", () => {
    const today = new Date(2026, 9, 15); // Oct 15, 2026
    expect(calculateDaysUntil(15, "October 2026", today)).toBe(0); // Due today
    expect(calculateDaysUntil(16, "October 2026", today)).toBe(1); // Tomorrow
    expect(calculateDaysUntil(18, "October 2026", today)).toBe(3); // 3 days
    expect(calculateDaysUntil(10, "October 2026", today)).toBe(-5); // 5 days overdue
  });
});

describe("deriveNotifications", () => {
  const fixedDate = new Date(2026, 9, 15); // Oct 15, 2026

  it("derives overdue commitments correctly", () => {
    const data = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Electric Bill", amount: 2500, dueDay: "10", type: "Bill" },
        ],
        receivables: [],
        shoots: [],
      },
    });

    const notifs = deriveNotifications(data, fixedDate);
    const overdue = notifs.find(n => n.type === "overdue_commitment");

    expect(overdue).toBeDefined();
    expect(overdue?.id).toBe("overdue_bill_b1_October 2026");
    expect(overdue?.title).toBe("Overdue: Electric Bill");
    expect(overdue?.message).toContain("5 days ago");
    expect(overdue?.actionRoute).toBe("operations/bills");
  });

  it("derives upcoming commitments due within 3 days", () => {
    const data = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Internet", amount: 1500, dueDay: "18", type: "Bill" }, // 3 days left
          { id: "b2", name: "Rent", amount: 15000, dueDay: "25", type: "Bill" }, // 10 days left (not upcoming)
        ],
        receivables: [],
        shoots: [],
      },
    });

    const notifs = deriveNotifications(data, fixedDate);
    const upcoming = notifs.filter(n => n.type === "upcoming_commitment");

    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].id).toBe("upcoming_bill_b1_October 2026");
    expect(upcoming[0].title).toBe("Upcoming: Internet");
    expect(upcoming[0].message).toContain("due in 3 days");
  });

  it("handles due-today behavior accurately", () => {
    const data = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Subscription", amount: 300, dueDay: "15", type: "Subscription" },
        ],
        receivables: [],
        shoots: [],
      },
    });

    const notifs = deriveNotifications(data, fixedDate);
    const todayNotif = notifs.find(n => n.id === "upcoming_bill_b1_October 2026");

    expect(todayNotif).toBeDefined();
    expect(todayNotif?.message).toContain("is due today");
  });

  it("derives pending receivables within threshold (due within 3 days or already due)", () => {
    const data = createMockData({
      library: {
        bills: [],
        receivables: [
          // Due in 2 days (Oct 17) -> within 3 days
          { id: "r1", name: "Client A", amount: 5000, frequency: "By Date", date: "2026-10-17" },
          // Already due / past due (Oct 10) -> overdue
          { id: "r2", name: "Client B", amount: 8000, frequency: "By Date", date: "2026-10-10" },
          // Due far in future (Oct 28) -> should NOT alert
          { id: "r3", name: "Client C", amount: 10000, frequency: "By Date", date: "2026-10-28" },
        ],
        shoots: [],
      },
    });

    const notifs = deriveNotifications(data, fixedDate);
    const pending = notifs.filter(n => n.type === "pending_receivable");

    expect(pending).toHaveLength(2);
    expect(pending.some(p => p.id === "pending_rec_r1_October 2026")).toBe(true);
    expect(pending.some(p => p.id === "pending_rec_r2_October 2026")).toBe(true);
    expect(pending.some(p => p.id === "pending_rec_r3_October 2026")).toBe(false);
  });

  it("produces no notification for invalid or malformed By Date receivables", () => {
    const data = createMockData({
      library: {
        bills: [],
        receivables: [
          { id: "r1", name: "Empty Date", amount: 5000, frequency: "By Date", date: "" },
          { id: "r2", name: "Undefined Date", amount: 6000, frequency: "By Date", date: undefined },
          { id: "r3", name: "Invalid Date String", amount: 7000, frequency: "By Date", date: "not-a-date" },
          { id: "r4", name: "Malformed Month", amount: 8000, frequency: "By Date", date: "2026-99-99" },
        ],
        shoots: [],
      },
    });

    const notifs = deriveNotifications(data, fixedDate);
    const pending = notifs.filter(n => n.type === "pending_receivable");
    expect(pending).toHaveLength(0);
  });

  it("filters out dismissed notifications", () => {
    const data = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Electric Bill", amount: 2500, dueDay: "10", type: "Bill" },
        ],
        receivables: [],
        shoots: [],
      },
      settings: {
        theme: "dark",
        dismissedNotifications: {
          "overdue_bill_b1_October 2026": Date.now(),
        },
      },
    });

    const notifs = deriveNotifications(data, fixedDate);
    expect(notifs).toHaveLength(0);
  });

  it("generates deterministic IDs", () => {
    const data = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Water", amount: 500, dueDay: "12", type: "Bill" },
        ],
        receivables: [],
        shoots: [],
      },
    });

    const notifs1 = deriveNotifications(data, fixedDate);
    const notifs2 = deriveNotifications(data, fixedDate);

    expect(notifs1[0].id).toBe("overdue_bill_b1_October 2026");
    expect(notifs1[0].id).toBe(notifs2[0].id);
  });

  it("removes notification naturally when bill is resolved/paid", () => {
    const unpaidData = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Water", amount: 500, dueDay: "12", type: "Bill" },
        ],
        receivables: [],
        shoots: [],
      },
    });
    expect(deriveNotifications(unpaidData, fixedDate)).toHaveLength(1);

    const paidData = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Water", amount: 500, dueDay: "12", type: "Bill" },
        ],
        receivables: [],
        shoots: [],
      },
      logs: {
        "October 2026": {
          billsPaid: ["b1"],
        },
      },
    });
    expect(deriveNotifications(paidData, fixedDate)).toHaveLength(0);
  });

  it("removes notification naturally when receivable is collected", () => {
    const uncollectedData = createMockData({
      library: {
        bills: [],
        receivables: [
          { id: "r1", name: "Consulting", amount: 10000, frequency: "By Date", date: "2026-10-15" },
        ],
        shoots: [],
      },
    });
    expect(deriveNotifications(uncollectedData, fixedDate)).toHaveLength(1);

    const collectedData = createMockData({
      library: {
        bills: [],
        receivables: [
          { id: "r1", name: "Consulting", amount: 10000, frequency: "By Date", date: "2026-10-15" },
        ],
        shoots: [],
      },
      logs: {
        "October 2026": {
          recsCollected: {
            r1: { amountReceived: 10000, collected: true },
          },
        },
      },
    });
    expect(deriveNotifications(collectedData, fixedDate)).toHaveLength(0);
  });

  it("ensures no duplicate notification IDs are emitted", () => {
    const data = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Gym", amount: 1000, dueDay: "10", type: "Subscription" },
          { id: "b1", name: "Gym Duplicate", amount: 1000, dueDay: "10", type: "Subscription" },
        ],
        receivables: [],
        shoots: [],
      },
    });

    const notifs = deriveNotifications(data, fixedDate);
    const ids = notifs.map(n => n.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it("derives based on current real-world date independently of selectedMonth", () => {
    const data = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Car Loan", amount: 8000, dueDay: "14", type: "Loan / Installment" },
        ],
        receivables: [],
        shoots: [],
      },
    });

    // currentDate is Oct 15, 2026, regardless of any historical month selected elsewhere
    const notifs = deriveNotifications(data, fixedDate);
    expect(notifs[0].id).toContain("October 2026");
  });

  it("triggers log reminder after 3 full days of inactivity", () => {
    const inactiveData = createMockData({
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        expenses: [
          { id: "e1", merchant: "Store", amount: 100, category: "Shopping", wallet: "main", date: "2026-10-10" },
        ],
      },
    });

    // 5 days elapsed (Oct 10 to Oct 15) -> diff >= 3 days
    const notifs = deriveNotifications(inactiveData, fixedDate);
    const reminder = notifs.find(n => n.type === "log_reminder");
    expect(reminder).toBeDefined();
    expect(reminder?.message).toContain("5 days");
  });

  it("does not trigger log reminder if financial activity occurred recently", () => {
    const activeData = createMockData({
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        expenses: [
          { id: "e1", merchant: "Coffee", amount: 150, category: "Food & Dining", wallet: "main", date: "2026-10-14" },
        ],
      },
    });

    // 1 day elapsed (Oct 14 to Oct 15) -> diff < 3 days
    const notifs = deriveNotifications(activeData, fixedDate);
    expect(notifs.find(n => n.type === "log_reminder")).toBeUndefined();
  });

  it("handles no-activity edge case intentionally without crashing or invalid dates", () => {
    const emptyData = createMockData({
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        expenses: [],
        manualTransactions: [],
      },
      logs: {},
    });

    const notifs = deriveNotifications(emptyData, fixedDate);
    expect(notifs).toEqual([]);
    // Ensure no Invalid Date or NaN in IDs or titles
    notifs.forEach(n => {
      expect(n.id).not.toContain("NaN");
      expect(n.id).not.toContain("Invalid");
    });
  });

  it("groups upcoming commitments when exceeding grouping threshold", () => {
    const data = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Bill 1", amount: 100, dueDay: "16", type: "Bill" },
          { id: "b2", name: "Bill 2", amount: 200, dueDay: "16", type: "Bill" },
          { id: "b3", name: "Bill 3", amount: 300, dueDay: "17", type: "Bill" },
          { id: "b4", name: "Bill 4", amount: 400, dueDay: "17", type: "Bill" },
        ],
        receivables: [],
        shoots: [],
      },
    });

    const notifs = deriveNotifications(data, fixedDate);
    const groups = notifs.filter(n => n.isGroup && n.type === "upcoming_commitment");
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("4 Upcoming Bills");
    expect(groups[0].amount).toBe(1000);
  });

  it("populates groupedIds with exact represented individual notification IDs for bills and receivables", () => {
    const data = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Bill 1", amount: 100, dueDay: "16", type: "Bill" },
          { id: "b2", name: "Bill 2", amount: 200, dueDay: "16", type: "Bill" },
          { id: "b3", name: "Bill 3", amount: 300, dueDay: "17", type: "Bill" },
          { id: "b4", name: "Bill 4", amount: 400, dueDay: "17", type: "Bill" },
        ],
        receivables: [
          { id: "r1", name: "Rec 1", amount: 1000, frequency: "By Date", date: "2026-10-16" },
          { id: "r2", name: "Rec 2", amount: 2000, frequency: "By Date", date: "2026-10-16" },
          { id: "r3", name: "Rec 3", amount: 3000, frequency: "By Date", date: "2026-10-17" },
          { id: "r4", name: "Rec 4", amount: 4000, frequency: "By Date", date: "2026-10-17" },
        ],
        shoots: [],
      },
    });

    const notifs = deriveNotifications(data, fixedDate);
    const billGroup = notifs.find(n => n.type === "upcoming_commitment" && n.isGroup);
    const recGroup = notifs.find(n => n.type === "pending_receivable" && n.isGroup);

    expect(billGroup).toBeDefined();
    expect(billGroup?.groupedIds).toEqual([
      "upcoming_bill_b1_October 2026",
      "upcoming_bill_b2_October 2026",
      "upcoming_bill_b3_October 2026",
      "upcoming_bill_b4_October 2026",
    ]);

    expect(recGroup).toBeDefined();
    expect(recGroup?.groupedIds).toEqual([
      "pending_rec_r1_October 2026",
      "pending_rec_r2_October 2026",
      "pending_rec_r3_October 2026",
      "pending_rec_r4_October 2026",
    ]);
  });

  it("group dismissal persists through threshold collapse for upcoming bills", () => {
    // Start with 4 upcoming bills
    const initialData = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Bill 1", amount: 100, dueDay: "16", type: "Bill" },
          { id: "b2", name: "Bill 2", amount: 200, dueDay: "16", type: "Bill" },
          { id: "b3", name: "Bill 3", amount: 300, dueDay: "17", type: "Bill" },
          { id: "b4", name: "Bill 4", amount: 400, dueDay: "17", type: "Bill" },
        ],
        receivables: [],
        shoots: [],
      },
    });

    // 1. Derive group
    const initialNotifs = deriveNotifications(initialData, fixedDate);
    const group = initialNotifs.find(n => n.isGroup && n.type === "upcoming_commitment");
    expect(group).toBeDefined();
    expect(group?.groupedIds).toHaveLength(4);

    // 2. Dismiss group (as App handler does: persists all constituent IDs and group ID)
    const dismissedMap: Record<string, number> = {};
    group!.groupedIds!.forEach(id => {
      dismissedMap[id] = Date.now();
    });
    dismissedMap[group!.id] = Date.now();

    const dataAfterDismissal = {
      ...initialData,
      settings: {
        ...initialData.settings,
        dismissedNotifications: dismissedMap,
      },
    };

    expect(deriveNotifications(dataAfterDismissal, fixedDate)).toHaveLength(0);

    // 3. Reduce active set to 3 by marking one bill paid
    const dataWithOnePaid = {
      ...dataAfterDismissal,
      logs: {
        "October 2026": {
          billsPaid: ["b1"],
        },
      },
    };

    // 4. Verify zero notifications remain for the 3 dismissed bills
    const notifsAfterPaid = deriveNotifications(dataWithOnePaid, fixedDate);
    expect(notifsAfterPaid).toHaveLength(0);
  });

  it("previously dismissed individuals do not resurface when a new item crosses grouping threshold for upcoming bills", () => {
    // Start with 3 individually dismissed upcoming bills
    const dismissedMap: Record<string, number> = {
      "upcoming_bill_b1_October 2026": Date.now(),
      "upcoming_bill_b2_October 2026": Date.now(),
      "upcoming_bill_b3_October 2026": Date.now(),
    };

    // Add a 4th active bill
    const dataWithFour = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Bill 1", amount: 100, dueDay: "16", type: "Bill" },
          { id: "b2", name: "Bill 2", amount: 200, dueDay: "16", type: "Bill" },
          { id: "b3", name: "Bill 3", amount: 300, dueDay: "17", type: "Bill" },
          { id: "b4", name: "Bill 4", amount: 400, dueDay: "17", type: "Bill" }, // new
        ],
        receivables: [],
        shoots: [],
      },
      settings: {
        theme: "dark",
        dismissedNotifications: dismissedMap,
      },
    });

    // Verify result contains ONLY the new active notification, not a group containing all 4
    const notifs = deriveNotifications(dataWithFour, fixedDate);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].id).toBe("upcoming_bill_b4_October 2026");
    expect(notifs[0].isGroup).toBeFalsy();
    expect(notifs[0].title).toBe("Upcoming: Bill 4");
  });

  it("group dismissal persists through threshold collapse for pending receivables", () => {
    // Start with 4 pending receivables
    const initialData = createMockData({
      library: {
        bills: [],
        receivables: [
          { id: "r1", name: "Rec 1", amount: 1000, frequency: "By Date", date: "2026-10-16" },
          { id: "r2", name: "Rec 2", amount: 2000, frequency: "By Date", date: "2026-10-16" },
          { id: "r3", name: "Rec 3", amount: 3000, frequency: "By Date", date: "2026-10-17" },
          { id: "r4", name: "Rec 4", amount: 4000, frequency: "By Date", date: "2026-10-17" },
        ],
        shoots: [],
      },
    });

    const initialNotifs = deriveNotifications(initialData, fixedDate);
    const group = initialNotifs.find(n => n.isGroup && n.type === "pending_receivable");
    expect(group).toBeDefined();
    expect(group?.groupedIds).toHaveLength(4);

    // Dismiss group
    const dismissedMap: Record<string, number> = {};
    group!.groupedIds!.forEach(id => {
      dismissedMap[id] = Date.now();
    });
    dismissedMap[group!.id] = Date.now();

    const dataAfterDismissal = {
      ...initialData,
      settings: {
        ...initialData.settings,
        dismissedNotifications: dismissedMap,
      },
    };

    expect(deriveNotifications(dataAfterDismissal, fixedDate)).toHaveLength(0);

    // Reduce active set to 3 by collecting one receivable
    const dataWithOneCollected = {
      ...dataAfterDismissal,
      logs: {
        "October 2026": {
          recsCollected: {
            r1: { amountReceived: 1000, collected: true },
          },
        },
      },
    };

    // Verify zero notifications remain for the 3 dismissed receivables
    const notifsAfterCollected = deriveNotifications(dataWithOneCollected, fixedDate);
    expect(notifsAfterCollected).toHaveLength(0);
  });

  it("previously dismissed individual receivables do not resurface when a new item crosses grouping threshold", () => {
    // Start with 3 individually dismissed receivables
    const dismissedMap: Record<string, number> = {
      "pending_rec_r1_October 2026": Date.now(),
      "pending_rec_r2_October 2026": Date.now(),
      "pending_rec_r3_October 2026": Date.now(),
    };

    // Add a 4th active receivable
    const dataWithFour = createMockData({
      library: {
        bills: [],
        receivables: [
          { id: "r1", name: "Rec 1", amount: 1000, frequency: "By Date", date: "2026-10-16" },
          { id: "r2", name: "Rec 2", amount: 2000, frequency: "By Date", date: "2026-10-16" },
          { id: "r3", name: "Rec 3", amount: 3000, frequency: "By Date", date: "2026-10-17" },
          { id: "r4", name: "Rec 4", amount: 4000, frequency: "By Date", date: "2026-10-17" },
        ],
        shoots: [],
      },
      settings: {
        theme: "dark",
        dismissedNotifications: dismissedMap,
      },
    });

    // Verify result contains ONLY the new active notification, not a group containing all 4
    const notifs = deriveNotifications(dataWithFour, fixedDate);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].id).toBe("pending_rec_r4_October 2026");
    expect(notifs[0].isGroup).toBeFalsy();
    expect(notifs[0].title).toBe("Pending: Rec 4");
  });

  it("verifies normal individual dismissal still works for single notifications", () => {
    const data = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Water", amount: 500, dueDay: "16", type: "Bill" },
        ],
        receivables: [],
        shoots: [],
      },
      settings: {
        theme: "dark",
        dismissedNotifications: {
          "upcoming_bill_b1_October 2026": Date.now(),
        },
      },
    });

    const notifs = deriveNotifications(data, fixedDate);
    expect(notifs).toHaveLength(0);
  });
});

describe("useNotifications hook", () => {
  it("wraps deriveNotifications in a React hook", () => {
    const data = createMockData({
      library: {
        bills: [
          { id: "b1", name: "Subscription", amount: 300, dueDay: "15", type: "Subscription" },
        ],
        receivables: [],
        shoots: [],
      },
    });

    const fixedDate = new Date(2026, 9, 15);
    const { result } = renderHook(() => useNotifications(data, fixedDate));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].type).toBe("upcoming_commitment");
  });

  it("automatically rolls forward notifications across midnight without financial data mutation", () => {
    vi.useFakeTimers();
    try {
      // Oct 15, 2026 at 23:59:00
      const initialTime = new Date(2026, 9, 15, 23, 59, 0);
      vi.setSystemTime(initialTime);

      const data = createMockData({
        library: {
          bills: [
            // Due Oct 19: on Oct 15, 4 days left (not upcoming <= 3)
            // On Oct 16, 3 days left (becomes upcoming <= 3!)
            { id: "b1", name: "Electricity", amount: 2000, dueDay: "19", type: "Bill" },
          ],
          receivables: [],
          shoots: [],
        },
      });

      const { result } = renderHook(() => useNotifications(data));

      // Before midnight on Oct 15: 0 notifications
      expect(result.current).toHaveLength(0);

      // Advance clock past midnight into Oct 16 (2 minutes)
      act(() => {
        vi.advanceTimersByTime(2 * 60 * 1000);
      });

      // After midnight on Oct 16: notification appears automatically without data change!
      expect(result.current).toHaveLength(1);
      expect(result.current[0].title).toBe("Upcoming: Electricity");
      expect(result.current[0].message).toContain("due in 3 days");
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates date basis when window focus detects a new calendar day", () => {
    vi.useFakeTimers();
    try {
      const initialTime = new Date(2026, 9, 15, 12, 0, 0);
      vi.setSystemTime(initialTime);

      const data = createMockData({
        library: {
          bills: [
            { id: "b1", name: "Electricity", amount: 2000, dueDay: "19", type: "Bill" },
          ],
          receivables: [],
          shoots: [],
        },
      });

      const { result } = renderHook(() => useNotifications(data));
      expect(result.current).toHaveLength(0);

      // Simulate device sleeping and waking up 2 days later without timer firing
      vi.setSystemTime(new Date(2026, 9, 17, 9, 0, 0));
      act(() => {
        window.dispatchEvent(new Event("focus"));
      });

      // Now on Oct 17: 2 days left
      expect(result.current).toHaveLength(1);
      expect(result.current[0].message).toContain("due in 2 days");
    } finally {
      vi.useRealTimers();
    }
  });
});
