import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useBudgetDate } from './useBudgetDate';

afterEach(() => vi.useRealTimers());
it('refreshes the day at a month boundary and after returning, and cleans up its timer', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 30, 23, 59, 59, 999));
  const hook = renderHook(() => useBudgetDate());
  expect(hook.result.current).toBe('2026-11-30');
  act(() => vi.advanceTimersByTime(60)); expect(hook.result.current).toBe('2026-12-01');
  act(() => { vi.setSystemTime(new Date(2026, 11, 3, 8)); window.dispatchEvent(new Event('pageshow')); });
  expect(hook.result.current).toBe('2026-12-03');
  hook.unmount(); expect(vi.getTimerCount()).toBe(0);
});
