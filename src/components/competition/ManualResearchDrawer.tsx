import React, { useState } from 'react';
import { CheckCircle2, ClipboardCheck, ExternalLink, Loader2, Plus, X } from 'lucide-react';
import { isValidHttpUrl } from '../../lib/competitorUtils';
import { MANUAL_RESEARCH_CHECKLIST } from '../../lib/constants';
import { Competitor, CompetitorMetric, EvidenceCategory } from '../../types';

interface ManualResearchDrawerProps {
  open: boolean;
  competitor: Competitor;
  metrics: CompetitorMetric[];
  onClose: () => void;
  onLogFinding: (category: EvidenceCategory, metricKey: string, metricName: string) => void;
  onRecordSession: (summary: string) => Promise<void>;
}

export const ManualResearchDrawer: React.FC<ManualResearchDrawerProps> = ({
  open,
  competitor,
  metrics,
  onClose,
  onLogFinding,
  onRecordSession,
}) => {
  const [sessionSummary, setSessionSummary] = useState('');
  const [savingSession, setSavingSession] = useState(false);

  if (!open) return null;

  const metricByKey = new Map(metrics.map((m) => [m.metricKey, m]));
  const hasValidSite = isValidHttpUrl(competitor.website);
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `${competitor.companyName} ${competitor.location || ''} services`
  )}`;
  const googleMapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(
    `${competitor.companyName} ${competitor.location || ''}`
  )}`;

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionSummary.trim()) return;
    setSavingSession(true);
    try {
      await onRecordSession(sessionSummary.trim());
      setSessionSummary('');
    } finally {
      setSavingSession(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">
                Manual Research Workflow · {competitor.companyName}
              </h2>
              <p className="text-xs text-[#64748B]">
                Verify public sources step-by-step and record findings with source URLs.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close manual workflow"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#64748B] hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Quick Public Source Launchers */}
          <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-2.5">
            <p className="text-xs font-semibold text-[#1F2937]">Public Verification Links</p>
            <div className="flex flex-wrap gap-2">
              {hasValidSite && (
                <a
                  href={competitor.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#2563EB] hover:bg-blue-50"
                >
                  <span>Open Official Website</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <a
                href={googleSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-100"
              >
                <span>Google Search</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-100"
              >
                <span>Google Maps / GBP</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Guided Checklist */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#1F2937]">Verification Checklist</h3>
            {MANUAL_RESEARCH_CHECKLIST.map((step) => {
              const logged = metricByKey.get(step.metricKey);
              return (
                <div
                  key={step.id}
                  className="rounded-xl border border-[#E2E8F0] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {logged && logged.dataStatus !== 'Unknown' ? (
                        <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                      ) : (
                        <span className="w-4 h-4 rounded-full border-2 border-[#E2E8F0] shrink-0" />
                      )}
                      <p className="text-sm font-semibold text-[#1F2937]">{step.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-[#64748B] leading-relaxed">{step.description}</p>
                    {logged && (
                      <p className="mt-1 text-[11px] text-[#16A34A] font-medium">
                        Recorded: {logged.value} ({logged.dataStatus} · Last verified: {logged.lastVerifiedDate || 'Unknown'})
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onLogFinding(step.category, step.metricKey, step.metricName);
                    }}
                    className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-1.5 text-xs font-medium text-[#1F2937] hover:border-[#DC2626] hover:text-[#DC2626] shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{logged ? 'Update Finding' : 'Log Finding'}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Log Manual Session to Research History */}
          <form onSubmit={handleSaveSession} className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-3">
            <label className="block text-xs font-semibold text-[#1F2937]">
              Record Manual Research Session Summary (Optional)
            </label>
            <textarea
              rows={2}
              value={sessionSummary}
              onChange={(e) => setSessionSummary(e.target.value)}
              placeholder="e.g. Checked competitor website, Google Business listing, and LinkedIn; updated service evidence."
              className="w-full rounded-xl border border-[#E2E8F0] bg-white p-3 text-xs text-[#1F2937]"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingSession || !sessionSummary.trim()}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[#1F2937] px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                {savingSession && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Log Session to History</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
