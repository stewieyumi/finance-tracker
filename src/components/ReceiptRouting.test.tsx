import { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FinanceTransitionCommitter, UnifiedFinanceData } from '../types/finance';
import type { ScanResult } from '../hooks/useExpenseScanner';
import type { ReceiptTransferDraft } from './ReceiptReview';
import { ExpensesTab } from './ExpensesTab';
import { HistoricalLedgerModal } from './HistoricalLedgerModal';
const scan=vi.hoisted(()=>({options:undefined as any}));
vi.mock('../hooks/useExpenseScanner',()=>({useExpenseScanner:(options:any)=>{
 scan.options=options;return {isScanning:false,failure:null,retryScan:vi.fn(),fileInputRef:{current:null},handleCapture:vi.fn(),stopScanning:vi.fn()};
}}));
const receipt:ScanResult={merchant:'Synthetic payment',amount:'1500',category:'Other',date:'2026-11-01',wallet:'a',review:{kind:'transfer',fee:10,source:'Bank A',destination:'Wallet B',dateKnown:true}};
const fixture=():UnifiedFinanceData=>({wallets:{a:2000,b:100},settings:{defaultWallet:'a',customWallets:[{id:'a',label:'Bank A'},{id:'b',label:'Wallet B'}]},library:{bills:[],receivables:[],shoots:[],expenses:[],manualTransactions:[]},logs:{}});
function Harness(){
 const [data,setData]=useState(fixture),current=useRef(data);const [transfer,setTransfer]=useState<ReceiptTransferDraft>();
 const commit:FinanceTransitionCommitter=change=>{const result=change(current.current);if(result.ok){current.current=result.data;setData(result.data);}return result;};
 return <><ExpensesTab selectedMonth="November 2026" globalData={data} setGlobalData={setData} commitExpenseTransition={commit} showToast={vi.fn()} onReceiptTransfer={setTransfer}/>
 {transfer&&<HistoricalLedgerModal isOpen initialType="transfer" initialReceipt={transfer} globalData={data} commitLedgerTransition={commit} showToast={vi.fn()} onClose={()=>setTransfer(undefined)}/>}
 <output data-testid="data">{JSON.stringify(data)}</output></>;
}
const state=()=>JSON.parse(screen.getByTestId('data').textContent!);
const scanNow=()=>act(()=>{scan.options.onScanStart();scan.options.onScanComplete(receipt);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('receipt review routing through real expense and transfer forms',()=>{
 it('routes an internal transfer without creating an expense, and posts only after wallet confirmation',()=>{
  render(<Harness/>);scanNow();expect(screen.getByRole('dialog',{name:'Review receipt'})).toBeInTheDocument();expect(state().wallets.a).toBe(2000);
  fireEvent.click(screen.getByRole('button',{name:'Between my wallets'}));fireEvent.click(screen.getByRole('button',{name:'Continue'}));expect(screen.queryByRole('dialog',{name:'Review receipt'})).not.toBeInTheDocument();
  const dialog=screen.getByRole('dialog',{name:'Transfer'});expect(document.activeElement?.closest('[role="dialog"]')).toBe(dialog);expect(within(dialog).getByLabelText('From')).toHaveValue('');expect(state().library.expenses).toEqual([]);
  fireEvent.change(within(dialog).getByLabelText('From'),{target:{value:'a'}});fireEvent.change(within(dialog).getByLabelText('To'),{target:{value:'b'}});fireEvent.click(within(dialog).getByRole('button',{name:'Transfer'}));
  expect(state().wallets).toEqual({a:490,b:1600});expect(state().library.expenses).toEqual([]);expect(state().library.manualTransactions).toHaveLength(1);
  const summary=screen.getByRole('heading',{name:'November 2026 Spending'}).closest('section')!;expect(within(summary).getAllByText('₱10.00')).toHaveLength(2);expect(within(summary).getByText(/0 expenses · 1 transfer fee/)).toBeInTheDocument();
 });
 it('routes an external payment to a total expense including the fee exactly once',()=>{
  render(<Harness/>);scanNow();fireEvent.click(screen.getByRole('button',{name:'Expense / payment'}));fireEvent.click(screen.getByRole('button',{name:'Continue'}));
  const form=screen.getByRole('form',{name:'Log Expense'});expect(within(form).getByLabelText('Amount (₱)')).toHaveValue(1510);expect(state().wallets.a).toBe(2000);fireEvent.submit(form);
  expect(state().wallets).toEqual({a:490,b:100});expect(state().library.expenses[0]).toMatchObject({amount:1510,deductedAmount:1510});expect(state().library.manualTransactions).toEqual([]);
 });
 it('canceling receipt review clears the scan and reopens manual entry blank',()=>{
  render(<Harness/>);scanNow();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));fireEvent.click(screen.getByRole('button',{name:/^Manual/}));
  expect(screen.getByLabelText('Amount (₱)')).toHaveValue(null);expect(state().wallets).toEqual({a:2000,b:100});
 });
});
