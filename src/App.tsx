import { roundMoney } from "./utils/currency";
import React, { useState, useMemo, useRef, useCallback } from "react";
import { HistoricalLedgerModal } from "./components/HistoricalLedgerModal";
import { GoogleLogin, googleLogout, useGoogleOneTapLogin } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";
import { Calendar, Settings, Cloud, Copy, Download, Upload, AlertTriangle, History, ArrowDownLeft, Receipt, CheckCircle2, BarChart2, Sparkles, RefreshCw, WifiOff, Eye, EyeOff } from "lucide-react";
import { INITIAL_UNIFIED_DATA } from "./constants/initialData";
import { getMonthKey, getAdjacentMonth } from "./utils/dateHelpers";
import { UnifiedFinanceData, WalletState, EditFormData, TransactionHistoryItem, PaydayExecution } from "./types/finance";
import { buildFinancialSummary } from "./utils/summaryHelpers";
import { getWalletForBill } from "./utils/financeHelpers";
import { generateId } from "./utils/idHelpers";

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

import { ErrorBoundary } from "./components/ErrorBoundary";
import { MilestoneProgressBar } from "./components/MilestoneProgressBar";
import { MetricsSummaryGrid } from "./components/MetricsSummaryGrid";
import { ExecutionFlowCard } from "./components/ExecutionFlowCard";
import { BillsTable } from "./components/BillsTable";
import { ReceivablesTable } from "./components/ReceivablesTable";
import { ShootsTable } from "./components/ShootsTable";
import { WalletGrid } from "./components/WalletGrid";
import { DateJumpModal } from "./components/DateJumpModal";
import { YearlyOverviewModal } from "./components/YearlyOverviewModal";
import { FinancialAnalyticsModal } from "./components/FinancialAnalyticsModal";
import { WalletsTab } from "./components/WalletsTab";
import { ExpensesTab } from "./components/ExpensesTab";
import { BottomNav, TabType } from "./components/BottomNav";
import { SettingsModal } from "./components/SettingsModal";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { LandingPage } from "./components/LandingPage";

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

  React.useEffect(() => {
    const handleAuthExpired = () => {
      showToast("🔄 Session expired. Refreshing...");
      localStorage.removeItem("ft_google_token");
      
      if ((window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.prompt((notification: any) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment() || notification.isDismissedMoment()) {
              handleGoogleLogout();
              showToast("⚠️ Session expired. Please sign in again.");
            }
          });
      } else {
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
      syncedSetGlobalData(prev => {
        const oldLabels = prev.settings?.walletLabels || {};
        const existingCustom = prev.settings?.customWallets || [];
        const baseIds = ['maribank', 'maya', 'gcash', 'gotyme', 'bpi', 'cash'];
        const defaultColors: Record<string, string> = { maribank: 'text-amber-400', maya: 'text-emerald-400', gcash: 'text-blue-400', gotyme: 'text-cyan-400', bpi: 'text-rose-400', cash: 'text-zinc-300' };
        const defaultLabels: Record<string, string> = { maribank: 'MariBank', maya: 'Maya', gcash: 'GCash', gotyme: 'GoTyme', bpi: 'BPI', cash: 'Cash On-Hand' };

        const newCustomWallets = [...existingCustom];
        baseIds.forEach(id => {
          if (!newCustomWallets.find(w => w.id === id)) {
            newCustomWallets.push({ id, label: oldLabels[id] || defaultLabels[id], color: defaultColors[id] });
          }
        });

        return { ...prev, settings: { ...prev.settings, customWallets: newCustomWallets, hasMigratedBaseWallets: true }, updatedAt: Date.now() };
      });
      setTimeout(() => showToast("✨ Migrated base wallets to fully customizable accounts"), 1000);
    }
  }, [globalData.settings?.hasMigratedBaseWallets]);

  // ⚡ SILENT AUTO-MIGRATION FOR OLD BILLS
  React.useEffect(() => {
    const needsMigration = globalData.library?.bills?.some(b => !b.wallet);
    if (needsMigration) {
      syncedSetGlobalData(prev => ({
        ...prev,
        library: {
          ...prev.library,
          bills: prev.library.bills.map(b => ({
            ...b,
            wallet: b.wallet || getWalletForBill(b.name)
          }))
        },
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
    showAnalyticsModal;

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

  const handleExecutePaydaySplit = () => {
    if (paydaySplitInProgressRef.current) return;

    if (!isViewingCurrentMonth) {
      showToast(`⚠️ You're viewing ${selectedMonth}. Switch to the current month before distributing.`);
      return;
    }

    if (remainingBuffer < 0) {
      showToast("⚠️ Payday allocation exceeds the configured payout.");
      return;
    }

    const now = new Date();
    const executionKey =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const hasExecutedToday = globalData.paydaySplitExecutions?.some(ex => typeof ex === "string" ? ex === executionKey : ex.date === executionKey);
    if (hasExecutedToday) {
      showToast("⚠️ Payday split already executed today.");
      return;
    }

    paydaySplitInProgressRef.current = true;

    try {
      const totalDistribution = Object.values(paydayAllocations).reduce((a, b) => a + b, 0);

      const allocList = Object.entries(paydayAllocations)
        .filter(([_, amt]) => amt > 0)
        .map(([key, amt]) => `${globalData?.settings?.walletLabels?.[key] || key}: ₱${amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
        .join("\n");

      const confirmed = confirm(
        `Distribute ₱${totalDistribution.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} into your wallets?

${allocList}`
      );

      if (!confirmed) return;

      syncedSetGlobalData(prev => {
        const executions = prev.paydaySplitExecutions || [];

        if (executions.includes(executionKey)) {
          return prev;
        }

        const updatedLogs = { ...prev.logs };
        billPaydayAllocations.forEach(alloc => {
          const monthLog = updatedLogs[alloc.month] || {};
          const existingContributions = monthLog.billPaydayContributions || {};
          updatedLogs[alloc.month] = {
            ...monthLog,
            billPaydayContributions: {
              ...existingContributions,
              [alloc.id]: (existingContributions[alloc.id] || 0) + alloc.amount
            }
          };
        });

        return {
          ...prev,
          wallets: (() => {
            const newWallets = { ...prev.wallets };
            Object.entries(paydayAllocations).forEach(([walletKey, amount]) => {
              newWallets[walletKey] = roundMoney((parseFloat(String(newWallets[walletKey])) || 0) + amount);
            });
            return newWallets;
          })(),
          logs: updatedLogs,
          paydaySplitExecutions: [...executions, {
            id: generateId("pd"),
            date: executionKey,
            timestamp: Date.now(),
            allocations: paydayAllocations,
            billContributions: billPaydayAllocations
          }],
          updatedAt: Date.now()
        };
      });

      showToast("✨ Payday split automatically distributed to wallets!");
    } finally {
      paydaySplitInProgressRef.current = false;
    }
  };

  const handleUndoPaydaySplit = (executionId: string) => {
    if (!confirm("Reverse this payday distribution? Funds will be subtracted from wallets and bill contributions reset.")) return;

    syncedSetGlobalData(prev => {
      const executions = prev.paydaySplitExecutions || [];
      const target = executions.find(ex => typeof ex !== "string" && ex.id === executionId) as PaydayExecution | undefined;

      if (!target) {
        showToast("Cannot undo a legacy execution.");
        return prev;
      }

      const updatedLogs = { ...prev.logs };
      target.billContributions.forEach(alloc => {
         const monthLog = updatedLogs[alloc.month] || {};
         const existingContributions = monthLog.billPaydayContributions || {};
         updatedLogs[alloc.month] = {
           ...monthLog,
           billPaydayContributions: {
             ...existingContributions,
             [alloc.id]: Math.max(0, (existingContributions[alloc.id] || 0) - alloc.amount)
           }
         };
      });

      const nextWallets = { ...prev.wallets };
      Object.entries(target.allocations).forEach(([walletKey, amount]) => {
        if (nextWallets[walletKey] !== undefined) {
           nextWallets[walletKey] = roundMoney(nextWallets[walletKey] - amount);
        }
      });

      return {
        ...prev,
        wallets: nextWallets,
        logs: updatedLogs,
        paydaySplitExecutions: executions.filter(ex => typeof ex === "string" || ex.id !== executionId),
        updatedAt: Date.now()
      };
    });
    showToast("Payday distribution reversed.");
  };

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
    <div className={`min-h-screen bg-[#070709] text-[#d4d4d8] px-4 sm:px-6 pb-28 sm:pb-32 pt-[max(2rem,env(safe-area-inset-top))] flex justify-center selection:bg-blue-600 selection:text-white ${isPrivacyMode ? "privacy-mode" : ""}`}>
      <div className="fixed top-0 left-0 right-0 z-[200] bg-[#070709]/80 backdrop-blur-xl pointer-events-none" style={{ height: "env(safe-area-inset-top)" }} />
      
      {updateAvailable && (
        <div onClick={() => window.location.reload()} className="fixed top-[calc(env(safe-area-inset-top)+12px)] left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs px-5 py-2.5 rounded-full shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all cursor-pointer animate-in slide-in-from-top-8 duration-500">
          <RefreshCw size={14} className="animate-spin shrink-0" />
          <span className="font-semibold tracking-wide">New update available. Tap to refresh.</span>
        </div>
      )}

      {toastMessage && (
        <div className="fixed top-12 right-6 z-50 flex items-center gap-2 bg-[#181822] text-white text-xs px-4 py-2.5 rounded-xl border border-white/10 shadow-2xl animate-fade-in">
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
          <div className="bg-[#2a1712] border border-orange-900/50 text-orange-300 text-[11px] rounded-2xl px-4 py-3 flex items-center gap-2.5 shadow-lg">
            <AlertTriangle size={14} className="shrink-0 text-orange-400" />
            <span>Liquid cash is <strong className="font-mono">₱{cashShortfall.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong> short of covering unpaid commitments{overdueBills.length > 0 ? ` (including ${overdueBills.length} overdue)` : ""}.</span>
          </div>
        )}

        <div className="flex flex-col gap-3.5 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium no-privacy-blur border transition-all ${!isOnline ? "bg-amber-950/60 border-amber-700/50 text-amber-300" : isSyncing ? "bg-blue-950/60 border-blue-700/50 text-blue-300" : "bg-emerald-950/40 border-emerald-800/40 text-emerald-400"}`}>
                {!isOnline ? <><WifiOff size={10} className="text-amber-400" /><span>Offline</span></> : isSyncing ? <><span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" /><span>Syncing...</span></> : <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><span>Live</span></>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2 mr-2 pr-4 border-r border-white/[0.08]">
                <div className="relative">
                  <button onClick={() => setShowShortcutsHelp(prev => !prev)} className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shadow-sm">
                    <span>⌨️</span> Shortcuts
                  </button>
                  {showShortcutsHelp && (
                    <div className="absolute right-0 mt-2 w-64 p-3 bg-[#121216] border border-zinc-800 rounded-xl shadow-2xl backdrop-blur-md text-xs z-[100]">
                      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80 mb-2">
                        <span className="text-zinc-300 font-semibold flex items-center gap-1.5"><span>⌨️</span> Shortcuts</span>
                        <button onClick={() => setShowShortcutsHelp(false)} className="text-zinc-500 hover:text-zinc-300">✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50"><span className="text-zinc-400">Tabs</span><kbd className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded font-mono">1-5</kbd></div>
                        <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50"><span className="text-zinc-400">Ops Views</span><kbd className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded font-mono">B,I,G</kbd></div>
                        <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50"><span className="text-zinc-400">Month</span><kbd className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded font-mono">⌘K</kbd></div>
                        <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50"><span className="text-zinc-400">Yearly</span><kbd className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded font-mono">Y</kbd></div>
                        <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50"><span className="text-zinc-400">Analytics</span><kbd className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded font-mono">A</kbd></div>
                        <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50"><span className="text-zinc-400">Privacy</span><kbd className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded font-mono">P</kbd></div>
                        <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50"><span className="text-zinc-400">Pull/Sync</span><kbd className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded font-mono">R / S</kbd></div>
                        <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50"><span className="text-zinc-400">Close</span><kbd className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded font-mono">Esc</kbd></div>
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={forceManualSync} className="h-7 w-7 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-blue-500/50 flex items-center justify-center text-zinc-400 hover:text-blue-400 transition shadow-sm" title="Save & Sync (S)"><Cloud size={13} className={isSyncing ? "animate-pulse text-blue-400" : ""} /></button>
                <button onClick={() => pullLatestData(false)} className="h-7 w-7 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition shadow-sm" title="Pull Data (R)"><RefreshCw size={12} className={isSyncing ? "animate-spin text-emerald-400" : ""} /></button>
              </div>
              <button onClick={() => pullLatestData(false)} aria-label="Refresh Data" className="md:hidden h-8 w-8 rounded-full border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition shadow-sm" title="Refresh Data"><RefreshCw size={13} className={isSyncing ? "animate-spin text-emerald-400" : ""} /></button>
              <button onClick={() => setIsPrivacyMode(prev => !prev)} aria-label={isPrivacyMode ? "Show Balances" : "Hide Balances"} className={`h-8 w-8 rounded-full border flex items-center justify-center transition shadow-sm ${isPrivacyMode ? "bg-amber-500/20 border-amber-500/60 text-amber-300" : "bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>
                {isPrivacyMode ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#121217] border border-white/[0.08] px-3 py-1.5 rounded-xl text-xs shadow-md">
              <Calendar size={13} className="text-blue-400 cursor-pointer" onClick={() => setShowDatePickerModal(true)} />
              <select value={selectedMonth} onChange={(e) => { if (e.target.value === "CUSTOM_DATE_JUMP") setShowDatePickerModal(true); else setSelectedMonth(e.target.value); }} className="bg-transparent text-white font-semibold outline-none cursor-pointer">
                {dropdownMonths.map(m => <option key={m} value={m} className="bg-[#121216]">{m}</option>)}
                <option disabled>──────────</option>
                <option value="CUSTOM_DATE_JUMP" className="bg-[#121216] font-bold text-blue-400">Select Month...</option>
              </select>
            </div>
            <button onClick={() => setShowAnalyticsModal(true)} className="flex items-center gap-1.5 bg-[#121217] border border-amber-500/30 hover:border-amber-400/60 text-amber-300 px-3 py-1.5 rounded-xl text-xs shadow-md transition font-medium"><Sparkles size={13} className="text-amber-400" /><span>Runway</span></button>
            <button onClick={() => setShowYearlyModal(true)} className="flex items-center gap-1.5 bg-[#121217] border border-emerald-500/30 hover:border-emerald-400/60 text-emerald-300 px-3 py-1.5 rounded-xl text-xs shadow-md transition font-medium"><BarChart2 size={13} className="text-emerald-400" /><span>Yearly</span></button>
          </div>
        </div>

        <DateJumpModal isOpen={showDatePickerModal} onClose={() => setShowDatePickerModal(false)} onJump={(m) => { setSelectedMonth(m); setShowDatePickerModal(false); }} selectedMonth={selectedMonth} />
        <YearlyOverviewModal isOpen={showYearlyModal} onClose={() => setShowYearlyModal(false)} globalData={globalData} selectedYear={selectedMonth.split(" ")[1] || "2026"} />
        <SettingsModal onExport={exportBackup} onImportClick={() => importInputRef.current?.click()} isOpen={showSettingsModal} initialTab={settingsInitialTab} onClose={() => setShowSettingsModal(false)} globalData={globalData} setGlobalData={syncedSetGlobalData} totalLiquid={totalLiquid} debugLog={debugLog} onForcePush={forceManualSync} onForcePull={() => pullLatestData(false)} />
        <FinancialAnalyticsModal isOpen={showAnalyticsModal} onClose={() => setShowAnalyticsModal(false)} globalData={globalData} selectedMonth={selectedMonth} totalLiquid={totalLiquid} totalUnpaidCommitments={totalUnpaidCommitments} />

        {activeTab === "home" && (
          <div className="space-y-5 sm:space-y-6 animate-in fade-in zoom-in-95 duration-400 ease-out">
            <ErrorBoundary><MilestoneProgressBar currentBalance={globalData?.wallets?.[globalData?.settings?.milestoneWallet || "maribank"] || 0} targetFund={targetMilestoneFund} goalName={globalData?.settings?.goalName} onConfigureGoal={() => { setSettingsInitialTab("baselines"); setShowSettingsModal(true); }} /></ErrorBoundary>
            <ErrorBoundary><MetricsSummaryGrid totalLiquid={totalLiquid} fundProgressPercent={fundProgressPercent} totalPendingReceivables={totalPendingReceivables} monthIncomeCollected={monthIncomeCollected} selectedMonth={selectedMonth} /></ErrorBoundary>
            <ErrorBoundary><ExecutionFlowCard
            paydayDays={globalData.settings?.paydayDays}
            priorityUnpaidSum={priorityUnpaidSum} totalUnpaidCommitments={totalUnpaidCommitments} overdueBills={overdueBills} overdueSum={overdueSum} paydayAllocations={paydayAllocations} onConfigureBaselines={() => { setSettingsInitialTab("baselines"); setShowSettingsModal(true); }} remainingBuffer={remainingBuffer} customWallets={globalData?.settings?.customWallets} onExecutePaydaySplit={handleExecutePaydaySplit} disabled={!isViewingCurrentMonth || hasExecutedToday} onClickOverdue={handleJumpToOverdue}
              latestExecution={latestExecution}
              onUndoSplit={handleUndoPaydaySplit} /></ErrorBoundary>
            
            <ErrorBoundary>
              <div className="bg-[#101014] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2"><History size={13} className="text-purple-400" /> Recent Transactions</h2>
                </div>
                <div className="space-y-2">
                  {recentTransactions.length === 0 ? (
                    <div className="py-4 text-center text-zinc-500 text-xs italic">No transactions yet.</div>
                  ) : (
                    recentTransactions.map((tx: TransactionHistoryItem) => (
                      <div key={tx.id} className="flex items-center justify-between p-3.5 rounded-xl bg-[#14141a] border border-white/[0.04] group hover:border-white/[0.08] transition">
                        <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                          <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${tx.type === 'inflow' ? 'bg-emerald-950/50 border-emerald-500/20 text-emerald-400' : tx.type === 'bill' ? 'bg-blue-950/50 border-blue-500/20 text-blue-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
                            {tx.type === 'inflow' ? <ArrowDownLeft size={14}/> : tx.type === 'bill' ? <Calendar size={14}/> : <Receipt size={14}/>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="privacy-blur text-[13px] font-semibold text-zinc-200 truncate">{tx.title}</div>
                            <div className="flex items-center gap-1.5 text-[9px] text-zinc-500 mt-0.5">
                              <span className="bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-300 font-medium truncate max-w-[90px]">{tx.category || tx.type}</span>
                              <span className="privacy-blur uppercase text-blue-400/80 font-bold truncate max-w-[80px]">{globalData?.settings?.walletLabels?.[tx.wallet || ''] || tx.wallet}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <span className={`privacy-blur text-[13px] font-bold font-mono ${tx.amount > 0 ? "text-emerald-400" : "text-zinc-100"}`}>
                            {tx.amount > 0 ? "+" : ""}₱{Math.abs(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] text-zinc-500 mt-0.5 whitespace-nowrap">{formatDateTime(tx.date)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </ErrorBoundary>

            <ErrorBoundary><WalletGrid wallets={globalData?.wallets || {}} milestoneWallet={globalData?.settings?.milestoneWallet}
        savingsWallet={globalData?.settings?.savingsWallet} customWallets={globalData?.settings?.customWallets} onCommit={commitWallet} onIncrement={incrementWallet} /></ErrorBoundary>
            <button onClick={copySummaryToClipboard} className="w-full bg-[#121217]/90 hover:bg-white/[0.06] border border-white/[0.06] text-zinc-200 font-semibold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition text-xs shadow-md"><Copy size={14} /> Copy Summary</button>
          </div>
        )}

        {activeTab === "operations" && (
          <div id="operations-section" className="space-y-4 sm:space-y-5 animate-in fade-in zoom-in-95 duration-400 ease-out">
            <div className="bg-[#121217]/90 backdrop-blur-xl border border-white/[0.08] p-1.5 rounded-2xl flex items-center shadow-lg w-full mx-auto">
              <button onClick={() => setOpsTab("bills")} className={`flex-1 py-2.5 text-[11px] uppercase tracking-wider font-bold rounded-xl transition-all duration-300 ${opsTab === "bills" ? "bg-blue-600/20 text-blue-400 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]" : "text-zinc-500 hover:text-zinc-300"}`}>Commitments</button>
              <button onClick={() => setOpsTab("inflows")} className={`flex-1 py-2.5 text-[11px] uppercase tracking-wider font-bold rounded-xl transition-all duration-300 ${opsTab === "inflows" ? "bg-emerald-600/20 text-emerald-400 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.3)]" : "text-zinc-500 hover:text-zinc-300"}`}>Inflows</button>
              <button onClick={() => setOpsTab("gigs")} className={`flex-1 py-2.5 text-[11px] uppercase tracking-wider font-bold rounded-xl transition-all duration-300 ${opsTab === "gigs" ? "bg-amber-600/20 text-amber-400 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)]" : "text-zinc-500 hover:text-zinc-300"}`}>Gigs & Tasks</button>
            </div>
            {opsTab === "bills" && <div className="animate-in fade-in zoom-in-95 duration-300 ease-out"><ErrorBoundary><BillsTable activeBills={activeBills} selectedMonth={selectedMonth} onToggleStatus={toggleBillStatus} onAddBill={handleAddBill} onDeleteBill={deleteBill} onSaveEdit={(_, scope) => saveBillEdit(scope)} onResetMonthOverride={resetMonthOverride} editingId={editingId} setEditingId={setEditingId} editForm={editForm} setEditForm={setEditForm} customWallets={globalData?.settings?.customWallets} defaultWallet={globalData?.settings?.defaultWallet} highlightOverdue={highlightOverdue} /></ErrorBoundary></div>}
            {opsTab === "inflows" && <div className="animate-in fade-in zoom-in-95 duration-300 ease-out"><ErrorBoundary><ReceivablesTable inflowsLabel={globalData?.settings?.inflowsLabel} inflowCategories={globalData?.settings?.inflowCategories} customWallets={globalData?.settings?.customWallets} activeReceivables={activeReceivables} selectedMonth={selectedMonth} onToggleStatus={toggleReceivableStatus} onAddPayment={addPayment} onAddReceivable={handleAddReceivable} onDeleteReceivable={deleteReceivable} onSaveEdit={() => saveReceivableEdit()} editingId={editingId} setEditingId={setEditingId} editForm={editForm} setEditForm={setEditForm} /></ErrorBoundary></div>}
            {opsTab === "gigs" && <div className="animate-in fade-in zoom-in-95 duration-300 ease-out"><ErrorBoundary><ShootsTable gigsLabel={globalData?.settings?.gigsLabel} gigCategories={globalData?.settings?.gigCategories} activeShoots={activeShoots} selectedMonth={selectedMonth} onToggleCompletion={toggleShootCompletion} onAddShoot={handleAddShoot} onDeleteShoot={deleteShoot} onSaveEdit={() => saveShootEdit()} editingId={editingId} setEditingId={setEditingId} editForm={editForm} setEditForm={setEditForm} /></ErrorBoundary></div>}
          </div>
        )}
        
        {activeTab === "wallets" && <WalletsTab globalData={globalData} setGlobalData={syncedSetGlobalData} onCommit={commitWallet} onIncrement={incrementWallet} onOpenSettings={() => { setSettingsInitialTab("general"); setShowSettingsModal(true); }} />}
        {activeTab === "expenses" && <ExpensesTab globalData={globalData} setGlobalData={syncedSetGlobalData} showToast={showToast} />}

        {activeTab === "account" && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-400 ease-out">
            <div className="bg-[#121217]/90 backdrop-blur-xl border border-white/[0.08] shadow-2xl rounded-3xl p-8 text-center flex flex-col items-center justify-center min-h-[30vh]">
              <h3 className="text-white font-bold text-lg mb-4">Account</h3>
              <div className="w-full bg-[#1a1a22] border border-white/[0.06] rounded-2xl p-4 mb-4 flex flex-col items-center gap-3 shadow-md">
                {googleUser ? (
                  <div className="flex flex-col items-center gap-2 w-full">
                    {googleUser.picture && <img src={googleUser.picture} alt="Profile" className="w-12 h-12 rounded-full border border-zinc-700 shadow-md" />}
                    <div className="text-sm font-bold text-white">{googleUser.name}</div>
                    <div className="text-[10px] text-zinc-400 mb-2">{googleUser.email}</div>
                    <button onClick={handleGoogleLogout} className="w-full bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/30 font-semibold py-2.5 rounded-xl text-xs transition">Sign Out</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 w-full">
                    <div className="text-xs text-zinc-400 text-center mb-2">Sign in to sync your data securely.</div>
                    <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => showToast("Google Sign-In Failed")} theme="filled_black" shape="pill" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3 mx-auto w-full">
                <button onClick={() => setShowSettingsModal(true)} className="w-full px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl transition shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"><Settings size={16} /> Open Settings</button>
              </div>
              <input ref={importInputRef} type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
            </div>

            <div className="bg-[#121217]/90 backdrop-blur-xl border border-white/[0.08] shadow-2xl rounded-3xl p-5 sm:p-8 animate-in fade-in duration-300">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2"><History size={16} className="text-purple-400"/> Transaction History</h3>
  <button onClick={() => setShowLedgerModal(true)} className="px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.12] rounded-lg text-[10px] uppercase font-bold tracking-wider transition border border-white/[0.05]">Manage Ledger</button>
</div>
                <span className="text-xs text-zinc-500 font-mono">{allTransactions.length} records</span>
              </div>
              
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {allTransactions.length === 0 ? (
                  <div className="py-8 text-center text-zinc-500 text-xs italic">No history available.</div>
                ) : (
                  allTransactions.map((tx: TransactionHistoryItem) => (
                    <div key={tx.id} className="flex items-center justify-between p-3.5 rounded-xl bg-[#14141a] border border-white/[0.04] group hover:border-white/[0.08] transition">
                      <div className="flex items-center gap-3.5 overflow-hidden flex-1">
                        <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${tx.type === 'inflow' ? 'bg-emerald-950/50 border-emerald-500/20 text-emerald-400' : tx.type === 'bill' ? 'bg-blue-950/50 border-blue-500/20 text-blue-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
                          {tx.type === 'inflow' ? <ArrowDownLeft size={15}/> : tx.type === 'bill' ? <Calendar size={15}/> : <Receipt size={15}/>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="privacy-blur text-[13px] font-semibold text-zinc-100 truncate">{tx.title}</div>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-1">
                            <span className="bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-300 font-medium truncate max-w-[90px]">{tx.category || tx.type}</span>
                            <span className="privacy-blur uppercase text-blue-400/90 font-bold tracking-wider truncate max-w-[80px]">{globalData?.settings?.walletLabels?.[tx.wallet || ''] || tx.wallet}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 ml-3">
                        <span className={`privacy-blur text-[13px] font-bold font-mono ${tx.amount > 0 ? "text-emerald-400" : "text-zinc-100"}`}>
                          {tx.amount > 0 ? "+" : ""}₱{Math.abs(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-medium mt-1 whitespace-nowrap">{formatDateTime(tx.date)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}
