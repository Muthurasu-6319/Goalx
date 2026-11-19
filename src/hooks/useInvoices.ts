import { useMemo } from 'react';
import { deriveInvoicesWithStatus, suggestNextInvoiceNumber } from '../lib/financeUtils';
import { getTodayDateString } from '../lib/goalUtils';
import { useBusinessDataContext } from './useBusinessData';

export function useInvoices() {
  const { invoices, projectPayments, clients, projects, loading, error } = useBusinessDataContext();
  const todayStr = getTodayDateString();

  const derivedInvoices = useMemo(
    () => deriveInvoicesWithStatus(invoices, projectPayments, todayStr),
    [invoices, projectPayments, todayStr]
  );

  const nextInvoiceNumber = useMemo(
    () => suggestNextInvoiceNumber(invoices, todayStr),
    [invoices, todayStr]
  );

  return {
    invoices,
    derivedInvoices,
    nextInvoiceNumber,
    clients,
    projects,
    loading,
    error,
  };
}
