import { useEffect, useState, useRef } from "react";
import { UnifiedFinanceData } from "../types/finance";
import { notifyAuthTokenRejected } from "./useCloudSync";
import { getFinanceAuth } from "../utils/financeAuth";
import { getDefaultExpenseWalletId } from "../utils/financeHelpers";

function recordScannerStatus(status: number | "invalid-response" | "network-error", atCapacity = false) {
  try {
    localStorage.removeItem("scanner_debug_log");
    localStorage.setItem("scanner_status", JSON.stringify({ status, atCapacity }));
  } catch {
    // Diagnostics are optional when browser storage is unavailable.
  }
}

interface ScanResult {
  merchant: string;
  amount: string;
  category: string;
  wallet: string;
  date: string;
}

interface UseExpenseScannerOptions {
  showToast: (msg: string) => void;
  globalData: Pick<UnifiedFinanceData, "settings" | "wallets">;
  onScanStart: () => void;
  onScanComplete: (result: ScanResult) => void;
}

interface UseExpenseScannerReturn {
  isScanning: boolean;
  failure: { message: string; canRetry: boolean } | null;
  retryScan: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
  stopScanning: () => void;
}

const getLocalToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function prepareReceipt(file: File, signal: AbortSignal) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unreadable receipt image"));
      image.src = objectUrl;
    });
    const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare receipt image");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const GENERIC_FAILURE = "Unable to scan this receipt. Try again or enter the details manually.";

export function useExpenseScanner({
  showToast,
  globalData,
  onScanStart,
  onScanComplete,
}: UseExpenseScannerOptions): UseExpenseScannerReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [failure, setFailure] = useState<UseExpenseScannerReturn["failure"]>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeScan = useRef<AbortController | null>(null);
  const retryPhoto = useRef<{ file: File; subject: string } | null>(null);

  useEffect(() => () => activeScan.current?.abort(), []);

  const stopScanning = () => {
    activeScan.current?.abort();
    activeScan.current = null;
    retryPhoto.current = null;
    setIsScanning(false);
    setFailure(null);
  };

  const scanReceipt = async (file: File, expectedSubject?: string) => {
    if (activeScan.current) return;
    const { key: token, sub: subject, headers } = getFinanceAuth();
    if (expectedSubject && subject !== expectedSubject) {
      retryPhoto.current = null;
      setFailure({ message: "Choose the receipt again for this account.", canRetry: false });
      return;
    }
    if (!token || !subject) {
      retryPhoto.current = null;
      onScanStart();
      setFailure({ message: "Sign in with Google to scan receipts, or enter the details manually.", canRetry: false });
      return;
    }

    const controller = new AbortController();
    activeScan.current = controller;
    retryPhoto.current = { file, subject };
    setFailure(null);
    setIsScanning(true);
    onScanStart();

    const isCurrent = () => {
      const auth = getFinanceAuth();
      return !controller.signal.aborted && auth.key === token && auth.sub === subject;
    };
    const fail = (message: string, canRetry = true) => {
      if (!canRetry) retryPhoto.current = null;
      setFailure({ message, canRetry });
    };

    try {
      const image = await prepareReceipt(file, controller.signal);
      if (!isCurrent()) return;
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ image }),
        signal: controller.signal,
      });
      const body = await res.text();
      if (!isCurrent()) return;

      let data;
      try { data = JSON.parse(body); } catch { data = null; }
      const errorText = String(data?.error ?? "").toLowerCase();
      const unavailable = data?.code === "SCANNER_UNAVAILABLE" ||
        (res.status === 500 && /gemini_api_key is missing|missing api key|api key is missing/.test(errorText));
      const authUnavailable = data?.code === "AUTH_UNAVAILABLE";
      const atCapacity = !unavailable && !authUnavailable && (data?.code === "AI_CAPACITY" || res.status === 429 || res.status === 503 ||
        /high demand|overloaded|resource exhausted/.test(errorText));
      recordScannerStatus(data && typeof data === "object" ? res.status : "invalid-response", atCapacity);

      if (res.status === 401 || data?.code === "AUTH_EXPIRED" || data?.code === "AUTH_REQUIRED") {
        notifyAuthTokenRejected(token);
        fail("Reconnect your Google account after closing this form, then reopen Log Expense to retry this photo.");
        return;
      }
      if (authUnavailable) {
        fail("Unable to verify your sign-in right now. Retry this photo shortly or enter the details manually.");
        return;
      }
      if (unavailable) {
        fail("The scanner is unavailable. Enter the details manually.", false);
        return;
      }
      if (data?.code === "AI_TIMEOUT") {
        fail("Scanning took too long. Retry this photo or enter the details manually.");
        return;
      }
      if (atCapacity) {
        fail("The scanner is busy. Retry this photo in a moment or enter the details manually.");
        return;
      }
      if (!res.ok || !data?.parsed || data.error || data.success === false || typeof data.parsed !== "object") {
        fail(GENERIC_FAILURE);
        return;
      }

      const parsed = data.parsed;
      const amountText = typeof parsed.amount === "string" ? parsed.amount.trim().replace(/^(?:PHP|₱)\s*/i, "") : "";
      const amount = typeof parsed.amount === "number" ? parsed.amount
        : /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(amountText) ? Number(amountText.replaceAll(",", "")) : NaN;
      const merchant = typeof parsed.merchant === "string" ? parsed.merchant.trim() : "";
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000 ||
          Math.abs(Math.round(amount * 100) - amount * 100) > 0.000001) {
        fail(merchant
          ? "Could not detect a valid expense amount. Enter the details manually."
          : "Could not detect receipt details. Enter the details manually.");
        return;
      }

      const categories = ["Food & Dining", "Transport", "Utilities", "Laundry & Home", "Shopping", "Other"];
      const category = categories.includes(parsed.category) ? parsed.category : "Other";
      const dateValue = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? new Date(parsed.date + "T00:00:00Z") : null;
      const date = dateValue && Number.isFinite(dateValue.getTime()) && dateValue.toISOString().slice(0, 10) === parsed.date
        ? parsed.date : getLocalToday();
      retryPhoto.current = null;
      onScanComplete({
        merchant, amount: String(amount), category, date,
        wallet: getDefaultExpenseWalletId(category, globalData.settings, globalData.wallets),
      });
      showToast("✨ Receipt scanned successfully! Review and tap Save & Deduct.");
    } catch {
      if (isCurrent()) {
        recordScannerStatus("network-error");
        fail(GENERIC_FAILURE);
      }
    } finally {
      if (activeScan.current === controller) {
        activeScan.current = null;
        if (!controller.signal.aborted) {
          setIsScanning(false);
          const auth = getFinanceAuth();
          if (auth.sub !== subject) {
            retryPhoto.current = null;
          } else if (auth.key !== token && retryPhoto.current) {
            fail("Your sign-in changed during the scan. Retry this photo or enter the details manually.");
          }
        }
      }
    }
  };

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (file) void scanReceipt(file);
  };

  const retryScan = () => {
    const photo = retryPhoto.current;
    if (photo) void scanReceipt(photo.file, photo.subject);
  };

  return { isScanning, failure, retryScan, fileInputRef, handleCapture, stopScanning };
}
