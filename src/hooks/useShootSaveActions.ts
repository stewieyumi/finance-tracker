import {
  EditFormData,
  Shoot,
  ShootCategory,
  ShootStatus,
  UnifiedFinanceData
} from "../types/finance";

interface UseShootSaveActionsParams {
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  editingId: string | null;
  editForm: EditFormData;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  showToast: (message: string) => void;
}

const SHOOT_CATEGORIES: ShootCategory[] = [
  "Solo Shoot",
  "Assistant",
  "Video Edit",
  "Event",
  "Commercial",
  "Other"
];

const SHOOT_STATUSES: ShootStatus[] = [
  "Pencil",
  "Confirmed",
  "Moved",
  "Cancelled"
];

export function useShootSaveActions({
  setGlobalData,
  editingId,
  editForm,
  setEditingId,
  showToast
}: UseShootSaveActionsParams) {
  const saveShootEdit = () => {
    if (!editingId) return;

    const title = String(editForm.title ?? "").trim();

    if (!title) {
      showToast("Shoot title is required");
      return;
    }

    const category = SHOOT_CATEGORIES.includes(
      editForm.category as ShootCategory
    )
      ? (editForm.category as ShootCategory)
      : null;

    const status = SHOOT_STATUSES.includes(
      editForm.status as ShootStatus
    )
      ? (editForm.status as ShootStatus)
      : null;

    setGlobalData(prev => ({
      ...prev,
      library: {
        ...prev.library,
        shoots: prev.library.shoots.map(item => {
          if (item.id !== editingId) return item;

          const newStatus = status ?? item.status;
          const updatedShoot: Shoot = {
            id: item.id,
            title,
            date: String(editForm.date ?? item.date ?? ""),
            category: category ?? item.category,
            status: newStatus,
            completed: newStatus === "Cancelled" ? false : item.completed
          };

          return updatedShoot;
        })
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
