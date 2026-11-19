import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react';
import { isProposalExpired, isProposalExpiringSoon } from '../../lib/aiCeoContextUtils';
import {
  AI_CREATED_PROPOSAL_BADGE,
  AI_DISCLAIMER_DECISIONS,
  CALENDAR_EVENT_TYPES,
  GOAL_CATEGORIES,
  GOAL_PRIORITIES,
  GOAL_TYPES,
  LEAD_NOTE_CHANNELS,
} from '../../lib/constants';
import { useToast } from '../../hooks/useToast';
import { decideActionProposal } from '../../services/aiCeoService';
import { AiActionRequest, AiActionType } from '../../types';

interface ActionProposalCardProps {
  proposal: AiActionRequest;
  onDecided?: () => void;
}

const ACTION_TYPE_META: Record<
  AiActionType,
  { label: string; badgeClass: string; Icon: React.ElementType }
> = {
  create_goal: {
    label: 'Personal Goal',
    badgeClass: 'bg-red-50 text-[#DC2626] border-red-200',
    Icon: Target,
  },
  create_task: {
    label: 'Action Task',
    badgeClass: 'bg-blue-50 text-[#2563EB] border-blue-200',
    Icon: CheckCircle2,
  },
  create_calendar_event: {
    label: 'Calendar Event',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: Calendar,
  },
  create_lead_followup: {
    label: 'Lead Follow-up',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Icon: Clock,
  },
  create_competitive_gap: {
    label: 'Competitive Gap',
    badgeClass: 'bg-slate-100 text-[#1F2937] border-[#E2E8F0]',
    Icon: AlertTriangle,
  },
};

function formatRemainingExpiry(expiresAtIso: string): string {
  const target = Date.parse(expiresAtIso);
  if (!Number.isFinite(target)) return '7-day window';
  const diffMs = target - Date.now();
  if (diffMs <= 0) return 'Expired';
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 24) return `${Math.max(1, hours)}h remaining`;
  const days = Math.ceil(hours / 24);
  return `${days}d remaining`;
}

export const ActionProposalCard: React.FC<ActionProposalCardProps> = ({
  proposal,
  onDecided,
}) => {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const [editTitle, setEditTitle] = useState(proposal.title);
  const [editSummary, setEditSummary] = useState(proposal.summary);
  const [editPayload, setEditPayload] = useState<Record<string, unknown>>(
    () => ({ ...(proposal.payload || {}) })
  );

  const expired =
    proposal.status === 'Expired' ||
    (proposal.status === 'Pending' && isProposalExpired(proposal.expiresAtIso));
  const expiringSoon =
    proposal.status === 'Pending' &&
    !expired &&
    isProposalExpiringSoon(proposal.expiresAtIso);

  const effectiveStatus = expired ? 'Expired' : proposal.status;
  const meta = ACTION_TYPE_META[proposal.actionType] ?? ACTION_TYPE_META.create_task;
  const TypeIcon = meta.Icon;

  const payloadPreview = useMemo(() => {
    const p = proposal.payload || {};
    const pairs: [string, string][] = [];
    if (p.category) pairs.push(['Category', String(p.category)]);
    if (p.priority) pairs.push(['Priority', String(p.priority)]);
    if (p.targetDate) pairs.push(['Target Date', String(p.targetDate)]);
    if (p.dueDate) pairs.push(['Due Date', String(p.dueDate)]);
    if (p.date) pairs.push(['Date', String(p.date)]);
    if (p.startTime && !p.allDay) {
      pairs.push(['Time', `${p.startTime}${p.endTime ? ` - ${p.endTime}` : ''}`]);
    }
    if (p.followUpDate) pairs.push(['Follow-up', String(p.followUpDate)]);
    if (p.channel) pairs.push(['Channel', String(p.channel)]);
    if (p.deadline) pairs.push(['Deadline', String(p.deadline)]);
    if (p.noteText) pairs.push(['Note', String(p.noteText)]);
    if (p.suggestedAction) pairs.push(['Suggested Plan', String(p.suggestedAction)]);
    return pairs.slice(0, 5);
  }, [proposal.payload]);

  const setField = (key: string, value: unknown) => {
    setEditPayload((prev) => ({ ...prev, [key]: value }));
  };

  const handleConfirm = async (isEdited: boolean) => {
    setSubmitting(true);
    try {
      const res = await decideActionProposal(proposal.id, {
        decision: isEdited ? 'edit' : 'confirm',
        title: isEdited ? editTitle.trim() || proposal.title : proposal.title,
        summary: isEdited ? editSummary.trim() || proposal.summary : proposal.summary,
        payload: isEdited ? editPayload : proposal.payload,
      });
      if (!res.ok) {
        showToast('Proposal execution failed', {
          description: res.error || 'Please review the fields and try again.',
          variant: 'error',
        });
        return;
      }
      setEditMode(false);
      showToast('Confirmed & saved to GoalX', {
        description: AI_CREATED_PROPOSAL_BADGE,
        variant: 'success',
      });
      onDecided?.();
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      const res = await decideActionProposal(proposal.id, {
        decision: 'reject',
        rejectionReason: rejectionReason.trim() || 'Rejected by user.',
      });
      if (!res.ok) {
        showToast('Could not reject proposal', {
          description: res.error || 'Please try again.',
          variant: 'error',
        });
        return;
      }
      setRejectMode(false);
      showToast('Action proposal dismissed', { variant: 'info' });
      onDecided?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 transition-colors ${
        effectiveStatus === 'Executed'
          ? 'border-emerald-200 bg-emerald-50/50'
          : effectiveStatus === 'Rejected' || effectiveStatus === 'Expired'
            ? 'border-[#E2E8F0] bg-slate-50/70 opacity-85'
            : expiringSoon
              ? 'border-amber-300 bg-amber-50/40'
              : 'border-[#E2E8F0] bg-white'
      }`}
    >
      {/* Top Meta Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}
          >
            <TypeIcon className="w-3.5 h-3.5" />
            <span>{meta.label}</span>
          </span>
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
              effectiveStatus === 'Pending'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : effectiveStatus === 'Executed'
                  ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                  : 'border-[#E2E8F0] bg-slate-100 text-[#64748B]'
            }`}
          >
            {effectiveStatus}
          </span>
        </div>

        {effectiveStatus === 'Pending' && (
          <span
            className={`text-[11px] font-medium tabular-nums ${
              expiringSoon ? 'text-[#DC2626]' : 'text-[#64748B]'
            }`}
          >
            {expiringSoon ? 'Expiring soon · ' : 'Expires in '}
            {formatRemainingExpiry(proposal.expiresAtIso)}
          </span>
        )}
      </div>

      {/* Title & Summary OR Inline Edit Form */}
      {!editMode ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[#1F2937]">{proposal.title}</h4>
          {proposal.summary && (
            <p className="text-xs text-[#64748B] leading-relaxed">{proposal.summary}</p>
          )}

          {payloadPreview.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 text-xs">
              {payloadPreview.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <span className="text-[#64748B] font-medium">{k}: </span>
                  <span className="text-[#1F2937] break-words">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
              Title
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => {
                setEditTitle(e.target.value);
                if (
                  proposal.actionType === 'create_goal' ||
                  proposal.actionType === 'create_task' ||
                  proposal.actionType === 'create_calendar_event' ||
                  proposal.actionType === 'create_competitive_gap'
                ) {
                  setField('title', e.target.value);
                }
              }}
              className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs text-[#1F2937]"
            />
          </div>

          {proposal.actionType === 'create_goal' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Category
                </label>
                <select
                  value={String(editPayload.category ?? 'Career & Leadership')}
                  onChange={(e) => setField('category', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                >
                  {GOAL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Priority
                </label>
                <select
                  value={String(editPayload.priority ?? 'High')}
                  onChange={(e) => setField('priority', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                >
                  {GOAL_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Target Date
                </label>
                <input
                  type="date"
                  value={String(editPayload.targetDate ?? '')}
                  onChange={(e) => setField('targetDate', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Goal Type
                </label>
                <select
                  value={String(editPayload.goalType ?? 'Task-based')}
                  onChange={(e) => setField('goalType', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                >
                  {GOAL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {proposal.actionType === 'create_task' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Priority
                </label>
                <select
                  value={String(editPayload.priority ?? 'High')}
                  onChange={(e) => setField('priority', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                >
                  {GOAL_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={String(editPayload.dueDate ?? '')}
                  onChange={(e) => setField('dueDate', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={String(editPayload.description ?? '')}
                  onChange={(e) => setField('description', e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white p-2 text-xs"
                />
              </div>
            </div>
          )}

          {proposal.actionType === 'create_calendar_event' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Event Type
                </label>
                <select
                  value={String(editPayload.eventType ?? 'Personal Event')}
                  onChange={(e) => setField('eventType', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                >
                  {CALENDAR_EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={String(editPayload.date ?? '')}
                  onChange={(e) => setField('date', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  value={String(editPayload.startTime ?? '10:00')}
                  onChange={(e) => setField('startTime', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={String(editPayload.endTime ?? '10:30')}
                  onChange={(e) => setField('endTime', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                />
              </div>
            </div>
          )}

          {proposal.actionType === 'create_lead_followup' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Follow-up Date
                </label>
                <input
                  type="date"
                  value={String(editPayload.followUpDate ?? '')}
                  onChange={(e) => setField('followUpDate', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Channel
                </label>
                <select
                  value={String(editPayload.channel ?? 'call')}
                  onChange={(e) => setField('channel', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                >
                  {LEAD_NOTE_CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  CRM Note
                </label>
                <textarea
                  rows={2}
                  value={String(editPayload.noteText ?? '')}
                  onChange={(e) => setField('noteText', e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white p-2 text-xs"
                />
              </div>
            </div>
          )}

          {proposal.actionType === 'create_competitive_gap' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Priority
                </label>
                <select
                  value={String(editPayload.priority ?? 'High')}
                  onChange={(e) => setField('priority', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                >
                  {GOAL_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Deadline
                </label>
                <input
                  type="date"
                  value={String(editPayload.deadline ?? '')}
                  onChange={(e) => setField('deadline', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
                  Suggested Action
                </label>
                <textarea
                  rows={2}
                  value={String(editPayload.suggestedAction ?? '')}
                  onChange={(e) => setField('suggestedAction', e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white p-2 text-xs"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-[#1F2937] mb-1">
              Summary
            </label>
            <input
              type="text"
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs text-[#1F2937]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditMode(false)}
              disabled={submitting}
              className="min-h-[36px] px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
            >
              Cancel Edit
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm(true)}
              disabled={submitting}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-[#16A34A] text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Confirm &amp; Save</span>
            </button>
          </div>
        </div>
      )}

      {/* Reject Reason Box */}
      {rejectMode && effectiveStatus === 'Pending' && (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 space-y-2">
          <label className="block text-[11px] font-semibold text-[#1F2937]">
            Reason for rejecting (optional)
          </label>
          <input
            type="text"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="e.g., Already scheduled manually or priority shifted"
            className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs text-[#1F2937]"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectMode(false)}
              disabled={submitting}
              className="min-h-[34px] px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#1F2937] cursor-pointer"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void handleReject()}
              disabled={submitting}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 rounded-lg bg-[#DC2626] text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-60 cursor-pointer"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Confirm Reject</span>
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons / Post-Execution Status */}
      {effectiveStatus === 'Pending' && !editMode && !rejectMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-[#64748B]">{AI_DISCLAIMER_DECISIONS}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRejectMode(true)}
              disabled={submitting}
              className="min-h-[36px] inline-flex items-center gap-1 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#DC2626] hover:bg-red-50 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>
            <button
              type="button"
              onClick={() => setEditMode(true)}
              disabled={submitting}
              className="min-h-[36px] inline-flex items-center gap-1 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm(false)}
              disabled={submitting}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-[#DC2626] text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-60 cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Confirm &amp; Execute</span>
            </button>
          </div>
        </div>
      )}

      {effectiveStatus === 'Executed' && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <span className="inline-flex items-center gap-1.5 text-emerald-800 font-medium">
            <ShieldCheck className="w-4 h-4 text-[#16A34A]" />
            <span>{AI_CREATED_PROPOSAL_BADGE}</span>
          </span>
          {proposal.executedRecordRoute && (
            <Link
              to={proposal.executedRecordRoute}
              className="inline-flex items-center gap-1 font-semibold text-[#2563EB] hover:underline"
            >
              <span>Open Created Record</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      )}

      {(effectiveStatus === 'Rejected' || effectiveStatus === 'Expired') && (
        <p className="text-[11px] text-[#64748B]">
          {proposal.decisionNote ||
            (effectiveStatus === 'Expired'
              ? 'Proposal expired after 7 days without confirmation.'
              : 'Rejected by user.')}
        </p>
      )}
    </div>
  );
};
