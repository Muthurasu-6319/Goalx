import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  Compass,
  Download,
  Loader2,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CompetitionSubNav } from '../components/competition/CompetitionSubNav';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useBusinessDataContext } from '../hooks/useBusinessData';
import { useCompetitionAnalytics } from '../hooks/useCompetitionAnalytics';
import { useToast } from '../hooks/useToast';
import { ROUTES } from '../lib/constants';
import { NextCompetitorsResult, researchNextCompetitors } from '../services/competitorAiClient';
import {
  exportAchievementReportCsv,
  setActiveCompetitorTarget,
} from '../services/competitorScoreService';

export const CompetitorAchievementReportPage: React.FC = () => {
  const { competitorId } = useParams<{ competitorId: string }>();
  const navigate = useNavigate();
  const { competitorPendingFindings } = useBusinessDataContext();
  const {
    loading,
    error,
    competitors,
    competitorComparisons,
    competitorMonthlyReviews,
    competitiveGaps,
    scorecardByCompetitor,
    candidateNextTargets,
  } = useCompetitionAnalytics();
  const { showToast } = useToast();

  const [researching, setResearching] = useState(false);
  const [nextResult, setNextResult] = useState<NextCompetitorsResult | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const competitor = useMemo(
    () => competitors.find((c) => c.id === competitorId) ?? null,
    [competitors, competitorId]
  );

  const scorecard = competitor ? scorecardByCompetitor.get(competitor.id) ?? null : null;

  const reviews = useMemo(() => {
    if (!competitor) return [];
    return competitorMonthlyReviews
      .filter((r) => r.competitorId === competitor.id)
      .sort((a, b) => a.month.localeCompare(b.month) || a.version - b.version);
  }, [competitor, competitorMonthlyReviews]);

  const archiveSnapshot = useMemo(() => {
    if (!competitor) return null;
    return (
      competitorComparisons.find(
        (c) => c.competitorId === competitor.id && c.snapshotKind === 'surpassed_archive'
      ) ?? null
    );
  }, [competitor, competitorComparisons]);

  const gapsClosedCount = useMemo(() => {
    if (!competitor) return 0;
    return competitiveGaps.filter(
      (g) => g.linkedCompetitorIds.includes(competitor.id) && g.status === 'Done'
    ).length;
  }, [competitor, competitiveGaps]);

  const progressionData = useMemo(() => {
    const map = new Map<string, { month: string; own: number; competitor: number }>();
    for (const r of reviews) {
      map.set(r.month, {
        month: r.month,
        own: r.ownOverallScore,
        competitor: r.competitorOverallScore,
      });
    }
    return Array.from(map.values());
  }, [reviews]);

  const handleExportCsv = () => {
    if (!competitor || !scorecard) return;
    exportAchievementReportCsv({
      competitor,
      scorecard,
      reviews,
      gapsClosedCount,
    });
    showToast('Achievement report CSV downloaded', { variant: 'success' });
  };

  const handleResearchNext = async () => {
    if (!competitor) return;
    setResearching(true);
    try {
      const res = await researchNextCompetitors({
        surpassedCompetitorId: competitor.id,
        region: competitor.location || 'Tamil Nadu',
      });
      if (!res.ok) {
        showToast('Could not research next competitors', {
          description: res.error,
          variant: 'warning',
        });
        return;
      }
      setNextResult(res);
      showToast(
        res.mode === 'ai_pending_review'
          ? `Queued ${res.queuedPendingCount ?? 3} candidates in Pending Review`
          : 'Loaded next candidate competitors',
        { variant: 'success' }
      );
    } finally {
      setResearching(false);
    }
  };

  const handleSetNextTarget = async (nextId: string) => {
    setActivatingId(nextId);
    try {
      await setActiveCompetitorTarget({
        targetCompetitorId: nextId,
        allCompetitors: competitors,
      });
      showToast('Next Active Target selected!', { variant: 'success' });
      navigate(ROUTES.COMPETITION_SCORECARDS);
    } catch (err) {
      showToast('Failed to switch Active Target', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setActivatingId(null);
    }
  };

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-[#DC2626]">
        Failed to load achievement report: {error}
      </div>
    );
  }

  if (!competitor || !scorecard) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 space-y-4">
        <p className="text-base font-semibold text-[#1F2937]">Competitor report not found</p>
        <Link
          to={ROUTES.COMPETITION}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#DC2626] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Competition Radar</span>
        </Link>
      </div>
    );
  }

  const firstReview = reviews[0] ?? null;
  const pendingCount = competitorPendingFindings.filter((f) => f.decision === 'Pending').length;
  const openGapsCount = competitiveGaps.filter(
    (g) => g.status === 'Open' || g.status === 'In Progress'
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            to={ROUTES.COMPETITION}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#64748B] hover:text-[#1F2937]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Competition Radar</span>
          </Link>
          <h1 className="text-2xl font-bold text-[#1F2937]">
            Competitive Achievement Report: {competitor.companyName}
          </h1>
          <p className="text-xs text-[#64748B]">
            {competitor.status === 'Surpassed'
              ? `Surpassed on ${competitor.surpassedDate || 'recorded date'} · Archived in Gen Z Neural-X milestone history`
              : `Current Status: ${competitor.status} (complete all 6 Surpass checks in Scorecards to lock this milestone)`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#1F2937] hover:bg-slate-50 cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#2563EB]" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            disabled={researching}
            onClick={() => void handleResearchNext()}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] cursor-pointer disabled:opacity-50"
          >
            {researching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>Research 3 Next Targets</span>
          </button>
        </div>
      </div>

      <CompetitionSubNav pendingCount={pendingCount} openGapsCount={openGapsCount} />

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Status &amp; Date</p>
          <p className="mt-1 text-lg font-bold text-[#16A34A] flex items-center gap-1.5">
            <Trophy className="w-4 h-4" />
            <span>{competitor.status}</span>
          </p>
          <p className="mt-0.5 text-xs text-[#64748B] tabular-nums">
            {competitor.surpassedDate || 'Pending confirmation'}
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Final Score Advantage</p>
          <p className="mt-1 text-2xl font-bold text-[#1F2937] tabular-nums">
            +{archiveSnapshot?.scoreAdvantage ?? scorecard.scoreAdvantage ?? 0} pts
          </p>
          <p className="mt-0.5 text-xs text-[#64748B] tabular-nums">
            You {archiveSnapshot?.ownOverallScore ?? scorecard.ownOverallScore ?? '—'} vs{' '}
            {archiveSnapshot?.competitorOverallScore ?? scorecard.competitorOverallScore ?? '—'}
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Metrics Led</p>
          <p className="mt-1 text-2xl font-bold text-[#2563EB] tabular-nums">
            {archiveSnapshot?.ownLeadCount ?? scorecard.ahead.length} /{' '}
            {archiveSnapshot?.comparableCount ?? scorecard.comparableCount}
          </p>
          <p className="mt-0.5 text-xs text-[#64748B]">Comparable verified/entered</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Gaps Closed</p>
          <p className="mt-1 text-2xl font-bold text-[#16A34A] tabular-nums">
            {archiveSnapshot?.gapsClosedCount ?? gapsClosedCount}
          </p>
          <p className="mt-0.5 text-xs text-[#64748B]">Phase 6 XP: Pending Phase 6</p>
        </div>
      </div>

      {/* Before vs After + Monthly Progression */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[#16A34A]" />
            <h2 className="text-base font-semibold text-[#1F2937]">Before vs After Journey</h2>
          </div>

          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 space-y-1">
              <p className="font-semibold text-[#64748B]">Baseline Snapshot</p>
              {firstReview ? (
                <p className="text-sm font-bold text-[#1F2937] tabular-nums">
                  {firstReview.month}: You {firstReview.ownOverallScore} vs{' '}
                  {firstReview.competitorOverallScore} ({firstReview.scoreAdvantage >= 0 ? '+' : ''}
                  {firstReview.scoreAdvantage} pts)
                </p>
              ) : (
                <p className="text-[#64748B]">No prior baseline snapshot recorded.</p>
              )}
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-1">
              <p className="font-semibold text-[#16A34A]">Surpassed Snapshot</p>
              <p className="text-sm font-bold text-[#1F2937] tabular-nums">
                You {archiveSnapshot?.ownOverallScore ?? scorecard.ownOverallScore ?? '—'} vs{' '}
                {archiveSnapshot?.competitorOverallScore ?? scorecard.competitorOverallScore ?? '—'} (
                +{archiveSnapshot?.scoreAdvantage ?? scorecard.scoreAdvantage ?? 0} pts)
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-[#E2E8F0] space-y-1.5">
            <p className="text-xs font-semibold text-[#1F2937]">Top Metrics Led:</p>
            <ul className="space-y-1 text-xs text-[#64748B]">
              {scorecard.ahead.slice(0, 5).map((m) => (
                <li key={m.metricKey} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                  <span className="truncate">
                    {m.metricName} ({m.ownScore} vs {m.competitorScore})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-[#1F2937]">Monthly Progression Curve</h2>
          {progressionData.length === 0 ? (
            <p className="text-xs text-[#64748B] py-12 text-center">
              Monthly snapshot trend will appear here as reviews are saved.
            </p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progressionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="own"
                    name="Gen Z Neural-X"
                    stroke="#16A34A"
                    strokeWidth={2.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="competitor"
                    name={competitor.companyName}
                    stroke="#64748B"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Next Level Target Selection */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">Choose Your Next Competitive Target</h2>
            <p className="text-xs text-[#64748B]">
              Select a higher-tier regional/national competitor manually or review AI-researched candidates.
            </p>
          </div>
          <Link
            to={ROUTES.COMPETITION_DISCOVER}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] hover:underline"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Open Discovery Queue</span>
          </Link>
        </div>

        {nextResult?.mode === 'ai_pending_review' && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center justify-between gap-3 text-xs text-blue-900">
            <span>
              <strong>{nextResult.queuedPendingCount ?? 3}</strong> next-level competitor candidates
              were queued in Pending Review. Verify them before activating.
            </span>
            <Link to={ROUTES.COMPETITION_DISCOVER} className="font-semibold text-[#DC2626] hover:underline shrink-0">
              Review Queue &rarr;
            </Link>
          </div>
        )}

        {candidateNextTargets.length === 0 ? (
          <p className="text-xs text-[#64748B]">
            No other Candidate or Active competitors in your list yet. Use Research 3 Next Targets or
            add one in Competition Radar.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {candidateNextTargets.slice(0, 6).map((cand) => (
              <div
                key={cand.id}
                className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">{cand.companyName}</p>
                  <p className="text-xs text-[#64748B]">
                    {cand.location || cand.marketLevel} · {cand.classification}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={activatingId === cand.id}
                  onClick={() => void handleSetNextTarget(cand.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#DC2626] hover:underline cursor-pointer"
                >
                  {activatingId === cand.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5" />
                  )}
                  <span>Set as Next Active Target</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
