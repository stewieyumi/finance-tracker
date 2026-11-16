import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReceivableFrequency, UnifiedFinanceData } from "../types/finance";
import { YearlyOverviewModal } from "./YearlyOverviewModal";
import { InflowIncomeNotes } from "./InflowIncomeNotes";
import { buildFinancialSummary } from "../utils/summaryHelpers";

const fixture = (frequency: ReceivableFrequency): UnifiedFinanceData => ({
  wallets: { main: 6000 }, settings: {}, library: { bills: [], shoots: [], receivables: [], archivedReceivables: [{ id: "client", name: "Archived client", amount: 5000, frequency, date: "2026-11-15", startMonth: "November 2026" }] },
  logs: { "November 2026": { recsCollected: { client: { amountReceived: 5000, collected: true } }, receivableSettlements: { client: [
    { id: "nov", amount: 2000, receivedAt: "2026-11-15T04:00:00Z", wallet: "main", walletCredit: 2000 },
    { id: "jan", amount: 3000, receivedAt: "2027-01-15T04:00:00Z", wallet: "main", walletCredit: 3000 }
  ] } } }
});

describe("yearly actual income and legacy presentation", () => {
  it.each(["By Date", "Monthly", "Bi-monthly", "No Specific Date"] as const)("includes archived %s receipts by actual year while leaving projections inactive", frequency => {
    const data=fixture(frequency), before=JSON.stringify(data);
    const {rerender}=render(<YearlyOverviewModal isOpen onClose={vi.fn()} globalData={data} selectedYear="2026" />);
    expect(screen.getByText("Collected: ₱2,000.00")).toBeInTheDocument();
    expect(screen.queryByText("₱5,000.00")).not.toBeInTheDocument();
    rerender(<YearlyOverviewModal isOpen onClose={vi.fn()} globalData={data} selectedYear="2027" />);
    expect(screen.getByText("Collected: ₱3,000.00")).toBeInTheDocument();
    expect(JSON.stringify(data)).toBe(before);
  });

  it("keeps undated residual history separate from actual year income", () => {
    const d=fixture("Monthly");d.logs["November 2026"].recsCollected!.client.amountReceived=5500;
    render(<YearlyOverviewModal isOpen onClose={vi.fn()} globalData={d} selectedYear="2026" />);
    expect(screen.getByText("Collected: ₱2,000.00")).toBeInTheDocument();
    expect(screen.getByText("Historical income — date unverified")).toBeInTheDocument();
    expect(screen.getByText("₱500.00")).toBeInTheDocument();
  });

  it("surfaces conflicting history instead of adding an unverified receipt to Collected",()=>{
    const d=fixture("Monthly");d.logs["November 2026"].receivableSettlements!.client[1].id="nov";
    render(<YearlyOverviewModal isOpen onClose={vi.fn()} globalData={d} selectedYear="2026" />);
    expect(screen.getByText("Collected: ₱0.00")).toBeInTheDocument();
    expect(screen.getByText("Income history needs review. Check receipt details before relying on this total.")).toBeInTheDocument();
  });

  it("does not show historical warnings on complete dated history",()=>{
    const {container}=render(<InflowIncomeNotes report={{actual:5000,historicalDateUnverified:0,needsReview:false}}/>);
    expect(container).toBeEmptyDOMElement();
  });

  it("copied summaries derive actual income from history even when the archived inflow is not actionable",()=>{
    const d=fixture("Monthly");d.logs["November 2026"].recsCollected!.client.amountReceived=5500;
    const text=buildFinancialSummary({globalData:d,selectedMonth:"November 2026",activeBills:[],activeReceivables:[],totalLiquid:6000,totalUnpaidCommitments:0,overdueBills:[],targetMilestoneFund:0,fundProgressPercent:"0"});
    expect(text).toContain("Month Income Collected: ₱2,000.00 (actual Inflows receipts)");
    expect(text).toContain("Historical income — date unverified: ₱500.00");
    d.logs["November 2026"].recsCollected!.client.amountReceived=NaN;
    const invalid=buildFinancialSummary({globalData:d,selectedMonth:"November 2026",activeBills:[],activeReceivables:[],totalLiquid:6000,totalUnpaidCommitments:0,overdueBills:[],targetMilestoneFund:0,fundProgressPercent:"0"});
    expect(invalid).toContain("\n• Income history needs review.");
    expect(invalid).not.toContain("NaN");
  });
});
