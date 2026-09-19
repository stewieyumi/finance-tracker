import React, { useState, useEffect } from "react";
import { X, Calendar } from "lucide-react";
import { MONTH_LIST, YEAR_LIST } from "../constants/config";

interface DateJumpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJump: (monthKey: string) => void;
  selectedMonth: string;
}

export const DateJumpModal: React.FC<DateJumpModalProps> = ({ isOpen, onClose, onJump, selectedMonth }) => {
  const [jumpMonth, setJumpMonth] = useState("August");
  const [jumpYear, setJumpYear] = useState("2026");

  useEffect(() => {
    if (isOpen && selectedMonth) {
      const parts = selectedMonth.split(" ");
      if (parts.length === 2) {
        setJumpMonth(parts[0]);
        setJumpYear(parts[1]);
      }
    }
  }, [isOpen, selectedMonth]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onJump(`${jumpMonth} ${jumpYear}`);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="bg-surface border border-inverse/[0.08] rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-inverse/[0.05]">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-strong">Jump to Specific Date</h3>
          </div>
          <button onClick={onClose} className="text-faint hover:text-strong p-1 rounded-lg transition">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase font-semibold text-muted block mb-1.5">Month</label>
            <select
              value={jumpMonth}
              onChange={(e) => setJumpMonth(e.target.value)}
              className="bg-surface-input border border-inverse/[0.08] rounded-xl px-3 py-2 text-xs text-strong outline-none w-full cursor-pointer"
            >
              {MONTH_LIST.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-semibold text-muted block mb-1.5">Year</label>
            <select
              value={jumpYear}
              onChange={(e) => setJumpYear(e.target.value)}
              className="bg-surface-input border border-inverse/[0.08] rounded-xl px-3 py-2 text-xs text-strong font-mono outline-none w-full cursor-pointer"
            >
              {YEAR_LIST.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={() => {
            const now = new Date();
            setJumpMonth(now.toLocaleString("default", { month: "long" }));
            setJumpYear(String(now.getFullYear()));
          }}
          className="w-full text-center text-[11px] text-blue-400 hover:text-blue-300 font-semibold py-1.5 transition"
        >
          Jump to Current Month
        </button>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className="w-1/2 bg-inverse/[0.04] hover:bg-inverse/[0.08] text-secondary text-xs font-semibold py-2 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="w-1/2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 rounded-xl transition shadow-lg shadow-blue-600/20"
          >
            Jump Now
          </button>
        </div>
      </div>
    </div>
  );
};
