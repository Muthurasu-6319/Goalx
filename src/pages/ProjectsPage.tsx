import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  ArrowUpRight,
  FolderKanban,
  IndianRupee,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { AskAiCeoButton } from '../components/ai/AskAiCeoButton';
import { CalcInfoPopover } from '../components/finance/CalcInfoPopover';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useProjects } from '../hooks/useProjects';
import { useToast } from '../hooks/useToast';
import {
  FINANCE_PAYMENT_METHODS,
  PROJECT_PAYMENT_TYPES,
  PROJECT_STATUSES,
  ROUTES,
} from '../lib/constants';
import { findPotentialDuplicateIncome } from '../lib/financeUtils';
import { getTodayDateString } from '../lib/goalUtils';
import { formatINR, paiseToRupees, rupeesToPaise } from '../lib/moneyUtils';
import {
  ProjectFormValues,
  ProjectPaymentFormValues,
  projectPaymentSchema,
  projectSchema,
} from '../lib/validators';
import {
  createProject,
  createProjectPayment,
  deleteProject,
  updateProject,
  updateProjectStatus,
} from '../services/projectsService';
import { Project, ProjectStatus } from '../types';

const STATUS_CLASS: Record<ProjectStatus, string> = {
  Planning: 'text-[#64748B]',
  'In Progress': 'text-[#2563EB]',
  Completed: 'text-[#16A34A]',
  'On Hold': 'text-[#F59E0B]',
  Cancelled: 'text-[#DC2626]',
};

export const ProjectsPage: React.FC = () => {
  const { firebaseUser } = useAuth();
  const {
    projects,
    projectRows,
    projectPayments,
    clients,
    services,
    teamMembers,
    loading,
    error,
  } = useProjects();
  const { showToast } = useToast();

  const todayStr = getTodayDateString();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [paymentModalProject, setPaymentModalProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dupConfirmed, setDupConfirmed] = useState(false);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const memberMap = useMemo(() => new Map(teamMembers.map((m) => [m.id, m])), [teamMembers]);

  const projectForm = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      title: '',
      clientId: '',
      serviceId: '',
      serviceCategory: '',
      assignedMemberId: '',
      budgetRupees: 0,
      status: 'In Progress',
      startDate: todayStr,
      dueDate: '',
      description: '',
    },
  });

  const paymentForm = useForm<ProjectPaymentFormValues>({
    resolver: zodResolver(projectPaymentSchema),
    defaultValues: {
      projectId: '',
      amountRupees: 0,
      date: todayStr,
      method: 'UPI',
      paymentType: 'Advance',
      invoiceNumber: '',
      notes: '',
    },
  });

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return projectRows.filter(({ project }) => {
      if (statusFilter !== 'all' && project.status !== statusFilter) return false;
      if (!q) return true;
      const clientName = clientMap.get(project.clientId)?.clientName ?? '';
      return (
        project.title.toLowerCase().includes(q) ||
        project.serviceCategory.toLowerCase().includes(q) ||
        clientName.toLowerCase().includes(q)
      );
    });
  }, [projectRows, statusFilter, searchTerm, clientMap]);

  const totals = useMemo(() => {
    let budgetPaise = 0;
    let receivedPaise = 0;
    let outstandingPaise = 0;
    let taggedExpensesPaise = 0;
    for (const r of projectRows) {
      if (r.project.status !== 'Cancelled' && r.project.status !== 'Planning') {
        budgetPaise += r.project.budgetPaise;
      }
      receivedPaise += r.receivedPaise;
      outstandingPaise += r.outstandingPaise;
      taggedExpensesPaise += r.taggedExpensesPaise;
    }
    return { budgetPaise, receivedPaise, outstandingPaise, taggedExpensesPaise };
  }, [projectRows]);

  const openCreateModal = () => {
    setEditingProject(null);
    const firstClientId = clients[0]?.id ?? '';
    const firstSvc = services[0];
    projectForm.reset({
      title: '',
      clientId: firstClientId,
      serviceId: firstSvc?.id ?? '',
      serviceCategory: firstSvc?.name ?? '',
      assignedMemberId: '',
      budgetRupees: 0,
      status: 'In Progress',
      startDate: todayStr,
      dueDate: '',
      description: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    projectForm.reset({
      title: project.title,
      clientId: project.clientId,
      serviceId: project.serviceId || '',
      serviceCategory: project.serviceCategory || '',
      assignedMemberId: project.assignedMemberId || '',
      budgetRupees: paiseToRupees(project.budgetPaise),
      status: project.status,
      startDate: project.startDate,
      dueDate: project.dueDate || '',
      description: project.description || '',
    });
    setModalOpen(true);
  };

  const openPaymentModal = (project: Project) => {
    setDupConfirmed(false);
    setPaymentModalProject(project);
    paymentForm.reset({
      projectId: project.id,
      amountRupees: 0,
      date: todayStr,
      method: 'UPI',
      paymentType: 'Partial',
      invoiceNumber: '',
      notes: '',
    });
  };

  const onSubmitProject = async (values: ProjectFormValues) => {
    if (!firebaseUser) return;
    const svc = services.find((s) => s.id === values.serviceId);
    const payload: ProjectFormValues = {
      ...values,
      serviceCategory: svc?.name || values.serviceCategory || '',
    };
    try {
      if (editingProject) {
        await updateProject(editingProject.id, payload);
        showToast('Project updated', { variant: 'success' });
      } else {
        await createProject(firebaseUser.uid, payload);
        showToast('Project created', { variant: 'success' });
      }
      setModalOpen(false);
    } catch (err) {
      showToast('Failed to save project', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const watchedPayAmount = paymentForm.watch('amountRupees');
  const watchedPayDate = paymentForm.watch('date');
  const potentialDupCount = paymentModalProject
    ? findPotentialDuplicateIncome({
        date: watchedPayDate,
        amountPaise: rupeesToPaise(watchedPayAmount || 0),
        projectPayments,
        otherIncome: [],
        projectId: paymentModalProject.id,
      })
    : 0;

  const onSubmitPayment = async (values: ProjectPaymentFormValues) => {
    if (!firebaseUser || !paymentModalProject) return;
    if (potentialDupCount > 0 && !dupConfirmed) {
      setDupConfirmed(true);
      showToast('Potential duplicate payment detected', {
        description: 'Same date, project, and amount already exists. Click Record Payment again to confirm.',
        variant: 'warning',
      });
      return;
    }
    try {
      await createProjectPayment(firebaseUser.uid, paymentModalProject, values);
      showToast('Project payment recorded in ledger', { variant: 'success' });
      setPaymentModalProject(null);
    } catch (err) {
      showToast('Failed to record payment', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleStatusChange = async (project: Project, status: ProjectStatus) => {
    if (project.status === status) return;
    try {
      await updateProjectStatus(project.id, status);
      showToast(`${project.title} marked ${status}`, { variant: 'success' });
    } catch (err) {
      showToast('Status update failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const deletePaymentsCount = deleteTarget
    ? projectPayments.filter((p) => !p.isDeleted && p.projectId === deleteTarget.id).length
    : 0;

  const handleDeleteProject = async () => {
    if (!deleteTarget || deletePaymentsCount > 0) return;
    setDeleting(true);
    try {
      await deleteProject(deleteTarget.id);
      showToast('Project deleted', { variant: 'info' });
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

  if (loading) return <DashboardSkeleton />;
  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-[#DC2626]">
        Unable to load projects: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Projects</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Delivery tracking, budgets, collections, and project-level profitability.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <AskAiCeoButton
            area="projects"
            prompt="Review our active projects, delivery timelines, and pending collections"
          />
          <Link
            to={ROUTES.COMPANY_FINANCE}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium text-[#1F2937] hover:bg-slate-50"
          >
            <IndianRupee className="w-4 h-4 text-[#16A34A]" />
            <span>Finance Ledger</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#64748B]" />
          </Link>
          <button
            type="button"
            onClick={openCreateModal}
            disabled={clients.length === 0}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {clients.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-[#1F2937]">
            Add a client first before creating a project so revenue and invoices stay linked.
          </p>
          <Link
            to={ROUTES.COMPANY_CLIENTS}
            className="min-h-[40px] inline-flex items-center justify-center rounded-xl bg-white border border-amber-300 px-4 text-xs font-semibold text-[#1F2937]"
          >
            Go to Clients
          </Link>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Confirmed Budgets</span>
            <CalcInfoPopover
              title="Confirmed Budgets"
              formula="Sum of budgets for projects whose status is not Cancelled or Planning."
            />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#1F2937] tabular-nums">
            {formatINR(totals.budgetPaise)}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">{projects.length} total projects</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Total Collected</span>
            <CalcInfoPopover
              title="Project Collections"
              formula="Sum of non-deleted payments in projectPayments across all projects."
            />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#16A34A] tabular-nums">
            {formatINR(totals.receivedPaise)}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">Single source: projectPayments</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Outstanding</span>
            <CalcInfoPopover
              title="Outstanding"
              formula="Confirmed project budget minus received payments per project, clamped at ₹0 in totals."
            />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#F59E0B] tabular-nums">
            {formatINR(totals.outstandingPaise)}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">Confirmed projects only</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Tagged Expenses</span>
            <CalcInfoPopover
              title="Project Tagged Expenses"
              formula="Sum of non-deleted businessExpenses explicitly tagged to a projectId."
              note="Based on tagged expenses only."
            />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#1F2937] tabular-nums">
            {formatINR(totals.taggedExpensesPaise)}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">Based on tagged expenses only</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search projects, clients, or services..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#1F2937]"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
          {(['all', ...PROJECT_STATUSES] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === st ? 'bg-white text-[#1F2937] shadow-xs' : 'text-[#64748B]'
              }`}
            >
              {st === 'all' ? 'All' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Project Cards */}
      {filteredRows.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredRows.map((row) => {
            const { project, receivedPaise, outstandingPaise, overpaidPaise, isOverpaid, taggedExpensesPaise, estimatedProfitPaise } = row;
            const client = clientMap.get(project.clientId);
            const member = memberMap.get(project.assignedMemberId);
            const pct =
              project.budgetPaise > 0
                ? Math.min(100, Math.round((receivedPaise / project.budgetPaise) * 100))
                : 0;

            return (
              <article
                key={project.id}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-[#1F2937] truncate">{project.title}</h2>
                    <p className="mt-0.5 text-xs text-[#64748B] truncate">
                      {client?.clientName || 'Unknown Client'}
                      {project.serviceCategory ? ` · ${project.serviceCategory}` : ''}
                      {member ? ` · Lead: ${member.name}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums">
                      <span className={`font-medium ${STATUS_CLASS[project.status]}`}>{project.status}</span>
                      <span className="text-[#64748B]"> · Start {project.startDate}</span>
                      {project.dueDate && <span className="text-[#64748B]"> · Due {project.dueDate}</span>}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(project)}
                      aria-label={`Edit ${project.title}`}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(project)}
                      aria-label={`Delete ${project.title}`}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[#64748B]">Collection Progress</span>
                    <span className="font-semibold text-[#1F2937] tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isOverpaid ? 'bg-[#F59E0B]' : 'bg-[#16A34A]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {isOverpaid && (
                  <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
                    <span>Overpaid by {formatINR(overpaidPaise)} above project budget.</span>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-[#E2E8F0] text-xs">
                  <div>
                    <span className="text-[#64748B] block">Budget</span>
                    <span className="font-semibold text-[#1F2937] tabular-nums">
                      {formatINR(project.budgetPaise)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Received</span>
                    <span className="font-semibold text-[#16A34A] tabular-nums">
                      {formatINR(receivedPaise)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Outstanding</span>
                    <span className="font-semibold text-[#F59E0B] tabular-nums">
                      {formatINR(outstandingPaise)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Tagged Exp.</span>
                    <span className="font-semibold text-[#1F2937] tabular-nums">
                      {formatINR(taggedExpensesPaise)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Est. Profit</span>
                    <span
                      className={`font-semibold tabular-nums ${
                        estimatedProfitPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                      }`}
                    >
                      {formatINR(estimatedProfitPaise)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2E8F0]">
                  <span className="text-[11px] text-[#64748B]">Based on tagged expenses only</span>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Status for ${project.title}`}
                      value={project.status}
                      onChange={(e) => void handleStatusChange(project, e.target.value as ProjectStatus)}
                      className="min-h-[38px] px-2.5 py-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#1F2937]"
                    >
                      {PROJECT_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => openPaymentModal(project)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Payment</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            title="No projects yet"
            description="Create a client project to track budgets, payments, and project-level profitability."
            icon={<FolderKanban className="w-5 h-5" />}
            actionLabel={clients.length > 0 ? 'New Project' : undefined}
            onAction={clients.length > 0 ? openCreateModal : undefined}
          />
        </div>
      )}

      {/* Create / Edit Project Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1F2937]">
                {editingProject ? 'Edit Project' : 'New Project'}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={projectForm.handleSubmit(onSubmitProject)} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Project Title *</label>
                <input
                  type="text"
                  {...projectForm.register('title')}
                  placeholder="e.g., Factory SCADA Dashboard"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm"
                />
                {projectForm.formState.errors.title && (
                  <p className="mt-1 text-xs text-[#DC2626]">{projectForm.formState.errors.title.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Client *</label>
                  <select {...projectForm.register('clientId')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.clientName}{c.company ? ` (${c.company})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Service</label>
                  <select {...projectForm.register('serviceId')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    <option value="">General / Unassigned</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Budget (₹) *</label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    {...projectForm.register('budgetRupees', { valueAsNumber: true })}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm tabular-nums"
                  />
                  {projectForm.formState.errors.budgetRupees && (
                    <p className="mt-1 text-xs text-[#DC2626]">{projectForm.formState.errors.budgetRupees.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Status</label>
                  <select {...projectForm.register('status')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    {PROJECT_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Assigned Member</label>
                  <select {...projectForm.register('assignedMemberId')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    <option value="">Unassigned</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Start Date *</label>
                  <input type="date" {...projectForm.register('startDate')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Due Date</label>
                  <input type="date" {...projectForm.register('dueDate')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm" />
                  {projectForm.formState.errors.dueDate && (
                    <p className="mt-1 text-xs text-[#DC2626]">{projectForm.formState.errors.dueDate.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Scope Notes</label>
                <textarea rows={2} {...projectForm.register('description')} className="w-full p-3 rounded-xl border border-[#E2E8F0] text-sm" />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2.5">
                <button type="button" onClick={() => setModalOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#1F2937] cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={projectForm.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-xl bg-[#DC2626] text-sm font-medium text-white cursor-pointer">
                  {projectForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingProject ? 'Save Project' : 'Create Project'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Payment Modal (writes directly to projectPayments) */}
      {paymentModalProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1F2937]">
                Record Payment · {paymentModalProject.title}
              </h2>
              <button type="button" onClick={() => setPaymentModalProject(null)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={paymentForm.handleSubmit(onSubmitPayment)} className="flex-1 overflow-y-auto p-5 space-y-4">
              {potentialDupCount > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
                  <span>
                    Warning: {potentialDupCount} existing payment(s) match this project, date, and amount. Submit again if intentional.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    {...paymentForm.register('amountRupees', { valueAsNumber: true })}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm tabular-nums"
                  />
                  {paymentForm.formState.errors.amountRupees && (
                    <p className="mt-1 text-xs text-[#DC2626]">{paymentForm.formState.errors.amountRupees.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Date *</label>
                  <input type="date" {...paymentForm.register('date')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Method</label>
                  <select {...paymentForm.register('method')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    {FINANCE_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Payment Type</label>
                  <select {...paymentForm.register('paymentType')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    {PROJECT_PAYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Invoice Number (Optional)</label>
                <input
                  type="text"
                  {...paymentForm.register('invoiceNumber')}
                  placeholder="e.g., INV-2026-0001"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Notes</label>
                <textarea rows={2} {...paymentForm.register('notes')} className="w-full p-3 rounded-xl border border-[#E2E8F0] text-sm" />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2.5">
                <button type="button" onClick={() => setPaymentModalProject(null)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#1F2937] cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={paymentForm.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-xl bg-[#16A34A] text-sm font-medium text-white cursor-pointer">
                  {paymentForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Record Payment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={
          deletePaymentsCount > 0
            ? `Cannot delete "${deleteTarget?.title}"`
            : `Delete "${deleteTarget?.title}"?`
        }
        description={
          deletePaymentsCount > 0
            ? `This project has ${deletePaymentsCount} active payment record(s). Soft-delete those payments in Finance first or mark the project Cancelled.`
            : 'This permanently deletes the project record.'
        }
        variant={deletePaymentsCount > 0 ? 'warning' : 'danger'}
        confirmLabel="Delete Project"
        cancelLabel={deletePaymentsCount > 0 ? 'Close' : 'Cancel'}
        confirmDisabled={deletePaymentsCount > 0}
        loading={deleting}
        onConfirm={handleDeleteProject}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
