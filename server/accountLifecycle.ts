import { createHash } from "node:crypto";
import type { Redis } from "@upstash/redis";

// A non-financial revocation marker prevents older sessions/writers restoring deleted data.
export const accountEpochKey = (sub: string) => `ft_account_epoch_v1:${createHash("sha256").update(sub).digest("hex")}`;
export async function readAccountEpoch(redis: Redis, sub: string): Promise<string> {
  const value = await redis.get<unknown>(accountEpochKey(sub));
  if (value === null || value === undefined) return "";
  if (typeof value !== "string" || !/^v1_[a-f0-9]{32}$/.test(value)) throw new Error("Invalid account state.");
  return value;
}
export const DELETE_ACCOUNT = `
  if (redis.call('GET', KEYS[2]) or '') ~= ARGV[1] then return 'changed' end
  if redis.call('EXISTS', KEYS[4]) == 1 then return 'calendar_busy' end
  local shortcut = redis.call('GET', KEYS[5])
  if shortcut then redis.call('DEL', 'ft_shortcut_v1:' .. shortcut) end
  redis.call('SET', KEYS[2], ARGV[2])
  redis.call('DEL', KEYS[1], KEYS[3], KEYS[5])
  return 'deleted'
`;
