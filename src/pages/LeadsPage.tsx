import React, { useMemo, useRef, useState } from 'react';
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
  Archive,
  BarChart3,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Columns3,
  GripVertical,
  ListFilter,
  Loader2,
  Plus,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { AskAiCeoButton } from '../components/ai/AskAiCeoButton';
import { LeadDetailDrawer } from '../components/leads/LeadDetailDrawer';
import { LeadFormModal } from '../components/leads/LeadFormModal';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useBusinessDataContext } from '../hooks/useBusinessData';
import { useLeads } from '../hooks/useLeads';
import { useServices } from '../hooks/useServices';
import { useToast } from '../hooks/useToast';
import {
  computeCrmMetrics,
  computeLeadsByService,
  computeLeadSourceStats,
  computeMonthlyLeadTrend,
  getFollowUpBuckets,
} from '../lib/businessUtils';
import { LEAD_SOURCES, LEAD_STATUSES } from '../lib/constants';
import { computeLeadSourceRevenue } from '../lib/financeUtils';
import { getTodayDateString } from '../lib/goalUtils';
import { formatINR } from '../lib/moneyUtils';
import { transitionLeadStatus } from '../services/leadsService';
import { Lead, LeadStatus } from '../types';

type WorkspaceTab = 'kanban' | 'list' | 'analytics';
const PAGE_SIZE = 10;

const STAGE_ACCENTS: Record<LeadStatus, string> = {
  New: 'text-[#2563EB]',
  Contacted: 'text-indigo-600',
  Interested: 'text-amber-600',
  'Follow-up': 'text-[#F59E0B]',
  'Proposal Sent': 'text-purple-600',
  Negotiation: 'text-orange-600',
  Won: 'text-[#16A34A]',
  Lost: 'text-[#DC2626]',
};

export const LeadsPage: React.FC = () => {
  const { firebaseUser } = useAuth();
  const { leads, activeLeads, archivedLeads, loading, error } = useLeads();
  const { services } = useServices();
  const { showToast } = useToast();

  const [tab, setTab] = useState<WorkspaceTab>('kanban');
  const [formOpen, setFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // List filters
  const [showArchived, setShowArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'budget_desc' | 'followup_asc'>('newest');
  const [page, setPage] = useState(1);

  // Drag & Drop state (desktop HTML5 + mobile touch)
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<LeadStatus | null>(null);
  const touchDragRef = useRef<{ leadId: string; active: boolean } | null>(null);
  const [touchDraggingLabel, setTouchDraggingLabel] = useState<string | null>(null);

  // Lost Reason modal state
  const [lostPrompt, setLostPrompt] = useState<{ lead: Lead; reason: string } | null>(null);
  const [savingLost, setSavingLost] = useState(false);

  const todayStr = getTodayDateString();
  const selectedLead = useMemo(
    () => (selectedLeadId ? leads.find((l) => l.id === selectedLeadId) ?? null : null),
    [leads, selectedLeadId]
  );

  // Analytics & Follow-up calculations
  const metrics = useMemo(() => computeCrmMetrics(leads), [leads]);
  const sourceStats = useMemo(() => computeLeadSourceStats(leads), [leads]);
  const monthlyTrend = useMemo(() => computeMonthlyLeadTrend(leads, 6), [leads]);
  const serviceBreakdown = useMemo(
    () => computeLeadsByService(leads, services),
    [leads, services]
  );
  const { todayFollowUps, overdueFollowUps } = useMemo(
    () => getFollowUpBuckets(leads, todayStr),
    [leads, todayStr]
  );

  // Filtered List
  const filteredList = useMemo(() => {
    const base = showArchived ? archivedLeads : activeLeads;
    const q = searchTerm.trim().toLowerCase();

    const filtered = base.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && l.leadSource !== sourceFilter) return false;
      if (serviceFilter !== 'all' && l.serviceCategory !== serviceFilter) return false;
      if (dateFrom && l.leadGeneratedDate < dateFrom) return false;
      if (dateTo && l.leadGeneratedDate > dateTo) return false;
      if (!q) return true;
      return (
        l.clientName.toLowerCase().includes(q) ||
        l.businessName.toLowerCase().includes(q) ||
        l.phone.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.location.toLowerCase().includes(q) ||
        l.serviceCategory.toLowerCase().includes(q)
      );
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'budget_desc') return b.estimatedBudgetPaise - a.estimatedBudgetPaise;
      if (sortBy === 'followup_asc') {
        const fa = a.followUpDate || '9999-99-99';
        const fb = b.followUpDate || '9999-99-99';
        return fa.localeCompare(fb);
      }
      return b.leadGeneratedDate.localeCompare(a.leadGeneratedDate);
    });
  }, [
    showArchived,
    archivedLeads,
    activeLeads,
    searchTerm,
    statusFilter,
    sourceFilter,
    serviceFilter,
    dateFrom,
    dateTo,
    sortBy,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedLeads = filteredList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleRequestStageChange = async (lead: Lead, nextStatus: LeadStatus) => {
    if (!firebaseUser || lead.status === nextStatus) return;
    if (nextStatus === 'Lost') {
      setLostPrompt({ lead, reason: lead.lostReason || '' });
      return;
    }
    try {
      await transitionLeadStatus(firebaseUser.uid, lead, nextStatus);
      showToast(`Moved ${lead.clientName} to ${nextStatus}`, { variant: 'success' });
    } catch (err) {
      showToast('Stage update failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleConfirmLost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !lostPrompt) return;
    const reason = lostPrompt.reason.trim();
    if (!reason) {
      showToast('Please enter a lost reason', { variant: 'warning' });
      return;
    }
    setSavingLost(true);
    try {
      await transitionLeadStatus(firebaseUser.uid, lostPrompt.lead, 'Lost', reason);
      showToast(`${lostPrompt.lead.clientName} marked Lost`, { variant: 'info' });
      setLostPrompt(null);
    } catch (err) {
      showToast('Update failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSavingLost(false);
    }
  };

  // Touch drag handlers on grip handle
  const handleTouchStartGrip = (lead: Lead) => {
    touchDragRef.current = { leadId: lead.id, active: true };
    setDraggedLeadId(lead.id);
    setTouchDraggingLabel(lead.clientName);
  };

  const handleTouchMoveGrip = (e: React.TouchEvent) => {
    if (!touchDragRef.current?.active || e.touches.length === 0) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const colEl = el?.closest('[data-stage-column]') as HTMLElement | null;
    const stageAttr = colEl?.dataset.stageColumn as LeadStatus | undefined;
    setDragOverStage(stageAttr ?? null);
  };

  const handleTouchEndGrip = () => {
    const dragInfo = touchDragRef.current;
    const targetStage = dragOverStage;
    touchDragRef.current = null;
    setDraggedLeadId(null);
    setDragOverStage(null);
    setTouchDraggingLabel(null);

    if (dragInfo?.active && targetStage) {
      const lead = activeLeads.find((l) => l.id === dragInfo.leadId);
      if (lead && lead.status !== targetStage) {
        void handleRequestStageChange(lead, targetStage);
      }
    }
  };

  const openCreateModal = () => {
    setEditingLead(null);
    setFormOpen(true);
  };

  const openEditModal = (lead: Lead) => {
    setSelectedLeadId(null);
    setEditingLead(lead);
    setFormOpen(true);
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-[#DC2626]">
        Unable to load leads: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Leads & CRM</h1>
          <p className="mt-1 text-sm text-[#64748B] tabular-nums">
            {metrics.totalLeads} total · {metrics.activePipelineLeads} in pipeline ·{' '}
            {metrics.conversionRatePct}% conversion
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <AskAiCeoButton
            area="leads"
            prompt="Which leads need follow-up today and how can we lift conversion?"
          />
          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Lead</span>
          </button>
        </div>
      </div>

      {/* Workspace Tab Switcher */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab('kanban')}
          className={`min-h-[38px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            tab === 'kanban'
              ? 'bg-white text-[#1F2937] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          <Columns3 className="w-4 h-4" />
          <span>Kanban Pipeline</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('list')}
          className={`min-h-[38px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            tab === 'list'
              ? 'bg-white text-[#1F2937] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          <ListFilter className="w-4 h-4" />
          <span>Lead List ({activeLeads.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('analytics')}
          className={`min-h-[38px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            tab === 'analytics'
              ? 'bg-white text-[#1F2937] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>CRM Analytics</span>
        </button>
      </div>

      {/* Touch Drag Floating Pill */}
      {touchDraggingLabel && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#1F2937] text-white text-xs font-medium shadow-lg pointer-events-none">
          Dragging: {touchDraggingLabel} {dragOverStage ? `→ ${dragOverStage}` : ''}
        </div>
      )}

      {/* TAB 1: KANBAN PIPELINE */}
      {tab === 'kanban' && (
        <>
          {activeLeads.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
              <EmptyState
                title="Your CRM pipeline is empty"
                description="Add your first lead from Meta Ads, Direct inquiry, Referral, or Website to track them across stages."
                actionLabel="Add Lead"
                onAction={openCreateModal}
              />
            </div>
          ) : (
            <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="flex gap-4 min-w-max">
                {LEAD_STATUSES.map((stage) => {
                  const stageLeads = activeLeads.filter((l) => l.status === stage);
                  const isOver = dragOverStage === stage;

                  return (
                    <div
                      key={stage}
                      data-stage-column={stage}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverStage !== stage) setDragOverStage(stage);
                      }}
                      onDragLeave={() => {
                        if (dragOverStage === stage) setDragOverStage(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverStage(null);
                        const id = e.dataTransfer.getData('text/plain') || draggedLeadId;
                        setDraggedLeadId(null);
                        const lead = activeLeads.find((l) => l.id === id);
                        if (lead && lead.status !== stage) {
                          void handleRequestStageChange(lead, stage);
                        }
                      }}
                      className={`w-[290px] rounded-2xl border p-3.5 flex flex-col gap-3 transition-colors ${
                        isOver
                          ? 'bg-red-50/60 border-[#DC2626]'
                          : 'bg-[#F8FAFC] border-[#E2E8F0]'
                      }`}
                    >
                      <div className="flex items-center justify-between px-1">
                        <span className={`text-xs font-semibold ${STAGE_ACCENTS[stage]}`}>
                          {stage}
                        </span>
                        <span className="text-xs font-semibold text-[#64748B] tabular-nums">
                          {stageLeads.length}
                        </span>
                      </div>

                      <div className="space-y-2.5 min-h-[120px]">
                        {stageLeads.map((lead) => (
                          <div
                            key={lead.id}
                            draggable
                            onDragStart={(e) => {
                              setDraggedLeadId(lead.id);
                              e.dataTransfer.setData('text/plain', lead.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => {
                              setDraggedLeadId(null);
                              setDragOverStage(null);
                            }}
                            className={`bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-xs space-y-2.5 transition-opacity ${
                              draggedLeadId === lead.id ? 'opacity-50' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedLeadId(lead.id)}
                                className="text-left min-w-0 flex-1 cursor-pointer"
                              >
                                <p className="text-sm font-semibold text-[#1F2937] truncate hover:text-[#DC2626]">
                                  {lead.clientName}
                                </p>
                                {lead.businessName && (
                                  <p className="text-xs text-[#64748B] truncate">
                                    {lead.businessName}
                                  </p>
                                )}
                              </button>

                              <button
                                type="button"
                                aria-label={`Drag ${lead.clientName}`}
                                onTouchStart={() => handleTouchStartGrip(lead)}
                                onTouchMove={handleTouchMoveGrip}
                                onTouchEnd={handleTouchEndGrip}
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-[#64748B] hover:bg-slate-100 cursor-grab touch-none shrink-0"
                              >
                                <GripVertical className="w-4 h-4" />
                              </button>
                            </div>

                            <p className="text-xs text-[#64748B] truncate">
                              {lead.serviceCategory} · {lead.leadSource}
                            </p>

                            <div className="flex items-center justify-between text-xs tabular-nums">
                              <span className="font-semibold text-[#1F2937]">
                                {lead.estimatedBudgetPaise > 0
                                  ? formatINR(lead.estimatedBudgetPaise)
                                  : 'Budget TBD'}
                              </span>
                              {lead.followUpDate && (
                                <span
                                  className={
                                    lead.followUpDate < todayStr
                                      ? 'text-[#DC2626] font-medium'
                                      : 'text-[#64748B]'
                                  }
                                >
                                  FU: {lead.followUpDate}
                                </span>
                              )}
                            </div>

                            {lead.convertedClientId && (
                              <p className="text-[11px] font-medium text-[#16A34A] inline-flex items-center gap-1">
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Converted to Client</span>
                              </p>
                            )}

                            {/* Mobile & accessibility fallback stage selector */}
                            <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between gap-2">
                              <label className="text-[11px] text-[#64748B]">Move to</label>
                              <select
                                aria-label={`Move ${lead.clientName} to stage`}
                                value={lead.status}
                                onChange={(e) =>
                                  void handleRequestStageChange(lead, e.target.value as LeadStatus)
                                }
                                className="min-h-[34px] px-2 py-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#1F2937] cursor-pointer"
                              >
                                {LEAD_STATUSES.map((st) => (
                                  <option key={st} value={st}>
                                    {st}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: LEAD LIST VIEW */}
      {tab === 'list' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="relative lg:col-span-2">
                <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search client, business, phone, email..."
                  className="w-full min-h-[42px] pl-10 pr-3 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'all' | LeadStatus);
                  setPage(1);
                }}
                className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937] bg-white"
              >
                <option value="all">All Stages</option>
                {LEAD_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>

              <select
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setPage(1);
                }}
                className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937] bg-white"
              >
                <option value="all">All Sources</option>
                {LEAD_SOURCES.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>

              <select
                value={serviceFilter}
                onChange={(e) => {
                  setServiceFilter(e.target.value);
                  setPage(1);
                }}
                className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937] bg-white"
              >
                <option value="all">All Services</option>
                {services.map((svc) => (
                  <option key={svc.id} value={svc.name}>
                    {svc.name}
                  </option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937] bg-white"
              >
                <option value="newest">Newest Generated</option>
                <option value="budget_desc">Highest Budget</option>
                <option value="followup_asc">Earliest Follow-up</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E2E8F0]">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                <span>Date from</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] text-xs text-[#1F2937]"
                />
                <span>to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] text-xs text-[#1F2937]"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowArchived(!showArchived);
                  setPage(1);
                }}
                className={`min-h-[38px] inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer ${
                  showArchived
                    ? 'bg-red-50 border-red-200 text-[#DC2626]'
                    : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#1F2937]'
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                <span>
                  {showArchived
                    ? `Viewing Archived (${archivedLeads.length})`
                    : `Show Archived (${archivedLeads.length})`}
                </span>
              </button>
            </div>
          </div>

          {paginatedLeads.length > 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                      <th className="py-3 px-4">Lead / Business</th>
                      <th className="py-3 px-4">Service & Source</th>
                      <th className="py-3 px-4">Stage</th>
                      <th className="py-3 px-4 text-right">Budget</th>
                      <th className="py-3 px-4">Follow-up</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-sm">
                    {paginatedLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => setSelectedLeadId(lead.id)}
                            className="text-left cursor-pointer"
                          >
                            <p className="font-semibold text-[#1F2937] hover:text-[#DC2626]">
                              {lead.clientName}
                            </p>
                            <p className="text-xs text-[#64748B]">
                              {[lead.businessName, lead.phone, lead.location]
                                .filter(Boolean)
                                .join(' · ') || 'No contact details'}
                            </p>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-xs text-[#64748B]">
                          <p className="font-medium text-[#1F2937]">{lead.serviceCategory}</p>
                          <p>{lead.leadSource}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs font-semibold ${STAGE_ACCENTS[lead.status]}`}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-[#1F2937] tabular-nums">
                          {lead.estimatedBudgetPaise > 0
                            ? formatINR(lead.estimatedBudgetPaise)
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#64748B] tabular-nums">
                          {lead.followUpDate || '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedLeadId(lead.id)}
                            className="text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
                  <span className="tabular-nums">
                    Page {safePage} of {totalPages} ({filteredList.length} leads)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#E2E8F0] disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#E2E8F0] disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
              <EmptyState
                title={showArchived ? 'No archived leads' : 'No matching leads'}
                description={
                  showArchived
                    ? 'Archived leads will appear here and can be restored anytime.'
                    : 'Adjust your filters or add a new lead.'
                }
                actionLabel={!showArchived ? 'Add Lead' : undefined}
                onAction={!showArchived ? openCreateModal : undefined}
              />
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CRM ANALYTICS */}
      {tab === 'analytics' && (
        <div className="space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
              <p className="text-xs text-[#64748B]">Total Leads</p>
              <p className="mt-1 text-2xl font-bold text-[#1F2937] tabular-nums">
                {metrics.totalLeads}
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
              <p className="text-xs text-[#64748B]">Qualified (Interested+)</p>
              <p className="mt-1 text-2xl font-bold text-[#2563EB] tabular-nums">
                {metrics.qualifiedLeads}
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
              <p className="text-xs text-[#64748B]">Converted (Won)</p>
              <p className="mt-1 text-2xl font-bold text-[#16A34A] tabular-nums">
                {metrics.wonLeads}
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
              <p className="text-xs text-[#64748B]">Lost</p>
              <p className="mt-1 text-2xl font-bold text-[#DC2626] tabular-nums">
                {metrics.lostLeads}
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 col-span-2 lg:col-span-1">
              <p className="text-xs text-[#64748B]">Conversion Rate</p>
              <p className="mt-1 text-2xl font-bold text-[#1F2937] tabular-nums">
                {metrics.conversionRatePct}%
              </p>
            </div>
          </div>

          {/* Today's & Overdue Follow-ups */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-[#DC2626]" />
                  <h2 className="text-base font-semibold text-[#1F2937]">
                    Overdue Follow-ups ({overdueFollowUps.length})
                  </h2>
                </div>
              </div>
              {overdueFollowUps.length > 0 ? (
                <ul className="divide-y divide-[#E2E8F0]">
                  {overdueFollowUps.map((lead) => (
                    <li key={lead.id} className="py-2.5 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedLeadId(lead.id)}
                        className="text-left min-w-0 cursor-pointer"
                      >
                        <p className="text-sm font-medium text-[#1F2937] truncate hover:text-[#DC2626]">
                          {lead.clientName}
                        </p>
                        <p className="text-xs text-[#64748B] truncate">
                          {lead.serviceCategory} · {lead.status}
                        </p>
                      </button>
                      <span className="text-xs font-semibold text-[#DC2626] tabular-nums shrink-0">
                        {lead.followUpDate}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#64748B]">No overdue follow-ups.</p>
              )}
            </section>

            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#2563EB]" />
                <h2 className="text-base font-semibold text-[#1F2937]">
                  Today&apos;s Follow-ups ({todayFollowUps.length})
                </h2>
              </div>
              {todayFollowUps.length > 0 ? (
                <ul className="divide-y divide-[#E2E8F0]">
                  {todayFollowUps.map((lead) => (
                    <li key={lead.id} className="py-2.5 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedLeadId(lead.id)}
                        className="text-left min-w-0 cursor-pointer"
                      >
                        <p className="text-sm font-medium text-[#1F2937] truncate hover:text-[#DC2626]">
                          {lead.clientName}
                        </p>
                        <p className="text-xs text-[#64748B] truncate">
                          {lead.serviceCategory} · {lead.phone || lead.email || 'No contact'}
                        </p>
                      </button>
                      <span className="text-xs font-medium text-[#2563EB] shrink-0">
                        {lead.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#64748B]">No follow-ups scheduled for today.</p>
              )}
            </section>
          </div>

          {/* Charts: Monthly Lead Trend + Leads by Service */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-[#1F2937]">Monthly Lead Trend (6M)</h2>
                <p className="text-xs text-[#64748B]">Total leads generated vs. Won conversions</p>
              </div>
              {metrics.totalLeads > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTrend} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '12px', borderColor: '#E2E8F0', fontSize: '12px' }} />
                      <Bar dataKey="total" name="Total Leads" fill="#2563EB" radius={[6, 6, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="won" name="Won" fill="#16A34A" radius={[6, 6, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="No lead trend data yet"
                  description="Add leads to visualize monthly lead velocity."
                  actionLabel="Add Lead"
                  onAction={openCreateModal}
                />
              )}
            </section>

            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-[#1F2937]">Leads by Service</h2>
                <p className="text-xs text-[#64748B]">Distribution across your service catalog</p>
              </div>
              {serviceBreakdown.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serviceBreakdown} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="service" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '12px', borderColor: '#E2E8F0', fontSize: '12px' }} />
                      <Bar dataKey="count" name="Leads" fill="#DC2626" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="No service breakdown yet"
                  description="Service demand appears automatically once leads are logged."
                />
              )}
            </section>
          </div>

          {/* Lead Source Performance + Revenue Placeholder */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-semibold text-[#1F2937]">Lead Source Performance</h2>
              {sourceStats.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                        <th className="py-2.5 pr-4">Source</th>
                        <th className="py-2.5 px-4 text-right">Leads</th>
                        <th className="py-2.5 px-4 text-right">Won</th>
                        <th className="py-2.5 pl-4 text-right">Conversion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {sourceStats.map((row) => (
                        <tr key={row.source}>
                          <td className="py-2.5 pr-4 font-medium text-[#1F2937]">{row.source}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums">{row.total}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-[#16A34A] font-medium">
                            {row.won}
                          </td>
                          <td className="py-2.5 pl-4 text-right tabular-nums font-semibold">
                            {row.conversionPct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-[#64748B]">No lead sources recorded yet.</p>
              )}
            </section>

            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-[#1F2937]">Revenue Generated from Leads</h2>
                <p className="mt-0.5 text-xs text-[#64748B]">
                  Cash collected from clients converted via each lead source
                </p>
              </div>
              <LeadSourceRevenuePanel leads={leads} />
            </section>
          </div>
        </div>
      )}

      {/* Create / Edit Lead Modal */}
      <LeadFormModal
        open={formOpen}
        editingLead={editingLead}
        existingLeads={leads}
        onClose={() => setFormOpen(false)}
      />

      {/* Lead Detail Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        onClose={() => setSelectedLeadId(null)}
        onEdit={openEditModal}
        onRequestStageChange={(l, st) => void handleRequestStageChange(l, st)}
      />

      {/* Lost Reason Modal */}
      {lostPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleConfirmLost}
            className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#1F2937]">
                Mark &ldquo;{lostPrompt.lead.clientName}&rdquo; as Lost
              </h3>
              <button
                type="button"
                onClick={() => setLostPrompt(null)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                Lost Reason *
              </label>
              <textarea
                rows={3}
                value={lostPrompt.reason}
                onChange={(e) => setLostPrompt({ ...lostPrompt, reason: e.target.value })}
                placeholder="e.g., Budget constraints, chose competitor, project postponed..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setLostPrompt(null)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#1F2937] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingLost}
                className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#DC2626] text-sm font-medium text-white hover:bg-[#B91C1C] cursor-pointer disabled:opacity-60"
              >
                {savingLost && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Save Lost Reason</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const LeadSourceRevenuePanel: React.FC<{ leads: Lead[] }> = ({ leads }) => {
  const { clients, projectPayments, otherIncome } = useBusinessDataContext();

  const rows = useMemo(
    () =>
      computeLeadSourceRevenue({
        leads,
        clients,
        projectPayments,
        otherIncome,
      }),
    [leads, clients, projectPayments, otherIncome]
  );

  if (rows.length === 0) {
    return (
      <p className="text-xs text-[#64748B] leading-relaxed">
        No converted lead payments recorded yet. Convert Won leads into clients and log project payments to see attribution here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[#E2E8F0] text-xs">
      {rows.map((r) => (
        <li key={r.source} className="py-2.5 flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-[#1F2937]">{r.source}</p>
            <p className="text-[#64748B] tabular-nums">
              {r.convertedClients} converted {r.convertedClients === 1 ? 'client' : 'clients'}
            </p>
          </div>
          <span className="text-sm font-bold text-[#16A34A] tabular-nums">
            {formatINR(r.totalRevenuePaise)}
          </span>
        </li>
      ))}
    </ul>
  );
};
