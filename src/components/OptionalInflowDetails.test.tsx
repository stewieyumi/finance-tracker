import React,{useState} from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceivablesTable } from './ReceivablesTable';
import { ReceivableEditModal } from './ReceivableEditModal';
import type { EditFormData, ReceivableViewModel } from '../types/finance';

const unknown:ReceivableViewModel={id:'unknown',name:'Future project',amount:0,amountUnspecified:true,frequency:'No Specific Date',startMonth:'November 2026',wallet:'main',collected:false,amountReceived:0,targetMonthForDue:'November 2026'};
afterEach(cleanup);
const props=()=>({activeReceivables:[],selectedMonth:'November 2026',onToggleStatus:vi.fn(),onAddPayment:vi.fn(),onAddReceivable:vi.fn(),onDeleteReceivable:vi.fn(),onSaveEdit:vi.fn(),editingId:null,setEditingId:vi.fn(),editForm:{},setEditForm:vi.fn(),customWallets:[{id:'main',label:'Main'}]});
describe('optional inflow entry UI',()=>{
 it('submits the add form with only a name and keeps amount/date optional',()=>{
  const p=props();render(<ReceivablesTable {...p}/>);fireEvent.click(screen.getByRole('button',{name:/add new inflow/i}));
  const dialog=screen.getByRole('dialog',{name:'Add New Inflow'});fireEvent.change(within(dialog).getByPlaceholderText('e.g. Salary, Client Payment'),{target:{value:'Future project'}});
  expect(within(dialog).getByRole('spinbutton')).not.toBeRequired();expect(dialog.querySelector('input[type=date]')).not.toBeRequired();
  fireEvent.click(within(dialog).getByRole('button',{name:/add inflow/i}));expect(p.onAddReceivable).toHaveBeenCalledWith(expect.objectContaining({name:'Future project',amount:0,amountUnspecified:true,date:''}));
 });
 it.each(['mobile','desktop'])('shows dashes and Edit, without payment actions for a %s placeholder',layout=>{
  const p=props();render(<ReceivablesTable {...p} activeReceivables={[unknown]}/>);
  const row=screen.getByTestId(`receivable-${layout}-row-unknown`);
  expect(within(row).getAllByText('—')).toHaveLength(2);expect(within(row).getByLabelText('No specific date')).toHaveTextContent('—');
  expect(within(row).queryByText('₱0.00')).not.toBeInTheDocument();expect(within(row).queryByRole('button',{name:'+₱'})).not.toBeInTheDocument();
  expect(within(row).getByRole('button',{name:/mark.*received/i})).toBeDisabled();fireEvent.click(row);expect(p.onToggleStatus).not.toHaveBeenCalled();
  fireEvent.click(within(row).getByRole('button',{name:'Edit'}));expect(p.setEditingId).toHaveBeenCalledWith('unknown');
 });
 it('keeps the edit amount blank and marks a deliberately cleared amount unspecified',()=>{
  let value:EditFormData={...unknown};const change=vi.fn();
  const Harness=()=>{const [form,setForm]=useState(value);return <ReceivableEditModal editingId="unknown" editForm={form} categoriesList={['Other']} allWallets={[{id:'main',label:'Main'}]} onChange={next=>{setForm(next);if(typeof next!=='function'){value=next;change(next);}}} onCancel={vi.fn()} onDelete={vi.fn()} onSave={vi.fn()}/>;};
  render(<Harness/>);const input=screen.getByLabelText('Gross Amount');expect(input).toHaveValue(null);expect(screen.getByTestId('receivable-net-display')).toHaveTextContent('—');
  fireEvent.change(input,{target:{value:'5000'}});expect(value.amountUnspecified).not.toBe(true);expect(value.amount).toBe(5000);
  fireEvent.change(input,{target:{value:''}});expect(value.amountUnspecified).toBe(true);expect(input).toHaveValue(null);
 });
 it('leaves dismissal to the save acknowledgement so rejected edits stay open',()=>{
  const cancel=vi.fn(),save=vi.fn();render(<ReceivableEditModal editingId="unknown" editForm={{...unknown}} categoriesList={['Other']} allWallets={[]} onChange={vi.fn()} onCancel={cancel} onDelete={vi.fn()} onSave={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'Save Changes'}));expect(save).toHaveBeenCalledOnce();expect(cancel).not.toHaveBeenCalled();
 });
});
