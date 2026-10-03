import { Shoot } from "../types/finance";

export interface NotionSyncResult {
  success: boolean;
  total: number;
  processed: number;
  created: number;
  updated: number;
  failedBatch?: number;
  error?: string;
}

export interface SanitizedShootPayload {
  id: string;
  title: string;
  date?: string;
  category?: string;
  status?: string;
  completed: boolean;
}

const BATCH_SIZE = 10;
let isSyncInProgress = false;

export function isNotionSyncing(): boolean {
  return isSyncInProgress;
}

export function _resetSyncLockForTests(): void {
  isSyncInProgress = false;
}

export async function syncShootsToNotion(
  shoots: Shoot[]
): Promise<NotionSyncResult> {
  if (isSyncInProgress) {
    return {
      success: false,
      total: shoots?.length ?? 0,
      processed: 0,
      created: 0,
      updated: 0,
      error: "Sync already in progress.",
    };
  }

  if (!shoots || shoots.length === 0) {
    return {
      success: false,
      total: 0,
      processed: 0,
      created: 0,
      updated: 0,
      error: "No gigs to sync.",
    };
  }

  let token: string | null = null;
  try {
    if (typeof localStorage !== "undefined") {
      token = localStorage.getItem("ft_google_token");
    } else if (typeof window !== "undefined" && window.localStorage) {
      token = window.localStorage.getItem("ft_google_token");
    }
  } catch {
    token = null;
  }

  if (!token) {
    return {
      success: false,
      total: shoots.length,
      processed: 0,
      created: 0,
      updated: 0,
      error: "Authentication required. Please sign in with Google.",
    };
  }

  isSyncInProgress = true;

  try {
    const total = shoots.length;
    let processed = 0;
    let created = 0;
    let updated = 0;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchNumber = batchIndex + 1;
      const chunk = shoots.slice(
        batchIndex * BATCH_SIZE,
        (batchIndex + 1) * BATCH_SIZE
      );

      const payload = {
        shoots: chunk.map((s): SanitizedShootPayload => ({
          id: s.id,
          title: s.title,
          date: s.date,
          category: s.category,
          status: s.status,
          completed: s.completed,
        })),
      };

      try {
        const res = await fetch("/api/notion", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (res.status === 401) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("auth-expired"));
          }
          return {
            success: false,
            total,
            processed,
            created,
            updated,
            failedBatch: batchNumber,
            error: "Authentication expired. Please sign in again.",
          };
        }

        if (res.status === 403) {
          return {
            success: false,
            total,
            processed,
            created,
            updated,
            failedBatch: batchNumber,
            error: "Access denied. Your Google account is not authorized for Notion sync.",
          };
        }

        if (res.status === 429 || res.status === 529) {
          return {
            success: false,
            total,
            processed,
            created,
            updated,
            failedBatch: batchNumber,
            error: "Notion is temporarily rate-limited. Try again later.",
          };
        }

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          // Ignore JSON parse errors for non-JSON responses
        }

        if (!res.ok) {
          if (res.status === 400 && data?.error === "SCHEMA_MISMATCH") {
            return {
              success: false,
              total,
              processed,
              created,
              updated,
              failedBatch: batchNumber,
              error: "Notion database schema mismatch.",
            };
          }

          return {
            success: false,
            total,
            processed,
            created,
            updated,
            failedBatch: batchNumber,
            error: "Notion sync failed.",
          };
        }

        processed += chunk.length;
        created += typeof data?.created === "number" ? data.created : 0;
        updated += typeof data?.updated === "number" ? data.updated : 0;
      } catch {
        return {
          success: false,
          total,
          processed,
          created,
          updated,
          failedBatch: batchNumber,
          error: "Connection failed. Please check your network and try again.",
        };
      }
    }

    return {
      success: true,
      total,
      processed,
      created,
      updated,
    };
  } finally {
    isSyncInProgress = false;
  }
}
