import { useCallback } from "react";
import { UnifiedFinanceData, Expense } from "../types/finance";
import { generateId } from "../utils/idHelpers";
import {
  applyWalletTransaction,
  hasSufficientWalletBalance,
  getDefaultWalletId,
} from "../utils/financeHelpers";

interface ExpenseForm {
  merchant: string;
  amount: string;
  category: string;
  wallet: string;
  date: string;
}

interface UseExpenseActionsProps {
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  showToast: (msg: string) => void;
}

export function useExpenseActions({
  globalData,
  setGlobalData,
  showToast,
}: UseExpenseActionsProps) {
  const handleSaveExpense = useCallback(
    (
      form: ExpenseForm,
      onSuccess: () => void,
      resetForm: () => void
    ) => {
      const amount = parseFloat(form.amount);
      const walletId =
        form.wallet ||
        getDefaultWalletId(globalData.settings, globalData.wallets);

      if (!form.merchant || isNaN(amount) || amount <= 0) return;

      if (!walletId || globalData.wallets[walletId] === undefined) {
        showToast("⚠️ Please select a valid wallet before saving the expense.");
        return;
      }

      if (!hasSufficientWalletBalance(globalData.wallets[walletId], amount)) {
        showToast(
          `Insufficient balance in ${
            globalData.settings?.walletLabels?.[walletId] || walletId
          }. Need ₱${amount.toLocaleString()}`
        );
        return;
      }

      setGlobalData((prev) => {
        const newExpense: Expense = {
          id: generateId("exp"),
          merchant: form.merchant,
          amount,
          deductedAmount: amount,
          category: form.category,
          wallet: walletId,
          date: form.date,
        };

        const nextWallets = { ...prev.wallets };
        nextWallets[walletId] = applyWalletTransaction(
          nextWallets[walletId],
          -amount
        );

        return {
          ...prev,
          wallets: nextWallets,
          library: {
            ...prev.library,
            expenses: [newExpense, ...(prev.library.expenses || [])],
          },
          updatedAt: Date.now(),
        };
      });

      showToast(`Logged ₱${amount} & deducted from wallet`);
      onSuccess();
      resetForm();
    },
    [globalData.settings, globalData.wallets, setGlobalData, showToast]
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

      setGlobalData((prev) => {
        const nextWallets = { ...prev.wallets };

        if (nextWallets[exp.wallet] !== undefined) {
          nextWallets[exp.wallet] = applyWalletTransaction(
            nextWallets[exp.wallet],
            refundAmount
          );
        }

        return {
          ...prev,
          wallets: nextWallets,
          library: {
            ...prev.library,
            expenses: (prev.library.expenses || []).filter(
              (e) => e.id !== exp.id
            ),
          },
          updatedAt: Date.now(),
        };
      });

      showToast("Expense deleted and refunded.");
    },
    [setGlobalData, showToast]
  );

  return {
    handleSaveExpense,
    handleDeleteExpense,
  };
}
