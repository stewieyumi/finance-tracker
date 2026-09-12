import {
  Receivable,
  ReceivableCategory,
  ReceivableFrequency,
  UnifiedFinanceData
} from "../types/finance";

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
        id:
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `r_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: receivable.name,
        amount: receivable.amount,
        category: receivable.category || "Shoot",
        frequency: receivable.frequency,
        biMonthlyDays:
          receivable.frequency === "Bi-monthly"
            ? receivable.biMonthlyDays
            : "",
        monthlyDay:
          receivable.frequency === "Monthly"
            ? receivable.monthlyDay
            : "",
        date:
          receivable.frequency === "By Date"
            ? receivable.date
            : "",
        startMonth:
          receivable.frequency === "By Date"
            ? ""
            : selectedMonth,
        amountReceived: 0,
        collected: false
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

  const toggleReceivableStatus = (receivable: Receivable) => {
    setGlobalData(prev => {
      const monthLog = prev.logs?.[selectedMonth] || {
        billsPaid: [],
        recsCollected: {}
      };

      const currentRecord =
        monthLog.recsCollected?.[receivable.id] || {
          amountReceived: 0,
          collected: false
        };

      return {
        ...prev,
        logs: {
          ...prev.logs,
          [selectedMonth]: {
            ...monthLog,
            recsCollected: {
              ...monthLog.recsCollected,
              [receivable.id]: {
                ...currentRecord,
                collected: !currentRecord.collected
              }
            }
          }
        },
        updatedAt: Date.now()
      };
    });
  };

  const addPayment = (
    receivable: Receivable,
    amount: number
  ) => {
    if (!Number.isFinite(amount) || amount <= 0) return;

    setGlobalData(prev => {
      const monthLog = prev.logs?.[selectedMonth] || {
        billsPaid: [],
        recsCollected: {}
      };

      const currentRecord =
        monthLog.recsCollected?.[receivable.id] || {
          amountReceived: 0,
          collected: false
        };

      const newAmount =
        currentRecord.amountReceived + amount;

      return {
        ...prev,
        logs: {
          ...prev.logs,
          [selectedMonth]: {
            ...monthLog,
            recsCollected: {
              ...monthLog.recsCollected,
              [receivable.id]: {
                amountReceived: newAmount,
                collected:
                  newAmount >= receivable.amount
              }
            }
          }
        },
        updatedAt: Date.now()
      };
    });

    showToast(`Payment added to ${receivable.name}`);
  };

  return {
    addReceivable,
    toggleReceivableStatus,
    addPayment
  };
}