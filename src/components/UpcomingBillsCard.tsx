import { useId, type ReactNode } from "react";
import { formatPHP } from "../utils/currency";

export interface UpcomingBill {
  id: string;
  month: string;
  name: string;
  daysLeft: number;
  amount: number;
}

export function UpcomingBillsCard({ bills: upcomingBills, action, onSelect }: { bills: UpcomingBill[]; action?: ReactNode; onSelect: (bill: UpcomingBill) => void }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-subtle bg-surface p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-sm font-semibold text-primary">Next 7 Days</h2>
        {action}
      </div>
      {upcomingBills.length ? (
        <ul className="divide-y divide-subtle rounded-xl bg-surface-low">
          {upcomingBills.slice(0, 5).map(bill => (
            <li key={`${bill.id}-${bill.month}`}>
              <button type="button" onClick={() => onSelect(bill)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-xs hover:bg-surface-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
                <span className="min-w-0">
                  <span className="privacy-blur block truncate font-medium text-primary">{bill.name}</span>
                  <span className="mt-0.5 block text-muted">{bill.daysLeft === 0 ? "Due today" : `Due in ${bill.daysLeft}d`}</span>
                </span>
                <span className="privacy-blur shrink-0 font-mono text-strong">{formatPHP(bill.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="px-1 py-2 text-xs text-muted">No unpaid commitments due in the next 7 days.</p>}
    </section>
  );
}
