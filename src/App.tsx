import React, { useState, useMemo, useRef } from "react";
import { Calendar, Wrench, Settings, Cloud, Copy, Download, Upload, AlertTriangle, CheckCircle2, BarChart2, Sparkles, RefreshCw, WifiOff, Eye, EyeOff } from "lucide-react";
import { INITIAL_UNIFIED_DATA } from "./constants/initialData";
import { getMonthKey, getAdjacentMonth } from "./utils/dateHelpers";
import { UnifiedFinanceData, WalletState, EditFormData } from "./types/finance";
import { buildFinancialSummary } from "./utils/summaryHelpers";

import { useCloudSync } from "./hooks/useCloudSync";
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
import { SyncDiagnosticsModal } from "./components/SyncDiagnosticsModal";
import { SettingsModal } from "./components/SettingsModal";

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

export default function App() {
  const [showShortcutsHelp, setShowShortcutsHelp] = useState<boolean>(false);
  const [globalData, setGlobalData] = useState<UnifiedFinanceData>(safeLoadAll);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getMonthKey(new Date()));
const {
  commitWallet,
  incrementWallet
} = useWalletActions({
  setGlobalData
});
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [showYearlyModal, setShowYearlyModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({});
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const paydaySplitInProgressRef = useRef(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

const {
  addBill: handleAddBill,
  toggleBillStatus,
  deleteBill
} = useBillActions({
    setGlobalData,
  selectedMonth,
  showToast
});

const {
  addReceivable: handleAddReceivable,
  toggleReceivableStatus,
  addPayment,
  deleteReceivable
} = useReceivableActions({
  setGlobalData,
  selectedMonth,
  showToast
});

const {
  addShoot: handleAddShoot,
  toggleShootCompletion,
  deleteShoot
} = useShootActions({
  setGlobalData,
  showToast
});

const { resetMonthOverride } = useBillEditActions({
  setGlobalData,
  selectedMonth,
  showToast
});

const { saveBillEdit } = useBillSaveActions({
  setGlobalData,
  selectedMonth,
  editingId,
  editForm,
  setEditingId,
  showToast
});

const { saveReceivableEdit } = useReceivableSaveActions({
  setGlobalData,
  editingId,
  editForm,
  setEditingId,
  showToast
});

const { saveShootEdit } = useShootSaveActions({
  setGlobalData,
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
    pullLatestData
  } = useCloudSync(globalData, setGlobalData, showToast);

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
    targetMayaAllocation,
    targetMariBankAllocation,
    targetGCashAllocation,
    targetGoTymeAllocation,
    remainingBuffer
  } = useFinanceCalculations(globalData, selectedMonth);

  const isModalOpen =
    showDatePickerModal ||
    showYearlyModal ||
    showAnalyticsModal ||
    showDebugModal;

  const isEditing = editingId !== null;

  usePullToRefresh(
    () => {
      if (isEditing) {
        showToast("✏️ Finish editing before pulling cloud data.");
        return;
      }

      pullLatestData();
    },
    isModalOpen || isEditing
  );

  useKeyboardShortcuts({
    onToggleDatePicker: () => setShowDatePickerModal(prev => !prev),
    onToggleDebug: () => setShowDebugModal(prev => !prev),
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
    onCloseAll: () => {
    setShowDatePickerModal(false);
    setShowYearlyModal(false);
    setShowAnalyticsModal(false);
    setShowDebugModal(false);
    setEditingId(null);
  }
});

  const dropdownMonths = useMemo(() => [
    getAdjacentMonth(selectedMonth, -1),
    selectedMonth,
    getAdjacentMonth(selectedMonth, 1),
    getAdjacentMonth(selectedMonth, 2)
  ], [selectedMonth]);

  const handleExecutePaydaySplit = () => {
    if (paydaySplitInProgressRef.current) return;

    if (remainingBuffer < 0) {
      showToast("⚠️ Payday allocation exceeds the configured payout.");
      return;
    }

    const now = new Date();
    const executionKey =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    if (globalData.paydaySplitExecutions?.includes(executionKey)) {
      showToast("⚠️ Payday split already executed today.");
      return;
    }

    paydaySplitInProgressRef.current = true;

    try {
      const totalDistribution =
        targetMayaAllocation +
        targetMariBankAllocation +
        targetGCashAllocation +
        targetGoTymeAllocation;

      const confirmed = confirm(
        `Distribute ₱${totalDistribution.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })} into your wallets?\n\n` +
        `Maya: ₱${targetMayaAllocation.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}\n` +
        `MariBank: ₱${targetMariBankAllocation.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}\n` +
        `GCash: ₱${targetGCashAllocation.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}\n` +
        `GoTyme: ₱${targetGoTymeAllocation.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`
      );

      if (!confirmed) return;

      setGlobalData(prev => {
        const executions = prev.paydaySplitExecutions || [];

        if (executions.includes(executionKey)) {
          return prev;
        }

        return {
          ...prev,
          wallets: {
            ...prev.wallets,
            maya: (parseFloat(String(prev.wallets.maya)) || 0) + targetMayaAllocation,
            maribank: (parseFloat(String(prev.wallets.maribank)) || 0) + targetMariBankAllocation,
            gcash: (parseFloat(String(prev.wallets.gcash)) || 0) + targetGCashAllocation,
            gotyme: (parseFloat(String(prev.wallets.gotyme)) || 0) + targetGoTymeAllocation
          },
          paydaySplitExecutions: [...executions, executionKey],
          updatedAt: Date.now()
        };
      });

      showToast("✨ Payday split automatically distributed to wallets!");
    } finally {
      paydaySplitInProgressRef.current = false;
    }
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

          setGlobalData(importedData);
          showToast("Imported backup successfully");
        }
      } catch (err) {
        alert("Could not read that file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className={`min-h-screen bg-[#070709] text-[#d4d4d8] py-8 px-4 sm:px-6 flex justify-center selection:bg-blue-600 selection:text-white ${isPrivacyMode ? "privacy-mode" : ""}`}>
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#181822] text-white text-xs px-4 py-2.5 rounded-xl border border-white/10 shadow-2xl animate-fade-in">
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="w-full max-w-[860px] space-y-4">
        {cashShortfall > 0 && (
          <div className="bg-[#2a1712] border border-orange-900/50 text-orange-300 text-[11px] rounded-2xl px-4 py-3 flex items-center gap-2.5 shadow-lg">
            <AlertTriangle size={14} className="shrink-0 text-orange-400" />
            <span>Liquid cash is <strong className="font-mono">₱{cashShortfall.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong> short of covering unpaid commitments{overdueBills.length > 0 ? ` (including ${overdueBills.length} overdue)` : ""}.</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-1 gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Financial Dashboard
              </h1>
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium no-privacy-blur border transition-all ${
                !isOnline
                  ? "bg-amber-950/60 border-amber-700/50 text-amber-300"
                  : isSyncing
                  ? "bg-blue-950/60 border-blue-700/50 text-blue-300"
                  : "bg-emerald-950/40 border-emerald-800/40 text-emerald-400"
              }`}>
                {!isOnline ? (
                  <>
                    <WifiOff size={10} className="text-amber-400" />
                    <span>Offline (Local)</span>
                  </>
                ) : isSyncing ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Live</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1.5">
              <div className="relative inline-block">
                <button
                  type="button"
                  aria-label="View Keyboard Shortcuts"
                  onClick={() => setShowShortcutsHelp(prev => !prev)}
                  className="text-[11px] font-medium no-privacy-blur text-zinc-400 hover:text-zinc-200 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 shadow-sm"
                  title="View Keyboard Shortcuts"
                >
                  <span>⌨️</span>
                  <span className="font-medium">Shortcuts</span>
                </button>

                {showShortcutsHelp && (
                  <div 
                    className="absolute left-0 mt-2 z-50 w-64 p-3 bg-[#121216] border border-zinc-800 rounded-xl shadow-2xl backdrop-blur-md text-xs space-y-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80">
                      <span className="text-zinc-300 font-semibold flex items-center gap-1.5">
                        <span>⌨️</span> Shortcuts
                      </span>
                      <button
                        type="button"
                        aria-label="Close shortcuts help"
                        onClick={() => setShowShortcutsHelp(false)}
                        className="text-zinc-500 hover:text-zinc-300 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50">
                        <span className="text-zinc-400">Month</span>
                        <kbd className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded font-mono text-[10px]">⌘K</kbd>
                      </div>
                      <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50">
                        <span className="text-zinc-400">Yearly</span>
                        <kbd className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded font-mono text-[10px]">Y</kbd>
                      </div>
                      <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50">
                        <span className="text-zinc-400">Analytics</span>
                        <kbd className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded font-mono text-[10px]">A</kbd>
                      </div>
                      <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50">
                        <span className="text-zinc-400">Cloud Sync</span>
                        <kbd className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded font-mono text-[10px]">S</kbd>
                      </div>
                      <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50">
                        <span className="text-zinc-400">Diagnostics</span>
                        <kbd className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded font-mono text-[10px]">⌘D</kbd>
                      </div>
                      <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50">
                        <span className="text-zinc-400">Close</span>
                        <kbd className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded font-mono text-[10px]">Esc</kbd>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button 
                onClick={() => setIsPrivacyMode(prev => !prev)} 
                aria-label={isPrivacyMode ? "Show Balances" : "Hide/Blur Balances for Screenshot"}
                title={isPrivacyMode ? "Show Balances" : "Hide/Blur Balances for Screenshot"} 
                className={`h-6 w-6 rounded-md border flex items-center justify-center transition shadow-sm ${
                  isPrivacyMode
                    ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                    : "bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {isPrivacyMode ? <EyeOff size={11} /> : <Eye size={11} />}
              </button>

              <button 
                onClick={() => setShowSettingsModal(true)} 
                aria-label="App Settings"
                title="Settings" 
                className="h-6 w-6 rounded-md bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/50 text-zinc-400 hover:text-amber-400 flex items-center justify-center transition shadow-sm"
              >
                <Settings size={11} />
              </button>
              
              <button 
                onClick={() => setShowDebugModal(true)} 
                aria-label="Open Diagnostics & Settings"
                title="Sync Diagnostics & Settings (Press ⌘D)" 
                className="h-6 w-6 rounded-md bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 text-zinc-400 hover:text-emerald-400 flex items-center justify-center transition shadow-sm"
              >
                <Wrench size={11} />
              </button>

              <button 
                onClick={forceManualSync} 
                aria-label="Save and Sync"
                title="Save & Sync (Press S)" 
                className="h-6 w-6 rounded-md bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-blue-500/50 flex items-center justify-center text-zinc-400 hover:text-blue-400 transition shadow-sm"
              >
                <Cloud size={12} className={isSyncing ? "animate-pulse text-blue-400" : ""} />
              </button>

              <button 
                onClick={() => pullLatestData(false)} 
                aria-label="Refresh and Pull Cloud Data"
                title="Refresh & Pull Cloud Data (Press R)" 
                className="h-6 w-6 rounded-md bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition shadow-sm"
              >
                <RefreshCw size={11} className={isSyncing ? "animate-spin text-emerald-400" : ""} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={() => setShowAnalyticsModal(true)} 
              className="flex items-center gap-1.5 bg-[#121217] border border-amber-500/30 hover:border-amber-400/60 text-amber-300 hover:text-amber-200 px-3 py-1 rounded-xl text-xs shadow-md transition font-medium"
            >
              <Sparkles size={13} className="text-amber-400" />
              <span>Runway</span>
            </button>

            <button 
              onClick={() => setShowYearlyModal(true)} 
              className="flex items-center gap-1.5 bg-[#121217] border border-emerald-500/30 hover:border-emerald-400/60 text-emerald-300 hover:text-emerald-200 px-3 py-1 rounded-xl text-xs shadow-md transition font-medium"
            >
              <BarChart2 size={13} className="text-emerald-400" />
              <span>Year</span>
            </button>

            <div className="flex items-center gap-1.5 bg-[#121217] border border-white/[0.08] px-3 py-1 rounded-xl text-xs shadow-md">
              <Calendar size={13} className="text-blue-400 cursor-pointer" onClick={() => setShowDatePickerModal(true)} />
              <select value={selectedMonth} onChange={(e) => { if (e.target.value === "CUSTOM_DATE_JUMP") setShowDatePickerModal(true); else setSelectedMonth(e.target.value); }} className="bg-transparent text-white font-semibold outline-none cursor-pointer">
                {dropdownMonths.map(m => <option key={m} value={m} className="bg-[#121216]">{m}</option>)}
                <option disabled>──────────</option>
                <option value="CUSTOM_DATE_JUMP" className="bg-[#121216] font-bold text-blue-400">Select Month/Year...</option>
              </select>
            </div>
          </div>
        </div>

        <DateJumpModal
          isOpen={showDatePickerModal}
          onClose={() => setShowDatePickerModal(false)}
          onJump={(m) => { setSelectedMonth(m); setShowDatePickerModal(false); }}
          selectedMonth={selectedMonth}
        />

        <YearlyOverviewModal
          isOpen={showYearlyModal}
          onClose={() => setShowYearlyModal(false)}
          globalData={globalData}
          selectedYear={selectedMonth.split(" ")[1] || "2026"}
        />

        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          globalData={globalData}
          setGlobalData={setGlobalData}
        />

        <SyncDiagnosticsModal
          isOpen={showDebugModal}
          onClose={() => setShowDebugModal(false)}
          globalData={globalData}
          totalLiquid={totalLiquid}
          debugLog={debugLog}
          onForcePush={forceManualSync}
          onForcePull={() => pullLatestData(false)}
        />

        <FinancialAnalyticsModal
          isOpen={showAnalyticsModal}
          onClose={() => setShowAnalyticsModal(false)}
          globalData={globalData}
          selectedMonth={selectedMonth}
          totalLiquid={totalLiquid}
          totalUnpaidCommitments={totalUnpaidCommitments}
        />

        <ErrorBoundary>
          <MilestoneProgressBar
            maribankBalance={globalData?.wallets?.maribank || 0}
            targetFund={targetMilestoneFund}
            goalName={globalData?.settings?.goalName}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <MetricsSummaryGrid
            totalLiquid={totalLiquid}
            fundProgressPercent={fundProgressPercent}
            totalPendingReceivables={totalPendingReceivables}
            monthIncomeCollected={monthIncomeCollected}
            selectedMonth={selectedMonth}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <ExecutionFlowCard
            priorityUnpaidSum={priorityUnpaidSum}
            totalUnpaidCommitments={totalUnpaidCommitments}
            overdueBills={overdueBills}
            overdueSum={overdueSum}
            targetMayaAllocation={targetMayaAllocation}
            targetMariBankAllocation={targetMariBankAllocation}
            targetGCashAllocation={targetGCashAllocation}
            targetGoTymeAllocation={targetGoTymeAllocation}
            remainingBuffer={remainingBuffer}
            onExecutePaydaySplit={handleExecutePaydaySplit}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <BillsTable
            activeBills={activeBills}
            selectedMonth={selectedMonth}
            onToggleStatus={toggleBillStatus}
            onAddBill={handleAddBill}
            onDeleteBill={deleteBill}
            onSaveEdit={(_, scope) => saveBillEdit(scope)}
            onResetMonthOverride={resetMonthOverride}
            editingId={editingId}
            setEditingId={setEditingId}
            editForm={editForm}
            setEditForm={setEditForm}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <ReceivablesTable
            inflowsLabel={globalData?.settings?.inflowsLabel}
            inflowCategories={globalData?.settings?.inflowCategories}
            activeReceivables={activeReceivables}
            selectedMonth={selectedMonth}
            onToggleStatus={toggleReceivableStatus}
            onAddPayment={addPayment}
            onAddReceivable={handleAddReceivable}
            onDeleteReceivable={deleteReceivable}
            onSaveEdit={() => saveReceivableEdit()}
            editingId={editingId}
            setEditingId={setEditingId}
            editForm={editForm}
            setEditForm={setEditForm}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <ShootsTable
            gigsLabel={globalData?.settings?.gigsLabel}
            gigCategories={globalData?.settings?.gigCategories}
            activeShoots={activeShoots}
            selectedMonth={selectedMonth}
            onToggleCompletion={toggleShootCompletion}
            onAddShoot={handleAddShoot}
            onDeleteShoot={deleteShoot}
            onSaveEdit={() => saveShootEdit()}
            editingId={editingId}
            setEditingId={setEditingId}
            editForm={editForm}
            setEditForm={setEditForm}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <WalletGrid
            wallets={globalData?.wallets || {}}
            onCommit={commitWallet}
            onIncrement={incrementWallet}
          />
        </ErrorBoundary>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <button onClick={copySummaryToClipboard} aria-label="Copy summary to clipboard" className="w-full bg-[#121217]/90 hover:bg-white/[0.06] border border-white/[0.06] text-zinc-200 font-semibold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition text-xs shadow-md"><Copy size={14} /> Copy Summary</button>
          <button onClick={exportBackup} aria-label="Export JSON backup" className="w-full bg-[#121217]/90 hover:bg-white/[0.06] border border-white/[0.06] text-zinc-200 font-semibold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition text-xs shadow-md"><Download size={14} /> Export Backup</button>
          <button onClick={() => importInputRef.current?.click()} aria-label="Import JSON backup" className="w-full bg-[#121217]/90 hover:bg-white/[0.06] border border-white/[0.06] text-zinc-200 font-semibold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition text-xs shadow-md"><Upload size={14} /> Import Backup</button>
          <input ref={importInputRef} type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
        </div>
      </div>
    </div>
  );
}