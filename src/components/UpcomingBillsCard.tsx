import { useId, useRef, useState } from "react";
import { ArrowRight, Calendar, X } from "lucide-react";
import { formatPHP } from "../utils/currency";
import { Modal } from "./ui/Modal";
import { entryDialogStyles } from "./ui/dialogStyles";

export interface UpcomingBill {
  id: string;
  month: string;
  name: string;
  daysLeft: number;
  amount: number;
}

export function UpcomingBillsCard({ bills: upcomingBills, onViewAll, onSelect }: { bills: UpcomingBill[]; onViewAll: () => void; onSelect: (bill: UpcomingBill) => void }) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const modalHeading = useRef<HTMLHeadingElement>(null);
  const select = (bill: UpcomingBill) => { setOpen(false); requestAnimationFrame(() => onSelect(bill)); };
  return <>
    <section aria-labelledby={headingId}>
      <div role="button" tabIndex={0} aria-label="Next 7 Days, view commitments" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(true)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen(true); } }}
        className="dashboard-material cursor-pointer rounded-3xl p-5 text-left transition hover:brightness-105 sm:p-6">
        <div className="flex items-center justify-between gap-3"><h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-muted"><Calendar size={17} aria-hidden="true" /> Next 7 Days</h2><ArrowRight size={18} aria-hidden="true" className="text-muted" /></div>
        <p className="mt-3 break-words font-mono text-2xl font-bold tracking-tight text-strong">{upcomingBills.length} {upcomingBills.length === 1 ? "commitment" : "commitments"}</p>
        <p className="mt-1 text-xs text-muted">{upcomingBills.length ? "Unpaid and due within the next 7 days" : "No unpaid commitments due in the next 7 days."}</p>
      </div>
    </section>
    {open && <Modal isOpen onClose={() => setOpen(false)} ariaLabel="Next 7 Days" manageFocus initialFocusRef={modalHeading}>
      <div className={`${entryDialogStyles.card} max-w-md space-y-4`}>
        <header className={entryDialogStyles.header}><div className="flex min-w-0 items-center gap-3"><span className={entryDialogStyles.icon}><Calendar size={18} aria-hidden="true" /></span><div><h3 ref={modalHeading} tabIndex={-1} className="text-base font-semibold text-primary">Next 7 Days</h3><p className="mt-0.5 text-xs text-muted">Unpaid commitments, nearest due date first</p></div></div><button type="button" aria-label="Close next 7 days" className={entryDialogStyles.close} onClick={() => setOpen(false)}><X size={18} aria-hidden="true" /></button></header>
        {upcomingBills.length ? <ul className="divide-y divide-subtle overflow-hidden rounded-2xl bg-surface-low">
          {upcomingBills.map(bill => <li key={`${bill.id}-${bill.month}`}><button type="button" onClick={() => select(bill)} className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-3 text-left text-xs transition hover:bg-fill">
            <span className="min-w-0"><span className="privacy-blur block break-words font-semibold text-primary">{bill.name}</span><span className="mt-1 block text-muted">{bill.daysLeft === 0 ? "Due today" : `Due in ${bill.daysLeft}d`} · {bill.month}</span></span><span className="privacy-blur shrink-0 font-mono font-semibold text-primary">{formatPHP(bill.amount)}</span>
          </button></li>)}
        </ul> : <p className="rounded-xl bg-surface-low p-4 text-sm text-muted">No unpaid commitments due in the next 7 days.</p>}
        <button type="button" onClick={() => { setOpen(false); requestAnimationFrame(onViewAll); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-fill px-3 text-sm font-semibold text-primary hover:bg-fill-strong">View all commitments <ArrowRight size={15} aria-hidden="true" /></button>
      </div>
    </Modal>}
  </>;
}
