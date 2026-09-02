import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { WalletState } from '../types/finance';

const WALLET_CONFIG = [
  { id: 'maribank', label: 'MariBank (Japan/ADB)', color: 'text-blue-400' },
  { id: 'gcash', label: 'GCash', color: 'text-zinc-100' },
  { id: 'maya', label: 'Maya', color: 'text-zinc-100' },
  { id: 'gotyme', label: 'GoTyme', color: 'text-zinc-100' },
  { id: 'bpi', label: 'BPI', color: 'text-zinc-100' },
  { id: 'cash', label: 'Cash On-Hand', color: 'text-zinc-100' }
];

interface WalletRowProps {
  wallet: typeof WALLET_CONFIG[number];
  currentBalance: number;
  onCommit: (key: string, val: number) => void;
  onIncrement: (key: string, addAmount: number) => void;
}

const WalletRow: React.FC<WalletRowProps> = ({
  wallet,
  currentBalance,
  onCommit,
  onIncrement
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localText, setLocalText] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setLocalText(
        Number(currentBalance || 0).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
      );
    }
  }, [currentBalance]);

  const handleFocus = () => {
    setIsEditing(true);
    setLocalText(currentBalance === 0 ? "" : String(currentBalance));
  };

  const handleBlur = () => {
    setIsEditing(false);
    const cleaned = localText.replace(/,/g, "").trim();
    const parsed = cleaned === "" ? 0 : parseFloat(cleaned);
    const validAmount = isNaN(parsed) ? (currentBalance || 0) : parsed;
    onCommit(wallet.id, validAmount);
    setLocalText(
      validAmount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    );
  };

  return (
    <div className="flex items-center justify-between bg-[#0b0b0e] border border-white/[0.05] rounded-xl px-3.5 py-2.5 hover:border-white/[0.12] transition-colors">
      <label htmlFor={`wallet-${wallet.id}`} className="text-xs text-zinc-300 font-medium cursor-pointer select-none">
        {wallet.label}
      </label>
      
      <div className="flex items-center gap-1.5">
        {showQuickAdd ? (
          <div className="flex items-center gap-1 bg-[#1a1a22] rounded-lg p-1 border border-white/[0.08]">
            {[100, 500, 1000].map(amt => (
              <button
                key={amt}
                type="button"
                aria-label={`Add ${amt}`}
                onClick={() => { onIncrement(wallet.id, amt); setShowQuickAdd(false); }}
                className="text-[10px] font-mono font-medium bg-white/10 hover:bg-white/20 active:scale-95 px-2 py-0.5 rounded text-zinc-200 transition"
              >
                +{amt}
              </button>
            ))}
            <button
              type="button"
              aria-label="Close quick add"
              onClick={() => setShowQuickAdd(false)}
              className="text-[10px] text-zinc-500 hover:text-white px-1.5 py-0.5"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Quick add funds to ${wallet.label}`}
            onClick={() => setShowQuickAdd(true)}
            className="w-6 h-6 rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-zinc-300 transition"
            title="Quick Add"
          >
            <Plus size={12} />
          </button>
        )}

        <div className="flex items-center bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1 focus-within:border-blue-500 transition-colors">
          <span className="text-xs text-zinc-500 font-mono mr-1">₱</span>
          <input
            id={`wallet-${wallet.id}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className={`bg-transparent text-right font-bold font-mono tracking-tight ${wallet.color} text-xs focus:outline-none w-28`}
          />
        </div>
      </div>
    </div>
  );
};

interface WalletGridProps {
  wallets: WalletState;
  onCommit: (key: string, value: number) => void;
  onIncrement: (key: string, addAmount: number) => void;
}

export const WalletGrid: React.FC<WalletGridProps> = React.memo(({
  wallets,
  onCommit,
  onIncrement
}) => {
  return (
    <div className="bg-[#121217]/90 backdrop-blur-xl border border-white/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] rounded-2xl p-4 sm:p-5">
      <div className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase mb-3">
        Liquid Cash Wallets
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {WALLET_CONFIG.map(wallet => (
          <WalletRow
            key={wallet.id}
            wallet={wallet}
            currentBalance={wallets[wallet.id] ?? 0}
            onCommit={onCommit}
            onIncrement={onIncrement}
          />
        ))}
      </div>
    </div>
  );
});
