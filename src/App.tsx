import React, { useState, useMemo, useRef } from "react";
import { Calendar, Wrench, Cloud, Copy, Download, Upload, AlertTriangle, CheckCircle2, BarChart2, Sparkles, RefreshCw, WifiOff, Eye, EyeOff } from "lucide-react";
import { INITIAL_UNIFIED_DATA } from "./constants/initialData";
import { getMonthKey, getAdjacentMonth } from "./utils/dateHelpers";
import { UnifiedFinanceData, WalletState, Bill, Receivable, Shoot, BillType, ReceivableCategory, ReceivableFrequency, ShootCategory, ShootStatus, EditFormData } from "./types/finance";

import { useCloudSync } from "./hooks/useCloudSync";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { useFinanceCalculations } from "./hooks/useFinanceCalculations";

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

function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function safeLoadAll(): UnifiedFinanceData {
  try {
    const saved = localStorage.getItem("ft_master_data_v1");
    if (saved) return JSON.parse(saved);
  } catch (err) {}
  return INITIAL_UNIFIED_DATA;
}

export default function App() {
  const [showShortcutsHelp, setShowShortcutsHelp] = useState<boolean>(false);
  const [globalData, setGlobalData] = useState<UnifiedFinanceData>(safeLoadAll);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getMonthKey(new Date()));
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [showYearlyModal, setShowYearlyModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({});
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

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

  const isModalOpen = showDatePickerModal || showYearlyModal || showAnalyticsModal || showDebugModal;
  usePullToRefresh(() => pullLatestData(), isModalOpen);

  useKeyboardShortcuts({
    onToggleDatePicker: () => setShowDatePickerModal(prev => !prev),
    onToggleDebug: () => setShowDebugModal(prev => !prev),
    onToggleYearly: () => setShowYearlyModal(prev => !prev),
    onToggleAnalytics: () => setShowAnalyticsModal(prev => !prev),
    onManualSync: forceManualSync,
    onPullData: () => pullLatestData(false),
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

  const handleWalletCommit = (key: string, value: number) => {
    setGlobalData(p => ({ ...p, wallets: { ...p.wallets, [key]: value } }));
  };

  const incrementWallet = (key: string, addAmount: number) => {
    const current = parseFloat(String(globalData.wallets[key])) || 0;
    const num = current + addAmount;
    setGlobalData(p => ({ ...p, wallets: { ...p.wallets, [key]: num } }));
  };

  const handleExecutePaydaySplit = () => {
    const newWallets: WalletState = {
      ...globalData.wallets,
      maya: (parseFloat(String(globalData.wallets.maya)) || 0) + targetMayaAllocation,
      maribank: (parseFloat(String(globalData.wallets.maribank)) || 0) + targetMariBankAllocation,
      gcash: (parseFloat(String(globalData.wallets.gcash)) || 0) + targetGCashAllocation,
      gotyme: (parseFloat(String(globalData.wallets.gotyme)) || 0) + targetGoTymeAllocation
    };
    setGlobalData(p => ({ ...p, wallets: newWallets }));
    showToast("✨ Payday split automatically distributed to wallets!");
  };

  const toggleBillStatus = (bill: Bill) => {
    const target = bill.targetMonthForDue || selectedMonth;
    setGlobalData(p => {
      const mLog = p.logs[target] || { billsPaid: [], recsCollected: {} };
      const isPaid = mLog.billsPaid?.includes(bill.id);
      const newPaid = isPaid ? (mLog.billsPaid || []).filter(x => x !== bill.id) : [...(mLog.billsPaid || []), bill.id];
      return { ...p, logs: { ...p.logs, [target]: { ...mLog, billsPaid: newPaid } } };
    });
  };

  const toggleReceivableStatus = (rec: Receivable) => {
    const target = rec.targetMonthForDue || selectedMonth;
    const fullAmt = parseFloat(String(rec.amount)) || 0;

    setGlobalData(p => {
      const logs = p.logs || {};
      const mLog = logs[target] || { billsPaid: [], recsCollected: {} };
      const recsCollected = mLog.recsCollected || {};
      const rLog = recsCollected[rec.id] || { amountReceived: 0, collected: false };

      const willCollect = !rLog.collected;
      const nextReceived = willCollect ? fullAmt : 0;

      return {
        ...p,
        logs: {
          ...logs,
          [target]: {
            ...mLog,
            recsCollected: {
              ...recsCollected,
              [rec.id]: { amountReceived: nextReceived, collected: willCollect }
            }
          }
        }
      };
    });
  };

  const addPayment = (rec: Receivable, amt: number) => {
    const target = rec.targetMonthForDue || selectedMonth;
    setGlobalData(p => {
      const mLog = p.logs[target] || { billsPaid: [], recsCollected: {} };
      const rLog = mLog.recsCollected?.[rec.id] || { amountReceived: 0, collected: false };
      const newAmt = rLog.amountReceived + amt;
      const fullyPaid = newAmt >= parseFloat(String(rec.amount));
      return { ...p, logs: { ...p.logs, [target]: { ...mLog, recsCollected: { ...mLog.recsCollected, [rec.id]: { amountReceived: newAmt, collected: fullyPaid } } } } };
    });
  };

  const toggleShootCompletion = (id: string) => {
    setGlobalData(p => ({ ...p, library: { ...p.library, shoots: p.library.shoots.map(s => s.id === id ? { ...s, completed: !s.completed } : s) } }));
  };

  const handleAddBill = (nb: { name: string; amount: number; dueDay: string; type: BillType; startMonth: string; endMonth: string }) => {
    const isLoan = nb.type === "Loan / Installment";
    const billObj: Bill = { 
      id: generateId("b"), 
      name: nb.name, 
      amount: nb.amount, 
      dueDay: nb.dueDay, 
      type: nb.type, 
      startMonth: isLoan ? nb.startMonth : selectedMonth, 
      endMonth: isLoan ? nb.endMonth : "" 
    };
    setGlobalData(p => ({ ...p, library: { ...p.library, bills: [...p.library.bills, billObj] } }));
    showToast(`Added ${nb.name}`);
  };

  const handleAddReceivable = (nr: { name: string; amount: number; category: ReceivableCategory; frequency: ReceivableFrequency; biMonthlyDays?: string; monthlyDay?: string; date?: string }) => {
    const recObj: Receivable = { 
      id: generateId("r"), 
      name: nr.name, 
      amount: nr.amount, 
      category: nr.category || "Shoot", 
      frequency: nr.frequency, 
      biMonthlyDays: nr.frequency === "Bi-monthly" ? nr.biMonthlyDays : "", 
      monthlyDay: nr.frequency === "Monthly" ? nr.monthlyDay : "", 
      date: nr.frequency === "By Date" ? nr.date : "", 
      startMonth: selectedMonth 
    };
    setGlobalData(p => ({ ...p, library: { ...p.library, receivables: [...p.library.receivables, recObj] } }));
    showToast(`Added ${nr.name}`);
  };

  const handleAddShoot = (ns: { title: string; date: string; category: ShootCategory; status: ShootStatus }) => {
    const shootObj: Shoot = { 
      id: generateId("s"), 
      title: ns.title, 
      date: ns.date, 
      category: ns.category || "Solo Shoot", 
      status: ns.status, 
      completed: false 
    };
    setGlobalData(p => ({ ...p, library: { ...p.library, shoots: [...p.library.shoots, shootObj] } }));
    showToast(`Added ${ns.title}`);
  };

  const deleteItem = (category: "bills" | "receivables" | "shoots", id: string) => {
    if (!confirm("Delete this item from your library?")) return;
    setGlobalData(p => {
      if (category === "bills") {
        return { ...p, library: { ...p.library, bills: p.library.bills.filter(i => i.id !== id) } };
      }
      if (category === "receivables") {
        return { ...p, library: { ...p.library, receivables: p.library.receivables.filter(i => i.id !== id) } };
      }
      return { ...p, library: { ...p.library, shoots: p.library.shoots.filter(i => i.id !== id) } };
    });
    if (editingId === id) setEditingId(null);
    showToast("Deleted item");
  };

  const saveEditing = (category: "bills" | "receivables" | "shoots", scope: "monthOnly" | "default" = "monthOnly") => {
    if (category === "bills" && scope === "monthOnly") {
      const inputAmount = parseFloat(String(editForm.amount || 0)) || 0;
      setGlobalData(p => {
        const mLog = p.logs[selectedMonth] || { billsPaid: [], recsCollected: {}, billOverrides: {} };
        return {
          ...p,
          logs: {
            ...p.logs,
            [selectedMonth]: {
              ...mLog,
              billOverrides: {
                ...(mLog.billOverrides || {}),
                [editingId!]: inputAmount
              }
            }
          }
        };
      });
      showToast(`Updated ${editForm.name} for ${selectedMonth} only`);
    } else {
      setGlobalData(p => {
        if (category === "bills") {
          return {
            ...p,
            library: {
              ...p.library,
              bills: p.library.bills.map(i => i.id === editingId ? ({ ...i, ...editForm, amount: parseFloat(String(editForm.amount || 0)) || 0 } as Bill) : i)
            }
          };
        }
        if (category === "receivables") {
          return {
            ...p,
            library: {
              ...p.library,
              receivables: p.library.receivables.map(i => i.id === editingId ? ({ ...i, ...editForm, amount: parseFloat(String(editForm.amount || 0)) || 0 } as Receivable) : i)
            }
          };
        }
        return {
          ...p,
          library: {
            ...p.library,
            shoots: p.library.shoots.map(i => i.id === editingId ? ({ ...i, ...editForm, title: editForm.title || i.title } as Shoot) : i)
          }
        };
      });
      showToast("Default saved in Library");
    }
    setEditingId(null);
  };

  const resetMonthOverride = (billId: string) => {
    setGlobalData(p => {
      const mLog = p.logs[selectedMonth];
      if (!mLog?.billOverrides?.[billId]) return p;
      const nextOverrides = { ...mLog.billOverrides };
      delete nextOverrides[billId];
      return {
        ...p,
        logs: {
          ...p.logs,
          [selectedMonth]: {
            ...mLog,
            billOverrides: nextOverrides
          }
        }
      };
    });
    setEditingId(null);
    showToast("Reset to default library balance");
  };

  const copySummaryToClipboard = () => {
    const unpaid = activeBills.filter(b => !b.paid);
    const pending = activeReceivables.filter(r => !r.collected);
    const fmt = (n: number | string) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });

    const totalPendingAmount = pending.reduce((acc, r) => {
      const rec = parseFloat(String(r.amountReceived)) || 0;
      return acc + Math.max(0, (parseFloat(String(r.amount)) || 0) - rec);
    }, 0);

    const netPosition = totalLiquid + totalPendingAmount - totalUnpaidCommitments;

    const walletLines = [
      `  • MariBank (Japan Fund): ₱${fmt(globalData?.wallets?.maribank)}`,
      `  • Maya: ₱${fmt(globalData?.wallets?.maya)}`,
      `  • GCash: ₱${fmt(globalData?.wallets?.gcash)}`,
      `  • GoTyme: ₱${fmt(globalData?.wallets?.gotyme)}`,
      `  • BPI: ₱${fmt(globalData?.wallets?.bpi)}`,
      `  • Cash On-Hand: ₱${fmt(globalData?.wallets?.cash)}`
    ].join("\n");

    const billLines = unpaid.map(b => {
      const daysLeft = b.daysLeft ?? 0;
      const dueInfo = daysLeft < 0 
        ? `[OVERDUE by ${Math.abs(daysLeft)}d | Due: Day ${b.dueDay}]`
        : daysLeft === 0 
        ? `[DUE TODAY | Day ${b.dueDay}]`
        : `[Due in ${daysLeft}d | Day ${b.dueDay}]`;
      return `  • ${b.name} (${b.type}): ₱${fmt(b.amount)} ${dueInfo}`;
    }).join("\n") || "  • None (All paid)";

    const recLines = pending.map(r => {
      const rec = parseFloat(String(r.amountReceived)) || 0;
      const rem = Math.max(0, (parseFloat(String(r.amount)) || 0) - rec);
      const cat = r.category || "Income";
      const freqInfo = r.frequency === "By Date" 
        ? (r.date ? new Date(r.date.replace(/-/g, "/")).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Date TBA")
        : r.frequency === "Bi-monthly" 
        ? (r.biMonthlyDays || "15th & 30th") 
        : `Monthly (Day ${r.monthlyDay || "15"})`;

      return rec > 0
        ? `  • ${r.name} [${cat} | ${freqInfo}]: ₱${fmt(rem)} remaining (₱${fmt(rec)} collected of ₱${fmt(r.amount)})`
        : `  • ${r.name} [${cat} | ${freqInfo}]: ₱${fmt(r.amount)}`;
    }).join("\n") || "  • None (All collected)";

    const text = `========================================
FINANCIAL STATUS REPORT: ${selectedMonth.toUpperCase()}
Generated: ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
========================================

1. LIQUID CASH BREAKDOWN
${walletLines}
----------------------------------------
TOTAL LIQUID CASH: ₱${fmt(totalLiquid)}

2. UNPAID COMMITMENTS (${unpaid.length} pending, ${overdueBills.length} overdue)
${billLines}
----------------------------------------
TOTAL UNPAID BILLS: ₱${fmt(totalUnpaidCommitments)}

3. PENDING RECEIVABLES & INFLOWS (${pending.length} pending)
${recLines}
----------------------------------------
TOTAL PENDING INFLOWS: ₱${fmt(totalPendingAmount)}

4. GOAL TRACKING & NET OUTLOOK
• Japan ADB Milestone: ₱${fmt(globalData?.wallets?.maribank)} / ₱${fmt(targetMilestoneFund)} (${fundProgressPercent}%)
• Month Income Collected: ₱${fmt(monthIncomeCollected)}
• Net Projected Position: ₱${fmt(netPosition)} ${netPosition >= 0 ? "(Surplus)" : "(Shortfall)"}
========================================`;

    navigator.clipboard.writeText(text);
    showToast("📋 Detailed summary copied to clipboard!");
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
        if (!parsed.wallets || !parsed.library || !Array.isArray(parsed.library.bills)) {
          alert("This file doesn't look like a valid backup.");
          return;
        }
        if (confirm("Import this backup? It will replace current data.")) {
          setGlobalData(parsed);
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
        />

        <YearlyOverviewModal
          isOpen={showYearlyModal}
          onClose={() => setShowYearlyModal(false)}
          globalData={globalData}
          selectedYear={selectedMonth.split(" ")[1] || "2026"}
        />

        <SyncDiagnosticsModal
          isOpen={showDebugModal}
          onClose={() => setShowDebugModal(false)}
          globalData={globalData}
          totalLiquid={totalLiquid}
          debugLog={debugLog}
          setDebugLog={setDebugLog}
          setGlobalData={setGlobalData}
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
            onDeleteBill={(id) => deleteItem("bills", id)}
            onSaveEdit={saveEditing}
            onResetMonthOverride={resetMonthOverride}
            editingId={editingId}
            setEditingId={setEditingId}
            editForm={editForm}
            setEditForm={setEditForm}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <ReceivablesTable
            activeReceivables={activeReceivables}
            selectedMonth={selectedMonth}
            onToggleStatus={toggleReceivableStatus}
            onAddPayment={addPayment}
            onAddReceivable={handleAddReceivable}
            onDeleteReceivable={(id) => deleteItem("receivables", id)}
            onSaveEdit={saveEditing}
            editingId={editingId}
            setEditingId={setEditingId}
            editForm={editForm}
            setEditForm={setEditForm}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <ShootsTable
            activeShoots={activeShoots}
            selectedMonth={selectedMonth}
            onToggleCompletion={toggleShootCompletion}
            onAddShoot={handleAddShoot}
            onDeleteShoot={(id) => deleteItem("shoots", id)}
            onSaveEdit={saveEditing}
            editingId={editingId}
            setEditingId={setEditingId}
            editForm={editForm}
            setEditForm={setEditForm}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <WalletGrid
            wallets={globalData?.wallets || {}}
            onCommit={handleWalletCommit}
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