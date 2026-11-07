// Shared presentation for compact entry dialogs; data and form behavior stay local.
export const entryDialogStyles = {
  card: "max-h-[88dvh] w-full min-w-0 overflow-y-auto overscroll-contain rounded-3xl border border-subtle bg-surface-elevated p-5 shadow-xl",
  header: "mb-4 flex items-center justify-between gap-3",
  icon: "flex size-9 shrink-0 items-center justify-center rounded-full border border-subtle bg-fill text-primary",
  close: "grid size-11 shrink-0 place-items-center rounded-full bg-fill text-muted transition hover:bg-fill-strong hover:text-primary",
  amount: "w-full min-w-0 rounded-2xl border border-strong bg-surface-input py-4 pl-9 pr-4 text-center font-mono text-2xl font-semibold tabular-nums text-strong outline-none transition focus:border-blue-500",
  primary: "flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--bg-selection)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--bg-selection-hover)] disabled:opacity-50",
} as const;
