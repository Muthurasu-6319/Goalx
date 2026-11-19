import { Habit, HabitLog } from '../types';
import { addDaysToDateString, getTodayDateString } from './goalUtils';

export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function diffDaysBetween(olderDateStr: string, newerDateStr: string): number {
  const older = parseDateString(olderDateStr);
  const newer = parseDateString(newerDateStr);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((newer.getTime() - older.getTime()) / msPerDay);
}

/**
 * Only allow toggling today or up to 7 days back (never future dates or >7 days ago).
 */
export function isWithinEditableWindow(dateStr: string, todayStr = getTodayDateString()): boolean {
  const diff = diffDaysBetween(dateStr, todayStr);
  return diff >= 0 && diff <= 7;
}

export function isHabitScheduledOnDate(habit: Habit, dateStr: string): boolean {
  if (habit.scheduleType === 'daily') return true;
  if (habit.scheduleType === 'weekdays') {
    const dayOfWeek = parseDateString(dateStr).getDay();
    return habit.weekdays.includes(dayOfWeek);
  }
  // weekly_target habits can be logged any day
  return true;
}

function getMondayWeekKey(dateStr: string): string {
  const dt = parseDateString(dateStr);
  const day = dt.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + offset);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface HabitStreakResult {
  currentStreak: number;
  longestStreak: number;
}

/**
 * Schedule-aware streak calculation:
 * - For 'daily' and 'weekdays': evaluates scheduled days backwards/forwards. Skipped non-scheduled
 *   days never break the streak. If today is scheduled and not yet logged, streak stays alive
 *   from the previous scheduled day until today ends.
 * - For 'weekly_target': counts consecutive completed days or weekly target adherence without
 *   breaking on off-days while weekly target is met.
 */
export function calculateHabitStreaks(
  habit: Habit,
  logs: HabitLog[],
  todayStr = getTodayDateString()
): HabitStreakResult {
  const completedSet = new Set(logs.filter((l) => l.completed).map((l) => l.date));
  if (completedSet.size === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  const sortedDates = Array.from(completedSet).sort();
  const earliestDate = sortedDates[0];
  const lookbackStart = addDaysToDateString(todayStr, -365);
  const startDate = earliestDate > lookbackStart ? earliestDate : lookbackStart;

  if (habit.scheduleType === 'weekly_target') {
    // Group completions by week (Monday start)
    const weekCounts = new Map<string, number>();
    for (const d of completedSet) {
      const wk = getMondayWeekKey(d);
      weekCounts.set(wk, (weekCounts.get(wk) ?? 0) + 1);
    }

    const currentWeekKey = getMondayWeekKey(todayStr);
    const allWeeks: string[] = [];
    let cursor = getMondayWeekKey(startDate);
    while (cursor <= currentWeekKey) {
      allWeeks.push(cursor);
      cursor = addDaysToDateString(cursor, 7);
    }

    let longestWeeks = 0;
    let runningWeeks = 0;
    for (let i = 0; i < allWeeks.length; i++) {
      const wk = allWeeks[i];
      const count = weekCounts.get(wk) ?? 0;
      const isCurrentWeek = wk === currentWeekKey;
      if (count >= habit.weeklyTarget) {
        runningWeeks += 1;
        if (runningWeeks > longestWeeks) longestWeeks = runningWeeks;
      } else if (!isCurrentWeek) {
        runningWeeks = 0;
      }
    }

    // Current streak in weeks (or days if current week in progress)
    let currentWeekStreak = 0;
    for (let i = allWeeks.length - 1; i >= 0; i--) {
      const wk = allWeeks[i];
      const count = weekCounts.get(wk) ?? 0;
      if (count >= habit.weeklyTarget) {
        currentWeekStreak += 1;
      } else if (wk === currentWeekKey) {
        continue; // Current week still open
      } else {
        break;
      }
    }

    // Also reflect total completions in longest if >= 1 week streak
    return {
      currentStreak: currentWeekStreak,
      longestStreak: longestWeeks,
    };
  }

  // Daily or specific weekdays
  let longest = 0;
  let running = 0;
  let cursor = startDate;
  while (cursor <= todayStr) {
    if (isHabitScheduledOnDate(habit, cursor)) {
      if (completedSet.has(cursor)) {
        running += 1;
        if (running > longest) longest = running;
      } else if (cursor !== todayStr) {
        running = 0;
      }
    }
    cursor = addDaysToDateString(cursor, 1);
  }

  let current = 0;
  let backCursor = todayStr;
  while (backCursor >= startDate) {
    if (isHabitScheduledOnDate(habit, backCursor)) {
      if (completedSet.has(backCursor)) {
        current += 1;
      } else if (backCursor === todayStr) {
        // Today isn't over yet; don't break streak from yesterday
      } else {
        break;
      }
    }
    backCursor = addDaysToDateString(backCursor, -1);
  }

  return { currentStreak: current, longestStreak: Math.max(longest, current) };
}

export function calculateHabitCompletionStats(
  habit: Habit,
  logs: HabitLog[],
  todayStr = getTodayDateString()
): { weeklyPct: number; monthlyPct: number } {
  const completedSet = new Set(logs.filter((l) => l.completed).map((l) => l.date));

  const calcWindowPct = (daysBack: number) => {
    let scheduled = 0;
    let done = 0;
    for (let i = 0; i < daysBack; i++) {
      const dateStr = addDaysToDateString(todayStr, -i);
      if (habit.scheduleType === 'weekly_target') {
        if (completedSet.has(dateStr)) done++;
      } else if (isHabitScheduledOnDate(habit, dateStr)) {
        scheduled++;
        if (completedSet.has(dateStr)) done++;
      }
    }
    if (habit.scheduleType === 'weekly_target') {
      const expected = daysBack === 7 ? habit.weeklyTarget : Math.round((habit.weeklyTarget / 7) * daysBack);
      if (expected <= 0) return 0;
      return Math.min(100, Math.round((done / expected) * 100));
    }
    if (scheduled === 0) return 0;
    return Math.min(100, Math.round((done / scheduled) * 100));
  };

  return {
    weeklyPct: calcWindowPct(7),
    monthlyPct: calcWindowPct(30),
  };
}

export function buildHeatmapDays(
  logs: HabitLog[],
  habitsCount: number,
  daysCount = 84,
  todayStr = getTodayDateString()
): { date: string; count: number; ratio: number }[] {
  const countByDate = new Map<string, number>();
  for (const log of logs) {
    if (log.completed) {
      countByDate.set(log.date, (countByDate.get(log.date) ?? 0) + 1);
    }
  }

  const result: { date: string; count: number; ratio: number }[] = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const date = addDaysToDateString(todayStr, -i);
    const count = countByDate.get(date) ?? 0;
    const ratio = habitsCount > 0 ? Math.min(1, count / habitsCount) : 0;
    result.push({ date, count, ratio });
  }
  return result;
}
