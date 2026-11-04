import { PaymentHistoryMenu } from "./components/PaymentHistoryMenu";
import { recordPaymentAction, type PaymentHistory, type PaymentHistoryAction } from "./utils/paymentHistory";
import React, { useState, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { GoogleLogin, googleLogout } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";
import { Calendar, Settings, Cloud, Copy, Download, Upload, AlertTriangle, History, ArrowDownLeft, Receipt, CheckCircle2, BarChart2, Sparkles, RefreshCw, WifiOff, Eye, EyeOff, Bell } from "lucide-react";
import { INITIAL_UNIFIED_DATA } from "./constants/initialData";
import { getMonthKey, getAdjacentMonth, getDaysUntil, parseMonthKey } from "./utils/dateHelpers";
import { UnifiedFinanceData, WalletState, EditFormData, TransactionHistoryItem, PaydayExecution } from "./types/finance";
import { buildFinancialSummary } from "./utils/summaryHelpers";
import {
  getWalletForBill,
  getEffectiveBillAmount,
  computeBillPerPaydayAmount,
  computeScaledBaselineAllocations,
  getReceivableStatus
} from "./utils/financeHelpers";
import { migrateBaseWallets, migrateLegacyBills } from "./utils/financeMigrations";

import { useCloudSync, getLocalPasscode, notifyAuthTokenChanged } from "./hooks/useCloudSync";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { useFinanceCalculations } from "./hooks/useFinanceCalculations";
import { useNotifications } from "./hooks/useNotifications";
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
import { NotificationModal } from "./components/NotificationModal";
import { WalletsTab } from "./components/WalletsTab";
import { ExpensesTab } from "./components/ExpensesTab";
import { BottomNav, TabType } from "./components/BottomNav";
import { SyncConflictModal } from "./components/SyncConflictModal";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useTheme } from "./hooks/useTheme";
import { LandingPage } from "./components/LandingPage";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { OperationsTab } from "./components/OperationsTab";
import { AccountTab } from "./components/AccountTab";
import { isReturningUser, shouldShowOnboarding } from "./utils/onboardingHelpers";
import { isValidFinanceBackup, isValidFinanceData } from "./utils/validationHelpers";

const HistoricalLedgerModal = lazy(() => import("./components/HistoricalLedgerModal")
  .then(module => ({ default: module.HistoricalLedgerModal })));
const YearlyOverviewModal = lazy(() => import("./components/YearlyOverviewModal")
  .then(module => ({ default: module.YearlyOverviewModal })));
const FinancialAnalyticsModal = lazy(() => import("./components/FinancialAnalyticsModal")
  .then(module => ({ default: module.FinancialAnalyticsModal })));

const SettingsModal = lazy(() => import("./components/SettingsModal")
  .then(module => ({ default: module.SettingsModal })));

const TransactionHistoryModal = lazy(() => import("./components/TransactionHistoryModal")
  .then(module => ({ default: module.TransactionHistoryModal })));

const GoalSetupModal = lazy(() => import("./components/GoalSetupModal")
  .then(module => ({ default: module.GoalSetupModal })));
const DateJumpModal = lazy(() => import("./components/DateJumpModal")
  .then(module => ({ default: module.DateJumpModal })));

const deferredModalFallback = (
  <div role="status" className="fixed left-1/2 top-12 z-[100] -translate-x-1/2 rounded-xl border border-strong bg-surface-high px-4 py-2 text-sm text-primary shadow-lg">
    Loading…
  </div>
);

function extractSubFromToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string") return null;
  const normalized = token.trim().replace(/^Bearer\s+/i, "");
  if (!normalized) return null;
  try {
    const payload = jwtDecode<{ sub?: unknown }>(normalized);
    if (payload && typeof payload.sub === "string" && payload.sub.trim() !== "") {
      return payload.sub.trim();
    }
    return null;
  } catch {
    return null;
  }
}

function isValidAppRevision(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isValidAppConflictState(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  if (!isValidFinanceData(data.localSnapshot)) return false;
  if (!isValidFinanceData(data.cloudSnapshot)) return false;
  if (data.baseRevision !== null && !isValidAppRevision(data.baseRevision)) return false;
  if (!isValidAppRevision(data.cloudRevision)) return false;
  if (!Number.isInteger(data.detectedAt) || data.detectedAt < 0) return false;
  return true;
}

function safeLoadAll(sub: string | null = extractSubFromToken(getLocalPasscode())): UnifiedFinanceData {
  if (!sub || typeof sub !== "string" || sub.trim() === "") {
    return INITIAL_UNIFIED_DATA;
  }

  const trimmedSub = sub.trim();

  try {
    const saved = localStorage.getItem(`ft_master_data_v1_${trimmedSub}`);

    if (saved) {
      const parsed = JSON.parse(saved);

      if (isValidFinanceData(parsed)) {
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
      }

      console.warn(
        "Invalid local finance data found. Using fallback data instead."
      );
    }
  } catch (err) {
    console.warn(
      "Could not load local finance data. Using fallback data instead.",
      err
    );
  }

  try {
    const savedConflict = localStorage.getItem(`ft_sync_conflict_${trimmedSub}`);
    if (savedConflict) {
      const parsedConflict = JSON.parse(savedConflict);
      if (isValidAppConflictState(parsedConflict)) {
        const fallbackSnapshot = parsedConflict.localSnapshot;
        const updatedAt =
          typeof fallbackSnapshot.updatedAt === "number" &&
          Number.isFinite(fallbackSnapshot.updatedAt) &&
          fallbackSnapshot.updatedAt >= 0
            ? fallbackSnapshot.updatedAt
            : 0;

        return {
          ...fallbackSnapshot,
          updatedAt
        } as UnifiedFinanceData;
      }
    }
  } catch {}

  return INITIAL_UNIFIED_DATA;
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
  const [dataOwnerSub, setDataOwnerSub] = useState<string | null>(() =>
    extractSubFromToken(getLocalPasscode())
  );
  const [globalData, setGlobalData] = useState<UnifiedFinanceData>(() =>
    safeLoadAll(extractSubFromToken(getLocalPasscode()))
  );
  const handleSetGlobalData = useCallback(
    (action: React.SetStateAction<UnifiedFinanceData>) => {
      setDataOwnerSub(extractSubFromToken(getLocalPasscode()));
      setGlobalData(action);
    },
    []
  );
  useTheme(globalData?.settings);
  const commitDataChangeRef = useRef<
    React.Dispatch<React.SetStateAction<UnifiedFinanceData>>
  >(handleSetGlobalData);

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
  const [showGoalSetupModal, setShowGoalSetupModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("home");
  const [opsTab, setOpsTab] = useState<"bills" | "inflows" | "gigs">("bills");
  const [settingsInitialTab, setSettingsInitialTab] = useState<"general" | "baselines" | "sync">("general");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory>({ owner: null, undo: [], redo: [] });
  const [toastAction, setToastAction] = useState<PaymentHistoryAction | null>(null);
  const [highlightOverdue, setHighlightOverdue] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({});
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [showTransactionHistoryModal, setShowTransactionHistoryModal] = useState(false);
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const notifications = useNotifications(globalData);

  const handleDismissNotification = useCallback(
    (id: string) => {
      const target = notifications.find(n => n.id === id);
      const idsToDismiss =
        target?.groupedIds && target.groupedIds.length > 0
          ? [id, ...target.groupedIds]
          : [id];

      syncedSetGlobalData(prev => {
        const nextDismissed = { ...(prev.settings?.dismissedNotifications || {}) };
        const now = Date.now();
        idsToDismiss.forEach(dId => {
          nextDismissed[dId] = now;
        });
        return {
          ...prev,
          settings: {
            ...prev.settings,
            dismissedNotifications: nextDismissed,
          },
          updatedAt: now,
        };
      });
    },
    [notifications, syncedSetGlobalData]
  );

  const handleClearAllNotifications = useCallback(() => {
    syncedSetGlobalData(prev => {
      const newDismissed = { ...(prev.settings?.dismissedNotifications || {}) };
      const now = Date.now();
      notifications.forEach(n => {
        newDismissed[n.id] = now;
        if (n.groupedIds) {
          n.groupedIds.forEach(gId => {
            newDismissed[gId] = now;
          });
        }
      });
      return {
        ...prev,
        settings: {
          ...prev.settings,
          dismissedNotifications: newDismissed,
        },
        updatedAt: now,
      };
    });
  }, [notifications, syncedSetGlobalData]);

  const handleNotificationNavigate = useCallback(
    (route: "operations/bills" | "operations/inflows" | "expenses") => {
      setShowNotificationModal(false);
      if (route === "operations/bills") {
        setActiveTab("operations");
        setOpsTab("bills");
      } else if (route === "operations/inflows") {
        setActiveTab("operations");
        setOpsTab("inflows");
      } else if (route === "expenses") {
        setActiveTab("expenses");
      }
    },
    []
  );

  const [googleUser, setGoogleUser] = useState<any>(() => {
    const saved = localStorage.getItem("ft_google_user");
    const passcode = localStorage.getItem("ft_google_token");
    if (saved && !passcode) {
      localStorage.removeItem("ft_google_user");
      return null;
    }
    return saved ? JSON.parse(saved) : null;
  });

  const handleGoogleSuccess = (credentialResponse: any, reconnecting = false) => {
    try {
      const credential = String(credentialResponse?.credential || "");

      if (!credential) {
        showToast("Google sign-in returned no credential");
        return;
      }

      const decoded: any = jwtDecode(credential);
      const nextSub = extractSubFromToken(credential);
      if (!nextSub) {
        showToast("Failed to decode Google token");
        return;
      }

      const currentSub = extractSubFromToken(getLocalPasscode());
      if (reconnecting && nextSub !== currentSub) {
        showToast("Reconnect with the Google account already open in Finance Tracker.");
        return;
      }

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

      if (dataOwnerSub !== nextSub) {
        setDataOwnerSub(nextSub);
        setGlobalData(safeLoadAll(nextSub));
      }
      setGoogleUser(decoded);
      notifyAuthTokenChanged?.();

      if (!currentSub) showToast(`Welcome, ${decoded.name || "User"}!`);
    } catch {
      showToast("Failed to decode Google token");
    }
  };

  const handleGoogleLogout = () => {
    googleLogout();
    localStorage.removeItem("ft_google_user");
    localStorage.removeItem("ft_google_token");
    setGoogleUser(null);
    setDataOwnerSub(null);
    setGlobalData(INITIAL_UNIFIED_DATA);
    notifyAuthTokenChanged?.();
    showToast("Signed out of Google");
  };

  React.useEffect(() => {
    const handleStorageAuthChange = (e: StorageEvent) => {
      if (e.key === "ft_google_token" || e.key === "ft_google_user" || e.key === null) {
        const nextSub = extractSubFromToken(getLocalPasscode());
        if (!nextSub) {
          setGoogleUser(null);
          setDataOwnerSub(null);
          setGlobalData(INITIAL_UNIFIED_DATA);
        } else {
          if (dataOwnerSub !== nextSub) {
            setDataOwnerSub(nextSub);
            setGlobalData(safeLoadAll(nextSub));
          }
          const savedUser = localStorage.getItem("ft_google_user");
          if (savedUser) {
            try {
              setGoogleUser(JSON.parse(savedUser));
            } catch {
              setGoogleUser({ sub: nextSub });
            }
          }
        }
      }
    };
    window.addEventListener("storage", handleStorageAuthChange);
    return () => window.removeEventListener("storage", handleStorageAuthChange);
  }, [dataOwnerSub]);




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

  const showToast = (msg: string, action?: PaymentHistoryAction) => {
    if (action && dataOwnerSub && dataOwnerSub === extractSubFromToken(getLocalPasscode())) {
      setPaymentHistory(previous => recordPaymentAction(previous, dataOwnerSub, action));
    }
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    setToastAction(action || null);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToastMessage(null);
      setToastAction(null);
    }, action ? 4500 : 2500);
  };

const removeReversedPayments = (ids: string[]) => {
  setPaymentHistory(history => history.owner === dataOwnerSub ? {
    ...history,
    undo: history.undo.filter(action => !ids.includes(action.paymentId)),
    redo: history.redo.filter(action => !ids.includes(action.paymentId)),
  } : history);
};

const {
  addBill: handleAddBill,
  toggleBillStatus,
  confirmPriorBillPayments,
  deleteBill
} = useBillActions({
  globalData,
  setGlobalData: syncedSetGlobalData,
  selectedMonth,
  showToast,
  onPaymentsReversed: removeReversedPayments,
});

const {
  addReceivable: handleAddReceivable,
  toggleReceivableStatus,
  addPayment,
  deleteReceivable
} = useReceivableActions({
  globalData, setGlobalData: syncedSetGlobalData, selectedMonth, showToast,
  onPaymentsReversed: removeReversedPayments,
});

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
    syncNeedsSignIn,
    debugLog,
    setDebugLog,
    forceManualSync,
    pullLatestData,
    commitDataChange,
    hasInitialSyncCompleted,
    hasActiveConflict,
    conflictState,
    resolveConflict,
    activeSub: syncActiveSub
  } = useCloudSync(globalData, handleSetGlobalData, showToast);

  commitDataChangeRef.current = commitDataChange;

  const activeTokenSub = extractSubFromToken(getLocalPasscode());
  const isAuth = Boolean(activeTokenSub);
  const isDataOwnedByActiveSub = Boolean(
    activeTokenSub &&
    dataOwnerSub === activeTokenSub &&
    (syncActiveSub === undefined || syncActiveSub === activeTokenSub)
  );
  const hasValidatedActiveConflict = Boolean(
    isAuth &&
    isDataOwnedByActiveSub &&
    conflictState &&
    (hasActiveConflict === undefined || hasActiveConflict === true) &&
    isValidAppConflictState(conflictState)
  );
  const isAccountHydrated =
    isAuth &&
    isDataOwnedByActiveSub &&
    hasInitialSyncCompleted &&
    !hasValidatedActiveConflict;

  React.useEffect(() => {
    setPaymentHistory(history => history.owner === activeTokenSub || history.owner === null
      ? history
      : { owner: null, undo: [], redo: [] });
  }, [activeTokenSub]);

  const canUsePaymentHistory = isDataOwnedByActiveSub && !hasValidatedActiveConflict &&
    paymentHistory.owner === activeTokenSub;
  const undoPayment = canUsePaymentHistory ? paymentHistory.undo.at(-1) : undefined;
  const redoPayment = canUsePaymentHistory ? paymentHistory.redo.at(-1) : undefined;
  const runPaymentAction = (action: PaymentHistoryAction) => {
    const current = action.label === "Undo" ? undoPayment : redoPayment;
    if (current !== action || extractSubFromToken(getLocalPasscode()) !== activeTokenSub) return false;
    action.onClick();
    return true;
  };

  // ⚡ SILENT AUTO-MIGRATION FOR BASE WALLETS
  React.useEffect(() => {
    if (!isAccountHydrated) return;
    if (!globalData.settings?.hasMigratedBaseWallets) {
      syncedSetGlobalData(migrateBaseWallets);
      setTimeout(() => showToast("✨ Migrated base wallets to fully customizable accounts"), 1000);
    }
  }, [isAccountHydrated, globalData.settings?.hasMigratedBaseWallets]);

  // ⚡ SILENT AUTO-MIGRATION FOR OLD BILLS
  React.useEffect(() => {
    if (!isAccountHydrated) return;
    const needsMigration = globalData.library?.bills?.some(b => b && !b.wallet && typeof b.name === "string");
    if (needsMigration) {
      syncedSetGlobalData(migrateLegacyBills);
      setTimeout(() => showToast("✨ Auto-migrated legacy bills to new wallet system"), 1000);
    }
  }, [isAccountHydrated, globalData.library?.bills]);

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

  const walletDisplayLabels = useMemo(() => {
    const map: Record<string, string> = { ...(globalData?.settings?.walletLabels || {}) };
    [...(globalData?.settings?.archivedWallets ?? []), ...(globalData?.settings?.customWallets ?? [])].forEach(w => {
      map[w.id] = w.label;
    });
    return map;
  }, [globalData?.settings?.walletLabels, globalData?.settings?.customWallets, globalData?.settings?.archivedWallets]);

  const dashboardGlobalData = useMemo(() => {
    if (!globalData?.settings) return globalData;
    return {
      ...globalData,
      settings: {
        ...globalData.settings,
        walletLabels: walletDisplayLabels,
      },
    };
  }, [globalData, walletDisplayLabels]);

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
    onPaymentHistory: redo => {
      const action = redo ? redoPayment : undoPayment;
      return Boolean(action && !isEditing && !isModalOpen &&
        !document.querySelector('[aria-modal="true"]') && runPaymentAction(action));
    },
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

  const currentMonth = getMonthKey(new Date());
  const isViewingCurrentMonth = selectedMonth === currentMonth;
  const upcomingBills = useMemo(() => {
    return [currentMonth, getAdjacentMonth(currentMonth, 1)].flatMap(month => {
      const date = parseMonthKey(month);
      const log = globalData.logs[month];
      return globalData.library.bills.flatMap(bill => {
        const daysLeft = getDaysUntil(bill.dueDay, month);
        if (daysLeft < 0 || daysLeft >= 7 || log?.billsPaid?.includes(bill.id)) return [];
        if (bill.startMonth && date < parseMonthKey(bill.startMonth)) return [];
        if (bill.type === "Loan / Installment" && bill.endMonth && date > parseMonthKey(bill.endMonth)) return [];
        return [{
          id: bill.id,
          month,
          name: bill.name,
          daysLeft,
          amount: getEffectiveBillAmount(bill.amount, log?.billOverrides?.[bill.id]),
        }];
      });
    }).sort((a, b) => a.daysLeft - b.daysLeft);
  }, [currentMonth, globalData.logs, globalData.library.bills]);

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
    const importSub = extractSubFromToken(getLocalPasscode());
    if (!importSub || importSub !== dataOwnerSub) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        if (extractSubFromToken(getLocalPasscode()) !== importSub) {
          alert("The signed-in account changed. Select the backup again.");
          return;
        }
        const parsed: unknown = JSON.parse(evt.target?.result as string);
        if (!isValidFinanceBackup(parsed)) {
          alert("This file doesn't look like a valid backup.");
          return;
        }

        const preview = [
          `Wallets: ${Object.keys(parsed.wallets).length}`,
          `Commitments: ${parsed.library.bills.length}`,
          `Inflows: ${parsed.library.receivables.length}`,
          `Gigs: ${parsed.library.shoots.length}`,
          `Months with records: ${Object.keys(parsed.logs).length}`,
        ].join("\n");
        if (confirm(`Import this backup? It will replace current data.\n\n${preview}`)) {
          const importedData = migrateLegacyBills(migrateBaseWallets({
            ...parsed,
            updatedAt: (typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) && parsed.updatedAt >= 0)
              ? parsed.updatedAt
              : Date.now()
          }));

          let importError: string | undefined;
          let applied = false;
          // The sync commit evaluates this against its latest snapshot.
          syncedSetGlobalData(current => {
            if (extractSubFromToken(getLocalPasscode()) !== importSub) {
              importError = "The signed-in account changed. Select the backup again.";
              return current;
            }

            try {
              const key = `ft_import_preimage_${importSub}`;
              const recovery = JSON.stringify({
                version: 2, sub: importSub, savedAt: Date.now(), snapshot: current, imported: importedData
              });
              localStorage.setItem(key, recovery);
              if (localStorage.getItem(key) !== recovery) {
                throw new Error("Import recovery snapshot could not be verified.");
              }
            } catch {
              importError = "Import cancelled because the current data could not be backed up.";
              return current;
            }

            applied = true;
            return importedData;
          });
          if (importError) alert(importError);
          if (applied) {
            setPaymentHistory({ owner: null, undo: [], redo: [] });
            showToast("Imported backup successfully");
          }
        }
      } catch (err) {
        alert("Could not read that file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const restorePreImportBackup = () => {
    const sub = extractSubFromToken(getLocalPasscode());
    if (!sub || sub !== dataOwnerSub) return;
    if (hasActiveConflict) {
      alert("Resolve the active sync conflict before restoring an import backup.");
      return;
    }

    try {
      const raw = localStorage.getItem(`ft_import_preimage_${sub}`);
      const recovery = raw ? JSON.parse(raw) : null;
      if (recovery?.version !== 2 || recovery.sub !== sub ||
        !isValidFinanceBackup(recovery.snapshot) || !isValidFinanceBackup(recovery.imported)) {
        alert("No verified pre-import backup is available for this account.");
        return;
      }
      if (!confirm("Restore the data saved before the last import? Restore will stop if the current data has changed.")) return;

      const snapshot = recovery.snapshot;
      const imported = recovery.imported;
      const comparable = (data: UnifiedFinanceData) => JSON.stringify({ ...data, updatedAt: undefined });
      let restored = false;
      syncedSetGlobalData(current => {
        if (extractSubFromToken(getLocalPasscode()) !== sub ||
          localStorage.getItem(`ft_import_preimage_${sub}`) !== raw ||
          comparable(current) !== comparable(imported)) return current;
        restored = true;
        return snapshot;
      });
      if (restored) {
        setPaymentHistory({ owner: null, undo: [], redo: [] });
        showToast("Pre-import data restored locally.");
      } else {
        alert("Restore cancelled because the account, backup, or current data changed.");
      }
    } catch {
      alert("Could not read the pre-import backup.");
    }
  };

  // --- WHITE-LABEL AUTH GATE ---
  // If they don't have a valid Google JWT subject session, trap them on the Landing Page.
  if (!isAuth) {
    return <LandingPage onGoogleSuccess={handleGoogleSuccess} />;
  }

  // --- CLOUD HYDRATION & ONBOARDING GATE ---
  // Never render finance UI unless displayed data belongs to the active subject.
  // If the user has no existing local data for this subject, wait for the initial cloud sync
  // to settle before determining whether they need onboarding, unless a validated conflict
  // belonging to the active subject requires immediate recovery UI access.
  const reconnectNotice = syncNeedsSignIn ? (
    <section aria-label="Cloud sync paused" className="dashboard-material flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
      <div role="status" className="text-sm text-primary">
        <p className="font-semibold">Cloud sync paused</p>
        <p className="text-xs text-muted">Reconnect your Google account to sync your local changes.</p>
      </div>
      <div className="google-sign-in-frame">
        <GoogleLogin
          onSuccess={(response) => handleGoogleSuccess(response, true)}
          onError={() => showToast("Google sign-in failed. Cloud sync is still paused.")}
          theme="filled_black"
          shape="pill"
          size="medium"
        />
      </div>
    </section>
  ) : null;
  const returning = isDataOwnedByActiveSub && isReturningUser(globalData);
  if (
    !isDataOwnedByActiveSub ||
    (!returning && (syncNeedsSignIn || !hasInitialSyncCompleted) && !hasValidatedActiveConflict)
  ) {
    return (
      <div className="min-h-screen bg-shell flex flex-col items-center justify-center p-6 text-text-secondary font-sans">
        {reconnectNotice ?? (
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin text-blue-400" />
            <p className="text-xs text-muted font-medium">Checking for existing cloud data...</p>
          </div>
        )}
      </div>
    );
  }

  if (
    !hasValidatedActiveConflict &&
    shouldShowOnboarding({ globalData, isAuth, hasInitialSyncCompleted })
  ) {
    return (
      <OnboardingWizard
        globalData={globalData}
        userName={googleUser?.name}
        onComplete={(completedData) => {
          syncedSetGlobalData(completedData);
          showToast("✨ Setup complete! Welcome to Finance Tracker.");
        }}
      />
    );
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
        <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex items-center gap-2 bg-surface-high sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-12 text-strong text-xs px-4 py-2.5 rounded-xl border border-inverse/10 shadow-2xl animate-fade-in">
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          {toastAction && (toastAction === undoPayment || toastAction === redoPayment) && (
            <button
              onClick={() => runPaymentAction(toastAction)}
              className="ml-1 px-2 py-0.5 rounded-lg chip-blue hover:brightness-95 font-semibold transition"
            >
              {toastAction.label}
            </button>
          )}
        </div>
      )}

      <div className="w-full max-w-[860px] space-y-4">
        {reconnectNotice}
        {cashShortfall > 0 && (
          <div className="warning-material text-xs rounded-2xl px-4 py-3 flex items-center gap-2.5 leading-relaxed">
            <AlertTriangle size={14} className="shrink-0" />
            <span>Liquid cash is <strong className="font-mono font-semibold">₱{cashShortfall.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong> short of covering unpaid commitments{overdueBills.length > 0 ? ` (including ${overdueBills.length} overdue)` : ""}.</span>
          </div>
        )}

        <div className="flex flex-col gap-3.5 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-strong">
                {{ home: "Dashboard", operations: "Plan", wallets: "Wallets", expenses: "Expenses", account: "Account" }[activeTab]}
              </h1>
              <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium no-privacy-blur transition-all ${!isOnline || syncNeedsSignIn ? "chip-amber" : isSyncing ? "chip-blue" : "chip-emerald"}`}>
                {!isOnline ? <><WifiOff size={10} className="text-amber-400" /><span>Offline</span></> : syncNeedsSignIn ? <span>Sync paused</span> : isSyncing ? <><span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" /><span>Syncing...</span></> : <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><span>Live</span></>}
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
              <button onClick={() => setIsPrivacyMode(prev => !prev)} aria-label={isPrivacyMode ? "Show Balances" : "Hide Balances"} className={`h-8 w-8 rounded-full border flex items-center justify-center transition shadow-sm ${isPrivacyMode ? "chip-amber" : "bg-fill/80 hover:bg-fill-strong border-strong text-muted hover:text-primary"}`}>
                {isPrivacyMode ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                onClick={() => setShowNotificationModal(true)}
                aria-label="Notifications"
                className="relative h-8 w-8 rounded-full border border-strong bg-fill/80 hover:bg-fill-strong flex items-center justify-center text-muted hover:text-primary transition shadow-sm"
                title="Notifications"
              >
                <Bell size={14} />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm">
                    {notifications.length > 9 ? "9+" : notifications.length}
                  </span>
                )}
              </button>
              <PaymentHistoryMenu undo={undoPayment} redo={redoPayment} isPrivate={isPrivacyMode} onSelect={runPaymentAction} />
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
            <button onClick={() => setShowAnalyticsModal(true)} className="flex items-center gap-1.5 warning-material hover:brightness-95 px-3 py-1.5 rounded-xl text-xs transition font-medium"><Sparkles size={13} /><span>Runway</span></button>
            <button onClick={() => setShowYearlyModal(true)} className="flex items-center gap-1.5 dashboard-material text-positive hover:border-default px-3 py-1.5 rounded-xl text-xs transition font-medium"><BarChart2 size={13} /><span>Yearly</span></button>
          </div>
        </div>

        {showDatePickerModal && (
          <ErrorBoundary>
            <Suspense fallback={deferredModalFallback}>
              <DateJumpModal isOpen={showDatePickerModal} onClose={() => setShowDatePickerModal(false)} onJump={(m) => { setSelectedMonth(m); setShowDatePickerModal(false); }} selectedMonth={selectedMonth} />
            </Suspense>
          </ErrorBoundary>
        )}
        {showYearlyModal && (
          <ErrorBoundary>
            <Suspense fallback={deferredModalFallback}>
              <YearlyOverviewModal isOpen={showYearlyModal} onClose={() => setShowYearlyModal(false)} globalData={globalData} selectedYear={selectedMonth.split(" ")[1] || "2026"} />
            </Suspense>
          </ErrorBoundary>
        )}
        <SyncConflictModal
          isOpen={hasValidatedActiveConflict}
          localSnapshot={conflictState?.localSnapshot}
          cloudSnapshot={conflictState?.cloudSnapshot}
          cloudRevision={conflictState?.cloudRevision}
          onKeepLocal={() => resolveConflict("local")}
          onKeepCloud={() => resolveConflict("cloud")}
        />
        {showSettingsModal && (
          <ErrorBoundary>
            <Suspense fallback={deferredModalFallback}>
              <SettingsModal onRestoreImportBackup={restorePreImportBackup} onExport={exportBackup} onImportClick={() => importInputRef.current?.click()} isOpen={showSettingsModal} initialTab={settingsInitialTab} onClose={() => setShowSettingsModal(false)} globalData={globalData} setGlobalData={syncedSetGlobalData} totalLiquid={totalLiquid} debugLog={debugLog} onForcePush={forceManualSync} onForcePull={() => pullLatestData(false)} />
            </Suspense>
          </ErrorBoundary>
        )}
        {showGoalSetupModal && (
          <ErrorBoundary>
            <Suspense fallback={deferredModalFallback}>
              <GoalSetupModal isOpen={showGoalSetupModal} onClose={() => setShowGoalSetupModal(false)} globalData={globalData} setGlobalData={syncedSetGlobalData} />
            </Suspense>
          </ErrorBoundary>
        )}
        {showLedgerModal && (
          <ErrorBoundary>
            <Suspense fallback={deferredModalFallback}>
              <HistoricalLedgerModal isOpen={showLedgerModal} onClose={() => setShowLedgerModal(false)} globalData={globalData} setGlobalData={syncedSetGlobalData} showToast={showToast} />
            </Suspense>
          </ErrorBoundary>
        )}
        {showTransactionHistoryModal && (
          <ErrorBoundary>
            <Suspense fallback={deferredModalFallback}>
              <TransactionHistoryModal
                isOpen={showTransactionHistoryModal}
                onClose={() => setShowTransactionHistoryModal(false)}
                transactions={allTransactions}
                walletLabels={walletDisplayLabels}
                formatDateTime={formatDateTime}
                onOpenManualLedger={() => {
                  setShowTransactionHistoryModal(false);
                  setShowLedgerModal(true);
                }}
              />
            </Suspense>
          </ErrorBoundary>
        )}
        {showAnalyticsModal && (
          <ErrorBoundary>
            <Suspense fallback={deferredModalFallback}>
              <FinancialAnalyticsModal isOpen={showAnalyticsModal} onClose={() => setShowAnalyticsModal(false)} globalData={globalData} selectedMonth={selectedMonth} totalLiquid={totalLiquid} totalUnpaidCommitments={totalUnpaidCommitments} />
            </Suspense>
          </ErrorBoundary>
        )}
        <NotificationModal
          isOpen={showNotificationModal}
          onClose={() => setShowNotificationModal(false)}
          notifications={notifications}
          onDismiss={handleDismissNotification}
          onClearAll={handleClearAllNotifications}
          onNavigate={handleNotificationNavigate}
        />

        {activeTab === "home" && (
          <DashboardTab
            globalData={dashboardGlobalData}
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
            onConfigureGoal={() => setShowGoalSetupModal(true)}
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
            onOpenLedger={() => setShowTransactionHistoryModal(true)}
            activeBills={activeBills}
          />
        )}

        {activeTab === "operations" && (
          <OperationsTab
            opsTab={opsTab}
            setOpsTab={setOpsTab}
            upcomingBills={upcomingBills}
            onSelectMonth={setSelectedMonth}
            activeBills={activeBills}
            activeReceivables={activeReceivables}
            activeShoots={activeShoots}
            selectedMonth={selectedMonth}
            onToggleBillStatus={toggleBillStatus}
            onConfirmPriorBillPayments={confirmPriorBillPayments}
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
        {activeTab === "expenses" && <ExpensesTab selectedMonth={selectedMonth} globalData={globalData} setGlobalData={syncedSetGlobalData} showToast={showToast} />}

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
            onOpenTransactionHistory={() => setShowTransactionHistoryModal(true)}
            walletLabels={walletDisplayLabels}
            formatDateTime={formatDateTime}
          />
        )}
      </div>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}
