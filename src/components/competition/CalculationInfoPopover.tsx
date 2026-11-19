import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { SCORE_DIMENSIONS, SURPASS_REQUIRED_COMPARABLE } from '../../lib/constants';
import { RatingScoreMap, ScorecardWeights } from '../../types';

interface CalculationInfoPopoverProps {
  weights: ScorecardWeights;
  ratingScoreMap: RatingScoreMap;
  minComparableRequired?: number;
}

export const CalculationInfoPopover: React.FC<CalculationInfoPopoverProps> = ({
  weights,
  ratingScoreMap,
  minComparableRequired = SURPASS_REQUIRED_COMPARABLE,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
      >
        <HelpCircle className="w-3.5 h-3.5 text-[#2563EB]" />
        <span>How is this calculated?</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="How competitor scores are calculated"
        >
          <div className="w-full sm:max-w-lg bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <h3 className="text-base font-semibold text-[#1F2937]">
                Scorecard Calculation Rules
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close calculation details"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs text-[#1F2937] leading-relaxed">
              <div className="space-y-1.5">
                <p className="font-semibold">1. Two Separate Scorecards</p>
                <p className="text-[#64748B]">
                  <strong>Market Presence</strong> (website, SEO, reviews, social, portfolio, pricing) and{' '}
                  <strong>Business Performance</strong> (revenue growth, acquisition, delivery, services, tech, team)
                  are scored independently. Strong digital marketing never implies strong revenue or profit.
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="font-semibold">2. Unknown &amp; Estimated Rules</p>
                <ul className="list-disc pl-4 space-y-1 text-[#64748B]">
                  <li>
                    <strong>Unknown</strong> is never counted as 0 — unverified metrics are excluded from score averages.
                  </li>
                  <li>
                    <strong>Estimated</strong> entries are clearly marked and excluded from official comparable scores and Surpassed calculations.
                  </li>
                  <li>
                    Only <strong>Verified</strong> or <strong>User Entered</strong> metrics with a 1–5 rating on both sides count as comparable.
                  </li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <p className="font-semibold">3. Minimum Comparable Threshold</p>
                <p className="text-[#64748B]">
                  Overall Weighted Score &amp; Ranking require at least{' '}
                  <strong className="tabular-nums">{minComparableRequired}</strong> comparable metrics.
                  Weighted averages automatically re-normalize across available comparable dimensions.
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="font-semibold">4. Rating-to-100 Mapping</p>
                <div className="grid grid-cols-5 gap-2 text-center pt-1 tabular-nums">
                  {[
                    { r: '1 ★', v: ratingScoreMap.r1 },
                    { r: '2 ★', v: ratingScoreMap.r2 },
                    { r: '3 ★', v: ratingScoreMap.r3 },
                    { r: '4 ★', v: ratingScoreMap.r4 },
                    { r: '5 ★', v: ratingScoreMap.r5 },
                  ].map((item) => (
                    <div key={item.r} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-1.5">
                      <p className="font-semibold text-[#1F2937]">{item.r}</p>
                      <p className="text-[#64748B]">{item.v}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="font-semibold">5. Active Dimension Weights (Sum = 100%)</p>
                <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl overflow-hidden">
                  {SCORE_DIMENSIONS.map((d) => (
                    <div
                      key={d.key}
                      className="flex items-center justify-between px-3 py-1.5 bg-white"
                    >
                      <span className="text-[#1F2937]">
                        {d.label}{' '}
                        <span className="text-[11px] text-[#64748B]">· {d.scorecardType}</span>
                      </span>
                      <span className="font-semibold tabular-nums text-[#1F2937]">
                        {weights[d.key]}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
