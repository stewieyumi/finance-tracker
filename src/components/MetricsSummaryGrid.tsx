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
    { title: "Fund Progress", val: `${fundProgressPercent}%`, color: "text-strong" },
    { title: "Pending Inflows", val: `₱${totalPendingReceivables.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: "text-amber-300" },
    { title: `${selectedMonth.split(" ")[0]} Income`, val: `₱${monthIncomeCollected.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: "text-emerald-400" }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      {cards.map((c, i) => (
        <div key={i} className="bg-surface-elevated/90 backdrop-blur-xl border border-inverse/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] rounded-xl p-3.5 text-center transition-all hover:border-inverse/[0.12]">
          <div className="text-xs font-medium text-muted">{c.title}</div>
          <div className={`text-sm sm:text-base font-semibold font-mono tracking-tight mt-1 ${c.color}`}>{c.val}</div>
        </div>
      ))}
    </div>
  );
});
