import { useState, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedFinanceData } from '../types/finance';
import { WalletsTab } from './WalletsTab';
import { BillAddModal } from './BillAddModal';
import { WalletGrid } from './WalletGrid';
const empty=():UnifiedFinanceData=>({wallets:{},settings:{customWallets:[]},library:{bills:[],receivables:[],shoots:[],expenses:[]},logs:{}});
const state=()=>JSON.parse(screen.getByTestId('state').textContent!);
function WalletHarness(){const [data,setData]=useState(empty);return <><WalletsTab globalData={data} setGlobalData={setData} onCommit={vi.fn()} onIncrement={vi.fn()}/><output data-testid="state">{JSON.stringify(data)}</output></>;}
afterEach(()=>{cleanup();vi.restoreAllMocks();document.body.style.overflow='';});
describe('first wallet guidance and controls',()=>{
 it('explains how to add a wallet, names colors and creates it at zero without inventing funds',()=>{
  render(<WalletHarness/>);expect(screen.getByText(/No wallets yet/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Add New Account'}));
  const name=screen.getByRole('combobox',{name:'Account Name'});expect(name).toHaveFocus();expect(screen.getByText(/New wallets start at ₱0/)).toBeInTheDocument();
  const colors=screen.getByRole('group',{name:'Accent Color'});expect(within(colors).getByRole('button',{name:'Emerald accent',pressed:true})).toBeInTheDocument();fireEvent.click(within(colors).getByRole('button',{name:'Blue accent'}));expect(within(colors).getByRole('button',{name:'Blue accent',pressed:true})).toBeInTheDocument();
  fireEvent.change(name,{target:{value:'GCash'}});fireEvent.submit(screen.getByRole('form',{name:'Add wallet'}));
  const data=state();expect(Object.values(data.wallets)).toEqual([0]);expect(data.settings.customWallets[0]).toMatchObject({label:'GCash',color:'text-blue-400'});expect(data.library).toEqual(empty().library);expect(data.logs).toEqual({});expect(screen.getByRole('button',{name:'Add New Account'})).toHaveFocus();
 });
 it('explains a blank name and lets Cancel discard the new wallet',()=>{
  render(<WalletHarness/>);const initial=state();fireEvent.click(screen.getByRole('button',{name:'Add New Account'}));const name=screen.getByLabelText('Account Name');fireEvent.change(name,{target:{value:'   '}});fireEvent.submit(screen.getByRole('form',{name:'Add wallet'}));expect(screen.getByRole('alert')).toHaveTextContent(/Enter a name/);expect(name).toHaveAttribute('aria-invalid','true');expect(name).toHaveFocus();expect(state()).toEqual(initial);
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.getByRole('button',{name:'Add New Account'})).toHaveFocus();expect(state()).toEqual(initial);
 });
 it('names each wallet action and returns focus to the edited wallet when canceled',()=>{
  render(<WalletHarness/>);fireEvent.click(screen.getByRole('button',{name:'Add New Account'}));fireEvent.change(screen.getByLabelText('Account Name'),{target:{value:'Cash'}});fireEvent.submit(screen.getByRole('form',{name:'Add wallet'}));
  expect(screen.getByRole('button',{name:'Archive Cash account'})).toHaveClass('min-h-11','min-w-11');fireEvent.click(screen.getByRole('button',{name:'Edit Cash account'}));fireEvent.change(screen.getByLabelText('Account Name'),{target:{value:'Discard me'}});fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.getByRole('button',{name:'Edit Cash account'})).toHaveFocus();expect(state().settings.customWallets[0].label).toBe('Cash');
 });
});
describe('balance dialog accessibility',()=>{
 it('focuses the balance, explains replacement versus income and restores scroll/focus on cancel',()=>{
  document.body.style.overflow='scroll';const commit=vi.fn(),income=vi.fn();render(<WalletGrid wallets={{cash:123}} customWallets={[{id:'cash',label:'Cash'}]} onCommit={commit} onIncrement={income}/>);
  const opener=screen.getByRole('button',{name:/^Cash.*Total balance/});opener.focus();fireEvent.click(opener);const dialog=screen.getByRole('dialog',{name:'Edit Balance'});const input=within(dialog).getByRole('spinbutton',{name:'Balance'});expect(input).toHaveFocus();expect(input).toHaveAccessibleDescription(/Set the current balance.*Quick Add Income adds money/);expect(document.body.style.overflow).toBe('hidden');fireEvent.change(input,{target:{value:'999'}});fireEvent.keyDown(window,{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(opener).toHaveFocus();expect(document.body.style.overflow).toBe('scroll');expect(commit).not.toHaveBeenCalled();expect(income).not.toHaveBeenCalled();
 });
 it('keeps an unsuccessful save in the dialog with its error attached to the input',()=>{
  render(<WalletGrid wallets={{cash:123}} customWallets={[{id:'cash',label:'Cash'}]} onCommit={()=>({ok:false,error:'Review the current balance.'})} onIncrement={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:/^Cash.*Total balance/}));fireEvent.click(screen.getByRole('button',{name:'Save Balance'}));expect(screen.getByRole('spinbutton',{name:'Balance'})).toHaveAccessibleDescription(/Review the current balance/);expect(screen.getByRole('dialog')).toBeInTheDocument();
 });
});
describe('commitment labels and focus',()=>{
 const initial={name:'',amount:'',wallet:'cash',dueDay:'1',type:'Bill' as const,startMonth:'November 2026',endMonth:'December 2026'};
 function Harness(){const [open,setOpen]=useState(false),[bill,setBill]=useState<ComponentProps<typeof BillAddModal>['newBill']>(initial);return <><button onClick={()=>setOpen(true)}>Create commitment</button>{open&&<BillAddModal newBill={bill} setNewBill={setBill} customWallets={[{id:'cash',label:'Cash'}]} onSubmit={vi.fn()} onCancel={()=>setOpen(false)}/>}</>;}
 it('links every field to its visible label, shows payment guidance and restores focus',()=>{
  render(<Harness/>);const opener=screen.getByRole('button',{name:'Create commitment'});opener.focus();fireEvent.click(opener);expect(screen.getByRole('textbox',{name:'Commitment Name'})).toHaveFocus();expect(screen.getByRole('spinbutton',{name:'Amount (₱)'})).toBeRequired();expect(screen.getByRole('combobox',{name:'Pay from wallet'})).toHaveAccessibleDescription(/normally use to pay/);expect(screen.getByRole('combobox',{name:'Due day each month'})).toBeInTheDocument();expect(screen.getByText(/Money is deducted when you record a payment/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox',{name:'Type'}),{target:{value:'Loan / Installment'}});expect(screen.getByRole('combobox',{name:'Start Month'})).toBeInTheDocument();expect(screen.getByRole('combobox',{name:'End Month'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Cancel new commitment'}));expect(opener).toHaveFocus();
 });
});
