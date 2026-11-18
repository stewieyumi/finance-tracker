import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

    const closeBtn = screen.getByRole("button", { name: "Cancel new inflow" });
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

  it.each(["By Date", "No Specific Date", "Monthly", "Bi-monthly"] as const)(
    "names the controls and optional-field guidance for %s",
    (frequency) => {
      render(<ReceivableAddModal
        newReceivable={{ ...defaultReceivable, frequency, amount: "", date: "" }}
        categoriesList={mockCategories} allWallets={mockWallets}
        onChange={vi.fn()} onClose={vi.fn()} onSubmit={vi.fn()}
      />);
      expect(screen.getByRole("textbox", { name: "Inflow Name" })).toHaveFocus();
      const amount = screen.getByRole("spinbutton", {
        name: frequency === "Bi-monthly" ? "Amount per payday (₱)" : "Amount (₱)",
      });
      expect(amount).not.toBeRequired();
      expect(amount).toHaveValue(null);
      expect(amount).toHaveAccessibleDescription(/Amount and date are optional/);
      expect(screen.getByRole("combobox", { name: "Category" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Destination Wallet" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Frequency" })).toHaveValue(frequency);
      if (frequency === "By Date") {
        const date = screen.getByLabelText("Date");
        expect(date).not.toBeRequired();
        expect(date).toHaveValue("");
        expect(date).toHaveAccessibleDescription(/edit later/);
      } else if (frequency === "Monthly") {
        expect(screen.getByRole("combobox", { name: "Day of Month" })).toBeInTheDocument();
      } else if (frequency === "Bi-monthly") {
        expect(screen.getByRole("combobox", { name: "First Day" })).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Second Day" })).toBeInTheDocument();
      }
    },
  );

  it("keeps keyboard focus inside and restores the opener when an unsaved inflow is canceled", () => {
    const submit = vi.fn();
    function Harness() {
      const [open, setOpen] = React.useState(false);
      const [value, setValue] = React.useState(defaultReceivable);
      return <><button onClick={() => setOpen(true)}>New inflow</button>{open &&
        <ReceivableAddModal newReceivable={value} onChange={setValue}
          categoriesList={mockCategories} allWallets={mockWallets}
          onClose={() => setOpen(false)} onSubmit={submit} />}</>;
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "New inflow" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Add New Inflow" });
    const name = within(dialog).getByRole("textbox", { name: "Inflow Name" });
    expect(name).toHaveFocus();
    fireEvent.change(name, { target: { value: "Unsaved client" } });
    const first = within(dialog).getByRole("button", { name: "Cancel new inflow" });
    const last = within(dialog).getByRole("button", { name: "Add Inflow" });
    const rects = vi.spyOn(HTMLElement.prototype, "getClientRects")
      .mockReturnValue([{ width: 1, height: 1 }] as unknown as DOMRectList);
    try {
      first.focus();
      fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
      expect(last).toHaveFocus();
      fireEvent.keyDown(last, { key: "Tab" });
      expect(first).toHaveFocus();
      fireEvent.keyDown(first, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
      expect(submit).not.toHaveBeenCalled();
    } finally {
      rects.mockRestore();
    }
  });
});
