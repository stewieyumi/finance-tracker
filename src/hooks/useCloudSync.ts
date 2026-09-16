import { useState, useEffect, useRef, useCallback } from "react";
import { UnifiedFinanceData } from "../types/finance";

const PASSCODE_STORAGE_KEY = "ft_sync_passcode";
const DATA_STORAGE_KEY = "ft_master_data_v1";
const BROADCAST_CHANNEL_NAME = "ft_sync_channel";

export function getLocalPasscode(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(PASSCODE_STORAGE_KEY) || "";
}

export function setLocalPasscode(code: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PASSCODE_STORAGE_KEY, code.trim());
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

  const isFirstMount = useRef(true);
  const isRemoteUpdate = useRef(false);
  const isDirtyRef = useRef(false);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const latestDataRef = useRef(globalData);

  latestDataRef.current = globalData;

  const promptPasscode = useCallback((): string | null => {
    const current = getLocalPasscode();

    const entered = null as any;

    if (entered !== null) {
      setLocalPasscode(entered);
      return (entered as any)?.trim();
    }

    return null;
  }, []);

  const applyRemoteData = useCallback(
    (
      incomingData: UnifiedFinanceData,
      source: "cloud" | "broadcast" | "storage"
    ): boolean => {
      if (!incomingData || typeof incomingData !== "object") {
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

      /*
       * Never allow an older/equal external state to replace
       * the current local state.
       *
       * This protects against:
       * - stale browser tabs
       * - stale localStorage events
       * - delayed cloud responses
       * - duplicate sync events
       */
      if (incomingUpdatedAt <= currentUpdatedAt) {
        setDebugLog(
          `↩️ ${source.toUpperCase()} DATA IGNORED: local copy is newer or equal.`
        );
        return false;
      }

      isRemoteUpdate.current = true;
      isDirtyRef.current = false;

      latestDataRef.current = incomingData;
      setGlobalData(incomingData);

      try {
        localStorage.setItem(
          DATA_STORAGE_KEY,
          JSON.stringify(incomingData)
        );
      } catch (e) {
        console.warn("localStorage sync error", e);
      }

      return true;
    },
    [setGlobalData]
  );

  const pushToCloud = async (
    dataToSave: UnifiedFinanceData,
    retryCount = 0
  ): Promise<boolean> => {
    if (!navigator.onLine) {
      setIsOnline(false);
      return false;
    }

    let token = getLocalPasscode();

    if (!token && retryCount === 0) {
      const prompted = promptPasscode();

      if (prompted) {
        token = prompted;
      }
    }

    try {
      setIsSyncing(true);

      /*
       * IMPORTANT:
       * Do not create a new updatedAt timestamp here.
       *
       * updatedAt represents when the financial data actually changed.
       * Keeping that timestamp unchanged allows the server to reject
       * stale-device writes.
       */
      const payload: UnifiedFinanceData = {
        ...dataToSave
      };

      const payloadUpdatedAt = getUpdatedAt(payload);

      const res = await fetch("/api/sync", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-sync-passcode": token
        },
        body: JSON.stringify(payload),
        keepalive: true
      });

      if (res.ok) {
        setIsOnline(true);

        const result = await res.json().catch(() => null);

        if (result?.accepted === false) {
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

          return true;
        }

        /*
         * Only clear dirty state when the data we just pushed is
         * still the latest local version.
         *
         * A newer local edit may have happened while fetch() was
         * in progress.
         */
        if (
          getUpdatedAt(latestDataRef.current) <= payloadUpdatedAt
        ) {
          isDirtyRef.current = false;
        } else {
          isDirtyRef.current = true;
        }

        setDebugLog(
          `✓ PUSH SUCCESS (${res.status}): Saved at ${new Date().toLocaleTimeString()}`
        );

        return true;
      }

      if (res.status === 401) {
        setDebugLog(
          "❌ AUTH ERROR (401): Invalid passcode or token."
        );

        if (token.startsWith("eyJ")) {
          window.dispatchEvent(new Event("auth-expired"));
          return false;
        }

        if (retryCount === 0) {
          showToast(
            "⚠️ Invalid sync passcode. Please enter a valid key."
          );

          const prompted = promptPasscode();

          if (prompted) {
            return await pushToCloud(
              dataToSave,
              retryCount + 1
            );
          }
        } else {
          showToast("❌ Sync unauthorized.");
        }

        return false;
      }

      if (res.status === 409) {
        const result = await res.json().catch(() => null);

        setDebugLog(
          "⚠️ SYNC CONFLICT: Cloud has newer data."
        );

        if (result?.data) {
          const applied = applyRemoteData(
            result.data as UnifiedFinanceData,
            "cloud"
          );

          if (applied) {
            showToast(
              "☁️ Cloud had newer data — latest version loaded"
            );
          }
        }

        return true;
      }

      setDebugLog(`❌ PUSH FAILED (${res.status})`);
      return false;
    } catch (err: any) {
      setIsOnline(false);
      setDebugLog(
        `❌ NETWORK FAILED: ${err?.message || "Unknown error"}`
      );
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Commit a real data mutation:
   * local React state -> local persistence/broadcast effect -> cloud push.
   *
   * This intentionally does NOT run for form typing or arbitrary renders.
   */
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

      const nextData: UnifiedFinanceData = {
        ...nextRaw,
        updatedAt: Date.now()
      };

      latestDataRef.current = nextData;
      isDirtyRef.current = true;

      // The mutation is already committed locally. Push this exact snapshot
      // instead of waiting for a globalData debounce effect.
      setGlobalData(nextData);
      void pushToCloud(nextData);
    },
    [pushToCloud, setGlobalData]
  );

  const pullLatestData = async (
    silent = false,
    retryCount = 0
  ) => {
    if (!navigator.onLine) {
      setIsOnline(false);

      if (!silent) {
        showToast("⚠️ Offline: Cannot pull from cloud");
      }

      return;
    }

    const activeEl = document.activeElement;

    const isUserTyping =
      activeEl &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.tagName === "SELECT");

    if (silent && (isDirtyRef.current || isUserTyping)) {
      return;
    }

    let token = getLocalPasscode();

    if (!token && !silent && retryCount === 0) {
      const prompted = promptPasscode();

      if (prompted) {
        token = prompted;
      }
    }

    try {
      if (!silent) {
        setIsSyncing(true);
      }

      const res = await fetch("/api/sync", {
        method: "GET",
        headers: {
          "x-sync-passcode": token
        }
      });

      if (res.status === 401) {
        setDebugLog(
          "❌ AUTH ERROR (401): Invalid passcode or token on pull."
        );

        if (token.startsWith("eyJ")) {
          window.dispatchEvent(new Event("auth-expired"));
          return;
        }

        if (!silent && retryCount === 0) {
          const prompted = promptPasscode();

          if (prompted) {
            return await pullLatestData(
              silent,
              retryCount + 1
            );
          }
        }

        return;
      }

      if (!res.ok) {
        throw new Error(
          `Server returned status ${res.status}`
        );
      }

      const cloudResponse = await res.json();

      const record: UnifiedFinanceData =
        cloudResponse?.record || cloudResponse;

      if (record) {
        if (!isValidUpdatedAt(record.updatedAt)) {
          setDebugLog(
            "⚠️ PULL IGNORED: Cloud data has no valid updatedAt."
          );
          return;
        }

        const applied = applyRemoteData(
          record,
          "cloud"
        );

        setIsOnline(true);

        if (!applied) {
          if (!silent) {
            showToast(
              "↩️ Local data is already newer than cloud"
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
      if (!silent) {
        setIsSyncing(false);
      }
    }
  };

  const forceManualSync = async () => {
    const snapshot = latestDataRef.current;
    const success = await pushToCloud(snapshot);

    if (success) {
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

      // If an explicit committed mutation happened while offline,
      // retry that pending mutation when connectivity returns.
      if (isDirtyRef.current) {
        void pushToCloud(latestDataRef.current);
      } else {
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

    // One initial read is useful for cross-device changes made while
    // this app was closed. This is no longer a 15-second polling loop.
    void pullLatestData(true);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void pullLatestData(true);
      }
    };

    window.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      broadcastChannelRef.current =
        new BroadcastChannel(
          BROADCAST_CHANNEL_NAME
        );

      broadcastChannelRef.current.onmessage = event => {
        if (
          event.data?.type === "SYNC_DATA" &&
          event.data.payload
        ) {
          const incomingData =
            event.data.payload as UnifiedFinanceData;

          applyRemoteData(
            incomingData,
            "broadcast"
          );
        }
      };
    }

    const handleStorageChange = (
      e: StorageEvent
    ) => {
      if (
        e.key === DATA_STORAGE_KEY &&
        e.newValue
      ) {
        try {
          const parsed =
            JSON.parse(e.newValue) as UnifiedFinanceData;

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
  }, [applyRemoteData]);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }

    try {
      localStorage.setItem(
        DATA_STORAGE_KEY,
        JSON.stringify(globalData)
      );

      broadcastChannelRef.current?.postMessage({
        type: "SYNC_DATA",
        payload: globalData
      });
    } catch (e) {
      console.warn(
        "localStorage/broadcast persistence failed",
        e
      );
    }
  }, [globalData]);

  return {
    commitDataChange,
    isSyncing,
    isOnline,
    debugLog,
    setDebugLog,
    forceManualSync,
    pullLatestData,
    pushToCloud,
    promptPasscode
  };
}
