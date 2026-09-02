import { useState, useEffect, useRef } from "react";
import { UnifiedFinanceData } from "../types/finance";

const AUTH_TOKEN = import.meta.env.VITE_APP_AUTH_KEY || "ft_secure_token_2026_prod";

export function useCloudSync(
  globalData: UnifiedFinanceData,
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>,
  showToast: (msg: string) => void
) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== "undefined" ? navigator.onLine : true);
  const [debugLog, setDebugLog] = useState<string>("");

  const isFirstMount = useRef(true);
  const isRemoteUpdate = useRef(false);
  const isDirtyRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const latestDataRef = useRef(globalData);
  latestDataRef.current = globalData;

  const pushToCloud = async (dataToSave: UnifiedFinanceData): Promise<boolean> => {
    if (!navigator.onLine) {
      setIsOnline(false);
      return false;
    }
    try {
      setIsSyncing(true);
      const payload: UnifiedFinanceData = {
        ...dataToSave,
        updatedAt: Date.now()
      };
      const res = await fetch("/api/sync", {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "x-app-auth": AUTH_TOKEN
        },
        body: JSON.stringify(payload),
        keepalive: true
      });
      if (res.ok) {
        isDirtyRef.current = false;
        setIsOnline(true);
        setDebugLog(`✓ PUSH SUCCESS (${res.status}): Saved at ${new Date().toLocaleTimeString()}`);
        return true;
      } else if (res.status === 401) {
        showToast("⚠️ Authentication failed with /api/sync");
        setDebugLog(`❌ AUTH ERROR (401): Check x-app-auth header`);
      } else {
        setDebugLog(`❌ PUSH FAILED (${res.status})`);
      }
      return false;
    } catch (err: any) {
      setIsOnline(false);
      setDebugLog(`❌ NETWORK FAILED: ${err.message}`);
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const pullLatestData = async (silent = false) => {
    if (!navigator.onLine) {
      setIsOnline(false);
      if (!silent) showToast("⚠️ Offline: Cannot pull from cloud");
      return;
    }

    const activeEl = document.activeElement;
    const isUserTyping = activeEl && (
      activeEl.tagName === "INPUT" || 
      activeEl.tagName === "TEXTAREA" || 
      activeEl.tagName === "SELECT"
    );
    
    if (silent && (isDirtyRef.current || isUserTyping)) {
      return;
    }

    try {
      if (!silent) setIsSyncing(true);
      const res = await fetch("/api/sync", {
        headers: { "x-app-auth": AUTH_TOKEN }
      });
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const cloudRecord: UnifiedFinanceData = await res.json();
      if (cloudRecord) {
        const record = (cloudRecord as any).record || cloudRecord;
        isRemoteUpdate.current = true;
        isDirtyRef.current = false;
        setGlobalData(record);
        try {
          localStorage.setItem("ft_master_data_v1", JSON.stringify(record));
        } catch (e) {}
        setIsOnline(true);
        setDebugLog(`✓ PULL SUCCESS (${res.status}): Synced ${record.library?.bills?.length || 0} bills`);
        if (!silent) showToast("☁️ Pulled latest cloud data");
      }
    } catch (err: any) {
      setDebugLog(`❌ PULL STATUS: ${err.message}`);
      if (!silent) showToast(`❌ Pull failed: ${err.message}`);
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  const forceManualSync = async () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const success = await pushToCloud(globalData);
    if (success) {
      showToast("☁️ Saved & synced to cloud");
    } else {
      showToast("❌ Cloud save failed - saved locally");
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast("📶 Back online - syncing...");
      if (isDirtyRef.current) {
        pushToCloud(latestDataRef.current);
      } else {
        pullLatestData(true);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      showToast("⚠️ Offline - changes saved locally");
    };

    const handleFocus = () => {
      pullLatestData(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);

    pullLatestData(true);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (isDirtyRef.current) {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          pushToCloud(latestDataRef.current);
        }
      } else if (document.visibilityState === "visible") {
        pullLatestData(true);
      }
    };

    const handlePageHide = () => {
      if (isDirtyRef.current) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        pushToCloud(latestDataRef.current);
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        pullLatestData(true);
      }
    }, 15000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      clearInterval(pollInterval);
    };
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      broadcastChannelRef.current = new BroadcastChannel("ft_sync_channel");
      broadcastChannelRef.current.onmessage = (event) => {
        if (event.data?.type === "SYNC_DATA" && event.data.payload) {
          isRemoteUpdate.current = true;
          setGlobalData(event.data.payload);
        }
      };
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "ft_master_data_v1" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          isRemoteUpdate.current = true;
          setGlobalData(parsed);
        } catch (err) {}
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => {
      broadcastChannelRef.current?.close();
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

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
      localStorage.setItem("ft_master_data_v1", JSON.stringify(globalData));
      broadcastChannelRef.current?.postMessage({ type: "SYNC_DATA", payload: globalData });
    } catch (e) {
      console.warn("localStorage write failed", e);
    }

    isDirtyRef.current = true;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      pushToCloud(globalData);
    }, 1200);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [globalData]);

  return {
    isSyncing,
    isOnline,
    debugLog,
    setDebugLog,
    forceManualSync,
    pullLatestData,
    pushToCloud
  };
}