import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sparkles, Zap } from "lucide-react";
import { Modal } from "./ui/Modal";

const quickSteps = [
  { target: "home", title: "Your dashboard", text: "See your balances, actual income, and upcoming payments together.", details: ["Switch months to review another period. Wallet totals show the money currently in your accounts.", "Goals, Runway, and Yearly views help you plan. Regular-pay planning is optional."] },
  { target: "wallets", title: "Your wallets", text: "Add bank accounts, e-wallets, and cash. Record starting balances before tracking spending.", details: ["Transfer moves money between your own wallets. Only a transfer fee counts as spending.", "Choose From and To wallets and check their balances before saving."] },
  { target: "expenses", title: "Record your spending", text: "Choose Scan for a receipt photo or screenshot, or Manual to type the details.", details: ["Review the amount, date, category, and paying wallet before saving.", "Recent expenses and Transaction History help you check or correct entries."] },
  { target: "operations", title: "Plan what comes next", text: "Operations separates money coming in, payments going out, and work to do.", details: ["Inflows: client payments, salary, sales, or allowance; amount and date can be added later.", "Commitments track bills and installments. Gigs & Tasks track work; finishing a gig does not mean its payment arrived."] },
  { target: "account", title: "Make it yours", text: "Account holds settings, installation help, and your full transaction history.", details: ["Customize work labels, categories, wallet defaults, and optional regular pay in Settings.", "Back up or restore data in Cloud Sync. Advanced calendar connections are optional."] },
] as const;
const featureSteps = [
  quickSteps[0], quickSteps[1], quickSteps[2],
  { target: "operations", title: "Track incoming money", text: "Use Inflows for a project, retainer, salary, sale, gift, or allowance.", details: ["Start with a name when the amount or payment date is not known yet.", "Record a full or partial receipt only when paid, and choose the wallet receiving it. Expected income is separate from received income."] },
  { target: "operations", title: "Manage commitments", text: "Track bills, subscriptions, one-time payments, and installments in Commitments.", details: ["Set the amount and due date or schedule. Check upcoming and overdue payments.", "Mark a payment when you actually pay it, choosing the paying wallet. A schedule alone does not pay a bill."] },
  { target: "operations", title: "Organize gigs and tasks", text: "Track client work and other tasks in Gigs & Tasks.", details: ["Pencil and Confirmed are pending work. Use Moved or Cancelled when plans change, and the left check to mark work done.", "Add an event to your calendar if needed. Track the related client payment separately in Inflows."] },
  { target: "home", title: "Goals and planning", text: "Set a savings milestone and link the wallet whose balance shows its progress.", details: ["Runway and Yearly views help review upcoming commitments and longer-term plans.", "Configure Payday Plan only if you have regular pay. Irregular income works through Inflows without a salary schedule."] },
  { target: "account", title: "Review transaction history", text: "Open View Full History from Account to review records, newest first.", details: ["Search, filter by type or month, or expand Date range for specific dates.", "Manage Ledger provides corrections for saved records. Export a backup before a large cleanup."] },
  { target: "account", title: "Settings and backups", text: "Open Settings to adjust appearance, work presets, categories, and wallet defaults.", details: ["Regular pay and deductions are optional. A work preset changes labels and categories, not your balances.", "Cloud Sync includes JSON backup and restore tools. Check sync status before switching devices."] },
  { target: "account", title: "Optional calendar tools", text: "Start with Add to Calendar when you want an event for a gig or task.", details: ["Direct iCloud sync is an optional advanced connection with its own setup.", "The tracker works without connecting a calendar. You can set up advanced connections later when you need them."] },
] as const;
const shortcutStep = { target: "account", title: "Quick Expense and app access", text: "Add Finance Tracker to your device for quick access. On iPhone, the optional Quick Expense shortcut can collect details and save an expense to your chosen wallet.", details: [] };

interface Props { onClose: () => void; onSetupQuickExpense: () => void; onInstallApp?: () => void; }

interface Layout { highlight?: { left: number; top: number; width: number; height: number }; left: number; top: number; width: number; maxHeight: number; }

export function GuidedTour({ onClose, onSetupQuickExpense, onInstallApp }: Props) {
  const [index, setIndex] = useState(0);
  const [fullTour, setFullTour] = useState(false);
  const steps = [...(fullTour ? featureSteps : quickSteps), shortcutStep];
  const [layout, setLayout] = useState<Layout>();
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = steps[index];
  const final = index === steps.length - 1;

  useLayoutEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    target?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
    const position = () => {
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0;
      const y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const cardWidth = Math.min(360, width - 32);
      const cardHeight = Math.min(panel.current?.offsetHeight || 280, height - 32);
      const rect = target?.getBoundingClientRect();
      const visible = rect && rect.width > 0 && rect.height > 0 && rect.bottom > y && rect.top < y + height;
      const highlight = visible ? { left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 } : undefined;
      const top = visible
        ? (rect.top - cardHeight - 20 >= y + 16 ? rect.top - cardHeight - 20 : rect.bottom + 20)
        : y + (height - cardHeight) / 2;
      setLayout({ highlight, left: Math.max(x + 16, Math.min((rect ? rect.left + rect.width / 2 : x + width / 2) - cardWidth / 2, x + width - cardWidth - 16)),
        top: Math.max(y + 16, Math.min(top, y + height - cardHeight - 16)), width: cardWidth, maxHeight: height - 32 });
    };
    position();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(position);
    if (panel.current) observer?.observe(panel.current);
    if (target) observer?.observe(target);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [step]);

  const positioned = Boolean(layout);
  useEffect(() => {
    if (!positioned) return;
    // Let the preceding Getting Started dialog restore its focus before taking over.
    const frame = requestAnimationFrame(() => heading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [index, positioned]);

  return (
    <Modal isOpen onClose={onClose} ariaLabel="App tour" manageFocus initialFocusRef={heading}
      closeOnBackdropClick={false} closeOnEscape={false}
      className="!block !overflow-hidden !bg-transparent !p-0 !backdrop-blur-none">
      <div className="absolute inset-0" onKeyDown={event => {
        // Keep app-wide shortcuts from navigating or saving behind the tour.
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        else if (event.key !== "Tab") event.stopPropagation();
      }}>
        {layout?.highlight ? (
          <div data-testid="tour-spotlight" data-target={step.target} aria-hidden="true"
            className={`pointer-events-none fixed rounded-2xl border-2 ${final ? "border-amber-400" : "border-blue-400"}`}
            style={{ ...layout.highlight, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }} />
        ) : <div aria-hidden="true" className="absolute inset-0 bg-black/55" />}
        <div ref={panel} style={layout ? { position: "fixed", left: layout.left, top: layout.top, width: layout.width, maxHeight: layout.maxHeight } : { position: "fixed", left: 16, top: 16, width: "calc(100% - 32px)", maxWidth: 360 }}
          className="relative overflow-y-auto rounded-3xl border border-subtle bg-surface-modal p-5 text-primary shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-secondary">
              {final ? <Zap size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
              {final ? "Tour complete" : `${index + 1} of ${steps.length - 1}`}
            </span>
            <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-3 text-xs font-medium text-muted hover:bg-fill">
              {final ? "Maybe later" : "Skip tour"}
            </button>
          </div>
          {index === 0 && <div role="group" aria-label="Tour length" className="mb-3 flex gap-2">
            {([false, true] as const).map(full => <button key={String(full)} type="button" aria-pressed={fullTour === full}
              onClick={() => setFullTour(full)} className={`min-h-11 flex-1 rounded-xl px-3 text-xs font-semibold ${fullTour === full ? "bg-blue-600 text-white" : "bg-fill text-primary"}`}>{full ? "All features" : "Quick tour"}</button>)}
          </div>}
          <h2 ref={heading} tabIndex={-1} className="text-lg font-bold text-strong outline-none">{step.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
          {!final && <details className="mt-3 text-xs text-muted">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold text-primary">More about this area</summary>
            <ul className="list-disc space-y-2 pl-4 leading-relaxed">{step.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
          </details>}
          {final && onInstallApp && <button type="button" onClick={onInstallApp} className="mt-3 min-h-11 w-full rounded-xl bg-fill px-3 text-sm font-semibold text-primary">Install app / see steps</button>}
          {final && <p className="mt-2 text-xs leading-relaxed text-muted">Quick Expense / Back Tap is for iPhone. We’ll open its setup section; adding the shortcut and assigning Back Tap happen in Apple’s apps. You can finish here without setting it up.</p>}
          <div className="mt-5 flex gap-2">
            {index > 0 && !final && <button type="button" onClick={() => setIndex(value => value - 1)} className="min-h-11 rounded-xl bg-fill px-4 text-sm font-semibold hover:bg-fill-strong">Back</button>}
            <button type="button" onClick={final ? onSetupQuickExpense : () => setIndex(value => value + 1)}
              className="min-h-11 flex-1 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500">
              {final ? "Set up Quick Expense" : index === steps.length - 2 ? "Finish tour" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
