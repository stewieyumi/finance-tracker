import { useEffect } from "react";

interface ShortcutHandlers {
  onToggleDatePicker: () => void;
  onToggleDebug: () => void;
  onToggleYearly: () => void;
  onToggleAnalytics: () => void;
  onManualSync: () => void;
  onPullData: () => void;
  onCloseAll: () => void;
  onTogglePrivacy?: () => void;
}

export function useKeyboardShortcuts({
  onToggleDatePicker,
  onToggleDebug,
  onToggleYearly,
  onToggleAnalytics,
  onManualSync,
  onPullData,
  onCloseAll,
  onTogglePrivacy
}: ShortcutHandlers) {
  useEffect(() => {
const handleGlobalKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        const isTyping =
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable);

        if (e.key === "Escape") {
          onCloseAll();
          return;
        }

        if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
          e.preventDefault();
          onToggleDatePicker();
          return;
        }

        if ((e.metaKey || e.ctrlKey) && (e.key === "d" || e.key === "D")) {
          e.preventDefault();
          onToggleDebug();
          return;
        }

        if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return;

        if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          onManualSync();
          return;
        }

        if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          onPullData();
          return;
        }

        if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          onToggleYearly();
          return;
        }

        if (e.key === "a" || e.key === "A") {
          e.preventDefault();
          onToggleAnalytics();
          return;
        }

        if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          onTogglePrivacy?.();
          return;
        }
      };
      
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    onToggleDatePicker,
    onToggleDebug,
    onToggleYearly,
    onToggleAnalytics,
    onManualSync,
    onPullData,
    onCloseAll,
    onTogglePrivacy
  ]);
}