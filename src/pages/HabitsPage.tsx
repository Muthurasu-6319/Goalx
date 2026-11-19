import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Brain,
  Check,
  CheckSquare,
  Code2,
  Droplets,
  Dumbbell,
  Flame,
  History,
  Loader2,
  Moon,
  Pause,
  Pencil,
  Play,
  Plus,
  Sun,
  Trash2,
  BookOpen,
  X,
} from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { usePersonalData } from '../hooks/usePersonalData';
import { useToast } from '../hooks/useToast';
import { HABIT_ICONS, WEEKDAY_LABELS } from '../lib/constants';
import { addDaysToDateString, getTodayDateString } from '../lib/goalUtils';
import {
  buildHeatmapDays,
  calculateHabitCompletionStats,
  calculateHabitStreaks,
  isHabitScheduledOnDate,
  isWithinEditableWindow,
} from '../lib/habitUtils';
import { HabitFormValues, habitSchema } from '../lib/validators';
import { createHabit, deleteHabit, setHabitLogForDate, updateHabit } from '../services/habitsService';
import { Habit } from '../types';

const HABIT_ICON_COMPONENTS: Record<string, React.FC<{ className?: string }>> = {
  Flame,
  Dumbbell,
  BookOpen,
  Droplets,
  Brain,
  Code2,
  Sun,
  Moon,
};

export const HabitsPage: React.FC = () => {
  const { firebaseUser } = useAuth();
  const { loading, habits, habitLogs } = usePersonalData();
  const { showToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<'active' | 'paused' | 'all'>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [historyHabit, setHistoryHabit] = useState<Habit | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const todayStr = getTodayDateString();

  // Editable 7-day strip (today + 6 days back; up to 7 days back allowed in modal)
  const editableDays = useMemo(() => {
    const days: { date: string; shortDay: string; dayNum: string }[] = [];
    for (let i = 7; i >= 0; i--) {
      const date = addDaysToDateString(todayStr, -i);
      const [y, m, d] = date.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      days.push({
        date,
        shortDay: i === 0 ? 'Today' : WEEKDAY_LABELS[dt.getDay()],
        dayNum: String(d),
      });
    }
    return days;
  }, [todayStr]);

  const logsByHabit = useMemo(() => {
    const map = new Map<string, typeof habitLogs>();
    for (const log of habitLogs) {
      const list = map.get(log.habitId) ?? [];
      list.push(log);
      map.set(log.habitId, list);
    }
    return map;
  }, [habitLogs]);

  const logLookup = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const log of habitLogs) {
      map.set(`${log.habitId}_${log.date}`, log.completed);
    }
    return map;
  }, [habitLogs]);

  const summary = useMemo(() => {
    const activeHabits = habits.filter((h) => h.active);
    const scheduledToday = activeHabits.filter((h) => isHabitScheduledOnDate(h, todayStr));
    const completedToday = scheduledToday.filter(
      (h) => logLookup.get(`${h.id}_${todayStr}`) === true
    ).length;

    let bestCurrent = 0;
    let bestLongest = 0;
    for (const h of activeHabits) {
      const stats = calculateHabitStreaks(h, logsByHabit.get(h.id) ?? [], todayStr);
      if (stats.currentStreak > bestCurrent) bestCurrent = stats.currentStreak;
      if (stats.longestStreak > bestLongest) bestLongest = stats.longestStreak;
    }

    return {
      activeCount: activeHabits.length,
      todayPct:
        scheduledToday.length > 0 ? Math.round((completedToday / scheduledToday.length) * 100) : 0,
      completedToday,
      scheduledTodayCount: scheduledToday.length,
      bestCurrent,
      bestLongest,
    };
  }, [habits, logLookup, logsByHabit, todayStr]);

  const heatmapDays = useMemo(
    () => buildHeatmapDays(habitLogs, habits.filter((h) => h.active).length, 84, todayStr),
    [habitLogs, habits, todayStr]
  );

  const form = useForm<HabitFormValues>({
    resolver: zodResolver(habitSchema),
    defaultValues: {
      name: '',
      icon: 'Flame',
      scheduleType: 'daily',
      weekdays: [1, 2, 3, 4, 5],
      weeklyTarget: 5,
      reminderTime: '',
      active: true,
    },
  });

  const openCreate = () => {
    setEditingHabit(null);
    form.reset({
      name: '',
      icon: 'Flame',
      scheduleType: 'daily',
      weekdays: [1, 2, 3, 4, 5],
      weeklyTarget: 5,
      reminderTime: '',
      active: true,
    });
    setFormOpen(true);
  };

  const openEdit = (habit: Habit) => {
    setEditingHabit(habit);
    form.reset({
      name: habit.name,
      icon: habit.icon,
      scheduleType: habit.scheduleType,
      weekdays: habit.weekdays,
      weeklyTarget: habit.weeklyTarget,
      reminderTime: habit.reminderTime || '',
      active: habit.active,
    });
    setFormOpen(true);
  };

  const onSubmitHabit = async (values: HabitFormValues) => {
    if (!firebaseUser) return;
    if (values.scheduleType === 'weekdays' && values.weekdays.length === 0) {
      showToast('Select at least one weekday', { variant: 'error' });
      return;
    }
    try {
      if (editingHabit) {
        await updateHabit(editingHabit.id, values);
        showToast('Habit updated', { variant: 'success' });
      } else {
        await createHabit(firebaseUser.uid, values);
        showToast('Habit created', { description: values.name, variant: 'success' });
      }
      setFormOpen(false);
    } catch (err) {
      showToast('Could not save habit', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleToggleDay = async (habitId: string, date: string) => {
    if (!firebaseUser) return;
    if (!isWithinEditableWindow(date, todayStr)) {
      showToast('Edit window locked', {
        description: 'Past habit logs can only be edited up to 7 days back.',
        variant: 'warning',
      });
      return;
    }
    const key = `${habitId}_${date}`;
    const current = logLookup.get(key) === true;
    setTogglingKey(key);
    try {
      await setHabitLogForDate(firebaseUser.uid, habitId, date, !current);
    } catch (err) {
      showToast('Could not update check-in', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setTogglingKey(null);
    }
  };

  const handleTogglePause = async (habit: Habit) => {
    try {
      await updateHabit(habit.id, {
        name: habit.name,
        icon: habit.icon,
        scheduleType: habit.scheduleType,
        weekdays: habit.weekdays,
        weeklyTarget: habit.weeklyTarget,
        reminderTime: habit.reminderTime || '',
        active: !habit.active,
      });
      showToast(habit.active ? 'Habit paused' : 'Habit resumed', { variant: 'info' });
    } catch (err) {
      showToast('Failed to update habit', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleDeleteHabit = async (habitId: string) => {
    if (!firebaseUser) return;
    try {
      await deleteHabit(firebaseUser.uid, habitId);
      setHistoryHabit(null);
      showToast('Habit deleted', { variant: 'info' });
    } catch (err) {
      showToast('Delete failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const filteredHabits = habits.filter((h) => {
    if (statusFilter === 'active') return h.active;
    if (statusFilter === 'paused') return !h.active;
    return true;
  });

  const watchedSchedule = form.watch('scheduleType');
  const watchedWeekdays = form.watch('weekdays');
  const watchedIcon = form.watch('icon');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Habits</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Daily check-ins, schedule-aware streaks, and 12-week consistency heatmap.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Habit</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Today&apos;s Completion</p>
          <p className="mt-1 text-2xl font-bold text-[#1F2937] tabular-nums">{summary.todayPct}%</p>
          <p className="mt-0.5 text-xs text-[#64748B] tabular-nums">
            {summary.completedToday} of {summary.scheduledTodayCount} scheduled
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Active Habits</p>
          <p className="mt-1 text-2xl font-bold text-[#1F2937] tabular-nums">{summary.activeCount}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Best Current Streak</p>
          <p className="mt-1 text-2xl font-bold text-[#16A34A] tabular-nums">{summary.bestCurrent}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Longest Streak</p>
          <p className="mt-1 text-2xl font-bold text-[#2563EB] tabular-nums">{summary.bestLongest}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {(['active', 'paused', 'all'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                statusFilter === tab
                  ? 'bg-white text-[#1F2937] shadow-xs'
                  : 'text-[#64748B] hover:text-[#1F2937]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <span className="text-xs text-[#64748B] hidden sm:inline">
          Past days editable up to 7 days back
        </span>
      </div>

      {/* Habit List & 7-Day Check-In Matrix */}
      {habits.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            title="No habits tracked yet"
            description="Build your daily founder routine with schedule-aware streak tracking."
            actionLabel="Create First Habit"
            icon={<CheckSquare className="w-5 h-5" />}
            onAction={openCreate}
          />
        </div>
      ) : filteredHabits.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center text-sm text-[#64748B]">
          No {statusFilter} habits found.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredHabits.map((habit) => {
            const Icon = HABIT_ICON_COMPONENTS[habit.icon] ?? Flame;
            const hLogs = logsByHabit.get(habit.id) ?? [];
            const streaks = calculateHabitStreaks(habit, hLogs, todayStr);
            const completion = calculateHabitCompletionStats(habit, hLogs, todayStr);

            const scheduleLabel =
              habit.scheduleType === 'daily'
                ? 'Daily'
                : habit.scheduleType === 'weekdays'
                  ? habit.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')
                  : `${habit.weeklyTarget}x / week`;

            const streakUnit = habit.scheduleType === 'weekly_target' ? 'wk' : 'd';

            return (
              <div
                key={habit.id}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        habit.active ? 'bg-red-50 text-[#DC2626]' : 'bg-slate-100 text-[#64748B]'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-[#1F2937] truncate">
                          {habit.name}
                        </h3>
                        {!habit.active && (
                          <span className="text-xs text-[#F59E0B] font-medium">Paused</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[#64748B] tabular-nums">
                        {scheduleLabel}
                        {habit.reminderTime ? ` · Reminder ${habit.reminderTime}` : ''} · Streak{' '}
                        <strong className="text-[#16A34A]">
                          {streaks.currentStreak}
                          {streakUnit}
                        </strong>{' '}
                        (Best {streaks.longestStreak}
                        {streakUnit}) · 7d {completion.weeklyPct}% · 30d {completion.monthlyPct}%
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setHistoryHabit(habit)}
                      className="min-h-[36px] px-2.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#64748B] hover:text-[#1F2937] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>History</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTogglePause(habit)}
                      aria-label={habit.active ? 'Pause habit' : 'Resume habit'}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#E2E8F0] text-[#64748B] hover:text-[#1F2937] cursor-pointer"
                    >
                      {habit.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(habit)}
                      aria-label="Edit habit"
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#E2E8F0] text-[#64748B] hover:text-[#1F2937] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteHabit(habit.id)}
                      aria-label="Delete habit"
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#E2E8F0] text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 8-Day Window (Today + 7 days back) */}
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-2 border-t border-[#E2E8F0]">
                  {editableDays.map((day) => {
                    const key = `${habit.id}_${day.date}`;
                    const done = logLookup.get(key) === true;
                    const scheduled = isHabitScheduledOnDate(habit, day.date);
                    const isBusy = togglingKey === key;

                    return (
                      <button
                        key={day.date}
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleToggleDay(habit.id, day.date)}
                        className={`min-h-[52px] rounded-xl border px-2 py-1.5 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                          done
                            ? 'bg-emerald-50 border-[#16A34A] text-[#16A34A]'
                            : scheduled
                              ? 'bg-white border-[#E2E8F0] text-[#64748B] hover:border-slate-300'
                              : 'bg-slate-50 border-dashed border-[#E2E8F0] text-slate-400'
                        }`}
                      >
                        <span className="text-[10px] font-medium">{day.shortDay}</span>
                        <div className="flex items-center gap-1 text-xs font-semibold tabular-nums">
                          {done ? <Check className="w-3.5 h-3.5" /> : <span>{day.dayNum}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 12-Week Habit Heatmap */}
      {habits.length > 0 && (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">12-Week Consistency Heatmap</h2>
              <p className="text-xs text-[#64748B]">Daily habit completions over the last 84 days</p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
              <span>Less</span>
              <span className="w-3 h-3 rounded-xs bg-slate-100 border border-[#E2E8F0]" />
              <span className="w-3 h-3 rounded-xs bg-emerald-200" />
              <span className="w-3 h-3 rounded-xs bg-emerald-400" />
              <span className="w-3 h-3 rounded-xs bg-[#16A34A]" />
              <span>More</span>
            </div>
          </div>

          <div className="grid grid-cols-12 sm:grid-cols-21 md:grid-cols-28 gap-1.5">
            {heatmapDays.map((cell) => {
              const bg =
                cell.count === 0
                  ? 'bg-slate-100 border border-[#E2E8F0]'
                  : cell.ratio < 0.4
                    ? 'bg-emerald-200'
                    : cell.ratio < 0.8
                      ? 'bg-emerald-400'
                      : 'bg-[#16A34A]';

              return (
                <div
                  key={cell.date}
                  title={`${cell.date}: ${cell.count} completed`}
                  className={`aspect-square rounded-sm ${bg}`}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Create / Edit Habit Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <h2 className="text-base font-semibold text-[#1F2937]">
                {editingHabit ? 'Edit Habit' : 'New Habit'}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={form.handleSubmit(onSubmitHabit)} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Habit Name</label>
                <input
                  type="text"
                  placeholder="e.g. Morning Deep Work (90 mins)"
                  {...form.register('name')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:border-[#DC2626]"
                />
                {form.formState.errors.name && (
                  <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-2">Icon</label>
                <div className="grid grid-cols-4 gap-2">
                  {HABIT_ICONS.map((item) => {
                    const IconComp = HABIT_ICON_COMPONENTS[item.key] ?? Flame;
                    const selected = watchedIcon === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => form.setValue('icon', item.key)}
                        className={`min-h-[42px] rounded-xl border px-2 py-2 flex items-center justify-center gap-1.5 text-xs font-medium cursor-pointer ${
                          selected
                            ? 'bg-red-50 border-red-200 text-[#DC2626]'
                            : 'bg-white border-[#E2E8F0] text-[#64748B]'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Schedule</label>
                <select
                  {...form.register('scheduleType')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white"
                >
                  <option value="daily">Daily</option>
                  <option value="weekdays">Specific Weekdays</option>
                  <option value="weekly_target">X Times Per Week</option>
                </select>
              </div>

              {watchedSchedule === 'weekdays' && (
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-2">Select Days</label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAY_LABELS.map((label, dayIdx) => {
                      const active = watchedWeekdays.includes(dayIdx);
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => {
                            const next = active
                              ? watchedWeekdays.filter((d) => d !== dayIdx)
                              : [...watchedWeekdays, dayIdx].sort();
                            form.setValue('weekdays', next);
                          }}
                          className={`h-10 rounded-xl border text-xs font-medium cursor-pointer ${
                            active
                              ? 'bg-[#DC2626] border-[#DC2626] text-white'
                              : 'bg-white border-[#E2E8F0] text-[#64748B]'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {watchedSchedule === 'weekly_target' && (
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">
                    Weekly Target (days per week)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={7}
                    {...form.register('weeklyTarget', { valueAsNumber: true })}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">
                    Reminder Time (Optional)
                  </label>
                  <input
                    type="time"
                    {...form.register('reminderTime')}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937]"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2.5 text-sm font-medium text-[#1F2937] cursor-pointer">
                    <input
                      type="checkbox"
                      {...form.register('active')}
                      className="w-4 h-4 accent-[#DC2626]"
                    />
                    <span>Active Habit</span>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 text-sm font-medium text-white hover:bg-[#B91C1C] cursor-pointer"
                >
                  {form.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingHabit ? 'Save Habit' : 'Create Habit'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Habit Completion History Modal */}
      {historyHabit && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <div>
                <h2 className="text-base font-semibold text-[#1F2937]">{historyHabit.name}</h2>
                <p className="text-xs text-[#64748B]">Completion history (7-day edit cap enforced)</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryHabit(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 max-h-[65vh] overflow-y-auto">
              {(logsByHabit.get(historyHabit.id) ?? []).length > 0 ? (
                <ul className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
                  {[...(logsByHabit.get(historyHabit.id) ?? [])]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((log) => {
                      const canEdit = isWithinEditableWindow(log.date, todayStr);
                      return (
                        <li
                          key={log.id}
                          className="px-4 py-2.5 flex items-center justify-between text-sm"
                        >
                          <span className="tabular-nums text-[#1F2937]">{log.date}</span>
                          <div className="flex items-center gap-3">
                            <span
                              className={`text-xs font-medium ${
                                log.completed ? 'text-[#16A34A]' : 'text-[#64748B]'
                              }`}
                            >
                              {log.completed ? 'Completed' : 'Skipped'}
                            </span>
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => handleToggleDay(historyHabit.id, log.date)}
                                className="text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
                              >
                                Toggle
                              </button>
                            ) : (
                              <span className="text-[11px] text-[#64748B]">Locked</span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                </ul>
              ) : (
                <p className="text-sm text-[#64748B] text-center py-6">
                  No check-ins recorded for this habit yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
