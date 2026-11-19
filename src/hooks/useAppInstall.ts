import { useCallback, useEffect, useRef, useState } from "react";

export const INSTALL_DISMISS_KEY = "ft_install_offer_until_v1";
const APP_MODE = "(display-mode: standalone), (display-mode: minimal-ui)";
type InstallChoice = { outcome: "accepted" | "dismissed" };
interface InstallEvent extends Event {
  prompt: () => Promise<InstallChoice | void>;
  userChoice?: Promise<InstallChoice>;
}

function inAppMode() {
  return Boolean(window.matchMedia?.(APP_MODE)?.matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone);
}
function dismissedRecently() {
  try {
    const until = Number(localStorage.getItem(INSTALL_DISMISS_KEY));
    return Number.isFinite(until) && until > Date.now();
  } catch { return false; }
}

export function useAppInstall() {
  const [added, setAdded] = useState(inAppMode);
  const [canPrompt, setCanPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(dismissedRecently);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const pending = useRef<InstallEvent | null>(null);
  const prompting = useRef(false);
  const observedInstall = useRef(false);
  const mounted = useRef(true);
  const dismissOffer = useCallback(() => {
    setDismissed(true);
    try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() + 7 * 86400000)); } catch { /* Optional device-only preference. */ }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const available = (event: Event) => {
      if (typeof (event as InstallEvent).prompt !== "function" || inAppMode() || observedInstall.current) return;
      event.preventDefault();
      pending.current = event as InstallEvent;
      setCanPrompt(true);
    };
    const installed = () => {
      observedInstall.current = true;
      pending.current = null;
      setCanPrompt(false);
      setAdded(true);
      setStatus("App added. Open Finance Tracker from your device’s app icons.");
      dismissOffer();
    };
    const mode = window.matchMedia?.(APP_MODE);
    const changed = () => setAdded(observedInstall.current || inAppMode());
    changed();
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", installed);
    mode?.addEventListener?.("change", changed);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", installed);
      mode?.removeEventListener?.("change", changed);
    };
  }, [dismissOffer]);

  const install = async () => {
    const event = pending.current;
    if (!event || prompting.current) return;
    // Consume before awaiting: browsers allow one prompt per event and require a user gesture.
    pending.current = null;
    prompting.current = true;
    setCanPrompt(false);
    setBusy(true);
    setStatus("");
    try {
      const result = await event.prompt();
      const choice = event.userChoice ? await event.userChoice : result;
      if (!mounted.current || observedInstall.current) return;
      if (choice?.outcome === "dismissed") {
        setStatus("You can add it later using the steps below.");
        dismissOffer();
      } else {
        setStatus("Finish adding Finance Tracker in your browser.");
      }
    } catch {
      if (mounted.current && !observedInstall.current) setStatus("The install popup couldn’t open. Use the steps below instead.");
    } finally {
      prompting.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { added, canPrompt, dismissed, busy, status, install, dismissOffer };
}
