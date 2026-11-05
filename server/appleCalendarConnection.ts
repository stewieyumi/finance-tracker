import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import { AppleCalendarError } from "./appleCalendar.js";

export interface AppleCredentials { username: string; password: string }
export interface AppleConnection extends AppleCredentials { id: string }
interface EncryptedConnection { version: 1; iv: string; tag: string; ciphertext: string }

export function calendarUserKey(sub: string) {
  return createHash("sha256").update(sub).digest("hex");
}

function encryptionKey() {
  const encoded = process.env.CALENDAR_ENCRYPTION_KEY;
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new AppleCalendarError("Calendar connections are being set up. Please try again later.", 503);
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new AppleCalendarError("Calendar connections are being set up. Please try again later.", 503);
  }
  return key;
}

export function calendarStore() {
  encryptionKey();
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    throw new AppleCalendarError("Calendar connections are being set up. Please try again later.", 503);
  }
  return new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });
}

function storageKey(sub: string) { return `ft_apple_connection_v1:${calendarUserKey(sub)}`; }

export function parseAppleCredentials(value: unknown): AppleCredentials | null {
  if (!value || typeof value !== "object") return null;
  const { username, password } = value as Partial<AppleCredentials>;
  if (typeof username !== "string" || typeof password !== "string" || password.length > 64) return null;
  const email = username.trim().toLowerCase();
  const normalized = password.trim().replace(/-/g, "");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-z]{16}$/i.test(normalized)) return null;
  return { username: email, password: normalized.match(/.{4}/g)!.join("-") };
}

export async function saveAppleConnection(redis: Redis, sub: string, credentials: AppleCredentials) {
  const connection: AppleConnection = { ...credentials, id: randomBytes(16).toString("hex") };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  // Binding the ciphertext to its user prevents it being copied to another account's record.
  cipher.setAAD(Buffer.from(storageKey(sub)));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(connection), "utf8"), cipher.final()]);
  const encrypted: EncryptedConnection = {
    version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64"),
  };
  await redis.set(storageKey(sub), encrypted);
  return connection;
}

export async function readAppleConnection(redis: Redis, sub: string): Promise<AppleConnection | null> {
  const value = await redis.get<EncryptedConnection>(storageKey(sub));
  if (value === null) return null;
  try {
    if (value.version !== 1) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(value.iv, "base64"));
    decipher.setAAD(Buffer.from(storageKey(sub)));
    decipher.setAuthTag(Buffer.from(value.tag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]);
    const connection = JSON.parse(plaintext.toString("utf8")) as AppleConnection;
    if (!/^[a-f0-9]{32}$/.test(connection.id) || !parseAppleCredentials(connection)) throw new Error();
    return connection;
  } catch {
    throw new AppleCalendarError("Your calendar connection could not be opened. Disconnect it and connect again.", 409);
  }
}

export async function deleteAppleConnection(redis: Redis, sub: string) {
  await redis.del(storageKey(sub));
}

export function publicAppleConnection(connection: AppleConnection | null) {
  return connection ? { id: connection.id, email: connection.username } : null;
}
