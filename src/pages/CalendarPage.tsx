import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Radar,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { usePersonalData } from '../hooks/usePersonalData';
import { useToast } from '../hooks/useToast';
import { PERSONAL_EVENT_TYPES, ROUTES, WEEKDAY_LABELS } from '../lib/constants';
import { addDaysToDateString, getTodayDateString } from '../lib/goalUtils';
import { parseDateString } from '../lib/habitUtils';
import { CalendarEventFormValues, calendarEventSchema } from '../lib/validators';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from '../services/calendarService';
import { CalendarEvent, CalendarEventType } from '../types';

type CalendarView = 'month' | 'week' | 'day' | 'upcoming';

interface UnifiedCalendarItem {
  id: string;
  title: string;
  eventType: CalendarEventType;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  notes: string;
  reminderMinutes: number | null;
  sourceType: CalendarEvent['sourceType'];
  sourceId: string;
  editableEvent?: CalendarEvent;
}

export const CalendarPage: React.FC = () => {
  const { firebaseUser } = useAuth();
  const { loading, calendarEvents, goals } = usePersonalData();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const todayStr = getTodayDateString();
  const [viewMode, setViewMode] = useState<CalendarView>('month');
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  // Merge calendarEvents + automatic non-archived Goal target dates
  const unifiedItems = useMemo(() => {
    const items: UnifiedCalendarItem[] = calendarEvents.map((ev) => ({
      id: ev.id,
      title: ev.title,
      eventType: ev.eventType,
      date: ev.date,
      startTime: ev.startTime,
      endTime: ev.endTime,
      allDay: ev.allDay,
      notes: ev.notes,
      reminderMinutes: ev.reminderMinutes,
      sourceType: ev.sourceType,
      sourceId: ev.sourceId,
      editableEvent: ev,
    }));

    for (const g of goals) {
      if (g.status !== 'Archived' && g.targetDate) {
        items.push({
          id: `goal-deadline-${g.id}`,
          title: `Goal Deadline: ${g.title}`,
          eventType: 'Goal Deadline',
          date: g.targetDate,
          startTime: '',
          endTime: '',
          allDay: true,
          notes: `${g.category} · Target ${g.targetValue} ${g.unit}`,
          reminderMinutes: null,
          sourceType: 'goal',
          sourceId: g.id,
        });
      }
    }

    items.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startTime.localeCompare(b.startTime);
    });

    return items;
  }, [calendarEvents, goals]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, UnifiedCalendarItem[]>();
    for (const item of unifiedItems) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [unifiedItems]);

  const todayReminders = useMemo(
    () =>
      unifiedItems.filter(
        (item) => item.date === todayStr && item.reminderMinutes !== null
      ),
    [unifiedItems, todayStr]
  );

  // Month Grid Days (42 cells starting Sunday)
  const monthGrid = useMemo(() => {
    const dt = parseDateString(selectedDate);
    const year = dt.getFullYear();
    const month = dt.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStart = new Date(year, month, 1 - startOffset);

    const cells: { date: string; dayNum: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const y = cellDate.getFullYear();
      const m = String(cellDate.getMonth() + 1).padStart(2, '0');
      const d = String(cellDate.getDate()).padStart(2, '0');
      cells.push({
        date: `${y}-${m}-${d}`,
        dayNum: cellDate.getDate(),
        inMonth: cellDate.getMonth() === month,
      });
    }
    return {
      monthLabel: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(firstOfMonth),
      cells,
    };
  }, [selectedDate]);

  // Week Days (7 days starting from Sunday of selectedDate)
  const weekDays = useMemo(() => {
    const dt = parseDateString(selectedDate);
    const offset = -dt.getDay();
    const list: { date: string; label: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDaysToDateString(selectedDate, offset + i);
      const dObj = parseDateString(date);
      list.push({
        date,
        label: `${WEEKDAY_LABELS[dObj.getDay()]} ${dObj.getDate()}`,
      });
    }
    return list;
  }, [selectedDate]);

  const upcomingItems = useMemo(
    () => unifiedItems.filter((item) => item.date >= todayStr).slice(0, 30),
    [unifiedItems, todayStr]
  );

  const form = useForm<CalendarEventFormValues>({
    resolver: zodResolver(calendarEventSchema),
    defaultValues: {
      title: '',
      eventType: 'Personal Event',
      date: todayStr,
      startTime: '09:00',
      endTime: '10:00',
      allDay: false,
      notes: '',
      reminderMinutes: 15,
    },
  });

  const openCreateModal = (datePreset = selectedDate) => {
    setEditingEvent(null);
    form.reset({
      title: '',
      eventType: 'Personal Event',
      date: datePreset,
      startTime: '09:00',
      endTime: '10:00',
      allDay: false,
      notes: '',
      reminderMinutes: 15,
    });
    setModalOpen(true);
  };

  const openEditModal = (ev: CalendarEvent) => {
    setEditingEvent(ev);
    form.reset({
      title: ev.title,
      eventType: ev.eventType,
      date: ev.date,
      startTime: ev.startTime || '09:00',
      endTime: ev.endTime || '10:00',
      allDay: ev.allDay,
      notes: ev.notes || '',
      reminderMinutes: ev.reminderMinutes,
    });
    setModalOpen(true);
  };

  const onSaveEvent = async (values: CalendarEventFormValues) => {
    if (!firebaseUser) return;
    try {
      if (editingEvent) {
        await updateCalendarEvent(editingEvent.id, {
          ...values,
          sourceType: editingEvent.sourceType,
          sourceId: editingEvent.sourceId,
        });
        showToast('Event updated', { variant: 'success' });
      } else {
        await createCalendarEvent(firebaseUser.uid, {
          ...values,
          sourceType: values.eventType === 'Habit Reminder' ? 'habit' : 'manual',
          sourceId: '',
        });
        showToast('Event added to calendar', { variant: 'success' });
      }
      setModalOpen(false);
    } catch (err) {
      showToast('Failed to save event', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleRequestNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      showToast('Browser notifications not supported', { variant: 'warning' });
      return;
    }
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    if (result === 'granted') {
      showToast('Browser reminders enabled', {
        description: 'You can receive reminder alerts when events are due.',
        variant: 'success',
      });
    } else {
      showToast('Permission not granted', {
        description: 'In-app reminders remain active on your calendar.',
        variant: 'info',
      });
    }
  };

  const shiftDate = (delta: number) => {
    if (viewMode === 'month') {
      const dt = parseDateString(selectedDate);
      const next = new Date(dt.getFullYear(), dt.getMonth() + delta, 1);
      const y = next.getFullYear();
      const m = String(next.getMonth() + 1).padStart(2, '0');
      setSelectedDate(`${y}-${m}-01`);
    } else if (viewMode === 'week') {
      setSelectedDate(addDaysToDateString(selectedDate, delta * 7));
    } else {
      setSelectedDate(addDaysToDateString(selectedDate, delta));
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const watchedAllDay = form.watch('allDay');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Calendar</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Personal events, goal deadlines, and reminders in one unified schedule.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
            <button
              type="button"
              onClick={handleRequestNotifications}
              className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
            >
              <Bell className="w-4 h-4 text-[#F59E0B]" />
              <span>Enable Browser Reminders</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => openCreateModal(selectedDate)}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-medium text-white hover:bg-[#B91C1C] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Event</span>
          </button>
        </div>
      </div>

      {/* In-App Reminders Banner for Today */}
      {todayReminders.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-[#1F2937]">
            <Bell className="w-4 h-4 text-[#F59E0B] shrink-0" />
            <span>
              <strong>Today&apos;s Reminders:</strong>{' '}
              {todayReminders.map((r) => `${r.title}${r.startTime ? ` (${r.startTime})` : ''}`).join(' · ')}
            </span>
          </div>
        </div>
      )}

      {/* Navigation & View Switcher */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            aria-label="Previous"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-[#E2E8F0] hover:bg-slate-50 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(todayStr)}
            className="min-h-[38px] px-3 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftDate(1)}
            aria-label="Next"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-[#E2E8F0] hover:bg-slate-50 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="ml-2 text-sm font-semibold text-[#1F2937] tabular-nums">
            {viewMode === 'month' ? monthGrid.monthLabel : selectedDate}
          </span>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {(['month', 'week', 'day', 'upcoming'] as CalendarView[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                viewMode === mode
                  ? 'bg-white text-[#1F2937] shadow-xs'
                  : 'text-[#64748B] hover:text-[#1F2937]'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar Views */}
      {viewMode === 'month' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="grid grid-cols-7 gap-1 mb-2 text-center text-xs font-medium text-[#64748B]">
              {WEEKDAY_LABELS.map((lbl) => (
                <div key={lbl} className="py-1">
                  {lbl}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGrid.cells.map((cell) => {
                const cellItems = itemsByDate.get(cell.date) ?? [];
                const isSelected = cell.date === selectedDate;
                const isToday = cell.date === todayStr;

                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => setSelectedDate(cell.date)}
                    className={`min-h-[64px] sm:min-h-[76px] p-1.5 rounded-xl border text-left flex flex-col justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-[#DC2626] bg-red-50/40'
                        : isToday
                          ? 'border-[#2563EB] bg-blue-50/30'
                          : 'border-[#E2E8F0] hover:bg-slate-50'
                    } ${!cell.inMonth ? 'opacity-45' : ''}`}
                  >
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        isToday ? 'text-[#2563EB]' : 'text-[#1F2937]'
                      }`}
                    >
                      {cell.dayNum}
                    </span>

                    {cellItems.length > 0 && (
                      <div className="space-y-0.5 w-full">
                        {cellItems.slice(0, 2).map((item) => (
                          <div
                            key={item.id}
                            className={`text-[10px] truncate rounded px-1 py-0.5 font-medium ${
                              item.sourceType === 'goal'
                                ? 'bg-blue-50 text-[#2563EB]'
                                : item.sourceType === 'invoice'
                                  ? 'bg-amber-50 text-amber-800'
                                  : item.sourceType === 'competitor'
                                    ? 'bg-purple-50 text-purple-700'
                                    : 'bg-red-50 text-[#DC2626]'
                            }`}
                          >
                            {item.title}
                          </div>
                        ))}
                        {cellItems.length > 2 && (
                          <div className="text-[10px] text-[#64748B] px-1">
                            +{cellItems.length - 2} more
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Day Agenda */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1F2937] tabular-nums">{selectedDate}</h2>
              <button
                type="button"
                onClick={() => openCreateModal(selectedDate)}
                className="text-xs font-medium text-[#DC2626] hover:underline cursor-pointer"
              >
                + Add Event
              </button>
            </div>

            {(itemsByDate.get(selectedDate) ?? []).length === 0 ? (
              <EmptyState
                title="No events on this day"
                description="Schedule a personal block or reminder for this date."
                actionLabel="Add Event"
                onAction={() => openCreateModal(selectedDate)}
              />
            ) : (
              <ul className="divide-y divide-[#E2E8F0]">
                {(itemsByDate.get(selectedDate) ?? []).map((item) => (
                  <li key={item.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-[#64748B]">{item.eventType}</p>
                      <p className="text-sm font-medium text-[#1F2937]">{item.title}</p>
                      <p className="text-xs text-[#64748B] tabular-nums">
                        {item.allDay ? 'All day' : `${item.startTime} - ${item.endTime}`}
                      </p>
                      {item.notes && (
                        <p className="mt-1 text-xs text-[#64748B]">{item.notes}</p>
                      )}
                    </div>

                    {item.sourceType === 'invoice' ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => navigate(`${ROUTES.COMPANY_FINANCE}?tab=invoices`)}
                          className="text-xs font-medium text-[#2563EB] hover:underline shrink-0 cursor-pointer"
                        >
                          Open Invoice
                        </button>
                      </div>
                    ) : item.sourceType === 'competitiveGap' ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => navigate(ROUTES.COMPETITION_GAPS)}
                          className="text-xs font-medium text-[#DC2626] hover:underline shrink-0 cursor-pointer"
                        >
                          Open Gap
                        </button>
                      </div>
                    ) : item.sourceType === 'competitor' && item.sourceId ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => navigate(`${ROUTES.COMPETITION}/${item.sourceId}`)}
                          className="text-xs font-medium text-[#2563EB] hover:underline shrink-0 cursor-pointer"
                        >
                          Open Competitor
                        </button>
                      </div>
                    ) : item.editableEvent ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(item.editableEvent!)}
                          className="p-1.5 text-[#64748B] hover:text-[#1F2937] cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCalendarEvent(item.id)}
                          className="p-1.5 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate(ROUTES.GOALS)}
                        className="text-xs font-medium text-[#2563EB] hover:underline shrink-0 cursor-pointer"
                      >
                        View Goal
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {viewMode === 'week' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {weekDays.map((day) => {
            const list = itemsByDate.get(day.date) ?? [];
            const isToday = day.date === todayStr;
            return (
              <div
                key={day.date}
                className={`bg-white border rounded-2xl p-4 shadow-xs space-y-3 ${
                  isToday ? 'border-[#DC2626]' : 'border-[#E2E8F0]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${isToday ? 'text-[#DC2626]' : 'text-[#1F2937]'}`}>
                    {day.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => openCreateModal(day.date)}
                    className="p-1 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {list.length === 0 ? (
                  <p className="text-xs text-[#64748B]">Clear</p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((item) => (
                      <li
                        key={item.id}
                        onClick={() =>
                          item.sourceType === 'invoice'
                            ? navigate(`${ROUTES.COMPANY_FINANCE}?tab=invoices`)
                            : item.sourceType === 'competitiveGap'
                              ? navigate(ROUTES.COMPETITION_GAPS)
                              : item.sourceType === 'competitor' && item.sourceId
                                ? navigate(`${ROUTES.COMPETITION}/${item.sourceId}`)
                                : item.editableEvent
                                  ? openEditModal(item.editableEvent)
                                  : navigate(ROUTES.GOALS)
                        }
                        className="p-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] cursor-pointer hover:border-slate-300"
                      >
                        <p className="text-xs font-medium text-[#1F2937] line-clamp-2">{item.title}</p>
                        <p className="text-[10px] text-[#64748B] mt-0.5 tabular-nums">
                          {item.allDay ? 'All day' : item.startTime}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'day' && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#1F2937] tabular-nums">
              Schedule for {selectedDate}
            </h2>
            <button
              type="button"
              onClick={() => openCreateModal(selectedDate)}
              className="min-h-[38px] px-3.5 rounded-xl bg-[#DC2626] text-xs font-medium text-white cursor-pointer"
            >
              Add Event
            </button>
          </div>
          {(itemsByDate.get(selectedDate) ?? []).length === 0 ? (
            <EmptyState
              title="Nothing scheduled for this day"
              description="Add a personal event or reminder."
              actionLabel="New Event"
              icon={<CalendarDays className="w-5 h-5" />}
              onAction={() => openCreateModal(selectedDate)}
            />
          ) : (
            <ul className="divide-y divide-[#E2E8F0]">
              {(itemsByDate.get(selectedDate) ?? []).map((item) => (
                <li key={item.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-[#1F2937] flex items-center justify-center shrink-0">
                      {item.sourceType === 'goal' ? (
                        <Target className="w-4 h-4 text-[#2563EB]" />
                      ) : item.sourceType === 'competitor' ? (
                        <Radar className="w-4 h-4 text-purple-700" />
                      ) : (
                        <Clock className="w-4 h-4 text-[#DC2626]" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#1F2937]">{item.title}</p>
                      <p className="text-xs text-[#64748B] tabular-nums">
                        {item.eventType} · {item.allDay ? 'All day' : `${item.startTime} - ${item.endTime}`}
                      </p>
                      {item.notes && <p className="mt-1 text-xs text-[#64748B]">{item.notes}</p>}
                    </div>
                  </div>
                  {item.sourceType === 'competitiveGap' ? (
                    <button
                      type="button"
                      onClick={() => navigate(ROUTES.COMPETITION_GAPS)}
                      className="text-xs font-medium text-[#DC2626] hover:underline shrink-0 cursor-pointer"
                    >
                      Open Gap
                    </button>
                  ) : item.sourceType === 'competitor' && item.sourceId ? (
                    <button
                      type="button"
                      onClick={() => navigate(`${ROUTES.COMPETITION}/${item.sourceId}`)}
                      className="text-xs font-medium text-[#2563EB] hover:underline shrink-0 cursor-pointer"
                    >
                      Open Competitor
                    </button>
                  ) : item.editableEvent ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(item.editableEvent!)}
                        className="p-2 text-[#64748B] hover:text-[#1F2937] cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCalendarEvent(item.id)}
                        className="p-2 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {viewMode === 'upcoming' && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-[#1F2937]">Upcoming Events & Deadlines</h2>
          {upcomingItems.length === 0 ? (
            <EmptyState
              title="No upcoming events"
              description="Your upcoming personal events and goal deadlines will appear here."
              actionLabel="Add Event"
              onAction={() => openCreateModal(todayStr)}
            />
          ) : (
            <ul className="divide-y divide-[#E2E8F0]">
              {upcomingItems.map((item) => (
                <li key={item.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-[#64748B] tabular-nums">
                      {item.date} · {item.eventType} ·{' '}
                      {item.allDay ? 'All day' : `${item.startTime} - ${item.endTime}`}
                    </p>
                    <p className="text-sm font-semibold text-[#1F2937] truncate">{item.title}</p>
                  </div>
                  {item.sourceType === 'invoice' ? (
                    <button
                      type="button"
                      onClick={() => navigate(`${ROUTES.COMPANY_FINANCE}?tab=invoices`)}
                      className="text-xs font-medium text-[#2563EB] hover:underline shrink-0 cursor-pointer"
                    >
                      Open Invoice
                    </button>
                  ) : item.sourceType === 'competitiveGap' ? (
                    <button
                      type="button"
                      onClick={() => navigate(ROUTES.COMPETITION_GAPS)}
                      className="text-xs font-medium text-[#DC2626] hover:underline shrink-0 cursor-pointer"
                    >
                      Open Gap
                    </button>
                  ) : item.sourceType === 'competitor' && item.sourceId ? (
                    <button
                      type="button"
                      onClick={() => navigate(`${ROUTES.COMPETITION}/${item.sourceId}`)}
                      className="text-xs font-medium text-[#2563EB] hover:underline shrink-0 cursor-pointer"
                    >
                      Open Competitor
                    </button>
                  ) : item.editableEvent ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(item.editableEvent!)}
                        className="p-1.5 text-[#64748B] hover:text-[#1F2937] cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCalendarEvent(item.id)}
                        className="p-1.5 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate(ROUTES.GOALS)}
                      className="text-xs font-medium text-[#2563EB] hover:underline shrink-0 cursor-pointer"
                    >
                      Open Goal
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Event Form Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <h2 className="text-base font-semibold text-[#1F2937]">
                {editingEvent ? 'Edit Event' : 'New Calendar Event'}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={form.handleSubmit(onSaveEvent)} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Title</label>
                <input
                  type="text"
                  placeholder="e.g. Weekly Personal Review"
                  {...form.register('title')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm"
                />
                {form.formState.errors.title && (
                  <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.title.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Event Type</label>
                  <select {...form.register('eventType')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white">
                    {PERSONAL_EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Date</label>
                  <input type="date" {...form.register('date')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm" />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-sm font-medium text-[#1F2937] cursor-pointer">
                <input type="checkbox" {...form.register('allDay')} className="w-4 h-4 accent-[#DC2626]" />
                <span>All-day event</span>
              </label>

              {!watchedAllDay && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1F2937] mb-1">Start Time</label>
                    <input type="time" {...form.register('startTime')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1F2937] mb-1">End Time</label>
                    <input type="time" {...form.register('endTime')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Reminder</label>
                <select
                  value={form.watch('reminderMinutes') === null ? 'none' : String(form.watch('reminderMinutes'))}
                  onChange={(e) =>
                    form.setValue(
                      'reminderMinutes',
                      e.target.value === 'none' ? null : Number(e.target.value)
                    )
                  }
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white"
                >
                  <option value="none">No reminder</option>
                  <option value="0">At event time</option>
                  <option value="15">15 minutes before</option>
                  <option value="30">30 minutes before</option>
                  <option value="60">1 hour before</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Notes</label>
                <textarea rows={2} placeholder="Optional event details..." {...form.register('notes')} className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm" />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={form.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 text-sm font-medium text-white cursor-pointer">
                  {form.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingEvent ? 'Save Event' : 'Create Event'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
