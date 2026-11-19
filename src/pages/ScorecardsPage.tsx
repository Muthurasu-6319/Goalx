import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Award,
  CalendarPlus,
  Loader2,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Star,
  Target,
} from 'lucide-react';
import { CalculationInfoPopover } from '../components/competition/CalculationInfoPopover';
import { CompetitionSubNav } from '../components/competition/CompetitionSubNav';
import { MonthlyReviewModal } from '../components/competition/MonthlyReviewModal';
import { SurpassConfirmationPanel } from '../components/competition/SurpassConfirmationPanel';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useBusinessDataContext } from '../hooks/useBusinessData';
import { useCompetitionAnalytics } from '../hooks/useCompetitionAnalytics';
import { useToast } from '../hooks/useToast';
import { evaluateSurpassConditions, weightsSum } from '../lib/competitorScoringUtils';
import { isValidHttpUrl } from '../lib/competitorUtils';
import {
  DATA_STATUSES,
  DEFAULT_RATING_SCORE_MAP,
  DEFAULT_SCORECARD_WEIGHTS,
  ROUTES,
  SCORE_DIMENSIONS,
  SCORECARD_METRIC_DEFS,
} from '../lib/constants';
import { MonthlyReviewFormValues, ScoreConfigFormValues, scoreConfigSchema } from '../lib/validators';
import {
  resetCompetitorScoreConfig,
  saveCompetitorScoreConfig,
  saveMonthlyReviewSnapshot,
  setActiveCompetitorTarget,
  upsertCompetitorMetricRating,
} from '../services/competitorScoreService';
import { DataStatus, ScorecardDimensionKey } from '../types';

export const ScorecardsPage: React.FC = () => {
  const { firebaseUser } = useAuth();
  const { competitorPendingFindings } = useBusinessDataContext();
  const {
    loading,
    error,
    scoreConfig,
    normalizedConfig,
    competitors,
    competitorMetrics,
    competitorEvidence,
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

  const [selectedId, setSelectedId] = useState<string>('');
  const [monthlyModalOpen, setMonthlyModalOpen] = useState(false);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [savingMetricKey, setSavingMetricKey] = useState<string | null>(null);
  const [settingTarget, setSettingTarget] = useState(false);

  // Per-metric inline draft states
  const [metricDrafts, setMetricDrafts] = useState<
    Record<string, { rating: number; dataStatus: DataStatus; sourceUrl: string; value: string }>
  >({});

  useEffect(() => {
    if (nonArchived.length === 0) return;
    if (!selectedId || !nonArchived.some((c) => c.id === selectedId)) {
      setSelectedId(activeTarget?.id || nonArchived[0].id);
    }
  }, [nonArchived, activeTarget, selectedId]);

  const selectedCompetitor = useMemo(
    () => nonArchived.find((c) => c.id === selectedId) ?? null,
    [nonArchived, selectedId]
  );

  const selectedScorecard = selectedCompetitor
    ? scorecardByCompetitor.get(selectedCompetitor.id) ?? null
    : null;

  const selectedSurpassEval = useMemo(() => {
    if (!selectedCompetitor || !selectedScorecard) return null;
    return evaluateSurpassConditions({
      competitor: selectedCompetitor,
      scorecard: selectedScorecard,
      monthlyReviews: competitorMonthlyReviews,
      config: scoreConfig,
    });
  }, [selectedCompetitor, selectedScorecard, competitorMonthlyReviews, scoreConfig]);

  // Populate inline rating drafts whenever competitor or metrics change
  useEffect(() => {
    if (!selectedCompetitor) return;
    const next: Record<
      string,
      { rating: number; dataStatus: DataStatus; sourceUrl: string; value: string }
    > = {};
    for (const def of SCORECARD_METRIC_DEFS) {
      const m = competitorMetrics.find(
        (cm) => cm.competitorId === selectedCompetitor.id && cm.metricKey === def.metricKey
      );
      next[def.metricKey] = {
        rating: m?.rating ?? 0,
        dataStatus: m?.dataStatus ?? 'Unknown',
        sourceUrl: m?.sourceUrl || selectedCompetitor.website || '',
        value: m?.value && m.value !== 'Unknown' ? m.value : '',
      };
    }
    setMetricDrafts(next);
  }, [selectedCompetitor, competitorMetrics]);

  // Weights & Rating Map Form
  const configForm = useForm<ScoreConfigFormValues>({
    resolver: zodResolver(scoreConfigSchema),
    defaultValues: {
      weights: normalizedConfig.weights,
      ratingScoreMap: normalizedConfig.ratingScoreMap,
    },
  });

  useEffect(() => {
    configForm.reset({
      weights: normalizedConfig.weights,
      ratingScoreMap: normalizedConfig.ratingScoreMap,
    });
  }, [normalizedConfig, configForm]);

  const watchedWeights = configForm.watch('weights');
  const currentWeightsSum = weightsSum(watchedWeights);

  const handleSaveConfig = async (values: ScoreConfigFormValues) => {
    if (!firebaseUser) return;
    try {
      await saveCompetitorScoreConfig({
        uid: firebaseUser.uid,
        values,
        existingConfig: scoreConfig,
      });
      showToast('Scorecard weights & mapping saved', { variant: 'success' });
      setWeightsOpen(false);
    } catch (err) {
      showToast('Failed to save configuration', {
        description: err instanceof Error ? err.message : 'Weights must sum to 100.',
        variant: 'error',
      });
    }
  };

  const handleResetConfig = async () => {
    if (!firebaseUser) return;
    try {
      await resetCompetitorScoreConfig(firebaseUser.uid, scoreConfig);
      configForm.reset({
        weights: DEFAULT_SCORECARD_WEIGHTS,
        ratingScoreMap: DEFAULT_RATING_SCORE_MAP,
      });
      showToast('Reset weights & ratings to defaults', { variant: 'info' });
    } catch (err) {
      showToast('Reset failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleSaveMetricRating = async (metricKey: string, metricName: string) => {
    if (!firebaseUser || !selectedCompetitor) return;
    const draft = metricDrafts[metricKey];
    if (!draft) return;

    if (draft.dataStatus === 'Verified' && !isValidHttpUrl(draft.sourceUrl)) {
      showToast('Valid Source URL required for Verified status', {
        description: 'Enter an http:// or https:// link, or choose User Entered / Estimated.',
        variant: 'error',
      });
      return;
    }

    if (draft.dataStatus !== 'Unknown' && (draft.rating < 1 || draft.rating > 5)) {
      showToast('Select a 1–5 star rating before saving', { variant: 'warning' });
      return;
    }

    setSavingMetricKey(metricKey);
    try {
      await upsertCompetitorMetricRating({
        uid: firebaseUser.uid,
        competitor: selectedCompetitor,
        metricKey,
        metricName,
        rating: draft.dataStatus === 'Unknown' ? 0 : draft.rating,
        value: draft.value || (draft.dataStatus === 'Unknown' ? 'Unknown' : `Rated ${draft.rating}/5`),
        dataStatus: draft.dataStatus,
        sourceUrl: draft.sourceUrl,
        evidenceDescription:
          draft.dataStatus === 'Verified'
            ? `Verified rating ${draft.rating}/5 backed by public source URL.`
            : draft.dataStatus === 'Estimated'
              ? `Estimated observation (${draft.rating}/5) — excluded from official surpassed scores.`
              : `CEO evaluation rating ${draft.rating}/5.`,
        existingMetrics: competitorMetrics,
        existingEvidence: competitorEvidence,
      });
      showToast(`${metricName} rating updated`, { variant: 'success' });
    } catch (err) {
      showToast('Failed to save rating', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSavingMetricKey(null);
    }
  };

  const handleSetAsActiveTarget = async (targetId: string) => {
    setSettingTarget(true);
    try {
      await setActiveCompetitorTarget({ targetCompetitorId: targetId, allCompetitors: competitors });
      showToast('Active Target updated', { variant: 'success' });
    } catch (err) {
      showToast('Could not set Active Target', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSettingTarget(false);
    }
  };

  const handleSaveMonthlyReview = async (values: MonthlyReviewFormValues) => {
    if (!firebaseUser || !selectedCompetitor || !selectedScorecard) return;
    try {
      const { version } = await saveMonthlyReviewSnapshot({
        uid: firebaseUser.uid,
        competitor: selectedCompetitor,
        month: values.month,
        reviewDate: values.reviewDate,
        summary: values.summary,
        scorecard: selectedScorecard,
        existingReviews: competitorMonthlyReviews,
        minScoreAdvantage: normalizedConfig.minScoreAdvantage,
        minComparable: normalizedConfig.minComparableMetrics,
        minCoveragePct: normalizedConfig.minEvidenceCoveragePct,
      });
      showToast(
        `Saved ${values.month} review snapshot${version > 1 ? ` (v${version})` : ''}`,
        { variant: 'success' }
      );
      setMonthlyModalOpen(false);
    } catch (err) {
      showToast('Failed to save monthly review', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-[#DC2626]">
        Failed to load scorecards: {error}
      </div>
    );
  }

  const pendingCount = competitorPendingFindings.filter((f) => f.decision === 'Pending').length;
  const openGapsCount = competitiveGaps.filter(
    (g) => g.status === 'Open' || g.status === 'In Progress'
  ).length;
  const reviewsForSelected = selectedCompetitor
    ? competitorMonthlyReviews
        .filter((r) => r.competitorId === selectedCompetitor.id)
        .sort((a, b) => b.month.localeCompare(a.month) || b.version - a.version)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Dual Competitive Scorecards</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Rate verified competitor evidence, track Market Presence separately from Business Performance,
            and verify Surpass criteria.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <CalculationInfoPopover
            weights={normalizedConfig.weights}
            ratingScoreMap={normalizedConfig.ratingScoreMap}
            minComparableRequired={normalizedConfig.minComparableMetrics}
          />
          <button
            type="button"
            onClick={() => setWeightsOpen((prev) => !prev)}
            className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{weightsOpen ? 'Hide Weights' : 'Edit Weights'}</span>
          </button>
        </div>
      </div>

      <CompetitionSubNav pendingCount={pendingCount} openGapsCount={openGapsCount} />

      {/* Editable Dimension Weights Panel */}
      {weightsOpen && (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">
                Scorecard Weights &amp; Rating Mapping
              </h2>
              <p className="text-xs text-[#64748B]">
                All 10 dimension weights must sum strictly to 100%.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-bold tabular-nums px-2.5 py-1 rounded-lg ${
                  currentWeightsSum === 100
                    ? 'bg-emerald-50 text-[#16A34A]'
                    : 'bg-red-50 text-[#DC2626]'
                }`}
              >
                Total Sum: {currentWeightsSum} / 100
              </span>
              <button
                type="button"
                onClick={() => void handleResetConfig()}
                className="min-h-[34px] inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] px-3 text-xs font-medium text-[#64748B] hover:text-[#1F2937] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          <form onSubmit={configForm.handleSubmit(handleSaveConfig)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {SCORE_DIMENSIONS.map((dim) => (
                <div key={dim.key} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                  <label className="block text-xs font-semibold text-[#1F2937] truncate">
                    {dim.label}
                  </label>
                  <p className="text-[10px] text-[#64748B] mb-1.5">{dim.scorecardType}</p>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    {...configForm.register(`weights.${dim.key as ScorecardDimensionKey}`, {
                      valueAsNumber: true,
                    })}
                    className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-sm font-semibold text-[#1F2937] tabular-nums"
                  />
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-[#E2E8F0]">
              <p className="text-xs font-semibold text-[#1F2937] mb-2">
                Rating (1–5) to Score (0–100) Mapping
              </p>
              <div className="grid grid-cols-5 gap-2.5 max-w-xl">
                {(['r1', 'r2', 'r3', 'r4', 'r5'] as const).map((rk, i) => (
                  <div key={rk}>
                    <label className="block text-[11px] text-[#64748B] mb-1">{i + 1} ★ Score</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      {...configForm.register(`ratingScoreMap.${rk}`, { valueAsNumber: true })}
                      className="w-full h-9 rounded-lg border border-[#E2E8F0] px-2.5 text-xs font-semibold tabular-nums"
                    />
                  </div>
                ))}
              </div>
            </div>

            {configForm.formState.errors.weights?.root && (
              <p className="text-xs text-[#DC2626]">
                {configForm.formState.errors.weights.root.message}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={currentWeightsSum !== 100 || configForm.formState.isSubmitting}
                className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-4 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
              >
                {configForm.formState.isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Save Weights</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {!selectedCompetitor || !selectedScorecard ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            title="No competitors available"
            description="Add a competitor in Competition Radar to score metrics and verify Surpass criteria."
            actionLabel="Open Competition Radar"
            onAction={() => window.location.assign(ROUTES.COMPETITION)}
            icon={<Award className="w-5 h-5" />}
          />
        </div>
      ) : (
        <>
          {/* Competitor Selector Bar */}
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="scorecard-competitor-select" className="text-xs font-semibold text-[#1F2937]">
                Scoring Competitor:
              </label>
              <select
                id="scorecard-competitor-select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm font-semibold text-[#1F2937]"
              >
                {nonArchived.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName} · {c.status}
                    {c.isActiveTarget ? ' (Active Target)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedCompetitor.status !== 'Surpassed' && !selectedCompetitor.isActiveTarget && (
                <button
                  type="button"
                  disabled={settingTarget}
                  onClick={() => void handleSetAsActiveTarget(selectedCompetitor.id)}
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#DC2626] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#DC2626] hover:bg-red-50 cursor-pointer"
                >
                  {settingTarget ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Target className="w-3.5 h-3.5" />
                  )}
                  <span>Set as Active Target</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setMonthlyModalOpen(true)}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[#1F2937] px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                <span>Save Monthly Review</span>
              </button>
            </div>
          </section>

          {/* Dual Scorecards (A. Market Presence vs B. Business Performance + Overall Gate) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* A. Market Presence Score */}
            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-2">
              <p className="text-xs font-semibold text-[#2563EB]">
                A. Market Presence Scorecard
              </p>
              <div className="flex items-baseline justify-between gap-2 tabular-nums">
                <div>
                  <p className="text-[11px] text-[#64748B]">{selectedCompetitor.companyName}</p>
                  <p className="text-2xl font-bold text-[#1F2937]">
                    {selectedScorecard.competitorMarketPresenceScore ?? 'Unknown'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-[#64748B]">Gen Z Neural-X</p>
                  <p className="text-2xl font-bold text-[#2563EB]">
                    {selectedScorecard.ownMarketPresenceScore ?? 'Unknown'}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-[#64748B]">
                Website, SEO, reviews, social, portfolio &amp; pricing ({selectedScorecard.marketPresenceComparableCount}{' '}
                comparable).
              </p>
            </section>

            {/* B. Business Performance Score */}
            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-2">
              <p className="text-xs font-semibold text-[#16A34A]">
                B. Business Performance Scorecard
              </p>
              <div className="flex items-baseline justify-between gap-2 tabular-nums">
                <div>
                  <p className="text-[11px] text-[#64748B]">{selectedCompetitor.companyName}</p>
                  <p className="text-2xl font-bold text-[#1F2937]">
                    {selectedScorecard.competitorBusinessPerformanceScore ?? 'Unknown'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-[#64748B]">Gen Z Neural-X</p>
                  <p className="text-2xl font-bold text-[#16A34A]">
                    {selectedScorecard.ownBusinessPerformanceScore ?? 'Unknown'}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-[#64748B]">
                Revenue growth, acquisition, delivery, services, tech &amp; team (
                {selectedScorecard.businessPerformanceComparableCount} comparable).
              </p>
            </section>

            {/* Overall Weighted Score Card */}
            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-2">
              <p className="text-xs font-semibold text-[#DC2626]">
                Overall Comparable Score (min {selectedScorecard.minComparableRequired} metrics)
              </p>
              {selectedScorecard.hasEnoughComparableData ? (
                <>
                  <div className="flex items-baseline justify-between gap-2 tabular-nums">
                    <div>
                      <p className="text-[11px] text-[#64748B]">Gen Z Neural-X</p>
                      <p className="text-2xl font-bold text-[#1F2937]">
                        {selectedScorecard.ownOverallScore}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-[#64748B]">{selectedCompetitor.companyName}</p>
                      <p className="text-2xl font-bold text-[#1F2937]">
                        {selectedScorecard.competitorOverallScore}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`text-xs font-semibold tabular-nums ${
                      (selectedScorecard.scoreAdvantage ?? 0) >= 0
                        ? 'text-[#16A34A]'
                        : 'text-[#DC2626]'
                    }`}
                  >
                    Advantage: {(selectedScorecard.scoreAdvantage ?? 0) >= 0 ? '+' : ''}
                    {selectedScorecard.scoreAdvantage} pts · {selectedScorecard.comparableCount} comparable
                  </p>
                </>
              ) : (
                <div className="space-y-1">
                  <p className="text-base font-bold text-[#F59E0B]">Not enough comparable data</p>
                  <p className="text-[11px] text-[#64748B] tabular-nums">
                    {selectedScorecard.comparableCount}/{selectedScorecard.minComparableRequired} comparable
                    metrics rated with Verified/User Entered status.
                  </p>
                </div>
              )}
            </section>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-xs text-[#64748B]">
            <strong>Analytical Separation Notice:</strong> Market Presence and Business Performance are
            kept strictly separate. Strong SEO or social activity never implies business revenue,
            profit, or delivery superiority.
          </div>

          {/* Per-Metric Rating Editor (15 Scorecard Metrics) */}
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">
                Rate {selectedCompetitor.companyName} Across 15 Benchmark Metrics
              </h2>
              <p className="text-xs text-[#64748B]">
                Assign a 1–5 rating backed by public URLs (Verified) or CEO audit (User Entered).
                Unknown stays unrated; Estimated never counts toward Surpassed.
              </p>
            </div>

            <div className="divide-y divide-[#E2E8F0]">
              {SCORECARD_METRIC_DEFS.map((def) => {
                const draft = metricDrafts[def.metricKey] ?? {
                  rating: 0,
                  dataStatus: 'Unknown' as DataStatus,
                  sourceUrl: '',
                  value: '',
                };
                const isSaving = savingMetricKey === def.metricKey;

                return (
                  <div
                    key={def.metricKey}
                    className="py-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center"
                  >
                    <div className="lg:col-span-4 min-w-0">
                      <p className="text-sm font-semibold text-[#1F2937]">{def.metricName}</p>
                      <p className="text-[11px] text-[#64748B]">
                        {def.scorecardType} · {def.description}
                      </p>
                    </div>

                    <div className="lg:col-span-2 flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((starVal) => (
                        <button
                          key={starVal}
                          type="button"
                          onClick={() =>
                            setMetricDrafts((prev) => ({
                              ...prev,
                              [def.metricKey]: {
                                ...draft,
                                rating: starVal,
                                dataStatus:
                                  draft.dataStatus === 'Unknown' ? 'User Entered' : draft.dataStatus,
                              },
                            }))
                          }
                          aria-label={`Rate ${def.metricName} ${starVal} stars`}
                          className="p-1 rounded-md hover:bg-slate-100 cursor-pointer"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              starVal <= draft.rating
                                ? 'fill-[#F59E0B] text-[#F59E0B]'
                                : 'text-slate-300'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="ml-1 text-xs font-semibold tabular-nums text-[#1F2937]">
                        {draft.rating > 0 ? `${draft.rating}/5` : '—'}
                      </span>
                    </div>

                    <div className="lg:col-span-2">
                      <select
                        value={draft.dataStatus}
                        onChange={(e) =>
                          setMetricDrafts((prev) => ({
                            ...prev,
                            [def.metricKey]: {
                              ...draft,
                              dataStatus: e.target.value as DataStatus,
                            },
                          }))
                        }
                        className="w-full h-9 rounded-xl border border-[#E2E8F0] bg-white px-2.5 text-xs text-[#1F2937]"
                      >
                        {DATA_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="lg:col-span-3 space-y-1.5">
                      <input
                        type="text"
                        value={draft.value}
                        onChange={(e) =>
                          setMetricDrafts((prev) => ({
                            ...prev,
                            [def.metricKey]: { ...draft, value: e.target.value },
                          }))
                        }
                        placeholder="Observed value (optional)"
                        className="w-full h-9 rounded-xl border border-[#E2E8F0] px-2.5 text-xs text-[#1F2937]"
                      />
                      <input
                        type="url"
                        value={draft.sourceUrl}
                        onChange={(e) =>
                          setMetricDrafts((prev) => ({
                            ...prev,
                            [def.metricKey]: { ...draft, sourceUrl: e.target.value },
                          }))
                        }
                        placeholder="Source URL (required if Verified)"
                        className="w-full h-9 rounded-xl border border-[#E2E8F0] px-2.5 text-xs text-[#1F2937]"
                      />
                    </div>

                    <div className="lg:col-span-1 flex justify-end">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => void handleSaveMetricRating(def.metricKey, def.metricName)}
                        className="min-h-[36px] px-3 rounded-xl bg-[#DC2626] text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Surpass Verification Panel */}
          {selectedSurpassEval && (
            <SurpassConfirmationPanel
              competitor={selectedCompetitor}
              evaluation={selectedSurpassEval}
              onSelectNextTarget={handleSetAsActiveTarget}
            />
          )}

          {/* Monthly Review History */}
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[#1F2937]">
                  Immutable Monthly Review History ({reviewsForSelected.length})
                </h2>
                <p className="text-xs text-[#64748B]">
                  2 consecutive eligible months with ≥{normalizedConfig.minScoreAdvantage} pt
                  advantage are required before Surpassed confirmation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMonthlyModalOpen(true)}
                className="text-xs font-semibold text-[#DC2626] hover:underline cursor-pointer"
              >
                + Record Month
              </button>
            </div>

            {reviewsForSelected.length === 0 ? (
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 text-xs text-[#64748B] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
                <span>
                  No monthly snapshots recorded yet for {selectedCompetitor.companyName}. Save one
                  monthly to build your consecutive comparison trail.
                </span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[#64748B]">
                      <th className="py-2 pr-3 font-semibold">Month</th>
                      <th className="py-2 px-3 font-semibold">Own Score</th>
                      <th className="py-2 px-3 font-semibold">Competitor</th>
                      <th className="py-2 px-3 font-semibold">Advantage</th>
                      <th className="py-2 px-3 font-semibold">Comparable</th>
                      <th className="py-2 px-3 font-semibold">Surpass Month</th>
                      <th className="py-2 pl-3 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {reviewsForSelected.map((rev) => (
                      <tr key={rev.id}>
                        <td className="py-2.5 pr-3 font-semibold text-[#1F2937]">
                          {rev.month} {rev.version > 1 ? `(v${rev.version})` : ''}
                        </td>
                        <td className="py-2.5 px-3">{rev.ownOverallScore}</td>
                        <td className="py-2.5 px-3">{rev.competitorOverallScore}</td>
                        <td
                          className={`py-2.5 px-3 font-semibold ${
                            rev.scoreAdvantage >= normalizedConfig.minScoreAdvantage
                              ? 'text-[#16A34A]'
                              : 'text-[#1F2937]'
                          }`}
                        >
                          {rev.scoreAdvantage >= 0 ? `+${rev.scoreAdvantage}` : rev.scoreAdvantage} pts
                        </td>
                        <td className="py-2.5 px-3">{rev.comparableCount}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`font-semibold ${
                              rev.eligibleForSurpass ? 'text-[#16A34A]' : 'text-[#F59E0B]'
                            }`}
                          >
                            {rev.eligibleForSurpass ? 'Eligible' : 'Not Eligible'}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3 text-[#64748B] max-w-[260px] truncate">
                          {rev.summary || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <MonthlyReviewModal
            open={monthlyModalOpen}
            competitor={selectedCompetitor}
            scorecard={selectedScorecard}
            existingReviews={competitorMonthlyReviews}
            minScoreAdvantage={normalizedConfig.minScoreAdvantage}
            minComparable={normalizedConfig.minComparableMetrics}
            minCoveragePct={normalizedConfig.minEvidenceCoveragePct}
            onClose={() => setMonthlyModalOpen(false)}
            onSave={handleSaveMonthlyReview}
          />
        </>
      )}
    </div>
  );
};
