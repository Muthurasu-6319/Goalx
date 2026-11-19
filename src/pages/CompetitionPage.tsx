import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  Compass,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Radar,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { CompetitionSubNav } from '../components/competition/CompetitionSubNav';
import { CompetitorFormModal } from '../components/competition/CompetitorFormModal';
import { PendingFindingsQueue } from '../components/competition/PendingFindingsQueue';
import { ProgressionStepper } from '../components/competition/ProgressionStepper';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useCompetitionAnalytics } from '../hooks/useCompetitionAnalytics';
import { EnrichedCompetitor, useCompetitors } from '../hooks/useCompetitors';
import { useToast } from '../hooks/useToast';
import { formatLastVerifiedLabel, isValidHttpUrl } from '../lib/competitorUtils';
import {
  BENCHMARK_DISCLAIMER_TEXT,
  COMPETITOR_CLASSIFICATIONS,
  COMPETITOR_STATUSES,
  COMPETITOR_VERIFICATION_STATUSES,
  MARKET_LEVELS,
  ROUTES,
  SUGGESTED_BENCHMARK_COMPETITORS,
} from '../lib/constants';
import { CompetitorFormValues } from '../lib/validators';
import {
  AiStatusResponse,
  fetchCompetitorAiStatus,
  runCompetitorAiResearch,
} from '../services/competitorAiClient';
import {
  acceptDiscoveryCandidateFinding,
  addSuggestedBenchmarks,
  createCompetitorWithCalendarSync,
  deleteCompetitorCascade,
  rejectPendingFinding,
  updateCompetitorWithCalendarSync,
} from '../services/competitorService';
import { setActiveCompetitorTarget } from '../services/competitorScoreService';
import {
  Competitor,
  CompetitorClassification,
  CompetitorPendingFinding,
  CompetitorStatus,
  CompetitorVerificationStatus,
  MarketLevel,
} from '../types';

type CompetitionTab = 'list' | 'discover';
type SortOption = 'coverage_desc' | 'coverage_asc' | 'name_asc' | 'verified_recent' | 'review_due';

const PAGE_SIZE = 9;

interface CompetitionPageProps {
  defaultTab?: CompetitionTab;
}

export const CompetitionPage: React.FC<CompetitionPageProps> = ({ defaultTab = 'list' }) => {
  const { firebaseUser } = useAuth();
  const {
    loading,
    error,
    competitors,
    enrichedCompetitors,
    competitorEvidence,
    pendingDiscoveryFindings,
    aggregateStats,
  } = useCompetitors();
  const {
    activeTarget,
    activeTargetScorecard,
    activeTargetStages,
    competitiveGaps,
  } = useCompetitionAnalytics();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<CompetitionTab>(defaultTab);
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState<MarketLevel | 'ALL'>('ALL');
  const [classificationFilter, setClassificationFilter] = useState<CompetitorClassification | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<CompetitorStatus | 'ALL'>('ALL');
  const [verificationFilter, setVerificationFilter] = useState<CompetitorVerificationStatus | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('coverage_desc');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals & Actions
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnrichedCompetitor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addingBenchmarks, setAddingBenchmarks] = useState(false);

  // AI Discovery Status & Form
  const [aiStatus, setAiStatus] = useState<AiStatusResponse | null>(null);
  const [discoveryRegion, setDiscoveryRegion] = useState('Sivakasi, Virudhunagar, Tamil Nadu');
  const [discoveryServices, setDiscoveryServices] = useState(
    'Website Development, Custom Software, Digital Marketing, Industrial Automation'
  );
  const [runningDiscovery, setRunningDiscovery] = useState(false);
  const [discoveryError, setDiscoveryError] = useState('');

  useEffect(() => {
    let active = true;
    void fetchCompetitorAiStatus().then((status) => {
      if (active) setAiStatus(status);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, marketFilter, classificationFilter, statusFilter, verificationFilter, sortBy]);

  const filteredCompetitors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = enrichedCompetitors.filter((item) => {
      const c = item.competitor;
      if (marketFilter !== 'ALL' && c.marketLevel !== marketFilter) return false;
      if (classificationFilter !== 'ALL' && c.classification !== classificationFilter) return false;
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (verificationFilter !== 'ALL' && item.summary.verificationStatus !== verificationFilter) {
        return false;
      }
      if (q) {
        const hay = `${c.companyName} ${c.location} ${c.website} ${c.primaryServices.join(' ')} ${c.industriesServed.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'coverage_desc') {
        return b.summary.coveragePct - a.summary.coveragePct || a.competitor.companyName.localeCompare(b.competitor.companyName);
      }
      if (sortBy === 'coverage_asc') {
        return a.summary.coveragePct - b.summary.coveragePct || a.competitor.companyName.localeCompare(b.competitor.companyName);
      }
      if (sortBy === 'verified_recent') {
        return (b.summary.lastVerifiedDate || '').localeCompare(a.summary.lastVerifiedDate || '');
      }
      if (sortBy === 'review_due') {
        if (a.reviewDue !== b.reviewDue) return a.reviewDue ? -1 : 1;
        return (a.competitor.nextReviewDate || '9999-99-99').localeCompare(
          b.competitor.nextReviewDate || '9999-99-99'
        );
      }
      return a.competitor.companyName.localeCompare(b.competitor.companyName);
    });

    return list;
  }, [
    enrichedCompetitors,
    searchQuery,
    marketFilter,
    classificationFilter,
    statusFilter,
    verificationFilter,
    sortBy,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredCompetitors.length / PAGE_SIZE));
  const pagedCompetitors = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCompetitors.slice(start, start + PAGE_SIZE);
  }, [filteredCompetitors, currentPage]);

  const remainingBenchmarkCount = useMemo(() => {
    const existingNames = new Set(competitors.map((c) => c.companyName.toLowerCase()));
    return SUGGESTED_BENCHMARK_COMPETITORS.filter(
      (b) => !existingNames.has(b.companyName.toLowerCase())
    ).length;
  }, [competitors]);

  const handleSaveCompetitor = async (values: CompetitorFormValues) => {
    if (!firebaseUser) return;
    try {
      if (editingCompetitor) {
        const match = enrichedCompetitors.find((item) => item.competitor.id === editingCompetitor.id);
        await updateCompetitorWithCalendarSync({
          uid: firebaseUser.uid,
          competitor: editingCompetitor,
          values,
          metricsForCompetitor: match?.metrics ?? [],
          evidenceForCompetitor: match?.evidence ?? [],
        });
        showToast('Competitor updated', { variant: 'success' });
      } else {
        await createCompetitorWithCalendarSync(firebaseUser.uid, values);
        showToast('Competitor added', { variant: 'success' });
      }
      setFormModalOpen(false);
      setEditingCompetitor(null);
    } catch (err) {
      showToast('Failed to save competitor', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!firebaseUser || !deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCompetitorCascade({
        uid: firebaseUser.uid,
        competitorId: deleteTarget.competitor.id,
        metrics: deleteTarget.metrics,
        evidence: competitorEvidence.filter((e) => e.competitorId === deleteTarget.competitor.id),
      });
      showToast('Competitor removed', { variant: 'info' });
      setDeleteTarget(null);
    } catch (err) {
      showToast('Delete failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleAddSuggestedBenchmarks = async () => {
    if (!firebaseUser) return;
    setAddingBenchmarks(true);
    try {
      const added = await addSuggestedBenchmarks(firebaseUser.uid, competitors);
      if (added > 0) {
        showToast(`Added ${added} suggested benchmark${added === 1 ? '' : 's'}`, {
          description: 'Marked as Unverified Candidates until you verify their public metrics.',
          variant: 'success',
        });
      } else {
        showToast('All suggested benchmarks are already tracked', { variant: 'info' });
      }
    } catch (err) {
      showToast('Failed to add benchmarks', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setAddingBenchmarks(false);
    }
  };

  const handleRunAiDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setDiscoveryError('');
    setRunningDiscovery(true);
    try {
      const result = await runCompetitorAiResearch({
        action: 'discover_competitors',
        region: discoveryRegion,
        servicesFocus: discoveryServices,
      });
      if (!result.ok) {
        const msg = result.error || 'AI research unavailable — enter findings manually';
        setDiscoveryError(msg);
        showToast('AI discovery unavailable', { description: msg, variant: 'warning' });
        return;
      }
      showToast(`Found ${result.findingsCount ?? 0} candidate(s) for review`, {
        description: 'Review and verify each candidate below before adding.',
        variant: 'success',
      });
    } finally {
      setRunningDiscovery(false);
    }
  };

  const handleAcceptDiscovery = async (
    finding: CompetitorPendingFinding,
    promoteStatus: CompetitorStatus
  ) => {
    if (!firebaseUser) return;
    try {
      await acceptDiscoveryCandidateFinding({
        uid: firebaseUser.uid,
        finding,
        existingCompetitors: competitors,
        promoteStatus,
      });
      showToast(`Added ${finding.candidateName} as ${promoteStatus}`, { variant: 'success' });
    } catch (err) {
      showToast('Cannot add candidate', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleRejectDiscovery = async (finding: CompetitorPendingFinding, reason: string) => {
    try {
      await rejectPendingFinding(finding, reason);
      showToast('Candidate rejected', { variant: 'info' });
    } catch (err) {
      showToast('Failed to reject candidate', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-[#DC2626]">
        Unable to load competitors: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Competition Intelligence</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Evidence-backed competitor discovery, service audits, and public verification tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {remainingBenchmarkCount > 0 && (
            <button
              type="button"
              disabled={addingBenchmarks}
              onClick={handleAddSuggestedBenchmarks}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer disabled:opacity-60"
            >
              {addingBenchmarks ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Building2 className="w-4 h-4 text-[#2563EB]" />
              )}
              <span>Add Benchmarks ({remainingBenchmarkCount})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setEditingCompetitor(null);
              setFormModalOpen(true);
            }}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-medium text-white hover:bg-[#B91C1C] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Competitor</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Tracked Active</p>
          <p className="mt-1 text-2xl font-bold text-[#1F2937] tabular-nums">
            {aggregateStats.trackedActiveCount}
          </p>
          <p className="mt-0.5 text-xs text-[#64748B] tabular-nums">
            {aggregateStats.candidateCount} unverified candidates
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Avg Evidence Coverage</p>
          <p className="mt-1 text-2xl font-bold text-[#2563EB] tabular-nums">
            {aggregateStats.avgCoveragePct}%
          </p>
          <p className="mt-0.5 text-xs text-[#64748B]">Across 24 standard metrics</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Pending AI Reviews</p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${
              aggregateStats.pendingFindingsTotal > 0 ? 'text-[#F59E0B]' : 'text-[#1F2937]'
            }`}
          >
            {aggregateStats.pendingFindingsTotal}
          </p>
          <p className="mt-0.5 text-xs text-[#64748B]">Requires human verification</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Reviews Due / Stale</p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${
              aggregateStats.reviewsDueCount + aggregateStats.staleCount > 0
                ? 'text-[#DC2626]'
                : 'text-[#16A34A]'
            }`}
          >
            {aggregateStats.reviewsDueCount} / {aggregateStats.staleCount}
          </p>
          <p className="mt-0.5 text-xs text-[#64748B]">Due today · &gt;90d stale</p>
        </div>
      </div>

      {/* Phase 5B Sub Navigation */}
      <CompetitionSubNav
        pendingCount={aggregateStats.pendingFindingsTotal}
        openGapsCount={
          competitiveGaps.filter((g) => g.status === 'Open' || g.status === 'In Progress').length
        }
      />

      {/* Executive Active Target & 8-Stage Progression Banner */}
      {activeTab === 'list' && competitors.length > 0 && (
        <ProgressionStepper
          competitors={competitors}
          activeTarget={activeTarget}
          activeScorecard={activeTargetScorecard}
          stages={activeTargetStages}
          onChangeActiveTarget={async (targetId) => {
            await setActiveCompetitorTarget({
              targetCompetitorId: targetId,
              allCompetitors: competitors,
            });
            showToast('Active Target updated', { variant: 'success' });
          }}
        />
      )}

      {/* Mode Switch Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          <Link
            to={ROUTES.COMPETITION}
            onClick={() => setActiveTab('list')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'list'
                ? 'bg-white text-[#1F2937] shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2937]'
            }`}
          >
            <Radar className="w-3.5 h-3.5" />
            <span>Tracked Competitors ({competitors.length})</span>
          </Link>
          <Link
            to={ROUTES.COMPETITION_DISCOVER}
            onClick={() => setActiveTab('discover')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'discover'
                ? 'bg-white text-[#1F2937] shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2937]'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>
              Discover &amp; AI Queue
              {pendingDiscoveryFindings.length > 0 ? ` (${pendingDiscoveryFindings.length})` : ''}
            </span>
          </Link>
        </div>

        <Link
          to={ROUTES.COMPETITION_GAPS}
          className="text-xs font-semibold text-[#2563EB] hover:underline"
        >
          Open Gap Analysis &rarr;
        </Link>
      </div>

      {/* TAB 1: TRACKED COMPETITORS LIST */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search competitor name, city, website, or service..."
                  className="w-full h-10 pl-10 pr-3 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs font-medium text-[#1F2937] bg-white"
              >
                <option value="coverage_desc">Sort: Highest Evidence Coverage</option>
                <option value="coverage_asc">Sort: Lowest Evidence Coverage</option>
                <option value="verified_recent">Sort: Most Recently Verified</option>
                <option value="review_due">Sort: Review Due First</option>
                <option value="name_asc">Sort: Name (A–Z)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <select
                value={marketFilter}
                onChange={(e) => setMarketFilter(e.target.value as MarketLevel | 'ALL')}
                className="h-9 rounded-xl border border-[#E2E8F0] px-3 text-xs bg-white text-[#1F2937]"
              >
                <option value="ALL">All Market Levels</option>
                {MARKET_LEVELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={classificationFilter}
                onChange={(e) =>
                  setClassificationFilter(e.target.value as CompetitorClassification | 'ALL')
                }
                className="h-9 rounded-xl border border-[#E2E8F0] px-3 text-xs bg-white text-[#1F2937]"
              >
                <option value="ALL">All Classifications</option>
                {COMPETITOR_CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as CompetitorStatus | 'ALL')}
                className="h-9 rounded-xl border border-[#E2E8F0] px-3 text-xs bg-white text-[#1F2937]"
              >
                <option value="ALL">All Statuses</option>
                {COMPETITOR_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                value={verificationFilter}
                onChange={(e) =>
                  setVerificationFilter(e.target.value as CompetitorVerificationStatus | 'ALL')
                }
                className="h-9 rounded-xl border border-[#E2E8F0] px-3 text-xs bg-white text-[#1F2937]"
              >
                <option value="ALL">All Verification States</option>
                {COMPETITOR_VERIFICATION_STATUSES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pending Discovery Alert Shortcut */}
          {pendingDiscoveryFindings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-900">
                <Sparkles className="w-4 h-4 text-[#F59E0B] shrink-0" />
                <span>
                  <strong>{pendingDiscoveryFindings.length}</strong> AI-discovered competitor candidate(s) awaiting your verification.
                </span>
              </div>
              <Link
                to={ROUTES.COMPETITION_DISCOVER}
                onClick={() => setActiveTab('discover')}
                className="text-xs font-semibold text-[#DC2626] hover:underline"
              >
                Review Queue &rarr;
              </Link>
            </div>
          )}

          {/* Competitor Grid */}
          {pagedCompetitors.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
              <EmptyState
                title="No matching competitors found"
                description="Adjust your filters, run discovery, or add a competitor manually with verified public URLs."
                actionLabel="Add Competitor"
                onAction={() => {
                  setEditingCompetitor(null);
                  setFormModalOpen(true);
                }}
                icon={<Radar className="w-5 h-5" />}
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {pagedCompetitors.map((item) => {
                  const { competitor: c, summary, pendingCount, reviewDue } = item;
                  const isBenchmark =
                    c.classification === 'Regional Benchmark' ||
                    c.classification === 'National Benchmark';

                  return (
                    <article
                      key={c.id}
                      className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link
                              to={`${ROUTES.COMPETITION}/${c.id}`}
                              className="text-base font-bold text-[#1F2937] hover:text-[#DC2626] truncate block"
                            >
                              {c.companyName}
                            </Link>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#64748B]">
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {c.location || 'Unknown location'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{c.marketLevel}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCompetitor(c);
                                setFormModalOpen(true);
                              }}
                              aria-label={`Edit ${c.companyName}`}
                              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(item)}
                              aria-label={`Delete ${c.companyName}`}
                              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Metadata line (clean typography + middots) */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-semibold text-[#1F2937]">{c.status}</span>
                          <span className="text-[#64748B]">·</span>
                          <span className="text-[#64748B]">{c.classification}</span>
                          <span className="text-[#64748B]">·</span>
                          <span
                            className={`font-medium ${
                              summary.verificationStatus === 'Verified'
                                ? 'text-[#16A34A]'
                                : summary.verificationStatus === 'Partially Verified'
                                  ? 'text-[#2563EB]'
                                  : 'text-[#F59E0B]'
                            }`}
                          >
                            {summary.verificationStatus}
                          </span>
                        </div>

                        {isBenchmark && (
                          <p className="text-[11px] text-[#2563EB] bg-blue-50/70 rounded-lg px-2.5 py-1.5">
                            Benchmark reference (not a Sivakasi/Virudhunagar local competitor)
                          </p>
                        )}

                        {isValidHttpUrl(c.website) ? (
                          <a
                            href={c.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline truncate max-w-full"
                          >
                            <Globe className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{c.website}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ) : (
                          <p className="text-xs text-[#64748B] flex items-center gap-1">
                            <Globe className="w-3.5 h-3.5" />
                            <span>Website: Unknown (verification needed)</span>
                          </p>
                        )}

                        {/* Evidence Coverage Bar */}
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-xs tabular-nums">
                            <span className="text-[#64748B]">
                              Evidence Coverage ({summary.evidencedCount}/{summary.totalStandardCount})
                            </span>
                            <span className="font-semibold text-[#1F2937]">
                              {summary.coveragePct}% · {summary.confidenceLevel}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
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

                        {/* Missing Info Preview */}
                        <p className="text-[11px] text-[#64748B] line-clamp-2">
                          {summary.missingMetrics.length > 0
                            ? `Missing (${summary.missingMetrics.length}): ${summary.missingMetrics
                                .slice(0, 3)
                                .map((m) => m.name)
                                .join(', ')}${summary.missingMetrics.length > 3 ? '…' : ''}`
                            : 'All 24 standard evidence metrics covered.'}
                        </p>
                      </div>

                      {/* Footer */}
                      <div className="pt-3 border-t border-[#E2E8F0] space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                          <span>{formatLastVerifiedLabel(summary.lastVerifiedDate)}</span>
                          {pendingCount > 0 && (
                            <span className="font-semibold text-[#F59E0B]">
                              {pendingCount} pending review
                            </span>
                          )}
                        </div>

                        {(summary.isStaleOver90Days || reviewDue) && (
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#DC2626]">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {reviewDue
                                ? `Review due (${c.nextReviewDate})`
                                : 'Last verified more than 90 days ago'}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <Link
                            to={`${ROUTES.COMPETITION}/${c.id}`}
                            className="flex-1 min-h-[38px] inline-flex items-center justify-center rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#1F2937] hover:border-[#DC2626] hover:text-[#DC2626] transition-colors"
                          >
                            Open Profile
                          </Link>
                          {c.status === 'Surpassed' && (
                            <Link
                              to={`${ROUTES.COMPETITION_REPORT}/${c.id}`}
                              className="min-h-[38px] inline-flex items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 px-3 text-xs font-semibold text-[#16A34A] hover:bg-emerald-100"
                            >
                              Report
                            </Link>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2 text-xs text-[#64748B]">
                  <span>
                    Page {currentPage} of {totalPages} ({filteredCompetitors.length} competitors)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="min-h-[36px] px-3 rounded-xl border border-[#E2E8F0] bg-white text-[#1F2937] disabled:opacity-50 cursor-pointer"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="min-h-[36px] px-3 rounded-xl border border-[#E2E8F0] bg-white text-[#1F2937] disabled:opacity-50 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: DISCOVERY & AI QUEUE */}
      {activeTab === 'discover' && (
        <div className="space-y-6">
          {/* AI Discovery Panel */}
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#DC2626]" />
                  <h2 className="text-base font-semibold text-[#1F2937]">
                    Competitor Discovery Workspace
                  </h2>
                </div>
                <p className="mt-1 text-xs text-[#64748B]">
                  AI-assisted findings always enter Pending Review first — never auto-saved as Verified.
                </p>
              </div>
              {aiStatus && (
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-lg ${
                    aiStatus.available
                      ? 'bg-emerald-50 text-[#16A34A]'
                      : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {aiStatus.available
                    ? `Gemini Search Grounding Ready (${aiStatus.dailyLimit}/day limit)`
                    : 'AI Offline — Manual Workflow Active'}
                </span>
              )}
            </div>

            {aiStatus && !aiStatus.available && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3 text-xs text-amber-900">
                <ShieldAlert className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">AI research unavailable — enter findings manually</p>
                  <p>{aiStatus.reason || 'Configure GEMINI_API_KEY in server secrets to enable grounded discovery.'}</p>
                </div>
              </div>
            )}

            {discoveryError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-[#DC2626]">
                {discoveryError}
              </div>
            )}

            <form onSubmit={handleRunAiDiscovery} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Target Region</label>
                <input
                  type="text"
                  value={discoveryRegion}
                  onChange={(e) => setDiscoveryRegion(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">
                  Services Focus
                </label>
                <input
                  type="text"
                  value={discoveryServices}
                  onChange={(e) => setDiscoveryServices(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={runningDiscovery || (aiStatus ? !aiStatus.available : false)}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
                >
                  {runningDiscovery ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>Run AI Discovery</span>
                </button>
              </div>
            </form>

            {/* Manual Discovery Shortcuts */}
            <div className="pt-4 border-t border-[#E2E8F0] space-y-2.5">
              <p className="text-xs font-semibold text-[#1F2937]">
                Manual Discovery Shortcuts (Sivakasi / Virudhunagar / Madurai / Tamil Nadu)
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  'IT companies in Sivakasi Virudhunagar',
                  'Web development agency Rajapalayam Srivilliputtur',
                  'Digital marketing agencies Sivakasi',
                  'Industrial automation SCADA PLC integrator Tamil Nadu',
                ].map((q) => (
                  <a
                    key={q}
                    href={`https://www.google.com/search?q=${encodeURIComponent(q)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-100"
                  >
                    <span>{q}</span>
                    <ExternalLink className="w-3 h-3 text-[#64748B]" />
                  </a>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setEditingCompetitor(null);
                    setFormModalOpen(true);
                  }}
                  className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl border border-[#DC2626] bg-white px-3 py-1.5 text-xs font-semibold text-[#DC2626] hover:bg-red-50 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Manually Found Competitor</span>
                </button>
              </div>
            </div>
          </section>

          {/* Pending AI Discovery Candidates Queue */}
          <PendingFindingsQueue
            findings={pendingDiscoveryFindings}
            mode="discovery"
            existingCompetitors={competitors}
            onAcceptDiscovery={handleAcceptDiscovery}
            onReject={handleRejectDiscovery}
          />

          {/* Optional Benchmarks Card */}
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[#1F2937]">
                Optional Regional &amp; National Benchmarks
              </h3>
              <p className="text-xs text-[#64748B] max-w-2xl leading-relaxed">
                {BENCHMARK_DISCLAIMER_TEXT}
              </p>
            </div>
            <button
              type="button"
              disabled={addingBenchmarks || remainingBenchmarkCount === 0}
              onClick={handleAddSuggestedBenchmarks}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#1F2937] hover:bg-slate-50 disabled:opacity-50 shrink-0 cursor-pointer"
            >
              {addingBenchmarks && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {remainingBenchmarkCount > 0
                  ? `Add ${remainingBenchmarkCount} Suggested Benchmarks`
                  : 'All 6 Benchmarks Added'}
              </span>
            </button>
          </section>
        </div>
      )}

      {/* Create / Edit Modal */}
      <CompetitorFormModal
        open={formModalOpen}
        editingCompetitor={editingCompetitor}
        existingCompetitors={competitors}
        onClose={() => {
          setFormModalOpen(false);
          setEditingCompetitor(null);
        }}
        onSave={handleSaveCompetitor}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.competitor.companyName || 'competitor'}?`}
        description="This permanently removes the competitor profile, its tracked metrics, evidence records, and synced review event."
        confirmLabel="Delete Competitor"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
