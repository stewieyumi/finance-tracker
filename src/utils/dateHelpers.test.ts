import { describe, it, expect } from 'vitest';
import {
  parseMonthKey,
  parseDateKey,
  getAdjacentMonth,
  getMonthRange,
  getDaysUntil,
  getMonthKey,
  isValidMonthRange
} from './dateHelpers';

describe('Date Helpers & Month Math', () => {
  it('correctly parses month strings into Date objects', () => {
    const parsed = parseMonthKey('August 2026');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
  });

  it('handles month transitions across year boundaries', () => {
    expect(getAdjacentMonth('August 2026', 1)).toBe('September 2026');
    expect(getAdjacentMonth('December 2026', 1)).toBe('January 2027');
    expect(getAdjacentMonth('January 2026', -1)).toBe('December 2025');
  });

  it('parses YYYY-MM-DD as a local calendar date', () => {
    const parsed = parseDateKey('2026-08-20');

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(20);
  });

  it('builds an inclusive month range with a failsafe limit', () => {
    expect(
      getMonthRange('November 2026', 'February 2027')
    ).toEqual([
      'November 2026',
      'December 2026',
      'January 2027',
      'February 2027'
    ]);

    expect(
      getMonthRange('November 2026', 'February 2027', 2)
    ).toEqual([
      'November 2026',
      'December 2026'
    ]);
  });

  it('accurately calculates days until a due date', () => {
    const today = new Date();
    const currentMonth = getMonthKey(today);
    const todayDateNumber = today.getDate().toString();

    expect(getDaysUntil(todayDateNumber, currentMonth)).toBe(0);
    expect(getDaysUntil('', '')).toBe(999);
    expect(getDaysUntil(0, '')).toBe(999);
  });

  it('safely clamps day overflow for short months like February', () => {
    const days = getDaysUntil('31', 'February 2027');
    expect(days).not.toBe(999);
  });

  it('accepts a loan range when start and end months are valid', () => {
    expect(
      isValidMonthRange('August 2026', 'October 2026')
    ).toBe(true);
  });

  it('accepts a loan range when start and end are the same month', () => {
    expect(
      isValidMonthRange('September 2026', 'September 2026')
    ).toBe(true);
  });

  it('rejects a loan range when the start month is after the end month', () => {
    expect(
      isValidMonthRange('October 2026', 'August 2026')
    ).toBe(false);
  });

  it('rejects an incomplete loan month range', () => {
    expect(
      isValidMonthRange('', 'October 2026')
    ).toBe(false);

    expect(
      isValidMonthRange('August 2026', '')
    ).toBe(false);
  });
});
