import { jwtDecode } from "jwt-decode";

export const SESSION_STORAGE_KEY = "ft_app_session";
export const LEGACY_TOKEN_KEY = "ft_google_token";

interface Profile {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

interface AppSession {
  profile: Profile;
  binding: string;
}

function isAppSession(value: unknown): value is AppSession {
  const session = value as Partial<AppSession> | null;
  return Boolean(session && typeof session.profile?.sub === "string" && session.profile.sub &&
    typeof session.binding === "string" && /^[a-f0-9]{32}$/.test(session.binding));
}

export function readAppSession(): AppSession | null {
  try {
    const session: unknown = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "null");
    return isAppSession(session) ? session : null;
  } catch {
    return null;
  }
}

export function getGoogleSubFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const { sub } = jwtDecode<{ sub?: unknown }>(token.trim().replace(/^Bearer\s+/i, ""));
    return typeof sub === "string" && sub.trim() ? sub.trim() : null;
  } catch {
    return null;
  }
}

export function getLegacyToken() {
  try { return localStorage.getItem(LEGACY_TOKEN_KEY) || ""; } catch { return ""; }
}

export function getFinanceAuth(): { sub: string | null; key: string; headers: Record<string, string> } {
  const session = readAppSession();
  if (session) return {
    sub: session.profile.sub,
    key: `session:${session.binding}`,
    headers: { "X-Finance-Session": session.binding },
  };

  const token = getLegacyToken();
  return {
    sub: getGoogleSubFromToken(token),
    key: token,
    headers: token ? { Authorization: /^Bearer\s+/i.test(token) ? token : `Bearer ${token}` } : {},
  };
}

export function getFinanceSubject() {
  return getFinanceAuth().sub;
}

async function sessionRequest(body: object, binding?: string) {
  return fetch("/api/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Finance-Auth": "1",
      ...(binding ? { "X-Finance-Session": binding } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export async function startAppSession(credential: string, expectedSub?: string): Promise<AppSession> {
  const res = await sessionRequest({ credential, expectedSub });
  if (res.status === 409) throw new Error("Reconnect with the Google account already open in Finance Tracker.");
  if (!res.ok) throw new Error("Could not start your Finance Tracker session. Please try again.");
  const session: unknown = await res.json();
  if (!isAppSession(session) || (expectedSub && session.profile.sub !== expectedSub)) {
    throw new Error("Could not verify your Finance Tracker session. Please try again.");
  }
  return session;
}

export async function endAppSession(session: AppSession): Promise<void> {
  const res = await sessionRequest({ action: "logout" }, session.binding);
  if (!res.ok) throw new Error("Could not sign out. Check your connection and try again.");
}
