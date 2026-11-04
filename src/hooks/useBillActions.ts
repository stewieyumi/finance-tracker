import type { PaymentHistoryAction } from "../utils/paymentHistory";
import { roundMoney } from "../utils/currency";
import {
  Bill,
  BillType,
  BillViewModel,
  UnifiedFinanceData
} from "../types/finance";

import { generateId } from "../utils/idHelpers";
import {
  getWalletForBill,
  hasSufficientWalletBalance
} from "../utils/financeHelpers";
import { getMonthKey, getMonthRange, isValidMonthRange } from "../utils/dateHelpers";

interface UseBillActionsParams {
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  selectedMonth: string;
  onPaymentsReversed?: (ids: string[]) => void;
  showToast: (message: string, action?: PaymentHistoryAction) => void;
}

export function useBillActions({
  globalData,
  setGlobalData,
  selectedMonth,
  onPaymentsReversed,
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

  const toggleBillStatus = (
    bill: BillViewModel,
    skipWalletMutation: boolean = false,
    forcedPaid?: boolean,
    expectedSettlementId?: string,
    expectedReversal?: string
  ) => {
    const targetMonth = bill.targetMonthForDue || selectedMonth;
    const walletKey = bill.wallet || getWalletForBill(bill.name);

    const isCurrentlyPaid = bill.paid;
    const willBePaid = forcedPaid ?? !isCurrentlyPaid;
    const isRedo = expectedReversal !== undefined;
    const settlementId = willBePaid ? expectedSettlementId ?? generateId("bill-payment") : undefined;
    const amount = roundMoney(bill.amount);
    if (willBePaid && !isRedo && (!Number.isFinite(bill.amount) || !Number.isFinite(amount) || bill.amount < 0)) return;

    if (
      willBePaid &&
      !isRedo &&
      !skipWalletMutation &&
      !hasSufficientWalletBalance(
        globalData.wallets?.[walletKey] ?? 0,
        amount
      )
    ) {
      showToast(
        `Insufficient balance in ${globalData.settings?.walletLabels?.[walletKey] || walletKey}. Need ₱${bill.amount.toLocaleString()}`
      );
      return;
    }

    let feedback: string | undefined;
    let applied = false;
    let reversedAt: string | undefined;
    let reversedPaymentId: string | undefined;
    setGlobalData(prev => {
      const monthLog = prev.logs?.[targetMonth] || {
        billsPaid: [],
        recsCollected: {}
      };

      const currentPaid = monthLog.billsPaid || [];
      if (currentPaid.includes(bill.id) === willBePaid) {
        feedback = "Bill status already changed.";
        return prev;
      }

      const settlements = monthLog.billSettlements?.[bill.id] ?? [];
      const activeSettlement = settlements[settlements.length - 1];
      if (expectedSettlementId && (activeSettlement?.id !== expectedSettlementId ||
        activeSettlement.reversedAt !== expectedReversal)) {
        feedback = "This bill payment changed. Review its current status before trying again.";
        return prev;
      }

      const balance = prev.wallets?.[walletKey] ?? 0;
      if (willBePaid && !isRedo && !skipWalletMutation && !hasSufficientWalletBalance(balance, amount)) {
        feedback = "Insufficient wallet balance to pay this bill.";
        return prev;
      }

      const todayStr = new Date().toISOString();
      const nextWallets = { ...prev.wallets };
      let nextSettlements = settlements;
      if (isRedo && activeSettlement) {
        const currentBill = prev.library.bills.find(item => item.id === bill.id);
        const currentAmount = monthLog.billOverrides?.[bill.id] ?? currentBill?.amount;
        if (!currentBill || currentAmount === undefined || roundMoney(currentAmount) !== activeSettlement.amount ||
          currentBill.type !== bill.type || currentBill.startMonth !== bill.startMonth || currentBill.endMonth !== bill.endMonth) {
          feedback = "The bill changed. Review it before paying again.";
          return prev;
        }

        const { wallet, walletDebit } = activeSettlement;
        if (!Number.isFinite(walletDebit) || walletDebit < 0) return prev;
        if (walletDebit > 0) {
          if (!wallet || !Object.prototype.hasOwnProperty.call(nextWallets, wallet) ||
            !Number.isFinite(nextWallets[wallet]) || !hasSufficientWalletBalance(nextWallets[wallet], walletDebit)) {
            feedback = "The original payment wallet is unavailable or has insufficient funds.";
            return prev;
          }
          nextWallets[wallet] = roundMoney(nextWallets[wallet] - walletDebit);
        }
        nextSettlements = [...settlements.slice(0, -1), { ...activeSettlement, reversedAt: undefined }];
      } else if (willBePaid && settlementId) {
        const walletDebit = skipWalletMutation ? 0 : amount;
        if (walletDebit > 0) nextWallets[walletKey] = roundMoney(balance - walletDebit);
        nextSettlements = [...settlements, {
          id: settlementId, paidAt: todayStr, amount,
          wallet: skipWalletMutation ? null : walletKey,
          walletDebit
        }];
      } else if (activeSettlement && !activeSettlement.reversedAt) {
        const { wallet, walletDebit } = activeSettlement;
        if (!Number.isFinite(walletDebit) || walletDebit < 0) return prev;
        if (walletDebit > 0) {
          if (!wallet || !Object.prototype.hasOwnProperty.call(prev.wallets, wallet) ||
            !Number.isFinite(prev.wallets[wallet])) {
            feedback = "The original payment wallet is unavailable. Bill remains paid.";
            return prev;
          }
          nextWallets[wallet] = roundMoney(prev.wallets[wallet] + walletDebit);
        }
        reversedAt = todayStr;
        reversedPaymentId = activeSettlement.id;
        nextSettlements = [...settlements.slice(0, -1), { ...activeSettlement, reversedAt }];
      }

      applied = true;
      return {
        ...prev,
        wallets: nextWallets,
        logs: {
          ...prev.logs,
          [targetMonth]: {
            ...monthLog,
            ...(nextSettlements !== settlements ? {
              billSettlements: { ...monthLog.billSettlements, [bill.id]: nextSettlements }
            } : {}),
            paymentDates: willBePaid 
              ? { ...(monthLog.paymentDates || {}), [bill.id]: isRedo ? activeSettlement.paidAt : todayStr }
              : (()=>{ const pd = {...(monthLog.paymentDates || {})}; delete pd[bill.id]; return pd; })(),
            billsPaid: willBePaid
              ? [...currentPaid, bill.id]
              : currentPaid.filter(id => id !== bill.id)
          }
        },
        updatedAt: Date.now()
      };
    });

    if (!applied) {
      if (feedback) showToast(feedback);
      return;
    }

    const description = `₱${amount.toLocaleString()} payment for ${bill.name}`;
    if (willBePaid && settlementId) {
      showToast(
        skipWalletMutation
          ? `Marked ₱${bill.amount.toLocaleString()} as already paid (no wallet change)`
          : `Paid ₱${bill.amount.toLocaleString()}`,
        {
          label: "Undo",
          paymentId: settlementId,
          description,
          onClick: () => toggleBillStatus(bill, skipWalletMutation, false, settlementId)
        }
      );
    } else if (expectedSettlementId && reversedAt) {
      showToast("Bill payment undone.", {
        label: "Redo",
        paymentId: expectedSettlementId,
        description,
        onClick: () => toggleBillStatus(bill, skipWalletMutation, true, expectedSettlementId, reversedAt),
      });
    } else {
      if (reversedPaymentId) onPaymentsReversed?.([reversedPaymentId]);
      showToast("Bill payment status updated.");
    }
  };

  const confirmPriorBillPayments = (billId: string, selectedMonths: string[]) => {
    const today = new Date();
    const confirmedAt = today.toISOString();
    let count = 0;
    setGlobalData(prev => {
      count = 0;
      const bill = prev.library.bills.find(entry => entry.id === billId);
      if (bill?.type !== "Loan / Installment" || !bill.startMonth || !bill.endMonth) return prev;
      const allowed = new Set(getMonthRange(bill.startMonth, bill.endMonth));
      const elapsed = new Set(getMonthRange(bill.startMonth, getMonthKey(today)));
      const logs = { ...prev.logs };
      for (const month of new Set(selectedMonths)) {
        if (!allowed.has(month) || !elapsed.has(month)) continue;
        const log = logs[month];
        if (log?.billsPaid?.includes(billId)) continue;
        const amount = roundMoney(log?.billOverrides?.[billId] ?? bill.amount);
        if (!Number.isFinite(amount) || amount < 0) continue;
        logs[month] = {
          ...log,
          billsPaid: [...(log?.billsPaid ?? []), billId],
          billSettlements: {
            ...log?.billSettlements,
            [billId]: [...(log?.billSettlements?.[billId] ?? []), {
              id: crypto.randomUUID(), paidAt: confirmedAt, amount,
              wallet: null, walletDebit: 0, priorConfirmation: true
            }]
          }
        };
        count += 1;
      }
      return count ? { ...prev, logs, updatedAt: today.getTime() } : prev;
    });
    if (count) showToast(`Confirmed ${count} installment${count === 1 ? "" : "s"}. Wallet balances unchanged.`);
  };

  const deleteBill = (id: string) => {
    if (!confirm("Remove this bill from Plan? Recorded payments will stay in Transaction History.")) return;

    setGlobalData(prev => {
      const item = prev.library.bills.find(entry => entry.id === id);
      if (!item) return prev;
      const hasPaymentHistory = Object.values(prev.logs ?? {}).some(log =>
        log.billsPaid?.includes(id) || log.billSettlements?.[id]?.length
      );

      return {
        ...prev,
        library: {
          ...prev.library,
          bills: prev.library.bills.filter(entry => entry.id !== id),
          ...(hasPaymentHistory ? { archivedBills: [...(prev.library.archivedBills ?? []), item] } : {}),
        },
        updatedAt: Date.now(),
      };
    });

    showToast("Bill removed from Plan");
  };

  return {
    addBill,
    toggleBillStatus,
    confirmPriorBillPayments,
    deleteBill
  };
}
