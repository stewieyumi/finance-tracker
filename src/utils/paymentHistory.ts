export interface PaymentHistoryAction {
  label: "Undo" | "Redo";
  paymentId: string;
  description: string;
  onClick: () => void;
}

export interface PaymentHistory {
  owner: string | null;
  undo: PaymentHistoryAction[];
  redo: PaymentHistoryAction[];
}

export function recordPaymentAction(history: PaymentHistory, owner: string, action: PaymentHistoryAction): PaymentHistory {
  const undo = history.owner === owner ? history.undo : [];
  const redo = history.owner === owner ? history.redo : [];

  if (action.label === "Redo") {
    if (undo.at(-1)?.paymentId !== action.paymentId) return history;
    return { owner, undo: undo.slice(0, -1), redo: [...redo, action] };
  }

  if (redo.at(-1)?.paymentId === action.paymentId) {
    return { owner, undo: [...undo, action], redo: redo.slice(0, -1) };
  }

  return { owner, undo: [...undo, action], redo: [] };
}
