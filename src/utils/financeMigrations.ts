import { UnifiedFinanceData } from "../types/finance";
import { getWalletForBill } from "./financeHelpers";

const BASE_WALLET_IDS = ["maribank", "maya", "gcash", "gotyme", "bpi", "cash"];

const DEFAULT_WALLET_COLORS: Record<string, string> = {
  maribank: "text-amber-400",
  maya: "text-emerald-400",
  gcash: "text-blue-400",
  gotyme: "text-cyan-400",
  bpi: "text-rose-400",
  cash: "text-secondary",
};

const DEFAULT_WALLET_LABELS: Record<string, string> = {
  maribank: "MariBank",
  maya: "Maya",
  gcash: "GCash",
  gotyme: "GoTyme",
  bpi: "BPI",
  cash: "Cash On-Hand",
};

export function migrateBaseWallets(
  data: UnifiedFinanceData
): UnifiedFinanceData {
  const oldLabels = data.settings?.walletLabels || {};
  const existingCustom = data.settings?.customWallets || [];
  const newCustomWallets = [...existingCustom];

  BASE_WALLET_IDS.forEach(id => {
    if (!newCustomWallets.find(wallet => wallet.id === id)) {
      newCustomWallets.push({
        id,
        label: oldLabels[id] || DEFAULT_WALLET_LABELS[id],
        color: DEFAULT_WALLET_COLORS[id],
      });
    }
  });

  return {
    ...data,
    settings: {
      ...data.settings,
      customWallets: newCustomWallets,
      hasMigratedBaseWallets: true,
    },
  };
}

export function migrateLegacyBills(
  data: UnifiedFinanceData
): UnifiedFinanceData {
  return {
    ...data,
    library: {
      ...data.library,
      bills: data.library.bills.map(bill => ({
        ...bill,
        wallet: bill.wallet || getWalletForBill(bill.name),
      })),
    },
  };
}
