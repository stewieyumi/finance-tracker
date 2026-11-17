import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceiptReview } from './ReceiptReview';
import type { ScanResult } from '../hooks/useExpenseScanner';
const result: ScanResult = { merchant: 'Synthetic Recipient', amount: '1500', category: 'Other', date: '2026-11-01', wallet: 'a', review: { kind: 'transfer', fee: 10, source: 'Bank A', destination: 'Wallet B', dateKnown: true } };
afterEach(cleanup);
describe('receipt classification review', () => {
  it('requires an explicit ownership choice even for a transfer-looking receipt', () => {
    const onExpense=vi.fn(), onTransfer=vi.fn(); render(<ReceiptReview result={result} onCancel={vi.fn()} onExpense={onExpense} onTransfer={onTransfer}/>);
    fireEvent.click(screen.getByRole('button',{name:'Continue'})); expect(screen.getByRole('alert')).toHaveTextContent(/choose expense/i); expect(onExpense).not.toHaveBeenCalled(); expect(onTransfer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Between my wallets'})); fireEvent.click(screen.getByRole('button',{name:'Continue'}));
    expect(onTransfer).toHaveBeenCalledWith({amount:'1500',fee:'10',date:'2026-11-01',source:'Bank A',destination:'Wallet B'}); expect(onExpense).not.toHaveBeenCalled();
  });
  it('allows a sent payment to someone else to be reviewed as an expense', () => {
    const onExpense=vi.fn();render(<ReceiptReview result={result} onCancel={vi.fn()} onExpense={onExpense}/>);
    fireEvent.click(screen.getByRole('button',{name:'Expense / payment'}));fireEvent.click(screen.getByRole('button',{name:'Continue'}));
    expect(onExpense).toHaveBeenCalledWith(expect.objectContaining({amount:'1500'}),10);
  });
  it('does not invent an unreadable fee or date and preserves the draft on cancel', () => {
    const onExpense=vi.fn(),onCancel=vi.fn();render(<ReceiptReview result={{...result,review:{...result.review!,fee:null,dateKnown:false}}} onCancel={onCancel} onExpense={onExpense}/>);
    expect(screen.getByLabelText('Receipt fee')).toHaveValue(null);expect(screen.getByLabelText('Receipt payment date')).toHaveValue('');
    fireEvent.click(screen.getByRole('button',{name:'Expense / payment'}));fireEvent.click(screen.getByRole('button',{name:'Continue'}));expect(onExpense).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toHaveTextContent(/check the amount/i);
    fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(onCancel).toHaveBeenCalledOnce();
  });
  it.each(['-1','1.005','10000001'])('rejects invalid fee %s',fee=>{
    const onExpense=vi.fn();render(<ReceiptReview result={result} onCancel={vi.fn()} onExpense={onExpense}/>);fireEvent.click(screen.getByRole('button',{name:'Expense / payment'}));fireEvent.change(screen.getByLabelText('Receipt fee'),{target:{value:fee}});fireEvent.click(screen.getByRole('button',{name:'Continue'}));expect(onExpense).not.toHaveBeenCalled();
  });
});
