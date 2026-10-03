import { useMemo, useState, useEffect } from "react";
import { AppNotification, UnifiedFinanceData } from "../types/finance";
import { getMonthKey, parseMonthKey, parseDateKey, getMonthRange } from "../utils/dateHelpers";

export function calculateDaysUntil(
  dueDay: string | number,
  targetMonthKey: string,
  today: Date = new Date()
): number {
  const d = typeof dueDay === "string" ? parseInt(dueDay, 10) : dueDay;
  if (!d || isNaN(d)) return 999;

  const targetDate = parseMonthKey(targetMonthKey);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
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

export const NOTIFICATION_GROUPING_THRESHOLD = 3;

export function deriveNotifications(
  globalData: UnifiedFinanceData,
  currentDate: Date = new Date()
): AppNotification[] {
  const derived: AppNotification[] = [];
  const dismissed = globalData.settings?.dismissedNotifications || {};
  const todayMidnight = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  const currentRealMonthKey = getMonthKey(currentDate);
  const currentRealMonthDate = parseMonthKey(currentRealMonthKey);

  // 1. Overdue & Upcoming Commitments (Bills)
  const overdueBills: AppNotification[] = [];
  const upcomingBills: AppNotification[] = [];

  (globalData.library?.bills || []).forEach(b => {
    const startMonth = b.startMonth || currentRealMonthKey;
    if (currentRealMonthDate < parseMonthKey(startMonth)) return;
    if (b.type === "Loan / Installment" && b.endMonth && currentRealMonthDate > parseMonthKey(b.endMonth)) return;

    const monthsToCheck = getMonthRange(startMonth, currentRealMonthKey);
    let oldestUnpaid: string | null = null;

    for (const m of monthsToCheck) {
      if (b.type === "Loan / Installment" && b.endMonth && parseMonthKey(m) > parseMonthKey(b.endMonth)) {
        break;
      }
      const isPaid = globalData.logs?.[m]?.billsPaid?.includes(b.id);
      if (!isPaid) {
        if (!oldestUnpaid) oldestUnpaid = m;
      }
    }

    if (!oldestUnpaid) return; // Paid up to date

    const targetMonthForDue = oldestUnpaid;
    const targetOverride = globalData.logs?.[targetMonthForDue]?.billOverrides?.[b.id];
    const effectiveAmount = targetOverride !== undefined && Number.isFinite(targetOverride) ? targetOverride : b.amount;
    const daysLeft = calculateDaysUntil(b.dueDay, targetMonthForDue, currentDate);

    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);
      overdueBills.push({
        id: `overdue_bill_${b.id}_${targetMonthForDue}`,
        type: "overdue_commitment",
        title: `Overdue: ${b.name}`,
        message: `${b.name} (₱${effectiveAmount.toLocaleString()}) was due ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} ago (${targetMonthForDue}).`,
        amount: effectiveAmount,
        actionRoute: "operations/bills",
        targetId: b.id,
      });
    } else if (daysLeft <= 3) {
      const dueText = daysLeft === 0 ? "due today" : daysLeft === 1 ? "due tomorrow" : `due in ${daysLeft} days`;
      upcomingBills.push({
        id: `upcoming_bill_${b.id}_${targetMonthForDue}`,
        type: "upcoming_commitment",
        title: `Upcoming: ${b.name}`,
        message: `${b.name} (₱${effectiveAmount.toLocaleString()}) is ${dueText}.`,
        amount: effectiveAmount,
        actionRoute: "operations/bills",
        targetId: b.id,
      });
    }
  });

  // Decision 7: Overdue commitments remain individually derived
  const activeOverdueBills = overdueBills.filter(n => !dismissed[n.id]);
  derived.push(...activeOverdueBills);

  // Decision 9: Avoid flooding for upcoming commitments
  // Filter dismissed INDIVIDUAL notifications before applying grouping
  const activeUpcomingBills = upcomingBills.filter(n => !dismissed[n.id]);
  if (activeUpcomingBills.length > NOTIFICATION_GROUPING_THRESHOLD) {
    const totalAmount = activeUpcomingBills.reduce((sum, item) => sum + (item.amount || 0), 0);
    derived.push({
      id: `upcoming_bills_group_${currentRealMonthKey}`,
      type: "upcoming_commitment",
      title: `${activeUpcomingBills.length} Upcoming Bills`,
      message: `You have ${activeUpcomingBills.length} bills due within 3 days totaling ₱${totalAmount.toLocaleString()}.`,
      amount: totalAmount,
      count: activeUpcomingBills.length,
      actionRoute: "operations/bills",
      isGroup: true,
      groupedIds: activeUpcomingBills.map(item => item.id),
    });
  } else {
    derived.push(...activeUpcomingBills);
  }

  // 2. Pending Receivables (Due within 3 days or already due)
  const pendingReceivables: AppNotification[] = [];

  (globalData.library?.receivables || []).forEach(r => {
    let targetMonthForDue = currentRealMonthKey;
    let daysLeft = 999;

    if (r.frequency === "Monthly" || r.frequency === "Bi-monthly") {
      const startMonth = r.startMonth || currentRealMonthKey;
      if (currentRealMonthDate < parseMonthKey(startMonth)) return;

      const monthsToCheck = getMonthRange(startMonth, currentRealMonthKey);
      const oldestUncollected = monthsToCheck.find(m => !globalData.logs?.[m]?.recsCollected?.[r.id]?.collected) || null;
      targetMonthForDue = oldestUncollected || currentRealMonthKey;

      const log = globalData.logs?.[targetMonthForDue]?.recsCollected?.[r.id];
      if (log?.collected) return;

      if (r.frequency === "Monthly") {
        const day = r.monthlyDay ?? 15;
        daysLeft = calculateDaysUntil(day, targetMonthForDue, currentDate);
      } else {
        const days = r.biMonthlyDays && r.biMonthlyDays.length > 0 ? r.biMonthlyDays : [15, 30];
        if (parseMonthKey(targetMonthForDue) < currentRealMonthDate) {
          daysLeft = calculateDaysUntil(Math.max(...days), targetMonthForDue, currentDate);
        } else {
          const diffs = days.map(d => calculateDaysUntil(d, targetMonthForDue, currentDate));
          const overdue = diffs.filter(d => d < 0);
          daysLeft = overdue.length > 0 ? Math.max(...overdue) : Math.min(...diffs);
        }
      }
    } else if (r.frequency === "By Date") {
      if (!r.date) return;

      const parsed = parseDateKey(r.date);
      if (isNaN(parsed.getTime())) return;

      targetMonthForDue = getMonthKey(parsed);
      const log = globalData.logs?.[targetMonthForDue]?.recsCollected?.[r.id];
      if (log?.collected) return;

      const dueMidnight = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      daysLeft = Math.round((dueMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Pending receivable threshold: due within 3 days or already due (daysLeft <= 3)
    if (daysLeft <= 3) {
      const dueText = daysLeft < 0 ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} overdue` : daysLeft === 0 ? "due today" : daysLeft === 1 ? "due tomorrow" : `due in ${daysLeft} days`;
      pendingReceivables.push({
        id: `pending_rec_${r.id}_${targetMonthForDue}`,
        type: "pending_receivable",
        title: `Pending: ${r.name}`,
        message: `${r.name} (₱${r.amount.toLocaleString()}) is ${dueText}.`,
        amount: r.amount,
        actionRoute: "operations/inflows",
        targetId: r.id,
      });
    }
  });

  // Avoid flooding for pending receivables
  // Filter dismissed INDIVIDUAL notifications before applying grouping
  const activePendingReceivables = pendingReceivables.filter(r => !dismissed[r.id]);
  if (activePendingReceivables.length > NOTIFICATION_GROUPING_THRESHOLD) {
    const totalAmount = activePendingReceivables.reduce((sum, item) => sum + (item.amount || 0), 0);
    derived.push({
      id: `pending_receivables_group_${currentRealMonthKey}`,
      type: "pending_receivable",
      title: `${activePendingReceivables.length} Pending Inflows`,
      message: `You have ${activePendingReceivables.length} receivables due now or within 3 days totaling ₱${totalAmount.toLocaleString()}.`,
      amount: totalAmount,
      count: activePendingReceivables.length,
      actionRoute: "operations/inflows",
      isGroup: true,
      groupedIds: activePendingReceivables.map(item => item.id),
    });
  } else {
    derived.push(...activePendingReceivables);
  }

  // 3. Log Reminder (after 3 full days without recent financial activity)
  let latestDateStr: string | null = null;
  const candidateDates: string[] = [];

  (globalData.library?.expenses || []).forEach(e => {
    if (e.date) candidateDates.push(e.date);
  });
  (globalData.library?.manualTransactions || []).forEach(mt => {
    if (mt.date) candidateDates.push(mt.date);
  });
  Object.values(globalData.logs || {}).forEach(log => {
    Object.values(log.paymentDates || {}).forEach(d => {
      if (d) candidateDates.push(d);
    });
  });
  (globalData.paydaySplitExecutions || []).forEach(ex => {
    if (typeof ex === "object" && ex.date) candidateDates.push(ex.date);
  });

  for (const d of candidateDates) {
    if (!latestDateStr || d > latestDateStr) {
      latestDateStr = d;
    }
  }

  if (latestDateStr) {
    const latestDate = parseDateKey(latestDateStr);
    if (!isNaN(latestDate.getTime())) {
      const latestMidnight = new Date(latestDate.getFullYear(), latestDate.getMonth(), latestDate.getDate());
      const diffDays = Math.floor((todayMidnight.getTime() - latestMidnight.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 3) {
        const todayStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;
        const reminderId = `log_reminder_${todayStr}`;
        if (!dismissed[reminderId]) {
          derived.push({
            id: reminderId,
            type: "log_reminder",
            title: "Reminder to Log Expenses",
            message: `No financial activity recorded in ${diffDays} days. Remember to log your daily expenses.`,
            actionRoute: "expenses",
          });
        }
      }
    }
  }

  // Prevent duplicate IDs
  const seen = new Set<string>();
  return derived.filter(n => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
}

export function useNotifications(
  globalData: UnifiedFinanceData,
  overrideDate?: Date
): AppNotification[] {
  const [currentCalendarDate, setCurrentCalendarDate] = useState(() => new Date());

  useEffect(() => {
    if (overrideDate) return;

    let timerId: ReturnType<typeof setTimeout>;

    const scheduleMidnightRefresh = () => {
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        0,
        100
      );
      const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());

      timerId = setTimeout(() => {
        setCurrentCalendarDate(new Date());
        scheduleMidnightRefresh();
      }, msUntilMidnight);
    };

    scheduleMidnightRefresh();

    const handleWakeOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      const now = new Date();
      setCurrentCalendarDate(prev => {
        if (
          now.getFullYear() !== prev.getFullYear() ||
          now.getMonth() !== prev.getMonth() ||
          now.getDate() !== prev.getDate()
        ) {
          return now;
        }
        return prev;
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleWakeOrFocus);
      document.addEventListener("visibilitychange", handleWakeOrFocus);
    }

    return () => {
      clearTimeout(timerId);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleWakeOrFocus);
        document.removeEventListener("visibilitychange", handleWakeOrFocus);
      }
    };
  }, [overrideDate]);

  const activeDate = overrideDate ?? currentCalendarDate;

  return useMemo(
    () => deriveNotifications(globalData, activeDate),
    [globalData, activeDate]
  );
}
