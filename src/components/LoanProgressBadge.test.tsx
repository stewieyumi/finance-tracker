import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoanProgressBadge } from "./LoanProgressBadge";

describe("LoanProgressBadge", () => {
  it("renders 'Month X of Y' progression and remaining balance accurately", () => {
    render(
      <LoanProgressBadge
        startMonth="August 2026"
        endMonth="January 2027"
        targetMonthForDue="October 2026"
        isPaid={false}
        monthlyAmount={2000}
        paidInstallments={2}
        totalPaid={4000}
      />
    );

    // Total months = Aug, Sep, Oct, Nov, Dec, Jan = 6 months
    // Elapsed = paidInstallments = 2
    // Remaining = 6 - 2 = 4 left
    // Total principal = 6 * 2000 = 12000
    // Remaining balance = 12000 - 4000 = 8000
    expect(screen.getByText(/Month/)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/of 6/)).toBeInTheDocument();
    expect(screen.getByText("(4 left)")).toBeInTheDocument();
    expect(screen.getByText("₱8,000.00 remaining")).toBeInTheDocument();
  });

  it("renders '✓ Completed' state when all months are paid", () => {
    render(
      <LoanProgressBadge
        startMonth="August 2026"
        endMonth="October 2026"
        targetMonthForDue="October 2026"
        isPaid={true}
        monthlyAmount={1500}
        paidInstallments={3}
        totalPaid={4500}
      />
    );

    expect(screen.getByText("✓ Completed")).toBeInTheDocument();
    expect(screen.getByText("₱0.00 remaining")).toBeInTheDocument();
    expect(screen.queryByText(/left\)/)).not.toBeInTheDocument();
  });

  it("calculates fallback elapsed months based on targetMonthForDue when paidInstallments is undefined", () => {
    // startMonth: Aug 2026 (index 7 + 2026*12 = 24319)
    // targetMonthForDue: Oct 2026 (index 9 + 2026*12 = 24321)
    // delta = 24321 - 24319 = 2. With isPaid = false -> fallbackElapsed = 2
    render(
      <LoanProgressBadge
        startMonth="August 2026"
        endMonth="January 2027"
        targetMonthForDue="October 2026"
        isPaid={false}
        monthlyAmount={1000}
      />
    );

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/of 6/)).toBeInTheDocument();
    expect(screen.getByText("(4 left)")).toBeInTheDocument();
    expect(screen.getByText("₱4,000.00 remaining")).toBeInTheDocument();
  });

  it("returns null when startMonth or endMonth is missing or invalid", () => {
    const { container: c1 } = render(
      <LoanProgressBadge
        startMonth={undefined}
        endMonth="January 2027"
        targetMonthForDue="October 2026"
        isPaid={false}
        monthlyAmount={1000}
      />
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <LoanProgressBadge
        startMonth="January 2027"
        endMonth="August 2026" // end < start
        targetMonthForDue="October 2026"
        isPaid={false}
        monthlyAmount={1000}
      />
    );
    expect(c2.firstChild).toBeNull();
  });
});
