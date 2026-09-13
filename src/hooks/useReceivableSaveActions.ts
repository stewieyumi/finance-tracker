import {
  EditFormData,
  Receivable,
  UnifiedFinanceData
} from "../types/finance";

interface UseReceivableSaveActionsParams {
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  editingId: string | null;
  editForm: EditFormData;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  showToast: (message: string) => void;
}

export function useReceivableSaveActions({
  setGlobalData,
  editingId,
  editForm,
  setEditingId,
  showToast
}: UseReceivableSaveActionsParams) {
  const saveReceivableEdit = () => {
    if (!editingId) return;

    const inputAmount = parseFloat(
      String(editForm.amount ?? "")
    );

    if (!Number.isFinite(inputAmount) || inputAmount <= 0) {
      showToast("Amount must be greater than 0");
      return;
    }

    setGlobalData(prev => ({
      ...prev,
      library: {
        ...prev.library,
        receivables: prev.library.receivables.map(item => {
          if (item.id !== editingId) return item;

          const frequency = editForm.frequency ?? item.frequency;

          const updatedReceivable: Receivable = {
            id: item.id,
            name: String(
              editForm.name ?? item.name
            ).trim(),
            amount: inputAmount,
            category:
              editForm.category === "Salary" ||
              editForm.category === "Edit" ||
              editForm.category === "Shoot" ||
              editForm.category === "Payment" ||
              editForm.category === "Other"
                ? editForm.category
                : item.category,
            frequency,
            biMonthlyDays:
              frequency === "Bi-monthly"
                ? String(
                    editForm.biMonthlyDays ??
                    item.biMonthlyDays ??
                    ""
                  )
                : "",
            monthlyDay:
              frequency === "Monthly"
                ? String(
                    editForm.monthlyDay ??
                    item.monthlyDay ??
                    ""
                  )
                : "",
            date:
              frequency === "By Date"
                ? String(editForm.date ?? item.date ?? "")
                : "",
            startMonth:
              frequency === "By Date"
                ? ""
                : String(
                    editForm.startMonth ??
                    item.startMonth ??
                    ""
                  )
          };

          return updatedReceivable;
        })
      },
      updatedAt: Date.now()
    }));

    setEditingId(null);
    showToast("Default saved in Library");
  };

  return {
    saveReceivableEdit
  };
}