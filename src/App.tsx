import React, { useState, useMemo, useRef, useCallback } from "react";
import { HistoricalLedgerModal } from "./components/HistoricalLedgerModal";
import { GoogleLogin, googleLogout, useGoogleOneTapLogin } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";
import { Calendar, Settings, Cloud, Copy, Download, Upload, AlertTriangle, History, ArrowDownLeft, Receipt, CheckCircle2, BarChart2, Sparkles, RefreshCw, WifiOff, Eye, EyeOff } from "lucide-react";
import { INITIAL_UNIFIED_DATA } from "./constants/initialData";
import { getMonthKey, getAdjacentMonth } from "./utils/dateHelpers";
import { UnifiedFinanceData, WalletState, EditFormData, TransactionHistoryItem, PaydayExecution } from "./types/finance";
import { buildFinancialSummary } from "./utils/summaryHelpers";
import {
  getWalletForBill,
  computeBillPerPaydayAmount,
  computeScaledBaselineAllocations,
  getReceivableStatus
} from "./utils/financeHelpers";
import { migrateBaseWallets, migrateLegacyBills } from "./utils/financeMigrations";

import { useCloudSync, getLocalPasscode } from "./hooks/useCloudSync";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { useFinanceCalculations } from "./hooks/useFinanceCalculations";
import { useWalletActions } from "./hooks/useWalletActions";
import { useBillActions } from "./hooks/useBillActions";
import { useReceivableActions } from "./hooks/useReceivableActions";
import { useShootActions } from "./hooks/useShootActions";
import { useBillEditActions } from "./hooks/useBillEditActions";
import { useBillSaveActions } from "./hooks/useBillSaveActions";
import { useReceivableSaveActions } from "./hooks/useReceivableSaveActions";
import { useShootSaveActions } from "./hooks/useShootSaveActions";
import { usePaydayActions } from "./hooks/usePaydayActions";

import { BillsTable } from "./components/BillsTable";
import { ReceivablesTable } from "./components/ReceivablesTable";
import { ShootsTable } from "./components/ShootsTable";
import { DashboardTab } from "./components/DashboardTab";
import { DateJumpModal } from "./components/DateJumpModal";
import { YearlyOverviewModal } from "./components/YearlyOverviewModal";
import { FinancialAnalyticsModal } from "./components/FinancialAnalyticsModal";
import { WalletsTab } from "./components/WalletsTab";
import { ExpensesTab } from "./components/ExpensesTab";
import { BottomNav, TabType } from "./components/BottomNav";
import { SettingsModal } from "./components/SettingsModal";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useTheme } from "./hooks/useTheme";
import { LandingPage } from "./components/LandingPage";
import { OperationsTab } from "./components/OperationsTab";
import { AccountTab } from "./components/AccountTab";

function safeLoadAll(): UnifiedFinanceData {
  try {
    const saved = localStorage.getItem("ft_master_data_v1");

    if (!saved) {
      return INITIAL_UNIFIED_DATA;
    }

    const parsed = JSON.parse(saved);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.wallets ||
      typeof parsed.wallets !== "object" ||
      !parsed.library ||
      typeof parsed.library !== "object" ||
      !Array.isArray(parsed.library.bills) ||
      !Array.isArray(parsed.library.receivables) ||
      !Array.isArray(parsed.library.shoots) ||
      !parsed.logs ||
      typeof parsed.logs !== "object" ||
      !parsed.settings ||
      typeof parsed.settings !== "object"
    ) {
      console.warn(
        "Invalid local finance data found. Using initial data instead."
      );
      return INITIAL_UNIFIED_DATA;
    }

    const updatedAt =
      typeof parsed.updatedAt === "number" &&
      Number.isFinite(parsed.updatedAt) &&
      parsed.updatedAt >= 0
        ? parsed.updatedAt
        : 0;

    return {
      ...parsed,
      updatedAt
    } as UnifiedFinanceData;
  } catch (err) {
    console.warn(
      "Could not load local finance data. Using initial data instead.",
      err
    );
    return INITIAL_UNIFIED_DATA;
  }
}

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return "";
  try {
    const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T12:00:00");
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
};




export default function App() {
  const { updateAvailable } = useAppUpdate();
  const [showShortcutsHelp, setShowShortcutsHelp] = useState<boolean>(false);
  const [globalData, setGlobalData] = useState<UnifiedFinanceData>(safeLoadAll);
  useTheme(globalData?.settings);
  const commitDataChangeRef = useRef<
    React.Dispatch<React.SetStateAction<UnifiedFinanceData>>
  >(setGlobalData);

  const syncedSetGlobalData = useCallback(
    (action: React.SetStateAction<UnifiedFinanceData>) => {
      commitDataChangeRef.current(action);
    },
    []
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getMonthKey(new Date()));
const {
  commitWallet,
  incrementWallet
} = useWalletActions({
  setGlobalData: syncedSetGlobalData
});
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [showYearlyModal, setShowYearlyModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("home");
  const [opsTab, setOpsTab] = useState<"bills" | "inflows" | "gigs">("bills");
  const [settingsInitialTab, setSettingsInitialTab] = useState<"general" | "baselines" | "sync">("general");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<{ label: string; onClick: () => void } | null>(null);
  const [highlightOverdue, setHighlightOverdue] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({});
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(false);

  const [googleUser, setGoogleUser] = useState<any>(() => {
    const saved = localStorage.getItem("ft_google_user");
    const passcode = localStorage.getItem("ft_google_token");
    if (saved && !passcode) {
      localStorage.removeItem("ft_google_user");
      return null;
    }
    return saved ? JSON.parse(saved) : null;
  });

  const handleGoogleSuccess = (credentialResponse: any) => {
    try {
      const credential = String(credentialResponse?.credential || "");

      if (!credential) {
        showToast("Google sign-in returned no credential");
        return;
      }

      const decoded: any = jwtDecode(credential);

      setGoogleUser(decoded);
      localStorage.setItem(
        "ft_google_user",
        JSON.stringify(decoded)
      );

      // Store the Google ID token for secure server-side sync
      localStorage.setItem(
        "ft_google_token",
        credential
      );
      // Save profile for Meta-style Welcome Back screen
      localStorage.setItem("ft_last_profile", JSON.stringify({ name: decoded.name, email: decoded.email, picture: decoded.picture }));

      showToast(`Welcome, ${decoded.name || "User"}!`);
    } catch {
      showToast("Failed to decode Google token");
    }
  };

  const handleGoogleLogout = () => {
    googleLogout();
    setGoogleUser(null);
    localStorage.removeItem("ft_google_user");
    localStorage.removeItem("ft_google_token");
    showToast("Signed out of Google");
  };

  // Runs on every mount, even if already "logged in" (googleUser restored
  // from localStorage) — with auto_select:true this silently refreshes the
  // ID token in the background instead of only recovering reactively after
  // a 401. Proactive refresh: re-arm this by remounting the prompt every
  // 45 minutes so the ~1hr-lived token never gets a chance to fully expire.
  useGoogleOneTapLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => console.log("One Tap silent refresh failed"),
    auto_select: true,
  });

  React.useEffect(() => {
    if (!googleUser) return;
    const refreshInterval = setInterval(() => {
      if ((window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.prompt();
      }
    }, 45 * 60 * 1000);
    return () => clearInterval(refreshInterval);
  }, [googleUser]);

  // Prevents concurrent auth recovery attempts when multiple 401 responses
  // dispatch auth-expired in rapid succession. Only the first attempt proceeds;
  // duplicates are silently dropped. The guard is cleared once recovery resolves.
  const authRefreshInProgressRef = useRef(false);

  React.useEffect(() => {
    const handleAuthExpired = () => {
      // If a recovery is already in progress, silently ignore this duplicate event.
      if (authRefreshInProgressRef.current) return;
      authRefreshInProgressRef.current = true;

      showToast("🔄 Session expired. Refreshing...");

      // Remove both keys together so that a page refresh during recovery
      // cannot land in the inconsistent state: ft_google_user present but
      // ft_google_token absent (which forces the user to the login screen).
      localStorage.removeItem("ft_google_token");
      localStorage.removeItem("ft_google_user");

      if ((window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.prompt((notification: any) => {
          authRefreshInProgressRef.current = false;
          if (notification.isNotDisplayed() || notification.isSkippedMoment() || notification.isDismissedMoment()) {
            handleGoogleLogout();
            showToast("⚠️ Session expired. Please sign in again.");
          }
        });
      } else {
        authRefreshInProgressRef.current = false;
        handleGoogleLogout();
      }
    };

    window.addEventListener("auth-expired", handleAuthExpired);
    return () => window.removeEventListener("auth-expired", handleAuthExpired);
  }, []);




  const importInputRef = useRef<HTMLInputElement>(null);
  const paydaySplitInProgressRef = useRef(false);

  const handleJumpToOverdue = () => {
    setActiveTab("operations");
    setOpsTab("bills");
    setTimeout(() => {
      document.getElementById("operations-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    setHighlightOverdue(true);
    setTimeout(() => setHighlightOverdue(false), 2500);
  };

  const showToast = (msg: string, action?: { label: string; onClick: () => void }) => {
    setToastMessage(msg);
    setToastAction(action || null);
    setTimeout(() => { setToastMessage(null); setToastAction(null); }, action ? 4500 : 2500);
  };


  // ⚡ SILENT AUTO-MIGRATION FOR BASE WALLETS
  React.useEffect(() => {
    if (!globalData.settings?.hasMigratedBaseWallets) {
      syncedSetGlobalData(prev => ({
        ...migrateBaseWallets(prev),
        updatedAt: Date.now()
      }));
      setTimeout(() => showToast("✨ Migrated base wallets to fully customizable accounts"), 1000);
    }
  }, [globalData.settings?.hasMigratedBaseWallets]);

  // ⚡ SILENT AUTO-MIGRATION FOR OLD BILLS
  React.useEffect(() => {
    const needsMigration = globalData.library?.bills?.some(b => !b.wallet);
    if (needsMigration) {
      syncedSetGlobalData(prev => ({
        ...migrateLegacyBills(prev),
        updatedAt: Date.now()
      }));
      setTimeout(() => showToast("✨ Auto-migrated legacy bills to new wallet system"), 1000);
    }
  }, [globalData.library?.bills]);

const {
  addBill: handleAddBill,
  toggleBillStatus,
  deleteBill
} = useBillActions({
  globalData,
  setGlobalData: syncedSetGlobalData,
  selectedMonth,
  showToast
});

const {
  addReceivable: handleAddReceivable,
  toggleReceivableStatus,
  addPayment,
  deleteReceivable
} = useReceivableActions({ globalData, setGlobalData: syncedSetGlobalData, selectedMonth, showToast });

const {
  addShoot: handleAddShoot,
  toggleShootCompletion,
  deleteShoot
} = useShootActions({
  setGlobalData: syncedSetGlobalData,
  showToast
});

const { resetMonthOverride } = useBillEditActions({
  setGlobalData: syncedSetGlobalData,
  selectedMonth,
  showToast
});

const { saveBillEdit } = useBillSaveActions({
  setGlobalData: syncedSetGlobalData,
  selectedMonth,
  editingId,
  editForm,
  setEditingId,
  showToast
});

const { saveReceivableEdit } = useReceivableSaveActions({
  setGlobalData: syncedSetGlobalData,
  editingId,
  editForm,
  setEditingId,
  showToast
});

const { saveShootEdit } = useShootSaveActions({
  setGlobalData: syncedSetGlobalData,
  editingId,
  editForm,
  setEditingId,
  showToast
});

  const {
    isSyncing,
    isOnline,
    debugLog,
    setDebugLog,
    forceManualSync,
    pullLatestData,
    commitDataChange
  } = useCloudSync(globalData, setGlobalData, showToast);

  commitDataChangeRef.current = commitDataChange;

  const {
    activeBills,
    activeReceivables,
    activeShoots,
    totalLiquid,
    targetMilestoneFund,
    fundProgressPercent,
    totalPendingReceivables,
    monthIncomeCollected,
    totalUnpaidCommitments,
    priorityUnpaidSum,
    overdueBills,
    overdueSum,
    cashShortfall,
    paydayAllocations,
    remainingBuffer
  ,
    billPaydayAllocations,
    allTransactions,
    recentTransactions
  } = useFinanceCalculations(globalData, selectedMonth);

  const isModalOpen =
    showDatePickerModal ||
    showYearlyModal ||
    showAnalyticsModal ||
    showSettingsModal ||
    showLedgerModal;

  const isEditing = editingId !== null;
  const nowForEx = new Date();
  const currentExecutionKey = `${nowForEx.getFullYear()}-${String(nowForEx.getMonth() + 1).padStart(2, "0")}-${String(nowForEx.getDate()).padStart(2, "0")}`;
  const hasExecutedToday = globalData.paydaySplitExecutions?.some(ex => typeof ex === "string" ? ex === currentExecutionKey : ex.date === currentExecutionKey);
  const latestExecution = globalData.paydaySplitExecutions?.slice().reverse().find(ex => typeof ex !== "string") as PaydayExecution | undefined;

    const { pullProgress } = usePullToRefresh(
    () => {
      if (isEditing) {
        showToast("✏️ Finish editing before pulling cloud data.");
        return;
      }
      pullLatestData(false);
    },
    isModalOpen || isEditing
  );

  useKeyboardShortcuts({
    onToggleDatePicker: () => setShowDatePickerModal(prev => !prev),
    onToggleDebug: () => { setSettingsInitialTab("sync"); setShowSettingsModal(true); },
    onToggleYearly: () => setShowYearlyModal(prev => !prev),
    onToggleAnalytics: () => setShowAnalyticsModal(prev => !prev),
    onManualSync: forceManualSync,
    onPullData: () => {
      if (isEditing) {
        showToast("✏️ Finish editing before pulling cloud data.");
        return;
      }

      pullLatestData(false);
    },
    onTogglePrivacy: () => setIsPrivacyMode(prev => !prev),
    onSelectTab: (tab) => setActiveTab(tab),
    onSelectOpsTab: (sub) => setOpsTab(sub),
    activeTab,
    onCloseAll: () => {
    setShowDatePickerModal(false);
    setShowYearlyModal(false);
    setShowAnalyticsModal(false);
    setEditingId(null);
  }
});

  const dropdownMonths = useMemo(() => [
    getAdjacentMonth(selectedMonth, -1),
    selectedMonth,
    getAdjacentMonth(selectedMonth, 1),
    getAdjacentMonth(selectedMonth, 2)
  ], [selectedMonth]);

  const isViewingCurrentMonth = selectedMonth === getMonthKey(new Date());

  const {
   handleExecutePaydaySplit,
   handleUndoPaydaySplit,
 } = usePaydayActions({
   globalData,
   setGlobalData: syncedSetGlobalData,
   paydayAllocations,
   billPaydayAllocations,
   remainingBuffer,
   isViewingCurrentMonth,
   selectedMonth,
   showToast,
   paydaySplitInProgressRef,
 });

const copySummaryToClipboard = async () => {
  const text = buildFinancialSummary({
    activeBills,
    activeReceivables,
    globalData,
    selectedMonth,
    totalLiquid,
    totalUnpaidCommitments,
    overdueBills,
    targetMilestoneFund,
    fundProgressPercent,
    monthIncomeCollected
  });

  try {
    await navigator.clipboard.writeText(text);
    showToast("📋 Detailed summary copied to clipboard!");
  } catch {
    showToast("Could not copy summary");
  }
};

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(globalData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Exported backup file");
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);

        if (
          !parsed ||
          typeof parsed !== "object" ||
          !parsed.wallets ||
          typeof parsed.wallets !== "object" ||
          !parsed.library ||
          typeof parsed.library !== "object" ||
          !Array.isArray(parsed.library.bills) ||
          !Array.isArray(parsed.library.receivables) ||
          !Array.isArray(parsed.library.shoots) ||
          !parsed.logs ||
          typeof parsed.logs !== "object" ||
          !parsed.settings ||
          typeof parsed.settings !== "object"
        ) {
          alert("This file doesn't look like a valid backup.");
          return;
        }

        if (confirm("Import this backup? It will replace current data.")) {
          const importedData: UnifiedFinanceData = {
            ...parsed,
            updatedAt: (typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) && parsed.updatedAt >= 0)
              ? parsed.updatedAt
              : Date.now()
          };

          syncedSetGlobalData(importedData);
          showToast("Imported backup successfully");
        }
      } catch (err) {
        alert("Could not read that file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // --- WHITE-LABEL AUTH GATE ---
  // If they don't have a Google session AND they haven't used the Dev Mode passcode backdoor,
  // trap them on the Landing Page.
  const isAuth = !!googleUser || !!getLocalPasscode();
  if (!isAuth) {
    return <LandingPage onGoogleSuccess={handleGoogleSuccess} />;
  }

  return (
    <div className={`min-h-screen bg-shell text-text-secondary px-4 sm:px-6 pb-28 sm:pb-32 pt-[max(2rem,env(safe-area-inset-top))] flex justify-center selection:bg-blue-600 selection:text-white ${isPrivacyMode ? "privacy-mode" : ""}`}>
      <div className="fixed top-0 left-0 right-0 z-[200] bg-shell/80 backdrop-blur-xl pointer-events-none" style={{ height: "env(safe-area-inset-top)" }} />

      {updateAvailable && (
        <div onClick={() => window.location.reload()} className="fixed top-[calc(env(safe-area-inset-top)+12px)] left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs px-5 py-2.5 rounded-full shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all cursor-pointer animate-in slide-in-from-top-8 duration-500">
          <RefreshCw size={14} className="animate-spin shrink-0" />
          <span className="font-semibold tracking-wide">New update available. Tap to refresh.</span>
        </div>
      )}

      {toastMessage && (
        <div className="fixed top-12 right-6 z-50 flex items-center gap-2 bg-surface-high text-strong text-xs px-4 py-2.5 rounded-xl border border-inverse/10 shadow-2xl animate-fade-in">
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          {toastAction && (
            <button
              onClick={() => { toastAction.onClick(); setToastMessage(null); setToastAction(null); }}
              className="ml-1 px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-blue-300 font-semibold transition"
            >
              {toastAction.label}
            </button>
          )}
        </div>
      )}

      <div className="w-full max-w-[860px] space-y-4">
        {cashShortfall > 0 && (
          <div className="bg-orange-950/25 border border-orange-800/40 text-orange-300 text-xs rounded-2xl px-4 py-3 flex items-center gap-2.5 shadow-lg leading-relaxed">
            <AlertTriangle size={14} className="shrink-0 text-orange-400" />
            <span>Liquid cash is <strong className="font-mono font-semibold">₱{cashShortfall.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong> short of covering unpaid commitments{overdueBills.length > 0 ? ` (including ${overdueBills.length} overdue)` : ""}.</span>
          </div>
        )}

        <div className="flex flex-col gap-3.5 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-strong">Dashboard</h1>
              <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium no-privacy-blur transition-all ${!isOnline ? "chip-amber" : isSyncing ? "chip-blue" : "chip-emerald"}`}>
                {!isOnline ? <><WifiOff size={10} className="text-amber-400" /><span>Offline</span></> : isSyncing ? <><span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" /><span>Syncing...</span></> : <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><span>Live</span></>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2 mr-2 pr-4 border-r border-inverse/[0.08]">
                <div className="relative">
                  <button onClick={() => setShowShortcutsHelp(prev => !prev)} className="text-xs font-medium text-muted hover:text-primary bg-fill/80 hover:bg-fill-strong border border-strong px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shadow-sm">
                    <span>⌨️</span> Shortcuts
                  </button>
                  {showShortcutsHelp && (
                    <div className="absolute right-0 mt-2 w-64 p-3 bg-surface-modal border border-strong rounded-xl shadow-2xl backdrop-blur-md text-xs z-[100]">
                      <div className="flex items-center justify-between pb-1.5 border-b border-strong/80 mb-2">
                        <span className="text-secondary font-semibold flex items-center gap-1.5"><span>⌨️</span> Shortcuts</span>
                        <button onClick={() => setShowShortcutsHelp(false)} className="text-faint hover:text-secondary">✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                        <div className="flex items-center justify-between bg-fill/60 p-1.5 rounded border border-strong/50"><span className="text-muted">Tabs</span><kbd className="bg-fill-strong text-primary px-1.5 py-0.5 rounded font-mono text-[10px]">1-5</kbd></div>
                        <div className="flex items-center justify-between bg-fill/60 p-1.5 rounded border border-strong/50"><span className="text-muted">Ops Views</span><kbd className="bg-fill-strong text-primary px-1.5 py-0.5 rounded font-mono text-[10px]">B,I,G</kbd></div>
                        <div className="flex items-center justify-between bg-fill/60 p-1.5 rounded border border-strong/50"><span className="text-muted">Month</span><kbd className="bg-fill-strong text-primary px-1.5 py-0.5 rounded font-mono text-[10px]">⌘K</kbd></div>
                        <div className="flex items-center justify-between bg-fill/60 p-1.5 rounded border border-strong/50"><span className="text-muted">Yearly</span><kbd className="bg-fill-strong text-primary px-1.5 py-0.5 rounded font-mono text-[10px]">Y</kbd></div>
                        <div className="flex items-center justify-between bg-fill/60 p-1.5 rounded border border-strong/50"><span className="text-muted">Analytics</span><kbd className="bg-fill-strong text-primary px-1.5 py-0.5 rounded font-mono text-[10px]">A</kbd></div>
                        <div className="flex items-center justify-between bg-fill/60 p-1.5 rounded border border-strong/50"><span className="text-muted">Privacy</span><kbd className="bg-fill-strong text-primary px-1.5 py-0.5 rounded font-mono text-[10px]">P</kbd></div>
                        <div className="flex items-center justify-between bg-fill/60 p-1.5 rounded border border-strong/50"><span className="text-muted">Pull/Sync</span><kbd className="bg-fill-strong text-primary px-1.5 py-0.5 rounded font-mono text-[10px]">R / S</kbd></div>
                        <div className="flex items-center justify-between bg-fill/60 p-1.5 rounded border border-strong/50"><span className="text-muted">Close</span><kbd className="bg-fill-strong text-primary px-1.5 py-0.5 rounded font-mono text-[10px]">Esc</kbd></div>
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={forceManualSync} className="h-7 w-7 rounded-lg bg-fill/80 hover:bg-fill-strong border border-strong hover:border-blue-500/50 flex items-center justify-center text-muted hover:text-blue-400 transition shadow-sm" title="Save & Sync (S)"><Cloud size={13} className={isSyncing ? "animate-pulse text-blue-400" : ""} /></button>
                <button onClick={() => pullLatestData(false)} className="h-7 w-7 rounded-lg bg-fill/80 hover:bg-fill-strong border border-strong hover:border-emerald-500/50 flex items-center justify-center text-muted hover:text-emerald-400 transition shadow-sm" title="Pull Data (R)"><RefreshCw size={12} className={isSyncing ? "animate-spin text-emerald-400" : ""} /></button>
              </div>
              <button onClick={() => pullLatestData(false)} aria-label="Refresh Data" className="md:hidden h-8 w-8 rounded-full border border-strong bg-fill/80 hover:bg-fill-strong flex items-center justify-center text-muted hover:text-emerald-400 transition shadow-sm" title="Refresh Data"><RefreshCw size={13} className={isSyncing ? "animate-spin text-emerald-400" : ""} /></button>
              <button onClick={() => setIsPrivacyMode(prev => !prev)} aria-label={isPrivacyMode ? "Show Balances" : "Hide Balances"} className={`h-8 w-8 rounded-full border flex items-center justify-center transition shadow-sm ${isPrivacyMode ? "bg-amber-500/20 border-amber-500/60 text-amber-300" : "bg-fill/80 hover:bg-fill-strong border-strong text-muted hover:text-primary"}`}>
                {isPrivacyMode ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-surface-elevated border border-inverse/[0.08] px-3 py-1.5 rounded-xl text-xs shadow-md">
              <Calendar size={13} className="text-blue-400 cursor-pointer" onClick={() => setShowDatePickerModal(true)} />
              <select value={selectedMonth} onChange={(e) => { if (e.target.value === "CUSTOM_DATE_JUMP") setShowDatePickerModal(true); else setSelectedMonth(e.target.value); }} className="bg-transparent text-strong font-semibold outline-none cursor-pointer">
                {dropdownMonths.map(m => <option key={m} value={m} className="bg-surface-modal">{m}</option>)}
                <option disabled>──────────</option>
                <option value="CUSTOM_DATE_JUMP" className="bg-surface-modal font-semibold text-blue-400">Select Month...</option>
              </select>
            </div>
            <button onClick={() => setShowAnalyticsModal(true)} className="flex items-center gap-1.5 bg-surface-elevated border border-amber-500/30 hover:border-amber-400/60 text-amber-300 px-3 py-1.5 rounded-xl text-xs shadow-md transition font-medium"><Sparkles size={13} className="text-amber-400" /><span>Runway</span></button>
            <button onClick={() => setShowYearlyModal(true)} className="flex items-center gap-1.5 bg-surface-elevated border border-emerald-500/30 hover:border-emerald-400/60 text-emerald-300 px-3 py-1.5 rounded-xl text-xs shadow-md transition font-medium"><BarChart2 size={13} className="text-emerald-400" /><span>Yearly</span></button>
          </div>
        </div>

        <DateJumpModal isOpen={showDatePickerModal} onClose={() => setShowDatePickerModal(false)} onJump={(m) => { setSelectedMonth(m); setShowDatePickerModal(false); }} selectedMonth={selectedMonth} />
        <YearlyOverviewModal isOpen={showYearlyModal} onClose={() => setShowYearlyModal(false)} globalData={globalData} selectedYear={selectedMonth.split(" ")[1] || "2026"} />
        <SettingsModal onExport={exportBackup} onImportClick={() => importInputRef.current?.click()} isOpen={showSettingsModal} initialTab={settingsInitialTab} onClose={() => setShowSettingsModal(false)} globalData={globalData} setGlobalData={syncedSetGlobalData} totalLiquid={totalLiquid} debugLog={debugLog} onForcePush={forceManualSync} onForcePull={() => pullLatestData(false)} />
        <HistoricalLedgerModal isOpen={showLedgerModal} onClose={() => setShowLedgerModal(false)} globalData={globalData} setGlobalData={syncedSetGlobalData} showToast={showToast} />
        <FinancialAnalyticsModal isOpen={showAnalyticsModal} onClose={() => setShowAnalyticsModal(false)} globalData={globalData} selectedMonth={selectedMonth} totalLiquid={totalLiquid} totalUnpaidCommitments={totalUnpaidCommitments} />

        {activeTab === "home" && (
          <DashboardTab
            globalData={globalData}
            targetMilestoneFund={targetMilestoneFund}
            totalLiquid={totalLiquid}
            fundProgressPercent={fundProgressPercent}
            totalPendingReceivables={totalPendingReceivables}
            monthIncomeCollected={monthIncomeCollected}
            selectedMonth={selectedMonth}
            priorityUnpaidSum={priorityUnpaidSum}
            totalUnpaidCommitments={totalUnpaidCommitments}
            overdueBills={overdueBills}
            overdueSum={overdueSum}
            paydayAllocations={paydayAllocations}
            remainingBuffer={remainingBuffer}
            isViewingCurrentMonth={isViewingCurrentMonth}
            hasExecutedToday={hasExecutedToday}
            latestExecution={latestExecution}
            recentTransactions={recentTransactions}
            onOpenSettings={(tab) => { setSettingsInitialTab(tab); setShowSettingsModal(true); }}
            onExecutePaydaySplit={handleExecutePaydaySplit}
            onUndoPaydaySplit={handleUndoPaydaySplit}
            onJumpToOverdue={handleJumpToOverdue}
            onCommitWallet={commitWallet}
            onIncrementWallet={incrementWallet}
            onCopySummary={copySummaryToClipboard}
            formatDateTime={formatDateTime}
            onNavigateToWallets={() => setActiveTab("wallets")}
            onNavigateToOps={(tab = "bills") => { setActiveTab("operations"); setOpsTab(tab); }}
            onNavigateToExpenses={() => setActiveTab("expenses")}
            onOpenAnalytics={() => setShowAnalyticsModal(true)}
            onOpenYearlyModal={() => setShowYearlyModal(true)}
            onOpenLedger={() => setShowLedgerModal(true)}
            activeBills={activeBills}
          />
        )}

        {activeTab === "operations" && (
          <OperationsTab
            opsTab={opsTab}
            setOpsTab={setOpsTab}
            activeBills={activeBills}
            activeReceivables={activeReceivables}
            activeShoots={activeShoots}
            selectedMonth={selectedMonth}
            onToggleBillStatus={toggleBillStatus}
            onAddBill={handleAddBill}
            onDeleteBill={deleteBill}
            onSaveBillEdit={(_, scope) => saveBillEdit(scope)}
            onResetMonthOverride={resetMonthOverride}
            onToggleReceivableStatus={toggleReceivableStatus}
            onAddPayment={addPayment}
            onAddReceivable={handleAddReceivable}
            onDeleteReceivable={deleteReceivable}
            onSaveReceivableEdit={saveReceivableEdit}
            onToggleShootCompletion={toggleShootCompletion}
            onAddShoot={handleAddShoot}
            onDeleteShoot={deleteShoot}
            onSaveShootEdit={saveShootEdit}
            editingId={editingId}
            setEditingId={setEditingId}
            editForm={editForm}
            setEditForm={setEditForm}
            customWallets={globalData?.settings?.customWallets}
            defaultWallet={globalData?.settings?.defaultWallet}
            inflowsLabel={globalData?.settings?.inflowsLabel}
            inflowCategories={globalData?.settings?.inflowCategories}
            gigsLabel={globalData?.settings?.gigsLabel}
            gigCategories={globalData?.settings?.gigCategories}
            highlightOverdue={highlightOverdue}
          />
        )}

        {activeTab === "wallets" && <WalletsTab globalData={globalData} setGlobalData={syncedSetGlobalData} onCommit={commitWallet} onIncrement={incrementWallet} onOpenSettings={() => { setSettingsInitialTab("general"); setShowSettingsModal(true); }} />}
        {activeTab === "expenses" && <ExpensesTab globalData={globalData} setGlobalData={syncedSetGlobalData} showToast={showToast} />}

        {activeTab === "account" && (
          <AccountTab
            googleUser={googleUser}
            onGoogleLogout={handleGoogleLogout}
            onGoogleSuccess={handleGoogleSuccess}
            onGoogleError={() => showToast("Google Sign-In Failed")}
            onOpenSettings={() => setShowSettingsModal(true)}
            importInputRef={importInputRef}
            onImportFile={handleImportFile}
            allTransactions={allTransactions}
            onOpenLedger={() => setShowLedgerModal(true)}
            walletLabels={globalData?.settings?.walletLabels}
            formatDateTime={formatDateTime}
          />
        )}
      </div>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}
