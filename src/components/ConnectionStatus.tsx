import { useEffect, useId, useRef, useState } from "react";
import { WifiOff } from "lucide-react";

interface ConnectionStatusProps {
  isOnline: boolean;
  syncNeedsSignIn: boolean;
  isSyncing: boolean;
}

export function ConnectionStatus({ isOnline, syncNeedsSignIn, isSyncing }: ConnectionStatusProps) {
  const label = !isOnline ? "Offline" : syncNeedsSignIn ? "Sync paused" : isSyncing ? "Syncing…" : "Live";
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tooltipId = useId();
  const cancelHold = () => clearTimeout(holdTimer.current);

  useEffect(() => () => clearTimeout(holdTimer.current), []);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div ref={container} className="relative shrink-0 no-privacy-blur"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onBlur={() => setOpen(false)}
      onKeyDown={event => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
      <button type="button" aria-label={`Connection status: ${label}`}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        onPointerDown={event => {
          cancelHold();
          if (event.pointerType !== "mouse") holdTimer.current = setTimeout(() => setOpen(true), 500);
        }}
        onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerMove={cancelHold}
        onContextMenu={event => event.preventDefault()}
        className={`flex h-8 w-6 items-center justify-center gap-1.5 rounded-full text-[11px] font-medium transition sm:h-auto sm:w-auto sm:px-2.5 sm:py-0.5 ${!isOnline || syncNeedsSignIn ? "text-warning sm:chip-amber" : isSyncing ? "text-info sm:chip-blue" : "text-positive sm:chip-emerald"}`}>
        {!isOnline ? <WifiOff size={12} aria-hidden="true" /> : (
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${isSyncing && !syncNeedsSignIn ? "bg-current motion-safe:animate-pulse" : "bg-current"}`} />
        )}
        <span className="hidden sm:inline">{label}</span>
      </button>
      <span role="status" className="sr-only">{label}</span>
      {open && <span role="tooltip" id={tooltipId} className="pointer-events-none absolute left-0 top-full z-[70] mt-1 whitespace-nowrap rounded-lg border border-subtle bg-surface-modal px-2.5 py-1.5 text-xs font-medium text-primary shadow-lg">{label}</span>}
    </div>
  );
}
