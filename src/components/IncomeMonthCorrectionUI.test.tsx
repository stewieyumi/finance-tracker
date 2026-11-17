import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransactionHistoryItem, UnifiedFinanceData } from "../types/finance";
import { TransactionHistoryModal } from "./TransactionHistoryModal";
import { InflowIncomeNotes } from "./InflowIncomeNotes";
import { YearlyOverviewModal } from "./YearlyOverviewModal";
import { confirmInflowIncomeMonth } from "../utils/confirmInflowIncomeMonth";
import { incomeReceiptSource } from "../utils/inflowIncome";

afterEach(cleanup);
const transactions:TransactionHistoryItem[]=[{id:"corrected",title:"Reviewed receipt",amount:2000,date:"2026-11-07T04:00:00Z",type:"inflow",confirmedIncomeMonth:"October 2026"},{id:"ordinary",title:"November receipt",amount:500,date:"2026-11-07",type:"inflow"}];
const history = () => render(<TransactionHistoryModal isOpen onClose={vi.fn()} transactions={transactions}/>);
describe("confirmed month disclosure and history filters",()=>{
 it("discloses original timestamp and unknown day while filtering by confirmed month",()=>{
  history();expect(screen.getByText(/October 2026 · Exact day unknown · Original date:/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Filter by month"),{target:{value:"2026-10"}});
  expect(screen.getByText("Reviewed receipt")).toBeInTheDocument();expect(screen.queryByText("November receipt")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Filter by month"),{target:{value:"2026-11"}});
  expect(screen.queryByText("Reviewed receipt")).not.toBeInTheDocument();expect(screen.getByText("November receipt")).toBeInTheDocument();
 });
 it("excludes unknown receipt days from exact date ranges and explains the limitation",()=>{
  history();fireEvent.change(screen.getByLabelText("From date"),{target:{value:"2026-10-01"}});fireEvent.change(screen.getByLabelText("To date"),{target:{value:"2026-11-30"}});
  expect(screen.queryByText("Reviewed receipt")).not.toBeInTheDocument();expect(screen.getByText("November receipt")).toBeInTheDocument();
  expect(screen.getByText("Exact-date filters exclude receipts whose day is unknown. Use the month filter to include them.")).toBeInTheDocument();
 });
 it("discloses confirmed month-only income without calling it unverified",()=>{render(<InflowIncomeNotes report={{actual:43000,historicalDateUnverified:0,needsReview:false,confirmedMonthOnly:3000}}/>);expect(screen.getByText("₱3,000.00")).toBeInTheDocument();expect(screen.getByText(/exact payment day unknown/)).toBeInTheDocument();expect(screen.queryByText("Historical income — date unverified")).not.toBeInTheDocument();});
 it("uses the same confirmation for yearly collected income",()=>{
  const row={id:"receipt",amount:2000,wallet:"main",walletCredit:2000,receivedAt:"2026-11-07T04:00:00Z"};
  const d:UnifiedFinanceData={wallets:{main:3000},settings:{},library:{bills:[],shoots:[],receivables:[{id:"r",name:"Client",amount:2000,frequency:"Monthly"}]},logs:{"October 2026":{recsCollected:{r:{amountReceived:2000,collected:true}},receivableSettlements:{r:[row]}}}};
  const result=confirmInflowIncomeMonth(d,"October 2026","r",{receipts:{receipt:{month:"December 2025",confirmedAt:"2026-11-16T04:00:00Z",amount:2000,source:incomeReceiptSource(row)!}}});if(!result.ok)throw Error(result.error);
  render(<YearlyOverviewModal isOpen onClose={vi.fn()} globalData={result.data} selectedYear="2025"/>);expect(screen.getByText("Collected: ₱2,000.00")).toBeInTheDocument();expect(screen.getByText(/exact payment day unknown/)).toBeInTheDocument();
 });
});
