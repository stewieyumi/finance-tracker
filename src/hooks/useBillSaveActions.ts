import {
  Bill,
  EditFormData,
  UnifiedFinanceData
} from "../types/finance";
import { isValidMonthRange } from "../utils/dateHelpers";

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
  ): boolean => {
    if (!editingId) return false;

    const inputAmount = parseFloat(String(editForm.amount ?? ""));

    if (!Number.isFinite(inputAmount) || inputAmount <= 0) {
      showToast("Amount must be greater than 0");
      return false;
    }

    if (
      scope === "default" &&
      editForm.type === "Loan / Installment" &&
      !isValidMonthRange(
        String(editForm.startMonth || ""),
        String(editForm.endMonth || "")
      )
    ) {
      showToast("Loan start month must be on or before the end month");
      return false;
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
    return true;
  };

  return {
    saveBillEdit
  };
}