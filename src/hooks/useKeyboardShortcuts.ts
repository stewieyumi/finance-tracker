import { useEffect } from "react";
import { TabType } from "../components/BottomNav";

interface KeyboardShortcutsOptions {
  onToggleDatePicker: () => void;
  onToggleDebug: () => void;
  onToggleYearly: () => void;
  onToggleAnalytics: () => void;
  onManualSync: () => void;
  onPullData: () => void;
  onTogglePrivacy: () => void;
  onCloseAll: () => void;
  onSelectTab?: (tab: TabType) => void;
  onSelectOpsTab?: (subTab: "bills" | "inflows" | "gigs") => void;
  activeTab?: TabType;
}

export function useKeyboardShortcuts({
  onToggleDatePicker,
  onToggleDebug,
  onToggleYearly,
  onToggleAnalytics,
  onManualSync,
  onPullData,
  onTogglePrivacy,
  onCloseAll,
  onSelectTab,
  onSelectOpsTab,
  activeTab,
}: KeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Escape always dismisses modals, even if focused on an input
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseAll();
        return;
      }

      // Do not trigger general single-key shortcuts while typing in forms
      if (isInput) return;

      const key = e.key.toLowerCase();
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // Tab Navigation (1 - 5 or Cmd+1 - Cmd+5)
      if (["1", "2", "3", "4", "5"].includes(key)) {
        e.preventDefault();
        const tabMap: Record<string, TabType> = {
          "1": "home",
          "2": "operations",
          "3": "wallets",
          "4": "expenses",
          "5": "account",
        };
        onSelectTab?.(tabMap[key]);
        return;
      }

      // Operations Sub-Tabs (B, I, G)
      if (activeTab === "operations" && !isCmdOrCtrl) {
        if (key === "b") { e.preventDefault(); onSelectOpsTab?.("bills"); return; }
        if (key === "i") { e.preventDefault(); onSelectOpsTab?.("inflows"); return; }
        if (key === "g") { e.preventDefault(); onSelectOpsTab?.("gigs"); return; }
      }

      // Modal & Analytics Shortcuts
      if (isCmdOrCtrl && key === "k") {
        e.preventDefault();
        onToggleDatePicker();
      } else if (isCmdOrCtrl && key === "d") {
        e.preventDefault();
        onToggleDebug();
      } else if (!isCmdOrCtrl && key === "y") {
        e.preventDefault();
        onToggleYearly();
      } else if (!isCmdOrCtrl && key === "a") {
        e.preventDefault();
        onToggleAnalytics();
      } else if (!isCmdOrCtrl && key === "s") {
        e.preventDefault();
        onManualSync();
      } else if (!isCmdOrCtrl && key === "r") {
        e.preventDefault();
        onPullData();
      } else if (!isCmdOrCtrl && key === "p") {
        e.preventDefault();
        onTogglePrivacy();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onToggleDatePicker,
    onToggleDebug,
    onToggleYearly,
    onToggleAnalytics,
    onManualSync,
    onPullData,
    onTogglePrivacy,
    onCloseAll,
    onSelectTab,
    onSelectOpsTab,
    activeTab,
  ]);
}
