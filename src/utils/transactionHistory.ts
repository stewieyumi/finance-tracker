import { TransactionHistoryItem, UnifiedFinanceData } from "../types/finance";
import { compareTransactionsNewestFirst, transactionTimestamp } from "./transactionDates";
import { roundMoney } from "./currency";
import { parseMonthKey } from "./dateHelpers";

export function buildTransactionHistory(
  globalData: UnifiedFinanceData
): TransactionHistoryItem[] {
  const txs: TransactionHistoryItem[] = [];

  // 1. Expenses
  (globalData.library?.expenses || []).forEach(e => {
    txs.push({
      id: e.id,
      title: e.merchant,
      amount: -e.amount,
      date: e.date,
      ...(e.loggedAt ? { loggedAt: e.loggedAt } : {}),
      type: "expense",
      wallet: e.wallet,
      category: e.category
    });
  });

  // 2. Paid Bills
  [...(globalData.library?.bills ?? []), ...(globalData.library?.archivedBills ?? [])].forEach(b => {
    Object.entries(globalData.logs || {}).forEach(([monthKey, log]) => {
      if (log.billsPaid?.includes(b.id)) {
        const settlement = [...(log.billSettlements?.[b.id] ?? [])].reverse()
          .find(entry => !entry.reversedAt);
        if (settlement?.priorConfirmation) return;
        const d = parseMonthKey(monthKey);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(b.dueDay || "1").padStart(2, "0");
        const override = log.billOverrides?.[b.id];
        const amount = settlement?.amount ?? override ?? b.amount;

        txs.push({
          id: `${b.id}_${monthKey}`,
          title: `${b.name} (${monthKey.split(" ")[0]})`,
          amount: -amount,
          date:
            settlement?.paidAt || log.paymentDates?.[b.id] ||
            `${year}-${month}-${day}`,
          type: "bill",
          wallet: settlement ? settlement.wallet ?? undefined : b.wallet || globalData.settings?.defaultWallet || "main",
          category: b.type
        });
      }
    });
  });

  // 3. Collected Inflows
  [...(globalData.library?.receivables ?? []), ...(globalData.library?.archivedReceivables ?? [])].forEach(r => {
    Object.entries(globalData.logs || {}).forEach(([monthKey, log]) => {
      const recLog = log.recsCollected?.[r.id];

      if (recLog && recLog.amountReceived > 0) {
        let recordedAmount = 0;
        const settlements = log.receivableSettlements?.[r.id] ?? [];
        settlements.forEach((receipt, index) => {
          if (receipt.reversedAt || !Number.isFinite(receipt.amount) || receipt.amount <= 0) return;
          recordedAmount += receipt.amount;
          txs.push({
            id: `${r.id}_${monthKey}_receipt_${receipt.id ?? index}`,
            title: r.name,
            amount: receipt.amount,
            date: receipt.receivedAt,
            type: "inflow",
            wallet: receipt.wallet ?? undefined,
            category: r.category
          });
        });

        // Older receipts can coexist with newly recorded payouts for the same month.
        const legacyAmount = recordedAmount > 0
          ? roundMoney(recLog.amountReceived - recordedAmount)
          : recLog.amountReceived;
        if (legacyAmount <= 0) return;

        let txDate = r.date;

        if (!txDate) {
          const d = parseMonthKey(monthKey);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day =
            r.frequency === "Monthly"
              ? String(r.monthlyDay || 15).padStart(2, "0")
              : "15";

          txDate = `${year}-${month}-${day}`;
        }

        txs.push({
          id: `${r.id}_${monthKey}`,
          title: `${r.name}`,
          amount: legacyAmount,
          date: log.paymentDates?.[r.id] || txDate,
          type: "inflow",
          wallet: r.wallet || globalData?.settings?.defaultWallet || "main",
          category: r.category
        });
      }
    });
  });

  // 4. Payday Distributions
  globalData.paydaySplitExecutions?.forEach(ex => {
    if (typeof ex === "string") return;

    Object.entries(ex.allocations).forEach(([w, amt]) => {
      if (amt > 0) {
        txs.push({
          id: `${ex.id}_${w}`,
          title: "Payday Allocation",
          amount: amt,
          date: ex.date,
          ...(transactionTimestamp(ex.timestamp) !== undefined ? { loggedAt: new Date(ex.timestamp).toISOString() } : {}),
          type: "inflow",
          wallet: w,
          category: "Payday"
        });
      }
    });
  });

  // 5. Historical/Manual Transactions
  globalData.library?.manualTransactions?.forEach(mt => {
    let finalAmt = mt.amount;

    if (mt.type === "expense" || mt.type === "transfer") {
      finalAmt = -mt.amount;
    }

    txs.push({
      id: mt.id,
      title: mt.title,
      amount: finalAmt,
      date: mt.date,
      ...(transactionTimestamp(mt.createdAt) !== undefined ? { loggedAt: new Date(mt.createdAt).toISOString() } : {}),
      type: mt.type === "income" ? "inflow" : "expense",
      wallet: mt.wallet,
      category: mt.category || mt.type
    });

    if (mt.type === "transfer" && mt.destinationWallet) {
      txs.push({
        id: mt.id + "_dest",
        title: mt.title + " (Receive)",
        amount: mt.amount,
        date: mt.date,
        ...(transactionTimestamp(mt.createdAt) !== undefined ? { loggedAt: new Date(mt.createdAt).toISOString() } : {}),
        type: "inflow",
        wallet: mt.destinationWallet,
        category: mt.category || mt.type
      });
    }
  });

  return txs.sort(compareTransactionsNewestFirst);
}
