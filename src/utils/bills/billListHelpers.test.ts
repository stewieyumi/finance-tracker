import { describe, it, expect } from 'vitest';
import { filterBills, sortBills, groupBillsByHalf } from './billListHelpers';
import { BillViewModel, BillType } from '../../types/finance';

const createMockBill = (overrides: Partial<BillViewModel> = {}): BillViewModel => ({
  id: '1',
  name: 'Test Bill',
  amount: 100,
  dueDay: '1',
  type: 'Bill' as BillType,
  paid: false,
  startMonth: 'Jan 2024',
  endMonth: 'Jan 2024',
  wallet: 'main',
  daysLeft: 10,
  baseAmount: 100,
  targetMonthForDue: 'Jan 2024',
  isOverridden: false,
  ...overrides,
});

describe('billListHelpers', () => {
  describe('filterBills', () => {
    it('returns all bills when filter is "All" and search is empty', () => {
      const bills = [createMockBill(), createMockBill({ id: '2', type: 'Subscription' })];
      const result = filterBills(bills, 'All', '');
      expect(result).toHaveLength(2);
    });

    it('filters by bill type', () => {
      const bills = [
        createMockBill({ type: 'Bill' }),
        createMockBill({ type: 'Subscription' }),
        createMockBill({ type: 'Subscription' })
      ];
      const result = filterBills(bills, 'Subscription', '');
      expect(result).toHaveLength(2);
    });

    it('filters by search query case-insensitively', () => {
      const bills = [
        createMockBill({ name: 'Netflix' }),
        createMockBill({ name: 'Spotify' })
      ];
      const result = filterBills(bills, 'All', 'netF');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Netflix');
    });

    it('applies both type and search filters', () => {
      const bills = [
        createMockBill({ name: 'Netflix', type: 'Subscription' }),
        createMockBill({ name: 'Spotify', type: 'Subscription' }),
        createMockBill({ name: 'Internet', type: 'Bill' })
      ];
      const result = filterBills(bills, 'Subscription', 'net');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Netflix');
    });
  });

  describe('sortBills', () => {
    it('sorts by default (no change)', () => {
      const bills = [createMockBill({ id: '2' }), createMockBill({ id: '1' })];
      const result = sortBills(bills, 'default');
      expect(result[0].id).toBe('2');
    });

    it('sorts by dueSoon', () => {
      const bills = [
        createMockBill({ daysLeft: 5, amount: 50 }),
        createMockBill({ daysLeft: 2, amount: 100 }),
        createMockBill({ daysLeft: 2, amount: 200 })
      ];
      const result = sortBills(bills, 'dueSoon');
      expect(result[0].amount).toBe(200);
      expect(result[1].amount).toBe(100);
      expect(result[2].amount).toBe(50);
    });

    it('sorts by dueDate', () => {
      const bills = [
        createMockBill({ dueDay: '15', name: 'B' }),
        createMockBill({ dueDay: '5', name: 'C' }),
        createMockBill({ dueDay: '5', name: 'A' })
      ];
      const result = sortBills(bills, 'dueDate');
      expect(result[0].name).toBe('A');
      expect(result[1].name).toBe('C');
      expect(result[2].name).toBe('B');
    });

    it('sorts by amountDesc', () => {
      const bills = [
        createMockBill({ amount: 50, name: 'B' }),
        createMockBill({ amount: 100, name: 'C' }),
        createMockBill({ amount: 100, name: 'A' })
      ];
      const result = sortBills(bills, 'amountDesc');
      expect(result[0].name).toBe('A');
      expect(result[1].name).toBe('C');
      expect(result[2].name).toBe('B');
    });

    it('sorts by amountAsc', () => {
      const bills = [
        createMockBill({ amount: 100, name: 'B' }),
        createMockBill({ amount: 50, name: 'C' }),
        createMockBill({ amount: 50, name: 'A' })
      ];
      const result = sortBills(bills, 'amountAsc');
      expect(result[0].name).toBe('A');
      expect(result[1].name).toBe('C');
      expect(result[2].name).toBe('B');
    });

    it('sorts by nameAsc', () => {
      const bills = [
        createMockBill({ name: 'Z' }),
        createMockBill({ name: 'A' })
      ];
      const result = sortBills(bills, 'nameAsc');
      expect(result[0].name).toBe('A');
    });

    it('sorts by unpaidFirst', () => {
      const bills = [
        createMockBill({ paid: true, dueDay: '1', name: 'A' }),
        createMockBill({ paid: false, dueDay: '5', name: 'Z' }),
        createMockBill({ paid: false, dueDay: '2', name: 'C' }),
      ];
      const result = sortBills(bills, 'unpaidFirst');
      expect(result[0].name).toBe('C');
      expect(result[1].name).toBe('Z');
      expect(result[2].name).toBe('A');
    });
  });

  describe('groupBillsByHalf', () => {
    it('groups bills into first and second half', () => {
      const bills = [
        createMockBill({ dueDay: '1' }),
        createMockBill({ dueDay: '15' }),
        createMockBill({ dueDay: '16' }),
        createMockBill({ dueDay: '31' }),
        createMockBill({ dueDay: 'invalid' }) // defaults to 1
      ];
      const result = groupBillsByHalf(bills);
      expect(result.firstHalfBills).toHaveLength(3); // 1, 15, invalid(1)
      expect(result.secondHalfBills).toHaveLength(2); // 16, 31
    });
  });
});
