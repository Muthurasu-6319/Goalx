import { z } from 'zod';

// Synchronized verbatim with firebase-blueprint.json constraints
export const OWNER_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(200, 'Email must be 200 characters or less'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Full name is required').max(120, 'Name must be 120 characters or less'),
    email: z.string().trim().email('Enter a valid email address').max(200, 'Email must be 200 characters or less'),
    password: z.string().min(6, 'Password must be at least 6 characters').max(128),
    confirmPassword: z.string().min(6, 'Confirm your password').max(128),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(200),
});

export const optionalUrlSchema = z
  .string()
  .trim()
  .max(300, 'URL must be 300 characters or less')
  .refine((val) => val === '' || /^https?:\/\/.+/i.test(val), {
    message: 'Enter a valid URL starting with http:// or https://',
  });

export const optionalPhotoUrlSchema = z
  .string()
  .trim()
  .max(1000, 'Photo URL must be 1000 characters or less')
  .refine((val) => val === '' || /^https?:\/\/.+/i.test(val), {
    message: 'Enter a valid URL starting with http:// or https://',
  });

export const userProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  email: z.string().trim().email('Valid email required').max(200),
  photoUrl: optionalPhotoUrlSchema,
  monthlyIncome: z
    .union([z.number().min(0, 'Income cannot be negative'), z.nan(), z.null()])
    .transform((val) => (val === null || Number.isNaN(val) ? null : val)),
  currency: z.string().trim().min(1).max(10),
  timezone: z.string().trim().min(1).max(80).default('Asia/Kolkata'),
  bio: z.string().trim().max(500).default(''),
  personalGoals: z.array(z.string().trim().min(1).max(160)).max(20, 'Maximum 20 personal goals'),
});

export const companyProfileSchema = z.object({
  name: z.string().trim().min(1, 'Company name is required').max(160, 'Company name must be 160 characters or less'),
  website: optionalUrlSchema,
  industry: z.string().trim().min(1, 'Industry is required').max(160, 'Industry must be 160 characters or less'),
  services: z.array(z.string().trim().min(1).max(160)).max(30, 'Maximum 30 services'),
  location: z.string().trim().max(300, 'Location must be 300 characters or less'),
  startDate: z.string().trim().max(40, 'Start date must be 40 characters or less'),
  stage: z.string().trim().max(80, 'Stage must be 80 characters or less'),
  goals: z.array(z.string().trim().min(1).max(160)).max(20, 'Maximum 20 company goals'),
});

export const notificationCategorySchema = z.enum([
  'deadlines',
  'projects',
  'follow_ups',
  'payments',
  'goals',
  'habits',
  'attendance',
  'competitor_reviews',
  'achievements',
  'targets',
  'ai_proposals',
]);

export const notificationPrefsSchema = z.object({
  categories: z.object({
    deadlines: z.boolean(),
    projects: z.boolean(),
    follow_ups: z.boolean(),
    payments: z.boolean(),
    goals: z.boolean(),
    habits: z.boolean(),
    attendance: z.boolean(),
    competitor_reviews: z.boolean(),
    achievements: z.boolean(),
    targets: z.boolean(),
    ai_proposals: z.boolean(),
  }),
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
});

export const gamificationXpConfigSchema = z.object({
  taskComplete: z.number().int().min(0).max(5000),
  goalComplete: z.number().int().min(0).max(5000),
  milestoneComplete: z.number().int().min(0).max(5000),
  habitCheckIn: z.number().int().min(0).max(5000),
  projectComplete: z.number().int().min(0).max(5000),
  clientWon: z.number().int().min(0).max(5000),
  competitorSurpassed: z.number().int().min(0).max(10000),
  monthlyReviewSaved: z.number().int().min(0).max(5000),
});

export const appSettingsSchema = z.object({
  theme: z.enum(['light', 'dark']).default('light'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  reducedMotion: z.boolean().default(false),
  notificationsEnabled: z.boolean(),
  emailDigest: z.boolean(),
  browserPushEnabled: z.boolean().default(false),
  weekStartsOn: z.enum(['monday', 'sunday']),
  currency: z.string().trim().min(1).max(10),
  currencyFormat: z.enum(['indian', 'standard']).default('indian'),
  accountingBasis: z.enum(['cash', 'accrual']).default('cash'),
  timezone: z.string().trim().min(1).max(80).default('Asia/Kolkata'),
  defaultCommissionPct: z
    .number()
    .min(0, 'Commission % cannot be negative')
    .max(100, 'Commission % cannot exceed 100'),
});

export const quickMetricsSchema = z.object({
  monthlyRevenue: z
    .union([z.number().min(0, 'Revenue cannot be negative'), z.nan(), z.null()])
    .optional()
    .transform((val) => (val === undefined || val === null || Number.isNaN(val) ? null : val)),
  activeProjectsCount: z
    .union([z.number().int().min(0, 'Cannot be negative'), z.nan(), z.null()])
    .optional()
    .transform((val) => (val === undefined || val === null || Number.isNaN(val) ? null : val)),
  competitorsTrackedCount: z
    .union([z.number().int().min(0, 'Cannot be negative'), z.nan(), z.null()])
    .optional()
    .transform((val) => (val === undefined || val === null || Number.isNaN(val) ? null : val)),
});

// Phase 2 Schemas
export const personalGoalSchema = z
  .object({
    title: z.string().trim().min(1, 'Goal title is required').max(160, 'Max 160 characters'),
    description: z.string().trim().max(1000, 'Max 1000 characters'),
    category: z.string().trim().min(1, 'Category is required').max(80),
    startDate: z.string().trim().min(8, 'Start date required').max(20),
    targetDate: z.string().trim().min(8, 'Target date required').max(20),
    priority: z.enum(['Low', 'Medium', 'High']),
    goalType: z.enum([
      'Numeric',
      'Financial',
      'Percentage',
      'Task-based',
      'Time-based',
      'Learning',
      'Custom measurable',
    ]),
    targetValue: z.number().positive('Target value must be greater than 0'),
    currentValue: z.number().min(0, 'Current value cannot be negative'),
    unit: z.string().trim().max(40),
    notes: z.string().trim().max(2000),
    status: z.enum(['Not Started', 'In Progress', 'Completed', 'Delayed', 'Archived']),
  })
  .refine((data) => data.targetDate >= data.startDate, {
    message: 'Target date must be on or after start date',
    path: ['targetDate'],
  });

export const habitSchema = z.object({
  name: z.string().trim().min(1, 'Habit name is required').max(120),
  icon: z.string().trim().min(1).max(40),
  scheduleType: z.enum(['daily', 'weekdays', 'weekly_target']),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  weeklyTarget: z.number().int().min(1).max(7),
  reminderTime: z.string().trim().max(20),
  active: z.boolean(),
});

export const incomeSchema = z.object({
  source: z.string().trim().min(1, 'Income source is required').max(160),
  type: z.enum(['Salary', 'Freelance', 'Business', 'Other']),
  amountRupees: z.number().positive('Amount must be greater than 0'),
  date: z.string().trim().min(8, 'Date is required').max(20),
  notes: z.string().trim().max(500),
});

export const expenseSchema = z.object({
  category: z.string().trim().min(1, 'Category is required').max(80),
  amountRupees: z.number().positive('Amount must be greater than 0'),
  date: z.string().trim().min(8, 'Date is required').max(20),
  paymentMethod: z.string().trim().min(1, 'Payment method is required').max(60),
  notes: z.string().trim().max(500),
});

export const savingsGoalSchema = z.object({
  name: z.string().trim().min(1, 'Savings goal name is required').max(160),
  targetAmountRupees: z.number().positive('Target amount must be greater than 0'),
  targetDate: z.string().trim().min(8, 'Target date is required').max(20),
});

export const savingsTxSchema = z.object({
  type: z.enum(['deposit', 'withdraw']),
  amountRupees: z.number().positive('Amount must be greater than 0'),
  date: z.string().trim().min(8, 'Date is required').max(20),
  notes: z.string().trim().max(500),
});

export const calendarEventSchema = z.object({
  title: z.string().trim().min(1, 'Event title is required').max(160),
  eventType: z.enum([
    'Personal Event',
    'Goal Deadline',
    'Habit Reminder',
    'Project Deadline',
    'Client Follow-up',
    'Payment Due',
    'Team Meeting',
    'Competitor Review',
    'Gap Deadline',
    'Monthly Competitor Review',
  ]),
  date: z.string().trim().min(8, 'Date is required').max(20),
  startTime: z.string().trim().max(10),
  endTime: z.string().trim().max(10),
  allDay: z.boolean(),
  notes: z.string().trim().max(1000),
  reminderMinutes: z.number().int().min(0).nullable(),
});

// Phase 3A Schemas
export const phoneSchema = z
  .string()
  .trim()
  .max(30, 'Phone number must be 30 characters or less')
  .refine((val) => val === '' || /^[0-9+\-\s()]{7,20}$/.test(val), {
    message: 'Enter a valid phone number (7–20 digits)',
  });

export const optionalEmailSchema = z
  .string()
  .trim()
  .max(200, 'Email must be 200 characters or less')
  .refine((val) => val === '' || z.string().email().safeParse(val).success, {
    message: 'Enter a valid email address',
  });

export const businessServiceSchema = z.object({
  name: z.string().trim().min(1, 'Service name is required').max(160, 'Max 160 characters'),
  description: z.string().trim().max(1000, 'Max 1000 characters'),
  startingPriceRupees: z
    .number()
    .min(0, 'Starting price cannot be negative')
    .max(1000000000, 'Price too large'),
  estimatedDeliveryDays: z
    .number()
    .int('Enter whole days')
    .min(0, 'Cannot be negative')
    .max(3650, 'Max 3650 days'),
  status: z.enum(['Active', 'Planned', 'Inactive']),
  subServices: z.array(z.string().trim().min(1).max(160)).max(30, 'Max 30 tags'),
});

export const leadSchema = z
  .object({
    clientName: z.string().trim().min(1, 'Client name is required').max(160, 'Max 160 characters'),
    businessName: z.string().trim().max(160, 'Max 160 characters'),
    phone: phoneSchema,
    email: optionalEmailSchema,
    location: z.string().trim().max(200, 'Max 200 characters'),
    requirement: z.string().trim().max(2000, 'Max 2000 characters'),
    serviceId: z.string().trim().max(128),
    serviceCategory: z.string().trim().min(1, 'Service category is required').max(160),
    leadSource: z.enum([
      'Meta Ads',
      'Direct',
      'Referral',
      'Telecalling',
      'Website',
      'Repeat Client',
      'Social Media',
      'Other',
    ]),
    leadGeneratedDate: z.string().trim().min(8, 'Date is required').max(20),
    assignedPerson: z.string().trim().max(120, 'Max 120 characters'),
    estimatedBudgetRupees: z
      .number()
      .min(0, 'Budget cannot be negative')
      .max(1000000000, 'Budget too large'),
    followUpDate: z.string().trim().max(20),
    notes: z.string().trim().max(2000, 'Max 2000 characters'),
    status: z.enum([
      'New',
      'Contacted',
      'Interested',
      'Follow-up',
      'Proposal Sent',
      'Negotiation',
      'Won',
      'Lost',
    ]),
    lostReason: z.string().trim().max(500, 'Max 500 characters'),
  })
  .refine((data) => data.status !== 'Lost' || data.lostReason.trim().length > 0, {
    message: 'Lost reason is required when marking a lead as Lost',
    path: ['lostReason'],
  });

export const leadNoteSchema = z.object({
  channel: z.enum(['call', 'whatsapp', 'email', 'meeting', 'note']),
  date: z.string().trim().min(8, 'Date is required').max(20),
  text: z.string().trim().min(1, 'Note cannot be empty').max(2000, 'Max 2000 characters'),
});

export const clientSchema = z.object({
  clientName: z.string().trim().min(1, 'Client name is required').max(160, 'Max 160 characters'),
  company: z.string().trim().max(160, 'Max 160 characters'),
  phone: phoneSchema,
  email: optionalEmailSchema,
  address: z.string().trim().max(500, 'Max 500 characters'),
  serviceId: z.string().trim().max(128),
  serviceCategory: z.string().trim().max(160),
  clientManager: z.string().trim().max(120, 'Max 120 characters'),
  notes: z.string().trim().max(2000, 'Max 2000 characters'),
  status: z.enum(['Active', 'Inactive', 'Recurring']),
});

// Phase 3B (Supporting) & Phase 4 Schemas
const strictDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a valid YYYY-MM-DD date');

const financeMethodEnum = z.enum(['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other']);

export const projectSchema = z
  .object({
    title: z.string().trim().min(1, 'Project title is required').max(160, 'Max 160 characters'),
    clientId: z.string().trim().min(1, 'Client is required').max(128),
    serviceId: z.string().trim().max(128),
    serviceCategory: z.string().trim().max(160),
    assignedMemberId: z.string().trim().max(128),
    budgetRupees: z
      .number({ error: 'Enter a valid budget' })
      .min(0, 'Budget cannot be negative')
      .max(1000000000, 'Budget too large'),
    status: z.enum(['Planning', 'In Progress', 'Completed', 'On Hold', 'Cancelled']),
    startDate: strictDateSchema,
    dueDate: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Enter a valid due date'),
    description: z.string().trim().max(2000, 'Max 2000 characters'),
  })
  .refine((d) => !d.dueDate || d.dueDate >= d.startDate, {
    message: 'Due date must be on or after start date',
    path: ['dueDate'],
  });

export const projectPaymentSchema = z.object({
  projectId: z.string().trim().min(1, 'Select a project').max(128),
  amountRupees: z
    .number({ error: 'Enter a valid payment amount' })
    .positive('Amount must be greater than 0')
    .max(1000000000, 'Amount too large'),
  date: strictDateSchema,
  method: financeMethodEnum,
  paymentType: z.enum(['Advance', 'Partial', 'Final']),
  invoiceNumber: z.string().trim().max(60, 'Max 60 characters'),
  notes: z.string().trim().max(1000, 'Max 1000 characters'),
});

export const otherIncomeSchema = z.object({
  source: z.string().trim().min(1, 'Income source is required').max(160, 'Max 160 characters'),
  clientId: z.string().trim().max(128),
  amountRupees: z
    .number({ error: 'Enter a valid amount' })
    .positive('Amount must be greater than 0')
    .max(1000000000, 'Amount too large'),
  date: strictDateSchema,
  method: financeMethodEnum,
  notes: z.string().trim().max(1000, 'Max 1000 characters'),
});

export const invoiceSchema = z
  .object({
    invoiceNumber: z
      .string()
      .trim()
      .min(1, 'Invoice number is required')
      .max(60, 'Max 60 characters'),
    clientId: z.string().trim().min(1, 'Select a client').max(128),
    projectId: z.string().trim().max(128),
    amountRupees: z
      .number({ error: 'Enter a valid invoice amount' })
      .positive('Amount must be greater than 0')
      .max(1000000000, 'Amount too large'),
    issueDate: strictDateSchema,
    dueDate: strictDateSchema,
    notes: z.string().trim().max(1000, 'Max 1000 characters'),
  })
  .refine((d) => d.dueDate >= d.issueDate, {
    message: 'Due date must be on or after issue date',
    path: ['dueDate'],
  });

export const businessExpenseSchema = z.object({
  title: z.string().trim().min(1, 'Expense title is required').max(160, 'Max 160 characters'),
  category: z.string().trim().min(1, 'Category is required').max(80, 'Max 80 characters'),
  amountRupees: z
    .number({ error: 'Enter a valid amount' })
    .positive('Amount must be greater than 0')
    .max(1000000000, 'Amount too large'),
  date: strictDateSchema,
  paymentMethod: financeMethodEnum,
  paidBy: z.string().trim().max(120, 'Max 120 characters'),
  description: z.string().trim().max(1000, 'Max 1000 characters'),
  serviceId: z.string().trim().max(128),
  projectId: z.string().trim().max(128),
});

export const recurringExpenseTemplateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(160, 'Max 160 characters'),
  category: z.string().trim().min(1, 'Category is required').max(80, 'Max 80 characters'),
  amountRupees: z
    .number({ error: 'Enter a valid amount' })
    .positive('Amount must be greater than 0')
    .max(1000000000, 'Amount too large'),
  dayOfMonth: z.number().int().min(1, 'Min day 1').max(28, 'Max day 28'),
  paymentMethod: financeMethodEnum,
  paidBy: z.string().trim().max(120, 'Max 120 characters'),
  description: z.string().trim().max(1000, 'Max 1000 characters'),
  serviceId: z.string().trim().max(128),
  projectId: z.string().trim().max(128),
  active: z.boolean(),
});

export const teamMemberSchema = z.object({
  name: z.string().trim().min(1, 'Member name is required').max(120, 'Max 120 characters'),
  role: z.string().trim().min(1, 'Role is required').max(120, 'Max 120 characters'),
  department: z.string().trim().max(120, 'Max 120 characters'),
  email: optionalEmailSchema,
  phone: phoneSchema,
  status: z.enum(['Active', 'Inactive']),
  joinedDate: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Enter a valid joined date'),
  baseSalaryRupees: z
    .number({ error: 'Enter base salary' })
    .min(0, 'Cannot be negative')
    .max(1000000000, 'Amount too large'),
  commissionRatePct: z
    .union([z.number().min(0, 'Min 0%').max(100, 'Max 100%'), z.nan(), z.null()])
    .transform((v) => (v === null || Number.isNaN(v) ? null : v)),
  bankNotes: z.string().trim().max(500, 'Max 500 characters'),
});

export const salaryEditSchema = z
  .object({
    baseSalaryRupees: z.number().min(0, 'Cannot be negative').max(1000000000),
    commissionOverride: z.boolean(),
    commissionRupees: z.number().min(0, 'Cannot be negative').max(1000000000),
    commissionNote: z.string().trim().max(500, 'Max 500 characters'),
    incentiveRupees: z.number().min(0, 'Cannot be negative').max(1000000000),
    deductionsRupees: z.number().min(0, 'Cannot be negative').max(1000000000),
    notes: z.string().trim().max(500, 'Max 500 characters'),
  })
  .refine((d) => !d.commissionOverride || d.commissionNote.trim().length > 0, {
    message: 'A note is required when overriding calculated commission',
    path: ['commissionNote'],
  });

export const budgetSchema = z.object({
  budgetType: z.enum(['Monthly Overall', 'Service', 'Marketing', 'Team', 'Category']),
  target: z.string().trim().min(1, 'Target is required').max(160, 'Max 160 characters'),
  month: z.string().trim().regex(/^\d{4}-\d{2}$/, 'Enter YYYY-MM month'),
  limitRupees: z
    .number({ error: 'Enter budget limit' })
    .positive('Limit must be greater than 0')
    .max(1000000000, 'Limit too large'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type UserProfileFormValues = z.input<typeof userProfileSchema>;
export type CompanyProfileFormValues = z.infer<typeof companyProfileSchema>;
export type AppSettingsFormValues = z.input<typeof appSettingsSchema>;
export type QuickMetricsFormValues = z.infer<typeof quickMetricsSchema>;
export type PersonalGoalFormValues = z.infer<typeof personalGoalSchema>;
export type HabitFormValues = z.infer<typeof habitSchema>;
export type IncomeFormValues = z.infer<typeof incomeSchema>;
export type ExpenseFormValues = z.infer<typeof expenseSchema>;
export type SavingsGoalFormValues = z.infer<typeof savingsGoalSchema>;
export type SavingsTxFormValues = z.infer<typeof savingsTxSchema>;
export type CalendarEventFormValues = z.infer<typeof calendarEventSchema>;
export type BusinessServiceFormValues = z.infer<typeof businessServiceSchema>;
export type LeadFormValues = z.infer<typeof leadSchema>;
export type LeadNoteFormValues = z.infer<typeof leadNoteSchema>;
export type ClientFormValues = z.infer<typeof clientSchema>;
export type ProjectFormValues = z.infer<typeof projectSchema>;
export type ProjectPaymentFormValues = z.infer<typeof projectPaymentSchema>;
export type OtherIncomeFormValues = z.infer<typeof otherIncomeSchema>;
export type InvoiceFormValues = z.infer<typeof invoiceSchema>;
export type BusinessExpenseFormValues = z.infer<typeof businessExpenseSchema>;
export type RecurringExpenseTemplateFormValues = z.infer<typeof recurringExpenseTemplateSchema>;
export type TeamMemberFormValues = z.infer<typeof teamMemberSchema>;
export type SalaryEditFormValues = z.infer<typeof salaryEditSchema>;
export type BudgetFormValues = z.infer<typeof budgetSchema>;

// Phase 5A Schemas
export const httpUrlSchema = z
  .string()
  .trim()
  .max(500, 'URL must be 500 characters or less')
  .refine((val) => val === '' || /^https?:\/\/.+/i.test(val), {
    message: 'Enter a valid URL starting with http:// or https://',
  });

export const competitorSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(160, 'Max 160 characters'),
  website: optionalUrlSchema,
  location: z.string().trim().max(200, 'Max 200 characters'),
  marketLevel: z.enum(['Local', 'Tamil Nadu', 'India']),
  classification: z.enum([
    'Direct Competitor',
    'Indirect Competitor',
    'Service-Specific Competitor',
    'Regional Benchmark',
    'National Benchmark',
  ]),
  foundedYear: z
    .string()
    .trim()
    .max(20, 'Max 20 characters')
    .transform((v) => (v === '' ? 'Unknown' : v)),
  description: z.string().trim().max(1500, 'Max 1500 characters'),
  industriesServed: z.array(z.string().trim().min(1).max(160)).max(30, 'Max 30 industries'),
  primaryServices: z.array(z.string().trim().min(1).max(160)).max(30, 'Max 30 services'),
  pricingModel: z
    .string()
    .trim()
    .max(300, 'Max 300 characters')
    .transform((v) => (v === '' ? 'Unknown' : v)),
  targetAudience: z
    .string()
    .trim()
    .max(300, 'Max 300 characters')
    .transform((v) => (v === '' ? 'Unknown' : v)),
  threatLevel: z.enum(['Low', 'Medium', 'High', 'Unknown']),
  status: z.enum(['Active', 'Watching', 'Candidate', 'Inactive', 'Archived', 'Surpassed']),
  nextReviewDate: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Select a valid YYYY-MM-DD date'),
  notes: z.string().trim().max(2000, 'Max 2000 characters'),
});

export const competitorMetricEvidenceSchema = z
  .object({
    metricKey: z
      .string()
      .trim()
      .min(1, 'Metric key is required')
      .max(80)
      .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid metric key'),
    metricName: z.string().trim().min(1, 'Metric name is required').max(160, 'Max 160 characters'),
    category: z.enum(['Services', 'Digital Presence', 'Technology', 'Business Evidence']),
    value: z.string().trim().min(1, 'Value is required (use "Unknown" if unavailable)').max(500),
    serviceOfferStatus: z.enum(['', 'Offered', 'Partially Offered', 'Not Offered', 'Unknown']),
    rating: z.number().min(0).max(5).optional(),
    scorecardGroup: z.enum(['', 'Market Presence', 'Business Performance']).optional(),
    sourceUrl: httpUrlSchema,
    evidenceDescription: z
      .string()
      .trim()
      .min(1, 'Evidence description is required')
      .max(1500, 'Max 1500 characters'),
    dataStatus: z.enum(['Verified', 'User Entered', 'Estimated', 'Unknown']),
    lastVerifiedDate: strictDateSchema,
    notes: z.string().trim().max(1000, 'Max 1000 characters'),
  })
  .refine(
    (d) => d.dataStatus !== 'Verified' || /^https?:\/\/.+/i.test(d.sourceUrl.trim()),
    {
      message: 'Verified status strictly requires a valid http:// or https:// source URL',
      path: ['sourceUrl'],
    }
  );

export const pendingFindingEditSchema = z
  .object({
    value: z.string().trim().min(1, 'Value is required').max(500),
    sourceUrl: httpUrlSchema,
    evidenceDescription: z.string().trim().min(1, 'Description is required').max(1500),
    dataStatus: z.enum(['Verified', 'User Entered', 'Estimated', 'Unknown']),
    notes: z.string().trim().max(1000),
  })
  .refine(
    (d) => d.dataStatus !== 'Verified' || /^https?:\/\/.+/i.test(d.sourceUrl.trim()),
    {
      message: 'Verified status strictly requires a valid source URL',
      path: ['sourceUrl'],
    }
  );

export const aiResearchMetricItemSchema = z.object({
  metricKey: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .catch('biz_general'),
  metricName: z.string().trim().min(1).max(160),
  category: z.enum(['Services', 'Digital Presence', 'Technology', 'Business Evidence']),
  proposedValue: z.string().trim().min(1).max(500),
  sourceUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https?:\/\/.+/i.test(v), 'Invalid URL')
    .default(''),
  sourceTitle: z.string().trim().max(200).default(''),
  evidenceDescription: z.string().trim().min(1).max(1500),
  confidenceNote: z.string().trim().max(500).default('AI-assisted summary requiring verification'),
});

export const aiResearchResponseSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  searchQueries: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
  findings: z.array(aiResearchMetricItemSchema).max(24),
});

export const aiDiscoveryCandidateSchema = z.object({
  companyName: z.string().trim().min(1).max(160),
  website: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === '' || /^https?:\/\/.+/i.test(v), 'Invalid URL')
    .default(''),
  location: z.string().trim().min(1).max(200),
  marketLevel: z.enum(['Local', 'Tamil Nadu', 'India']).default('Local'),
  classification: z
    .enum([
      'Direct Competitor',
      'Indirect Competitor',
      'Service-Specific Competitor',
      'Regional Benchmark',
      'National Benchmark',
    ])
    .default('Direct Competitor'),
  servicesDetected: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  sourceUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https?:\/\/.+/i.test(v), 'Invalid URL')
    .default(''),
  evidenceDescription: z.string().trim().min(1).max(1500),
  confidenceNote: z.string().trim().max(500).default('AI-assisted discovery candidate'),
});

export const aiDiscoveryResponseSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  searchQueries: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
  candidates: z.array(aiDiscoveryCandidateSchema).max(12),
});

export type CompetitorFormValues = z.infer<typeof competitorSchema>;
export type CompetitorMetricEvidenceFormValues = z.infer<typeof competitorMetricEvidenceSchema>;
export type PendingFindingEditFormValues = z.infer<typeof pendingFindingEditSchema>;
export type AiResearchResponse = z.infer<typeof aiResearchResponseSchema>;
export type AiDiscoveryResponse = z.infer<typeof aiDiscoveryResponseSchema>;

// Phase 5B Schemas
export const scorecardWeightsSchema = z
  .object({
    revenue_growth: z.number().int().min(0).max(100),
    client_acquisition: z.number().int().min(0).max(100),
    project_delivery: z.number().int().min(0).max(100),
    service_portfolio: z.number().int().min(0).max(100),
    technology_innovation: z.number().int().min(0).max(100),
    portfolio_quality: z.number().int().min(0).max(100),
    customer_reputation: z.number().int().min(0).max(100),
    digital_presence: z.number().int().min(0).max(100),
    team_operations: z.number().int().min(0).max(100),
    pricing_value: z.number().int().min(0).max(100),
  })
  .refine(
    (w) =>
      w.revenue_growth +
        w.client_acquisition +
        w.project_delivery +
        w.service_portfolio +
        w.technology_innovation +
        w.portfolio_quality +
        w.customer_reputation +
        w.digital_presence +
        w.team_operations +
        w.pricing_value ===
      100,
    { message: 'All 10 dimension weights must sum strictly to 100' }
  );

export const ratingScoreMapSchema = z.object({
  r1: z.number().int().min(0).max(100),
  r2: z.number().int().min(0).max(100),
  r3: z.number().int().min(0).max(100),
  r4: z.number().int().min(0).max(100),
  r5: z.number().int().min(0).max(100),
});

export const scoreConfigSchema = z.object({
  weights: scorecardWeightsSchema,
  ratingScoreMap: ratingScoreMapSchema,
});

export const ownMetricSchema = z
  .object({
    metricKey: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9_-]+$/),
    metricName: z.string().trim().min(1, 'Metric name is required').max(160),
    dimensionKey: z.enum([
      'revenue_growth',
      'client_acquisition',
      'project_delivery',
      'service_portfolio',
      'technology_innovation',
      'portfolio_quality',
      'customer_reputation',
      'digital_presence',
      'team_operations',
      'pricing_value',
    ]),
    scorecardType: z.enum(['Market Presence', 'Business Performance']),
    value: z.string().trim().min(1, 'Value is required (or Unknown)').max(500),
    rating: z.number().min(0).max(5),
    sourceUrl: httpUrlSchema,
    evidenceDescription: z.string().trim().max(1500),
    dataStatus: z.enum(['Verified', 'User Entered', 'Estimated', 'Unknown']),
    lastVerifiedDate: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use YYYY-MM-DD format'),
    notes: z.string().trim().max(1000),
  })
  .refine(
    (d) => d.dataStatus !== 'Verified' || /^https?:\/\/.+/i.test(d.sourceUrl.trim()),
    {
      message: 'Verified status strictly requires a valid http:// or https:// source URL',
      path: ['sourceUrl'],
    }
  );

export const competitiveGapSchema = z.object({
  title: z.string().trim().min(1, 'Gap title is required').max(160),
  description: z.string().trim().max(1500),
  linkedCompetitorIds: z.array(z.string().trim().min(1).max(128)).max(20),
  linkedMetricKey: z.string().trim().max(80),
  businessImpact: z.enum(['Low', 'Medium', 'High']),
  priority: z.enum(['Low', 'Medium', 'High']),
  estimatedEffort: z.enum(['Low', 'Medium', 'High']),
  suggestedAction: z.string().trim().max(1500),
  deadline: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Select a valid YYYY-MM-DD deadline'),
  status: z.enum(['Open', 'In Progress', 'Done', 'Dismissed']),
  progressPct: z.number().int().min(0).max(100),
});

export const monthlyReviewSchema = z.object({
  month: z.string().trim().regex(/^\d{4}-\d{2}$/, 'Select YYYY-MM month'),
  reviewDate: strictDateSchema,
  summary: z.string().trim().max(1500),
});

export type ScoreConfigFormValues = z.infer<typeof scoreConfigSchema>;
export type OwnMetricFormValues = z.infer<typeof ownMetricSchema>;
export type CompetitiveGapFormValues = z.infer<typeof competitiveGapSchema>;
export type MonthlyReviewFormValues = z.infer<typeof monthlyReviewSchema>;

// ---------------------------------------------------------------------------
// Phase 6B Schemas: AI CEO Chat & Strict 5-Type Action Proposals
// ---------------------------------------------------------------------------

export const aiAreaSchema = z.enum([
  'personal',
  'finance',
  'leads',
  'projects',
  'team',
  'competition',
  'gamification',
]);

export const aiChatInputSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Enter a question or prompt for GoalX AI CEO')
    .max(2000, 'Prompt must be 2000 characters or less'),
  conversationId: z.string().trim().max(128).optional().default(''),
  hintArea: z
    .enum(['general', 'personal', 'finance', 'leads', 'projects', 'team', 'competition', 'gamification'])
    .optional()
    .default('general'),
  focusRecordId: z.string().trim().max(128).optional().default(''),
});

export const proposalCreateGoalPayloadSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(''),
  category: z.string().trim().min(1).max(80).default('Career & Leadership'),
  startDate: strictDateSchema,
  targetDate: strictDateSchema,
  priority: z.enum(['Low', 'Medium', 'High']).default('High'),
  goalType: z
    .enum(['Numeric', 'Financial', 'Percentage', 'Task-based', 'Time-based', 'Learning', 'Custom measurable'])
    .default('Task-based'),
  targetValue: z.number().positive().default(100),
  unit: z.string().trim().max(40).default('%'),
  notes: z.string().trim().max(1500).default(''),
});

export const proposalCreateTaskPayloadSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1500).default(''),
  priority: z.enum(['Low', 'Medium', 'High']).default('High'),
  dueDate: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Invalid YYYY-MM-DD due date')
    .default(''),
  competitorId: z.string().trim().max(128).default(''),
});

export const proposalCreateCalendarEventPayloadSchema = z.object({
  title: z.string().trim().min(1).max(160),
  eventType: z
    .enum([
      'Personal Event',
      'Goal Deadline',
      'Habit Reminder',
      'Project Deadline',
      'Client Follow-up',
      'Payment Due',
      'Team Meeting',
      'Competitor Review',
      'Gap Deadline',
      'Monthly Competitor Review',
    ])
    .default('Personal Event'),
  date: strictDateSchema,
  startTime: z.string().trim().max(10).default('10:00'),
  endTime: z.string().trim().max(10).default('10:30'),
  allDay: z.boolean().default(false),
  notes: z.string().trim().max(1000).default(''),
});

export const proposalCreateLeadFollowupPayloadSchema = z.object({
  leadId: z.string().trim().min(1).max(128),
  followUpDate: strictDateSchema,
  channel: z.enum(['call', 'whatsapp', 'email', 'meeting', 'note']).default('call'),
  noteText: z.string().trim().min(1).max(2000),
});

export const proposalCreateCompetitiveGapPayloadSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1500).default(''),
  linkedCompetitorIds: z.array(z.string().trim().min(1).max(128)).max(10).default([]),
  linkedMetricKey: z.string().trim().max(80).default(''),
  businessImpact: z.enum(['Low', 'Medium', 'High']).default('High'),
  priority: z.enum(['Low', 'Medium', 'High']).default('High'),
  estimatedEffort: z.enum(['Low', 'Medium', 'High']).default('Medium'),
  suggestedAction: z.string().trim().max(1500).default(''),
  deadline: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Invalid YYYY-MM-DD deadline')
    .default(''),
});

export const aiProposalItemSchema = z.object({
  actionType: z.enum([
    'create_goal',
    'create_task',
    'create_calendar_event',
    'create_lead_followup',
    'create_competitive_gap',
  ]),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(1).max(600),
  payload: z.record(z.string(), z.unknown()),
});

export const aiCeoChatResponseSchema = z.object({
  answerMarkdown: z.string().trim().min(1).max(8000),
  proposals: z.array(aiProposalItemSchema).max(3).default([]),
});

export const aiProposalDecisionSchema = z.object({
  decision: z.enum(['confirm', 'reject', 'edit']),
  title: z.string().trim().min(1).max(160).optional(),
  summary: z.string().trim().min(1).max(500).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  rejectionReason: z.string().trim().max(500).optional().default(''),
});

export const aiBriefingRequestSchema = z.object({
  briefingType: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  regenerate: z.boolean().optional().default(false),
});

export type AiChatInputValues = z.infer<typeof aiChatInputSchema>;
export type AiProposalDecisionValues = z.infer<typeof aiProposalDecisionSchema>;

// ---------------------------------------------------------------------------
// Phase 7A Schemas: Security, Password Change, Account Delete & Audit Logs
// ---------------------------------------------------------------------------

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(6, 'Current password is required').max(128),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(128)
      .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
        message: 'Use at least one letter and one number',
      }),
    confirmNewPassword: z.string().min(8, 'Confirm your new password').max(128),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: 'New passwords do not match',
    path: ['confirmNewPassword'],
  });

export const securityAuditRequestSchema = z.object({
  action: z.enum([
    'salary_view',
    'salary_export',
    'data_export',
    'ai_history_delete',
    'module_delete',
    'password_change',
    'account_delete',
    'settings_security_change',
    'financial_edit',
  ]),
  details: z.string().trim().min(1).max(500),
});

export const accountDeleteRequestSchema = z.object({
  confirmText: z.literal('DELETE'),
});

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
export type NotificationPrefsFormValues = z.infer<typeof notificationPrefsSchema>;
export type GamificationXpFormValues = z.infer<typeof gamificationXpConfigSchema>;



