import React from "react";
import { Check, Circle, Edit2 } from "lucide-react";
import { BillViewModel, CustomWallet } from "../types/finance";
import { formatDaysRemaining } from "../utils/dateHelpers";
import { LoanProgressBadge } from "./LoanProgressBadge";

interface BillDesktopRowProps {
  bill: BillViewModel;
  selectedMonth: string;
  customWallets?: CustomWallet[];
  highlightOverdue: boolean;
  onToggleStatus: (bill: BillViewModel) => void;
  onEdit: (bill: BillViewModel) => void;
}

export const BillDesktopRow: React.FC<BillDesktopRowProps> = ({
  bill,
  selectedMonth,
  customWallets,
  highlightOverdue,
  onToggleStatus,
  onEdit,
}) => (
    <tr key={bill.id} onClick={() => onEdit(bill)} className={`group transition-all duration-150 cursor-pointer ${bill.paid ? "opacity-40 hover:opacity-70" : "hover:bg-inverse/[0.04]"} ${highlightOverdue && (bill.daysLeft ?? 0) < 0 && !bill.paid ? 'bg-orange-900/10' : ''}`}>
      <td className="py-2.5 px-2 align-top pt-3">
        <button type="button" onClick={(e) => { e.stopPropagation(); onToggleStatus(bill); }} aria-label={bill.paid ? `Mark ${bill.name} as pending` : `Mark ${bill.name} as paid`} className="flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg">
          {bill.paid ? <span className="flex items-center justify-center gap-1 w-[85px] text-[11px] font-semibold chip-blue px-2 py-1 rounded-lg transition-all"><Check size={11} className="stroke-[3]" /> Paid</span> : <span className="flex items-center justify-center gap-1 w-[85px] text-[11px] font-medium chip-rose px-2 py-1 rounded-lg transition-all"><Circle size={9} className="fill-current/20" /> Pending</span>}
        </button>
      </td>
      <td className="py-2.5 px-2 align-top pt-3 text-primary truncate font-medium">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="privacy-blur font-semibold">{bill.name}</span>
            {!bill.paid && bill.targetMonthForDue && bill.targetMonthForDue !== selectedMonth && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                For {bill.targetMonthForDue}
              </span>
            )}
          </div>
          {bill.isOverridden && <span className="text-[9px] font-mono text-amber-400 flex items-center gap-1">• {selectedMonth.split(" ")[0]} bill adjusted</span>}
        </div>
      </td>
      <td className={`py-2.5 px-2 align-top pt-3 text-right font-mono font-semibold ${bill.paid ? "text-blue-400" : "text-strong"}`}>
        ₱{bill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </td>
      <td className="py-2.5 px-2 align-top text-muted text-[11px]">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${bill.type === "Subscription" ? "chip-purple" : bill.type === "Loan / Installment" ? "chip-amber" : "chip-blue"}`}>{bill.type}</span>
            {bill.wallet && <span className="chip-wallet px-1.5 py-0.5 rounded font-semibold tracking-wider text-[9px] uppercase">{customWallets?.find(cw => cw.id === bill.wallet)?.label || bill.wallet}</span>}
            {bill.dueDay && <span className="text-[11px] text-muted font-mono">Day {bill.dueDay}</span>}
            {bill.paid ? (
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide chip-emerald">Settled</span>
            ) : (
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide ${formatDaysRemaining(bill.daysLeft).tone === "urgent" ? "chip-rose animate-pulse" : formatDaysRemaining(bill.daysLeft).tone === "overdue" ? "chip-rose" : formatDaysRemaining(bill.daysLeft).tone === "warning" ? "chip-amber" : "chip-neutral"}`}>{formatDaysRemaining(bill.daysLeft).text}</span>
            )}
          </div>
          {bill.type === "Loan / Installment" && <div className="mt-1"><LoanProgressBadge startMonth={bill.startMonth} endMonth={bill.endMonth} targetMonthForDue={bill.targetMonthForDue} isPaid={bill.paid} monthlyAmount={bill.baseAmount} totalPaid={bill.totalLoanPaid} paidInstallments={bill.paidLoanInstallments} /></div>}
        </div>
      </td>
      <td className="py-2.5 px-2 align-top text-center whitespace-nowrap pt-2">
        <div className="inline-flex items-center gap-1 bg-surface-high p-1 rounded-lg border border-inverse/[0.05]">
          <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(bill); }} className="px-2 py-1 text-muted hover:text-amber-300 hover:bg-inverse/[0.05] rounded-md text-[10px] flex items-center transition">
            <Edit2 size={10} className="mr-1"/> Edit
          </button>
        </div>
      </td>
    </tr>
  );
