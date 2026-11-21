import { Timestamp } from 'firebase/firestore';

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';

export interface UserProfile {
  ownerId: string;
  name: string;
  email: string;
  photoUrl: string;
  monthlyIncome: number | null;
  currency: string;
  timezone?: string;
  bio?: string;
  personalGoals: string[];
  onboardingCompleted: boolean;
  xp: number;
  level: number;
  streakDays: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CompanyProfile {
  ownerId: string;
  name: string;
  website: string;
  industry: string;
  services: string[];
  location: string;
  startDate: string;
  stage: string;
  goals: string[];
  monthlyRevenue: number | null;
  activeProjectsCount: number | null;
  competitorsTrackedCount: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ThemeMode = 'light' | 'dark';
export type DisplayDensity = 'comfortable' | 'compact';
export type CurrencyFormatMode = 'indian' | 'standard';

export type NotificationCategory =
  | 'deadlines'
  | 'projects'
  | 'follow_ups'
  | 'payments'
  | 'goals'
  | 'habits'
  | 'attendance'
  | 'competitor_reviews'
  | 'achievements'
  | 'targets'
  | 'ai_proposals';

export interface NotificationPreferences {
  categories: Record<NotificationCategory, boolean>;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:mm e.g. "22:00"
  quietHoursEnd: string;   // HH:mm e.g. "07:00"
}

export interface GamificationXpConfig {
  taskComplete: number;
  goalComplete: number;
  milestoneComplete: number;
  habitCheckIn: number;
  projectComplete: number;
  clientWon: number;
  competitorSurpassed: number;
  monthlyReviewSaved: number;
}

export type XpSourceType =
  | 'task'
  | 'habit'
  | 'milestone'
  | 'goal'
  | 'project'
  | 'lead'
  | 'target'
  | 'competitor_review'
  | 'gap_closed'
  | 'competitor_surpassed'
  | 'achievement';

export interface XpTransaction {
  id: string;
  ownerId: string;
  amount: number;
  reason: string;
  sourceType: XpSourceType;
  sourceId: string;
  date: string; // YYYY-MM-DD
  createdAt: Timestamp | string;
}

export interface UserXpSummary {
  id: string;
  ownerId: string;
  totalXp: number;
  level: number;
  streakDays: number;
  totalTransactions: number;
  lastAwardedAt?: string;
  updatedAt: Timestamp | string;
}

export type AchievementCategory = 'personal' | 'business' | 'competitor' | 'mastery';

export interface AchievementItem {
  id: string;
  ownerId?: string;
  achievementKey: string;
  title: string;
  description: string;
  category: AchievementCategory;
  iconName: string;
  rewardXp: number;
  requiredCount: number;
  currentCount?: number;
  isUnlocked: boolean;
  unlockedAt?: string | null;
  updatedAt?: Timestamp | string;
}

export interface WeeklyXpPoint {
  day: string; // 'Mon', 'Tue', etc.
  date: string; // 'YYYY-MM-DD'
  xp: number;
}

export interface GamificationSummaryResponse {
  userXp: UserXpSummary;
  recentTransactions: XpTransaction[];
  achievements: AchievementItem[];
  weeklyBreakdown: WeeklyXpPoint[];
  weekTotalXp: number;
  syncResult?: {
    newTransactionsCount: number;
    awardedXp: number;
    newAchievementsCount: number;
  };
}

export interface UserSettings {
  ownerId: string;
  theme: ThemeMode;
  density?: DisplayDensity;
  reducedMotion?: boolean;
  notificationsEnabled: boolean;
  emailDigest: boolean;
  browserPushEnabled?: boolean;
  notificationPrefs?: NotificationPreferences;
  weekStartsOn: 'monday' | 'sunday';
  currency: string;
  currencyFormat?: CurrencyFormatMode;
  accountingBasis?: 'cash' | 'accrual';
  timezone?: string;
  sidebarCollapsed: boolean;
  defaultCommissionPct?: number;
  customExpenseCategories?: string[];
  gamificationConfig?: GamificationXpConfig;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

// ---------------------------------------------------------------------------
// Phase 2: Personal Management Types
// ---------------------------------------------------------------------------

export type GoalPriority = 'Low' | 'Medium' | 'High';

export type GoalType =
  | 'Numeric'
  | 'Financial'
  | 'Percentage'
  | 'Task-based'
  | 'Time-based'
  | 'Learning'
  | 'Custom measurable';

export type GoalStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Delayed'
  | 'Archived';

export interface PersonalGoal {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  category: string;
  startDate: string;
  targetDate: string;
  priority: GoalPriority;
  goalType: GoalType;
  targetValue: number;
  currentValue: number;
  unit: string;
  notes: string;
  status: GoalStatus;
  sourceType?: 'manual' | 'competitiveGap' | 'aiProposal';
  sourceId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GoalMilestone {
  id: string;
  ownerId: string;
  goalId: string;
  title: string;
  completed: boolean;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GoalProgressEntry {
  id: string;
  ownerId: string;
  goalId: string;
  value: number;
  delta: number;
  date: string;
  note: string;
  createdAt: Timestamp;
}

export type HabitScheduleType = 'daily' | 'weekdays' | 'weekly_target';

export interface Habit {
  id: string;
  ownerId: string;
  name: string;
  icon: string;
  scheduleType: HabitScheduleType;
  weekdays: number[]; // 0 (Sun) - 6 (Sat)
  weeklyTarget: number; // 1 - 7
  reminderTime: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface HabitLog {
  id: string;
  ownerId: string;
  habitId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type IncomeType = 'Salary' | 'Freelance' | 'Business' | 'Other';

export interface PersonalIncome {
  id: string;
  ownerId: string;
  source: string;
  type: IncomeType;
  amountPaise: number;
  date: string;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PersonalExpense {
  id: string;
  ownerId: string;
  category: string;
  amountPaise: number;
  date: string;
  paymentMethod: string;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SavingsGoal {
  id: string;
  ownerId: string;
  name: string;
  targetAmountPaise: number;
  targetDate: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SavingsTransaction {
  id: string;
  ownerId: string;
  savingsGoalId: string;
  type: 'deposit' | 'withdraw';
  amountPaise: number;
  date: string;
  notes: string;
  createdAt: Timestamp;
}

export type CalendarEventType =
  | 'Personal Event'
  | 'Goal Deadline'
  | 'Habit Reminder'
  | 'Project Deadline'
  | 'Client Follow-up'
  | 'Payment Due'
  | 'Team Meeting'
  | 'Competitor Review'
  | 'Gap Deadline'
  | 'Monthly Competitor Review';

export type CalendarSourceType =
  | 'manual'
  | 'goal'
  | 'habit'
  | 'lead'
  | 'project'
  | 'client'
  | 'payment'
  | 'invoice'
  | 'meeting'
  | 'competitor'
  | 'competitiveGap'
  | 'aiProposal';

export interface CalendarEvent {
  id: string;
  ownerId: string;
  title: string;
  eventType: CalendarEventType;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  notes: string;
  reminderMinutes: number | null;
  sourceType: CalendarSourceType;
  sourceId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Phase 3A: Business Foundation Types
// ---------------------------------------------------------------------------

export type BusinessServiceStatus = 'Active' | 'Planned' | 'Inactive';

export interface BusinessService {
  id: string;
  ownerId: string;
  companyId: string;
  name: string;
  description: string;
  startingPricePaise: number;
  estimatedDeliveryDays: number;
  status: BusinessServiceStatus;
  subServices: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type LeadSource =
  | 'Meta Ads'
  | 'Direct'
  | 'Referral'
  | 'Telecalling'
  | 'Website'
  | 'Repeat Client'
  | 'Social Media'
  | 'Other';

export type LeadStatus =
  | 'New'
  | 'Contacted'
  | 'Interested'
  | 'Follow-up'
  | 'Proposal Sent'
  | 'Negotiation'
  | 'Won'
  | 'Lost';

export interface Lead {
  id: string;
  ownerId: string;
  companyId: string;
  clientName: string;
  businessName: string;
  phone: string;
  email: string;
  location: string;
  requirement: string;
  serviceId: string;
  serviceCategory: string;
  leadSource: LeadSource;
  leadGeneratedDate: string;
  assignedPerson: string;
  estimatedBudgetPaise: number;
  followUpDate: string;
  notes: string;
  status: LeadStatus;
  lostReason: string;
  archived: boolean;
  convertedClientId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LeadActivity {
  id: string;
  ownerId: string;
  companyId: string;
  leadId: string;
  fromStatus: string;
  toStatus: LeadStatus;
  date: string;
  note: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type LeadNoteChannel = 'call' | 'whatsapp' | 'email' | 'meeting' | 'note';

export interface LeadNote {
  id: string;
  ownerId: string;
  companyId: string;
  leadId: string;
  channel: LeadNoteChannel;
  date: string;
  text: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ClientStatus = 'Active' | 'Inactive' | 'Recurring';

export interface Client {
  id: string;
  ownerId: string;
  companyId: string;
  clientName: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  sourceLeadId: string;
  serviceId: string;
  serviceCategory: string;
  clientManager: string;
  notes: string;
  status: ClientStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Phase 3B (Supporting) & Phase 4: Company Financial Management Types
// ---------------------------------------------------------------------------

export type ProjectStatus = 'Planning' | 'In Progress' | 'Completed' | 'On Hold' | 'Cancelled';

export interface Project {
  id: string;
  ownerId: string;
  companyId: string;
  title: string;
  clientId: string;
  serviceId: string;
  serviceCategory: string;
  assignedMemberId: string;
  budgetPaise: number;
  status: ProjectStatus;
  startDate: string;
  dueDate: string;
  description: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type FinancePaymentMethod = 'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque' | 'Card' | 'Other';
export type ProjectPaymentType = 'Advance' | 'Partial' | 'Final';

export interface ProjectPayment {
  id: string;
  ownerId: string;
  companyId: string;
  projectId: string;
  clientId: string;
  amountPaise: number;
  date: string;
  method: FinancePaymentMethod;
  paymentType: ProjectPaymentType;
  invoiceNumber: string;
  notes: string;
  isDeleted: boolean;
  deletedAt: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TeamMemberStatus = 'Active' | 'Inactive';

export interface TeamMember {
  id: string;
  ownerId: string;
  companyId: string;
  name: string;
  role: string;
  department: string;
  email: string;
  phone: string;
  status: TeamMemberStatus;
  joinedDate: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TeamMemberPrivate {
  id: string;
  ownerId: string;
  companyId: string;
  memberId: string;
  baseSalaryPaise: number;
  commissionRatePct: number | null;
  bankNotes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OtherIncome {
  id: string;
  ownerId: string;
  companyId: string;
  source: string;
  clientId: string;
  amountPaise: number;
  date: string;
  method: FinancePaymentMethod;
  notes: string;
  isDeleted: boolean;
  deletedAt: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Invoice {
  id: string;
  ownerId: string;
  companyId: string;
  invoiceNumber: string;
  clientId: string;
  projectId: string;
  amountPaise: number;
  issueDate: string;
  dueDate: string;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DerivedInvoiceStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Overdue';

export interface BusinessExpense {
  id: string;
  ownerId: string;
  companyId: string;
  title: string;
  category: string;
  amountPaise: number;
  date: string;
  paymentMethod: FinancePaymentMethod;
  paidBy: string;
  description: string;
  serviceId: string;
  projectId: string;
  attachmentUrl: string;
  attachmentName: string;
  recurringTemplateId: string;
  recurringMonth: string;
  salaryRecordId: string;
  isDeleted: boolean;
  deletedAt: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RecurringExpenseTemplate {
  id: string;
  ownerId: string;
  companyId: string;
  title: string;
  category: string;
  amountPaise: number;
  dayOfMonth: number;
  paymentMethod: FinancePaymentMethod;
  paidBy: string;
  description: string;
  serviceId: string;
  projectId: string;
  active: boolean;
  lastGeneratedMonth: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SalaryStatus = 'Pending' | 'Paid';

export interface SalaryRecord {
  id: string;
  ownerId: string;
  companyId: string;
  memberId: string;
  month: string; // yyyy-MM
  baseSalaryPaise: number;
  commissionPaise: number;
  commissionPctUsed: number;
  commissionOverride: boolean;
  commissionNote: string;
  incentivePaise: number;
  deductionsPaise: number;
  netPayablePaise: number;
  status: SalaryStatus;
  paidDate: string;
  paymentMethod: FinancePaymentMethod | '';
  linkedExpenseId: string;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type BudgetType = 'Monthly Overall' | 'Service' | 'Marketing' | 'Team' | 'Category';

export interface Budget {
  id: string;
  ownerId: string;
  companyId: string;
  budgetType: BudgetType;
  target: string;
  month: string; // yyyy-MM
  limitPaise: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type FinanceAuditEntityType = 'projectPayment' | 'otherIncome' | 'businessExpense';
export type FinanceAuditAction = 'update' | 'soft_delete' | 'restore';

export interface FinanceAuditLog {
  id: string;
  ownerId: string;
  companyId: string;
  entityType: FinanceAuditEntityType;
  entityId: string;
  action: FinanceAuditAction;
  actorName: string;
  actorUid: string;
  timestampIso: string;
  oldValueSummary: string;
  newValueSummary: string;
  createdAt: Timestamp;
}

export type InAppNotificationType = 'budget_80' | 'budget_100';

export interface InAppNotification {
  id: string;
  ownerId: string;
  companyId: string;
  type: InAppNotificationType;
  title: string;
  message: string;
  month: string;
  sourceId: string;
  read: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AccountingBasis = 'cash' | 'accrual';

// ---------------------------------------------------------------------------
// Phase 5A: Competitor Discovery, Evidence & Research Types
// ---------------------------------------------------------------------------

export type MarketLevel = 'Local' | 'Tamil Nadu' | 'India';

export type CompetitorClassification =
  | 'Direct Competitor'
  | 'Indirect Competitor'
  | 'Service-Specific Competitor'
  | 'Regional Benchmark'
  | 'National Benchmark';

export type CompetitorThreatLevel = 'Low' | 'Medium' | 'High' | 'Unknown';

export type CompetitorStatus = 'Active' | 'Watching' | 'Candidate' | 'Inactive' | 'Archived' | 'Surpassed';

export type CompetitorVerificationStatus = 'Unverified' | 'Partially Verified' | 'Verified';

export type DataStatus = 'Verified' | 'User Entered' | 'Estimated' | 'Unknown';

export type EvidenceCategory = 'Services' | 'Digital Presence' | 'Technology' | 'Business Evidence';

export type ServiceOfferStatus = '' | 'Offered' | 'Partially Offered' | 'Not Offered' | 'Unknown';

export type CompetitorConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface Competitor {
  id: string;
  ownerId: string;
  companyId: string;
  companyName: string;
  website: string;
  location: string;
  marketLevel: MarketLevel;
  classification: CompetitorClassification;
  foundedYear: string; // "Unknown" unless verified
  description: string;
  industriesServed: string[];
  primaryServices: string[];
  pricingModel: string;
  targetAudience: string;
  threatLevel: CompetitorThreatLevel;
  status: CompetitorStatus;
  verificationStatus: CompetitorVerificationStatus;
  isActiveTarget?: boolean;
  surpassedDate?: string;
  surpassVerificationRunId?: string;
  surpassPrevReviewId?: string;
  surpassCurrReviewId?: string;
  nextReviewDate: string; // YYYY-MM-DD or ""
  lastVerifiedDate: string; // YYYY-MM-DD or ""
  notes: string;
  seedKey?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CompetitorMetric {
  id: string;
  ownerId: string;
  companyId: string;
  competitorId: string;
  metricKey: string;
  metricName: string;
  category: EvidenceCategory;
  value: string;
  serviceOfferStatus: ServiceOfferStatus;
  rating?: number; // 1-5 or 0 if unrated
  scorecardGroup?: '' | ScorecardType;
  sourceUrl: string;
  evidenceDescription: string;
  dataStatus: DataStatus;
  lastVerifiedDate: string; // YYYY-MM-DD or ""
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CompetitorEvidenceOrigin = 'Manual' | 'AI Accepted' | 'AI Edited';

export interface CompetitorEvidence {
  id: string;
  ownerId: string;
  companyId: string;
  competitorId: string;
  metricId: string;
  metricKey: string;
  category: EvidenceCategory;
  metricName: string;
  value: string;
  sourceUrl: string;
  sourceTitle: string;
  evidenceDescription: string;
  dataStatus: DataStatus;
  lastVerifiedDate: string; // YYYY-MM-DD or ""
  origin: CompetitorEvidenceOrigin;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CompetitorResearchAction =
  | 'research_competitor'
  | 'analyze_website'
  | 'discover_competitors'
  | 'manual_research';

export type CompetitorResearchRunStatus = 'Completed' | 'Unavailable' | 'Failed';

export interface CompetitorResearchHistory {
  id: string;
  ownerId: string;
  companyId: string;
  competitorId: string; // "" for general discovery
  action: CompetitorResearchAction;
  targetLabel: string;
  targetUrl: string;
  runDate: string; // YYYY-MM-DD
  status: CompetitorResearchRunStatus;
  groundingUsed: boolean;
  summary: string;
  searchQueries: string[];
  sourceUrls: string[];
  findingsCount: number;
  acceptedCount: number;
  rejectedCount: number;
  errorMessage: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PendingFindingDecision = 'Pending' | 'Accepted' | 'Edited' | 'Rejected';

export type PendingFindingKind = 'metric' | 'candidate_discovery';

export interface CompetitorPendingFinding {
  id: string;
  ownerId: string;
  companyId: string;
  researchRunId: string;
  competitorId: string; // "" for candidate discovery
  findingKind: PendingFindingKind;
  category: EvidenceCategory | 'Candidate Discovery';
  metricKey: string;
  metricName: string;
  proposedValue: string;
  sourceUrl: string;
  sourceTitle: string;
  evidenceDescription: string;
  confidenceNote: string;
  dataStatus: DataStatus;
  decision: PendingFindingDecision;
  aiAssisted: boolean;
  candidateName: string;
  candidateLocation: string;
  candidateMarketLevel: MarketLevel | '';
  candidateClassification: CompetitorClassification | '';
  candidateServices: string[];
  reviewedAt: string;
  reviewedValue: string;
  reviewedDataStatus: DataStatus | '';
  reviewedNotes: string;
  acceptedEvidenceId: string;
  createdCandidateId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Phase 5B: Scorecards, Comparison, Gap Analysis & Progression Types
// ---------------------------------------------------------------------------

export type ScorecardDimensionKey =
  | 'revenue_growth'
  | 'client_acquisition'
  | 'project_delivery'
  | 'service_portfolio'
  | 'technology_innovation'
  | 'portfolio_quality'
  | 'customer_reputation'
  | 'digital_presence'
  | 'team_operations'
  | 'pricing_value';

export type ScorecardType = 'Market Presence' | 'Business Performance';

export type OwnMetricSourceType = 'Calculated from GoalX data' | 'User entered';

export interface OwnMetric {
  id: string;
  ownerId: string;
  companyId: string;
  metricKey: string;
  metricName: string;
  dimensionKey: ScorecardDimensionKey;
  scorecardType: ScorecardType;
  value: string;
  rating: number; // 0 if unrated/unknown, or 1-5
  score: number; // 0-100
  sourceType: OwnMetricSourceType;
  sourceUrl: string;
  evidenceDescription: string;
  dataStatus: DataStatus;
  lastVerifiedDate: string; // YYYY-MM-DD or ""
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ScorecardWeights = Record<ScorecardDimensionKey, number>;

export interface RatingScoreMap {
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  r5: number;
}

export interface CompetitorScoreConfig {
  id: string;
  ownerId: string;
  companyId: string;
  weights: ScorecardWeights;
  ratingScoreMap: RatingScoreMap;
  minComparableMetrics: number;
  minScoreAdvantage: number;
  minEvidenceCoveragePct: number;
  minConsecutiveMonths: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CompetitorComparison {
  id: string;
  ownerId: string;
  companyId: string;
  competitorId: string;
  competitorName: string;
  snapshotKind: 'comparison' | 'surpassed_archive';
  month: string;
  ownOverallScore: number;
  competitorOverallScore: number;
  ownMarketPresenceScore: number;
  competitorMarketPresenceScore: number;
  ownBusinessPerformanceScore: number;
  competitorBusinessPerformanceScore: number;
  comparableCount: number;
  ownLeadCount: number;
  competitorLeadCount: number;
  equalCount: number;
  missingCount: number;
  scoreAdvantage: number;
  aheadMetrics: string[];
  behindMetrics: string[];
  equalMetrics: string[];
  missingMetrics: string[];
  gapsClosedCount: number;
  notes: string;
  createdAt: Timestamp;
}

export interface CompetitorMonthlyReview {
  id: string;
  ownerId: string;
  companyId: string;
  competitorId: string;
  month: string; // YYYY-MM
  version: number;
  reviewDate: string; // YYYY-MM-DD
  ownOverallScore: number;
  competitorOverallScore: number;
  scoreAdvantage: number;
  ownMarketPresenceScore: number;
  competitorMarketPresenceScore: number;
  ownBusinessPerformanceScore: number;
  competitorBusinessPerformanceScore: number;
  comparableCount: number;
  ownLeadsCount: number;
  evidenceCoveragePct: number;
  eligibleForSurpass: boolean;
  summary: string;
  createdAt: Timestamp;
}

export type CompetitiveGapStatus = 'Open' | 'In Progress' | 'Done' | 'Dismissed';
export type GapActionOrigin = 'rule' | 'AI-assisted';

export interface CompetitiveGap {
  id: string;
  ownerId: string;
  companyId: string;
  title: string;
  description: string;
  linkedCompetitorIds: string[];
  linkedMetricKey: string;
  evidenceIds: string[];
  businessImpact: GoalPriority;
  priority: GoalPriority;
  estimatedEffort: GoalPriority;
  suggestedAction: string;
  suggestedActionOrigin: GapActionOrigin;
  deadline: string; // YYYY-MM-DD or ""
  status: CompetitiveGapStatus;
  progressPct: number;
  convertedGoalId: string;
  convertedTaskId: string;
  calendarEventId: string;
  templateKey?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CompetitiveGoalLink {
  id: string;
  ownerId: string;
  companyId: string;
  gapId: string;
  targetType: 'goal' | 'task';
  goalId: string;
  taskId: string;
  competitorId: string;
  title: string;
  createdAt: Timestamp;
}

export type TaskPriority = 'Low' | 'Medium' | 'High';
export type TaskStatus = 'Todo' | 'In Progress' | 'Done';

export interface TaskItem {
  id: string;
  ownerId: string;
  companyId: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string; // YYYY-MM-DD or ""
  sourceType: 'manual' | 'competitiveGap' | 'aiProposal';
  sourceId: string;
  competitorId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RewardEvent {
  id: string;
  ownerId: string;
  companyId: string;
  type: 'competitor_surpassed';
  competitorId: string;
  competitorName: string;
  prevReviewId: string;
  currReviewId: string;
  scoreAdvantage: number;
  comparableCount: number;
  achievedDate: string;
  xpAwarded: number; // 0 in Phase 5B
  processedByPhase6: boolean;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Phase 6B: GoalX AI CEO, Daily Briefing, Baseline Review & Action Proposals
// ---------------------------------------------------------------------------

export type AiArea =
  | 'personal'
  | 'finance'
  | 'leads'
  | 'projects'
  | 'team'
  | 'competition'
  | 'gamification';

export interface AiSourceCitation {
  label: string;
  route: string;
  count?: number;
}

export interface AiConversation {
  id: string;
  ownerId: string;
  companyId: string;
  title: string;
  areaHint: AiArea | 'general';
  lastMessagePreview: string;
  messageCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AiMessage {
  id: string;
  ownerId: string;
  companyId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  areaTags: AiArea[];
  sources: AiSourceCitation[];
  aiUnavailable: boolean;
  createdAt: Timestamp;
}

export type AiBriefingType = 'daily' | 'weekly' | 'monthly';

export interface AiBriefingSection {
  number: number;
  title: string;
  summary: string;
  items: string[];
  route: string;
  tone?: 'normal' | 'warning' | 'positive';
}

export interface AiBriefing {
  id: string;
  ownerId: string;
  companyId: string;
  briefingType: AiBriefingType;
  date: string; // YYYY-MM-DD (Asia/Kolkata)
  greeting: string;
  mode: 'ai' | 'rule_based';
  overview: string;
  sections: AiBriefingSection[];
  riskFlags: string[];
  topPriority: string;
  generatedAtIso: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AiActionType =
  | 'create_goal'
  | 'create_task'
  | 'create_calendar_event'
  | 'create_lead_followup'
  | 'create_competitive_gap';

export type AiActionStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Edited'
  | 'Rejected'
  | 'Executed'
  | 'Expired';

export interface AiActionRequest {
  id: string;
  ownerId: string;
  companyId: string;
  conversationId: string;
  messageId: string;
  actionType: AiActionType;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  status: AiActionStatus;
  expiresAtIso: string;
  executedRecordId?: string;
  executedRecordRoute?: string;
  decisionNote?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AiUsage {
  id: string; // `${uid}_${YYYY-MM-DD}`
  ownerId: string;
  companyId: string;
  date: string; // YYYY-MM-DD (Asia/Kolkata)
  chatCount: number;
  briefingCount: number;
  baselineCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BaselineMetricComparison {
  metric: string;
  companyValue: string;
  targetValue: string;
  status: 'Ahead' | 'Behind' | 'Insufficient Data' | 'Tracking';
  suggestedAdjustedTarget: string;
}

export interface BaselineReview {
  id: string;
  ownerId: string;
  companyId: string;
  reviewDate: string; // YYYY-MM-DD
  monthsOfData: number;
  reliableBaseline: boolean;
  warningMessage: string;
  summary: string;
  metrics: BaselineMetricComparison[];
  targets30Day: string[];
  targets60Day: string[];
  targets90Day: string[];
  suggestions: string[];
  mode: 'ai' | 'rule_based';
  createdAt: Timestamp;
}

export interface ActivityLog {
  id: string;
  ownerId: string;
  companyId: string;
  actorType: 'user' | 'ai_ceo';
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Phase 7A: Unified Notifications, Security Audit Logs & Deletion Audit
// ---------------------------------------------------------------------------

export type NotificationSeverity = 'info' | 'warning' | 'critical' | 'success';

export interface NotificationItem {
  id: string;
  ownerId: string;
  companyId: string;
  category: NotificationCategory;
  type: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  link: string;
  sourceType: string;
  sourceId: string;
  read: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SecurityAuditAction =
  | 'salary_view'
  | 'salary_export'
  | 'data_export'
  | 'ai_history_delete'
  | 'module_delete'
  | 'password_change'
  | 'account_delete'
  | 'settings_security_change'
  | 'financial_edit';

export interface SecurityAuditLog {
  id: string;
  ownerId: string;
  companyId: string;
  action: SecurityAuditAction;
  actorUid: string;
  actorName: string;
  details: string;
  timestampIso: string;
  createdAt: Timestamp;
}

