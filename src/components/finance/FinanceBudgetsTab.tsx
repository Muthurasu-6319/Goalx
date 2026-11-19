import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Pencil,
  PieChart as PieIcon,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { useAuth } from '../../hooks/useAuth';
import { useBudgets } from '../../hooks/useBudgets';
import { useExpenses } from '../../hooks/useExpenses';
import { useToast } from '../../hooks/useToast';
import { BUDGET_TYPES } from '../../lib/constants';
import { getPreviousMonthKey } from '../../lib/financeUtils';
import { formatINR, getCurrentMonthKey, paiseToRupees } from '../../lib/moneyUtils';
import { BudgetFormValues, budgetSchema } from '../../lib/validators';
import {
  copyBudgetsFromPreviousMonth,
  createBudget,
  deleteBudget,
  updateBudget,
} from '../../services/companyFinanceService';
import { Budget, BudgetType, BusinessService } from '../../types';
import { CalcInfoPopover } from './CalcInfoPopover';

interface FinanceBudgetsTabProps {
  services: BusinessService[];
}

export const FinanceBudgetsTab: React.FC<FinanceBudgetsTabProps> = ({ services }) => {
  const { firebaseUser } = useAuth();
  const { categories } = useExpenses();
  const { showToast } = useToast();

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());
  const { budgets, scopedBudgets, utilizationRows } = useBudgets(selectedMonth);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [copying, setCopying] = useState(false);

  const serviceNameById = useMemo(
    () => new Map(services.map((s) => [s.id, s.name])),
    [services]
  );

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      budgetType: 'Monthly Overall',
      target: 'All Company Expenses',
      month: selectedMonth,
      limitRupees: 0,
    },
  });

  const watchedType = form.watch('budgetType');

  const handleBudgetTypeChange = (nextType: BudgetType) => {
    form.setValue('budgetType', nextType);
    if (nextType === 'Monthly Overall') {
      form.setValue('target', 'All Company Expenses');
    } else if (nextType === 'Marketing') {
      form.setValue('target', 'Marketing & Ads');
    } else if (nextType === 'Team') {
      form.setValue('target', 'All Team');
    } else if (nextType === 'Service') {
      form.setValue('target', services[0]?.id ?? '');
    } else if (nextType === 'Category') {
      form.setValue('target', categories[0] ?? 'Miscellaneous');
    }
  };

  const openCreateModal = () => {
    setEditingBudget(null);
    form.reset({
      budgetType: 'Monthly Overall',
      target: 'All Company Expenses',
      month: selectedMonth,
      limitRupees: 0,
    });
    setModalOpen(true);
  };

  const openEditModal = (b: Budget) => {
    setEditingBudget(b);
    form.reset({
      budgetType: b.budgetType,
      target: b.target,
      month: b.month,
      limitRupees: paiseToRupees(b.limitPaise),
    });
    setModalOpen(true);
  };

  const onSaveBudget = async (values: BudgetFormValues) => {
    if (!firebaseUser) return;
    try {
      if (editingBudget) {
        await updateBudget(editingBudget.id, values);
        showToast('Budget updated', { variant: 'success' });
      } else {
        await createBudget(firebaseUser.uid, values);
        showToast('Budget created', { variant: 'success' });
      }
      setModalOpen(false);
    } catch (err) {
      showToast('Failed to save budget', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleCopyPreviousMonth = async () => {
    if (!firebaseUser) return;
    const prevMonth = getPreviousMonthKey(selectedMonth);
    const sourceBudgets = budgets.filter((b) => b.month === prevMonth);
    if (sourceBudgets.length === 0) {
      showToast(`No budgets found for ${prevMonth}`, { variant: 'info' });
      return;
    }
    setCopying(true);
    try {
      const created = await copyBudgetsFromPreviousMonth({
        uid: firebaseUser.uid,
        sourceBudgets,
        existingTargetBudgets: scopedBudgets,
        targetMonth: selectedMonth,
      });
      if (created > 0) {
        showToast(`Copied ${created} budget(s) from ${prevMonth}`, { variant: 'success' });
      } else {
        showToast(`All budgets from ${prevMonth} already exist in ${selectedMonth}`, { variant: 'info' });
      }
    } catch (err) {
      showToast('Failed to copy budgets', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setCopying(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteBudget(deleteTarget.id);
      showToast('Budget removed', { variant: 'info' });
      setDeleteTarget(null);
    } catch (err) {
      showToast('Failed to delete budget', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const summary = useMemo(() => {
    let totalLimitsPaise = 0;
    let totalSpentPaise = 0;
    let warningCount = 0;
    let exceededCount = 0;
    for (const row of utilizationRows) {
      totalLimitsPaise += row.budget.limitPaise;
      totalSpentPaise += row.spentPaise;
      if (row.health === 'warning') warningCount += 1;
      if (row.health === 'exceeded') exceededCount += 1;
    }
    return { totalLimitsPaise, totalSpentPaise, warningCount, exceededCount };
  }, [utilizationRows]);

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-medium text-[#64748B] mb-1">Budget Month</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] tabular-nums"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#64748B] pt-4 sm:pt-0">
            <span>Alerts trigger automatically at 80% &amp; 100% spend</span>
            <CalcInfoPopover
              title="Budget Tracking"
              formula="Matches non-deleted businessExpenses in the selected month by Overall, Category, Service ID, Marketing & Ads, or Team Salaries."
              note="Health bands: Green (<80%), Amber (80%–100%), Red (>100%). Deduplicated alerts appear in Notifications."
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyPreviousMonth}
            disabled={copying}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer disabled:opacity-50"
          >
            {copying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Copy Last Month</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-4 py-2 text-xs font-medium text-white hover:bg-[#B91C1C] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Budget</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
          <p className="text-xs text-[#64748B]">Active Budgets</p>
          <p className="mt-1 text-xl font-bold text-[#1F2937] tabular-nums">
            {utilizationRows.length}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
          <p className="text-xs text-[#64748B]">Tracked Spend / Limits</p>
          <p className="mt-1 text-base sm:text-lg font-bold text-[#1F2937] tabular-nums">
            {formatINR(summary.totalSpentPaise)}{' '}
            <span className="text-xs font-normal text-[#64748B]">
              / {formatINR(summary.totalLimitsPaise)}
            </span>
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
          <p className="text-xs text-[#64748B]">Warning (80–100%)</p>
          <p className="mt-1 text-xl font-bold text-[#F59E0B] tabular-nums">{summary.warningCount}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
          <p className="text-xs text-[#64748B]">Exceeded (&gt;100%)</p>
          <p className="mt-1 text-xl font-bold text-[#DC2626] tabular-nums">{summary.exceededCount}</p>
        </div>
      </div>

      {/* Budget Cards */}
      {utilizationRows.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            icon={<PieIcon className="w-5 h-5" />}
            title={`No budgets set for ${selectedMonth}`}
            description="Create a monthly overall cap, category limit, or service budget — or copy last month's limits."
            actionLabel="Create Budget"
            onAction={openCreateModal}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {utilizationRows.map((row) => {
            const targetDisplay =
              row.budget.budgetType === 'Service'
                ? serviceNameById.get(row.budget.target) ?? row.budget.target
                : row.budget.target;

            const barColor =
              row.health === 'exceeded'
                ? 'bg-[#DC2626]'
                : row.health === 'warning'
                  ? 'bg-[#F59E0B]'
                  : 'bg-[#16A34A]';

            const statusTextColor =
              row.health === 'exceeded'
                ? 'text-[#DC2626]'
                : row.health === 'warning'
                  ? 'text-[#F59E0B]'
                  : 'text-[#16A34A]';

            return (
              <div
                key={row.budget.id}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#64748B]">{row.budget.budgetType}</p>
                    <h3 className="text-base font-semibold text-[#1F2937] truncate">
                      {targetDisplay}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(row.budget)}
                      className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(row.budget)}
                      className="p-1.5 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-[#1F2937] font-semibold tabular-nums">
                      {formatINR(row.spentPaise)}{' '}
                      <span className="font-normal text-[#64748B]">
                        of {formatINR(row.budget.limitPaise)}
                      </span>
                    </span>
                    <span className={`font-bold tabular-nums ${statusTextColor}`}>
                      {row.utilizationPct}%
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                      style={{ width: `${Math.min(100, row.utilizationPct)}%` }}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    {row.health === 'healthy' ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
                        <span className="text-[#16A34A] font-medium">On Track</span>
                      </>
                    ) : row.health === 'warning' ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />
                        <span className="text-[#F59E0B] font-medium">80%+ Threshold Reached</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626]" />
                        <span className="text-[#DC2626] font-medium">Budget Exceeded</span>
                      </>
                    )}
                  </span>

                  <span className="text-[#64748B] tabular-nums">
                    {row.remainingPaise >= 0
                      ? `${formatINR(row.remainingPaise)} left`
                      : `Over by ${formatINR(Math.abs(row.remainingPaise))}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <h3 className="text-base font-semibold text-[#1F2937]">
                {editingBudget ? 'Edit Budget' : 'New Company Budget'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 text-[#64748B] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={form.handleSubmit(onSaveBudget)} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Budget Type</label>
                  <select
                    value={watchedType}
                    onChange={(e) => handleBudgetTypeChange(e.target.value as BudgetType)}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white"
                  >
                    {BUDGET_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Month</label>
                  <input
                    type="month"
                    {...form.register('month')}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Target</label>
                {watchedType === 'Service' ? (
                  <select
                    {...form.register('target')}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : watchedType === 'Category' ? (
                  <select
                    {...form.register('target')}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    {...form.register('target')}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm"
                  />
                )}
                {form.formState.errors.target && (
                  <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.target.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Monthly Limit (INR)</label>
                <input
                  type="number"
                  min={1}
                  step="any"
                  {...form.register('limitRupees', { valueAsNumber: true })}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums"
                />
                {form.formState.errors.limitRupees && (
                  <p className="mt-1 text-xs text-[#DC2626]">
                    {form.formState.errors.limitRupees.message}
                  </p>
                )}
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
                  className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 text-sm font-medium text-white cursor-pointer"
                >
                  {form.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingBudget ? 'Update' : 'Create Budget'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Budget?"
        description="This removes the spending limit for this month. Recorded expenses are unaffected."
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
