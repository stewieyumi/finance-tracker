import React from "react";

interface MetricsSummaryGridProps {
  totalLiquid: number;
  fundProgressPercent: string;
  totalPendingReceivables: number;
  monthIncomeCollected: number;
  selectedMonth: string;
}

export const MetricsSummaryGrid: React.FC<MetricsSummaryGridProps> = React.memo(({
  totalLiquid,
  fundProgressPercent,
  totalPendingReceivables,
  monthIncomeCollected,
  selectedMonth
}) => {
  const cards = [
    { title: "Liquid Cash", val: `₱${totalLiquid.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: "text-blue-400" },
    { title: "Fund Progress", val: `${fundProgressPercent}%`, color: "text-zinc-100" },
    { title: "Pending Inflows", val: `₱${totalPendingReceivables.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: "text-amber-300" },
    { title: `${selectedMonth.split(" ")[0]} Income`, val: `₱${monthIncomeCollected.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: "text-emerald-400" }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      {cards.map((c, i) => (
        <div key={i} className="bg-[#121217]/90 backdrop-blur-xl border border-white/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] rounded-xl p-3.5 text-center transition-all hover:border-white/[0.12]">
          <div className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">{c.title}</div>
          <div className={`text-sm sm:text-base font-bold font-mono tracking-tight mt-1 ${c.color}`}>{c.val}</div>
        </div>
      ))}
    </div>
  );
});
