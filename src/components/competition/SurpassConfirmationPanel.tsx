import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  Compass,
  Loader2,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { SurpassEvaluationResult } from '../../lib/competitorScoringUtils';
import { ROUTES } from '../../lib/constants';
import {
  confirmCompetitorSurpassed,
  NextCompetitorsResult,
  researchNextCompetitors,
} from '../../services/competitorAiClient';
import { Competitor } from '../../types';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface SurpassConfirmationPanelProps {
  competitor: Competitor;
  evaluation: SurpassEvaluationResult;
  onSelectNextTarget: (competitorId: string) => Promise<void>;
}

export const SurpassConfirmationPanel: React.FC<SurpassConfirmationPanelProps> = ({
  competitor,
  evaluation,
  onSelectNextTarget,
}) => {
  const { showToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [researchingNext, setResearchingNext] = useState(false);
  const [nextResult, setNextResult] = useState<NextCompetitorsResult | null>(null);

  const isAlreadySurpassed = competitor.status === 'Surpassed';

  const handleConfirmSurpass = async () => {
    setConfirming(true);
    try {
      const res = await confirmCompetitorSurpassed(competitor.id);
      if (!res.ok) {
        showToast('Cannot confirm surpassed yet', {
          description: res.error || 'Verify all 6 checks first.',
          variant: 'error',
        });
        return;
      }
      setConfirmOpen(false);
      showToast(`${competitor.companyName} confirmed as Surpassed!`, {
        description: 'Achievement Report saved and event recorded for Phase 6.',
        variant: 'success',
      });
    } finally {
      setConfirming(false);
    }
  };

  const handleResearchNext = async () => {
    setResearchingNext(true);
    try {
      const res = await researchNextCompetitors({
        surpassedCompetitorId: competitor.id,
        region: competitor.location || 'Tamil Nadu',
      });
      if (!res.ok) {
        showToast('Could not fetch next competitors', {
          description: res.error,
          variant: 'warning',
        });
        return;
      }
      setNextResult(res);
      if (res.mode === 'ai_pending_review') {
        showToast(`Queued ${res.queuedPendingCount ?? 3} next competitor candidates`, {
          description: 'Review and verify them in Discovery before activating.',
          variant: 'success',
        });
      } else {
        showToast('Loaded next local/benchmark target candidates', { variant: 'info' });
      }
    } finally {
      setResearchingNext(false);
    }
  };

  return (
    <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[#16A34A]" />
            <h2 className="text-base font-semibold text-[#1F2937]">
              Surpass Verification &amp; Confirmation
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#64748B]">
            All 6 criteria must pass before {competitor.companyName} can be marked Surpassed. Score
            history is archived cleanly; Phase 6 XP stays locked at 0 until enabled.
          </p>
        </div>

        {isAlreadySurpassed ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              to={`${ROUTES.COMPETITION_REPORT}/${competitor.id}`}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
            >
              <Award className="w-4 h-4" />
              <span>View Achievement Report</span>
            </Link>
            <button
              type="button"
              disabled={researchingNext}
              onClick={() => void handleResearchNext()}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#1F2937] hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              {researchingNext ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-[#DC2626]" />
              )}
              <span>Research 3 Next Targets</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!evaluation.canConfirmSurpassed || confirming}
            onClick={() => setConfirmOpen(true)}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <Trophy className="w-4 h-4" />
            <span>Confirm Surpassed</span>
          </button>
        )}
      </div>

      {/* 6 Verification Checks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {evaluation.conditions.map((cond, idx) => (
          <div
            key={cond.key}
            className={`rounded-xl border p-3.5 flex items-start gap-3 ${
              cond.passed
                ? 'border-emerald-200 bg-emerald-50/40'
                : 'border-[#E2E8F0] bg-[#F8FAFC]'
            }`}
          >
            {cond.passed ? (
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
            ) : (
              <Clock className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#1F2937]">
                Check {idx + 1}: {cond.label}
              </p>
              <p className="mt-0.5 text-[11px] text-[#64748B] tabular-nums">{cond.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Next Target Suggestions after Surpass */}
      {nextResult && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
          {nextResult.mode === 'ai_pending_review' ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-[#1F2937]">
                <p className="font-semibold">
                  {nextResult.queuedPendingCount ?? 3} next-level competitor candidates queued for verification
                </p>
                <p className="text-[#64748B] mt-0.5">
                  AI discoveries always enter Pending Review first — review and promote one when ready.
                </p>
              </div>
              <Link
                to={ROUTES.COMPETITION_DISCOVER}
                className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shrink-0"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Review Discovery Queue</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-[#1F2937]">
                Next Eligible Target Candidates (select one when ready):
              </p>
              {nextResult.localSuggestions && nextResult.localSuggestions.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {nextResult.localSuggestions.map((cand) => (
                    <div
                      key={cand.id}
                      className="rounded-xl border border-[#E2E8F0] bg-white p-3 flex flex-col justify-between gap-2"
                    >
                      <div>
                        <p className="text-xs font-semibold text-[#1F2937]">{cand.companyName}</p>
                        <p className="text-[11px] text-[#64748B]">
                          {cand.location} · {cand.classification}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onSelectNextTarget(cand.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#DC2626] hover:underline cursor-pointer"
                      >
                        <span>Set as Active Target</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#64748B]">
                  No untracked local/benchmark candidates left. Add one in Discovery.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Confirm ${competitor.companyName} as Surpassed?`}
        description="This verifies all 6 competitive criteria on the server, archives the Surpassed comparison snapshot, and logs a completion event for Phase 6."
        confirmLabel="Confirm Surpassed"
        variant="warning"
        loading={confirming}
        onConfirm={handleConfirmSurpass}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
};
