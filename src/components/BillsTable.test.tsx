import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
});
