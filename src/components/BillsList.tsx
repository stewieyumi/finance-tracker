import React from "react";
import { BillViewModel, CustomWallet } from "../types/finance";
import { BillMobileRow } from "./BillMobileRow";
import { BillDesktopRow } from "./BillDesktopRow";

export type PayPeriodFilter = "all" | "firstHalf" | "secondHalf";

interface BillsListProps {
  filteredBills: BillViewModel[];
  firstHalfBills: BillViewModel[];
  secondHalfBills: BillViewModel[];
  payPeriod?: PayPeriodFilter;
  selectedFilter: string;
  searchQuery: string;
  selectedMonth: string;
  customWallets?: CustomWallet[];
  highlightOverdue: boolean;
  onToggleStatus: (bill: BillViewModel, skipWalletMutation?: boolean) => void;
  onEdit: (bill: BillViewModel) => void;
  hideSettled?: boolean;
}

export const BillsList: React.FC<BillsListProps> = ({
  filteredBills,
  firstHalfBills,
  secondHalfBills,
  payPeriod = "all",
  selectedFilter,
  searchQuery,
  selectedMonth,
  customWallets,
  highlightOverdue,
  onToggleStatus,
  onEdit,
  hideSettled = false,
}) => {
  const displayedBills = payPeriod === "all"
    ? [...filteredBills.filter(bill => !bill.paid), ...filteredBills.filter(bill => bill.paid)]
    : payPeriod === "firstHalf" ? firstHalfBills : secondHalfBills;
  const periodHeading = payPeriod === "firstHalf" ? "Days 1–15" : "Days 16–31";

  const renderMobileRow = (bill: BillViewModel) => (
    <BillMobileRow
      key={bill.id}
      bill={bill}
      selectedMonth={selectedMonth}
      customWallets={customWallets}
      highlightOverdue={highlightOverdue}
      onToggleStatus={onToggleStatus}
      onEdit={onEdit}
    />
  );

  const renderDesktopRow = (bill: BillViewModel) => (
    <BillDesktopRow
      key={bill.id}
      bill={bill}
      selectedMonth={selectedMonth}
      customWallets={customWallets}
      highlightOverdue={highlightOverdue}
      onToggleStatus={onToggleStatus}
      onEdit={onEdit}
    />
  );

  return (
    <>
      {/* MOBILE LIST */}
      <div className="block md:hidden space-y-3">
        {displayedBills.length === 0 ? (
          <div className="py-6 text-center text-faint text-xs italic">
            No {hideSettled ? "unpaid " : ""}{selectedFilter !== "All" ? selectedFilter.toLowerCase() + " " : ""}commitments found{payPeriod === "firstHalf" ? " for Days 1–15" : payPeriod === "secondHalf" ? " for Days 16–31" : ""}{searchQuery ? ` matching "${searchQuery}"` : ""}.
          </div>
        ) : (
          <div className="space-y-2">
            {payPeriod !== "all" && <div className="text-[10px] font-bold uppercase tracking-wider text-faint px-1">{periodHeading}</div>}
            <div className="overflow-hidden rounded-2xl bg-surface divide-y divide-subtle">
              {displayedBills.map(renderMobileRow)}
            </div>
          </div>
        )}
      </div>

      {/* DESKTOP LIST */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xstable-fixed">
          <colgroup><col style={{ width: "14%" }} /><col style={{ width: "24%" }} /><col style={{ width: "18%" }} /><col style={{ width: "32%" }} /><col style={{ width: "12%" }} /></colgroup>
          <thead>
            <tr className="text-faint border-b border-inverse/[0.05] text-[11px]">
              <th className="py-2.5 px-2 font-semibold">Status</th><th className="py-2.5 px-2 font-semibold">Commitment</th><th className="py-2.5 px-2 font-semibold text-right">Amount</th><th className="py-2.5 px-2 font-semibold">Type & Due Date</th><th className="py-2.5 px-2 font-semibold text-center">Actions</th>
            </tr>
          </thead>
          {displayedBills.length === 0 ? (
            <tbody>
              <tr><td colSpan={5} className="py-6 text-center text-faint italic">No {hideSettled ? "unpaid " : ""}{selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} commitments found{payPeriod === "firstHalf" ? " for Days 1–15" : payPeriod === "secondHalf" ? " for Days 16–31" : ""}{searchQuery ? ` matching "${searchQuery}"` : ""}.</td></tr>
            </tbody>
          ) : (
            <tbody className="divide-y divide-white/[0.03]">
              {payPeriod !== "all" && <tr><td colSpan={5} className="pt-3 pb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-faint">{periodHeading}</td></tr>}
              {displayedBills.map(renderDesktopRow)}
            </tbody>
          )}
        </table>
      </div>
    </>
  );
};
