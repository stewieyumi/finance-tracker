import { isValidTwiceMonthlySchedule, isValidDateKey } from "../utils/dateHelpers";
import {
  EditFormData,
  MonthLog,
  Receivable,
  UnifiedFinanceData
} from "../types/finance";
import { calculateNetSalary } from "../utils/financeHelpers";

export type ReceivableTransitionResult =
  | { ok: true; data: UnifiedFinanceData }
  | { ok: false; error: string; data: UnifiedFinanceData };

export type ReceivableTransitionCommitter = (
  transition: (prev: UnifiedFinanceData) => ReceivableTransitionResult
) => ReceivableTransitionResult;

export function hasReceivablePaymentHistory(
  logs: Record<string, MonthLog> | undefined,
  receivableId: string
): boolean {
  if (!logs) return false;
  return Object.values(logs).some(log => {
    const recCollected = log.recsCollected?.[receivableId];
    const settlements = log.receivableSettlements?.[receivableId];
    const paymentDate = log.paymentDates?.[receivableId];

    const hasCollected = !!recCollected && (recCollected.collected || Number(recCollected.amountReceived) > 0);
    const hasSettlements = !!settlements && settlements.length > 0;
    const hasPaymentDate = !!paymentDate;

    return hasCollected || hasSettlements || hasPaymentDate;
  });
}

export function applyReceivableEdit(
  prev: UnifiedFinanceData,
  editingId: string,
  editForm: EditFormData,
  inputAmount: number
): ReceivableTransitionResult {
  const existingItem = prev.library?.receivables?.find(item => item.id === editingId);
  if (!existingItem) {
    return { ok: false, error: "Inflow not found in library.", data: prev };
  }

  const currentFrequency = existingItem.frequency;
  const newFrequency = editForm.frequency ?? currentFrequency;
  const currentDate = existingItem.date || "";
  const newDate = editForm.date !== undefined ? String(editForm.date) : currentDate;

  const dateChanged = (currentFrequency === "By Date" || newFrequency === "By Date") && newDate !== currentDate;
  const frequencyChanged = newFrequency !== currentFrequency;

  const touchesScheduleOrFrequency =
    (currentFrequency === "By Date" && (dateChanged || frequencyChanged)) ||
    (currentFrequency !== "By Date" && newFrequency === "By Date") ||
    frequencyChanged;

  if (touchesScheduleOrFrequency && hasReceivablePaymentHistory(prev.logs, editingId)) {
    return {
      ok: false,
      error: "This inflow has recorded receipt history. Its scheduled date or frequency cannot be changed.",
      data: prev
    };
  }

  const updatedReceivables = prev.library.receivables.map(item => {
    if (item.id !== editingId) return item;

    const updatedReceivable: Receivable = {
      id: item.id,
      name: String(editForm.name ?? item.name).trim(),
      amount: inputAmount,
      grossAmount:
        editForm.grossAmount !== undefined
          ? Math.max(0, Number(editForm.grossAmount) || 0)
          : item.grossAmount,
      deductions:
        editForm.deductions !== undefined
          ? editForm.deductions.map(d => ({ ...d }))
          : item.deductions
          ? item.deductions.map(d => ({ ...d }))
          : undefined,
      category: editForm.category ?? item.category,
      wallet: editForm.wallet ?? item.wallet,
      frequency: newFrequency,
      biMonthlyDays:
        newFrequency === "Bi-monthly"
          ? (editForm.biMonthlyDays ?? item.biMonthlyDays ?? [15, 30])
          : [],
      monthlyDay:
        newFrequency === "Monthly"
          ? (editForm.monthlyDay ?? item.monthlyDay ?? 15)
          : undefined,
      date:
        newFrequency === "By Date"
          ? String(editForm.date ?? item.date ?? "")
          : "",
      startMonth:
        newFrequency === "By Date"
          ? ""
          : String(editForm.startMonth ?? item.startMonth ?? "")
    };

    return updatedReceivable;
  });

  return {
    ok: true,
    data: {
      ...prev,
      library: {
        ...prev.library,
        receivables: updatedReceivables
      },
      updatedAt: Date.now()
    }
  };
}

interface UseReceivableSaveActionsParams {
  commitReceivableTransition: ReceivableTransitionCommitter;
  editingId: string | null;
  editForm: EditFormData;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  showToast: (message: string) => void;
}

export function useReceivableSaveActions({
  commitReceivableTransition,
  editingId,
  editForm,
  setEditingId,
  showToast
}: UseReceivableSaveActionsParams) {
  const saveReceivableEdit = (): boolean => {
    if (!editingId) return false;
    if (editForm.frequency === "Bi-monthly" && editForm.biMonthlyDays &&
      !isValidTwiceMonthlySchedule(editForm.biMonthlyDays)) {
      showToast("Choose two different days for a twice-monthly inflow.");
      return false;
    }
    if (editForm.frequency === "By Date" && !isValidDateKey(editForm.date)) {
      showToast("Please enter a valid date for this inflow.");
      return false;
    }

    const inputAmount =
      editForm.grossAmount !== undefined
        ? calculateNetSalary(editForm.grossAmount, editForm.deductions)
        : parseFloat(String(editForm.amount ?? ""));

    if (!Number.isFinite(inputAmount) || inputAmount <= 0) {
      showToast("Amount must be greater than 0");
      return false;
    }

    const outcome = commitReceivableTransition(prev => applyReceivableEdit(prev, editingId, editForm, inputAmount));

    if (!outcome.ok) {
      showToast(outcome.error);
      return false;
    }

    setEditingId(null);
    showToast("Default saved in Library");
    return true;
  };

  return {
    saveReceivableEdit
  };
}