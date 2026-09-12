import { UnifiedFinanceData, WalletState } from "../types/finance";

interface UseWalletActionsParams {
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
}

export function useWalletActions({
  setGlobalData,
}: UseWalletActionsParams) {
  const commitWallet = (key: string, value: number) => {
    setGlobalData(prev => ({
      ...prev,
      wallets: {
        ...prev.wallets,
        [key]: value
      },
      updatedAt: Date.now()
    }));
  };

const incrementWallet = (key: string, addAmount: number) => {
  setGlobalData(prev => ({
    ...prev,
    wallets: {
      ...prev.wallets,
      [key]: (prev.wallets[key] ?? 0) + addAmount
    },
    updatedAt: Date.now()
  }));
};

  const splitPayday = (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;

    setGlobalData(prev => {
      const transit = prev.settings?.defaultTransitAllocation ?? 1500;
      const remaining = Math.max(0, amount - transit);

      return {
        ...prev,
        wallets: {
          ...prev.wallets,
          cash: (prev.wallets.cash ?? 0) + transit,
          maya: (prev.wallets.maya ?? 0) + remaining
        },
        updatedAt: Date.now()
      };
    });
  };

return {
  commitWallet,
  incrementWallet,
  splitPayday
};
}