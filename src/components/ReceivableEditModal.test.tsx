import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReceivableEditModal } from "./ReceivableEditModal";
import { CustomWallet, EditFormData } from "../types/finance";

const mockWallets: CustomWallet[] = [
  { id: "main", label: "Main Wallet" },
  { id: "maya", label: "Maya" },
  { id: "gcash", label: "GCash" },
];

const mockCategories = ["Salary", "Shoot", "Edit", "Payment", "Other"];

const defaultProps = {
  editingId: "rec-1",
  categoriesList: mockCategories,
  allWallets: mockWallets,
  onCancel: vi.fn(),
  onDelete: vi.fn(),
  onSave: vi.fn(),
};

describe("ReceivableEditModal — Gross / Deductions Integration", () => {
  it("1. Legacy receivable without gross/deductions loads gross from existing NET amount", () => {
    const editForm: EditFormData = {
      id: "rec-1",
      name: "Legacy Inflow",
      amount: 10000,
    };
    const onChange = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
      />
    );

    const grossInput = screen.getByLabelText("Gross Amount") as HTMLInputElement;
    expect(grossInput.value).toBe("10000");

    expect(screen.getByTestId("receivable-gross-display").textContent).toBe("₱10,000.00");
    expect(screen.getByTestId("receivable-net-display").textContent).toBe("₱10,000.00");
  });

  it("2. Legacy receivable with no deductions calculates NET equal to amount", () => {
    const editForm: EditFormData = {
      id: "rec-1",
      name: "Legacy Inflow",
      amount: 10000,
      deductions: [],
    };
    const onChange = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
      />
    );

    expect(screen.getByText("No deductions configured. Net equals gross.")).toBeInTheDocument();
    expect(screen.getByTestId("receivable-deductions-display").textContent).toBe("-₱0.00");
    expect(screen.getByTestId("receivable-net-display").textContent).toBe("₱10,000.00");
  });

  it("3. Fixed deduction calculates correct NET", () => {
    const editForm: EditFormData = {
      id: "rec-1",
      name: "Design Project",
      grossAmount: 25000,
      amount: 22000,
      deductions: [
        { id: "d1", name: "Platform Fee", type: "fixed", value: 3000 },
      ],
    };
    const onChange = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
      />
    );

    expect(screen.getByTestId("receivable-gross-display").textContent).toBe("₱25,000.00");
    expect(screen.getByTestId("receivable-deductions-display").textContent).toBe("-₱3,000.00");
    expect(screen.getByTestId("receivable-net-display").textContent).toBe("₱22,000.00");
  });

  it("4. Percentage deduction calculates correct NET", () => {
    const editForm: EditFormData = {
      id: "rec-1",
      name: "Photography Gig",
      grossAmount: 25000,
      amount: 22500,
      deductions: [
        { id: "d1", name: "Withholding Tax", type: "percentage", value: 10 },
      ],
    };
    const onChange = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
      />
    );

    expect(screen.getByTestId("receivable-gross-display").textContent).toBe("₱25,000.00");
    expect(screen.getByTestId("receivable-deductions-display").textContent).toBe("-₱2,500.00");
    expect(screen.getByTestId("receivable-net-display").textContent).toBe("₱22,500.00");
  });

  it("5. Multiple deductions calculate correct NET", () => {
    const editForm: EditFormData = {
      id: "rec-1",
      name: "Retainer Contract",
      grossAmount: 30000,
      amount: 25375,
      deductions: [
        { id: "d1", name: "SSS", type: "fixed", value: 1125 },
        { id: "d2", name: "Tax", type: "percentage", value: 10 },
        { id: "d3", name: "PhilHealth", type: "fixed", value: 500 },
      ],
    };
    const onChange = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
      />
    );

    // 30000 - (1125 + 3000 + 500) = 25375
    expect(screen.getByTestId("receivable-gross-display").textContent).toBe("₱30,000.00");
    expect(screen.getByTestId("receivable-deductions-display").textContent).toBe("-₱4,625.00");
    expect(screen.getByTestId("receivable-net-display").textContent).toBe("₱25,375.00");
  });

  it("6. Deductions exceeding gross cap NET at zero", () => {
    const editForm: EditFormData = {
      id: "rec-1",
      name: "Small Job",
      grossAmount: 10000,
      amount: 0,
      deductions: [
        { id: "d1", name: "Large Penalty", type: "fixed", value: 15000 },
      ],
    };
    const onChange = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
      />
    );

    expect(screen.getByTestId("receivable-gross-display").textContent).toBe("₱10,000.00");
    expect(screen.getByTestId("receivable-deductions-display").textContent).toBe("-₱10,000.00");
    expect(screen.getByTestId("receivable-net-display").textContent).toBe("₱0.00");
  });

  it("7. Editing gross updates NET", () => {
    const editForm: EditFormData = {
      id: "rec-1",
      name: "Variable Gig",
      grossAmount: 20000,
      amount: 18000,
      deductions: [
        { id: "d1", name: "Tax", type: "fixed", value: 2000 },
      ],
    };
    const onChange = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
      />
    );

    const grossInput = screen.getByLabelText("Gross Amount");
    fireEvent.change(grossInput, { target: { value: "30000" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        grossAmount: 30000,
        amount: 28000,
      })
    );
  });

  it("8. Adding/removing deductions updates NET", () => {
    const editForm: EditFormData = {
      id: "rec-1",
      name: "Variable Gig",
      grossAmount: 20000,
      amount: 20000,
      deductions: [],
    };
    const onChange = vi.fn();

    const { rerender } = render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
      />
    );

    // Add deduction
    const addBtn = screen.getByRole("button", { name: /add deduction/i });
    fireEvent.click(addBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        grossAmount: 20000,
        deductions: expect.arrayContaining([
          expect.objectContaining({ type: "fixed", value: 0 }),
        ]),
        amount: 20000,
      })
    );

    // Now re-render with a deduction and test remove
    const editFormWithDeduction: EditFormData = {
      ...editForm,
      deductions: [
        { id: "ded-test", name: "Commission", type: "fixed", value: 3000 },
      ],
      amount: 17000,
    };

    rerender(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editFormWithDeduction}
        onChange={onChange}
      />
    );

    const removeBtn = screen.getByRole("button", { name: /remove commission/i });
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        grossAmount: 20000,
        deductions: [],
        amount: 20000,
      })
    );
  });

  it("9. Save triggers onSave and onCancel without re-emitting unedited form data", () => {
    const editForm: EditFormData = {
      id: "rec-1",
      name: "Consulting Retainer",
      grossAmount: 25000,
      amount: 22000,
      deductions: [
        { id: "d1", name: "Withholding Tax", type: "fixed", value: 3000 },
      ],
    };
    const onChange = vi.fn();
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
        onSave={onSave}
        onCancel={onCancel}
      />
    );

    const saveBtn = screen.getByRole("button", { name: /save changes/i });
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("10. Existing collection log is NOT modified when receivable gross/deductions are edited", () => {
    // ReceivableEditModal strictly operates on EditFormData
    const editForm: EditFormData = {
      id: "rec-1",
      name: "Gig Inflow",
      grossAmount: 15000,
      amount: 13500,
      deductions: [
        { id: "d1", name: "Tax", type: "percentage", value: 10 },
      ],
    };
    const onChange = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
      />
    );

    const grossInput = screen.getByLabelText("Gross Amount");
    fireEvent.change(grossInput, { target: { value: "18000" } });

    // The emitted changes are strictly confined to EditFormData (amount, grossAmount, deductions)
    const emittedData = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(emittedData).not.toHaveProperty("recsCollected");
    expect(emittedData).not.toHaveProperty("logs");
    expect(emittedData).not.toHaveProperty("amountReceived");
    expect(emittedData.grossAmount).toBe(18000);
    expect(emittedData.amount).toBe(16200); // 18000 - 10% (1800) = 16200
  });

  it("11. Existing category/wallet/frequency behavior remains unchanged", () => {
    const editForm: EditFormData = {
      id: "rec-1",
      name: "Project A",
      grossAmount: 20000,
      amount: 18000,
      category: "Salary",
      wallet: "maya",
      frequency: "Monthly",
      monthlyDay: 15,
      deductions: [
        { id: "d1", name: "Tax", type: "fixed", value: 2000 },
      ],
    };
    const onChange = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
      />
    );

    // Change category
    const categoryDropdown = screen.getByLabelText("Category") as HTMLSelectElement;
    fireEvent.change(categoryDropdown, { target: { value: "Payment" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "Payment",
        grossAmount: 20000,
        amount: 18000,
      })
    );
  });

  it("12. Saving a legacy receivable without explicit gross/deduction edit preserves undefined metadata", () => {
    const editForm: EditFormData = {
      id: "rec-legacy-1",
      name: "Legacy Project",
      amount: 15000,
      // grossAmount and deductions are undefined
    };
    const onChange = vi.fn();
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
        onSave={onSave}
        onCancel={onCancel}
      />
    );

    // Initial render must NOT call onChange to fabricate grossAmount or deductions
    expect(onChange).not.toHaveBeenCalled();

    const saveBtn = screen.getByRole("button", { name: /save changes/i });
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
    // onChange must NOT be called on save without explicit edits
    expect(onChange).not.toHaveBeenCalled();
    expect(editForm.grossAmount).toBeUndefined();
    expect(editForm.deductions).toBeUndefined();
    expect(editForm.amount).toBe(15000);
  });

  it("13. Editing an unrelated field on a legacy receivable preserves undefined gross/deductions", () => {
    const editForm: EditFormData = {
      id: "rec-legacy-1",
      name: "Legacy Project",
      amount: 15000,
      category: "Salary",
    };
    const onChange = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
      />
    );

    const nameInput = screen.getByDisplayValue("Legacy Project");
    fireEvent.change(nameInput, { target: { value: "Renamed Legacy Project" } });

    expect(onChange).toHaveBeenCalledWith({
      ...editForm,
      name: "Renamed Legacy Project",
    });

    const emitted = onChange.mock.calls[0][0];
    expect(emitted.grossAmount).toBeUndefined();
    expect(emitted.deductions).toBeUndefined();
    expect(emitted.amount).toBe(15000);
  });

  it("14. Explicitly editing gross on a legacy receivable emits grossAmount, deductions, and derives NET", () => {
    const editForm: EditFormData = {
      id: "rec-legacy-1",
      name: "Legacy Project",
      amount: 15000,
    };
    const onChange = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
      />
    );

    const grossInput = screen.getByLabelText("Gross Amount");
    fireEvent.change(grossInput, { target: { value: "18000" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        grossAmount: 18000,
        deductions: [],
        amount: 18000,
      })
    );
  });

  it("15. Explicitly adding a deduction on a legacy receivable emits grossAmount, deductions, and derives NET", () => {
    const editForm: EditFormData = {
      id: "rec-legacy-1",
      name: "Legacy Project",
      amount: 15000,
    };
    const onChange = vi.fn();

    render(
      <ReceivableEditModal
        {...defaultProps}
        editForm={editForm}
        onChange={onChange}
      />
    );

    const addBtn = screen.getByRole("button", { name: /add deduction/i });
    fireEvent.click(addBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        grossAmount: 15000,
        deductions: expect.arrayContaining([
          expect.objectContaining({ type: "fixed", value: 0 }),
        ]),
        amount: 15000,
      })
    );
  });
});
