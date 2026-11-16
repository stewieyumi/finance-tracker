import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReceivableEditModal } from "./ReceivableEditModal";
import { YearlyOverviewModal } from "./YearlyOverviewModal";
import { FinancialAnalyticsModal } from "./FinancialAnalyticsModal";
import type { Receivable, UnifiedFinanceData } from "../types/finance";
import { deriveNotifications } from "../hooks/useNotifications";
import { buildFinancialSummary } from "../utils/summaryHelpers";

const rec: Receivable = { id: "no-date", name: "Client payment", frequency: "No Specific Date", startMonth: "November 2026", amount: 5000 };
const fixture = (): UnifiedFinanceData => ({
  wallets: { main: 6000 }, library: { bills: [], receivables: [rec], shoots: [] },
  logs: { "November 2026": { billsPaid: [], recsCollected: { "no-date": { collected: true, amountReceived: 5000 } }, receivableSettlements: {
    "no-date": [
      { id: "receipt-nov", amount: 2000, receivedAt: "2026-11-15T04:00:00.000Z", wallet: "main", walletCredit: 2000 },
      { id: "receipt-jan", amount: 3000, receivedAt: "2027-01-15T04:00:00.000Z", wallet: "main", walletCredit: 3000 }
    ]
  } } }
});

describe("no-date inflow forms and reports", () => {
  it("uses the selected month when explicitly converting an unpaid dated item", () => {
    const change = vi.fn();
    render(<ReceivableEditModal editingId={rec.id} editForm={{ ...rec, frequency: "By Date", startMonth: "", date: "2026-11-20" }} categoriesList={["Other"]} allWallets={[]} onChange={change} onCancel={vi.fn()} onDelete={vi.fn()} onSave={vi.fn()} selectedMonth="December 2026" />);
    fireEvent.change(screen.getByRole("combobox", { name: "Frequency" }), { target: { value: "No Specific Date" } });
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ frequency: "No Specific Date", startMonth: "December 2026" }));
  });

  it("offers an explicit anchor repair without inventing a specific date", () => {
    const change = vi.fn();
    const { container } = render(<ReceivableEditModal editingId={rec.id} editForm={{ ...rec, startMonth: "" }} categoriesList={["Other"]} allWallets={[]} onChange={change} onCancel={vi.fn()} onDelete={vi.fn()} onSave={vi.fn()} selectedMonth="November 2026" />);
    expect(screen.getByRole("combobox", { name: "Start month" })).toHaveValue("");
    expect(container.querySelector('input[type="date"]')).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Start month" }), { target: { value: "November 2026" } });
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ startMonth: "November 2026" }));
  });

  it("preserves an existing anchor outside the standard picker years", () => {
    render(<ReceivableEditModal editingId={rec.id} editForm={{ ...rec, startMonth: "January 2040" }} categoriesList={["Other"]} allWallets={[]} onChange={vi.fn()} onCancel={vi.fn()} onDelete={vi.fn()} onSave={vi.fn()} selectedMonth="January 2040" />);
    expect(screen.getByRole("combobox", { name: "Start month" })).toHaveValue("January 2040");
  });

  it.each([false, true])("reports actual receipt years even after archival (%s), excluding undated projections", archived => {
    const data = fixture();
    if (archived) { data.library.archivedReceivables = data.library.receivables; data.library.receivables = []; }
    const { rerender } = render(<YearlyOverviewModal isOpen onClose={vi.fn()} globalData={data} selectedYear="2026" />);
    expect(screen.getByText("Collected: ₱2,000.00")).toBeInTheDocument();
    expect(screen.queryByText("₱5,000.00")).not.toBeInTheDocument();
    // Remount because the year is intentionally maintained as modal state.
    rerender(<YearlyOverviewModal key="2027" isOpen onClose={vi.fn()} globalData={data} selectedYear="2027" />);
    expect(screen.getByText("Collected: ₱3,000.00")).toBeInTheDocument();
    expect(screen.queryByText("₱5,000.00")).not.toBeInTheDocument();
  });

  it("discloses the dated-projection exclusion and avoids fake due notifications", () => {
    const data = fixture(); data.logs = {};
    render(<FinancialAnalyticsModal isOpen onClose={vi.fn()} globalData={data} selectedMonth="November 2026" totalLiquid={1000} totalUnpaidCommitments={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Cashflow/i }));
    expect(screen.getByText(/No-date inflows are excluded from dated projections/)).toBeInTheDocument();
    expect(deriveNotifications(data, new Date(2027, 0, 15)).filter(n => n.type === "pending_receivable")).toEqual([]);
    const text = buildFinancialSummary({ globalData: data, activeBills: [], activeReceivables: [{ ...rec, targetMonthForDue: "November 2026", amountReceived: 2000, collected: false }], selectedMonth: "January 2027", totalLiquid: 1000, totalUnpaidCommitments: 0, overdueBills: [], targetMilestoneFund: 0, fundProgressPercent: "0" });
    expect(text).toContain("No specific date · Since November 2026");
    expect(text).toContain("3,000.00");
    expect(text).not.toContain("Invalid Date");
  });
});
