import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calendar, ChevronLeft, ChevronRight, Plus, Search, Target } from 'lucide-react';
import { AskAiCeoButton } from '../components/ai/AskAiCeoButton';
import { CircularProgress } from '../components/goals/CircularProgress';
import { GoalDetailModal } from '../components/goals/GoalDetailModal';
import { GoalFormModal } from '../components/goals/GoalFormModal';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { usePersonalData } from '../hooks/usePersonalData';
import { GOAL_CATEGORIES, GOAL_PRIORITIES, GOAL_STATUSES } from '../lib/constants';
import {
  buildWeeklyProgressSeries,
  calculateGoalProgressPct,
  getEffectiveGoalStatus,
  getTodayDateString,
} from '../lib/goalUtils';
import { GoalPriority, PersonalGoal } from '../types';

type GoalViewMode = 'cards' | 'timeline' | 'chart';
type GoalSortKey = 'deadline' | 'priority' | 'progress';

const PRIORITY_WEIGHT: Record<GoalPriority, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

const PAGE_SIZE = 6;

export const GoalsPage: React.FC = () => {
  const { loading, goals, milestones, goalHistory } = usePersonalData();

  const [viewMode, setViewMode] = useState<GoalViewMode>('cards');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<GoalSortKey>('deadline');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<PersonalGoal | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const todayStr = getTodayDateString();

  const goalsMap = useMemo(() => {
    const map = new Map<string, PersonalGoal>();
    goals.forEach((g) => map.set(g.id, g));
    return map;
  }, [goals]);

  const selectedGoal = selectedGoalId ? goalsMap.get(selectedGoalId) ?? null : null;

  const summary = useMemo(() => {
    let active = 0;
    let completed = 0;
    let delayed = 0;
    let pctSum = 0;
    let nonArchived = 0;

    for (const g of goals) {
      const eff = getEffectiveGoalStatus(g, todayStr);
      if (eff === 'Completed') completed++;
      if (eff === 'Delayed') delayed++;
      if (eff !== 'Completed' && eff !== 'Archived') active++;
      if (eff !== 'Archived') {
        pctSum += calculateGoalProgressPct(g.currentValue, g.targetValue);
        nonArchived++;
      }
    }

    return {
      active,
      completed,
      delayed,
      avgPct: nonArchived > 0 ? Math.round(pctSum / nonArchived) : 0,
    };
  }, [goals, todayStr]);

  const filteredGoals = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const list = goals.filter((g) => {
      const eff = getEffectiveGoalStatus(g, todayStr);
      if (statusFilter === 'ALL') {
        if (eff === 'Archived') return false;
      } else if (eff !== statusFilter) {
        return false;
      }
      if (categoryFilter !== 'ALL' && g.category !== categoryFilter) return false;
      if (priorityFilter !== 'ALL' && g.priority !== priorityFilter) return false;
      if (
        term &&
        !g.title.toLowerCase().includes(term) &&
        !(g.description || '').toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'deadline') {
        return a.targetDate.localeCompare(b.targetDate);
      }
      if (sortBy === 'priority') {
        return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      }
      return (
        calculateGoalProgressPct(b.currentValue, b.targetValue) -
        calculateGoalProgressPct(a.currentValue, a.targetValue)
      );
    });

    return list;
  }, [goals, todayStr, searchTerm, statusFilter, categoryFilter, priorityFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredGoals.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedGoals = filteredGoals.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const weeklySeries = useMemo(
    () => buildWeeklyProgressSeries(goalHistory, goalsMap, 6),
    [goalHistory, goalsMap]
  );

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Personal Goals</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Track measurable targets, milestones, and historical progress.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <AskAiCeoButton
            area="personal"
            prompt="Which goals need attention and what should I prioritize this week?"
          />
          <button
            type="button"
            onClick={() => {
              setEditingGoal(null);
              setFormOpen(true);
            }}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Goal</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Active Goals</p>
          <p className="mt-1 text-2xl font-bold text-[#1F2937] tabular-nums">{summary.active}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Completed</p>
          <p className="mt-1 text-2xl font-bold text-[#16A34A] tabular-nums">{summary.completed}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Delayed</p>
          <p className="mt-1 text-2xl font-bold text-[#DC2626] tabular-nums">{summary.delayed}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Average Progress</p>
          <p className="mt-1 text-2xl font-bold text-[#2563EB] tabular-nums">{summary.avgPct}%</p>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search goals..."
              className="w-full h-10 rounded-xl border border-[#E2E8F0] pl-10 pr-3 text-sm text-[#1F2937] focus:outline-none focus:border-[#DC2626]"
            />
          </div>

          {/* View Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
            {(['cards', 'timeline', 'chart'] as GoalViewMode[]).map((mode) => (
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
                {mode === 'chart' ? 'Weekly Chart' : mode}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs text-[#1F2937] bg-white"
          >
            <option value="ALL">All Active Statuses</option>
            {GOAL_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs text-[#1F2937] bg-white"
          >
            <option value="ALL">All Categories</option>
            {GOAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs text-[#1F2937] bg-white"
          >
            <option value="ALL">All Priorities</option>
            {GOAL_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p} Priority
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as GoalSortKey)}
            className="h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs text-[#1F2937] bg-white"
          >
            <option value="deadline">Sort: Deadline</option>
            <option value="priority">Sort: Priority</option>
            <option value="progress">Sort: Progress %</option>
          </select>
        </div>
      </div>

      {/* Main Content */}
      {goals.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            title="No personal goals yet"
            description="Create your first measurable personal goal with milestones and progress tracking."
            actionLabel="Create First Goal"
            icon={<Target className="w-5 h-5" />}
            onAction={() => {
              setEditingGoal(null);
              setFormOpen(true);
            }}
          />
        </div>
      ) : viewMode === 'chart' ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-[#1F2937]">Weekly Progress Velocity</h2>
            <p className="text-xs text-[#64748B]">
              Average logged progress % and update count across the last 6 weeks from real progress history
            </p>
          </div>
          {weeklySeries.length > 0 ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklySeries} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: '#64748B', fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 12 }} unit="%" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="avgProgressPct"
                    name="Avg Progress %"
                    stroke="#DC2626"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#DC2626' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No progress history recorded yet"
              description="Open any goal and log a progress update to populate your weekly velocity chart."
            />
          )}
        </div>
      ) : viewMode === 'timeline' ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs">
          <h2 className="text-base font-semibold text-[#1F2937] mb-4">Goal Timeline</h2>
          {filteredGoals.length === 0 ? (
            <p className="text-sm text-[#64748B]">No goals match the current filters.</p>
          ) : (
            <ul className="divide-y divide-[#E2E8F0]">
              {filteredGoals.map((goal) => {
                const pct = calculateGoalProgressPct(goal.currentValue, goal.targetValue);
                const eff = getEffectiveGoalStatus(goal, todayStr);
                return (
                  <li
                    key={goal.id}
                    onClick={() => setSelectedGoalId(goal.id)}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 px-2 rounded-xl transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-[#64748B] tabular-nums">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {goal.startDate} → {goal.targetDate}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            eff === 'Delayed'
                              ? 'text-[#DC2626] font-medium'
                              : eff === 'Completed'
                                ? 'text-[#16A34A] font-medium'
                                : 'text-[#2563EB] font-medium'
                          }
                        >
                          {eff}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-[#1F2937] truncate">{goal.title}</p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="w-36 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            pct === 100 ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-[#1F2937] w-10 text-right tabular-nums">
                        {pct}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : paginatedGoals.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center text-sm text-[#64748B]">
          No goals match the selected filters.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedGoals.map((goal) => {
              const pct = calculateGoalProgressPct(goal.currentValue, goal.targetValue);
              const eff = getEffectiveGoalStatus(goal, todayStr);
              const goalMs = milestones.filter((m) => m.goalId === goal.id);
              const doneMs = goalMs.filter((m) => m.completed).length;

              return (
                <article
                  key={goal.id}
                  onClick={() => setSelectedGoalId(goal.id)}
                  className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs hover:border-slate-300 transition-colors flex flex-col justify-between gap-4 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-[#64748B] truncate">
                        {goal.category} · {goal.priority} · {goal.goalType}
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-[#1F2937] line-clamp-2">
                        {goal.title}
                      </h3>
                    </div>
                    <CircularProgress percentage={pct} size={50} />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="text-[#64748B]">
                        {goal.currentValue} / {goal.targetValue} {goal.unit}
                      </span>
                      <span
                        className={`font-medium ${
                          eff === 'Delayed'
                            ? 'text-[#DC2626]'
                            : eff === 'Completed'
                              ? 'text-[#16A34A]'
                              : eff === 'In Progress'
                                ? 'text-[#2563EB]'
                                : 'text-[#64748B]'
                        }`}
                      >
                        {eff}
                      </span>
                    </div>

                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          eff === 'Completed'
                            ? 'bg-[#16A34A]'
                            : eff === 'Delayed'
                              ? 'bg-[#F59E0B]'
                              : 'bg-[#DC2626]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B] tabular-nums">
                    <span>Due {goal.targetDate}</span>
                    <span>
                      {goalMs.length > 0 ? `${doneMs}/${goalMs.length} milestones` : 'Open details'}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-[#64748B] tabular-nums">
                Page {safePage} of {totalPages} ({filteredGoals.length} goals)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-[38px] px-3 rounded-xl border border-[#E2E8F0] bg-white text-xs font-medium text-[#1F2937] disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-[38px] px-3 rounded-xl border border-[#E2E8F0] bg-white text-xs font-medium text-[#1F2937] disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <GoalFormModal
        open={formOpen}
        editingGoal={editingGoal}
        onClose={() => {
          setFormOpen(false);
          setEditingGoal(null);
        }}
      />

      <GoalDetailModal
        goal={selectedGoal}
        onClose={() => setSelectedGoalId(null)}
        onEdit={(g) => {
          setSelectedGoalId(null);
          setEditingGoal(g);
          setFormOpen(true);
        }}
      />
    </div>
  );
};
