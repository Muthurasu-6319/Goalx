import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Globe,
  History,
  Layers,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AskAiCeoButton } from '../components/ai/AskAiCeoButton';
import { CompetitorFormModal } from '../components/competition/CompetitorFormModal';
import { ManualResearchDrawer } from '../components/competition/ManualResearchDrawer';
import {
  MetricEvidenceModal,
  MetricEvidencePreset,
} from '../components/competition/MetricEvidenceModal';
import { PendingFindingsQueue } from '../components/competition/PendingFindingsQueue';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useCompetitorEvidence } from '../hooks/useCompetitorEvidence';
import { useToast } from '../hooks/useToast';
import { formatLastVerifiedLabel, isValidHttpUrl } from '../lib/competitorUtils';
import {
  BENCHMARK_DISCLAIMER_TEXT,
  ROUTES,
  STANDARD_COMPETITOR_METRICS,
} from '../lib/constants';
import {
  CompetitorFormValues,
  CompetitorMetricEvidenceFormValues,
  PendingFindingEditFormValues,
} from '../lib/validators';
import {
  AiStatusResponse,
  fetchCompetitorAiStatus,
  runCompetitorAiResearch,
} from '../services/competitorAiClient';
import {
  deleteCompetitorEvidence,
  logManualResearchSession,
  rejectPendingFinding,
  reviewMetricPendingFinding,
  saveCompetitorMetricAndEvidence,
  updateCompetitorWithCalendarSync,
} from '../services/competitorService';
import {
  CompetitorMetric,
  CompetitorPendingFinding,
  EvidenceCategory,
} from '../types';

type ProfileTab =
  | 'overview'
  | 'services'
  | 'digital'
  | 'technology'
  | 'business'
  | 'history';

export const CompetitorProfilePage: React.FC = () => {
  const { competitorId } = useParams<{ competitorId: string }>();
  const { firebaseUser } = useAuth();
  const { showToast } = useToast();
  const {
    loading,
    error,
    competitor,
    allCompetitors,
    metrics,
    evidence,
    researchHistory,
    pendingFindings,
    reviewedFindings,
    summary,
    reviewDue,
  } = useCompetitorEvidence(competitorId);

  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [metricModalOpen, setMetricModalOpen] = useState(false);
  const [metricPreset, setMetricPreset] = useState<MetricEvidencePreset | null>(null);
  const [evidenceDeleteTarget, setEvidenceDeleteTarget] = useState<string | null>(null);
  const [deletingEvidence, setDeletingEvidence] = useState(false);
  const [showMissingAll, setShowMissingAll] = useState(false);

  const [aiStatus, setAiStatus] = useState<AiStatusResponse | null>(null);
  const [runningAiAction, setRunningAiAction] = useState<'research' | 'website' | null>(null);
  const [aiMessage, setAiMessage] = useState<string>('');

  useEffect(() => {
    let active = true;
    void fetchCompetitorAiStatus().then((st) => {
      if (active) setAiStatus(st);
    });
    return () => {
      active = false;
    };
  }, []);

  const metricByKey = useMemo(
    () => new Map(metrics.map((m) => [m.metricKey, m])),
    [metrics]
  );

  const categoryBreakdown = useMemo(() => {
    const cats: EvidenceCategory[] = [
      'Services',
      'Digital Presence',
      'Technology',
      'Business Evidence',
    ];
    return cats.map((cat) => {
      const std = STANDARD_COMPETITOR_METRICS.filter((m) => m.category === cat);
      const evidenced = std.filter((def) => {
        const matched = metricByKey.get(def.key);
        return (
          matched &&
          (matched.dataStatus === 'Verified' || matched.dataStatus === 'User Entered') &&
          isValidHttpUrl(matched.sourceUrl)
        );
      }).length;
      return {
        category: cat,
        evidenced,
        total: std.length,
        pct: std.length > 0 ? Math.round((evidenced / std.length) * 100) : 0,
      };
    });
  }, [metricByKey]);

  const handleSaveProfile = async (values: CompetitorFormValues) => {
    if (!firebaseUser || !competitor) return;
    try {
      await updateCompetitorWithCalendarSync({
        uid: firebaseUser.uid,
        competitor,
        values,
        metricsForCompetitor: metrics,
        evidenceForCompetitor: evidence,
      });
      showToast('Competitor profile updated', { variant: 'success' });
      setEditModalOpen(false);
    } catch (err) {
      showToast('Update failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleSaveMetricEvidence = async (values: CompetitorMetricEvidenceFormValues) => {
    if (!firebaseUser || !competitor) return;
    try {
      await saveCompetitorMetricAndEvidence({
        uid: firebaseUser.uid,
        competitor,
        values,
        existingMetrics: metrics,
        existingEvidence: evidence,
      });
      showToast('Metric & evidence recorded', { variant: 'success' });
      setMetricModalOpen(false);
      setMetricPreset(null);
    } catch (err) {
      showToast('Failed to save evidence', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleRecordManualSession = async (sessionSummary: string) => {
    if (!firebaseUser || !competitor) return;
    try {
      await logManualResearchSession({
        uid: firebaseUser.uid,
        competitorId: competitor.id,
        targetLabel: competitor.companyName,
        targetUrl: competitor.website,
        summary: sessionSummary,
      });
      showToast('Manual research session logged', { variant: 'success' });
    } catch (err) {
      showToast('Failed to log session', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleRunAi = async (mode: 'research' | 'website') => {
    if (!competitor) return;
    if (mode === 'website' && !isValidHttpUrl(competitor.website)) {
      showToast('Website URL required', {
        description: 'Add a valid official http/https website to the profile first.',
        variant: 'warning',
      });
      return;
    }

    setAiMessage('');
    setRunningAiAction(mode);
    try {
      const result = await runCompetitorAiResearch(
        mode === 'website'
          ? {
              action: 'analyze_website',
              competitorId: competitor.id,
              websiteUrl: competitor.website,
            }
          : {
              action: 'research_competitor',
              competitorId: competitor.id,
              websiteUrl: competitor.website || undefined,
            }
      );

      if (!result.ok) {
        const msg = result.error || 'AI research unavailable — enter findings manually';
        setAiMessage(msg);
        showToast('AI research unavailable', { description: msg, variant: 'warning' });
        return;
      }

      showToast(`Queued ${result.findingsCount ?? 0} AI-assisted finding(s)`, {
        description: 'Verify and accept/edit/reject items in the Pending Review queue.',
        variant: 'success',
      });
    } finally {
      setRunningAiAction(null);
    }
  };

  const handleAcceptMetric = async (finding: CompetitorPendingFinding) => {
    if (!firebaseUser || !competitor) return;
    try {
      const status = await reviewMetricPendingFinding({
        uid: firebaseUser.uid,
        competitor,
        finding,
        existingMetrics: metrics,
        existingEvidence: evidence,
      });
      showToast(`Accepted as ${status}`, { variant: 'success' });
    } catch (err) {
      showToast('Accept failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleEditAcceptMetric = async (
    finding: CompetitorPendingFinding,
    edited: PendingFindingEditFormValues
  ) => {
    if (!firebaseUser || !competitor) return;
    try {
      const status = await reviewMetricPendingFinding({
        uid: firebaseUser.uid,
        competitor,
        finding,
        existingMetrics: metrics,
        existingEvidence: evidence,
        edited,
      });
      showToast(`Edited & saved as ${status}`, { variant: 'success' });
    } catch (err) {
      showToast('Save failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleRejectFinding = async (finding: CompetitorPendingFinding, reason: string) => {
    try {
      await rejectPendingFinding(finding, reason);
      showToast('Finding rejected & logged to history', { variant: 'info' });
    } catch (err) {
      showToast('Reject failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleDeleteEvidence = async () => {
    if (!evidenceDeleteTarget) return;
    setDeletingEvidence(true);
    try {
      await deleteCompetitorEvidence(evidenceDeleteTarget);
      showToast('Evidence log entry removed', { variant: 'info' });
      setEvidenceDeleteTarget(null);
    } catch (err) {
      showToast('Failed to delete evidence', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setDeletingEvidence(false);
    }
  };

  const openLogMetric = (
    category: EvidenceCategory,
    metricKey: string,
    metricName: string,
    existingMetric?: CompetitorMetric
  ) => {
    setMetricPreset({
      category,
      metricKey,
      metricName,
      existingMetric,
      defaultSourceUrl: competitor?.website || '',
    });
    setMetricModalOpen(true);
  };

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-[#DC2626]">
        Failed to load competitor profile: {error}
      </div>
    );
  }

  if (!competitor || !summary) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 space-y-4">
        <p className="text-base font-semibold text-[#1F2937]">Competitor profile not found</p>
        <Link
          to={ROUTES.COMPETITION}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#DC2626] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Competition Intelligence</span>
        </Link>
      </div>
    );
  }

  const isBenchmark =
    competitor.classification === 'Regional Benchmark' ||
    competitor.classification === 'National Benchmark';

  const renderCategoryMetricsSection = (category: EvidenceCategory) => {
    const standardDefs = STANDARD_COMPETITOR_METRICS.filter((m) => m.category === category);
    const customMetrics = metrics.filter(
      (m) =>
        m.category === category && !standardDefs.some((def) => def.key === m.metricKey)
    );

    return (
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">{category}</h2>
            <p className="text-xs text-[#64748B]">
              Missing values stay Unknown until verified with a public source URL.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const first = standardDefs[0];
              openLogMetric(category, first?.key || 'custom_metric', first?.name || '');
            }}
            className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#B91C1C] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Evidence</span>
          </button>
        </div>

        <div className="divide-y divide-[#E2E8F0]">
          {standardDefs.map((def) => {
            const m = metricByKey.get(def.key);
            return (
              <div
                key={def.key}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[#1F2937]">{def.name}</p>
                    {m ? (
                      <span
                        className={`text-xs font-semibold ${
                          m.dataStatus === 'Verified'
                            ? 'text-[#16A34A]'
                            : m.dataStatus === 'User Entered'
                              ? 'text-[#2563EB]'
                              : m.dataStatus === 'Estimated'
                                ? 'text-[#F59E0B]'
                                : 'text-[#64748B]'
                        }`}
                      >
                        · {m.dataStatus}
                      </span>
                    ) : (
                      <span className="text-xs text-[#64748B]">· Unknown</span>
                    )}
                    {m?.serviceOfferStatus && (
                      <span className="text-xs font-medium text-[#1F2937]">
                        · {m.serviceOfferStatus}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#64748B]">{def.description}</p>

                  {m ? (
                    <div className="pt-1 space-y-1 text-xs">
                      <p className="font-medium text-[#1F2937]">Observed: {m.value}</p>
                      {m.evidenceDescription && (
                        <p className="text-[#64748B]">{m.evidenceDescription}</p>
                      )}
                      {m.rating && m.rating > 0 ? (
                        <p className="text-[11px] font-semibold text-[#1F2937] tabular-nums">
                          Scorecard Rating: {m.rating}/5
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#64748B]">
                        <span>{formatLastVerifiedLabel(m.lastVerifiedDate)}</span>
                        {isValidHttpUrl(m.sourceUrl) && (
                          <a
                            href={m.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
                          >
                            <span>Source URL</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => openLogMetric(category, def.key, def.name, m)}
                  className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:border-[#DC2626] hover:text-[#DC2626] shrink-0 cursor-pointer"
                >
                  {m ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{m ? 'Update' : 'Log Evidence'}</span>
                </button>
              </div>
            );
          })}

          {customMetrics.map((m) => (
            <div
              key={m.id}
              className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-[#1F2937]">
                  {m.metricName}{' '}
                  <span className="text-xs font-medium text-[#64748B]">· {m.dataStatus}</span>
                </p>
                <p className="text-xs font-medium text-[#1F2937]">Observed: {m.value}</p>
                <p className="text-xs text-[#64748B]">{m.evidenceDescription}</p>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#64748B]">
                  <span>{formatLastVerifiedLabel(m.lastVerifiedDate)}</span>
                  {isValidHttpUrl(m.sourceUrl) && (
                    <a
                      href={m.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
                    >
                      <span>Source URL</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => openLogMetric(category, m.metricKey, m.metricName, m)}
                className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:border-[#DC2626] shrink-0 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Update</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Back */}
      <div className="flex items-center justify-between gap-4">
        <Link
          to={ROUTES.COMPETITION}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#64748B] hover:text-[#1F2937]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Competition Intelligence</span>
        </Link>
        <span className="text-xs text-[#64748B]">{formatLastVerifiedLabel(summary.lastVerifiedDate)}</span>
      </div>

      {/* Profile Header Card */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold text-[#1F2937]">{competitor.companyName}</h1>
              <span className="text-xs font-semibold text-[#1F2937] bg-slate-100 px-2.5 py-1 rounded-lg">
                {competitor.status}
              </span>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
                  summary.verificationStatus === 'Verified'
                    ? 'bg-emerald-50 text-[#16A34A]'
                    : summary.verificationStatus === 'Partially Verified'
                      ? 'bg-blue-50 text-[#2563EB]'
                      : 'bg-amber-50 text-amber-800'
                }`}
              >
                {summary.verificationStatus}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#64748B]">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {competitor.location || 'Unknown location'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{competitor.marketLevel}</span>
              <span aria-hidden="true">·</span>
              <span>{competitor.classification}</span>
              <span aria-hidden="true">·</span>
              <span>Threat: {competitor.threatLevel}</span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              {isValidHttpUrl(competitor.website) ? (
                <a
                  href={competitor.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-[#2563EB] hover:underline"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{competitor.website}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-[#64748B]">Website: Unknown (add verified domain)</span>
              )}

              {competitor.nextReviewDate && (
                <span
                  className={`inline-flex items-center gap-1 tabular-nums ${
                    reviewDue ? 'text-[#DC2626] font-semibold' : 'text-[#64748B]'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>
                    Next review: {competitor.nextReviewDate}
                    {reviewDue ? ' (Due)' : ''}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
            >
              <ClipboardCheck className="w-4 h-4 text-[#2563EB]" />
              <span>Manual Workflow</span>
            </button>

            <button
              type="button"
              disabled={runningAiAction !== null || (aiStatus ? !aiStatus.available : false)}
              onClick={() => void handleRunAi('research')}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              {runningAiAction === 'research' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-[#DC2626]" />
              )}
              <span>Research Competitor</span>
            </button>

            <button
              type="button"
              disabled={
                runningAiAction !== null ||
                !isValidHttpUrl(competitor.website) ||
                (aiStatus ? !aiStatus.available : false)
              }
              onClick={() => void handleRunAi('website')}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              {runningAiAction === 'website' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Globe className="w-4 h-4 text-[#2563EB]" />
              )}
              <span>Analyze Website URL</span>
            </button>

            <button
              type="button"
              onClick={() => setEditModalOpen(true)}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-4 py-2 text-xs font-medium text-white hover:bg-[#B91C1C] cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Profile</span>
            </button>

            <Link
              to={ROUTES.COMPETITION_SCORECARDS}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F2937] hover:bg-slate-50"
            >
              <span>Scorecards</span>
            </Link>

            <Link
              to={ROUTES.COMPETITION_COMPARE}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F2937] hover:bg-slate-50"
            >
              <span>Compare</span>
            </Link>

            <AskAiCeoButton
              area="competition"
              recordId={competitor.id}
              prompt={`Compare Gen Z Neural-X against ${competitor.companyName} using only verified evidence`}
            />

            {competitor.status === 'Surpassed' && (
              <Link
                to={`${ROUTES.COMPETITION_REPORT}/${competitor.id}`}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <span>Achievement Report</span>
              </Link>
            )}
          </div>
        </div>

        {/* Benchmark Disclaimer / Staleness / AI Unavailable Notices */}
        {isBenchmark && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2.5 text-xs text-blue-900">
            {BENCHMARK_DISCLAIMER_TEXT}
          </div>
        )}

        {summary.isStaleOver90Days && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 flex items-center gap-2 text-xs text-[#DC2626]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Last verified more than 90 days ago ({summary.daysSinceLastVerified} days). Re-verify public sources to keep intelligence reliable.
            </span>
          </div>
        )}

        {((aiStatus && !aiStatus.available) || aiMessage) && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#F59E0B] shrink-0" />
              <span>
                {aiMessage || 'AI research unavailable — enter findings manually using the Manual Workflow.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="font-semibold text-[#DC2626] hover:underline shrink-0 cursor-pointer"
            >
              Open Manual Workflow
            </button>
          </div>
        )}

        {/* Evidence Coverage Progress */}
        <div className="pt-4 border-t border-[#E2E8F0] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-[#1F2937]">
              Evidence Coverage: {summary.evidencedCount} / {summary.totalStandardCount} standard metrics verified or user-entered with URL
            </span>
            <span className="font-bold text-[#1F2937] tabular-nums">
              {summary.coveragePct}% · Confidence: {summary.confidenceLevel}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                summary.coveragePct >= 70
                  ? 'bg-[#16A34A]'
                  : summary.coveragePct >= 40
                    ? 'bg-[#2563EB]'
                    : 'bg-[#F59E0B]'
              }`}
              style={{ width: `${summary.coveragePct}%` }}
            />
          </div>
        </div>
      </section>

      {/* Pending Review Queue for this Competitor */}
      <PendingFindingsQueue
        findings={pendingFindings}
        mode="metric"
        onAcceptMetric={handleAcceptMetric}
        onEditAcceptMetric={handleEditAcceptMetric}
        onReject={handleRejectFinding}
      />

      {/* Missing Information Panel */}
      {summary.missingMetrics.length > 0 && (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#1F2937]">
                Missing Information ({summary.missingMetrics.length} metrics unverified)
              </h2>
              <p className="text-xs text-[#64748B]">
                Click any missing item below to record public evidence with a source URL.
              </p>
            </div>
            {summary.missingMetrics.length > 6 && (
              <button
                type="button"
                onClick={() => setShowMissingAll((prev) => !prev)}
                className="text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
              >
                {showMissingAll ? 'Show less' : `Show all ${summary.missingMetrics.length}`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {(showMissingAll ? summary.missingMetrics : summary.missingMetrics.slice(0, 6)).map(
              (m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => openLogMetric(m.category, m.key, m.name, metricByKey.get(m.key))}
                  className="text-left rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 hover:border-[#DC2626] transition-colors flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#1F2937] truncate">{m.name}</p>
                    <p className="text-[11px] text-[#64748B] truncate">{m.category}</p>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />
                </button>
              )
            )}
          </div>
        </section>
      )}

      {/* 6 Profile Tabs */}
      <div className="flex overflow-x-auto gap-1 p-1 bg-slate-100 rounded-xl w-full sm:w-fit">
        {(
          [
            { key: 'overview', label: 'Overview' },
            { key: 'services', label: 'Services' },
            { key: 'digital', label: 'Digital Presence' },
            { key: 'technology', label: 'Technology' },
            { key: 'business', label: 'Business Evidence' },
            { key: 'history', label: `Research History (${researchHistory.length})` },
          ] as { key: ProfileTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'bg-white text-[#1F2937] shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2937]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-5">
            <h2 className="text-base font-semibold text-[#1F2937]">Company Intelligence Profile</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-[#64748B]">Founded Year</p>
                <p className="mt-0.5 font-medium text-[#1F2937]">
                  {competitor.foundedYear || 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Pricing Model</p>
                <p className="mt-0.5 font-medium text-[#1F2937]">
                  {competitor.pricingModel || 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Target Audience</p>
                <p className="mt-0.5 font-medium text-[#1F2937]">
                  {competitor.targetAudience || 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Next Scheduled Review</p>
                <p className="mt-0.5 font-medium text-[#1F2937] tabular-nums">
                  {competitor.nextReviewDate || 'Not scheduled'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-[#64748B] mb-1">Description</p>
              <p className="text-sm text-[#1F2937] leading-relaxed">
                {competitor.description || 'No description recorded yet.'}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#64748B] mb-1.5">Industries Served</p>
              {competitor.industriesServed.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {competitor.industriesServed.map((ind) => (
                    <span
                      key={ind}
                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-[#1F2937]"
                    >
                      {ind}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#64748B]">Unknown</p>
              )}
            </div>

            <div>
              <p className="text-xs text-[#64748B] mb-1.5">Primary Services Observed</p>
              {competitor.primaryServices.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {competitor.primaryServices.map((svc) => (
                    <span
                      key={svc}
                      className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-[#DC2626]"
                    >
                      {svc}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#64748B]">
                  Unknown — verify service offerings under the Services tab.
                </p>
              )}
            </div>

            {competitor.notes && (
              <div className="pt-3 border-t border-[#E2E8F0]">
                <p className="text-xs text-[#64748B] mb-1">Analyst Notes</p>
                <p className="text-xs text-[#1F2937] leading-relaxed">{competitor.notes}</p>
              </div>
            )}
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-base font-semibold text-[#1F2937]">Coverage by Pillar</h2>
            </div>

            <div className="space-y-3.5">
              {categoryBreakdown.map((item) => (
                <div key={item.category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs tabular-nums">
                    <span className="font-medium text-[#1F2937]">{item.category}</span>
                    <span className="text-[#64748B]">
                      {item.evidenced}/{item.total} ({item.pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#2563EB] transition-all duration-300"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-[#E2E8F0] text-xs text-[#64748B] space-y-1">
              <p>Total Evidence Records: {evidence.length}</p>
              <p>Research Runs Logged: {researchHistory.length}</p>
              <p>Pending AI Verification: {pendingFindings.length}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'services' && renderCategoryMetricsSection('Services')}
      {activeTab === 'digital' && renderCategoryMetricsSection('Digital Presence')}
      {activeTab === 'technology' && renderCategoryMetricsSection('Technology')}

      {activeTab === 'business' && (
        <div className="space-y-6">
          {renderCategoryMetricsSection('Business Evidence')}

          {/* Complete Evidence Audit Log */}
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-semibold text-[#1F2937]">
                Evidence Log ({evidence.length})
              </h3>
              <p className="text-xs text-[#64748B]">
                Immutable source records backing tracked metrics across manual and accepted AI research.
              </p>
            </div>

            {evidence.length === 0 ? (
              <EmptyState
                title="No evidence entries recorded yet"
                description="Use Log Evidence or the Manual Workflow to capture verifiable public links."
                actionLabel="Add Evidence"
                onAction={() => openLogMetric('Business Evidence', 'biz_founded_year', 'Founded Year')}
              />
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {evidence.map((ev) => (
                  <div
                    key={ev.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-[#1F2937]">{ev.metricName}</span>
                        <span className="text-[#64748B]">· {ev.category}</span>
                        <span className="font-medium text-[#2563EB]">· {ev.dataStatus}</span>
                        <span className="text-[#64748B]">· {ev.origin}</span>
                      </div>
                      <p className="text-sm font-medium text-[#1F2937]">{ev.value}</p>
                      <p className="text-xs text-[#64748B]">{ev.evidenceDescription}</p>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#64748B]">
                        <span>{formatLastVerifiedLabel(ev.lastVerifiedDate)}</span>
                        {isValidHttpUrl(ev.sourceUrl) && (
                          <a
                            href={ev.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
                          >
                            <span>{ev.sourceTitle || ev.sourceUrl}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEvidenceDeleteTarget(ev.id)}
                      aria-label="Delete evidence record"
                      className="p-1.5 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6">
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#2563EB]" />
                <h2 className="text-base font-semibold text-[#1F2937]">
                  Research Runs &amp; Sessions ({researchHistory.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                className="text-xs font-medium text-[#DC2626] hover:underline cursor-pointer"
              >
                + Log Manual Session
              </button>
            </div>

            {researchHistory.length === 0 ? (
              <EmptyState
                title="No research history yet"
                description="Run AI research (when enabled) or log a manual verification session to record your audit trail."
                actionLabel="Open Manual Workflow"
                onAction={() => setManualOpen(true)}
              />
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {researchHistory.map((run) => (
                  <div key={run.id} className="py-4 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#1F2937]">
                        {run.action.replace(/_/g, ' ')} · {run.status}
                      </span>
                      <span className="text-[#64748B] tabular-nums">{run.runDate}</span>
                    </div>
                    <p className="text-sm text-[#1F2937]">{run.summary}</p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#64748B]">
                      <span>Findings: {run.findingsCount}</span>
                      <span>Accepted: {run.acceptedCount}</span>
                      <span>Rejected: {run.rejectedCount}</span>
                      <span>{run.groundingUsed ? 'Google Search Grounding' : 'Manual / Offline'}</span>
                    </div>
                    {run.sourceUrls.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {run.sourceUrls.filter(isValidHttpUrl).map((u) => (
                          <a
                            key={u}
                            href={u}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-[#2563EB] hover:underline"
                          >
                            <span className="truncate max-w-[240px]">{u}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {reviewedFindings.length > 0 && (
            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-base font-semibold text-[#1F2937]">
                Reviewed AI Findings Audit ({reviewedFindings.length})
              </h3>
              <div className="divide-y divide-[#E2E8F0]">
                {reviewedFindings.map((rf) => (
                  <div key={rf.id} className="py-3 space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#1F2937]">
                        {rf.metricName}: {rf.reviewedValue || rf.proposedValue}
                      </span>
                      <span
                        className={`font-semibold inline-flex items-center gap-1 ${
                          rf.decision === 'Rejected' ? 'text-[#DC2626]' : 'text-[#16A34A]'
                        }`}
                      >
                        {rf.decision !== 'Rejected' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {rf.decision}
                      </span>
                    </div>
                    {rf.reviewedNotes && <p className="text-[#64748B]">{rf.reviewedNotes}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Modals */}
      <CompetitorFormModal
        open={editModalOpen}
        editingCompetitor={competitor}
        existingCompetitors={allCompetitors}
        onClose={() => setEditModalOpen(false)}
        onSave={handleSaveProfile}
      />

      <MetricEvidenceModal
        open={metricModalOpen}
        competitorName={competitor.companyName}
        preset={metricPreset}
        onClose={() => {
          setMetricModalOpen(false);
          setMetricPreset(null);
        }}
        onSave={handleSaveMetricEvidence}
      />

      <ManualResearchDrawer
        open={manualOpen}
        competitor={competitor}
        metrics={metrics}
        onClose={() => setManualOpen(false)}
        onLogFinding={(category, key, name) => {
          setManualOpen(false);
          openLogMetric(category, key, name, metricByKey.get(key));
        }}
        onRecordSession={handleRecordManualSession}
      />

      <ConfirmDialog
        open={Boolean(evidenceDeleteTarget)}
        title="Delete evidence record?"
        description="Removes this individual evidence entry from the audit log."
        confirmLabel="Delete Evidence"
        loading={deletingEvidence}
        onConfirm={handleDeleteEvidence}
        onCancel={() => setEvidenceDeleteTarget(null)}
      />
    </div>
  );
};
