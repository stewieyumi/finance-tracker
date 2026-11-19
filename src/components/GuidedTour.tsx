import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sparkles, Zap } from "lucide-react";
import { Modal } from "./ui/Modal";

const steps = [
  { target: "home", title: "Your dashboard", text: "See your money overview, upcoming payments, and recent activity in one place." },
  { target: "wallets", title: "Your wallets", text: "Keep track of where your money is. Add accounts, check balances, or transfer between your own wallets." },
  { target: "expenses", title: "Record your spending", text: "Scan a receipt or screenshot, or enter an expense manually. Review the details and choose the wallet to deduct from." },
  { target: "operations", title: "Plan what comes next", text: "Track commitments you need to pay, inflows you expect to receive, and your gigs or tasks." },
  { target: "account", title: "Make it yours", text: "Find settings, your transaction history, and account options here. You can replay this tour from Dashboard → Getting Started." },
  { target: "account", title: "Quick Expense with Back Tap", text: "On iPhone, the Apple Shortcut lets you enter an expense and choose a wallet without opening the tracker. After setup, you can run it with Back Tap." },
] as const;

interface Props { onClose: () => void; onSetupQuickExpense: () => void; }
interface Layout { highlight?: { left: number; top: number; width: number; height: number }; left: number; top: number; width: number; maxHeight: number; }

export function GuidedTour({ onClose, onSetupQuickExpense }: Props) {
  const [index, setIndex] = useState(0);
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
              {final ? "Tour complete" : `${index + 1} of 5`}
            </span>
            <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-3 text-xs font-medium text-muted hover:bg-fill">
              {final ? "Maybe later" : "Skip tour"}
            </button>
          </div>
          <h2 ref={heading} tabIndex={-1} className="text-lg font-bold text-strong outline-none">{step.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
          {final && <p className="mt-2 text-xs leading-relaxed text-muted">Optional. We’ll open the setup section for you. Adding the shortcut and assigning Back Tap happen in Apple’s apps.</p>}
          <div className="mt-5 flex gap-2">
            {index > 0 && !final && <button type="button" onClick={() => setIndex(value => value - 1)} className="min-h-11 rounded-xl bg-fill px-4 text-sm font-semibold hover:bg-fill-strong">Back</button>}
            <button type="button" onClick={final ? onSetupQuickExpense : () => setIndex(value => value + 1)}
              className="min-h-11 flex-1 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500">
              {final ? "Set up Quick Expense" : index === 4 ? "Finish tour" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
