import { GoalProgressEntry, GoalStatus, PersonalGoal } from '../types';

export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const ry = dt.getFullYear();
  const rm = String(dt.getMonth() + 1).padStart(2, '0');
  const rd = String(dt.getDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

/**
 * Single shared progress percentage utility (capped at 100%).
 * All Goal progress calculations across cards, charts, and dashboards must use this function.
 */
export function calculateGoalProgressPct(currentValue: number, targetValue: number): number {
  if (!Number.isFinite(targetValue) || targetValue <= 0) return 0;
  if (!Number.isFinite(currentValue) || currentValue <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((currentValue / targetValue) * 100)));
}

/**
 * Auto-derives "Delayed" when a non-completed, non-archived goal is past its targetDate.
 */
export function getEffectiveGoalStatus(goal: PersonalGoal, todayStr = getTodayDateString()): GoalStatus {
  if (goal.status === 'Completed' || goal.status === 'Archived') {
    return goal.status;
  }
  if (goal.targetDate && goal.targetDate < todayStr) {
    return 'Delayed';
  }
  return goal.status;
}

/**
 * Builds a weekly progress chart series strictly from real goalProgressHistory records.
 */
export function buildWeeklyProgressSeries(
  entries: GoalProgressEntry[],
  goalsMap: Map<string, PersonalGoal>,
  weeksCount = 6
): { week: string; updates: number; avgProgressPct: number }[] {
  if (entries.length === 0) return [];

  const today = getTodayDateString();
  const buckets: { start: string; end: string; label: string; entries: GoalProgressEntry[] }[] = [];

  for (let i = weeksCount - 1; i >= 0; i--) {
    const end = addDaysToDateString(today, -i * 7);
    const start = addDaysToDateString(end, -6);
    const [, m, d] = end.split('-');
    buckets.push({
      start,
      end,
      label: `${d}/${m}`,
      entries: [],
    });
  }

  for (const entry of entries) {
    for (const bucket of buckets) {
      if (entry.date >= bucket.start && entry.date <= bucket.end) {
        bucket.entries.push(entry);
        break;
      }
    }
  }

  return buckets.map((bucket) => {
    if (bucket.entries.length === 0) {
      return { week: bucket.label, updates: 0, avgProgressPct: 0 };
    }
    let totalPct = 0;
    let counted = 0;
    for (const item of bucket.entries) {
      const goal = goalsMap.get(item.goalId);
      if (goal) {
        totalPct += calculateGoalProgressPct(item.value, goal.targetValue);
        counted++;
      }
    }
    return {
      week: bucket.label,
      updates: bucket.entries.length,
      avgProgressPct: counted > 0 ? Math.round(totalPct / counted) : 0,
    };
  });
}
