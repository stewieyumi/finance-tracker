import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoricalLedgerModal, applyLedgerSave, applyLedgerDelete, type LedgerSaveInput } from './HistoricalLedgerModal';
import type { UnifiedFinanceData } from '../types/finance';
import { buildTransactionHistory } from '../utils/transactionHistory';
import { TransactionHistoryModal } from './TransactionHistoryModal';
import { isValidFinanceBackup } from '../utils/validationHelpers';
const data=():UnifiedFinanceData=>({wallets:{a:2000,b:100},settings:{customWallets:[{id:'a',label:'Bank A'},{id:'b',label:'Wallet B'}],defaultWallet:'a',transferFromWallet:'a',transferToWallet:'b'},library:{bills:[],receivables:[],shoots:[],expenses:[],manualTransactions:[]},logs:{}});
const input=(overrides:Partial<LedgerSaveInput>={}):LedgerSaveInput=>({id:'transfer',editingId:null,title:'Transfer',amount:'1500',transferFee:'10',date:'2026-11-01',type:'transfer',wallet:'a',destinationWallet:'b',updateWallets:true,now:1234,...overrides});
afterEach(cleanup);
describe('transfer fee money flow',()=>{
 it('deducts principal plus fee, credits principal only, then reverses exactly',()=>{
  const initial=data(),result=applyLedgerSave(initial,input());expect(result.ok).toBe(true);expect(result.data.wallets).toEqual({a:490,b:1600});expect(initial.wallets).toEqual({a:2000,b:100});
  expect(result.data.library.expenses).toEqual([]);expect(result.data.library.manualTransactions![0]).toMatchObject({amount:1500,transferFee:10});
  const history=buildTransactionHistory(result.data);expect(history.filter(t=>t.isTransfer)).toHaveLength(2);expect(history.filter(t=>!t.isTransfer)).toEqual([expect.objectContaining({amount:-10,category:'Transfer fee'})]);expect(history.reduce((sum,t)=>sum+t.amount,0)).toBe(-10);
  const restored=applyLedgerDelete(result.data,{id:'transfer',expectedTx:result.data.library.manualTransactions![0]});expect(restored.ok).toBe(true);expect(restored.data.wallets).toEqual(initial.wallets);
 });
 it('edits only the net principal/fee difference and preserves created time',()=>{
  const saved=applyLedgerSave(data(),input()).data, old=saved.library.manualTransactions![0];
  const edited=applyLedgerSave(saved,input({editingId:'transfer',expectedOldTx:old,amount:'1400',transferFee:'5',now:4567}));expect(edited.ok).toBe(true);expect(edited.data.wallets).toEqual({a:595,b:1500});expect(edited.data.library.manualTransactions![0].createdAt).toBe(1234);
  const rejected=applyLedgerSave(edited.data,input({editingId:'transfer',expectedOldTx:old,amount:'1'}));expect(rejected.ok).toBe(false);expect(rejected.data).toBe(edited.data);
 });
 it('rejects insufficient funds for the fee atomically and retry/double save cannot charge twice',()=>{
  const initial=data();initial.wallets.a=1505;const rejected=applyLedgerSave(initial,input());expect(rejected.ok).toBe(false);expect(rejected.data).toBe(initial);
  const accepted=applyLedgerSave(data(),input()).data;const replay=applyLedgerSave(accepted,input());expect(replay.ok).toBe(false);expect(replay.data).toBe(accepted);
 });
 it('checks receipt duplicates against the authoritative latest state',()=>{
  const saved=applyLedgerSave(data(),input()).data;
  const blocked=applyLedgerSave(saved,input({id:'retry',checkDuplicate:true}));expect(blocked.ok).toBe(false);expect(blocked.data).toBe(saved);
  const confirmed=applyLedgerSave(saved,input({id:'distinct',checkDuplicate:true,allowDuplicate:true,updateWallets:false}));expect(confirmed.ok).toBe(true);expect(confirmed.data.wallets).toEqual(saved.wallets);
 });
 it.each([-1,NaN,Infinity,'1.005','bad','',null])('rejects invalid fee %s without partial writes',fee=>{
  const initial=data();const result=applyLedgerSave(initial,input({transferFee:fee as number}));expect(result.ok).toBe(false);expect(result.data).toBe(initial);
 });
 it('rejects fee on non-transfer and out-of-range totals',()=>{
  expect(applyLedgerSave(data(),input({type:'expense'})).ok).toBe(false);
  expect(applyLedgerSave(data(),input({amount:Number.MAX_SAFE_INTEGER/100,transferFee:1})).ok).toBe(false);
 });
 it('preserves history-only wallet behavior and cannot reverse spent destination funds partially',()=>{
  const initial=data(),history=applyLedgerSave(initial,input({updateWallets:false}));expect(history.data.wallets).toEqual(initial.wallets);expect(applyLedgerDelete(history.data,{id:'transfer'}).data.wallets).toEqual(initial.wallets);
  const posted=applyLedgerSave(initial,input()).data;posted.wallets.b=100;const rejected=applyLedgerDelete(posted,{id:'transfer'});expect(rejected.ok).toBe(false);expect(rejected.data).toBe(posted);
 });
 it('roundtrips valid transfer fee backups and rejects invalid fee metadata',()=>{
  const saved=applyLedgerSave(data(),input()).data;expect(isValidFinanceBackup(JSON.parse(JSON.stringify(saved)))).toBe(true);
  saved.library.manualTransactions![0].transferFee=-1;expect(isValidFinanceBackup(saved)).toBe(false);
 });
});
describe('scanned transfer form',()=>{
 it('prefills principal/fee/date but asks for both owned wallets and commits once',()=>{
  let current=data();const commit=vi.fn((transition:any)=>{const result=transition(current);if(result.ok)current=result.data;return result;});const close=vi.fn();
  render(<HistoricalLedgerModal isOpen initialType="transfer" initialReceipt={{amount:'1500',fee:'10',date:'2026-11-01',source:'Bank A',destination:'Wallet B'}} onClose={close} globalData={current} commitLedgerTransition={commit} showToast={vi.fn()}/>);
  expect(screen.getByLabelText('From')).toHaveValue('');expect(screen.getByLabelText('To')).toHaveValue('');expect(screen.getByLabelText('Payment date')).toHaveValue('2026-11-01');
  fireEvent.click(screen.getByRole('button',{name:'Transfer'}));expect(screen.getByRole('alert')).toHaveTextContent(/destination wallet/i);expect(current.wallets.a).toBe(2000);
  fireEvent.change(screen.getByLabelText('From'),{target:{value:'a'}});fireEvent.change(screen.getByLabelText('To'),{target:{value:'b'}});fireEvent.click(screen.getByRole('button',{name:'Transfer'}));expect(close).toHaveBeenCalledOnce();expect(current.wallets).toEqual({a:490,b:1600});
  fireEvent.click(screen.getByRole('button',{name:'Transfer'}));expect(current.wallets).toEqual({a:490,b:1600});expect(screen.getByRole('alert')).toHaveTextContent(/already recorded/i);
 });
 it('shows only fee spending in the history summary, with transfers separately filterable',()=>{
  const saved=applyLedgerSave(data(),input()).data;render(<TransactionHistoryModal isOpen onClose={vi.fn()} transactions={buildTransactionHistory(saved)}/>);
  expect(screen.getByRole('button',{name:/Expenses \(1\)/})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/Transfers \(2\)/}));expect(screen.queryByText('Transfer (Fee)')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Expenses \(1\)/}));expect(screen.getByText('Transfer (Fee)')).toBeInTheDocument();
 });
});
