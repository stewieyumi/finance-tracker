import { renderHook, act } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useShootActions } from "./useShootActions";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import type { UnifiedFinanceData } from "../types/finance";

it("keeps Pencil and Confirmed unfinished, clears completion when cancelled, and preserves financial data", () => {
  let data: UnifiedFinanceData = {
    ...INITIAL_UNIFIED_DATA,
    library: { ...INITIAL_UNIFIED_DATA.library, shoots: [{ id: "sample", title: "Sample", status: "Pencil", completed: false }] },
  };
  const walletSnapshot = data.wallets;
  const logSnapshot = data.logs;
  const setter: React.Dispatch<React.SetStateAction<UnifiedFinanceData>> = action => { data = typeof action === "function" ? action(data) : action; };
  const { result } = renderHook(() => useShootActions({ setGlobalData: setter, showToast: vi.fn() }));
  act(() => result.current.changeShootStatus("sample", "Confirmed"));
  expect(data.library.shoots[0]).toMatchObject({ status: "Confirmed", completed: false });
  act(() => result.current.toggleShootCompletion("sample"));
  expect(data.library.shoots[0].completed).toBe(true);
  act(() => result.current.changeShootStatus("sample", "Cancelled"));
  expect(data.library.shoots[0]).toMatchObject({ status: "Cancelled", completed: false });
  const cancelled = data;
  act(() => result.current.toggleShootCompletion("sample"));
  expect(data).toBe(cancelled);
  act(() => result.current.changeShootStatus("sample", "Pencil"));
  expect(data.library.shoots[0]).toMatchObject({ status: "Pencil", completed: false });
  expect(data.wallets).toBe(walletSnapshot);
  expect(data.logs).toBe(logSnapshot);
});
