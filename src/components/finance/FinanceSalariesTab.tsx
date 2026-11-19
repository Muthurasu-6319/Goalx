import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CheckCircle2,
  Download,
  History,
  Loader2,
  Pencil,
  RotateCcw,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { useAuth } from '../../hooks/useAuth';
import { useTeam } from '../../hooks/useTeam';
import { useToast } from '../../hooks/useToast';
import { DEFAULT_COMMISSION_PCT, FINANCE_PAYMENT_METHODS, ROUTES } from '../../lib/constants';
import { downloadCsvFile } from '../../lib/csvUtils';
import { calculateMemberCommission, calculateNetSalaryPaise } from '../../lib/financeUtils';
import { getTodayDateString } from '../../lib/goalUtils';
import { formatINR, getCurrentMonthKey, paiseToRupees, rupeesToPaise } from '../../lib/moneyUtils';
import { SalaryEditFormValues, salaryEditSchema } from '../../lib/validators';
import {
  markSalaryPaidWithExpense,
  undoSalaryPaidWithExpense,
  upsertSalaryRecordDetails,
} from '../../services/companyFinanceService';
import { logSecurityAuditEvent } from '../../services/securityAuditService';
import { updateUserSettings } from '../../services/settingsService';
import { FinancePaymentMethod, Project, ProjectPayment, SalaryRecord, TeamMember } from '../../types';
import { CalcInfoPopover } from './CalcInfoPopover';

interface FinanceSalariesTabProps {
  projects: Project[];
  projectPayments: ProjectPayment[];
}

interface ComputedPayrollRow {
  member: TeamMember;
  record: SalaryRecord | undefined;
  baseSalaryPaise: number;
  eligibleCollectionsPaise: number;
  commissionPctUsed: number;
  autoCommissionPaise: number;
  commissionPaise: number;
  commissionOverride: boolean;
  commissionNote: string;
  incentivePaise: number;
  deductionsPaise: number;
  netPayablePaise: number;
  status: 'Pending' | 'Paid';
  paidDate: string;
  paymentMethod: string;
  notes: string;
}

export const FinanceSalariesTab: React.FC<FinanceSalariesTabProps> = ({
  projects,
  projectPayments,
}) => {
  const { firebaseUser, userProfile, userSettings } = useAuth();
  const { teamMembers, privateByMemberId, salaryRecords } = useTeam();
  const { showToast } = useToast();

  const todayStr = getTodayDateString();
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());
  const globalCommissionPct = userSettings?.defaultCommissionPct ?? DEFAULT_COMMISSION_PCT;
  const loggedSalaryViewRef = useRef(false);

  useEffect(() => {
    if (!firebaseUser?.uid || loggedSalaryViewRef.current) return;
    loggedSalaryViewRef.current = true;
    void logSecurityAuditEvent({
      uid: firebaseUser.uid,
      actorName: userProfile?.name || firebaseUser.displayName || 'CEO',
      action: 'salary_view',
      details: `Viewed confidential payroll records for ${selectedMonth}.`,
    });
  }, [firebaseUser?.uid, firebaseUser?.displayName, userProfile?.name, selectedMonth]);

  // Modals state
  const [editingRow, setEditingRow] = useState<ComputedPayrollRow | null>(null);
  const [payingRow, setPayingRow] = useState<ComputedPayrollRow | null>(null);
  const [payDate, setPayDate] = useState(todayStr);
  const [payMethod, setPayMethod] = useState<FinancePaymentMethod>('Bank Transfer');
  const [markingPaid, setMarkingPaid] = useState(false);

  const [undoTarget, setUndoTarget] = useState<SalaryRecord | null>(null);
  const [undoLoading, setUndoLoading] = useState(false);

  const [historyMember, setHistoryMember] = useState<TeamMember | null>(null);

  const [commissionModalOpen, setCommissionModalOpen] = useState(false);
  const [commissionDraft, setCommissionDraft] = useState(String(globalCommissionPct));
  const [savingCommission, setSavingCommission] = useState(false);

  const editForm = useForm<SalaryEditFormValues>({
    resolver: zodResolver(salaryEditSchema),
    defaultValues: {
      baseSalaryRupees: 0,
      commissionOverride: false,
      commissionRupees: 0,
      commissionNote: '',
      incentiveRupees: 0,
      deductionsRupees: 0,
      notes: '',
    },
  });

  const rows = useMemo<ComputedPayrollRow[]>(() => {
    const recordByMember = new Map<string, SalaryRecord>();
    for (const r of salaryRecords) {
      if (r.month === selectedMonth) {
        recordByMember.set(r.memberId, r);
      }
    }

    const relevantMembers = teamMembers.filter(
      (m) => m.status === 'Active' || recordByMember.has(m.id)
    );

    return relevantMembers.map((member) => {
      const priv = privateByMemberId.get(member.id);
      const record = recordByMember.get(member.id);
      const commCalc = calculateMemberCommission({
        member,
        memberPrivate: priv,
        projects,
        projectPayments,
        month: selectedMonth,
        defaultCommissionPct: globalCommissionPct,
      });

      const baseSalaryPaise = record ? record.baseSalaryPaise : priv?.baseSalaryPaise ?? 0;
      const commissionOverride = record ? record.commissionOverride : false;
      const commissionPaise =
        record && (record.status === 'Paid' || record.commissionOverride)
          ? record.commissionPaise
          : commCalc.commissionPaise;
      const commissionPctUsed = record ? record.commissionPctUsed : commCalc.commissionPctUsed;
      const incentivePaise = record ? record.incentivePaise : 0;
      const deductionsPaise = record ? record.deductionsPaise : 0;
      const netPayablePaise =
        record && record.status === 'Paid'
          ? record.netPayablePaise
          : calculateNetSalaryPaise(baseSalaryPaise, commissionPaise, incentivePaise, deductionsPaise);

      return {
        member,
        record,
        baseSalaryPaise,
        eligibleCollectionsPaise: commCalc.eligibleCollectionsPaise,
        commissionPctUsed,
        autoCommissionPaise: commCalc.commissionPaise,
        commissionPaise,
        commissionOverride,
        commissionNote: record?.commissionNote ?? '',
        incentivePaise,
        deductionsPaise,
        netPayablePaise,
        status: record?.status ?? 'Pending',
        paidDate: record?.paidDate ?? '',
        paymentMethod: record?.paymentMethod ?? '',
        notes: record?.notes ?? '',
      };
    });
  }, [teamMembers, privateByMemberId, salaryRecords, projects, projectPayments, selectedMonth, globalCommissionPct]);

  const totals = useMemo(() => {
    let totalPayrollPaise = 0;
    let totalPaidPaise = 0;
    let totalPendingPaise = 0;
    let totalCommissionPaise = 0;
    for (const r of rows) {
      totalPayrollPaise += r.netPayablePaise;
      totalCommissionPaise += r.commissionPaise;
      if (r.status === 'Paid') totalPaidPaise += r.netPayablePaise;
      else totalPendingPaise += r.netPayablePaise;
    }
    return { totalPayrollPaise, totalPaidPaise, totalPendingPaise, totalCommissionPaise };
  }, [rows]);

  const memberHistory = useMemo(() => {
    if (!historyMember) return [];
    return salaryRecords
      .filter((r) => r.memberId === historyMember.id)
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [salaryRecords, historyMember]);

  const openEditModal = (row: ComputedPayrollRow) => {
    setEditingRow(row);
    editForm.reset({
      baseSalaryRupees: paiseToRupees(row.baseSalaryPaise),
      commissionOverride: row.commissionOverride,
      commissionRupees: paiseToRupees(row.commissionPaise),
      commissionNote: row.commissionNote,
      incentiveRupees: paiseToRupees(row.incentivePaise),
      deductionsRupees: paiseToRupees(row.deductionsPaise),
      notes: row.notes,
    });
  };

  const onSaveEdit = async (values: SalaryEditFormValues) => {
    if (!firebaseUser || !editingRow) return;
    try {
      const effectiveValues: SalaryEditFormValues = values.commissionOverride
        ? values
        : {
            ...values,
            commissionRupees: paiseToRupees(editingRow.autoCommissionPaise),
            commissionNote: '',
          };

      await upsertSalaryRecordDetails({
        uid: firebaseUser.uid,
        member: editingRow.member,
        month: selectedMonth,
        existingRecord: editingRow.record,
        commissionPctUsed: editingRow.commissionPctUsed,
        values: effectiveValues,
      });
      showToast(`Salary updated for ${editingRow.member.name}`, { variant: 'success' });
      setEditingRow(null);
    } catch (err) {
      showToast('Failed to update salary', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const openPayModal = (row: ComputedPayrollRow) => {
    setPayingRow(row);
    setPayDate(todayStr);
    setPayMethod('Bank Transfer');
  };

  const handleConfirmPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !payingRow) return;
    if (payingRow.netPayablePaise <= 0) {
      showToast('Net payable must be greater than ₹0', { variant: 'warning' });
      return;
    }
    setMarkingPaid(true);
    try {
      await markSalaryPaidWithExpense({
        uid: firebaseUser.uid,
        member: payingRow.member,
        month: selectedMonth,
        existingRecord: payingRow.record,
        baseSalaryPaise: payingRow.baseSalaryPaise,
        commissionPaise: payingRow.commissionPaise,
        commissionPctUsed: payingRow.commissionPctUsed,
        commissionOverride: payingRow.commissionOverride,
        commissionNote: payingRow.commissionNote,
        incentivePaise: payingRow.incentivePaise,
        deductionsPaise: payingRow.deductionsPaise,
        paidDate: payDate,
        paymentMethod: payMethod,
      });
      showToast(`Marked Paid & logged Employee Salaries expense`, {
        description: `${payingRow.member.name} · ${formatINR(payingRow.netPayablePaise)}`,
        variant: 'success',
      });
      setPayingRow(null);
    } catch (err) {
      showToast('Failed to mark salary paid', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleConfirmUndo = async () => {
    if (!firebaseUser || !undoTarget) return;
    setUndoLoading(true);
    try {
      await undoSalaryPaidWithExpense({
        uid: firebaseUser.uid,
        actorName: userProfile?.name || firebaseUser.displayName || 'CEO',
        record: undoTarget,
      });
      showToast('Salary reverted to Pending & linked expense moved to trash', { variant: 'info' });
      setUndoTarget(null);
    } catch (err) {
      showToast('Failed to undo salary payout', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setUndoLoading(false);
    }
  };

  const handleSaveGlobalCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    const num = Number(commissionDraft);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      showToast('Enter a valid commission percentage between 0 and 100', { variant: 'warning' });
      return;
    }
    setSavingCommission(true);
    try {
      await updateUserSettings(firebaseUser.uid, { defaultCommissionPct: num });
      showToast(`Default commission updated to ${num}%`, { variant: 'success' });
      setCommissionModalOpen(false);
    } catch (err) {
      showToast('Failed to save commission setting', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSavingCommission(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Month',
      'Team Member',
      'Role',
      'Base Salary (INR)',
      'Commission (INR)',
      'Commission %',
      'Commission Override',
      'Incentive (INR)',
      'Deductions (INR)',
      'Net Payable (INR)',
      'Status',
      'Paid Date',
      'Method',
    ];
    const csvRows = rows.map((r) => [
      selectedMonth,
      r.member.name,
      r.member.role,
      paiseToRupees(r.baseSalaryPaise),
      paiseToRupees(r.commissionPaise),
      `${r.commissionPctUsed}%`,
      r.commissionOverride ? `Yes (${r.commissionNote})` : 'No',
      paiseToRupees(r.incentivePaise),
      paiseToRupees(r.deductionsPaise),
      paiseToRupees(r.netPayablePaise),
      r.status,
      r.paidDate || '',
      r.paymentMethod || '',
    ]);
    downloadCsvFile(`goalx-salaries-${selectedMonth}.csv`, headers, csvRows);
    if (firebaseUser?.uid) {
      void logSecurityAuditEvent({
        uid: firebaseUser.uid,
        actorName: userProfile?.name || firebaseUser.displayName || 'CEO',
        action: 'salary_export',
        details: `Exported payroll CSV for ${selectedMonth} (${rows.length} rows).`,
      });
    }
  };

  const watchedOverride = editForm.watch('commissionOverride');
  const watchedBase = editForm.watch('baseSalaryRupees') || 0;
  const watchedComm = editForm.watch('commissionRupees') || 0;
  const watchedIncentive = editForm.watch('incentiveRupees') || 0;
  const watchedDeductions = editForm.watch('deductionsRupees') || 0;
  const liveNetPreviewPaise = editingRow
    ? calculateNetSalaryPaise(
        rupeesToPaise(watchedBase),
        watchedOverride ? rupeesToPaise(watchedComm) : editingRow.autoCommissionPaise,
        rupeesToPaise(watchedIncentive),
        rupeesToPaise(watchedDeductions)
      )
    : 0;

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-medium text-[#64748B] mb-1">Payroll Month</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] tabular-nums"
            />
          </div>

          <div className="pt-4 sm:pt-0">
            <div className="flex items-center gap-2 text-xs text-[#64748B]">
              <span>
                Default Commission:{' '}
                <strong className="text-[#1F2937] tabular-nums">{globalCommissionPct}%</strong> on completed project collections
              </span>
              <CalcInfoPopover
                title="Commission & Net Salary"
                formula="Commission = member custom % (or global default %) × cash collected in the selected month from Completed projects assigned to the member."
                note="Net Payable = max(0, Base + Commission + Incentive − Deductions). Marking Paid automatically creates one Employee Salaries expense."
              />
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => {
                  setCommissionDraft(String(globalCommissionPct));
                  setCommissionModalOpen(true);
                }}
                className="text-[#DC2626] font-medium hover:underline cursor-pointer"
              >
                Adjust Default %
              </button>
              <Link to={ROUTES.COMPANY_TEAM} className="text-[#2563EB] font-medium hover:underline">
                Manage Team Profiles
              </Link>
              <Link
                to={`${ROUTES.SETTINGS}?tab=preferences`}
                className="inline-flex items-center gap-1 text-[#64748B] hover:text-[#1F2937]"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Settings</span>
              </Link>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={rows.length === 0}
          className="min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 disabled:opacity-50 cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Export Payroll CSV</span>
        </button>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
          <p className="text-xs text-[#64748B]">Total Payroll ({selectedMonth})</p>
          <p className="mt-1 text-xl font-bold text-[#1F2937] tabular-nums">
            {formatINR(totals.totalPayrollPaise)}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
          <p className="text-xs text-[#64748B]">Paid Out</p>
          <p className="mt-1 text-xl font-bold text-[#16A34A] tabular-nums">
            {formatINR(totals.totalPaidPaise)}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
          <p className="text-xs text-[#64748B]">Pending Payout</p>
          <p className="mt-1 text-xl font-bold text-[#F59E0B] tabular-nums">
            {formatINR(totals.totalPendingPaise)}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
          <p className="text-xs text-[#64748B]">Total Commission</p>
          <p className="mt-1 text-xl font-bold text-[#2563EB] tabular-nums">
            {formatINR(totals.totalCommissionPaise)}
          </p>
        </div>
      </div>

      {/* Payroll Table / Mobile Cards */}
      {rows.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            icon={<Users className="w-5 h-5" />}
            title="No team members yet"
            description="Add team members with base salary and commission settings to run monthly payroll."
            actionLabel="Go to Team"
            onAction={() => {
              window.location.assign(ROUTES.COMPANY_TEAM);
            }}
          />
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-[#E2E8F0] text-xs text-[#64748B]">
                    <th className="py-3 px-4">Team Member</th>
                    <th className="py-3 px-3 text-right">Base</th>
                    <th className="py-3 px-3 text-right">Commission</th>
                    <th className="py-3 px-3 text-right">Incentive</th>
                    <th className="py-3 px-3 text-right">Deductions</th>
                    <th className="py-3 px-3 text-right">Net Payable</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {rows.map((row) => (
                    <tr key={row.member.id} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-[#1F2937]">{row.member.name}</p>
                        <p className="text-xs text-[#64748B]">
                          {row.member.role} · {row.commissionPctUsed}% comm
                        </p>
                      </td>
                      <td className="py-3.5 px-3 text-right tabular-nums">
                        {formatINR(row.baseSalaryPaise)}
                      </td>
                      <td className="py-3.5 px-3 text-right tabular-nums">
                        <span className="font-medium text-[#1F2937]">{formatINR(row.commissionPaise)}</span>
                        {row.commissionOverride ? (
                          <span className="block text-[11px] text-[#F59E0B]">Overridden</span>
                        ) : (
                          <span className="block text-[11px] text-[#64748B]">
                            from {formatINR(row.eligibleCollectionsPaise)}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right tabular-nums text-[#16A34A]">
                        {formatINR(row.incentivePaise)}
                      </td>
                      <td className="py-3.5 px-3 text-right tabular-nums text-[#DC2626]">
                        {formatINR(row.deductionsPaise)}
                      </td>
                      <td className="py-3.5 px-3 text-right tabular-nums font-bold text-[#1F2937]">
                        {formatINR(row.netPayablePaise)}
                      </td>
                      <td className="py-3.5 px-3">
                        {row.status === 'Paid' ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#16A34A]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Paid
                            </span>
                            <p className="text-[11px] text-[#64748B] tabular-nums">{row.paidDate}</p>
                          </div>
                        ) : (
                          <span className="text-xs font-semibold text-[#F59E0B]">Pending</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setHistoryMember(row.member)}
                            title="Payment history"
                            className="p-2 rounded-lg text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          {row.status === 'Pending' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(row)}
                                title="Edit salary breakdown"
                                className="p-2 rounded-lg text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openPayModal(row)}
                                className="px-3 py-1.5 rounded-lg bg-[#16A34A] text-white text-xs font-medium hover:bg-emerald-700 cursor-pointer"
                              >
                                Mark Paid
                              </button>
                            </>
                          ) : (
                            row.record && (
                              <button
                                type="button"
                                onClick={() => setUndoTarget(row.record!)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#DC2626] hover:bg-red-50 cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Undo Paid</span>
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {rows.map((row) => (
              <div
                key={row.member.id}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#1F2937]">{row.member.name}</p>
                    <p className="text-xs text-[#64748B]">
                      {row.member.role} · {row.commissionPctUsed}% comm
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      row.status === 'Paid' ? 'text-[#16A34A]' : 'text-[#F59E0B]'
                    }`}
                  >
                    {row.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#64748B] block">Base / Comm</span>
                    <span className="font-medium tabular-nums">
                      {formatINR(row.baseSalaryPaise)} + {formatINR(row.commissionPaise)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[#64748B] block">Net Payable</span>
                    <span className="text-sm font-bold text-[#1F2937] tabular-nums">
                      {formatINR(row.netPayablePaise)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setHistoryMember(row.member)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>History</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {row.status === 'Pending' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#1F2937] cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openPayModal(row)}
                          className="px-3 py-1.5 rounded-lg bg-[#16A34A] text-white text-xs font-medium cursor-pointer"
                        >
                          Mark Paid
                        </button>
                      </>
                    ) : (
                      row.record && (
                        <button
                          type="button"
                          onClick={() => setUndoTarget(row.record!)}
                          className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#DC2626] cursor-pointer"
                        >
                          Undo Paid
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Edit Salary Breakdown Modal */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <div>
                <h3 className="text-base font-semibold text-[#1F2937]">
                  Edit Salary: {editingRow.member.name}
                </h3>
                <p className="text-xs text-[#64748B] tabular-nums">{selectedMonth}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="p-2 text-[#64748B] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={editForm.handleSubmit(onSaveEdit)}
              className="p-6 space-y-4 max-h-[82vh] overflow-y-auto"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Base Salary (INR)</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    {...editForm.register('baseSalaryRupees', { valueAsNumber: true })}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">
                    Auto Commission ({editingRow.commissionPctUsed}%)
                  </label>
                  <div className="h-11 rounded-xl bg-slate-50 border border-[#E2E8F0] px-3.5 flex items-center text-sm font-medium text-[#1F2937] tabular-nums">
                    {formatINR(editingRow.autoCommissionPaise)}
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-[#1F2937] cursor-pointer">
                <input
                  type="checkbox"
                  {...editForm.register('commissionOverride')}
                  className="w-4 h-4 accent-[#DC2626]"
                />
                <span>Manual Override Commission</span>
              </label>

              {watchedOverride && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
                  <div>
                    <label className="block text-xs font-medium text-[#1F2937] mb-1">
                      Override Commission (INR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      {...editForm.register('commissionRupees', { valueAsNumber: true })}
                      className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1F2937] mb-1">
                      Override Note *
                    </label>
                    <input
                      type="text"
                      placeholder="Reason for adjustment..."
                      {...editForm.register('commissionNote')}
                      className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm"
                    />
                    {editForm.formState.errors.commissionNote && (
                      <p className="mt-1 text-xs text-[#DC2626]">
                        {editForm.formState.errors.commissionNote.message}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Incentive / Bonus (INR)</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    {...editForm.register('incentiveRupees', { valueAsNumber: true })}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Deductions (INR)</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    {...editForm.register('deductionsRupees', { valueAsNumber: true })}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional payroll note..."
                  {...editForm.register('notes')}
                  className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-[#E2E8F0] flex items-center justify-between">
                <span className="text-xs font-medium text-[#64748B]">Computed Net Payable</span>
                <span className="text-base font-bold text-[#1F2937] tabular-nums">
                  {formatINR(liveNetPreviewPaise)}
                </span>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editForm.formState.isSubmitting}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 text-sm font-medium text-white cursor-pointer"
                >
                  {editForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Save Salary</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mark Paid Modal */}
      {payingRow && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleConfirmPay}
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#1F2937]">
                Pay Salary: {payingRow.member.name}
              </h3>
              <button
                type="button"
                onClick={() => setPayingRow(null)}
                className="p-2 text-[#64748B] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm">
              <p className="text-xs text-[#64748B]">Net Payable ({selectedMonth})</p>
              <p className="text-lg font-bold text-[#16A34A] tabular-nums">
                {formatINR(payingRow.netPayablePaise)}
              </p>
              <p className="mt-1 text-[11px] text-[#64748B]">
                Confirming automatically logs an expense in Category: Employee Salaries.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Paid Date</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                required
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Payment Method</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as FinancePaymentMethod)}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white"
              >
                {FINANCE_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPayingRow(null)}
                className="min-h-[42px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={markingPaid}
                className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#16A34A] px-5 text-sm font-medium text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-60"
              >
                {markingPaid && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Confirm &amp; Log Expense</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Adjust Global Default Commission Modal */}
      {commissionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <form
            onSubmit={handleSaveGlobalCommission}
            className="w-full max-w-sm bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#1F2937]">Default Commission Rate</h3>
              <button
                type="button"
                onClick={() => setCommissionModalOpen(false)}
                className="p-1.5 text-[#64748B] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">
                Default % applied when member rate is blank
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={commissionDraft}
                onChange={(e) => setCommissionDraft(e.target.value)}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCommissionModalOpen(false)}
                className="min-h-[40px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingCommission}
                className="min-h-[40px] inline-flex items-center gap-2 px-4 rounded-xl bg-[#DC2626] text-sm font-medium text-white cursor-pointer"
              >
                {savingCommission && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Save Rate</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Member Payment History Modal */}
      {historyMember && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <div>
                <h3 className="text-base font-semibold text-[#1F2937]">
                  Payroll History: {historyMember.name}
                </h3>
                <p className="text-xs text-[#64748B]">{historyMember.role}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryMember(null)}
                className="p-2 text-[#64748B] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 max-h-[75vh] overflow-y-auto">
              {memberHistory.length === 0 ? (
                <p className="text-sm text-[#64748B]">No saved salary records for this member yet.</p>
              ) : (
                <ul className="divide-y divide-[#E2E8F0]">
                  {memberHistory.map((rec) => (
                    <li key={rec.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-semibold text-[#1F2937] tabular-nums">{rec.month}</p>
                        <p className="text-xs text-[#64748B] tabular-nums">
                          Base {formatINR(rec.baseSalaryPaise)} · Comm {formatINR(rec.commissionPaise)}
                          {rec.paidDate ? ` · Paid ${rec.paidDate} (${rec.paymentMethod})` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-[#1F2937] tabular-nums">
                          {formatINR(rec.netPayablePaise)}
                        </p>
                        <span
                          className={`text-xs font-medium ${
                            rec.status === 'Paid' ? 'text-[#16A34A]' : 'text-[#F59E0B]'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Undo Paid Confirm */}
      <ConfirmDialog
        open={Boolean(undoTarget)}
        title="Revert Salary Payout to Pending?"
        description="This reverts the salary status back to Pending and soft-deletes the auto-logged Employee Salaries expense (moving it to Expense Trash with an audit entry)."
        confirmLabel="Undo Paid"
        variant="warning"
        loading={undoLoading}
        onConfirm={handleConfirmUndo}
        onCancel={() => setUndoTarget(null)}
      />
    </div>
  );
};
