import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWalletActions } from "./useWalletActions";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import { UnifiedFinanceData } from "../types/finance";

describe("useWalletActions", () => {
  it("commits wallet balance via commitTransition when provided", () => {
    let state: UnifiedFinanceData = {
      ...INITIAL_UNIFIED_DATA,
      wallets: { main: 100, savings: 50 },
    };

    const commitTransition = vi.fn((transition) => {
      const res = transition(state);
      if (res.ok) state = res.data;
      return res;
    });

    const { result } = renderHook(() =>
      useWalletActions({ commitTransition })
    );

    act(() => {
      result.current.commitWallet("main", 250.75);
    });

    expect(commitTransition).toHaveBeenCalledTimes(1);
    expect(state.wallets.main).toBe(250.75);
  });

  it("increments wallet balance using exact arithmetic via commitTransition", () => {
    let state: UnifiedFinanceData = {
      ...INITIAL_UNIFIED_DATA,
      wallets: { main: 100.5, savings: 50 },
    };

    const commitTransition = vi.fn((transition) => {
      const res = transition(state);
      if (res.ok) state = res.data;
      return res;
    });

    const { result } = renderHook(() =>
      useWalletActions({ commitTransition })
    );

    act(() => {
      result.current.incrementWallet("main", 500);
    });

    expect(commitTransition).toHaveBeenCalledTimes(1);
    expect(state.wallets.main).toBe(600.5);
  });

  it("falls back to setGlobalData if commitTransition is not provided", () => {
    const setGlobalData = vi.fn();
    const { result } = renderHook(() =>
      useWalletActions({ setGlobalData })
    );

    act(() => {
      result.current.commitWallet("savings", 300);
    });

    expect(setGlobalData).toHaveBeenCalledTimes(1);
    const updater = setGlobalData.mock.calls[0][0];
    const next = updater({
      ...INITIAL_UNIFIED_DATA,
      wallets: { main: 100, savings: 50 },
    });
    expect(next.wallets.savings).toBe(300);
  });
});
