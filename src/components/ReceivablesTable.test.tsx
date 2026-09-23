import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReceivablesTable } from "./ReceivablesTable";
import { ReceivableViewModel } from "../types/finance";

const createReceivable = (
  overrides: Partial<ReceivableViewModel> = {}
): ReceivableViewModel => ({
  id: "rec-test-1",
  name: "Test Inflow",
  amount: 1000,
  category: "Salary",
  frequency: "Monthly",
  wallet: "maya",
  monthlyDay: 15,
  amountReceived: 0,
  collected: false,
  targetMonthForDue: "September 2026",
  ...overrides,
});

const renderReceivablesTable = (
  activeReceivables: ReceivableViewModel[],
  overrides: Partial<React.ComponentProps<typeof ReceivablesTable>> = {}
) => {
  const setEditingId = vi.fn();
  const setEditForm = vi.fn();
  const onToggleStatus = vi.fn();
  const onAddPayment = vi.fn();
  const onAddReceivable = vi.fn();
  const onDeleteReceivable = vi.fn();
  const onSaveEdit = vi.fn();

  render(
    <ReceivablesTable
      activeReceivables={activeReceivables}
      selectedMonth="September 2026"
      onToggleStatus={onToggleStatus}
      onAddPayment={onAddPayment}
      onAddReceivable={onAddReceivable}
      onDeleteReceivable={onDeleteReceivable}
      onSaveEdit={onSaveEdit}
      editingId={null}
      setEditingId={setEditingId}
      editForm={{}}
      setEditForm={setEditForm}
      {...overrides}
    />
  );

  return { setEditingId, setEditForm, onToggleStatus, onAddPayment };
};

describe("ReceivablesTable - list, filtering, and interaction wiring", () => {
  it("filters receivables by category", () => {
    const recs = [
      createReceivable({ id: "rec-1", name: "Client Retainer", category: "Salary" }),
      createReceivable({ id: "rec-2", name: "Photo Shoot", category: "Shoot" }),
      createReceivable({ id: "rec-3", name: "Video Edit", category: "Edit" }),
    ];

    renderReceivablesTable(recs);

    expect(screen.getAllByText("Client Retainer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Photo Shoot").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Video Edit").length).toBeGreaterThan(0);

    // Open filter dropdown and select "Shoot"
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));
    fireEvent.click(screen.getByRole("button", { name: "Shoot" }));

    expect(screen.getAllByText("Photo Shoot").length).toBeGreaterThan(0);
    expect(screen.queryByText("Client Retainer")).not.toBeInTheDocument();
    expect(screen.queryByText("Video Edit")).not.toBeInTheDocument();
  });

  it("filters receivables across pay-period selector states (All, 1–15, 16–31)", () => {
    const recs = [
      createReceivable({
        id: "rec-first-half",
        name: "First Half Inflow",
        frequency: "Monthly",
        monthlyDay: 5,
      }),
      createReceivable({
        id: "rec-second-half",
        name: "Second Half Inflow",
        frequency: "Monthly",
        monthlyDay: 20,
      }),
      createReceivable({
        id: "rec-bimonthly",
        name: "Bi-Monthly Inflow",
        frequency: "Bi-monthly",
        biMonthlyDays: [15, 30],
      }),
    ];

    renderReceivablesTable(recs);

    // Initial state: "All" -> all visible
    expect(screen.getAllByText("First Half Inflow").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Second Half Inflow").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bi-Monthly Inflow").length).toBeGreaterThan(0);

    // Switch to "1–15" -> first half and bi-monthly visible; second half hidden
    fireEvent.click(screen.getByRole("button", { name: "1–15" }));
    expect(screen.getAllByText("First Half Inflow").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bi-Monthly Inflow").length).toBeGreaterThan(0);
    expect(screen.queryByText("Second Half Inflow")).not.toBeInTheDocument();

    // Switch to "16–31" -> second half and bi-monthly visible; first half hidden
    fireEvent.click(screen.getByRole("button", { name: "16–31" }));
    expect(screen.queryByText("First Half Inflow")).not.toBeInTheDocument();
    expect(screen.getAllByText("Second Half Inflow").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bi-Monthly Inflow").length).toBeGreaterThan(0);

    // Switch back to "All" -> all visible
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByText("First Half Inflow").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Second Half Inflow").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bi-Monthly Inflow").length).toBeGreaterThan(0);
  });

  it("opens edit modal when clicking the desktop row, and keeps status toggle strictly independent", () => {
    const rec = createReceivable({
      id: "rec-desktop-test",
      name: "Desktop Gig",
      amount: 5000,
      collected: false,
    });

    const onToggleStatus = vi.fn();
    const { setEditingId, setEditForm } = renderReceivablesTable([rec], { onToggleStatus });

    const desktopRow = screen.getByTestId("receivable-desktop-row-rec-desktop-test");

    // 1. Click desktop row -> calls onEdit (setEditingId, setEditForm), NOT onToggleStatus
    fireEvent.click(desktopRow);
    expect(setEditingId).toHaveBeenCalledWith("rec-desktop-test");
    expect(setEditForm).toHaveBeenCalledWith(expect.objectContaining({ id: "rec-desktop-test" }));
    expect(onToggleStatus).not.toHaveBeenCalled();

    setEditingId.mockClear();
    setEditForm.mockClear();
    onToggleStatus.mockClear();

    // 2. Click desktop status toggle -> calls onToggleStatus, NOT onEdit
    const statusBtn = screen.getAllByRole("button", { name: /mark desktop gig as received/i })[1];
    fireEvent.click(statusBtn);
    expect(onToggleStatus).toHaveBeenCalledTimes(1);
    expect(onToggleStatus).toHaveBeenCalledWith(expect.objectContaining({ id: "rec-desktop-test" }));
    expect(setEditingId).not.toHaveBeenCalled();
  });

  it("opens edit modal when clicking the mobile card, and keeps status toggle strictly independent", () => {
    const rec = createReceivable({
      id: "rec-mobile-test",
      name: "Mobile Gig",
      amount: 3500,
      collected: false,
    });

    const onToggleStatus = vi.fn();
    const { setEditingId, setEditForm } = renderReceivablesTable([rec], { onToggleStatus });

    const mobileCard = screen.getByTestId("receivable-mobile-row-rec-mobile-test");

    // 1. Click mobile card -> calls onEdit, NOT onToggleStatus
    fireEvent.click(mobileCard);
    expect(setEditingId).toHaveBeenCalledWith("rec-mobile-test");
    expect(setEditForm).toHaveBeenCalledWith(expect.objectContaining({ id: "rec-mobile-test" }));
    expect(onToggleStatus).not.toHaveBeenCalled();

    setEditingId.mockClear();
    setEditForm.mockClear();
    onToggleStatus.mockClear();

    // 2. Click mobile status button -> calls onToggleStatus, NOT onEdit
    const mobileStatusBtn = screen.getAllByRole("button", { name: /mark mobile gig as received/i })[0];
    fireEvent.click(mobileStatusBtn);
    expect(onToggleStatus).toHaveBeenCalledTimes(1);
    expect(onToggleStatus).toHaveBeenCalledWith(expect.objectContaining({ id: "rec-mobile-test" }));
    expect(setEditingId).not.toHaveBeenCalled();
  });

  it("keeps payment actions independent from the edit modal", () => {
    const rec = createReceivable({
      id: "rec-payment-test",
      name: "Payment Inflow",
      amount: 4000,
      frequency: "Bi-monthly",
      collected: false,
    });

    const onAddPayment = vi.fn();
    const { setEditingId } = renderReceivablesTable([rec], { onAddPayment });

    // Click quick add half (+1/2) button
    const halfButtons = screen.getAllByRole("button", { name: "+1/2" });
    fireEvent.click(halfButtons[0]);

    expect(onAddPayment).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rec-payment-test" }),
      2000
    );
    expect(setEditingId).not.toHaveBeenCalled();
  });

  it("displays expected, received, and remaining amounts for partial receivables", () => {
    const partialRec = createReceivable({
      id: "rec-partial-test",
      name: "Partial Project",
      amount: 10000,
      amountReceived: 4000,
      collected: false,
    });

    renderReceivablesTable([partialRec]);

    // Should display expected amount
    expect(screen.getAllByText("₱10,000.00").length).toBeGreaterThan(0);
    // Should display received amount
    expect(screen.getAllByText("₱4,000.00 received").length).toBeGreaterThan(0);
    // Should display remaining amount
    expect(screen.getAllByText("₱6,000.00 remaining").length).toBeGreaterThan(0);
  });
});
