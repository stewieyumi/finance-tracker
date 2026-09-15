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

    const inputAmount = parseFloat(String(editForm.amount ?? ""));

    if (!Number.isFinite(inputAmount) || inputAmount <= 0) {
      showToast("Amount must be greater than 0");
      return;
    }

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
          bills: prev.library.bills.map(item => {
            if (item.id !== editingId) return item;

            const updatedBill: Bill = {
              id: item.id,
              name: String(editForm.name ?? item.name).trim(),
              amount: inputAmount,
              dueDay: String(editForm.dueDay ?? item.dueDay),
              type: editForm.type ?? item.type,
              wallet: editForm.wallet ?? item.wallet,
              startMonth: String(editForm.startMonth ?? item.startMonth ?? ""),
              endMonth: String(editForm.endMonth ?? item.endMonth ?? "")
            };

            return updatedBill;
          })
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