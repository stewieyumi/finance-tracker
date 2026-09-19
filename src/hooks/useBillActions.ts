import { roundMoney } from "../utils/currency";
import {
  Bill,
  BillType,
  BillViewModel,
  UnifiedFinanceData
} from "../types/finance";

import { generateId } from "../utils/idHelpers";
import { getWalletForBill } from "../utils/financeHelpers";
import { isValidMonthRange } from "../utils/dateHelpers";

interface UseBillActionsParams {
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  selectedMonth: string;
  showToast: (message: string, action?: { label: string; onClick: () => void }) => void;
}

export function useBillActions({
  setGlobalData,
  selectedMonth,
  showToast
}: UseBillActionsParams) {
  const addBill = (bill: {
    name: string;
    amount: number;
    dueDay: string;
    type: BillType;
    startMonth: string;
    endMonth: string;
    wallet?: string;
  }): Bill | null => {
    const isLoan = bill.type === "Loan / Installment";

    if (isLoan && !isValidMonthRange(bill.startMonth, bill.endMonth)) {
      showToast("Loan start month must be on or before the end month");
      return null;
    }

    const newBill: Bill = {
      id: generateId("b"),
      name: bill.name,
      amount: bill.amount,
      dueDay: bill.dueDay,
      type: bill.type,
      wallet: bill.wallet,
      startMonth: isLoan ? bill.startMonth : selectedMonth,
      endMonth: isLoan ? bill.endMonth : ""
    };

    setGlobalData(prev => ({
      ...prev,
      library: {
        ...prev.library,
        bills: [...prev.library.bills, newBill]
      },
      updatedAt: Date.now()
    }));

    showToast(`Added ${bill.name}`);
    return newBill;
  };

  const toggleBillStatus = (bill: BillViewModel, skipWalletMutation: boolean = false) => {
    const targetMonth = bill.targetMonthForDue || selectedMonth;
    const walletKey = bill.wallet || getWalletForBill(bill.name);

    setGlobalData(prev => {
      const monthLog = prev.logs?.[targetMonth] || {
        billsPaid: [],
        recsCollected: {}
      };

      const currentPaid = monthLog.billsPaid || [];
      const isCurrentlyPaid = currentPaid.includes(bill.id);
      const willBePaid = !isCurrentlyPaid;
      const today = new Date(); const todayStr = today.toISOString();

      const nextWallets = { ...prev.wallets };
      
      // Auto-deduct or refund the wallet balance
      if (!skipWalletMutation) {
        if (willBePaid) {
          nextWallets[walletKey] = roundMoney(Math.max(0, (nextWallets[walletKey] || 0) - bill.amount));
        } else {
          nextWallets[walletKey] = roundMoney((nextWallets[walletKey] || 0) + bill.amount);
        }
      }

      return {
        ...prev,
        wallets: nextWallets,
        logs: {
          ...prev.logs,
          [targetMonth]: {
            ...monthLog,
            paymentDates: willBePaid 
              ? { ...(monthLog.paymentDates || {}), [bill.id]: todayStr }
              : (()=>{ const pd = {...(monthLog.paymentDates || {})}; delete pd[bill.id]; return pd; })(),
            billsPaid: isCurrentlyPaid
              ? currentPaid.filter(id => id !== bill.id)
              : [...currentPaid, bill.id]
          }
        },
        updatedAt: Date.now()
      };
    });

    if (!bill.paid) {
      showToast(
        skipWalletMutation
          ? `Marked ₱${bill.amount.toLocaleString()} as already paid (no wallet change)`
          : `Paid ₱${bill.amount.toLocaleString()}`,
        {
          label: "Undo",
          onClick: () => toggleBillStatus(bill, skipWalletMutation)
        }
      );
    } else {
      showToast(
        skipWalletMutation
          ? `Unmarked (no wallet change)`
          : `Unmarked ₱${bill.amount.toLocaleString()} (refunded to wallet)`
      );
    }
  };

  const deleteBill = (id: string) => {
    if (!confirm("Delete this bill from your library?")) return;

    setGlobalData(prev => ({
      ...prev,
      library: {
        ...prev.library,
        bills: prev.library.bills.filter(
          bill => bill.id !== id
        )
      },
      updatedAt: Date.now()
    }));

    showToast("Bill deleted");
  };

  return {
    addBill,
    toggleBillStatus,
    deleteBill
  };
}
