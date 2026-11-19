import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ensureSeedBusinessServices } from '../services/businessServiceCatalog';
import { ensureSeedLocalCompetitors } from '../services/competitorService';
import {
  Budget,
  BusinessExpense,
  BusinessService,
  Client,
  CompetitiveGap,
  CompetitiveGoalLink,
  Competitor,
  CompetitorComparison,
  CompetitorEvidence,
  CompetitorMetric,
  CompetitorMonthlyReview,
  CompetitorPendingFinding,
  CompetitorResearchHistory,
  CompetitorScoreConfig,
  FinanceAuditLog,
  InAppNotification,
  Invoice,
  Lead,
  OtherIncome,
  OwnMetric,
  Project,
  ProjectPayment,
  RecurringExpenseTemplate,
  RewardEvent,
  SalaryRecord,
  TaskItem,
  TeamMember,
  TeamMemberPrivate,
} from '../types';
import { useAuth } from './useAuth';

interface BusinessDataContextValue {
  loading: boolean;
  error: string | null;
  services: BusinessService[];
  leads: Lead[];
  clients: Client[];
  projects: Project[];
  projectPayments: ProjectPayment[];
  teamMembers: TeamMember[];
  teamMemberPrivate: TeamMemberPrivate[];
  otherIncome: OtherIncome[];
  invoices: Invoice[];
  businessExpenses: BusinessExpense[];
  recurringExpenseTemplates: RecurringExpenseTemplate[];
  salaryRecords: SalaryRecord[];
  budgets: Budget[];
  financeAuditLogs: FinanceAuditLog[];
  inAppNotifications: InAppNotification[];
  competitors: Competitor[];
  competitorMetrics: CompetitorMetric[];
  competitorEvidence: CompetitorEvidence[];
  competitorResearchHistory: CompetitorResearchHistory[];
  competitorPendingFindings: CompetitorPendingFinding[];
  ownMetrics: OwnMetric[];
  competitorScoreConfigs: CompetitorScoreConfig[];
  competitorComparisons: CompetitorComparison[];
  competitorMonthlyReviews: CompetitorMonthlyReview[];
  competitiveGaps: CompetitiveGap[];
  competitiveGoals: CompetitiveGoalLink[];
  tasks: TaskItem[];
  rewardEvents: RewardEvent[];
}

const BusinessDataContext = createContext<BusinessDataContextValue | undefined>(undefined);

function sortByDateDesc<T extends { date?: string; createdAt?: { toMillis?: () => number } }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const da = a.date ?? '';
    const dbStr = b.date ?? '';
    if (da !== dbStr) return dbStr.localeCompare(da);
    return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
  });
}

export const BusinessDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, authReady, userProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [services, setServices] = useState<BusinessService[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectPayments, setProjectPayments] = useState<ProjectPayment[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMemberPrivate, setTeamMemberPrivate] = useState<TeamMemberPrivate[]>([]);
  const [otherIncome, setOtherIncome] = useState<OtherIncome[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [businessExpenses, setBusinessExpenses] = useState<BusinessExpense[]>([]);
  const [recurringExpenseTemplates, setRecurringExpenseTemplates] = useState<RecurringExpenseTemplate[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [financeAuditLogs, setFinanceAuditLogs] = useState<FinanceAuditLog[]>([]);
  const [inAppNotifications, setInAppNotifications] = useState<InAppNotification[]>([]);

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [competitorMetrics, setCompetitorMetrics] = useState<CompetitorMetric[]>([]);
  const [competitorEvidence, setCompetitorEvidence] = useState<CompetitorEvidence[]>([]);
  const [competitorResearchHistory, setCompetitorResearchHistory] = useState<CompetitorResearchHistory[]>([]);
  const [competitorPendingFindings, setCompetitorPendingFindings] = useState<CompetitorPendingFinding[]>([]);

  // Phase 5B states
  const [ownMetrics, setOwnMetrics] = useState<OwnMetric[]>([]);
  const [competitorScoreConfigs, setCompetitorScoreConfigs] = useState<CompetitorScoreConfig[]>([]);
  const [competitorComparisons, setCompetitorComparisons] = useState<CompetitorComparison[]>([]);
  const [competitorMonthlyReviews, setCompetitorMonthlyReviews] = useState<CompetitorMonthlyReview[]>([]);
  const [competitiveGaps, setCompetitiveGaps] = useState<CompetitiveGap[]>([]);
  const [competitiveGoals, setCompetitiveGoals] = useState<CompetitiveGoalLink[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [rewardEvents, setRewardEvents] = useState<RewardEvent[]>([]);

  useEffect(() => {
    if (!authReady || !firebaseUser || !userProfile?.onboardingCompleted) {
      setServices([]);
      setLeads([]);
      setClients([]);
      setProjects([]);
      setProjectPayments([]);
      setTeamMembers([]);
      setTeamMemberPrivate([]);
      setOtherIncome([]);
      setInvoices([]);
      setBusinessExpenses([]);
      setRecurringExpenseTemplates([]);
      setSalaryRecords([]);
      setBudgets([]);
      setFinanceAuditLogs([]);
      setInAppNotifications([]);
      setCompetitors([]);
      setCompetitorMetrics([]);
      setCompetitorEvidence([]);
      setCompetitorResearchHistory([]);
      setCompetitorPendingFindings([]);
      setOwnMetrics([]);
      setCompetitorScoreConfigs([]);
      setCompetitorComparisons([]);
      setCompetitorMonthlyReviews([]);
      setCompetitiveGaps([]);
      setCompetitiveGoals([]);
      setTasks([]);
      setRewardEvents([]);
      setLoading(false);
      setError(null);
      return;
    }

    const uid = firebaseUser.uid;
    setLoading(true);
    setError(null);

    void ensureSeedBusinessServices(uid).catch(() => {
      // Seed errors handled internally
    });
    void ensureSeedLocalCompetitors(uid).catch(() => {
      // Seed errors handled internally
    });

    const readySet = new Set<string>();
    const markReady = (name: string) => {
      readySet.add(name);
      if (readySet.size >= 28) {
        setLoading(false);
      }
    };

    const unsubs: (() => void)[] = [];

    const subscribeList = <T,>(
      colName: string,
      maxDocs: number,
      setter: (items: T[]) => void,
      sorter?: (items: T[]) => T[]
    ) => {
      const unsub = onSnapshot(
        query(collection(db, colName), where('ownerId', '==', uid), limit(maxDocs)),
        (snap) => {
          const raw = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as T[];
          setter(sorter ? sorter(raw) : raw);
          markReady(colName);
        },
        (err) => {
          markReady(colName);
          setError(err.message);
          handleFirestoreError(err, OperationType.LIST, colName);
        }
      );
      unsubs.push(unsub);
    };

    subscribeList<BusinessService>('businessServices', 100, setServices, (items) =>
      [...items].sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
    );
    subscribeList<Lead>('leads', 250, setLeads, (items) =>
      [...items].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    );
    subscribeList<Client>('clients', 250, setClients, (items) =>
      [...items].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    );
    subscribeList<Project>('projects', 250, setProjects, (items) =>
      [...items].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    );
    subscribeList<ProjectPayment>('projectPayments', 500, setProjectPayments, sortByDateDesc);
    subscribeList<TeamMember>('teamMembers', 150, setTeamMembers, (items) =>
      [...items].sort((a, b) => a.name.localeCompare(b.name))
    );
    subscribeList<TeamMemberPrivate>('teamMemberPrivate', 150, setTeamMemberPrivate);
    subscribeList<OtherIncome>('otherIncome', 500, setOtherIncome, sortByDateDesc);
    subscribeList<Invoice>('invoices', 300, setInvoices, (items) =>
      [...items].sort((a, b) => b.issueDate.localeCompare(a.issueDate))
    );
    subscribeList<BusinessExpense>('businessExpenses', 500, setBusinessExpenses, sortByDateDesc);
    subscribeList<RecurringExpenseTemplate>('recurringExpenseTemplates', 150, setRecurringExpenseTemplates, (items) =>
      [...items].sort((a, b) => a.dayOfMonth - b.dayOfMonth)
    );
    subscribeList<SalaryRecord>('salaryRecords', 300, setSalaryRecords, (items) =>
      [...items].sort((a, b) => b.month.localeCompare(a.month))
    );
    subscribeList<Budget>('budgets', 200, setBudgets, (items) =>
      [...items].sort((a, b) => b.month.localeCompare(a.month))
    );
    subscribeList<FinanceAuditLog>('financeAuditLogs', 250, setFinanceAuditLogs, (items) =>
      [...items].sort((a, b) => b.timestampIso.localeCompare(a.timestampIso))
    );
    subscribeList<InAppNotification>('inAppNotifications', 200, setInAppNotifications, (items) =>
      [...items].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    );

    // Phase 5A Competitor Subscriptions
    subscribeList<Competitor>('competitors', 200, setCompetitors, (items) =>
      [...items].sort((a, b) => a.companyName.localeCompare(b.companyName))
    );
    subscribeList<CompetitorMetric>('competitorMetrics', 1000, setCompetitorMetrics);
    subscribeList<CompetitorEvidence>('competitorEvidence', 1000, setCompetitorEvidence, (items) =>
      [...items].sort((a, b) => {
        if (a.lastVerifiedDate !== b.lastVerifiedDate) {
          return b.lastVerifiedDate.localeCompare(a.lastVerifiedDate);
        }
        return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
      })
    );
    subscribeList<CompetitorResearchHistory>(
      'competitorResearchHistory',
      250,
      setCompetitorResearchHistory,
      (items) => [...items].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    );
    subscribeList<CompetitorPendingFinding>(
      'competitorPendingFindings',
      500,
      setCompetitorPendingFindings,
      (items) => [...items].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    );

    // Phase 5B Subscriptions
    subscribeList<OwnMetric>('ownMetrics', 200, setOwnMetrics);
    subscribeList<CompetitorScoreConfig>('competitorScoreConfigs', 10, setCompetitorScoreConfigs);
    subscribeList<CompetitorComparison>(
      'competitorComparisons',
      300,
      setCompetitorComparisons,
      (items) => [...items].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    );
    subscribeList<CompetitorMonthlyReview>(
      'competitorMonthlyReviews',
      500,
      setCompetitorMonthlyReviews,
      (items) =>
        [...items].sort((a, b) => {
          if (a.month !== b.month) return a.month.localeCompare(b.month);
          return a.version - b.version;
        })
    );
    subscribeList<CompetitiveGap>(
      'competitiveGaps',
      300,
      setCompetitiveGaps,
      (items) => [...items].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    );
    subscribeList<CompetitiveGoalLink>('competitiveGoals', 300, setCompetitiveGoals);
    subscribeList<TaskItem>(
      'tasks',
      300,
      setTasks,
      (items) => [...items].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    );
    subscribeList<RewardEvent>(
      'rewardEvents',
      200,
      setRewardEvents,
      (items) => [...items].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [authReady, firebaseUser, userProfile?.onboardingCompleted]);

  return (
    <BusinessDataContext.Provider
      value={{
        loading,
        error,
        services,
        leads,
        clients,
        projects,
        projectPayments,
        teamMembers,
        teamMemberPrivate,
        otherIncome,
        invoices,
        businessExpenses,
        recurringExpenseTemplates,
        salaryRecords,
        budgets,
        financeAuditLogs,
        inAppNotifications,
        competitors,
        competitorMetrics,
        competitorEvidence,
        competitorResearchHistory,
        competitorPendingFindings,
        ownMetrics,
        competitorScoreConfigs,
        competitorComparisons,
        competitorMonthlyReviews,
        competitiveGaps,
        competitiveGoals,
        tasks,
        rewardEvents,
      }}
    >
      {children}
    </BusinessDataContext.Provider>
  );
};

export function useBusinessDataContext() {
  const ctx = useContext(BusinessDataContext);
  if (!ctx) {
    throw new Error('useBusinessDataContext must be used within a BusinessDataProvider');
  }
  return ctx;
}
