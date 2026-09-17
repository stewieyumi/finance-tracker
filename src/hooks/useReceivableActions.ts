import { Receivable, ReceivableCategory, ReceivableFrequency, ReceivableViewModel, UnifiedFinanceData } from "../types/finance";
import { generateId } from "../utils/idHelpers";
import { roundMoney } from "../utils/currency";

interface UseReceivableActionsParams {
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  selectedMonth: string;
  showToast: (message: string) => void;
}

export function useReceivableActions({ globalData, setGlobalData, selectedMonth, showToast }: UseReceivableActionsParams) {
  
  const addReceivable = (receivable: { name: string; amount: number; category: ReceivableCategory; frequency: ReceivableFrequency; biMonthlyDays?: number[]; monthlyDay?: number; date?: string; wallet?: string; }) => {
    setGlobalData(prev => {
      const newReceivable: Receivable = {
        id: generateId("r"),
        name: receivable.name.trim(),
        amount: receivable.amount,
        category: receivable.category || "Other",
        frequency: receivable.frequency,
        wallet: receivable.wallet,
        biMonthlyDays: receivable.frequency === "Bi-monthly" ? receivable.biMonthlyDays || [15, 30] : [],
        monthlyDay: receivable.frequency === "Monthly" ? receivable.monthlyDay || 15 : undefined,
        date: receivable.frequency === "By Date" ? receivable.date || "" : "",
        startMonth: receivable.frequency === "By Date" ? "" : selectedMonth
      };
      return { ...prev, library: { ...prev.library, receivables: [...prev.library.receivables, newReceivable] }, updatedAt: Date.now() };
    });
    showToast(`Added ${receivable.name}`);
  };

  const toggleReceivableStatus = (receivable: ReceivableViewModel) => {
    const targetMonth = receivable.targetMonthForDue || selectedMonth;
    const receivableAmount = Math.max(0, parseFloat(String(receivable.amount)) || 0);
    
    const targetWallet = receivable.wallet || globalData.settings?.defaultWallet || "main";

    setGlobalData(prev => {
      const monthLog = prev.logs?.[targetMonth] || { billsPaid: [], recsCollected: {} };
      const currentRecord = monthLog.recsCollected?.[receivable.id] || { amountReceived: 0, collected: false };
      const currentAmount = Math.max(0, parseFloat(String(currentRecord.amountReceived)) || 0);

      let newAmountReceived = 0;
      let newCollected = false;

      if (receivableAmount === 0) {
        // Zero-amount logic: manually toggle boolean completion
        newAmountReceived = 0;
        newCollected = !currentRecord.collected;
      } else {
        // Amount logic: If ANY payment exists (partial or full), clicking toggles it to 0 (Pending) and refunds.
        // If it is 0 (Pending), clicking sets it to full amount (Completed).
        const hasAnyPayment = currentAmount > 0;
        if (hasAnyPayment) {
          newAmountReceived = 0;
          newCollected = false;
        } else {
          newAmountReceived = receivableAmount;
          newCollected = true;
        }
      }
      
      const amountDelta = roundMoney(newAmountReceived - currentAmount);
      const nextWallets = { ...prev.wallets };
      if (nextWallets[targetWallet] !== undefined) {
        nextWallets[targetWallet] = roundMoney(Math.max(0, nextWallets[targetWallet] + amountDelta));
      }

      const today = new Date(); 
      const todayStr = today.toISOString();

      const nextPaymentDates = { ...(monthLog.paymentDates || {}) };
      if (newCollected || newAmountReceived > 0) {
        nextPaymentDates[receivable.id] = todayStr;
      } else {
        // Clean up the timestamp if returning to Pending
        delete nextPaymentDates[receivable.id];
      }

      return {
        ...prev,
        wallets: nextWallets,
        logs: { 
          ...prev.logs, 
          [targetMonth]: { 
            ...monthLog, 
            paymentDates: nextPaymentDates, 
            recsCollected: { ...(monthLog.recsCollected || {}), [receivable.id]: { amountReceived: newAmountReceived, collected: newCollected } } 
          } 
        },
        updatedAt: Date.now()
      };
    });
  };

  const addPayment = (receivable: ReceivableViewModel, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const targetMonth = receivable.targetMonthForDue || selectedMonth;
    const receivableAmount = Math.max(0, parseFloat(String(receivable.amount)) || 0);
    
    const targetWallet = receivable.wallet || globalData.settings?.defaultWallet || "main";

    setGlobalData(prev => {
      const monthLog = prev.logs?.[targetMonth] || { billsPaid: [], recsCollected: {} };
      const currentRecord = monthLog.recsCollected?.[receivable.id] || { amountReceived: 0, collected: false };
      const currentAmount = Math.max(0, parseFloat(String(currentRecord.amountReceived)) || 0);

      const newAmount = Math.min(currentAmount + amount, receivableAmount);
      const amountDelta = roundMoney(newAmount - currentAmount);
      
      const nextWallets = { ...prev.wallets };
      if (nextWallets[targetWallet] !== undefined) {
        nextWallets[targetWallet] = roundMoney(nextWallets[targetWallet] + amountDelta);
      }

      const today = new Date(); 
      const todayStr = today.toISOString();

      return {
        ...prev,
        wallets: nextWallets,
        logs: { 
          ...prev.logs, 
          [targetMonth]: { 
            ...monthLog, 
            paymentDates: { ...(monthLog.paymentDates || {}), [receivable.id]: todayStr }, 
            recsCollected: { ...(monthLog.recsCollected || {}), [receivable.id]: { amountReceived: newAmount, collected: newAmount >= receivableAmount } } 
          } 
        },
        updatedAt: Date.now()
      };
    });
    showToast(`Added ₱${amount.toLocaleString()} to ${targetWallet}`);
  };

  const deleteReceivable = (id: string) => {
    if (!confirm("Delete this receivable from your library?")) return;
    setGlobalData(prev => ({ ...prev, library: { ...prev.library, receivables: prev.library.receivables.filter(r => r.id !== id) }, updatedAt: Date.now() }));
    showToast("Receivable deleted");
  };

  return { addReceivable, toggleReceivableStatus, addPayment, deleteReceivable };
}
