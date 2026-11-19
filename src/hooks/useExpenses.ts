import { useMemo } from 'react';
import { DEFAULT_COMPANY_EXPENSE_CATEGORIES } from '../lib/constants';
import { useAuth } from './useAuth';
import { useBusinessDataContext } from './useBusinessData';

export function useExpenses() {
  const { userSettings } = useAuth();
  const {
    businessExpenses,
    recurringExpenseTemplates,
    services,
    projects,
    financeAuditLogs,
    loading,
    error,
  } = useBusinessDataContext();

  const categories = useMemo(() => {
    const custom = userSettings?.customExpenseCategories ?? [];
    return Array.from(new Set([...DEFAULT_COMPANY_EXPENSE_CATEGORIES, ...custom]));
  }, [userSettings?.customExpenseCategories]);

  const activeExpenses = useMemo(
    () => businessExpenses.filter((e) => !e.isDeleted),
    [businessExpenses]
  );

  const deletedExpenses = useMemo(
    () => businessExpenses.filter((e) => e.isDeleted),
    [businessExpenses]
  );

  return {
    businessExpenses,
    activeExpenses,
    deletedExpenses,
    recurringExpenseTemplates,
    categories,
    services,
    projects,
    financeAuditLogs,
    loading,
    error,
  };
}
