import type { AppSettings, CustomWallet, Deduction, UnifiedFinanceData, WalletState } from "../types/finance";
import { roundMoney } from "./currency";

export type BalanceParseResult =
  | { isValid: true; isPresent: true; balance: number }
  | { isValid: true; isPresent: false; balance: 0 }
  | {
      isValid: false;
      isPresent: boolean;
      raw: unknown;
      reason: "nan" | "infinity" | "null" | "empty_string" | "malformed_string" | "invalid_type" | "out_of_range";
    };

const normalizeWalletBalance = (value: number, raw: unknown): BalanceParseResult => {
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) {
    return { isValid: false, isPresent: true, raw, reason: "out_of_range" };
  }
  return { isValid: true, isPresent: true, balance: cents === 0 ? 0 : cents / 100 };
};

export function parseWalletBalance(val: unknown): BalanceParseResult {
  if (val === undefined) {
    return { isValid: true, isPresent: false, balance: 0 };
  }
  if (val === null) {
    return { isValid: false, isPresent: true, raw: null, reason: "null" };
  }
  if (typeof val === "number") {
    if (Number.isNaN(val)) {
      return { isValid: false, isPresent: true, raw: NaN, reason: "nan" };
    }
    if (!Number.isFinite(val)) {
      return { isValid: false, isPresent: true, raw: val, reason: "infinity" };
    }
    return normalizeWalletBalance(val, val);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") {
      return { isValid: false, isPresent: true, raw: val, reason: "empty_string" };
    }
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return { isValid: false, isPresent: true, raw: val, reason: "malformed_string" };
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      return { isValid: false, isPresent: true, raw: val, reason: "infinity" };
    }
    return normalizeWalletBalance(num, val);
  }
  return { isValid: false, isPresent: true, raw: val, reason: "invalid_type" };
}

export type WalletValidationResult =
  | { ok: true; walletId: string }
  | {
      ok: false;
      error: "missing" | "archived" | "unconfigured" | "duplicate" | "invalid_balance" | "no_active_wallets";
      message: string;
    };

export function resolveActiveWalletDefault(
  settings?: AppSettings,
  wallets?: WalletState
): string {
  const activeWallets = settings?.customWallets || [];
  const archivedIds = new Set((settings?.archivedWallets || []).map(w => w.id));
  const idCounts = new Map<string, number>();
  for (const wallet of activeWallets) {
    idCounts.set(wallet.id, (idCounts.get(wallet.id) ?? 0) + 1);
  }
  const eligibleWallets: CustomWallet[] = [];

  for (const wallet of activeWallets) {
    if (!wallet.id || idCounts.get(wallet.id) !== 1 || archivedIds.has(wallet.id)) {
      continue;
    }

    if (wallets && Object.prototype.hasOwnProperty.call(wallets, wallet.id)) {
      const parsed = parseWalletBalance(wallets[wallet.id]);
      if (!parsed.isValid) {
        continue;
      }
    }
    eligibleWallets.push(wallet);
  }

  if (eligibleWallets.length === 0) {
    return "";
  }

  const configuredDefault = settings?.defaultWallet;
  if (configuredDefault && eligibleWallets.some(w => w.id === configuredDefault)) {
    return configuredDefault;
  }

  return eligibleWallets[0].id;
}

export function validateActiveWalletAssignment(
  explicitWalletId: string | undefined,
  settings?: AppSettings,
  wallets?: WalletState
): WalletValidationResult {
  if (!explicitWalletId || explicitWalletId.trim() === "") {
    return { ok: false, error: "missing", message: "No wallet specified." };
  }

  const activeWallets = settings?.customWallets || [];
  const archivedWallets = settings?.archivedWallets || [];

  if (archivedWallets.some(w => w.id === explicitWalletId)) {
    const label = archivedWallets.find(w => w.id === explicitWalletId)?.label || explicitWalletId;
    return {
      ok: false,
      error: "archived",
      message: `Selected account "${label}" is archived. Please select an active account.`,
    };
  }

  const assignments = activeWallets.filter(w => w.id === explicitWalletId);
  if (assignments.length > 1) {
    return {
      ok: false,
      error: "duplicate",
      message: `Selected account "${explicitWalletId}" has a duplicate account ID. Resolve it before transacting.`,
    };
  }
  if (assignments.length === 0) {
    return {
      ok: false,
      error: "unconfigured",
      message: `Selected account "${explicitWalletId}" is not configured. Please select an active account.`,
    };
  }

  if (wallets && Object.prototype.hasOwnProperty.call(wallets, explicitWalletId)) {
    const parsed = parseWalletBalance(wallets[explicitWalletId]);
    if (!parsed.isValid) {
      return {
        ok: false,
        error: "invalid_balance",
        message: `Selected account "${explicitWalletId}" has an invalid balance. Please repair it before transacting.`,
      };
    }
  }

  return { ok: true, walletId: explicitWalletId };
}

export function resolveWalletRoutingOrReject(
  walletProp: string | undefined,
  settings?: AppSettings,
  wallets?: WalletState
): WalletValidationResult {
  if (!walletProp || walletProp.trim() === "") {
    const defaultId = resolveActiveWalletDefault(settings, wallets);
    if (!defaultId) {
      return { ok: false, error: "no_active_wallets", message: "No active accounts are configured." };
    }
    return { ok: true, walletId: defaultId };
  }

  return validateActiveWalletAssignment(walletProp, settings, wallets);
}

export interface ReconciledWalletEntry {
  id: string;
  label: string;
  color?: string;
  balance: number;
  isValid: boolean;
  rawBalance: unknown;
  status: "active" | "archived" | "unlisted";
}

export interface WalletMetadataAnomalies {
  duplicateActiveWallets: Array<{ id: string; labels: string[]; count: number }>;
  conflictingActiveAndArchived: Array<{ id: string; activeLabel: string; archivedLabel: string }>;
  duplicateArchivedWallets: Array<{ id: string; labels: string[]; count: number }>;
  unlistedWallets: Array<{ id: string; balance: number; isValid: boolean }>;
  invalidWallets: Array<{ id: string; raw: unknown; reason: string }>;
  hasMetadataAnomalies: boolean;
}

export interface WalletReconciliationResult {
  activeWallets: ReconciledWalletEntry[];
  archivedWallets: ReconciledWalletEntry[];
  unlistedWallets: ReconciledWalletEntry[];

  activeTotal: number;
  archivedTotal: number;
  unlistedTotal: number;
  totalLiquid: number;

  invalidWalletIds: string[];
  invalidWalletCount: number;
  isComplete: boolean;

  anomalies: WalletMetadataAnomalies;
  hasMetadataAnomalies: boolean;
}

export function reconcileWalletBalances(
  data: Partial<UnifiedFinanceData> | undefined
): WalletReconciliationResult {
  const settings = data?.settings;
  const rawWallets = data?.wallets || {};

  const rawActive = settings?.customWallets || [];
  const rawArchived = settings?.archivedWallets || [];

  // Deduplicate active
  const seenActive = new Map<string, CustomWallet[]>();
  rawActive.forEach(w => {
    if (!w.id) return;
    const list = seenActive.get(w.id) || [];
    list.push(w);
    seenActive.set(w.id, list);
  });

  const duplicateActiveWallets: WalletMetadataAnomalies["duplicateActiveWallets"] = [];
  const uniqueActiveWallets: CustomWallet[] = [];
  seenActive.forEach((entries, id) => {
    uniqueActiveWallets.push(entries[0]);
    if (entries.length > 1) {
      duplicateActiveWallets.push({
        id,
        labels: entries.map(e => e.label),
        count: entries.length,
      });
    }
  });

  // Deduplicate archived and resolve collisions (active wins)
  const activeIdSet = new Set(uniqueActiveWallets.map(w => w.id));
  const conflictingActiveAndArchived: WalletMetadataAnomalies["conflictingActiveAndArchived"] = [];
  const seenArchived = new Map<string, CustomWallet[]>();

  rawArchived.forEach(w => {
    if (!w.id) return;
    if (activeIdSet.has(w.id)) {
      const activeMatch = uniqueActiveWallets.find(a => a.id === w.id);
      conflictingActiveAndArchived.push({
        id: w.id,
        activeLabel: activeMatch?.label || w.id,
        archivedLabel: w.label || w.id,
      });
      return;
    }
    const list = seenArchived.get(w.id) || [];
    list.push(w);
    seenArchived.set(w.id, list);
  });

  const duplicateArchivedWallets: WalletMetadataAnomalies["duplicateArchivedWallets"] = [];
  const uniqueArchivedWallets: CustomWallet[] = [];
  seenArchived.forEach((entries, id) => {
    uniqueArchivedWallets.push(entries[0]);
    if (entries.length > 1) {
      duplicateArchivedWallets.push({
        id,
        labels: entries.map(e => e.label),
        count: entries.length,
      });
    }
  });

  const archivedIdSet = new Set(uniqueArchivedWallets.map(w => w.id));
  const invalidWalletIds: string[] = [];
  const invalidWallets: WalletMetadataAnomalies["invalidWallets"] = [];

  let activeTotal = 0;
  const activeWallets: ReconciledWalletEntry[] = uniqueActiveWallets.map(w => {
    const rawVal = Object.prototype.hasOwnProperty.call(rawWallets, w.id) ? rawWallets[w.id] : undefined;
    const parsed = parseWalletBalance(rawVal);
    if (!parsed.isValid) {
      invalidWalletIds.push(w.id);
      invalidWallets.push({ id: w.id, raw: parsed.raw, reason: parsed.reason });
      return {
        id: w.id,
        label: w.label,
        color: w.color,
        balance: 0,
        isValid: false,
        rawBalance: rawVal,
        status: "active",
      };
    }
    activeTotal = roundMoney(activeTotal + parsed.balance);
    return {
      id: w.id,
      label: w.label,
      color: w.color,
      balance: parsed.balance,
      isValid: true,
      rawBalance: rawVal,
      status: "active",
    };
  });

  let archivedTotal = 0;
  const archivedWallets: ReconciledWalletEntry[] = uniqueArchivedWallets.map(w => {
    const rawVal = Object.prototype.hasOwnProperty.call(rawWallets, w.id) ? rawWallets[w.id] : undefined;
    const parsed = parseWalletBalance(rawVal);
    if (!parsed.isValid) {
      invalidWalletIds.push(w.id);
      invalidWallets.push({ id: w.id, raw: parsed.raw, reason: parsed.reason });
      return {
        id: w.id,
        label: w.label,
        color: w.color,
        balance: 0,
        isValid: false,
        rawBalance: rawVal,
        status: "archived",
      };
    }
    archivedTotal = roundMoney(archivedTotal + parsed.balance);
    return {
      id: w.id,
      label: w.label,
      color: w.color,
      balance: parsed.balance,
      isValid: true,
      rawBalance: rawVal,
      status: "archived",
    };
  });

  // Find unlisted keys in rawWallets
  let unlistedTotal = 0;
  const unlistedWalletsList: WalletMetadataAnomalies["unlistedWallets"] = [];
  const unlistedWallets: ReconciledWalletEntry[] = [];

  Object.keys(rawWallets).forEach(key => {
    if (activeIdSet.has(key) || archivedIdSet.has(key)) return;
    const rawVal = rawWallets[key];
    const parsed = parseWalletBalance(rawVal);
    const label = settings?.walletLabels?.[key] || key;

    if (!parsed.isValid) {
      invalidWalletIds.push(key);
      invalidWallets.push({ id: key, raw: parsed.raw, reason: parsed.reason });
      unlistedWallets.push({
        id: key,
        label,
        balance: 0,
        isValid: false,
        rawBalance: rawVal,
        status: "unlisted",
      });
      unlistedWalletsList.push({ id: key, balance: 0, isValid: false });
      return;
    }

    unlistedTotal = roundMoney(unlistedTotal + parsed.balance);
    unlistedWallets.push({
      id: key,
      label,
      balance: parsed.balance,
      isValid: true,
      rawBalance: rawVal,
      status: "unlisted",
    });
    unlistedWalletsList.push({ id: key, balance: parsed.balance, isValid: true });
  });

  const totalLiquid = roundMoney(activeTotal + archivedTotal + unlistedTotal);
  const hasMetadataAnomalies =
    duplicateActiveWallets.length > 0 ||
    conflictingActiveAndArchived.length > 0 ||
    duplicateArchivedWallets.length > 0 ||
    unlistedWalletsList.length > 0 ||
    invalidWallets.length > 0;

  const anomalies: WalletMetadataAnomalies = {
    duplicateActiveWallets,
    conflictingActiveAndArchived,
    duplicateArchivedWallets,
    unlistedWallets: unlistedWalletsList,
    invalidWallets,
    hasMetadataAnomalies,
  };

  return {
    activeWallets,
    archivedWallets,
    unlistedWallets,
    activeTotal,
    archivedTotal,
    unlistedTotal,
    totalLiquid,
    invalidWalletIds,
    invalidWalletCount: invalidWalletIds.length,
    isComplete: invalidWalletIds.length === 0,
    anomalies,
    hasMetadataAnomalies,
  };
}

export function getEffectiveBillAmount(
  baseAmount: number,
  override?: number
): number {
  return override !== undefined ? override : baseAmount;
}

export function calculateDeductionAmount(
  grossAmount: number,
  deduction: Deduction
): number {
  const gross = Math.max(0, Number(grossAmount) || 0);
  const value = Math.max(0, Number(deduction.value) || 0);

  if (deduction.type === "percentage") {
    return Math.min(gross, Math.round(gross * (value / 100) * 100) / 100);
  }

  return Math.min(gross, Math.round(value * 100) / 100);
}

export function calculateNetSalary(
  grossAmount: number,
  deductions: Deduction[] = []
): number {
  const gross = Math.max(0, Number(grossAmount) || 0);

  const totalDeductions = Math.min(
    gross,
    deductions.reduce(
      (total, deduction) => total + calculateDeductionAmount(gross, deduction),
      0
    )
  );

  return Math.max(0, Math.round((gross - totalDeductions) * 100) / 100);
}

export type Wallet = "maya" | "gcash" | "maribank" | "gotyme" | "bpi" | "cash" | string;

// This name-matching fallback exists ONLY to handle bills created before
// the `wallet` field existed on Bill. Every new bill created through the
// Add Bill form now always has an explicit `wallet` set (seeded from
// settings.defaultWallet), so this heuristic should not gain new rules
// going forward — it is legacy-data compatibility, not a routing engine.
export function getWalletForBill(
  name: string,
  walletProp?: string,
  fallbackWallet: string = "maya"
): Wallet {
  if (walletProp) return walletProp as Wallet;

  const n = (name || "").toLowerCase();

  if (
    n.includes("unobank") ||
    n.includes("appliance") ||
    n.includes("gcredit")
  ) {
    return "gcash";
  }

  if (n.includes("spaylater")) {
    return "maribank";
  }

  if (n.includes("shared") || n.includes("japan trip")) {
    return "bpi";
  }

  return fallbackWallet;
}

/**
 * Calculates how much of a bill should be funded on this payday.
 *
 * Rules:
 * - Never fund more than the remaining bill balance.
 * - Never return a negative value.
 * - Treat zero paydays remaining as one payday.
 * - Round the actual allocation to cents here, before it is routed
 *   into wallet totals and contribution logs.
 *
 * Rounding here is important because an amount such as 100 / 3 can
 * otherwise become 33.333..., which can cause cent-level drift when
 * the previous contribution is stored as 33.33.
 */
export function computeBillPerPaydayAmount(
  billAmount: number,
  alreadyAllocated: number,
  paydaysRemaining: number
): number {
  const safeBillAmount = Math.max(0, Number(billAmount) || 0);
  const safeAlreadyAllocated = Math.min(
    safeBillAmount,
    Math.max(0, Number(alreadyAllocated) || 0)
  );
  const safePaydays = Math.max(1, Math.floor(Number(paydaysRemaining) || 0));

  const remaining = Math.max(
    0,
    safeBillAmount - safeAlreadyAllocated
  );

  return Math.round((remaining / safePaydays) * 100) / 100;
}

/**
 * Scales the living/savings/transit baselines together so they only
 * consume the payout room left after bill allocations.
 *
 * Bills are funded first. Baselines consume only the remaining room.
 * If bills already exceed the payout, baselines become zero.
 */
export function computeBaselineScale(
  totalBillObligations: number,
  perPayoutSalary: number,
  totalBaselineTarget: number
): number {
  const safeBills = Math.max(0, Number(totalBillObligations) || 0);
  const safeSalary = Math.max(0, Number(perPayoutSalary) || 0);
  const safeBaseline = Math.max(0, Number(totalBaselineTarget) || 0);

  if (safeBaseline <= 0) return 0;

  const leftoverAfterBills = Math.max(
    0,
    safeSalary - safeBills
  );

  return Math.min(
    1,
    leftoverAfterBills / safeBaseline
  );
}

/**
 * Rounds each baseline allocation independently, then clamps the later
 * allocations to the actual room left after bills and earlier baselines.
 *
 * This keeps the three baseline buckets proportional to their configured
 * targets without allowing cent-level rounding to push the payday total
 * above the configured payout.
 */
export function computeScaledBaselineAllocations(
  totalBillObligations: number,
  perPayoutSalary: number,
  baseLivingAllowance: number,
  baseSavingsTarget: number,
  defaultTransit: number
): { living: number; savings: number; transit: number } {
  const safeBills = Math.max(0, Number(totalBillObligations) || 0);
  const safeSalary = Math.max(0, Number(perPayoutSalary) || 0);
  const safeLiving = Math.max(0, Number(baseLivingAllowance) || 0);
  const safeSavings = Math.max(0, Number(baseSavingsTarget) || 0);
  const safeTransit = Math.max(0, Number(defaultTransit) || 0);
  const totalBaselineTarget = safeLiving + safeSavings + safeTransit;
  const scale = computeBaselineScale(
    safeBills,
    safeSalary,
    totalBaselineTarget
  );

  const available = Math.round(
    Math.max(0, safeSalary - safeBills) * 100
  ) / 100;

  const living = Math.min(
    Math.round(safeLiving * scale * 100) / 100,
    available
  );

  const savings = Math.min(
    Math.round(safeSavings * scale * 100) / 100,
    Math.max(0, Math.round((available - living) * 100) / 100)
  );

  const transit = Math.min(
    Math.round(safeTransit * scale * 100) / 100,
    Math.max(0, Math.round((available - living - savings) * 100) / 100)
  );

  return { living, savings, transit };
}

/**
 * Treat both legacy string execution records and current execution objects
 * as the same payday execution for idempotency checks.
 */
export function hasPaydayExecutionOnDate(
  executions: Array<string | { date?: string }> | undefined,
  date: string
): boolean {
  return !!executions?.some(execution =>
    typeof execution === "string"
      ? execution === date
      : execution?.date === date
  );
}

export function getReceivableStatus(
  amount: number,
  amountReceived: number,
  isManuallyCollected: boolean
) {
  const safeAmount = Math.max(0, amount || 0);
  const safeReceived = Math.max(0, amountReceived || 0);

  const remaining = Math.max(0, safeAmount - safeReceived);
  const isCollected =
    safeAmount > 0
      ? safeReceived >= safeAmount
      : !!isManuallyCollected;

  return { isCollected, remaining };
}

export function getDefaultTransferWallets(settings?: AppSettings): { wallet: string; destinationWallet: string } {
  const activeWallets = settings?.customWallets || [];
  const wallet = [settings?.transferFromWallet, settings?.defaultWallet]
    .find(id => id && activeWallets.some(active => active.id === id))
    ?? activeWallets[0]?.id ?? "";
  const destinationWallet = activeWallets.find(active =>
    active.id === settings?.transferToWallet && active.id !== wallet)?.id ?? "";
  return { wallet, destinationWallet };
}

export function getDefaultWalletId(
  settings?: {
    defaultWallet?: string;
    customWallets?: { id: string }[];
  },
  wallets?: Record<string, number>
): string {
  const configuredWallet = settings?.defaultWallet;
  if (
    configuredWallet &&
    (!wallets || wallets[configuredWallet] !== undefined)
  ) {
    return configuredWallet;
  }

  const firstAvailableWallet = settings?.customWallets?.find(
    wallet =>
      !!wallet.id &&
      (!wallets || wallets[wallet.id] !== undefined)
  );

  return firstAvailableWallet?.id || "";
}

/**
 * Returns the configured wallet for a new expense category.
 *
 * A category-specific route wins when it points to a valid wallet.
 * Otherwise, the normal default wallet fallback is used.
 */
export function getDefaultExpenseWalletId(
  category: string,
  settings?: AppSettings,
  wallets?: Record<string, number>
): string {
  const configuredWallet = settings?.expenseWallets?.[category];

  if (
    configuredWallet &&
    (!wallets || wallets[configuredWallet] !== undefined)
  ) {
    return configuredWallet;
  }

  return getDefaultWalletId(settings, wallets);
}

export function getSafeWalletBalance(val: unknown, fallback: number = 0): number {
  const parsed = parseWalletBalance(val);
  return parsed.isValid ? parsed.balance : fallback;
}

export function applyWalletTransaction(
  currentBalance: number,
  delta: number
): number {
  const safeBalance = getSafeWalletBalance(currentBalance, 0);
  const safeDelta = Number(delta) || 0;
  return roundMoney(safeBalance + safeDelta);
}

export function hasSufficientWalletBalance(
  currentBalance: number,
  amount: number
): boolean {
  const safeBalance = Number(currentBalance) || 0;
  const safeAmount = Math.max(0, Number(amount) || 0);

  return safeBalance >= safeAmount;
}
