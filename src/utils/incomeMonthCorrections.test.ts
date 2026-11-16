import { describe, expect, it } from "vitest";
import type { IncomeReceiptSource, ReceivableIncomeMonths, ReceivableSettlement, UnifiedFinanceData } from "../types/finance";
import { incomeReceiptSource, readInflowIncome } from "./inflowIncome";
import { confirmInflowIncomeMonth } from "./confirmInflowIncomeMonth";
import { buildTransactionHistory } from "./transactionHistory";
import { compareTransactionsNewestFirst, formatHistoryDate, transactionMonth } from "./transactionDates";

const confirmedAt = "2026-11-16T06:00:00.000Z";
const receipt = (overrides: Partial<ReceivableSettlement> = {}): ReceivableSettlement => ({ id: "receipt", amount: 2000, receivedAt: "2026-11-07T04:00:00.000Z", wallet: "main", walletCredit: 2000, ...overrides });
const fixture = (): UnifiedFinanceData => ({ wallets: { main: 8000 }, settings: {}, library: { bills: [], shoots: [], receivables: [{ id: "r", name: "Old client", amount: 2000, frequency: "By Date", date: "2026-10-15" }] }, logs: {
  "October 2026": { recsCollected: { r: { amountReceived: 2000, collected: true } }, paymentDates: { r: receipt().receivedAt }, receivableSettlements: { r: [receipt()] } }
} });
const confirmation = (row = receipt(), month = "October 2026"): ReceivableIncomeMonths => ({ receipts: { [row.id!]: { month, confirmedAt, amount: row.amount, source: incomeReceiptSource(row)! } } });
const apply = (d: UnifiedFinanceData, c = confirmation()) => { const result = confirmInflowIncomeMonth(d, "October 2026", "r", c); expect(result.ok).toBe(true); if (!result.ok) throw Error(result.error); return result.data; };
const freeze = (value: unknown) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } };

describe("explicit confirmed receipt months", () => {
  it("moves only the reviewed receipt month, preserves original dates and wallets, and discloses unknown days", () => {
    const d=fixture(), before=JSON.stringify(d); freeze(d); const next=apply(d);
    expect(readInflowIncome(next,"October 2026")).toEqual({actual:2000,historicalDateUnverified:0,needsReview:false,confirmedMonthOnly:2000});
    expect(readInflowIncome(next,"November 2026").actual).toBe(0);
    expect(readInflowIncome(next,"2026").actual).toBe(2000);
    expect(next.wallets).toBe(d.wallets); expect(next.library).toBe(d.library);
    expect(next.logs["October 2026"].receivableSettlements).toBe(d.logs["October 2026"].receivableSettlements);
    expect(next.logs["October 2026"].recsCollected).toBe(d.logs["October 2026"].recsCollected);
    expect(next.logs["October 2026"].paymentDates).toBe(d.logs["October 2026"].paymentDates);
    expect(JSON.stringify(d)).toBe(before);
    const tx=buildTransactionHistory(next)[0]; expect(tx.date).toBe(receipt().receivedAt);
    expect(transactionMonth(tx)).toBe("2026-10"); expect(formatHistoryDate(tx)).toContain("October 2026 · Exact day unknown · Original date:");
  });

  it("does not change ordinary receipts to their occurrence month",()=>{ const d=fixture(); expect(readInflowIncome(d,"October 2026").actual).toBe(0); expect(readInflowIncome(d,"November 2026").actual).toBe(2000); });
  it.each(["By Date","Monthly","Bi-monthly","No Specific Date"] as const)("supports archived %s receipts across years",frequency=>{ const d=fixture(); d.library.receivables[0].frequency=frequency; d.library.archivedReceivables=d.library.receivables;d.library.receivables=[];const next=apply(d,confirmation(receipt(),"December 2025")); expect(readInflowIncome(next,"2025").actual).toBe(2000);expect(readInflowIncome(next,"2026").actual).toBe(0); });
  it("does not touch a separate current client with the same name",()=>{const d=fixture();d.library.receivables.push({...d.library.receivables[0],id:"current",amount:1000,date:"2026-11-22"});const next=apply(d);expect(next.library).toBe(d.library);expect(next.logs["October 2026"].recsCollected!.current).toBeUndefined();});

  it.each(["amount","receivedAt","wallet","walletCredit","paydayDay","id"])("rejects a stale %s instead of overriding changed provenance",field=>{
    const d=fixture(); const row=d.logs["October 2026"].receivableSettlements!.r[0];
    Object.assign(row,{[field]:({amount:1000,receivedAt:"2026-11-08",wallet:"other",walletCredit:1000,paydayDay:15,id:"new"} as Record<string,unknown>)[field]});
    const before=JSON.stringify(d);expect(confirmInflowIncomeMonth(d,"October 2026","r",confirmation()).ok).toBe(false);expect(JSON.stringify(d)).toBe(before);
    d.logs["October 2026"].receivableIncomeMonths={r:confirmation()};expect(readInflowIncome(d,"2026").needsReview).toBe(true);
    expect(buildTransactionHistory(d)[0].confirmedIncomeMonth).toBeUndefined();
  });
  it.each(["Bogus 2026","Oct 2026","October 26","October 0000"])("rejects invalid month %s",month=>{expect(confirmInflowIncomeMonth(fixture(),"October 2026","r",confirmation(receipt(),month)).ok).toBe(false);});
  it("rejects duplicate receipt IDs across buckets",()=>{const d=fixture();d.logs["November 2026"]={recsCollected:{r:{amountReceived:2000,collected:true}},receivableSettlements:{r:[receipt()]}};expect(confirmInflowIncomeMonth(d,"October 2026","r",confirmation()).ok).toBe(false);});
  it("rejects repeated application and never creates another payment",()=>{const next=apply(fixture());const result=confirmInflowIncomeMonth(next,"October 2026","r",confirmation());expect(result.ok).toBe(false);expect(result.data).toBe(next);expect(next.logs["October 2026"].receivableSettlements!.r).toHaveLength(1);});
  it("does not count a reversed receipt, then restores its confirmed month on reactivation",()=>{const d=apply(fixture());const log=d.logs["October 2026"];log.receivableSettlements!.r[0].reversedAt="2026-11-16T07:00:00Z";log.recsCollected!.r.amountReceived=0;expect(readInflowIncome(d,"2026")).toEqual({actual:0,historicalDateUnverified:0,needsReview:false});delete log.receivableSettlements!.r[0].reversedAt;log.recsCollected!.r.amountReceived=2000;expect(readInflowIncome(d,"October 2026").actual).toBe(2000);expect(readInflowIncome(d,"November 2026").actual).toBe(0);});
  it("flags malformed confirmation maps even without a current receipt",()=>{const d=fixture();d.logs["October 2026"].receivableIncomeMonths=[] as unknown as NonNullable<typeof d.logs[string]["receivableIncomeMonths"]>;expect(readInflowIncome(d,"2026").needsReview).toBe(true);});

  it("recognizes exactly the reviewed legacy residual without adding a receipt or a wallet credit",()=>{
    const d=fixture(); const log=d.logs["October 2026"];log.receivableSettlements={r:[]};
    const c:ReceivableIncomeMonths={legacy:{month:"November 2026",confirmedAt,amount:2000,paymentDate:log.paymentDates!.r,sourceReceipts:[]}};
    const next=apply(d,c);expect(readInflowIncome(next,"November 2026")).toEqual({actual:2000,historicalDateUnverified:0,needsReview:false,confirmedMonthOnly:2000});
    expect(readInflowIncome(next,"October 2026").historicalDateUnverified).toBe(0);expect(next.wallets).toBe(d.wallets);expect(next.logs["October 2026"].receivableSettlements!.r).toEqual([]);
    expect(buildTransactionHistory(next)).toHaveLength(1);expect(buildTransactionHistory(next)[0].confirmedIncomeMonth).toBe("November 2026");
  });
  it("keeps corrected legacy and dated new portions separate without trusting the latest paymentDate",()=>{
    const d=fixture();d.logs["October 2026"].recsCollected!.r.amountReceived=2500;
    const c:ReceivableIncomeMonths={legacy:{month:"December 2026",confirmedAt,amount:500,paymentDate:receipt().receivedAt,sourceReceipts:[incomeReceiptSource(receipt())!]}};
    const next=apply(d,c);expect(readInflowIncome(next,"November 2026").actual).toBe(2000);expect(readInflowIncome(next,"December 2026").actual).toBe(500);expect(readInflowIncome(next,"2026").actual).toBe(2500);
    next.logs["October 2026"].receivableSettlements!.r.push(receipt({id:"new",amount:500}));
    expect(readInflowIncome(next,"December 2026").actual).toBe(0);expect(readInflowIncome(next,"2026").needsReview).toBe(true);expect(readInflowIncome(next,"2026").actual).toBe(2500);
  });
  it("rejects stale legacy residuals, dates and receipt snapshots",()=>{
    for(const field of ["amount","paymentDate","sourceReceipts"]){const d=fixture();d.logs["October 2026"].receivableSettlements={r:[]};const c={legacy:{month:"November 2026",confirmedAt,amount:2000,paymentDate:receipt().receivedAt,sourceReceipts:[] as IncomeReceiptSource[]}};Object.assign(c.legacy,{[field]:field==="amount"?1999:field==="paymentDate"?"2026-11-08":[incomeReceiptSource(receipt())]});expect(confirmInflowIncomeMonth(d,"October 2026","r",c).ok).toBe(false);}
  });
  it("orders month-only entries in their confirmed month without inventing a day",()=>{
    const corrected=buildTransactionHistory(apply(fixture()))[0];
    const dated={...corrected,id:"dated",date:"2026-10-01",confirmedIncomeMonth:undefined};
    const november={...dated,id:"november",date:"2026-11-01"};
    expect([corrected,november,dated].sort(compareTransactionsNewestFirst).map(t=>t.id)).toEqual(["november","dated",corrected.id]);
  });
  it("reconciles a six-receipt month plus one legacy payment to43,000 without moving money",()=>{
    const d:UnifiedFinanceData={wallets:{main:12345},settings:{},library:{bills:[],shoots:[],receivables:[]},logs:{"October 2026":{recsCollected:{},receivableSettlements:{},paymentDates:{}},"November 2026":{recsCollected:{},receivableSettlements:{},paymentDates:{}}}};
    for(const [index,amount] of [15000,2000,3000,15000,20000,5000,3000].entries()){
      const id=`r${index}`,bucket=index<3?"October 2026":"November 2026";
      d.library.receivables.push({id,name:`Client ${index}`,amount,frequency:"By Date",date:""});
      const log=d.logs[bucket];log.recsCollected![id]={amountReceived:amount,collected:true};
      const row=receipt({id:`receipt${index}`,amount,walletCredit:amount});
      log.receivableSettlements![id]=index===6?[]:[row];log.paymentDates![id]=row.receivedAt;
    }
    expect(readInflowIncome(d,"November 2026")).toMatchObject({actual:60000,historicalDateUnverified:3000});
    let next=d;
    for(const index of [0,1,2,6]){
      const id=`r${index}`,bucket=index<3?"October 2026":"November 2026",log=next.logs[bucket];
      const rows=log.receivableSettlements![id];
      const c:ReceivableIncomeMonths=index===6?{legacy:{month:"November 2026",confirmedAt,amount:3000,paymentDate:log.paymentDates![id],sourceReceipts:[]}}:confirmation(rows[0]);
      const result=confirmInflowIncomeMonth(next,bucket,id,c);if(!result.ok)throw Error(result.error);next=result.data;
    }
    expect(readInflowIncome(next,"November 2026")).toEqual({actual:43000,historicalDateUnverified:0,needsReview:false,confirmedMonthOnly:3000});
    expect(readInflowIncome(next,"October 2026").actual).toBe(20000);expect(readInflowIncome(next,"2026").actual).toBe(63000);expect(next.wallets).toBe(d.wallets);
  });
  it.each([null,[],"bad"])("rejects malformed existing correction maps: %s",value=>{const d=fixture();d.logs["October 2026"].receivableIncomeMonths=value as never;expect(confirmInflowIncomeMonth(d,"October 2026","r",confirmation()).ok).toBe(false);});
  it.each(["", "2026-11-16", "2026-11-16T25:00:00Z"])("rejects invalid confirmation timestamps: %s",value=>{const c=confirmation();c.receipts!.receipt.confirmedAt=value;expect(confirmInflowIncomeMonth(fixture(),"October 2026","r",c).ok).toBe(false);});
  it("does not confirm an orphan correction in a different year",()=>{const d=fixture();d.logs["October 2026"].receivableIncomeMonths={gone:confirmation(receipt(),"January 2027")};expect(readInflowIncome(d,"2027").needsReview).toBe(true);});
  it("does not promote undated recorded portions when confirming only the residual",()=>{const d=fixture();const row=receipt({receivedAt:"",amount:500,walletCredit:500});d.logs["October 2026"].receivableSettlements={r:[row]};const next=apply(d,{legacy:{month:"December 2026",confirmedAt,amount:1500,paymentDate:receipt().receivedAt,sourceReceipts:[incomeReceiptSource(row)!]}});expect(readInflowIncome(next,"December 2026").actual).toBe(1500);expect(readInflowIncome(next,"October 2026").historicalDateUnverified).toBe(500);});

});
