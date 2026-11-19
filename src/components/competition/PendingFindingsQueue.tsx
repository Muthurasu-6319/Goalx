import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Edit3,
  ExternalLink,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import {
  findDuplicateCompetitor,
  getResolvedAcceptedStatus,
  isValidHttpUrl,
} from '../../lib/competitorUtils';
import { DATA_STATUSES } from '../../lib/constants';
import { pendingFindingEditSchema, PendingFindingEditFormValues } from '../../lib/validators';
import { Competitor, CompetitorPendingFinding, CompetitorStatus, DataStatus } from '../../types';

interface PendingFindingsQueueProps {
  findings: CompetitorPendingFinding[];
  mode: 'metric' | 'discovery';
  existingCompetitors?: Competitor[];
  onAcceptMetric?: (finding: CompetitorPendingFinding) => Promise<void>;
  onEditAcceptMetric?: (
    finding: CompetitorPendingFinding,
    edited: PendingFindingEditFormValues
  ) => Promise<void>;
  onAcceptDiscovery?: (
    finding: CompetitorPendingFinding,
    promoteStatus: CompetitorStatus
  ) => Promise<void>;
  onReject: (finding: CompetitorPendingFinding, reason: string) => Promise<void>;
}

export const PendingFindingsQueue: React.FC<PendingFindingsQueueProps> = ({
  findings,
  mode,
  existingCompetitors = [],
  onAcceptMetric,
  onEditAcceptMetric,
  onAcceptDiscovery,
  onReject,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingFinding, setEditingFinding] = useState<CompetitorPendingFinding | null>(null);
  const [editValues, setEditValues] = useState<PendingFindingEditFormValues>({
    value: '',
    sourceUrl: '',
    evidenceDescription: '',
    dataStatus: 'Estimated',
    notes: '',
  });
  const [editError, setEditError] = useState<string>('');

  const [rejectingFinding, setRejectingFinding] = useState<CompetitorPendingFinding | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  if (findings.length === 0) return null;

  const openEditModal = (f: CompetitorPendingFinding) => {
    setEditingFinding(f);
    setEditError('');
    setEditValues({
      value: f.proposedValue,
      sourceUrl: f.sourceUrl || '',
      evidenceDescription: f.evidenceDescription,
      dataStatus: getResolvedAcceptedStatus(f.sourceUrl),
      notes: f.confidenceNote || '',
    });
  };

  const handleConfirmEditAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFinding || !onEditAcceptMetric) return;
    const parsed = pendingFindingEditSchema.safeParse(editValues);
    if (!parsed.success) {
      setEditError(parsed.error.issues[0]?.message || 'Check your inputs.');
      return;
    }
    setBusyId(editingFinding.id);
    try {
      await onEditAcceptMetric(editingFinding, parsed.data);
      setEditingFinding(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingFinding) return;
    setBusyId(rejectingFinding.id);
    try {
      await onReject(rejectingFinding, rejectReason.trim());
      setRejectingFinding(null);
      setRejectReason('');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="bg-amber-50/60 border border-amber-200 rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#1F2937]">
              Pending Verification Queue ({findings.length})
            </h3>
            <p className="text-xs text-amber-900">
              AI-assisted, requires your verification — nothing enters verified records until you review it.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {findings.map((finding) => {
          const hasValidUrl = isValidHttpUrl(finding.sourceUrl);
          const resolvedStatus = getResolvedAcceptedStatus(finding.sourceUrl);
          const duplicate =
            mode === 'discovery'
              ? findDuplicateCompetitor(
                  {
                    companyName: finding.candidateName || finding.metricName,
                    website: finding.sourceUrl,
                  },
                  existingCompetitors
                )
              : null;

          const isBusy = busyId === finding.id;

          return (
            <div
              key={finding.id}
              className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                    <span className="font-semibold text-amber-800">AI-assisted, requires your verification</span>
                    <span aria-hidden="true">·</span>
                    <span>{finding.category}</span>
                    {mode === 'discovery' && finding.candidateMarketLevel && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{finding.candidateMarketLevel}</span>
                      </>
                    )}
                  </div>

                  <p className="text-sm font-semibold text-[#1F2937]">
                    {mode === 'discovery'
                      ? finding.candidateName || finding.metricName
                      : `${finding.metricName}: ${finding.proposedValue}`}
                  </p>

                  {mode === 'discovery' && finding.candidateLocation && (
                    <p className="text-xs text-[#64748B]">
                      {finding.candidateLocation} · {finding.candidateClassification || 'Direct Competitor'}
                    </p>
                  )}

                  <p className="text-xs text-[#64748B] leading-relaxed">
                    {finding.evidenceDescription}
                  </p>

                  {finding.confidenceNote && (
                    <p className="text-[11px] text-[#64748B]">Note: {finding.confidenceNote}</p>
                  )}

                  <div className="pt-1 flex flex-wrap items-center gap-3 text-xs">
                    {hasValidUrl ? (
                      <a
                        href={finding.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[#2563EB] hover:underline"
                      >
                        <span>{finding.sourceTitle || finding.sourceUrl}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-amber-700 font-medium">
                        No source URL — accepting saves as {resolvedStatus}
                      </span>
                    )}
                  </div>

                  {duplicate && (
                    <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 flex items-center gap-2 text-xs text-amber-900">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                      <span>
                        Already in tracker as &ldquo;{duplicate.companyName}&rdquo; ({duplicate.status}). Reject or review before adding.
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {mode === 'metric' && onAcceptMetric && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        setBusyId(finding.id);
                        try {
                          await onAcceptMetric(finding);
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>Accept ({resolvedStatus})</span>
                    </button>
                  )}

                  {mode === 'metric' && onEditAcceptMetric && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => openEditModal(finding)}
                      className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                  )}

                  {mode === 'discovery' && onAcceptDiscovery && !duplicate && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={async () => {
                          setBusyId(finding.id);
                          try {
                            await onAcceptDiscovery(finding, 'Candidate');
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Add Candidate</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={async () => {
                          setBusyId(finding.id);
                          try {
                            await onAcceptDiscovery(finding, 'Active');
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
                      >
                        <span>Add Active</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setRejectingFinding(finding);
                      setRejectReason('');
                    }}
                    className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-[#DC2626] hover:bg-red-50 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit & Accept Modal */}
      {editingFinding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#1F2937]">
                Edit Finding · {editingFinding.metricName}
              </h3>
              <button
                type="button"
                onClick={() => setEditingFinding(null)}
                className="p-1.5 text-[#64748B] hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <p className="text-xs text-[#DC2626] bg-red-50 border border-red-200 rounded-xl p-2.5">
                {editError}
              </p>
            )}

            <form onSubmit={handleConfirmEditAccept} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Value</label>
                <input
                  type="text"
                  value={editValues.value}
                  onChange={(e) => setEditValues((v) => ({ ...v, value: e.target.value }))}
                  className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Data Status</label>
                  <select
                    value={editValues.dataStatus}
                    onChange={(e) =>
                      setEditValues((v) => ({ ...v, dataStatus: e.target.value as DataStatus }))
                    }
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white"
                  >
                    {DATA_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Source URL</label>
                  <input
                    type="url"
                    value={editValues.sourceUrl}
                    onChange={(e) => setEditValues((v) => ({ ...v, sourceUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">
                  Evidence Description
                </label>
                <textarea
                  rows={2}
                  value={editValues.evidenceDescription}
                  onChange={(e) =>
                    setEditValues((v) => ({ ...v, evidenceDescription: e.target.value }))
                  }
                  className="w-full rounded-xl border border-[#E2E8F0] p-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1">Notes</label>
                <input
                  type="text"
                  value={editValues.notes}
                  onChange={(e) => setEditValues((v) => ({ ...v, notes: e.target.value }))}
                  className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingFinding(null)}
                  className="min-h-[40px] px-4 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#64748B] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId === editingFinding.id}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 rounded-xl bg-[#16A34A] text-xs font-medium text-white cursor-pointer"
                >
                  {busyId === editingFinding.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save &amp; Accept</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectingFinding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-[#1F2937]">Reject AI Finding</h3>
            <p className="text-xs text-[#64748B]">
              Rejected findings are kept in research history so you know what was dismissed and why.
            </p>
            <form onSubmit={handleConfirmReject} className="space-y-3">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Optional reason (e.g. Incorrect domain / outdated / unverified claim)"
                className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm"
              />
              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setRejectingFinding(null)}
                  className="min-h-[40px] px-4 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#64748B] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId === rejectingFinding.id}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 rounded-xl bg-[#DC2626] text-xs font-medium text-white cursor-pointer"
                >
                  {busyId === rejectingFinding.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Reject</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
