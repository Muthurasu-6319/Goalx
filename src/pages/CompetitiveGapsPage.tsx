import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  BookTemplate,
  Calendar,
  CheckCircle2,
  FolderKanban,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { CompetitionSubNav } from '../components/competition/CompetitionSubNav';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useBusinessDataContext } from '../hooks/useBusinessData';
import { useCompetitionAnalytics } from '../hooks/useCompetitionAnalytics';
import { useToast } from '../hooks/useToast';
import {
  GAP_TEMPLATES,
  GapTemplateDef,
  ROUTES,
  SCORECARD_METRIC_DEFS,
} from '../lib/constants';
import { CompetitiveGapFormValues, competitiveGapSchema } from '../lib/validators';
import { suggestGapActionAi } from '../services/competitorAiClient';
import {
  convertGapToGoal,
  convertGapToTask,
  createCompetitiveGap,
  deleteCompetitiveGap,
  deleteTaskItem,
  updateCompetitiveGap,
  updateTaskStatus,
} from '../services/competitorScoreService';
import { CompetitiveGap, CompetitiveGapStatus, GapActionOrigin, TaskStatus } from '../types';

export const CompetitiveGapsPage: React.FC = () => {
  const { firebaseUser } = useAuth();
  const { competitorPendingFindings } = useBusinessDataContext();
  const {
    loading,
    error,
    competitors,
    competitiveGaps,
    competitiveGoals,
    tasks,
    gapsProgress,
    activeTarget,
    activeTargetScorecard,
  } = useCompetitionAnalytics();
  const { showToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<CompetitiveGapStatus | 'ALL'>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [editingGap, setEditingGap] = useState<CompetitiveGap | null>(null);
  const [actionOrigin, setActionOrigin] = useState<GapActionOrigin>('rule');
  const [templateKey, setTemplateKey] = useState<string>('');
  const [suggestingAi, setSuggestingAi] = useState(false);
  const [dismissedProposals, setDismissedProposals] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<CompetitiveGap | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const form = useForm<CompetitiveGapFormValues>({
    resolver: zodResolver(competitiveGapSchema),
    defaultValues: {
      title: '',
      description: '',
      linkedCompetitorIds: activeTarget ? [activeTarget.id] : [],
      linkedMetricKey: 'dig_portfolio_cases',
      businessImpact: 'High',
      priority: 'High',
      estimatedEffort: 'Medium',
      suggestedAction: '',
      deadline: '',
      status: 'Open',
      progressPct: 0,
    },
  });

  const openNewGapModal = () => {
    setEditingGap(null);
    setActionOrigin('rule');
    setTemplateKey('');
    form.reset({
      title: '',
      description: '',
      linkedCompetitorIds: activeTarget ? [activeTarget.id] : [],
      linkedMetricKey: 'dig_portfolio_cases',
      businessImpact: 'High',
      priority: 'High',
      estimatedEffort: 'Medium',
      suggestedAction: '',
      deadline: '',
      status: 'Open',
      progressPct: 0,
    });
    setModalOpen(true);
  };

  const openEditGapModal = (gap: CompetitiveGap) => {
    setEditingGap(gap);
    setActionOrigin(gap.suggestedActionOrigin);
    setTemplateKey(gap.templateKey ?? '');
    form.reset({
      title: gap.title,
      description: gap.description,
      linkedCompetitorIds: gap.linkedCompetitorIds,
      linkedMetricKey: gap.linkedMetricKey,
      businessImpact: gap.businessImpact,
      priority: gap.priority,
      estimatedEffort: gap.estimatedEffort,
      suggestedAction: gap.suggestedAction,
      deadline: gap.deadline,
      status: gap.status,
      progressPct: gap.progressPct,
    });
    setModalOpen(true);
  };

  const handleSaveGap = async (values: CompetitiveGapFormValues) => {
    if (!firebaseUser) return;
    try {
      if (editingGap) {
        await updateCompetitiveGap({
          uid: firebaseUser.uid,
          gap: editingGap,
          values,
          suggestedActionOrigin: actionOrigin,
        });
        showToast('Competitive gap updated', { variant: 'success' });
      } else {
        await createCompetitiveGap({
          uid: firebaseUser.uid,
          values,
          suggestedActionOrigin: actionOrigin,
          templateKey,
        });
        showToast('Competitive gap created', { variant: 'success' });
      }
      setModalOpen(false);
    } catch (err) {
      showToast('Failed to save gap', {
        description: err instanceof Error ? err.message : 'Please check fields and try again.',
        variant: 'error',
      });
    }
  };

  const handleAddTemplate = async (tpl: GapTemplateDef) => {
    if (!firebaseUser) return;
    try {
      await createCompetitiveGap({
        uid: firebaseUser.uid,
        suggestedActionOrigin: 'rule',
        templateKey: tpl.id,
        values: {
          title: tpl.title,
          description: tpl.description,
          linkedCompetitorIds: activeTarget ? [activeTarget.id] : [],
          linkedMetricKey: tpl.linkedMetricKey,
          businessImpact: tpl.businessImpact,
          priority: tpl.priority,
          estimatedEffort: tpl.estimatedEffort,
          suggestedAction: tpl.suggestedAction,
          deadline: '',
          status: 'Open',
          progressPct: 0,
        },
      });
      showToast(`Added template: ${tpl.title}`, { variant: 'success' });
      setTemplatesOpen(false);
    } catch (err) {
      showToast('Failed to add template', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleAcceptProposal = async (proposal: {
    metricKey: string;
    metricName: string;
    title: string;
    description: string;
    priority: 'Low' | 'Medium' | 'High';
    suggestedAction: string;
  }) => {
    if (!firebaseUser || !activeTarget) return;
    try {
      await createCompetitiveGap({
        uid: firebaseUser.uid,
        suggestedActionOrigin: 'rule',
        values: {
          title: proposal.title,
          description: proposal.description,
          linkedCompetitorIds: [activeTarget.id],
          linkedMetricKey: proposal.metricKey,
          businessImpact: proposal.priority,
          priority: proposal.priority,
          estimatedEffort: 'Medium',
          suggestedAction: proposal.suggestedAction,
          deadline: '',
          status: 'Open',
          progressPct: 0,
        },
      });
      setDismissedProposals((prev) => [...prev, proposal.metricKey]);
      showToast(`Gap created for ${proposal.metricName}`, { variant: 'success' });
    } catch (err) {
      showToast('Failed to accept gap', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleSuggestAction = async () => {
    const metricKey = form.getValues('linkedMetricKey');
    const metricName =
      SCORECARD_METRIC_DEFS.find((d) => d.metricKey === metricKey)?.metricName ||
      form.getValues('title') ||
      'Competitive Metric';
    const compName = activeTarget?.companyName || 'Target Competitor';
    setSuggestingAi(true);
    try {
      const res = await suggestGapActionAi({
        competitorName: compName,
        metricName,
        ownValue: 'Current GoalX baseline',
        competitorValue: 'Competitor observed benchmark',
        evidenceSummary: form.getValues('description') || form.getValues('title'),
      });
      if (res.ok && res.suggestedAction) {
        form.setValue('suggestedAction', res.suggestedAction);
        setActionOrigin('AI-assisted');
        showToast('AI action drafted (verify before saving)', { variant: 'success' });
      } else {
        // Deterministic rule-based fallback
        const fallback = `Audit ${compName}'s verified proof on ${metricName}, publish 2 quantified Gen Z Neural-X deliverables with public URLs, and review progress weekly.`;
        form.setValue('suggestedAction', fallback);
        setActionOrigin('rule');
        showToast('AI unavailable — applied rule-based action plan', { variant: 'info' });
      }
    } finally {
      setSuggestingAi(false);
    }
  };

  const handleQuickProgress = async (gap: CompetitiveGap, nextProgress: number) => {
    if (!firebaseUser) return;
    const nextStatus: CompetitiveGapStatus =
      nextProgress >= 100 ? 'Done' : nextProgress > 0 ? 'In Progress' : 'Open';
    try {
      await updateCompetitiveGap({
        uid: firebaseUser.uid,
        gap,
        values: {
          title: gap.title,
          description: gap.description,
          linkedCompetitorIds: gap.linkedCompetitorIds,
          linkedMetricKey: gap.linkedMetricKey,
          businessImpact: gap.businessImpact,
          priority: gap.priority,
          estimatedEffort: gap.estimatedEffort,
          suggestedAction: gap.suggestedAction,
          deadline: gap.deadline,
          status: nextStatus,
          progressPct: nextProgress,
        },
      });
    } catch (err) {
      showToast('Failed to update progress', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleConvertGoal = async (gap: CompetitiveGap) => {
    if (!firebaseUser) return;
    setConvertingId(`${gap.id}_goal`);
    try {
      await convertGapToGoal({
        uid: firebaseUser.uid,
        gap,
        existingLinks: competitiveGoals,
      });
      showToast('Converted to Personal Goal', {
        description: 'Linked and visible in your Goals tracker.',
        variant: 'success',
      });
    } catch (err) {
      showToast('Cannot convert to Goal', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setConvertingId(null);
    }
  };

  const handleConvertTask = async (gap: CompetitiveGap) => {
    if (!firebaseUser) return;
    setConvertingId(`${gap.id}_task`);
    try {
      await convertGapToTask({
        uid: firebaseUser.uid,
        gap,
        existingLinks: competitiveGoals,
      });
      showToast('Converted to Execution Task', { variant: 'success' });
    } catch (err) {
      showToast('Cannot convert to Task', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setConvertingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCompetitiveGap(deleteTarget);
      showToast('Gap deleted', { variant: 'info' });
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

  const filteredGaps = useMemo(() => {
    return competitiveGaps.filter((g) => statusFilter === 'ALL' || g.status === statusFilter);
  }, [competitiveGaps, statusFilter]);

  const proposals = useMemo(() => {
    if (!activeTargetScorecard) return [];
    const existingKeys = new Set(competitiveGaps.map((g) => g.linkedMetricKey));
    return activeTargetScorecard.autoGapProposals.filter(
      (p) => !dismissedProposals.includes(p.metricKey) && !existingKeys.has(p.metricKey)
    );
  }, [activeTargetScorecard, dismissedProposals, competitiveGaps]);

  const competitorNameMap = useMemo(
    () => new Map(competitors.map((c) => [c.id, c.companyName])),
    [competitors]
  );

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-[#DC2626]">
        Failed to load competitive gaps: {error}
      </div>
    );
  }

  const pendingCount = competitorPendingFindings.filter((f) => f.decision === 'Pending').length;
  const openGapsCount = competitiveGaps.filter(
    (g) => g.status === 'Open' || g.status === 'In Progress'
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Competitive Gap Analysis</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Identify areas where competitors lead, convert gaps into Goals &amp; Tasks, and track
            execution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setTemplatesOpen(true)}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F2937] hover:bg-slate-50 cursor-pointer"
          >
            <BookTemplate className="w-4 h-4 text-[#2563EB]" />
            <span>Pre-built Templates ({GAP_TEMPLATES.length})</span>
          </button>
          <button
            type="button"
            onClick={openNewGapModal}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Gap</span>
          </button>
        </div>
      </div>

      <CompetitionSubNav pendingCount={pendingCount} openGapsCount={openGapsCount} />

      {/* Overall Gap Closure Progress Card */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
          <span className="font-semibold text-[#1F2937]">
            Gap Closure Progress ({gapsProgress.completedCount} of {gapsProgress.totalActive} closed)
          </span>
          <span className="font-bold text-[#16A34A]">{gapsProgress.avgProgressPct}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#16A34A] transition-all duration-300"
            style={{ width: `${gapsProgress.avgProgressPct}%` }}
          />
        </div>
      </section>

      {/* Auto-Suggested Gaps from Active Target Scorecard */}
      {activeTarget && proposals.length > 0 && (
        <section className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-amber-900">
              Suggested Gaps vs {activeTarget.companyName} ({proposals.length})
            </p>
            <span className="text-[11px] text-amber-800">
              Based on metrics where {activeTarget.companyName} scores higher
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {proposals.map((prop) => (
              <div
                key={prop.metricKey}
                className="rounded-xl border border-amber-200 bg-white p-3.5 flex flex-col justify-between gap-3"
              >
                <div>
                  <p className="text-xs font-semibold text-[#1F2937]">{prop.title}</p>
                  <p className="mt-1 text-[11px] text-[#64748B]">{prop.description}</p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDismissedProposals((prev) => [...prev, prop.metricKey])
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] hover:bg-slate-100 cursor-pointer"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAcceptProposal(prop)}
                    className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-xs font-semibold text-white hover:bg-[#B91C1C] cursor-pointer"
                  >
                    Add Gap
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit overflow-x-auto">
        {(['ALL', 'Open', 'In Progress', 'Done', 'Dismissed'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
              statusFilter === st
                ? 'bg-white text-[#1F2937] shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2937]'
            }`}
          >
            {st === 'ALL' ? `All (${competitiveGaps.length})` : st}
          </button>
        ))}
      </div>

      {/* Gap Cards Grid */}
      {filteredGaps.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            title="No competitive gaps in this view"
            description="Add a custom gap or pick from the 9 pre-built templates to close your highest-impact competitive weaknesses."
            actionLabel="Browse Templates"
            onAction={() => setTemplatesOpen(true)}
            icon={<ListChecks className="w-5 h-5" />}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredGaps.map((gap) => {
            const linkedNames = gap.linkedCompetitorIds
              .map((id) => competitorNameMap.get(id))
              .filter(Boolean)
              .join(', ');
            const hasGoal = Boolean(gap.convertedGoalId);
            const hasTask = Boolean(gap.convertedTaskId);

            return (
              <article
                key={gap.id}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#1F2937]">{gap.title}</h3>
                      <p className="mt-1 text-xs text-[#64748B]">
                        {gap.status} · Priority: {gap.priority} · Impact: {gap.businessImpact} · Effort:{' '}
                        {gap.estimatedEffort}
                      </p>
                      {linkedNames && (
                        <p className="mt-0.5 text-[11px] text-[#2563EB]">vs {linkedNames}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditGapModal(gap)}
                        aria-label={`Edit ${gap.title}`}
                        className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(gap)}
                        aria-label={`Delete ${gap.title}`}
                        className="p-1.5 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {gap.description && (
                    <p className="text-xs text-[#64748B] leading-relaxed">{gap.description}</p>
                  )}

                  {gap.suggestedAction && (
                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 text-xs">
                      <p className="font-semibold text-[#1F2937] mb-0.5">
                        Action Plan ({gap.suggestedActionOrigin})
                      </p>
                      <p className="text-[#64748B]">{gap.suggestedAction}</p>
                    </div>
                  )}

                  {/* Progress Bar & Quick Steppers */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="text-[#64748B]">Execution Progress</span>
                      <span className="font-bold text-[#1F2937]">{gap.progressPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#16A34A] transition-all duration-300"
                        style={{ width: `${gap.progressPct}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {[0, 25, 50, 75, 100].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => void handleQuickProgress(gap, pct)}
                          className={`px-2 py-1 rounded-md text-[11px] font-medium border cursor-pointer tabular-nums ${
                            gap.progressPct === pct
                              ? 'bg-[#1F2937] text-white border-[#1F2937]'
                              : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-slate-50'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                      {gap.deadline && (
                        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#64748B] tabular-nums">
                          <Calendar className="w-3 h-3" />
                          <span>Due {gap.deadline}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Conversion Actions */}
                <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center gap-2">
                  {hasGoal ? (
                    <Link
                      to={ROUTES.GOALS}
                      className="min-h-[34px] inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-[#16A34A]"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Linked to Goal</span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={convertingId === `${gap.id}_goal`}
                      onClick={() => void handleConvertGoal(gap)}
                      className="min-h-[34px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-medium text-[#1F2937] hover:border-[#2563EB] hover:text-[#2563EB] cursor-pointer"
                    >
                      {convertingId === `${gap.id}_goal` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Target className="w-3.5 h-3.5" />
                      )}
                      <span>Convert to Goal</span>
                    </button>
                  )}

                  {hasTask ? (
                    <span className="min-h-[34px] inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-[#2563EB]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Task Created</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={convertingId === `${gap.id}_task`}
                      onClick={() => void handleConvertTask(gap)}
                      className="min-h-[34px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-medium text-[#1F2937] hover:border-[#DC2626] hover:text-[#DC2626] cursor-pointer"
                    >
                      {convertingId === `${gap.id}_task` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FolderKanban className="w-3.5 h-3.5" />
                      )}
                      <span>Convert to Task</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Converted Execution Tasks Board */}
      {tasks.length > 0 && (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">
              Competitive Execution Tasks ({tasks.length})
            </h2>
            <p className="text-xs text-[#64748B]">
              Actionable tasks generated from Competitive Gaps.
            </p>
          </div>
          <div className="divide-y divide-[#E2E8F0]">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      task.status === 'Done' ? 'line-through text-[#64748B]' : 'text-[#1F2937]'
                    }`}
                  >
                    {task.title}
                  </p>
                  <p className="text-xs text-[#64748B] tabular-nums">
                    Priority: {task.priority}
                    {task.dueDate ? ` · Due ${task.dueDate}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={task.status}
                    onChange={(e) => void updateTaskStatus(task.id, e.target.value as TaskStatus)}
                    className="h-9 rounded-xl border border-[#E2E8F0] bg-white px-2.5 text-xs font-medium text-[#1F2937]"
                  >
                    <option value="Todo">Todo</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Done">Done</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void deleteTaskItem(task.id)}
                    aria-label="Delete task"
                    className="p-1.5 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pre-built Gap Templates Modal */}
      {templatesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <div>
                <h2 className="text-base font-semibold text-[#1F2937]">
                  9 Pre-built Competitive Gap Templates
                </h2>
                <p className="text-xs text-[#64748B]">
                  1-click add to your Gap Analysis linked to {activeTarget?.companyName || 'your target'}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTemplatesOpen(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 max-h-[75vh] overflow-y-auto">
              {GAP_TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-[#1F2937]">{tpl.title}</p>
                    <p className="text-xs text-[#64748B]">{tpl.description}</p>
                    <p className="text-[11px] text-[#64748B]">
                      Impact: {tpl.businessImpact} · Effort: {tpl.estimatedEffort}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAddTemplate(tpl)}
                    className="min-h-[36px] inline-flex items-center gap-1 rounded-xl bg-[#DC2626] px-3.5 text-xs font-semibold text-white hover:bg-[#B91C1C] shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Gap Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <h2 className="text-base font-semibold text-[#1F2937]">
                {editingGap ? 'Edit Competitive Gap' : 'New Competitive Gap'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={form.handleSubmit(handleSaveGap)}
              className="p-6 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Gap Title</label>
                <input
                  type="text"
                  placeholder="e.g. Publish 5 live SaaS & IIoT case studies"
                  {...form.register('title')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm"
                />
                {form.formState.errors.title && (
                  <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.title.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">
                  Linked Benchmark Metric
                </label>
                <select
                  {...form.register('linkedMetricKey')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm"
                >
                  {SCORECARD_METRIC_DEFS.map((m) => (
                    <option key={m.metricKey} value={m.metricKey}>
                      {m.metricName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Impact</label>
                  <select
                    {...form.register('businessImpact')}
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-2.5 text-xs"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Priority</label>
                  <select
                    {...form.register('priority')}
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-2.5 text-xs"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Effort</label>
                  <select
                    {...form.register('estimatedEffort')}
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-2.5 text-xs"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Why this gap matters..."
                  {...form.register('description')}
                  className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[#1F2937]">
                    Suggested Action ({actionOrigin})
                  </label>
                  <button
                    type="button"
                    disabled={suggestingAi}
                    onClick={() => void handleSuggestAction()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#DC2626] hover:underline cursor-pointer"
                  >
                    {suggestingAi ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>Generate Action</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  placeholder="Concrete next step..."
                  {...form.register('suggestedAction')}
                  className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">
                    Deadline (syncs to Calendar)
                  </label>
                  <input
                    type="date"
                    {...form.register('deadline')}
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Status</label>
                  <select
                    {...form.register('status')}
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs"
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Done">Done</option>
                    <option value="Dismissed">Dismissed</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[42px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 text-sm font-medium text-white hover:bg-[#B91C1C] cursor-pointer"
                >
                  {form.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingGap ? 'Save Changes' : 'Create Gap'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete gap "${deleteTarget?.title || ''}"?`}
        description="This removes the competitive gap and its synced calendar deadline."
        confirmLabel="Delete Gap"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
