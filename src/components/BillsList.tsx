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
}) => {
  const showFirstHalf = payPeriod === "all" || payPeriod === "firstHalf";
  const showSecondHalf = payPeriod === "all" || payPeriod === "secondHalf";

  const displayedBillsCount =
    payPeriod === "all"
      ? filteredBills.length
      : payPeriod === "firstHalf"
        ? firstHalfBills.length
        : secondHalfBills.length;

  const renderMobileRow = (bill: BillViewModel) => (
    <BillMobileRow
      key={bill.id}
      bill={bill}
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
        {displayedBillsCount === 0 ? (
          <div className="py-6 text-center text-faint text-xs italic">
            No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} commitments found{payPeriod === "firstHalf" ? " for Days 1–15" : payPeriod === "secondHalf" ? " for Days 16–31" : ""}{searchQuery ? ` matching "${searchQuery}"` : ""}.
          </div>
        ) : (
          <>
            {showFirstHalf && firstHalfBills.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-faint px-1">Days 1–15</div>
                {firstHalfBills.map(bill => renderMobileRow(bill))}
              </div>
            )}
            {showSecondHalf && secondHalfBills.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-faint px-1">Days 16–31</div>
                {secondHalfBills.map(bill => renderMobileRow(bill))}
              </div>
            )}
          </>
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
          {displayedBillsCount === 0 ? (
            <tbody>
              <tr><td colSpan={5} className="py-6 text-center text-faint italic">No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} commitments found{payPeriod === "firstHalf" ? " for Days 1–15" : payPeriod === "secondHalf" ? " for Days 16–31" : ""}{searchQuery ? ` matching "${searchQuery}"` : ""}.</td></tr>
            </tbody>
          ) : (
            <>
              {showFirstHalf && firstHalfBills.length > 0 && (
                <tbody className="divide-y divide-white/[0.03]">
                  <tr><td colSpan={5} className="pt-3 pb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-faint">Days 1–15</td></tr>
                  {firstHalfBills.map(bill => renderDesktopRow(bill))}
                </tbody>
              )}
              {showSecondHalf && secondHalfBills.length > 0 && (
                <tbody className="divide-y divide-white/[0.03]">
                  <tr><td colSpan={5} className="pt-3 pb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-faint">Days 16–31</td></tr>
                  {secondHalfBills.map(bill => renderDesktopRow(bill))}
                </tbody>
              )}
            </>
          )}
        </table>
      </div>
    </>
  );
};
