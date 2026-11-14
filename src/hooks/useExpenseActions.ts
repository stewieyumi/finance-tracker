import { useCallback } from "react";
import {
  UnifiedFinanceData,
  Expense,
  FinanceTransitionCommitter
} from "../types/finance";
import { generateId } from "../utils/idHelpers";
import {
  applyWalletTransaction,
  hasSufficientWalletBalance,
  parseWalletBalance,
  getSafeWalletBalance,
  resolveWalletRoutingOrReject
} from "../utils/financeHelpers";

export interface ExpenseForm {
  merchant: string;
  amount: string;
  category: string;
  wallet: string;
  date: string;
}

interface UseExpenseActionsProps {
  globalData: UnifiedFinanceData;
  setGlobalData?: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  commitExpenseTransition?: FinanceTransitionCommitter;
  showToast: (msg: string) => void;
}

export type ExpenseTransitionResult =
  | { ok: true; data: UnifiedFinanceData; expense?: Expense; refundAmount?: number }
  | { ok: false; error: string; data: UnifiedFinanceData };

export function applyExpenseSave(
  prev: UnifiedFinanceData,
  form: ExpenseForm,
  loggedAt: string
): ExpenseTransitionResult {
  const amount = parseFloat(form.amount);
  if (!form.merchant || isNaN(amount) || amount <= 0) {
    return { ok: false, error: "Invalid merchant or amount.", data: prev };
  }

  const routing = resolveWalletRoutingOrReject(form.wallet, prev.settings, prev.wallets);
  if (!routing.ok) {
    return { ok: false, error: routing.message, data: prev };
  }
  const walletId = routing.walletId;

  const currentBal = getSafeWalletBalance(prev.wallets?.[walletId], 0);
  if (!hasSufficientWalletBalance(currentBal, amount)) {
    const label = prev.settings?.walletLabels?.[walletId] || walletId;
    return {
      ok: false,
      error: `Insufficient balance in ${label}. Need ₱${amount.toLocaleString()}`,
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

  return {
    ok: true,
    data: {
      ...prev,
      wallets: nextWallets,
      library: {
        ...prev.library,
        expenses: [newExpense, ...(prev.library.expenses || [])],
      },
      updatedAt: Date.now(),
    },
    expense: newExpense,
  };
}

export function applyExpenseDelete(
  prev: UnifiedFinanceData,
  exp: Expense
): ExpenseTransitionResult {
  const matches = (prev.library.expenses || []).filter(entry => entry.id === exp.id);
  if (matches.length !== 1) {
    return { ok: false, error: "This expense no longer exists or its ID is duplicated.", data: prev };
  }
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

  return {
    ok: true,
    data: {
      ...prev,
      wallets: nextWallets,
      library: {
        ...prev.library,
        expenses: (prev.library.expenses || []).filter(e => e.id !== current.id),
      },
      updatedAt: Date.now(),
    },
    refundAmount,
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
        onError(
          `Insufficient balance in ${
            globalData.settings?.walletLabels?.[walletId] || walletId
          }. Need ₱${amount.toLocaleString()}`
        );
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

      showToast(`Logged ₱${amount} & deducted from wallet`);
      onSuccess();
      resetForm();
    },
    [globalData, setGlobalData, commitExpenseTransition, showToast]
  );

  const handleDeleteExpense = useCallback(
    (exp: Expense) => {
      const refundAmount = exp.deductedAmount ?? exp.amount;

      if (
        !confirm(
          `Delete ${exp.merchant} and refund ₱${refundAmount} back to your wallet?`
        )
      ) {
        return;
      }

      const outcome = executeTransition(prev =>
        applyExpenseDelete(prev, exp)
      );

      if (!outcome.ok) {
        showToast(outcome.error);
        return;
      }

      showToast("Expense deleted and refunded.");
    },
    [globalData, setGlobalData, commitExpenseTransition, showToast]
  );

  return {
    handleSaveExpense,
    handleDeleteExpense,
  };
}
