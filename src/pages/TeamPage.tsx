import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowUpRight,
  IndianRupee,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useTeam } from '../hooks/useTeam';
import { useToast } from '../hooks/useToast';
import { DEFAULT_COMMISSION_PCT, ROUTES } from '../lib/constants';
import { getTodayDateString } from '../lib/goalUtils';
import { formatINR, paiseToRupees } from '../lib/moneyUtils';
import { TeamMemberFormValues, teamMemberSchema } from '../lib/validators';
import {
  createTeamMemberWithPrivate,
  deleteTeamMember,
  updateTeamMemberWithPrivate,
} from '../services/teamService';
import { TeamMember } from '../types';

export const TeamPage: React.FC = () => {
  const { firebaseUser, userSettings } = useAuth();
  const { teamMembers, privateByMemberId, projects, salaryRecords, loading, error } = useTeam();
  const { showToast } = useToast();

  const defaultCommissionPct = userSettings?.defaultCommissionPct ?? DEFAULT_COMMISSION_PCT;
  const todayStr = getTodayDateString();

  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<TeamMemberFormValues>({
    resolver: zodResolver(teamMemberSchema),
    defaultValues: {
      name: '',
      role: '',
      department: '',
      email: '',
      phone: '',
      status: 'Active',
      joinedDate: todayStr,
      baseSalaryRupees: 0,
      commissionRatePct: null,
      bankNotes: '',
    },
  });

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return teamMembers.filter(
      (m) =>
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        m.department.toLowerCase().includes(q)
    );
  }, [teamMembers, searchTerm]);

  const openCreate = () => {
    setEditingMember(null);
    form.reset({
      name: '',
      role: '',
      department: '',
      email: '',
      phone: '',
      status: 'Active',
      joinedDate: todayStr,
      baseSalaryRupees: 0,
      commissionRatePct: null,
      bankNotes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (member: TeamMember) => {
    const priv = privateByMemberId.get(member.id);
    setEditingMember(member);
    form.reset({
      name: member.name,
      role: member.role,
      department: member.department || '',
      email: member.email || '',
      phone: member.phone || '',
      status: member.status,
      joinedDate: member.joinedDate || '',
      baseSalaryRupees: priv ? paiseToRupees(priv.baseSalaryPaise) : 0,
      commissionRatePct: priv?.commissionRatePct ?? null,
      bankNotes: priv?.bankNotes || '',
    });
    setModalOpen(true);
  };

  const onSubmit = async (values: TeamMemberFormValues) => {
    if (!firebaseUser) return;
    try {
      if (editingMember) {
        await updateTeamMemberWithPrivate(
          firebaseUser.uid,
          editingMember.id,
          privateByMemberId.has(editingMember.id),
          values
        );
        showToast('Team member updated', { variant: 'success' });
      } else {
        await createTeamMemberWithPrivate(firebaseUser.uid, values);
        showToast('Team member added', { variant: 'success' });
      }
      setModalOpen(false);
    } catch (err) {
      showToast('Failed to save team member', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTeamMember(deleteTarget.id, privateByMemberId.has(deleteTarget.id));
      showToast('Team member removed', { variant: 'info' });
      setDeleteTarget(null);
    } catch (err) {
      showToast('Delete failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <DashboardSkeleton />;
  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-[#DC2626]">
        Unable to load team: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Team &amp; Compensation</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Manage team roles, project assignments, and base salary / commission rules (stored privately in{' '}
            <code className="text-xs">teamMemberPrivate</code>).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            to={`${ROUTES.COMPANY_FINANCE}?tab=salaries`}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium text-[#1F2937] hover:bg-slate-50"
          >
            <IndianRupee className="w-4 h-4 text-[#16A34A]" />
            <span>Open Payroll</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#64748B]" />
          </Link>
          <button
            type="button"
            onClick={openCreate}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search team by name, role, or department..."
          className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#1F2937]"
        />
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((member) => {
            const priv = privateByMemberId.get(member.id);
            const assignedProjectsCount = projects.filter(
              (p) => p.assignedMemberId === member.id
            ).length;
            const totalPaidPaise = salaryRecords
              .filter((s) => s.memberId === member.id && s.status === 'Paid')
              .reduce((sum, s) => sum + s.netPayablePaise, 0);

            return (
              <article
                key={member.id}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#1F2937]">{member.name}</h2>
                    <p className="text-xs text-[#64748B]">
                      {member.role}
                      {member.department ? ` · ${member.department}` : ''}
                    </p>
                    <p
                      className={`mt-1 text-xs font-medium ${
                        member.status === 'Active' ? 'text-[#16A34A]' : 'text-[#64748B]'
                      }`}
                    >
                      {member.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(member)}
                      aria-label={`Edit ${member.name}`}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(member)}
                      aria-label={`Delete ${member.name}`}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {(member.email || member.phone) && (
                  <div className="space-y-1 text-xs text-[#64748B]">
                    {member.email && (
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{member.email}</span>
                      </div>
                    )}
                    {member.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span className="tabular-nums">{member.phone}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-3 border-t border-[#E2E8F0] grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[#64748B] block">Base Salary</span>
                    <span className="font-semibold text-[#1F2937] tabular-nums">
                      {priv ? formatINR(priv.baseSalaryPaise) : '₹0'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Commission</span>
                    <span className="font-semibold text-[#1F2937] tabular-nums">
                      {priv?.commissionRatePct ?? defaultCommissionPct}%
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[#64748B] block">Projects</span>
                    <span className="font-semibold text-[#1F2937] tabular-nums">
                      {assignedProjectsCount}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
                  <span className="text-[#64748B]">Lifetime Paid</span>
                  <span className="font-semibold text-[#16A34A] tabular-nums">
                    {formatINR(totalPaidPaise)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            title="No team members yet"
            description="Add engineers, designers, or sales reps to manage project assignments and monthly payroll."
            icon={<UserCog className="w-5 h-5" />}
            actionLabel="Add Member"
            onAction={openCreate}
          />
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1F2937]">
                {editingMember ? 'Edit Team Member' : 'Add Team Member'}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Full Name *</label>
                  <input type="text" {...form.register('name')} className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm" />
                  {form.formState.errors.name && (
                    <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.name.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Role *</label>
                  <input type="text" {...form.register('role')} placeholder="e.g., Full-Stack Engineer" className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm" />
                  {form.formState.errors.role && (
                    <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.role.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Department</label>
                  <input type="text" {...form.register('department')} placeholder="Engineering" className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Status</label>
                  <select {...form.register('status')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Joined Date</label>
                  <input type="date" {...form.register('joinedDate')} className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Email</label>
                  <input type="email" {...form.register('email')} className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Phone</label>
                  <input type="text" {...form.register('phone')} className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm" />
                </div>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
                <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  Private Compensation Config
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#1F2937] mb-1">Monthly Base Salary (₹)</label>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      {...form.register('baseSalaryRupees', { valueAsNumber: true })}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1F2937] mb-1">
                      Commission % (Blank = Default {defaultCommissionPct}%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      placeholder={`${defaultCommissionPct}%`}
                      {...form.register('commissionRatePct', { valueAsNumber: true })}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2E8F0] text-sm tabular-nums"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">UPI / Bank Payout Notes</label>
                  <textarea rows={2} {...form.register('bankNotes')} placeholder="Optional UPI ID or account reference..." className="w-full p-3 rounded-xl border border-[#E2E8F0] text-sm" />
                </div>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2.5">
                <button type="button" onClick={() => setModalOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#1F2937] cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={form.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-xl bg-[#DC2626] text-sm font-medium text-white cursor-pointer">
                  {form.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingMember ? 'Save Member' : 'Add Member'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Remove "${deleteTarget?.name}"?`}
        description="This deletes the member profile and private salary configuration. Historical salary records remain preserved."
        variant="danger"
        confirmLabel="Remove Member"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
