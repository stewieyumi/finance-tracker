import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { readFinanceSession } from "../server/financeSession.js";
import type { VercelApiRequest, VercelApiResponse } from "./notion.js";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };
export const CONNECTION_TTL = 30 * 24 * 60 * 60;
const PREFIX = "ft_shortcut_v1:";
const OWNER = "ft_shortcut_owner_v1:";
const categories = ["Food & Dining", "Transport", "Utilities", "Laundry & Home", "Shopping", "Other"];
let store: Redis | undefined;
const db = () => store ??= new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN!, automaticDeserialization: false });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const decode = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value;
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
interface Connection { id: string; sub: string; walletId: string; walletLabel: string; walletIds?: string[]; expiresAt: number; }

function finance(raw: unknown) {
  const stored = decode(raw);
  if (!object(stored)) return null;
  const envelope = "data" in stored || "revision" in stored;
  const data = envelope ? stored.data : stored;
  const revision = envelope ? stored.revision : 0;
  if (!Number.isSafeInteger(revision) || revision < 0 || !object(data) || !object(data.wallets) ||
      !object(data.library) || !Array.isArray(data.library.bills) || !Array.isArray(data.library.receivables) ||
      !Array.isArray(data.library.shoots) || !object(data.settings) || !object(data.logs) ||
      (data.library.expenses !== undefined && !Array.isArray(data.library.expenses))) return null;
  return { data, revision };
}
function usableWallet(data: Record<string, any>, id: string) {
  return Number.isFinite(data.wallets[id]) && !data.settings.archivedWallets?.some((wallet: { id: string }) => wallet.id === id);
}
function label(data: Record<string, any>, id: string) {
  return String(data.settings.customWallets?.find((wallet: { id: string }) => wallet.id === id)?.label ?? data.settings.walletLabels?.[id] ?? id).slice(0, 120);
}
function validExpense(body: Record<string, any>) {
  if (Object.keys(body).some(key => !["action", "requestId", "amount", "merchant", "category", "date", "walletId"].includes(key))) return false;
  if (body.walletId !== undefined && (typeof body.walletId !== "string" || !body.walletId || body.walletId.length > 128)) return false;
  if (typeof body.requestId !== "string" || !/^(?:[a-f0-9]{64}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(body.requestId) ||
      typeof body.merchant !== "string" || !body.merchant.trim() || body.merchant.trim().length > 120 ||
      !categories.includes(body.category) || typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return false;
  const date = new Date(body.date + "T12:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== body.date) return false;
  const amount = String(body.amount);
  return /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0 && Number(amount) <= 10_000_000;
}

// Only compare raw strings in Lua: financial JSON is serialized in JS to preserve empty arrays.
export const SAVE_SHORTCUT_EXPENSE = `
  if redis.call('GET', KEYS[2]) ~= ARGV[1] or redis.call('GET', KEYS[3]) ~= ARGV[2] then return 'revoked' end
  local receipt = redis.call('GET', KEYS[4])
  if receipt then return receipt end
  if redis.call('GET', KEYS[1]) ~= ARGV[3] then return 'conflict' end
  redis.call('SET', KEYS[1], ARGV[4])
  redis.call('SET', KEYS[4], ARGV[5], 'EX', ARGV[6])
  return ARGV[5]
`;
const REPLACE_CONNECTION = `
  local previous = redis.call('GET', KEYS[1])
  if previous then redis.call('DEL', ARGV[1] .. previous) end
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
  redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
  return 1
`;
const REVOKE_CONNECTION = `
  local previous = redis.call('GET', KEYS[1])
  if previous then redis.call('DEL', ARGV[1] .. previous) end
  redis.call('DEL', KEYS[1])
  return 1
`;

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const fail = (status: number, message: string) => res.status(status).json({ success: false, message: `Not saved: ${message}` });
  if (req.method !== "GET" && req.method !== "POST") return fail(405, "Method not allowed.");
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return fail(503, "Service unavailable. Try again later.");
  try {
    const body = req.method === "POST" ? decode(req.body) : {};
    if (!object(body) || JSON.stringify(body).length > 4096) return fail(400, "Invalid request.");
    const redis = db();
    if (req.method === "GET" || body.action === "connect" || body.action === "disconnect") {
      const fetchSite = req.headers["sec-fetch-site"];
      if (req.headers["x-finance-shortcut"] !== "1" || (fetchSite && fetchSite !== "same-origin")) return fail(403, "Request origin not allowed.");
      const profile = await readFinanceSession(req);
      if (!profile) return fail(401, "Sign in again to manage your shortcut.");
      const ownerKey = OWNER + profile.sub;
      if (body.action === "disconnect") {
        await redis.eval(REVOKE_CONNECTION, [ownerKey], [PREFIX]);
        return res.status(200).json({ connected: false });
      }
      if (body.action === "connect") {
        const record = finance(await redis.get(`finance_data_g_${profile.sub}`));
        if (!record) return fail(409, "Sync your app before connecting a shortcut.");
        if (typeof body.walletId !== "string" || !usableWallet(record.data, body.walletId)) return fail(400, "Choose an active, synced wallet.");
        const token = "ftqe_" + randomBytes(32).toString("hex");
        const digest = hash(token);
        const connection: Connection = { id: randomUUID(), sub: profile.sub, walletId: body.walletId, walletLabel: label(record.data, body.walletId), expiresAt: Date.now() + CONNECTION_TTL * 1000,
          ...(body.walletSelection === "each-run" ? { walletIds: Object.keys(record.data.wallets).filter(id => usableWallet(record.data, id)) } : {}) };
        await redis.eval(REPLACE_CONNECTION, [ownerKey, PREFIX + digest], [PREFIX, digest, JSON.stringify(connection), CONNECTION_TTL]);
        return res.status(200).json({ connected: true, token, walletId: connection.walletId, walletLabel: connection.walletLabel, walletSelection: connection.walletIds ? "each-run" : "fixed", expiresAt: connection.expiresAt });
      }
      const digest = await redis.get<string>(ownerKey);
      const connection = digest ? decode(await redis.get(PREFIX + digest)) as Connection | null : null;
      return res.status(200).json(connection && connection.expiresAt > Date.now()
        ? { connected: true, walletId: connection.walletId, walletLabel: connection.walletLabel, walletSelection: connection.walletIds ? "each-run" : "fixed", expiresAt: connection.expiresAt }
        : { connected: false });
    }

    if (body.action !== "wallets" && (body.action !== "expense" || !validExpense(body))) return fail(400, "Check the amount, merchant, category, date, and request ID.");
    if (body.action === "wallets" && Object.keys(body).some(key => key !== "action")) return fail(400, "Invalid wallet request.");
    const authorization = req.headers.authorization;
    const token = typeof authorization === "string" ? authorization.replace(/^Bearer /i, "") : "";
    if (!/^ftqe_[a-f0-9]{64}$/.test(token)) return fail(401, "Connect this shortcut in Finance Tracker Settings.");
    const digest = hash(token);
    const connectionKey = PREFIX + digest;
    const rawConnection = await redis.get<string>(connectionKey);
    const connection = decode(rawConnection) as Connection | null;
    if (!connection || connection.expiresAt <= Date.now() || await redis.get(OWNER + connection.sub) !== digest) return fail(401, "This shortcut connection expired or was disconnected.");
    const allowedWallets = connection.walletIds ?? [connection.walletId];
    if (body.action === "wallets") {
      const record = finance(await redis.get(`finance_data_g_${connection.sub}`));
      if (!record) return fail(409, "Sync your app before choosing a wallet.");
      const ids = [connection.walletId, ...allowedWallets.filter(id => id !== connection.walletId)].filter(id => allowedWallets.includes(id) && usableWallet(record.data, id));
      if (!ids.length) return fail(409, "No connected wallets are available. Replace the connection in Settings.");
      const walletChoices = new Map<string, string>();
      for (const id of ids) {
        const name = label(record.data, id).trim() || "Wallet";
        let choice = name;
        let suffix = 2;
        while (walletChoices.has(choice)) choice = `${name} · ${suffix++}`;
        walletChoices.set(choice, id);
      }
      return res.status(200).json({ success: true, walletChoices: Object.fromEntries(walletChoices) });
    }
    const selectedWallet = body.walletId ?? (connection.walletIds ? undefined : connection.walletId);
    if (typeof selectedWallet !== "string" || !allowedWallets.includes(selectedWallet)) return fail(400, "Choose a wallet authorized by this connection. Replace the connection in Settings to include new wallets.");
    const requestId = body.requestId.toLowerCase();
    const expense = { id: `shortcut_${connection.id}_${requestId}`, merchant: body.merchant.trim(), amount: Number(body.amount), deductedAmount: Number(body.amount), category: body.category, wallet: selectedWallet, date: body.date, loggedAt: new Date().toISOString() };
    const fingerprint = hash(JSON.stringify({ merchant: expense.merchant, amount: expense.amount, category: expense.category, date: expense.date, ...(connection.walletIds ? { wallet: expense.wallet } : {}) }));
    const receiptKey = `ft_shortcut_receipt_v1:${connection.id}:${requestId}`;
    const reply = (receipt: string) => {
      const value = decode(receipt);
      if (value.fingerprint !== fingerprint) return fail(409, "This request ID was already used for different details.");
      return res.status(200).json({ success: true, message: value.message, id: expense.id, revision: value.revision });
    };
    // Retries reuse requestId. One CAS writes the debit and receipt; the expense ID is a second replay guard.
    const previous = await redis.get<string>(receiptKey);
    if (previous) return reply(previous);
    const financeKey = `finance_data_g_${connection.sub}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const raw = await redis.get<string>(financeKey);
      const record = finance(raw);
      if (!record || typeof raw !== "string") return fail(409, "Sync your app before saving shortcut expenses.");
      const { data, revision } = record;
      if (revision >= Number.MAX_SAFE_INTEGER) return fail(503, "Sync needs attention. Open Finance Tracker.");
      if (!usableWallet(data, expense.wallet)) return fail(409, "The connected wallet is missing or archived. Reconnect in Settings.");
      // Keep deduplication even if a receipt cache is missing, or a later owner reversal removed the receipt's expense.
      if (data.library.expenses?.some((entry: { id: string }) => entry.id === expense.id)) return fail(409, "This expense is already recorded. Check History before trying again.");
      const cents = Math.round(expense.amount * 100);
      const balanceCents = Math.round(data.wallets[expense.wallet] * 100);
      if (!Number.isSafeInteger(balanceCents) || Math.abs(data.wallets[expense.wallet] * 100 - balanceCents) > 0.000001) return fail(409, "The connected wallet balance needs review in the app.");
      if (balanceCents < cents || data.wallets[expense.wallet] < expense.amount) return fail(409, "Insufficient balance in the connected wallet.");
      const next = { ...data, wallets: { ...data.wallets, [expense.wallet]: (balanceCents - cents) / 100 }, library: { ...data.library, expenses: [expense, ...(data.library.expenses ?? [])] }, updatedAt: Math.max(Date.now(), Number(data.updatedAt) || 0) };
      const receipt = JSON.stringify({ fingerprint, revision: revision + 1, message: `Saved ₱${expense.amount.toFixed(2)} to ${label(data, expense.wallet)}.` });
      const result = await redis.eval(SAVE_SHORTCUT_EXPENSE, [financeKey, connectionKey, OWNER + connection.sub, receiptKey], [rawConnection!, digest, raw, JSON.stringify({ data: next, revision: revision + 1 }), receipt, CONNECTION_TTL]);
      if (result === "revoked") return fail(401, "This shortcut was disconnected. Reconnect in Settings.");
      if (result === "conflict") continue;
      return reply(String(result));
    }
    return fail(409, "Another device is syncing. Retry the same request shortly.");
  } catch {
    return res.status(503).json({ success: false, message: "Save status unknown. Check History before starting a new expense; retry the same request to check its result." });
  }
}
