import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Info } from 'lucide-react';
import { downloadCsvFile } from '../../lib/csvUtils';
import {
  computeCompanyFinanceSummary,
  computeMomChangePct,
  computeProjectFinancials,
  computeServicePerformance,
  deriveInvoicesWithStatus,
  formatPctOrNA,
  getMonthBounds,
  getPreviousMonthKey,
  isWithinDateRange,
} from '../../lib/financeUtils';
import { getTodayDateString } from '../../lib/goalUtils';
import { formatINR, paiseToRupees } from '../../lib/moneyUtils';
import {
  AccountingBasis,
  BusinessExpense,
  BusinessService,
  Client,
  Invoice,
  OtherIncome,
  Project,
  ProjectPayment,
} from '../../types';

type ReportId =
  | 'monthly_income_statement'
  | 'expense_by_category'
  | 'cash_flow'
  | 'receivables'
  | 'pnl_summary'
  | 'service_profitability'
  | 'client_revenue'
  | 'mom_comparison';

const REPORT_LIST: { id: ReportId; label: string; description: string }[] = [
  {
    id: 'monthly_income_statement',
    label: '1. Monthly Income Statement',
    description: 'Revenue, Collections, Expenses, Net Profit & Profit Margin',
  },
  {
    id: 'expense_by_category',
    label: '2. Expense Breakdown by Category',
    description: 'Active expenses grouped by category with percentage share',
  },
  {
    id: 'cash_flow',
    label: '3. Cash Flow Report',
    description: 'Actual cash inflow vs outflow and net monthly cash flow',
  },
  {
    id: 'receivables',
    label: '4. Client Outstanding / Receivables',
    description: 'Confirmed projects with remaining balance and overdue invoices',
  },
  {
    id: 'pnl_summary',
    label: '5. Profit & Loss Summary',
    description: 'Period P&L totals and month-by-month breakdown',
  },
  {
    id: 'service_profitability',
    label: '6. Service Revenue & Profitability',
    description: 'Revenue vs tagged expenses per service + Unallocated overhead',
  },
  {
    id: 'client_revenue',
    label: '7. Client-wise Revenue Report',
    description: 'Project contract value, cash collected, and balance per client',
  },
  {
    id: 'mom_comparison',
    label: '8. Month-over-Month Comparison',
    description: 'Selected end month vs prior month growth metrics',
  },
];

interface FinanceReportsTabProps {
  basis: AccountingBasis;
  startDate: string;
  endDate: string;
  rangeLabel: string;
  projects: Project[];
  projectPayments: ProjectPayment[];
  otherIncome: OtherIncome[];
  businessExpenses: BusinessExpense[];
  invoices: Invoice[];
  services: BusinessService[];
  clients: Client[];
}

function getMonthsBetween(startDate: string, endDate: string): string[] {
  const startKey = startDate.slice(0, 7);
  const endKey = endDate.slice(0, 7);
  const [sy, sm] = startKey.split('-').map(Number);
  const [ey, em] = endKey.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return [endKey];

  const months: string[] = [];
  let y = sy;
  let m = sm;
  let safety = 0;
  while ((y < ey || (y === ey && m <= em)) && safety < 24) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    safety += 1;
  }
  return months.length > 0 ? months : [endKey];
}

export const FinanceReportsTab: React.FC<FinanceReportsTabProps> = ({
  basis,
  startDate,
  endDate,
  rangeLabel,
  projects,
  projectPayments,
  otherIncome,
  businessExpenses,
  invoices,
  services,
  clients,
}) => {
  const [activeReport, setActiveReport] = useState<ReportId>('monthly_income_statement');
  const todayStr = getTodayDateString();
  const basisLabel = basis === 'cash' ? 'Cash Basis' : 'Accrual Basis';

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const periodSummary = useMemo(
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

  // Months list for multi-month statements
  const monthsInWindow = useMemo(
    () => getMonthsBetween(startDate, endDate),
    [startDate, endDate]
  );

  const monthlyStatementRows = useMemo(() => {
    return monthsInWindow.map((monthKey) => {
      const bounds = getMonthBounds(monthKey);
      const effStart = bounds.start > startDate ? bounds.start : startDate;
      const effEnd = bounds.end < endDate ? bounds.end : endDate;
      const sum = computeCompanyFinanceSummary({
        projects,
        projectPayments,
        otherIncome,
        businessExpenses,
        startDate: effStart,
        endDate: effEnd,
        basis,
      });
      return { monthKey, ...sum };
    });
  }, [monthsInWindow, startDate, endDate, projects, projectPayments, otherIncome, businessExpenses, basis]);

  const expenseCategoryRows = useMemo(() => {
    const map = new Map<string, { count: number; amountPaise: number }>();
    let total = 0;
    for (const exp of businessExpenses) {
      if (exp.isDeleted || !isWithinDateRange(exp.date, startDate, endDate)) continue;
      const cur = map.get(exp.category) ?? { count: 0, amountPaise: 0 };
      cur.count += 1;
      cur.amountPaise += exp.amountPaise;
      total += exp.amountPaise;
      map.set(exp.category, cur);
    }
    return Array.from(map.entries())
      .map(([category, data]) => ({
        category,
        count: data.count,
        amountPaise: data.amountPaise,
        sharePct: total > 0 ? Math.round((data.amountPaise / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amountPaise - a.amountPaise);
  }, [businessExpenses, startDate, endDate]);

  const projectFinancialRows = useMemo(
    () => computeProjectFinancials(projects, projectPayments, businessExpenses),
    [projects, projectPayments, businessExpenses]
  );

  const receivablesRows = useMemo(
    () => projectFinancialRows.filter((r) => r.outstandingPaise > 0).sort((a, b) => b.outstandingPaise - a.outstandingPaise),
    [projectFinancialRows]
  );

  const overdueInvoices = useMemo(
    () =>
      deriveInvoicesWithStatus(invoices, projectPayments, todayStr).filter(
        (d) => d.status === 'Overdue'
      ),
    [invoices, projectPayments, todayStr]
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

  const clientRevenueRows = useMemo(() => {
    const map = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        projectsCount: number;
        totalProjectValuePaise: number;
        collectedCashPaise: number;
        outstandingPaise: number;
        overpaidPaise: number;
      }
    >();

    for (const c of clients) {
      map.set(c.id, {
        clientId: c.id,
        clientName: c.clientName,
        projectsCount: 0,
        totalProjectValuePaise: 0,
        collectedCashPaise: 0,
        outstandingPaise: 0,
        overpaidPaise: 0,
      });
    }

    for (const pf of projectFinancialRows) {
      const cId = pf.project.clientId;
      if (!map.has(cId)) {
        map.set(cId, {
          clientId: cId,
          clientName: 'Unknown Client',
          projectsCount: 0,
          totalProjectValuePaise: 0,
          collectedCashPaise: 0,
          outstandingPaise: 0,
          overpaidPaise: 0,
        });
      }
      const entry = map.get(cId)!;
      entry.projectsCount += 1;
      if (pf.project.status !== 'Cancelled' && pf.project.status !== 'Planning') {
        entry.totalProjectValuePaise += pf.project.budgetPaise;
      }
      entry.outstandingPaise += pf.outstandingPaise;
      entry.overpaidPaise += pf.overpaidPaise;
    }

    for (const p of projectPayments) {
      if (p.isDeleted || !isWithinDateRange(p.date, startDate, endDate)) continue;
      const entry = map.get(p.clientId);
      if (entry) entry.collectedCashPaise += p.amountPaise;
    }
    for (const o of otherIncome) {
      if (o.isDeleted || !o.clientId || !isWithinDateRange(o.date, startDate, endDate)) continue;
      const entry = map.get(o.clientId);
      if (entry) entry.collectedCashPaise += o.amountPaise;
    }

    return Array.from(map.values())
      .filter(
        (r) =>
          r.projectsCount > 0 ||
          r.collectedCashPaise > 0 ||
          r.outstandingPaise > 0
      )
      .sort((a, b) => b.collectedCashPaise - a.collectedCashPaise);
  }, [clients, projectFinancialRows, projectPayments, otherIncome, startDate, endDate]);

  const momComparison = useMemo(() => {
    const refMonth = endDate.slice(0, 7);
    const prevMonth = getPreviousMonthKey(refMonth);
    const refBounds = getMonthBounds(refMonth);
    const prevBounds = getMonthBounds(prevMonth);

    const cur = computeCompanyFinanceSummary({
      projects,
      projectPayments,
      otherIncome,
      businessExpenses,
      startDate: refBounds.start,
      endDate: refBounds.end,
      basis,
    });
    const prev = computeCompanyFinanceSummary({
      projects,
      projectPayments,
      otherIncome,
      businessExpenses,
      startDate: prevBounds.start,
      endDate: prevBounds.end,
      basis,
    });

    return {
      refMonth,
      prevMonth,
      rows: [
        {
          metric: 'Collections',
          currentPaise: cur.collectionsPaise,
          previousPaise: prev.collectionsPaise,
          changePct: computeMomChangePct(cur.collectionsPaise, prev.collectionsPaise),
        },
        {
          metric: `Revenue (${basisLabel})`,
          currentPaise: cur.revenuePaise,
          previousPaise: prev.revenuePaise,
          changePct: computeMomChangePct(cur.revenuePaise, prev.revenuePaise),
        },
        {
          metric: 'Expenses',
          currentPaise: cur.expensesPaise,
          previousPaise: prev.expensesPaise,
          changePct: computeMomChangePct(cur.expensesPaise, prev.expensesPaise),
        },
        {
          metric: 'Net Profit',
          currentPaise: cur.netProfitPaise,
          previousPaise: prev.netProfitPaise,
          changePct: computeMomChangePct(cur.netProfitPaise, prev.netProfitPaise),
        },
      ],
    };
  }, [endDate, projects, projectPayments, otherIncome, businessExpenses, basis, basisLabel]);

  const assumptionText = useMemo(() => {
    switch (activeReport) {
      case 'monthly_income_statement':
      case 'pnl_summary':
        return basis === 'cash'
          ? 'Cash Basis: Revenue equals Collections (projectPayments + otherIncome) in window.'
          : 'Accrual Basis: Revenue equals budgets of confirmed projects (not Cancelled/Planning) started in window.';
      case 'service_profitability':
        return 'Based on tagged expenses only; untagged expenses are reported under Unallocated Overhead.';
      case 'receivables':
        return 'Confirmed projects exclude Planning & Cancelled. Overpaid project balances are excluded from total receivables.';
      case 'mom_comparison':
        return `Compares ${momComparison.refMonth} vs ${momComparison.prevMonth}. Previous value of ₹0 yields N/A growth %.`;
      default:
        return 'Soft-deleted records are excluded from all report totals.';
    }
  }, [activeReport, basis, momComparison.refMonth, momComparison.prevMonth]);

  const handleExportCurrentReportCsv = () => {
    const suffix = `${startDate}_to_${endDate}`;
    switch (activeReport) {
      case 'monthly_income_statement':
        downloadCsvFile(
          `goalx-income-statement-${suffix}.csv`,
          ['Month', 'Basis', 'Collections (INR)', 'Revenue (INR)', 'Expenses (INR)', 'Net Profit (INR)', 'Margin %'],
          monthlyStatementRows.map((r) => [
            r.monthKey,
            basisLabel,
            paiseToRupees(r.collectionsPaise),
            paiseToRupees(r.revenuePaise),
            paiseToRupees(r.expensesPaise),
            paiseToRupees(r.netProfitPaise),
            formatPctOrNA(r.profitMarginPct),
          ])
        );
        break;
      case 'expense_by_category':
        downloadCsvFile(
          `goalx-expense-categories-${suffix}.csv`,
          ['Category', 'Entries', 'Total Spend (INR)', 'Share %'],
          expenseCategoryRows.map((r) => [r.category, r.count, paiseToRupees(r.amountPaise), `${r.sharePct}%`])
        );
        break;
      case 'cash_flow':
        downloadCsvFile(
          `goalx-cash-flow-${suffix}.csv`,
          ['Month', 'Project Cash In (INR)', 'Other Cash In (INR)', 'Total Cash In (INR)', 'Cash Out Expenses (INR)', 'Net Cash Flow (INR)'],
          monthlyStatementRows.map((r) => [
            r.monthKey,
            paiseToRupees(r.projectCollectionsPaise),
            paiseToRupees(r.otherIncomePaise),
            paiseToRupees(r.collectionsPaise),
            paiseToRupees(r.expensesPaise),
            paiseToRupees(r.cashFlowPaise),
          ])
        );
        break;
      case 'receivables':
        downloadCsvFile(
          `goalx-receivables-${todayStr}.csv`,
          ['Project', 'Client', 'Status', 'Budget (INR)', 'Received (INR)', 'Outstanding Balance (INR)'],
          receivablesRows.map((r) => [
            r.project.title,
            clientMap.get(r.project.clientId)?.clientName || 'Client',
            r.project.status,
            paiseToRupees(r.project.budgetPaise),
            paiseToRupees(r.receivedPaise),
            paiseToRupees(r.outstandingPaise),
          ])
        );
        break;
      case 'pnl_summary':
        downloadCsvFile(
          `goalx-pnl-summary-${suffix}.csv`,
          ['Metric / Month', 'Revenue (INR)', 'Expenses (INR)', 'Net Profit (INR)', 'Profit Margin'],
          [
            ...monthlyStatementRows.map((r) => [
              r.monthKey,
              paiseToRupees(r.revenuePaise),
              paiseToRupees(r.expensesPaise),
              paiseToRupees(r.netProfitPaise),
              formatPctOrNA(r.profitMarginPct),
            ]),
            [
              `TOTAL (${rangeLabel})`,
              paiseToRupees(periodSummary.revenuePaise),
              paiseToRupees(periodSummary.expensesPaise),
              paiseToRupees(periodSummary.netProfitPaise),
              formatPctOrNA(periodSummary.profitMarginPct),
            ],
          ]
        );
        break;
      case 'service_profitability':
        downloadCsvFile(
          `goalx-service-profitability-${suffix}.csv`,
          ['Service', 'Projects', 'Revenue (INR)', 'Tagged Expenses (INR)', 'Est. Profit (INR)', 'Revenue Share'],
          [
            ...servicePerf.rows.map((r) => [
              r.serviceName,
              r.projectsCount,
              paiseToRupees(r.revenuePaise),
              paiseToRupees(r.taggedExpensesPaise),
              paiseToRupees(r.estimatedProfitPaise),
              formatPctOrNA(r.profitSharePct),
            ]),
            [
              'Unallocated (General Overhead)',
              0,
              0,
              paiseToRupees(servicePerf.unallocatedExpensesPaise),
              -paiseToRupees(servicePerf.unallocatedExpensesPaise),
              '—',
            ],
          ]
        );
        break;
      case 'client_revenue':
        downloadCsvFile(
          `goalx-client-revenue-${suffix}.csv`,
          ['Client', 'Projects', 'Confirmed Project Value (INR)', 'Cash Collected in Period (INR)', 'Current Outstanding (INR)'],
          clientRevenueRows.map((r) => [
            r.clientName,
            r.projectsCount,
            paiseToRupees(r.totalProjectValuePaise),
            paiseToRupees(r.collectedCashPaise),
            paiseToRupees(r.outstandingPaise),
          ])
        );
        break;
      case 'mom_comparison':
        downloadCsvFile(
          `goalx-mom-comparison-${momComparison.refMonth}.csv`,
          ['Metric', momComparison.prevMonth, momComparison.refMonth, 'MoM Change %'],
          momComparison.rows.map((r) => [
            r.metric,
            paiseToRupees(r.previousPaise),
            paiseToRupees(r.currentPaise),
            formatPctOrNA(r.changePct, true),
          ])
        );
        break;
    }
  };

  const activeMeta = REPORT_LIST.find((r) => r.id === activeReport)!;

  return (
    <div className="space-y-6">
      {/* Report Picker Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {REPORT_LIST.map((r) => {
          const selected = r.id === activeReport;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setActiveReport(r.id)}
              className={`p-3.5 rounded-2xl border text-left transition-colors cursor-pointer ${
                selected
                  ? 'bg-red-50/70 border-[#DC2626] text-[#1F2937]'
                  : 'bg-white border-[#E2E8F0] hover:border-slate-300 text-[#1F2937]'
              }`}
            >
              <p className={`text-xs font-semibold ${selected ? 'text-[#DC2626]' : 'text-[#1F2937]'}`}>
                {r.label}
              </p>
              <p className="mt-1 text-[11px] text-[#64748B] line-clamp-2">{r.description}</p>
            </button>
          );
        })}
      </div>

      {/* Report Header & Basis/Assumption Banner */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-[#DC2626] flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">{activeMeta.label}</h2>
              <p className="text-xs text-[#64748B] tabular-nums">
                Window: {rangeLabel} ({startDate} to {endDate}) · Accounting Basis:{' '}
                <strong className="text-[#1F2937]">{basisLabel}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportCurrentReportCsv}
            className="min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Export Report CSV</span>
          </button>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-[#E2E8F0] flex items-start gap-2 text-xs text-[#64748B]">
          <Info className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
          <span>{assumptionText}</span>
        </div>

        {/* 1. Monthly Income Statement */}
        {activeReport === 'monthly_income_statement' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                  <th className="py-2.5 pr-4">Month</th>
                  <th className="py-2.5 px-3 text-right">Collections</th>
                  <th className="py-2.5 px-3 text-right">Revenue ({basisLabel})</th>
                  <th className="py-2.5 px-3 text-right">Expenses</th>
                  <th className="py-2.5 px-3 text-right">Net Profit</th>
                  <th className="py-2.5 pl-3 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {monthlyStatementRows.map((row) => (
                  <tr key={row.monthKey}>
                    <td className="py-3 pr-4 font-medium tabular-nums">{row.monthKey}</td>
                    <td className="py-3 px-3 text-right tabular-nums">{formatINR(row.collectionsPaise)}</td>
                    <td className="py-3 px-3 text-right tabular-nums font-semibold">
                      {formatINR(row.revenuePaise)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#DC2626]">
                      {formatINR(row.expensesPaise)}
                    </td>
                    <td
                      className={`py-3 px-3 text-right tabular-nums font-semibold ${
                        row.netProfitPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                      }`}
                    >
                      {formatINR(row.netProfitPaise)}
                    </td>
                    <td className="py-3 pl-3 text-right tabular-nums">
                      {formatPctOrNA(row.profitMarginPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. Expense Breakdown by Category */}
        {activeReport === 'expense_by_category' && (
          <div className="overflow-x-auto">
            {expenseCategoryRows.length === 0 ? (
              <p className="text-sm text-[#64748B]">No expenses in this period.</p>
            ) : (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                    <th className="py-2.5 pr-4">Category</th>
                    <th className="py-2.5 px-3 text-right">Entries</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 pl-3 text-right">% Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {expenseCategoryRows.map((row) => (
                    <tr key={row.category}>
                      <td className="py-3 pr-4 font-medium text-[#1F2937]">{row.category}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{row.count}</td>
                      <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#DC2626]">
                        {formatINR(row.amountPaise)}
                      </td>
                      <td className="py-3 pl-3 text-right tabular-nums">{row.sharePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 3. Cash Flow Report */}
        {activeReport === 'cash_flow' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                  <th className="py-2.5 pr-4">Month</th>
                  <th className="py-2.5 px-3 text-right">Project Cash In</th>
                  <th className="py-2.5 px-3 text-right">Other Cash In</th>
                  <th className="py-2.5 px-3 text-right">Total Cash In</th>
                  <th className="py-2.5 px-3 text-right">Cash Paid Out</th>
                  <th className="py-2.5 pl-3 text-right">Net Cash Flow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {monthlyStatementRows.map((row) => (
                  <tr key={row.monthKey}>
                    <td className="py-3 pr-4 font-medium tabular-nums">{row.monthKey}</td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {formatINR(row.projectCollectionsPaise)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {formatINR(row.otherIncomePaise)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#16A34A] font-medium">
                      {formatINR(row.collectionsPaise)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#DC2626]">
                      {formatINR(row.expensesPaise)}
                    </td>
                    <td
                      className={`py-3 pl-3 text-right tabular-nums font-bold ${
                        row.cashFlowPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                      }`}
                    >
                      {formatINR(row.cashFlowPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. Client Outstanding / Receivables */}
        {activeReport === 'receivables' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-[#1F2937] mb-2">
                Projects with Outstanding Balance ({formatINR(periodSummary.totalOutstandingPaise)})
              </h3>
              {receivablesRows.length === 0 ? (
                <p className="text-xs text-[#64748B]">All confirmed projects are fully collected.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                        <th className="py-2.5 pr-4">Project</th>
                        <th className="py-2.5 px-3">Client</th>
                        <th className="py-2.5 px-3 text-right">Budget</th>
                        <th className="py-2.5 px-3 text-right">Received</th>
                        <th className="py-2.5 pl-3 text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {receivablesRows.map((r) => (
                        <tr key={r.project.id}>
                          <td className="py-2.5 pr-4 font-medium text-[#1F2937]">{r.project.title}</td>
                          <td className="py-2.5 px-3 text-[#64748B]">
                            {clientMap.get(r.project.clientId)?.clientName || 'Client'}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            {formatINR(r.project.budgetPaise)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-[#16A34A]">
                            {formatINR(r.receivedPaise)}
                          </td>
                          <td className="py-2.5 pl-3 text-right tabular-nums font-bold text-[#F59E0B]">
                            {formatINR(r.outstandingPaise)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {overdueInvoices.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-[#DC2626] mb-2">
                  Overdue Invoices ({overdueInvoices.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                        <th className="py-2 pr-4">Invoice #</th>
                        <th className="py-2 px-3">Client / Project</th>
                        <th className="py-2 px-3">Due Date</th>
                        <th className="py-2 px-3 text-right">Days Overdue</th>
                        <th className="py-2 pl-3 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {overdueInvoices.map((d) => (
                        <tr key={d.invoice.id}>
                          <td className="py-2.5 pr-4 font-semibold tabular-nums">
                            {d.invoice.invoiceNumber}
                          </td>
                          <td className="py-2.5 px-3 text-[#64748B]">
                            {clientMap.get(d.invoice.clientId)?.clientName || 'Client'}
                            {d.invoice.projectId && projectMap.get(d.invoice.projectId)
                              ? ` · ${projectMap.get(d.invoice.projectId)?.title}`
                              : ''}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums text-[#DC2626]">
                            {d.invoice.dueDate}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-[#DC2626]">
                            {d.daysOverdue}d
                          </td>
                          <td className="py-2.5 pl-3 text-right tabular-nums font-bold">
                            {formatINR(d.balancePaise)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. Profit & Loss Summary */}
        {activeReport === 'pnl_summary' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <p className="text-xs text-[#64748B]">Total Revenue</p>
                <p className="mt-1 text-base font-bold tabular-nums">{formatINR(periodSummary.revenuePaise)}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <p className="text-xs text-[#64748B]">Total Expenses</p>
                <p className="mt-1 text-base font-bold text-[#DC2626] tabular-nums">
                  {formatINR(periodSummary.expensesPaise)}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <p className="text-xs text-[#64748B]">Net Profit</p>
                <p
                  className={`mt-1 text-base font-bold tabular-nums ${
                    periodSummary.netProfitPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                  }`}
                >
                  {formatINR(periodSummary.netProfitPaise)}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <p className="text-xs text-[#64748B]">Margin</p>
                <p className="mt-1 text-base font-bold tabular-nums">
                  {formatPctOrNA(periodSummary.profitMarginPct)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                    <th className="py-2.5 pr-4">Month</th>
                    <th className="py-2.5 px-3 text-right">Revenue</th>
                    <th className="py-2.5 px-3 text-right">Expenses</th>
                    <th className="py-2.5 px-3 text-right">Net Profit</th>
                    <th className="py-2.5 pl-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {monthlyStatementRows.map((row) => (
                    <tr key={row.monthKey}>
                      <td className="py-2.5 pr-4 font-medium tabular-nums">{row.monthKey}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{formatINR(row.revenuePaise)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[#DC2626]">
                        {formatINR(row.expensesPaise)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right tabular-nums font-semibold ${
                          row.netProfitPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }`}
                      >
                        {formatINR(row.netProfitPaise)}
                      </td>
                      <td className="py-2.5 pl-3 text-right tabular-nums">
                        {formatPctOrNA(row.profitMarginPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. Service-wise Revenue & Profitability */}
        {activeReport === 'service_profitability' && (
          <div className="overflow-x-auto">
            {servicePerf.rows.length === 0 && servicePerf.unallocatedExpensesPaise === 0 ? (
              <p className="text-sm text-[#64748B]">No service activity in this window.</p>
            ) : (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                    <th className="py-2.5 pr-4">Service</th>
                    <th className="py-2.5 px-3 text-right">Projects</th>
                    <th className="py-2.5 px-3 text-right">Revenue</th>
                    <th className="py-2.5 px-3 text-right">Tagged Expenses</th>
                    <th className="py-2.5 px-3 text-right">Est. Profit</th>
                    <th className="py-2.5 pl-3 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {servicePerf.rows.map((r) => (
                    <tr key={r.serviceId}>
                      <td className="py-3 pr-4 font-medium">{r.serviceName}</td>
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
                      <td className="py-3 pl-3 text-right tabular-nums">
                        {formatPctOrNA(r.profitSharePct)}
                      </td>
                    </tr>
                  ))}
                  {servicePerf.unallocatedExpensesPaise > 0 && (
                    <tr className="bg-slate-50">
                      <td className="py-3 pr-4 font-medium text-[#64748B]">Unallocated Overhead</td>
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
            )}
          </div>
        )}

        {/* 7. Client-wise Revenue Report */}
        {activeReport === 'client_revenue' && (
          <div className="overflow-x-auto">
            {clientRevenueRows.length === 0 ? (
              <p className="text-sm text-[#64748B]">No client financial activity in this period.</p>
            ) : (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                    <th className="py-2.5 pr-4">Client</th>
                    <th className="py-2.5 px-3 text-right">Projects</th>
                    <th className="py-2.5 px-3 text-right">Confirmed Value</th>
                    <th className="py-2.5 px-3 text-right">Cash Collected ({rangeLabel})</th>
                    <th className="py-2.5 pl-3 text-right">Current Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {clientRevenueRows.map((r) => (
                    <tr key={r.clientId}>
                      <td className="py-3 pr-4 font-medium text-[#1F2937]">{r.clientName}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{r.projectsCount}</td>
                      <td className="py-3 px-3 text-right tabular-nums">
                        {formatINR(r.totalProjectValuePaise)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#16A34A]">
                        {formatINR(r.collectedCashPaise)}
                      </td>
                      <td className="py-3 pl-3 text-right tabular-nums text-[#F59E0B] font-medium">
                        {formatINR(r.outstandingPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 8. Month-over-Month Comparison */}
        {activeReport === 'mom_comparison' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                  <th className="py-2.5 pr-4">Metric</th>
                  <th className="py-2.5 px-3 text-right">{momComparison.prevMonth}</th>
                  <th className="py-2.5 px-3 text-right">{momComparison.refMonth}</th>
                  <th className="py-2.5 pl-3 text-right">MoM Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {momComparison.rows.map((r) => (
                  <tr key={r.metric}>
                    <td className="py-3 pr-4 font-medium text-[#1F2937]">{r.metric}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#64748B]">
                      {formatINR(r.previousPaise)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums font-semibold">
                      {formatINR(r.currentPaise)}
                    </td>
                    <td
                      className={`py-3 pl-3 text-right tabular-nums font-semibold ${
                        r.changePct === null
                          ? 'text-[#64748B]'
                          : r.changePct >= 0
                            ? 'text-[#16A34A]'
                            : 'text-[#DC2626]'
                      }`}
                    >
                      {formatPctOrNA(r.changePct, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
