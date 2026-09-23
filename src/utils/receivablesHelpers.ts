import { ReceivableCategory, ReceivableViewModel } from "../types/finance";

export const filterReceivables = (
  receivables: ReceivableViewModel[],
  selectedFilter: "All" | ReceivableCategory
) => {
  if (selectedFilter === "All") return receivables;
  return receivables.filter((receivable) => receivable.category === selectedFilter);
};

export const groupReceivablesByHalf = (
  receivables: ReceivableViewModel[]
): { firstHalf: ReceivableViewModel[]; secondHalf: ReceivableViewModel[] } => {
  const firstHalf: ReceivableViewModel[] = [];
  const secondHalf: ReceivableViewModel[] = [];

  for (const rec of receivables) {
    if (rec.frequency === "Bi-monthly") {
      const days =
        rec.biMonthlyDays && rec.biMonthlyDays.length > 0
          ? rec.biMonthlyDays
          : [15, 30];
      const hasFirstHalf = days.some((d) => d <= 15);
      const hasSecondHalf = days.some((d) => d > 15);

      if (hasFirstHalf) firstHalf.push(rec);
      if (hasSecondHalf) secondHalf.push(rec);
    } else if (rec.frequency === "Monthly") {
      const day = rec.monthlyDay ?? 15;
      if (day <= 15) {
        firstHalf.push(rec);
      } else {
        secondHalf.push(rec);
      }
    } else if (rec.frequency === "By Date") {
      if (!rec.date) continue;
      const parts = rec.date.split("-");
      if (parts.length !== 3) continue;
      const day = parseInt(parts[2], 10);
      if (!Number.isInteger(day) || day < 1 || day > 31) continue;
      if (day <= 15) {
        firstHalf.push(rec);
      } else {
        secondHalf.push(rec);
      }
    }
  }

  return { firstHalf, secondHalf };
};
