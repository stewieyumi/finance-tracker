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

    const inputAmount =
      parseFloat(String(editForm.amount || 0)) || 0;

    setGlobalData(prev => ({
      ...prev,
      library: {
        ...prev.library,
        receivables: prev.library.receivables.map(item =>
          item.id === editingId
            ? ({
                ...item,
                ...editForm,
                amount: inputAmount
              } as Receivable)
            : item
        )
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