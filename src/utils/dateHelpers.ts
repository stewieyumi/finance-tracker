import { MONTH_LIST } from "../constants/config";

export function parseMonthKey(str: string): Date {
  if (!str) return new Date();
  const parts = str.split(" ");
  const mIndex = MONTH_LIST.indexOf(parts[0]);
  const y = parseInt(parts[1], 10) || new Date().getFullYear();
  return new Date(y, mIndex !== -1 ? mIndex : 0, 1);
}

export function getMonthKey(date: Date): string {
  return `${MONTH_LIST[date.getMonth()]} ${date.getFullYear()}`;
}

export function getAdjacentMonth(monthKey: string, offset: number): string {
  const d = parseMonthKey(monthKey);
  d.setMonth(d.getMonth() + offset);
  return getMonthKey(d);
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
