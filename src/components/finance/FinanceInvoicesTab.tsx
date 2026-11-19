import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Download,
  FileText,
  IndianRupee,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { FINANCE_PAYMENT_METHODS, PROJECT_PAYMENT_TYPES } from '../../lib/constants';
import { downloadCsvFile } from '../../lib/csvUtils';
import { isDuplicateInvoiceNumber } from '../../lib/financeUtils';
import { getTodayDateString } from '../../lib/goalUtils';
import { formatINR, paiseToRupees } from '../../lib/moneyUtils';
import {
  InvoiceFormValues,
  invoiceSchema,
  ProjectPaymentFormValues,
  projectPaymentSchema,
} from '../../lib/validators';
import {
  createInvoiceWithCalendarSync,
  deleteInvoiceWithCalendarSync,
  updateInvoiceWithCalendarSync,
} from '../../services/companyFinanceService';
import { createProjectPayment } from '../../services/projectsService';
import { Client, DerivedInvoiceStatus, Invoice, Project } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { useInvoices } from '../../hooks/useInvoices';
import { useToast } from '../../hooks/useToast';
import { CalcInfoPopover } from './CalcInfoPopover';

const STATUS_COLOR: Record<DerivedInvoiceStatus, string> = {
  Paid: 'text-[#16A34A]',
  'Partially Paid': 'text-[#2563EB]',
  Unpaid: 'text-[#64748B]',
  Overdue: 'text-[#DC2626]',
};

export const FinanceInvoicesTab: React.FC = () => {
  const { firebaseUser } = useAuth();
  const { invoices, derivedInvoices, nextInvoiceNumber, clients, projects } = useInvoices();
  const { showToast } = useToast();
  const todayStr = getTodayDateString();

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const [statusFilter, setStatusFilter] = useState<'all' | DerivedInvoiceStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Quick payment modal directly linked to invoiceNumber & project
  const [payInvoice, setPayInvoice] = useState<{ invoice: Invoice; balancePaise: number } | null>(null);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoiceNumber: nextInvoiceNumber,
      clientId: '',
      projectId: '',
      amountRupees: 0,
      issueDate: todayStr,
      dueDate: todayStr,
      notes: '',
    },
  });

  const payForm = useForm<ProjectPaymentFormValues>({
    resolver: zodResolver(projectPaymentSchema),
    defaultValues: {
      projectId: '',
      amountRupees: 0,
      date: todayStr,
      method: 'UPI',
      paymentType: 'Final',
      invoiceNumber: '',
      notes: '',
    },
  });

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return derivedInvoices.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (!q) return true;
      const cName = clientMap.get(d.invoice.clientId)?.clientName ?? '';
      const pName = projectMap.get(d.invoice.projectId)?.title ?? '';
      return (
        d.invoice.invoiceNumber.toLowerCase().includes(q) ||
        cName.toLowerCase().includes(q) ||
        pName.toLowerCase().includes(q)
      );
    });
  }, [derivedInvoices, statusFilter, searchTerm, clientMap, projectMap]);

  const openCreateModal = () => {
    setEditingInvoice(null);
    form.reset({
      invoiceNumber: nextInvoiceNumber,
      clientId: clients[0]?.id ?? '',
      projectId: '',
      amountRupees: 0,
      issueDate: todayStr,
      dueDate: todayStr,
      notes: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (inv: Invoice) => {
    setEditingInvoice(inv);
    form.reset({
      invoiceNumber: inv.invoiceNumber,
      clientId: inv.clientId,
      projectId: inv.projectId || '',
      amountRupees: paiseToRupees(inv.amountPaise),
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      notes: inv.notes || '',
    });
    setModalOpen(true);
  };

  const openQuickPay = (inv: Invoice, balancePaise: number) => {
    const fallbackProject =
      projects.find((p) => p.id === inv.projectId) ??
      projects.find((p) => p.clientId === inv.clientId);
    if (!fallbackProject) {
      showToast('Link a project to record payment', {
        description: 'Project payments require a project for Single Source of Truth.',
        variant: 'warning',
      });
      return;
    }
    setPayInvoice({ invoice: inv, balancePaise });
    payForm.reset({
      projectId: fallbackProject.id,
      amountRupees: paiseToRupees(balancePaise > 0 ? balancePaise : inv.amountPaise),
      date: todayStr,
      method: 'UPI',
      paymentType: 'Final',
      invoiceNumber: inv.invoiceNumber,
      notes: `Payment for ${inv.invoiceNumber}`,
    });
  };

  const onSubmitInvoice = async (values: InvoiceFormValues) => {
    if (!firebaseUser) return;
    if (isDuplicateInvoiceNumber(invoices, values.invoiceNumber, editingInvoice?.id)) {
      form.setError('invoiceNumber', {
        message: `Invoice number "${values.invoiceNumber}" already exists.`,
      });
      return;
    }
    const clientName = clientMap.get(values.clientId)?.clientName || 'Client';
    try {
      if (editingInvoice) {
        await updateInvoiceWithCalendarSync({
          uid: firebaseUser.uid,
          existing: editingInvoice,
          clientName,
          values,
        });
        showToast('Invoice updated & calendar due date synced', { variant: 'success' });
      } else {
        await createInvoiceWithCalendarSync({
          uid: firebaseUser.uid,
          clientName,
          values,
        });
        showToast('Invoice created & due date added to Calendar', { variant: 'success' });
      }
      setModalOpen(false);
    } catch (err) {
      showToast('Failed to save invoice', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const onSubmitQuickPay = async (values: ProjectPaymentFormValues) => {
    if (!firebaseUser) return;
    const project = projectMap.get(values.projectId);
    if (!project) return;
    try {
      await createProjectPayment(firebaseUser.uid, project, values);
      showToast(`Payment recorded against ${values.invoiceNumber}`, { variant: 'success' });
      setPayInvoice(null);
    } catch (err) {
      showToast('Failed to record payment', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteInvoiceWithCalendarSync(deleteTarget.id);
      showToast('Invoice & linked calendar event removed', { variant: 'info' });
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

  const handleExportCsv = () => {
    downloadCsvFile(
      'goalx-invoices.csv',
      ['Invoice #', 'Client', 'Project', 'Issue Date', 'Due Date', 'Amount (INR)', 'Paid (INR)', 'Balance (INR)', 'Derived Status'],
      filtered.map((d) => [
        d.invoice.invoiceNumber,
        clientMap.get(d.invoice.clientId)?.clientName ?? '',
        projectMap.get(d.invoice.projectId)?.title ?? '',
        d.invoice.issueDate,
        d.invoice.dueDate,
        paiseToRupees(d.invoice.amountPaise).toFixed(2),
        paiseToRupees(d.paidPaise).toFixed(2),
        paiseToRupees(d.balancePaise).toFixed(2),
        d.status === 'Overdue' ? `Overdue (${d.daysOverdue}d)` : d.status,
      ])
    );
  };

  const watchedClientId = form.watch('clientId');
  const clientProjects = useMemo(
    () => projects.filter((p) => !watchedClientId || p.clientId === watchedClientId),
    [projects, watchedClientId]
  );

  return (
    <div className="space-y-5">
      {/* Header Strip */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div>
            <p className="text-sm font-semibold text-[#1F2937]">Client Invoices</p>
            <p className="text-xs text-[#64748B]">
              Invoice status is derived dynamically from <code className="text-[11px]">projectPayments</code> (never stored).
            </p>
          </div>
          <CalcInfoPopover
            title="Derived Invoice Status"
            formula="Paid if matched payments >= invoice amount; Overdue if unpaid/partial past dueDate; Partially Paid if > ₹0 received; otherwise Unpaid."
            note="Matches payments by invoiceNumber first, then allocates untagged project payments chronologically."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            onClick={openCreateModal}
            disabled={clients.length === 0}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Invoice</span>
          </button>
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
            placeholder="Search invoice #, client, or project..."
            className="w-full min-h-[42px] pl-10 pr-3 rounded-xl border border-[#E2E8F0] bg-white text-sm"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
          {(['all', 'Unpaid', 'Partially Paid', 'Overdue', 'Paid'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === st ? 'bg-white text-[#1F2937] shadow-xs' : 'text-[#64748B]'
              }`}
            >
              {st === 'all' ? 'All' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices List */}
      {filtered.length > 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs text-[#64748B]">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Client / Project</th>
                  <th className="py-3 px-4">Dates</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-right">Paid / Balance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filtered.map((d) => {
                  const client: Client | undefined = clientMap.get(d.invoice.clientId);
                  const project: Project | undefined = projectMap.get(d.invoice.projectId);
                  return (
                    <tr key={d.invoice.id}>
                      <td className="py-3 px-4 font-semibold text-[#1F2937] tabular-nums">
                        {d.invoice.invoiceNumber}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-[#1F2937]">{client?.clientName || 'Client'}</p>
                        {project && <p className="text-xs text-[#64748B]">{project.title}</p>}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#64748B] tabular-nums">
                        <p>Issued: {d.invoice.issueDate}</p>
                        <p>Due: {d.invoice.dueDate}</p>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold tabular-nums">
                        {formatINR(d.invoice.amountPaise)}
                      </td>
                      <td className="py-3 px-4 text-right text-xs tabular-nums">
                        <p className="text-[#16A34A] font-medium">Paid: {formatINR(d.paidPaise)}</p>
                        <p className="text-[#64748B]">Bal: {formatINR(d.balancePaise)}</p>
                      </td>
                      <td className={`py-3 px-4 text-xs font-semibold ${STATUS_COLOR[d.status]}`}>
                        {d.status === 'Overdue' ? `Overdue (${d.daysOverdue}d)` : d.status}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          {d.status !== 'Paid' && (
                            <button
                              type="button"
                              onClick={() => openQuickPay(d.invoice, d.balancePaise)}
                              title="Record Payment"
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 text-[#16A34A] text-xs font-medium hover:bg-emerald-100 cursor-pointer"
                            >
                              Pay
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(d.invoice)}
                            aria-label="Edit invoice"
                            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(d.invoice)}
                            aria-label="Delete invoice"
                            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-[#E2E8F0]">
            {filtered.map((d) => {
              const client = clientMap.get(d.invoice.clientId);
              return (
                <div key={d.invoice.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#1F2937] tabular-nums">
                        {d.invoice.invoiceNumber}
                      </p>
                      <p className="text-xs text-[#64748B]">
                        {client?.clientName || 'Client'} · Due {d.invoice.dueDate}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold ${STATUS_COLOR[d.status]}`}>
                      {d.status === 'Overdue' ? `Overdue (${d.daysOverdue}d)` : d.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="tabular-nums font-semibold text-[#1F2937]">
                      {formatINR(d.invoice.amountPaise)} · Bal {formatINR(d.balancePaise)}
                    </span>
                    <div className="flex items-center gap-3">
                      {d.status !== 'Paid' && (
                        <button
                          type="button"
                          onClick={() => openQuickPay(d.invoice, d.balancePaise)}
                          className="font-semibold text-[#16A34A] cursor-pointer"
                        >
                          Pay
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditModal(d.invoice)}
                        className="font-medium text-[#1F2937] cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(d.invoice)}
                        className="font-medium text-[#DC2626] cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            title="No invoices found"
            description="Create client billing invoices with unique INV numbers and automatic Calendar due date reminders."
            icon={<FileText className="w-5 h-5" />}
            actionLabel={clients.length > 0 ? 'New Invoice' : undefined}
            onAction={clients.length > 0 ? openCreateModal : undefined}
          />
        </div>
      )}

      {/* Invoice Form Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1F2937]">
                {editingInvoice ? 'Edit Invoice' : 'Create Invoice'}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={form.handleSubmit(onSubmitInvoice)} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Invoice Number *</label>
                  <input
                    type="text"
                    {...form.register('invoiceNumber')}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm tabular-nums"
                  />
                  {form.formState.errors.invoiceNumber && (
                    <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.invoiceNumber.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    {...form.register('amountRupees', { valueAsNumber: true })}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm tabular-nums"
                  />
                  {form.formState.errors.amountRupees && (
                    <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.amountRupees.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Client *</label>
                  <select {...form.register('clientId')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.clientName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Project (Optional)</label>
                  <select {...form.register('projectId')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    <option value="">Not linked to project</option>
                    {clientProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Issue Date *</label>
                  <input type="date" {...form.register('issueDate')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Due Date *</label>
                  <input type="date" {...form.register('dueDate')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm" />
                  {form.formState.errors.dueDate && (
                    <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.dueDate.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Notes / Terms</label>
                <textarea rows={2} {...form.register('notes')} className="w-full p-3 rounded-xl border border-[#E2E8F0] text-sm" />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2.5">
                <button type="button" onClick={() => setModalOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#1F2937] cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={form.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-xl bg-[#DC2626] text-sm font-medium text-white cursor-pointer">
                  {form.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingInvoice ? 'Save Invoice' : 'Create Invoice'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Record Payment Against Invoice */}
      {payInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-[#16A34A]" />
                <h2 className="text-base font-semibold text-[#1F2937]">
                  Record Payment · {payInvoice.invoice.invoiceNumber}
                </h2>
              </div>
              <button type="button" onClick={() => setPayInvoice(null)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={payForm.handleSubmit(onSubmitQuickPay)} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Project *</label>
                <select {...payForm.register('projectId')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Amount (₹)</label>
                  <input type="number" min={1} step="0.01" {...payForm.register('amountRupees', { valueAsNumber: true })} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm tabular-nums" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Date</label>
                  <input type="date" {...payForm.register('date')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Method</label>
                  <select {...payForm.register('method')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    {FINANCE_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Type</label>
                  <select {...payForm.register('paymentType')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    {PROJECT_PAYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2">
                <button type="button" onClick={() => setPayInvoice(null)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={payForm.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-xl bg-[#16A34A] text-sm font-medium text-white cursor-pointer">
                  {payForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Save Payment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete invoice ${deleteTarget?.invoiceNumber}?`}
        description="This removes the invoice and its linked Payment Due event from your Calendar. Recorded projectPayments remain untouched."
        variant="danger"
        confirmLabel="Delete Invoice"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
