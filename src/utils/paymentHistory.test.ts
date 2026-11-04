import { describe, expect, it, vi } from "vitest";
import { recordPaymentAction, type PaymentHistory, type PaymentHistoryAction } from "./paymentHistory";

const action = (paymentId: string, label: PaymentHistoryAction["label"]): PaymentHistoryAction =>
  ({ label, paymentId, description: paymentId, onClick: vi.fn() });

describe("payment history", () => {
  it("redoes multiple payments in order and clears redo when a new payment is made", () => {
    let history: PaymentHistory = { owner: null, undo: [], redo: [] };
    const bill = action("bill", "Undo");
    const receipt = action("receipt", "Undo");
    history = recordPaymentAction(history, "account", bill);
    history = recordPaymentAction(history, "account", receipt);
    const stale = recordPaymentAction(history, "account", action("bill", "Redo"));
    expect(stale).toBe(history);
    history = recordPaymentAction(history, "account", action("receipt", "Redo"));
    history = recordPaymentAction(history, "account", action("bill", "Redo"));
    expect(history.undo).toEqual([]);
    expect(history.redo.at(-1)?.paymentId).toBe("bill");
    history = recordPaymentAction(history, "account", bill);
    expect(history.undo).toEqual([bill]);
    expect(history.redo.at(-1)?.paymentId).toBe("receipt");
    const newPayment = action("new", "Undo");
    history = recordPaymentAction(history, "account", newPayment);
    expect(history.undo).toEqual([bill, newPayment]);
    expect(history.redo).toEqual([]);
    expect(recordPaymentAction(history, "another account", receipt)).toEqual({
      owner: "another account", undo: [receipt], redo: [],
    });
  });
});
