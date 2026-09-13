import {
  Receivable,
  ReceivableCategory,
  ReceivableFrequency,
  ReceivableViewModel,
  UnifiedFinanceData
} from "../types/finance";

import { generateId } from "../utils/idHelpers";

interface UseReceivableActionsParams {
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  selectedMonth: string;
  showToast: (message: string) => void;
}

export function useReceivableActions({
  setGlobalData,
  selectedMonth,
  showToast
}: UseReceivableActionsParams) {
  const addReceivable = (receivable: {
    name: string;
    amount: number;
    category: ReceivableCategory;
    frequency: ReceivableFrequency;
    biMonthlyDays?: string;
    monthlyDay?: string;
    date?: string;
  }) => {
    setGlobalData(prev => {
      const newReceivable: Receivable = {
        id: generateId("r"),
        name: receivable.name.trim(),
        amount: receivable.amount,
        category: receivable.category || "Shoot",
        frequency: receivable.frequency,
        biMonthlyDays:
          receivable.frequency === "Bi-monthly"
            ? receivable.biMonthlyDays || ""
            : "",
        monthlyDay:
          receivable.frequency === "Monthly"
            ? receivable.monthlyDay || ""
            : "",
        date:
          receivable.frequency === "By Date"
            ? receivable.date || ""
            : "",
        startMonth:
          receivable.frequency === "By Date"
            ? ""
            : selectedMonth
      };

      return {
        ...prev,
        library: {
          ...prev.library,
          receivables: [
            ...prev.library.receivables,
            newReceivable
          ]
        },
        updatedAt: Date.now()
      };
    });

    showToast(`Added ${receivable.name}`);
  };

  const toggleReceivableStatus = (
    receivable: ReceivableViewModel
  ) => {
    const targetMonth =
      receivable.targetMonthForDue || selectedMonth;

    const receivableAmount = Math.max(
      0,
      parseFloat(String(receivable.amount)) || 0
    );

    if (receivableAmount <= 0) {
      showToast("Receivable amount must be greater than 0");
      return;
    }

    setGlobalData(prev => {
      const monthLog = prev.logs?.[targetMonth] || {
        billsPaid: [],
        recsCollected: {}
      };

      const currentRecord =
        monthLog.recsCollected?.[receivable.id] || {
          amountReceived: 0,
          collected: false
        };

      const currentAmount = Math.max(
        0,
        parseFloat(String(currentRecord.amountReceived)) || 0
      );

      const isCurrentlyCompleted =
        currentAmount >= receivableAmount;

      const newAmountReceived =
        isCurrentlyCompleted || currentAmount > 0
          ? 0
          : receivableAmount;

      const newCollected =
        newAmountReceived >= receivableAmount;

      return {
        ...prev,
        logs: {
          ...prev.logs,
          [targetMonth]: {
            ...monthLog,
            recsCollected: {
              ...(monthLog.recsCollected || {}),
              [receivable.id]: {
                amountReceived: newAmountReceived,
                collected: newCollected
              }
            }
          }
        },
        updatedAt: Date.now()
      };
    });
  };

  const addPayment = (
    receivable: ReceivableViewModel,
    amount: number
  ) => {
    if (!Number.isFinite(amount) || amount <= 0) return;

    const targetMonth =
      receivable.targetMonthForDue || selectedMonth;

    const receivableAmount = Math.max(
      0,
      parseFloat(String(receivable.amount)) || 0
    );

    if (receivableAmount <= 0) {
      showToast("Receivable amount must be greater than 0");
      return;
    }

    setGlobalData(prev => {
      const monthLog = prev.logs?.[targetMonth] || {
        billsPaid: [],
        recsCollected: {}
      };

      const currentRecord =
        monthLog.recsCollected?.[receivable.id] || {
          amountReceived: 0,
          collected: false
        };

      const currentAmount = Math.max(
        0,
        parseFloat(String(currentRecord.amountReceived)) || 0
      );

      const newAmount = Math.min(
        currentAmount + amount,
        receivableAmount
      );

      return {
        ...prev,
        logs: {
          ...prev.logs,
          [targetMonth]: {
            ...monthLog,
            recsCollected: {
              ...(monthLog.recsCollected || {}),
              [receivable.id]: {
                amountReceived: newAmount,
                collected: newAmount >= receivableAmount
              }
            }
          }
        },
        updatedAt: Date.now()
      };
    });

    showToast(`Payment added to ${receivable.name}`);
  };

  const deleteReceivable = (id: string) => {
    if (!confirm("Delete this receivable from your library?")) {
      return;
    }

    setGlobalData(prev => ({
      ...prev,
      library: {
        ...prev.library,
        receivables: prev.library.receivables.filter(
          receivable => receivable.id !== id
        )
      },
      updatedAt: Date.now()
    }));

    showToast("Receivable deleted");
  };

  return {
    addReceivable,
    toggleReceivableStatus,
    addPayment,
    deleteReceivable
  };
}