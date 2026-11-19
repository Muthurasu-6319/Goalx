import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import {
  computeCompanyFinanceSummary,
  computeProjectFinancials,
  computeServicePerformance,
  formatPctOrNA,
  getMonthBounds,
} from '../../lib/financeUtils';
import { formatINR, getLastNMonthKeys, paiseToRupees } from '../../lib/moneyUtils';
import {
  AccountingBasis,
  BusinessExpense,
  BusinessService,
  Client,
  OtherIncome,
  Project,
  ProjectPayment,
} from '../../types';
import { CalcInfoPopover } from './CalcInfoPopover';

const PIE_COLORS = ['#DC2626', '#2563EB', '#16A34A', '#F59E0B', '#6366F1', '#0EA5E9', '#64748B'];

interface FinanceOverviewTabProps {
  basis: AccountingBasis;
  startDate: string;
  endDate: string;
  rangeLabel: string;
  projects: Project[];
  projectPayments: ProjectPayment[];
  otherIncome: OtherIncome[];
  businessExpenses: BusinessExpense[];
  services: BusinessService[];
  clients: Client[];
}

export const FinanceOverviewTab: React.FC<FinanceOverviewTabProps> = ({
  basis,
  startDate,
  endDate,
  rangeLabel,
  projects,
  projectPayments,
  otherIncome,
  businessExpenses,
  services,
  clients,
}) => {
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const summary = useMemo(
    () =>
      computeCompanyFinanceSummary({
        projects,
        projectPayments,
        otherIncome,
        businessExpenses,
        startDate,
        endDate,
        basis,
      }),
    [projects, projectPayments, otherIncome, businessExpenses, startDate, endDate, basis]
  );

  const servicePerf = useMemo(
    () =>
      computeServicePerformance({
        services,
        projects,
        projectPayments,
        businessExpenses,
        startDate,
        endDate,
        basis,
      }),
    [services, projects, projectPayments, businessExpenses, startDate, endDate, basis]
  );

  const projectRows = useMemo(
    () => computeProjectFinancials(projects, projectPayments, businessExpenses),
    [projects, projectPayments, businessExpenses]
  );

  // Last 6 months trend (Cash Collections vs Expenses, plus Net Profit on selected basis)
  const monthlySeries = useMemo(() => {
    return getLastNMonthKeys(6).map(({ key, label }) => {
      const bounds = getMonthBounds(key);
      const mSummary = computeCompanyFinanceSummary({
        projects,
        projectPayments,
        otherIncome,
        businessExpenses,
        startDate: bounds.start,
        endDate: bounds.end,
        basis,
      });
      return {
        month: label,
        income: paiseToRupees(mSummary.collectionsPaise),
        revenue: paiseToRupees(mSummary.revenuePaise),
        expenses: paiseToRupees(mSummary.expensesPaise),
        netProfit: paiseToRupees(mSummary.netProfitPaise),
      };
    });
  }, [projects, projectPayments, otherIncome, businessExpenses, basis]);

  const expenseCategoryPie = useMemo(() => {
    const map = new Map<string, number>();
    for (const exp of businessExpenses) {
      if (exp.isDeleted || exp.date < startDate || exp.date > endDate) continue;
      map.set(exp.category, (map.get(exp.category) ?? 0) + exp.amountPaise);
    }
    return Array.from(map.entries())
      .map(([name, paise]) => ({ name, value: paiseToRupees(paise), paise }))
      .sort((a, b) => b.paise - a.paise);
  }, [businessExpenses, startDate, endDate]);

  const serviceChartData = useMemo(
    () =>
      servicePerf.rows.slice(0, 8).map((r) => ({
        name: r.serviceName.length > 18 ? `${r.serviceName.slice(0, 16)}…` : r.serviceName,
        revenue: paiseToRupees(r.revenuePaise),
      })),
    [servicePerf.rows]
  );

  const basisLabel = basis === 'cash' ? 'Cash Basis' : 'Accrual Basis';

  return (
    <div className="space-y-6">
      {/* 8 Financial KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-[#64748B]">
            <span>Revenue ({basisLabel})</span>
            <CalcInfoPopover
              title="Company Revenue"
              formula={
                basis === 'cash'
                  ? 'Cash Basis (default): Total projectPayments + otherIncome received in the selected period.'
                  : 'Accrual Basis: Total budgets of confirmed projects (not Cancelled or Planning) whose startDate falls in the selected period.'
              }
              note={`Window: ${rangeLabel} (${startDate} to ${endDate})`}
            />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-bold text-[#1F2937] tabular-nums">
            {formatINR(summary.revenuePaise)}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">{basisLabel}</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-[#64748B]">
            <span>Collections</span>
            <CalcInfoPopover
              title="Collections"
              formula="Actual money received in period = active projectPayments + active otherIncome."
            />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-bold text-[#16A34A] tabular-nums">
            {formatINR(summary.collectionsPaise)}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            Proj {formatINR(summary.projectCollectionsPaise)} · Other {formatINR(summary.otherIncomePaise)}
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-[#64748B]">
            <span>Expenses</span>
            <CalcInfoPopover
              title="Company Expenses"
              formula="Sum of non-deleted businessExpenses in the selected date range (including auto-logged paid salaries)."
            />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-bold text-[#DC2626] tabular-nums">
            {formatINR(summary.expensesPaise)}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">{rangeLabel}</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-[#64748B]">
            <span>Net Profit ({basisLabel})</span>
            <CalcInfoPopover
              title="Net Profit"
              formula={`Revenue (${basisLabel}) minus total active businessExpenses in the selected period.`}
            />
          </div>
          <p
            className={`mt-2 text-xl sm:text-2xl font-bold tabular-nums ${
              summary.netProfitPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
            }`}
          >
            {formatINR(summary.netProfitPaise)}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">
            Margin: <span className="font-semibold text-[#1F2937]">{formatPctOrNA(summary.profitMarginPct)}</span>
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-[#64748B]">
            <span>Profit Margin</span>
            <CalcInfoPopover
              title="Profit Margin"
              formula="Net Profit divided by Revenue × 100. Shows N/A when Revenue is ₹0."
            />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-bold text-[#1F2937] tabular-nums">
            {formatPctOrNA(summary.profitMarginPct)}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">{basisLabel}</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-[#64748B]">
            <span>Cash Flow</span>
            <CalcInfoPopover
              title="Cash Flow"
              formula="Cash actually received (Collections) minus cash paid (businessExpenses) in the selected period."
            />
          </div>
          <p
            className={`mt-2 text-xl sm:text-2xl font-bold tabular-nums ${
              summary.cashFlowPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
            }`}
          >
            {formatINR(summary.cashFlowPaise)}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">Cash in − Cash out</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-[#64748B]">
            <span>Pending Receivables</span>
            <CalcInfoPopover
              title="Outstanding Receivables"
              formula="Sum of (Confirmed project budget − received payments) per project, clamped at ₹0 in totals. Excludes Cancelled and Planning projects."
            />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-bold text-[#F59E0B] tabular-nums">
            {formatINR(summary.totalOutstandingPaise)}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">
            {summary.overpaidProjectsCount > 0 ? (
              <span className="text-amber-700 font-medium">
                {summary.overpaidProjectsCount} overpaid project(s)
              </span>
            ) : (
              'Across confirmed projects'
            )}
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-[#64748B]">
            <span>Active Projects</span>
            <CalcInfoPopover
              title="Active Projects"
              formula="Count of projects currently in status In Progress vs total confirmed projects."
            />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-bold text-[#1F2937] tabular-nums">
            {summary.activeProjectCount}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            {summary.confirmedProjectCount} confirmed total
          </p>
        </div>
      </div>

      {/* 4 Recharts Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">Monthly Collections vs Expenses (6M)</h2>
            <p className="text-xs text-[#64748B]">Cash received vs expenses paid across the last 6 months</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `₹${v.toLocaleString('en-IN')}`}
                  width={78}
                />
                <Tooltip formatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`} />
                <Bar dataKey="income" name="Collections" fill="#16A34A" radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="expenses" name="Expenses" fill="#DC2626" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">Net Profit Trend ({basisLabel})</h2>
            <p className="text-xs text-[#64748B]">6-month net profit trajectory on selected accounting basis</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlySeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `₹${v.toLocaleString('en-IN')}`}
                  width={78}
                />
                <Tooltip formatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`} />
                <Line
                  type="monotone"
                  dataKey="netProfit"
                  name="Net Profit"
                  stroke="#2563EB"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#2563EB' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">Expenses by Category</h2>
            <p className="text-xs text-[#64748B]">Category share for {rangeLabel}</p>
          </div>
          {expenseCategoryPie.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseCategoryPie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {expenseCategoryPie.map((entry, idx) => (
                        <Cell key={entry.name} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-2 text-xs">
                {expenseCategoryPie.slice(0, 6).map((row, idx) => (
                  <li key={row.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 truncate text-[#1F2937]">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      <span className="truncate">{row.name}</span>
                    </span>
                    <span className="font-semibold text-[#1F2937] tabular-nums shrink-0">
                      {formatINR(row.paise)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState
              title="No expenses in range"
              description="Expenses added for this period will break down by category here."
            />
          )}
        </section>

        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">Revenue by Service ({basisLabel})</h2>
            <p className="text-xs text-[#64748B]">Top service lines for {rangeLabel}</p>
          </div>
          {serviceChartData.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serviceChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `₹${v.toLocaleString('en-IN')}`}
                    width={78}
                  />
                  <Tooltip formatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`} />
                  <Bar dataKey="revenue" name="Revenue" fill="#DC2626" radius={[6, 6, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No service revenue in range"
              description="Link projects to services and log project payments to compare service lines."
            />
          )}
        </section>
      </div>

      {/* Service Performance & Profitability */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">Service Performance &amp; Profitability</h2>
            <p className="text-xs text-[#64748B]">
              Based on tagged expenses only · {basisLabel} ·{' '}
              <span className="font-medium text-[#1F2937]">
                Unallocated expenses: {formatINR(servicePerf.unallocatedExpensesPaise)}
              </span>
            </p>
          </div>
          <CalcInfoPopover
            title="Service Profitability"
            formula="Service Revenue minus businessExpenses tagged with that serviceId (or project's service)."
            note="Untagged expenses are shown separately under Unallocated."
          />
        </div>

        {servicePerf.rows.length > 0 ? (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                    <th className="py-2.5 pr-4">Service</th>
                    <th className="py-2.5 px-3 text-right">Projects</th>
                    <th className="py-2.5 px-3 text-right">Revenue</th>
                    <th className="py-2.5 px-3 text-right">Tagged Expenses</th>
                    <th className="py-2.5 px-3 text-right">Est. Profit</th>
                    <th className="py-2.5 pl-3 text-right">Rev. Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {servicePerf.rows.map((r) => (
                    <tr key={r.serviceId}>
                      <td className="py-3 pr-4 font-medium text-[#1F2937]">{r.serviceName}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{r.projectsCount}</td>
                      <td className="py-3 px-3 text-right tabular-nums font-semibold">
                        {formatINR(r.revenuePaise)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-[#64748B]">
                        {formatINR(r.taggedExpensesPaise)}
                      </td>
                      <td
                        className={`py-3 px-3 text-right tabular-nums font-semibold ${
                          r.estimatedProfitPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }`}
                      >
                        {formatINR(r.estimatedProfitPaise)}
                      </td>
                      <td className="py-3 pl-3 text-right tabular-nums text-[#64748B]">
                        {formatPctOrNA(r.profitSharePct)}
                      </td>
                    </tr>
                  ))}
                  {servicePerf.unallocatedExpensesPaise > 0 && (
                    <tr className="bg-slate-50/70">
                      <td className="py-3 pr-4 font-medium text-[#64748B]">Unallocated (General Overhead)</td>
                      <td className="py-3 px-3 text-right">—</td>
                      <td className="py-3 px-3 text-right">—</td>
                      <td className="py-3 px-3 text-right tabular-nums text-[#DC2626]">
                        {formatINR(servicePerf.unallocatedExpensesPaise)}
                      </td>
                      <td className="py-3 px-3 text-right">—</td>
                      <td className="py-3 pl-3 text-right">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {servicePerf.rows.map((r) => (
                <div key={r.serviceId} className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#1F2937]">{r.serviceName}</p>
                    <span className="text-xs text-[#64748B] tabular-nums">{r.projectsCount} proj</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[#64748B] block">Revenue</span>
                      <span className="font-semibold tabular-nums">{formatINR(r.revenuePaise)}</span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block">Tagged Exp.</span>
                      <span className="font-semibold tabular-nums">{formatINR(r.taggedExpensesPaise)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[#64748B] block">Est. Profit</span>
                      <span
                        className={`font-semibold tabular-nums ${
                          r.estimatedProfitPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }`}
                      >
                        {formatINR(r.estimatedProfitPaise)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-[#64748B]">No service activity recorded in this date range yet.</p>
        )}
      </section>

      {/* Project Profitability */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">Project Profitability</h2>
            <p className="text-xs text-[#64748B]">
              Based on tagged expenses only · Estimated Profit = Received − Tagged Expenses
            </p>
          </div>
        </div>

        {projectRows.length > 0 ? (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                    <th className="py-2.5 pr-4">Project</th>
                    <th className="py-2.5 px-3">Client</th>
                    <th className="py-2.5 px-3 text-right">Budget</th>
                    <th className="py-2.5 px-3 text-right">Received</th>
                    <th className="py-2.5 px-3 text-right">Outstanding</th>
                    <th className="py-2.5 px-3 text-right">Tagged Exp.</th>
                    <th className="py-2.5 pl-3 text-right">Est. Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {projectRows.map((row) => (
                    <tr key={row.project.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-[#1F2937]">{row.project.title}</p>
                        <p className="text-xs text-[#64748B]">{row.project.status}</p>
                      </td>
                      <td className="py-3 px-3 text-[#64748B]">
                        {clientMap.get(row.project.clientId)?.clientName || 'Client'}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums">{formatINR(row.project.budgetPaise)}</td>
                      <td className="py-3 px-3 text-right tabular-nums text-[#16A34A] font-medium">
                        {formatINR(row.receivedPaise)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums">
                        {row.isOverpaid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                            <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />
                            Overpaid ({formatINR(row.overpaidPaise)})
                          </span>
                        ) : (
                          formatINR(row.outstandingPaise)
                        )}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-[#64748B]">
                        {formatINR(row.taggedExpensesPaise)}
                      </td>
                      <td
                        className={`py-3 pl-3 text-right tabular-nums font-semibold ${
                          row.estimatedProfitPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }`}
                      >
                        {formatINR(row.estimatedProfitPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {projectRows.map((row) => (
                <div key={row.project.id} className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#1F2937]">{row.project.title}</p>
                      <p className="text-xs text-[#64748B]">
                        {clientMap.get(row.project.clientId)?.clientName || 'Client'} · {row.project.status}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[#64748B] block">Received / Budget</span>
                      <span className="font-semibold tabular-nums">
                        {formatINR(row.receivedPaise)} / {formatINR(row.project.budgetPaise)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[#64748B] block">Est. Profit</span>
                      <span
                        className={`font-semibold tabular-nums ${
                          row.estimatedProfitPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }`}
                      >
                        {formatINR(row.estimatedProfitPaise)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-[#64748B]">No projects created yet.</p>
        )}
      </section>
    </div>
  );
};
