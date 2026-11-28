import { useEffect, useRef, useState } from "react";
import { Calendar, Check, X } from "lucide-react";
import type { BillViewModel, FinanceTransitionCommitter, UnifiedFinanceData } from "../types/finance";
import type { PaymentHistoryAction } from "../utils/paymentHistory";
import { useFinanceCalculations } from "../hooks/useFinanceCalculations";
import { resolveBillWallet, useBillActions } from "../hooks/useBillActions";
import { getSafeWalletBalance } from "../utils/financeHelpers";
import { formatPHP } from "../utils/currency";
import { Modal } from "./ui/Modal";
import { entryDialogStyles } from "./ui/dialogStyles";

interface PayBillsAheadModalProps {
  data: UnifiedFinanceData;
  month: string;
  commitBillTransition: FinanceTransitionCommitter;
  showToast: (message: string, action?: PaymentHistoryAction) => void;
  onPaymentsReversed: (ids: string[]) => void;
  onClose: () => void;
}

export function PayBillsAheadModal({ data, month, commitBillTransition, showToast, onPaymentsReversed, onClose }: PayBillsAheadModalProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const [half, setHalf] = useState<"first" | "all">("first");
  // Capture the reviewed row, so concurrent amount/routing changes are rejected by the existing writer.
  const [review, setReview] = useState<BillViewModel | null>(null);
  const [notice, setNotice] = useState<{ message: string; action?: PaymentHistoryAction } | null>(null);
  useEffect(() => { (review ? reviewHeading : heading).current?.focus(); }, [review]);
  const { activeBills } = useFinanceCalculations(data, month);
  const { toggleBillStatus } = useBillActions({ globalData: data, selectedMonth: month, commitBillTransition, onPaymentsReversed,
    showToast: (message, action) => { setNotice({ message, action }); showToast(message, action); } });
  const eligible = activeBills.filter(bill => bill.targetMonthForDue === month && (half === "all" || Number(bill.dueDay) <= 15));
  const blocked = activeBills.filter(bill => !bill.paid && bill.targetMonthForDue !== month && (half === "all" || Number(bill.dueDay) <= 15));
  const wallet = review ? resolveBillWallet(review, data.settings, data.wallets) : null;
  const walletId = wallet?.ok ? wallet.walletId : undefined;
  const walletLabel = walletId ? data.settings?.customWallets?.find(item => item.id === walletId)?.label || data.settings?.walletLabels?.[walletId] || walletId : "";

  return <Modal isOpen onClose={onClose} ariaLabel="Pay bills ahead" manageFocus initialFocusRef={heading}>
    <div className={`${entryDialogStyles.card} flex min-h-0 max-w-lg flex-col gap-4 !overflow-hidden`}>
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3"><span className={entryDialogStyles.icon}><Calendar size={18} aria-hidden="true" /></span><div className="min-w-0"><h2 ref={heading} tabIndex={-1} className="text-base font-semibold text-primary">Pay bills ahead</h2><p className="text-xs text-muted">For {month}</p></div></div>
        <button type="button" aria-label="Close pay bills ahead" className={entryDialogStyles.close} onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain">
        {!review && <p className="text-sm text-muted">Already paid a bill early? Record it here. Your main month view stays where it is. This records a payment; it does not send money to the biller.</p>}
        {!review ? <>
          <div role="group" aria-label="Upcoming due dates" className="flex flex-wrap gap-2">
            {([["first", "1–15 dues"], ["all", "Whole month"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={half === value} onClick={() => setHalf(value)} className={`min-h-11 rounded-xl px-3 text-xs font-semibold ${half === value ? "bg-[var(--bg-selection)] text-white" : "bg-fill text-muted hover:bg-fill-strong"}`}>{label}</button>)}
          </div>
          {eligible.length ? <ul aria-label={`${month} commitments to pay ahead`} className="divide-y divide-subtle rounded-2xl border border-subtle">
            {eligible.map(bill => <li key={bill.id} className="flex min-w-0 items-center justify-between gap-3 p-3">
              <div className="min-w-0"><p className="privacy-blur break-words text-sm font-semibold text-primary">{bill.name}</p><p className="mt-1 text-xs text-muted">{month} · Day {bill.dueDay}</p><p className="privacy-blur mt-1 font-mono text-sm text-primary">{formatPHP(bill.amount)}</p></div>
              {bill.paid ? <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-positive"><Check size={14} aria-hidden="true" />Paid</span> : <button type="button" aria-label={`Pay ${bill.name} for ${month}`} onClick={() => { setNotice(null); setReview(bill); }} className="min-h-11 shrink-0 rounded-xl bg-fill px-3 text-xs font-semibold text-primary hover:bg-fill-strong">Record payment</button>}
            </li>)}
          </ul> : <p className="rounded-xl bg-fill p-4 text-sm text-muted">No eligible commitments in this range.</p>}
          {blocked.length > 0 && <div className="rounded-xl bg-fill p-3 text-xs text-muted"><p className="font-semibold text-primary">Earlier payments still pending</p><ul className="mt-2 space-y-1">{blocked.map(bill => <li key={bill.id} className="privacy-blur break-words">{bill.name} · {bill.targetMonthForDue}</li>)}</ul><p className="mt-2">Settle or review those earlier months first before paying the next installment here.</p></div>}
        </> : <section aria-label="Review early payment" className="space-y-3 rounded-2xl border border-subtle p-4">
          <h3 ref={reviewHeading} tabIndex={-1} className="privacy-blur break-words text-lg font-semibold text-primary">{review.name}</h3>
          <p className="privacy-blur break-words font-mono text-3xl font-bold text-primary">{formatPHP(review.amount)}</p>
          <p className="text-sm text-muted">Settles {month} · Day {review.dueDay}. Payment date: today.</p>
          {walletId ? <p className="privacy-blur break-words text-sm text-primary">Deduct from {walletLabel}<span className="mt-1 block text-xs text-muted">Current balance: {formatPHP(getSafeWalletBalance(data.wallets?.[walletId]))}</span></p> : <p role="alert" className="text-sm text-negative">{wallet && !wallet.ok ? wallet.message : "Choose an active wallet for this commitment first."}</p>}
          <p className="text-xs text-muted">Record only a payment you have already made. It reduces this wallet now and counts in spending on today’s date.</p>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setReview(null)} className="min-h-11 rounded-xl bg-fill px-4 text-sm font-semibold text-primary">Back</button><button type="button" disabled={!walletId} onClick={() => { toggleBillStatus(review, false, true); setReview(null); }} className={`${entryDialogStyles.primary} flex-1`}>Confirm payment</button></div>
        </section>}
        {notice && <div role="status" className="rounded-xl bg-fill p-3 text-sm text-primary"><p>{notice.message}</p>{notice.action && <button type="button" onClick={notice.action.onClick} className="mt-2 min-h-11 rounded-xl px-3 font-semibold text-primary hover:bg-fill-strong">{notice.action.label}</button>}</div>}
      </div>
    </div>
  </Modal>;
}
