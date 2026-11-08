import { useState, useEffect, useRef, useCallback } from "react";
import { UnifiedFinanceData } from "../types/finance";
import { isValidFinanceData } from "../utils/validationHelpers";
import { SyncConflictState, LastResolvedConflict } from "../types/finance";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import { getFinanceAuth, getFinanceSubject, getLegacyToken, LEGACY_TOKEN_KEY, SESSION_STORAGE_KEY } from "../utils/financeAuth";

export { getGoogleSubFromToken } from "../utils/financeAuth";
export const DATA_STORAGE_KEY = "ft_master_data_v1";
const BROADCAST_CHANNEL_NAME = "ft_sync_channel";

export const getGoogleSub = getFinanceSubject;

export function getScopedKeyForSub(base: string, sub: string | null | undefined): string | null {
  if (typeof sub !== "string" || sub.trim() === "") return null;
  return `${base}_${sub.trim()}`;
}

export function getScopedDataKey(sub: string | null | undefined): string | null {
  return getScopedKeyForSub(DATA_STORAGE_KEY, sub);
}

function getScopedKey(base: string): string | null {
  return getScopedKeyForSub(base, getGoogleSub());
}

function isValidRevision(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

// Positive revisions are authoritative when the local base is known.
// Revision zero is also used for legacy snapshots, which still use timestamps.
function shouldPullCloudSnapshot(
  revision: unknown,
  baseRevision: number | null,
  cloudUpdatedAt: unknown,
  localUpdatedAt: number
): boolean {
  if (revision !== undefined && !isValidRevision(revision)) return false;
  if (isValidRevision(revision) && baseRevision !== null &&
      (revision > 0 || baseRevision > 0)) {
    if (revision !== baseRevision || localUpdatedAt !== 0) {
      return revision > baseRevision;
    }
    // Recover a missing local snapshot even if its stored revision survived.
  }
  return isValidUpdatedAt(cloudUpdatedAt) && cloudUpdatedAt > localUpdatedAt;
}

const PENDING_SYNC_KEY = "ft_sync_pending";

function pendingSyncPrefix(sub: string) {
  return `ft_sync_pending_writer:${encodeURIComponent(sub)}:`;
}

type PendingRecord = { key: string; raw: string };

function loadPendingSync(sub: string | null) {
  if (!sub) return null;
  try {
    const prefix = pendingSyncPrefix(sub);
    const keys = [`${PENDING_SYNC_KEY}_${sub}`];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }

    let newest: (PendingRecord & { snapshot: UnifiedFinanceData; baseRevision: number | null }) | null = null;
    for (const key of keys.sort()) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const record = JSON.parse(raw);
        if (record?.version !== 1 || record.sub !== sub ||
          (record.baseRevision !== null && !isValidRevision(record.baseRevision)) ||
          !isValidFinanceData(record.snapshot) || !isValidUpdatedAt(record.snapshot.updatedAt)) {
          continue;
        }
        if (!newest || record.snapshot.updatedAt > getUpdatedAt(newest.snapshot)) {
          newest = { key, raw, snapshot: record.snapshot, baseRevision: record.baseRevision };
        }
      } catch {
        // A corrupt record must not hide another recoverable edit.
      }
    }
    return newest;
  } catch {
    return null;
  }
}

function removePendingRecord(record: PendingRecord | null) {
  if (record && localStorage.getItem(record.key) === record.raw) {
    localStorage.removeItem(record.key);
  }
}

export function isValidConflictState(data: any): data is SyncConflictState {
  if (!data || typeof data !== "object") return false;
  if (!isValidFinanceData(data.localSnapshot)) return false;
  if (!isValidFinanceData(data.cloudSnapshot)) return false;
  if (data.baseRevision !== null && !isValidRevision(data.baseRevision)) return false;
  if (!isValidRevision(data.cloudRevision)) return false;
  if (!Number.isInteger(data.detectedAt) || data.detectedAt < 0) return false;
  return true;
}

export function loadScopedConflictState(
  sub: string | null | undefined,
  options?: { cleanupInvalid?: boolean }
): SyncConflictState | null {
  const conflictKey = getScopedKeyForSub("ft_sync_conflict", sub);
  if (!conflictKey || typeof window === "undefined") {
    return null;
  }
  try {
    const stored = localStorage.getItem(conflictKey);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored);
    if (isValidConflictState(parsed)) {
      return parsed;
    }
    if (options?.cleanupInvalid) {
      localStorage.removeItem(conflictKey);
    }
  } catch {
    if (options?.cleanupInvalid) {
      try {
        localStorage.removeItem(conflictKey);
      } catch {}
    }
  }
  return null;
}

function clearResolvedConflict(sub: string, winningRevision: number) {
  const key = getScopedKeyForSub("ft_sync_conflict", sub);
  if (!key || (loadScopedConflictState(sub)?.cloudRevision ?? 0) > winningRevision) return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

const CONFLICT_BACKUP_LIMIT = 5;

export function loadScopedConflictBackups(sub: string | null): LastResolvedConflict[] {
  const key = getScopedKeyForSub("ft_sync_conflict_backups", sub);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    const entries: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(entries)) return [];
    return entries.filter((entry): entry is LastResolvedConflict =>
      !!entry && isValidFinanceData(entry.localSnapshot) &&
      isValidFinanceData(entry.cloudSnapshot) && isValidRevision(entry.cloudRevision) &&
      isValidUpdatedAt(entry.detectedAt) && isValidUpdatedAt(entry.resolvedAt) &&
      (entry.resolution === "local" || entry.resolution === "cloud")
    ).slice(0, CONFLICT_BACKUP_LIMIT);
  } catch {
    return [];
  }
}

export function loadScopedFinanceData(sub: string | null | undefined): UnifiedFinanceData {
  const scopedKey = getScopedDataKey(sub);
  if (!scopedKey || typeof window === "undefined") {
    return INITIAL_UNIFIED_DATA;
  }
  try {
    const saved = localStorage.getItem(scopedKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (isValidFinanceData(parsed)) {
        const updatedAt =
          typeof parsed.updatedAt === "number" &&
          Number.isFinite(parsed.updatedAt) &&
          parsed.updatedAt >= 0
            ? parsed.updatedAt
            : 0;
        return {
          ...parsed,
          updatedAt
        } as UnifiedFinanceData;
      }
      console.warn(
        "Invalid local finance data found. Using fallback data instead."
      );
    }
  } catch (err) {
    console.warn(
      "Could not load local finance data. Using fallback data instead.",
      err
    );
  }

  const persistedConflict = loadScopedConflictState(sub);
  if (persistedConflict) {
    const fallbackSnapshot = persistedConflict.localSnapshot;
    const updatedAt =
      typeof fallbackSnapshot.updatedAt === "number" &&
      Number.isFinite(fallbackSnapshot.updatedAt) &&
      fallbackSnapshot.updatedAt >= 0
        ? fallbackSnapshot.updatedAt
        : 0;
    return {
      ...fallbackSnapshot,
      updatedAt
    } as UnifiedFinanceData;
  }

  return INITIAL_UNIFIED_DATA;
}


export const AUTH_TOKEN_CHANGE_EVENT = "ft-auth-token-changed";
const AUTH_TOKEN_REJECTED_EVENT = "auth-expired";

export function notifyAuthTokenRejected(token: string): void {
  if (token && token === getFinanceAuth().key && typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_TOKEN_REJECTED_EVENT));
  }
}

export function notifyAuthTokenChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_TOKEN_CHANGE_EVENT));
  }
}

export const getLocalPasscode = getLegacyToken;

export function setLocalPasscode(code: string): void {
  try {
    localStorage.setItem(LEGACY_TOKEN_KEY, code.trim());
    notifyAuthTokenChanged();
  } catch {}
}

function isValidUpdatedAt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function getUpdatedAt(data: unknown): number {
  if (data && typeof data === "object") {
    const updatedAt =
      (data as Partial<UnifiedFinanceData>).updatedAt;

    if (isValidUpdatedAt(updatedAt)) {
      return updatedAt;
    }
  }

  return 0;
}

export function useCloudSync(
  globalData: UnifiedFinanceData,
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>,
  showToast: (msg: string) => void
) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [debugLog, setDebugLog] = useState<string>("");
  const [hasInitialSyncCompleted, setHasInitialSyncCompleted] = useState<boolean>(() => !getGoogleSub());
  const [activeSub, setActiveSub] = useState<string | null>(getGoogleSub());
  const activeSubRef = useRef<string | null>(activeSub);
  const [syncNeedsSignIn, setSyncNeedsSignIn] = useState(false);
  const rejectedTokenRef = useRef("");
  const resumeSyncRef = useRef<() => void>(() => {});

  const [conflictState, setConflictState] = useState<SyncConflictState | null>(() =>
    loadScopedConflictState(activeSubRef.current, { cleanupInvalid: true })
  );
  const [conflictOwnerSub, setConflictOwnerSub] = useState<string | null>(() =>
    conflictState && activeSubRef.current ? activeSubRef.current : null
  );
  const conflictOwnerSubRef = useRef<string | null>(conflictOwnerSub);
  conflictOwnerSubRef.current = conflictOwnerSub;

  const isFirstMount = useRef(true);

  const isRemoteUpdate = useRef(false);
  const lastNonPersistedDataRef = useRef<UnifiedFinanceData>(globalData);
  const lastHydratedDataRef = useRef<UnifiedFinanceData | null>(null);
  const isDirtyRef = useRef(false);
  const pendingRef = useRef<PendingRecord | null>(null);
  const pendingWriterRef = useRef<string | null>(null);
  const dirtyOwnerSubRef = useRef<string | null>(null);
  const localMutationGenerationRef = useRef(0);
  const accountSessionGenerationRef = useRef(0);
  const pullRequestIdRef = useRef(0);
  const pushRequestIdRef = useRef(0);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const latestDataRef = useRef<UnifiedFinanceData>(globalData);
  const prevGlobalDataPropRef = useRef(globalData);
  const isPushingRef = useRef(false);
  const isResolvingConflictRef = useRef(false);
  const pushRetryCountRef = useRef(0);
  const pushRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseRevisionRef = useRef<number | null>((() => {
    try {
      const baseRevKey = getScopedKey("ft_sync_base_revision");
      const rev = baseRevKey && typeof window !== "undefined" ? localStorage.getItem(baseRevKey) : null;
      const parsed = rev !== null ? parseInt(rev, 10) : null;
      return isValidRevision(parsed) ? parsed : null;
    } catch { return null; }
  })());
  const conflictStateRef = useRef(conflictState);
  conflictStateRef.current = conflictState;

  if (globalData !== prevGlobalDataPropRef.current) {
    prevGlobalDataPropRef.current = globalData;
    if (
      globalData === lastHydratedDataRef.current ||
      getUpdatedAt(globalData) >= getUpdatedAt(latestDataRef.current)
    ) {
      latestDataRef.current = globalData;
    }
  }

  const cancelPushRetry = useCallback(() => {
    if (pushRetryTimeoutRef.current) {
      clearTimeout(pushRetryTimeoutRef.current);
      pushRetryTimeoutRef.current = null;
    }
    pushRetryCountRef.current = 0;
  }, []);

  const restorePendingSync = useCallback((sub: string | null) => {
    const pending = loadPendingSync(sub);
    pendingRef.current = pending;
    if (!pending) return null;
    isDirtyRef.current = true;
    dirtyOwnerSubRef.current = sub;
    baseRevisionRef.current = pending.baseRevision;
    return pending.snapshot;
  }, []);

  const persistPendingSync = useCallback((sub: string, snapshot: UnifiedFinanceData) => {
    try {
      const writer = pendingWriterRef.current ??= crypto.randomUUID();
      const key = pendingSyncPrefix(sub) + writer;
      const previous = pendingRef.current;
      const raw = JSON.stringify({ version: 1, sub, baseRevision: baseRevisionRef.current, snapshot });
      localStorage.setItem(key, raw);
      pendingRef.current = { key, raw };
      if (previous?.key !== key) removePendingRecord(previous);
    } catch {
      showToast("⚠️ Device storage full: local changes may not survive a reload.");
    }
  }, [showToast]);

  const clearPendingSync = (record: PendingRecord | null) => {
    try {
      removePendingRecord(record);
      if (pendingRef.current === record) pendingRef.current = null;
    } catch {}
  };

  const transitionToSub = useCallback(
    (newSub: string | null) => {
      if (newSub === activeSubRef.current) {
        return;
      }

      rejectedTokenRef.current = "";
      setSyncNeedsSignIn(false);
      activeSubRef.current = newSub;
      accountSessionGenerationRef.current += 1;
      pullRequestIdRef.current += 1;
      pushRequestIdRef.current += 1;
      localMutationGenerationRef.current += 1;

      cancelPushRetry();
      isDirtyRef.current = false;
      dirtyOwnerSubRef.current = null;
      isPushingRef.current = false;
      isResolvingConflictRef.current = false;
      setIsSyncing(false);

      const baseRevKey = getScopedKeyForSub("ft_sync_base_revision", newSub);
      const storedBase =
        baseRevKey && typeof window !== "undefined"
          ? localStorage.getItem(baseRevKey)
          : null;
      const parsedBase = storedBase !== null ? parseInt(storedBase, 10) : null;
      baseRevisionRef.current = isValidRevision(parsedBase) ? parsedBase : null;

      const conflict = loadScopedConflictState(newSub, { cleanupInvalid: true });
      const nextConflictOwnerSub = conflict && newSub ? newSub : null;
      conflictStateRef.current = conflict;
      conflictOwnerSubRef.current = nextConflictOwnerSub;
      setConflictState(conflict);
      setConflictOwnerSub(nextConflictOwnerSub);

      const hydratedData = restorePendingSync(newSub) ?? loadScopedFinanceData(newSub);
      lastNonPersistedDataRef.current = hydratedData;
      lastHydratedDataRef.current = hydratedData;
      latestDataRef.current = hydratedData;
      setGlobalData(hydratedData);

      setHasInitialSyncCompleted(!newSub);
      setActiveSub(newSub);
    },
    [cancelPushRetry, restorePendingSync, setGlobalData]
  );

  useEffect(() => {
    const handleSameTabAuthChange = () => {
      const { key: token, sub } = getFinanceAuth();
      if (sub !== activeSubRef.current) {
        transitionToSub(sub);
      } else if (sub && rejectedTokenRef.current && token !== rejectedTokenRef.current) {
        rejectedTokenRef.current = "";
        setSyncNeedsSignIn(false);
        resumeSyncRef.current();
      }
    };
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === LEGACY_TOKEN_KEY || e.key === SESSION_STORAGE_KEY || e.key === null) {
        handleSameTabAuthChange();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(AUTH_TOKEN_CHANGE_EVENT, handleSameTabAuthChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(AUTH_TOKEN_CHANGE_EVENT, handleSameTabAuthChange);
    };
  }, [transitionToSub]);

  useEffect(() => {
    if (isFirstMount.current) return;
    if (activeSub) {
      void pullLatestData(true);
    }
  }, [activeSub]);

  // Authentication is handled by Google Sign-In in the UI.
  // This legacy helper remains available for compatibility, but never
  // prompts for a passcode.
  const promptPasscode = useCallback((): string | null => {
    return null;
  }, []);

  const applyRemoteData = useCallback(
    (
      incomingData: UnifiedFinanceData,
      source: "cloud" | "broadcast" | "storage",
      options?: { allowOlderTimestamp?: boolean; resolvingConflict?: boolean; preserveStoredData?: boolean }
    ): boolean => {
      if (!options?.resolvingConflict &&
          (conflictStateRef.current || pendingRef.current || isDirtyRef.current)) return false;

      if (!isValidFinanceData(incomingData)) {
        setDebugLog(
          `⚠️ ${source.toUpperCase()} DATA IGNORED: invalid structural schema.`
        );
        return false;
      }

      const incomingUpdatedAt = getUpdatedAt(incomingData);
      const currentUpdatedAt = getUpdatedAt(latestDataRef.current);

      if (!isValidUpdatedAt(incomingData.updatedAt)) {
        setDebugLog(
          `⚠️ ${source.toUpperCase()} DATA IGNORED: invalid updatedAt.`
        );
        return false;
      }

      // Timestamp order still protects legacy responses and local tab events.
      if (!options?.allowOlderTimestamp && incomingUpdatedAt <= currentUpdatedAt) {
        setDebugLog(
          `↩️ ${source.toUpperCase()} DATA IGNORED: local copy is newer or equal.`
        );
        return false;
      }

      const currentSub = getGoogleSub();
      const scopedDataKey = getScopedDataKey(currentSub);
      if (!currentSub || !scopedDataKey || currentSub !== activeSubRef.current) {
        return false;
      }

      isRemoteUpdate.current = true;
      lastNonPersistedDataRef.current = incomingData;
      isDirtyRef.current = false;
      dirtyOwnerSubRef.current = null;

      latestDataRef.current = incomingData;
      setGlobalData(incomingData);

      if (options?.preserveStoredData) return true;

      try {
        window.localStorage.setItem(
          scopedDataKey,
          JSON.stringify(incomingData)
        );
      } catch (e) {
        console.warn("localStorage sync error", e);
        showToast("⚠️ Device storage full: local changes may not be saved.");
      }

      return true;
    },
    [setGlobalData, showToast]
  );

  const pushToCloudRef = useRef<(data: UnifiedFinanceData) => Promise<boolean>>(() => Promise.resolve(false));

  const schedulePushRetry = useCallback(
    (
      expectedSub: string | null = getGoogleSub(),
      expectedAccountGen: number = accountSessionGenerationRef.current
    ) => {
      if (!expectedSub || expectedSub !== activeSubRef.current) {
        return;
      }

      if (pushRetryTimeoutRef.current) {
        clearTimeout(pushRetryTimeoutRef.current);
        pushRetryTimeoutRef.current = null;
      }

      if (pushRetryCountRef.current >= 3) {
        setDebugLog("⚠️ PUSH RETRY STOPPED: Maximum retries reached.");
        return;
      }

      pushRetryCountRef.current += 1;
      // Bounded exponential backoff: retry 1 = 2s, retry 2 = 4s, retry 3 = 8s
      const delay = Math.pow(2, pushRetryCountRef.current) * 1000;

      pushRetryTimeoutRef.current = setTimeout(() => {
        pushRetryTimeoutRef.current = null;
        if (
          !expectedSub ||
          getGoogleSub() !== expectedSub ||
          activeSubRef.current !== expectedSub ||
          accountSessionGenerationRef.current !== expectedAccountGen ||
          dirtyOwnerSubRef.current !== expectedSub
        ) {
          return;
        }
        if (isDirtyRef.current) {
          void pushToCloudRef.current(latestDataRef.current);
        }
      }, delay);
    },
    []
  );

  const pauseSyncForRejectedToken = useCallback((token: string) => {
    const current = getFinanceAuth();
    if (!token || token !== current.key || current.sub !== activeSubRef.current) return false;
    rejectedTokenRef.current = token;
    cancelPushRetry();
    setSyncNeedsSignIn(true);
    setDebugLog("Cloud sync paused: reconnect your Google account.");
    return true;
  }, [cancelPushRetry]);

  useEffect(() => {
    const handleTokenRejected = () => pauseSyncForRejectedToken(getFinanceAuth().key);
    window.addEventListener(AUTH_TOKEN_REJECTED_EVENT, handleTokenRejected);
    return () => window.removeEventListener(AUTH_TOKEN_REJECTED_EVENT, handleTokenRejected);
  }, [pauseSyncForRejectedToken]);

  type PushOutcome =
    | { kind: "accepted"; revision: number }
    | { kind: "conflict"; conflict: SyncConflictState }
    | { kind: "conflict-malformed" }
    | { kind: "failed"; status?: number; isNetwork?: boolean }
    | { kind: "auth" }
    | { kind: "skipped"; reason: string };

  const executePushToCloud = async (
    dataToSave: UnifiedFinanceData,
    options?: {
      targetBaseRevision?: number | null;
      isResolutionAttempt?: boolean;
    }
  ): Promise<PushOutcome> => {
    if (conflictStateRef.current && !options?.isResolutionAttempt) {
      return { kind: "skipped", reason: "active-conflict" };
    }

    if (isPushingRef.current) {
      return { kind: "skipped", reason: "already-pushing" };
    }

    if (!navigator.onLine) {
      setIsOnline(false);
      return { kind: "skipped", reason: "offline" };
    }

    const { key: token, sub: requestSub, headers } = getFinanceAuth();

    if (!token || !requestSub || requestSub !== activeSubRef.current) {
      setDebugLog("⚠️ PUSH SKIPPED: No Google token available.");
      return { kind: "skipped", reason: "no-token" };
    }

    if (token === rejectedTokenRef.current) return { kind: "auth" };
    let retryWithNewToken = false;
    const requestAccountGen = accountSessionGenerationRef.current;
    const pushId = ++pushRequestIdRef.current;
    const submittedPending = pendingRef.current;
    const submittedGeneration = localMutationGenerationRef.current;
    const effectiveBaseRevision =
      options && "targetBaseRevision" in options
        ? options.targetBaseRevision
        : baseRevisionRef.current;

    isPushingRef.current = true;
    setIsSyncing(true);

    try {
      /*
       * IMPORTANT:
       * Do not create a new updatedAt timestamp here.
       *
       * updatedAt represents when the financial data actually changed.
       * Keeping that timestamp unchanged allows the server to reject
       * stale-device writes.
       */
      const payload = {
        data: dataToSave,
        baseRevision: effectiveBaseRevision
      };

      const payloadUpdatedAt = getUpdatedAt(dataToSave);

      const res = await fetch("/api/sync", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        // Pending edits survive reload; keepalive limits the size of a full snapshot.
        body: JSON.stringify(payload)
      });

      if (
        getGoogleSub() !== requestSub ||
        activeSubRef.current !== requestSub ||
        accountSessionGenerationRef.current !== requestAccountGen ||
        pushRequestIdRef.current !== pushId
      ) {
        return { kind: "skipped", reason: "account-changed" };
      }

      if (res.ok) {
        setIsOnline(true);

        const result = await res.json().catch(() => null);

        if (
          getGoogleSub() !== requestSub ||
          activeSubRef.current !== requestSub ||
          accountSessionGenerationRef.current !== requestAccountGen ||
          pushRequestIdRef.current !== pushId
        ) {
          return { kind: "skipped", reason: "account-changed" };
        }

        if (result?.accepted === false) {
          cancelPushRetry();
          setDebugLog(
            `⚠️ PUSH IGNORED: Cloud has newer data (${new Date(
              result.cloudUpdatedAt
            ).toLocaleTimeString()})`
          );

          const cloudData =
            result?.data as UnifiedFinanceData | undefined;

          if (cloudData) {
            const applied = applyRemoteData(
              cloudData,
              "cloud"
            );

            if (applied) {
              showToast(
                "☁️ Cloud had newer data — latest version loaded"
              );
            }
          }

          return { kind: "skipped", reason: "cloud-newer" };
        }

        const isExplicitlyAccepted =
          result &&
          typeof result === "object" &&
          result.success === true &&
          result.accepted === true &&
          isValidRevision(result.revision);

        if (!isExplicitlyAccepted) {
          cancelPushRetry();
          setDebugLog(
            "⚠️ PUSH UNCONFIRMED: Server returned an invalid or incomplete acceptance response."
          );
          return { kind: "failed", status: res.status };
        }

        /*
         * Only clear dirty state when the data we just pushed is
         * still the latest local version.
         *
         * A newer local edit may have happened while fetch() was
         * in progress.
         */
        baseRevisionRef.current = result.revision;
        try {
          const baseRevKey = getScopedKeyForSub("ft_sync_base_revision", requestSub);
          if (baseRevKey) {
            window.localStorage.setItem(
              baseRevKey,
              result.revision.toString()
            );
          }
        } catch {}

        const hasNewerLocalMutation =
          localMutationGenerationRef.current > submittedGeneration ||
          latestDataRef.current !== dataToSave ||
          getUpdatedAt(latestDataRef.current) > payloadUpdatedAt;

        cancelPushRetry();
        if (!hasNewerLocalMutation) {
          clearPendingSync(submittedPending);
          isDirtyRef.current = false;
          dirtyOwnerSubRef.current = null;
        } else {
          isDirtyRef.current = true;
          dirtyOwnerSubRef.current = requestSub;
          const pending = pendingRef.current;
          try {
            if (pending && localStorage.getItem(pending.key) === pending.raw) {
              persistPendingSync(requestSub, latestDataRef.current);
            }
          } catch {}
          schedulePushRetry(requestSub, requestAccountGen);
        }

        setDebugLog(
          `✓ PUSH SUCCESS (${res.status}): Saved at ${new Date().toLocaleTimeString()}`
        );

        return { kind: "accepted", revision: result.revision };
      }

      if (res.status === 401) {
        retryWithNewToken = !pauseSyncForRejectedToken(token) && !options?.isResolutionAttempt;
        return { kind: "auth" };
      }

      if (res.status === 409) {
        cancelPushRetry();
        const result = await res.json().catch(() => null);

        if (
          getGoogleSub() !== requestSub ||
          activeSubRef.current !== requestSub ||
          accountSessionGenerationRef.current !== requestAccountGen ||
          pushRequestIdRef.current !== pushId
        ) {
          return { kind: "skipped", reason: "account-changed" };
        }

        if (result?.error === "conflict" && result.empty === true &&
          result.revision === 0 && result.data === null) {
          setDebugLog("⚠️ Cloud snapshot is missing. Local changes are still pending.");
          return { kind: "failed", status: 409 };
        }

        const hasValidCloudData =
          result &&
          typeof result === "object" &&
          isValidFinanceData(result.data) &&
          isValidUpdatedAt(result.data.updatedAt);
        const hasValidCloudRevision = isValidRevision(result?.revision);

        if (!hasValidCloudData || !hasValidCloudRevision) {
          setDebugLog(
            "⚠️ SYNC CONFLICT: Malformed conflict response from cloud."
          );
          return { kind: "conflict-malformed" };
        }

        setDebugLog(
          "⚠️ SYNC CONFLICT: Cloud has newer data."
        );

        const provenanceBaseRevision = conflictStateRef.current
          ? conflictStateRef.current.baseRevision
          : baseRevisionRef.current;

        const conflict: SyncConflictState = {
          baseRevision: provenanceBaseRevision,
          localSnapshot: latestDataRef.current,
          cloudSnapshot: result.data as UnifiedFinanceData,
          cloudRevision: result.revision,
          detectedAt: Date.now()
        };
        conflictStateRef.current = conflict;
        conflictOwnerSubRef.current = requestSub;
        setConflictState(conflict);
        setConflictOwnerSub(requestSub);
        try {
          const conflictKey = getScopedKeyForSub("ft_sync_conflict", requestSub);
          if (conflictKey) {
            window.localStorage.setItem(
              conflictKey,
              JSON.stringify(conflict)
            );
          }
        } catch {}

        return { kind: "conflict", conflict };
      }

      if (res.status === 503 && typeof res.json === "function") {
        const result = await res.json().catch(() => null);
        if (
          getGoogleSub() !== requestSub ||
          activeSubRef.current !== requestSub ||
          accountSessionGenerationRef.current !== requestAccountGen ||
          pushRequestIdRef.current !== pushId
        ) {
          return { kind: "skipped", reason: "account-changed" };
        }
        if (result?.error === "REVISION_EXHAUSTED" && result.revision === Number.MAX_SAFE_INTEGER) {
          cancelPushRetry();
          setDebugLog("⚠️ Cloud revision limit reached. Local changes are still pending.");
          return { kind: "failed", status: 503 };
        }
      }

      if (res.status >= 500 && res.status < 600) {
        setDebugLog(`❌ SERVER ERROR (${res.status})`);
        if (options?.isResolutionAttempt) {
          cancelPushRetry();
        } else {
          schedulePushRetry(requestSub, requestAccountGen);
        }
        return { kind: "failed", status: res.status };
      }

      // Definitive 4xx errors should not automatically retry
      cancelPushRetry();
      setDebugLog(`❌ PUSH FAILED (${res.status})`);
      return { kind: "failed", status: res.status };
    } catch (err: any) {
      if (
        getGoogleSub() !== requestSub ||
        activeSubRef.current !== requestSub ||
        accountSessionGenerationRef.current !== requestAccountGen ||
        pushRequestIdRef.current !== pushId
      ) {
        return { kind: "skipped", reason: "account-changed" };
      }
      setIsOnline(false);
      setDebugLog(
        `❌ NETWORK FAILED: ${err?.message || "Unknown error"}`
      );
      if (options?.isResolutionAttempt) {
        cancelPushRetry();
      } else {
        schedulePushRetry(requestSub, requestAccountGen);
      }
      return { kind: "failed", isNetwork: true };
    } finally {
      if (
        getGoogleSub() === requestSub &&
        activeSubRef.current === requestSub &&
        accountSessionGenerationRef.current === requestAccountGen &&
        pushRequestIdRef.current === pushId
      ) {
        isPushingRef.current = false;
        setIsSyncing(false);
        if (retryWithNewToken && pendingRef.current) resumeSyncRef.current();
      }
    }
  };

  const pushToCloud = async (
    dataToSave: UnifiedFinanceData
  ): Promise<boolean> => {
    const outcome = await executePushToCloud(dataToSave);
    return outcome.kind === "accepted";
  };


  const resolveConflict = async (resolution: "local" | "cloud") => {
    if (!conflictStateRef.current) return;
    if (isResolvingConflictRef.current || isPushingRef.current) return;
    const conflict = conflictStateRef.current;
    const activeAccountSub = getGoogleSub();
    if (!activeAccountSub || activeAccountSub !== activeSubRef.current) return;
    const requestAccountGen = accountSessionGenerationRef.current;

    const localSnapshot = latestDataRef.current === INITIAL_UNIFIED_DATA
      ? conflict.localSnapshot
      : latestDataRef.current;
    if (!isValidFinanceData(localSnapshot) || !isValidFinanceData(conflict.cloudSnapshot) ||
      !isValidUpdatedAt(conflict.cloudSnapshot.updatedAt) || !isValidRevision(conflict.cloudRevision)) {
      showToast("⚠️ Could not apply cloud data: snapshot is invalid. Conflict remains active.");
      return;
    }

    const backup: LastResolvedConflict = {
      localSnapshot, cloudSnapshot: conflict.cloudSnapshot,
      detectedAt: conflict.detectedAt, resolvedAt: Date.now(),
      resolution, cloudRevision: conflict.cloudRevision
    };
    const backupKey = getScopedKeyForSub("ft_sync_conflict_backups", activeAccountSub);
    if (!backupKey) return;
    try {
      const previous = loadScopedConflictBackups(activeAccountSub);
      localStorage.setItem(backupKey, JSON.stringify([backup, ...previous].slice(0, CONFLICT_BACKUP_LIMIT)));
    } catch {
      showToast("⚠️ Could not back up local changes. Conflict remains active.");
      return;
    }

    const broadcastResolution = (winningSnapshot: UnifiedFinanceData, winningRevision: number) => {
      clearResolvedConflict(activeAccountSub, winningRevision);
      try {
        broadcastChannelRef.current?.postMessage({
          type: "CONFLICT_RESOLVED",
          payload: { sub: activeAccountSub, resolution, winningSnapshot, winningRevision }
        });
      } catch {}
    };

    isResolvingConflictRef.current = true;
    try {
      if (resolution === "cloud") {
        const adopted = applyRemoteData(conflict.cloudSnapshot, "cloud", {
          allowOlderTimestamp: true,
          resolvingConflict: true
        });
        if (!adopted) {
          showToast("⚠️ Could not apply cloud data: snapshot is invalid. Conflict remains active.");
          return;
        }

        cancelPushRetry();

        try {
          const lastResolvedKey = getScopedKeyForSub("ft_sync_last_resolved_conflict", activeAccountSub);
          if (lastResolvedKey) window.localStorage.setItem(lastResolvedKey, JSON.stringify(backup));
        } catch {}

        clearPendingSync(pendingRef.current);
        baseRevisionRef.current = conflict.cloudRevision;
        try {
          const baseRevKey = getScopedKeyForSub("ft_sync_base_revision", activeAccountSub);
          if (baseRevKey) window.localStorage.setItem(baseRevKey, conflict.cloudRevision.toString());
        } catch {}

        conflictStateRef.current = null;
        conflictOwnerSubRef.current = null;
        setConflictState(null);
        setConflictOwnerSub(null);
        setHasInitialSyncCompleted(true);
        broadcastResolution(conflict.cloudSnapshot, conflict.cloudRevision);
      } else {
        // Keep local: Attempt the compare-and-swap push against the conflict's cloudRevision
        const submittedSnapshot = localSnapshot;
        const submittedGeneration = localMutationGenerationRef.current;
        const outcome = await executePushToCloud(submittedSnapshot, {
          targetBaseRevision: conflict.cloudRevision,
          isResolutionAttempt: true
        });
        if (
          getGoogleSub() !== activeAccountSub ||
          activeSubRef.current !== activeAccountSub ||
          accountSessionGenerationRef.current !== requestAccountGen
        ) {
          return;
        }
        if (outcome.kind === "accepted") {
          try {
            const lastResolvedKey = getScopedKeyForSub("ft_sync_last_resolved_conflict", activeAccountSub);
            if (lastResolvedKey) window.localStorage.setItem(lastResolvedKey, JSON.stringify(backup));
          } catch {}

          conflictStateRef.current = null;
          conflictOwnerSubRef.current = null;
          setConflictState(null);
          setConflictOwnerSub(null);
          setHasInitialSyncCompleted(true);
          broadcastResolution(submittedSnapshot, outcome.revision);

          const hasNewerLocalMutation =
            localMutationGenerationRef.current > submittedGeneration ||
            latestDataRef.current !== submittedSnapshot ||
            getUpdatedAt(latestDataRef.current) > getUpdatedAt(submittedSnapshot);

          if (!hasNewerLocalMutation) {
            isDirtyRef.current = false;
            dirtyOwnerSubRef.current = null;
            cancelPushRetry();
          }
        } else if (outcome.kind === "conflict") {
          showToast("⚠️ Cloud changed again — review the latest version before resolving.");
        } else if (outcome.kind === "conflict-malformed") {
          showToast("⚠️ Could not refresh cloud conflict data. Conflict remains active.");
        } else if (outcome.kind === "failed") {
          showToast("⚠️ Could not confirm cloud save. Conflict remains active — please try again.");
        }
      }
    } finally {
      if (
        getGoogleSub() === activeAccountSub &&
        activeSubRef.current === activeAccountSub &&
        accountSessionGenerationRef.current === requestAccountGen
      ) {
        isResolvingConflictRef.current = false;
      }
    }
  };

  pushToCloudRef.current = pushToCloud;

  /**
   * Commit a real data mutation:
   * local React state -> local persistence/broadcast effect -> cloud push.
   *
   * This intentionally does NOT run for form typing or arbitrary renders.
   */
  const commitSnapshot = useCallback(
    (nextRaw: UnifiedFinanceData, updatedAt: number): UnifiedFinanceData => {
      cancelPushRetry();

      const nextData: UnifiedFinanceData = {
        ...nextRaw,
        updatedAt
      };

      latestDataRef.current = nextData;
      localMutationGenerationRef.current += 1;

      const currentSub = getGoogleSub();
      if (currentSub && currentSub === activeSubRef.current) {
        isDirtyRef.current = true;
        dirtyOwnerSubRef.current = currentSub;
        persistPendingSync(currentSub, nextData);
      } else {
        isDirtyRef.current = false;
        dirtyOwnerSubRef.current = null;
      }

      // The mutation is already committed locally. Push this exact snapshot
      // instead of waiting for a globalData debounce effect.
      setGlobalData(nextData);
      void pushToCloud(nextData);
      return nextData;
    },
    [cancelPushRetry, persistPendingSync, pushToCloud, setGlobalData]
  );

  const commitDataChange = useCallback(
    (action: React.SetStateAction<UnifiedFinanceData>) => {
      const current = latestDataRef.current;

      const nextRaw =
        typeof action === "function"
          ? (action as (prev: UnifiedFinanceData) => UnifiedFinanceData)(current)
          : action;

      if (!nextRaw || nextRaw === current) {
        return;
      }

      commitSnapshot(nextRaw, Date.now());
    },
    [commitSnapshot]
  );

  const commitDataTransition = useCallback(
    <T extends { ok: boolean; data: UnifiedFinanceData }>(
      transition: (prev: UnifiedFinanceData) => T
    ): T => {
      const current = latestDataRef.current;
      const result = transition(current);
      if (result.ok && result.data && result.data !== current) {
        const monotonicUpdatedAt = Math.max(
          Date.now(),
          getUpdatedAt(result.data),
          getUpdatedAt(current)
        );
        const nextData = commitSnapshot(result.data, monotonicUpdatedAt);
        return { ...result, data: nextData };
      }
      return result;
    },
    [commitSnapshot]
  );

  const pullLatestData = async (
    silent = false
  ) => {
    if (conflictStateRef.current || pendingRef.current || isDirtyRef.current || isPushingRef.current) return;

    if (!navigator.onLine) {
      setIsOnline(false);

      if (!silent) {
        showToast("⚠️ Offline: Cannot pull from cloud");
      }

      setHasInitialSyncCompleted(true);
      return;
    }

    const activeEl = document.activeElement;

    const isUserTyping =
      activeEl &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.tagName === "SELECT");

    if (silent && isUserTyping) {
      return;
    }

    const { key: token, sub: requestSub, headers } = getFinanceAuth();

    // No authenticated session means there is nothing to pull.
    // Do not make a network request with an empty or invalid token.
    if (!token || !requestSub) {
      setHasInitialSyncCompleted(true);
      return;
    }

    if (token === rejectedTokenRef.current) return;
    const requestAccountGen = accountSessionGenerationRef.current;
    const requestId = ++pullRequestIdRef.current;
    const requestMutationGen = localMutationGenerationRef.current;

    try {
      if (!silent) {
        setIsSyncing(true);
      }

      const res = await fetch(`/api/sync?t=${Date.now()}`, {
        method: "GET",
        headers,
        cache: "no-store"
      });

      if (
        getGoogleSub() !== requestSub ||
        accountSessionGenerationRef.current !== requestAccountGen ||
        pullRequestIdRef.current !== requestId ||
        conflictStateRef.current
      ) {
        return;
      }

      if (res.status === 401) {
        if (!pauseSyncForRejectedToken(token)) void pullLatestData(silent);
        return;
      }

      if (!res.ok) {
        throw new Error(
          `Server returned status ${res.status}`
        );
      }

      const cloudResponse = await res.json();

      if (
        getGoogleSub() !== requestSub ||
        accountSessionGenerationRef.current !== requestAccountGen ||
        pullRequestIdRef.current !== requestId ||
        requestMutationGen !== localMutationGenerationRef.current ||
        conflictStateRef.current || pendingRef.current || isDirtyRef.current ||
        isPushingRef.current
      ) {
        return;
      }

      const hasSuppliedRevision =
        cloudResponse !== null &&
        typeof cloudResponse === "object" &&
        "revision" in cloudResponse &&
        cloudResponse.revision !== undefined;
      const revision = cloudResponse?.revision;

      // If the server omits `revision`, follow the legacy GET contract without inventing a revision.
      // If `revision` is supplied, it must be a non-negative safe integer; otherwise reject the untrusted response.
      if (hasSuppliedRevision && !isValidRevision(revision)) {
        setDebugLog(
          "⚠️ PULL IGNORED: Cloud data has an invalid revision."
        );
        return;
      }

      const isEmptyCloudRecord =
        cloudResponse !== null &&
        typeof cloudResponse === "object" &&
        !Array.isArray(cloudResponse) &&
        (Object.keys(cloudResponse).length === 0 ||
          ("record" in cloudResponse && cloudResponse.record == null));

      if (isEmptyCloudRecord) {
        setIsOnline(true);
        setDebugLog("✓ PULL SUCCESS (200): No remote snapshot yet.");
        return;
      }

      const record: UnifiedFinanceData =
        cloudResponse?.record || cloudResponse;

      if (record) {
        if (!isValidUpdatedAt(record.updatedAt)) {
          setDebugLog(
            "⚠️ PULL IGNORED: Cloud data has no valid updatedAt."
          );
          return;
        }

        const baseRevision = baseRevisionRef.current;
        if (loadPendingSync(requestSub)) return;

        // A peer may have accepted a newer revision while this GET was in flight.
        const baseRevKey = getScopedKeyForSub("ft_sync_base_revision", requestSub);
        if (isValidRevision(revision) && baseRevKey) {
          try {
            const stored = localStorage.getItem(baseRevKey);
            if (stored !== null && Number(stored) > revision) return;
          } catch {}
        }

        const applied = shouldPullCloudSnapshot(
          revision, baseRevision, record.updatedAt, getUpdatedAt(latestDataRef.current)
        ) && applyRemoteData(record, "cloud", {
          allowOlderTimestamp: isValidRevision(revision) &&
            baseRevision !== null && revision > baseRevision,
        });

        if (applied && isValidRevision(revision)) {
          baseRevisionRef.current = revision;
          try {
            if (baseRevKey) localStorage.setItem(baseRevKey, revision.toString());
          } catch {}
        }

        setIsOnline(true);

        if (!applied) {
          if (!silent) {
            showToast(
              "↩️ No newer cloud data to pull"
            );
          }
          return;
        }

        setDebugLog(
          `✓ PULL SUCCESS (${res.status}): Synced ${
            record.library?.bills?.length || 0
          } bills`
        );

        if (!silent) {
          showToast("☁️ Pulled latest cloud data");
        }
      }
    } catch (err: any) {
      if (
        getGoogleSub() !== requestSub ||
        accountSessionGenerationRef.current !== requestAccountGen ||
        pullRequestIdRef.current !== requestId ||
        conflictStateRef.current
      ) {
        return;
      }
      setDebugLog(
        `❌ PULL STATUS: ${err?.message || "Unknown error"}`
      );

      if (!silent) {
        showToast(
          `❌ Pull failed: ${
            err?.message || "Unknown error"
          }`
        );
      }
    } finally {
      if (
        getGoogleSub() === requestSub &&
        accountSessionGenerationRef.current === requestAccountGen &&
        pullRequestIdRef.current === requestId &&
        !conflictStateRef.current
      ) {
        if (!silent && !isPushingRef.current) {
          setIsSyncing(false);
        }
        if (rejectedTokenRef.current !== token) setHasInitialSyncCompleted(true);
      }
    }
  };

  resumeSyncRef.current = () => {
    if (pendingRef.current) {
      void pushToCloudRef.current(latestDataRef.current);
    } else {
      void pullLatestData(false);
    }
  };

  const forceManualSync = async () => {
    if (conflictStateRef.current) return;
    const requestSub = getGoogleSub();
    if (!requestSub || requestSub !== activeSubRef.current) return;
    const requestAccountGen = accountSessionGenerationRef.current;

    cancelPushRetry();
    const snapshot = latestDataRef.current;
    const outcome = await executePushToCloud(snapshot);

    if (
      getGoogleSub() !== requestSub ||
      activeSubRef.current !== requestSub ||
      accountSessionGenerationRef.current !== requestAccountGen
    ) {
      return;
    }

    if (outcome.kind === "accepted") {
      showToast("☁️ Saved & synced to cloud");
    } else {
      showToast(
        "❌ Cloud save failed - saved locally"
      );
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      cancelPushRetry();

      const currentSub = getGoogleSub();
      // If an explicit committed mutation happened while offline for the active account,
      // retry that pending mutation when connectivity returns.
      if (
        isDirtyRef.current &&
        currentSub &&
        currentSub === activeSubRef.current &&
        dirtyOwnerSubRef.current === currentSub
      ) {
        void pushToCloud(latestDataRef.current);
      } else {
        isDirtyRef.current = false;
        dirtyOwnerSubRef.current = null;
        void pullLatestData(true);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      showToast("⚠️ Offline - changes saved locally");
    };

    const handleFocus = () => {
      void pullLatestData(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);

    const recovered = restorePendingSync(activeSubRef.current);
    if (recovered) {
      latestDataRef.current = recovered;
      lastHydratedDataRef.current = recovered;
      setGlobalData(recovered);
      setHasInitialSyncCompleted(true);
      if (!conflictStateRef.current) void pushToCloudRef.current(recovered);
    } else {
      void pullLatestData(true);
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void pullLatestData(true);
      }
    };

    window.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    // Fast real-time background version check (every 3 seconds)
    const pollInterval = setInterval(async () => {
      // Only poll if the app is visible, online, and the user isn't actively typing
      if (document.visibilityState === "visible" && navigator.onLine && !isDirtyRef.current && !conflictStateRef.current) {
        try {
          const { key: token, sub: requestSub, headers } = getFinanceAuth();
          if (!token || !requestSub || token === rejectedTokenRef.current) return;

          const requestAccountGen = accountSessionGenerationRef.current;
          const pollIsCurrent = () =>
            getGoogleSub() === requestSub &&
            activeSubRef.current === requestSub &&
            accountSessionGenerationRef.current === requestAccountGen &&
            !conflictStateRef.current && !isDirtyRef.current && !isPushingRef.current;

          const res = await fetch(`/api/sync?version_only=true&t=${Date.now()}`, {
            headers,
            cache: "no-store"
          });

          if (!pollIsCurrent()) return;

          if (res.status === 401) {
            pauseSyncForRejectedToken(token);
            return;
          }

          if (res.ok) {
            const data = await res.json();
            if (!pollIsCurrent()) return;
            if (shouldPullCloudSnapshot(
              data?.revision, baseRevisionRef.current, data?.updatedAt,
              getUpdatedAt(latestDataRef.current)
            )) {
              void pullLatestData(true);
            }
          }
        } catch (e) {}
      }
    }, 3000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      clearInterval(pollInterval);
      if (pushRetryTimeoutRef.current) {
        clearTimeout(pushRetryTimeoutRef.current);
        pushRetryTimeoutRef.current = null;
      }
    };
  }, [cancelPushRetry]);

  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      broadcastChannelRef.current =
        new BroadcastChannel(
          BROADCAST_CHANNEL_NAME
        );

      broadcastChannelRef.current.onmessage = event => {
        if (event.data?.type === "SYNC_DATA" && event.data.payload) {
          const { sub, data } = event.data.payload;
          const currentSub = getGoogleSub();
          if (
            typeof sub !== "string" ||
            !sub.trim() ||
            !currentSub ||
            !activeSubRef.current ||
            sub !== currentSub ||
            sub !== activeSubRef.current ||
            !data
          ) {
            return;
          }
          applyRemoteData(data as UnifiedFinanceData, "broadcast");
        }
        if (event.data?.type === "CONFLICT_RESOLVED" && event.data.payload) {
          const { sub, winningSnapshot, winningRevision } = event.data.payload;
          const currentSub = getGoogleSub();
          if (
            typeof sub !== "string" ||
            !sub.trim() ||
            !currentSub ||
            !activeSubRef.current ||
            sub !== currentSub ||
            sub !== activeSubRef.current
          ) {
            return;
          }
          if (
            !isValidFinanceData(winningSnapshot) ||
            !isValidUpdatedAt(winningSnapshot.updatedAt) ||
            !isValidRevision(winningRevision)
          ) {
            return;
          }

          const baseRevision = baseRevisionRef.current;
          const conflict = conflictStateRef.current;
          if (winningRevision < Math.max(baseRevision ?? 0, conflict?.cloudRevision ?? 0)) return;
          if (winningRevision > 0 && winningRevision === baseRevision && !conflict) return;

          const baseRevKey = getScopedKeyForSub("ft_sync_base_revision", currentSub);
          try {
            const storedRevision = baseRevKey ? localStorage.getItem(baseRevKey) : null;
            if (storedRevision !== null && Number(storedRevision) > winningRevision) return;
          } catch {}

          if (isPushingRef.current || isResolvingConflictRef.current) return;

          if (pendingRef.current || isDirtyRef.current) {
            if (!conflict || winningRevision > conflict.cloudRevision) {
              // This conflict belongs to this tab's pending edit, not to clean peers.
              const reconciliationConflict: SyncConflictState = {
                baseRevision: conflict ? conflict.baseRevision : baseRevision,
                localSnapshot: latestDataRef.current,
                cloudSnapshot: winningSnapshot,
                cloudRevision: winningRevision,
                detectedAt: Date.now()
              };
              conflictStateRef.current = reconciliationConflict;
              conflictOwnerSubRef.current = currentSub;
              setConflictState(reconciliationConflict);
              setConflictOwnerSub(currentSub);
              cancelPushRetry();
            }
            showToast(
              "⚠️ Another tab resolved a sync conflict, but this tab has newer local changes."
            );
            return;
          }

          const adopted = applyRemoteData(winningSnapshot, "broadcast", {
            allowOlderTimestamp: winningRevision > (baseRevision ?? 0),
            resolvingConflict: true,
            // Another writer may already have saved a newer draft to shared storage.
            preserveStoredData: Boolean(loadPendingSync(currentSub)),
          });
          if (!adopted) return;

          baseRevisionRef.current = winningRevision;
          try {
            if (baseRevKey) localStorage.setItem(baseRevKey, winningRevision.toString());
          } catch {}
          conflictStateRef.current = null;
          conflictOwnerSubRef.current = null;
          setConflictState(null);
          setConflictOwnerSub(null);
          setHasInitialSyncCompleted(true);
          clearResolvedConflict(currentSub, winningRevision);
        }
      };
    }

    const handleStorageChange = (
      e: StorageEvent
    ) => {
      const currentSub = getGoogleSub();
      if (!currentSub || currentSub !== activeSubRef.current) {
        return;
      }

      const conflictKey = getScopedKeyForSub("ft_sync_conflict", currentSub);
      if (conflictKey && e.key === conflictKey) {
        if (!e.newValue) {
           // A peer can remove the shared conflict key while this tab still
           // owns an unaccepted edit. Wait for an applicable resolution.
           if (pendingRef.current || isDirtyRef.current ||
               isPushingRef.current || isResolvingConflictRef.current) return;
           conflictStateRef.current = null;
           conflictOwnerSubRef.current = null;
           setConflictState(null);
           setConflictOwnerSub(null);
           setHasInitialSyncCompleted(true);
        } else {
           try {
             const parsed = JSON.parse(e.newValue);
             if (isValidConflictState(parsed) &&
                 parsed.cloudRevision >= Math.max(baseRevisionRef.current ?? 0, conflictStateRef.current?.cloudRevision ?? 0)) {
               conflictStateRef.current = parsed;
               conflictOwnerSubRef.current = currentSub;
               setConflictState(parsed);
               setConflictOwnerSub(currentSub);
             }
           } catch {}
        }
      }

      const scopedDataKey = getScopedDataKey(currentSub);
      if (
        scopedDataKey &&
        e.key === scopedDataKey &&
        e.newValue
      ) {
        try {
          const parsed =
            JSON.parse(e.newValue) as UnifiedFinanceData;

          if (getGoogleSub() !== currentSub || activeSubRef.current !== currentSub) {
            return;
          }

          applyRemoteData(
            parsed,
            "storage"
          );
        } catch (err) {
          console.warn(
            "Invalid localStorage sync data",
            err
          );
        }
      }
    };

    window.addEventListener(
      "storage",
      handleStorageChange
    );

    return () => {
      broadcastChannelRef.current?.close();

      window.removeEventListener(
        "storage",
        handleStorageChange
      );
    };
  }, [applyRemoteData, cancelPushRetry, showToast]);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      if (
        globalData === INITIAL_UNIFIED_DATA &&
        activeSubRef.current &&
        conflictStateRef.current &&
        conflictOwnerSubRef.current === activeSubRef.current
      ) {
        const fallbackSnapshot = conflictStateRef.current.localSnapshot;
        const updatedAt = getUpdatedAt(fallbackSnapshot);
        const recovered: UnifiedFinanceData = {
          ...fallbackSnapshot,
          updatedAt
        };
        if (recovered !== INITIAL_UNIFIED_DATA) {
          lastNonPersistedDataRef.current = recovered;
          lastHydratedDataRef.current = recovered;
          latestDataRef.current = recovered;
          setGlobalData(recovered);
        }
      }
      return;
    }

    if (isRemoteUpdate.current || globalData === lastNonPersistedDataRef.current) {
      isRemoteUpdate.current = false;
      return;
    }

    const currentSub = getGoogleSub();
    const scopedDataKey = getScopedDataKey(currentSub);
    if (!currentSub || !scopedDataKey || currentSub !== activeSubRef.current) {
      return;
    }

    try {
      window.localStorage.setItem(
        scopedDataKey,
        JSON.stringify(globalData)
      );
    } catch (e) {
      console.warn(
        "localStorage/broadcast persistence failed",
        e
      );
      showToast("⚠️ Device storage full: local changes may not be saved.");
    }

    try {
      broadcastChannelRef.current?.postMessage({
        type: "SYNC_DATA",
        payload: {
          sub: currentSub,
          data: globalData
        }
      });
    } catch (e) {
      console.warn(
        "localStorage/broadcast persistence failed",
        e
      );
    }
  }, [globalData, setGlobalData, showToast]);

  const currentTokenSub = getGoogleSub();
  const hasActiveConflict = Boolean(
    activeSub &&
    currentTokenSub === activeSub &&
    conflictState &&
    conflictOwnerSub === activeSub &&
    isValidConflictState(conflictState)
  );

  return {
    // Check refs at click time: a just-committed edit may precede the next render.
    canReloadSafely: () => Boolean(
      activeSubRef.current && getGoogleSub() === activeSubRef.current &&
      !isDirtyRef.current && !pendingRef.current && !isPushingRef.current &&
      !isResolvingConflictRef.current && !conflictStateRef.current
    ),
    commitDataChange,
    commitDataTransition,
    isSyncing,
    isOnline,
    syncNeedsSignIn,
    debugLog,
    setDebugLog,
    forceManualSync,
    pullLatestData,
    pushToCloud,
    promptPasscode,
    hasInitialSyncCompleted,
    hasActiveConflict,
    conflictState,
    resolveConflict,
    activeSub
  };
}
