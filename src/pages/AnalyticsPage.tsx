import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Award, BarChart3, ListChecks, Radar, Trophy } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar as RechartsRadar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CompetitionSubNav } from '../components/competition/CompetitionSubNav';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useBusinessDataContext } from '../hooks/useBusinessData';
import { useCompetitionAnalytics } from '../hooks/useCompetitionAnalytics';
import { usePersonalData } from '../hooks/usePersonalData';
import { ROUTES } from '../lib/constants';
import { calculateGoalProgressPct, getEffectiveGoalStatus, getTodayDateString } from '../lib/goalUtils';
import { formatINR, getCurrentMonthKey } from '../lib/moneyUtils';

export const AnalyticsPage: React.FC = () => {
  const { goals, loading: personalLoading } = usePersonalData();
  const { leads, clients, projectPayments, otherIncome, businessExpenses, competitorPendingFindings } =
    useBusinessDataContext();
  const {
    loading: compLoading,
    error,
    competitorMonthlyReviews,
    competitiveGaps,
    gapsProgress,
    comparableRanking,
    activeTarget,
    activeTargetScorecard,
    surpassedCompetitors,
  } = useCompetitionAnalytics();

  const todayStr = getTodayDateString();
  const currentMonth = getCurrentMonthKey();

  const executiveSummary = useMemo(() => {
    const activeGoals = goals.filter((g) => {
      const eff = getEffectiveGoalStatus(g, todayStr);
      return eff !== 'Archived' && eff !== 'Completed';
    });
    const avgGoalPct =
      activeGoals.length > 0
        ? Math.round(
            activeGoals.reduce(
              (s, g) => s + calculateGoalProgressPct(g.currentValue, g.targetValue),
              0
            ) / activeGoals.length
          )
        : 0;

    const monthRevenue =
      projectPayments
        .filter((p) => !p.isDeleted && p.date.startsWith(currentMonth))
        .reduce((s, p) => s + p.amountPaise, 0) +
      otherIncome
        .filter((i) => !i.isDeleted && i.date.startsWith(currentMonth))
        .reduce((s, i) => s + i.amountPaise, 0);

    const monthExpense = businessExpenses
      .filter((e) => !e.isDeleted && e.date.startsWith(currentMonth))
      .reduce((s, e) => s + e.amountPaise, 0);

    const wonLeads = leads.filter((l) => !l.archived && l.status === 'Won').length;
    const convPct = leads.length > 0 ? Math.round((wonLeads / leads.length) * 100) : 0;

    return {
      activeGoalsCount: activeGoals.length,
      avgGoalPct,
      monthRevenue,
      monthExpense,
      clientsCount: clients.length,
      convPct,
    };
  }, [goals, todayStr, projectPayments, otherIncome, businessExpenses, currentMonth, leads, clients]);

  const monthlyTrendData = useMemo(() => {
    if (!activeTarget) return [];
    const map = new Map<string, { month: string; own: number; competitor: number }>();
    const sorted = competitorMonthlyReviews
      .filter((r) => r.competitorId === activeTarget.id)
      .sort((a, b) => a.month.localeCompare(b.month) || a.version - b.version);
    for (const rev of sorted) {
      map.set(rev.month, {
        month: rev.month,
        own: rev.ownOverallScore,
        competitor: rev.competitorOverallScore,
      });
    }
    return Array.from(map.values());
  }, [activeTarget, competitorMonthlyReviews]);

  const radarData = useMemo(() => {
    if (!activeTargetScorecard) return [];
    return activeTargetScorecard.dimensionBreakdowns
      .filter((d) => d.scorecardType === 'Market Presence')
      .map((d) => ({
        dimension: d.label.replace(' & ', ' / '),
        GenZNeuralX: d.ownScore ?? 0,
        Target: d.competitorScore ?? 0,
      }));
  }, [activeTargetScorecard]);

  if (personalLoading || compLoading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-[#DC2626]">
        Failed to load analytics: {error}
      </div>
    );
  }

  const pendingCount = competitorPendingFindings.filter((f) => f.decision === 'Pending').length;
  const openGapsCount = competitiveGaps.filter(
    (g) => g.status === 'Open' || g.status === 'In Progress'
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Executive &amp; Competition Analytics</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Unified telemetry across GoalX execution, cashflow, comparable competitor ranking, and gap closure.
          </p>
        </div>

        <Link
          to={ROUTES.COMPETITION_COMPARE}
          className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] self-start"
        >
          <span>Open Comparison Studio</span>
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      <CompetitionSubNav pendingCount={pendingCount} openGapsCount={openGapsCount} />

      {/* Executive KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Active Goal Velocity</p>
          <p className="mt-1 text-2xl font-bold text-[#1F2937] tabular-nums">
            {executiveSummary.avgGoalPct}%
          </p>
          <p className="mt-0.5 text-xs text-[#64748B] tabular-nums">
            {executiveSummary.activeGoalsCount} active personal goals
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Company Cashflow ({currentMonth})</p>
          <p className="mt-1 text-2xl font-bold text-[#16A34A] tabular-nums">
            {formatINR(executiveSummary.monthRevenue)}
          </p>
          <p className="mt-0.5 text-xs text-[#64748B] tabular-nums">
            Exp: {formatINR(executiveSummary.monthExpense)} · {executiveSummary.clientsCount} clients
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Comparable Ranking</p>
          {comparableRanking.hasData && comparableRanking.ownRank ? (
            <>
              <p className="mt-1 text-2xl font-bold text-[#2563EB] tabular-nums">
                #{comparableRanking.ownRank} of {comparableRanking.totalRanked}
              </p>
              <p className="mt-0.5 text-xs text-[#64748B]">
                {surpassedCompetitors.length} surpassed competitor(s)
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm font-bold text-[#F59E0B]">Not enough comparable data</p>
              <p className="mt-0.5 text-xs text-[#64748B]">Need ≥ 5 comparable metrics</p>
            </>
          )}
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Gap Closure Progress</p>
          <p className="mt-1 text-2xl font-bold text-[#1F2937] tabular-nums">
            {gapsProgress.avgProgressPct}%
          </p>
          <p className="mt-0.5 text-xs text-[#64748B] tabular-nums">
            {gapsProgress.completedCount} of {gapsProgress.totalActive} gaps done
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Comparable Leaderboard */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#DC2626]" />
              <h2 className="text-base font-semibold text-[#1F2937]">
                Comparable Competitive Leaderboard
              </h2>
            </div>
            <Link to={ROUTES.COMPETITION_SCORECARDS} className="text-xs font-medium text-[#2563EB] hover:underline">
              Scorecards
            </Link>
          </div>

          {!comparableRanking.hasData ? (
            <EmptyState
              title="Not enough comparable data for ranking"
              description="Rate at least 5 Verified or User Entered metrics on both Gen Z Neural-X and a competitor in Scorecards."
              actionLabel="Open Scorecards"
              onAction={() => window.location.assign(ROUTES.COMPETITION_SCORECARDS)}
              icon={<Award className="w-5 h-5" />}
            />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparableRanking.entries} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    tick={{ fontSize: 11, fill: '#1F2937' }}
                  />
                  <Tooltip />
                  <Bar dataKey="score" name="Overall Score" fill="#DC2626" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Market Presence Radar */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-base font-semibold text-[#1F2937]">
                Market Presence Radar ({activeTarget?.companyName || 'Active Target'})
              </h2>
            </div>
            <Link to={ROUTES.COMPETITION_COMPARE} className="text-xs font-medium text-[#DC2626] hover:underline">
              Compare All
            </Link>
          </div>

          {!activeTarget || radarData.length === 0 ? (
            <EmptyState
              title="No Active Target selected"
              description="Select an Active Target in Competition Radar to view its Market Presence breakdown."
              actionLabel="Select Target"
              onAction={() => window.location.assign(ROUTES.COMPETITION)}
            />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#E2E8F0" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: '#64748B' }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <RechartsRadar
                    name="Gen Z Neural-X"
                    dataKey="GenZNeuralX"
                    stroke="#DC2626"
                    fill="#DC2626"
                    fillOpacity={0.25}
                  />
                  <RechartsRadar
                    name={activeTarget.companyName}
                    dataKey="Target"
                    stroke="#2563EB"
                    fill="#2563EB"
                    fillOpacity={0.2}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Monthly Score Progression & Surpassed Archive */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-[#1F2937]">
            Monthly Score Progression ({activeTarget?.companyName || 'Active Target'})
          </h2>
          {monthlyTrendData.length === 0 ? (
            <p className="text-xs text-[#64748B] py-10 text-center">
              Save monthly review snapshots in Scorecards to plot progression over time.
            </p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="own" name="Gen Z Neural-X" stroke="#DC2626" strokeWidth={2} />
                  <Line
                    type="monotone"
                    dataKey="competitor"
                    name={activeTarget?.companyName || 'Target'}
                    stroke="#2563EB"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#16A34A]" />
              <h2 className="text-base font-semibold text-[#1F2937]">Surpassed Archive</h2>
            </div>
            <Link to={ROUTES.COMPETITION_GAPS} className="text-xs font-medium text-[#2563EB] hover:underline">
              <span className="inline-flex items-center gap-1">
                <ListChecks className="w-3.5 h-3.5" />
                Gaps
              </span>
            </Link>
          </div>

          {surpassedCompetitors.length === 0 ? (
            <p className="text-xs text-[#64748B]">
              No competitors surpassed yet. Complete all 6 Surpass verification checks in Scorecards
              to generate your first Achievement Report.
            </p>
          ) : (
            <ul className="divide-y divide-[#E2E8F0]">
              {surpassedCompetitors.map((comp) => (
                <li key={comp.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1F2937] truncate">{comp.companyName}</p>
                    <p className="text-[#64748B] tabular-nums">
                      Surpassed {comp.surpassedDate || 'recorded'}
                    </p>
                  </div>
                  <Link
                    to={`${ROUTES.COMPETITION_REPORT}/${comp.id}`}
                    className="font-semibold text-[#16A34A] hover:underline shrink-0"
                  >
                    Report &rarr;
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
