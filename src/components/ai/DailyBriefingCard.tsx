import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { AI_DISCLAIMER_DECISIONS, ROUTES } from '../../lib/constants';
import { AiBriefing, AiBriefingType } from '../../types';

interface DailyBriefingCardProps {
  briefing: AiBriefing | null;
  briefingType: AiBriefingType;
  onSelectType?: (type: AiBriefingType) => void;
  onGenerate: (type: AiBriefingType, regenerate: boolean) => void | Promise<void>;
  loading?: boolean;
  compactOnDashboard?: boolean;
  isSunday?: boolean;
  isFirstOfMonth?: boolean;
  pendingProposalCount?: number;
}

export const DailyBriefingCard: React.FC<DailyBriefingCardProps> = ({
  briefing,
  briefingType,
  onSelectType,
  onGenerate,
  loading = false,
  compactOnDashboard = false,
  isSunday = false,
  isFirstOfMonth = false,
  pendingProposalCount = 0,
}) => {
  const sectionsToRender = compactOnDashboard
    ? (briefing?.sections ?? []).slice(0, 3)
    : (briefing?.sections ?? []);

  return (
    <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-[#DC2626] flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-[#1F2937]">
                {briefing?.greeting || 'GoalX AI CEO Briefing'}
              </h2>
              {briefing && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                    briefing.mode === 'ai'
                      ? 'border-blue-200 bg-blue-50 text-[#2563EB]'
                      : 'border-[#E2E8F0] bg-slate-100 text-[#64748B]'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{briefing.mode === 'ai' ? 'Gemini AI' : 'Rule-based Offline'}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              {briefing
                ? `${briefing.briefingType.toUpperCase()} · ${briefing.date} · ${AI_DISCLAIMER_DECISIONS}`
                : `Your daily 10-point executive pulse across personal growth, company finance, CRM, projects, and competition.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onSelectType && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              {(['daily', 'weekly', 'monthly'] as AiBriefingType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onSelectType(t)}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                    briefingType === t
                      ? 'bg-white text-[#1F2937] shadow-xs'
                      : 'text-[#64748B] hover:text-[#1F2937]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => void onGenerate(briefingType, Boolean(briefing))}
            disabled={loading}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>{briefing ? 'Regenerate' : 'Generate Briefing'}</span>
          </button>

          {compactOnDashboard && (
            <Link
              to={ROUTES.AI_CEO}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50"
            >
              <span>Open AI CEO</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-[#64748B]" />
            </Link>
          )}
        </div>
      </div>

      {/* Auto-Review Contextual Prompts for Sunday / 1st of Month */}
      {(isSunday || isFirstOfMonth || pendingProposalCount > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {isSunday && briefingType !== 'weekly' && (
            <button
              type="button"
              onClick={() => {
                onSelectType?.('weekly');
                void onGenerate('weekly', false);
              }}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-medium text-[#2563EB] hover:bg-blue-100 cursor-pointer"
            >
              Sunday Check-In: Open Weekly Executive Review &rarr;
            </button>
          )}
          {isFirstOfMonth && briefingType !== 'monthly' && (
            <button
              type="button"
              onClick={() => {
                onSelectType?.('monthly');
                void onGenerate('monthly', false);
              }}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-medium text-[#16A34A] hover:bg-emerald-100 cursor-pointer"
            >
              Month Start: Open Monthly Performance Review &rarr;
            </button>
          )}
          {pendingProposalCount > 0 && (
            <Link
              to={`${ROUTES.AI_CEO}?tab=proposals`}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-100"
            >
              {pendingProposalCount} AI Action Proposal{pendingProposalCount === 1 ? '' : 's'} awaiting confirmation &rarr;
            </Link>
          )}
        </div>
      )}

      {!briefing ? (
        <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-5 text-center space-y-2">
          <p className="text-sm font-medium text-[#1F2937]">
            No {briefingType} briefing generated for today yet.
          </p>
          <p className="text-xs text-[#64748B] max-w-xl mx-auto">
            Click <strong>Generate Briefing</strong> to assemble today&apos;s 10-section executive briefing using live GoalX finance, CRM leads, projects, habits, goals, and verified competitor data.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Risk Flags */}
          {briefing.riskFlags.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#DC2626]">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Risk Flags ({briefing.riskFlags.length})</span>
              </div>
              <ul className="space-y-1 text-xs text-red-900 list-disc list-inside">
                {briefing.riskFlags.map((flag, idx) => (
                  <li key={idx}>{flag}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Overview + Top Priority */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                Executive Overview
              </p>
              <p className="text-xs sm:text-sm text-[#1F2937] leading-relaxed">
                {briefing.overview}
              </p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#DC2626]">
                #1 Top Priority
              </p>
              <p className="text-xs sm:text-sm font-semibold text-[#1F2937] leading-relaxed">
                {briefing.topPriority}
              </p>
            </div>
          </div>

          {/* Numbered Sections */}
          <div
            className={`grid gap-3 ${
              compactOnDashboard
                ? 'grid-cols-1 md:grid-cols-3'
                : 'grid-cols-1 md:grid-cols-2'
            }`}
          >
            {sectionsToRender.map((sec) => (
              <Link
                key={sec.number}
                to={sec.route || ROUTES.AI_CEO}
                className={`group rounded-xl border p-4 space-y-2 transition-colors hover:border-[#DC2626]/40 ${
                  sec.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50/30'
                    : sec.tone === 'positive'
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : 'border-[#E2E8F0] bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#1F2937] group-hover:text-[#DC2626]">
                    {sec.number}. {sec.title}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                </div>
                <p className="text-xs text-[#1F2937] font-medium">{sec.summary}</p>
                {sec.items.length > 0 && (
                  <ul className="space-y-1 text-[11px] text-[#64748B] list-disc list-inside">
                    {sec.items.slice(0, compactOnDashboard ? 2 : 5).map((item, i) => (
                      <li key={i} className="break-words">
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </Link>
            ))}
          </div>

          {compactOnDashboard && briefing.sections.length > 3 && (
            <div className="flex items-center justify-between pt-1 text-xs text-[#64748B]">
              <span>
                Showing 3 of {briefing.sections.length} executive sections · Updated{' '}
                {new Date(briefing.generatedAtIso).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                IST
              </span>
              <Link
                to={`${ROUTES.AI_CEO}?tab=briefing`}
                className="font-semibold text-[#DC2626] hover:underline"
              >
                Read all {briefing.sections.length} sections &rarr;
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
