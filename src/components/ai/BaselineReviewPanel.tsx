import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { AI_DISCLAIMER_DECISIONS, PLANNING_KPI_TARGETS } from '../../lib/constants';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import {
  acceptBaselineTargetAsGoal,
  generateThreeMonthBaseline,
} from '../../services/aiCeoService';
import { BaselineReview } from '../../types';

interface BaselineReviewPanelProps {
  review: BaselineReview | null;
  onGenerated?: () => void;
  quotaUsed?: number;
  quotaLimit?: number;
}

export const BaselineReviewPanel: React.FC<BaselineReviewPanelProps> = ({
  review,
  onGenerated,
  quotaUsed = 0,
  quotaLimit = 10,
}) => {
  const { firebaseUser } = useAuth();
  const { showToast } = useToast();
  const [running, setRunning] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(() => new Set());

  const handleRunBaseline = async () => {
    setRunning(true);
    try {
      const res = await generateThreeMonthBaseline();
      if (!res.ok) {
        showToast('Baseline review failed', {
          description: res.error || 'Please try again later.',
          variant: 'error',
        });
        return;
      }
      showToast('3-Month Company Baseline updated', {
        description: `Analyzed using ${res.review?.mode === 'ai' ? 'Gemini AI' : 'rule-based metrics'}.`,
        variant: 'success',
      });
      onGenerated?.();
    } finally {
      setRunning(false);
    }
  };

  const handleAddTargetGoal = async (
    key: string,
    title: string,
    timeframeDays: 30 | 60 | 90
  ) => {
    if (!firebaseUser?.uid) return;
    setAddingKey(key);
    try {
      await acceptBaselineTargetAsGoal(firebaseUser.uid, title, timeframeDays);
      setAddedKeys((prev) => new Set(prev).add(key));
      showToast('Added to Personal Goals', {
        description: `${timeframeDays}-day KPI target saved with AI proposal provenance.`,
        variant: 'success',
      });
    } catch (err) {
      showToast('Could not save goal', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setAddingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-[#1F2937]">
              3-Month Company Baseline &amp; 30 / 60 / 90 KPI Calibration
            </h2>
            {review && (
              <span className="inline-flex items-center rounded-md border border-[#E2E8F0] bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-[#64748B]">
                {review.mode === 'ai' ? 'Gemini AI' : 'Rule-based'}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#64748B]">
            Compares last 3 months of real GoalX data against initial planning benchmarks (
            {PLANNING_KPI_TARGETS.leadConversionRatePct}% conversion, {PLANNING_KPI_TARGETS.onTimeDeliveryPct}% on-time,{' '}
            {PLANNING_KPI_TARGETS.collectionRatePct}% collections, {PLANNING_KPI_TARGETS.clientSatisfactionRating}/5 satisfaction,{' '}
            {PLANNING_KPI_TARGETS.netProfitMarginPct}% margin). Quota: {quotaUsed}/{quotaLimit} today.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleRunBaseline()}
          disabled={running}
          className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-60 shrink-0 cursor-pointer"
        >
          {running ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span>{review ? 'Refresh 3-Month Baseline' : 'Run 3-Month Baseline Review'}</span>
        </button>
      </div>

      {!review ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center space-y-3">
          <TrendingUp className="w-8 h-8 text-[#DC2626] mx-auto" />
          <h3 className="text-base font-semibold text-[#1F2937]">
            No 3-Month Baseline Review Recorded Yet
          </h3>
          <p className="text-xs sm:text-sm text-[#64748B] max-w-xl mx-auto">
            Run a baseline check to verify whether your company has enough operational history (&ge;1 month) and calibrate realistic 30-day, 60-day, and 90-day KPI targets.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Reliability Warning Banner (<1 month of data) */}
          {!review.reliableBaseline && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-950">
                  Low Historical Data Warning ({review.monthsOfData} month
                  {review.monthsOfData === 1 ? '' : 's'} detected)
                </p>
                <p className="text-xs text-amber-900 leading-relaxed">
                  {review.warningMessage ||
                    'Less than 1 month of real operational data exists. Treat benchmarks below as early calibration signals rather than settled averages.'}
                </p>
              </div>
            </div>
          )}

          {/* Factual Window Summary */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
              <span>Review Date: {review.reviewDate}</span>
              <span>{AI_DISCLAIMER_DECISIONS}</span>
            </div>
            <p className="text-sm font-medium text-[#1F2937]">{review.summary}</p>
          </div>

          {/* 5 Planning KPI Comparison Table */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-[#E2E8F0]">
              <h3 className="text-sm font-semibold text-[#1F2937]">
                Actual Company Performance vs Planning KPI Targets
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase tracking-wide text-[#64748B]">
                    <th className="py-3 px-4 font-semibold">KPI Metric</th>
                    <th className="py-3 px-4 font-semibold">Actual (3 Mo)</th>
                    <th className="py-3 px-4 font-semibold">Planning Target</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Suggested Calibration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {review.metrics.map((row) => (
                    <tr key={row.metric} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-medium text-[#1F2937]">{row.metric}</td>
                      <td className="py-3 px-4 text-[#1F2937] tabular-nums">
                        {row.companyValue}
                      </td>
                      <td className="py-3 px-4 text-[#64748B] tabular-nums">
                        {row.targetValue}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                            row.status === 'Ahead'
                              ? 'border-emerald-200 bg-emerald-50 text-[#16A34A]'
                              : row.status === 'Behind'
                                ? 'border-red-200 bg-red-50 text-[#DC2626]'
                                : 'border-amber-200 bg-amber-50 text-amber-800'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#64748B]">
                        {row.suggestedAdjustedTarget}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 30 / 60 / 90 Day Targets with Direct "Add to Personal Goals" Action */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {(
              [
                { days: 30 as const, label: '30-Day Targets', items: review.targets30Day },
                { days: 60 as const, label: '60-Day Targets', items: review.targets60Day },
                { days: 90 as const, label: '90-Day Targets', items: review.targets90Day },
              ] as const
            ).map((bucket) => (
              <section
                key={bucket.days}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#1F2937]">{bucket.label}</h3>
                  <span className="text-[11px] font-medium text-[#64748B]">
                    +{bucket.days} days
                  </span>
                </div>
                <ul className="space-y-2.5">
                  {bucket.items.map((item, idx) => {
                    const key = `${review.id}_${bucket.days}_${idx}`;
                    const isAdded = addedKeys.has(key);
                    const isSaving = addingKey === key;
                    return (
                      <li
                        key={key}
                        className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-2"
                      >
                        <p className="text-xs text-[#1F2937] leading-relaxed">{item}</p>
                        <button
                          type="button"
                          disabled={isAdded || isSaving}
                          onClick={() => void handleAddTargetGoal(key, item, bucket.days)}
                          className={`min-h-[32px] inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                            isAdded
                              ? 'border border-emerald-200 bg-emerald-50 text-[#16A34A]'
                              : 'border border-[#E2E8F0] bg-white text-[#1F2937] hover:border-[#DC2626]/40 hover:text-[#DC2626]'
                          }`}
                        >
                          {isSaving ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : isAdded ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Plus className="w-3 h-3" />
                          )}
                          <span>
                            {isAdded ? 'Added to Personal Goals' : 'Add to Personal Goals'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          {/* Strategic Recommendations */}
          {review.suggestions.length > 0 && (
            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-2">
              <h3 className="text-sm font-semibold text-[#1F2937]">
                Executive Calibration Notes
              </h3>
              <ul className="space-y-1.5 text-xs text-[#64748B] list-disc list-inside">
                {review.suggestions.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
