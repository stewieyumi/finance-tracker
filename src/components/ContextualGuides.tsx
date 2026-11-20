import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./ui/Modal";
import { CONTEXT_GUIDES, type ContextGuideStep } from "./contextGuideSteps";
import { GUIDE_OPEN_EVENT, GUIDE_PREFERENCE_EVENT, readGuidePreferences, saveGuidePreferences } from "../utils/contextGuidePreferences";

const visible = (element: Element | null): element is HTMLElement => element instanceof HTMLElement && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
interface ActiveGuide { screen: string; root: HTMLElement; steps: ContextGuideStep[]; }
interface Props { subject: string; paused: boolean; automaticPaused?: boolean; onActiveChange: (active: boolean) => void; }

export function ContextualGuides({ subject, paused, automaticPaused = false, onActiveChange }: Props) {
  const [active, setActive] = useState<ActiveGuide | null>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const completed = useRef(new Set<string>());
  useEffect(() => { onActiveChange(Boolean(active) && !paused); }, [active, paused, onActiveChange]);
  useEffect(() => () => onActiveChange(false), [onActiveChange]);
  useEffect(() => {
    const app = document.getElementById("root");
    if (!app || paused) { setActive(null); return; }
    let timer: ReturnType<typeof setTimeout>;
    const surface = () => {
      const dialogs = Array.from(app.querySelectorAll('[role="dialog"][aria-modal="true"]')).filter(visible);
      const parent = dialogs.at(-1) ?? app;
      return Array.from(parent.querySelectorAll<HTMLElement>("[data-guide-screen]")).filter(visible).at(-1);
    };
    const open = (root: HTMLElement) => {
      const screen = root.dataset.guideScreen!;
      const definition = CONTEXT_GUIDES[screen];
      if (!definition) return;
      const steps = definition.steps.filter(step => visible(root.querySelector(step.target)));
      if (steps.length) setActive({ screen, root, steps });
    };
    const scan = () => {
      const root = surface();
      if (activeRef.current) {
        if (activeRef.current.root !== root || !root?.isConnected) setActive(null);
        return;
      }
      const preferences = readGuidePreferences(subject);
      if (!root || !preferences.automatic || automaticPaused) return;
      const screen = root.dataset.guideScreen!;
      if (!completed.current.has(screen) && !preferences.completed.includes(screen)) open(root);
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, 350); };
    const replay = (event: Event) => {
      const root = surface();
      if (root && root.dataset.guideScreen === (event as CustomEvent).detail) open(root);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-guide-screen", "hidden"] });
    window.addEventListener(GUIDE_OPEN_EVENT, replay);
    window.addEventListener(GUIDE_PREFERENCE_EVENT, schedule);
    window.addEventListener("storage", schedule);
    schedule();
    return () => {
      clearTimeout(timer); observer.disconnect();
      window.removeEventListener(GUIDE_OPEN_EVENT, replay);
      window.removeEventListener(GUIDE_PREFERENCE_EVENT, schedule);
      window.removeEventListener("storage", schedule);
    };
  }, [subject, paused, automaticPaused]);

  if (!active || paused) return null;
  const close = () => {
    completed.current.add(active.screen);
    const preferences = readGuidePreferences(subject);
    saveGuidePreferences(subject, { ...preferences, completed: [...new Set([...preferences.completed, active.screen])] });
    setActive(null);
    requestAnimationFrame(() => { if (active.root.isConnected) active.root.querySelector<HTMLButtonElement>("[data-guide-replay]")?.focus({ preventScroll: true }); });
  };
  return createPortal(<SpotlightGuide key={active.screen} guide={active} onClose={close} />, document.body);
}

function SpotlightGuide({ guide, onClose }: { guide: ActiveGuide; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState<{ target: DOMRect; top: number; left: number; width: number; maxHeight: number }>();
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = guide.steps[index];
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const previous = root.inert; const previousHidden = root.getAttribute("aria-hidden");
    root.inert = true; root.setAttribute("aria-hidden", "true");
    return () => { root.inert = previous; if (previousHidden === null) root.removeAttribute("aria-hidden"); else root.setAttribute("aria-hidden", previousHidden); };
  }, []);
  useEffect(() => {
    const target = guide.root.querySelector<HTMLElement>(step.target);
    if (!visible(target)) { onClose(); return; }
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    const position = () => {
      if (!target.isConnected) return;
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0; const y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth; const height = viewport?.height ?? window.innerHeight;
      const rect = target.getBoundingClientRect();
      const availableAbove = rect.top - y - 24; const availableBelow = y + height - rect.bottom - 24;
      const above = availableAbove >= availableBelow;
      const available = Math.max(160, above ? availableAbove : availableBelow);
      const maxHeight = Math.min(height - 32, available);
      const panelHeight = Math.min(card.current?.offsetHeight || 260, maxHeight);
      const panelWidth = Math.min(360, width - 32);
      const top = above ? rect.top - panelHeight - 16 : rect.bottom + 16;
      setLayout({ target: rect, left: Math.max(x + 16, Math.min(rect.left + rect.width / 2 - panelWidth / 2, x + width - panelWidth - 16)),
        top: Math.max(y + 16, Math.min(top, y + height - panelHeight - 16)), width: panelWidth, maxHeight });
    };
    position();
    const observer = new ResizeObserver(position); if (card.current) observer.observe(card.current); observer.observe(target);
    window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position); window.visualViewport?.addEventListener("scroll", position);
    heading.current?.focus({ preventScroll: true });
    return () => { observer.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position); window.visualViewport?.removeEventListener("scroll", position); };
  }, [guide, step, onClose]);

  return <Modal isOpen onClose={onClose} ariaLabel={`${CONTEXT_GUIDES[guide.screen].name} walkthrough`} manageFocus initialFocusRef={heading}
    closeOnEscape={false} closeOnBackdropClick={false} className="!z-[300] !block !overflow-hidden !bg-transparent !p-0 !backdrop-blur-none">
    <div data-context-guide={guide.screen} className="absolute inset-0" onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); } else if (event.key !== "Tab") event.stopPropagation();
    }}>
      {layout ? <div data-testid="context-spotlight" aria-hidden="true" className="pointer-events-none fixed rounded-xl border-2 border-blue-400" style={{ left: layout.target.left - 4, top: layout.target.top - 4, width: layout.target.width + 8, height: layout.target.height + 8, boxShadow: "0 0 0 9999px rgba(0,0,0,0.58)" }} /> : <div className="absolute inset-0 bg-black/60" />}
      <div ref={card} className="fixed overflow-y-auto rounded-3xl border border-subtle bg-surface-modal p-4 text-primary shadow-2xl sm:p-5"
        style={layout ? { left: layout.left, top: layout.top, width: layout.width, maxHeight: layout.maxHeight } : { left: 16, top: 16, width: "calc(100% - 32px)", maxWidth: 360 }}>
        <div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-medium text-muted">{index + 1} of {guide.steps.length}</span>
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-3 text-xs text-muted hover:bg-fill">Skip guide</button></div>
        <h2 ref={heading} tabIndex={-1} className="text-base font-bold text-strong outline-none">{step.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
        <div className="mt-4 flex gap-2">
          {index > 0 && <button type="button" onClick={() => setIndex(index - 1)} className="min-h-11 rounded-xl bg-fill px-3 text-sm font-semibold hover:bg-fill-strong">Back</button>}
          <button type="button" onClick={index === guide.steps.length - 1 ? onClose : () => setIndex(index + 1)} className="min-h-11 flex-1 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500">{index === guide.steps.length - 1 ? "Done" : "Next"}</button>
        </div>
      </div>
    </div>
  </Modal>;
}
