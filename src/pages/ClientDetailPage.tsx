import React, { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  FolderKanban,
  Mail,
  MapPin,
  Phone,
  UserCheck,
} from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useBusinessDataContext } from '../hooks/useBusinessData';
import { useClients } from '../hooks/useClients';
import { useLeadTimeline } from '../hooks/useLeads';
import { ROUTES } from '../lib/constants';
import {
  computeProjectFinancials,
  deriveInvoicesWithStatus,
  isConfirmedProject,
} from '../lib/financeUtils';
import { getTodayDateString } from '../lib/goalUtils';
import { formatINR } from '../lib/moneyUtils';

export const ClientDetailPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { clients, loading, getClientSourceLead } = useClients();
  const { projects, projectPayments, businessExpenses, invoices, otherIncome } =
    useBusinessDataContext();

  const client = clients.find((c) => c.id === clientId) ?? null;
  const sourceLead = client ? getClientSourceLead(client.sourceLeadId) : null;
  const { activities, notes } = useLeadTimeline(sourceLead?.id ?? null);

  const clientProjects = useMemo(
    () => (client ? projects.filter((p) => p.clientId === client.id) : []),
    [client, projects]
  );

  const projectRows = useMemo(
    () => computeProjectFinancials(clientProjects, projectPayments, businessExpenses),
    [clientProjects, projectPayments, businessExpenses]
  );

  const clientInvoices = useMemo(() => {
    if (!client) return [];
    const todayStr = getTodayDateString();
    return deriveInvoicesWithStatus(
      invoices.filter((inv) => inv.clientId === client.id),
      projectPayments,
      todayStr
    );
  }, [client, invoices, projectPayments]);

  const financialSummary = useMemo(() => {
    const totalProjectValuePaise = clientProjects
      .filter(isConfirmedProject)
      .reduce((sum, p) => sum + p.budgetPaise, 0);

    const projectReceivedPaise = projectRows.reduce((sum, r) => sum + r.receivedPaise, 0);
    const otherReceivedPaise = client
      ? otherIncome
          .filter((o) => !o.isDeleted && o.clientId === client.id)
          .reduce((sum, o) => sum + o.amountPaise, 0)
      : 0;
    const totalReceivedPaise = projectReceivedPaise + otherReceivedPaise;
    const outstandingPaise = projectRows.reduce((sum, r) => sum + r.outstandingPaise, 0);
    const overpaidCount = projectRows.filter((r) => r.isOverpaid).length;

    return {
      totalProjectValuePaise,
      totalReceivedPaise,
      outstandingPaise,
      overpaidCount,
    };
  }, [client, clientProjects, projectRows, otherIncome]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!client) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
        <EmptyState
          title="Client not found"
          description="This client record may have been removed."
          actionLabel="Back to Clients"
          onAction={() => navigate(ROUTES.COMPANY_CLIENTS)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <Link
            to={ROUTES.COMPANY_CLIENTS}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#64748B] hover:text-[#1F2937]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Clients Directory</span>
          </Link>
          <h1 className="text-2xl font-bold text-[#1F2937]">{client.clientName}</h1>
          <p className="text-sm text-[#64748B]">
            {[client.company, client.status, client.serviceCategory].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={ROUTES.PROJECTS}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50"
          >
            <span>Projects</span>
          </Link>
          <Link
            to={`${ROUTES.COMPANY_FINANCE}?tab=invoices`}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#B91C1C]"
          >
            <span>Invoices &amp; Payments</span>
          </Link>
        </div>
      </div>

      {/* Derived Project & Finance Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <p className="text-xs text-[#64748B]">Projects</p>
          <p className="mt-1 text-2xl font-bold text-[#1F2937] tabular-nums">
            {clientProjects.length}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            {clientProjects.filter((p) => p.status === 'In Progress').length} in progress
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <p className="text-xs text-[#64748B]">Confirmed Project Value</p>
          <p className="mt-1 text-2xl font-bold text-[#1F2937] tabular-nums">
            {formatINR(financialSummary.totalProjectValuePaise)}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">Excludes Planning &amp; Cancelled</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <p className="text-xs text-[#64748B]">Amount Received</p>
          <p className="mt-1 text-2xl font-bold text-[#16A34A] tabular-nums">
            {formatINR(financialSummary.totalReceivedPaise)}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">From recorded payments</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <p className="text-xs text-[#64748B]">Outstanding Balance</p>
          <p className="mt-1 text-2xl font-bold text-[#F59E0B] tabular-nums">
            {formatINR(financialSummary.outstandingPaise)}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">
            {financialSummary.overpaidCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />
                {financialSummary.overpaidCount} overpaid project(s)
              </span>
            ) : (
              'Remaining receivable'
            )}
          </p>
        </div>
      </div>

      {/* Client Projects & Invoice History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#1F2937]">Client Projects</h2>
            <Link to={ROUTES.PROJECTS} className="text-xs font-medium text-[#DC2626] hover:underline">
              Manage Projects
            </Link>
          </div>
          {projectRows.length === 0 ? (
            <p className="text-xs text-[#64748B]">No projects linked to this client yet.</p>
          ) : (
            <ul className="divide-y divide-[#E2E8F0]">
              {projectRows.map((row) => (
                <li key={row.project.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1F2937] truncate">{row.project.title}</p>
                    <p className="text-xs text-[#64748B]">
                      {row.project.status} · Budget {formatINR(row.project.budgetPaise)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 text-xs tabular-nums">
                    <p className="font-semibold text-[#16A34A]">
                      Rcvd {formatINR(row.receivedPaise)}
                    </p>
                    {row.isOverpaid ? (
                      <p className="text-amber-700 font-medium">
                        Overpaid ({formatINR(row.overpaidPaise)})
                      </p>
                    ) : (
                      <p className="text-[#64748B]">Bal {formatINR(row.outstandingPaise)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#1F2937]">Invoice History</h2>
            <Link
              to={`${ROUTES.COMPANY_FINANCE}?tab=invoices`}
              className="text-xs font-medium text-[#DC2626] hover:underline"
            >
              Open Invoices
            </Link>
          </div>
          {clientInvoices.length === 0 ? (
            <p className="text-xs text-[#64748B]">No invoices issued for this client yet.</p>
          ) : (
            <ul className="divide-y divide-[#E2E8F0]">
              {clientInvoices.map((d) => (
                <li key={d.invoice.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-semibold text-[#1F2937] tabular-nums">
                      {d.invoice.invoiceNumber}
                    </p>
                    <p className="text-xs text-[#64748B] tabular-nums">
                      Due {d.invoice.dueDate} ·{' '}
                      <span
                        className={`font-medium ${
                          d.status === 'Paid'
                            ? 'text-[#16A34A]'
                            : d.status === 'Overdue'
                              ? 'text-[#DC2626]'
                              : 'text-[#2563EB]'
                        }`}
                      >
                        {d.status}
                        {d.status === 'Overdue' ? ` (${d.daysOverdue}d)` : ''}
                      </span>
                    </p>
                  </div>
                  <div className="text-right shrink-0 text-xs tabular-nums">
                    <p className="font-bold text-[#1F2937]">{formatINR(d.invoice.amountPaise)}</p>
                    <p className="text-[#64748B]">Bal {formatINR(d.balancePaise)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact & Account Information */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-[#1F2937]">Contact &amp; Account Info</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center gap-2.5 text-[#1F2937]">
              <Building2 className="w-4 h-4 text-[#64748B] shrink-0" />
              <span>{client.company || 'Individual / No company specified'}</span>
            </div>
            <div className="flex items-center gap-2.5 text-[#1F2937]">
              <Phone className="w-4 h-4 text-[#64748B] shrink-0" />
              <span>{client.phone || 'No phone number'}</span>
            </div>
            <div className="flex items-center gap-2.5 text-[#1F2937] min-w-0">
              <Mail className="w-4 h-4 text-[#64748B] shrink-0" />
              <span className="truncate">{client.email || 'No email address'}</span>
            </div>
            <div className="flex items-start gap-2.5 text-[#1F2937]">
              <MapPin className="w-4 h-4 text-[#64748B] shrink-0 mt-0.5" />
              <span>{client.address || 'No address specified'}</span>
            </div>
          </dl>

          <div className="pt-4 border-t border-[#E2E8F0] space-y-2 text-xs">
            <p className="text-[#64748B]">
              Client Manager:{' '}
              <span className="font-medium text-[#1F2937]">
                {client.clientManager || 'Unassigned'}
              </span>
            </p>
            <p className="text-[#64748B]">
              Service:{' '}
              <span className="font-medium text-[#1F2937]">
                {client.serviceCategory || 'General'}
              </span>
            </p>
          </div>

          {client.notes && (
            <div className="pt-4 border-t border-[#E2E8F0]">
              <p className="text-xs font-medium text-[#64748B] mb-1">Client Notes</p>
              <p className="text-sm text-[#1F2937] whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}
        </section>

        {/* Linked Source Lead History & Notes */}
        <section className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#16A34A]" />
              <h2 className="text-base font-semibold text-[#1F2937]">Linked Lead History</h2>
            </div>
            <Link to={ROUTES.COMPANY_LEADS} className="text-xs font-medium text-[#2563EB] hover:underline">
              Open CRM
            </Link>
          </div>

          {sourceLead ? (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[#64748B] block">Lead Source</span>
                  <span className="font-semibold text-[#1F2937]">{sourceLead.leadSource}</span>
                </div>
                <div>
                  <span className="text-[#64748B] block">Generated Date</span>
                  <span className="font-semibold text-[#1F2937] tabular-nums">
                    {sourceLead.leadGeneratedDate}
                  </span>
                </div>
                <div>
                  <span className="text-[#64748B] block">Estimated Budget</span>
                  <span className="font-semibold text-[#1F2937] tabular-nums">
                    {sourceLead.estimatedBudgetPaise > 0
                      ? formatINR(sourceLead.estimatedBudgetPaise)
                      : 'Not set'}
                  </span>
                </div>
              </div>

              {activities.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-2">
                    Pipeline Stage Transitions
                  </h3>
                  <ul className="divide-y divide-[#E2E8F0] text-xs">
                    {activities.map((act) => (
                      <li key={act.id} className="py-2 flex items-start justify-between gap-3">
                        <div>
                          <span className="font-semibold text-[#1F2937]">
                            {act.fromStatus ? `${act.fromStatus} → ${act.toStatus}` : `Created as ${act.toStatus}`}
                          </span>
                          {act.note && <p className="text-[#64748B] mt-0.5">{act.note}</p>}
                        </div>
                        <span className="text-[#64748B] tabular-nums shrink-0">{act.date}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {notes.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-2">
                    Pre-Conversion Communication Log
                  </h3>
                  <ul className="divide-y divide-[#E2E8F0] text-xs">
                    {notes.map((n) => (
                      <li key={n.id} className="py-2">
                        <span className="text-[#64748B] capitalize tabular-nums">
                          {n.channel} · {n.date}
                        </span>
                        <p className="text-sm text-[#1F2937] mt-0.5">{n.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="p-5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-sm text-[#64748B] flex items-center gap-3">
              <FolderKanban className="w-5 h-5 text-[#64748B] shrink-0" />
              <span>
                This client was created directly without a linked CRM lead.
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
