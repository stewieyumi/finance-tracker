import type { AppSettings, UnifiedFinanceData } from '../types/finance';
import { parseWalletBalance, reconcileWalletBalances, validateActiveWalletAssignment } from './financeHelpers';
import { expenseCents } from './expenseChanges';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function isWalletSavingsMap(value: unknown): value is Record<string, number> {
  return record(value) && Object.entries(value).every(([id, amount]) => id.trim() && expenseCents(amount) !== null);
}

export function isSavingsWalletIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(id => typeof id === 'string' && id.trim()) && new Set(value).size === value.length;
}

/** Existing reserves remain visible until released, including profiles from before opt-in. */
export function enabledSavingsWalletIds(settings?: AppSettings): string[] {
  const map = record(settings?.walletSavings) ? settings.walletSavings : {};
  const selected = isSavingsWalletIds(settings?.savingsWalletIds) ? settings.savingsWalletIds : Object.keys(map);
  return [...new Set([...selected, ...Object.entries(map).filter(([, amount]) => typeof amount === 'number' && amount > 0).map(([id]) => id)])];
}

/** A planning reserve only: neither a debit nor a separate wallet balance. */
export function readWalletSavings(data: Pick<UnifiedFinanceData, 'wallets' | 'settings'>, id: string) {
  const parsed = parseWalletBalance(data.wallets[id]);
  const map: unknown = data.settings?.walletSavings;
  const raw = map === undefined ? 0 : record(map) ? Object.hasOwn(map, id) ? map[id] : 0 : null;
  const cents = expenseCents(raw);
  const balance = parsed.isValid ? parsed.balance : null;
  const savings = cents === null ? null : cents / 100;
  const needsReview = balance === null || savings === null || savings > Math.max(0, balance);
  // Preserve an existing overdraft when summing wallets; a reserve cannot create more cash.
  const available = balance === null || savings === null ? 0 : balance < 0 ? balance : Math.max(0, Math.round(balance * 100) - cents!) / 100;
  return { balance, savings, available, needsReview };
}

export function walletSavingsTotals(data: UnifiedFinanceData) {
  const balances = reconcileWalletBalances(data);
  let savings = 0, available = 0, needsReview = !balances.isComplete;
  const map: unknown = data.settings?.walletSavings;
  if (map !== undefined && !isWalletSavingsMap(map)) needsReview = true;
  const ids = new Set([...balances.activeWallets, ...balances.archivedWallets, ...balances.unlistedWallets].map(wallet => wallet.id));
  if (record(map) && Object.entries(map).some(([id, amount]) => !ids.has(id) && amount !== 0)) needsReview = true;
  for (const wallet of [...balances.activeWallets, ...balances.archivedWallets, ...balances.unlistedWallets]) {
    const funds = readWalletSavings(data, wallet.id);
    savings += Math.round((funds.savings ?? 0) * 100);
    available += Math.round(funds.available * 100);
    needsReview ||= funds.needsReview;
  }
  if (!Number.isSafeInteger(savings) || !Number.isSafeInteger(available)) return { savings: 0, available: 0, needsReview: true };
  return { savings: savings / 100, available: available / 100, needsReview };
}

export function applyWalletSavings(data: UnifiedFinanceData, id: string, amount: number, expected: { balance: unknown; savings: unknown }) {
  const reject = (error: string) => ({ ok: false as const, data, error });
  if (data.settings?.savingsWalletIds !== undefined && !enabledSavingsWalletIds(data.settings).includes(id)) return reject('Enable Savings for this wallet in Settings → Wallet Defaults first.');
  const route = validateActiveWalletAssignment(id, data.settings, data.wallets);
  if (!route.ok) return reject(route.message);
  const map: unknown = data.settings?.walletSavings;
  if (map !== undefined && !record(map)) return reject('Saved wallet savings need review before they can be changed.');
  if (!Object.is(data.wallets[id], expected.balance) || !Object.is(map?.[id], expected.savings)) return reject('This wallet balance or savings changed. Close the editor and reopen it before saving.');
  const cents = expenseCents(amount);
  const balance = parseWalletBalance(data.wallets[id]);
  if (cents === null || !balance.isValid || cents > Math.max(0, Math.round(balance.balance * 100))) return reject('Enter savings between zero and this wallet’s current balance, with at most two decimal places.');
  return { ok: true as const, data: { ...data, settings: { ...data.settings, walletSavings: { ...(map as Record<string, number> | undefined), [id]: cents / 100 } },
    updatedAt: Math.max(Date.now(), (Number.isFinite(data.updatedAt) ? data.updatedAt! : 0) + 1) } };
}
