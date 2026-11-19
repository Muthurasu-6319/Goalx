import { useMemo } from 'react';
import { computeCompanyFinanceSummary, computeServicePerformance } from '../lib/financeUtils';
import { AccountingBasis } from '../types';
import { useBusinessDataContext } from './useBusinessData';

export interface UnifiedIncomeEntry {
  id: string;
  sourceType: 'Project Payment' | 'Other Income';
  title: string;
  clientId: string;
  projectId: string;
  amountPaise: number;
  date: string;
  method: string;
  paymentType: string;
  invoiceNumber: string;
  notes: string;
  isDeleted: boolean;
  deletedAt: string;
}

export function useFinance(startDate?: string, endDate?: string, basis: AccountingBasis = 'cash') {
  const {
    projects,
    projectPayments,
    otherIncome,
    businessExpenses,
    services,
    clients,
    leads,
    financeAuditLogs,
    loading,
    error,
  } = useBusinessDataContext();

  const effectiveStart = startDate ?? '1900-01-01';
  const effectiveEnd = endDate ?? '9999-12-31';

  const summary = useMemo(
    () =>
      computeCompanyFinanceSummary({
        projects,
        projectPayments,
        otherIncome,
        businessExpenses,
        startDate: effectiveStart,
        endDate: effectiveEnd,
        basis,
      }),
    [projects, projectPayments, otherIncome, businessExpenses, effectiveStart, effectiveEnd, basis]
  );

  const servicePerformance = useMemo(
    () =>
      computeServicePerformance({
        services,
        projects,
        projectPayments,
        businessExpenses,
        startDate: effectiveStart,
        endDate: effectiveEnd,
        basis,
      }),
    [services, projects, projectPayments, businessExpenses, effectiveStart, effectiveEnd, basis]
  );

  const unifiedIncome = useMemo<UnifiedIncomeEntry[]>(() => {
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const fromProjects: UnifiedIncomeEntry[] = projectPayments.map((p) => ({
      id: p.id,
      sourceType: 'Project Payment',
      title: projectMap.get(p.projectId)?.title || 'Project Payment',
      clientId: p.clientId,
      projectId: p.projectId,
      amountPaise: p.amountPaise,
      date: p.date,
      method: p.method,
      paymentType: p.paymentType,
      invoiceNumber: p.invoiceNumber,
      notes: p.notes,
      isDeleted: p.isDeleted,
      deletedAt: p.deletedAt,
    }));

    const fromOther: UnifiedIncomeEntry[] = otherIncome.map((o) => ({
      id: o.id,
      sourceType: 'Other Income',
      title: o.source,
      clientId: o.clientId,
      projectId: '',
      amountPaise: o.amountPaise,
      date: o.date,
      method: o.method,
      paymentType: 'Non-Project',
      invoiceNumber: '',
      notes: o.notes,
      isDeleted: o.isDeleted,
      deletedAt: o.deletedAt,
    }));

    return [...fromProjects, ...fromOther].sort((a, b) => b.date.localeCompare(a.date));
  }, [projects, projectPayments, otherIncome]);

  return {
    summary,
    servicePerformance,
    unifiedIncome,
    projects,
    projectPayments,
    otherIncome,
    businessExpenses,
    services,
    clients,
    leads,
    financeAuditLogs,
    loading,
    error,
  };
}
