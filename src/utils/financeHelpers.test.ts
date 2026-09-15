import { describe, it, expect } from "vitest";
import {
  getEffectiveBillAmount,
  getWalletForBill,
  computeBillPerPaydayAmount,
  computeBaselineScale
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

  it("routes Shared Japan Trip bills to GoTyme, not MariBank", () => {
    expect(getWalletForBill("Shared Japan Trip 1")).toBe("gotyme");
    expect(getWalletForBill("Shared Japan Trip 2")).toBe("gotyme");
  });

  it("falls back to Maya for everything else, in full (not halved)", () => {
    expect(getWalletForBill("Water Bill")).toBe("maya");
    expect(getWalletForBill("Electricity Bill")).toBe("maya");
    expect(getWalletForBill("Macbook Loan")).toBe("maya");
    expect(getWalletForBill("Gym Membership")).toBe("maya");
  });

  it("is case-insensitive", () => {
    expect(getWalletForBill("unobank loan")).toBe("gcash");
    expect(getWalletForBill("SHARED JAPAN TRIP 2")).toBe("gotyme");
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
