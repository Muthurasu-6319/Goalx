import {
  BudgetType,
  BusinessServiceStatus,
  CalendarEventType,
  ClientStatus,
  CompetitorClassification,
  CompetitorStatus,
  CompetitorThreatLevel,
  CompetitorVerificationStatus,
  DataStatus,
  EvidenceCategory,
  FinancePaymentMethod,
  GoalPriority,
  GoalStatus,
  GoalType,
  IncomeType,
  LeadNoteChannel,
  LeadSource,
  LeadStatus,
  MarketLevel,
  ProjectPaymentType,
  ProjectStatus,
  RatingScoreMap,
  ScorecardDimensionKey,
  ScorecardType,
  ScorecardWeights,
  ServiceOfferStatus,
} from '../types';

export const DEFAULT_COMPANY_PROFILE = {
  name: 'Gen Z Neural-X',
  website: 'https://genzneuralx.com',
  industry: 'IT Services & Technology Solutions',
  services: [
    'Website Dev',
    'Web Apps',
    'Mobile Apps',
    'AI Solutions',
    'Digital Marketing',
    'Graphic Design',
    'UI/UX',
    'Custom Software',
    'Industrial Automation',
  ],
  location: 'Sivakasi, Srivilliputtur, Rajapalayam, Virudhunagar, Tamil Nadu, India',
  startDate: '',
  stage: '',
  goals: [] as string[],
};

export const COMPANY_STAGES = [
  'Idea',
  'MVP',
  'Early Traction',
  'Growth',
  'Scale',
] as const;

export const CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'INR (₹)' },
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
] as const;

export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  ONBOARDING: '/onboarding',
  DASHBOARD: '/dashboard',
  LIFE: '/life',
  LIFE_GOALS: '/life/goals',
  LIFE_INCOME: '/life/income',
  LIFE_SAVINGS: '/life/savings',
  COMPANY: '/company',
  COMPANY_SERVICES: '/company/services',
  COMPANY_LEADS: '/company/leads',
  COMPANY_CLIENTS: '/company/clients',
  COMPANY_FINANCE: '/company/finance',
  COMPANY_TEAM: '/company/team',
  COMPETITION: '/competition',
  COMPETITION_DISCOVER: '/competition/discover',
  COMPETITION_COMPARE: '/competition/compare',
  COMPETITION_SCORECARDS: '/competition/scorecards',
  COMPETITION_GAPS: '/competition/gaps',
  COMPETITION_REPORT: '/competition/report',
  GOALS: '/goals',
  PROJECTS: '/projects',
  HABITS: '/habits',
  CALENDAR: '/calendar',
  ANALYTICS: '/analytics',
  AI_CEO: '/ai-ceo',
  ACHIEVEMENTS: '/achievements',
  NOTIFICATIONS: '/notifications',
  SETTINGS: '/settings',
} as const;

export interface NavItemConfig {
  label: string;
  path: string;
  iconName: string;
  phase: 1 | 2 | 3 | 4 | 5;
  description?: string;
}

export const ALL_NAV_ITEMS: NavItemConfig[] = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD, iconName: 'LayoutDashboard', phase: 1 },
  { label: 'Life Hub', path: ROUTES.LIFE, iconName: 'HeartPulse', phase: 2 },
  { label: 'Goals', path: ROUTES.GOALS, iconName: 'Target', phase: 2 },
  { label: 'Habits', path: ROUTES.HABITS, iconName: 'CheckSquare', phase: 2 },
  { label: 'Personal Finance', path: ROUTES.LIFE_INCOME, iconName: 'Wallet', phase: 2 },
  { label: 'Calendar', path: ROUTES.CALENDAR, iconName: 'CalendarDays', phase: 2 },
  { label: 'Company', path: ROUTES.COMPANY, iconName: 'Building2', phase: 1 },
  { label: 'Services', path: ROUTES.COMPANY_SERVICES, iconName: 'Layers', phase: 3 },
  { label: 'Leads & CRM', path: ROUTES.COMPANY_LEADS, iconName: 'BriefcaseBusiness', phase: 3 },
  { label: 'Clients', path: ROUTES.COMPANY_CLIENTS, iconName: 'Users', phase: 3 },
  { label: 'Projects', path: ROUTES.PROJECTS, iconName: 'FolderKanban', phase: 3 },
  { label: 'Team', path: ROUTES.COMPANY_TEAM, iconName: 'UserCog', phase: 3 },
  { label: 'Company Finance', path: ROUTES.COMPANY_FINANCE, iconName: 'IndianRupee', phase: 4 },
  { label: 'Competition', path: ROUTES.COMPETITION, iconName: 'Radar', phase: 5 },
  { label: 'Analytics', path: ROUTES.ANALYTICS, iconName: 'BarChart3', phase: 3, description: 'Revenue trends, goal velocity, and execution efficiency reports.' },
  { label: 'AI CEO', path: ROUTES.AI_CEO, iconName: 'Sparkles', phase: 3, description: 'Executive decision briefs, strategic reviews, and weekly reflections.' },
  { label: 'Achievements', path: ROUTES.ACHIEVEMENTS, iconName: 'Trophy', phase: 3, description: 'XP milestones, executive badges, and streak unlocks.' },
  { label: 'Notifications', path: ROUTES.NOTIFICATIONS, iconName: 'Bell', phase: 4 },
  { label: 'Settings', path: ROUTES.SETTINGS, iconName: 'Settings', phase: 1 },
];

export const ROUTE_TITLES: Record<string, string> = {
  [ROUTES.DASHBOARD]: 'Dashboard',
  [ROUTES.LIFE]: 'Life Hub',
  [ROUTES.LIFE_GOALS]: 'Personal Goals',
  [ROUTES.GOALS]: 'Personal Goals',
  [ROUTES.HABITS]: 'Habits',
  [ROUTES.LIFE_INCOME]: 'Personal Income & Expenses',
  [ROUTES.LIFE_SAVINGS]: 'Personal Savings',
  [ROUTES.CALENDAR]: 'Calendar',
  [ROUTES.COMPANY]: 'Company Overview',
  [ROUTES.COMPANY_SERVICES]: 'Service Catalog',
  [ROUTES.COMPANY_LEADS]: 'Leads & CRM',
  [ROUTES.COMPANY_CLIENTS]: 'Clients',
  [ROUTES.PROJECTS]: 'Projects',
  [ROUTES.COMPANY_TEAM]: 'Team & Compensation',
  [ROUTES.COMPANY_FINANCE]: 'Company Finance',
  [ROUTES.COMPETITION]: 'Competition Intelligence',
  [ROUTES.COMPETITION_DISCOVER]: 'Competitor Discovery',
  [ROUTES.COMPETITION_COMPARE]: 'Competitor Comparison',
  [ROUTES.COMPETITION_SCORECARDS]: 'Competitor Scorecards',
  [ROUTES.COMPETITION_GAPS]: 'Competitive Gap Analysis',
  [ROUTES.COMPETITION_REPORT]: 'Achievement Report',
  [ROUTES.ANALYTICS]: 'Executive & Competition Analytics',
  [ROUTES.AI_CEO]: 'GoalX AI CEO',
  [ROUTES.ACHIEVEMENTS]: 'Executive Achievements & XP',
  [ROUTES.NOTIFICATIONS]: 'Notifications',
  [ROUTES.SETTINGS]: 'Settings',
};

export const DEFAULT_SEED_SERVICES: {
  name: string;
  description: string;
  startingPricePaise: number;
  estimatedDeliveryDays: number;
  status: BusinessServiceStatus;
  subServices: string[];
}[] = [
  {
    name: 'Website Development',
    description: 'High-converting responsive business websites, landing pages, and CMS deployments.',
    startingPricePaise: 0,
    estimatedDeliveryDays: 0,
    status: 'Active',
    subServices: [],
  },
  {
    name: 'Web Application Development',
    description: 'Full-stack SaaS portals, internal dashboards, and custom cloud web applications.',
    startingPricePaise: 0,
    estimatedDeliveryDays: 0,
    status: 'Active',
    subServices: [],
  },
  {
    name: 'Mobile Application Development',
    description: 'Cross-platform Android & iOS mobile apps with offline-ready cloud sync.',
    startingPricePaise: 0,
    estimatedDeliveryDays: 0,
    status: 'Active',
    subServices: [],
  },
  {
    name: 'AI Solutions',
    description: 'Workflow automation, LLM assistants, computer vision, and predictive business intelligence.',
    startingPricePaise: 0,
    estimatedDeliveryDays: 0,
    status: 'Active',
    subServices: [],
  },
  {
    name: 'Digital Marketing',
    description: 'Performance Meta/Google ad campaigns, local SEO, and lead generation funnels.',
    startingPricePaise: 0,
    estimatedDeliveryDays: 0,
    status: 'Active',
    subServices: [],
  },
  {
    name: 'Graphic Designing',
    description: 'Brand identity systems, marketing collateral, pitch decks, and social creatives.',
    startingPricePaise: 0,
    estimatedDeliveryDays: 0,
    status: 'Active',
    subServices: [],
  },
  {
    name: 'UI/UX Design',
    description: 'User research, wireframes, interactive prototypes, and production design systems.',
    startingPricePaise: 0,
    estimatedDeliveryDays: 0,
    status: 'Active',
    subServices: [],
  },
  {
    name: 'Custom Software Development',
    description: 'Tailored ERP, billing, inventory, and enterprise software integrations.',
    startingPricePaise: 0,
    estimatedDeliveryDays: 0,
    status: 'Active',
    subServices: [],
  },
  {
    name: 'Industrial Automation',
    description: 'Smart factory telemetry, energy management, and plant-floor monitoring systems.',
    startingPricePaise: 0,
    estimatedDeliveryDays: 0,
    status: 'Active',
    subServices: [
      'EMS',
      'MES',
      'SCADA',
      'PLC',
      'IIoT',
      'Machine Monitoring',
      'Production Dashboards',
      'Industrial Analytics',
    ],
  },
];

export const SERVICE_STATUSES: BusinessServiceStatus[] = ['Active', 'Planned', 'Inactive'];

export const LEAD_SOURCES: LeadSource[] = [
  'Meta Ads',
  'Direct',
  'Referral',
  'Telecalling',
  'Website',
  'Repeat Client',
  'Social Media',
  'Other',
];

export const LEAD_STATUSES: LeadStatus[] = [
  'New',
  'Contacted',
  'Interested',
  'Follow-up',
  'Proposal Sent',
  'Negotiation',
  'Won',
  'Lost',
];

export const QUALIFIED_LEAD_STATUSES: LeadStatus[] = [
  'Interested',
  'Follow-up',
  'Proposal Sent',
  'Negotiation',
  'Won',
];

export const LEAD_NOTE_CHANNELS: { value: LeadNoteChannel; label: string }[] = [
  { value: 'call', label: 'Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'note', label: 'Note' },
];

export const CLIENT_STATUSES: ClientStatus[] = ['Active', 'Inactive', 'Recurring'];

export const GOAL_CATEGORIES = [
  'Health & Fitness',
  'Learning & Skills',
  'Personal Finance',
  'Career & Leadership',
  'Reading & Mindset',
  'Relationships & Family',
  'Lifestyle',
] as const;

export const GOAL_TYPES: GoalType[] = [
  'Numeric',
  'Financial',
  'Percentage',
  'Task-based',
  'Time-based',
  'Learning',
  'Custom measurable',
];

export const GOAL_PRIORITIES: GoalPriority[] = ['High', 'Medium', 'Low'];

export const GOAL_STATUSES: GoalStatus[] = [
  'Not Started',
  'In Progress',
  'Completed',
  'Delayed',
  'Archived',
];

export const HABIT_ICONS = [
  { key: 'Flame', label: 'Focus' },
  { key: 'Dumbbell', label: 'Fitness' },
  { key: 'BookOpen', label: 'Reading' },
  { key: 'Droplets', label: 'Hydration' },
  { key: 'Brain', label: 'Mindfulness' },
  { key: 'Code2', label: 'Skill' },
  { key: 'Sun', label: 'Morning' },
  { key: 'Moon', label: 'Sleep' },
] as const;

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const INCOME_TYPES: IncomeType[] = ['Salary', 'Freelance', 'Business', 'Other'];

export const EXPENSE_CATEGORIES = [
  'Housing & Rent',
  'Food & Dining',
  'Transport & Fuel',
  'Health & Medical',
  'Learning & Books',
  'Utilities & Internet',
  'Shopping',
  'Travel',
  'Other',
] as const;

export const PAYMENT_METHODS = ['UPI', 'Bank Transfer', 'Credit Card', 'Debit Card', 'Cash'] as const;

export const CALENDAR_EVENT_TYPES: CalendarEventType[] = [
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
];

export const PERSONAL_EVENT_TYPES: CalendarEventType[] = [
  'Personal Event',
  'Goal Deadline',
  'Habit Reminder',
];

export function formatCurrency(amount: number, currencyCode = 'INR'): string {
  const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toLocaleString()}`;
  }
}

export function getGreeting(name?: string): string {
  const hour = new Date().getHours();
  const timeOfDay =
    hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const displayName = name?.trim() ? name.trim().split(' ')[0] : 'CEO';
  return `${timeOfDay}, ${displayName}`;
}

// ---------------------------------------------------------------------------
// Phase 3B (Supporting) & Phase 4: Company Finance Constants
// ---------------------------------------------------------------------------

export const PROJECT_STATUSES: ProjectStatus[] = [
  'Planning',
  'In Progress',
  'Completed',
  'On Hold',
  'Cancelled',
];

export const FINANCE_PAYMENT_METHODS: FinancePaymentMethod[] = [
  'UPI',
  'Bank Transfer',
  'Card',
  'Cheque',
  'Cash',
  'Other',
];

export const PROJECT_PAYMENT_TYPES: ProjectPaymentType[] = ['Advance', 'Partial', 'Final'];

export const DEFAULT_COMPANY_EXPENSE_CATEGORIES = [
  'Hosting & Cloud',
  'Software & Subscriptions',
  'Marketing & Ads',
  'Employee Salaries',
  'Freelancer Payouts',
  'Office & Utilities',
  'Equipment & Hardware',
  'Travel & Client Meetings',
  'Legal & Compliance',
  'Miscellaneous',
] as const;

export const BUDGET_TYPES: BudgetType[] = [
  'Monthly Overall',
  'Service',
  'Marketing',
  'Team',
  'Category',
];

export const DEFAULT_COMMISSION_PCT = 5;

export const RECEIPT_ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/pdf',
] as const;

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024; // 5MB

// ---------------------------------------------------------------------------
// Phase 5A: Competitor Discovery, Evidence & Research Constants
// ---------------------------------------------------------------------------

export const MARKET_LEVELS: MarketLevel[] = ['Local', 'Tamil Nadu', 'India'];

export const COMPETITOR_CLASSIFICATIONS: CompetitorClassification[] = [
  'Direct Competitor',
  'Indirect Competitor',
  'Service-Specific Competitor',
  'Regional Benchmark',
  'National Benchmark',
];

export const COMPETITOR_THREAT_LEVELS: CompetitorThreatLevel[] = ['Low', 'Medium', 'High', 'Unknown'];

export const COMPETITOR_STATUSES: CompetitorStatus[] = [
  'Active',
  'Watching',
  'Candidate',
  'Inactive',
  'Archived',
  'Surpassed',
];

export const COMPETITOR_VERIFICATION_STATUSES: CompetitorVerificationStatus[] = [
  'Unverified',
  'Partially Verified',
  'Verified',
];

export const DATA_STATUSES: DataStatus[] = ['Verified', 'User Entered', 'Estimated', 'Unknown'];

export const EVIDENCE_CATEGORIES: EvidenceCategory[] = [
  'Services',
  'Digital Presence',
  'Technology',
  'Business Evidence',
];

export const SERVICE_OFFER_STATUSES: Exclude<ServiceOfferStatus, ''>[] = [
  'Offered',
  'Partially Offered',
  'Not Offered',
  'Unknown',
];

export interface StandardCompetitorMetricDef {
  key: string;
  name: string;
  category: EvidenceCategory;
  description: string;
}

export const STANDARD_COMPETITOR_METRICS: StandardCompetitorMetricDef[] = [
  // Services (10)
  { key: 'svc_website_dev', name: 'Website Development', category: 'Services', description: 'Business websites, landing pages, and CMS delivery' },
  { key: 'svc_web_apps', name: 'Web Application Development', category: 'Services', description: 'Custom portals, SaaS dashboards, and cloud web apps' },
  { key: 'svc_mobile_apps', name: 'Mobile Application Development', category: 'Services', description: 'Android / iOS / cross-platform mobile apps' },
  { key: 'svc_ai_solutions', name: 'AI Solutions', category: 'Services', description: 'Chatbots, LLM workflows, computer vision, or predictive AI' },
  { key: 'svc_digital_marketing', name: 'Digital Marketing', category: 'Services', description: 'SEO, Meta/Google ads, and social marketing' },
  { key: 'svc_graphic_design', name: 'Graphic Designing', category: 'Services', description: 'Brand identity, print creatives, and social graphics' },
  { key: 'svc_ui_ux', name: 'UI/UX Design', category: 'Services', description: 'Wireframes, product UI systems, and prototypes' },
  { key: 'svc_custom_software', name: 'Custom Software Development', category: 'Services', description: 'Tailored ERP, billing, CRM, or desktop software' },
  { key: 'svc_industrial_automation', name: 'Industrial Automation (EMS/MES/SCADA/PLC/IIoT)', category: 'Services', description: 'Factory telemetry, SCADA, PLC, EMS, MES, and IIoT dashboards' },
  { key: 'svc_cloud_maintenance', name: 'Hosting, Cloud & Maintenance', category: 'Services', description: 'Managed hosting, AMC retainers, and DevOps support' },
  // Digital Presence (5)
  { key: 'dig_official_website', name: 'Official Website & SSL', category: 'Digital Presence', description: 'Active public website, HTTPS, and clarity of positioning' },
  { key: 'dig_google_business', name: 'Google Business Profile & Maps', category: 'Digital Presence', description: 'Verified Maps listing, public rating, and review count' },
  { key: 'dig_social_channels', name: 'Social Media Presence', category: 'Digital Presence', description: 'Active LinkedIn, Instagram, or Facebook business pages' },
  { key: 'dig_seo_visibility', name: 'SEO & Search Visibility', category: 'Digital Presence', description: 'Organic search presence for regional/service keywords' },
  { key: 'dig_portfolio_cases', name: 'Public Portfolio & Case Studies', category: 'Digital Presence', description: 'Published work samples, demos, or client case studies' },
  // Technology (4)
  { key: 'tech_frontend_stack', name: 'Frontend & Web Stack', category: 'Technology', description: 'Publicly stated frameworks/CMS (React, WordPress, Next.js, etc.)' },
  { key: 'tech_backend_cloud', name: 'Backend & Cloud Infrastructure', category: 'Technology', description: 'Stated server/cloud stack (Node, Python, Laravel, AWS, Firebase, etc.)' },
  { key: 'tech_ai_automation', name: 'AI & Automation Tooling', category: 'Technology', description: 'Publicly advertised AI models, RPA, or workflow platforms' },
  { key: 'tech_industrial_iiot', name: 'Industrial Hardware & IIoT Stack', category: 'Technology', description: 'PLC brands, SCADA protocols, sensors, or energy meters supported' },
  // Business Evidence (5)
  { key: 'biz_founded_year', name: 'Founded Year', category: 'Business Evidence', description: 'Verified year of incorporation or domain launch' },
  { key: 'biz_pricing_model', name: 'Pricing Model & Starting Tier', category: 'Business Evidence', description: 'Published packages, retainers, or custom-quote positioning' },
  { key: 'biz_target_audience', name: 'Target Audience & Verticals', category: 'Business Evidence', description: 'Documented customer segments (SMEs, factories, retail, etc.)' },
  { key: 'biz_office_footprint', name: 'Office Locations & Footprint', category: 'Business Evidence', description: 'Publicly listed branches and service coverage cities' },
  { key: 'biz_client_proof', name: 'Public Testimonials & Client Logos', category: 'Business Evidence', description: 'Named client reviews or published testimonials' },
];

export interface SeedCompetitorCandidate {
  seedKey: string;
  companyName: string;
  location: string;
  marketLevel: MarketLevel;
  classification: CompetitorClassification;
  description: string;
  industriesServed: string[];
  primaryServices: string[];
  notes: string;
}

export const SEED_LOCAL_COMPETITORS: SeedCompetitorCandidate[] = [
  {
    seedKey: 'seed_brandbee_sivakasi',
    companyName: 'BrandBee Media',
    location: 'Sivakasi, Tamil Nadu',
    marketLevel: 'Local',
    classification: 'Service-Specific Competitor',
    description: 'Suggested local candidate in Sivakasi. Verification pending — verify official website and active services.',
    industriesServed: ['Local Businesses', 'Printing & Packaging'],
    primaryServices: [],
    notes: 'Verification pending — seeded local candidate. Check official website, Google Maps listing, and service pages before activating.',
  },
  {
    seedKey: 'seed_k7_digital_sivakasi',
    companyName: 'K7 Digital',
    location: 'Sivakasi, Tamil Nadu',
    marketLevel: 'Local',
    classification: 'Service-Specific Competitor',
    description: 'Suggested local candidate in Sivakasi. Verification pending — verify official website and active services.',
    industriesServed: ['Local Businesses'],
    primaryServices: [],
    notes: 'Verification pending — seeded local candidate. Verify digital marketing / web offerings with public URLs.',
  },
  {
    seedKey: 'seed_eazy_techs_sivakasi',
    companyName: 'Eazy Techs',
    location: 'Sivakasi, Tamil Nadu',
    marketLevel: 'Local',
    classification: 'Direct Competitor',
    description: 'Suggested local candidate in Sivakasi. Verification pending — verify website, software services, and footprint.',
    industriesServed: ['SMEs', 'Retail'],
    primaryServices: [],
    notes: 'Verification pending — seeded local candidate. Confirm service catalog via official sources.',
  },
  {
    seedKey: 'seed_digital_sivakasi',
    companyName: 'Digital Sivakasi',
    location: 'Sivakasi, Tamil Nadu',
    marketLevel: 'Local',
    classification: 'Service-Specific Competitor',
    description: 'Suggested local candidate in Sivakasi. Verification pending — verify digital presence and service mix.',
    industriesServed: ['Local Businesses'],
    primaryServices: [],
    notes: 'Verification pending — seeded local candidate. Confirm active channels and client proof.',
  },
  {
    seedKey: 'seed_proz_rajapalayam',
    companyName: 'ProZ',
    location: 'Rajapalayam, Tamil Nadu',
    marketLevel: 'Local',
    classification: 'Direct Competitor',
    description: 'Suggested local candidate in Rajapalayam. Verification pending — verify official domain and service capabilities.',
    industriesServed: ['SMEs'],
    primaryServices: [],
    notes: 'Verification pending — seeded local candidate in Rajapalayam.',
  },
  {
    seedKey: 'seed_amutham_webtech_rajapalayam',
    companyName: 'Amutham WebTech',
    location: 'Rajapalayam, Tamil Nadu',
    marketLevel: 'Local',
    classification: 'Direct Competitor',
    description: 'Suggested local candidate in Rajapalayam. Verification pending — verify web and software service evidence.',
    industriesServed: ['SMEs', 'Local Businesses'],
    primaryServices: [],
    notes: 'Verification pending — seeded local candidate in Rajapalayam.',
  },
  {
    seedKey: 'seed_phoenix_softech_madurai',
    companyName: 'Phoenix Softech',
    location: 'Madurai, Tamil Nadu',
    marketLevel: 'Local',
    classification: 'Direct Competitor',
    description: 'Suggested regional-nearby candidate in Madurai. Verification pending — verify active service lines and portfolio.',
    industriesServed: ['SMEs', 'Education', 'Manufacturing'],
    primaryServices: [],
    notes: 'Verification pending — seeded local/Madurai belt candidate.',
  },
  {
    seedKey: 'seed_osiz_technologies_madurai',
    companyName: 'Osiz Technologies',
    location: 'Madurai, Tamil Nadu',
    marketLevel: 'Local',
    classification: 'Direct Competitor',
    description: 'Suggested Madurai IT candidate. Verification pending — verify official website, AI/software services, and evidence.',
    industriesServed: ['IT & SaaS', 'Enterprise'],
    primaryServices: [],
    notes: 'Verification pending — seeded local/Madurai belt candidate.',
  },
];

export const BENCHMARK_DISCLAIMER_TEXT =
  'Note: Regional and National Benchmarks represent Tamil Nadu and India IT/product companies for capability benchmarking — they are not Sivakasi/Virudhunagar local competitors.';

export const SUGGESTED_BENCHMARK_COMPETITORS: SeedCompetitorCandidate[] = [
  {
    seedKey: 'bench_zoho',
    companyName: 'Zoho',
    location: 'Chennai, Tamil Nadu',
    marketLevel: 'Tamil Nadu',
    classification: 'Regional Benchmark',
    description: 'Tamil Nadu SaaS & enterprise software benchmark. Verify specific capability metrics via official pages.',
    industriesServed: ['SaaS', 'Enterprise', 'SMEs'],
    primaryServices: [],
    notes: BENCHMARK_DISCLAIMER_TEXT,
  },
  {
    seedKey: 'bench_freshworks',
    companyName: 'Freshworks',
    location: 'Chennai, Tamil Nadu',
    marketLevel: 'Tamil Nadu',
    classification: 'Regional Benchmark',
    description: 'Tamil Nadu cloud CRM/ITSM SaaS benchmark. Verify public product & AI capabilities with source URLs.',
    industriesServed: ['SaaS', 'Enterprise'],
    primaryServices: [],
    notes: BENCHMARK_DISCLAIMER_TEXT,
  },
  {
    seedKey: 'bench_kissflow',
    companyName: 'Kissflow',
    location: 'Chennai, Tamil Nadu',
    marketLevel: 'Tamil Nadu',
    classification: 'Regional Benchmark',
    description: 'Tamil Nadu low-code workflow automation benchmark. Verify public capability claims before marking Verified.',
    industriesServed: ['Workflow Automation', 'Enterprise'],
    primaryServices: [],
    notes: BENCHMARK_DISCLAIMER_TEXT,
  },
  {
    seedKey: 'bench_contus_tech',
    companyName: 'Contus Tech',
    location: 'Chennai, Tamil Nadu',
    marketLevel: 'Tamil Nadu',
    classification: 'Regional Benchmark',
    description: 'Tamil Nadu custom software, IIoT, and digital transformation benchmark. Verify via official site.',
    industriesServed: ['IIoT', 'Enterprise', 'Media'],
    primaryServices: [],
    notes: BENCHMARK_DISCLAIMER_TEXT,
  },
  {
    seedKey: 'bench_orangemantra',
    companyName: 'OrangeMantra',
    location: 'Gurugram / India',
    marketLevel: 'India',
    classification: 'National Benchmark',
    description: 'India IT services, AI, and custom software benchmark. Verify official service pages with source URLs.',
    industriesServed: ['Enterprise', 'Retail', 'Manufacturing'],
    primaryServices: [],
    notes: BENCHMARK_DISCLAIMER_TEXT,
  },
  {
    seedKey: 'bench_mindinventory',
    companyName: 'MindInventory',
    location: 'Ahmedabad / India',
    marketLevel: 'India',
    classification: 'National Benchmark',
    description: 'India web, mobile, UI/UX, and AI engineering benchmark. Verify public case studies and stack claims.',
    industriesServed: ['SaaS', 'Startups', 'Enterprise'],
    primaryServices: [],
    notes: BENCHMARK_DISCLAIMER_TEXT,
  },
];

export const MANUAL_RESEARCH_CHECKLIST = [
  {
    id: 'check_website',
    title: 'Official Website & SSL Check',
    description: 'Open their primary domain, verify HTTPS, active copyright year, and core service pages.',
    category: 'Digital Presence' as EvidenceCategory,
    metricKey: 'dig_official_website',
    metricName: 'Official Website & SSL',
  },
  {
    id: 'check_gbp',
    title: 'Google Business Profile & Maps',
    description: 'Search "<Company> <City>" on Google Maps to record public address, rating, and review count.',
    category: 'Digital Presence' as EvidenceCategory,
    metricKey: 'dig_google_business',
    metricName: 'Google Business Profile & Maps',
  },
  {
    id: 'check_services',
    title: 'Services & Industrial Automation Check',
    description: 'Verify which of your 9 core services (and EMS/MES/SCADA/PLC/IIoT) are explicitly offered online.',
    category: 'Services' as EvidenceCategory,
    metricKey: 'svc_website_dev',
    metricName: 'Website Development',
  },
  {
    id: 'check_social_portfolio',
    title: 'LinkedIn, Instagram & Portfolio Proof',
    description: 'Inspect LinkedIn company page, Instagram activity, and public portfolio/client testimonials.',
    category: 'Business Evidence' as EvidenceCategory,
    metricKey: 'biz_client_proof',
    metricName: 'Public Testimonials & Client Logos',
  },
  {
    id: 'check_tech_pricing',
    title: 'Tech Stack & Pricing Positioning',
    description: 'Note publicly mentioned frameworks (e.g. WordPress, React, Node) or pricing model; mark Unknown if absent.',
    category: 'Technology' as EvidenceCategory,
    metricKey: 'tech_frontend_stack',
    metricName: 'Frontend & Web Stack',
  },
] as const;

export const STALE_EVIDENCE_DAYS = 90;
export const AI_RESEARCH_DAILY_LIMIT = 20;

// ---------------------------------------------------------------------------
// Phase 5B: Scorecards, Comparison, Gaps & Progression Constants
// ---------------------------------------------------------------------------

export interface ScorecardDimensionDef {
  key: ScorecardDimensionKey;
  label: string;
  defaultWeight: number;
  scorecardType: ScorecardType;
  description: string;
}

export const SCORE_DIMENSIONS: ScorecardDimensionDef[] = [
  {
    key: 'revenue_growth',
    label: 'Revenue / Business Growth',
    defaultWeight: 15,
    scorecardType: 'Business Performance',
    description: 'Verified or GoalX-derived month-over-month revenue trajectory (never guessed).',
  },
  {
    key: 'client_acquisition',
    label: 'Client Acquisition',
    defaultWeight: 10,
    scorecardType: 'Business Performance',
    description: 'Lead pipeline conversion, recurring clients, and verified customer wins.',
  },
  {
    key: 'project_delivery',
    label: 'Project Delivery',
    defaultWeight: 10,
    scorecardType: 'Business Performance',
    description: 'On-time delivery rate, turnaround discipline, and operational reliability.',
  },
  {
    key: 'service_portfolio',
    label: 'Service Portfolio',
    defaultWeight: 10,
    scorecardType: 'Business Performance',
    description: 'Breadth and depth across core digital & automation services.',
  },
  {
    key: 'technology_innovation',
    label: 'Technology & Innovation',
    defaultWeight: 10,
    scorecardType: 'Business Performance',
    description: 'Modern cloud/AI/IIoT stack maturity and automation engineering.',
  },
  {
    key: 'portfolio_quality',
    label: 'Portfolio Quality',
    defaultWeight: 15,
    scorecardType: 'Market Presence',
    description: 'Published work samples, demos, case studies, and verified client logos.',
  },
  {
    key: 'customer_reputation',
    label: 'Customer Reputation',
    defaultWeight: 10,
    scorecardType: 'Market Presence',
    description: 'Public Google reviews, client testimonials, and retention proof.',
  },
  {
    key: 'digital_presence',
    label: 'Digital Presence',
    defaultWeight: 10,
    scorecardType: 'Market Presence',
    description: 'Official website quality, SSL, SEO visibility, and active social channels.',
  },
  {
    key: 'team_operations',
    label: 'Team & Operations',
    defaultWeight: 5,
    scorecardType: 'Business Performance',
    description: 'Verified team footprint, specialist roles, and operational bandwidth.',
  },
  {
    key: 'pricing_value',
    label: 'Pricing & Value',
    defaultWeight: 5,
    scorecardType: 'Market Presence',
    description: 'Competitive pricing transparency, packaging clarity, and value positioning.',
  },
];

export const DEFAULT_SCORECARD_WEIGHTS: ScorecardWeights = {
  revenue_growth: 15,
  client_acquisition: 10,
  project_delivery: 10,
  service_portfolio: 10,
  technology_innovation: 10,
  portfolio_quality: 15,
  customer_reputation: 10,
  digital_presence: 10,
  team_operations: 5,
  pricing_value: 5,
};

export const DEFAULT_RATING_SCORE_MAP: RatingScoreMap = {
  r1: 20,
  r2: 40,
  r3: 60,
  r4: 80,
  r5: 100,
};

export interface ScorecardMetricDef {
  metricKey: string;
  metricName: string;
  dimensionKey: ScorecardDimensionKey;
  scorecardType: ScorecardType;
  derivableFromGoalX: boolean;
  description: string;
}

export const SCORECARD_METRIC_DEFS: ScorecardMetricDef[] = [
  {
    metricKey: 'biz_revenue_growth',
    metricName: 'Revenue / Business Growth',
    dimensionKey: 'revenue_growth',
    scorecardType: 'Business Performance',
    derivableFromGoalX: true,
    description: 'MoM revenue growth (computed from GoalX Finance when ≥ 2 months exist; Unknown if competitor has no verified data).',
  },
  {
    metricKey: 'biz_client_acquisition',
    metricName: 'Client Acquisition & Pipeline',
    dimensionKey: 'client_acquisition',
    scorecardType: 'Business Performance',
    derivableFromGoalX: true,
    description: 'Leads & won clients acquisition strength vs competitor verified client acquisition proof.',
  },
  {
    metricKey: 'biz_project_delivery',
    metricName: 'Project Delivery & On-Time Rate',
    dimensionKey: 'project_delivery',
    scorecardType: 'Business Performance',
    derivableFromGoalX: true,
    description: 'On-time project completion rate from GoalX Projects vs competitor public SLA/delivery proof.',
  },
  {
    metricKey: 'biz_service_portfolio',
    metricName: 'Service Portfolio Breadth',
    dimensionKey: 'service_portfolio',
    scorecardType: 'Business Performance',
    derivableFromGoalX: true,
    description: 'Active service lines from Gen Z Neural-X Service Catalog vs competitor verified services.',
  },
  {
    metricKey: 'tech_innovation_stack',
    metricName: 'Technology & Innovation',
    dimensionKey: 'technology_innovation',
    scorecardType: 'Business Performance',
    derivableFromGoalX: false,
    description: 'AI, cloud, SCADA/IIoT, and modern software architecture depth.',
  },
  {
    metricKey: 'biz_team_operations',
    metricName: 'Team & Operations Strength',
    dimensionKey: 'team_operations',
    scorecardType: 'Business Performance',
    derivableFromGoalX: true,
    description: 'Active team size from GoalX Team vs competitor verified team/office footprint.',
  },
  {
    metricKey: 'biz_customer_retention',
    metricName: 'Customer Retention & Repeat Clients',
    dimensionKey: 'client_acquisition',
    scorecardType: 'Business Performance',
    derivableFromGoalX: true,
    description: 'Recurring/repeat clients ratio from GoalX Clients vs verified competitor retention proof.',
  },
  {
    metricKey: 'biz_profitability',
    metricName: 'Business Profitability Health',
    dimensionKey: 'revenue_growth',
    scorecardType: 'Business Performance',
    derivableFromGoalX: true,
    description: 'Net profit margin computed from GoalX Company Finance (never guessed for competitors).',
  },
  {
    metricKey: 'dig_official_website',
    metricName: 'Website Quality & SSL',
    dimensionKey: 'digital_presence',
    scorecardType: 'Market Presence',
    derivableFromGoalX: false,
    description: 'Website UX, clarity of positioning, speed, and SSL security.',
  },
  {
    metricKey: 'dig_seo_visibility',
    metricName: 'SEO & Local Search Visibility',
    dimensionKey: 'digital_presence',
    scorecardType: 'Market Presence',
    derivableFromGoalX: false,
    description: 'Ranking visibility for regional Tamil Nadu & service keywords.',
  },
  {
    metricKey: 'dig_google_business',
    metricName: 'Public Reviews & Google Rating',
    dimensionKey: 'customer_reputation',
    scorecardType: 'Market Presence',
    derivableFromGoalX: false,
    description: 'Verified Google Business rating, review count, and sentiment.',
  },
  {
    metricKey: 'dig_social_channels',
    metricName: 'Social Media Activity',
    dimensionKey: 'digital_presence',
    scorecardType: 'Market Presence',
    derivableFromGoalX: false,
    description: 'Consistent LinkedIn, Instagram, and Facebook brand presence.',
  },
  {
    metricKey: 'dig_portfolio_cases',
    metricName: 'Portfolio Quality & Visibility',
    dimensionKey: 'portfolio_quality',
    scorecardType: 'Market Presence',
    derivableFromGoalX: false,
    description: 'Public project showcase, live demos, and visual presentation.',
  },
  {
    metricKey: 'biz_client_proof',
    metricName: 'Case Studies & Client Testimonials',
    dimensionKey: 'portfolio_quality',
    scorecardType: 'Market Presence',
    derivableFromGoalX: false,
    description: 'Named client stories, quantified outcomes, and verified logos.',
  },
  {
    metricKey: 'biz_pricing_model',
    metricName: 'Pricing Transparency & Value',
    dimensionKey: 'pricing_value',
    scorecardType: 'Market Presence',
    derivableFromGoalX: false,
    description: 'Clear service tiers, packages, and ROI communication.',
  },
];

export interface GapTemplateDef {
  id: string;
  title: string;
  description: string;
  linkedMetricKey: string;
  businessImpact: 'High' | 'Medium' | 'Low';
  priority: 'High' | 'Medium' | 'Low';
  estimatedEffort: 'High' | 'Medium' | 'Low';
  suggestedAction: string;
}

export const GAP_TEMPLATES: GapTemplateDef[] = [
  {
    id: 'tpl_portfolio',
    title: 'Publish 5 interactive portfolio showcases',
    description: 'Close portfolio visibility gap by showcasing live web, mobile, and automation demos.',
    linkedMetricKey: 'dig_portfolio_cases',
    businessImpact: 'High',
    priority: 'High',
    estimatedEffort: 'Medium',
    suggestedAction: 'Select 5 flagship deliveries, capture before/after visuals, and publish a filterable /work showcase on genzneuralx.com.',
  },
  {
    id: 'tpl_case_studies',
    title: 'Add 3 quantified client case studies',
    description: 'Turn verified client deliveries into outcomes-focused proof with client quotes.',
    linkedMetricKey: 'biz_client_proof',
    businessImpact: 'High',
    priority: 'High',
    estimatedEffort: 'Medium',
    suggestedAction: 'Interview 3 satisfied clients in Sivakasi/Virudhunagar and publish Problem → Architecture → Outcome case studies.',
  },
  {
    id: 'tpl_local_seo',
    title: 'Improve local SEO for Virudhunagar & Tamil Nadu keywords',
    description: 'Rank top 3 for Sivakasi, Virudhunagar, and Rajapalayam IT & Industrial Automation searches.',
    linkedMetricKey: 'dig_seo_visibility',
    businessImpact: 'High',
    priority: 'High',
    estimatedEffort: 'High',
    suggestedAction: 'Create city-targeted service schema pages and optimize Google Business Profile categories and weekly updates.',
  },
  {
    id: 'tpl_service_landing',
    title: 'Build conversion-focused landing pages for 9 core services',
    description: 'Ensure every Gen Z Neural-X service (including EMS/MES/SCADA/PLC/IIoT) has dedicated proof & CTA.',
    linkedMetricKey: 'dig_official_website',
    businessImpact: 'High',
    priority: 'Medium',
    estimatedEffort: 'Medium',
    suggestedAction: 'Draft dedicated landing sections with deliverables, starting tier, FAQ, and WhatsApp/lead capture per service line.',
  },
  {
    id: 'tpl_lead_followup',
    title: 'Tighten CRM lead follow-up cadence (< 2h response)',
    description: 'Outpace competitors on speed-to-proposal and follow-up discipline.',
    linkedMetricKey: 'biz_client_acquisition',
    businessImpact: 'High',
    priority: 'High',
    estimatedEffort: 'Low',
    suggestedAction: 'Review overdue CRM follow-ups daily in GoalX Leads and standardize same-day discovery call scheduling.',
  },
  {
    id: 'tpl_ai_products',
    title: 'Launch repeatable AI & IIoT vertical solution kits',
    description: 'Differentiate from traditional web-only agencies via packaged AI chatbots and factory IIoT.',
    linkedMetricKey: 'tech_innovation_stack',
    businessImpact: 'High',
    priority: 'Medium',
    estimatedEffort: 'High',
    suggestedAction: 'Package 1 AI support assistant demo and 1 EMS/SCADA monitoring dashboard demo for factory visits.',
  },
  {
    id: 'tpl_delivery_sla',
    title: 'Standardize sprint milestones & on-time delivery SLA',
    description: 'Sustain > 90% on-time delivery rate across active GoalX client projects.',
    linkedMetricKey: 'biz_project_delivery',
    businessImpact: 'Medium',
    priority: 'Medium',
    estimatedEffort: 'Medium',
    suggestedAction: 'Enforce weekly milestone check-ins on all active projects in GoalX Projects and track slippage early.',
  },
  {
    id: 'tpl_recurring_rev',
    title: 'Package AMC, cloud hosting & SEO retainers',
    description: 'Increase predictable monthly recurring revenue and smooth cashflow variance.',
    linkedMetricKey: 'biz_revenue_growth',
    businessImpact: 'High',
    priority: 'High',
    estimatedEffort: 'Medium',
    suggestedAction: 'Offer an annual maintenance + monitoring retainer add-on on every completed website, app, or SCADA project.',
  },
  {
    id: 'tpl_client_retention',
    title: 'Launch quarterly client check-in & upsell review',
    description: 'Improve repeat business and verified Google Business review velocity.',
    linkedMetricKey: 'dig_google_business',
    businessImpact: 'Medium',
    priority: 'Medium',
    estimatedEffort: 'Low',
    suggestedAction: 'Schedule quarterly value reviews with existing active clients and request verified Google Maps reviews upon sign-off.',
  },
];

export const PROGRESSION_STAGES = [
  { stage: 1, key: 'select_target', label: 'Select Active Target' },
  { stage: 2, key: 'research_competitor', label: 'Research & Collect Evidence' },
  { stage: 3, key: 'compare_metrics', label: 'Compare Metrics' },
  { stage: 4, key: 'identify_gaps', label: 'Identify Gaps' },
  { stage: 5, key: 'create_goals', label: 'Create Goals & Tasks' },
  { stage: 6, key: 'track_progress', label: 'Track Execution' },
  { stage: 7, key: 'monthly_review', label: 'Monthly Review' },
  { stage: 8, key: 'confirm_surpassed', label: 'Confirm Surpassed' },
] as const;

export const SURPASS_REQUIRED_COMPARABLE = 5;
export const SURPASS_REQUIRED_LEADS = 4;
export const SURPASS_REQUIRED_ADVANTAGE = 10;
export const SURPASS_REQUIRED_COVERAGE_PCT = 70;
export const SURPASS_REQUIRED_MONTHS = 2;

// ---------------------------------------------------------------------------
// Phase 6B: GoalX AI CEO, Briefings, Action Proposals & Baseline Constants
// ---------------------------------------------------------------------------

export const AI_DAILY_CHAT_LIMIT = 50;
export const AI_DAILY_BRIEFING_LIMIT = 10;
export const AI_DAILY_BASELINE_LIMIT = 10;
export const AI_MAX_INPUT_CHARS = 2000;
export const AI_MAX_HISTORY_MESSAGES = 10;
export const AI_PROPOSAL_EXPIRY_DAYS = 7;

export const AI_DISCLAIMER_DECISIONS = 'AI-assisted, verify important decisions';
export const AI_CREATED_PROPOSAL_BADGE = 'Created by AI proposal, confirmed by you.';

export const AI_SUGGESTED_PROMPTS: {
  group: 'Personal' | 'Business' | 'Competition';
  prompt: string;
}[] = [
  { group: 'Personal', prompt: 'Which goals need attention?' },
  { group: 'Personal', prompt: 'Am I on track with my habits this week?' },
  { group: 'Business', prompt: 'Why is revenue behind target?' },
  { group: 'Business', prompt: 'Which leads need follow-up?' },
  { group: 'Business', prompt: "Summarize this month's cashflow and outstanding payments" },
  { group: 'Competition', prompt: 'Compare us against our top competitor' },
  { group: 'Competition', prompt: 'What is my top priority today?' },
  { group: 'Competition', prompt: 'Check if our 30/60/90 day KPI targets are realistic' },
];

export const PLANNING_KPI_TARGETS = {
  leadConversionRatePct: 20,
  onTimeDeliveryPct: 90,
  collectionRatePct: 95,
  clientSatisfactionRating: 4.5,
  netProfitMarginPct: 20,
} as const;

// ---------------------------------------------------------------------------
// Phase 7A: Settings, Unified Notification Categories & Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'India Standard Time (Asia/Kolkata, IST +05:30)' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
  { value: 'Asia/Singapore', label: 'Singapore Time (Asia/Singapore, SGT +08:00)' },
  { value: 'Asia/Dubai', label: 'Gulf Standard Time (Asia/Dubai, GST +04:00)' },
  { value: 'Europe/London', label: 'United Kingdom (Europe/London)' },
  { value: 'America/New_York', label: 'US Eastern (America/New_York)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (America/Los_Angeles)' },
] as const;

export const NOTIFICATION_CATEGORY_DEFS: {
  key: import('../types').NotificationCategory;
  label: string;
  description: string;
}[] = [
  { key: 'deadlines', label: 'Deadlines & Budgets', description: 'Budget 80%/100% alerts and upcoming due dates.' },
  { key: 'projects', label: 'Projects', description: 'Project delivery deadlines and status risks.' },
  { key: 'follow_ups', label: 'CRM Follow-ups', description: 'Overdue and today lead follow-up reminders.' },
  { key: 'payments', label: 'Payments & Invoices', description: 'Overdue invoices, due dates, and pending payroll.' },
  { key: 'goals', label: 'Personal Goals', description: 'Goal target dates approaching or overdue.' },
  { key: 'habits', label: 'Habits & Streaks', description: 'Daily habit check-in reminders.' },
  { key: 'attendance', label: 'Team & Payroll', description: 'Monthly salary settlement and team operational alerts.' },
  { key: 'competitor_reviews', label: 'Competitor Reviews', description: 'Scheduled competitor reviews and stale (>90d) evidence.' },
  { key: 'achievements', label: 'Achievements & Milestones', description: 'Goal milestones, surpass milestones, and XP unlocks.' },
  { key: 'targets', label: 'Competitive Targets & Gaps', description: 'Monthly scorecard snapshots, gap deadlines, and surpass readiness.' },
  { key: 'ai_proposals', label: 'AI CEO & Proposals', description: 'Daily briefings and expiring AI action proposals.' },
];

export const DEFAULT_NOTIFICATION_PREFS: import('../types').NotificationPreferences = {
  categories: {
    deadlines: true,
    projects: true,
    follow_ups: true,
    payments: true,
    goals: true,
    habits: true,
    attendance: true,
    competitor_reviews: true,
    achievements: true,
    targets: true,
    ai_proposals: true,
  },
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

export const DEFAULT_GAMIFICATION_XP_CONFIG: import('../types').GamificationXpConfig = {
  taskComplete: 25,
  goalComplete: 100,
  milestoneComplete: 30,
  habitCheckIn: 15,
  projectComplete: 150,
  clientWon: 120,
  competitorSurpassed: 500,
  monthlyReviewSaved: 60,
};

