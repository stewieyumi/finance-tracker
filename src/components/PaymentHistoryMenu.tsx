import { useEffect, useRef, useState } from "react";
import { Ellipsis, Redo2, Undo2 } from "lucide-react";
import type { PaymentHistoryAction } from "../utils/paymentHistory";

interface PaymentHistoryMenuProps {
  undo?: PaymentHistoryAction;
  redo?: PaymentHistoryAction;
  isPrivate: boolean;
  onSelect: (action: PaymentHistoryAction) => void;
}

export function PaymentHistoryMenu({ undo, redo, isPrivate, onSelect }: PaymentHistoryMenuProps) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div ref={container} className="relative"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={event => {
        if (open && event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button ref={trigger} type="button" aria-label="Payment history" aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-strong bg-fill/80 text-muted shadow-sm transition hover:bg-fill-strong hover:text-primary">
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 z-[70] mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-xl border border-subtle bg-surface-modal p-1 shadow-2xl">
          {([
            { label: "Undo", action: undo, Icon: Undo2 },
            { label: "Redo", action: redo, Icon: Redo2 },
          ] as const).map(({ label, action, Icon }) => (
            <button key={label} type="button" disabled={!action}
              onClick={() => {
                if (!action) return;
                setOpen(false);
                trigger.current?.focus();
                onSelect(action);
              }}
              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-primary hover:bg-fill-strong disabled:text-faint disabled:hover:bg-transparent">
              <Icon size={15} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{label}{action && !isPrivate ? ` ${action.description}` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
