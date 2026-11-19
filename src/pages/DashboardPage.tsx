import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowUpRight,
  Briefcase,
  Building2,
  CalendarDays,
  CheckSquare,
  Flame,
  FolderKanban,
  PiggyBank,
  Radar,
  Settings,
  Target,
  Trophy,
  Wallet,
} from 'lucide-react';
import { DailyBriefingCard } from '../components/ai/DailyBriefingCard';
import { DailyFocusCard } from '../components/dashboard/DailyFocusCard';
import { EmptyState } from '../components/ui/EmptyState';
import { QuickDataModal, QuickModalSection } from '../components/ui/QuickDataModal';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAiCeo } from '../hooks/useAiCeo';
import { useAuth } from '../hooks/useAuth';
import { useClients } from '../hooks/useClients';
import { useCompetitionAnalytics } from '../hooks/useCompetitionAnalytics';
import { useCompetitors } from '../hooks/useCompetitors';
import { useFinance } from '../hooks/useFinance';
import { useInvoices } from '../hooks/useInvoices';
import { useLeads } from '../hooks/useLeads';
import { usePersonalData } from '../hooks/usePersonalData';
import { useServices } from '../hooks/useServices';
import {
  computeCrmMetrics,
  computeStageDistribution,
  getFollowUpBuckets,
} from '../lib/businessUtils';
import { formatLastVerifiedLabel } from '../lib/competitorUtils';
import { getGreeting, ROUTES } from '../lib/constants';
import { getMonthBounds } from '../lib/financeUtils';
import {
  calculateGoalProgressPct,
  getEffectiveGoalStatus,
  getTodayDateString,
} from '../lib/goalUtils';
import { calculateHabitStreaks, isHabitScheduledOnDate } from '../lib/habitUtils';
import {
  formatINR,
  getCurrentMonthKey,
  getLastNMonthKeys,
  paiseToRupees,
  sumSavingsTransactionsPaise,
} from '../lib/moneyUtils';

export const DashboardPage: React.FC = () => {
  const { dataLoading, dataError, userProfile, companyProfile } = useAuth();
  const {
    loading: personalLoading,
    goals,
    habits,
    habitLogs,
    incomes,
    expenses,
    savingsGoals,
    savingsTransactions,
    calendarEvents,
  } = usePersonalData();
  const { leads, loading: leadsLoading } = useLeads();
  const { clients, loading: clientsLoading } = useClients();
  const { services, loading: servicesLoading } = useServices();
  const {
    loading: competitorsLoading,
    competitors,
    competitorEvidence,
    aggregateStats: compStats,
  } = useCompetitors();
  const {
    activeTarget,
    activeTargetScorecard,
    comparableRanking,
    gapsProgress,
  } = useCompetitionAnalytics();

  const {
    todayDailyBriefing,
    briefingGenerating,
    generateBriefing,
    pendingProposals,
    ist,
  } = useAiCeo();

  const [modalSection, setModalSection] = useState<QuickModalSection | null>(null);
  const navigate = useNavigate();

  const todayStr = getTodayDateString();
  const currentMonthKey = getCurrentMonthKey();
  const currentMonthBounds = useMemo(() => getMonthBounds(currentMonthKey), [currentMonthKey]);
  const { summary: companyFinanceSummary, loading: financeLoading } = useFinance(
    currentMonthBounds.start,
    currentMonthBounds.end,
    'cash'
  );
  const { derivedInvoices } = useInvoices();

  // Personal Goals live summary
  const goalStats = useMemo(() => {
    let active = 0;
    let completed = 0;
    let delayed = 0;
    let pctSum = 0;
    const activeList = goals
      .map((g) => ({
        goal: g,
        effectiveStatus: getEffectiveGoalStatus(g, todayStr),
        pct: calculateGoalProgressPct(g.currentValue, g.targetValue),
      }))
      .filter((item) => item.effectiveStatus !== 'Archived');

    for (const item of activeList) {
      if (item.effectiveStatus === 'Completed') {
        completed++;
      } else {
        active++;
        pctSum += item.pct;
        if (item.effectiveStatus === 'Delayed') {
          delayed++;
        }
      }
    }

    const avgActivePct = active > 0 ? Math.round(pctSum / active) : 0;
    return {
      totalNonArchived: activeList.length,
      active,
      completed,
      delayed,
      avgActivePct,
      topActive: activeList
        .filter((i) => i.effectiveStatus !== 'Completed')
        .sort((a, b) => (a.goal.targetDate || '9999-99-99').localeCompare(b.goal.targetDate || '9999-99-99'))
        .slice(0, 4),
    };
  }, [goals, todayStr]);

  // Habits live summary strictly from habitLogs
  const habitStats = useMemo(() => {
    const activeHabits = habits.filter((h) => h.active);
    const logsByHabit = new Map<string, typeof habitLogs>();
    for (const log of habitLogs) {
      const arr = logsByHabit.get(log.habitId) ?? [];
      arr.push(log);
      logsByHabit.set(log.habitId, arr);
    }

    const scheduledToday = activeHabits.filter((h) => isHabitScheduledOnDate(h, todayStr));
    const completedTodayCount = scheduledToday.filter((h) => {
      const hLogs = logsByHabit.get(h.id) ?? [];
      return hLogs.some((l) => l.date === todayStr && l.completed);
    }).length;

    const todayCompletionPct =
      scheduledToday.length > 0
        ? Math.round((completedTodayCount / scheduledToday.length) * 100)
        : 0;

    let bestCurrentStreak = 0;
    let bestCurrentUnit: 'days' | 'wks' = 'days';
    let bestStreakHabitTitle = '';
    let bestLongestStreak = 0;

    for (const habit of activeHabits) {
      const hLogs = logsByHabit.get(habit.id) ?? [];
      const res = calculateHabitStreaks(habit, hLogs, todayStr);
      if (res.currentStreak > bestCurrentStreak) {
        bestCurrentStreak = res.currentStreak;
        bestCurrentUnit = habit.scheduleType === 'weekly_target' ? 'wks' : 'days';
        bestStreakHabitTitle = habit.name;
      }
      if (res.longestStreak > bestLongestStreak) {
        bestLongestStreak = res.longestStreak;
      }
    }

    return {
      totalHabits: habits.length,
      activeCount: activeHabits.length,
      scheduledTodayCount: scheduledToday.length,
      completedTodayCount,
      todayCompletionPct,
      bestCurrentStreak,
      bestCurrentUnit,
      bestStreakHabitTitle,
      bestLongestStreak,
      hasAnyLogs: habitLogs.some((l) => l.completed),
    };
  }, [habits, habitLogs, todayStr]);

  // Personal Finance live summary (integer paise, strictly separate from company finance)
  const financeStats = useMemo(() => {
    const monthIncomePaise = incomes
      .filter((i) => i.date.startsWith(currentMonthKey))
      .reduce((sum, i) => sum + i.amountPaise, 0);
    const monthExpensePaise = expenses
      .filter((e) => e.date.startsWith(currentMonthKey))
      .reduce((sum, e) => sum + e.amountPaise, 0);
    const netSavingsPaise = monthIncomePaise - monthExpensePaise;
    const totalVaultSavedPaise = sumSavingsTransactionsPaise(savingsTransactions);

    const last6Months = getLastNMonthKeys(6).map(({ key, label }) => {
      const inc = incomes
        .filter((i) => i.date.startsWith(key))
        .reduce((sum, i) => sum + i.amountPaise, 0);
      const exp = expenses
        .filter((e) => e.date.startsWith(key))
        .reduce((sum, e) => sum + e.amountPaise, 0);
      return {
        month: label,
        income: paiseToRupees(inc),
        expense: paiseToRupees(exp),
      };
    });

    const hasRecords =
      incomes.length > 0 || expenses.length > 0 || savingsGoals.length > 0;

    return {
      hasRecords,
      monthIncomePaise,
      monthExpensePaise,
      netSavingsPaise,
      totalVaultSavedPaise,
      last6Months,
    };
  }, [incomes, expenses, savingsGoals, savingsTransactions, currentMonthKey]);

  // Business CRM live summary (Phase 3A)
  const crmMetrics = useMemo(() => computeCrmMetrics(leads), [leads]);
  const stageDistribution = useMemo(() => computeStageDistribution(leads), [leads]);
  const followUpBuckets = useMemo(() => getFollowUpBuckets(leads, todayStr), [leads, todayStr]);
  const activeServicesCount = useMemo(
    () => services.filter((s) => s.status === 'Active').length,
    [services]
  );

  // Upcoming Calendar Events + Goal Deadlines + Client/Lead Follow-ups
  const upcomingItems = useMemo(() => {
    const syncedLeadIds = new Set(
      calendarEvents.filter((ev) => ev.sourceType === 'lead').map((ev) => ev.sourceId)
    );

    const manual = calendarEvents
      .filter((ev) => ev.date >= todayStr)
      .map((ev) => ({
        id: ev.id,
        title: ev.title,
        type: ev.eventType,
        date: ev.date,
        time: ev.allDay ? 'All day' : ev.startTime || '',
        href:
          ev.sourceType === 'lead'
            ? ROUTES.COMPANY_LEADS
            : ev.sourceType === 'invoice'
              ? `${ROUTES.COMPANY_FINANCE}?tab=invoices`
              : ev.sourceType === 'competitiveGap'
                ? ROUTES.COMPETITION_GAPS
                : ev.sourceType === 'competitor' && ev.sourceId
                  ? `${ROUTES.COMPETITION}/${ev.sourceId}`
                  : ROUTES.CALENDAR,
      }));

    const unsyncedLeadFollowUps = leads
      .filter(
        (l) =>
          !l.archived &&
          l.status !== 'Won' &&
          l.status !== 'Lost' &&
          l.followUpDate &&
          l.followUpDate >= todayStr &&
          !syncedLeadIds.has(l.id)
      )
      .map((l) => ({
        id: `lead-fu-${l.id}`,
        title: `Follow up: ${l.clientName}${l.businessName ? ` (${l.businessName})` : ''}`,
        type: 'Client Follow-up' as const,
        date: l.followUpDate,
        time: 'CRM follow-up',
        href: ROUTES.COMPANY_LEADS,
      }));

    const goalDeadlines = goals
      .filter((g) => {
        const eff = getEffectiveGoalStatus(g, todayStr);
        return eff !== 'Completed' && eff !== 'Archived' && g.targetDate && g.targetDate >= todayStr;
      })
      .map((g) => ({
        id: `goal-${g.id}`,
        title: g.title,
        type: 'Goal Deadline' as const,
        date: g.targetDate,
        time: 'Target date',
        href: ROUTES.GOALS,
      }));

    return [...manual, ...unsyncedLeadFollowUps, ...goalDeadlines]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
  }, [calendarEvents, leads, goals, todayStr]);

  const overdueInvoicesCount = useMemo(
    () => derivedInvoices.filter((d) => d.status === 'Overdue').length,
    [derivedInvoices]
  );

  const latestEvidenceItems = useMemo(() => {
    const compNameMap = new Map(competitors.map((c) => [c.id, c.companyName]));
    return competitorEvidence.slice(0, 4).map((ev) => ({
      ...ev,
      competitorName: compNameMap.get(ev.competitorId) || 'Competitor',
    }));
  }, [competitorEvidence, competitors]);

  if (
    dataLoading ||
    personalLoading ||
    leadsLoading ||
    clientsLoading ||
    servicesLoading ||
    financeLoading ||
    competitorsLoading
  ) {
    return <DashboardSkeleton />;
  }

  if (dataError) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-[#DC2626]">
        Unable to load dashboard data: {dataError}
      </div>
    );
  }

  const xp = userProfile?.xp ?? 0;
  const level = userProfile?.level ?? 1;
  const streakDays = userProfile?.streakDays ?? 0;
  const xpIntoLevel = xp % 250;
  const xpProgressPct = Math.min(100, Math.round((xpIntoLevel / 250) * 100));

  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  return (
    <div className="space-y-6">
      {/* Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1F2937]">
            {getGreeting(userProfile?.name)}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#64748B]">
            <span>{todayFormatted}</span>
            <span aria-hidden="true">·</span>
            <span>{companyProfile?.name || 'Gen Z Neural-X'}</span>
            {companyProfile?.stage && (
              <>
                <span aria-hidden="true">·</span>
                <span>{companyProfile.stage}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setModalSection('gamification')}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Flame className="w-4 h-4" />
            <span>Daily Check-In</span>
          </button>
          <Link
            to={ROUTES.SETTINGS}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium text-[#1F2937] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Settings className="w-4 h-4 text-[#64748B]" />
            <span className="hidden sm:inline">Settings</span>
          </Link>
        </div>
      </div>

      {/* Daily Focus (Top Priority Personal Goals) */}
      <DailyFocusCard />

      {/* GoalX AI CEO Daily Briefing */}
      <DailyBriefingCard
        briefing={todayDailyBriefing}
        briefingType="daily"
        onGenerate={(type, regen) => void generateBriefing(type, regen)}
        loading={briefingGenerating}
        compactOnDashboard
        isSunday={ist.dayOfWeek === 0}
        isFirstOfMonth={ist.dayOfMonth === 1}
        pendingProposalCount={pendingProposals.length}
      />

      {/* Personal Management Command Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Personal Goals */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-[#DC2626] flex items-center justify-center">
                <Target className="w-[18px] h-[18px]" />
              </div>
              <h2 className="text-sm font-semibold text-[#1F2937]">Personal Goals</h2>
            </div>
            <Link to={ROUTES.GOALS} className="text-xs font-medium text-[#DC2626] hover:underline">
              Open
            </Link>
          </div>

          {goalStats.totalNonArchived > 0 ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-xs text-[#64748B]">Active / Completed</p>
                  <p className="mt-0.5 text-2xl font-bold text-[#1F2937] tabular-nums">
                    {goalStats.active} <span className="text-sm font-medium text-[#64748B]">/ {goalStats.completed} done</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#64748B]">Avg Progress</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#16A34A] tabular-nums">
                    {goalStats.avgActivePct}%
                  </p>
                </div>
              </div>
              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
                <span className="text-[#64748B]">Delayed targets</span>
                <span className={`font-semibold tabular-nums ${goalStats.delayed > 0 ? 'text-[#DC2626]' : 'text-[#1F2937]'}`}>
                  {goalStats.delayed}
                </span>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No personal goals yet"
              description="Create measurable targets with milestones and progress tracking."
              actionLabel="Add goal"
              onAction={() => navigate(ROUTES.GOALS)}
            />
          )}
        </section>

        {/* 2. Habit Completion (Today) */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#16A34A] flex items-center justify-center">
                <CheckSquare className="w-[18px] h-[18px]" />
              </div>
              <h2 className="text-sm font-semibold text-[#1F2937]">Habit Completion</h2>
            </div>
            <Link to={ROUTES.HABITS} className="text-xs font-medium text-[#DC2626] hover:underline">
              Check in
            </Link>
          </div>

          {habitStats.activeCount > 0 ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-[#64748B]">Today</p>
                <p className="mt-0.5 text-2xl font-bold text-[#1F2937] tabular-nums">
                  {habitStats.todayCompletionPct}%
                </p>
              </div>
              <div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full bg-[#16A34A] transition-all duration-300"
                    style={{ width: `${habitStats.todayCompletionPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-[#64748B] tabular-nums">
                  <span>Scheduled today</span>
                  <span className="font-semibold text-[#1F2937]">
                    {habitStats.completedTodayCount} / {habitStats.scheduledTodayCount}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No habits tracked"
              description="Set up daily or weekday routines to measure today's execution."
              actionLabel="Add habit"
              onAction={() => navigate(ROUTES.HABITS)}
            />
          )}
        </section>

        {/* 3. Current Streak (from real habitLogs) */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#F59E0B] flex items-center justify-center">
                <Flame className="w-[18px] h-[18px]" />
              </div>
              <h2 className="text-sm font-semibold text-[#1F2937]">Current Streak</h2>
            </div>
            <Link to={ROUTES.HABITS} className="text-xs font-medium text-[#DC2626] hover:underline">
              History
            </Link>
          </div>

          {habitStats.activeCount > 0 ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-[#64748B]">Top Habit Streak</p>
                <p className="mt-0.5 text-2xl font-bold text-[#1F2937] tabular-nums">
                  {habitStats.bestCurrentStreak}{' '}
                  <span className="text-sm font-medium text-[#64748B]">
                    {habitStats.bestCurrentUnit}
                  </span>
                </p>
              </div>
              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs gap-2">
                <span className="text-[#64748B] truncate">
                  {habitStats.bestStreakHabitTitle || 'Log a habit today'}
                </span>
                <span className="font-semibold text-[#1F2937] tabular-nums shrink-0">
                  Best: {habitStats.bestLongestStreak}
                </span>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No streak yet"
              description="Your schedule-aware streak updates automatically from habit check-ins."
              actionLabel="Start habit"
              onAction={() => navigate(ROUTES.HABITS)}
            />
          )}
        </section>

        {/* 4. Personal Finance (INR, strictly separate from company) */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center">
                <Wallet className="w-[18px] h-[18px]" />
              </div>
              <h2 className="text-sm font-semibold text-[#1F2937]">Personal Finance</h2>
            </div>
            <Link to={ROUTES.LIFE_INCOME} className="text-xs font-medium text-[#DC2626] hover:underline">
              Ledger
            </Link>
          </div>

          {financeStats.hasRecords ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-[#64748B]">Net Savings (This Month)</p>
                <p
                  className={`mt-0.5 text-2xl font-bold tabular-nums ${
                    financeStats.netSavingsPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                  }`}
                >
                  {formatINR(financeStats.netSavingsPaise)}
                </p>
              </div>
              <div className="pt-3 border-t border-[#E2E8F0] grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[#64748B] block">Income</span>
                  <span className="font-semibold text-[#1F2937] tabular-nums">
                    {formatINR(financeStats.monthIncomePaise)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[#64748B] block">Expenses</span>
                  <span className="font-semibold text-[#1F2937] tabular-nums">
                    {formatINR(financeStats.monthExpensePaise)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No personal ledger yet"
              description="Track personal income, expenses, and savings goals in INR separately from company cashflow."
              actionLabel="Add entry"
              onAction={() => navigate(ROUTES.LIFE_INCOME)}
            />
          )}
        </section>
      </div>

      {/* Executive Overview Row (Business CRM, Business Finance/Projects Placeholders, Competition, Gamification) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Business CRM Card (live New Leads & Conversion Rate) */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-[#DC2626] flex items-center justify-center">
                <Briefcase className="w-[18px] h-[18px]" />
              </div>
              <h2 className="text-sm font-semibold text-[#1F2937]">Business CRM</h2>
            </div>
            <Link to={ROUTES.COMPANY_LEADS} className="text-xs font-medium text-[#DC2626] hover:underline">
              Pipeline
            </Link>
          </div>

          {crmMetrics.totalLeads > 0 || clients.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-xs text-[#64748B]">New Leads</p>
                  <p className="mt-0.5 text-2xl font-bold text-[#1F2937] tabular-nums">
                    {crmMetrics.newLeads}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#64748B]">Conversion Rate</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#16A34A] tabular-nums">
                    {crmMetrics.conversionRatePct}%
                  </p>
                </div>
              </div>
              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
                <span className="text-[#64748B]">Total Clients / Total Leads</span>
                <span className="font-semibold text-[#1F2937] tabular-nums">
                  {clients.length} / {crmMetrics.totalLeads}
                </span>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No CRM leads yet"
              description="Add leads to track New Leads and live Conversion Rate."
              actionLabel="Add lead"
              onAction={() => navigate(ROUTES.COMPANY_LEADS)}
            />
          )}
        </section>

        {/* Live Company Projects & Finance Card */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center">
                <FolderKanban className="w-[18px] h-[18px]" />
              </div>
              <h2 className="text-sm font-semibold text-[#1F2937]">Projects &amp; Finance</h2>
            </div>
            <Link to={ROUTES.COMPANY_FINANCE} className="text-xs font-medium text-[#DC2626] hover:underline">
              Finance
            </Link>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">Active Projects</span>
              <Link to={ROUTES.PROJECTS} className="font-semibold text-[#1F2937] hover:text-[#DC2626] tabular-nums">
                {companyFinanceSummary.activeProjectCount} active ({companyFinanceSummary.confirmedProjectCount} conf.)
              </Link>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">Month Revenue (Cash)</span>
              <span className="font-semibold text-[#16A34A] tabular-nums">
                {formatINR(companyFinanceSummary.revenuePaise)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">Month Expenses</span>
              <span className="font-semibold text-[#DC2626] tabular-nums">
                {formatINR(companyFinanceSummary.expensesPaise)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">Net Profit</span>
              <span
                className={`font-semibold tabular-nums ${
                  companyFinanceSummary.netProfitPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                }`}
              >
                {formatINR(companyFinanceSummary.netProfitPaise)}
              </span>
            </div>
            <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
              <span className="text-[#64748B]">
                Receivables
                {overdueInvoicesCount > 0 && (
                  <span className="text-[#DC2626] font-medium"> · {overdueInvoicesCount} overdue</span>
                )}
              </span>
              <Link
                to={`${ROUTES.COMPANY_FINANCE}?tab=invoices`}
                className="font-semibold text-[#F59E0B] hover:underline tabular-nums"
              >
                {formatINR(companyFinanceSummary.totalOutstandingPaise)}
              </Link>
            </div>
          </div>
        </section>

        {/* Competition Card */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#F59E0B] flex items-center justify-center">
                <Radar className="w-[18px] h-[18px]" />
              </div>
              <h2 className="text-sm font-semibold text-[#1F2937]">Competition</h2>
            </div>
            <Link to={ROUTES.COMPETITION} className="text-xs font-medium text-[#DC2626] hover:underline">
              Radar
            </Link>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">Active Target</span>
              <Link
                to={ROUTES.COMPETITION_SCORECARDS}
                className="font-semibold text-[#1F2937] hover:text-[#DC2626] truncate max-w-[150px]"
              >
                {activeTarget?.companyName || 'Not selected'}
              </Link>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">Competitive Score</span>
              <span className="font-semibold text-[#2563EB] tabular-nums">
                {activeTargetScorecard?.hasEnoughComparableData
                  ? `${activeTargetScorecard.ownOverallScore} vs ${activeTargetScorecard.competitorOverallScore}`
                  : 'Not enough data'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">Comparable Ranking</span>
              <span className="font-semibold text-[#1F2937] tabular-nums">
                {comparableRanking.hasData && comparableRanking.ownRank
                  ? `#${comparableRanking.ownRank} of ${comparableRanking.totalRanked}`
                  : `${compStats.avgCoveragePct}% evidence`}
              </span>
            </div>
            <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
              <span className="text-[#64748B]">Open Gaps ({gapsProgress.avgProgressPct}%)</span>
              <Link
                to={ROUTES.COMPETITION_GAPS}
                className="font-semibold text-[#DC2626] hover:underline tabular-nums"
              >
                {gapsProgress.totalActive - gapsProgress.completedCount} active gaps
              </Link>
            </div>
          </div>
        </section>

        {/* Gamification Card */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#16A34A] flex items-center justify-center">
                <Trophy className="w-[18px] h-[18px]" />
              </div>
              <h2 className="text-sm font-semibold text-[#1F2937]">Gamification</h2>
            </div>
            <span className="text-xs font-medium text-[#64748B] tabular-nums">Level {level}</span>
          </div>

          {xp > 0 || streakDays > 0 ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-xs text-[#64748B]">CEO Experience</p>
                  <p className="mt-0.5 text-2xl font-bold text-[#1F2937] tabular-nums">{xp} XP</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#64748B]">Check-In Streak</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#16A34A] tabular-nums">
                    {streakDays} {streakDays === 1 ? 'day' : 'days'}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-[#64748B] mb-1 tabular-nums">
                  <span>Progress to Level {level + 1}</span>
                  <span>{xpIntoLevel} / 250 XP</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#16A34A] transition-all duration-300"
                    style={{ width: `${xpProgressPct}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Start your CEO streak"
              description="Log your first daily check-in to earn XP and start your streak."
              actionLabel="Log check-in"
              onAction={() => setModalSection('gamification')}
            />
          )}
        </section>
      </div>

      {/* Lead Pipeline Summary Section */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">Lead Pipeline</h2>
            <p className="text-xs text-[#64748B]">
              Live stage distribution across {companyProfile?.name || 'Gen Z Neural-X'} CRM
              {followUpBuckets.overdueFollowUps.length > 0 && (
                <span className="text-[#DC2626] font-medium">
                  {' '}
                  · {followUpBuckets.overdueFollowUps.length} overdue follow-up
                  {followUpBuckets.overdueFollowUps.length === 1 ? '' : 's'}
                </span>
              )}
            </p>
          </div>
          <Link
            to={ROUTES.COMPANY_LEADS}
            className="min-h-[36px] inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-50"
          >
            <span>Open Pipeline</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {crmMetrics.totalLeads > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {stageDistribution.map((stage) => (
              <Link
                key={stage.status}
                to={ROUTES.COMPANY_LEADS}
                className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 hover:border-[#DC2626]/40 transition-colors"
              >
                <p className="text-[11px] font-medium text-[#64748B] truncate">{stage.status}</p>
                <p
                  className={`mt-1 text-xl font-bold tabular-nums ${
                    stage.status === 'Won'
                      ? 'text-[#16A34A]'
                      : stage.status === 'Lost'
                        ? 'text-[#64748B]'
                        : 'text-[#1F2937]'
                  }`}
                >
                  {stage.count}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Pipeline is empty"
            description="Capture your first business inquiry in Leads & CRM to monitor stage velocity here."
            actionLabel="Create lead"
            onAction={() => navigate(ROUTES.COMPANY_LEADS)}
          />
        )}
      </section>

      {/* Competitor Intelligence Summary */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">Competitor Intelligence Summary</h2>
            <p className="text-xs text-[#64748B]">
              Latest verified &amp; user-entered competitor evidence ·{' '}
              {compStats.staleCount > 0
                ? `${compStats.staleCount} stale (>90 days)`
                : 'Evidence freshness healthy'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={ROUTES.COMPETITION_DISCOVER}
              className="min-h-[36px] inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-50"
            >
              <span>Discover</span>
            </Link>
            <Link
              to={ROUTES.COMPETITION}
              className="min-h-[36px] inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-50"
            >
              <span>Open Radar</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {latestEvidenceItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {latestEvidenceItems.map((ev) => (
              <Link
                key={ev.id}
                to={`${ROUTES.COMPETITION}/${ev.competitorId}`}
                className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3.5 hover:border-[#DC2626]/40 transition-colors space-y-1"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#1F2937] truncate">{ev.competitorName}</span>
                  <span className="text-[#2563EB] font-medium shrink-0">{ev.dataStatus}</span>
                </div>
                <p className="text-xs font-medium text-[#1F2937] truncate">
                  {ev.metricName}: {ev.value}
                </p>
                <p className="text-[11px] text-[#64748B]">
                  {ev.category} · {formatLastVerifiedLabel(ev.lastVerifiedDate)}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No verified competitor evidence logged yet"
            description="Open a candidate in Competition Radar to log public website, service, and tech evidence."
            actionLabel="Open Competition Radar"
            onAction={() => navigate(ROUTES.COMPETITION)}
          />
        )}
      </section>

      {/* Lower Detail Grid: Personal Cashflow Chart + Upcoming Events & Active Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personal Cashflow (6 Months) */}
        <section className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">Personal Cashflow (Last 6 Months)</h2>
              <p className="text-xs text-[#64748B]">
                Personal income vs. personal expenses in INR — kept separate from company accounts
              </p>
            </div>
            <div className="flex items-center gap-2">
              {savingsGoals.length > 0 && (
                <Link
                  to={ROUTES.LIFE_SAVINGS}
                  className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-50"
                >
                  <PiggyBank className="w-3.5 h-3.5 text-[#16A34A]" />
                  <span>Vault: {formatINR(financeStats.totalVaultSavedPaise)}</span>
                </Link>
              )}
              <Link
                to={ROUTES.LIFE_INCOME}
                className="min-h-[36px] inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-50"
              >
                <span>Open Finance</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {incomes.length > 0 || expenses.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financeStats.last6Months} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#64748B', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val: number) => `₹${val.toLocaleString('en-IN')}`}
                    width={84}
                  />
                  <Tooltip
                    formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`}
                    contentStyle={{
                      borderRadius: '12px',
                      borderColor: '#E2E8F0',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="income" name="Income" fill="#16A34A" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="expense" name="Expenses" fill="#DC2626" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No personal cashflow recorded"
              description="Log your personal salary, freelance income, or expenses to plot your 6-month trend."
              actionLabel="Record income or expense"
              onAction={() => navigate(ROUTES.LIFE_INCOME)}
            />
          )}
        </section>

        {/* Right Column: Upcoming Calendar + Active Goals + Company Overview */}
        <div className="space-y-6">
          {/* Upcoming Events, Deadlines & Client/Lead Follow-ups */}
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#DC2626]" />
                <h2 className="text-base font-semibold text-[#1F2937]">Upcoming Schedule</h2>
              </div>
              <Link to={ROUTES.CALENDAR} className="text-xs font-medium text-[#DC2626] hover:underline">
                Calendar
              </Link>
            </div>

            {upcomingItems.length > 0 ? (
              <ul className="divide-y divide-[#E2E8F0]">
                {upcomingItems.map((item) => (
                  <li key={item.id} className="py-2.5 flex items-start justify-between gap-3">
                    <Link to={item.href} className="min-w-0 flex-1 group">
                      <p className="text-sm font-medium text-[#1F2937] group-hover:text-[#DC2626] truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-[#64748B]">
                        {item.type} · {item.time}
                      </p>
                    </Link>
                    <span className="text-xs font-medium text-[#1F2937] tabular-nums shrink-0">
                      {item.date}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No upcoming events"
                description="Schedule personal events, goal deadlines, or lead follow-ups to see them here."
                actionLabel="Open calendar"
                onAction={() => navigate(ROUTES.CALENDAR)}
              />
            )}
          </section>

          {/* Active Goals Progress & Company Anchor */}
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-5">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-[#1F2937]">Top Active Goals</h2>
                <Link to={ROUTES.GOALS} className="text-xs font-medium text-[#DC2626] hover:underline">
                  View all
                </Link>
              </div>

              {goalStats.topActive.length > 0 ? (
                <div className="space-y-3">
                  {goalStats.topActive.map(({ goal, effectiveStatus, pct }) => (
                    <div key={goal.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-[#1F2937] truncate">{goal.title}</span>
                        <span
                          className={`tabular-nums shrink-0 font-semibold ${
                            effectiveStatus === 'Delayed' ? 'text-[#DC2626]' : 'text-[#64748B]'
                          }`}
                        >
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            effectiveStatus === 'Delayed' ? 'bg-[#DC2626]' : 'bg-[#2563EB]'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#64748B]">
                  No active personal goals right now. Create one in Goals to track progress here.
                </p>
              )}
            </div>

            <div className="pt-4 border-t border-[#E2E8F0]">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#1F2937]">
                  <Building2 className="w-4 h-4 text-[#DC2626]" />
                  <span>{companyProfile?.name || 'Gen Z Neural-X'}</span>
                </div>
                <Link
                  to={ROUTES.COMPANY}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline"
                >
                  <span>Open</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <p className="text-xs text-[#64748B] leading-relaxed">
                {companyProfile?.industry} · {activeServicesCount} active services · {clients.length} clients
              </p>
            </div>
          </section>
        </div>
      </div>

      <QuickDataModal section={modalSection} onClose={() => setModalSection(null)} />
    </div>
  );
};
