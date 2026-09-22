import React from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Settings, History, ArrowDownLeft, Calendar, Receipt } from "lucide-react";
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
  walletLabels?: Record<string, string>;
  formatDateTime: (dateStr: string) => string;
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
  walletLabels,
  formatDateTime,
}) => {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-400 ease-out">
      <div className="bg-surface-elevated/90 backdrop-blur-xl border border-inverse/[0.08] shadow-2xl rounded-3xl p-8 text-center flex flex-col items-center justify-center min-h-[30vh]">
        <h3 className="text-strong font-bold text-lg mb-4">Account</h3>
        <div className="w-full bg-surface-high border border-inverse/[0.06] rounded-2xl p-4 mb-4 flex flex-col items-center gap-3 shadow-md">
          {googleUser ? (
            <div className="flex flex-col items-center gap-2 w-full">
              {googleUser.picture && <img src={googleUser.picture} alt="Profile" className="w-12 h-12 rounded-full border border-strong shadow-md" />}
              <div className="text-sm font-bold text-strong">{googleUser.name}</div>
              <div className="text-[10px] text-muted mb-2">{googleUser.email}</div>
              <button onClick={onGoogleLogout} className="w-full bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/30 font-semibold py-2.5 rounded-xl text-xs transition">Sign Out</button>
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

      <div className="bg-surface-elevated/90 backdrop-blur-xl border border-inverse/[0.08] shadow-2xl rounded-3xl p-5 sm:p-8 animate-in fade-in duration-300">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-inverse/[0.06]">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-strong uppercase tracking-wider flex items-center gap-2"><History size={16} className="text-purple-400"/> Transaction History</h3>
            <button onClick={onOpenLedger} className="px-2.5 py-1 bg-inverse/[0.05] hover:bg-inverse/[0.12] rounded-lg text-[10px] uppercase font-bold tracking-wider transition border border-inverse/[0.05]">Manage Ledger</button>
          </div>
          <span className="text-xs text-faint font-mono">{allTransactions.length} records</span>
        </div>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {allTransactions.length === 0 ? (
            <div className="py-8 text-center text-faint text-xs italic">No history available.</div>
          ) : (
            allTransactions.map((tx: TransactionHistoryItem) => (
              <div key={tx.id} className="flex items-center justify-between p-3.5 rounded-xl bg-surface border border-inverse/[0.04] group hover:border-inverse/[0.08] transition">
                <div className="flex items-center gap-3.5 overflow-hidden flex-1">
                  <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${tx.type === 'inflow' ? 'transaction-inflow-icon' : tx.type === 'bill' ? 'transaction-bill-icon' : 'bg-fill border-strong text-muted'}`}>
                    {tx.type === 'inflow' ? <ArrowDownLeft size={15}/> : tx.type === 'bill' ? <Calendar size={15}/> : <Receipt size={15}/>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="privacy-blur text-[13px] font-semibold text-strong truncate">{tx.title}</div>
                    <div className="flex items-center gap-2 text-[10px] text-muted mt-1">
                      <span className="bg-fill-strong/80 px-1.5 py-0.5 rounded text-secondary font-medium truncate max-w-[90px]">{tx.category || tx.type}</span>
                      <span className="privacy-blur uppercase text-blue-400/90 font-bold tracking-wider truncate max-w-[80px]">{walletLabels?.[tx.wallet || ''] || tx.wallet}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0 ml-3">
                  <span className={`privacy-blur text-[13px] font-bold font-mono ${tx.amount > 0 ? "text-emerald-400" : "text-strong"}`}>
                    {tx.amount > 0 ? "+" : tx.amount < 0 ? "−" : ""}₱{Math.abs(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-faint font-medium mt-1 whitespace-nowrap">{formatDateTime(tx.date)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
