import {
  Bill,
  BillType,
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
  }) => {
    setGlobalData(prev => {
      const isLoan = bill.type === "Loan / Installment";

      const newBill: Bill = {
        id: generateId("b"),
        name: bill.name,
        amount: bill.amount,
        dueDay: bill.dueDay,
        type: bill.type,
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

  const toggleBillStatus = (bill: Bill) => {
    setGlobalData(prev => {
      const monthLog = prev.logs?.[selectedMonth] || {
        billsPaid: [],
        recsCollected: {}
      };

      const currentPaid = monthLog.billsPaid || [];
      const isPaid = currentPaid.includes(bill.id);

      return {
        ...prev,
        logs: {
          ...prev.logs,
          [selectedMonth]: {
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
    setGlobalData(prev => ({
      ...prev,
      library: {
        ...prev.library,
        bills: prev.library.bills.filter(b => b.id !== id)
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