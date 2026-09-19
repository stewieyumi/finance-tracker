import { describe, it, expect } from "vitest";
import {
  getEffectiveBillAmount,
  getWalletForBill,
  computeBillPerPaydayAmount,
  computeBaselineScale,
  computeScaledBaselineAllocations,
  hasPaydayExecutionOnDate,
  getReceivableStatus,
  applyWalletTransaction,
  getDefaultWalletId
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

describe("Expense & Wallet Tracking Logic", () => {
  it("Wallet deduction: correctly subtracts expense amount from balance", () => {
    expect(applyWalletTransaction(5000, -1500)).toBe(3500);
  });

  it("Wallet refund: correctly restores balance when expense is deleted", () => {
    expect(applyWalletTransaction(3500, 1500)).toBe(5000);
  });

  it("Insufficient funds: prevents wallet balance from going negative during deduction", () => {
    expect(applyWalletTransaction(1000, -2500)).toBe(0);
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
