import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceivableFrequency, UnifiedFinanceData } from "../types/finance";
import { useFinanceCalculations } from "./useFinanceCalculations";
import { applyAddPayment, applyReceiptReplay } from "./useReceivableActions";
import { useCloudSync } from "./useCloudSync";
import { confirmInflowIncomeMonth } from "../utils/confirmInflowIncomeMonth";
import { incomeReceiptSource, readInflowIncome } from "../utils/inflowIncome";
import { buildTransactionHistory } from "../utils/transactionHistory";
import { buildFinancialSummary } from "../utils/summaryHelpers";

const fixture = (frequency: ReceivableFrequency): UnifiedFinanceData => ({wallets:{main:1000},settings:{customWallets:[{id:"main",label:"Main"}],defaultWallet:"main"},library:{bills:[],shoots:[],receivables:[{id:"client",name:"Client",amount:2000,frequency,date:"2026-11-15",startMonth:"November 2026",monthlyDay:15,biMonthlyDays:[15,30],wallet:"main"}]},logs:{}});
const view = (data:UnifiedFinanceData) => {const h=renderHook(()=>useFinanceCalculations(data,"November 2026"));const result=h.result.current;h.unmount();return result;};
const correct = (data:UnifiedFinanceData) => {
 const row=data.logs["November 2026"].receivableSettlements!.client[0];
 return confirmInflowIncomeMonth(data,"November 2026","client",{receipts:{[row.id!]:{month:"October 2026",confirmedAt:new Date().toISOString(),amount:row.amount,source:incomeReceiptSource(row)!}}});
};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(2026,10,15,12));});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
describe("month correction preserves existing financial actions",()=>{
 it.each(["By Date","Monthly","Bi-monthly","No Specific Date"] as const)("retains original-wallet Undo/Redo and archive reporting for %s",frequency=>{
  const d=fixture(frequency);const receive=applyAddPayment(d,view(d).activeReceivables[0],2000,"November 2026");expect(receive.ok).toBe(true);if(!receive.ok)return;
  const correction=correct(receive.data);expect(correction.ok).toBe(true);if(!correction.ok)return;
  expect(correction.data.wallets.main).toBe(3000);expect(view(correction.data).monthIncomeCollected).toBe(0);expect(readInflowIncome(correction.data,"October 2026").actual).toBe(2000);
  const undo=applyReceiptReplay(correction.data,receive.change!);expect(undo.ok).toBe(true);if(!undo.ok)return;
  expect(undo.data.wallets.main).toBe(1000);expect(readInflowIncome(undo.data,"2026").actual).toBe(0);expect(buildTransactionHistory(undo.data)).toHaveLength(0);
  const redo=applyReceiptReplay(undo.data,receive.change!,undo.change!.previousPaymentDate);expect(redo.ok).toBe(true);if(!redo.ok)return;
  expect(redo.data.wallets.main).toBe(3000);expect(readInflowIncome(redo.data,"October 2026").actual).toBe(2000);expect(readInflowIncome(redo.data,"November 2026").actual).toBe(0);
  const archived={...redo.data,library:{...redo.data.library,receivables:[],archivedReceivables:redo.data.library.receivables}};
  expect(readInflowIncome(JSON.parse(JSON.stringify(archived)),"2026")).toMatchObject({actual:2000,confirmedMonthOnly:2000});expect(buildTransactionHistory(archived)).toHaveLength(1);
  const text=buildFinancialSummary({globalData:archived,selectedMonth:"October 2026",activeBills:[],activeReceivables:[],totalLiquid:3000,totalUnpaidCommitments:0,overdueBills:[],targetMilestoneFund:0,fundProgressPercent:"0"});
  expect(text).toContain("Month Income Collected: ₱2,000.00");expect(text).toContain("Included with confirmed receipt month: ₱2,000.00 (exact day unknown)");
 });
 it("prepares metadata through the existing latest-state committer without moving money",()=>{
  const d=fixture("Monthly");const receive=applyAddPayment(d,view(d).activeReceivables[0],2000,"November 2026");if(!receive.ok)throw Error(receive.error);
  const stored=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(k:string)=>stored.get(k)??null,setItem:(k:string,v:string)=>stored.set(k,v),removeItem:(k:string)=>stored.delete(k)});
  const h=renderHook(()=>{const [data,setData]=React.useState(receive.data);return{data,sync:useCloudSync(data,setData,vi.fn())};});
  act(()=>{h.result.current.sync.commitDataTransition(prev=>correct(prev));});
  expect(h.result.current.data.wallets.main).toBe(3000);expect(readInflowIncome(h.result.current.data,"October 2026").actual).toBe(2000);
 });
});
