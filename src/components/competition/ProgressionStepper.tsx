import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, CircleDot, Loader2, Target } from 'lucide-react';
import { ROUTES } from '../../lib/constants';
import {
  CompetitorScorecardResult,
  ProgressionStageStatus,
} from '../../lib/competitorScoringUtils';
import { Competitor } from '../../types';

interface ProgressionStepperProps {
  competitors: Competitor[];
  activeTarget: Competitor | null;
  activeScorecard: CompetitorScorecardResult | null;
  stages: ProgressionStageStatus[];
  onChangeActiveTarget: (competitorId: string) => Promise<void>;
}

export const ProgressionStepper: React.FC<ProgressionStepperProps> = ({
  competitors,
  activeTarget,
  activeScorecard,
  stages,
  onChangeActiveTarget,
}) => {
  const [updatingTarget, setUpdatingTarget] = useState(false);

  const selectableTargets = competitors.filter(
    (c) => c.status !== 'Archived' && c.status !== 'Surpassed'
  );

  const handleSelectTarget = async (competitorId: string) => {
    if (!competitorId || competitorId === activeTarget?.id) return;
    setUpdatingTarget(true);
    try {
      await onChangeActiveTarget(competitorId);
    } finally {
      setUpdatingTarget(false);
    }
  };

  const completedStagesCount = stages.filter((s) => s.completed).length;

  return (
    <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
      {/* Top Executive Target Summary */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[#DC2626] shrink-0" />
            <h2 className="text-base font-semibold text-[#1F2937]">
              Active Competitive Target &amp; 8-Stage Progression
            </h2>
          </div>
          <p className="text-xs text-[#64748B]">
            {activeTarget
              ? `Focus on surpassing ${activeTarget.companyName} (${activeTarget.location || activeTarget.marketLevel}) · Stage ${completedStagesCount}/8 completed`
              : 'Select one non-surpassed competitor to track your step-by-step progression.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <label htmlFor="active-target-select" className="text-xs font-medium text-[#64748B] whitespace-nowrap">
              Active Target:
            </label>
            <select
              id="active-target-select"
              disabled={updatingTarget || selectableTargets.length === 0}
              value={activeTarget?.id ?? ''}
              onChange={(e) => void handleSelectTarget(e.target.value)}
              className="h-9 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#1F2937] max-w-[220px]"
            >
              {selectableTargets.length === 0 ? (
                <option value="">No eligible competitors</option>
              ) : (
                selectableTargets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName} ({c.status})
                  </option>
                ))
              )}
            </select>
            {updatingTarget && <Loader2 className="w-4 h-4 animate-spin text-[#DC2626]" />}
          </div>

          <Link
            to={ROUTES.COMPETITION_SCORECARDS}
            className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#B91C1C] whitespace-nowrap shrink-0"
          >
            <span>Open Scorecards</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Active Target Snapshot Bar */}
      {activeTarget && activeScorecard && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <p className="text-[11px] text-[#64748B]">Overall Comparable Score</p>
            {activeScorecard.hasEnoughComparableData ? (
              <p className="mt-1 text-base font-bold text-[#1F2937] tabular-nums">
                You {activeScorecard.ownOverallScore} vs {activeScorecard.competitorOverallScore}
              </p>
            ) : (
              <p className="mt-1 text-xs font-semibold text-[#F59E0B]">
                Not enough comparable data ({activeScorecard.comparableCount}/{activeScorecard.minComparableRequired})
              </p>
            )}
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <p className="text-[11px] text-[#64748B]">Market Presence</p>
            <p className="mt-1 text-base font-bold text-[#2563EB] tabular-nums">
              {activeScorecard.ownMarketPresenceScore ?? 'Unknown'} vs{' '}
              {activeScorecard.competitorMarketPresenceScore ?? 'Unknown'}
            </p>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <p className="text-[11px] text-[#64748B]">Business Performance</p>
            <p className="mt-1 text-base font-bold text-[#16A34A] tabular-nums">
              {activeScorecard.ownBusinessPerformanceScore ?? 'Unknown'} vs{' '}
              {activeScorecard.competitorBusinessPerformanceScore ?? 'Unknown'}
            </p>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <p className="text-[11px] text-[#64748B]">Verified Evidence Coverage</p>
            <p className="mt-1 text-base font-bold text-[#1F2937] tabular-nums">
              {activeScorecard.evidenceCoveragePct}% · {activeScorecard.ahead.length} leads
            </p>
          </div>
        </div>
      )}

      {/* 8-Stage Progression Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {stages.map((st) => (
          <div
            key={st.key}
            className={`rounded-xl border px-3 py-2.5 flex items-start gap-2.5 ${
              st.completed
                ? 'border-emerald-200 bg-emerald-50/50'
                : st.active
                  ? 'border-red-200 bg-red-50/40'
                  : 'border-[#E2E8F0] bg-white'
            }`}
          >
            {st.completed ? (
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
            ) : (
              <CircleDot
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  st.active ? 'text-[#DC2626]' : 'text-[#64748B]'
                }`}
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#1F2937] truncate">
                {st.stage}. {st.label}
              </p>
              <p className="text-[11px] text-[#64748B] truncate">{st.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
