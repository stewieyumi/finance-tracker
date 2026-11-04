import { createHash, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";

const COOKIE_NAME = "__Host-ft_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type Headers = Record<string, string | string[] | undefined>;
type Request = { headers: Headers };

export interface FinanceProfile {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

interface FinanceSession {
  profile: FinanceProfile;
  binding: string;
}

let redis: Redis | undefined;
function sessionStore() {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) throw new Error("Session store unavailable.");
  return redis ??= new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });
}

function cookieToken(req: Request): string | undefined {
  const cookie = req.headers.cookie;
  if (typeof cookie !== "string") return;
  const token = cookie.split(";").map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}

function redisKey(token: string) {
  return `finance_session_v1:${createHash("sha256").update(token).digest("hex")}`;
}

export function usesFinanceSession(req: Request) {
  return req.headers["x-finance-session"] !== undefined;
}

export async function readFinanceSession(req: Request): Promise<FinanceProfile | null> {
  const binding = req.headers["x-finance-session"];
  const token = cookieToken(req);
  // The binding associates the browser tab's local data with this exact session.
  // It cannot authenticate a request without the separate HttpOnly cookie.
  if (!token || typeof binding !== "string" || !/^[a-f0-9]{32}$/.test(binding)) return null;
  const session = await sessionStore().get<FinanceSession>(redisKey(token));
  return session?.binding === binding && session.profile?.sub ? session.profile : null;
}

export async function createFinanceSession(profile: FinanceProfile) {
  const token = randomBytes(32).toString("hex");
  const binding = randomBytes(16).toString("hex");
  await sessionStore().set(redisKey(token), { profile, binding }, { ex: SESSION_TTL_SECONDS });
  return { binding, cookie: sessionCookie(token, SESSION_TTL_SECONDS) };
}

export async function revokeFinanceSession(req: Request) {
  const token = cookieToken(req);
  if (!token) return;
  const key = redisKey(token);
  const session = await sessionStore().get<FinanceSession>(key);
  if (session && session.binding !== req.headers["x-finance-session"]) {
    return false;
  }
  await sessionStore().del(key);
  return true;
}

export function sessionCookie(token: string, maxAge: number) {
  return `${COOKIE_NAME}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}
