import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Download,
  History,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import {
  FINANCE_PAYMENT_METHODS,
  PROJECT_PAYMENT_TYPES,
} from '../../lib/constants';
import { downloadCsvFile } from '../../lib/csvUtils';
import { findPotentialDuplicateIncome } from '../../lib/financeUtils';
import { getTodayDateString } from '../../lib/goalUtils';
import { formatINR, paiseToRupees, rupeesToPaise } from '../../lib/moneyUtils';
import {
  OtherIncomeFormValues,
  otherIncomeSchema,
  ProjectPaymentFormValues,
  projectPaymentSchema,
} from '../../lib/validators';
import {
  createOtherIncome,
  restoreOtherIncomeWithAudit,
  softDeleteOtherIncomeWithAudit,
  updateOtherIncomeWithAudit,
} from '../../services/companyFinanceService';
import {
  createProjectPayment,
  restoreProjectPaymentWithAudit,
  softDeleteProjectPaymentWithAudit,
  updateProjectPaymentWithAudit,
} from '../../services/projectsService';
import {
  Client,
  FinanceAuditLog,
  OtherIncome,
  Project,
  ProjectPayment,
} from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { UnifiedIncomeEntry } from '../../hooks/useFinance';

interface FinanceIncomeTabProps {
  unifiedIncome: UnifiedIncomeEntry[];
  projects: Project[];
  projectPayments: ProjectPayment[];
  otherIncome: OtherIncome[];
  clients: Client[];
  auditLogs: FinanceAuditLog[];
  startDate: string;
  endDate: string;
}

const PAGE_SIZE = 12;

export const FinanceIncomeTab: React.FC<FinanceIncomeTabProps> = ({
  unifiedIncome,
  projects,
  projectPayments,
  otherIncome,
  clients,
  auditLogs,
  startDate,
  endDate,
}) => {
  const { firebaseUser, userProfile } = useAuth();
  const { showToast } = useToast();
  const todayStr = getTodayDateString();
  const actorName = userProfile?.name || firebaseUser?.displayName || 'CEO';

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const projectPaymentMap = useMemo(() => new Map(projectPayments.map((p) => [p.id, p])), [projectPayments]);
  const otherIncomeMap = useMemo(() => new Map(otherIncome.map((o) => [o.id, o])), [otherIncome]);

  const [sourceFilter, setSourceFilter] = useState<'all' | 'Project Payment' | 'Other Income'>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc'>('date_desc');
  const [showDeleted, setShowDeleted] = useState(false);
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);
  const [page, setPage] = useState(1);

  // Modals
  const [projPayModalOpen, setProjPayModalOpen] = useState(false);
  const [editingProjPay, setEditingProjPay] = useState<ProjectPayment | null>(null);

  const [otherModalOpen, setOtherModalOpen] = useState(false);
  const [editingOther, setEditingOther] = useState<OtherIncome | null>(null);

  const [dupConfirmed, setDupConfirmed] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedIncomeEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const projPayForm = useForm<ProjectPaymentFormValues>({
    resolver: zodResolver(projectPaymentSchema),
    defaultValues: {
      projectId: '',
      amountRupees: 0,
      date: todayStr,
      method: 'UPI',
      paymentType: 'Partial',
      invoiceNumber: '',
      notes: '',
    },
  });

  const otherForm = useForm<OtherIncomeFormValues>({
    resolver: zodResolver(otherIncomeSchema),
    defaultValues: {
      source: '',
      clientId: '',
      amountRupees: 0,
      date: todayStr,
      method: 'Bank Transfer',
      notes: '',
    },
  });

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = unifiedIncome.filter((row) => {
      if (showDeleted ? !row.isDeleted : row.isDeleted) return false;
      if (!showDeleted && (row.date < startDate || row.date > endDate)) return false;
      if (sourceFilter !== 'all' && row.sourceType !== sourceFilter) return false;
      if (methodFilter !== 'all' && row.method !== methodFilter) return false;
      if (!q) return true;
      const clientName = clientMap.get(row.clientId)?.clientName ?? '';
      return (
        row.title.toLowerCase().includes(q) ||
        clientName.toLowerCase().includes(q) ||
        row.invoiceNumber.toLowerCase().includes(q) ||
        row.notes.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      if (sortBy === 'date_asc') return a.date.localeCompare(b.date);
      if (sortBy === 'amount_desc') return b.amountPaise - a.amountPaise;
      return b.date.localeCompare(a.date);
    });
    return list;
  }, [unifiedIncome, showDeleted, startDate, endDate, sourceFilter, methodFilter, searchTerm, sortBy, clientMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filteredTotalPaise = useMemo(
    () => filtered.reduce((sum, r) => sum + r.amountPaise, 0),
    [filtered]
  );

  const incomeAuditLogs = useMemo(
    () =>
      auditLogs.filter(
        (log) => log.entityType === 'projectPayment' || log.entityType === 'otherIncome'
      ),
    [auditLogs]
  );

  const openAddProjPayment = () => {
    setEditingProjPay(null);
    setDupConfirmed(false);
    projPayForm.reset({
      projectId: projects[0]?.id ?? '',
      amountRupees: 0,
      date: todayStr,
      method: 'UPI',
      paymentType: 'Partial',
      invoiceNumber: '',
      notes: '',
    });
    setProjPayModalOpen(true);
  };

  const openEditEntry = (entry: UnifiedIncomeEntry) => {
    setDupConfirmed(false);
    if (entry.sourceType === 'Project Payment') {
      const rec = projectPaymentMap.get(entry.id);
      if (!rec) return;
      setEditingProjPay(rec);
      projPayForm.reset({
        projectId: rec.projectId,
        amountRupees: paiseToRupees(rec.amountPaise),
        date: rec.date,
        method: rec.method,
        paymentType: rec.paymentType,
        invoiceNumber: rec.invoiceNumber || '',
        notes: rec.notes || '',
      });
      setProjPayModalOpen(true);
    } else {
      const rec = otherIncomeMap.get(entry.id);
      if (!rec) return;
      setEditingOther(rec);
      otherForm.reset({
        source: rec.source,
        clientId: rec.clientId || '',
        amountRupees: paiseToRupees(rec.amountPaise),
        date: rec.date,
        method: rec.method,
        notes: rec.notes || '',
      });
      setOtherModalOpen(true);
    }
  };

  const openAddOtherIncome = () => {
    setEditingOther(null);
    setDupConfirmed(false);
    otherForm.reset({
      source: '',
      clientId: '',
      amountRupees: 0,
      date: todayStr,
      method: 'Bank Transfer',
      notes: '',
    });
    setOtherModalOpen(true);
  };

  const watchedProjId = projPayForm.watch('projectId');
  const watchedProjAmt = projPayForm.watch('amountRupees');
  const watchedProjDate = projPayForm.watch('date');
  const projDupCount = findPotentialDuplicateIncome({
    date: watchedProjDate,
    amountPaise: rupeesToPaise(watchedProjAmt || 0),
    projectPayments,
    otherIncome,
    projectId: watchedProjId,
    excludeId: editingProjPay?.id,
  });

  const watchedOtherAmt = otherForm.watch('amountRupees');
  const watchedOtherDate = otherForm.watch('date');
  const otherDupCount = findPotentialDuplicateIncome({
    date: watchedOtherDate,
    amountPaise: rupeesToPaise(watchedOtherAmt || 0),
    projectPayments,
    otherIncome,
    excludeId: editingOther?.id,
  });

  const onSaveProjPayment = async (values: ProjectPaymentFormValues) => {
    if (!firebaseUser) return;
    const project = projects.find((p) => p.id === values.projectId);
    if (!project) {
      showToast('Select a valid project', { variant: 'error' });
      return;
    }
    if (!editingProjPay && projDupCount > 0 && !dupConfirmed) {
      setDupConfirmed(true);
      showToast('Potential duplicate payment', {
        description: 'Same project, date, and amount found. Submit again to confirm.',
        variant: 'warning',
      });
      return;
    }
    try {
      if (editingProjPay) {
        await updateProjectPaymentWithAudit({
          uid: firebaseUser.uid,
          actorName,
          existing: editingProjPay,
          project,
          values,
        });
        showToast('Project payment updated (audit logged)', { variant: 'success' });
      } else {
        await createProjectPayment(firebaseUser.uid, project, values);
        showToast('Project payment recorded in projectPayments', { variant: 'success' });
      }
      setProjPayModalOpen(false);
    } catch (err) {
      showToast('Failed to save payment', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const onSaveOtherIncome = async (values: OtherIncomeFormValues) => {
    if (!firebaseUser) return;
    if (!editingOther && otherDupCount > 0 && !dupConfirmed) {
      setDupConfirmed(true);
      showToast('Potential duplicate entry', {
        description: 'Same date and amount already exists. Submit again to confirm.',
        variant: 'warning',
      });
      return;
    }
    try {
      if (editingOther) {
        await updateOtherIncomeWithAudit({
          uid: firebaseUser.uid,
          actorName,
          existing: editingOther,
          values,
        });
        showToast('Income updated (audit logged)', { variant: 'success' });
      } else {
        await createOtherIncome(firebaseUser.uid, values);
        showToast('Other income recorded', { variant: 'success' });
      }
      setOtherModalOpen(false);
    } catch (err) {
      showToast('Failed to save income', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleSoftDelete = async () => {
    if (!firebaseUser || !deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.sourceType === 'Project Payment') {
        const rec = projectPaymentMap.get(deleteTarget.id);
        if (rec) {
          await softDeleteProjectPaymentWithAudit({
            uid: firebaseUser.uid,
            actorName,
            payment: rec,
          });
        }
      } else {
        const rec = otherIncomeMap.get(deleteTarget.id);
        if (rec) {
          await softDeleteOtherIncomeWithAudit({
            uid: firebaseUser.uid,
            actorName,
            income: rec,
          });
        }
      }
      showToast('Moved to trash (recoverable)', { variant: 'info' });
      setDeleteTarget(null);
    } catch (err) {
      showToast('Failed to delete entry', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = async (entry: UnifiedIncomeEntry) => {
    if (!firebaseUser) return;
    try {
      if (entry.sourceType === 'Project Payment') {
        const rec = projectPaymentMap.get(entry.id);
        if (rec) {
          await restoreProjectPaymentWithAudit({
            uid: firebaseUser.uid,
            actorName,
            payment: rec,
          });
        }
      } else {
        const rec = otherIncomeMap.get(entry.id);
        if (rec) {
          await restoreOtherIncomeWithAudit({
            uid: firebaseUser.uid,
            actorName,
            income: rec,
          });
        }
      }
      showToast('Income entry restored', { variant: 'success' });
    } catch (err) {
      showToast('Restore failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleExportCsv = () => {
    downloadCsvFile(
      `goalx-company-income-${startDate}-to-${endDate}.csv`,
      ['Date', 'Source Type', 'Title / Project', 'Client', 'Type', 'Method', 'Invoice #', 'Amount (INR)', 'Notes'],
      filtered.map((row) => [
        row.date,
        row.sourceType,
        row.title,
        clientMap.get(row.clientId)?.clientName ?? '',
        row.paymentType,
        row.method,
        row.invoiceNumber,
        paiseToRupees(row.amountPaise).toFixed(2),
        row.notes,
      ])
    );
  };

  return (
    <div className="space-y-5">
      {/* Action Bar */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <p className="text-xs text-[#64748B]">
            Combined Ledger (Single Source of Truth: <code className="text-[11px]">projectPayments + otherIncome</code>)
          </p>
          <p className="text-lg font-bold text-[#16A34A] tabular-nums">
            {formatINR(filteredTotalPaise)}{' '}
            <span className="text-xs font-normal text-[#64748B]">({filtered.length} entries)</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAuditDrawer(true)}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
          >
            <History className="w-4 h-4 text-[#64748B]" />
            <span>Audit Log ({incomeAuditLogs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowDeleted((p) => !p);
              setPage(1);
            }}
            className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer ${
              showDeleted
                ? 'bg-red-50 border-red-200 text-[#DC2626]'
                : 'border-[#E2E8F0] text-[#1F2937] hover:bg-slate-50'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>{showDeleted ? 'Viewing Trash' : 'Trash'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#64748B]" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={openAddOtherIncome}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F2937] hover:bg-slate-50 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#2563EB]" />
            <span>Other Income</span>
          </button>
          <button
            type="button"
            onClick={openAddProjPayment}
            disabled={projects.length === 0}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Project Payment</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Search project, client, invoice #..."
            className="w-full min-h-[42px] pl-10 pr-3 rounded-xl border border-[#E2E8F0] bg-white text-sm"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value as typeof sourceFilter);
            setPage(1);
          }}
          className="min-h-[42px] px-3 rounded-xl border border-[#E2E8F0] bg-white text-sm"
        >
          <option value="all">All Sources</option>
          <option value="Project Payment">Project Payments Only</option>
          <option value="Other Income">Other Income Only</option>
        </select>
        <select
          value={methodFilter}
          onChange={(e) => {
            setMethodFilter(e.target.value);
            setPage(1);
          }}
          className="min-h-[42px] px-3 rounded-xl border border-[#E2E8F0] bg-white text-sm"
        >
          <option value="all">All Methods</option>
          {FINANCE_PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="min-h-[42px] px-3 rounded-xl border border-[#E2E8F0] bg-white text-sm"
        >
          <option value="date_desc">Newest First</option>
          <option value="date_asc">Oldest First</option>
          <option value="amount_desc">Highest Amount</option>
        </select>
      </div>

      {/* Ledger Table / Mobile Cards */}
      {paginated.length > 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs text-[#64748B]">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Source / Title</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Invoice</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {paginated.map((entry) => {
                  const client = clientMap.get(entry.clientId);
                  return (
                    <tr key={`${entry.sourceType}-${entry.id}`}>
                      <td className="py-3 px-4 tabular-nums text-[#64748B]">{entry.date}</td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-[#1F2937]">{entry.title}</p>
                        <p className="text-xs text-[#64748B]">
                          {entry.sourceType} · {entry.paymentType}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-[#1F2937]">{client?.clientName || '—'}</td>
                      <td className="py-3 px-4 text-[#64748B]">{entry.method}</td>
                      <td className="py-3 px-4 text-[#64748B] tabular-nums">{entry.invoiceNumber || '—'}</td>
                      <td className="py-3 px-4 text-right font-semibold text-[#16A34A] tabular-nums">
                        {formatINR(entry.amountPaise)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {entry.isDeleted ? (
                          <button
                            type="button"
                            onClick={() => void handleRestore(entry)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restore</span>
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditEntry(entry)}
                              aria-label="Edit income"
                              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(entry)}
                              aria-label="Delete income"
                              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-[#E2E8F0]">
            {paginated.map((entry) => {
              const client = clientMap.get(entry.clientId);
              return (
                <div key={`${entry.sourceType}-${entry.id}`} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1F2937] truncate">{entry.title}</p>
                      <p className="text-xs text-[#64748B]">
                        {entry.date} · {entry.sourceType}
                        {client ? ` · ${client.clientName}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-[#16A34A] tabular-nums shrink-0">
                      {formatINR(entry.amountPaise)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#64748B]">
                    <span>
                      {entry.method}
                      {entry.invoiceNumber ? ` · ${entry.invoiceNumber}` : ''}
                    </span>
                    {entry.isDeleted ? (
                      <button
                        type="button"
                        onClick={() => void handleRestore(entry)}
                        className="font-medium text-[#2563EB] cursor-pointer"
                      >
                        Restore
                      </button>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openEditEntry(entry)}
                          className="font-medium text-[#1F2937] cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(entry)}
                          className="font-medium text-[#DC2626] cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] disabled:opacity-40 cursor-pointer"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            title={showDeleted ? 'Trash is empty' : 'No income entries in this range'}
            description={
              showDeleted
                ? 'Soft-deleted payments and other income appear here for recovery.'
                : 'Record a project payment or add non-project income to populate your company ledger.'
            }
          />
        </div>
      )}

      {/* Project Payment Modal */}
      {projPayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1F2937]">
                {editingProjPay ? 'Edit Project Payment' : 'Add Project Payment'}
              </h2>
              <button type="button" onClick={() => setProjPayModalOpen(false)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={projPayForm.handleSubmit(onSaveProjPayment)} className="flex-1 overflow-y-auto p-5 space-y-4">
              {!editingProjPay && projDupCount > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
                  <span>
                    Warning: {projDupCount} payment(s) already exist for this project, date, and amount. Submit again to confirm.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Project *</label>
                <select {...projPayForm.register('projectId')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({clientMap.get(p.clientId)?.clientName || 'Client'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    {...projPayForm.register('amountRupees', { valueAsNumber: true })}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm tabular-nums"
                  />
                  {projPayForm.formState.errors.amountRupees && (
                    <p className="mt-1 text-xs text-[#DC2626]">{projPayForm.formState.errors.amountRupees.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Date *</label>
                  <input type="date" {...projPayForm.register('date')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Method</label>
                  <select {...projPayForm.register('method')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    {FINANCE_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Payment Type</label>
                  <select {...projPayForm.register('paymentType')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
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
                  {...projPayForm.register('invoiceNumber')}
                  placeholder="e.g., INV-2026-0001"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Notes</label>
                <textarea rows={2} {...projPayForm.register('notes')} className="w-full p-3 rounded-xl border border-[#E2E8F0] text-sm" />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2.5">
                <button type="button" onClick={() => setProjPayModalOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#1F2937] cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={projPayForm.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-xl bg-[#16A34A] text-sm font-medium text-white cursor-pointer">
                  {projPayForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingProjPay ? 'Save Payment' : 'Record Payment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Other Income Modal */}
      {otherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1F2937]">
                {editingOther ? 'Edit Other Income' : 'Add Other Company Income'}
              </h2>
              <button type="button" onClick={() => setOtherModalOpen(false)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={otherForm.handleSubmit(onSaveOtherIncome)} className="flex-1 overflow-y-auto p-5 space-y-4">
              {!editingOther && otherDupCount > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
                  <span>
                    Warning: {otherDupCount} income entry matches this date and amount. Submit again to confirm.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Income Source *</label>
                <input
                  type="text"
                  {...otherForm.register('source')}
                  placeholder="e.g., SaaS Subscription, Consulting Retainer, Bank Interest"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm"
                />
                {otherForm.formState.errors.source && (
                  <p className="mt-1 text-xs text-[#DC2626]">{otherForm.formState.errors.source.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    {...otherForm.register('amountRupees', { valueAsNumber: true })}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm tabular-nums"
                  />
                  {otherForm.formState.errors.amountRupees && (
                    <p className="mt-1 text-xs text-[#DC2626]">{otherForm.formState.errors.amountRupees.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Date *</label>
                  <input type="date" {...otherForm.register('date')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Method</label>
                  <select {...otherForm.register('method')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    {FINANCE_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Client (Optional)</label>
                  <select {...otherForm.register('clientId')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    <option value="">Not linked to client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.clientName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Notes</label>
                <textarea rows={2} {...otherForm.register('notes')} className="w-full p-3 rounded-xl border border-[#E2E8F0] text-sm" />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2.5">
                <button type="button" onClick={() => setOtherModalOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#1F2937] cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={otherForm.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-xl bg-[#DC2626] text-sm font-medium text-white cursor-pointer">
                  {otherForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingOther ? 'Save Changes' : 'Add Income'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {showAuditDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-xl bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1F2937]">Income Audit Log</h2>
              <button type="button" onClick={() => setShowAuditDrawer(false)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {incomeAuditLogs.length === 0 ? (
                <p className="text-sm text-[#64748B]">No edits or deletions logged yet.</p>
              ) : (
                <ul className="divide-y divide-[#E2E8F0] text-xs">
                  {incomeAuditLogs.map((log) => (
                    <li key={log.id} className="py-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#1F2937] capitalize">
                          {log.entityType} · {log.action.replace('_', ' ')}
                        </span>
                        <span className="text-[#64748B] tabular-nums">{log.timestampIso.slice(0, 16).replace('T', ' ')}</span>
                      </div>
                      <p className="text-[#64748B]">By {log.actorName}</p>
                      <p className="text-[#1F2937]">Old: {log.oldValueSummary}</p>
                      <p className="text-[#16A34A]">New: {log.newValueSummary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Move income entry to Trash?"
        description={`This soft-deletes "${deleteTarget?.title}" (${deleteTarget ? formatINR(deleteTarget.amountPaise) : ''}), removes it from totals, and records an audit entry. You can restore it later from Trash.`}
        variant="danger"
        confirmLabel="Move to Trash"
        loading={deleting}
        onConfirm={handleSoftDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
