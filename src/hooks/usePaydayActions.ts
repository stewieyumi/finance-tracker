import { useCallback } from "react";
import { roundMoney } from "../utils/currency";
import { generateId } from "../utils/idHelpers";
import { hasPaydayExecutionOnDate } from "../utils/financeHelpers";
import { PaydayExecution, UnifiedFinanceData } from "../types/finance";

interface BillPaydayAllocation {
  id: string;
  month: string;
  wallet: string;
  amount: number;
}

interface UsePaydayActionsProps {
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  paydayAllocations: Record<string, number>;
  billPaydayAllocations: BillPaydayAllocation[];
  remainingBuffer: number;
  isViewingCurrentMonth: boolean;
  selectedMonth: string;
  showToast: (msg: string) => void;
  paydaySplitInProgressRef: React.MutableRefObject<boolean>;
}

export function usePaydayActions({
  globalData,
  setGlobalData,
  paydayAllocations,
  billPaydayAllocations,
  remainingBuffer,
  isViewingCurrentMonth,
  selectedMonth,
  showToast,
  paydaySplitInProgressRef,
}: UsePaydayActionsProps) {
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

      setGlobalData(prev => {
        const executions = prev.paydaySplitExecutions || [];

        if (hasPaydayExecutionOnDate(executions, executionKey)) {
          return prev;
        }

        const updatedLogs = { ...prev.logs };

        billPaydayAllocations.forEach(alloc => {
          const monthLog = updatedLogs[alloc.month] || {};
          const existingContributions =
            monthLog.billPaydayContributions || {};

          updatedLogs[alloc.month] = {
            ...monthLog,
            billPaydayContributions: {
              ...existingContributions,
              [alloc.id]:
                (existingContributions[alloc.id] || 0) + alloc.amount,
            },
          };
        });

        const newWallets = { ...prev.wallets };

        Object.entries(paydayAllocations).forEach(([walletKey, amount]) => {
          newWallets[walletKey] = roundMoney(
            (parseFloat(String(newWallets[walletKey])) || 0) + amount
          );
        });

        return {
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
        };
      });

      showToast("✨ Payday split automatically distributed to wallets!");
    } finally {
      paydaySplitInProgressRef.current = false;
    }
  }, [
    globalData,
    setGlobalData,
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

      setGlobalData(prev => {
        const executions = prev.paydaySplitExecutions || [];
        const target = executions.find(
          ex => typeof ex !== "string" && ex.id === executionId
        ) as PaydayExecution | undefined;

        if (!target) {
          showToast("Cannot undo a legacy execution.");
          return prev;
        }

        const updatedLogs = { ...prev.logs };

        target.billContributions.forEach(alloc => {
          const monthLog = updatedLogs[alloc.month] || {};
          const existingContributions =
            monthLog.billPaydayContributions || {};

          updatedLogs[alloc.month] = {
            ...monthLog,
            billPaydayContributions: {
              ...existingContributions,
              [alloc.id]: Math.max(
                0,
                (existingContributions[alloc.id] || 0) - alloc.amount
              ),
            },
          };
        });

        const nextWallets = { ...prev.wallets };

        Object.entries(target.allocations).forEach(([walletKey, amount]) => {
          if (nextWallets[walletKey] !== undefined) {
            nextWallets[walletKey] = roundMoney(
              nextWallets[walletKey] - amount
            );
          }
        });

        return {
          ...prev,
          wallets: nextWallets,
          logs: updatedLogs,
          paydaySplitExecutions: executions.filter(
            ex => typeof ex === "string" || ex.id !== executionId
          ),
          updatedAt: Date.now(),
        };
      });

      showToast("Payday distribution reversed.");
    },
    [setGlobalData, showToast]
  );

  return {
    handleExecutePaydaySplit,
    handleUndoPaydaySplit,
  };
}
