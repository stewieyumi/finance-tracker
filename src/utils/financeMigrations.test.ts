import { describe, expect, it } from "vitest";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import { UnifiedFinanceData } from "../types/finance";
import {
  migrateBaseWallets,
  migrateLegacyBills,
} from "./financeMigrations";

const createTestData = (): UnifiedFinanceData => ({
  ...structuredClone(INITIAL_UNIFIED_DATA),
  settings: {
    ...structuredClone(INITIAL_UNIFIED_DATA.settings),
    hasMigratedBaseWallets: false,
    walletLabels: {
      maya: "My Maya",
    },
    customWallets: [
      {
        id: "custom-wallet",
        label: "Custom Wallet",
        color: "text-purple-400",
      },
    ],
  },
  library: {
    bills: [],
    receivables: [],
    shoots: [],
  },
});

describe("migrateBaseWallets", () => {
  it("adds missing base wallets and marks the migration complete", () => {
    const data = createTestData();

    const result = migrateBaseWallets(data);

    expect(result.settings?.hasMigratedBaseWallets).toBe(true);
    expect(result.settings?.customWallets).toEqual(
      expect.arrayContaining([
        {
          id: "custom-wallet",
          label: "Custom Wallet",
          color: "text-purple-400",
        },
        {
          id: "maya",
          label: "My Maya",
          color: "text-emerald-400",
        },
        {
          id: "gcash",
          label: "GCash",
          color: "text-blue-400",
        },
      ])
    );
  });

  it("does not duplicate existing base wallets", () => {
    const data = createTestData();

    data.settings!.customWallets!.push({
      id: "maya",
      label: "Existing Maya",
      color: "text-red-400",
    });

    const result = migrateBaseWallets(data);
    const mayaWallets = result.settings?.customWallets?.filter(
      wallet => wallet.id === "maya"
    );

    expect(mayaWallets).toHaveLength(1);
    expect(mayaWallets?.[0]).toEqual({
      id: "maya",
      label: "Existing Maya",
      color: "text-red-400",
    });
  });

  it("does not mutate the original data", () => {
    const data = createTestData();
    const original = structuredClone(data);

    migrateBaseWallets(data);

    expect(data).toEqual(original);
  });
});

describe("migrateLegacyBills", () => {
  it("assigns legacy bills using the existing wallet routing rules", () => {
    const data = createTestData();

    data.library.bills = [
      {
        id: "unobank",
        name: "Unobank Loan",
        amount: 1000,
        dueDay: "15",
        type: "Loan / Installment",
      },
      {
        id: "spaylater",
        name: "SPayLater",
        amount: 500,
        dueDay: "20",
        type: "Loan / Installment",
      },
    ];

    const result = migrateLegacyBills(data);

    expect(result.library.bills[0].wallet).toBe("gcash");
    expect(result.library.bills[1].wallet).toBe("maribank");
  });

  it("preserves bills that already have an explicit wallet", () => {
    const data = createTestData();

    data.library.bills = [
      {
        id: "explicit",
        name: "Unobank Loan",
        amount: 1000,
        dueDay: "15",
        type: "Loan / Installment",
        wallet: "bpi",
      },
    ];

    const result = migrateLegacyBills(data);

    expect(result.library.bills[0].wallet).toBe("bpi");
  });

  it("does not mutate the original data", () => {
    const data = createTestData();

    data.library.bills = [
      {
        id: "legacy",
        name: "Unobank Loan",
        amount: 1000,
        dueDay: "15",
        type: "Loan / Installment",
      },
    ];

    const original = structuredClone(data);

    migrateLegacyBills(data);

    expect(data).toEqual(original);
  });
});
