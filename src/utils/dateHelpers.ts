import { MONTH_LIST } from "../constants/config";

export function parseMonthKey(str: string): Date {
  if (!str) return new Date();
  const parts = str.split(" ");
  const mIndex = MONTH_LIST.indexOf(parts[0]);
  const y = parseInt(parts[1], 10) || new Date().getFullYear();
  return new Date(y, mIndex !== -1 ? mIndex : 0, 1);
}

export function parseDateKey(str: string): Date {
  const parts = str.split("-");

  if (parts.length !== 3) {
    return new Date(NaN);
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return new Date(NaN);
  }

  return new Date(year, month - 1, day);
}

export function getMonthKey(date: Date): string {
  return `${MONTH_LIST[date.getMonth()]} ${date.getFullYear()}`;
}

export function getAdjacentMonth(monthKey: string, offset: number): string {
  const d = parseMonthKey(monthKey);
  d.setMonth(d.getMonth() + offset);
  return getMonthKey(d);
}

export function getMonthRange(
  startMonth: string,
  endMonth: string,
  maxMonths = 120
): string[] {
  const start = parseMonthKey(startMonth);
  const end = parseMonthKey(endMonth);

  if (start > end || maxMonths <= 0) {
    return [];
  }

  const months: string[] = [];
  let current = startMonth;

  for (let i = 0; i < maxMonths && parseMonthKey(current) <= end; i++) {
    months.push(current);
    current = getAdjacentMonth(current, 1);
  }

  return months;
}

export function getDaysUntil(dueDay: string | number, targetMonthKey: string): number {
  const d = typeof dueDay === "string" ? parseInt(dueDay, 10) : dueDay;
  if (!d || isNaN(d)) return 999;

  const targetDate = parseMonthKey(targetMonthKey);
  const now = new Date();

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const actualDay = Math.min(d, lastDay);
  const dueDateMidnight = new Date(year, month, actualDay);

  const diffMs = dueDateMidnight.getTime() - todayMidnight.getTime();
  const msPerDay = 1000 * 60 * 60 * 24;

  const days = Math.round(diffMs / msPerDay);
  return Object.is(days, -0) ? 0 : days;
}

export function countPaydaysUntil(today: Date, dueDate: Date): number {
  if (dueDate < today) return 0;
  let count = 0;
  let year = today.getFullYear();
  let month = today.getMonth();
  const endYear = dueDate.getFullYear();
  const endMonth = dueDate.getMonth();

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const paydayDays = [15, Math.min(30, lastDay)];
    for (const day of paydayDays) {
      const payday = new Date(year, month, day);
      if (payday >= today && payday <= dueDate) count++;
    }
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return count;
}

export function formatDaysRemaining(days: number): { text: string; tone: "urgent" | "warning" | "normal" | "overdue" } {
  if (days === 999) return { text: "No due date", tone: "normal" };
  
  if (days < 0) {
    const abs = Math.abs(days);
    return {
      text: abs === 1 ? "1d overdue" : `${abs}d overdue`,
      tone: "overdue"
    };
  }
  if (days === 0) {
    return { text: "Due Today", tone: "urgent" };
  }
  if (days === 1) {
    return { text: "Due Tomorrow", tone: "warning" };
  }
  return {
    text: `${days}d left`,
    tone: days <= 3 ? "warning" : "normal"
  };
}

export const formatMonthYear = (date: Date): string => {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
};

export const getCurrentMonthYear = (): string => {
  return formatMonthYear(new Date());
};

export const isSameMonth = (
  date: Date,
  monthYear: string
): boolean => {
  return formatMonthYear(date) === monthYear;
};