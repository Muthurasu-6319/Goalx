import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  ArrowUpRight,
  BookmarkCheck,
  CheckCircle2,
  GitCompareArrows,
  Loader2,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
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
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalculationInfoPopover } from '../components/competition/CalculationInfoPopover';
import { CompetitionSubNav } from '../components/competition/CompetitionSubNav';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useBusinessDataContext } from '../hooks/useBusinessData';
import { useCompetitionAnalytics } from '../hooks/useCompetitionAnalytics';
import { useToast } from '../hooks/useToast';
import { DerivedOwnMetricView } from '../lib/competitorScoringUtils';
import {
  DATA_STATUSES,
  ROUTES,
  SCORECARD_METRIC_DEFS,
  STANDARD_COMPETITOR_METRICS,
} from '../lib/constants';
import { getTodayDateString } from '../lib/goalUtils';
import { OwnMetricFormValues, ownMetricSchema } from '../lib/validators';
import { saveComparisonSnapshot, upsertOwnMetric } from '../services/competitorScoreService';

const SERVICE_COMPARISON_ROWS = STANDARD_COMPETITOR_METRICS.filter(
  (m) => m.category === 'Services'
);

export const CompareCompetitorsPage: React.FC = () => {
  const { firebaseUser } = useAuth();
  const {
    services,
    ownMetrics: savedOwnMetrics,
    competitorPendingFindings,
  } = useBusinessDataContext();
  const {
    loading,
    error,
    normalizedConfig,
    ownMetrics,
    competitors,
    competitorMetrics,
    competitorMonthlyReviews,
    competitiveGaps,
    scorecardByCompetitor,
    activeTarget,
  } = useCompetitionAnalytics();
  const { showToast } = useToast();

  const nonArchived = useMemo(
    () => competitors.filter((c) => c.status !== 'Archived'),
    [competitors]
  );

  const [primaryId, setPrimaryId] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  // Own Metric Edit Modal
  const [editingOwn, setEditingOwn] = useState<DerivedOwnMetricView | null>(null);

  useEffect(() => {
    if (nonArchived.length === 0) return;
    if (!primaryId || !nonArchived.some((c) => c.id === primaryId)) {
      const def = activeTarget?.id || nonArchived[0].id;
      setPrimaryId(def);
    }
    if (selectedIds.length === 0) {
      const initial = nonArchived
        .slice(0, 3)
        .map((c) => c.id);
      if (activeTarget && !initial.includes(activeTarget.id)) {
        initial[0] = activeTarget.id;
      }
      setSelectedIds(initial);
    }
  }, [nonArchived, activeTarget, primaryId, selectedIds.length]);

  const primaryCompetitor = useMemo(
    () => nonArchived.find((c) => c.id === primaryId) ?? null,
    [nonArchived, primaryId]
  );
  const primaryScorecard = primaryCompetitor
    ? scorecardByCompetitor.get(primaryCompetitor.id) ?? null
    : null;

  const ownForm = useForm<OwnMetricFormValues>({
    resolver: zodResolver(ownMetricSchema),
    defaultValues: {
      metricKey: 'dig_official_website',
      metricName: 'Website Quality & SSL',
      dimensionKey: 'digital_presence',
      scorecardType: 'Market Presence',
      value: 'Unknown',
      rating: 3,
      sourceUrl: '',
      evidenceDescription: '',
      dataStatus: 'User Entered',
      lastVerifiedDate: getTodayDateString(),
      notes: '',
    },
  });

  const openEditOwnModal = (metric: DerivedOwnMetricView) => {
    setEditingOwn(metric);
    ownForm.reset({
      metricKey: metric.metricKey,
      metricName: metric.metricName,
      dimensionKey: metric.dimensionKey,
      scorecardType: metric.scorecardType,
      value: metric.value === 'Unknown' ? '' : metric.value,
      rating: metric.rating > 0 ? metric.rating : 3,
      sourceUrl: metric.sourceUrl || 'https://genzneuralx.com',
      evidenceDescription: metric.evidenceDescription || '',
      dataStatus: metric.dataStatus === 'Unknown' ? 'User Entered' : metric.dataStatus,
      lastVerifiedDate: metric.lastVerifiedDate || getTodayDateString(),
      notes: metric.notes || '',
    });
  };

  const handleSaveOwnMetric = async (values: OwnMetricFormValues) => {
    if (!firebaseUser) return;
    try {
      await upsertOwnMetric({
        uid: firebaseUser.uid,
        values,
        existingOwnMetrics: savedOwnMetrics,
        ratingScoreMap: normalizedConfig.ratingScoreMap,
      });
      showToast(`${values.metricName} saved`, { variant: 'success' });
      setEditingOwn(null);
    } catch (err) {
      showToast('Failed to save metric', {
        description: err instanceof Error ? err.message : 'Please check source URL and fields.',
        variant: 'error',
      });
    }
  };

  const toggleSelectedCompetitor = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      }
      if (prev.length >= 4) {
        showToast('Select up to 4 competitors for chart clarity', { variant: 'info' });
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleSaveSnapshot = async () => {
    if (!firebaseUser || !primaryScorecard) return;
    setSavingSnapshot(true);
    try {
      const closedCount = competitiveGaps.filter(
        (g) => g.linkedCompetitorIds.includes(primaryScorecard.competitorId) && g.status === 'Done'
      ).length;
      await saveComparisonSnapshot({
        uid: firebaseUser.uid,
        scorecard: primaryScorecard,
        gapsClosedCount: closedCount,
        notes: `Comparison snapshot saved against ${primaryScorecard.competitorName}.`,
      });
      showToast('Comparison snapshot saved', { variant: 'success' });
    } catch (err) {
      showToast('Failed to save snapshot', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSavingSnapshot(false);
    }
  };

  // Charts Data
  const multiScoreBarData = useMemo(() => {
    const selectedComps = nonArchived.filter((c) => selectedIds.includes(c.id));
    const list: {
      name: string;
      MarketPresence: number;
      BusinessPerformance: number;
      Overall: number;
    }[] = [];

    if (primaryScorecard) {
      list.push({
        name: 'Gen Z Neural-X',
        MarketPresence: primaryScorecard.ownMarketPresenceScore ?? 0,
        BusinessPerformance: primaryScorecard.ownBusinessPerformanceScore ?? 0,
        Overall: primaryScorecard.ownOverallScore ?? 0,
      });
    }

    for (const c of selectedComps) {
      const sc = scorecardByCompetitor.get(c.id);
      if (!sc) continue;
      list.push({
        name: c.companyName.slice(0, 16),
        MarketPresence: sc.competitorMarketPresenceScore ?? 0,
        BusinessPerformance: sc.competitorBusinessPerformanceScore ?? 0,
        Overall: sc.competitorOverallScore ?? 0,
      });
    }
    return list;
  }, [nonArchived, selectedIds, primaryScorecard, scorecardByCompetitor]);

  const radarData = useMemo(() => {
    if (!primaryScorecard) return [];
    const mpDims = primaryScorecard.dimensionBreakdowns.filter(
      (d) => d.scorecardType === 'Market Presence'
    );
    return mpDims.map((d) => ({
      dimension: d.label.replace(' & ', ' / '),
      GenZNeuralX: d.ownScore ?? 0,
      Competitor: d.competitorScore ?? 0,
    }));
  }, [primaryScorecard]);

  const monthlyLineData = useMemo(() => {
    if (!primaryCompetitor) return [];
    const latestByMonth = new Map<string, { month: string; own: number; competitor: number }>();
    const sorted = competitorMonthlyReviews
      .filter((r) => r.competitorId === primaryCompetitor.id)
      .sort((a, b) => a.month.localeCompare(b.month) || a.version - b.version);
    for (const rev of sorted) {
      latestByMonth.set(rev.month, {
        month: rev.month,
        own: rev.ownOverallScore,
        competitor: rev.competitorOverallScore,
      });
    }
    return Array.from(latestByMonth.values());
  }, [primaryCompetitor, competitorMonthlyReviews]);

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-[#DC2626]">
        Failed to load comparison workspace: {error}
      </div>
    );
  }

  const pendingCount = competitorPendingFindings.filter((f) => f.decision === 'Pending').length;
  const openGapsCount = competitiveGaps.filter(
    (g) => g.status === 'Open' || g.status === 'In Progress'
  ).length;
  const selectedCompetitors = nonArchived.filter((c) => selectedIds.includes(c.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Competitor Comparison</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Side-by-side comparison using verified GoalX metrics and documented competitor evidence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <CalculationInfoPopover
            weights={normalizedConfig.weights}
            ratingScoreMap={normalizedConfig.ratingScoreMap}
            minComparableRequired={normalizedConfig.minComparableMetrics}
          />
          {primaryScorecard && (
            <button
              type="button"
              disabled={savingSnapshot}
              onClick={() => void handleSaveSnapshot()}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-60 cursor-pointer"
            >
              {savingSnapshot ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <BookmarkCheck className="w-3.5 h-3.5" />
              )}
              <span>Save Snapshot</span>
            </button>
          )}
        </div>
      </div>

      <CompetitionSubNav pendingCount={pendingCount} openGapsCount={openGapsCount} />

      {/* Section 1: Gen Z Neural-X Own Metrics */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">
              Gen Z Neural-X Own Metrics ({ownMetrics.filter((m) => m.dataStatus !== 'Unknown').length}/
              {SCORECARD_METRIC_DEFS.length} rated)
            </h2>
            <p className="text-xs text-[#64748B]">
              Operational metrics are calculated directly from GoalX; qualitative brand &amp; presence
              metrics are entered by you with source proof.
            </p>
          </div>
          <Link
            to={ROUTES.COMPETITION_SCORECARDS}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline shrink-0"
          >
            <span>Rate Competitor Metrics</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {ownMetrics.map((m) => (
            <div
              key={m.metricKey}
              className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 flex flex-col justify-between gap-2.5"
            >
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-[#1F2937]">{m.metricName}</p>
                  {!m.derivableFromGoalX && (
                    <button
                      type="button"
                      onClick={() => openEditOwnModal(m)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#DC2626] hover:underline shrink-0 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[#64748B]">
                  {m.sourceType} · {m.scorecardType}
                </p>
                <p className="text-xs font-medium text-[#1F2937]">{m.value}</p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F0] text-[11px] tabular-nums">
                <span
                  className={`font-semibold ${
                    m.dataStatus === 'Verified'
                      ? 'text-[#16A34A]'
                      : m.dataStatus === 'User Entered'
                        ? 'text-[#2563EB]'
                        : 'text-[#64748B]'
                  }`}
                >
                  {m.dataStatus}
                </span>
                <span className="font-semibold text-[#1F2937]">
                  {m.rating > 0 ? `${m.rating}/5 (${m.score}/100)` : 'Unknown'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: Competitor Selector + Multi-Select */}
      {nonArchived.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            title="No competitors tracked yet"
            description="Add or verify competitors in Competition Radar before running side-by-side comparisons."
            actionLabel="Go to Competition Radar"
            onAction={() => {
              window.location.assign(ROUTES.COMPETITION);
            }}
            icon={<GitCompareArrows className="w-5 h-5" />}
          />
        </div>
      ) : (
        <>
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <label
                  htmlFor="compare-primary-select"
                  className="block text-xs font-semibold text-[#1F2937] mb-1"
                >
                  Primary Competitor for 4-Bucket Breakdown
                </label>
                <select
                  id="compare-primary-select"
                  value={primaryId}
                  onChange={(e) => setPrimaryId(e.target.value)}
                  className="h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-[#1F2937] min-w-[240px]"
                >
                  {nonArchived.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.location || c.marketLevel})
                      {c.isActiveTarget ? ' · Active Target' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[#1F2937]">
                  Compare in Charts &amp; Service Matrix (up to 4)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {nonArchived.map((c) => {
                    const checked = selectedIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleSelectedCompetitor(c.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          checked
                            ? 'bg-[#DC2626] text-white border-[#DC2626]'
                            : 'bg-white text-[#1F2937] border-[#E2E8F0] hover:bg-slate-50'
                        }`}
                      >
                        {c.companyName}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Primary 4-Bucket Breakdown + What to Improve */}
          {primaryCompetitor && primaryScorecard && (
            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[#1F2937]">
                    Gen Z Neural-X vs {primaryCompetitor.companyName}
                  </h2>
                  <p className="text-xs text-[#64748B] tabular-nums">
                    {primaryScorecard.comparableCount} comparable metrics ·{' '}
                    {primaryScorecard.evidenceCoveragePct}% competitor evidence coverage
                  </p>
                </div>

                {primaryScorecard.hasEnoughComparableData ? (
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 text-xs tabular-nums">
                    <span className="text-[#64748B]">Weighted Overall: </span>
                    <strong className="text-[#1F2937]">
                      You {primaryScorecard.ownOverallScore} vs{' '}
                      {primaryScorecard.competitorOverallScore}
                    </strong>{' '}
                    <span
                      className={`font-semibold ${
                        (primaryScorecard.scoreAdvantage ?? 0) >= 0
                          ? 'text-[#16A34A]'
                          : 'text-[#DC2626]'
                      }`}
                    >
                      ({(primaryScorecard.scoreAdvantage ?? 0) >= 0 ? '+' : ''}
                      {primaryScorecard.scoreAdvantage} pts)
                    </span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900">
                    Not enough comparable data ({primaryScorecard.comparableCount}/
                    {primaryScorecard.minComparableRequired} comparable needed)
                  </div>
                )}
              </div>

              {!primaryScorecard.hasEnoughComparableData && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 space-y-1.5">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
                    <span>Next steps to unlock overall comparison score:</span>
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {primaryScorecard.nextActionsToReachComparable.map((act) => (
                      <li key={act}>{act}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 4 Buckets */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Bucket 1: Ahead */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-2.5">
                  <h3 className="text-xs font-bold text-[#16A34A]">
                    1. Where Gen Z Neural-X Is Ahead ({primaryScorecard.ahead.length})
                  </h3>
                  {primaryScorecard.ahead.length === 0 ? (
                    <p className="text-xs text-[#64748B]">No comparable leads recorded yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {primaryScorecard.ahead.map((r) => (
                        <li
                          key={r.metricKey}
                          className="rounded-lg bg-white border border-emerald-100 p-2.5 text-xs flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[#1F2937] truncate">{r.metricName}</p>
                            <p className="text-[11px] text-[#64748B] truncate">
                              You: {r.ownMetric.value} · {primaryCompetitor.companyName}:{' '}
                              {r.competitorMetric?.value}
                            </p>
                          </div>
                          <span className="font-bold text-[#16A34A] tabular-nums shrink-0">
                            {r.ownScore} vs {r.competitorScore} (+{r.delta})
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Bucket 2: Competitor Ahead */}
                <div className="rounded-xl border border-red-200 bg-red-50/30 p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-[#DC2626]">
                      2. Where {primaryCompetitor.companyName} Is Ahead (
                      {primaryScorecard.behind.length})
                    </h3>
                    {primaryScorecard.behind.length > 0 && (
                      <Link
                        to={ROUTES.COMPETITION_GAPS}
                        className="text-[11px] font-semibold text-[#DC2626] hover:underline"
                      >
                        Convert to Gaps &rarr;
                      </Link>
                    )}
                  </div>
                  {primaryScorecard.behind.length === 0 ? (
                    <p className="text-xs text-[#64748B]">
                      No comparable metrics where this competitor currently leads.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {primaryScorecard.behind.map((r) => (
                        <li
                          key={r.metricKey}
                          className="rounded-lg bg-white border border-red-100 p-2.5 text-xs flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[#1F2937] truncate">{r.metricName}</p>
                            <p className="text-[11px] text-[#64748B] truncate">
                              You: {r.ownMetric.value} · {primaryCompetitor.companyName}:{' '}
                              {r.competitorMetric?.value}
                            </p>
                          </div>
                          <span className="font-bold text-[#DC2626] tabular-nums shrink-0">
                            {r.ownScore} vs {r.competitorScore} ({r.delta})
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Bucket 3: Equal */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-2.5">
                  <h3 className="text-xs font-bold text-[#2563EB]">
                    3. Equal / Tied Metrics ({primaryScorecard.equal.length})
                  </h3>
                  {primaryScorecard.equal.length === 0 ? (
                    <p className="text-xs text-[#64748B]">No tied comparable metrics.</p>
                  ) : (
                    <ul className="space-y-2">
                      {primaryScorecard.equal.map((r) => (
                        <li
                          key={r.metricKey}
                          className="rounded-lg bg-white border border-blue-100 p-2.5 text-xs flex items-center justify-between gap-2"
                        >
                          <span className="font-semibold text-[#1F2937] truncate">{r.metricName}</span>
                          <span className="font-bold text-[#2563EB] tabular-nums shrink-0">
                            {r.ownScore} = {r.competitorScore}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Bucket 4: Missing / Unknown */}
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-2.5">
                  <h3 className="text-xs font-bold text-[#64748B]">
                    4. Unknown / Missing Evidence ({primaryScorecard.missing.length})
                  </h3>
                  {primaryScorecard.missing.length === 0 ? (
                    <p className="text-xs text-[#16A34A] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>All 15 scorecard metrics have comparable evidence!</span>
                    </p>
                  ) : (
                    <ul className="space-y-1.5 max-h-[220px] overflow-y-auto">
                      {primaryScorecard.missing.map((r) => (
                        <li
                          key={r.metricKey}
                          className="rounded-lg bg-white border border-[#E2E8F0] p-2 text-xs"
                        >
                          <p className="font-semibold text-[#1F2937]">{r.metricName}</p>
                          <p className="text-[11px] text-[#64748B]">{r.missingReason}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Clearly Separated Estimated Items (Excluded from Score) */}
              {primaryScorecard.estimatedOnly.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-2">
                  <p className="text-xs font-semibold text-amber-900">
                    Estimated Metrics — Excluded from Official Comparable Score (
                    {primaryScorecard.estimatedOnly.length})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {primaryScorecard.estimatedOnly.map((r) => (
                      <div
                        key={r.metricKey}
                        className="rounded-lg bg-white border border-amber-200 px-3 py-2 text-xs flex items-center justify-between gap-2"
                      >
                        <span className="font-medium text-[#1F2937] truncate">{r.metricName}</span>
                        <span className="text-[11px] font-semibold text-[#F59E0B] shrink-0">
                          Estimated ({r.competitorMetric?.rating}/5)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* What to Improve Summary */}
              {primaryScorecard.whatToImprove.length > 0 && (
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-[#1F2937]">
                      What to Improve to Outperform {primaryCompetitor.companyName}
                    </h3>
                    <Link
                      to={ROUTES.COMPETITION_GAPS}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#DC2626] hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Open Gap Matrix</span>
                    </Link>
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-[#64748B]">
                    {primaryScorecard.whatToImprove.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Charts Row: BarChart + RadarChart + Monthly Trend LineChart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-[#1F2937]">
                  Score Comparison (Market Presence vs Business Performance)
                </h2>
                <p className="text-xs text-[#64748B]">
                  Side-by-side comparable scorecard index (0–100; 0 indicates insufficient data).
                </p>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={multiScoreBarData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="MarketPresence" name="Market Presence" fill="#2563EB" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="BusinessPerformance" name="Business Perf." fill="#16A34A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Overall" name="Overall Score" fill="#DC2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-[#1F2937]">
                  Market Presence Radar ({primaryCompetitor?.companyName || 'Competitor'})
                </h2>
                <p className="text-xs text-[#64748B]">
                  Public visibility dimensions: Portfolio Quality, Customer Reputation, Digital Presence, Pricing.
                </p>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#E2E8F0" />
                    <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: '#64748B' }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar
                      name="Gen Z Neural-X"
                      dataKey="GenZNeuralX"
                      stroke="#DC2626"
                      fill="#DC2626"
                      fillOpacity={0.25}
                    />
                    <Radar
                      name={primaryCompetitor?.companyName || 'Competitor'}
                      dataKey="Competitor"
                      stroke="#2563EB"
                      fill="#2563EB"
                      fillOpacity={0.2}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* Monthly Score Progression LineChart */}
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[#1F2937]">
                  Monthly Score Progression ({primaryCompetitor?.companyName || 'Selected Target'})
                </h2>
                <p className="text-xs text-[#64748B]">
                  Tracks immutable monthly snapshots from competitorMonthlyReviews.
                </p>
              </div>
              <Link
                to={ROUTES.COMPETITION_SCORECARDS}
                className="text-xs font-semibold text-[#DC2626] hover:underline"
              >
                Save Monthly Review &rarr;
              </Link>
            </div>
            {monthlyLineData.length === 0 ? (
              <p className="text-xs text-[#64748B] py-6 text-center">
                No monthly review snapshots saved yet for {primaryCompetitor?.companyName}. Save
                monthly reviews from Scorecards to chart progression.
              </p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyLineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="own"
                      name="Gen Z Neural-X"
                      stroke="#DC2626"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="competitor"
                      name={primaryCompetitor?.companyName || 'Competitor'}
                      stroke="#2563EB"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Service Comparison Matrix */}
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">
                Service Portfolio Comparison Matrix
              </h2>
              <p className="text-xs text-[#64748B]">
                Compares Gen Z Neural-X active services against verified competitor Services metrics
                (Missing service records remain Unknown).
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[#64748B]">
                    <th className="py-2.5 pr-4 font-semibold">Service Line</th>
                    <th className="py-2.5 px-3 font-semibold text-[#DC2626]">Gen Z Neural-X</th>
                    {selectedCompetitors.map((comp) => (
                      <th key={comp.id} className="py-2.5 px-3 font-semibold text-[#1F2937]">
                        {comp.companyName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {SERVICE_COMPARISON_ROWS.map((svcDef) => {
                    const ownMatches = services.some(
                      (s) =>
                        s.status === 'Active' &&
                        (s.name.toLowerCase().includes(svcDef.name.split(' ')[0].toLowerCase()) ||
                          svcDef.name.toLowerCase().includes(s.name.toLowerCase()))
                    );
                    return (
                      <tr key={svcDef.key} className="hover:bg-slate-50/70">
                        <td className="py-2.5 pr-4 font-medium text-[#1F2937]">{svcDef.name}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`font-semibold ${
                              ownMatches ? 'text-[#16A34A]' : 'text-[#64748B]'
                            }`}
                          >
                            {ownMatches ? 'Active' : 'Planned / Custom'}
                          </span>
                        </td>
                        {selectedCompetitors.map((comp) => {
                          const metric = competitorMetrics.find(
                            (m) => m.competitorId === comp.id && m.metricKey === svcDef.key
                          );
                          const statusLabel =
                            metric?.serviceOfferStatus ||
                            (metric?.dataStatus === 'Verified' || metric?.dataStatus === 'User Entered'
                              ? metric.value
                              : 'Unknown');
                          return (
                            <td key={comp.id} className="py-2.5 px-3 text-[#64748B]">
                              <span
                                className={
                                  statusLabel === 'Offered'
                                    ? 'font-semibold text-[#16A34A]'
                                    : statusLabel === 'Partially Offered'
                                      ? 'font-semibold text-[#2563EB]'
                                      : statusLabel === 'Not Offered'
                                        ? 'text-[#DC2626]'
                                        : 'text-[#64748B]'
                                }
                              >
                                {statusLabel}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Own Metric Edit Modal */}
      {editingOwn && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <div>
                <h2 className="text-base font-semibold text-[#1F2937]">
                  Edit Gen Z Neural-X Metric
                </h2>
                <p className="text-xs text-[#64748B]">{editingOwn.metricName}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOwn(null)}
                aria-label="Close modal"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={ownForm.handleSubmit(handleSaveOwnMetric)}
              className="p-6 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">
                  Observed Value
                </label>
                <input
                  type="text"
                  placeholder="e.g. 4.8★ across 24 Google reviews"
                  {...ownForm.register('value')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
                />
                {ownForm.formState.errors.value && (
                  <p className="mt-1 text-xs text-[#DC2626]">
                    {ownForm.formState.errors.value.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">
                    Rating (1–5)
                  </label>
                  <select
                    value={ownForm.watch('rating')}
                    onChange={(e) => ownForm.setValue('rating', Number(e.target.value))}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white"
                  >
                    <option value={1}>1 - Needs Work ({normalizedConfig.ratingScoreMap.r1})</option>
                    <option value={2}>2 - Developing ({normalizedConfig.ratingScoreMap.r2})</option>
                    <option value={3}>3 - Competitive ({normalizedConfig.ratingScoreMap.r3})</option>
                    <option value={4}>4 - Strong ({normalizedConfig.ratingScoreMap.r4})</option>
                    <option value={5}>5 - Leader ({normalizedConfig.ratingScoreMap.r5})</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">
                    Data Status
                  </label>
                  <select
                    {...ownForm.register('dataStatus')}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white"
                  >
                    {DATA_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">
                  Source URL (required if Verified)
                </label>
                <input
                  type="url"
                  placeholder="https://genzneuralx.com/..."
                  {...ownForm.register('sourceUrl')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
                />
                {ownForm.formState.errors.sourceUrl && (
                  <p className="mt-1 text-xs text-[#DC2626]">
                    {ownForm.formState.errors.sourceUrl.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">
                  Evidence Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe the verified proof backing this rating..."
                  {...ownForm.register('evidenceDescription')}
                  className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm text-[#1F2937]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingOwn(null)}
                  className="min-h-[42px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ownForm.formState.isSubmitting}
                  className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 text-sm font-medium text-white hover:bg-[#B91C1C] cursor-pointer"
                >
                  {ownForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Save Own Metric</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
