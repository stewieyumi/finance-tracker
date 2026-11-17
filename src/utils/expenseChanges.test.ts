import { describe, expect, it } from 'vitest';
import type { Expense, UnifiedFinanceData } from '../types/finance';
import { INITIAL_UNIFIED_DATA } from '../constants/initialData';
import { applyExpenseDelete, applyExpenseSave } from '../hooks/useExpenseActions';
import { isValidFinanceBackup } from './validationHelpers';
import { applyExpenseEdit, applyExpenseReplay } from './expenseChanges';

const expense = (overrides: Partial<Expense> = {}): Expense => ({ id: 'exp1', merchant: 'Lunch', amount: 100, deductedAmount: 100,
  category: 'Food & Dining', wallet: 'a', date: '2026-11-01', loggedAt: '2026-11-01T04:00:00.000Z', ...overrides });
const fixture = (record = expense()): UnifiedFinanceData => ({ ...structuredClone(INITIAL_UNIFIED_DATA),
  wallets: { a: 900, b: 500 }, settings: { defaultWallet: 'b', customWallets: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
  library: { bills: [], receivables: [], shoots: [], expenses: [record] }, logs: {} });
const form = (record = expense(), overrides = {}) => ({ ...record, amount: String(record.amount), ...overrides });
function assertNoWrite(result: ReturnType<typeof applyExpenseEdit>, original: UnifiedFinanceData) {
  expect(result.ok).toBe(false); expect(result.data).toBe(original);
}

describe('expense correction and replay money flow', () => {
  it.each([[150, 850], [80, 920], [100.01, 899.99], [99.99, 900.01]])('adjusts %s using only the net cents and keeps receipt identity/time', (amount, balance) => {
    const original = fixture(), record = original.library.expenses![0];
    const result = applyExpenseEdit(original, record, form(record, { amount: String(amount), merchant: 'Correct lunch' }));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.data.wallets).toEqual({ a: balance, b: 500 });
    expect(result.expense).toEqual({ ...record, merchant: 'Correct lunch', amount, deductedAmount: amount });
    expect(result.data.logs).toBe(original.logs); expect(original.wallets.a).toBe(900);
    const undo = applyExpenseReplay(result.data, result.change!, 'Undo');
    expect(undo.ok).toBe(true); if (!undo.ok) return;
    expect(undo.data.wallets).toEqual(original.wallets); expect(undo.data.library.expenses).toEqual(original.library.expenses);
    expect(applyExpenseReplay(undo.data, result.change!, 'Undo').ok).toBe(false);
    const redo = applyExpenseReplay(undo.data, result.change!, 'Redo');
    expect(redo.ok).toBe(true); if (!redo.ok) return;
    expect(redo.data.wallets).toEqual(result.data.wallets); expect(redo.data.library.expenses).toEqual(result.data.library.expenses);
  });

  it('moves the original debit between wallets atomically and reverses both legs', () => {
    const original = fixture(), record = original.library.expenses![0];
    const result = applyExpenseEdit(original, record, form(record, { wallet: 'b', amount: '150' }));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.data.wallets).toEqual({ a: 1000, b: 350 });
    const undo = applyExpenseReplay(result.data, result.change!, 'Undo');
    expect(undo.ok).toBe(true); if (!undo.ok) return;
    expect(undo.data.wallets).toEqual(original.wallets);
    expect(undo.data.library.expenses).toEqual(original.library.expenses);
  });
  it('does not commit the original-wallet refund when the new wallet cannot fund the expense', () => {
    const original = fixture(); original.wallets.b = 50;
    const record = original.library.expenses![0], snapshot = structuredClone(original);
    assertNoWrite(applyExpenseEdit(original, record, form(record, { wallet: 'b', amount: '150' })), original);
    expect(original).toEqual(snapshot);
  });
  it('blocks undo atomically if a refunded original wallet no longer has enough funds', () => {
    const original = fixture(), record = original.library.expenses![0];
    const edited = applyExpenseEdit(original, record, form(record, { wallet: 'b' }));
    expect(edited.ok).toBe(true); if (!edited.ok) return;
    const latest: UnifiedFinanceData = { ...edited.data, wallets: { ...edited.data.wallets, a: 0 } };
    assertNoWrite(applyExpenseReplay(latest, edited.change!, 'Undo'), latest);
    expect(latest.wallets.b).toBe(400);
  });
  it('preserves unrelated new records and transactions when replaying against current balances', () => {
    const original = fixture(), record = original.library.expenses![0];
    const edited = applyExpenseEdit(original, record, form(record, { amount: '150' }));
    expect(edited.ok).toBe(true); if (!edited.ok) return;
    const unrelated = expense({ id: 'another', amount: 10, deductedAmount: 10 });
    const latest = { ...edited.data, wallets: { ...edited.data.wallets, a: 840 }, library: { ...edited.data.library, expenses: [unrelated, edited.expense!] } };
    const undo = applyExpenseReplay(latest, edited.change!, 'Undo');
    expect(undo.ok).toBe(true); if (!undo.ok) return;
    expect(undo.data.wallets.a).toBe(890); expect(undo.data.library.expenses).toEqual([unrelated, record]);
  });
  it('supports stacked edits undoing in order', () => {
    const original = fixture(), record = original.library.expenses![0];
    const first = applyExpenseEdit(original, record, form(record, { amount: '150' }));
    expect(first.ok).toBe(true); if (!first.ok) return;
    const second = applyExpenseEdit(first.data, first.expense!, form(first.expense!, { merchant: 'Renamed' }));
    expect(second.ok).toBe(true); if (!second.ok) return;
    const undoSecond = applyExpenseReplay(second.data, second.change!, 'Undo');
    expect(undoSecond.ok).toBe(true); if (!undoSecond.ok) return;
    const undoFirst = applyExpenseReplay(undoSecond.data, first.change!, 'Undo');
    expect(undoFirst.ok).toBe(true); if (!undoFirst.ok) return;
    expect(undoFirst.data.library.expenses).toEqual(original.library.expenses); expect(undoFirst.data.wallets).toEqual(original.wallets);
  });
  it.each([undefined, 0, 60])('restores a deleted legacy/different debit (%s) exactly, without charging its displayed amount', debit => {
    const record = expense({ deductedAmount: debit }), original = fixture(record);
    const deleted = applyExpenseDelete(original, record);
    expect(deleted.ok).toBe(true); if (!deleted.ok) return;
    expect(deleted.data.wallets.a).toBe(900 + (debit ?? 100));
    const restored = applyExpenseReplay(deleted.data, deleted.change!, 'Undo');
    expect(restored.ok).toBe(true); if (!restored.ok) return;
    expect(restored.data.wallets).toEqual(original.wallets); expect(restored.data.library.expenses).toEqual([record]);
    expect(applyExpenseReplay(restored.data, deleted.change!, 'Undo').ok).toBe(false);
    const again = applyExpenseReplay(restored.data, deleted.change!, 'Redo');
    expect(again.ok).toBe(true); if (!again.ok) return;
    expect(again.data.wallets).toEqual(deleted.data.wallets); expect(again.data.library.expenses).toEqual([]);
  });
  it('restores a zero-value legacy expense without any wallet charge', () => {
    const record = expense({ amount: 0, deductedAmount: 0 }), original = fixture(record);
    const deleted = applyExpenseDelete(original, record); expect(deleted.ok).toBe(true); if (!deleted.ok) return;
    const undo = applyExpenseReplay(deleted.data, deleted.change!, 'Undo'); expect(undo.ok).toBe(true); if (!undo.ok) return;
    expect(undo.data.wallets).toEqual(original.wallets); expect(undo.data.library.expenses).toEqual([record]);
  });
  it('offers reversible new expenses and rejects double add-undo and redo', () => {
    const original = fixture(); original.library.expenses = [];
    const added = applyExpenseSave(original, form(), '2026-11-18T01:00:00.000Z');
    expect(added.ok).toBe(true); if (!added.ok) return;
    const undo = applyExpenseReplay(added.data, added.change!, 'Undo'); expect(undo.ok).toBe(true); if (!undo.ok) return;
    expect(undo.data.wallets).toEqual(original.wallets); expect(undo.data.library.expenses).toEqual([]);
    expect(applyExpenseReplay(undo.data, added.change!, 'Undo').ok).toBe(false);
    const redo = applyExpenseReplay(undo.data, added.change!, 'Redo'); expect(redo.ok).toBe(true); if (!redo.ok) return;
    expect(redo.data.library.expenses).toEqual(added.data.library.expenses);
    expect(applyExpenseReplay(redo.data, added.change!, 'Redo').ok).toBe(false);
  });
  it('supports archived original-wallet refunds/replays, without routing to the new default', () => {
    const original = fixture(); original.settings!.customWallets = [{ id: 'b', label: 'B' }]; original.settings!.archivedWallets = [{ id: 'a', label: 'Archived A' }];
    const record = original.library.expenses![0];
    const edited = applyExpenseEdit(original, record, form(record, { amount: '80' }));
    expect(edited.ok).toBe(true); if (!edited.ok) return;
    expect(edited.data.wallets).toEqual({ a: 920, b: 500 });
    expect(applyExpenseReplay(edited.data, edited.change!, 'Undo').ok).toBe(true);
    assertNoWrite(applyExpenseEdit(original, record, form(record, { amount: '120' })), original);
  });
  it.each([0, 60])('allows only detail edits when the recorded debit differs (%s)', deductedAmount => {
    const record = expense({ deductedAmount }), original = fixture(record);
    const result = applyExpenseEdit(original, record, form(record, { merchant: 'Corrected name', category: 'Other', date: '2026-11-02' }));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.data.wallets).toEqual(original.wallets); expect(result.expense!.deductedAmount).toBe(deductedAmount);
    assertNoWrite(applyExpenseEdit(original, record, form(record, { amount: '101' })), original);
    assertNoWrite(applyExpenseEdit(original, record, form(record, { wallet: 'b' })), original);
  });
  it.each(['101x', '', '0', '-1', '1.005', 'Infinity', '1e308'])('rejects invalid edited money %s', amount => {
    const original = fixture(), record = original.library.expenses![0];
    assertNoWrite(applyExpenseEdit(original, record, form(record, { amount })), original);
  });
  it.each([null, NaN, Infinity, 'bad', undefined])('rejects missing/invalid wallet balance on restoration (%s)', balance => {
    const original = fixture(), record = original.library.expenses![0];
    const deleted = applyExpenseDelete(original, record); expect(deleted.ok).toBe(true); if (!deleted.ok) return;
    deleted.data.wallets.a = balance as any;
    assertNoWrite(applyExpenseReplay(deleted.data, deleted.change!, 'Undo'), deleted.data);
  });
  it('blocks stale edits, deleted targets and duplicate IDs', () => {
    const original = fixture(), record = expense();
    original.library.expenses![0] = { ...record, merchant: 'Changed elsewhere' };
    assertNoWrite(applyExpenseEdit(original, record, form(record, { amount: '120' })), original);
    original.library.expenses = []; assertNoWrite(applyExpenseEdit(original, record, form(record)), original);
    original.library.expenses = [record, { ...record }]; assertNoWrite(applyExpenseEdit(original, record, form(record)), original);
  });
  it('rejects an overflow refund and an impossible changed date, while preserving an untouched legacy date', () => {
    const original = fixture(), record = original.library.expenses![0]; original.wallets.a = Number.MAX_SAFE_INTEGER / 100;
    assertNoWrite(applyExpenseEdit(original, record, form(record, { amount: '80' })), original);
    assertNoWrite(applyExpenseEdit(original, record, form(record, { date: '2026-02-30' })), original);
    const undated = fixture(expense({ date: '', loggedAt: undefined }));
    const result = applyExpenseEdit(undated, undated.library.expenses![0], form(undated.library.expenses![0], { merchant: 'New name' }));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.expense!.date).toBe(''); expect(result.expense!.loggedAt).toBeUndefined();
  });
  it('rejects an old deletion undo after another writer restored and deleted that record again', () => {
    const original = fixture(), record = original.library.expenses![0];
    const first = applyExpenseDelete(original, record); expect(first.ok).toBe(true); if (!first.ok) return;
    const restored = applyExpenseReplay(first.data, first.change!, 'Undo'); expect(restored.ok).toBe(true); if (!restored.ok) return;
    const later = applyExpenseDelete(restored.data, record); expect(later.ok).toBe(true); if (!later.ok) return;
    assertNoWrite(applyExpenseReplay(later.data, first.change!, 'Undo'), later.data);
  });
  it('rejects a stale edit even if another writer changed the fields back to their original values', () => {
    const original = fixture(), record = original.library.expenses![0];
    const first = applyExpenseEdit(original, record, form(record, { merchant: 'Other writer' })); expect(first.ok).toBe(true); if (!first.ok) return;
    const reverted = applyExpenseEdit(first.data, first.expense!, form(record)); expect(reverted.ok).toBe(true); if (!reverted.ok) return;
    assertNoWrite(applyExpenseEdit(reverted.data, record, form(record, { amount: '80' }), null), reverted.data);
    assertNoWrite(applyExpenseDelete(reverted.data, record, null), reverted.data);
  });
  it('preserves other expense markers, survives backup roundtrip and guards malformed metadata', () => {
    const original = fixture(), record = original.library.expenses![0]; original.expenseRevisions = { unrelated: 'known-other-change' };
    const edited = applyExpenseEdit(original, record, form(record, { amount: '80' })); expect(edited.ok).toBe(true); if (!edited.ok) return;
    const roundtrip = JSON.parse(JSON.stringify(edited.data)); expect(isValidFinanceBackup(roundtrip)).toBe(true);
    const undo = applyExpenseReplay(roundtrip, edited.change!, 'Undo'); expect(undo.ok).toBe(true); if (!undo.ok) return;
    expect(undo.data.expenseRevisions).toEqual(original.expenseRevisions);
    for (const corrupt of [null, [], { original: 0 }, { original: '' }]) {
      const invalid = { ...original, expenseRevisions: corrupt } as any;
      expect(isValidFinanceBackup(invalid)).toBe(false);
      assertNoWrite(applyExpenseEdit(invalid, record, form(record, { amount: '80' })), invalid);
      assertNoWrite(applyExpenseDelete(invalid, record), invalid);
    }
  });
  it('keeps money conserved in cents over many edit amounts', () => {
    for (let cents = 1; cents < 20000; cents += 137) {
      const original = fixture(), record = original.library.expenses![0];
      const result = applyExpenseEdit(original, record, form(record, { amount: String(cents / 100) }));
      expect(result.ok).toBe(true); if (!result.ok) return;
      expect(Math.round(result.data.wallets.a * 100) + Math.round(result.expense!.deductedAmount! * 100)).toBe(100000);
      expect(result.data.wallets.b).toBe(500);
    }
  });
});
