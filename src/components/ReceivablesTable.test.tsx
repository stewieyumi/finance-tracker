import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

  it("records payment from the desktop row and keeps Edit separate", () => {
    const rec = createReceivable({
      id: "rec-desktop-test",
      name: "Desktop Gig",
      amount: 5000,
      collected: false,
    });

    const onToggleStatus = vi.fn();
    const { setEditingId, setEditForm } = renderReceivablesTable([rec], { onToggleStatus });

    const desktopRow = screen.getByTestId("receivable-desktop-row-rec-desktop-test");

    fireEvent.click(desktopRow);
    expect(onToggleStatus).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "rec-desktop-test" }));
    expect(setEditingId).not.toHaveBeenCalled();

    onToggleStatus.mockClear();
    fireEvent.click(within(desktopRow).getByRole("button", { name: "Edit" }));
    expect(setEditingId).toHaveBeenCalledWith("rec-desktop-test");
    expect(setEditForm).toHaveBeenCalledWith(expect.objectContaining({ id: "rec-desktop-test" }));
    expect(onToggleStatus).not.toHaveBeenCalled();
  });

  it("records payment from the mobile card and keeps Edit separate", () => {
    const rec = createReceivable({
      id: "rec-mobile-test",
      name: "Mobile Gig",
      amount: 3500,
      collected: false,
    });

    const onToggleStatus = vi.fn();
    const { setEditingId, setEditForm } = renderReceivablesTable([rec], { onToggleStatus });

    const mobileCard = screen.getByTestId("receivable-mobile-row-rec-mobile-test");

    fireEvent.click(mobileCard);
    expect(onToggleStatus).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "rec-mobile-test" }));
    expect(setEditingId).not.toHaveBeenCalled();

    onToggleStatus.mockClear();
    fireEvent.click(within(mobileCard).getByRole("button", { name: "Edit" }));
    expect(setEditingId).toHaveBeenCalledWith("rec-mobile-test");
    expect(setEditForm).toHaveBeenCalledWith(expect.objectContaining({ id: "rec-mobile-test" }));
    expect(onToggleStatus).not.toHaveBeenCalled();
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

    fireEvent.click(screen.getByTestId(`receivable-mobile-row-${rec.id}`));

    expect(onAddPayment).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rec-payment-test" }),
      2000,
      15
    );
    expect(setEditingId).not.toHaveBeenCalled();
  });

  it("settles the remaining payday when the status control is tapped after a partial payment", () => {
    const rec = createReceivable({
      name: "Salary", amount: 4000, amountReceived: 2000, frequency: "Bi-monthly",
      biMonthlyDays: [5, 20], paydayReceived: { 5: 2000 },
    });
    const onAddPayment = vi.fn();
    renderReceivablesTable([rec], { onAddPayment });

    fireEvent.click(screen.getAllByRole("button", { name: "Settle remaining payment for Salary" })[0]);
    expect(onAddPayment).toHaveBeenCalledWith(expect.objectContaining({ id: rec.id }), 2000, 20);
  });

  it("passes a custom partial amount to the explicitly selected payday", () => {
    const rec = createReceivable({ frequency: "Bi-monthly", biMonthlyDays: [5, 20] });
    const onAddPayment = vi.fn();
    renderReceivablesTable([rec], { onAddPayment });

    fireEvent.click(screen.getAllByRole("button", { name: "+₱" })[0]);
    fireEvent.change(screen.getAllByRole("combobox", { name: "Apply payment to" })[0], {
      target: { value: "20" },
    });
    fireEvent.change(screen.getAllByPlaceholderText("₱ Amount")[0], { target: { value: "250" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);

    expect(onAddPayment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: rec.id }), 250, 20);
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

  it("toggles collected receivables visibility without triggering payment mutations", () => {
    const collectedRec = createReceivable({
      id: "rec-collected-test",
      name: "Collected Shoot",
      collected: true,
    });
    const uncollectedRec = createReceivable({
      id: "rec-uncollected-test",
      name: "Pending Retainer",
      collected: false,
    });

    const onToggleStatus = vi.fn();
    renderReceivablesTable([collectedRec, uncollectedRec], { onToggleStatus });

    // Default state: both receivables are visible
    expect(screen.getAllByText("Collected Shoot").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pending Retainer").length).toBeGreaterThan(0);

    // Toggle button is rendered
    const toggleBtn = screen.getByLabelText("Hide collected receivables");
    expect(toggleBtn).toBeInTheDocument();

    // Click toggle to hide collected receivables
    fireEvent.click(toggleBtn);
    expect(screen.queryByText("Collected Shoot")).not.toBeInTheDocument();
    expect(screen.getAllByText("Pending Retainer").length).toBeGreaterThan(0);
    expect(toggleBtn).toHaveAttribute("aria-label", "Show collected receivables");

    // Click toggle again to restore collected receivables
    fireEvent.click(toggleBtn);
    expect(screen.getAllByText("Collected Shoot").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pending Retainer").length).toBeGreaterThan(0);
    expect(toggleBtn).toHaveAttribute("aria-label", "Hide collected receivables");

    // Payment action was never called
    fireEvent.click(screen.getByTestId("receivable-mobile-row-rec-collected-test"));
    expect(onToggleStatus).not.toHaveBeenCalled();
  });
});
