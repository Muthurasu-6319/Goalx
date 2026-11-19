import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  FolderKanban,
  Globe,
  Layers,
  MapPin,
  Pencil,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { QuickDataModal, QuickModalSection } from '../components/ui/QuickDataModal';
import { FormPageSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useClients } from '../hooks/useClients';
import { useFinance } from '../hooks/useFinance';
import { useLeads } from '../hooks/useLeads';
import { useServices } from '../hooks/useServices';
import {
  computeCrmMetrics,
  DateFilterPreset,
  getDateRangeBounds,
  getFollowUpBuckets,
} from '../lib/businessUtils';
import { ROUTES } from '../lib/constants';
import { formatPctOrNA } from '../lib/financeUtils';
import { getTodayDateString } from '../lib/goalUtils';
import { formatINR } from '../lib/moneyUtils';
import { sanitizeHttpUrl } from '../lib/urlUtils';

const DATE_PRESETS: { value: DateFilterPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
];

export const CompanyPage: React.FC = () => {
  const { dataLoading, userProfile, companyProfile } = useAuth();
  const { services, loading: servicesLoading } = useServices();
  const { leads, loading: leadsLoading } = useLeads();
  const { clients, loading: clientsLoading } = useClients();
  const navigate = useNavigate();

  const [modalSection, setModalSection] = useState<QuickModalSection | null>(null);
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('this_month');
  const todayStr = getTodayDateString();
  const [customStart, setCustomStart] = useState(todayStr.slice(0, 8) + '01');
  const [customEnd, setCustomEnd] = useState(todayStr);

  const dateBounds = useMemo(
    () => getDateRangeBounds(datePreset, customStart, customEnd, todayStr),
    [datePreset, customStart, customEnd, todayStr]
  );

  const { summary: financeSummary, projects } = useFinance(dateBounds.start, dateBounds.end, 'cash');

  const filteredLeads = useMemo(() => {
    return leads.filter(
      (l) =>
        !l.archived &&
        l.leadGeneratedDate >= dateBounds.start &&
        l.leadGeneratedDate <= dateBounds.end
    );
  }, [leads, dateBounds]);

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const created = c.createdAt?.toDate ? c.createdAt.toDate().toISOString().slice(0, 10) : '';
      if (!created) return true;
      return created >= dateBounds.start && created <= dateBounds.end;
    });
  }, [clients, dateBounds]);

  const crmMetrics = useMemo(() => computeCrmMetrics(filteredLeads), [filteredLeads]);
  const followUpBuckets = useMemo(() => getFollowUpBuckets(leads, todayStr), [leads, todayStr]);
  const activeServicesCount = useMemo(
    () => services.filter((s) => s.status === 'Active').length,
    [services]
  );

  if (dataLoading || servicesLoading || leadsLoading || clientsLoading) {
    return <FormPageSkeleton />;
  }

  if (!companyProfile) {
    return (
      <div className="max-w-3xl bg-white border border-[#E2E8F0] rounded-2xl p-6">
        <EmptyState
          title="Company profile not found"
          description="Set up your company details in Settings to populate your command center."
          actionLabel="Go to Settings"
          onAction={() => navigate(`${ROUTES.SETTINGS}?tab=company`)}
        />
      </div>
    );
  }

  const followUpsDueCount =
    followUpBuckets.todayFollowUps.length + followUpBuckets.overdueFollowUps.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">{companyProfile.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#64748B]">
            <span>{companyProfile.industry}</span>
            {companyProfile.stage && (
              <>
                <span aria-hidden="true">·</span>
                <span>{companyProfile.stage}</span>
              </>
            )}
            {userProfile?.name && (
              <>
                <span aria-hidden="true">·</span>
                <span>CEO: {userProfile.name}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            to={ROUTES.COMPANY_LEADS}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium text-[#1F2937] hover:bg-slate-50"
          >
            <BriefcaseBusiness className="w-4 h-4 text-[#DC2626]" />
            <span>Leads &amp; CRM</span>
          </Link>
          <Link
            to={`${ROUTES.SETTINGS}?tab=company`}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C]"
          >
            <Pencil className="w-4 h-4" />
            <span>Edit Company</span>
          </Link>
        </div>
      </div>

      {/* Phase 3A Quick Module Navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          to={ROUTES.COMPANY_SERVICES}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-4 hover:border-[#DC2626]/40 transition-colors flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-[#DC2626] flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1F2937]">Service Catalog</p>
              <p className="text-xs text-[#64748B] tabular-nums">
                {activeServicesCount} active of {services.length} services
              </p>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-[#64748B]" />
        </Link>

        <Link
          to={ROUTES.COMPANY_LEADS}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-4 hover:border-[#DC2626]/40 transition-colors flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
              <BriefcaseBusiness className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1F2937]">Leads &amp; CRM</p>
              <p className="text-xs text-[#64748B] tabular-nums">
                {leads.filter((l) => !l.archived).length} leads · {followUpsDueCount} follow-ups due
              </p>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-[#64748B]" />
        </Link>

        <Link
          to={ROUTES.COMPANY_CLIENTS}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-4 hover:border-[#DC2626]/40 transition-colors flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#16A34A] flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1F2937]">Clients Directory</p>
              <p className="text-xs text-[#64748B] tabular-nums">
                {clients.length} total clients
              </p>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-[#64748B]" />
        </Link>
      </div>

      {/* Date Filter Bar */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#1F2937]">Business Performance Window</h2>
            <p className="text-xs text-[#64748B] tabular-nums">
              Showing {dateBounds.label} ({dateBounds.start} to {dateBounds.end})
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setDatePreset(preset.value)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                  datePreset === preset.value
                    ? 'bg-[#DC2626] text-white border-[#DC2626]'
                    : 'bg-white text-[#1F2937] border-[#E2E8F0] hover:bg-slate-50'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {datePreset === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E2E8F0]">
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">Start Date</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">End Date</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937]"
              />
            </div>
          </div>
        )}
      </section>

      {/* Live Phase 3A KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Total Leads</span>
            <TrendingUp className="w-4 h-4 text-[#DC2626]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#1F2937] tabular-nums">
            {crmMetrics.totalLeads}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            {crmMetrics.newLeads} New · {crmMetrics.activePipelineLeads} in pipeline
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Converted Leads</span>
            <BriefcaseBusiness className="w-4 h-4 text-[#16A34A]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#16A34A] tabular-nums">
            {crmMetrics.wonLeads}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            Conversion Rate: {crmMetrics.conversionRatePct}%
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Total Clients</span>
            <Users className="w-4 h-4 text-[#2563EB]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#1F2937] tabular-nums">{clients.length}</p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            {filteredClients.length} added in {dateBounds.label.toLowerCase()}
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Follow-ups Due</span>
            <Clock className="w-4 h-4 text-[#F59E0B]" />
          </div>
          <p
            className={`mt-2 text-2xl font-bold tabular-nums ${
              followUpBuckets.overdueFollowUps.length > 0 ? 'text-[#DC2626]' : 'text-[#1F2937]'
            }`}
          >
            {followUpsDueCount}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            {followUpBuckets.todayFollowUps.length} today · {followUpBuckets.overdueFollowUps.length} overdue
          </p>
        </div>
      </div>

      {/* Live Company Financial & Project Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Link
          to={ROUTES.COMPANY_FINANCE}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-4 hover:border-[#DC2626]/40 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Revenue (Cash Basis)</span>
            <Wallet className="w-3.5 h-3.5 text-[#16A34A]" />
          </div>
          <p className="mt-2 text-lg font-bold text-[#1F2937] tabular-nums">
            {formatINR(financeSummary.revenuePaise)}
          </p>
          <p className="mt-1 text-[11px] text-[#64748B]">{dateBounds.label}</p>
        </Link>

        <Link
          to={`${ROUTES.COMPANY_FINANCE}?tab=income`}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-4 hover:border-[#DC2626]/40 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Collections</span>
            <Wallet className="w-3.5 h-3.5 text-[#2563EB]" />
          </div>
          <p className="mt-2 text-lg font-bold text-[#16A34A] tabular-nums">
            {formatINR(financeSummary.collectionsPaise)}
          </p>
          <p className="mt-1 text-[11px] text-[#64748B] tabular-nums">
            Outstanding: {formatINR(financeSummary.totalOutstandingPaise)}
          </p>
        </Link>

        <Link
          to={`${ROUTES.COMPANY_FINANCE}?tab=expenses`}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-4 hover:border-[#DC2626]/40 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Expenses</span>
            <Wallet className="w-3.5 h-3.5 text-[#DC2626]" />
          </div>
          <p className="mt-2 text-lg font-bold text-[#DC2626] tabular-nums">
            {formatINR(financeSummary.expensesPaise)}
          </p>
          <p className="mt-1 text-[11px] text-[#64748B]">{dateBounds.label}</p>
        </Link>

        <Link
          to={ROUTES.COMPANY_FINANCE}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-4 hover:border-[#DC2626]/40 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Net Profit</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#16A34A]" />
          </div>
          <p
            className={`mt-2 text-lg font-bold tabular-nums ${
              financeSummary.netProfitPaise >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
            }`}
          >
            {formatINR(financeSummary.netProfitPaise)}
          </p>
          <p className="mt-1 text-[11px] text-[#64748B] tabular-nums">
            Margin: {formatPctOrNA(financeSummary.profitMarginPct)}
          </p>
        </Link>

        <Link
          to={ROUTES.PROJECTS}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-4 hover:border-[#DC2626]/40 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Active Projects</span>
            <FolderKanban className="w-3.5 h-3.5 text-[#2563EB]" />
          </div>
          <p className="mt-2 text-lg font-bold text-[#1F2937] tabular-nums">
            {financeSummary.activeProjectCount}
          </p>
          <p className="mt-1 text-[11px] text-[#64748B] tabular-nums">
            {projects.length} total · {financeSummary.confirmedProjectCount} confirmed
          </p>
        </Link>
      </div>

      {/* Company Identity & Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-[#E2E8F0]">
            <div className="w-11 h-11 rounded-xl bg-red-50 text-[#DC2626] flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[#1F2937]">Company Identity &amp; Footprint</h2>
              <p className="text-xs text-[#64748B]">Core organization profile stored in Cloud Firestore</p>
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
            <div>
              <dt className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] mb-1">
                <Globe className="w-3.5 h-3.5" />
                <span>Website</span>
              </dt>
              <dd className="text-[#1F2937] break-all">
                {sanitizeHttpUrl(companyProfile.website) ? (
                  <a
                    href={sanitizeHttpUrl(companyProfile.website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
                  >
                    <span>{companyProfile.website}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <span className="text-[#64748B]">Not specified</span>
                )}
              </dd>
            </div>

            <div>
              <dt className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] mb-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Start Date</span>
              </dt>
              <dd className="text-[#1F2937] tabular-nums">
                {companyProfile.startDate || <span className="text-[#64748B]">Not specified</span>}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] mb-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>Operating Locations</span>
              </dt>
              <dd className="text-[#1F2937] leading-relaxed">
                {companyProfile.location || <span className="text-[#64748B]">Not specified</span>}
              </dd>
            </div>
          </dl>

          <div className="pt-4 border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                Active Service Offerings ({activeServicesCount})
              </h3>
              <Link to={ROUTES.COMPANY_SERVICES} className="text-xs font-medium text-[#DC2626] hover:underline">
                Manage Catalog
              </Link>
            </div>
            {services.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className="px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-sm font-medium text-[#1F2937] flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{service.name}</span>
                    <span
                      className={`text-[11px] shrink-0 ${
                        service.status === 'Active' ? 'text-[#16A34A]' : 'text-[#64748B]'
                      }`}
                    >
                      {service.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#64748B]">No services configured yet.</p>
            )}
          </div>
        </div>

        {/* Right Column: Company Goals */}
        <div className="space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-[#DC2626]" />
                <h2 className="text-base font-semibold text-[#1F2937]">Company Goals</h2>
              </div>
              <button
                type="button"
                onClick={() => setModalSection('business')}
                className="text-xs font-medium text-[#DC2626] hover:underline cursor-pointer"
              >
                Manage
              </button>
            </div>
            {companyProfile.goals && companyProfile.goals.length > 0 ? (
              <ul className="divide-y divide-[#E2E8F0]">
                {companyProfile.goals.map((goal, idx) => (
                  <li key={idx} className="py-2.5 text-sm text-[#1F2937]">
                    {goal}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No business goals yet"
                description="Add strategic milestones for your company."
                onAction={() => setModalSection('business')}
              />
            )}
          </div>
        </div>
      </div>

      <QuickDataModal section={modalSection} onClose={() => setModalSection(null)} />
    </div>
  );
};
