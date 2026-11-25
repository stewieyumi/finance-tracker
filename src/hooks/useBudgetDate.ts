import { useEffect, useState } from 'react';
import { budgetDateKey } from '../utils/budgeting';

/** Refresh local-day guidance at midnight and when returning to the app. */
export function useBudgetDate() {
  const [today, setToday] = useState(budgetDateKey);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer); setToday(budgetDateKey());
      const next = new Date(); next.setHours(24, 0, 0, 50);
      timer = setTimeout(update, Math.max(50, next.getTime() - Date.now()));
    };
    update(); window.addEventListener('focus', update); window.addEventListener('pageshow', update); document.addEventListener('visibilitychange', update);
    return () => { clearTimeout(timer); window.removeEventListener('focus', update); window.removeEventListener('pageshow', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  return today;
}
