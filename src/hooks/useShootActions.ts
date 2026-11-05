import {
  Shoot,
  ShootCategory,
  ShootStatus,
  UnifiedFinanceData
} from "../types/finance";

import { GIG_BOOKING_STATUSES } from "../utils/gigStatus";
import { generateId } from "../utils/idHelpers";

interface UseShootActionsParams {
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  showToast: (message: string) => void;
}

export function useShootActions({
  setGlobalData,
  showToast
}: UseShootActionsParams) {
  const addShoot = (shoot: {
    title: string;
    date: string;
    category: ShootCategory;
    status: ShootStatus;
  }) => {
    setGlobalData(prev => {
      const newShoot: Shoot = {
        id: generateId("s"),
        title: shoot.title,
        date: shoot.date,
        category: shoot.category || "Other",
        status: shoot.status,
        completed: false
      };

      return {
        ...prev,
        library: {
          ...prev.library,
          shoots: [...prev.library.shoots, newShoot]
        },
        updatedAt: Date.now()
      };
    });

    showToast(`Added ${shoot.title}`);
  };

const toggleShootCompletion = (id: string) => {
  setGlobalData(prev => {
    const targetShoot = prev.library.shoots.find(s => s.id === id);
    if (!targetShoot || targetShoot.status === "Cancelled") {
      return prev; // Bail out completely to avoid unnecessary cloud pushes
    }

    return {
      ...prev,
      library: {
        ...prev.library,
        shoots: prev.library.shoots.map(item => {
          if (item.id !== id) return item;
          return {
            ...item,
            completed: !item.completed
          };
        })
      },
      updatedAt: Date.now()
    };
  });
};

const changeShootStatus = (id: string, status: ShootStatus) => {
  if (!GIG_BOOKING_STATUSES.includes(status)) return;
  setGlobalData(prev => {
    const target = prev.library.shoots.find(shoot => shoot.id === id);
    if (!target || target.status === status) return prev;
    return {
      ...prev,
      library: {
        ...prev.library,
        shoots: prev.library.shoots.map(shoot => shoot.id === id
          ? { ...shoot, status, completed: status === "Cancelled" ? false : shoot.completed }
          : shoot),
      },
      updatedAt: Date.now(),
    };
  });
};

const deleteShoot = (id: string) => {
  if (!confirm("Delete this shoot from your library?")) return;

  setGlobalData(prev => ({
    ...prev,
    library: {
      ...prev.library,
      shoots: prev.library.shoots.filter(
        shoot => shoot.id !== id
      )
    },
    updatedAt: Date.now()
  }));

  showToast("Shoot deleted");
};

  return {
    addShoot,
    toggleShootCompletion,
    changeShootStatus,
    deleteShoot
  };
}