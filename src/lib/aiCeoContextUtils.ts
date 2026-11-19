import {
  AI_PROPOSAL_EXPIRY_DAYS,
  DEFAULT_SCORECARD_WEIGHTS,
  PLANNING_KPI_TARGETS,
  STALE_EVIDENCE_DAYS,
} from './constants';
import { computeCrmMetrics, getFollowUpBuckets } from './businessUtils';
import {
  buildOwnMetricsView,
  computeDualScorecards,
  computeOverallGapsProgress,
} from './competitorScoringUtils';
import { isEvidenceStale } from './competitorUtils';
import {
  computeBudgetUtilization,
  computeCompanyFinanceSummary,
  computeProjectFinancials,
  deriveInvoicesWithStatus,
  formatPctOrNA,
  getMonthBounds,
  getPreviousMonthKey,
} from './financeUtils';
import {
  addDaysToDateString,
  calculateGoalProgressPct,
  getEffectiveGoalStatus,
} from './goalUtils';
import {
  calculateHabitCompletionStats,
  calculateHabitStreaks,
  isHabitScheduledOnDate,
} from './habitUtils';
import { formatINR } from './moneyUtils';
import {
  AiArea,
  AiBriefingSection,
  AiBriefingType,
  AiSourceCitation,
  BaselineMetricComparison,
  Budget,
  BusinessExpense,
  BusinessService,
  CalendarEvent,
  Client,
  CompanyProfile,
  CompetitiveGap,
  Competitor,
  CompetitorEvidence,
  CompetitorMetric,
  CompetitorMonthlyReview,
  CompetitorScoreConfig,
  Habit,
  HabitLog,
  Invoice,
  Lead,
  OtherIncome,
  OwnMetric,
  PersonalExpense,
  PersonalGoal,
  PersonalIncome,
  Project,
  ProjectPayment,
  SalaryRecord,
  TaskItem,
  TeamMember,
  TeamMemberPrivate,
  UserProfile,
} from '../types';

export interface SanitizedAiContextResult {
  areasUsed: AiArea[];
  sources: AiSourceCitation[];
  factsText: string;
  untrustedDataText: string;
  excludedPrivacyNotes: string[];
  allowProposalLeadIds: string[];
  allowProposalCompetitorIds: string[];
}

export interface FullAiDatasetInput {
  uid: string;
  todayStr: string;
  userProfile?: Partial<UserProfile> | null;
  companyProfile?: Partial<CompanyProfile> | null;
  goals?: PersonalGoal[];
  habits?: Habit[];
  habitLogs?: HabitLog[];
  personalIncomes?: PersonalIncome[];
  personalExpenses?: PersonalExpense[];
  calendarEvents?: CalendarEvent[];
  services?: BusinessService[];
  leads?: Lead[];
  clients?: Client[];
  projects?: Project[];
  projectPayments?: ProjectPayment[];
  otherIncome?: OtherIncome[];
  invoices?: Invoice[];
  businessExpenses?: BusinessExpense[];
  budgets?: Budget[];
  teamMembers?: TeamMember[];
  teamMemberPrivate?: TeamMemberPrivate[];
  salaryRecords?: SalaryRecord[];
  competitors?: Competitor[];
  competitorMetrics?: CompetitorMetric[];
  competitorEvidence?: CompetitorEvidence[];
  ownMetrics?: OwnMetric[];
  scoreConfig?: CompetitorScoreConfig | null;
  competitiveGaps?: CompetitiveGap[];
  competitorMonthlyReviews?: CompetitorMonthlyReview[];
  tasks?: TaskItem[];
}

export function getAsiaKolkataDateParts(now = new Date()): {
  dateStr: string;
  monthKey: string;
  hour: number;
  dayOfWeek: number;
  dayOfMonth: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const year = get('year') || String(now.getUTCFullYear());
  const month = get('month') || String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = get('day') || String(now.getUTCDate()).padStart(2, '0');
  const hourNum = Number(get('hour')) || 0;
  const weekdayStr = get('weekday').toLowerCase();
  const weekdayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return {
    dateStr: `${year}-${month}-${day}`,
    monthKey: `${year}-${month}`,
    hour: hourNum >= 24 ? 0 : hourNum,
    dayOfWeek: weekdayMap[weekdayStr.slice(0, 3)] ?? now.getUTCDay(),
    dayOfMonth: Number(day) || now.getUTCDate(),
  };
}

export function getBriefingDocId(briefingType: AiBriefingType, dateStr: string): string {
  if (briefingType === 'monthly') {
    return `monthly_${dateStr.slice(0, 7)}`;
  }
  if (briefingType === 'weekly') {
    return `weekly_${dateStr}`;
  }
  return `briefing_${dateStr}`;
}

export function computeProposalExpiresAtIso(now = new Date()): string {
  const expiry = new Date(now.getTime() + AI_PROPOSAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  return expiry.toISOString();
}

export function isProposalExpired(expiresAtIso: string, now = new Date()): boolean {
  if (!expiresAtIso) return false;
  const t = Date.parse(expiresAtIso);
  if (!Number.isFinite(t)) return false;
  return now.getTime() > t;
}

export function isProposalExpiringSoon(expiresAtIso: string, now = new Date()): boolean {
  if (!expiresAtIso) return false;
  const t = Date.parse(expiresAtIso);
  if (!Number.isFinite(t)) return false;
  const diffMs = t - now.getTime();
  return diffMs > 0 && diffMs <= 48 * 60 * 60 * 1000;
}

/**
 * Strips prompt-injection breakout tags/control characters and wraps untrusted
 * user/research text inside explicit XML-style delimiters.
 */
export function wrapUntrustedText(sourceLabel: string, text: string, maxLen = 280): string {
  const clean = String(text ?? '')
    .replace(/<\/?\s*untrusted_data[^>]*>/gi, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  if (!clean) return `<untrusted_data source="${sourceLabel}">(empty)</untrusted_data>`;
  return `<untrusted_data source="${sourceLabel}">${clean}</untrusted_data>`;
}

export function filterOwned<T extends { ownerId?: string }>(items: T[] | undefined, uid: string): T[] {
  if (!Array.isArray(items) || !uid) return [];
  return items.filter((item) => item && item.ownerId === uid);
}

export function classifyQuestionAreas(
  question: string,
  hintArea: AiArea | 'general' = 'general'
): {
  areas: AiArea[];
  includeSalaryDetails: boolean;
  includePersonalFinanceDetails: boolean;
} {
  const q = question.toLowerCase();
  const areaSet = new Set<AiArea>();

  if (hintArea && hintArea !== 'general') {
    areaSet.add(hintArea);
  }

  if (/\b(goal|habit|streak|routine|personal|health|learning|morning|focus|priority|priorities|today|schedule|calendar)\b/.test(q)) {
    areaSet.add('personal');
  }
  if (/\b(revenue|cashflow|cash flow|profit|margin|expense|expenses|invoice|invoices|payment|payments|outstanding|collection|collections|budget|budgets|receivable|money|finance|financial|target|30\/60\/90|kpi|accrual|cash basis)\b/.test(q)) {
    areaSet.add('finance');
  }
  if (/\b(lead|leads|crm|follow.?up|pipeline|conversion|client|clients|sales|deal|won|lost|prospect)\b/.test(q)) {
    areaSet.add('leads');
  }
  if (/\b(project|projects|delivery|deadline|delayed|overdue|on.?time|milestone|service|services|scada|iiot|website|app)\b/.test(q)) {
    areaSet.add('projects');
  }
  if (/\b(team|member|members|staff|salary|salaries|payroll|commission|workload|bandwidth|hiring)\b/.test(q)) {
    areaSet.add('team');
  }
  if (/\b(competitor|competitors|competition|rival|benchmark|scorecard|score|gap|gaps|surpass|surpassed|beat|zoho|freshworks|sivakasi|madurai|tamil nadu|market presence)\b/.test(q)) {
    areaSet.add('competition');
  }
  if (/\b(xp|level|achievement|badge|streak)\b/.test(q)) {
    areaSet.add('gamification');
  }

  // Broad executive questions pull executive overview across core areas
  if (
    areaSet.size === 0 ||
    /\b(overview|summary|summarize|brief|briefing|ceo|business|everything|top priority|today|weekly|monthly|realistic|30\/60\/90)\b/.test(q)
  ) {
    areaSet.add('personal');
    areaSet.add('finance');
    areaSet.add('leads');
    areaSet.add('projects');
    areaSet.add('competition');
  }

  const includeSalaryDetails = /\b(salary|salaries|payroll|commission|compensation|pay)\b/.test(q);
  const includePersonalFinanceDetails = /\b(personal finance|personal expense|personal expenses|personal income|savings goal|personal budget)\b/.test(q);

  return {
    areas: Array.from(areaSet),
    includeSalaryDetails,
    includePersonalFinanceDetails,
  };
}

/**
 * Builds the strictly owner-scoped, pre-calculated factual context for Gemini.
 * All numbers come exclusively from the shared GoalX utilities.
 */
export function buildSanitizedAiContext(params: {
  dataset: FullAiDatasetInput;
  areas: AiArea[];
  includeSalaryDetails: boolean;
  includePersonalFinanceDetails: boolean;
  focusRecordId?: string;
}): SanitizedAiContextResult {
  const { dataset, areas, includeSalaryDetails, includePersonalFinanceDetails, focusRecordId } = params;
  const { uid, todayStr } = dataset;
  const currentMonth = todayStr.slice(0, 7);
  const prevMonth = getPreviousMonthKey(currentMonth);
  const curBounds = getMonthBounds(currentMonth);
  const prevBounds = getMonthBounds(prevMonth);

  const goals = filterOwned(dataset.goals, uid);
  const habits = filterOwned(dataset.habits, uid);
  const habitLogs = filterOwned(dataset.habitLogs, uid);
  const personalIncomes = filterOwned(dataset.personalIncomes, uid);
  const personalExpenses = filterOwned(dataset.personalExpenses, uid);
  const calendarEvents = filterOwned(dataset.calendarEvents, uid);
  const services = filterOwned(dataset.services, uid);
  const leads = filterOwned(dataset.leads, uid);
  const clients = filterOwned(dataset.clients, uid);
  const projects = filterOwned(dataset.projects, uid);
  const projectPayments = filterOwned(dataset.projectPayments, uid);
  const otherIncome = filterOwned(dataset.otherIncome, uid);
  const invoices = filterOwned(dataset.invoices, uid);
  const businessExpenses = filterOwned(dataset.businessExpenses, uid);
  const budgets = filterOwned(dataset.budgets, uid);
  const teamMembers = filterOwned(dataset.teamMembers, uid);
  const salaryRecords = filterOwned(dataset.salaryRecords, uid);
  const competitors = filterOwned(dataset.competitors, uid);
  const competitorMetrics = filterOwned(dataset.competitorMetrics, uid);
  const competitorEvidence = filterOwned(dataset.competitorEvidence, uid);
  const savedOwnMetrics = filterOwned(dataset.ownMetrics, uid);
  const competitiveGaps = filterOwned(dataset.competitiveGaps, uid);
  const tasks = filterOwned(dataset.tasks, uid);

  const factsLines: string[] = [];
  const untrustedLines: string[] = [];
  const sources: AiSourceCitation[] = [];
  const excludedPrivacyNotes: string[] = [];

  const companyName = dataset.companyProfile?.name || 'Gen Z Neural-X';
  const userName = dataset.userProfile?.name || 'CEO';
  factsLines.push(
    `IDENTITY & DATE: User=${userName} | Company=${companyName} | Today(Asia/Kolkata)=${todayStr} | CurrentMonth=${currentMonth}`
  );

  if (!includeSalaryDetails) {
    excludedPrivacyNotes.push('Private team salary/bankNotes excluded unless owner asks specifically about payroll/salaries.');
  }
  if (!includePersonalFinanceDetails) {
    excludedPrivacyNotes.push('Personal expense/income transaction details excluded unless owner asks specifically about personal finance.');
  }

  // Always include gamification summary lightly if requested or present
  if (areas.includes('gamification') || dataset.userProfile) {
    const xp = dataset.userProfile?.xp ?? 0;
    const level = dataset.userProfile?.level ?? 1;
    const streak = dataset.userProfile?.streakDays ?? 0;
    factsLines.push(`GAMIFICATION: Level=${level}, XP=${xp}, CheckInStreak=${streak} days.`);
  }

  // PERSONAL AREA
  if (areas.includes('personal')) {
    const activeGoals = goals
      .map((g) => ({
        goal: g,
        effStatus: getEffectiveGoalStatus(g, todayStr),
        pct: calculateGoalProgressPct(g.currentValue, g.targetValue),
      }))
      .filter((x) => x.effStatus !== 'Archived');

    const delayedGoals = activeGoals.filter((x) => x.effStatus === 'Delayed');
    const dueSoonGoals = activeGoals.filter(
      (x) =>
        x.effStatus !== 'Completed' &&
        x.goal.targetDate &&
        x.goal.targetDate >= todayStr &&
        x.goal.targetDate <= addDaysToDateString(todayStr, 7)
    );

    const activeHabits = habits.filter((h) => h.active);
    const logsByHabit = new Map<string, HabitLog[]>();
    for (const l of habitLogs) {
      const arr = logsByHabit.get(l.habitId) ?? [];
      arr.push(l);
      logsByHabit.set(l.habitId, arr);
    }

    const scheduledToday = activeHabits.filter((h) => isHabitScheduledOnDate(h, todayStr));
    const pendingHabitsToday = scheduledToday.filter(
      (h) => !(logsByHabit.get(h.id) ?? []).some((l) => l.date === todayStr && l.completed)
    );

    const habitSummaries = activeHabits.slice(0, 8).map((h) => {
      const hLogs = logsByHabit.get(h.id) ?? [];
      const streaks = calculateHabitStreaks(h, hLogs, todayStr);
      const stats = calculateHabitCompletionStats(h, hLogs, todayStr);
      const doneToday = hLogs.some((l) => l.date === todayStr && l.completed);
      return `${h.name}: streak=${streaks.currentStreak}, 7d=${stats.weeklyPct}%, doneToday=${doneToday}`;
    });

    const upcomingEvents = calendarEvents
      .filter((e) => e.date >= todayStr && e.date <= addDaysToDateString(todayStr, 7))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);

    factsLines.push(
      `PERSONAL GOALS: totalNonArchived=${activeGoals.length}, completed=${activeGoals.filter((x) => x.effStatus === 'Completed').length}, delayed=${delayedGoals.length}, dueWithin7Days=${dueSoonGoals.length}.`
    );
    if (activeGoals.length > 0) {
      for (const item of activeGoals.slice(0, 8)) {
        factsLines.push(
          `  - Goal "${item.goal.title}" [id=${item.goal.id}]: status=${item.effStatus}, priority=${item.goal.priority}, progress=${item.pct}% (${item.goal.currentValue}/${item.goal.targetValue} ${item.goal.unit}), targetDate=${item.goal.targetDate}`
        );
        if (item.goal.notes) {
          untrustedLines.push(wrapUntrustedText(`goal_notes:${item.goal.title}`, item.goal.notes, 200));
        }
      }
    }

    factsLines.push(
      `HABITS: active=${activeHabits.length}, scheduledToday=${scheduledToday.length}, pendingToday=${pendingHabitsToday.length}.`
    );
    for (const hs of habitSummaries) {
      factsLines.push(`  - ${hs}`);
    }

    if (upcomingEvents.length > 0) {
      factsLines.push(`UPCOMING CALENDAR (next 7 days, ${upcomingEvents.length} events):`);
      for (const ev of upcomingEvents) {
        factsLines.push(`  - ${ev.date} ${ev.allDay ? 'AllDay' : ev.startTime}: ${ev.title} (${ev.eventType})`);
      }
    }

    if (includePersonalFinanceDetails && dataset.userProfile?.ownerId === uid) {
      const pIncMonth = personalIncomes
        .filter((i) => i.date.startsWith(currentMonth))
        .reduce((s, i) => s + i.amountPaise, 0);
      const pExpMonth = personalExpenses
        .filter((e) => e.date.startsWith(currentMonth))
        .reduce((s, e) => s + e.amountPaise, 0);
      factsLines.push(
        `PERSONAL FINANCE (${currentMonth}, owner-only aggregate): income=${formatINR(pIncMonth)}, expenses=${formatINR(pExpMonth)}, netSavings=${formatINR(pIncMonth - pExpMonth)}.`
      );
    }

    sources.push({ label: 'Personal Goals', route: '/goals', count: activeGoals.length });
    sources.push({ label: 'Habits & Streaks', route: '/habits', count: activeHabits.length });
  }

  // FINANCE AREA
  if (areas.includes('finance')) {
    const cashThisMonth = computeCompanyFinanceSummary({
      projects,
      projectPayments,
      otherIncome,
      businessExpenses,
      startDate: curBounds.start,
      endDate: curBounds.end,
      basis: 'cash',
    });
    const accrualThisMonth = computeCompanyFinanceSummary({
      projects,
      projectPayments,
      otherIncome,
      businessExpenses,
      startDate: curBounds.start,
      endDate: curBounds.end,
      basis: 'accrual',
    });
    const cashPrevMonth = computeCompanyFinanceSummary({
      projects,
      projectPayments,
      otherIncome,
      businessExpenses,
      startDate: prevBounds.start,
      endDate: prevBounds.end,
      basis: 'cash',
    });

    const derivedInvoices = deriveInvoicesWithStatus(invoices, projectPayments, todayStr);
    const overdueInvoices = derivedInvoices
      .filter((d) => d.status === 'Overdue')
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
    const unpaidOrPartial = derivedInvoices.filter((d) => d.status === 'Unpaid' || d.status === 'Partially Paid');

    const monthBudgets = budgets.filter((b) => b.month === currentMonth);
    const budgetRows = computeBudgetUtilization(monthBudgets, businessExpenses, services);
    const atRiskBudgets = budgetRows.filter((b) => b.utilizationPct >= 80);

    factsLines.push(
      `COMPANY FINANCE (${currentMonth} vs ${prevMonth}) [Computed via shared financeUtils]:`
    );
    factsLines.push(
      `  - This Month (${currentMonth}) CASH BASIS (DEFAULT): Collections/Revenue=${formatINR(cashThisMonth.revenuePaise)} (ProjectPayments=${formatINR(cashThisMonth.projectCollectionsPaise)}, OtherIncome=${formatINR(cashThisMonth.otherIncomePaise)}), Expenses=${formatINR(cashThisMonth.expensesPaise)}, NetProfit=${formatINR(cashThisMonth.netProfitPaise)}, ProfitMargin=${formatPctOrNA(cashThisMonth.profitMarginPct)}, CashFlow=${formatINR(cashThisMonth.cashFlowPaise)}.`
    );
    factsLines.push(
      `  - This Month (${currentMonth}) ACCRUAL BASIS: Revenue=${formatINR(accrualThisMonth.revenuePaise)}, Expenses=${formatINR(accrualThisMonth.expensesPaise)}, NetProfit=${formatINR(accrualThisMonth.netProfitPaise)}, ProfitMargin=${formatPctOrNA(accrualThisMonth.profitMarginPct)}.`
    );
    factsLines.push(
      `  - Previous Month (${prevMonth}) CASH BASIS: Collections/Revenue=${formatINR(cashPrevMonth.revenuePaise)}, Expenses=${formatINR(cashPrevMonth.expensesPaise)}, NetProfit=${formatINR(cashPrevMonth.netProfitPaise)}.`
    );
    factsLines.push(
      `  - Receivables & Invoices: TotalProjectOutstanding=${formatINR(cashThisMonth.totalOutstandingPaise)}, OverdueInvoices=${overdueInvoices.length}, PendingUnpaidOrPartial=${unpaidOrPartial.length}.`
    );

    const clientNameMap = new Map(clients.map((c) => [c.id, c.clientName]));
    for (const inv of overdueInvoices.slice(0, 6)) {
      factsLines.push(
        `    * Overdue Invoice ${inv.invoice.invoiceNumber} (${clientNameMap.get(inv.invoice.clientId) || 'Client'}): balance=${formatINR(inv.balancePaise)}, due=${inv.invoice.dueDate} (${inv.daysOverdue}d overdue)`
      );
    }

    if (budgetRows.length > 0) {
      factsLines.push(`  - Monthly Budgets (${budgetRows.length} configured, ${atRiskBudgets.length} >= 80% used):`);
      for (const br of budgetRows.slice(0, 6)) {
        factsLines.push(
          `    * Budget ${br.budget.budgetType} (${br.budget.target}): spent=${formatINR(br.spentPaise)} / ${formatINR(br.budget.limitPaise)} (${br.utilizationPct}%, ${br.health})`
        );
      }
    }

    sources.push({ label: 'Company Finance', route: '/company/finance', count: projectPayments.length + businessExpenses.length });
  }

  // LEADS & CRM AREA
  if (areas.includes('leads')) {
    const crm = computeCrmMetrics(leads);
    const followUps = getFollowUpBuckets(leads, todayStr);
    const openLeads = leads.filter((l) => !l.archived && l.status !== 'Won' && l.status !== 'Lost');

    factsLines.push(
      `CRM & LEADS: totalActive=${crm.totalLeads}, new=${crm.newLeads}, qualified=${crm.qualifiedLeads}, won=${crm.wonLeads}, lost=${crm.lostLeads}, conversionRate=${crm.conversionRatePct}%, overdueFollowUps=${followUps.overdueFollowUps.length}, dueToday=${followUps.todayFollowUps.length}.`
    );

    const priorityLeads = [
      ...followUps.overdueFollowUps,
      ...followUps.todayFollowUps,
      ...openLeads.filter((l) => !followUps.overdueFollowUps.includes(l) && !followUps.todayFollowUps.includes(l)),
    ].slice(0, 8);

    for (const lead of priorityLeads) {
      factsLines.push(
        `  - Lead "${lead.clientName}" [leadId=${lead.id}]: stage=${lead.status}, source=${lead.leadSource}, service=${lead.serviceCategory}, budget=${formatINR(lead.estimatedBudgetPaise)}, followUpDate=${lead.followUpDate || 'Not set'}`
      );
      if (lead.notes || lead.requirement) {
        untrustedLines.push(
          wrapUntrustedText(`lead_notes:${lead.clientName}`, `${lead.requirement} ${lead.notes}`.trim(), 220)
        );
      }
    }

    sources.push({ label: 'Leads & CRM', route: '/company/leads', count: crm.totalLeads });
  }

  // PROJECTS AREA
  if (areas.includes('projects')) {
    const projectRows = computeProjectFinancials(projects, projectPayments, businessExpenses);
    const delayedProjects = projectRows.filter(
      (r) =>
        (r.project.status === 'In Progress' || r.project.status === 'Planning' || r.project.status === 'On Hold') &&
        r.project.dueDate &&
        r.project.dueDate < todayStr
    );
    const activeRows = projectRows.filter(
      (r) => r.project.status === 'In Progress' || r.project.status === 'Planning'
    );
    const completedProjects = projects.filter((p) => p.status === 'Completed');
    const activeServices = services.filter((s) => s.status === 'Active');

    factsLines.push(
      `PROJECTS & SERVICES: totalProjects=${projects.length}, inProgressOrPlanning=${activeRows.length}, completed=${completedProjects.length}, pastDueDate=${delayedProjects.length}, activeServices=${activeServices.length}.`
    );

    const focusedList = focusRecordId
      ? [
          ...projectRows.filter((r) => r.project.id === focusRecordId),
          ...projectRows.filter((r) => r.project.id !== focusRecordId),
        ]
      : [...delayedProjects, ...activeRows.filter((r) => !delayedProjects.includes(r))];

    for (const row of focusedList.slice(0, 8)) {
      const p = row.project;
      const isLate = p.status !== 'Completed' && p.status !== 'Cancelled' && Boolean(p.dueDate) && p.dueDate < todayStr;
      factsLines.push(
        `  - Project "${p.title}" [id=${p.id}]: status=${p.status}${isLate ? ' (OVERDUE)' : ''}, service=${p.serviceCategory}, budget=${formatINR(p.budgetPaise)}, received=${formatINR(row.receivedPaise)}, outstanding=${formatINR(row.outstandingPaise)}, taggedExpenses=${formatINR(row.taggedExpensesPaise)}, estProfit=${formatINR(row.estimatedProfitPaise)}, start=${p.startDate}, due=${p.dueDate || 'Unset'}`
      );
      if (p.description) {
        untrustedLines.push(wrapUntrustedText(`project_desc:${p.title}`, p.description, 200));
      }
    }

    sources.push({ label: 'Projects', route: '/projects', count: projects.length });
  }

  // TEAM AREA
  if (areas.includes('team')) {
    const activeMembers = teamMembers.filter((m) => m.status === 'Active');
    factsLines.push(`TEAM: activeMembers=${activeMembers.length}, totalMembers=${teamMembers.length}.`);
    for (const m of activeMembers.slice(0, 10)) {
      factsLines.push(`  - ${m.name} (${m.role}, ${m.department || 'General'})`);
    }
    if (includeSalaryDetails && dataset.companyProfile?.ownerId === uid) {
      const curSalaries = salaryRecords.filter((s) => s.month === currentMonth);
      const totalPayrollPaise = curSalaries.reduce((sum, s) => sum + s.netPayablePaise, 0);
      const pendingPayrollCount = curSalaries.filter((s) => s.status === 'Pending').length;
      factsLines.push(
        `  - Payroll Aggregate (${currentMonth}, owner-only): records=${curSalaries.length}, pending=${pendingPayrollCount}, netPayableTotal=${formatINR(totalPayrollPaise)} (individual bank notes strictly omitted).`
      );
    }
    sources.push({ label: 'Team & Roles', route: '/company/team', count: activeMembers.length });
  }

  // COMPETITION AREA
  if (areas.includes('competition')) {
    const ownMetrics = buildOwnMetricsView({
      services,
      leads,
      clients,
      projects,
      projectPayments,
      otherIncome,
      businessExpenses,
      teamMembers,
      savedOwnMetrics,
      ratingScoreMap: dataset.scoreConfig?.ratingScoreMap,
      todayStr,
    });

    const activeComps = competitors.filter((c) => c.status !== 'Archived' && c.status !== 'Inactive');
    const focusedComp = focusRecordId ? competitors.find((c) => c.id === focusRecordId) : null;
    const topTarget =
      focusedComp ||
      competitors.find((c) => c.isActiveTarget && c.status !== 'Surpassed') ||
      activeComps.find((c) => c.status === 'Active') ||
      activeComps[0] ||
      null;

    const openGaps = competitiveGaps.filter((g) => g.status === 'Open' || g.status === 'In Progress');
    const gapsSummary = computeOverallGapsProgress(competitiveGaps);

    factsLines.push(
      `COMPETITION INTELLIGENCE: tracked=${activeComps.length}, openGaps=${openGaps.length}, gapsProgress=${gapsSummary.avgProgressPct}%.`
    );

    if (topTarget) {
      const sc = computeDualScorecards({
        competitor: topTarget,
        ownMetrics,
        competitorMetrics,
        competitorEvidence,
        config: dataset.scoreConfig,
        todayStr,
      });
      factsLines.push(
        `  - Primary Target "${topTarget.companyName}" [competitorId=${topTarget.id}] (${topTarget.marketLevel}, ${topTarget.classification}, status=${topTarget.status}, verification=${topTarget.verificationStatus}):`
      );
      factsLines.push(
        `    * Scorecard: OwnOverall=${sc.ownOverallScore ?? 'Not enough data'} vs CompOverall=${sc.competitorOverallScore ?? 'Not enough data'} | OwnMarketPresence=${sc.ownMarketPresenceScore ?? 'N/A'} vs CompMarketPresence=${sc.competitorMarketPresenceScore ?? 'N/A'} | OwnBusinessPerf=${sc.ownBusinessPerformanceScore ?? 'N/A'} vs CompBusinessPerf=${sc.competitorBusinessPerformanceScore ?? 'N/A'} | ComparableVerifiedMetrics=${sc.comparableCount}`
      );
      const verifiedMetrics = competitorMetrics.filter(
        (m) =>
          m.competitorId === topTarget.id &&
          (m.dataStatus === 'Verified' || m.dataStatus === 'User Entered')
      );
      if (verifiedMetrics.length > 0) {
        factsLines.push(`    * Verified / User-Entered Metrics for ${topTarget.companyName} (only cite these):`);
        for (const m of verifiedMetrics.slice(0, 8)) {
          factsLines.push(
            `      - ${m.metricName}: ${m.value} [Status: ${m.dataStatus}, Last verified: ${m.lastVerifiedDate || 'Unknown'}, Source: ${m.sourceUrl || 'User entered'}]`
          );
          if (m.evidenceDescription || m.notes) {
            untrustedLines.push(
              wrapUntrustedText(`competitor_evidence:${topTarget.companyName}:${m.metricName}`, `${m.evidenceDescription} ${m.notes}`, 200)
            );
          }
        }
      } else {
        factsLines.push(`    * Verified metrics for ${topTarget.companyName}: None logged yet (Unknown).`);
      }
      if (topTarget.notes) {
        untrustedLines.push(wrapUntrustedText(`competitor_notes:${topTarget.companyName}`, topTarget.notes, 200));
      }
    }

    for (const g of openGaps.slice(0, 5)) {
      factsLines.push(
        `  - Open Gap "${g.title}": priority=${g.priority}, progress=${g.progressPct}%, deadline=${g.deadline || 'Unset'}`
      );
    }

    const openTasks = tasks.filter((t) => t.status !== 'Done');
    if (openTasks.length > 0) {
      factsLines.push(`  - Linked Gap Tasks Open: ${openTasks.length}`);
    }

    sources.push({ label: 'Competition Intelligence', route: '/competition', count: activeComps.length });
    if (topTarget) {
      sources.push({ label: `${topTarget.companyName} Profile`, route: `/competition/${topTarget.id}` });
    }
    sources.push({ label: 'Scorecards & Gaps', route: '/competition/scorecards', count: openGaps.length });
  }

  return {
    areasUsed: areas,
    sources,
    factsText: factsLines.join('\n'),
    untrustedDataText:
      untrustedLines.length > 0
        ? untrustedLines.join('\n')
        : '<untrusted_data source="none">(no free-text records needed)</untrusted_data>',
    excludedPrivacyNotes,
    allowProposalLeadIds: leads.filter((l) => !l.archived).map((l) => l.id),
    allowProposalCompetitorIds: competitors.map((c) => c.id),
  };
}

/**
 * Rule-based 10-section Daily Briefing (and Weekly/Monthly review summary) built strictly from GoalX data.
 * Used directly when Gemini is unavailable AND as the deterministic factual core fed into Gemini.
 */
export function buildRuleBasedBriefing(params: {
  dataset: FullAiDatasetInput;
  briefingType: AiBriefingType;
  hour?: number;
}): {
  greeting: string;
  overview: string;
  sections: AiBriefingSection[];
  riskFlags: string[];
  topPriority: string;
  metricsDigestForAi: string;
} {
  const { dataset, briefingType, hour = 9 } = params;
  const { uid, todayStr } = dataset;
  const currentMonth = todayStr.slice(0, 7);
  const curBounds = getMonthBounds(currentMonth);

  const goals = filterOwned(dataset.goals, uid);
  const habits = filterOwned(dataset.habits, uid);
  const habitLogs = filterOwned(dataset.habitLogs, uid);
  const leads = filterOwned(dataset.leads, uid);
  const clients = filterOwned(dataset.clients, uid);
  const projects = filterOwned(dataset.projects, uid);
  const projectPayments = filterOwned(dataset.projectPayments, uid);
  const otherIncome = filterOwned(dataset.otherIncome, uid);
  const invoices = filterOwned(dataset.invoices, uid);
  const businessExpenses = filterOwned(dataset.businessExpenses, uid);
  const budgets = filterOwned(dataset.budgets, uid);
  const services = filterOwned(dataset.services, uid);
  const teamMembers = filterOwned(dataset.teamMembers, uid);
  const competitors = filterOwned(dataset.competitors, uid);
  const competitorMetrics = filterOwned(dataset.competitorMetrics, uid);
  const competitorEvidence = filterOwned(dataset.competitorEvidence, uid);
  const savedOwnMetrics = filterOwned(dataset.ownMetrics, uid);
  const competitiveGaps = filterOwned(dataset.competitiveGaps, uid);

  const firstName = dataset.userProfile?.name?.trim().split(' ')[0] || '';
  const greeting =
    briefingType === 'weekly'
      ? `Weekly CEO Review${firstName ? ` for ${firstName}` : ''} — Week ending ${todayStr}`
      : briefingType === 'monthly'
        ? `Monthly CEO Strategic Review — ${currentMonth}`
        : hour < 12
          ? 'Good Morning! Here is your GoalX briefing.'
          : hour < 17
            ? 'Good Afternoon! Here is your GoalX briefing.'
            : 'Good Evening! Here is your GoalX briefing.';

  // 1. Personal Goals
  const activeGoals = goals
    .map((g) => ({
      goal: g,
      effStatus: getEffectiveGoalStatus(g, todayStr),
      pct: calculateGoalProgressPct(g.currentValue, g.targetValue),
    }))
    .filter((g) => g.effStatus !== 'Archived');
  const delayedGoals = activeGoals.filter((g) => g.effStatus === 'Delayed');
  const dueSoonGoals = activeGoals.filter(
    (g) =>
      g.effStatus !== 'Completed' &&
      g.goal.targetDate &&
      g.goal.targetDate >= todayStr &&
      g.goal.targetDate <= addDaysToDateString(todayStr, 7)
  );

  // 2. Habits
  const activeHabits = habits.filter((h) => h.active);
  const logsByHabit = new Map<string, HabitLog[]>();
  for (const l of habitLogs) {
    const arr = logsByHabit.get(l.habitId) ?? [];
    arr.push(l);
    logsByHabit.set(l.habitId, arr);
  }
  const scheduledToday = activeHabits.filter((h) => isHabitScheduledOnDate(h, todayStr));
  const pendingHabits = scheduledToday.filter(
    (h) => !(logsByHabit.get(h.id) ?? []).some((l) => l.date === todayStr && l.completed)
  );
  const streakAtRiskHabits = pendingHabits.filter(
    (h) => calculateHabitStreaks(h, logsByHabit.get(h.id) ?? [], todayStr).currentStreak >= 2
  );

  // 3. Company Finance (Cash Basis Default)
  const financeSummary = computeCompanyFinanceSummary({
    projects,
    projectPayments,
    otherIncome,
    businessExpenses,
    startDate: curBounds.start,
    endDate: curBounds.end,
    basis: 'cash',
  });
  const derivedInvoices = deriveInvoicesWithStatus(invoices, projectPayments, todayStr);
  const overdueInvoices = derivedInvoices
    .filter((d) => d.status === 'Overdue')
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
  const upcomingInvoices = derivedInvoices
    .filter((d) => d.status !== 'Paid' && d.status !== 'Overdue' && d.invoice.dueDate <= addDaysToDateString(todayStr, 7))
    .sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate));

  // 4. Leads
  const followUps = getFollowUpBuckets(leads, todayStr);
  const crm = computeCrmMetrics(leads);

  // 5. Projects
  const projectRows = computeProjectFinancials(projects, projectPayments, businessExpenses);
  const activeProjects = projectRows.filter(
    (r) => r.project.status === 'In Progress' || r.project.status === 'Planning'
  );
  const overdueProjects = activeProjects.filter((r) => Boolean(r.project.dueDate) && r.project.dueDate < todayStr);
  const dueSoonProjects = activeProjects.filter(
    (r) =>
      Boolean(r.project.dueDate) &&
      r.project.dueDate >= todayStr &&
      r.project.dueDate <= addDaysToDateString(todayStr, 7)
  );

  // 6. Budgets (>80%)
  const monthBudgets = budgets.filter((b) => b.month === currentMonth);
  const budgetUtil = computeBudgetUtilization(monthBudgets, businessExpenses, services);
  const budgetWarnings = budgetUtil.filter((b) => b.utilizationPct >= 80);

  // 7. Competition & Gaps & Stale Evidence (>90 days)
  const activeTarget =
    competitors.find((c) => c.isActiveTarget && c.status !== 'Surpassed') ||
    competitors.find((c) => c.status === 'Active') ||
    null;
  const openGaps = competitiveGaps.filter((g) => g.status === 'Open' || g.status === 'In Progress');
  const staleCompetitors = competitors.filter((c) => {
    if (c.status === 'Archived' || c.status === 'Inactive') return false;
    const evList = competitorEvidence.filter((e) => e.competitorId === c.id);
    if (c.lastVerifiedDate && isEvidenceStale(c.lastVerifiedDate, todayStr, STALE_EVIDENCE_DAYS)) return true;
    return evList.some((e) => e.lastVerifiedDate && isEvidenceStale(e.lastVerifiedDate, todayStr, STALE_EVIDENCE_DAYS));
  });

  const ownMetrics = buildOwnMetricsView({
    services,
    leads,
    clients,
    projects,
    projectPayments,
    otherIncome,
    businessExpenses,
    teamMembers,
    savedOwnMetrics,
    ratingScoreMap: dataset.scoreConfig?.ratingScoreMap,
    todayStr,
  });

  const targetScorecard = activeTarget
    ? computeDualScorecards({
        competitor: activeTarget,
        ownMetrics,
        competitorMetrics,
        competitorEvidence,
        config: dataset.scoreConfig,
        todayStr,
      })
    : null;

  // Rule-Based Risk Flags (runs automatically even without AI)
  const riskFlags: string[] = [];
  if (overdueInvoices.length > 0) {
    riskFlags.push(`${overdueInvoices.length} overdue invoice(s) totaling ${formatINR(overdueInvoices.reduce((s, d) => s + d.balancePaise, 0))}.`);
  }
  if (overdueProjects.length > 0) {
    riskFlags.push(`${overdueProjects.length} active project(s) past due date (${overdueProjects.map((p) => p.project.title).slice(0, 2).join(', ')}).`);
  }
  if (budgetWarnings.length > 0) {
    riskFlags.push(`${budgetWarnings.length} monthly budget(s) at >=80% utilization.`);
  }
  if (followUps.overdueFollowUps.length > 0) {
    riskFlags.push(`${followUps.overdueFollowUps.length} overdue CRM lead follow-up(s).`);
  }
  if (delayedGoals.length > 0) {
    riskFlags.push(`${delayedGoals.length} personal goal(s) past target date.`);
  }
  if (staleCompetitors.length > 0) {
    riskFlags.push(`${staleCompetitors.length} competitor profile(s) have evidence older than ${STALE_EVIDENCE_DAYS} days.`);
  }

  // Determine Top Priority
  let topPriority = 'Maintain daily habit consistency and log fresh CRM leads.';
  if (overdueInvoices.length > 0) {
    topPriority = `Follow up on overdue invoice ${overdueInvoices[0].invoice.invoiceNumber} (${formatINR(overdueInvoices[0].balancePaise)}, ${overdueInvoices[0].daysOverdue}d overdue).`;
  } else if (overdueProjects.length > 0) {
    topPriority = `Unblock overdue project "${overdueProjects[0].project.title}" (due ${overdueProjects[0].project.dueDate}).`;
  } else if (followUps.overdueFollowUps.length > 0 || followUps.todayFollowUps.length > 0) {
    const firstLead = followUps.overdueFollowUps[0] || followUps.todayFollowUps[0];
    topPriority = `Complete CRM follow-up with ${firstLead.clientName} (${firstLead.status}).`;
  } else if (delayedGoals.length > 0) {
    topPriority = `Review delayed goal "${delayedGoals[0].goal.title}" (${delayedGoals[0].pct}% complete).`;
  } else if (pendingHabits.length > 0) {
    topPriority = `Complete ${pendingHabits.length} scheduled habit(s) today (${pendingHabits.map((h) => h.name).slice(0, 2).join(', ')}).`;
  }

  const clientMap = new Map(clients.map((c) => [c.id, c.clientName]));

  // 10 Required Sections
  const sections: AiBriefingSection[] = [
    {
      number: 1,
      title: "Today's Top Priorities",
      summary: topPriority,
      items: [
        ...(overdueInvoices.length > 0
          ? [`Collect ${formatINR(overdueInvoices.reduce((s, d) => s + d.balancePaise, 0))} across ${overdueInvoices.length} overdue invoice(s).`]
          : []),
        ...(followUps.overdueFollowUps.length + followUps.todayFollowUps.length > 0
          ? [`Clear ${followUps.overdueFollowUps.length + followUps.todayFollowUps.length} CRM lead follow-up(s) due today or overdue.`]
          : []),
        ...(overdueProjects.length > 0
          ? [`Review ${overdueProjects.length} overdue project(s) with delivery owners.`]
          : []),
      ],
      route: '/dashboard',
      tone: riskFlags.length > 0 ? 'warning' : 'positive',
    },
    {
      number: 2,
      title: 'Personal Goals Due Soon or Delayed',
      summary:
        activeGoals.length === 0
          ? 'No data yet — add measurable personal goals.'
          : `${delayedGoals.length} delayed · ${dueSoonGoals.length} due within 7 days`,
      items: [
        ...delayedGoals.slice(0, 3).map((g) => `Delayed: ${g.goal.title} (${g.pct}%, target ${g.goal.targetDate})`),
        ...dueSoonGoals.slice(0, 3).map((g) => `Due soon: ${g.goal.title} (${g.pct}%, due ${g.goal.targetDate})`),
      ],
      route: '/goals',
      tone: delayedGoals.length > 0 ? 'warning' : 'normal',
    },
    {
      number: 3,
      title: 'Habits Pending Today & Streak Risks',
      summary:
        activeHabits.length === 0
          ? 'No data yet — create your daily habits.'
          : `${scheduledToday.length - pendingHabits.length}/${scheduledToday.length} scheduled done today · ${streakAtRiskHabits.length} streak(s) at risk`,
      items: pendingHabits.slice(0, 5).map((h) => {
        const st = calculateHabitStreaks(h, logsByHabit.get(h.id) ?? [], todayStr);
        return `${h.name}${st.currentStreak > 0 ? ` (${st.currentStreak} streak at risk)` : ' (pending today)'}`;
      }),
      route: '/habits',
      tone: streakAtRiskHabits.length > 0 ? 'warning' : 'normal',
    },
    {
      number: 4,
      title: 'Company Cashflow & Collections (This Month)',
      summary: `Cash basis (${currentMonth}): Collected ${formatINR(financeSummary.collectionsPaise)} · Expenses ${formatINR(financeSummary.expensesPaise)} · Net Profit ${formatINR(financeSummary.netProfitPaise)} (${formatPctOrNA(financeSummary.profitMarginPct)})`,
      items: [
        `Project collections: ${formatINR(financeSummary.projectCollectionsPaise)} · Other income: ${formatINR(financeSummary.otherIncomePaise)}`,
        `Total project outstanding receivables: ${formatINR(financeSummary.totalOutstandingPaise)}`,
      ],
      route: '/company/finance',
      tone: financeSummary.netProfitPaise >= 0 ? 'positive' : 'warning',
    },
    {
      number: 5,
      title: 'Overdue Invoices & Pending Payments',
      summary:
        invoices.length === 0
          ? 'No invoices logged yet.'
          : `${overdueInvoices.length} overdue · ${upcomingInvoices.length} due within 7 days`,
      items: [
        ...overdueInvoices
          .slice(0, 4)
          .map(
            (d) =>
              `${d.invoice.invoiceNumber} (${clientMap.get(d.invoice.clientId) || 'Client'}): ${formatINR(d.balancePaise)} · ${d.daysOverdue}d overdue`
          ),
        ...upcomingInvoices
          .slice(0, 3)
          .map(
            (d) =>
              `Upcoming: ${d.invoice.invoiceNumber} (${formatINR(d.balancePaise)}) due ${d.invoice.dueDate}`
          ),
      ],
      route: '/company/finance?tab=invoices',
      tone: overdueInvoices.length > 0 ? 'warning' : 'normal',
    },
    {
      number: 6,
      title: 'Leads Needing Follow-up Today or Overdue',
      summary:
        crm.totalLeads === 0
          ? 'No leads yet — add CRM inquiries.'
          : `${followUps.overdueFollowUps.length} overdue · ${followUps.todayFollowUps.length} due today · ${crm.conversionRatePct}% conversion`,
      items: [
        ...followUps.overdueFollowUps
          .slice(0, 4)
          .map((l) => `Overdue (${l.followUpDate}): ${l.clientName} — ${l.status}`),
        ...followUps.todayFollowUps
          .slice(0, 4)
          .map((l) => `Today: ${l.clientName} — ${l.status}`),
      ],
      route: '/company/leads',
      tone: followUps.overdueFollowUps.length > 0 ? 'warning' : 'normal',
    },
    {
      number: 7,
      title: 'Active Projects & Deadline Risks',
      summary:
        projects.length === 0
          ? 'No projects yet.'
          : `${activeProjects.length} active · ${overdueProjects.length} past due · ${dueSoonProjects.length} due within 7 days`,
      items: [
        ...overdueProjects
          .slice(0, 4)
          .map((r) => `Overdue: ${r.project.title} (due ${r.project.dueDate}, outstanding ${formatINR(r.outstandingPaise)})`),
        ...dueSoonProjects
          .slice(0, 3)
          .map((r) => `Due soon: ${r.project.title} (${r.project.dueDate})`),
      ],
      route: '/projects',
      tone: overdueProjects.length > 0 ? 'warning' : 'normal',
    },
    {
      number: 8,
      title: 'Budget Alerts (>80% Utilization)',
      summary:
        monthBudgets.length === 0
          ? `No budgets set for ${currentMonth}.`
          : budgetWarnings.length === 0
            ? `All ${monthBudgets.length} budgets for ${currentMonth} are below 80%.`
            : `${budgetWarnings.length} budget(s) >= 80% used in ${currentMonth}`,
      items: budgetWarnings
        .slice(0, 5)
        .map(
          (b) =>
            `${b.budget.budgetType} (${b.budget.target}): ${b.utilizationPct}% used (${formatINR(b.spentPaise)} / ${formatINR(b.budget.limitPaise)})`
        ),
      route: '/company/finance?tab=budgets',
      tone: budgetWarnings.length > 0 ? 'warning' : 'positive',
    },
    {
      number: 9,
      title: 'Competitor Status & Open Gaps',
      summary: activeTarget
        ? `Target: ${activeTarget.companyName} (${targetScorecard?.hasEnoughComparableData ? `Score ${targetScorecard.ownOverallScore} vs ${targetScorecard.competitorOverallScore}` : 'More verified evidence needed'}) · ${openGaps.length} open gap(s)`
        : `${competitors.length} competitor(s) tracked · ${openGaps.length} open gap(s)`,
      items: [
        ...(staleCompetitors.length > 0
          ? [`Stale (>90d) evidence on: ${staleCompetitors.slice(0, 3).map((c) => c.companyName).join(', ')}`]
          : []),
        ...openGaps.slice(0, 3).map((g) => `Gap (${g.priority}): ${g.title} — ${g.progressPct}%`),
      ],
      route: '/competition',
      tone: staleCompetitors.length > 0 ? 'warning' : 'normal',
    },
    {
      number: 10,
      title: 'Recommended Actions',
      summary: 'Concrete steps prioritized from today’s verified GoalX state',
      items: [
        topPriority,
        ...(budgetWarnings.length > 0 ? [`Review ${budgetWarnings[0].budget.target} spend before month end.`] : []),
        ...(staleCompetitors.length > 0 ? [`Verify fresh public evidence for ${staleCompetitors[0].companyName}.`] : []),
        ...(pendingHabits.length > 0 ? [`Check in ${pendingHabits.length} pending habit(s) before tonight.`] : []),
      ].slice(0, 5),
      route: '/ai-ceo',
      tone: 'normal',
    },
  ];

  const overview =
    briefingType === 'weekly'
      ? `Weekly executive summary across ${activeGoals.length} personal goals, ${activeProjects.length} active projects, ${crm.totalLeads} CRM leads, and ${formatINR(financeSummary.collectionsPaise)} collected in ${currentMonth} (cash basis).`
      : briefingType === 'monthly'
        ? `Monthly strategic overview for ${currentMonth}: ${formatINR(financeSummary.collectionsPaise)} collected (cash basis), ${formatINR(financeSummary.netProfitPaise)} net profit, ${crm.conversionRatePct}% lead conversion, and ${openGaps.length} open competitive gaps.`
        : `${riskFlags.length} active risk flag(s) detected · Cash collections ${formatINR(financeSummary.collectionsPaise)} (${currentMonth}) · ${overdueInvoices.length} overdue invoice(s) · ${followUps.overdueFollowUps.length} overdue follow-up(s).`;

  const metricsDigestForAi = sections
    .map((s) => `${s.number}. ${s.title}: ${s.summary}\n   Items: ${s.items.join(' | ') || 'None'}`)
    .join('\n');

  return {
    greeting,
    overview,
    sections,
    riskFlags,
    topPriority,
    metricsDigestForAi,
  };
}

/**
 * Computes real 3-month company baseline metrics vs planning targets (30/60/90 day review).
 * Explicitly flags insufficient (<1 month) data rather than pretending targets are valid.
 */
export function computeThreeMonthBaseline(dataset: FullAiDatasetInput): {
  reviewDate: string;
  monthsOfData: number;
  reliableBaseline: boolean;
  warningMessage: string;
  summary: string;
  metrics: BaselineMetricComparison[];
  default30DayTargets: string[];
  default60DayTargets: string[];
  default90DayTargets: string[];
  defaultSuggestions: string[];
} {
  const { uid, todayStr } = dataset;
  const leads = filterOwned(dataset.leads, uid).filter((l) => !l.archived);
  const projects = filterOwned(dataset.projects, uid);
  const projectPayments = filterOwned(dataset.projectPayments, uid);
  const otherIncome = filterOwned(dataset.otherIncome, uid);
  const businessExpenses = filterOwned(dataset.businessExpenses, uid);
  const savedOwnMetrics = filterOwned(dataset.ownMetrics, uid);

  const curMonth = todayStr.slice(0, 7);
  const prev1 = getPreviousMonthKey(curMonth);
  const prev2 = getPreviousMonthKey(prev1);
  const windowMonths = [prev2, prev1, curMonth];
  const windowStart = `${prev2}-01`;

  // Count distinct active months with real operational dates across finance/leads/projects
  const activeMonthSet = new Set<string>();
  for (const l of leads) {
    if (l.leadGeneratedDate) activeMonthSet.add(l.leadGeneratedDate.slice(0, 7));
  }
  for (const p of projects) {
    if (p.startDate) activeMonthSet.add(p.startDate.slice(0, 7));
  }
  for (const pay of projectPayments) {
    if (!pay.isDeleted && pay.date) activeMonthSet.add(pay.date.slice(0, 7));
  }
  for (const inc of otherIncome) {
    if (!inc.isDeleted && inc.date) activeMonthSet.add(inc.date.slice(0, 7));
  }
  for (const exp of businessExpenses) {
    if (!exp.isDeleted && exp.date) activeMonthSet.add(exp.date.slice(0, 7));
  }

  const monthsInWindow = windowMonths.filter((m) => activeMonthSet.has(m)).length;
  const monthsOfData = Math.max(monthsInWindow, activeMonthSet.size);
  const reliableBaseline = monthsOfData >= 1;

  const warningMessage = reliableBaseline
    ? monthsOfData < 3
      ? `Partial baseline (${monthsOfData} month(s) of data recorded; full 3-month trend stabilizes after 90 days).`
      : ''
    : 'Not enough data yet: Less than 1 full month of GoalX operational history exists. Planning assumptions below cannot be reliably validated until real leads, projects, and payments are logged.';

  const windowLeads = leads.filter((l) => l.leadGeneratedDate >= windowStart && l.leadGeneratedDate <= todayStr);
  const wonWindowLeads = windowLeads.filter((l) => l.status === 'Won');
  const conversionPct =
    windowLeads.length > 0 ? Math.round((wonWindowLeads.length / windowLeads.length) * 1000) / 10 : null;

  const windowProjects = projects.filter(
    (p) => p.status !== 'Cancelled' && p.startDate >= windowStart && p.startDate <= todayStr
  );
  const completedWithDue = windowProjects.filter((p) => p.status === 'Completed' && Boolean(p.dueDate));
  const onTimeCount = completedWithDue.filter((p) => p.dueDate >= p.startDate).length;
  const onTimePct =
    completedWithDue.length > 0 ? Math.round((onTimeCount / completedWithDue.length) * 1000) / 10 : null;

  const summary3Mo = computeCompanyFinanceSummary({
    projects,
    projectPayments,
    otherIncome,
    businessExpenses,
    startDate: windowStart,
    endDate: todayStr,
    basis: 'cash',
  });

  const confirmedBudgetsPaise = projects
    .filter((p) => p.status !== 'Cancelled' && p.status !== 'Planning')
    .reduce((s, p) => s + p.budgetPaise, 0);
  const allProjReceivedPaise = projectPayments
    .filter((p) => !p.isDeleted)
    .reduce((s, p) => s + p.amountPaise, 0);
  const collectionRatePct =
    confirmedBudgetsPaise > 0
      ? Math.min(100, Math.round((allProjReceivedPaise / confirmedBudgetsPaise) * 1000) / 10)
      : null;

  const googleReviewMetric = savedOwnMetrics.find((m) => m.metricKey === 'dig_google_business');
  const hasSatisfaction = Boolean(googleReviewMetric && googleReviewMetric.dataStatus !== 'Unknown' && googleReviewMetric.rating > 0);

  const metrics: BaselineMetricComparison[] = [
    {
      metric: 'Lead Conversion Rate',
      companyValue: conversionPct !== null ? `${conversionPct}% (${wonWindowLeads.length}/${windowLeads.length})` : 'Insufficient Data',
      targetValue: `>= ${PLANNING_KPI_TARGETS.leadConversionRatePct}%`,
      status:
        conversionPct === null
          ? 'Insufficient Data'
          : conversionPct >= PLANNING_KPI_TARGETS.leadConversionRatePct
            ? 'Ahead'
            : 'Behind',
      suggestedAdjustedTarget:
        conversionPct === null
          ? 'Log 10+ qualified leads in next 30 days to establish baseline'
          : conversionPct < 15
            ? `Step-up to ${Math.min(20, Math.round(conversionPct + 5))}% over 60 days`
            : `Sustain >= ${Math.max(20, Math.round(conversionPct))}%`,
    },
    {
      metric: 'On-Time Project Delivery',
      companyValue: onTimePct !== null ? `${onTimePct}% (${onTimeCount}/${completedWithDue.length})` : 'Insufficient Data',
      targetValue: `>= ${PLANNING_KPI_TARGETS.onTimeDeliveryPct}%`,
      status:
        onTimePct === null
          ? 'Insufficient Data'
          : onTimePct >= PLANNING_KPI_TARGETS.onTimeDeliveryPct
            ? 'Ahead'
            : 'Behind',
      suggestedAdjustedTarget:
        onTimePct === null
          ? 'Track due dates on active projects to calibrate SLA'
          : onTimePct < 85
            ? `Target ${Math.min(90, Math.round(onTimePct + 8))}% within 60 days`
            : `Maintain >= ${PLANNING_KPI_TARGETS.onTimeDeliveryPct}%`,
    },
    {
      metric: 'Collection Rate (Confirmed Projects)',
      companyValue: collectionRatePct !== null ? `${collectionRatePct}%` : 'Insufficient Data',
      targetValue: `>= ${PLANNING_KPI_TARGETS.collectionRatePct}%`,
      status:
        collectionRatePct === null
          ? 'Insufficient Data'
          : collectionRatePct >= PLANNING_KPI_TARGETS.collectionRatePct
            ? 'Ahead'
            : 'Behind',
      suggestedAdjustedTarget:
        collectionRatePct === null
          ? 'Enforce 40% advance + milestone invoicing on first projects'
          : collectionRatePct < 90
            ? `Reach ${Math.min(95, Math.round(collectionRatePct + 10))}% via automated invoice follow-ups`
            : `Maintain >= ${PLANNING_KPI_TARGETS.collectionRatePct}%`,
    },
    {
      metric: 'Client Satisfaction',
      companyValue: hasSatisfaction ? `${googleReviewMetric!.value} (Rating ${googleReviewMetric!.rating}/5)` : 'Unknown (not yet logged)',
      targetValue: `>= ${PLANNING_KPI_TARGETS.clientSatisfactionRating} / 5`,
      status: !hasSatisfaction
        ? 'Insufficient Data'
        : googleReviewMetric!.rating >= PLANNING_KPI_TARGETS.clientSatisfactionRating
          ? 'Ahead'
          : 'Behind',
      suggestedAdjustedTarget: 'Collect post-delivery review & Google Maps rating from every completed client',
    },
    {
      metric: 'Net Profit Margin (Cash Basis)',
      companyValue:
        summary3Mo.revenuePaise > 0
          ? `${formatPctOrNA(summary3Mo.profitMarginPct)} (Rev ${formatINR(summary3Mo.revenuePaise)}, Exp ${formatINR(summary3Mo.expensesPaise)})`
          : 'N/A (₹0 collected in window)',
      targetValue: `>= ${PLANNING_KPI_TARGETS.netProfitMarginPct}%`,
      status:
        summary3Mo.profitMarginPct === null
          ? 'Insufficient Data'
          : summary3Mo.profitMarginPct >= PLANNING_KPI_TARGETS.netProfitMarginPct
            ? 'Ahead'
            : 'Behind',
      suggestedAdjustedTarget:
        summary3Mo.profitMarginPct === null
          ? 'Record 30 days of collections & operating expenses before setting fixed % margin'
          : summary3Mo.profitMarginPct < 15
            ? 'Focus on high-margin AI / SCADA retainers & expense discipline for 60 days'
            : `Target ${Math.round(summary3Mo.profitMarginPct + 2)}% margin`,
    },
  ];

  const default30DayTargets = [
    conversionPct === null
      ? 'Log at least 10 leads and follow up 100% within 24 hours'
      : `Lift lead conversion from ${conversionPct}% toward ${Math.min(20, Math.round(conversionPct + 4))}%`,
    `Collect outstanding project receivables (${formatINR(summary3Mo.totalOutstandingPaise)})`,
  ];
  const default60DayTargets = [
    `Achieve >= ${onTimePct !== null ? Math.min(90, Math.round(onTimePct + 5)) : 85}% on-time project delivery across active builds`,
    'Publish 3 quantified case studies & collect verified Google client reviews',
  ];
  const default90DayTargets = [
    `Sustain >= ${PLANNING_KPI_TARGETS.netProfitMarginPct}% cash-basis net profit margin and >= ${PLANNING_KPI_TARGETS.collectionRatePct}% collections`,
    'Convert 2 project clients onto recurring AMC / SEO / cloud retainers',
  ];

  const defaultSuggestions = [
    reliableBaseline
      ? `Based on ${monthsOfData} month(s) of real GoalX history: cash collections totaled ${formatINR(summary3Mo.collectionsPaise)} with ${windowLeads.length} leads.`
      : 'Baseline warning: Fewer than 1 full month of operational records exist — start with 30-day data capture goals before locking aggressive quarterly revenue quotas.',
    ...metrics.filter((m) => m.status === 'Behind').map((m) => `${m.metric} is behind target (${m.companyValue} vs ${m.targetValue}): ${m.suggestedAdjustedTarget}.`),
  ];

  return {
    reviewDate: todayStr,
    monthsOfData,
    reliableBaseline,
    warningMessage,
    summary: `3-Month Company Baseline (${windowStart} to ${todayStr}, Cash Basis): ${formatINR(summary3Mo.collectionsPaise)} collected, ${formatINR(summary3Mo.expensesPaise)} expenses, ${windowLeads.length} leads (${wonWindowLeads.length} won).`,
    metrics,
    default30DayTargets,
    default60DayTargets,
    default90DayTargets,
    defaultSuggestions,
  };
}

export { DEFAULT_SCORECARD_WEIGHTS };
