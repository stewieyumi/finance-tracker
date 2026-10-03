import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ReceivableAddModal, { NewReceivableForm } from "./ReceivableAddModal";

const mockWallets = [
  { id: "main", label: "Main Wallet" },
  { id: "maya", label: "Maya" },
];

const mockCategories = ["Salary", "Shoot", "Edit", "Payment", "Other"];

describe("ReceivableAddModal", () => {
  const defaultReceivable: NewReceivableForm = {
    name: "Consulting Gig",
    amount: "25000",
    category: "Salary",
    wallet: "main",
    frequency: "Monthly",
    biMonthlyDays: [15, 30],
    monthlyDay: 15,
    date: "2026-08-15",
  };

  it("renders correctly with dialog accessibility attributes", () => {
    render(
      <ReceivableAddModal
        newReceivable={defaultReceivable}
        categoriesList={mockCategories}
        allWallets={mockWallets}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-label", "Add New Inflow");
    expect(screen.getByText("Add New Inflow")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Consulting Gig")).toBeInTheDocument();
    expect(screen.getByDisplayValue("25000")).toBeInTheDocument();
  });

  it("handles form inputs and triggers onChange", () => {
    const onChange = vi.fn();
    render(
      <ReceivableAddModal
        newReceivable={defaultReceivable}
        categoriesList={mockCategories}
        allWallets={mockWallets}
        onChange={onChange}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const nameInput = screen.getByDisplayValue("Consulting Gig");
    fireEvent.change(nameInput, { target: { value: "Design Retainer" } });
    expect(onChange).toHaveBeenCalled();

    const amountInput = screen.getByDisplayValue("25000");
    fireEvent.change(amountInput, { target: { value: "30000" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("submits the form when Add Inflow button is clicked", () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <ReceivableAddModal
        newReceivable={defaultReceivable}
        categoriesList={mockCategories}
        allWallets={mockWallets}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const submitBtn = screen.getByRole("button", { name: /add inflow/i });
    fireEvent.click(submitBtn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("triggers onClose when header close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <ReceivableAddModal
        newReceivable={defaultReceivable}
        categoriesList={mockCategories}
        allWallets={mockWallets}
        onChange={vi.fn()}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );

    const closeBtn = screen.getAllByRole("button")[0];
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("triggers onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <ReceivableAddModal
        newReceivable={defaultReceivable}
        categoriesList={mockCategories}
        allWallets={mockWallets}
        onChange={vi.fn()}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("triggers onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <ReceivableAddModal
        newReceivable={defaultReceivable}
        categoriesList={mockCategories}
        allWallets={mockWallets}
        onChange={vi.fn()}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
