import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  FileSpreadsheet,
  FileText,
  IndianRupee,
  PieChart,
  Receipt,
  TrendingUp,
  Users,
} from 'lucide-react';
import { AskAiCeoButton } from '../components/ai/AskAiCeoButton';
import { FinanceBudgetsTab } from '../components/finance/FinanceBudgetsTab';
import { FinanceExpensesTab } from '../components/finance/FinanceExpensesTab';
import { FinanceIncomeTab } from '../components/finance/FinanceIncomeTab';
import { FinanceInvoicesTab } from '../components/finance/FinanceInvoicesTab';
import { FinanceOverviewTab } from '../components/finance/FinanceOverviewTab';
import { FinanceReportsTab } from '../components/finance/FinanceReportsTab';
import { FinanceSalariesTab } from '../components/finance/FinanceSalariesTab';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useBusinessDataContext } from '../hooks/useBusinessData';
import { useFinance } from '../hooks/useFinance';
import { DateFilterPreset, getDateRangeBounds } from '../lib/businessUtils';
import { ROUTES } from '../lib/constants';
import { getTodayDateString } from '../lib/goalUtils';
import { AccountingBasis } from '../types';

type FinanceTab =
  | 'overview'
  | 'income'
  | 'invoices'
  | 'expenses'
  | 'salaries'
  | 'budgets'
  | 'reports';

const VALID_TABS: FinanceTab[] = [
  'overview',
  'income',
  'invoices',
  'expenses',
  'salaries',
  'budgets',
  'reports',
];

const TAB_CONFIG: { id: FinanceTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: TrendingUp },
  { id: 'income', label: 'Income', icon: IndianRupee },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'salaries', label: 'Salaries', icon: Users },
  { id: 'budgets', label: 'Budgets', icon: PieChart },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
];

const DATE_PRESETS: { value: DateFilterPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
];

export const FinancePage: React.FC = () => {
  const { companyProfile, userSettings } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') as FinanceTab | null;
  const activeTab: FinanceTab = rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'overview';

  const todayStr = getTodayDateString();
  const [basisOverride, setBasisOverride] = useState<AccountingBasis | null>(null);
  const basis: AccountingBasis = basisOverride ?? userSettings?.accountingBasis ?? 'cash';
  const setBasis = (next: AccountingBasis) => setBasisOverride(next);
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('this_month');
  const [customStart, setCustomStart] = useState(`${todayStr.slice(0, 8)}01`);
  const [customEnd, setCustomEnd] = useState(todayStr);

  const bounds = useMemo(
    () => getDateRangeBounds(datePreset, customStart, customEnd, todayStr),
    [datePreset, customStart, customEnd, todayStr]
  );

  const { invoices } = useBusinessDataContext();
  const {
    unifiedIncome,
    projects,
    projectPayments,
    otherIncome,
    businessExpenses,
    services,
    clients,
    financeAuditLogs,
    loading,
  } = useFinance(bounds.start, bounds.end, basis);

  const switchTab = (tab: FinanceTab) => {
    setSearchParams({ tab });
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const showDateFilterBar =
    activeTab === 'overview' ||
    activeTab === 'income' ||
    activeTab === 'expenses' ||
    activeTab === 'reports';

  const showBasisToggle = activeTab === 'overview' || activeTab === 'reports';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[#1F2937]">Company Finance</h1>
            <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 border border-[#E2E8F0] text-xs font-semibold text-[#1F2937]">
              {basis === 'cash' ? 'Cash Basis' : 'Accrual Basis'}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#64748B]">
            {companyProfile?.name || 'Gen Z Neural-X'} business accounting — kept strictly separate from personal finance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {showBasisToggle && (
            <div
              role="group"
              aria-label="Accounting basis"
              className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-[#E2E8F0]"
            >
              <button
                type="button"
                onClick={() => setBasis('cash')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  basis === 'cash'
                    ? 'bg-white text-[#1F2937] shadow-xs'
                    : 'text-[#64748B] hover:text-[#1F2937]'
                }`}
              >
                Cash Basis
              </button>
              <button
                type="button"
                onClick={() => setBasis('accrual')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  basis === 'accrual'
                    ? 'bg-white text-[#1F2937] shadow-xs'
                    : 'text-[#64748B] hover:text-[#1F2937]'
                }`}
              >
                Accrual Basis
              </button>
            </div>
          )}

          <AskAiCeoButton
            area="finance"
            prompt="Summarize this month's cashflow, profit margin, budgets, and outstanding receivables"
          />

          <Link
            to={ROUTES.PROJECTS}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50"
          >
            <BarChart3 className="w-4 h-4 text-[#DC2626]" />
            <span>Projects</span>
          </Link>
        </div>
      </div>

      {/* Sub-module Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl overflow-x-auto">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchTab(tab.id)}
              className={`min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                active
                  ? 'bg-white text-[#DC2626] shadow-xs'
                  : 'text-[#64748B] hover:text-[#1F2937]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Shared Date Range Presets */}
      {showDateFilterBar && (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#1F2937]">Reporting Period</p>
              <p className="text-xs text-[#64748B] tabular-nums">
                {bounds.label} ({bounds.start} to {bounds.end})
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setDatePreset(preset.value)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                    datePreset === preset.value
                      ? 'bg-[#DC2626] text-white border-[#DC2626]'
                      : 'bg-white text-[#1F2937] border-[#E2E8F0] hover:bg-slate-50'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {datePreset === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E2E8F0]">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">Start Date</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">End Date</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937]"
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Active Tab Body */}
      {activeTab === 'overview' && (
        <FinanceOverviewTab
          basis={basis}
          startDate={bounds.start}
          endDate={bounds.end}
          rangeLabel={bounds.label}
          projects={projects}
          projectPayments={projectPayments}
          otherIncome={otherIncome}
          businessExpenses={businessExpenses}
          services={services}
          clients={clients}
        />
      )}

      {activeTab === 'income' && (
        <FinanceIncomeTab
          unifiedIncome={unifiedIncome}
          projects={projects}
          projectPayments={projectPayments}
          otherIncome={otherIncome}
          clients={clients}
          auditLogs={financeAuditLogs}
          startDate={bounds.start}
          endDate={bounds.end}
        />
      )}

      {activeTab === 'invoices' && <FinanceInvoicesTab />}

      {activeTab === 'expenses' && (
        <FinanceExpensesTab startDate={bounds.start} endDate={bounds.end} />
      )}

      {activeTab === 'salaries' && (
        <FinanceSalariesTab projects={projects} projectPayments={projectPayments} />
      )}

      {activeTab === 'budgets' && <FinanceBudgetsTab services={services} />}

      {activeTab === 'reports' && (
        <FinanceReportsTab
          basis={basis}
          startDate={bounds.start}
          endDate={bounds.end}
          rangeLabel={bounds.label}
          projects={projects}
          projectPayments={projectPayments}
          otherIncome={otherIncome}
          businessExpenses={businessExpenses}
          invoices={invoices}
          services={services}
          clients={clients}
        />
      )}
    </div>
  );
};
