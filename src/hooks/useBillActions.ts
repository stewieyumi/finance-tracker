import {
  Bill,
  BillType,
  BillViewModel,
  UnifiedFinanceData
} from "../types/finance";

import { generateId } from "../utils/idHelpers";

interface UseBillActionsParams {
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  selectedMonth: string;
  showToast: (message: string) => void;
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
  }) => {
    setGlobalData(prev => {
      const isLoan = bill.type === "Loan / Installment";

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

      return {
        ...prev,
        library: {
          ...prev.library,
          bills: [...prev.library.bills, newBill]
        },
        updatedAt: Date.now()
      };
    });

    showToast(`Added ${bill.name}`);
  };

const toggleBillStatus = (bill: BillViewModel) => {
  const targetMonth = bill.targetMonthForDue || selectedMonth;

  setGlobalData(prev => {
    const monthLog = prev.logs?.[targetMonth] || {
      billsPaid: [],
      recsCollected: {}
    };

    const currentPaid = monthLog.billsPaid || [];
    const isPaid = currentPaid.includes(bill.id);

    return {
      ...prev,
      logs: {
        ...prev.logs,
        [targetMonth]: {
          ...monthLog,
          billsPaid: isPaid
            ? currentPaid.filter(id => id !== bill.id)
            : [...currentPaid, bill.id]
        }
      },
      updatedAt: Date.now()
    };
  });
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