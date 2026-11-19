import {
  AccountingBasis,
  Budget,
  BusinessExpense,
  BusinessService,
  Client,
  DerivedInvoiceStatus,
  Invoice,
  Lead,
  LeadSource,
  OtherIncome,
  Project,
  ProjectPayment,
  TeamMember,
  TeamMemberPrivate,
} from '../types';
import { DEFAULT_COMMISSION_PCT, LEAD_SOURCES } from './constants';
import { getTodayDateString } from './goalUtils';

export function isConfirmedProject(project: Project): boolean {
  return project.status !== 'Cancelled' && project.status !== 'Planning';
}

export function isWithinDateRange(date: string, start: string, end: string): boolean {
  if (!date) return false;
  return date >= start && date <= end;
}

export interface CoreFinanceSummary {
  basis: AccountingBasis;
  collectionsPaise: number;
  projectCollectionsPaise: number;
  otherIncomePaise: number;
  revenuePaise: number;
  expensesPaise: number;
  netProfitPaise: number;
  profitMarginPct: number | null; // null => display "N/A"
  cashFlowPaise: number;
  totalOutstandingPaise: number;
  overpaidProjectsCount: number;
  confirmedProjectCount: number;
  activeProjectCount: number;
}

export interface ProjectFinancialRow {
  project: Project;
  receivedPaise: number;
  outstandingPaise: number; // clamped >= 0
  overpaidPaise: number; // > 0 when received > budget
  isOverpaid: boolean;
  taggedExpensesPaise: number;
  estimatedProfitPaise: number;
}

/**
 * Computes per-project financials across all non-deleted payments and expenses.
 * Confirmed projects exclude Cancelled and Planning.
 */
export function computeProjectFinancials(
  projects: Project[],
  projectPayments: ProjectPayment[],
  businessExpenses: BusinessExpense[]
): ProjectFinancialRow[] {
  const receivedByProject = new Map<string, number>();
  for (const p of projectPayments) {
    if (p.isDeleted) continue;
    receivedByProject.set(p.projectId, (receivedByProject.get(p.projectId) ?? 0) + p.amountPaise);
  }

  const expensesByProject = new Map<string, number>();
  for (const exp of businessExpenses) {
    if (exp.isDeleted || !exp.projectId) continue;
    expensesByProject.set(exp.projectId, (expensesByProject.get(exp.projectId) ?? 0) + exp.amountPaise);
  }

  return projects.map((project) => {
    const receivedPaise = receivedByProject.get(project.id) ?? 0;
    const confirmed = isConfirmedProject(project);
    const diff = confirmed ? project.budgetPaise - receivedPaise : 0;
    const outstandingPaise = confirmed ? Math.max(0, diff) : 0;
    const overpaidPaise = receivedPaise > project.budgetPaise && project.budgetPaise > 0
      ? receivedPaise - project.budgetPaise
      : 0;
    const taggedExpensesPaise = expensesByProject.get(project.id) ?? 0;
    const estimatedProfitPaise = receivedPaise - taggedExpensesPaise;

    return {
      project,
      receivedPaise,
      outstandingPaise,
      overpaidPaise,
      isOverpaid: overpaidPaise > 0,
      taggedExpensesPaise,
      estimatedProfitPaise,
    };
  });
}

/**
 * Single shared calculation function used everywhere for company finance KPIs.
 */
export function computeCompanyFinanceSummary(params: {
  projects: Project[];
  projectPayments: ProjectPayment[];
  otherIncome: OtherIncome[];
  businessExpenses: BusinessExpense[];
  startDate: string;
  endDate: string;
  basis?: AccountingBasis;
}): CoreFinanceSummary {
  const {
    projects,
    projectPayments,
    otherIncome,
    businessExpenses,
    startDate,
    endDate,
    basis = 'cash',
  } = params;

  const projectCollectionsPaise = projectPayments
    .filter((p) => !p.isDeleted && isWithinDateRange(p.date, startDate, endDate))
    .reduce((sum, p) => sum + p.amountPaise, 0);

  const otherIncomePaise = otherIncome
    .filter((i) => !i.isDeleted && isWithinDateRange(i.date, startDate, endDate))
    .reduce((sum, i) => sum + i.amountPaise, 0);

  const collectionsPaise = projectCollectionsPaise + otherIncomePaise;

  const accrualRevenuePaise = projects
    .filter((proj) => isConfirmedProject(proj) && isWithinDateRange(proj.startDate, startDate, endDate))
    .reduce((sum, proj) => sum + proj.budgetPaise, 0);

  const revenuePaise = basis === 'cash' ? collectionsPaise : accrualRevenuePaise;

  const expensesPaise = businessExpenses
    .filter((exp) => !exp.isDeleted && isWithinDateRange(exp.date, startDate, endDate))
    .reduce((sum, exp) => sum + exp.amountPaise, 0);

  const netProfitPaise = revenuePaise - expensesPaise;
  const profitMarginPct =
    revenuePaise > 0 ? Math.round((netProfitPaise / revenuePaise) * 1000) / 10 : null;
  const cashFlowPaise = collectionsPaise - expensesPaise;

  const projectRows = computeProjectFinancials(projects, projectPayments, businessExpenses);
  const totalOutstandingPaise = projectRows.reduce((sum, r) => sum + r.outstandingPaise, 0);
  const overpaidProjectsCount = projectRows.filter((r) => r.isOverpaid).length;
  const confirmedProjectCount = projects.filter(isConfirmedProject).length;
  const activeProjectCount = projects.filter((p) => p.status === 'In Progress').length;

  return {
    basis,
    collectionsPaise,
    projectCollectionsPaise,
    otherIncomePaise,
    revenuePaise,
    expensesPaise,
    netProfitPaise,
    profitMarginPct,
    cashFlowPaise,
    totalOutstandingPaise,
    overpaidProjectsCount,
    confirmedProjectCount,
    activeProjectCount,
  };
}

export interface DerivedInvoiceInfo {
  invoice: Invoice;
  paidPaise: number;
  balancePaise: number;
  status: DerivedInvoiceStatus;
  daysOverdue: number;
}

function diffDays(laterDate: string, earlierDate: string): number {
  const [y1, m1, d1] = laterDate.split('-').map(Number);
  const [y2, m2, d2] = earlierDate.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.round((t1 - t2) / (1000 * 60 * 60 * 24)));
}

/**
 * Derives invoice paid amount, remaining balance, and status dynamically from projectPayments.
 * Never persisted in Firestore.
 * Matching order:
 * 1) Direct match via active projectPayments.invoiceNumber === invoice.invoiceNumber
 * 2) Chronological project-level allocation of untagged payments for the same projectId
 */
export function deriveInvoicesWithStatus(
  invoices: Invoice[],
  projectPayments: ProjectPayment[],
  todayStr = getTodayDateString()
): DerivedInvoiceInfo[] {
  const activePayments = projectPayments.filter((p) => !p.isDeleted);

  const directPaidByInvNum = new Map<string, number>();
  const knownInvNumbers = new Set(invoices.map((inv) => inv.invoiceNumber.trim().toLowerCase()));
  const unallocatedByProject = new Map<string, number>();

  for (const p of activePayments) {
    const invKey = (p.invoiceNumber || '').trim().toLowerCase();
    if (invKey && knownInvNumbers.has(invKey)) {
      directPaidByInvNum.set(invKey, (directPaidByInvNum.get(invKey) ?? 0) + p.amountPaise);
    } else if (p.projectId) {
      unallocatedByProject.set(
        p.projectId,
        (unallocatedByProject.get(p.projectId) ?? 0) + p.amountPaise
      );
    }
  }

  const sortedChrono = [...invoices].sort((a, b) => {
    const issueCmp = a.issueDate.localeCompare(b.issueDate);
    if (issueCmp !== 0) return issueCmp;
    return a.invoiceNumber.localeCompare(b.invoiceNumber);
  });

  const paidByInvoiceId = new Map<string, number>();

  for (const inv of sortedChrono) {
    const invKey = inv.invoiceNumber.trim().toLowerCase();
    let paid = directPaidByInvNum.get(invKey) ?? 0;

    if (paid < inv.amountPaise && inv.projectId) {
      const pool = unallocatedByProject.get(inv.projectId) ?? 0;
      if (pool > 0) {
        const needed = inv.amountPaise - paid;
        const allocated = Math.min(pool, needed);
        paid += allocated;
        unallocatedByProject.set(inv.projectId, pool - allocated);
      }
    }
    paidByInvoiceId.set(inv.id, paid);
  }

  return invoices.map((invoice) => {
    const paidPaise = paidByInvoiceId.get(invoice.id) ?? 0;
    const balancePaise = Math.max(0, invoice.amountPaise - paidPaise);
    let status: DerivedInvoiceStatus = 'Unpaid';
    let daysOverdue = 0;

    if (paidPaise >= invoice.amountPaise) {
      status = 'Paid';
    } else if (todayStr > invoice.dueDate) {
      status = 'Overdue';
      daysOverdue = diffDays(todayStr, invoice.dueDate);
    } else if (paidPaise > 0) {
      status = 'Partially Paid';
    }

    return {
      invoice,
      paidPaise,
      balancePaise,
      status,
      daysOverdue,
    };
  });
}

export function suggestNextInvoiceNumber(invoices: Invoice[], todayStr = getTodayDateString()): string {
  const year = todayStr.slice(0, 4);
  const prefix = `INV-${year}-`;
  let maxSeq = 0;
  for (const inv of invoices) {
    if (inv.invoiceNumber.startsWith(prefix)) {
      const numPart = parseInt(inv.invoiceNumber.slice(prefix.length), 10);
      if (Number.isFinite(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

export function isDuplicateInvoiceNumber(
  invoices: Invoice[],
  candidate: string,
  excludeInvoiceId?: string
): boolean {
  const norm = candidate.trim().toLowerCase();
  if (!norm) return false;
  return invoices.some(
    (inv) => inv.id !== excludeInvoiceId && inv.invoiceNumber.trim().toLowerCase() === norm
  );
}

/**
 * Calculates member commission for a specific yyyy-MM month.
 * Rule: configurable % (member custom rate -> global defaultCommissionPct -> 5%)
 * on collections received in that month from Completed projects assigned to the member.
 */
export function calculateMemberCommission(params: {
  member: TeamMember;
  memberPrivate: TeamMemberPrivate | undefined;
  projects: Project[];
  projectPayments: ProjectPayment[];
  month: string; // yyyy-MM
  defaultCommissionPct?: number;
}): {
  eligibleCollectionsPaise: number;
  commissionPctUsed: number;
  commissionPaise: number;
} {
  const {
    member,
    memberPrivate,
    projects,
    projectPayments,
    month,
    defaultCommissionPct = DEFAULT_COMMISSION_PCT,
  } = params;

  const pctUsed =
    memberPrivate?.commissionRatePct !== null && memberPrivate?.commissionRatePct !== undefined
      ? memberPrivate.commissionRatePct
      : defaultCommissionPct;

  const completedAssignedIds = new Set(
    projects
      .filter((p) => p.assignedMemberId === member.id && p.status === 'Completed')
      .map((p) => p.id)
  );

  const eligibleCollectionsPaise = projectPayments
    .filter(
      (pay) =>
        !pay.isDeleted &&
        pay.date.startsWith(month) &&
        completedAssignedIds.has(pay.projectId)
    )
    .reduce((sum, pay) => sum + pay.amountPaise, 0);

  const commissionPaise = Math.round((eligibleCollectionsPaise * pctUsed) / 100);
  return {
    eligibleCollectionsPaise,
    commissionPctUsed: pctUsed,
    commissionPaise,
  };
}

export function calculateNetSalaryPaise(
  baseSalaryPaise: number,
  commissionPaise: number,
  incentivePaise: number,
  deductionsPaise: number
): number {
  return Math.max(0, baseSalaryPaise + commissionPaise + incentivePaise - deductionsPaise);
}

export type BudgetHealthStatus = 'healthy' | 'warning' | 'exceeded';

export interface BudgetUtilizationRow {
  budget: Budget;
  spentPaise: number;
  remainingPaise: number;
  utilizationPct: number;
  health: BudgetHealthStatus;
}

export function computeBudgetSpentPaise(
  budget: Budget,
  businessExpenses: BusinessExpense[],
  services: BusinessService[]
): number {
  const monthExpenses = businessExpenses.filter(
    (exp) => !exp.isDeleted && exp.date.startsWith(budget.month)
  );

  switch (budget.budgetType) {
    case 'Monthly Overall':
      return monthExpenses.reduce((s, e) => s + e.amountPaise, 0);
    case 'Category':
      return monthExpenses
        .filter((e) => e.category.toLowerCase() === budget.target.trim().toLowerCase())
        .reduce((s, e) => s + e.amountPaise, 0);
    case 'Service': {
      const targetLower = budget.target.trim().toLowerCase();
      const matchedSvc = services.find(
        (svc) => svc.id === budget.target || svc.name.toLowerCase() === targetLower
      );
      return monthExpenses
        .filter((e) => e.serviceId && (e.serviceId === budget.target || (matchedSvc && e.serviceId === matchedSvc.id)))
        .reduce((s, e) => s + e.amountPaise, 0);
    }
    case 'Marketing':
      return monthExpenses
        .filter((e) => e.category === 'Marketing & Ads')
        .reduce((s, e) => s + e.amountPaise, 0);
    case 'Team': {
      const targetLower = budget.target.trim().toLowerCase();
      return monthExpenses
        .filter((e) => {
          const isTeamCat =
            e.category === 'Employee Salaries' || e.category === 'Freelancer Payouts';
          if (!isTeamCat) return false;
          if (!targetLower || targetLower === 'all team' || targetLower === 'team') return true;
          return (
            e.paidBy.toLowerCase().includes(targetLower) ||
            e.title.toLowerCase().includes(targetLower)
          );
        })
        .reduce((s, e) => s + e.amountPaise, 0);
    }
  }
}

export function computeBudgetUtilization(
  budgets: Budget[],
  businessExpenses: BusinessExpense[],
  services: BusinessService[]
): BudgetUtilizationRow[] {
  return budgets.map((budget) => {
    const spentPaise = computeBudgetSpentPaise(budget, businessExpenses, services);
    const utilizationPct =
      budget.limitPaise > 0 ? Math.round((spentPaise / budget.limitPaise) * 1000) / 10 : 0;
    let health: BudgetHealthStatus = 'healthy';
    if (utilizationPct > 100) {
      health = 'exceeded';
    } else if (utilizationPct >= 80) {
      health = 'warning';
    }
    return {
      budget,
      spentPaise,
      remainingPaise: budget.limitPaise - spentPaise,
      utilizationPct,
      health,
    };
  });
}

export interface ServicePerformanceRow {
  serviceId: string;
  serviceName: string;
  projectsCount: number;
  revenuePaise: number;
  taggedExpensesPaise: number;
  estimatedProfitPaise: number;
  profitSharePct: number | null;
}

export function computeServicePerformance(params: {
  services: BusinessService[];
  projects: Project[];
  projectPayments: ProjectPayment[];
  businessExpenses: BusinessExpense[];
  startDate: string;
  endDate: string;
  basis?: AccountingBasis;
}): {
  rows: ServicePerformanceRow[];
  unallocatedExpensesPaise: number;
  totalRevenuePaise: number;
} {
  const {
    services,
    projects,
    projectPayments,
    businessExpenses,
    startDate,
    endDate,
    basis = 'cash',
  } = params;

  const svcMap = new Map<string, { name: string; projects: number; rev: number; exp: number }>();
  for (const svc of services) {
    svcMap.set(svc.id, { name: svc.name, projects: 0, rev: 0, exp: 0 });
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const svcByName = new Map(services.map((s) => [s.name.toLowerCase(), s.id]));

  const resolveServiceId = (proj: Project): string => {
    if (proj.serviceId && svcMap.has(proj.serviceId)) return proj.serviceId;
    if (proj.serviceCategory) {
      const byName = svcByName.get(proj.serviceCategory.toLowerCase());
      if (byName) return byName;
    }
    return '__unassigned_service__';
  };

  for (const proj of projects) {
    const key = resolveServiceId(proj);
    if (!svcMap.has(key)) {
      svcMap.set(key, { name: proj.serviceCategory || 'Other / Unassigned', projects: 0, rev: 0, exp: 0 });
    }
    const entry = svcMap.get(key)!;
    entry.projects += 1;
    if (basis === 'accrual' && isConfirmedProject(proj) && isWithinDateRange(proj.startDate, startDate, endDate)) {
      entry.rev += proj.budgetPaise;
    }
  }

  if (basis === 'cash') {
    for (const pay of projectPayments) {
      if (pay.isDeleted || !isWithinDateRange(pay.date, startDate, endDate)) continue;
      const proj = projectById.get(pay.projectId);
      const key = proj ? resolveServiceId(proj) : '__unassigned_service__';
      if (!svcMap.has(key)) {
        svcMap.set(key, { name: 'Other / Unassigned', projects: 0, rev: 0, exp: 0 });
      }
      svcMap.get(key)!.rev += pay.amountPaise;
    }
  }

  let unallocatedExpensesPaise = 0;
  for (const exp of businessExpenses) {
    if (exp.isDeleted || !isWithinDateRange(exp.date, startDate, endDate)) continue;
    let targetSvcId = exp.serviceId;
    if (!targetSvcId && exp.projectId) {
      const linkedProj = projectById.get(exp.projectId);
      if (linkedProj) targetSvcId = resolveServiceId(linkedProj);
    }
    if (targetSvcId && svcMap.has(targetSvcId)) {
      svcMap.get(targetSvcId)!.exp += exp.amountPaise;
    } else {
      unallocatedExpensesPaise += exp.amountPaise;
    }
  }

  const totalRevenuePaise = Array.from(svcMap.values()).reduce((s, v) => s + v.rev, 0);

  const rows: ServicePerformanceRow[] = Array.from(svcMap.entries())
    .map(([serviceId, stats]) => ({
      serviceId,
      serviceName: stats.name,
      projectsCount: stats.projects,
      revenuePaise: stats.rev,
      taggedExpensesPaise: stats.exp,
      estimatedProfitPaise: stats.rev - stats.exp,
      profitSharePct:
        totalRevenuePaise > 0
          ? Math.round((stats.rev / totalRevenuePaise) * 1000) / 10
          : null,
    }))
    .filter((r) => r.projectsCount > 0 || r.revenuePaise > 0 || r.taggedExpensesPaise > 0)
    .sort((a, b) => b.revenuePaise - a.revenuePaise);

  return { rows, unallocatedExpensesPaise, totalRevenuePaise };
}

export interface LeadSourceRevenueRow {
  source: LeadSource;
  convertedClients: number;
  totalRevenuePaise: number;
}

/**
 * Attributes collected cash revenue from converted clients back to their source lead's leadSource.
 */
export function computeLeadSourceRevenue(params: {
  leads: Lead[];
  clients: Client[];
  projectPayments: ProjectPayment[];
  otherIncome: OtherIncome[];
}): LeadSourceRevenueRow[] {
  const { leads, clients, projectPayments, otherIncome } = params;
  const leadById = new Map(leads.map((l) => [l.id, l]));

  const revenueByClient = new Map<string, number>();
  for (const p of projectPayments) {
    if (p.isDeleted) continue;
    revenueByClient.set(p.clientId, (revenueByClient.get(p.clientId) ?? 0) + p.amountPaise);
  }
  for (const i of otherIncome) {
    if (i.isDeleted || !i.clientId) continue;
    revenueByClient.set(i.clientId, (revenueByClient.get(i.clientId) ?? 0) + i.amountPaise);
  }

  const sourceMap = new Map<LeadSource, { clients: number; rev: number }>();
  for (const src of LEAD_SOURCES) {
    sourceMap.set(src, { clients: 0, rev: 0 });
  }

  for (const client of clients) {
    if (!client.sourceLeadId) continue;
    const srcLead = leadById.get(client.sourceLeadId);
    if (!srcLead) continue;
    const entry = sourceMap.get(srcLead.leadSource) ?? { clients: 0, rev: 0 };
    entry.clients += 1;
    entry.rev += revenueByClient.get(client.id) ?? 0;
    sourceMap.set(srcLead.leadSource, entry);
  }

  return Array.from(sourceMap.entries())
    .map(([source, data]) => ({
      source,
      convertedClients: data.clients,
      totalRevenuePaise: data.rev,
    }))
    .filter((r) => r.convertedClients > 0 || r.totalRevenuePaise > 0)
    .sort((a, b) => b.totalRevenuePaise - a.totalRevenuePaise);
}

export function computeMomChangePct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function formatPctOrNA(value: number | null, includeSign = false): string {
  if (value === null) return 'N/A';
  const sign = includeSign && value > 0 ? '+' : '';
  return `${sign}${value}%`;
}

export function getPreviousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const dt = new Date(y, m - 2, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthBounds(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split('-').map(Number);
  const endDt = new Date(y, m, 0);
  const endDay = String(endDt.getDate()).padStart(2, '0');
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${endDay}`,
  };
}

export function findPotentialDuplicateIncome(params: {
  date: string;
  amountPaise: number;
  projectPayments: ProjectPayment[];
  otherIncome: OtherIncome[];
  projectId?: string;
  excludeId?: string;
}): number {
  const { date, amountPaise, projectPayments, otherIncome, projectId, excludeId } = params;
  if (!date || amountPaise <= 0) return 0;

  let matches = 0;
  for (const p of projectPayments) {
    if (p.isDeleted || p.id === excludeId) continue;
    if (p.date === date && p.amountPaise === amountPaise && (!projectId || p.projectId === projectId)) {
      matches += 1;
    }
  }
  for (const i of otherIncome) {
    if (i.isDeleted || i.id === excludeId) continue;
    if (i.date === date && i.amountPaise === amountPaise && !projectId) {
      matches += 1;
    }
  }
  return matches;
}

export function findPotentialDuplicateExpense(params: {
  date: string;
  amountPaise: number;
  category: string;
  expenses: BusinessExpense[];
  excludeId?: string;
}): number {
  const { date, amountPaise, category, expenses, excludeId } = params;
  if (!date || amountPaise <= 0) return 0;

  return expenses.filter(
    (e) =>
      !e.isDeleted &&
      e.id !== excludeId &&
      e.date === date &&
      e.amountPaise === amountPaise &&
      e.category.toLowerCase() === category.trim().toLowerCase()
  ).length;
}
