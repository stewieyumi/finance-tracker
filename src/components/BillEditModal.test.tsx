import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BillEditModal } from "./BillEditModal";
import { BillViewModel, CustomWallet, EditFormData } from "../types/finance";

const mockWallets: CustomWallet[] = [
  { id: "main", label: "Main Wallet" },
  { id: "vault", label: "Savings Vault" },
];

const mockBills: BillViewModel[] = [
  {
    id: "bill-1",
    name: "Electricity",
    amount: 3500,
    baseAmount: 3500,
    dueDay: "20",
    type: "Bill",
    wallet: "main",
    paid: false,
    targetMonthForDue: "August 2026",
    daysLeft: 10,
    isOverridden: false,
  },
];

describe("BillEditModal", () => {
  const defaultEditForm: EditFormData = {
    id: "bill-1",
    name: "Electricity",
    amount: 3500,
    wallet: "main",
    type: "Bill",
    dueDay: "20",
  };

  it("renders correctly with dialog accessibility attributes", () => {
    render(
      <BillEditModal
        editingId="bill-1"
        activeBills={mockBills}
        selectedMonth="August 2026"
        editForm={defaultEditForm}
        setEditForm={vi.fn()}
        editScope="default"
        onScopeChange={vi.fn()}
        onCancel={vi.fn()}
        onDeleteBill={vi.fn()}
        onResetMonthOverride={vi.fn()}
        onSaveEdit={vi.fn()}
        customWallets={mockWallets}
        defaultWallet="main"
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-label", "Edit Commitment");
    expect(screen.getByText("Edit Commitment")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Electricity")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3500")).toBeInTheDocument();
  });

  it("handles scope changes and form editing", () => {
    const onScopeChange = vi.fn();
    const setEditForm = vi.fn();

    render(
      <BillEditModal
        editingId="bill-1"
        activeBills={mockBills}
        selectedMonth="August 2026"
        editForm={defaultEditForm}
        setEditForm={setEditForm}
        editScope="default"
        onScopeChange={onScopeChange}
        onCancel={vi.fn()}
        onDeleteBill={vi.fn()}
        onResetMonthOverride={vi.fn()}
        onSaveEdit={vi.fn()}
        customWallets={mockWallets}
        defaultWallet="main"
      />
    );

    const monthOnlyBtn = screen.getByRole("button", { name: /august only/i });
    fireEvent.click(monthOnlyBtn);
    expect(onScopeChange).toHaveBeenCalledWith("monthOnly");

    const nameInput = screen.getByDisplayValue("Electricity");
    fireEvent.change(nameInput, { target: { value: "Power Co" } });
    expect(setEditForm).toHaveBeenCalled();
  });

  it("triggers onSaveEdit when Save Changes is clicked", () => {
    const onSaveEdit = vi.fn();

    render(
      <BillEditModal
        editingId="bill-1"
        activeBills={mockBills}
        selectedMonth="August 2026"
        editForm={defaultEditForm}
        setEditForm={vi.fn()}
        editScope="default"
        onScopeChange={vi.fn()}
        onCancel={vi.fn()}
        onDeleteBill={vi.fn()}
        onResetMonthOverride={vi.fn()}
        onSaveEdit={onSaveEdit}
        customWallets={mockWallets}
        defaultWallet="main"
      />
    );

    const saveBtn = screen.getByRole("button", { name: /save changes/i });
    fireEvent.click(saveBtn);
    expect(onSaveEdit).toHaveBeenCalledWith("bills", "default");
  });

  it("triggers onDeleteBill and onCancel when delete button is clicked", () => {
    const onDeleteBill = vi.fn();
    const onCancel = vi.fn();

    render(
      <BillEditModal
        editingId="bill-1"
        activeBills={mockBills}
        selectedMonth="August 2026"
        editForm={defaultEditForm}
        setEditForm={vi.fn()}
        editScope="default"
        onScopeChange={vi.fn()}
        onCancel={onCancel}
        onDeleteBill={onDeleteBill}
        onResetMonthOverride={vi.fn()}
        onSaveEdit={vi.fn()}
        customWallets={mockWallets}
        defaultWallet="main"
      />
    );

    const buttons = screen.getAllByRole("button");
    // Find the trash button (it has a Trash2 icon inside and rose styling)
    const deleteBtn = buttons.find((b) => b.className.includes("bg-rose-500"));
    expect(deleteBtn).toBeDefined();
    fireEvent.click(deleteBtn!);

    expect(onDeleteBill).toHaveBeenCalledWith("bill-1");
    expect(onCancel).toHaveBeenCalled();
  });

  it("triggers onCancel when Escape key is pressed", () => {
    const onCancel = vi.fn();

    render(
      <BillEditModal
        editingId="bill-1"
        activeBills={mockBills}
        selectedMonth="August 2026"
        editForm={defaultEditForm}
        setEditForm={vi.fn()}
        editScope="default"
        onScopeChange={vi.fn()}
        onCancel={onCancel}
        onDeleteBill={vi.fn()}
        onResetMonthOverride={vi.fn()}
        onSaveEdit={vi.fn()}
        customWallets={mockWallets}
        defaultWallet="main"
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("triggers onCancel when backdrop is clicked", () => {
    const onCancel = vi.fn();

    render(
      <BillEditModal
        editingId="bill-1"
        activeBills={mockBills}
        selectedMonth="August 2026"
        editForm={defaultEditForm}
        setEditForm={vi.fn()}
        editScope="default"
        onScopeChange={vi.fn()}
        onCancel={onCancel}
        onDeleteBill={vi.fn()}
        onResetMonthOverride={vi.fn()}
        onSaveEdit={vi.fn()}
        customWallets={mockWallets}
        defaultWallet="main"
      />
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
