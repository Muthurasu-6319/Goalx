import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  History,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { FINANCE_PAYMENT_METHODS } from '../../lib/constants';
import { downloadCsvFile } from '../../lib/csvUtils';
import { findPotentialDuplicateExpense } from '../../lib/financeUtils';
import { getTodayDateString } from '../../lib/goalUtils';
import { formatINR, paiseToRupees, rupeesToPaise } from '../../lib/moneyUtils';
import { sanitizeHttpUrl } from '../../lib/urlUtils';
import {
  BusinessExpenseFormValues,
  businessExpenseSchema,
  RecurringExpenseTemplateFormValues,
  recurringExpenseTemplateSchema,
} from '../../lib/validators';
import {
  createBusinessExpense,
  createRecurringExpenseTemplate,
  deleteRecurringExpenseTemplate,
  generateDueRecurringExpenses,
  restoreBusinessExpenseWithAudit,
  softDeleteBusinessExpenseWithAudit,
  updateBusinessExpenseWithAudit,
  updateRecurringExpenseTemplate,
  validateReceiptFile,
} from '../../services/companyFinanceService';
import { updateUserSettings } from '../../services/settingsService';
import { BusinessExpense, RecurringExpenseTemplate } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { useExpenses } from '../../hooks/useExpenses';
import { useToast } from '../../hooks/useToast';

interface FinanceExpensesTabProps {
  startDate: string;
  endDate: string;
}

const PAGE_SIZE = 12;

export const FinanceExpensesTab: React.FC<FinanceExpensesTabProps> = ({ startDate, endDate }) => {
  const { firebaseUser, userProfile, userSettings } = useAuth();
  const {
    businessExpenses,
    recurringExpenseTemplates,
    categories,
    services,
    projects,
    financeAuditLogs,
  } = useExpenses();
  const { showToast } = useToast();

  const todayStr = getTodayDateString();
  const actorName = userProfile?.name || firebaseUser?.displayName || 'CEO';

  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s.name])), [services]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.title])), [projects]);

  const [subView, setSubView] = useState<'ledger' | 'recurring' | 'trash'>('ledger');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc'>('date_desc');
  const [page, setPage] = useState(1);

  const [expModalOpen, setExpModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<BusinessExpense | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [clearAttachment, setClearAttachment] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [dupConfirmed, setDupConfirmed] = useState(false);

  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecurringExpenseTemplate | null>(null);
  const [generatingRec, setGeneratingRec] = useState(false);

  const [showAuditDrawer, setShowAuditDrawer] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BusinessExpense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const expForm = useForm<BusinessExpenseFormValues>({
    resolver: zodResolver(businessExpenseSchema),
    defaultValues: {
      title: '',
      category: categories[0] || 'Miscellaneous',
      amountRupees: 0,
      date: todayStr,
      paymentMethod: 'UPI',
      paidBy: '',
      description: '',
      serviceId: '',
      projectId: '',
    },
  });

  const tplForm = useForm<RecurringExpenseTemplateFormValues>({
    resolver: zodResolver(recurringExpenseTemplateSchema),
    defaultValues: {
      title: '',
      category: categories[0] || 'Software & Subscriptions',
      amountRupees: 0,
      dayOfMonth: 1,
      paymentMethod: 'Card',
      paidBy: '',
      description: '',
      serviceId: '',
      projectId: '',
      active: true,
    },
  });

  const filteredExpenses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = businessExpenses.filter((e) => {
      if (subView === 'trash' ? !e.isDeleted : e.isDeleted) return false;
      if (subView === 'ledger' && (e.date < startDate || e.date > endDate)) return false;
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.paidBy.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      if (sortBy === 'date_asc') return a.date.localeCompare(b.date);
      if (sortBy === 'amount_desc') return b.amountPaise - a.amountPaise;
      return b.date.localeCompare(a.date);
    });
    return list;
  }, [businessExpenses, subView, startDate, endDate, categoryFilter, searchTerm, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / PAGE_SIZE));
  const paginated = filteredExpenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filteredTotalPaise = useMemo(
    () => filteredExpenses.reduce((s, e) => s + e.amountPaise, 0),
    [filteredExpenses]
  );

  const expenseAuditLogs = useMemo(
    () => financeAuditLogs.filter((l) => l.entityType === 'businessExpense'),
    [financeAuditLogs]
  );

  const openCreateExpense = () => {
    setEditingExpense(null);
    setReceiptFile(null);
    setClearAttachment(false);
    setDupConfirmed(false);
    expForm.reset({
      title: '',
      category: categories[0] || 'Miscellaneous',
      amountRupees: 0,
      date: todayStr,
      paymentMethod: 'UPI',
      paidBy: '',
      description: '',
      serviceId: '',
      projectId: '',
    });
    setExpModalOpen(true);
  };

  const openEditExpense = (exp: BusinessExpense) => {
    setEditingExpense(exp);
    setReceiptFile(null);
    setClearAttachment(false);
    setDupConfirmed(false);
    expForm.reset({
      title: exp.title,
      category: exp.category,
      amountRupees: paiseToRupees(exp.amountPaise),
      date: exp.date,
      paymentMethod: exp.paymentMethod,
      paidBy: exp.paidBy || '',
      description: exp.description || '',
      serviceId: exp.serviceId || '',
      projectId: exp.projectId || '',
    });
    setExpModalOpen(true);
  };

  const handleAddCustomCategory = async () => {
    if (!firebaseUser) return;
    const clean = customCategoryInput.trim().slice(0, 80);
    if (!clean) return;
    const currentCustom = userSettings?.customExpenseCategories ?? [];
    if (!categories.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      try {
        await updateUserSettings(firebaseUser.uid, {
          customExpenseCategories: [...currentCustom, clean].slice(0, 30),
        });
        expForm.setValue('category', clean);
        setCustomCategoryInput('');
        showToast(`Category "${clean}" added`, { variant: 'success' });
      } catch (err) {
        showToast('Failed to add category', {
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'error',
        });
      }
    } else {
      expForm.setValue('category', clean);
      setCustomCategoryInput('');
    }
  };

  const watchedAmount = expForm.watch('amountRupees');
  const watchedDate = expForm.watch('date');
  const watchedCategory = expForm.watch('category');
  const expDupCount = findPotentialDuplicateExpense({
    date: watchedDate,
    amountPaise: rupeesToPaise(watchedAmount || 0),
    category: watchedCategory || '',
    expenses: businessExpenses,
    excludeId: editingExpense?.id,
  });

  const onSaveExpense = async (values: BusinessExpenseFormValues) => {
    if (!firebaseUser) return;
    if (receiptFile) {
      const fileErr = validateReceiptFile(receiptFile);
      if (fileErr) {
        showToast(fileErr, { variant: 'error' });
        return;
      }
    }
    if (!editingExpense && expDupCount > 0 && !dupConfirmed) {
      setDupConfirmed(true);
      showToast('Potential duplicate expense', {
        description: 'Same date, category, and amount found. Submit again to confirm.',
        variant: 'warning',
      });
      return;
    }
    try {
      if (editingExpense) {
        const res = await updateBusinessExpenseWithAudit({
          uid: firebaseUser.uid,
          actorName,
          existing: editingExpense,
          values,
          receiptFile,
          clearAttachment,
        });
        showToast('Expense updated (audit logged)', {
          description: res.warning,
          variant: res.warning ? 'warning' : 'success',
        });
      } else {
        const res = await createBusinessExpense({
          uid: firebaseUser.uid,
          values,
          receiptFile,
        });
        showToast('Expense recorded', {
          description: res.warning,
          variant: res.warning ? 'warning' : 'success',
        });
      }
      setExpModalOpen(false);
    } catch (err) {
      showToast('Failed to save expense', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleSoftDelete = async () => {
    if (!firebaseUser || !deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteBusinessExpenseWithAudit({
        uid: firebaseUser.uid,
        actorName,
        expense: deleteTarget,
      });
      showToast('Expense moved to Trash', { variant: 'info' });
      setDeleteTarget(null);
    } catch (err) {
      showToast('Failed to delete expense', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = async (exp: BusinessExpense) => {
    if (!firebaseUser) return;
    try {
      await restoreBusinessExpenseWithAudit({
        uid: firebaseUser.uid,
        actorName,
        expense: exp,
      });
      showToast('Expense restored', { variant: 'success' });
    } catch (err) {
      showToast('Restore failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  // Recurring Templates
  const openCreateTemplate = () => {
    setEditingTemplate(null);
    tplForm.reset({
      title: '',
      category: categories[0] || 'Software & Subscriptions',
      amountRupees: 0,
      dayOfMonth: 1,
      paymentMethod: 'Card',
      paidBy: '',
      description: '',
      serviceId: '',
      projectId: '',
      active: true,
    });
    setTplModalOpen(true);
  };

  const openEditTemplate = (tpl: RecurringExpenseTemplate) => {
    setEditingTemplate(tpl);
    tplForm.reset({
      title: tpl.title,
      category: tpl.category,
      amountRupees: paiseToRupees(tpl.amountPaise),
      dayOfMonth: tpl.dayOfMonth,
      paymentMethod: tpl.paymentMethod,
      paidBy: tpl.paidBy || '',
      description: tpl.description || '',
      serviceId: tpl.serviceId || '',
      projectId: tpl.projectId || '',
      active: tpl.active,
    });
    setTplModalOpen(true);
  };

  const onSaveTemplate = async (values: RecurringExpenseTemplateFormValues) => {
    if (!firebaseUser) return;
    try {
      if (editingTemplate) {
        await updateRecurringExpenseTemplate(editingTemplate.id, values);
        showToast('Recurring template updated', { variant: 'success' });
      } else {
        await createRecurringExpenseTemplate(firebaseUser.uid, values);
        showToast('Recurring template created', { variant: 'success' });
      }
      setTplModalOpen(false);
    } catch (err) {
      showToast('Failed to save template', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleGenerateDue = async () => {
    if (!firebaseUser) return;
    setGeneratingRec(true);
    try {
      const count = await generateDueRecurringExpenses({
        uid: firebaseUser.uid,
        templates: recurringExpenseTemplates,
        existingExpenses: businessExpenses,
        todayStr,
      });
      if (count > 0) {
        showToast(`Generated ${count} due recurring expense(s)`, { variant: 'success' });
      } else {
        showToast('All due recurring expenses are already generated for this month', {
          variant: 'info',
        });
      }
    } catch (err) {
      showToast('Generation failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setGeneratingRec(false);
    }
  };

  const handleExportCsv = () => {
    downloadCsvFile(
      `goalx-company-expenses-${startDate}-to-${endDate}.csv`,
      ['Date', 'Title', 'Category', 'Method', 'Paid By', 'Service', 'Project', 'Amount (INR)', 'Notes'],
      filteredExpenses.map((e) => [
        e.date,
        e.title,
        e.category,
        e.paymentMethod,
        e.paidBy,
        serviceMap.get(e.serviceId) ?? '',
        projectMap.get(e.projectId) ?? '',
        paiseToRupees(e.amountPaise).toFixed(2),
        e.description,
      ])
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Bar */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setSubView('ledger');
                setPage(1);
              }}
              className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                subView === 'ledger' ? 'bg-white text-[#1F2937] shadow-xs' : 'text-[#64748B]'
              }`}
            >
              Expenses
            </button>
            <button
              type="button"
              onClick={() => setSubView('recurring')}
              className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                subView === 'recurring' ? 'bg-white text-[#1F2937] shadow-xs' : 'text-[#64748B]'
              }`}
            >
              Recurring ({recurringExpenseTemplates.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setSubView('trash');
                setPage(1);
              }}
              className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                subView === 'trash' ? 'bg-white text-[#DC2626] shadow-xs' : 'text-[#64748B]'
              }`}
            >
              Trash
            </button>
          </div>

          {subView !== 'recurring' && (
            <span className="text-sm font-bold text-[#DC2626] tabular-nums">
              {formatINR(filteredTotalPaise)} ({filteredExpenses.length})
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAuditDrawer(true)}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
          >
            <History className="w-4 h-4 text-[#64748B]" />
            <span>Audit ({expenseAuditLogs.length})</span>
          </button>
          {subView === 'recurring' ? (
            <>
              <button
                type="button"
                onClick={handleGenerateDue}
                disabled={generatingRec}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${generatingRec ? 'animate-spin' : ''}`} />
                <span>Generate Due</span>
              </button>
              <button
                type="button"
                onClick={openCreateTemplate}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Recurring Template</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredExpenses.length === 0}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#64748B]" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={openCreateExpense}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Expense</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Subview: Recurring Templates */}
      {subView === 'recurring' ? (
        recurringExpenseTemplates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recurringExpenseTemplates.map((tpl) => (
              <div key={tpl.id} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-[#1F2937]">{tpl.title}</h3>
                    <p className="text-xs text-[#64748B]">
                      {tpl.category} · Day {tpl.dayOfMonth} monthly
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditTemplate(tpl)}
                      className="p-1.5 text-[#64748B] hover:text-[#1F2937] cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteRecurringExpenseTemplate(tpl.id)}
                      className="p-1.5 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E2E8F0]">
                  <span className="text-base font-bold text-[#1F2937] tabular-nums">
                    {formatINR(tpl.amountPaise)}
                  </span>
                  <span className={tpl.active ? 'text-[#16A34A] font-medium' : 'text-[#64748B]'}>
                    {tpl.active ? 'Active' : 'Paused'}
                    {tpl.lastGeneratedMonth ? ` · Last: ${tpl.lastGeneratedMonth}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
            <EmptyState
              title="No recurring expense templates"
              description="Set up monthly office rent, SaaS subscriptions, or server retainers and generate them safely without duplicates."
              icon={<Repeat className="w-5 h-5" />}
              actionLabel="New Recurring Template"
              onAction={openCreateTemplate}
            />
          </div>
        )
      ) : (
        <>
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Search title, category, paid by..."
                className="w-full min-h-[42px] pl-10 pr-3 rounded-xl border border-[#E2E8F0] bg-white text-sm"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-[42px] px-3 rounded-xl border border-[#E2E8F0] bg-white text-sm"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
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

          {paginated.length > 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs text-[#64748B]">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Title</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Allocation</th>
                      <th className="py-3 px-4">Receipt</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {paginated.map((exp) => (
                      <tr key={exp.id}>
                        <td className="py-3 px-4 tabular-nums text-[#64748B]">{exp.date}</td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-[#1F2937]">{exp.title}</p>
                          <p className="text-xs text-[#64748B]">
                            {exp.paymentMethod}
                            {exp.paidBy ? ` · ${exp.paidBy}` : ''}
                            {exp.salaryRecordId ? ' · Auto-Payroll' : ''}
                            {exp.recurringTemplateId ? ' · Recurring' : ''}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-xs text-[#1F2937]">{exp.category}</td>
                        <td className="py-3 px-4 text-xs text-[#64748B]">
                          {[serviceMap.get(exp.serviceId), projectMap.get(exp.projectId)]
                            .filter(Boolean)
                            .join(' · ') || 'Unallocated'}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {sanitizeHttpUrl(exp.attachmentUrl) ? (
                            <a
                              href={sanitizeHttpUrl(exp.attachmentUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              <span>View</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-[#64748B]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-[#DC2626] tabular-nums">
                          {formatINR(exp.amountPaise)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {exp.isDeleted ? (
                            <button
                              type="button"
                              onClick={() => void handleRestore(exp)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Restore</span>
                            </button>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditExpense(exp)}
                                aria-label="Edit expense"
                                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(exp)}
                                aria-label="Delete expense"
                                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden divide-y divide-[#E2E8F0]">
                {paginated.map((exp) => (
                  <div key={exp.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1F2937] truncate">{exp.title}</p>
                        <p className="text-xs text-[#64748B]">
                          {exp.date} · {exp.category}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-[#DC2626] tabular-nums shrink-0">
                        {formatINR(exp.amountPaise)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#64748B]">
                      <span>
                        {exp.paymentMethod}
                        {exp.attachmentUrl ? ' · Has Receipt' : ''}
                      </span>
                      {exp.isDeleted ? (
                        <button
                          type="button"
                          onClick={() => void handleRestore(exp)}
                          className="font-medium text-[#2563EB] cursor-pointer"
                        >
                          Restore
                        </button>
                      ) : (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openEditExpense(exp)}
                            className="font-medium text-[#1F2937] cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(exp)}
                            className="font-medium text-[#DC2626] cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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
                title={subView === 'trash' ? 'Trash is empty' : 'No expenses recorded'}
                description={
                  subView === 'trash'
                    ? 'Soft-deleted expenses appear here so you can restore them anytime.'
                    : 'Log business expenses with optional service/project tags and receipt attachments.'
                }
                actionLabel={subView === 'ledger' ? 'Add Expense' : undefined}
                onAction={subView === 'ledger' ? openCreateExpense : undefined}
              />
            </div>
          )}
        </>
      )}

      {/* Expense Modal */}
      {expModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1F2937]">
                {editingExpense ? 'Edit Expense' : 'Add Business Expense'}
              </h2>
              <button type="button" onClick={() => setExpModalOpen(false)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={expForm.handleSubmit(onSaveExpense)} className="flex-1 overflow-y-auto p-5 space-y-4">
              {!editingExpense && expDupCount > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
                  <span>
                    Warning: {expDupCount} expense(s) match this date, category, and amount. Submit again to confirm.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Expense Title *</label>
                <input
                  type="text"
                  {...expForm.register('title')}
                  placeholder="e.g., AWS Cloud Hosting"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm"
                />
                {expForm.formState.errors.title && (
                  <p className="mt-1 text-xs text-[#DC2626]">{expForm.formState.errors.title.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Category *</label>
                  <select {...expForm.register('category')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Add Custom Category</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={customCategoryInput}
                      onChange={(e) => setCustomCategoryInput(e.target.value)}
                      placeholder="New category"
                      className="flex-1 min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddCustomCategory()}
                      className="min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-xs font-medium hover:bg-slate-50 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    {...expForm.register('amountRupees', { valueAsNumber: true })}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm tabular-nums"
                  />
                  {expForm.formState.errors.amountRupees && (
                    <p className="mt-1 text-xs text-[#DC2626]">{expForm.formState.errors.amountRupees.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Date *</label>
                  <input type="date" {...expForm.register('date')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Payment Method</label>
                  <select {...expForm.register('paymentMethod')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    {FINANCE_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Paid By</label>
                  <input
                    type="text"
                    {...expForm.register('paidBy')}
                    placeholder="e.g., Company Card"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Tag Service (Optional)</label>
                  <select {...expForm.register('serviceId')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    <option value="">Unallocated</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Tag Project (Optional)</label>
                  <select {...expForm.register('projectId')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    <option value="">Unallocated</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">
                  Receipt Attachment (PNG, JPG, WEBP, PDF ≤ 5MB)
                </label>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f) {
                      const err = validateReceiptFile(f);
                      if (err) {
                        showToast(err, { variant: 'error' });
                        e.target.value = '';
                        return;
                      }
                    }
                    setReceiptFile(f);
                  }}
                  className="w-full text-xs text-[#64748B] file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border file:border-[#E2E8F0] file:text-xs file:font-medium file:bg-[#F8FAFC] file:text-[#1F2937]"
                />
                {sanitizeHttpUrl(editingExpense?.attachmentUrl) && !clearAttachment && !receiptFile && (
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <a
                      href={sanitizeHttpUrl(editingExpense?.attachmentUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#2563EB] hover:underline"
                    >
                      Current receipt: {editingExpense?.attachmentName || 'View'}
                    </a>
                    <button
                      type="button"
                      onClick={() => setClearAttachment(true)}
                      className="text-[#DC2626] cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Description</label>
                <textarea rows={2} {...expForm.register('description')} className="w-full p-3 rounded-xl border border-[#E2E8F0] text-sm" />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2.5">
                <button type="button" onClick={() => setExpModalOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#1F2937] cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={expForm.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-xl bg-[#DC2626] text-sm font-medium text-white cursor-pointer">
                  {expForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingExpense ? 'Save Changes' : 'Save Expense'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recurring Template Modal */}
      {tplModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1F2937]">
                {editingTemplate ? 'Edit Recurring Template' : 'New Recurring Expense Template'}
              </h2>
              <button type="button" onClick={() => setTplModalOpen(false)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={tplForm.handleSubmit(onSaveTemplate)} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Title *</label>
                <input type="text" {...tplForm.register('title')} placeholder="e.g., Office Internet Fiber" className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Category</label>
                  <select {...tplForm.register('category')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Amount (₹)</label>
                  <input type="number" min={1} step="0.01" {...tplForm.register('amountRupees', { valueAsNumber: true })} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm tabular-nums" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Day (1-28)</label>
                  <input type="number" min={1} max={28} {...tplForm.register('dayOfMonth', { valueAsNumber: true })} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm tabular-nums" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Payment Method</label>
                  <select {...tplForm.register('paymentMethod')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    {FINANCE_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-[#1F2937] pt-5 cursor-pointer">
                  <input type="checkbox" {...tplForm.register('active')} className="w-4 h-4 accent-[#DC2626]" />
                  <span>Active Monthly</span>
                </label>
              </div>
              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2">
                <button type="button" onClick={() => setTplModalOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={tplForm.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-xl bg-[#DC2626] text-sm font-medium text-white cursor-pointer">
                  {tplForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Save Template</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit Modal */}
      {showAuditDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-xl bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1F2937]">Expense Audit Log</h2>
              <button type="button" onClick={() => setShowAuditDrawer(false)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {expenseAuditLogs.length === 0 ? (
                <p className="text-sm text-[#64748B]">No expense edits or deletions logged yet.</p>
              ) : (
                <ul className="divide-y divide-[#E2E8F0] text-xs">
                  {expenseAuditLogs.map((log) => (
                    <li key={log.id} className="py-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#1F2937] capitalize">
                          {log.action.replace('_', ' ')}
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
        title={`Move "${deleteTarget?.title}" to Trash?`}
        description="This soft-deletes the expense, excludes it from totals, and writes an audit trail entry. You can restore it anytime from Trash."
        variant="danger"
        confirmLabel="Move to Trash"
        loading={deleting}
        onConfirm={handleSoftDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
