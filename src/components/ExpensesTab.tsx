import { roundMoney } from "../utils/currency";
import React, { useState, useRef } from "react";
import { Camera, UploadCloud, ScanLine, Plus, Receipt, Trash2, CheckCircle2 } from "lucide-react";
import { UnifiedFinanceData, Expense, ExpenseCategory } from "../types/finance";
import { generateId } from "../utils/idHelpers";
import { getLocalPasscode } from "../hooks/useCloudSync";

const EXPENSE_CATEGORIES: ExpenseCategory[] = ["Food & Dining", "Transport", "Utilities", "Laundry & Home", "Shopping", "Other"];

interface ExpensesTabProps {
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  showToast: (msg: string) => void;
}

const getLocalToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const ExpensesTab: React.FC<ExpensesTabProps> = ({ globalData, setGlobalData, showToast }) => {
  const [isScanning, setIsScanning] = useState(false);
  
  const [showForm, setShowForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    merchant: "",
    amount: "",
    category: "Food & Dining" as ExpenseCategory | string,
    wallet: "gcash",
    date: getLocalToday()
  });

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setShowForm(true);

    try {
      const img = new Image();
      img.onload = async () => {
        // Compress massive iPhone photos down to max 1000px and 70% JPEG quality
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width = Math.round((width * MAX_HEIGHT) / height); height = MAX_HEIGHT; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL("image/jpeg", 0.7);

        try {
          const res = await fetch("/api/scan", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-sync-passcode": getLocalPasscode()
            },
            body: JSON.stringify({ image: base64 })
          });
          
          const textResponse = await res.text();
          let data;
          try {
            data = JSON.parse(textResponse);
          } catch (e) {
            localStorage.setItem('scanner_debug_log', JSON.stringify({ error: 'Failed to parse server response as JSON', raw: textResponse }));
            showToast("Unable to scan this receipt. Please try again or enter the details manually.");
            return;
          }

          localStorage.setItem('scanner_debug_log', JSON.stringify(data));
          
          if (!res.ok || data.error) {
            showToast("Unable to scan this receipt. Please try again or enter the details manually.");
            return;
          }

          if (data.success === false) {
            showToast("Unable to scan this receipt. Please try again or enter the details manually.");
            return;
          }

          const parsed = data.parsed || {};
          setForm(prev => ({
            ...prev,
            merchant: parsed.merchant || "",
            amount: parsed.amount ? String(parsed.amount) : "",
            category: parsed.category || "Other",
            date: parsed.date || getLocalToday()
          }));
          
          showToast("✨ Receipt scanned successfully!");
        } catch (err: any) {
          localStorage.setItem('scanner_debug_log', JSON.stringify({ error: 'Network error', message: err.message }));
          showToast("Unable to scan this receipt. Please try again or enter the details manually.");
        } finally {
          setIsScanning(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      img.src = URL.createObjectURL(file);
    } catch (err) {
      showToast("Unable to scan this receipt. Please try again or enter the details manually.");
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.merchant || isNaN(amount) || amount <= 0) return;

    setGlobalData(prev => {
      const newExpense: Expense = {
        id: generateId("exp"),
        merchant: form.merchant,
        amount,
        category: form.category,
        wallet: form.wallet,
        date: form.date
      };

      const nextWallets = { ...prev.wallets };
      // Instantly deduct from the chosen liquid wallet
      if (nextWallets[form.wallet] !== undefined) {
        nextWallets[form.wallet] = roundMoney(Math.max(0, nextWallets[form.wallet] - amount));
      }

      return {
        ...prev,
        wallets: nextWallets,
        library: {
          ...prev.library,
          expenses: [newExpense, ...(prev.library.expenses || [])]
        },
        updatedAt: Date.now()
      };
    });

    showToast(`Logged ₱${amount} & deducted from wallet`);
    setShowForm(false);
    setForm({ merchant: "", amount: "", category: "Food & Dining", wallet: "gcash", date: getLocalToday() });
  };

  const handleDelete = (exp: Expense) => {
    if (!confirm(`Delete ${exp.merchant} and refund ₱${exp.amount} back to your wallet?`)) return;

    setGlobalData(prev => {
      const nextWallets = { ...prev.wallets };
      if (nextWallets[exp.wallet] !== undefined) {
        nextWallets[exp.wallet] = roundMoney(nextWallets[exp.wallet] + exp.amount); // Refund
      }
      return {
        ...prev,
        wallets: nextWallets,
        library: {
          ...prev.library,
          expenses: (prev.library.expenses || []).filter(e => e.id !== exp.id)
        },
        updatedAt: Date.now()
      };
    });
    showToast("Expense deleted and refunded.");
  };

  const customWallets = globalData.settings?.customWallets || [];
  const walletLabels = globalData.settings?.walletLabels;
  const allWallets = [
    { id: "maya", label: walletLabels?.maya || "Maya" },
    { id: "gcash", label: walletLabels?.gcash || "GCash" },
    { id: "maribank", label: walletLabels?.maribank || "MariBank" },
    { id: "gotyme", label: walletLabels?.gotyme || "GoTyme" },
    { id: "bpi", label: walletLabels?.bpi || "BPI" },
    { id: "cash", label: walletLabels?.cash || "Cash On-Hand" },
    ...customWallets.map(cw => ({ id: cw.id, label: cw.label }))
  ];

  const expenses = globalData.library?.expenses || [];
  const totalSpent = expenses.reduce((a, b) => a + b.amount, 0);

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
      
      {/* AI Scanner Hero Card */}
      <div className="bg-[#101014] border border-white/[0.08] rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 opacity-50" />
        
        <div className="flex flex-col items-center justify-center text-center space-y-3 py-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-900/50 to-purple-900/50 border border-purple-500/30 flex items-center justify-center mb-2 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
            <ScanLine size={24} className="text-purple-400" />
          </div>
          <h2 className="text-sm font-bold text-white tracking-wide">AI Receipt Scanner</h2>
          <p className="text-[11px] text-zinc-400 max-w-[240px]">Snap a photo of your receipt. The AI will auto-extract the merchant, amount, and date.</p>
          
          <div className="flex gap-2 w-full max-w-xs mt-4">
            <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleCapture} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-purple-900/20">
              <Camera size={14} /> Scan
            </button>
            <button onClick={() => { setShowForm(true); setIsScanning(false); }} className="flex-1 bg-[#1a1a22] hover:bg-white/[0.06] border border-white/[0.06] text-zinc-300 font-semibold py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-md">
              <Plus size={14} /> Manual
            </button>
          </div>
        </div>
      </div>

      {/* Expense Form */}
      {showForm && (
        <form onSubmit={handleSave} className="bg-[#101014] border border-emerald-500/30 rounded-2xl p-4 shadow-[0_0_30px_rgba(16,185,129,0.05)] animate-in slide-in-from-top-2 duration-300 relative overflow-hidden">
          {isScanning && (
            <div className="absolute inset-0 z-10 bg-[#101014]/80 backdrop-blur-sm flex flex-col items-center justify-center">
              <div className="w-full max-w-[200px] h-1 bg-zinc-800 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-purple-500 w-1/2 animate-[pulse_1s_ease-in-out_infinite]" style={{ animation: 'scan 1.5s infinite linear' }} />
              </div>
              <span className="text-xs font-mono text-purple-400 font-bold animate-pulse">Extracting data...</span>
              <style>{`@keyframes scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }`}</style>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5"><Receipt size={14}/> Log Expense</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-[10px] font-semibold">CANCEL</button>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 min-w-0">
                <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Merchant / Name</label>
                <input type="text" value={form.merchant} onChange={e => setForm({...form, merchant: e.target.value})} placeholder="e.g. Starbucks, Laundry..." className="w-full min-w-0 bg-[#0b0b0d] border border-zinc-800 focus:border-emerald-500/50 rounded-xl px-3 py-2.5 text-xs text-white outline-none box-border" required />
              </div>
              <div className="min-w-0">
                <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Amount (₱)</label>
                <input type="number" inputMode="decimal" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0.00" className="w-full min-w-0 bg-[#0b0b0d] border border-zinc-800 focus:border-emerald-500/50 rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-emerald-400 outline-none box-border" required />
              </div>
              <div className="min-w-0">
                <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Date</label>
                <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full min-w-0 appearance-none bg-[#0b0b0d] border border-zinc-800 focus:border-emerald-500/50 rounded-xl px-2 sm:px-3 py-2.5 text-[11px] text-white outline-none min-h-[38px] box-border" required />
              </div>
              <div className="min-w-0">
                <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Category</label>
                <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full min-w-0 bg-[#0b0b0d] border border-zinc-800 rounded-xl px-2 py-2.5 text-[11px] text-white outline-none min-h-[38px] box-border">
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Deduct From</label>
                <select value={form.wallet} onChange={e => setForm({...form, wallet: e.target.value})} className="w-full min-w-0 bg-[#0b0b0d] border border-zinc-800 rounded-xl px-2 py-2.5 text-[11px] text-blue-300 font-semibold uppercase outline-none min-h-[38px] box-border">
                  {allWallets.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                </select>
              </div>
            </div>
            
            <button type="submit" className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-900/20">
              <CheckCircle2 size={14} /> Save & Deduct
            </button>
          </div>
        </form>
      )}

      {/* Recent Expenses Ledger */}
      <div className="bg-[#101014] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Recent Transactions</h2>
          <span className="text-[10px] font-mono text-zinc-500">Total: ₱{totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        </div>

        <div className="space-y-2">
          {expenses.length === 0 ? (
            <div className="py-8 text-center text-zinc-500 text-xs italic">No expenses logged yet. Tap scan or manual to start tracking.</div>
          ) : (
            expenses.map(exp => (
              <div key={exp.id} className="flex items-center justify-between p-3 rounded-xl bg-[#14141a] border border-white/[0.04] group hover:border-white/[0.08] transition">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 text-zinc-400">
                    <Receipt size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="privacy-blur text-xs font-semibold text-zinc-200 truncate">{exp.merchant}</div>
                    <div className="flex items-center gap-1.5 text-[9px] text-zinc-500 mt-0.5">
                      <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-medium whitespace-nowrap shrink-0">{exp.category}</span>
                      <span>•</span>
                      <span className="whitespace-nowrap shrink-0">{exp.date}</span>
                      <span>•</span>
                      <span className="uppercase text-blue-400/80 font-semibold whitespace-nowrap shrink-0">{allWallets.find(w => w.id === exp.wallet)?.label || exp.wallet}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  <span className="text-xs font-bold font-mono text-zinc-100">-₱{exp.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <button onClick={() => handleDelete(exp)} aria-label="Delete expense" className="text-zinc-600 hover:text-rose-400 transition p-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};
