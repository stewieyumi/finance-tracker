import { useState, useRef } from "react";
import { UnifiedFinanceData } from "../types/finance";
import { getLocalPasscode } from "./useCloudSync";
import { getDefaultExpenseWalletId } from "../utils/financeHelpers";

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
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
  stopScanning: () => void;
}

const getLocalToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function useExpenseScanner({
  showToast,
  globalData,
  onScanStart,
  onScanComplete,
}: UseExpenseScannerOptions): UseExpenseScannerReturn {
  const [isScanning, setIsScanning] = useState(false);
  const stopScanning = () => setIsScanning(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Guard against duplicate / concurrent scans
    if (isScanning) return;

    const file = e.target.files?.[0];
    if (!file) return;

    const token = getLocalPasscode();
    if (!token) {
      showToast("⚠️ Sign-in required: Please sign in with Google to use the AI Scanner.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsScanning(true);
    onScanStart();

    try {
      const img = new Image();
      img.onload = async () => {
        // Compress massive iPhone photos down to max 1000px and 70% JPEG quality
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width = Math.round((width * MAX_HEIGHT) / height); height = MAX_HEIGHT; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL("image/jpeg", 0.7);

        try {
          const res = await fetch("/api/scan", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ image: base64 })
          });
          
          const textResponse = await res.text();
          let data;
          try {
            data = JSON.parse(textResponse);
          } catch (e) {
            localStorage.setItem('scanner_debug_log', JSON.stringify({ error: 'Failed to parse server response as JSON', raw: textResponse }));
            showToast("Unable to read scanner response. Please enter details manually.");
            return;
          }

          localStorage.setItem('scanner_debug_log', JSON.stringify(data));
          
          if (!res.ok || data.error) {
            const errorText = String(data.error || "").toLowerCase();
            const isAuthExpired =
              res.status === 401 ||
              data.code === "AUTH_EXPIRED";

            const isMissingApiKey =
              res.status === 500 &&
              (errorText.includes("gemini_api_key is missing") ||
               errorText.includes("missing api key") ||
               errorText.includes("api key is missing"));

            const isOverloaded =
              data.code === "AI_CAPACITY" ||
              errorText.includes("high demand") ||
              errorText.includes("overloaded") ||
              errorText.includes("resource exhausted") ||
              res.status === 429 ||
              res.status === 503;

            if (isAuthExpired) {
              window.dispatchEvent(new Event("auth-expired"));
              showToast("🔄 Session expired. Refreshing sign-in...");
            } else if (isMissingApiKey) {
              showToast("⚠️ AI Scanner is not configured on the server (missing Gemini API key). Please enter details manually.");
            } else if (isOverloaded) {
              showToast("Gemini AI is currently at capacity. Please enter this receipt manually.");
            } else {
              showToast("Unable to scan this receipt. Please try again or enter the details manually.");
            }

            return;
          }

          if (data.success === false || !data.parsed || typeof data.parsed !== "object") {
            showToast("Unable to scan this receipt. Please try again or enter the details manually.");
            return;
          }

          const parsed = data.parsed;
          const rawAmount = parsed.amount;
          const numAmount = typeof rawAmount === "number"
            ? rawAmount
            : parseFloat(String(rawAmount || "").replace(/[^0-9.-]+/g, ""));

          const isValidAmount =
            !isNaN(numAmount) &&
            Number.isFinite(numAmount) &&
            numAmount > 0 &&
            numAmount <= 10_000_000;

          const merchant = typeof parsed.merchant === "string" ? parsed.merchant.trim() : "";

          // Reject incomplete or invalid scan data
          if (!isValidAmount && !merchant) {
            showToast("⚠️ Could not detect receipt details. Please enter details manually.");
            return;
          }

          if (!isValidAmount) {
            showToast("⚠️ Could not detect a valid expense amount. Please enter details manually.");
            return;
          }

          const validCategories = ["Food & Dining", "Transport", "Utilities", "Laundry & Home", "Shopping", "Other"];
          const scannedCategory = validCategories.includes(parsed.category) ? parsed.category : "Other";

          const isValidDate =
            typeof parsed.date === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) &&
            !isNaN(Date.parse(parsed.date));
          const scannedDate = isValidDate ? parsed.date : getLocalToday();

          onScanComplete({
            merchant,
            amount: String(numAmount),
            category: scannedCategory,
            wallet: getDefaultExpenseWalletId(scannedCategory, globalData.settings, globalData.wallets),
            date: scannedDate
          });
          
          showToast("✨ Receipt scanned successfully! Review and tap Save & Deduct.");
        } catch (err: any) {
          localStorage.setItem('scanner_debug_log', JSON.stringify({ error: 'Network error', message: err.message }));
          showToast("Unable to scan this receipt. Please try again or enter the details manually.");
        } finally {
          setIsScanning(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      img.src = URL.createObjectURL(file);
    } catch (err) {
      showToast("Unable to scan this receipt. Please try again or enter the details manually.");
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return { isScanning, fileInputRef, handleCapture, stopScanning };
}
