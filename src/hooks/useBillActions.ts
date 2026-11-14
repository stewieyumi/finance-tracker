import type { PaymentHistoryAction } from "../utils/paymentHistory";
import { roundMoney } from "../utils/currency";
import {
  Bill,
  BillType,
  BillViewModel,
  UnifiedFinanceData,
  FinanceTransitionCommitter
} from "../types/finance";
import { generateId } from "../utils/idHelpers";
import {
  hasSufficientWalletBalance,
  parseWalletBalance,
  getSafeWalletBalance,
  resolveWalletRoutingOrReject,
  validateActiveWalletAssignment,
  getWalletForBill,
  WalletValidationResult
} from "../utils/financeHelpers";

export function resolveBillWallet(
  bill: BillViewModel,
  settings?: UnifiedFinanceData["settings"],
  wallets?: UnifiedFinanceData["wallets"]
): WalletValidationResult {
  if (bill.wallet && bill.wallet.trim() !== "") {
    return validateActiveWalletAssignment(bill.wallet, settings, wallets);
  }
  const legacyWallet = getWalletForBill(bill.name);
  const legacyValidation = validateActiveWalletAssignment(legacyWallet, settings, wallets);
  if (legacyValidation.ok) {
    return legacyValidation;
  }
  return resolveWalletRoutingOrReject(undefined, settings, wallets);
}
import { getMonthKey, getMonthRange, isValidMonthRange, parseMonthKey } from "../utils/dateHelpers";

export type BillTransitionResult =
  | {
      ok: true;
      data: UnifiedFinanceData;
      action?: "paid" | "undone" | "redone" | "status_updated" | "prior_confirmed";
      settlementId?: string;
      reversedPaymentId?: string;
      reversedAt?: string;
      amount?: number;
      billName?: string;
      skipWalletMutation?: boolean;
      confirmedCount?: number;
    }
  | { ok: false; error: string; data: UnifiedFinanceData };

export function applyBillStatusToggle(
  prev: UnifiedFinanceData,
  bill: BillViewModel,
  selectedMonth: string,
  skipWalletMutation: boolean = false,
  forcedPaid?: boolean,
  expectedSettlementId?: string,
  expectedReversal?: string
): BillTransitionResult {
  const targetMonth = bill.targetMonthForDue || selectedMonth;
  const isCurrentlyPaid = bill.paid;
  const willBePaid = forcedPaid ?? !isCurrentlyPaid;
  const isRedo = expectedReversal !== undefined;
  const settlementId = willBePaid ? expectedSettlementId ?? generateId("bill-payment") : undefined;
  const amount = roundMoney(bill.amount);

  if (willBePaid && !isRedo && (!Number.isFinite(bill.amount) || !Number.isFinite(amount) || bill.amount < 0)) {
    return { ok: false, error: "Invalid bill amount.", data: prev };
  }

  const monthLog = prev.logs?.[targetMonth] || {
    billsPaid: [],
    recsCollected: {}
  };

  // Fresh payments must still refer to the current live bill and occurrence.
  // Historical undo/redo uses its settlement provenance below instead.
  if (willBePaid && !isRedo) {
    const matches = prev.library.bills.filter(item => item.id === bill.id);
    const current = matches[0];
    const currentAmount = monthLog.billOverrides?.[bill.id] ?? current?.amount;
    const start = current?.startMonth || getMonthKey(new Date());
    const end = current?.type === "Loan / Installment" && current.endMonth;
    const last = end && parseMonthKey(end) < parseMonthKey(selectedMonth) ? end : selectedMonth;
    const occurrence = getMonthRange(start, last).find(month => !prev.logs?.[month]?.billsPaid?.includes(bill.id));
    if (
      matches.length !== 1 ||
      current.amount !== bill.baseAmount || currentAmount !== bill.amount ||
      current.wallet !== bill.wallet || current.name !== bill.name ||
      current.type !== bill.type || current.dueDay !== bill.dueDay ||
      current.startMonth !== bill.startMonth || current.endMonth !== bill.endMonth ||
      occurrence !== targetMonth
    ) {
      return { ok: false, error: "This bill changed. Review its current details before paying.", data: prev };
    }
  }

  const currentPaid = monthLog.billsPaid || [];
  if (currentPaid.includes(bill.id) === willBePaid) {
    return { ok: false, error: "Bill status already changed.", data: prev };
  }

  const settlements = monthLog.billSettlements?.[bill.id] ?? [];
  const activeSettlement = settlements[settlements.length - 1];
  if (
    expectedSettlementId &&
    (activeSettlement?.id !== expectedSettlementId || activeSettlement.reversedAt !== expectedReversal)
  ) {
    return {
      ok: false,
      error: "This bill payment changed. Review its current status before trying again.",
      data: prev
    };
  }

  let walletKey = bill.wallet || "";
  if (willBePaid && !isRedo && !skipWalletMutation) {
    const routing = resolveBillWallet(bill, prev.settings, prev.wallets);
    if (!routing.ok) {
      return { ok: false, error: routing.message, data: prev };
    }
    walletKey = routing.walletId;
    const balance = prev.wallets?.[walletKey] ?? 0;
    if (!hasSufficientWalletBalance(balance, amount)) {
      const label = prev.settings?.walletLabels?.[walletKey] || walletKey;
      return {
        ok: false,
        error: `Insufficient balance in ${label}. Need ₱${bill.amount.toLocaleString()}`,
        data: prev
      };
    }
  }

  const todayStr = new Date().toISOString();
  const nextWallets = { ...prev.wallets };
  let nextSettlements = settlements;
  let reversedAt: string | undefined;
  let reversedPaymentId: string | undefined;

  if (isRedo && activeSettlement) {
    const currentBill = prev.library.bills.find(item => item.id === bill.id);
    const currentAmount = monthLog.billOverrides?.[bill.id] ?? currentBill?.amount;
    if (
      !currentBill ||
      currentAmount === undefined ||
      roundMoney(currentAmount) !== activeSettlement.amount ||
      currentBill.type !== bill.type ||
      currentBill.startMonth !== bill.startMonth ||
      currentBill.endMonth !== bill.endMonth
    ) {
      return { ok: false, error: "The bill changed. Review it before paying again.", data: prev };
    }

    const { wallet, walletDebit } = activeSettlement;
    if (!Number.isFinite(walletDebit) || walletDebit < 0) {
      return { ok: false, error: "Invalid settlement amount.", data: prev };
    }
    if (walletDebit > 0) {
      if (
        !wallet ||
        !Object.prototype.hasOwnProperty.call(nextWallets, wallet) ||
        !Number.isFinite(nextWallets[wallet]) ||
        !hasSufficientWalletBalance(nextWallets[wallet], walletDebit)
      ) {
        return {
          ok: false,
          error: "The original payment wallet is unavailable or has insufficient funds.",
          data: prev
        };
      }
      nextWallets[wallet] = roundMoney(nextWallets[wallet] - walletDebit);
    }
    nextSettlements = [...settlements.slice(0, -1), { ...activeSettlement, reversedAt: undefined }];
  } else if (willBePaid && settlementId) {
    const walletDebit = skipWalletMutation ? 0 : amount;
    if (walletDebit > 0) {
      const current = getSafeWalletBalance(nextWallets[walletKey], 0);
      nextWallets[walletKey] = roundMoney(current - walletDebit);
    }
    nextSettlements = [
      ...settlements,
      {
        id: settlementId,
        paidAt: todayStr,
        amount,
        wallet: skipWalletMutation ? null : walletKey,
        walletDebit
      }
    ];
  } else if (activeSettlement && !activeSettlement.reversedAt) {
    const { wallet, walletDebit } = activeSettlement;
    if (!Number.isFinite(walletDebit) || walletDebit < 0) {
      return { ok: false, error: "Invalid settlement record.", data: prev };
    }
    if (walletDebit > 0) {
      if (!wallet) {
        return { ok: false, error: "The original payment wallet is unavailable. Bill remains paid.", data: prev };
      }
      const parsed = parseWalletBalance(prev.wallets?.[wallet]);
      if (!parsed.isValid) {
        return { ok: false, error: "The original payment wallet has an invalid balance.", data: prev };
      }
      nextWallets[wallet] = roundMoney(parsed.balance + walletDebit);
    }
    reversedAt = todayStr;
    reversedPaymentId = activeSettlement.id;
    nextSettlements = [...settlements.slice(0, -1), { ...activeSettlement, reversedAt }];
  }

  const nextMonthLog = {
    ...monthLog,
    ...(nextSettlements !== settlements ? {
      billSettlements: { ...monthLog.billSettlements, [bill.id]: nextSettlements }
    } : {}),
    paymentDates: willBePaid
      ? { ...(monthLog.paymentDates || {}), [bill.id]: isRedo ? activeSettlement.paidAt : todayStr }
      : (() => {
          const pd = { ...(monthLog.paymentDates || {}) };
          delete pd[bill.id];
          return pd;
        })(),
    billsPaid: willBePaid
      ? [...currentPaid, bill.id]
      : currentPaid.filter(id => id !== bill.id)
  };

  return {
    ok: true,
    data: {
      ...prev,
      wallets: nextWallets,
      logs: {
        ...prev.logs,
        [targetMonth]: nextMonthLog
      },
      updatedAt: Date.now()
    },
    action: willBePaid ? (isRedo ? "redone" : "paid") : expectedSettlementId ? "undone" : "status_updated",
    settlementId,
    reversedPaymentId,
    reversedAt,
    amount,
    billName: bill.name,
    skipWalletMutation
  };
}

export function applyConfirmPriorBillPayments(
  prev: UnifiedFinanceData,
  billId: string,
  selectedMonths: string[],
  today: Date = new Date()
): { ok: true; data: UnifiedFinanceData; count: number } | { ok: false; error: string; data: UnifiedFinanceData } {
  const bill = prev.library.bills.find(entry => entry.id === billId);
  if (bill?.type !== "Loan / Installment" || !bill.startMonth || !bill.endMonth) {
    return { ok: false, error: "Installment details are invalid.", data: prev };
  }
  const confirmedAt = today.toISOString();
  const allowed = new Set(getMonthRange(bill.startMonth, bill.endMonth));
  const elapsed = new Set(getMonthRange(bill.startMonth, getMonthKey(today)));
  const logs = { ...prev.logs };
  let count = 0;
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
        [billId]: [
          ...(log?.billSettlements?.[billId] ?? []),
          {
            id: crypto.randomUUID(),
            paidAt: confirmedAt,
            amount,
            wallet: null,
            walletDebit: 0,
            priorConfirmation: true
          }
        ]
      }
    };
    count += 1;
  }
  return {
    ok: true,
    data: count ? { ...prev, logs, updatedAt: today.getTime() } : prev,
    count
  };
}

interface UseBillActionsParams {
  globalData: UnifiedFinanceData;
  setGlobalData?: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  commitBillTransition?: FinanceTransitionCommitter;
  selectedMonth: string;
  onPaymentsReversed?: (ids: string[]) => void;
  showToast: (message: string, action?: PaymentHistoryAction) => void;
}

export function useBillActions({
  globalData,
  setGlobalData,
  commitBillTransition,
  selectedMonth,
  onPaymentsReversed,
  showToast
}: UseBillActionsParams) {
  const executeTransition = <T extends { ok: boolean; data: UnifiedFinanceData }>(
    transition: (prev: UnifiedFinanceData) => T
  ): T => {
    if (commitBillTransition) {
      return commitBillTransition(transition);
    }
    if (setGlobalData) {
      let result: T | undefined;
      setGlobalData(prev => {
        result = transition(prev);
        return result.ok ? result.data : prev;
      });
      if (result) return result;
      return transition(globalData);
    }
    return { ok: false, error: "No state updater or transition committer provided.", data: globalData } as unknown as T;
  };

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

    const result = executeTransition(prev => ({
      ok: true,
      data: {
        ...prev,
        library: {
          ...prev.library,
          bills: [...prev.library.bills, newBill]
        },
        updatedAt: Date.now()
      }
    }));

    if (result.ok) {
      showToast(`Added ${bill.name}`);
      return newBill;
    }
    return null;
  };

  const toggleBillStatus = (
    bill: BillViewModel,
    skipWalletMutation: boolean = false,
    forcedPaid?: boolean,
    expectedSettlementId?: string,
    expectedReversal?: string
  ) => {
    const willBePaid = forcedPaid ?? !bill.paid;
    const isRedo = expectedReversal !== undefined;
    const amount = roundMoney(bill.amount);

    if (willBePaid && !isRedo && (!Number.isFinite(bill.amount) || !Number.isFinite(amount) || bill.amount < 0)) return;

    if (willBePaid && !isRedo && !skipWalletMutation) {
      const routing = resolveBillWallet(bill, globalData.settings, globalData.wallets);
      if (!routing.ok) {
        showToast(routing.message);
        return;
      }
      const walletKey = routing.walletId;
      if (!hasSufficientWalletBalance(globalData.wallets?.[walletKey] ?? 0, amount)) {
        const label = globalData.settings?.walletLabels?.[walletKey] || walletKey;
        showToast(`Insufficient balance in ${label}. Need ₱${bill.amount.toLocaleString()}`);
        return;
      }
    }

    const outcome = executeTransition(prev =>
      applyBillStatusToggle(
        prev,
        bill,
        selectedMonth,
        skipWalletMutation,
        forcedPaid,
        expectedSettlementId,
        expectedReversal
      )
    );

    if (!outcome.ok) {
      showToast(outcome.error);
      return;
    }

    const description = `₱${amount.toLocaleString()} payment for ${bill.name}`;
    if ((outcome.action === "paid" || outcome.action === "redone") && outcome.settlementId) {
      showToast(
        outcome.skipWalletMutation
          ? `Marked ₱${bill.amount.toLocaleString()} as already paid (no wallet change)`
          : `Paid ₱${bill.amount.toLocaleString()}`,
        {
          label: "Undo",
          paymentId: outcome.settlementId,
          description,
          onClick: () => toggleBillStatus(bill, skipWalletMutation, false, outcome.settlementId)
        }
      );
    } else if (outcome.action === "undone" && expectedSettlementId && outcome.reversedAt) {
      showToast("Bill payment undone.", {
        label: "Redo",
        paymentId: expectedSettlementId,
        description,
        onClick: () => toggleBillStatus(bill, skipWalletMutation, true, expectedSettlementId, outcome.reversedAt)
      });
    } else {
      if (outcome.reversedPaymentId) onPaymentsReversed?.([outcome.reversedPaymentId]);
      showToast("Bill payment status updated.");
    }
  };

  const confirmPriorBillPayments = (billId: string, selectedMonths: string[]) => {
    const outcome = executeTransition(prev =>
      applyConfirmPriorBillPayments(prev, billId, selectedMonths)
    );
    if (!outcome.ok) {
      showToast(outcome.error);
      return;
    }
    if (outcome.count) {
      showToast(`Confirmed ${outcome.count} installment${outcome.count === 1 ? "" : "s"}. Wallet balances unchanged.`);
    }
  };

  const deleteBill = (id: string) => {
    if (!confirm("Remove this bill from Plan? Recorded payments will stay in Transaction History.")) return;

    const outcome = executeTransition(prev => {
      const item = prev.library.bills.find(entry => entry.id === id);
      if (!item) return { ok: false, error: "Bill not found.", data: prev };
      const hasPaymentHistory = Object.values(prev.logs ?? {}).some(
        log => log.billsPaid?.includes(id) || log.billSettlements?.[id]?.length
      );

      return {
        ok: true,
        data: {
          ...prev,
          library: {
            ...prev.library,
            bills: prev.library.bills.filter(entry => entry.id !== id),
            ...(hasPaymentHistory ? { archivedBills: [...(prev.library.archivedBills ?? []), item] } : {})
          },
          updatedAt: Date.now()
        }
      };
    });

    if (outcome.ok) {
      showToast("Bill removed from Plan");
    } else {
      showToast(outcome.error);
    }
  };

  return {
    addBill,
    toggleBillStatus,
    confirmPriorBillPayments,
    deleteBill
  };
}
