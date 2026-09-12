import {
  Bill,
  UnifiedFinanceData
} from "../types/finance";

interface UseBillEditActionsParams {
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  selectedMonth: string;
  showToast: (message: string) => void;
}

export function useBillEditActions({
  setGlobalData,
  selectedMonth,
  showToast
}: UseBillEditActionsParams) {
  const resetMonthOverride = (billId: string) => {
    setGlobalData(prev => {
      const monthLog = prev.logs[selectedMonth];

      if (!monthLog?.billOverrides?.[billId]) {
        return prev;
      }

      const nextOverrides = { ...monthLog.billOverrides };
      delete nextOverrides[billId];

      return {
        ...prev,
        logs: {
          ...prev.logs,
          [selectedMonth]: {
            ...monthLog,
            billOverrides: nextOverrides
          }
        },
        updatedAt: Date.now()
      };
    });

    showToast("Reset to default library balance");
  };

  return {
    resetMonthOverride
  };
}