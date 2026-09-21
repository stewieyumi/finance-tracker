import { ReceivableCategory, ReceivableViewModel } from "../types/finance";

export const filterReceivables = (
  receivables: ReceivableViewModel[],
  selectedFilter: "All" | ReceivableCategory
) => {
  if (selectedFilter === "All") return receivables;
  return receivables.filter((receivable) => receivable.category === selectedFilter);
};
