import { parseWalletBalance, validateActiveWalletAssignment } from "../utils/financeHelpers";
import type { UnifiedFinanceData, FinanceTransitionCommitter, WalletMutationOutcome } from "../types/finance";

interface UseWalletActionsParams {
  setGlobalData?: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  commitTransition?: FinanceTransitionCommitter;
}

type WalletTransitionResult = WalletMutationOutcome & { data: UnifiedFinanceData };

export function useWalletActions({ setGlobalData, commitTransition }: UseWalletActionsParams) {
  const execute = (transition: (prev: UnifiedFinanceData) => WalletTransitionResult): WalletMutationOutcome | void => {
    if (commitTransition) return commitTransition(transition);
    if (setGlobalData) {
      // A React setter does not provide synchronous commit acknowledgement.
      setGlobalData(prev => {
        const result = transition(prev);
        return result.ok ? result.data : prev;
      });
      return;
    }
    return { ok: false, error: "The wallet change could not be committed." };
  };

  const commitWallet = (key: string, value: number): WalletMutationOutcome | void => {
    const now = Date.now();
    return execute(prev => {
      const identity = validateActiveWalletAssignment(key, prev.settings);
      const isKnownBalance = key && Object.prototype.hasOwnProperty.call(prev.wallets, key);
      if (!identity.ok && (identity.error === "duplicate" || !isKnownBalance)) {
        return { ok: false, error: identity.message, data: prev };
      }
      const parsed = parseWalletBalance(value);
      if (typeof value !== "number" || !parsed.isValid) {
        return { ok: false, error: "Enter a valid balance within the supported range.", data: prev };
      }
      // An explicit replacement may repair a known invalid balance. Quick Add cannot.
      return {
        ok: true,
        data: { ...prev, wallets: { ...prev.wallets, [key]: parsed.balance }, updatedAt: now },
      };
    });
  };

  const incrementWallet = (key: string, addAmount: number): WalletMutationOutcome | void => {
    const now = Date.now();
    return execute(prev => {
      const validation = validateActiveWalletAssignment(key, prev.settings, prev.wallets);
      if (!validation.ok) return { ok: false, error: validation.message, data: prev };
      const parsed = parseWalletBalance(prev.wallets?.[key]);
      const addedCents = Math.round(addAmount * 100);
      if (!parsed.isValid || typeof addAmount !== "number" || !Number.isFinite(addAmount) ||
          addAmount <= 0 || !Number.isSafeInteger(addedCents) ||
          Math.abs(addAmount * 100 - addedCents) > 1e-6) {
        return { ok: false, error: "Cannot add income to an invalid balance or using an invalid amount.", data: prev };
      }
      const finalCents = Math.round(parsed.balance * 100) + addedCents;
      if (!Number.isSafeInteger(finalCents)) {
        return { ok: false, error: "The new wallet balance would be out of range.", data: prev };
      }
      return {
        ok: true,
        data: { ...prev, wallets: { ...prev.wallets, [key]: finalCents / 100 }, updatedAt: now },
      };
    });
  };

  return { commitWallet, incrementWallet };
}
