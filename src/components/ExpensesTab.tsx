import { compareTransactionsNewestFirst, formatTransactionDateTime } from "../utils/transactionDates";
import { formatPHP, roundMoney } from "../utils/currency";
import React, { useEffect, useId, useRef, useState } from "react";
import { Camera, ScanLine, Plus, Receipt, Trash2, CheckCircle2, Upload, X } from "lucide-react";
import { UnifiedFinanceData, Expense, ExpenseCategory } from "../types/finance";
import { getDefaultExpenseWalletId } from "../utils/financeHelpers";
import { getMonthKey, parseMonthKey } from "../utils/dateHelpers";
import { useExpenseActions } from "../hooks/useExpenseActions";
import { useExpenseScanner } from "../hooks/useExpenseScanner";
import { QUICK_EXPENSE_HASH } from "../constants/config";
import { findPossibleDuplicateExpense, readReceiptDraft } from "../utils/receiptDraft";
import { Modal } from "./ui/Modal";
import { entryDialogStyles } from "./ui/dialogStyles";

const EXPENSE_CATEGORIES: ExpenseCategory[] = ["Food & Dining", "Transport", "Utilities", "Laundry & Home", "Shopping", "Other"];

const expenseEntryCardClass = "flex min-w-0 flex-col items-start gap-2 rounded-2xl border border-subtle bg-surface-elevated p-3 text-left hover:bg-fill sm:p-4";

interface ExpensesTabProps {
  globalData: UnifiedFinanceData;
  selectedMonth?: string;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  showToast: (msg: string) => void;
  walletLabels?: Record<string, string>;
}

const getLocalToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const ExpensesTab: React.FC<ExpensesTabProps> = ({ globalData, setGlobalData, showToast, selectedMonth = getMonthKey(new Date()) }) => {
  const expenseFormId = useId();
  const [showForm, setShowForm] = useState(false);
  const [showScanOptions, setShowScanOptions] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [receiptText, setReceiptText] = useState("");
  const [importNote, setImportNote] = useState("");
  const [saveError, setSaveError] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [quickEntryCount, setQuickEntryCount] = useState(0);
  const expensePanelRef = useRef<HTMLDivElement>(null);
  const hasDraft = useRef(false);
  const defaultWallet = getDefaultExpenseWalletId("Food & Dining", globalData.settings, globalData.wallets);

  const [form, setForm] = useState({
    merchant: "",
    amount: "",
    category: "Food & Dining" as ExpenseCategory | string,
    wallet: defaultWallet,
    date: getLocalToday()
  });

  useEffect(() => {
    const openQuickExpense = () => {
      const { hash, pathname, search } = window.location;
      if (hash !== QUICK_EXPENSE_HASH) return;
      // Consume the request after this screen mounts, so sign-in can finish first.
      window.history.replaceState(window.history.state, "", pathname + search);
      if (!hasDraft.current) {
        setForm(current => ({ ...current, wallet: defaultWallet, date: getLocalToday() }));
      }
      setShowScanOptions(false);
      setShowForm(true);
      setQuickEntryCount(count => count + 1);
    };
    openQuickExpense();
    window.addEventListener("hashchange", openQuickExpense);
    return () => window.removeEventListener("hashchange", openQuickExpense);
  }, [defaultWallet]);

  useEffect(() => {
    if (showForm) {
      expensePanelRef.current?.closest<HTMLElement>('[role="dialog"]')?.focus();
    }
  }, [showForm, showPaste, quickEntryCount]);

  const { isScanning, failure, retryScan, fileInputRef, handleCapture, stopScanning } = useExpenseScanner({
    showToast,
    globalData,
    onScanStart: () => { setSaveError(""); setShowForm(true); },
    onScanComplete: (result) => {
      hasDraft.current = true;
      setForm(prev => ({ ...prev, ...result }));
    },
  });

  const {
    handleSaveExpense,
    handleDeleteExpense,
  } = useExpenseActions({
    globalData,
    setGlobalData,
    showToast,
  });

  const closePaste = () => {
    setShowPaste(false);
    setReceiptText("");
  };

  const resetDraft = () => {
    hasDraft.current = false;
    setImportNote("");
    setForm({ merchant: "", amount: "", category: "Food & Dining", wallet: defaultWallet, date: getLocalToday() });
  };

  const closeExpense = () => {
    if (isScanning) stopScanning();
    closePaste();
    resetDraft();
    setSaveError("");
    setShowForm(false);
  };

  const createTextDraft = (event: React.FormEvent) => {
    event.preventDefault();
    if (!receiptText.trim()) return;
    const extracted = readReceiptDraft(receiptText);
    const hadDraft = hasDraft.current;
    stopScanning();
    setForm(current => ({
      ...current,
      merchant: current.merchant || extracted.merchant || "",
      amount: current.amount || extracted.amount || "",
      date: hadDraft ? current.date : extracted.date ?? getLocalToday(),
    }));
    hasDraft.current = true;
    setImportNote(extracted.merchant || extracted.amount || extracted.date
      ? "Check the filled details, including the date and wallet, before saving."
      : "No clear expense details found. Enter them manually before saving.");
    closePaste();
    setSaveError("");
  };

  const expenses = [...(globalData.library?.expenses || [])].sort(compareTransactionsNewestFirst);
  const duplicate = showForm ? findPossibleDuplicateExpense(expenses, form) : undefined;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (isScanning) return;
    if (duplicate && !window.confirm("A saved expense has the same merchant, amount, and date. Save this as a separate expense?")) return;

    handleSaveExpense(
      form,
      () => { stopScanning(); setShowForm(false); },
      resetDraft,
      setSaveError
    );
  };

  const handleDelete = (exp: Expense) => {
    handleDeleteExpense(exp);
  };

  const customWallets = globalData.settings?.customWallets || [];

  const allWallets = customWallets || [];

  const totalSpent = expenses.reduce((total, expense) => total + expense.amount, 0);
  const month = parseMonthKey(selectedMonth);
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-`;
  const monthExpenses = expenses.filter(expense => expense.date.startsWith(monthPrefix));
  const monthTotal = monthExpenses.reduce((total, expense) => total + expense.amount, 0);

  return (
    <>
      <div className="space-y-5 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">

        <section aria-labelledby="expenses-month" className="rounded-2xl border border-subtle bg-surface-elevated p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="expenses-month" className="text-sm font-semibold text-muted">{selectedMonth} Spending</h2>
              <p className="privacy-blur mt-1 break-words font-mono text-2xl font-bold text-strong">{formatPHP(monthTotal)}</p>
              <p className="mt-1 text-xs text-muted">{monthExpenses.length} {monthExpenses.length === 1 ? "expense" : "expenses"}</p>
            </div>
            <button type="button" aria-haspopup="dialog" onClick={() => setShowForm(true)} className="shrink-0 rounded-lg bg-fill px-3 py-2 text-xs font-medium text-primary hover:bg-fill-strong">Log Expense</button>
          </div>
        </section>

        <section id="expense-entry" aria-labelledby="expense-entry-title" tabIndex={-1} className="scroll-mt-4 rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
          <h2 id="expense-entry-title" className="mb-3 text-sm font-semibold text-primary">Add an expense</h2>
          <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleCapture} className="hidden" />
          <input type="file" accept="image/*" ref={uploadInputRef} onChange={handleCapture} className="hidden" />
          <div className="grid grid-cols-2 gap-3">
            <button type="button" aria-haspopup="dialog" disabled={isScanning} onClick={() => setShowScanOptions(true)} className={expenseEntryCardClass}>
              <span className="scanner-icon flex size-9 items-center justify-center rounded-xl border text-violet-accent"><ScanLine size={18} aria-hidden="true" /></span>
              <span className="text-sm font-semibold text-primary">Scan</span>
              <span className="text-xs text-muted">Take a photo or upload a screenshot.</span>
            </button>
            <button type="button" aria-haspopup="dialog" onClick={() => setShowForm(true)} className={expenseEntryCardClass}>
              <span className="flex size-9 items-center justify-center rounded-xl bg-fill text-muted"><Plus size={18} aria-hidden="true" /></span>
              <span className="text-sm font-semibold text-primary">Manual</span>
              <span className="text-xs text-muted">Type or paste your purchase details.</span>
            </button>
          </div>
        </section>

        {/* Recent Expenses Ledger */}
        <div className="rounded-2xl bg-surface p-3 sm:p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-primary">Recent Transactions</h2>
            <span className="privacy-blur text-xs text-muted">All time: {formatPHP(totalSpent)}</span>
          </div>

          <div className="overflow-hidden rounded-xl bg-surface-low divide-y divide-subtle">
            {expenses.length === 0 ? (
              <div className="py-8 text-center text-faint text-xs italic">No expenses logged yet. Tap scan or manual to start tracking.</div>
            ) : (
              expenses.map(exp => {
                // Format the raw YYYY-MM-DD date into a cleaner format (e.g., "Sep 16, 2026")
                const formattedDate = formatTransactionDateTime(exp.date, exp.loggedAt);

                return (
                  <div key={exp.id} className="group flex flex-wrap items-center justify-between px-3 py-2.5 transition-colors hover:bg-surface-high">
                    <div className="flex items-center gap-3.5 overflow-hidden flex-1 pr-2">
                      <div className="w-9 h-9 rounded-full bg-fill border border-strong flex items-center justify-center shrink-0 text-muted">
                        <Receipt size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="privacy-blur text-[13px] font-semibold text-strong truncate">{exp.merchant}</div>
                        <div className="flex items-center gap-2 text-[10px] text-muted mt-1">
                          <span className="truncate text-muted">{exp.category}</span>
                          <span className="privacy-blur truncate text-muted before:mr-1 before:content-['·']">{allWallets.find(w => w.id === exp.wallet)?.label || exp.wallet}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end shrink-0 ml-2">
                      <div className="flex items-center gap-2">
                        <span className="privacy-blur text-[13px] font-bold font-mono text-strong">-₱{exp.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                        <button onClick={() => handleDelete(exp)} aria-label="Delete expense" className="text-faint hover:text-rose-400 transition p-1 bg-inverse/[0.03] hover:bg-rose-500/10 rounded-lg">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <span className="basis-full pr-[30px] text-[10px] text-faint font-medium mt-1 text-right">{formattedDate}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
      <Modal isOpen={showScanOptions} onClose={() => setShowScanOptions(false)} ariaLabel="Scan receipt" manageFocus>
        <div className="w-full max-w-md space-y-3 rounded-2xl border border-subtle bg-surface-modal p-4 shadow-xl sm:p-5">
          <h2 className="text-base font-semibold text-primary">Scan receipt</h2>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" aria-labelledby="scan-camera-title" aria-describedby="scan-camera-description" onClick={() => { setShowScanOptions(false); fileInputRef.current?.click(); }} className={expenseEntryCardClass}>
              <span className="scanner-icon flex size-9 items-center justify-center rounded-xl border text-violet-accent"><Camera size={18} aria-hidden="true" /></span>
              <span id="scan-camera-title" className="text-sm font-semibold text-primary">Take a photo</span>
              <span id="scan-camera-description" className="text-xs text-muted">Use your camera.</span>
            </button>
            <button type="button" aria-labelledby="scan-upload-title" aria-describedby="scan-upload-description" onClick={() => { setShowScanOptions(false); uploadInputRef.current?.click(); }} className={expenseEntryCardClass}>
              <span className="flex size-9 items-center justify-center rounded-xl bg-fill text-muted"><Upload size={18} aria-hidden="true" /></span>
              <span id="scan-upload-title" className="text-sm font-semibold text-primary">Upload an image</span>
              <span id="scan-upload-description" className="text-xs text-muted">Choose a saved receipt or screenshot.</span>
            </button>
          </div>
          <button type="button" onClick={() => setShowScanOptions(false)} className="min-h-11 w-full rounded-lg px-3 text-sm text-muted hover:bg-fill">Cancel</button>
        </div>
      </Modal>

      <Modal
        isOpen={showForm}
        onClose={showPaste ? closePaste : closeExpense}
        ariaLabelledBy={showPaste ? "paste-expense-title" : "expense-form-title"}
        closeOnBackdropClick={false}
        manageFocus
      >
        <div ref={expensePanelRef} className={`${entryDialogStyles.card} max-w-md`}>
          {showPaste ? (
            <form onSubmit={createTextDraft} className="space-y-4">
              <h2 id="paste-expense-title" className="text-base font-semibold text-primary">Paste receipt text</h2>
              <p id="receipt-text-help" className="text-sm text-muted">Paste the purchase details from a receipt, email, or SMS. Any fields you already filled in stay as they are.</p>
              <label htmlFor="receipt-text" className="block text-sm font-medium text-primary">Receipt or payment message</label>
              <textarea id="receipt-text" aria-describedby="receipt-text-help" rows={5} maxLength={8000} value={receiptText} onChange={event => setReceiptText(event.target.value)} className="w-full rounded-xl border border-strong bg-surface-input p-3 text-sm text-primary" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={closePaste} className="min-h-11 rounded-lg px-3 text-sm text-primary hover:bg-fill">Back</button>
                <button type="submit" disabled={!receiptText.trim()} className="min-h-11 rounded-lg bg-fill-strong px-3 text-sm font-semibold text-primary disabled:opacity-50">Use in draft</button>
              </div>
            </form>
          ) : (
            <form aria-labelledby="expense-form-title" onChange={() => { hasDraft.current = true; setSaveError(""); }} onSubmit={handleSave} className="relative">
              <div className={entryDialogStyles.header}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className={entryDialogStyles.icon}><Receipt size={18} aria-hidden="true" /></span>
                  <h2 id="expense-form-title" className="text-sm font-semibold text-strong">Log Expense</h2>
                </div>
                <button type="button" aria-label="Cancel" onClick={closeExpense} className={entryDialogStyles.close}><X size={18} aria-hidden="true" /></button>
              </div>

              {saveError && <p role="alert" className="mb-3 rounded-lg bg-fill px-3 py-2 text-sm text-primary">{saveError}</p>}
              {importNote && <p role="status" className="mb-3 text-sm text-muted">{importNote}</p>}
              {duplicate && <p role="status" className="mb-3 rounded-lg bg-fill px-3 py-2 text-sm text-primary">Possible duplicate. A saved expense has the same merchant, amount, and date.</p>}
              {failure && (
                <div className="mb-4 rounded-xl bg-fill px-3 py-2.5 text-sm text-primary">
                  <p role="status">{failure.message}</p>
                  {failure.canRetry && (
                    <button type="button" onClick={retryScan} className="mt-1 min-h-11 rounded-lg bg-surface px-3 text-xs font-semibold hover:bg-fill-strong">
                      Retry photo
                    </button>
                  )}
                </div>
              )}
              {isScanning && (
                <div className="absolute inset-0 z-10 bg-surface-low/80 backdrop-blur-sm flex flex-col items-center justify-center">
                  <div className="w-full max-w-[200px] h-1 bg-fill-strong rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-purple-500 w-1/2 animate-[pulse_1s_ease-in-out_infinite]" style={{ animation: 'scan 1.5s infinite linear' }} />
                  </div>
                  <span className="text-xs font-mono text-purple-400 font-bold animate-pulse">Extracting data...</span>
                  <button type="button" onClick={stopScanning} className="mt-3 min-h-11 rounded-lg bg-fill px-3 text-xs font-semibold text-primary hover:bg-fill-strong">
                    Enter manually
                  </button>
                  <style>{`@keyframes scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }`}</style>
                </div>
              )}

              <fieldset disabled={isScanning} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 min-w-0">
                    <label htmlFor={`${expenseFormId}-amount`} className="text-[10px] text-faint uppercase font-semibold mb-1 block">Amount (₱)</label>
                    <div className="relative">
                      <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg text-muted">₱</span>
                      <input id={`${expenseFormId}-amount`} type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0.00" className={entryDialogStyles.amount} required />
                    </div>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <label htmlFor={`${expenseFormId}-merchant`} className="text-[10px] text-faint uppercase font-semibold mb-1 block">Merchant / Name</label>
                    <input id={`${expenseFormId}-merchant`} type="text" value={form.merchant} onChange={e => setForm({...form, merchant: e.target.value})} placeholder="e.g. Starbucks, Laundry..." className="min-h-11 w-full min-w-0 bg-surface-input border border-strong focus:border-blue-500 rounded-xl px-3 py-2.5 text-xs text-strong box-border" required />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`${expenseFormId}-date`} className="text-[10px] text-faint uppercase font-semibold mb-1 block">Date</label>
                    <input id={`${expenseFormId}-date`} type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full min-w-0 appearance-none bg-surface-input border border-strong focus:border-emerald-500/50 rounded-xl px-2 sm:px-3 py-2.5 text-[11px] text-strong min-h-11 box-border" required />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`${expenseFormId}-category`} className="text-[10px] text-faint uppercase font-semibold mb-1 block">Category</label>
                    <select id={`${expenseFormId}-category`}
                      value={form.category}
                      onChange={e => {
                        const category = e.target.value;
                        setForm(prev => ({
                          ...prev,
                          category,
                          wallet: getDefaultExpenseWalletId(category, globalData.settings, globalData.wallets)
                        }));
                      }}
                      className="w-full min-w-0 bg-surface-input border border-strong rounded-xl px-2 py-2.5 text-[11px] text-strong min-h-11 box-border"
                    >
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <label htmlFor={`${expenseFormId}-wallet`} className="text-[10px] text-faint uppercase font-semibold mb-1 block">Deduct From</label>
                    <select id={`${expenseFormId}-wallet`} value={form.wallet} onChange={e => setForm({...form, wallet: e.target.value})} className="w-full min-w-0 bg-surface-input border border-strong rounded-xl px-2 py-2.5 text-[11px] text-primary font-semibold uppercase min-h-11 box-border">
                      {allWallets.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                    </select>
                  </div>
                </div>

                <button type="button" aria-haspopup="dialog" onClick={() => setShowPaste(true)} className="min-h-11 rounded-lg px-2 text-xs font-medium text-muted hover:bg-fill hover:text-primary">
                  Paste receipt text
                </button>
                <button type="submit" disabled={isScanning} className={`${entryDialogStyles.primary} w-full`}>
                  <CheckCircle2 size={14} /> Save & Deduct
                </button>
              </fieldset>
            </form>
          )}
        </div>
      </Modal>
    </>
  );
};
