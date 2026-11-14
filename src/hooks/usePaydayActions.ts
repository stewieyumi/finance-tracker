import { useCallback } from "react";
import { generateId } from "../utils/idHelpers";
import {
  hasPaydayExecutionOnDate,
  parseWalletBalance,
  validateActiveWalletAssignment
} from "../utils/financeHelpers";
import {
  PaydayExecution,
  UnifiedFinanceData,
  FinanceTransitionCommitter
} from "../types/finance";

interface BillPaydayAllocation {
  id: string;
  month: string;
  wallet: string;
  amount: number;
}

interface UsePaydayActionsProps {
  globalData: UnifiedFinanceData;
  setGlobalData?: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  commitPaydayTransition?: FinanceTransitionCommitter;
  paydayAllocations: Record<string, number>;
  billPaydayAllocations: BillPaydayAllocation[];
  remainingBuffer: number;
  isViewingCurrentMonth: boolean;
  selectedMonth: string;
  showToast: (msg: string) => void;
  paydaySplitInProgressRef: React.MutableRefObject<boolean>;
}

export type PaydayTransitionResult =
  | { ok: true; data: UnifiedFinanceData }
  | { ok: false; error: string; data: UnifiedFinanceData };

const allocationCents = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && Math.abs(value * 100 - cents) <= 1e-6 ? cents : null;
};

export function applyPaydaySplit(
  prev: UnifiedFinanceData,
  paydayAllocations: Record<string, number>,
  billPaydayAllocations: BillPaydayAllocation[],
  executionKey: string
): PaydayTransitionResult {
  const executions = prev.paydaySplitExecutions || [];
  if (hasPaydayExecutionOnDate(executions, executionKey)) {
    return { ok: false, error: "⚠️ Payday split already executed today.", data: prev };
  }

  const newWallets = { ...prev.wallets };
  for (const [walletKey, amount] of Object.entries(paydayAllocations)) {
    const cents = allocationCents(amount);
    if (cents === null) {
      return { ok: false, error: "Payday distribution has an invalid allocation amount.", data: prev };
    }
    // Zero entries are display placeholders, not financial mutations or repairs.
    if (cents === 0) continue;
    const validation = validateActiveWalletAssignment(walletKey, prev.settings, prev.wallets);
    if (!validation.ok) {
      return { ok: false, error: `Payday distribution failed: ${validation.message}`, data: prev };
    }
    const balance = parseWalletBalance(prev.wallets?.[walletKey]);
    if (!balance.isValid) {
      return { ok: false, error: "Payday destination has an invalid balance.", data: prev };
    }
    const finalCents = Math.round(balance.balance * 100) + cents;
    if (!Number.isSafeInteger(finalCents)) {
      return { ok: false, error: "Payday destination balance would be out of range.", data: prev };
    }
    newWallets[walletKey] = finalCents / 100;
  }

  for (const alloc of billPaydayAllocations) {
    const cents = allocationCents(alloc.amount);
    if (cents === null) {
      return { ok: false, error: "Bill contribution has an invalid allocation amount.", data: prev };
    }
    if (cents > 0) {
      const validation = validateActiveWalletAssignment(alloc.wallet, prev.settings, prev.wallets);
      if (!validation.ok) {
        return { ok: false, error: `Bill contribution failed: ${validation.message}`, data: prev };
      }
    }
  }

  const updatedLogs = { ...prev.logs };

  billPaydayAllocations.forEach(alloc => {
    if (alloc.amount === 0) return;
    const monthLog = updatedLogs[alloc.month] || {};
    const existingContributions = monthLog.billPaydayContributions || {};

    updatedLogs[alloc.month] = {
      ...monthLog,
      billPaydayContributions: {
        ...existingContributions,
        [alloc.id]: (existingContributions[alloc.id] || 0) + alloc.amount,
      },
    };
  });

  return {
    ok: true,
    data: {
      ...prev,
      wallets: newWallets,
      logs: updatedLogs,
      paydaySplitExecutions: [
        ...executions,
        {
          id: generateId("pd"),
          date: executionKey,
          timestamp: Date.now(),
          allocations: paydayAllocations,
          billContributions: billPaydayAllocations,
        },
      ],
      updatedAt: Date.now(),
    },
  };
}

export function applyUndoPaydaySplit(
  prev: UnifiedFinanceData,
  executionId: string
): PaydayTransitionResult {
  const executions = prev.paydaySplitExecutions || [];
  const matches = executions.filter(ex => typeof ex !== "string" && ex?.id === executionId);
  const target = matches[0] as PaydayExecution | undefined;
  if (!target) {
    return { ok: false, error: "Cannot undo a legacy execution.", data: prev };
  }
  if (matches.length !== 1) {
    return { ok: false, error: "Cannot undo a duplicate execution.", data: prev };
  }
  const invalidExecution = (): PaydayTransitionResult => ({
    ok: false, error: "Cannot reverse payday: the saved execution is invalid. Repair it first.", data: prev,
  });
  if (!target.allocations || typeof target.allocations !== "object" || Array.isArray(target.allocations) ||
      !Array.isArray(target.billContributions)) return invalidExecution();

  // Build every reversal in local copies. Invalid saved provenance must remain
  // intact for repair, with no partial wallet/log changes or execution deletion.
  const nextWallets = { ...prev.wallets };
  for (const [walletKey, amount] of Object.entries(target.allocations)) {
    const cents = allocationCents(amount);
    if (cents === null) return invalidExecution();
    if (cents === 0) continue;
    const parsed = parseWalletBalance(prev.wallets[walletKey]);
    if (!parsed.isValid) {
      return { ok: false, error: `Cannot reverse payday: account "${walletKey}" has an invalid balance.`, data: prev };
    }
    const currentCents = Math.round(parsed.balance * 100);
    if (currentCents < cents) {
      return { ok: false, error: `Cannot reverse payday: insufficient balance in account "${walletKey}".`, data: prev };
    }
    const finalCents = currentCents - cents;
    if (!Number.isSafeInteger(finalCents)) return invalidExecution();
    nextWallets[walletKey] = finalCents / 100;
  }

  const updatedLogs = { ...prev.logs };
  for (const alloc of target.billContributions) {
    if (!alloc || typeof alloc.id !== "string" || !alloc.id.trim() ||
        typeof alloc.month !== "string" || !alloc.month.trim()) return invalidExecution();
    const cents = allocationCents(alloc.amount);
    if (cents === null) return invalidExecution();
    if (cents === 0) continue;
    const monthLog = updatedLogs[alloc.month] || {};
    const contributions = monthLog.billPaydayContributions || {};
    const current = contributions[alloc.id];
    const currentCents = allocationCents(current === undefined ? 0 : current);
    if (currentCents === null || currentCents < cents) return invalidExecution();
    updatedLogs[alloc.month] = {
      ...monthLog,
      billPaydayContributions: { ...contributions, [alloc.id]: (currentCents - cents) / 100 },
    };
  }

  return {
    ok: true,
    data: {
      ...prev,
      wallets: nextWallets,
      logs: updatedLogs,
      paydaySplitExecutions: executions.filter(
        ex => typeof ex === "string" || ex.id !== executionId
      ),
      updatedAt: Date.now(),
    },
  };
}

export function usePaydayActions({
  globalData,
  setGlobalData,
  commitPaydayTransition,
  paydayAllocations,
  billPaydayAllocations,
  remainingBuffer,
  isViewingCurrentMonth,
  selectedMonth,
  showToast,
  paydaySplitInProgressRef,
}: UsePaydayActionsProps) {
  const executeTransition = <T extends { ok: boolean; data: UnifiedFinanceData }>(
    transition: (prev: UnifiedFinanceData) => T
  ): T => {
    if (commitPaydayTransition) {
      return commitPaydayTransition(transition);
    }
    if (setGlobalData) {
      let result: T | undefined;
      setGlobalData(prev => {
        result = transition(prev);
        return result.ok ? result.data : prev;
      });
      if (result) return result;
      return transition(globalData);
    }
    return { ok: false, error: "No state updater or transition committer provided.", data: globalData } as unknown as T;
  };

  const handleExecutePaydaySplit = useCallback(() => {
    if (paydaySplitInProgressRef.current) return;

    if (!isViewingCurrentMonth) {
      showToast(
        `⚠️ You're viewing ${selectedMonth}. Switch to the current month before distributing.`
      );
      return;
    }

    if (remainingBuffer < 0) {
      showToast("⚠️ Payday allocation exceeds the configured payout.");
      return;
    }

    const now = new Date();
    const executionKey =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    if (hasPaydayExecutionOnDate(globalData.paydaySplitExecutions, executionKey)) {
      showToast("⚠️ Payday split already executed today.");
      return;
    }

    paydaySplitInProgressRef.current = true;

    try {
      const totalDistribution = Object.values(paydayAllocations).reduce(
        (a, b) => a + b,
        0
      );

      const allocList = Object.entries(paydayAllocations)
        .filter(([_, amt]) => amt > 0)
        .map(
          ([key, amt]) =>
            `${globalData?.settings?.walletLabels?.[key] || key}: ₱${amt.toLocaleString(
              "en-US",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }
            )}`
        )
        .join("\n");

      const confirmed = confirm(
        `Distribute ₱${totalDistribution.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} into your wallets?\n\n${allocList}`
      );

      if (!confirmed) return;

      const outcome = executeTransition(prev =>
        applyPaydaySplit(prev, paydayAllocations, billPaydayAllocations, executionKey)
      );

      if (!outcome.ok) {
        showToast(outcome.error);
        return;
      }

      showToast("✨ Payday split automatically distributed to wallets!");
    } finally {
      paydaySplitInProgressRef.current = false;
    }
  }, [
    globalData,
    setGlobalData,
    commitPaydayTransition,
    paydayAllocations,
    billPaydayAllocations,
    remainingBuffer,
    isViewingCurrentMonth,
    selectedMonth,
    showToast,
    paydaySplitInProgressRef,
  ]);

  const handleUndoPaydaySplit = useCallback(
    (executionId: string) => {
      if (
        !confirm(
          "Reverse this payday distribution? Funds will be subtracted from wallets and bill contributions reset."
        )
      )
        return;

      const outcome = executeTransition(prev =>
        applyUndoPaydaySplit(prev, executionId)
      );

      if (!outcome.ok) {
        showToast(outcome.error);
        return;
      }

      showToast("Payday distribution reversed.");
    },
    [globalData, setGlobalData, commitPaydayTransition, showToast]
  );

  return {
    handleExecutePaydaySplit,
    handleUndoPaydaySplit,
  };
}
