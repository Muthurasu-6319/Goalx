import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Calendar, Flame, Target } from 'lucide-react';
import { usePersonalData } from '../../hooks/usePersonalData';
import { ROUTES } from '../../lib/constants';
import {
  calculateGoalProgressPct,
  getEffectiveGoalStatus,
  getTodayDateString,
} from '../../lib/goalUtils';
import { GoalPriority } from '../../types';
import { EmptyState } from '../ui/EmptyState';

const PRIORITY_RANK: Record<GoalPriority, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

export const DailyFocusCard: React.FC = () => {
  const { goals, loading } = usePersonalData();
  const navigate = useNavigate();
  const todayStr = getTodayDateString();

  const focusGoals = useMemo(() => {
    return goals
      .map((goal) => {
        const effectiveStatus = getEffectiveGoalStatus(goal, todayStr);
        const progressPct = calculateGoalProgressPct(goal.currentValue, goal.targetValue);
        return { goal, effectiveStatus, progressPct };
      })
      .filter(
        (item) =>
          item.effectiveStatus !== 'Completed' && item.effectiveStatus !== 'Archived'
      )
      .sort((a, b) => {
        const priDiff = PRIORITY_RANK[b.goal.priority] - PRIORITY_RANK[a.goal.priority];
        if (priDiff !== 0) return priDiff;
        const aDelayed = a.effectiveStatus === 'Delayed' ? 1 : 0;
        const bDelayed = b.effectiveStatus === 'Delayed' ? 1 : 0;
        if (bDelayed !== aDelayed) return bDelayed - aDelayed;
        return (a.goal.targetDate || '9999-99-99').localeCompare(
          b.goal.targetDate || '9999-99-99'
        );
      })
      .slice(0, 4);
  }, [goals, todayStr]);

  return (
    <section
      aria-label="Daily Focus"
      className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-red-50 text-[#DC2626] flex items-center justify-center shrink-0">
            <Flame className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">Daily Focus</h2>
            <p className="text-xs text-[#64748B]">
              Top-priority active personal goals ranked by priority and target deadline
            </p>
          </div>
        </div>

        <Link
          to={ROUTES.GOALS}
          className="min-h-[36px] inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <span>Manage Goals</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-28 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] animate-pulse"
            />
          ))}
        </div>
      ) : focusGoals.length === 0 ? (
        <EmptyState
          title="No active focus goals today"
          description="Create a High-priority goal in Personal Goals to anchor your Daily Focus card."
          actionLabel="Create Goal"
          onAction={() => navigate(ROUTES.GOALS)}
          icon={<Target className="w-5 h-5" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {focusGoals.map(({ goal, effectiveStatus, progressPct }) => {
            const isDelayed = effectiveStatus === 'Delayed';
            const priorityColor =
              goal.priority === 'High'
                ? 'text-[#DC2626]'
                : goal.priority === 'Medium'
                  ? 'text-[#F59E0B]'
                  : 'text-[#2563EB]';

            return (
              <Link
                key={goal.id}
                to={ROUTES.GOALS}
                className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 hover:border-[#DC2626]/50 transition-colors flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    <span className={priorityColor}>{goal.priority} Priority</span>
                    <span aria-hidden="true" className="text-[#64748B]">
                      ·
                    </span>
                    <span className="text-[#64748B] truncate">{goal.category}</span>
                  </div>

                  <h3 className="text-sm font-semibold text-[#1F2937] line-clamp-2">
                    {goal.title}
                  </h3>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs tabular-nums">
                    <span className="text-[#64748B] truncate">
                      {goal.currentValue} / {goal.targetValue} {goal.unit}
                    </span>
                    <span
                      className={`font-bold shrink-0 ${
                        isDelayed ? 'text-[#DC2626]' : 'text-[#1F2937]'
                      }`}
                    >
                      {progressPct}%
                    </span>
                  </div>

                  <div className="h-2 rounded-full bg-slate-200/80 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isDelayed
                          ? 'bg-[#DC2626]'
                          : progressPct >= 75
                            ? 'bg-[#16A34A]'
                            : 'bg-[#2563EB]'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#64748B] tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{goal.targetDate || 'No deadline'}</span>
                    </span>
                    <span className={isDelayed ? 'font-semibold text-[#DC2626]' : ''}>
                      {effectiveStatus}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
};
