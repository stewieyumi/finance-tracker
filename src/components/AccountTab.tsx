import React from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Settings, History, ArrowDownLeft, Calendar, Receipt, ArrowRight } from "lucide-react";
import { TransactionHistoryItem } from "../types/finance";

interface AccountTabProps {
  googleUser: any;
  onGoogleLogout: () => void;
  onGoogleSuccess: (credentialResponse: any) => void;
  onGoogleError: () => void;
  onOpenSettings: () => void;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  allTransactions: TransactionHistoryItem[];
  onOpenLedger: () => void;
  onOpenTransactionHistory?: () => void;
  walletLabels?: Record<string, string>;
  formatDateTime: (dateStr: string, loggedAt?: string | number) => string;
}

export const AccountTab: React.FC<AccountTabProps> = ({
  googleUser,
  onGoogleLogout,
  onGoogleSuccess,
  onGoogleError,
  onOpenSettings,
  importInputRef,
  onImportFile,
  allTransactions,
  onOpenLedger,
  onOpenTransactionHistory,
  walletLabels,
  formatDateTime,
}) => {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-400 ease-out">
      <div className="flex flex-col items-center justify-center rounded-2xl bg-surface p-4 text-center sm:p-5">
        <div className="mb-4 flex w-full flex-col items-center gap-3 rounded-xl bg-surface-low p-4">
          {googleUser ? (
            <div className="flex flex-col items-center gap-2 w-full">
              {googleUser.picture && <img src={googleUser.picture} alt="Profile" className="w-12 h-12 rounded-full border border-strong shadow-md" />}
              <div className="text-sm font-bold text-strong">{googleUser.name}</div>
              <div className="text-[10px] text-muted mb-2">{googleUser.email}</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 w-full">
              <div className="text-xs text-muted text-center mb-2">Sign in to sync your data securely.</div>
              <GoogleLogin onSuccess={onGoogleSuccess} onError={onGoogleError} theme="filled_black" shape="pill" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 mx-auto w-full">
          <button onClick={onOpenSettings} className="w-full px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl transition shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"><Settings size={16} /> Open Settings</button>
        </div>
        <input ref={importInputRef} type="file" accept="application/json" onChange={onImportFile} className="hidden" />
      </div>

      <div className="rounded-2xl bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2.5 gap-x-3 mb-4 pb-4 border-b border-subtle">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-strong">
            <History size={16} className="text-purple-400" /> Transaction History
          </h3>
          <span className="text-xs text-faint font-mono sm:order-3 sm:ml-auto">
            {allTransactions.length} records
          </span>
          <div className="flex items-center gap-1.5 w-full sm:w-auto sm:order-2">
            <button
              onClick={onOpenLedger}
              className="min-h-10 rounded-lg bg-fill px-3 text-xs font-semibold text-primary transition hover:bg-fill-strong"
            >
              Manage Ledger
            </button>
            {onOpenTransactionHistory && (
              <button
                type="button"
                onClick={onOpenTransactionHistory}
                aria-label="View Full History"
                className="px-2.5 py-1 bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 rounded-lg text-[10px] uppercase font-bold tracking-wider transition border border-blue-500/25 flex items-center gap-1"
              >
                View All <ArrowRight size={10} />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto rounded-xl bg-surface-low divide-y divide-subtle">
          {allTransactions.length === 0 ? (
            <div className="py-8 text-center text-faint text-xs italic">No history available.</div>
          ) : (
            allTransactions.map((tx: TransactionHistoryItem) => (
              <div key={tx.id} className="flex flex-wrap items-center justify-between px-3 py-2.5 transition-colors hover:bg-surface-high">
                <div className="flex items-center gap-3.5 overflow-hidden flex-1">
                  <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${tx.type === 'inflow' ? 'transaction-inflow-icon' : tx.type === 'bill' ? 'transaction-bill-icon' : 'bg-fill border-strong text-muted'}`}>
                    {tx.type === 'inflow' ? <ArrowDownLeft size={15}/> : tx.type === 'bill' ? <Calendar size={15}/> : <Receipt size={15}/>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="privacy-blur text-[13px] font-semibold text-strong truncate">{tx.title}</div>
                    <div className="flex items-center gap-2 text-[10px] text-muted mt-1">
                      <span className="truncate text-muted">{tx.category || tx.type}</span>
                      <span className="privacy-blur truncate text-muted before:mr-1 before:content-['·']">{walletLabels?.[tx.wallet || ''] || tx.wallet}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0 ml-3">
                  <span className={`privacy-blur text-[13px] font-bold font-mono ${tx.amount > 0 ? "text-emerald-400" : "text-strong"}`}>
                    {tx.amount > 0 ? "+" : tx.amount < 0 ? "−" : ""}₱{Math.abs(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <span className="basis-full text-[10px] text-faint font-medium mt-1 text-right">{formatDateTime(tx.date, tx.loggedAt)}</span>
              </div>
            ))
          )}
          {onOpenTransactionHistory && allTransactions.length > 5 && (
            <button
              type="button"
              onClick={onOpenTransactionHistory}
              className="w-full mt-2 py-2.5 bg-surface hover:bg-inverse/[0.05] border border-subtle rounded-xl text-xs font-semibold text-primary transition flex items-center justify-center gap-1.5"
            >
              View Full Transaction History ({allTransactions.length}) <ArrowRight size={12} />
            </button>
          )}
        </div>
      </div>
      {googleUser && (
        <button type="button" onClick={onGoogleLogout} className="min-h-11 w-full rounded-xl border border-rose-500/30 bg-rose-600/20 py-2.5 text-xs font-semibold text-rose-400 transition hover:bg-rose-600/40">
          Sign Out
        </button>
      )}
    </div>
  );
};
