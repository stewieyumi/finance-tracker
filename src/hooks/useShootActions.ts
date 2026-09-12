import {
  Shoot,
  ShootCategory,
  ShootStatus,
  UnifiedFinanceData
} from "../types/finance";

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
        id:
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        title: shoot.title,
        date: shoot.date,
        category: shoot.category || "Solo Shoot",
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
        setGlobalData(prev => ({
      ...prev,
      library: {
        ...prev.library,
        shoots: prev.library.shoots.map(item =>
          item.id === id
            ? { ...item, completed: !item.completed }
            : item
        )
      },
      updatedAt: Date.now()
    }));
  };

  const deleteShoot = (id: string) => {
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
    deleteShoot
  };
}