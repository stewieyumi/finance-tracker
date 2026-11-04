import type { PaymentHistoryAction } from "../utils/paymentHistory";
import { normalizePaydayDays } from "../utils/dateHelpers";
import { MonthLog, Receivable, ReceivableCategory, ReceivableFrequency, ReceivableViewModel, ReceivableSettlement, UnifiedFinanceData, WalletState } from "../types/finance";
import { generateId } from "../utils/idHelpers";
import { roundMoney } from "../utils/currency";
import { hasSufficientWalletBalance } from "../utils/financeHelpers";

interface UseReceivableActionsParams {
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  selectedMonth: string;
  onPaymentsReversed?: (ids: string[]) => void;
  showToast: (message: string, action?: PaymentHistoryAction) => void;
}

interface ReceivablePaymentContext {
  targetMonth: string;
  receivableAmount: number;
  targetWallet: string;
}

const resolveReceivablePaymentContext = (
  receivable: ReceivableViewModel,
  selectedMonth: string,
  defaultWallet?: string
): ReceivablePaymentContext => ({
  targetMonth: receivable.targetMonthForDue || selectedMonth,
  receivableAmount: Math.max(0, parseFloat(String(receivable.amount)) || 0),
  targetWallet: receivable.wallet || defaultWallet || "main",
});

type Receipt = ReceivableSettlement & { id: string };
type ReceiptStatus = NonNullable<MonthLog["recsCollected"]>[string];

interface ReceiptChange {
  receivable: ReceivableViewModel;
  targetMonth: string;
  receipt: Receipt;
  before: ReceiptStatus;
  after: ReceiptStatus;
  previousPaymentDate?: string;
}

function recordReceipt(wallets: WalletState, wallet: string, amount: number, receivedAt: string): Receipt {
  const creditedWallet = Object.prototype.hasOwnProperty.call(wallets, wallet) &&
    Number.isFinite(wallets[wallet]) ? wallet : null;
  if (creditedWallet) wallets[creditedWallet] = roundMoney(wallets[creditedWallet] + amount);
  return { id: generateId("receipt"), receivedAt, amount, wallet: creditedWallet, walletCredit: creditedWallet ? amount : 0 };
}

export function useReceivableActions({ globalData, setGlobalData, selectedMonth, showToast, onPaymentsReversed }: UseReceivableActionsParams) {

  const showReceiptRecorded = (message: string, change?: ReceiptChange) => {
    if (!change) {
      showToast(message);
      return;
    }
    showToast(message, {
      label: "Undo",
      paymentId: change.receipt.id,
      description: `₱${change.receipt.amount.toLocaleString()} receipt for ${change.receivable.name}`,
      onClick: () => replayReceipt(change),
    });
  };

  const replayReceipt = (change: ReceiptChange, undoneAt?: string) => {
    const { receivable, targetMonth, receipt, before, after, previousPaymentDate } = change;
    const { id } = receivable;
    const isRedo = undoneAt !== undefined;
    const expected = isRedo ? before : after;
    const expectedDate = isRedo ? previousPaymentDate : receipt.receivedAt;
    const nextDate = isRedo ? receipt.receivedAt : previousPaymentDate;
    const reversalDate = new Date().toISOString();
    let applied = false;
    let feedback = "This receipt changed. Review the current inflow before trying again.";

    setGlobalData(prev => {
      const monthLog = prev.logs?.[targetMonth];
      const settlements = monthLog?.receivableSettlements?.[id];
      const entry = settlements?.find(candidate => candidate.id === receipt.id);
      const status = monthLog?.recsCollected?.[id];
      if (!monthLog || !settlements || !entry || !status || entry.reversedAt !== undoneAt ||
        entry.amount !== receipt.amount || entry.wallet !== receipt.wallet ||
        entry.walletCredit !== receipt.walletCredit || entry.receivedAt !== receipt.receivedAt ||
        entry.paydayDay !== receipt.paydayDay ||
        status.amountReceived !== expected.amountReceived || status.collected !== expected.collected ||
        monthLog.paymentDates?.[id] !== expectedDate) return prev;

      if (isRedo) {
        const current = prev.library.receivables.find(item => item.id === id);
        if (!current || current.amount !== receivable.amount || current.frequency !== receivable.frequency ||
          current.date !== receivable.date || current.startMonth !== receivable.startMonth ||
          current.monthlyDay !== receivable.monthlyDay ||
          normalizePaydayDays(current.biMonthlyDays).join() !== normalizePaydayDays(receivable.biMonthlyDays).join()) return prev;
      } else if ([...settlements].reverse().find(candidate => !candidate.reversedAt)?.id !== receipt.id) {
        return prev;
      }

      const { wallet, walletCredit } = entry;
      const wallets = { ...prev.wallets };
      if (walletCredit > 0) {
        if (!wallet || !Object.prototype.hasOwnProperty.call(wallets, wallet) ||
          !Number.isFinite(wallets[wallet]) || (!isRedo && !hasSufficientWalletBalance(wallets[wallet], walletCredit))) {
          feedback = "The original wallet is unavailable or has insufficient funds.";
          return prev;
        }
        wallets[wallet] = roundMoney(wallets[wallet] + (isRedo ? walletCredit : -walletCredit));
      }

      const paymentDates = { ...monthLog.paymentDates };
      if (nextDate !== undefined) paymentDates[id] = nextDate;
      else delete paymentDates[id];

      applied = true;
      return {
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
              [id]: settlements.map(candidate => candidate.id === receipt.id
                ? { ...candidate, reversedAt: isRedo ? undefined : reversalDate }
                : candidate)
            }
          }
        },
        updatedAt: Date.now()
      };
    });

    if (!applied) {
      showToast(feedback);
    } else if (isRedo) {
      showReceiptRecorded("Receipt reapplied.", change);
    } else {
      showToast("Receipt undone.", {
        label: "Redo",
        paymentId: receipt.id,
        description: `₱${receipt.amount.toLocaleString()} receipt for ${receivable.name}`,
        onClick: () => replayReceipt(change, reversalDate),
      });
    }
  };

  const addReceivable = (receivable: { name: string; amount: number; category: ReceivableCategory; frequency: ReceivableFrequency; biMonthlyDays?: number[]; monthlyDay?: number; date?: string; wallet?: string; }) => {
    setGlobalData(prev => {
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
      return { ...prev, library: { ...prev.library, receivables: [...prev.library.receivables, newReceivable] }, updatedAt: Date.now() };
    });
    showToast(`Added ${receivable.name}`);
  };

  const toggleReceivableStatus = (receivable: ReceivableViewModel) => {
    const { targetMonth, receivableAmount, targetWallet } =
      resolveReceivablePaymentContext(
        receivable,
        selectedMonth,
        globalData.settings?.defaultWallet
      );

    let feedback: string | undefined;
    let change: ReceiptChange | undefined;
    let reversedPaymentIds: string[] = [];
    setGlobalData(prev => {
      const monthLog = prev.logs?.[targetMonth] || { billsPaid: [], recsCollected: {} };
      const currentRecord = monthLog.recsCollected?.[receivable.id] || { amountReceived: 0, collected: false };
      const currentAmount = Math.max(0, parseFloat(String(currentRecord.amountReceived)) || 0);
      // A repeated tap can carry the same rendered occurrence after the first write.
      if (roundMoney(currentAmount) !== roundMoney(receivable.amountReceived) ||
        (currentAmount === 0 && currentRecord.collected !== receivable.collected)) {
        feedback = "This receipt changed. Review the current amount before trying again.";
        return prev;
      }


      const reversing = currentAmount > 0 || currentRecord.collected;
      const newAmountReceived = reversing ? 0 : roundMoney(receivableAmount);
      if (!Number.isFinite(newAmountReceived)) return prev;
      const newCollected = !reversing;
      const todayStr = new Date().toISOString();
      const nextWallets = { ...prev.wallets };
      const settlements = monthLog.receivableSettlements?.[receivable.id] ?? [];
      let nextSettlements = settlements;
      if (reversing) {
        for (const settlement of settlements) {
          if (settlement.reversedAt) continue;
          const { wallet, walletCredit } = settlement;
          if (!Number.isFinite(walletCredit) || walletCredit < 0) return prev;
          if (walletCredit === 0) continue;
          if (!wallet || !Object.prototype.hasOwnProperty.call(nextWallets, wallet) ||
            !Number.isFinite(nextWallets[wallet]) ||
            !hasSufficientWalletBalance(nextWallets[wallet], walletCredit)) {
            feedback = "Reversal blocked: an original wallet is unavailable or has insufficient funds.";
            return prev;
          }
          nextWallets[wallet] = roundMoney(nextWallets[wallet] - walletCredit);
        }
        reversedPaymentIds = settlements.flatMap(settlement => settlement.id ? [settlement.id] : []);
        nextSettlements = settlements.map(settlement =>
          settlement.reversedAt ? settlement : { ...settlement, reversedAt: todayStr }
        );
      } else if (newAmountReceived > 0) {
        const receipt = recordReceipt(nextWallets, targetWallet, newAmountReceived, todayStr);
        nextSettlements = [...settlements, receipt];
        change = {
          receivable, targetMonth, receipt,
          before: currentRecord,
          after: { amountReceived: newAmountReceived, collected: newCollected },
          previousPaymentDate: monthLog.paymentDates?.[receivable.id],
        };
      }

      const nextPaymentDates = { ...(monthLog.paymentDates || {}) };
      if (newCollected || newAmountReceived > 0) {
        nextPaymentDates[receivable.id] = todayStr;
      } else {
        // Clean up the timestamp if returning to Pending
        delete nextPaymentDates[receivable.id];
      }

      feedback = reversing ? "Receipt reversed." : "Receipt marked collected.";
      return {
        ...prev,
        wallets: nextWallets,
        logs: { 
          ...prev.logs, 
          [targetMonth]: { 
            ...monthLog, 
            ...(nextSettlements.length ? {
              receivableSettlements: { ...monthLog.receivableSettlements, [receivable.id]: nextSettlements }
            } : {}),
            paymentDates: nextPaymentDates, 
            recsCollected: { ...(monthLog.recsCollected || {}), [receivable.id]: { amountReceived: newAmountReceived, collected: newCollected } } 
          } 
        },
        updatedAt: Date.now()
      };
    });
    if (reversedPaymentIds.length) onPaymentsReversed?.(reversedPaymentIds);
    if (feedback) showReceiptRecorded(feedback, change);
  };

  const addPayment = (receivable: ReceivableViewModel, amount: number, paydayDay?: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;

    const { targetMonth, receivableAmount, targetWallet } =
      resolveReceivablePaymentContext(
        receivable,
        selectedMonth,
        globalData.settings?.defaultWallet
      );

    let feedback: string | undefined;
    let change: ReceiptChange | undefined;
    setGlobalData(prev => {
      const monthLog = prev.logs?.[targetMonth] || { billsPaid: [], recsCollected: {} };
      const currentRecord = monthLog.recsCollected?.[receivable.id] || { amountReceived: 0, collected: false };
      const currentAmount = Math.max(0, parseFloat(String(currentRecord.amountReceived)) || 0);
      // A repeated tap can carry the same rendered occurrence after the first write.
      if (roundMoney(currentAmount) !== roundMoney(receivable.amountReceived) ||
        (currentAmount === 0 && currentRecord.collected !== receivable.collected)) {
        feedback = "This receipt changed. Review the current amount before trying again.";
        return prev;
      }


      let requested = amount;
      if (paydayDay !== undefined) {
        const days = normalizePaydayDays(receivable.biMonthlyDays);
        const index = days.indexOf(paydayDay);
        if (receivable.frequency !== "Bi-monthly" || days.length !== 2 || index < 0) return prev;
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
        feedback = "No payment applied. Check the amount and remaining balance.";
        return prev;
      }

      const nextWallets = { ...prev.wallets };
      const todayStr = new Date().toISOString();
      const settlement = {
        ...recordReceipt(nextWallets, targetWallet, amountDelta, todayStr),
        ...(paydayDay === undefined ? {} : { paydayDay }),
      };
      change = {
        receivable, targetMonth, receipt: settlement,
        before: currentRecord,
        after: { amountReceived: newAmount, collected: newAmount >= receivableAmount },
        previousPaymentDate: monthLog.paymentDates?.[receivable.id],
      };
      feedback = settlement.wallet
        ? `Recorded ₱${amountDelta.toLocaleString()} in ${settlement.wallet}.`
        : `Recorded ₱${amountDelta.toLocaleString()} without a wallet credit.`;

      return {
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
            recsCollected: { ...(monthLog.recsCollected || {}), [receivable.id]: { amountReceived: newAmount, collected: newAmount >= receivableAmount } } 
          } 
        },
        updatedAt: Date.now()
      };
    });
    if (feedback) showReceiptRecorded(feedback, change);

  };

  const deleteReceivable = (id: string) => {
    if (!confirm("Remove this receivable from Plan? Recorded payments will stay in Transaction History.")) return;

    setGlobalData(prev => {
      const item = prev.library.receivables.find(entry => entry.id === id);
      if (!item) return prev;
      const hasPaymentHistory = Object.values(prev.logs ?? {}).some(log =>
        log.recsCollected?.[id]?.amountReceived || log.receivableSettlements?.[id]?.length
      );

      return {
        ...prev,
        library: {
          ...prev.library,
          receivables: prev.library.receivables.filter(entry => entry.id !== id),
          ...(hasPaymentHistory ? { archivedReceivables: [...(prev.library.archivedReceivables ?? []), item] } : {}),
        },
        updatedAt: Date.now(),
      };
    });

    showToast("Receivable removed from Plan");
  };

  return { addReceivable, toggleReceivableStatus, addPayment, deleteReceivable };
}
