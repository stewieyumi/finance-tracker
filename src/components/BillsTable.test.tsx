import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { BillsTable } from "./BillsTable";
import { BillViewModel, EditFormData } from "../types/finance";

const createBill = (
  overrides: Partial<BillViewModel> = {}
): BillViewModel => ({
  id: "bill-test-1",
  name: "Test Bill",
  amount: 1000,
  dueDay: "15",
  type: "Bill",
  wallet: "maya",
  startMonth: "August 2026",
  endMonth: "October 2026",
  paid: false,
  targetMonthForDue: "September 2026",
  daysLeft: 10,
  isOverridden: false,
  baseAmount: 1000,
  ...overrides,
});

const renderBillsTable = (
  activeBills: BillViewModel[],
  overrides: Partial<React.ComponentProps<typeof BillsTable>> = {}
) => {
  const setEditingId = vi.fn();
  const setEditForm = vi.fn();

  render(
    <BillsTable
      activeBills={activeBills}
      selectedMonth="September 2026"
      onToggleStatus={vi.fn()}
      onAddBill={vi.fn()}
      onDeleteBill={vi.fn()}
      onSaveEdit={vi.fn(() => true)}
      onResetMonthOverride={vi.fn()}
      editingId={null}
      setEditingId={setEditingId}
      editForm={{}}
      setEditForm={setEditForm}
      defaultWallet="maya"
      {...overrides}
    />
  );

  return { setEditingId, setEditForm };
};

describe("BillsTable - list and edit wiring", () => {
  it("filters and searches the displayed commitments", () => {
    const bills = [
      createBill({
        id: "internet",
        name: "Internet",
        type: "Bill",
      }),
      createBill({
        id: "netflix",
        name: "Netflix",
        type: "Subscription",
      }),
      createBill({
        id: "loan",
        name: "Home Credit",
        type: "Loan / Installment",
      }),
    ];

    renderBillsTable(bills);

    expect(screen.getAllByText("Internet").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Netflix").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Home Credit").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: "Netflix" },
    });

    expect(screen.getAllByText("Netflix").length).toBeGreaterThan(0);
    expect(screen.queryByText("Internet")).not.toBeInTheDocument();
    expect(screen.queryByText("Home Credit")).not.toBeInTheDocument();
  });

  it("starts editing a bill with month-only scope and the current monthly amount", () => {
    const bill = createBill({
      amount: 1200,
      baseAmount: 1000,
      name: "Internet",
    });

    const { setEditingId, setEditForm } = renderBillsTable([bill]);

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);

    expect(setEditingId).toHaveBeenCalledWith("bill-test-1");
    expect(setEditForm).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "bill-test-1",
        amount: 1200,
        monthAmount: 1200,
        baseAmount: 1000,
      })
    );
  });

  it("switches edit scope from month-only to default base amount", () => {
    const bill = createBill({
      amount: 1200,
      baseAmount: 1000,
      name: "Internet",
    });

    const editForm: EditFormData = {
      id: bill.id,
      name: bill.name,
      amount: bill.amount,
      monthAmount: bill.amount,
      baseAmount: bill.baseAmount,
      dueDay: bill.dueDay,
      type: bill.type,
      wallet: bill.wallet,
    };

    const setEditForm = vi.fn();

    renderBillsTable([bill], {
      editingId: bill.id,
      editForm,
      setEditForm,
    });

    fireEvent.click(screen.getByRole("button", { name: /default base/i }));

    const updater = setEditForm.mock.calls[0][0];

    expect(typeof updater).toBe("function");

    const nextForm = updater(editForm);

    expect(nextForm).toEqual(
      expect.objectContaining({
        amount: 1000,
        monthAmount: 1200,
        baseAmount: 1000,
      })
    );
  });

  it("pays from the desktop row and opens the editor from Edit", () => {
    const bill = createBill({
      id: "bill-card-test",
      name: "Water Bill",
      amount: 450,
      paid: false,
    });

    const onToggleStatus = vi.fn();
    const { setEditingId } = renderBillsTable([bill], { onToggleStatus });

    const desktopRow = screen.getAllByText("Water Bill")[1].closest("tr")!;
    fireEvent.click(desktopRow);
    expect(onToggleStatus).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "bill-card-test" }));
    expect(setEditingId).not.toHaveBeenCalled();

    onToggleStatus.mockClear();
    fireEvent.click(within(desktopRow).getByRole("button", { name: "Edit" }));
    expect(setEditingId).toHaveBeenCalledWith("bill-card-test");
    expect(onToggleStatus).not.toHaveBeenCalled();
  });

  it("filters commitments correctly across pay-period selector states (All, 1–15, 16–31)", () => {
    const bills = [
      createBill({
        id: "bill-half-1",
        name: "First Half Bill",
        dueDay: "5",
      }),
      createBill({
        id: "bill-half-2",
        name: "Second Half Bill",
        dueDay: "20",
      }),
    ];

    renderBillsTable(bills);

    // Initial state: "All" -> both bills visible
    expect(screen.getAllByText("First Half Bill").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Second Half Bill").length).toBeGreaterThan(0);

    // Switch to "1–15" -> only first half visible
    fireEvent.click(screen.getByRole("button", { name: "1–15" }));
    expect(screen.getAllByText("First Half Bill").length).toBeGreaterThan(0);
    expect(screen.queryByText("Second Half Bill")).not.toBeInTheDocument();

    // Switch to "16–31" -> only second half visible
    fireEvent.click(screen.getByRole("button", { name: "16–31" }));
    expect(screen.queryByText("First Half Bill")).not.toBeInTheDocument();
    expect(screen.getAllByText("Second Half Bill").length).toBeGreaterThan(0);

    // Switch back to "All" -> both bills visible again
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByText("First Half Bill").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Second Half Bill").length).toBeGreaterThan(0);
  });

  it("pays from the mobile card and opens the editor from Edit", () => {
    const bill = createBill({
      id: "bill-mobile-test",
      name: "Electric Bill",
      amount: 2500,
      paid: false,
    });

    const onToggleStatus = vi.fn();
    const { setEditingId } = renderBillsTable([bill], { onToggleStatus });

    const mobileCard = screen.getByTestId("bill-mobile-row-bill-mobile-test");

    fireEvent.click(mobileCard);
    expect(onToggleStatus).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "bill-mobile-test" }));
    expect(setEditingId).not.toHaveBeenCalled();

    onToggleStatus.mockClear();
    fireEvent.click(within(mobileCard).getByRole("button", { name: "Edit" }));
    expect(setEditingId).toHaveBeenCalledWith("bill-mobile-test");
    expect(onToggleStatus).not.toHaveBeenCalled();
  });

  it("renders the historical target-month indicator when targetMonthForDue differs from selectedMonth", () => {
    const historicalBill = createBill({
      id: "bill-historical-1",
      name: "Past Due Loan",
      targetMonthForDue: "August 2026",
      paid: false,
    });

    const currentBill = createBill({
      id: "bill-current-1",
      name: "Current Month Bill",
      targetMonthForDue: "September 2026",
      paid: false,
    });

    renderBillsTable([historicalBill, currentBill], {
      selectedMonth: "September 2026",
    });

    // Should display the "For August 2026" indicator for the historical bill
    const indicators = screen.getAllByText("For August 2026");
    expect(indicators.length).toBeGreaterThan(0);

    // Normal current-month bill should NOT display "For September 2026"
    expect(screen.queryByText("For September 2026")).not.toBeInTheDocument();
  });

  it("exports the month without adding calendar actions to bill rows", () => {
    const bill = createBill({
      id: "bill-export-test",
      name: "Water Utility",
    });

    const onExportMonthCalendar = vi.fn();
    renderBillsTable([bill], { onExportMonthCalendar });

    // Month export button in header
    const exportBtn = screen.getByLabelText("Export commitments to calendar");
    fireEvent.click(exportBtn);
    expect(onExportMonthCalendar).toHaveBeenCalledTimes(1);
    expect(onExportMonthCalendar).toHaveBeenCalledWith([bill], "September 2026");

    expect(screen.queryByLabelText("Export Water Utility to calendar")).not.toBeInTheDocument();
  });

  it("toggles paid commitments visibility without triggering financial mutations", () => {
    const paidBill = createBill({
      id: "paid-bill",
      name: "Paid Electricity",
      paid: true,
    });
    const unpaidBill = createBill({
      id: "unpaid-bill",
      name: "Unpaid Rent",
      paid: false,
    });

    const onToggleStatus = vi.fn();
    renderBillsTable([paidBill, unpaidBill], { onToggleStatus });

    // Default state: both bills are visible
    expect(screen.getAllByText("Paid Electricity").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unpaid Rent").length).toBeGreaterThan(0);

    // Toggle button is rendered
    const toggleBtn = screen.getByLabelText("Hide paid commitments");
    expect(toggleBtn).toBeInTheDocument();

    // Click toggle to hide paid commitments
    fireEvent.click(toggleBtn);
    expect(screen.queryByText("Paid Electricity")).not.toBeInTheDocument();
    expect(screen.getAllByText("Unpaid Rent").length).toBeGreaterThan(0);
    expect(toggleBtn).toHaveAttribute("aria-label", "Show paid commitments");

    // Click toggle again to restore paid commitments
    fireEvent.click(toggleBtn);
    expect(screen.getAllByText("Paid Electricity").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unpaid Rent").length).toBeGreaterThan(0);
    expect(toggleBtn).toHaveAttribute("aria-label", "Hide paid commitments");

    // Financial action was never called
    fireEvent.click(screen.getByTestId("bill-mobile-row-paid-bill"));
    expect(onToggleStatus).not.toHaveBeenCalled();
  });
});
