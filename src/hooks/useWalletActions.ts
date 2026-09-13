import { UnifiedFinanceData } from "../types/finance";

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

  return {
    commitWallet,
    incrementWallet
  };
}
