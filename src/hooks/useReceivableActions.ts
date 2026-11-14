import type { PaymentHistoryAction } from "../utils/paymentHistory";
import { normalizePaydayDays, isValidDateKey, getMonthKey, getMonthRange, parseDateKey } from "../utils/dateHelpers";
import {
  MonthLog,
  Receivable,
  ReceivableCategory,
  ReceivableFrequency,
  ReceivableViewModel,
  ReceivableSettlement,
  UnifiedFinanceData,
  FinanceTransitionCommitter
} from "../types/finance";
import { generateId } from "../utils/idHelpers";
import { roundMoney } from "../utils/currency";
import {
  hasSufficientWalletBalance,
  parseWalletBalance,
  resolveWalletRoutingOrReject
} from "../utils/financeHelpers";

interface UseReceivableActionsParams {
  globalData: UnifiedFinanceData;
  setGlobalData?: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  commitReceivableTransition?: FinanceTransitionCommitter;
  selectedMonth: string;
  onPaymentsReversed?: (ids: string[]) => void;
  showToast: (message: string, action?: PaymentHistoryAction) => void;
}

type Receipt = ReceivableSettlement & { id: string };
type ReceiptStatus = NonNullable<MonthLog["recsCollected"]>[string];

export interface ReceiptChange {
  receivable: ReceivableViewModel;
  targetMonth: string;
  receipt: Receipt;
  before: ReceiptStatus;
  after: ReceiptStatus;
  previousPaymentDate?: string;
}

export type ReceivableActionTransitionResult =
  | {
      ok: true;
      data: UnifiedFinanceData;
      action?: "collected" | "reversed" | "paid" | "replayed_redo" | "replayed_undo";
      change?: ReceiptChange;
      reversedPaymentIds?: string[];
      message?: string;
    }
  | { ok: false; error: string; data: UnifiedFinanceData };

export function applyReceiptReplay(
  prev: UnifiedFinanceData,
  change: ReceiptChange,
  undoneAt?: string
): ReceivableActionTransitionResult {
  const { receivable, targetMonth, receipt, before, after, previousPaymentDate } = change;
  const { id } = receivable;
  const isRedo = undoneAt !== undefined;
  const expected = isRedo ? before : after;
  const expectedDate = isRedo ? previousPaymentDate : receipt.receivedAt;
  const nextDate = isRedo ? receipt.receivedAt : previousPaymentDate;
  const reversalDate = new Date().toISOString();

  const monthLog = prev.logs?.[targetMonth];
  const settlements = monthLog?.receivableSettlements?.[id];
  const entry = settlements?.find(candidate => candidate.id === receipt.id);
  const status = monthLog?.recsCollected?.[id];

  if (
    !monthLog ||
    !settlements ||
    !entry ||
    !status ||
    entry.reversedAt !== undoneAt ||
    entry.amount !== receipt.amount ||
    entry.wallet !== receipt.wallet ||
    entry.walletCredit !== receipt.walletCredit ||
    entry.receivedAt !== receipt.receivedAt ||
    entry.paydayDay !== receipt.paydayDay ||
    status.amountReceived !== expected.amountReceived ||
    status.collected !== expected.collected ||
    monthLog.paymentDates?.[id] !== expectedDate
  ) {
    return { ok: false, error: "This receipt changed. Review the current inflow before trying again.", data: prev };
  }

  if (isRedo) {
    const current = prev.library.receivables.find(item => item.id === id);
    if (
      !current ||
      current.amount !== receivable.amount ||
      current.frequency !== receivable.frequency ||
      current.date !== receivable.date ||
      current.startMonth !== receivable.startMonth ||
      current.monthlyDay !== receivable.monthlyDay ||
      normalizePaydayDays(current.biMonthlyDays).join() !== normalizePaydayDays(receivable.biMonthlyDays).join()
    ) {
      return { ok: false, error: "This receipt changed. Review the current inflow before trying again.", data: prev };
    }
  } else if ([...settlements].reverse().find(candidate => !candidate.reversedAt)?.id !== receipt.id) {
    return { ok: false, error: "This receipt changed. Review the current inflow before trying again.", data: prev };
  }

  const { wallet, walletCredit } = entry;
  const wallets = { ...prev.wallets };
  if (walletCredit > 0) {
    if (!wallet) {
      return { ok: false, error: "The original wallet is unavailable.", data: prev };
    }
    const parsed = parseWalletBalance(wallets[wallet]);
    if (!parsed.isValid) {
      return { ok: false, error: "The original wallet has an invalid balance.", data: prev };
    }
    if (!isRedo && !hasSufficientWalletBalance(parsed.balance, walletCredit)) {
      return { ok: false, error: "The original wallet is unavailable or has insufficient funds.", data: prev };
    }
    wallets[wallet] = roundMoney(parsed.balance + (isRedo ? walletCredit : -walletCredit));
  }

  const paymentDates = { ...monthLog.paymentDates };
  if (nextDate !== undefined) paymentDates[id] = nextDate;
  else delete paymentDates[id];

  return {
    ok: true,
    data: {
      ...prev,
      wallets,
      logs: {
        ...prev.logs,
        [targetMonth]: {
          ...monthLog,
          paymentDates,
          recsCollected: { ...monthLog.recsCollected, [id]: isRedo ? after : before },
          receivableSettlements: {
            ...monthLog.receivableSettlements,
            [id]: settlements.map(candidate =>
              candidate.id === receipt.id
                ? { ...candidate, reversedAt: isRedo ? undefined : reversalDate }
                : candidate
            )
          }
        }
      },
      updatedAt: Date.now()
    },
    action: isRedo ? "replayed_redo" : "replayed_undo",
    change: isRedo ? change : { ...change, previousPaymentDate: reversalDate }
  };
}

// Check live identity and schedule only for new credits. Reversals keep using
// the recorded original wallet even if the inflow has since changed/archived.
function isCurrentReceivable(
  prev: UnifiedFinanceData,
  receivable: ReceivableViewModel,
  selectedMonth: string
): boolean {
  const matches = prev.library.receivables.filter(item => item.id === receivable.id);
  const current = matches[0];
  if (
    matches.length !== 1 || current.amount !== receivable.amount ||
    current.wallet !== receivable.wallet || current.frequency !== receivable.frequency ||
    current.date !== receivable.date || current.startMonth !== receivable.startMonth ||
    current.monthlyDay !== receivable.monthlyDay ||
    normalizePaydayDays(current.biMonthlyDays).join() !== normalizePaydayDays(receivable.biMonthlyDays).join()
  ) return false;

  let occurrence: string;
  if (current.frequency === "By Date") {
    if (!isValidDateKey(current.date)) return false;
    occurrence = getMonthKey(parseDateKey(current.date!));
    // Preserve the display's compatibility with one-time receipts logged in an
    // older month, rather than posting a second occurrence in the scheduled month.
    if (!prev.logs?.[occurrence]?.recsCollected?.[current.id] &&
        !prev.logs?.[occurrence]?.receivableSettlements?.[current.id]) {
      occurrence = Object.keys(prev.logs ?? {}).find(month =>
        prev.logs[month]?.recsCollected?.[current.id] || prev.logs[month]?.receivableSettlements?.[current.id]
      ) || occurrence;
    }
    if (getMonthRange(occurrence, selectedMonth).length === 0) return false;
  } else {
    const months = getMonthRange(current.startMonth || getMonthKey(new Date()), selectedMonth);
    occurrence = months.find(month => !prev.logs?.[month]?.recsCollected?.[current.id]?.collected) || "";
  }
  return occurrence === (receivable.targetMonthForDue || selectedMonth);
}

export function applyReceivableStatusToggle(
  prev: UnifiedFinanceData,
  receivable: ReceivableViewModel,
  selectedMonth: string
): ReceivableActionTransitionResult {
  const targetMonth = receivable.targetMonthForDue || selectedMonth;
  const receivableAmount = Math.max(0, parseFloat(String(receivable.amount)) || 0);

  const monthLog = prev.logs?.[targetMonth] || { billsPaid: [], recsCollected: {} };
  const currentRecord = monthLog.recsCollected?.[receivable.id] || { amountReceived: 0, collected: false };
  const currentAmount = Math.max(0, parseFloat(String(currentRecord.amountReceived)) || 0);

  if (
    roundMoney(currentAmount) !== roundMoney(receivable.amountReceived) ||
    (currentAmount === 0 && currentRecord.collected !== receivable.collected)
  ) {
    return { ok: false, error: "This receipt changed. Review the current amount before trying again.", data: prev };
  }

  const reversing = currentAmount > 0 || currentRecord.collected;
  if (!reversing && !isCurrentReceivable(prev, receivable, selectedMonth)) {
    return { ok: false, error: "This inflow changed. Review its current details before collecting.", data: prev };
  }
  const newAmountReceived = reversing ? 0 : roundMoney(receivableAmount);
  if (!Number.isFinite(newAmountReceived)) {
    return { ok: false, error: "Invalid receivable amount.", data: prev };
  }

  const newCollected = !reversing;
  const todayStr = new Date().toISOString();
  const nextWallets = { ...prev.wallets };
  const settlements = monthLog.receivableSettlements?.[receivable.id] ?? [];
  let nextSettlements = settlements;
  let reversedPaymentIds: string[] = [];
  let change: ReceiptChange | undefined;

  if (reversing) {
    for (const settlement of settlements) {
      if (settlement.reversedAt) continue;
      const { wallet, walletCredit } = settlement;
      if (!Number.isFinite(walletCredit) || walletCredit < 0) {
        return { ok: false, error: "Invalid settlement record.", data: prev };
      }
      if (walletCredit === 0) continue;
      if (!wallet) {
        return { ok: false, error: "Reversal blocked: an original wallet is unavailable.", data: prev };
      }
      const parsed = parseWalletBalance(nextWallets[wallet]);
      if (!parsed.isValid) {
        return { ok: false, error: "Reversal blocked: an original wallet has an invalid balance.", data: prev };
      }
      if (!hasSufficientWalletBalance(parsed.balance, walletCredit)) {
        return {
          ok: false,
          error: "Reversal blocked: an original wallet is unavailable or has insufficient funds.",
          data: prev
        };
      }
      nextWallets[wallet] = roundMoney(parsed.balance - walletCredit);
    }
    reversedPaymentIds = settlements.flatMap(settlement => (settlement.id ? [settlement.id] : []));
    nextSettlements = settlements.map(settlement =>
      settlement.reversedAt ? settlement : { ...settlement, reversedAt: todayStr }
    );
  } else if (newAmountReceived > 0) {
    const routing = resolveWalletRoutingOrReject(receivable.wallet, prev.settings, prev.wallets);
    if (!routing.ok) {
      return { ok: false, error: routing.message, data: prev };
    }
    const targetWallet = routing.walletId;
    const parsed = parseWalletBalance(nextWallets[targetWallet]);
    if (!parsed.isValid) {
      return { ok: false, error: "Target wallet has an invalid balance.", data: prev };
    }
    nextWallets[targetWallet] = roundMoney(parsed.balance + newAmountReceived);

    const receipt: Receipt = {
      id: generateId("receipt"),
      receivedAt: todayStr,
      amount: newAmountReceived,
      wallet: targetWallet,
      walletCredit: newAmountReceived
    };
    nextSettlements = [...settlements, receipt];
    change = {
      receivable,
      targetMonth,
      receipt,
      before: currentRecord,
      after: { amountReceived: newAmountReceived, collected: newCollected },
      previousPaymentDate: monthLog.paymentDates?.[receivable.id]
    };
  }

  const nextPaymentDates = { ...(monthLog.paymentDates || {}) };
  if (newCollected || newAmountReceived > 0) {
    nextPaymentDates[receivable.id] = todayStr;
  } else {
    delete nextPaymentDates[receivable.id];
  }

  return {
    ok: true,
    data: {
      ...prev,
      wallets: nextWallets,
      logs: {
        ...prev.logs,
        [targetMonth]: {
          ...monthLog,
          ...(nextSettlements.length
            ? {
                receivableSettlements: {
                  ...monthLog.receivableSettlements,
                  [receivable.id]: nextSettlements
                }
              }
            : {}),
          paymentDates: nextPaymentDates,
          recsCollected: {
            ...(monthLog.recsCollected || {}),
            [receivable.id]: { amountReceived: newAmountReceived, collected: newCollected }
          }
        }
      },
      updatedAt: Date.now()
    },
    action: reversing ? "reversed" : "collected",
    change,
    reversedPaymentIds,
    message: reversing ? "Receipt reversed." : "Receipt marked collected."
  };
}

export function applyAddPayment(
  prev: UnifiedFinanceData,
  receivable: ReceivableViewModel,
  amount: number,
  selectedMonth: string,
  paydayDay?: number
): ReceivableActionTransitionResult {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Invalid payment amount.", data: prev };
  }

  const targetMonth = receivable.targetMonthForDue || selectedMonth;
  const receivableAmount = Math.max(0, parseFloat(String(receivable.amount)) || 0);

  const monthLog = prev.logs?.[targetMonth] || { billsPaid: [], recsCollected: {} };
  const currentRecord = monthLog.recsCollected?.[receivable.id] || { amountReceived: 0, collected: false };
  const currentAmount = Math.max(0, parseFloat(String(currentRecord.amountReceived)) || 0);

  if (
    roundMoney(currentAmount) !== roundMoney(receivable.amountReceived) ||
    (currentAmount === 0 && currentRecord.collected !== receivable.collected)
  ) {
    return { ok: false, error: "This receipt changed. Review the current amount before trying again.", data: prev };
  }

  if (!isCurrentReceivable(prev, receivable, selectedMonth)) {
    return { ok: false, error: "This inflow changed. Review its current details before collecting.", data: prev };
  }

  let requested = amount;
  if (paydayDay !== undefined) {
    const days = normalizePaydayDays(receivable.biMonthlyDays);
    const index = days.indexOf(paydayDay);
    if (receivable.frequency !== "Bi-monthly" || days.length !== 2 || index < 0) {
      return { ok: false, error: "Invalid payday configuration.", data: prev };
    }
    const first = roundMoney(receivableAmount / 2);
    const expected = index === 0 ? first : roundMoney(receivableAmount - first);
    const received = (monthLog.receivableSettlements?.[receivable.id] ?? [])
      .filter(entry => !entry.reversedAt && entry.paydayDay === paydayDay)
      .reduce((total, entry) => total + entry.amount, 0);
    requested = Math.min(requested, roundMoney(expected - received));
  }

  const newAmount = roundMoney(Math.min(currentAmount + requested, receivableAmount));
  const amountDelta = roundMoney(newAmount - currentAmount);

  if (!Number.isFinite(amountDelta) || amountDelta <= 0) {
    return { ok: false, error: "No payment applied. Check the amount and remaining balance.", data: prev };
  }

  const routing = resolveWalletRoutingOrReject(receivable.wallet, prev.settings, prev.wallets);
  if (!routing.ok) {
    return { ok: false, error: routing.message, data: prev };
  }
  const targetWallet = routing.walletId;

  const nextWallets = { ...prev.wallets };
  const parsed = parseWalletBalance(nextWallets[targetWallet]);
  if (!parsed.isValid) {
    return { ok: false, error: "Target wallet has an invalid balance.", data: prev };
  }
  nextWallets[targetWallet] = roundMoney(parsed.balance + amountDelta);

  const todayStr = new Date().toISOString();
  const settlement: Receipt = {
    id: generateId("receipt"),
    receivedAt: todayStr,
    amount: amountDelta,
    wallet: targetWallet,
    walletCredit: amountDelta,
    ...(paydayDay === undefined ? {} : { paydayDay })
  };

  const change: ReceiptChange = {
    receivable,
    targetMonth,
    receipt: settlement,
    before: currentRecord,
    after: { amountReceived: newAmount, collected: newAmount >= receivableAmount },
    previousPaymentDate: monthLog.paymentDates?.[receivable.id]
  };

  const message = `Recorded ₱${amountDelta.toLocaleString()} in ${targetWallet}.`;

  return {
    ok: true,
    data: {
      ...prev,
      wallets: nextWallets,
      logs: {
        ...prev.logs,
        [targetMonth]: {
          ...monthLog,
          receivableSettlements: {
            ...monthLog.receivableSettlements,
            [receivable.id]: [...(monthLog.receivableSettlements?.[receivable.id] ?? []), settlement]
          },
          paymentDates: { ...(monthLog.paymentDates || {}), [receivable.id]: todayStr },
          recsCollected: {
            ...(monthLog.recsCollected || {}),
            [receivable.id]: { amountReceived: newAmount, collected: newAmount >= receivableAmount }
          }
        }
      },
      updatedAt: Date.now()
    },
    action: "paid",
    change,
    message
  };
}

export function useReceivableActions({
  globalData,
  setGlobalData,
  commitReceivableTransition,
  selectedMonth,
  showToast,
  onPaymentsReversed
}: UseReceivableActionsParams) {
  const executeTransition = <T extends { ok: boolean; data: UnifiedFinanceData }>(
    transition: (prev: UnifiedFinanceData) => T
  ): T => {
    if (commitReceivableTransition) {
      return commitReceivableTransition(transition);
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

  const showReceiptRecorded = (message: string, change?: ReceiptChange) => {
    if (!change) {
      showToast(message);
      return;
    }
    showToast(message, {
      label: "Undo",
      paymentId: change.receipt.id,
      description: `₱${change.receipt.amount.toLocaleString()} receipt for ${change.receivable.name}`,
      onClick: () => replayReceipt(change)
    });
  };

  const replayReceipt = (change: ReceiptChange, undoneAt?: string) => {
    const outcome = executeTransition(prev => applyReceiptReplay(prev, change, undoneAt));

    if (!outcome.ok) {
      showToast(outcome.error);
      return;
    }

    if (outcome.action === "replayed_redo") {
      showReceiptRecorded("Receipt reapplied.", outcome.change);
    } else {
      const reversalDate = outcome.change?.previousPaymentDate || new Date().toISOString();
      showToast("Receipt undone.", {
        label: "Redo",
        paymentId: change.receipt.id,
        description: `₱${change.receipt.amount.toLocaleString()} receipt for ${change.receivable.name}`,
        onClick: () => replayReceipt(change, reversalDate)
      });
    }
  };

  const addReceivable = (receivable: {
    name: string;
    amount: number;
    category: ReceivableCategory;
    frequency: ReceivableFrequency;
    biMonthlyDays?: number[];
    monthlyDay?: number;
    date?: string;
    wallet?: string;
  }) => {
    if (receivable.frequency === "By Date" && !isValidDateKey(receivable.date)) {
      showToast("Please enter a valid date for this inflow.");
      return;
    }

    const outcome = executeTransition<ReceivableActionTransitionResult>(prev => {
      const newReceivable: Receivable = {
        id: generateId("r"),
        name: receivable.name.trim(),
        amount: receivable.amount,
        category: receivable.category || "Other",
        frequency: receivable.frequency,
        wallet: receivable.wallet,
        biMonthlyDays: receivable.frequency === "Bi-monthly" ? receivable.biMonthlyDays || [15, 30] : [],
        monthlyDay: receivable.frequency === "Monthly" ? receivable.monthlyDay || 15 : undefined,
        date: receivable.frequency === "By Date" ? receivable.date || "" : "",
        startMonth: receivable.frequency === "By Date" ? "" : selectedMonth
      };
      return {
        ok: true,
        data: {
          ...prev,
          library: { ...prev.library, receivables: [...prev.library.receivables, newReceivable] },
          updatedAt: Date.now()
        }
      };
    });

    if (outcome.ok) {
      showToast(`Added ${receivable.name}`);
    } else {
      showToast(outcome.error);
    }
  };

  const toggleReceivableStatus = (receivable: ReceivableViewModel) => {
    const outcome = executeTransition(prev =>
      applyReceivableStatusToggle(prev, receivable, selectedMonth)
    );

    if (!outcome.ok) {
      showToast(outcome.error);
      return;
    }

    if (outcome.reversedPaymentIds && outcome.reversedPaymentIds.length) {
      onPaymentsReversed?.(outcome.reversedPaymentIds);
    }
    if (outcome.message) {
      showReceiptRecorded(outcome.message, outcome.change);
    }
  };

  const addPayment = (receivable: ReceivableViewModel, amount: number, paydayDay?: number) => {
    const outcome = executeTransition(prev =>
      applyAddPayment(prev, receivable, amount, selectedMonth, paydayDay)
    );

    if (!outcome.ok) {
      showToast(outcome.error);
      return;
    }

    if (outcome.message) {
      showReceiptRecorded(outcome.message, outcome.change);
    }
  };

  const deleteReceivable = (id: string) => {
    if (!confirm("Remove this receivable from Plan? Recorded payments will stay in Transaction History.")) return;

    const outcome = executeTransition(prev => {
      const item = prev.library.receivables.find(entry => entry.id === id);
      if (!item) return { ok: false, error: "Receivable not found.", data: prev };
      const hasPaymentHistory = Object.values(prev.logs ?? {}).some(
        log => log.recsCollected?.[id]?.amountReceived || log.receivableSettlements?.[id]?.length
      );

      return {
        ok: true,
        data: {
          ...prev,
          library: {
            ...prev.library,
            receivables: prev.library.receivables.filter(entry => entry.id !== id),
            ...(hasPaymentHistory ? { archivedReceivables: [...(prev.library.archivedReceivables ?? []), item] } : {})
          },
          updatedAt: Date.now()
        }
      };
    });

    if (outcome.ok) {
      showToast("Receivable removed from Plan");
    } else {
      showToast(outcome.error);
    }
  };

  return { addReceivable, toggleReceivableStatus, addPayment, deleteReceivable };
}
