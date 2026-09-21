import { BillViewModel } from "../../types/finance";

export type BillSortOption = "default" | "dueSoon" | "dueDate" | "amountDesc" | "amountAsc" | "nameAsc" | "unpaidFirst";

export function filterBills(bills: BillViewModel[], selectedFilter: string, searchQuery: string): BillViewModel[] {
  let result = selectedFilter === "All" ? bills : bills.filter(b => b.type === selectedFilter);
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    result = result.filter(b => b.name.toLowerCase().includes(q));
  }
  return result;
}

export function sortBills(bills: BillViewModel[], sortBy: BillSortOption): BillViewModel[] {
  const result = [...bills];
  switch (sortBy) {
    case "dueSoon":
      result.sort((a, b) => {
        const dayDelta = a.daysLeft - b.daysLeft;
        if (dayDelta !== 0) return dayDelta;
        return b.amount - a.amount;
      });
      break;
    case "dueDate":
      result.sort((a, b) => {
        const dayDelta = (parseInt(a.dueDay, 10) || 1) - (parseInt(b.dueDay, 10) || 1);
        if (dayDelta !== 0) return dayDelta;
        return a.name.localeCompare(b.name);
      });
      break;
    case "amountDesc":
      result.sort((a, b) => {
        const amountDelta = b.amount - a.amount;
        if (amountDelta !== 0) return amountDelta;
        return a.name.localeCompare(b.name);
      });
      break;
    case "amountAsc":
      result.sort((a, b) => {
        const amountDelta = a.amount - b.amount;
        if (amountDelta !== 0) return amountDelta;
        return a.name.localeCompare(b.name);
      });
      break;
    case "nameAsc":
      result.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "unpaidFirst":
      result.sort((a, b) => {
        const paidDelta = Number(a.paid) - Number(b.paid);
        if (paidDelta !== 0) return paidDelta;
        const dayDelta = (parseInt(a.dueDay, 10) || 1) - (parseInt(b.dueDay, 10) || 1);
        if (dayDelta !== 0) return dayDelta;
        return a.name.localeCompare(b.name);
      });
      break;
    case "default":
    default:
      break;
  }
  return result;
}

export function groupBillsByHalfMonth(bills: BillViewModel[]) {
  return {
    firstHalf: bills.filter(b => (parseInt(b.dueDay, 10) || 1) <= 15),
    secondHalf: bills.filter(b => (parseInt(b.dueDay, 10) || 1) > 15),
  };
}
