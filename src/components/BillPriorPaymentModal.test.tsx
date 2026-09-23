import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BillPriorPaymentModal } from "./BillPriorPaymentModal";
import { Bill, BillViewModel } from "../types/finance";

describe("BillPriorPaymentModal", () => {
  const mockBill: Bill = {
    id: "loan-1",
    name: "MacBook Installment",
    amount: 5000,
    dueDay: "15",
    type: "Loan / Installment",
    wallet: "maya",
    startMonth: "September 2026",
    endMonth: "February 2027",
  };

  const pendingPriorPayment = {
    bill: mockBill,
    month: "September 2026",
  };

  it("renders the prompt dialog with bill details", () => {
    const setPendingPriorPayment = vi.fn();
    const onToggleStatus = vi.fn();

    render(
      <BillPriorPaymentModal
        pendingPriorPayment={pendingPriorPayment}
        setPendingPriorPayment={setPendingPriorPayment}
        onToggleStatus={onToggleStatus}
      />
    );

    expect(screen.getByText("Was this payment already made?")).toBeInTheDocument();
    expect(
      screen.getByText(/MacBook Installment starts in September 2026/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave Unpaid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as Paid" })).toBeInTheDocument();
  });

  it("closes the modal without calling onToggleStatus when 'Leave Unpaid' is clicked", () => {
    const setPendingPriorPayment = vi.fn();
    const onToggleStatus = vi.fn();

    render(
      <BillPriorPaymentModal
        pendingPriorPayment={pendingPriorPayment}
        setPendingPriorPayment={setPendingPriorPayment}
        onToggleStatus={onToggleStatus}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Leave Unpaid" }));

    expect(setPendingPriorPayment).toHaveBeenCalledWith(null);
    expect(onToggleStatus).not.toHaveBeenCalled();
  });

  it("invokes onToggleStatus with skipWalletMutation true when 'Mark as Paid' is clicked", () => {
    const setPendingPriorPayment = vi.fn();
    const onToggleStatus = vi.fn();

    render(
      <BillPriorPaymentModal
        pendingPriorPayment={pendingPriorPayment}
        setPendingPriorPayment={setPendingPriorPayment}
        onToggleStatus={onToggleStatus}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark as Paid" }));

    expect(onToggleStatus).toHaveBeenCalledTimes(1);
    expect(onToggleStatus).toHaveBeenCalledWith(
      expect.objectContaining<Partial<BillViewModel>>({
        id: "loan-1",
        name: "MacBook Installment",
        amount: 5000,
        baseAmount: 5000,
        paid: false,
        targetMonthForDue: "September 2026",
      }),
      true // skipWalletMutation: true
    );
    expect(setPendingPriorPayment).toHaveBeenCalledWith(null);
  });
});
