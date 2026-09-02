import { describe, it, expect } from 'vitest';
import { parseMonthKey, getAdjacentMonth, getDaysUntil, getMonthKey } from './dateHelpers';

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
});
