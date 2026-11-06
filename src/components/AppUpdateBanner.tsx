import React from "react";
import { RefreshCw } from "lucide-react";

interface AppUpdateBannerProps {
  isEditing: boolean;
  isSyncing: boolean;
  syncNeedsSignIn: boolean;
  hasActiveConflict: boolean;
  hasInitialSyncCompleted: boolean;
  canReloadSafely: () => boolean;
  onBlocked: (message: string) => void;
}

export function AppUpdateBanner({
  isEditing, isSyncing, syncNeedsSignIn, hasActiveConflict,
  hasInitialSyncCompleted, canReloadSafely, onBlocked,
}: AppUpdateBannerProps) {
  const refresh = () => {
    // Includes child-owned forms (expense, wallet, payday) as well as app dialogs.
    if (isEditing || document.querySelector('form, [aria-modal="true"], dialog[open]')) {
      onBlocked("Finish or cancel your open entry before updating the app.");
      return;
    }
    if (syncNeedsSignIn) {
      onBlocked("Reconnect cloud sync before updating the app.");
      return;
    }
    if (hasActiveConflict) {
      onBlocked("Resolve the sync conflict before updating the app.");
      return;
    }
    if (!hasInitialSyncCompleted || isSyncing || !canReloadSafely()) {
      onBlocked("Wait for your changes to finish syncing before updating the app.");
      return;
    }
    if (window.confirm("Refresh Finance Tracker to install the update?")) {
      window.location.reload();
    }
  };

  return (
    <button type="button" onClick={refresh} className="fixed top-[calc(env(safe-area-inset-top)+12px)] left-1/2 -translate-x-1/2 z-[9999] flex w-max max-w-[calc(100%_-_2rem)] items-center gap-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs px-5 py-2.5 rounded-full shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all cursor-pointer animate-in slide-in-from-top-8 duration-500">
      <RefreshCw size={14} aria-hidden="true" className="shrink-0" />
      <span className="font-semibold tracking-wide">New update available. Tap to refresh.</span>
    </button>
  );
}
