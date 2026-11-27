import React, { useState, useId, useRef } from 'react';
import { Modal } from './ui/Modal';
import { Plus, X, CreditCard, CheckCircle2, PiggyBank, Pencil } from 'lucide-react';
import { entryDialogStyles } from './ui/dialogStyles';
import { WalletState, CustomWallet, WalletMutationHandler, WalletMutationOutcome, AppSettings } from '../types/finance';
import { readWalletSavings } from "../utils/walletSavings";
import { formatPHP } from "../utils/currency";
import { parseWalletBalance } from '../utils/financeHelpers';

interface WalletGridProps { enabledSavingsIds?: string[]; savings?: AppSettings["walletSavings"]; onSaveSavings?: (id: string, amount: number, expected: { balance: unknown; savings: unknown }) => WalletMutationOutcome | void; firstBalanceButtonRef?: React.Ref<HTMLButtonElement>; wallets: WalletState; customWallets?: CustomWallet[]; milestoneWallet?: string; savingsWallet?: string; onCommit: WalletMutationHandler; onIncrement: WalletMutationHandler; }

export const WalletGrid: React.FC<WalletGridProps> = React.memo(({ enabledSavingsIds = [], savings, onSaveSavings, firstBalanceButtonRef, wallets, milestoneWallet, savingsWallet, customWallets, onCommit, onIncrement }) => {
  const [editingWallet, setEditingWallet] = useState<(CustomWallet & { balance: number | null }) | null>(null);
  const [editMode, setEditMode] = useState<"balance" | "savings">("balance");
  const savingsSnapshot = useRef<{ balance: unknown; savings: unknown }>({ balance: undefined, savings: undefined });
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState("");

  const balanceFormId = useId();
  const balanceInputRef = useRef<HTMLInputElement>(null);

  const openEdit = (wallet: CustomWallet, currentBalance: number | null, mode: "balance" | "savings" = "balance") => {
    setEditMode(mode);
    savingsSnapshot.current = { balance: wallets[wallet.id], savings: savings?.[wallet.id] };
    setError("");
    setEditingWallet({ ...wallet, balance: currentBalance });
    setEditValue(mode === "savings" ? String(savings?.[wallet.id] ?? 0) : currentBalance === null || currentBalance === 0 ? "" : String(currentBalance));
  };

  const finishChange = (outcome: WalletMutationOutcome | void) => {
    if (!outcome?.ok) {
      setError(outcome && !outcome.ok ? outcome.error : "The change could not be confirmed. Check your balance before trying again.");
      return;
    }
    setError("");
    setEditingWallet(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWallet) return;
    const cleaned = editValue.replace(/,/g, "").trim();
    if (editMode === "savings") {
      if (!onSaveSavings) { setError("Savings changes are unavailable until your account is ready."); return; }
      finishChange(onSaveSavings(editingWallet.id, Number(cleaned || 0), savingsSnapshot.current));
      return;
    }
    const parsed = parseWalletBalance(cleaned === "" && editingWallet.balance !== null ? 0 : cleaned);
    if (!parsed.isValid) {
      setError("Enter the correct balance before saving.");
      return;
    }
    finishChange(onCommit(editingWallet.id, parsed.balance));
  };

  return (
    <>
      <section aria-label="Wallet balances">
        <div className="mb-3 px-1 text-sm font-semibold text-primary">Your wallets</div>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(customWallets || []).map((w, index) => {
            const parsed = parseWalletBalance(wallets[w.id]);
            const currentBalance = parsed.isValid ? parsed.balance : null;
            const funds = readWalletSavings({ wallets, settings: { walletSavings: savings } }, w.id);
            const isMilestoneWallet = w.id === milestoneWallet;
            const isSavingsWallet = w.id === savingsWallet;

            const roleClasses =
              isMilestoneWallet && isSavingsWallet
                ? "wallet-role wallet-role-shared"
                : isMilestoneWallet
                  ? "wallet-role wallet-role-goal"
                  : isSavingsWallet
                    ? "wallet-role wallet-role-savings"
                    : "";

            const displayColor = `${w.color || "text-strong"} font-bold`;

            return (
              <article key={w.id} className="wallet-account-card dashboard-material relative min-w-0 overflow-hidden rounded-3xl border border-subtle">
                <button type="button" ref={index === 0 ? firstBalanceButtonRef : undefined} data-guide-interactive="open" onClick={() => openEdit({ ...w, color: displayColor }, currentBalance)} className={`wallet-balance-row group relative flex min-h-40 w-full min-w-0 flex-col items-start gap-5 rounded-3xl p-5 text-left transition-colors hover:bg-fill ${roleClasses}`}>
                  <span aria-hidden="true" className={`wallet-card-art pointer-events-none absolute inset-0 ${w.color || "text-muted"}`} />
                  <span className="relative flex w-full min-w-0 items-center gap-3">
                    <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-current/10 bg-fill ${w.color || "text-muted"}`}><CreditCard size={19} /></span>
                    <span className="privacy-blur min-w-0 break-words text-sm font-semibold text-primary">{w.label}</span>
                    <Pencil size={13} aria-hidden="true" className="ml-auto shrink-0 text-faint" />
                  </span>
                  {isMilestoneWallet && <span className="sr-only">Goal wallet</span>}
                  {isSavingsWallet && <span className="sr-only">Savings wallet</span>}
                  <span className="relative block w-full min-w-0">
                    <span className="block text-[10px] font-medium uppercase tracking-wider text-muted">Total balance</span>
                    <span className="privacy-blur mt-1 block break-all font-mono text-2xl font-bold tracking-tight text-strong">{currentBalance === null ? "Invalid balance" : formatPHP(currentBalance)}</span>
                  </span>
                  <span aria-hidden="true" className="relative text-[10px] text-muted">Tap to edit balance</span>
                </button>
                {enabledSavingsIds.includes(w.id) && <div className="relative mx-5 mb-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,130px),1fr))] gap-2 border-t border-subtle pt-3 text-xs">
                  <button type="button" onClick={() => openEdit(w, currentBalance, "savings")} aria-label={`Set savings for ${w.label}`} className="min-h-11 min-w-0 rounded-xl bg-fill px-2 py-2 text-left transition hover:bg-surface-high">
                    <span className="flex items-center gap-1 text-muted"><PiggyBank size={12} aria-hidden="true" /> Savings</span>
                    <span className="privacy-blur mt-1 block break-all font-mono font-semibold text-primary">{funds.savings === null ? "Needs review" : formatPHP(funds.savings)}</span>
                  </button>
                  <div className="min-w-0 px-2 py-2"><span className="text-muted">Available to spend</span><span className="privacy-blur mt-1 block break-all font-mono font-semibold text-primary">{funds.balance === null || funds.savings === null ? "Needs review" : formatPHP(funds.available)}</span></div>
                </div>}
                {funds.needsReview && <p className="px-5 pb-4 text-xs text-warning">Review this wallet’s savings. Actual spending may have reduced its balance.</p>}
              </article>
            );
          })}
          {(!customWallets || customWallets.length === 0) && <div className="col-span-full py-4 text-center text-faint text-xs italic">No wallets yet. Add a wallet below, then tap it to set its current balance.</div>}
        </div>
      </section>

      {editingWallet && (
        <Modal isOpen onClose={() => setEditingWallet(null)} ariaLabelledBy={`${balanceFormId}-title`} manageFocus initialFocusRef={balanceInputRef} className="z-[200]">
          <div className={`${entryDialogStyles.card} max-w-sm`}>
            <div className={entryDialogStyles.header}>
              <div className="flex items-center gap-3">
                <div className={entryDialogStyles.icon}>{editMode === "savings" ? <PiggyBank size={18} /> : <CreditCard size={18} />}</div>
                <div><h3 id={`${balanceFormId}-title`} className="text-sm font-bold text-strong leading-tight">{editMode === "savings" ? "Savings" : "Edit Balance"}</h3><p className="text-[11px] text-muted font-medium">{editingWallet.label}</p></div>
              </div>
              <button type="button" aria-label="Close balance editor" onClick={() => setEditingWallet(null)} className={entryDialogStyles.close}><X size={16}/></button>
            </div>
            <p id={`${balanceFormId}-help`} className="mb-4 text-xs text-muted">{editMode === "savings" ? "Set aside part or all of this wallet for savings. This reduces spending guidance without moving money or blocking actual expenses and transfers." : "Set the current balance to match your bank, e-wallet, or cash on hand. Quick Add Income adds money to the existing balance."}</p>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="relative flex items-center justify-center bg-surface-lowest border border-strong rounded-2xl p-5 focus-within:border-blue-500/50 transition-colors shadow-inner">
                <span className="absolute left-5 text-faint font-mono text-xl">₱</span>
                <input ref={balanceInputRef} aria-label={editMode === "savings" ? "Savings amount" : "Balance"} aria-describedby={`${balanceFormId}-help${error ? ` ${balanceFormId}-error` : ''}`} aria-invalid={Boolean(error)} type="number" inputMode="decimal" step="0.01" value={editValue} onChange={e => { setEditValue(e.target.value); setError(""); }} className="bg-transparent text-center text-3xl font-bold font-mono outline-none w-full text-strong" placeholder="0.00" />
              </div>
              {error && <p id={`${balanceFormId}-error`} role="alert" className="text-sm text-primary">{error}</p>}
              {editMode === "savings" ? <>
                <dl className="grid min-w-0 grid-cols-2 gap-3 text-xs"><div><dt className="text-muted">Total balance</dt><dd className="privacy-blur mt-1 break-all font-mono text-primary">{editingWallet.balance === null ? "Needs review" : formatPHP(editingWallet.balance)}</dd></div><div><dt className="text-muted">Available after savings</dt><dd className="privacy-blur mt-1 break-all font-mono text-primary">{editingWallet.balance === null || !Number.isFinite(Number(editValue)) ? "—" : formatPHP(Math.max(0, editingWallet.balance - Math.max(0, Number(editValue))))}</dd></div></dl>
                <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setEditValue(String(Math.max(0, editingWallet.balance ?? 0))); setError(""); }} className="min-h-11 rounded-xl bg-fill px-3 text-xs font-semibold text-primary">Set all aside</button><button type="button" onClick={() => { setEditValue("0"); setError(""); }} className="min-h-11 rounded-xl bg-fill px-3 text-xs font-semibold text-primary">Release savings</button></div>
                <p className="text-xs text-muted">New money stays available. You can change this amount whenever needed.</p>
              </> : <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-faint mb-2.5 text-center">Quick Add Income</div>
                <div className="grid grid-cols-3 gap-2">
                  {[100, 500, 1000].map(amt => <button key={amt} type="button" onClick={() => finishChange(onIncrement(editingWallet.id, amt))} className="min-h-11 py-3 chip-blue rounded-xl text-xs font-mono font-bold transition active:scale-95 flex items-center justify-center gap-1 shadow-sm"><Plus size={12} />{amt}</button>)}
                </div>
              </div>}
              <button type="submit" className={`${entryDialogStyles.primary} w-full`}><CheckCircle2 size={16} /> {editMode === "savings" ? "Save Savings" : "Save Balance"}</button>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
});
