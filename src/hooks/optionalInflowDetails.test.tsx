import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Receivable, UnifiedFinanceData } from '../types/finance';
import { useReceivableActions, applyAddPayment, applyReceivableStatusToggle, applyReceiptReplay } from './useReceivableActions';
import { applyReceivableEdit, useReceivableSaveActions } from './useReceivableSaveActions';
import { useFinanceCalculations } from './useFinanceCalculations';
import { calculateCashflowMomentum } from '../utils/financialAnalytics';
import { isValidFinanceBackup } from '../utils/validationHelpers';

const month = 'November 2026';
const fixture = (): UnifiedFinanceData => ({wallets:{main:1000},settings:{defaultWallet:'main',customWallets:[{id:'main',label:'Main'}]},library:{bills:[],receivables:[],shoots:[]},logs:{}});
const view = (data:UnifiedFinanceData, selected=month) => {
 const h=renderHook(()=>useFinanceCalculations(data,selected));const result=h.result.current;h.unmount();return result;
};
const add = (input:Parameters<ReturnType<typeof useReceivableActions>['addReceivable']>[0]) => {
 let data=fixture();const toast=vi.fn();
 const h=renderHook(()=>useReceivableActions({globalData:data,selectedMonth:month,showToast:toast,commitReceivableTransition:transition=>{const result=transition(data);if(result.ok)data=result.data;return result;}}));
 act(()=>h.result.current.addReceivable(input));h.unmount();return {data,toast};
};
const placeholder = () => add({name:'Client project',amount:0,amountUnspecified:true,category:'Shoot',frequency:'By Date',date:'',wallet:'main'}).data;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(2026,10,16,14));});
afterEach(()=>{cleanup();vi.useRealTimers();});

describe('optional inflow amounts and dates',()=>{
 it('saves a name-only one-time inflow without dates, zero receipts, or wallet mutations',()=>{
  const data=placeholder();expect(data.library.receivables).toHaveLength(1);
  expect(data.library.receivables[0]).toMatchObject({name:'Client project',amount:0,amountUnspecified:true,frequency:'No Specific Date',startMonth:month,date:''});
  expect(data.wallets).toEqual({main:1000});expect(data.logs).toEqual({});
  const active=view(data);expect(active.activeReceivables[0]).toMatchObject({collected:false,amountReceived:0,needsScheduleReview:false});
  expect(active.totalPendingReceivables).toBe(0);expect(active.monthIncomeCollected).toBe(0);expect(active.allTransactions).toEqual([]);
  expect(view(data,'October 2026').activeReceivables).toEqual([]);
  expect(view(data,'January 2027').activeReceivables).toHaveLength(1);
  expect(calculateCashflowMomentum(data,month).every(m=>m.inflow===0)).toBe(true);
  const restored=JSON.parse(JSON.stringify(data));expect(isValidFinanceBackup(restored)).toBe(true);expect(view(restored).activeReceivables[0].amountUnspecified).toBe(true);
 });
 it.each(['By Date','No Specific Date','Monthly','Bi-monthly'] as const)('blocks full/custom collection while %s amount is unknown',frequency=>{
  const data=add({name:'Unknown',amount:0,amountUnspecified:true,category:'Other',frequency,date:'2026-11-20',wallet:'main',biMonthlyDays:[5,20],monthlyDay:15}).data;
  const rec=view(data).activeReceivables[0];expect(rec.collected).toBe(false);
  expect(applyReceivableStatusToggle(data,rec,month)).toMatchObject({ok:false,data});
  expect(applyAddPayment(data,rec,100,month)).toMatchObject({ok:false,data});expect(data.logs).toEqual({});expect(data.wallets.main).toBe(1000);
 });
 it('allows a known amount without a date, without fabricating an exact due day',()=>{
  const {data}=add({name:'Known amount',amount:5000,category:'Other',frequency:'By Date',date:''});
  expect(view(data).totalPendingReceivables).toBe(5000);expect(data.library.receivables[0]).toMatchObject({frequency:'No Specific Date',startMonth:month,date:''});
 });
 it('can fill the details later, then collect, undo, and redo once on the original wallet',()=>{
  let data=placeholder();const id=data.library.receivables[0].id;
  const edited=applyReceivableEdit(data,id,{name:'Client project',amountUnspecified:false,frequency:'By Date',date:'2026-11-20'},5000,month);
  expect(edited.ok).toBe(true);if(!edited.ok)return;data=edited.data;
  expect(data.library.receivables[0]).toMatchObject({amount:5000,frequency:'By Date',date:'2026-11-20'});expect(data.library.receivables[0].amountUnspecified).not.toBe(true);
  expect(data.logs).toEqual({});expect(view(data).totalPendingReceivables).toBe(5000);
  const paid=applyAddPayment(data,view(data).activeReceivables[0],2000,month);expect(paid.ok).toBe(true);if(!paid.ok)return;
  expect(paid.data.wallets.main).toBe(3000);expect(view(paid.data).totalPendingReceivables).toBe(3000);
  const undone=applyReceiptReplay(paid.data,paid.change!);expect(undone.ok).toBe(true);if(!undone.ok)return;
  expect(undone.data.wallets.main).toBe(1000);
  const redone=applyReceiptReplay(undone.data,paid.change!,undone.change!.previousPaymentDate);expect(redone.ok).toBe(true);if(!redone.ok)return;
  expect(redone.data.wallets.main).toBe(3000);expect(applyReceiptReplay(redone.data,paid.change!,undone.change!.previousPaymentDate).ok).toBe(false);
 });
 it('clears an unpaid amount but refuses to erase an amount with recorded/reversed history',()=>{
  const data=placeholder();const id=data.library.receivables[0].id;
  const known=applyReceivableEdit(data,id,{amountUnspecified:false},5000,month);expect(known.ok).toBe(true);if(!known.ok)return;
  expect(applyReceivableEdit(known.data,id,{amountUnspecified:true},0,month).ok).toBe(true);
  const paid=applyAddPayment(known.data,view(known.data).activeReceivables[0],1000,month);expect(paid.ok).toBe(true);if(!paid.ok)return;
  expect(applyReceivableEdit(paid.data,id,{amountUnspecified:true},0,month)).toMatchObject({ok:false,data:paid.data});
  const undo=applyReceiptReplay(paid.data,paid.change!);expect(undo.ok).toBe(true);if(!undo.ok)return;
  expect(applyReceivableEdit(undo.data,id,{amountUnspecified:true},0,month)).toMatchObject({ok:false,data:undo.data});
 });
 it('rejects a stale collection even when an unspecified flag has been paired with a nonzero amount',()=>{
  const data=placeholder();const rec=data.library.receivables[0];rec.amount=5000;delete rec.amountUnspecified;
  const oldView=view(data).activeReceivables[0];rec.amountUnspecified=true;
  expect(applyAddPayment(data,oldView,100,month)).toMatchObject({ok:false,data});
  expect(view(data).totalPendingReceivables).toBe(0);expect(calculateCashflowMomentum(data,month).every(m=>m.inflow===0)).toBe(true);
 });
 it.each([0,-1,0.001,Infinity,NaN,1e308])('still rejects a supplied invalid amount %s',amount=>{
  expect(add({name:'Bad amount',amount,category:'Other',frequency:'No Specific Date'}).data.library.receivables).toEqual([]);
 });
 it('does not permit an unspecified flag with a positive amount or an invalid nonempty date',()=>{
  expect(add({name:'Bad flag',amount:10,amountUnspecified:true,category:'Other',frequency:'By Date',date:''}).data.library.receivables).toEqual([]);
  expect(add({name:'Bad date',amount:10,category:'Other',frequency:'By Date',date:'2026-02-30'}).data.library.receivables).toEqual([]);
 });
 it('uses the selected month when clearing an unpaid specific date in the save hook',()=>{
  let data=fixture();const rec:Receivable={id:'r',name:'Project',amount:5000,frequency:'By Date',date:'2026-12-20'};data.library.receivables=[rec];
  const close=vi.fn();const toast=vi.fn();const h=renderHook(()=>useReceivableSaveActions({editingId:'r',editForm:{...rec,date:''},selectedMonth:month,setEditingId:close,showToast:toast,commitReceivableTransition:t=>{const r=t(data);if(r.ok)data=r.data;return r;}}));
  act(()=>{expect(h.result.current.saveReceivableEdit()).toBe(true);});h.unmount();
  expect(data.library.receivables[0]).toMatchObject({frequency:'No Specific Date',startMonth:month,date:'',amount:5000});expect(close).toHaveBeenCalledWith(null);expect(data.logs).toEqual({});
 });
 it('does not reinterpret legacy zero amounts as unspecified',()=>{
  const data=fixture();data.library.receivables=[{id:'legacy',name:'Legacy',amount:0,frequency:'By Date'}];
  expect(view(data).activeReceivables[0].amountUnspecified).toBeUndefined();expect(data.library.receivables[0].amount).toBe(0);
 });
});
