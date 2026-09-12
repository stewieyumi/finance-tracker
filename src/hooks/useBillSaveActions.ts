import {
  Bill,
  EditFormData,
  UnifiedFinanceData
} from "../types/finance";

interface UseBillSaveActionsParams {
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  selectedMonth: string;
  editingId: string | null;
  editForm: EditFormData;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  showToast: (message: string) => void;
}

export function useBillSaveActions({
  setGlobalData,
  selectedMonth,
  editingId,
  editForm,
  setEditingId,
  showToast
}: UseBillSaveActionsParams) {
  const saveBillEdit = (
    scope: "monthOnly" | "default" = "monthOnly"
  ) => {
    if (!editingId) return;

    const inputAmount =
      parseFloat(String(editForm.amount || 0)) || 0;

    if (scope === "monthOnly") {
      setGlobalData(prev => {
        const monthLog = prev.logs[selectedMonth] || {
          billsPaid: [],
          recsCollected: {},
          billOverrides: {}
        };

        return {
          ...prev,
          logs: {
            ...prev.logs,
            [selectedMonth]: {
              ...monthLog,
              billOverrides: {
                ...(monthLog.billOverrides || {}),
                [editingId]: inputAmount
              }
            }
          },
          updatedAt: Date.now()
        };
      });

      showToast(
        `Updated ${editForm.name || "Bill"} for ${selectedMonth} only`
      );
    } else {
      setGlobalData(prev => ({
        ...prev,
        library: {
          ...prev.library,
          bills: prev.library.bills.map(item =>
            item.id === editingId
              ? ({
                  ...item,
                  ...editForm,
                  amount: inputAmount
                } as Bill)
              : item
          )
        },
        updatedAt: Date.now()
      }));

      showToast("Default saved in Library");
    }

    setEditingId(null);
  };

  return {
    saveBillEdit
  };
}