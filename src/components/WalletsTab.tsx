import { WalletNameInput } from "./WalletNameInput";
import { GuideButton } from "./ContextGuideControls";
import React, { useState, useId, useEffect, useRef } from 'react';
import { Plus, Archive, Edit2, CreditCard, Info, ArrowRightLeft } from 'lucide-react';
import { UnifiedFinanceData, CustomWallet, WalletMutationHandler, WalletMutationOutcome } from '../types/finance';
import { formatPHP } from '../utils/currency';
import { getWalletForBill, reconcileWalletBalances, parseWalletBalance, validateActiveWalletAssignment } from '../utils/financeHelpers';
import { enabledSavingsWalletIds, readWalletSavings, walletSavingsTotals } from "../utils/walletSavings";
import { WalletGrid } from './WalletGrid';

interface WalletsTabProps {
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  onCommit: WalletMutationHandler;
  onIncrement: WalletMutationHandler;
  onSaveSavings?: (id: string, amount: number, expected: { balance: unknown; savings: unknown }) => WalletMutationOutcome | void;
  onOpenSettings?: () => void;
  onTransfer?: () => void;
  onNavigateToExpenses?: () => void;
}

const COLORS = [
  "text-rose-400", "text-amber-400", "text-emerald-400", 
  "text-cyan-400", "text-indigo-400", "text-purple-400", 
  "text-pink-400", "text-secondary", "text-blue-400"
];

const COLOR_NAMES = ["Rose", "Amber", "Emerald", "Cyan", "Indigo", "Purple", "Pink", "Neutral", "Blue"];

const WALLET_NAME_SUGGESTIONS = [
  "BDO", "BPI", "Metrobank", "UnionBank", "Security Bank",
  "GCash", "Maya", "GoTyme", "MariBank", "SeaBank",
  "CIMB", "Tonik", "Cash On-Hand"
];

export const WalletsTab: React.FC<WalletsTabProps> = ({ globalData, setGlobalData, onCommit, onIncrement, onSaveSavings, onOpenSettings, onTransfer, onNavigateToExpenses }) => {
  const [showAdd, setShowAdd] = useState(false);
  const formId = useId();
  const returnFocusId = useRef<string | null>(null);
  const firstBalanceButtonRef = useRef<HTMLButtonElement>(null);
  const addWalletButtonRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [nameError, setNameError] = useState('');
  useEffect(() => {
    if (!showAdd && returnFocusId.current) {
      document.getElementById(returnFocusId.current)?.focus();
      returnFocusId.current = null;
    }
  }, [showAdd]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [walletName, setWalletName] = useState("");
  const [walletColor, setWalletColor] = useState(COLORS[2]);

  const handleAddOrEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = walletName.trim();
    if (!name) { setNameError('Enter a name for this wallet, such as Cash or GCash.'); nameInputRef.current?.focus(); return; }

    setGlobalData(prev => {
      let updatedWallets = [...(prev.settings?.customWallets || [])];
      const nextWallets = { ...prev.wallets };
      
      if (editingId) {
        updatedWallets = updatedWallets.map(w => w.id === editingId ? { ...w, label: name, color: walletColor } : w);
      } else {
        let newId = "cw_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        while (
          updatedWallets.some(w => w.id === newId) ||
          prev.settings?.archivedWallets?.some(w => w.id === newId) ||
          Object.prototype.hasOwnProperty.call(nextWallets, newId)
        ) {
          newId = "cw_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        }
        updatedWallets.push({ id: newId, label: name, color: walletColor });
        nextWallets[newId] = 0;
      }

      return { ...prev, settings: { ...(prev.settings || {}), customWallets: updatedWallets }, wallets: nextWallets, updatedAt: Date.now() } as any;
    });
    setWalletName(""); setEditingId(null); setShowAdd(false);
  };

  const openEdit = (id: string, currentLabel: string, currentColor: string) => {
    returnFocusId.current = `${formId}-edit-${id}`; setNameError('');
    setEditingId(id); setWalletName(currentLabel); setWalletColor(currentColor || COLORS[2]); setShowAdd(true);
  };

  const archiveBlock = (data: UnifiedFinanceData, id: string) => {
    const rawBalance = data.wallets[id];
    const parsed = parseWalletBalance(rawBalance);
    if (!parsed.isValid) {
      return "Cannot archive wallet with an invalid or corrupted balance. Repair the balance first.";
    }
    if (readWalletSavings(data, id).savings === null) return "Review this wallet’s savings before archiving it.";
    if ((readWalletSavings(data, id).savings ?? 0) !== 0) return "Release this wallet’s savings before archiving it.";
    if (parsed.balance !== 0) {
      return "Bring this wallet to zero before archiving it.";
    }
    const settings = data.settings;
    const routes = [
      settings?.milestoneWallet, settings?.livingWallet, settings?.savingsWallet,
      settings?.transitWallet, settings?.defaultWallet,
      settings?.transferFromWallet, settings?.transferToWallet,
      ...Object.values(settings?.expenseWallets ?? {}),
    ];
    if (routes.includes(id) || data.library.bills.some(bill => (bill.wallet || getWalletForBill(bill.name)) === id) ||
      data.library.receivables.some(receivable => receivable.wallet === id) ||
      id === "main") return "Change the wallet used by settings, commitments, or inflows before archiving.";
  };

  const handleArchive = (id: string, name: string) => {
    const blocked = archiveBlock(globalData, id);
    if (blocked) {
      alert(blocked);
      return;
    }
    if (!confirm(`Archive "${name}"? Its history will be kept and you can restore it anytime.`)) return;

    let reason: string | undefined;
    setGlobalData(prev => {
      const settings = prev.settings;
      const wallet = settings?.customWallets?.find(entry => entry.id === id);
      if (!wallet) return prev;
      reason = archiveBlock(prev, id);
      if (reason) return prev;
      const wallets = { ...prev.wallets };
      return {
        ...prev,
        wallets,
        settings: {
          ...settings,
          customWallets: settings?.customWallets?.filter(entry => entry.id !== id),
          archivedWallets: [...(settings?.archivedWallets ?? []), wallet],
        },
        updatedAt: Date.now(),
      };
    });
    if (reason) alert(reason);
  };

  const handleRestore = (id: string) => {
    setGlobalData(prev => {
      const settings = prev.settings;
      const wallet = settings?.archivedWallets?.find(entry => entry.id === id);
      if (!wallet || settings?.customWallets?.some(entry => entry.id === id)) return prev;
      return {
        ...prev,
        wallets: { ...prev.wallets, [id]: Object.prototype.hasOwnProperty.call(prev.wallets, id) ? prev.wallets[id] : 0 },
        settings: {
          ...settings,
          customWallets: [...(settings?.customWallets ?? []), wallet],
          archivedWallets: settings?.archivedWallets?.filter(entry => entry.id !== id),
        },
        updatedAt: Date.now(),
      };
    });
  };

  const reconciled = reconcileWalletBalances(globalData);
  const customWallets = globalData.settings?.customWallets || [];
  const totalWalletBalance = reconciled.totalLiquid;
  const savingsTotals = walletSavingsTotals(globalData);
  const hasFundedWallet = reconciled.activeWallets.some(wallet => wallet.balance > 0 &&
    validateActiveWalletAssignment(wallet.id, globalData.settings, globalData.wallets).ok);

  return (
    <div data-guide-screen="wallets" className="space-y-5 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
        <div className="flex justify-end"><GuideButton screen="wallets" name="Wallets" /></div>
      {onNavigateToExpenses && (globalData.library.expenses?.length ?? 0) === 0 && <section aria-label="Your first steps" className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4">
        <h2 className="text-sm font-semibold text-primary">One wallet, then one expense</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">Use an existing wallet or add your own. Tap its balance and enter what you have today. Then record a purchase you made after that starting balance.</p>
        <button type="button" onClick={() => {
          if (hasFundedWallet) onNavigateToExpenses();
          else if (customWallets.length) firstBalanceButtonRef.current?.click();
          else addWalletButtonRef.current?.click();
        }} className="mt-3 min-h-11 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-500">{hasFundedWallet ? "Record your first expense" : customWallets.length ? "Set starting balance" : "Add your first wallet"}</button>
      </section>}
      <section aria-labelledby="wallets-total" className="rounded-2xl border border-subtle bg-surface-elevated p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="wallets-total" className="text-sm font-semibold text-muted">Total Wallet Balance</h2>
          {onTransfer && <button data-guide-interactive="open" data-guide-target="transfer" type="button" onClick={onTransfer} disabled={customWallets.length < 2}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-fill px-3 text-sm font-medium text-primary transition hover:bg-fill-strong disabled:cursor-not-allowed disabled:opacity-50">
            <ArrowRightLeft size={16} aria-hidden="true" /> Transfer
          </button>}
        </div>
        <p className="privacy-blur mt-1 break-words font-mono text-2xl font-bold text-strong">{formatPHP(totalWalletBalance)}</p>
        <dl className="mt-3 grid min-w-0 grid-cols-2 gap-3 text-xs"><div><dt className="text-muted">Savings</dt><dd className="privacy-blur mt-1 break-all font-mono font-semibold text-primary">{formatPHP(savingsTotals.savings)}</dd></div><div><dt className="text-muted">Available to spend</dt><dd className="privacy-blur mt-1 break-all font-mono font-semibold text-primary">{formatPHP(savingsTotals.available)}</dd></div></dl>
        <p className="mt-2 text-xs text-muted">Savings stay within your wallet balances. Setting money aside does not move it.</p>
        {savingsTotals.needsReview && <p role="status" className="mt-2 text-xs text-warning">Review wallet savings and balances before using the spending guidance.</p>}
        {onTransfer && customWallets.length < 2 && <p className="mt-2 text-xs text-muted">Add another wallet to enable transfers.</p>}
      </section>
      {!reconciled.isComplete && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-negative">
          <div className="flex items-center gap-2 font-semibold">
            <Info size={14} /> Corrupted balance detected in account(s): {reconciled.invalidWalletIds.join(", ")}
          </div>
          <p className="mt-1 text-muted">Balances must be valid numbers to ensure financial accuracy.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {reconciled.invalidWalletIds.map(id => (
              <button
                key={id}
                type="button"
                onClick={() => onCommit(id, 0)}
                className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-500"
              >
                Repair {id} to ₱0
              </button>
            ))}
          </div>
        </div>
      )}
      {reconciled.unlistedWallets.some(w => w.balance !== 0) && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-warning">
          <div className="flex items-center gap-2 font-semibold">
            <Info size={14} /> Unlisted Accounts with Balances ({formatPHP(reconciled.unlistedTotal)})
          </div>
          <p className="mt-1 text-muted">The following accounts hold funds but are not in your active account list:</p>
          <div className="mt-2 divide-y divide-subtle">
            {reconciled.unlistedWallets.filter(w => w.balance !== 0).map(w => (
              <div key={w.id} className="flex items-center justify-between py-1.5 text-xs">
                <span>{w.label}</span>
                <span className="font-mono font-medium">{formatPHP(w.balance)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {reconciled.archivedWallets.some(w => w.balance !== 0) && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-xs text-info">
          <div className="flex items-center gap-2 font-semibold">
            <Info size={14} /> Archived Accounts with Balances ({formatPHP(reconciled.archivedTotal)})
          </div>
          <div className="mt-2 divide-y divide-subtle">
            {reconciled.archivedWallets.filter(w => w.balance !== 0).map(w => (
              <div key={w.id} className="flex items-center justify-between py-1.5 text-xs">
                <span>{w.label}</span>
                <span className="font-mono font-medium">{formatPHP(w.balance)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {reconciled.anomalies.hasMetadataAnomalies && (
        <details className="rounded-2xl border border-subtle bg-surface p-4 text-xs">
          <summary className="cursor-pointer font-semibold text-muted hover:text-primary">
            Account Metadata Diagnostics ({reconciled.anomalies.duplicateActiveWallets.length + reconciled.anomalies.conflictingActiveAndArchived.length} issues)
          </summary>
          <div className="mt-2 space-y-2 text-muted">
            {reconciled.anomalies.duplicateActiveWallets.map(dup => (
              <p key={dup.id}>Duplicate active account ID "{dup.id}" found across labels: {dup.labels.join(", ")}.</p>
            ))}
            {reconciled.anomalies.conflictingActiveAndArchived.map(conf => (
              <p key={conf.id}>Account ID "{conf.id}" is listed as both active ("{conf.activeLabel}") and archived ("{conf.archivedLabel}"). Active status takes precedence.</p>
            ))}
          </div>
        </details>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted">Enable Savings only for the wallets you use to set money aside.</p>{onOpenSettings && <button type="button" onClick={onOpenSettings} className="min-h-11 rounded-xl bg-fill px-3 text-xs font-semibold text-primary">Savings settings</button>}</div>
      <WalletGrid enabledSavingsIds={enabledSavingsWalletIds(globalData.settings)} savings={globalData.settings?.walletSavings} onSaveSavings={onSaveSavings} firstBalanceButtonRef={firstBalanceButtonRef} wallets={globalData.wallets} milestoneWallet={globalData.settings?.milestoneWallet} savingsWallet={globalData.settings?.savingsWallet} customWallets={customWallets} onCommit={onCommit} onIncrement={onIncrement} />
      <div className="rounded-2xl bg-surface p-3 sm:p-4">
        <div className="flex items-center justify-between mb-4"><h2 data-guide-target="accounts" className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2"><CreditCard size={14} className="text-emerald-400" /> Account Management</h2></div>
        <p id={`${formId}-help`} className="mb-4 text-xs text-muted">A wallet is where you keep money, such as cash, GCash, or a bank account. Add it here, then tap its balance above to update it.</p>
        {customWallets.length > 0 && !showAdd && (
          <div className="mb-4 overflow-hidden rounded-xl bg-surface-low divide-y divide-subtle">
            {customWallets.map(w => (
              <div key={w.id} className="flex min-h-12 items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2.5"><div className={`w-2.5 h-2.5 rounded-full bg-current ${w.color || 'text-emerald-400'} shadow-[0_0_8px_currentColor]`} /><span className="privacy-blur text-xs font-semibold text-primary">{w.label}</span></div>
                <div className="flex items-center gap-1">
                  <button id={`${formId}-edit-${w.id}`} type="button" onClick={() => openEdit(w.id, w.label, w.color || COLORS[2])} aria-label={`Edit ${w.label} account`} className="grid min-h-11 min-w-11 place-items-center text-faint hover:text-amber-400 p-1.5 transition rounded-lg hover:bg-amber-500/10"><Edit2 size={14} /></button>
                  <button onClick={() => handleArchive(w.id, w.label)} aria-label={`Archive ${w.label} account`} className="grid min-h-11 min-w-11 place-items-center text-faint hover:text-rose-400 p-1.5 transition rounded-lg hover:bg-rose-500/10"><Archive size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!!globalData.settings?.archivedWallets?.length && (
          <details className="mb-4 rounded-xl border border-subtle p-3">
            <summary className="cursor-pointer text-xs font-semibold">Archived wallets</summary>
            {globalData.settings.archivedWallets.map(wallet => (
              <div key={wallet.id} className="mt-3 flex items-center justify-between text-xs">
                <span className="privacy-blur">{wallet.label}</span>
                <button type="button" onClick={() => handleRestore(wallet.id)} aria-label={`Restore ${wallet.label}`} className="min-h-11 rounded-lg px-3 py-2 text-emerald-400">Restore</button>
              </div>
            ))}
          </details>
        )}
        {showAdd ? (
          <form aria-label={editingId ? "Edit wallet" : "Add wallet"} aria-describedby={`${formId}-help`} onSubmit={handleAddOrEdit} className="bg-surface border border-subtle rounded-xl p-4 space-y-4 shadow-inner">
            <div>
              <label htmlFor={`${formId}-name`} className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Account Name</label>
              <WalletNameInput id={`${formId}-name`} ref={nameInputRef} aria-invalid={Boolean(nameError)} aria-describedby={nameError ? `${formId}-name-error` : `${formId}-balance-help`} type="text" suggestions={WALLET_NAME_SUGGESTIONS} placeholder="e.g., BPI, GCash, Vault..." value={walletName} onValueChange={value => { setWalletName(value); setNameError(''); }} autoFocus className="min-h-11 w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-base text-strong outline-none focus:border-emerald-500 sm:text-xs" required />
              <p id={`${formId}-balance-help`} className="mt-1 text-xs text-muted">{editingId ? 'Updating the name or color keeps the current balance.' : 'New wallets start at ₱0. Set the current balance from the wallet list after saving.'}</p>
              {nameError && <p id={`${formId}-name-error`} role="alert" className="mt-1 text-xs text-negative">{nameError}</p>}
            </div>
            <div><p id={`${formId}-colors`} className="text-[10px] text-faint uppercase font-semibold mb-2 block">Accent Color</p>
              <div role="group" aria-labelledby={`${formId}-colors`} className="flex items-center flex-wrap gap-1">{COLORS.map((c, index) => <button type="button" key={c} aria-label={`${COLOR_NAMES[index]} accent`} aria-pressed={walletColor === c} onClick={() => setWalletColor(c)} className="grid size-11 place-items-center rounded-xl hover:bg-fill"><span aria-hidden="true" className={`size-6 rounded-full bg-current ${c} border-2 transition-all duration-300 ${walletColor === c ? 'border-strong scale-110 shadow-[0_0_12px_currentColor]' : 'border-transparent opacity-40'}`} /></button>)}</div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-inverse/[0.04]">
              <button type="button" onClick={() => { setShowAdd(false); setEditingId(null); setWalletName(""); }} className="min-h-11 flex-1 py-2.5 bg-inverse/[0.05] hover:bg-inverse/[0.1] text-xs font-semibold rounded-xl transition">Cancel</button>
              <button type="submit" className="min-h-11 flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-900/20 transition">{editingId ? "Update" : "Save"} Account</button>
            </div>
          </form>
        ) : (
          <button ref={addWalletButtonRef} data-guide-interactive="open" data-guide-target="add-wallet" id={`${formId}-add`} type="button" onClick={() => { returnFocusId.current = `${formId}-add`; setNameError(''); setShowAdd(true); setEditingId(null); setWalletName(""); setWalletColor(COLORS[2]); }} className="w-full py-3.5 border border-dashed border-inverse/[0.15] hover:border-emerald-500/50 hover:bg-emerald-500/10 text-muted hover:text-emerald-400 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2"><Plus size={15} /> Add New Account</button>
        )}
      </div>
    </div>
  );
};
