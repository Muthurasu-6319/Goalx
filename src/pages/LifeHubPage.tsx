import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, CheckSquare, PiggyBank, Target, Wallet } from 'lucide-react';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { usePersonalData } from '../hooks/usePersonalData';
import { ROUTES } from '../lib/constants';
import { getEffectiveGoalStatus, getTodayDateString } from '../lib/goalUtils';
import { formatINR, getCurrentMonthKey, sumSavingsTransactionsPaise } from '../lib/moneyUtils';

export const LifeHubPage: React.FC = () => {
  const { loading, goals, habits, habitLogs, incomes, expenses, savingsTransactions, calendarEvents } =
    usePersonalData();

  if (loading) {
    return <DashboardSkeleton />;
  }

  const todayStr = getTodayDateString();
  const monthKey = getCurrentMonthKey();

  const activeGoals = goals.filter((g) => {
    const eff = getEffectiveGoalStatus(g, todayStr);
    return eff !== 'Completed' && eff !== 'Archived';
  }).length;

  const activeHabits = habits.filter((h) => h.active).length;
  const doneToday = habitLogs.filter((l) => l.date === todayStr && l.completed).length;

  const monthIncome = incomes
    .filter((i) => i.date.startsWith(monthKey))
    .reduce((acc, i) => acc + i.amountPaise, 0);
  const monthExpense = expenses
    .filter((e) => e.date.startsWith(monthKey))
    .reduce((acc, e) => acc + e.amountPaise, 0);

  const totalSaved = sumSavingsTransactionsPaise(savingsTransactions);
  const upcomingCount = calendarEvents.filter((e) => e.date >= todayStr).length;

  const modules = [
    {
      title: 'Personal Goals',
      metric: `${activeGoals} active`,
      description: 'Measurable goals, task-based milestones, and weekly progress history.',
      to: ROUTES.LIFE_GOALS,
      Icon: Target,
      accent: 'bg-red-50 text-[#DC2626]',
    },
    {
      title: 'Habits',
      metric: `${doneToday}/${activeHabits} today`,
      description: 'Schedule-aware daily check-ins, streaks, and 12-week heatmap.',
      to: ROUTES.HABITS,
      Icon: CheckSquare,
      accent: 'bg-emerald-50 text-[#16A34A]',
    },
    {
      title: 'Income & Expenses',
      metric: `${formatINR(monthIncome - monthExpense)} net`,
      description: 'Monthly personal cashflow in INR with category breakdowns.',
      to: ROUTES.LIFE_INCOME,
      Icon: Wallet,
      accent: 'bg-blue-50 text-[#2563EB]',
    },
    {
      title: 'Savings Vault',
      metric: formatINR(totalSaved),
      description: 'Target funds backed by individual deposit and withdrawal transactions.',
      to: ROUTES.LIFE_SAVINGS,
      Icon: PiggyBank,
      accent: 'bg-amber-50 text-[#F59E0B]',
    },
    {
      title: 'Calendar',
      metric: `${upcomingCount} upcoming`,
      description: 'Personal events, automatic goal deadlines, and reminders.',
      to: ROUTES.CALENDAR,
      Icon: CalendarDays,
      accent: 'bg-slate-100 text-[#1F2937]',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1F2937]">Personal Life Command</h1>
        <p className="mt-1 text-sm text-[#64748B]">
          All personal goals, habits, cashflow, savings, and schedule modules in one workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map(({ title, metric, description, to, Icon, accent }) => (
          <Link
            key={to}
            to={to}
            className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs hover:border-slate-300 transition-colors flex flex-col justify-between gap-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-[#1F2937] tabular-nums">{metric}</span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">{title}</h2>
              <p className="mt-1 text-xs text-[#64748B] leading-relaxed">{description}</p>
            </div>
            <div className="inline-flex items-center gap-1 text-xs font-medium text-[#DC2626]">
              <span>Open module</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};
