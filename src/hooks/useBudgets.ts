import { useEffect, useMemo } from 'react';
import { ROUTES } from '../lib/constants';
import { computeBudgetUtilization } from '../lib/financeUtils';
import { formatINR } from '../lib/moneyUtils';
import { syncBudgetThresholdAlert } from '../services/companyFinanceService';
import { ensureDeterministicNotification } from '../services/notificationService';
import { useAuth } from './useAuth';
import { useBusinessDataContext } from './useBusinessData';

export function useBudgets(monthFilter?: string) {
  const { firebaseUser } = useAuth();
  const { budgets, businessExpenses, services, inAppNotifications, loading, error } =
    useBusinessDataContext();

  const scopedBudgets = useMemo(
    () => (monthFilter ? budgets.filter((b) => b.month === monthFilter) : budgets),
    [budgets, monthFilter]
  );

  const utilizationRows = useMemo(
    () => computeBudgetUtilization(scopedBudgets, businessExpenses, services),
    [scopedBudgets, businessExpenses, services]
  );

  // Deduplicated 80% / 100% alert generation across all budgets
  useEffect(() => {
    if (!firebaseUser || loading) return;
    const allRows = computeBudgetUtilization(budgets, businessExpenses, services);
    const serviceMap = new Map(services.map((s) => [s.id, s.name]));

    for (const row of allRows) {
      const targetLabel =
        row.budget.budgetType === 'Service'
          ? serviceMap.get(row.budget.target) ?? row.budget.target
          : row.budget.target;

      if (row.utilizationPct > 100) {
        void syncBudgetThresholdAlert({
          uid: firebaseUser.uid,
          budget: row.budget,
          targetLabel,
          threshold: 100,
          spentPaise: row.spentPaise,
          utilizationPct: row.utilizationPct,
        });
        void ensureDeterministicNotification({
          id: `budget_100_${row.budget.id}_${row.budget.month}`,
          uid: firebaseUser.uid,
          category: 'deadlines',
          type: 'budget_100',
          severity: 'critical',
          title: `Budget Exceeded: ${targetLabel}`,
          message: `${row.budget.month} ${row.budget.budgetType} budget for ${targetLabel} is at ${row.utilizationPct}% (${formatINR(row.spentPaise)} of ${formatINR(row.budget.limitPaise)}).`,
          link: `${ROUTES.COMPANY_FINANCE}?tab=budgets`,
          sourceType: 'budget',
          sourceId: row.budget.id,
        });
      } else if (row.utilizationPct >= 80) {
        void syncBudgetThresholdAlert({
          uid: firebaseUser.uid,
          budget: row.budget,
          targetLabel,
          threshold: 80,
          spentPaise: row.spentPaise,
          utilizationPct: row.utilizationPct,
        });
        void ensureDeterministicNotification({
          id: `budget_80_${row.budget.id}_${row.budget.month}`,
          uid: firebaseUser.uid,
          category: 'deadlines',
          type: 'budget_80',
          severity: 'warning',
          title: `Budget Warning (80%+): ${targetLabel}`,
          message: `${row.budget.month} ${row.budget.budgetType} budget for ${targetLabel} is at ${row.utilizationPct}% (${formatINR(row.spentPaise)} of ${formatINR(row.budget.limitPaise)}).`,
          link: `${ROUTES.COMPANY_FINANCE}?tab=budgets`,
          sourceType: 'budget',
          sourceId: row.budget.id,
        });
      }
    }
  }, [firebaseUser, loading, budgets, businessExpenses, services]);

  return {
    budgets,
    scopedBudgets,
    utilizationRows,
    inAppNotifications,
    loading,
    error,
  };
}
