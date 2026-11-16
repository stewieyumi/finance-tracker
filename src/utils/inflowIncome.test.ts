import { describe, expect, it } from "vitest";
import type { ReceivableFrequency, ReceivableSettlement, UnifiedFinanceData } from "../types/finance";
import { readInflowIncome } from "./inflowIncome";

const receipt = (overrides: Partial<ReceivableSettlement> = {}): ReceivableSettlement => ({ id: "receipt", amount: 2000, wallet: "main", walletCredit: 2000, receivedAt: "2026-11-15T04:00:00.000Z", ...overrides });
const fixture = (frequency: ReceivableFrequency = "Monthly"): UnifiedFinanceData => ({
  wallets: { main: 1000 }, settings: {}, library: { bills: [], shoots: [], receivables: [{ id: "r", name: "Client", amount: 5000, frequency, startMonth: "November 2026", date: "2026-11-15" }] },
  logs: { "November 2026": { recsCollected: { r: { collected: false, amountReceived: 2000 } }, receivableSettlements: { r: [receipt()] } } }
});
const setRows = (d: UnifiedFinanceData, rows: ReceivableSettlement[], amount: number) => { d.logs["November 2026"] = { recsCollected: { r: { collected: false, amountReceived: amount } }, receivableSettlements: { r: rows } }; };
const freeze = (value: unknown) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } };

describe("inflow receipt income reader", () => {
  it.each(["By Date", "Monthly", "Bi-monthly", "No Specific Date"] as const)("uses actual dates across months and years for %s", frequency => {
    const data = fixture(frequency);
    setRows(data, [receipt(), receipt({ id: "dec", amount: 1000, receivedAt: "2026-12-15T04:00:00.000Z" }), receipt({ id: "jan", amount: 2000, receivedAt: "2027-01-15T04:00:00.000Z" })], 5000);
    expect(readInflowIncome(data, "November 2026")).toEqual({ actual: 2000, historicalDateUnverified: 0, needsReview: false });
    expect(readInflowIncome(data, "December 2026").actual).toBe(1000);
    expect(readInflowIncome(data, "2026").actual).toBe(3000);
    expect(readInflowIncome(data, "2027").actual).toBe(2000);
    expect(readInflowIncome(data, "2027").actual).toBe(readInflowIncome(data, "January 2027").actual);
  });

  it("keeps archived receipts and counts duplicate active/archive identity once", () => {
    const d = fixture(); d.library.archivedReceivables = [{ ...d.library.receivables[0] }];
    expect(readInflowIncome(d, "2026").actual).toBe(2000);
    d.library.receivables = [];
    expect(readInflowIncome(d, "November 2026").actual).toBe(2000);
  });

  it("accepts date-only and ID-less older receipts without merging equal payments", () => {
    const d = fixture(); setRows(d, [receipt({ id: undefined, amount: 300, receivedAt: "2026-11-05" }), receipt({ id: undefined, amount: 300, receivedAt: "2026-11-05" })], 600);
    expect(readInflowIncome(d, "November 2026")).toEqual({ actual: 600, historicalDateUnverified: 0, needsReview: false });
  });

  it("preserves the shipped no-date requirement for identified timestamped receipts", () => {
    const d = fixture("No Specific Date");setRows(d, [receipt({ id: undefined, receivedAt: "2026-11-05" })], 2000);
    expect(readInflowIncome(d, "November 2026")).toEqual({ actual: 0, historicalDateUnverified: 0, needsReview: true });
  });

  it("separates residual legacy history once without assigning the last partial date to it", () => {
    const d = fixture();setRows(d, [receipt({ amount: 300, receivedAt: "2026-12-01T04:00:00.000Z" }), receipt({ id: "other", amount: 500, receivedAt: "2027-01-01T04:00:00.000Z" })], 1000);
    d.logs["November 2026"].paymentDates = { r: "2027-01-01T04:00:00.000Z" };
    expect(readInflowIncome(d, "November 2026")).toEqual({ actual: 0, historicalDateUnverified: 200, needsReview: false });
    expect(readInflowIncome(d, "2026")).toEqual({ actual: 300, historicalDateUnverified: 200, needsReview: false });
    expect(readInflowIncome(d, "2027")).toEqual({ actual: 500, historicalDateUnverified: 0, needsReview: false });
  });

  it.each([undefined, "", "2026-02-30", "2026-11-15T25:00:00Z", "not a date"])("shows an undated amount separately instead of fabricating a date: %s", date => {
    const d=fixture();setRows(d, [receipt({ receivedAt: date as string })], 2500);
    expect(readInflowIncome(d, "November 2026")).toEqual({ actual: 0, historicalDateUnverified: 2500, needsReview: false });
    expect(readInflowIncome(d, "December 2026").historicalDateUnverified).toBe(0);
  });

  it("retains a cache-only legacy amount in its original reference period, including abbreviated keys", () => {
    const d=fixture();d.logs={ "Nov 2026": { recsCollected: { r: { collected:true, amountReceived:1234.56 } }, paymentDates:{r:"2027-01-01"} } };
    expect(readInflowIncome(d, "2026")).toEqual({ actual:0, historicalDateUnverified:1234.56, needsReview:false });
    expect(readInflowIncome(d, "2027").actual).toBe(0);
  });

  it("does not assign an invalid occurrence name to January", () => {
    const d=fixture();d.logs={ "Bogus 2026": { recsCollected: {r:{collected:true,amountReceived:2000}} } };
    expect(readInflowIncome(d, "January 2026")).toEqual({actual:0,historicalDateUnverified:0,needsReview:true});
  });

  it("recognizes local calendar boundaries for ISO timestamps and date-only values", () => {
    const d=fixture();setRows(d,[receipt({amount:0.1,receivedAt:new Date(2026,11,31,23,59).toISOString()}),receipt({id:"boundary",amount:0.2,receivedAt:new Date(2027,0,1,0,1).toISOString()})],0.3);
    expect(readInflowIncome(d,"2026").actual).toBe(0.1);expect(readInflowIncome(d,"2027").actual).toBe(0.2);
    setRows(d,[receipt({receivedAt:"2026-12-31"})],2000);expect(readInflowIncome(d,"December 2026").actual).toBe(2000);
  });

  it("sums in cents without floating point income artifacts",()=>{const d=fixture();setRows(d,[receipt({amount:0.1}),receipt({id:"two",amount:0.2})],0.3);expect(readInflowIncome(d,"2026").actual).toBe(0.3);});

  it("excludes reversed receipts without treating them as missing legacy amounts", () => {
    const d=fixture();setRows(d,[receipt({reversedAt:"2026-12-01T04:00:00Z"}),receipt({id:"active",amount:500})],500);
    expect(readInflowIncome(d,"2026")).toEqual({actual:500,historicalDateUnverified:0,needsReview:false});
  });

  it("keeps a valid legacy remainder after a newer receipt was reversed",()=>{const d=fixture();setRows(d,[receipt({reversedAt:"2026-12-01"})],300);expect(readInflowIncome(d,"2026")).toEqual({actual:0,historicalDateUnverified:300,needsReview:false});});

  it("flags conflicting receipt IDs across occurrences instead of double-counting or inventing a remainder",()=>{
    const d=fixture();d.logs["December 2026"]={recsCollected:{r:{amountReceived:2000,collected:false}},receivableSettlements:{r:[receipt({receivedAt:"2026-12-10T04:00:00Z"})]}};
    expect(readInflowIncome(d,"2026")).toEqual({actual:0,historicalDateUnverified:0,needsReview:true});
    expect(readInflowIncome(d,"December 2026").needsReview).toBe(true);
  });

  it("flags conflicting active/archive frequencies without changing either copy",()=>{const d=fixture();d.library.archivedReceivables=[{...d.library.receivables[0],frequency:"No Specific Date"}];expect(readInflowIncome(d,"2026")).toEqual({actual:0,historicalDateUnverified:0,needsReview:true});});

  it.each([NaN,Infinity,-1,0.001,"2000",1e308])("flags invalid cached money: %s",value=>{const d=fixture();d.logs["November 2026"].recsCollected!.r.amountReceived=value as number;expect(readInflowIncome(d,"2026")).toEqual({actual:0,historicalDateUnverified:0,needsReview:true});});
  it.each([NaN,Infinity,-1,0.001,1e308])("flags invalid receipt money: %s",amount=>{const d=fixture();setRows(d,[receipt({amount})],2000);expect(readInflowIncome(d,"2026")).toEqual({actual:0,historicalDateUnverified:0,needsReview:true});});
  it.each([null,false,0,"bad date"])("flags an invalid reversal marker rather than treating the receipt as active: %s",value=>{const d=fixture();setRows(d,[receipt({reversedAt:value as string})],2000);expect(readInflowIncome(d,"2026")).toEqual({actual:0,historicalDateUnverified:0,needsReview:true});});

  it("flags receipts exceeding the cache, missing caches and malformed lists",()=>{
    const d=fixture();d.logs["November 2026"].recsCollected!.r.amountReceived=1000;
    expect(readInflowIncome(d,"2026").needsReview).toBe(true);
    delete d.logs["November 2026"].recsCollected;expect(readInflowIncome(d,"2026").actual).toBe(0);
    d.logs["November 2026"].receivableSettlements!.r={} as ReceivableSettlement[];expect(readInflowIncome(d,"2026").needsReview).toBe(true);
  });

  it("flags orphan receipts rather than silently treating them as unrelated income",()=>{const d=fixture();d.library.receivables=[];expect(readInflowIncome(d,"2026").needsReview).toBe(true);});
  it("does not make valid income disappear when unrelated rows need review",()=>{const d=fixture();d.library.receivables.push({...d.library.receivables[0],id:"other"});d.logs["November 2026"].recsCollected!.other={amountReceived:NaN,collected:false};expect(readInflowIncome(d,"2026")).toEqual({actual:2000,historicalDateUnverified:0,needsReview:true});});

  it("never counts manual transfer credits or payday allocations as receivable income",()=>{const d=fixture();d.library.manualTransactions=[{id:"transfer",title:"Transfer",type:"transfer",amount:100,wallet:"main",destinationWallet:"other",date:"2026-11-15",createdAt:Date.now()}];d.paydaySplitExecutions=[{id:"payday",date:"2026-11-15",timestamp:Date.now(),allocations:{main:100},billContributions:[]}];expect(readInflowIncome(d,"2026").actual).toBe(2000);});

  it("does not mutate even deeply frozen input or invent data on a JSON roundtrip",()=>{const d=fixture();const before=JSON.stringify(d);freeze(d);expect(readInflowIncome(d,"2026").actual).toBe(2000);expect(JSON.stringify(d)).toBe(before);expect(readInflowIncome(JSON.parse(before),"2026")).toEqual(readInflowIncome(d,"2026"));});
  it("reports an invalid selection without coercing it to a current month",()=>{expect(readInflowIncome(fixture(),"Bogus 2026")).toEqual({actual:0,historicalDateUnverified:0,needsReview:true});});
  it("ignores an empty zero-value orphan left after deleting an unpaid legacy item", () => {
    const d=fixture();d.logs["November 2026"].recsCollected!.deleted={amountReceived:0,collected:false};
    expect(readInflowIncome(d,"2026")).toEqual({actual:2000,historicalDateUnverified:0,needsReview:false});
  });
  it("flags malformed collection maps even when their receipts cannot be assigned to a period", () => {
    const d=fixture();d.logs["November 2026"].recsCollected=[] as unknown as NonNullable<typeof d.logs[string]["recsCollected"]>;
    expect(readInflowIncome(d,"January 2027")).toEqual({actual:0,historicalDateUnverified:0,needsReview:true});
  });
  it("flags an aggregate that exceeds safe integer cents instead of returning an imprecise total", () => {
    const d=fixture();const amount=80000000000000;setRows(d,[receipt({amount})],amount);
    d.logs["December 2026"]={recsCollected:{r:{amountReceived:amount,collected:true}},receivableSettlements:{r:[receipt({id:"large",amount,receivedAt:"2026-12-15T04:00:00Z"})]}};
    expect(readInflowIncome(d,"2026")).toEqual({actual:0,historicalDateUnverified:0,needsReview:true});
  });

});
