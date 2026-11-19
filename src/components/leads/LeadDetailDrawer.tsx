import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  MessageSquarePlus,
  Pencil,
  Phone,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useAuth } from '../../hooks/useAuth';
import { useLeadTimeline } from '../../hooks/useLeads';
import { useToast } from '../../hooks/useToast';
import { LEAD_NOTE_CHANNELS, LEAD_STATUSES, ROUTES } from '../../lib/constants';
import { getTodayDateString } from '../../lib/goalUtils';
import { formatINR } from '../../lib/moneyUtils';
import { LeadNoteFormValues, leadNoteSchema } from '../../lib/validators';
import {
  addLeadNote,
  convertLeadToClient,
  deleteLeadNote,
  deleteLeadPermanently,
  setLeadArchived,
} from '../../services/leadsService';
import { Lead, LeadStatus } from '../../types';

interface LeadDetailDrawerProps {
  lead: Lead | null;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
  onRequestStageChange: (lead: Lead, nextStatus: LeadStatus) => void;
}

export const LeadDetailDrawer: React.FC<LeadDetailDrawerProps> = ({
  lead,
  onClose,
  onEdit,
  onRequestStageChange,
}) => {
  const { firebaseUser } = useAuth();
  const { activities, notes, loading: timelineLoading } = useLeadTimeline(lead?.id ?? null);
  const { showToast } = useToast();

  const [converting, setConverting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const noteForm = useForm<LeadNoteFormValues>({
    resolver: zodResolver(leadNoteSchema),
    defaultValues: {
      channel: 'call',
      date: getTodayDateString(),
      text: '',
    },
  });

  if (!lead) return null;

  const handleAddNote = async (values: LeadNoteFormValues) => {
    if (!firebaseUser) return;
    try {
      await addLeadNote(firebaseUser.uid, lead.id, values.channel, values.date, values.text);
      noteForm.reset({
        channel: values.channel,
        date: getTodayDateString(),
        text: '',
      });
      showToast('Communication note logged', { variant: 'success' });
    } catch (err) {
      showToast('Failed to add note', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteLeadNote(noteId);
      showToast('Note removed', { variant: 'info' });
    } catch (err) {
      showToast('Failed to remove note', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleConvert = async () => {
    if (!firebaseUser) return;
    setConverting(true);
    try {
      await convertLeadToClient(firebaseUser.uid, lead);
      showToast('Lead converted to Client', {
        description: `${lead.clientName} is now active in Clients.`,
        variant: 'success',
      });
    } catch (err) {
      showToast('Conversion failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setConverting(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!firebaseUser) return;
    setArchiving(true);
    try {
      await setLeadArchived(firebaseUser.uid, lead, !lead.archived);
      showToast(lead.archived ? 'Lead restored to pipeline' : 'Lead archived', {
        variant: 'info',
      });
      if (!lead.archived) onClose();
    } catch (err) {
      showToast('Archive action failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setArchiving(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!firebaseUser) return;
    setDeleting(true);
    try {
      await deleteLeadPermanently(firebaseUser.uid, lead.id);
      showToast('Lead permanently deleted', { variant: 'info' });
      setDeleteDialogOpen(false);
      onClose();
    } catch (err) {
      showToast('Delete failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl h-full bg-white border-l border-[#E2E8F0] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#1F2937] truncate">{lead.clientName}</h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              {[lead.businessName, lead.serviceCategory, lead.leadSource]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onEdit(lead)}
              aria-label="Edit lead"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#64748B] hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Stage & Convert CTA */}
          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-[#64748B]">Pipeline Stage</p>
                <select
                  aria-label="Change lead stage"
                  value={lead.status}
                  onChange={(e) => onRequestStageChange(lead, e.target.value as LeadStatus)}
                  className="mt-1 min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E2E8F0] bg-white text-sm font-semibold text-[#1F2937] cursor-pointer"
                >
                  {LEAD_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-right">
                <p className="text-xs text-[#64748B]">Est. Budget</p>
                <p className="mt-1 text-lg font-bold text-[#1F2937] tabular-nums">
                  {lead.estimatedBudgetPaise > 0
                    ? formatINR(lead.estimatedBudgetPaise)
                    : 'Not specified'}
                </p>
              </div>
            </div>

            {lead.status === 'Lost' && lead.lostReason && (
              <p className="text-xs text-[#DC2626]">
                <span className="font-semibold">Lost reason: </span>
                {lead.lostReason}
              </p>
            )}

            {lead.status === 'Won' && (
              <div className="pt-2 border-t border-[#E2E8F0]">
                {lead.convertedClientId ? (
                  <Link
                    to={`${ROUTES.COMPANY_CLIENTS}/${lead.convertedClientId}`}
                    onClick={onClose}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-semibold text-[#16A34A] hover:bg-emerald-100 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Converted — Open Client Record</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleConvert()}
                    disabled={converting}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#16A34A] text-sm font-semibold text-white hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {converting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                    <span>Convert to Client</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Contact & Requirement Details */}
          <div className="space-y-3 text-sm">
            <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
              Lead Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-[#1F2937]">
                <Phone className="w-4 h-4 text-[#64748B] shrink-0" />
                <span>{lead.phone || 'No phone'}</span>
              </div>
              <div className="flex items-center gap-2 text-[#1F2937] min-w-0">
                <Mail className="w-4 h-4 text-[#64748B] shrink-0" />
                <span className="truncate">{lead.email || 'No email'}</span>
              </div>
              <div className="flex items-center gap-2 text-[#1F2937]">
                <MapPin className="w-4 h-4 text-[#64748B] shrink-0" />
                <span>{lead.location || 'No location'}</span>
              </div>
              <div className="flex items-center gap-2 text-[#1F2937] tabular-nums">
                <CalendarDays className="w-4 h-4 text-[#64748B] shrink-0" />
                <span>
                  {lead.followUpDate
                    ? `Follow-up: ${lead.followUpDate}`
                    : `Generated: ${lead.leadGeneratedDate}`}
                </span>
              </div>
            </div>

            {lead.assignedPerson && (
              <p className="text-xs text-[#64748B]">
                Assigned to: <span className="font-medium text-[#1F2937]">{lead.assignedPerson}</span>
              </p>
            )}

            {lead.requirement && (
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <p className="text-xs font-medium text-[#64748B] mb-1">Requirement</p>
                <p className="text-sm text-[#1F2937] whitespace-pre-wrap">{lead.requirement}</p>
              </div>
            )}

            {lead.notes && (
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <p className="text-xs font-medium text-[#64748B] mb-1">Notes</p>
                <p className="text-sm text-[#1F2937] whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}
          </div>

          {/* Communication Notes Timeline */}
          <div className="space-y-3 pt-4 border-t border-[#E2E8F0]">
            <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
              Communication Log
            </h3>

            <form
              onSubmit={noteForm.handleSubmit(handleAddNote)}
              className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5"
            >
              <div className="grid grid-cols-2 gap-2">
                <select
                  {...noteForm.register('channel')}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E2E8F0] bg-white text-xs font-medium text-[#1F2937]"
                >
                  {LEAD_NOTE_CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  {...noteForm.register('date')}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E2E8F0] bg-white text-xs text-[#1F2937]"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  {...noteForm.register('text')}
                  placeholder="Log call outcome, WhatsApp reply, or meeting summary..."
                  className="flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#1F2937]"
                />
                <button
                  type="submit"
                  disabled={noteForm.formState.isSubmitting}
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-[#DC2626] text-xs font-medium text-white hover:bg-[#B91C1C] cursor-pointer disabled:opacity-60 shrink-0"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                  <span>Log</span>
                </button>
              </div>
              {noteForm.formState.errors.text && (
                <p className="text-xs text-[#DC2626]">{noteForm.formState.errors.text.message}</p>
              )}
            </form>

            {timelineLoading ? (
              <p className="text-xs text-[#64748B]">Loading timeline...</p>
            ) : notes.length > 0 ? (
              <ul className="divide-y divide-[#E2E8F0]">
                {notes.map((n) => (
                  <li key={n.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-[#64748B] capitalize tabular-nums">
                        {n.channel} · {n.date}
                      </p>
                      <p className="text-sm text-[#1F2937] mt-0.5 whitespace-pre-wrap">{n.text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteNote(n.id)}
                      aria-label="Delete note"
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#64748B]">No communication notes logged yet.</p>
            )}
          </div>

          {/* Stage Change Audit History */}
          <div className="space-y-2.5 pt-4 border-t border-[#E2E8F0]">
            <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
              Stage History
            </h3>
            {activities.length > 0 ? (
              <ul className="divide-y divide-[#E2E8F0]">
                {activities.map((act) => (
                  <li key={act.id} className="py-2 text-xs flex items-start justify-between gap-3">
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
            ) : (
              <p className="text-xs text-[#64748B]">No stage transitions recorded.</p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void handleToggleArchive()}
            disabled={archiving}
            className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-white text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
          >
            {lead.archived ? (
              <>
                <ArchiveRestore className="w-4 h-4 text-[#16A34A]" />
                <span>Restore Lead</span>
              </>
            ) : (
              <>
                <Archive className="w-4 h-4 text-[#64748B]" />
                <span>Archive</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setDeleteDialogOpen(true)}
            className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-red-200 bg-white text-xs font-medium text-[#DC2626] hover:bg-red-50 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Permanently</span>
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        title={`Delete lead "${lead.clientName}"?`}
        description="This permanently removes the lead, its activity history, communication notes, and linked calendar follow-up."
        confirmLabel="Delete Lead"
        loading={deleting}
        onConfirm={handlePermanentDelete}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </div>
  );
};
