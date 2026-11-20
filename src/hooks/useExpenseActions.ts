import { useCallback } from "react";
import {
  UnifiedFinanceData,
  Expense,
  FinanceTransitionCommitter
} from "../types/finance";
import type { PaymentHistoryAction } from "../utils/paymentHistory";
import { applyExpenseEdit, applyExpenseReplay, expenseCents, makeExpenseChange, validExpenseRevisions } from "../utils/expenseChanges";
import type { ExpenseChange, ExpenseForm, ExpenseTransitionResult } from "../utils/expenseChanges";
export type { ExpenseForm, ExpenseTransitionResult } from "../utils/expenseChanges";
import { generateId } from "../utils/idHelpers";
import {
  applyWalletTransaction,
  hasSufficientWalletBalance,
  parseWalletBalance,
  getSafeWalletBalance,
  resolveWalletRoutingOrReject
} from "../utils/financeHelpers";

interface UseExpenseActionsProps {
  globalData: UnifiedFinanceData;
  setGlobalData?: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  commitExpenseTransition?: FinanceTransitionCommitter;
  showToast: (msg: string, action?: PaymentHistoryAction) => void;
}

function insufficientExpenseBalanceMessage(data: UnifiedFinanceData, walletId: string, balance: number, amount: number): string {
  const label = data.settings?.customWallets?.find(wallet => wallet.id === walletId)?.label
    || data.settings?.walletLabels?.[walletId] || walletId;
  return balance === 0
    ? `${label} has ₱0.00. Check its balance in Wallets or choose another wallet.`
    : `Insufficient balance in ${label}. Need ₱${amount.toLocaleString()}`;
}

export function applyExpenseSave(
  prev: UnifiedFinanceData,
  form: ExpenseForm,
  loggedAt: string
): ExpenseTransitionResult {
  if (!validExpenseRevisions(prev)) return { ok: false, data: prev, error: "Expense history needs review." };
  const amount = Number(form.amount);
  if (!form.merchant.trim() || expenseCents(amount) === null || amount <= 0) {
    return { ok: false, error: "Invalid merchant or amount.", data: prev };
  }

  const routing = resolveWalletRoutingOrReject(form.wallet, prev.settings, prev.wallets);
  if (!routing.ok) {
    return { ok: false, error: routing.message, data: prev };
  }
  const walletId = routing.walletId;

  const currentBal = getSafeWalletBalance(prev.wallets?.[walletId], 0);
  if (!hasSufficientWalletBalance(currentBal, amount)) {
    return {
      ok: false,
      error: insufficientExpenseBalanceMessage(prev, walletId, currentBal, amount),
      data: prev
    };
  }

  const newExpense: Expense = {
    id: generateId("exp"),
    merchant: form.merchant,
    amount,
    deductedAmount: amount,
    category: form.category,
    wallet: walletId,
    date: form.date,
    loggedAt,
  };

  const nextWallets = { ...prev.wallets };
  nextWallets[walletId] = applyWalletTransaction(
    nextWallets[walletId],
    -amount
  );

  const change = makeExpenseChange(prev, undefined, newExpense, 0);
  return {
    ok: true,
    data: {
      ...prev,
      expenseRevisions: { ...prev.expenseRevisions, [newExpense.id]: change.id },
      wallets: nextWallets,
      library: {
        ...prev.library,
        expenses: [newExpense, ...(prev.library.expenses || [])],
      },
      updatedAt: Date.now(),
    },
    expense: newExpense,
    change,
  };
}

export function applyExpenseDelete(
  prev: UnifiedFinanceData,
  exp: Expense,
  expectedRevision: string | null = prev.expenseRevisions?.[exp.id] ?? null
): ExpenseTransitionResult {
  if (!validExpenseRevisions(prev)) return { ok: false, data: prev, error: "Expense history needs review." };
  const matches = (prev.library.expenses || []).filter(entry => entry.id === exp.id);
  if (matches.length !== 1) {
    return { ok: false, error: "This expense no longer exists or its ID is duplicated.", data: prev };
  }
  if ((prev.expenseRevisions?.[exp.id] ?? null) !== expectedRevision) return { ok: false, data: prev, error: "This expense has newer history. Review it before deleting." };
  const current = matches[0];
  const fields: Array<keyof Expense> = [
    "id", "merchant", "amount", "deductedAmount", "wallet", "category", "date", "loggedAt",
  ];
  if (fields.some(field => !Object.is(current[field], exp[field]))) {
    return { ok: false, error: "This expense changed. Review it before deleting.", data: prev };
  }
  const refundAmount = current.deductedAmount ?? current.amount;
  const refundCents = Math.round(refundAmount * 100);
  if (typeof refundAmount !== "number" || !Number.isFinite(refundAmount) ||
      refundAmount < 0 || !Number.isSafeInteger(refundCents) ||
      Math.abs(refundAmount * 100 - refundCents) > 1e-6) {
    return { ok: false, error: "The recorded expense debit is invalid.", data: prev };
  }
  const nextWallets = { ...prev.wallets };

  if (refundCents > 0) {
    if (!current.wallet) {
      return { ok: false, error: "The original expense wallet is unavailable.", data: prev };
    }
    const parsed = parseWalletBalance(nextWallets[current.wallet]);
    if (!parsed.isValid) {
      return { ok: false, error: "Original wallet has an invalid balance.", data: prev };
    }
    const finalCents = Math.round(parsed.balance * 100) + refundCents;
    if (!Number.isSafeInteger(finalCents)) {
      return { ok: false, error: "The refunded wallet balance would be out of range.", data: prev };
    }
    nextWallets[current.wallet] = finalCents / 100;
  }

  const change = makeExpenseChange(prev, current, undefined, (prev.library.expenses || []).findIndex(entry => entry.id === current.id));
  return {
    ok: true,
    data: {
      ...prev,
      expenseRevisions: { ...prev.expenseRevisions, [current.id]: change.id },
      wallets: nextWallets,
      library: {
        ...prev.library,
        expenses: (prev.library.expenses || []).filter(e => e.id !== current.id),
      },
      updatedAt: Date.now(),
    },
    refundAmount,
    change,
  };
}

export function useExpenseActions({
  globalData,
  setGlobalData,
  commitExpenseTransition,
  showToast,
}: UseExpenseActionsProps) {
  const executeTransition = <T extends { ok: boolean; data: UnifiedFinanceData }>(
    transition: (prev: UnifiedFinanceData) => T
  ): T => {
    if (commitExpenseTransition) {
      return commitExpenseTransition(transition);
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

  const showExpenseChange = (message: string, change?: ExpenseChange, label: "Undo" | "Redo" = "Undo") => {
    // Legacy setter-only consumers cannot acknowledge a mutation. The app supplies an authoritative committer.
    if (!change || !commitExpenseTransition) { showToast(message); return; }
    let available = true;
    showToast(message, {
      label, paymentId: change.id,
      description: `expense at ${(change.after ?? change.before)!.merchant}`,
      onClick: () => {
        if (!available) { showToast("This expense action was already applied."); return; }
        const result = executeTransition(prev => applyExpenseReplay(prev, change, label));
        if (!result.ok) { showToast(result.error); return; }
        available = false;
        showExpenseChange(`Expense change ${label === "Undo" ? "undone" : "reapplied"}.`, change, label === "Undo" ? "Redo" : "Undo");
      },
    });
  };

  const handleEditExpense = (expense: Expense, form: ExpenseForm, onSuccess: () => void, onError = showToast, expectedRevision?: string | null) => {
    if (!commitExpenseTransition) { onError("Expense editing is unavailable until the account is ready."); return; }
    const result = executeTransition(prev => applyExpenseEdit(prev, expense, form, expectedRevision));
    if (!result.ok) { onError(result.error); return; }
    showExpenseChange("Expense updated.", result.change);
    onSuccess();
  };

  const handleSaveExpense = useCallback(
    (
      form: ExpenseForm,
      onSuccess: () => void,
      resetForm: () => void,
      onError: (message: string) => void = showToast
    ) => {
      const amount = parseFloat(form.amount);
      if (!form.merchant || isNaN(amount) || amount <= 0) return;

      const routing = resolveWalletRoutingOrReject(form.wallet, globalData.settings, globalData.wallets);
      if (!routing.ok) {
        onError("⚠️ " + routing.message);
        return;
      }
      const walletId = routing.walletId;

      const currentBal = getSafeWalletBalance(globalData.wallets?.[walletId], 0);
      if (!hasSufficientWalletBalance(currentBal, amount)) {
        onError(insufficientExpenseBalanceMessage(globalData, walletId, currentBal, amount));
        return;
      }

      const loggedAt = new Date().toISOString();
      const outcome = executeTransition(prev =>
        applyExpenseSave(prev, form, loggedAt)
      );

      if (!outcome.ok) {
        onError("⚠️ " + outcome.error);
        return;
      }

      showExpenseChange(`Logged ₱${amount} & deducted from wallet`, outcome.change);
      onSuccess();
      resetForm();
    },
    [globalData, setGlobalData, commitExpenseTransition, showToast]
  );

  const handleDeleteExpense = useCallback(
    (exp: Expense) => {
      const expectedRevision = globalData.expenseRevisions?.[exp.id] ?? null;
      const refundAmount = exp.deductedAmount ?? exp.amount;

      if (
        !confirm(
          `Delete ${exp.merchant} and refund ₱${refundAmount} back to your wallet?`
        )
      ) {
        return;
      }

      const outcome = executeTransition(prev =>
        applyExpenseDelete(prev, exp, expectedRevision)
      );

      if (!outcome.ok) {
        showToast(outcome.error);
        return;
      }

      showExpenseChange("Expense deleted and refunded.", outcome.change);
    },
    [globalData, setGlobalData, commitExpenseTransition, showToast]
  );

  return {
    handleSaveExpense,
    handleDeleteExpense,
    handleEditExpense,
  };
}
