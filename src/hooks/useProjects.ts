import { useMemo } from 'react';
import { computeProjectFinancials } from '../lib/financeUtils';
import { useBusinessDataContext } from './useBusinessData';

export function useProjects() {
  const {
    projects,
    projectPayments,
    businessExpenses,
    clients,
    services,
    teamMembers,
    loading,
    error,
  } = useBusinessDataContext();

  const projectRows = useMemo(
    () => computeProjectFinancials(projects, projectPayments, businessExpenses),
    [projects, projectPayments, businessExpenses]
  );

  const activePayments = useMemo(
    () => projectPayments.filter((p) => !p.isDeleted),
    [projectPayments]
  );

  return {
    projects,
    projectRows,
    projectPayments,
    activePayments,
    clients,
    services,
    teamMembers,
    loading,
    error,
  };
}
