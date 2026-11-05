import React, { useRef, useState } from "react";
import { Calendar, RefreshCw, X } from "lucide-react";
import type { Shoot, UnifiedFinanceData } from "../types/finance";
import { getFinanceAuth } from "../utils/financeAuth";
import { notifyAuthTokenRejected } from "../hooks/useCloudSync";
import { applyAppleCalendarChange, isCalendarGig, sameCalendarGig, type AppleCalendarEvent, type AppleCalendarPreview } from "../utils/appleCalendar";
import { GIG_CALENDAR_GROUPS, getGigCalendarGroup } from "../utils/gigStatus";
import { Modal } from "./ui/Modal";

interface Props {
  data: UnifiedFinanceData;
  setData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
}

export default function AppleCalendarSync({ data, setData }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<AppleCalendarPreview | null>(null);
  const [message, setMessage] = useState("");
  const [owner, setOwner] = useState("");
  const latestData = useRef(data);
  latestData.current = data;
  const inFlight = useRef(false);

  async function request(body: object, expectedOwner: string) {
    const auth = getFinanceAuth();
    if (!auth.key || auth.key !== expectedOwner) throw new Error("The account changed. Close this review and reopen it.");
    const response = await fetch("/api/apple-calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth.headers },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (getFinanceAuth().key !== expectedOwner) throw new Error("The account changed. Close this review and reopen it.");
    if (response.status === 401) notifyAuthTokenRejected(auth.key);
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not connect to iCloud.");
    return result;
  }

  async function refresh(expectedOwner: string) {
    const result = await request({ action: "preview" }, expectedOwner);
    if (!Array.isArray(result.events) || !Array.isArray(result.missingCalendars) ||
        result.events.some((event: AppleCalendarEvent) => !isCalendarGig(event.gig) || !event.uid || !event.etag ||
          !Object.hasOwn(GIG_CALENDAR_GROUPS, event.group))) throw new Error("The calendar review could not be verified.");
    setPreview(result);
  }

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try { await action(); } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calendar sync failed. Refresh before trying again.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  function startReview() {
    const auth = getFinanceAuth();
    setOwner(auth.key);
    setPreview(null);
    setOpen(true);
    void run(() => refresh(auth.key));
  }

  async function apply(local: Shoot | null, remote: AppleCalendarEvent | null, direction: "push" | "pull") {
    await run(async () => {
      const id = local?.id ?? remote!.gig.id;
      const current = latestData.current.library.shoots.find(gig => gig.id === id) ?? null;
      if (!sameCalendarGig(current, local)) throw new Error("This gig changed in the app. Refresh the review.");
      if (direction === "push") {
        await request({ action: "push", gig: local, expected: remote }, owner);
        setMessage("Reviewed app version sent to iCloud.");
      } else {
        const result = await request({ action: "pull", expected: remote }, owner);
        if (!isCalendarGig(result.gig) || result.gig.id !== id) throw new Error("Could not verify the imported gig.");
        const afterRequest = latestData.current.library.shoots.find(gig => gig.id === id) ?? null;
        if (!sameCalendarGig(afterRequest, local)) throw new Error("This gig changed while syncing. Refresh to review it again.");
        setData(previous => getFinanceAuth().key === owner
          ? applyAppleCalendarChange(previous, { before: local, after: result.gig }) : previous);
        setMessage("Calendar version imported. Refresh to review any remaining differences.");
      }
      // Remove only the reviewed row. A fresh review shows edits made while a request was running.
      setPreview(previous => previous ? {
        ...previous,
        events: previous.events.filter(event => event.gig.id !== id),
      } : previous);
      setReviewedIds(previous => [...previous, id]);
    });
  }
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);
  const remoteById = new Map(preview?.events.map(event => [event.gig.id, event]) ?? []);
  const ids = new Set([...data.library.shoots.map(gig => gig.id), ...remoteById.keys()]);
  const rows = [...ids].filter(id => !reviewedIds.includes(id)).map(id => ({
    local: data.library.shoots.find(gig => gig.id === id) ?? null,
    remote: remoteById.get(id) ?? null,
  })).filter(row => !sameCalendarGig(row.local, row.remote?.gig ?? null));

  function gigDetails(gig: Shoot | null) {
    if (!gig) return <p className="text-xs text-muted">Not added here</p>;
    const group = GIG_CALENDAR_GROUPS[getGigCalendarGroup(gig)];
    return <div className="space-y-1 text-xs">
      <p className="break-words font-semibold text-primary">{gig.title}</p>
      <p className="text-muted">{gig.date || "Set a date first"} · {gig.category || "Other"}</p>
      <span className={`inline-block rounded-md px-2 py-0.5 ${group.chip}`}>{group.label === gig.status ? group.label : `${group.label} · ${gig.status}`}</span>
    </div>;
  }

  return <>
    <button type="button" disabled={busy} onClick={() => { setReviewedIds([]); startReview(); }}
      className="flex h-8 items-center gap-1.5 rounded-xl bg-fill px-2.5 text-xs font-medium text-primary hover:bg-fill-strong">
      <Calendar size={13} /> Apple Calendar
    </button>
    <Modal isOpen={open} onClose={() => setOpen(false)} closeOnBackdropClick={!busy} closeOnEscape={!busy}
      ariaLabel="Review Apple Calendar changes" manageFocus>
      <section className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-subtle bg-surface-elevated shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-subtle p-4 sm:p-5">
          <div><h2 className="text-lg font-semibold text-primary">Apple Calendar</h2>
            <p className="mt-1 text-xs text-muted">Review gigs across all months before syncing with your four iCloud FT calendars.</p></div>
          <button type="button" disabled={busy} aria-label="Close Apple Calendar review" onClick={() => setOpen(false)}
            className="rounded-full p-2 text-muted hover:bg-fill disabled:opacity-50"><X size={18} /></button>
        </header>
        <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">{Object.values(GIG_CALENDAR_GROUPS).map(group =>
            <span key={group.name} className={`rounded-lg px-2 py-1 text-xs font-medium ${group.chip}`}>{group.name}</span>)}</div>
          <p className="text-xs text-muted">Pencil and Confirmed stay Pending until checked Done. Move an event to another FT calendar in Apple Calendar to change its work state, then refresh here.</p>
          {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted"><RefreshCw size={14} className="animate-spin" /> Connecting to iCloud…</p>}
          {message && <p role="status" className="rounded-xl bg-fill p-3 text-sm text-primary">{message}</p>}
          {preview?.missingCalendars.length ? <div className="space-y-3 rounded-2xl bg-fill p-4">
            <p className="text-sm text-primary">Create {preview.missingCalendars.join(", ")} in iCloud with the colors shown above.</p>
            <button type="button" disabled={busy} onClick={() => void run(async () => {
              await request({ action: "setup" }, owner);
              await refresh(owner);
            })} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Create missing FT calendars</button>
          </div> : null}
          {preview && !preview.missingCalendars.length && <>
            <p className="text-sm text-muted">{rows.length ? `${rows.length} ${rows.length === 1 ? "gig" : "gigs"} to review` : "No more items in this review. Refresh to check for changes."}</p>
            {rows.map(({ local, remote }) => <article key={local?.id ?? remote!.gig.id} className="space-y-3 rounded-2xl border border-subtle bg-surface p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><p className="mb-1 text-xs font-medium text-muted">Finance Tracker</p>{gigDetails(local)}</div>
                <div><p className="mb-1 text-xs font-medium text-muted">Apple Calendar</p>{gigDetails(remote?.gig ?? null)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {local && <button type="button" disabled={busy || !isCalendarGig(local)} onClick={() => void apply(local, remote, "push")}
                  className="min-h-10 rounded-xl bg-fill px-3 text-xs font-medium text-primary hover:bg-fill-strong disabled:opacity-40">{remote ? "Use app version" : "Send to Calendar"}</button>}
                {remote && <button type="button" disabled={busy} onClick={() => void apply(local, remote, "pull")}
                  className="min-h-10 rounded-xl bg-blue-600 px-3 text-xs font-medium text-white disabled:opacity-40">{local ? "Use calendar version" : "Import gig"}</button>}
              </div>
            </article>)}
          </>}
          {Boolean(preview?.skipped) && <p className="text-xs text-muted">{preview!.skipped} events skipped. Recurring events, invitations, and entries without a valid title or date need separate handling.</p>}
        </div>
        <footer className="flex justify-end border-t border-subtle p-4">
          <button type="button" disabled={busy} onClick={() => void run(async () => { setReviewedIds([]); await refresh(owner); })}
            className="min-h-10 rounded-xl bg-fill px-4 text-sm font-medium text-primary hover:bg-fill-strong disabled:opacity-40">Refresh review</button>
        </footer>
      </section>
    </Modal>
  </>;
}
