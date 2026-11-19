import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { CompetitorScorecardResult } from '../../lib/competitorScoringUtils';
import {
  SURPASS_REQUIRED_ADVANTAGE,
  SURPASS_REQUIRED_COMPARABLE,
  SURPASS_REQUIRED_COVERAGE_PCT,
  SURPASS_REQUIRED_LEADS,
} from '../../lib/constants';
import { getTodayDateString } from '../../lib/goalUtils';
import { MonthlyReviewFormValues, monthlyReviewSchema } from '../../lib/validators';
import { Competitor, CompetitorMonthlyReview } from '../../types';

interface MonthlyReviewModalProps {
  open: boolean;
  competitor: Competitor;
  scorecard: CompetitorScorecardResult;
  existingReviews: CompetitorMonthlyReview[];
  minScoreAdvantage?: number;
  minComparable?: number;
  minCoveragePct?: number;
  onClose: () => void;
  onSave: (values: MonthlyReviewFormValues) => Promise<void>;
}

export const MonthlyReviewModal: React.FC<MonthlyReviewModalProps> = ({
  open,
  competitor,
  scorecard,
  existingReviews,
  minScoreAdvantage = SURPASS_REQUIRED_ADVANTAGE,
  minComparable = SURPASS_REQUIRED_COMPARABLE,
  minCoveragePct = SURPASS_REQUIRED_COVERAGE_PCT,
  onClose,
  onSave,
}) => {
  const todayStr = getTodayDateString();
  const defaultMonth = todayStr.slice(0, 7);

  const form = useForm<MonthlyReviewFormValues>({
    resolver: zodResolver(monthlyReviewSchema),
    defaultValues: {
      month: defaultMonth,
      reviewDate: todayStr,
      summary: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        month: defaultMonth,
        reviewDate: todayStr,
        summary: '',
      });
    }
  }, [open, defaultMonth, todayStr, form]);

  if (!open) return null;

  const watchedMonth = form.watch('month');
  const existingForMonth = existingReviews.filter(
    (r) => r.competitorId === competitor.id && r.month === watchedMonth
  );
  const nextVersion = existingForMonth.reduce((m, r) => Math.max(m, r.version || 1), 0) + 1;

  const advantage = scorecard.scoreAdvantage ?? 0;
  const eligible =
    scorecard.hasEnoughComparableData &&
    scorecard.comparableCount >= minComparable &&
    scorecard.ahead.length >= SURPASS_REQUIRED_LEADS &&
    advantage >= minScoreAdvantage &&
    scorecard.evidenceCoveragePct >= minCoveragePct;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">
              Save Monthly Review Snapshot
            </h2>
            <p className="text-xs text-[#64748B]">
              {competitor.companyName} · Immutable monthly audit record
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#64748B] hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={form.handleSubmit(onSave)} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {nextVersion > 1 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
              <span>
                A review for <strong>{watchedMonth}</strong> already exists. Saving will append a new
                immutable correction record (<strong>v{nextVersion}</strong>) without overwriting history.
              </span>
            </div>
          )}

          {/* Snapshot Metrics Preview */}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 grid grid-cols-2 gap-3 text-xs tabular-nums">
            <div>
              <p className="text-[#64748B]">Gen Z Neural-X Score</p>
              <p className="font-bold text-[#1F2937] mt-0.5">
                {scorecard.ownOverallScore ?? 'Not enough data'}
              </p>
            </div>
            <div>
              <p className="text-[#64748B]">{competitor.companyName}</p>
              <p className="font-bold text-[#1F2937] mt-0.5">
                {scorecard.competitorOverallScore ?? 'Not enough data'}
              </p>
            </div>
            <div>
              <p className="text-[#64748B]">Score Advantage</p>
              <p
                className={`font-bold mt-0.5 ${
                  advantage >= minScoreAdvantage ? 'text-[#16A34A]' : 'text-[#DC2626]'
                }`}
              >
                {scorecard.scoreAdvantage !== null
                  ? `${advantage >= 0 ? '+' : ''}${advantage} pts`
                  : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-[#64748B]">Surpass Month Eligibility</p>
              <p className={`font-bold mt-0.5 ${eligible ? 'text-[#16A34A]' : 'text-[#F59E0B]'}`}>
                {eligible ? 'Eligible' : 'Not yet eligible'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1">Month</label>
              <input
                type="month"
                {...form.register('month')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937]"
              />
              {form.formState.errors.month && (
                <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.month.message}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1">Review Date</label>
              <input
                type="date"
                {...form.register('reviewDate')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937]"
              />
              {form.formState.errors.reviewDate && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {form.formState.errors.reviewDate.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1F2937] mb-1">
              Executive Review Notes
            </label>
            <textarea
              rows={3}
              placeholder="Document what changed this month, evidence updated, or gaps closed..."
              {...form.register('summary')}
              className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm text-[#1F2937]"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-60 cursor-pointer"
            >
              {form.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Save Immutable Snapshot</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
