import {
  EditFormData,
  Shoot,
  UnifiedFinanceData
} from "../types/finance";

interface UseShootSaveActionsParams {
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  editingId: string | null;
  editForm: EditFormData;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  showToast: (message: string) => void;
}

export function useShootSaveActions({
  setGlobalData,
  editingId,
  editForm,
  setEditingId,
  showToast
}: UseShootSaveActionsParams) {
  const saveShootEdit = () => {
    if (!editingId) return;

    setGlobalData(prev => ({
      ...prev,
      library: {
        ...prev.library,
        shoots: prev.library.shoots.map(item =>
          item.id === editingId
            ? ({
                ...item,
                ...editForm,
                title: editForm.title || item.title
              } as Shoot)
            : item
        )
      },
      updatedAt: Date.now()
    }));

    setEditingId(null);
    showToast("Default saved in Library");
  };

  return {
    saveShootEdit
  };
}