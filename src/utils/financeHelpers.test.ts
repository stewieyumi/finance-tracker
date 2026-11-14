import { describe, it, expect } from "vitest";
import {
  calculateDeductionAmount,
  calculateNetSalary,
  getEffectiveBillAmount,
  getWalletForBill,
  computeBillPerPaydayAmount,
  computeBaselineScale,
  computeScaledBaselineAllocations,
  hasPaydayExecutionOnDate,
  getReceivableStatus,
  applyWalletTransaction,
  hasSufficientWalletBalance,
  parseWalletBalance,
  resolveActiveWalletDefault,
  validateActiveWalletAssignment,
  resolveWalletRoutingOrReject,
  reconcileWalletBalances,
  getDefaultWalletId,
  getDefaultExpenseWalletId
} from "./financeHelpers";
import { countPaydaysUntil } from "./dateHelpers";

describe("getWalletForBill", () => {
  it("routes UnoBank Loan to GCash", () => {
    expect(getWalletForBill("UnoBank Loan")).toBe("gcash");
  });

  it("routes Appliances / Extras to GCash", () => {
    expect(getWalletForBill("Appliances / Extras")).toBe("gcash");
  });

  it("routes GCredit Payoff to GCash", () => {
    expect(getWalletForBill("GCredit Payoff")).toBe("gcash");
  });

  it("routes SPayLater to MariBank", () => {
    expect(getWalletForBill("SPayLater")).toBe("maribank");
  });

  it("routes Shared Japan Trip bills to BPI (Japan fund), not GoTyme or MariBank", () => {
    expect(getWalletForBill("Shared Japan Trip 1")).toBe("bpi");
    expect(getWalletForBill("Shared Japan Trip 2")).toBe("bpi");
  });

  it("falls back to Maya by default for unrecognized bills", () => {
    expect(getWalletForBill("Water Bill")).toBe("maya");
    expect(getWalletForBill("Electricity Bill")).toBe("maya");
    expect(getWalletForBill("Macbook Loan")).toBe("maya");
    expect(getWalletForBill("Gym Membership")).toBe("maya");
  });

  it("honors a configured fallback wallet instead of hardcoded Maya", () => {
    expect(getWalletForBill("Random New Bill", undefined, "gotyme")).toBe("gotyme");
    expect(getWalletForBill("Netflix", undefined, "bpi")).toBe("bpi");
  });

  it("an explicit bill.wallet always wins over both name-matching and the fallback", () => {
    expect(getWalletForBill("SPayLater", "cash", "gotyme")).toBe("cash");
  });

  it("is case-insensitive", () => {
    expect(getWalletForBill("unobank loan")).toBe("gcash");
    expect(getWalletForBill("SHARED JAPAN TRIP 2")).toBe("bpi");
  });
});
describe("countPaydaysUntil", () => {
  it("counts today itself as a payday when today is the 15th or 30th", () => {
    const today = new Date(2026, 8, 15); // Sep 15, 2026
    expect(countPaydaysUntil(today, today)).toBe(1);
  });

  it("counts both the 15th and 30th when a due date spans them", () => {
    const today = new Date(2026, 8, 15); // Sep 15
    const due = new Date(2026, 8, 30);   // Sep 30
    expect(countPaydaysUntil(today, due)).toBe(2);
  });

  it("counts only one payday when due date falls before the next one", () => {
    const today = new Date(2026, 8, 15); // Sep 15
    const due = new Date(2026, 8, 22);   // Sep 22 (before Sep 30)
    expect(countPaydaysUntil(today, due)).toBe(1);
  });

  it("returns 0 for a due date before today (already overdue)", () => {
    const today = new Date(2026, 8, 15); // Sep 15
    const due = new Date(2026, 8, 14);   // Sep 14
    expect(countPaydaysUntil(today, due)).toBe(0);
  });

  it("caps the second payday at the last day of short months (e.g. Feb)", () => {
    const today = new Date(2026, 1, 1);  // Feb 1, 2026 (not a leap year)
    const due = new Date(2026, 1, 28);   // Feb 28
    expect(countPaydaysUntil(today, due)).toBe(2);
  });
});
describe("computeBillPerPaydayAmount — prevents double-funding", () => {
  it("funds the full amount when only one payday remains", () => {
    expect(computeBillPerPaydayAmount(1750, 0, 1)).toBe(1750);
  });

  it("splits evenly across two paydays", () => {
    expect(computeBillPerPaydayAmount(1750, 0, 2)).toBe(875);
  });

  it("only asks for the remaining gap on the second payday, not the full amount again", () => {
    const firstPayment = computeBillPerPaydayAmount(2000, 0, 2);
    expect(firstPayment).toBe(1000);

    const secondPayment = computeBillPerPaydayAmount(2000, firstPayment, 1);
    expect(secondPayment).toBe(1000); // remaining gap only, not 2000
  });

  it("never returns a negative amount if somehow over-allocated", () => {
    expect(computeBillPerPaydayAmount(1000, 1500, 1)).toBe(0);
  });

  it("treats 0 paydaysRemaining the same as 1 (avoids divide-by-zero)", () => {
    expect(computeBillPerPaydayAmount(500, 0, 0)).toBe(500);
  });
});
describe("computeScaledBaselineAllocations — keeps buffer from going negative", () => {
  it("never lets rounded baselines exceed the room left after bills", () => {
    const allocations = computeScaledBaselineAllocations(
      11529.59,
      15000,
      2500,
      1000,
      1500
    );

    expect(allocations).toEqual({
      living: 1735.21,
      savings: 694.08,
      transit: 1041.12
    });

    expect(
      Math.round(
        (allocations.living + allocations.savings + allocations.transit) * 100
      ) / 100
    ).toBeLessThanOrEqual(3470.41);
  });

  it("clamps later baselines when the available room is smaller than their rounded targets", () => {
    const allocations = computeScaledBaselineAllocations(
      14999.99,
      15000,
      2500,
      1000,
      1500
    );

    expect(allocations.living).toBe(0.01);
    expect(allocations.savings).toBe(0);
    expect(allocations.transit).toBe(0);
  });
});
describe("computeBaselineScale — keeps buffer from going negative", () => {
  it("returns full scale (1) when bills leave enough room for baselines", () => {
    expect(computeBaselineScale(10000, 15000, 5000)).toBe(1);
  });

  it("scales down proportionally when bills eat into baseline room", () => {
    const scale = computeBaselineScale(11529.59, 15000, 5000);
    expect(scale).toBeCloseTo(0.694082, 5);
  });

  it("scales to 0 (never negative) when bills alone exceed the payout", () => {
    expect(computeBaselineScale(16000, 15000, 5000)).toBe(0);
  });

  it("returns 0 when there is no baseline target to scale", () => {
    expect(computeBaselineScale(5000, 15000, 0)).toBe(0);
  });
});
describe("getEffectiveBillAmount (existing helper, sanity check)", () => {
  it("uses the override when present", () => {
    expect(getEffectiveBillAmount(599, 699)).toBe(699);
  });

  it("falls back to the base amount without an override", () => {
    expect(getEffectiveBillAmount(599, undefined)).toBe(599);
  });
});
describe("Receivable State Transitions", () => {
  it("Pending: 0 received means uncollected and full amount remaining", () => {
    const { isCollected, remaining } = getReceivableStatus(1000, 0, false);
    expect(isCollected).toBe(false);
    expect(remaining).toBe(1000);
  });

  it("Partial payment: received < amount means uncollected and partial remaining", () => {
    const { isCollected, remaining } = getReceivableStatus(1000, 400, false);
    expect(isCollected).toBe(false);
    expect(remaining).toBe(600);
  });

  it("Full payment: received === amount means collected and 0 remaining", () => {
    const { isCollected, remaining } = getReceivableStatus(1000, 1000, false);
    expect(isCollected).toBe(true);
    expect(remaining).toBe(0);
  });

  it("Overpayment: received > amount means collected and 0 remaining", () => {
    const { isCollected, remaining } = getReceivableStatus(1000, 1500, false);
    expect(isCollected).toBe(true);
    expect(remaining).toBe(0);
  });

  it("Zero-amount Pending: amount is 0 and manually false means uncollected", () => {
    const { isCollected, remaining } = getReceivableStatus(0, 0, false);
    expect(isCollected).toBe(false);
    expect(remaining).toBe(0);
  });

  it("Zero-amount Completed: amount is 0 and manually true means collected", () => {
    const { isCollected, remaining } = getReceivableStatus(0, 0, true);
    expect(isCollected).toBe(true);
    expect(remaining).toBe(0);
  });
});
describe("getDefaultWalletId", () => {
  it("uses the configured default wallet when it exists", () => {
    expect(
      getDefaultWalletId(
        {
          defaultWallet: "main",
          customWallets: [{ id: "main" }, { id: "savings" }]
        },
        { main: 5000, savings: 1000 }
      )
    ).toBe("main");
  });

  it("falls back to the first available custom wallet when the configured wallet is invalid", () => {
    expect(
      getDefaultWalletId(
        {
          defaultWallet: "missing",
          customWallets: [{ id: "savings" }, { id: "cash" }]
        },
        { savings: 1000, cash: 500 }
      )
    ).toBe("savings");
  });

  it("returns an empty value when no usable wallet is configured", () => {
    expect(
      getDefaultWalletId(
        { defaultWallet: "missing", customWallets: [{ id: "missing" }] },
        { savings: 1000 }
      )
    ).toBe("");
  });
});
describe("getDefaultExpenseWalletId", () => {
  const settings = {
    defaultWallet: "maribank",
    expenseWallets: {
      "Food & Dining": "gcash",
      Transport: "gotyme",
      Utilities: "maya",
      "Laundry & Home": "gcash",
      Shopping: "bpi",
      Other: "maribank"
    },
    customWallets: [
      { id: "maribank", label: "MariBank" },
      { id: "gcash", label: "GCash" },
      { id: "maya", label: "Maya" },
      { id: "gotyme", label: "GoTyme" },
      { id: "bpi", label: "BPI" }
    ]
  };

  const wallets = {
    maribank: 5000,
    gcash: 2500,
    maya: 1500,
    gotyme: 1000,
    bpi: 500
  };

  it("uses the configured wallet for the expense category", () => {
    expect(getDefaultExpenseWalletId("Food & Dining", settings, wallets)).toBe("gcash");
    expect(getDefaultExpenseWalletId("Transport", settings, wallets)).toBe("gotyme");
    expect(getDefaultExpenseWalletId("Utilities", settings, wallets)).toBe("maya");
  });

  it("falls back to the normal default wallet when a category has no route", () => {
    expect(getDefaultExpenseWalletId("Unmapped Category", settings, wallets)).toBe("maribank");
  });

  it("falls back when the category route points to a missing wallet", () => {
    const invalidSettings = {
      ...settings,
      expenseWallets: {
        ...settings.expenseWallets,
        Shopping: "deleted-wallet"
      }
    };

    expect(getDefaultExpenseWalletId("Shopping", invalidSettings, wallets)).toBe("maribank");
  });
});
describe("Expense & Wallet Tracking Logic", () => {
  it("Wallet deduction: correctly subtracts expense amount from balance", () => {
    expect(applyWalletTransaction(5000, -1500)).toBe(3500);
  });

  it("Wallet refund: correctly restores balance when expense is deleted", () => {
    expect(applyWalletTransaction(3500, 1500)).toBe(5000);
  });

  it("computes exact signed arithmetic and preserves negative balances", () => {
    expect(applyWalletTransaction(1000, -2500)).toBe(-1500);
  });

  it("Decimal precision: handles JS floating point safely during deductions", () => {
    expect(applyWalletTransaction(100.55, -50.10)).toBe(50.45);
  });
});
describe("hasPaydayExecutionOnDate — prevents duplicate payday funding", () => {
  it("recognizes legacy string execution records", () => {
    expect(hasPaydayExecutionOnDate(["2026-09-15"], "2026-09-15")).toBe(true);
  });

  it("recognizes current execution objects", () => {
    expect(
      hasPaydayExecutionOnDate(
        [{ date: "2026-09-15" }],
        "2026-09-15"
      )
    ).toBe(true);
  });

  it("does not match a different payday", () => {
    expect(
      hasPaydayExecutionOnDate(
        [{ date: "2026-09-15" }],
        "2026-09-30"
      )
    ).toBe(false);
  });
});
describe("computeBillPerPaydayAmount — cent-safe payday allocation", () => {
  it("prevents floating-point reallocation across three paydays", () => {
    const first = computeBillPerPaydayAmount(100, 0, 3);
    expect(first).toBe(33.33);

    const second = computeBillPerPaydayAmount(100, first, 2);
    expect(second).toBe(33.34);

    const third = computeBillPerPaydayAmount(
      100,
      first + second,
      1
    );
    expect(third).toBe(33.33);

    expect(
      Math.round((first + second + third) * 100) / 100
    ).toBe(100);
  });

  it("never allocates above the bill even when alreadyAllocated is malformed", () => {
    expect(
      computeBillPerPaydayAmount(1000, -500, 2)
    ).toBe(500);

    expect(
      computeBillPerPaydayAmount(1000, 1500, 2)
    ).toBe(0);
  });

  it("floors fractional payday counts safely", () => {
    expect(
      computeBillPerPaydayAmount(900, 0, 2.9)
    ).toBe(450);
  });
});
describe("P4-C salary compatibility", () => {
  it("preserves existing NET payout semantics for payday baseline scaling", () => {
    expect(computeBaselineScale(0, 15000, 5000)).toBe(1);
    expect(computeBaselineScale(12000, 15000, 5000)).toBe(0.6);
    expect(computeBaselineScale(15000, 15000, 5000)).toBe(0);
  });
});
describe("P4-C deduction calculations", () => {
  it("calculates a fixed deduction from gross salary", () => {
    const deduction = {
      id: "sss",
      name: "SSS",
      type: "fixed" as const,
      value: 1500,
    };

    expect(calculateDeductionAmount(20000, deduction)).toBe(1500);
    expect(calculateNetSalary(20000, [deduction])).toBe(18500);
  });

  it("calculates a percentage deduction from gross salary", () => {
    const deduction = {
      id: "tax",
      name: "Tax",
      type: "percentage" as const,
      value: 10,
    };

    expect(calculateDeductionAmount(20000, deduction)).toBe(2000);
    expect(calculateNetSalary(20000, [deduction])).toBe(18000);
  });

  it("rounds percentage deductions to cents", () => {
    const deduction = {
      id: "tax",
      name: "Tax",
      type: "percentage" as const,
      value: 7.333,
    };

    expect(calculateDeductionAmount(1000, deduction)).toBe(73.33);
    expect(calculateNetSalary(1000, [deduction])).toBe(926.67);
  });

  it("clamps negative deduction values to zero", () => {
    const deduction = {
      id: "invalid",
      name: "Invalid",
      type: "fixed" as const,
      value: -500,
    };

    expect(calculateDeductionAmount(20000, deduction)).toBe(0);
    expect(calculateNetSalary(20000, [deduction])).toBe(20000);
  });

  it("caps percentage deductions above 100% at gross salary", () => {
    const deduction = {
      id: "invalid-percentage",
      name: "Invalid Percentage",
      type: "percentage" as const,
      value: 150,
    };

    expect(calculateDeductionAmount(20000, deduction)).toBe(20000);
    expect(calculateNetSalary(20000, [deduction])).toBe(0);
  });

  it("caps a single deduction at gross salary", () => {
    const deduction = {
      id: "invalid",
      name: "Too Large",
      type: "fixed" as const,
      value: 25000,
    };

    expect(calculateDeductionAmount(20000, deduction)).toBe(20000);
    expect(calculateNetSalary(20000, [deduction])).toBe(0);
  });

  it("caps total deductions at gross salary when multiple deductions exceed gross", () => {
    const deductions = [
      {
        id: "a",
        name: "Deduction A",
        type: "fixed" as const,
        value: 15000,
      },
      {
        id: "b",
        name: "Deduction B",
        type: "fixed" as const,
        value: 10000,
      },
    ];

    expect(calculateNetSalary(20000, deductions)).toBe(0);
  });

  it("returns gross salary unchanged when there are no deductions", () => {
    expect(calculateNetSalary(20000)).toBe(20000);
    expect(calculateNetSalary(20000, [])).toBe(20000);
  });

  it("normalizes invalid gross salary values safely", () => {
    expect(calculateNetSalary(-5000)).toBe(0);
    expect(calculateNetSalary(0)).toBe(0);
  });
});
describe("Phase B1 Characterization: Overdraft Protections & Cent Arithmetic", () => {
  it("hasSufficientWalletBalance blocks debits when balance is negative or insufficient", () => {
    expect(hasSufficientWalletBalance(100, 50)).toBe(true);
    expect(hasSufficientWalletBalance(100, 100)).toBe(true);
    expect(hasSufficientWalletBalance(100, 100.01)).toBe(false);
    expect(hasSufficientWalletBalance(0, 0)).toBe(true);
    expect(hasSufficientWalletBalance(0, 0.01)).toBe(false);
    expect(hasSufficientWalletBalance(-20, 10)).toBe(false);
    expect(hasSufficientWalletBalance(-20, 0)).toBe(false);
  });
});
describe("Phase B1 Failing-First: parseWalletBalance", () => {
  it("handles absent and defined zero balances", () => {
    expect(parseWalletBalance(undefined)).toEqual({ isValid: true, isPresent: false, balance: 0 });
    expect(parseWalletBalance(0)).toEqual({ isValid: true, isPresent: true, balance: 0 });
    expect(parseWalletBalance(-0)).toEqual({ isValid: true, isPresent: true, balance: 0 });
  });

  it("handles finite positive and negative balances without clamping", () => {
    expect(parseWalletBalance(1500.5)).toEqual({ isValid: true, isPresent: true, balance: 1500.5 });
    expect(parseWalletBalance(-70.25)).toEqual({ isValid: true, isPresent: true, balance: -70.25 });
  });

  it("normalizes strict numeric strings to numbers", () => {
    expect(parseWalletBalance("1500.50")).toEqual({ isValid: true, isPresent: true, balance: 1500.5 });
    expect(parseWalletBalance("-70")).toEqual({ isValid: true, isPresent: true, balance: -70 });
    expect(parseWalletBalance("  42.50  ")).toEqual({ isValid: true, isPresent: true, balance: 42.5 });
  });

  it("rejects NaN, Infinity, null, empty strings, and malformed strings without coercing to zero", () => {
    expect(parseWalletBalance(NaN)).toEqual({ isValid: false, isPresent: true, raw: NaN, reason: "nan" });
    expect(parseWalletBalance(Infinity)).toEqual({ isValid: false, isPresent: true, raw: Infinity, reason: "infinity" });
    expect(parseWalletBalance(null)).toEqual({ isValid: false, isPresent: true, raw: null, reason: "null" });
    expect(parseWalletBalance("")).toEqual({ isValid: false, isPresent: true, raw: "", reason: "empty_string" });
    expect(parseWalletBalance("   ")).toEqual({ isValid: false, isPresent: true, raw: "   ", reason: "empty_string" });
    expect(parseWalletBalance("abc")).toEqual({ isValid: false, isPresent: true, raw: "abc", reason: "malformed_string" });
    expect(parseWalletBalance("$50")).toEqual({ isValid: false, isPresent: true, raw: "$50", reason: "malformed_string" });
  });
});
describe("Phase B1 Failing-First: resolveActiveWalletDefault", () => {
  it("returns configured active default wallet when eligible", () => {
    const settings = {
      defaultWallet: "w2",
      customWallets: [{ id: "w1", label: "W1" }, { id: "w2", label: "W2" }]
    };
    expect(resolveActiveWalletDefault(settings, { w1: 100, w2: 200 })).toBe("w2");
  });

  it("skips archived default wallet and selects first eligible active wallet", () => {
    const settings = {
      defaultWallet: "w1",
      customWallets: [{ id: "w1", label: "W1" }, { id: "w2", label: "W2" }],
      archivedWallets: [{ id: "w1", label: "W1" }]
    };
    expect(resolveActiveWalletDefault(settings, { w1: 100, w2: 200 })).toBe("w2");
  });

  it("skips active wallets with invalid balances and fails safely if none eligible", () => {
    const settings = {
      defaultWallet: "w1",
      customWallets: [{ id: "w1", label: "W1" }, { id: "w2", label: "W2" }]
    };
    expect(resolveActiveWalletDefault(settings, { w1: NaN, w2: 200 })).toBe("w2");
    expect(resolveActiveWalletDefault(settings, { w1: NaN, w2: Infinity })).toBe("");
  });
});
describe("Phase B1 Failing-First: validateActiveWalletAssignment & resolveWalletRoutingOrReject", () => {
  const settings = {
    defaultWallet: "w1",
    customWallets: [{ id: "w1", label: "Active 1" }, { id: "w2", label: "Active 2" }],
    archivedWallets: [{ id: "w_archived", label: "Old Wallet" }]
  };

  it("validateActiveWalletAssignment rejects archived, unconfigured, or invalid wallets", () => {
    expect(validateActiveWalletAssignment("w_archived", settings, { w_archived: 0 })).toMatchObject({
      ok: false,
      error: "archived"
    });
    expect(validateActiveWalletAssignment("ghost", settings, { ghost: 0 })).toMatchObject({
      ok: false,
      error: "unconfigured"
    });
    expect(validateActiveWalletAssignment("w1", settings, { w1: NaN })).toMatchObject({
      ok: false,
      error: "invalid_balance"
    });
    expect(validateActiveWalletAssignment("w1", settings, { w1: 100 })).toEqual({
      ok: true,
      walletId: "w1"
    });
  });

  it("resolveWalletRoutingOrReject falls back safely for missing assignments but fails for invalid explicit assignments", () => {
    expect(resolveWalletRoutingOrReject(undefined, settings, { w1: 100 })).toEqual({
      ok: true,
      walletId: "w1"
    });
    expect(resolveWalletRoutingOrReject("", settings, { w1: 100 })).toEqual({
      ok: true,
      walletId: "w1"
    });
    expect(resolveWalletRoutingOrReject("w_archived", settings, { w_archived: 0 })).toMatchObject({
      ok: false,
      error: "archived"
    });
  });
});
describe("Phase B1 Failing-First: reconcileWalletBalances", () => {
  it("partitions active, archived, and unlisted wallets with mutual exclusivity and anomaly detection", () => {
    const data = {
      settings: {
        customWallets: [
          { id: "w1", label: "Main" },
          { id: "w1", label: "Duplicate Main" },
          { id: "w2", label: "Savings" }
        ],
        archivedWallets: [
          { id: "w2", label: "Conflicting Savings" },
          { id: "w_archived", label: "Archived" }
        ]
      },
      wallets: {
        w1: 1000,
        w2: -50,
        w_archived: 200,
        legacy_maya: 500,
        corrupted: NaN
      }
    };

    const result = reconcileWalletBalances(data);

    expect(result.activeTotal).toBe(950); // 1000 + (-50)
    expect(result.archivedTotal).toBe(200);
    expect(result.unlistedTotal).toBe(500); // legacy_maya
    expect(result.totalLiquid).toBe(1650); // 950 + 200 + 500
    expect(result.isComplete).toBe(false);
    expect(result.invalidWalletIds).toContain("corrupted");
    expect(result.anomalies.duplicateActiveWallets).toHaveLength(1);
    expect(result.anomalies.conflictingActiveAndArchived).toHaveLength(1);
  });
});
