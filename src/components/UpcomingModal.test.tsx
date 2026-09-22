import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpcomingModal } from "./UpcomingModal";
import { BillViewModel } from "../types/finance";
import React from "react";

describe("UpcomingModal", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    overdueBills: [] as BillViewModel[],
    overdueSum: 0,
    totalUnpaidCommitments: 5400,
    priorityUnpaidSum: 2000,
    activeBills: [
      {
        id: "bill-1",
        name: "Internet Bill",
        amount: 1999,
        baseAmount: 1999,
        dueDay: "10",
        type: "Bill" as const,
        paid: false,
        startMonth: "Sep 2026",
        endMonth: "Sep 2026",
        targetMonthForDue: "Sep 2026",
        daysLeft: 4,
        isOverridden: false
      }
    ],
    selectedMonth: "Sep 2026",
    onViewAllCommitments: vi.fn(),
    onJumpToOverdue: vi.fn()
  };

  it("does not render when isOpen is false", () => {
    const { container } = render(<UpcomingModal {...defaultProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders total unpaid, priority, and upcoming bills", () => {
    render(<UpcomingModal {...defaultProps} />);
    expect(screen.getByText("Upcoming Commitments")).toBeInTheDocument();
    expect(screen.getByText("₱5,400.00")).toBeInTheDocument();
    expect(screen.getByText("₱2,000.00")).toBeInTheDocument();
    expect(screen.getByText("Internet Bill")).toBeInTheDocument();
    expect(screen.getByText("₱1,999.00")).toBeInTheDocument();
  });

  it("renders overdue alert banner and triggers onJumpToOverdue when clicked", () => {
    const overdueBill: BillViewModel = {
      id: "bill-overdue",
      name: "Water Bill",
      amount: 800,
      baseAmount: 800,
      dueDay: "2",
      type: "Bill",
      paid: false,
      startMonth: "Sep 2026",
      endMonth: "Sep 2026",
      targetMonthForDue: "Sep 2026",
      daysLeft: -5,
      isOverridden: false
    };

    render(
      <UpcomingModal
        {...defaultProps}
        overdueBills={[overdueBill]}
        overdueSum={800}
      />
    );

    expect(screen.getByText(/1 Overdue Commitment/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/1 Overdue Commitment/i));
    expect(defaultProps.onJumpToOverdue).toHaveBeenCalled();
  });

  it("invokes onViewAllCommitments and onClose when CTA is clicked", () => {
    render(<UpcomingModal {...defaultProps} />);
    const cta = screen.getByText("View All Commitments");
    fireEvent.click(cta);
    expect(defaultProps.onViewAllCommitments).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("closes on Escape key", () => {
    render(<UpcomingModal {...defaultProps} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
