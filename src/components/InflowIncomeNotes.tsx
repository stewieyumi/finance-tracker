import type { InflowIncomeReport } from "../utils/inflowIncome";
import { formatPHP } from "../utils/currency";

export function InflowIncomeNotes({ report }: { report: InflowIncomeReport }) {
  if (!report.historicalDateUnverified && !report.needsReview) return null;
  return <div className="mt-2 space-y-1 text-xs text-muted font-normal">
    {report.historicalDateUnverified > 0 && <p>
      <span className="block">Historical income — date unverified</span>
      <span className="font-mono privacy-blur">{formatPHP(report.historicalDateUnverified)}</span>
      <span className="block text-[10px]">Saved under this period; excluded from actual income.</span>
    </p>}
    {report.needsReview && <p className="text-warning">Income history needs review. Some entries could not be included.</p>}
  </div>;
}
