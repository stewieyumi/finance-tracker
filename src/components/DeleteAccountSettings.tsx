import { useRef, useState } from "react";
import { Modal } from "./ui/Modal";

interface Props { email?: string; onExport: () => void; onDelete?: () => Promise<void>; }
export function DeleteAccountSettings({ email, onExport, onDelete }: Props) {
  const [open, setOpen] = useState(false); const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const close = () => { if (!busy) { setOpen(false); setConfirmation(""); setError(""); } };
  const remove = async () => {
    if (!onDelete || busy || confirmation !== "DELETE") return;
    setBusy(true); setError("");
    try { await onDelete(); setOpen(false); setConfirmation(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Deletion could not be confirmed. Check your connection."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <section className="rounded-2xl border border-subtle bg-surface p-4">
      <h3 className="text-sm font-semibold text-primary">Keep a copy of your data</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">Export a backup before leaving if you want to keep your records.</p>
      <button type="button" data-guide-target="account-backup" onClick={onExport} className="mt-3 min-h-11 rounded-xl bg-fill px-3 text-sm font-semibold text-primary">Export JSON backup</button>
    </section>
    <section className="rounded-2xl border border-rose-500/30 bg-surface p-4">
      <h3 className="text-sm font-semibold text-negative">Delete Finance Tracker account</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">Permanently delete your cloud financial records and saved connections. This does not delete your Google account.</p>
      <button type="button" data-guide-target="delete-account" disabled={!onDelete} onClick={() => { setConfirmation(""); setError(""); setOpen(true); }} className="mt-3 min-h-11 rounded-xl border border-rose-500/40 px-3 text-sm font-semibold text-negative disabled:opacity-50">Delete account</button>
      {!onDelete && <p className="mt-2 text-xs text-muted">Reconnect your account to manage deletion.</p>}
    </section>
    <Modal isOpen={open} onClose={close} ariaLabel="Delete Finance Tracker account" manageFocus initialFocusRef={input} closeOnBackdropClick={!busy} closeOnEscape={!busy} className="!items-start">
      <div className="my-auto w-full max-w-md space-y-4 rounded-3xl border border-subtle bg-surface-modal p-5 text-primary shadow-2xl" onKeyDown={event => { if (event.key !== "Tab") event.stopPropagation(); if (event.key === "Escape") close(); }}>
        <h2 className="text-lg font-bold text-strong">Delete your Finance Tracker account?</h2>
        {email && <p className="break-all text-sm font-semibold">{email}</p>}
        <p className="text-sm leading-relaxed text-muted">Your cloud wallets, transactions, commitments, inflows, gigs, and saved calendar/Quick Expense connections will be deleted. This cannot be undone.</p>
        <p className="text-xs leading-relaxed text-muted">Downloaded backups and events already added to external calendars remain. Offline devices may retain local copies until they reconnect. A minimal deletion marker prevents old devices restoring data. Temporary security and request-replay records expire within 30 days.</p>
        <p className="text-xs leading-relaxed text-muted">This deletes Finance Tracker data, not your Google or bank accounts. Signing in again creates a fresh Finance Tracker profile.</p>
        <label className="block text-sm font-medium">Type DELETE to confirm<input ref={input} aria-label="Type DELETE to confirm" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-strong bg-surface-input px-3 text-base text-primary" /></label>
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        {busy && <p role="status" className="text-sm text-muted">Deleting your account…</p>}
        <div className="flex gap-2"><button type="button" disabled={busy} onClick={close} className="min-h-11 flex-1 rounded-xl bg-fill px-3 text-sm font-semibold disabled:opacity-50">Cancel</button>
          <button type="button" disabled={busy || confirmation !== "DELETE"} onClick={() => void remove()} className="min-h-11 flex-1 rounded-xl bg-rose-700 px-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Deleting…" : "Permanently delete"}</button></div>
      </div>
    </Modal>
  </div>;
}
