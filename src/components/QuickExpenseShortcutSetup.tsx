import React, { useEffect, useRef, useState } from "react";
import { Copy, Download, Link2 } from "lucide-react";
import { UnifiedFinanceData } from "../types/finance";
import { getDefaultExpenseWalletId } from "../utils/financeHelpers";
import { getFinanceAuth } from "../utils/financeAuth";

interface Connection { connected: boolean; walletId?: string; walletLabel?: string; expiresAt?: number; }
export function QuickExpenseShortcutSetup({ globalData }: { globalData: UnifiedFinanceData }) {
  const [open, setOpen] = useState(false);
  const [connection, setConnection] = useState<Connection>();
  const [walletId, setWalletId] = useState(() => getDefaultExpenseWalletId("Food & Dining", globalData.settings, globalData.wallets));
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const owner = getFinanceAuth().key;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setToken(""); setConnection(undefined); setOpen(false); setStatus(""); setBusy(false); setWalletId(getDefaultExpenseWalletId("Food & Dining", globalData.settings, globalData.wallets)); }, [owner]);

  const request = async (action?: "connect" | "disconnect") => {
    const auth = getFinanceAuth();
    if (!auth.headers["X-Finance-Session"]) { setStatus("Reconnect your sign-in before setting up automatic saving."); return; }
    setBusy(true); setStatus("");
    try {
      const res = await fetch("/api/quick-expense", {
        method: action ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(15000), headers: { ...auth.headers, "Content-Type": "application/json", "X-Finance-Shortcut": "1" },
        ...(action ? { body: JSON.stringify({ action, ...(action === "connect" ? { walletId } : {}) }) } : {}),
      });
      const result = await res.json();
      if (!mounted.current || getFinanceAuth().key !== auth.key) return;
      if (!res.ok) throw new Error(result.message || "Could not update the connection. Try again.");
      setConnection(result);
      setToken(action === "connect" ? result.token : "");
      if (action === "disconnect") setStatus("Disconnected. This shortcut can no longer save expenses.");
    } catch (error) {
      if (mounted.current && getFinanceAuth().key === auth.key) setStatus(error instanceof Error ? error.message : "Could not connect. Try again.");
    } finally { if (mounted.current && getFinanceAuth().key === auth.key) setBusy(false); }
  };
  const wallets = Object.keys(globalData.wallets).filter(id => !globalData.settings?.archivedWallets?.some(wallet => wallet.id === id));
  const walletLabel = (id: string) => globalData.settings?.customWallets?.find(wallet => wallet.id === id)?.label ?? globalData.settings?.walletLabels?.[id] ?? id;
  return <div className="space-y-3">
    <a href="/shortcuts/Finance%20Tracker%20Quick%20Expense.shortcut" download="Finance Tracker Quick Expense.shortcut" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-fill px-3 font-semibold text-primary hover:bg-fill-strong"><Download size={15} /> Add to Apple Shortcuts</a>
    <p>Download the preset, then open it and tap Add Shortcut. Connect automatic saving below and paste your private key when the preset asks for it.</p>
    <button type="button" aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) void request(); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-fill px-3 font-semibold text-primary hover:bg-fill-strong"><Link2 size={14} /> Automatic saving</button>
    {open && <div className="space-y-3 rounded-xl border border-subtle p-3">
      <p>Save from Apple’s amount, category, and merchant prompts without opening the web form. This connection can add expenses and deduct from its selected wallet. It expires after 30 days; reconnect to renew it.</p>
      {connection?.connected && <p className="font-medium text-primary">Connected to {connection.walletLabel}. Expires {new Date(connection.expiresAt!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.</p>}
      <label className="block space-y-1 font-medium text-primary">Shortcut payment wallet
        <select aria-label="Shortcut payment wallet" value={walletId} onChange={e => setWalletId(e.target.value)} disabled={busy} className="block w-full rounded-lg border border-subtle bg-surface-input px-3 py-2 text-primary">{wallets.map(id => <option key={id} value={id}>{walletLabel(id)}</option>)}</select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !wallets.includes(walletId)} onClick={() => { if (!connection?.connected || window.confirm("Replace the current shortcut connection? The old key will stop working.")) void request("connect"); }} className="min-h-11 rounded-xl bg-fill px-3 font-semibold text-primary disabled:opacity-50">{busy ? "Please wait…" : connection?.connected ? "Replace connection" : "Create connection"}</button>
        {connection?.connected && <button type="button" disabled={busy} onClick={() => { if (window.confirm("Disconnect automatic shortcut saving?")) void request("disconnect"); }} className="min-h-11 rounded-xl px-3 font-semibold text-rose-500 disabled:opacity-50">Disconnect</button>}
      </div>
      {token && <div className="space-y-2">
        <p>This key is shown once. Copy it into your own shortcut and keep the configured shortcut private.</p>
        <label className="block font-medium text-primary">Private shortcut key<input aria-label="Private shortcut key" readOnly type="password" value={token} onFocus={e => e.currentTarget.select()} className="mt-1 block w-full min-w-0 rounded-lg border border-subtle bg-surface-input px-3 py-2" /></label>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(token); setStatus("Private key copied. Paste it into the shortcut’s setup question."); } catch { setStatus("Select and copy the private key above."); } }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-fill px-3 font-semibold text-primary"><Copy size={14} /> Copy private key</button>
      </div>}
      <p>Assign Finance Tracker Quick Expense in iPhone Settings → Accessibility → Touch → Back Tap. A successful save shows “Saved”; if the request is interrupted, check History before entering it again.</p>
    </div>}
    {status && <p role="status">{status}</p>}
  </div>;
}
