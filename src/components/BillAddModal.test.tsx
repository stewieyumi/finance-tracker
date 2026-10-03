import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BillAddModal } from "./BillAddModal";
import { CustomWallet } from "../types/finance";

const mockWallets: CustomWallet[] = [
  { id: "main", label: "Main Wallet" },
  { id: "vault", label: "Savings Vault" },
];

describe("BillAddModal", () => {
  const defaultBill = {
    name: "Internet Fiber",
    amount: "1899",
    dueDay: "15",
    type: "Bill" as const,
    startMonth: "January 2026",
    endMonth: "December 2026",
    wallet: "main",
  };

  it("renders correctly with dialog accessibility attributes", () => {
    render(
      <BillAddModal
        newBill={defaultBill}
        setNewBill={vi.fn()}
        customWallets={mockWallets}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-label", "Add New Commitment");
    expect(screen.getByText("Add New Commitment")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Internet Fiber")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1899")).toBeInTheDocument();
  });

  it("handles field inputs and triggers setNewBill", () => {
    const setNewBill = vi.fn();
    render(
      <BillAddModal
        newBill={defaultBill}
        setNewBill={setNewBill}
        customWallets={mockWallets}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const nameInput = screen.getByDisplayValue("Internet Fiber");
    fireEvent.change(nameInput, { target: { value: "Water Bill" } });
    expect(setNewBill).toHaveBeenCalled();

    const amountInput = screen.getByDisplayValue("1899");
    fireEvent.change(amountInput, { target: { value: "500" } });
    expect(setNewBill).toHaveBeenCalled();
  });

  it("submits the form when Add Commitment button is clicked", () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <BillAddModal
        newBill={defaultBill}
        setNewBill={vi.fn()}
        customWallets={mockWallets}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );

    const submitBtn = screen.getByRole("button", { name: /add commitment/i });
    fireEvent.click(submitBtn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("triggers onCancel when close button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <BillAddModal
        newBill={defaultBill}
        setNewBill={vi.fn()}
        customWallets={mockWallets}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    );

    const closeBtn = screen.getAllByRole("button")[0]; // first button is the X close button
    fireEvent.click(closeBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("triggers onCancel when Escape key is pressed", () => {
    const onCancel = vi.fn();
    render(
      <BillAddModal
        newBill={defaultBill}
        setNewBill={vi.fn()}
        customWallets={mockWallets}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("triggers onCancel when backdrop is clicked", () => {
    const onCancel = vi.fn();
    render(
      <BillAddModal
        newBill={defaultBill}
        setNewBill={vi.fn()}
        customWallets={mockWallets}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not trigger onCancel when clicking inside the modal content", () => {
    const onCancel = vi.fn();
    render(
      <BillAddModal
        newBill={defaultBill}
        setNewBill={vi.fn()}
        customWallets={mockWallets}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    );

    const modalTitle = screen.getByText("Add New Commitment");
    fireEvent.click(modalTitle);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
