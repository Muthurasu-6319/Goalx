import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import {
  DATA_STATUSES,
  EVIDENCE_CATEGORIES,
  SERVICE_OFFER_STATUSES,
  STANDARD_COMPETITOR_METRICS,
} from '../../lib/constants';
import { getTodayDateString } from '../../lib/goalUtils';
import {
  CompetitorMetricEvidenceFormValues,
  competitorMetricEvidenceSchema,
} from '../../lib/validators';
import { CompetitorMetric, EvidenceCategory } from '../../types';

export interface MetricEvidencePreset {
  metricKey?: string;
  metricName?: string;
  category?: EvidenceCategory;
  existingMetric?: CompetitorMetric;
  defaultSourceUrl?: string;
}

interface MetricEvidenceModalProps {
  open: boolean;
  competitorName: string;
  preset: MetricEvidencePreset | null;
  onClose: () => void;
  onSave: (values: CompetitorMetricEvidenceFormValues) => Promise<void>;
}

export const MetricEvidenceModal: React.FC<MetricEvidenceModalProps> = ({
  open,
  competitorName,
  preset,
  onClose,
  onSave,
}) => {
  const todayStr = getTodayDateString();

  const form = useForm<CompetitorMetricEvidenceFormValues>({
    resolver: zodResolver(competitorMetricEvidenceSchema),
    defaultValues: {
      metricKey: STANDARD_COMPETITOR_METRICS[0].key,
      metricName: STANDARD_COMPETITOR_METRICS[0].name,
      category: STANDARD_COMPETITOR_METRICS[0].category,
      value: '',
      serviceOfferStatus: '',
      sourceUrl: '',
      evidenceDescription: '',
      dataStatus: 'User Entered',
      lastVerifiedDate: todayStr,
      notes: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    const existing = preset?.existingMetric;
    if (existing) {
      form.reset({
        metricKey: existing.metricKey,
        metricName: existing.metricName,
        category: existing.category,
        value: existing.value,
        serviceOfferStatus: existing.serviceOfferStatus || '',
        sourceUrl: existing.sourceUrl || preset?.defaultSourceUrl || '',
        evidenceDescription: existing.evidenceDescription || '',
        dataStatus: existing.dataStatus,
        lastVerifiedDate: existing.lastVerifiedDate || todayStr,
        notes: existing.notes || '',
      });
      return;
    }

    const matchedStd = preset?.metricKey
      ? STANDARD_COMPETITOR_METRICS.find((m) => m.key === preset.metricKey)
      : STANDARD_COMPETITOR_METRICS[0];

    const category = preset?.category ?? matchedStd?.category ?? 'Services';
    form.reset({
      metricKey: preset?.metricKey ?? matchedStd?.key ?? 'custom_metric',
      metricName: preset?.metricName ?? matchedStd?.name ?? '',
      category,
      value: '',
      serviceOfferStatus: category === 'Services' ? 'Offered' : '',
      sourceUrl: preset?.defaultSourceUrl || '',
      evidenceDescription: '',
      dataStatus: 'User Entered',
      lastVerifiedDate: todayStr,
      notes: '',
    });
  }, [open, preset, form, todayStr]);

  if (!open) return null;

  const watchedCategory = form.watch('category');
  const watchedStatus = form.watch('dataStatus');
  const watchedMetricKey = form.watch('metricKey');

  const handleSelectStandardMetric = (key: string) => {
    const std = STANDARD_COMPETITOR_METRICS.find((m) => m.key === key);
    if (std) {
      form.setValue('metricKey', std.key);
      form.setValue('metricName', std.name);
      form.setValue('category', std.category);
      form.setValue('serviceOfferStatus', std.category === 'Services' ? 'Offered' : '');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">
              Log Metric &amp; Evidence · {competitorName}
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Store &ldquo;Unknown&rdquo; if unavailable. Marking Verified requires a public http/https URL.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#64748B] hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={form.handleSubmit(async (vals) => {
            await onSave(vals);
          })}
          className="p-6 space-y-4 overflow-y-auto"
        >
          {/* Standard Metric Picker */}
          {!preset?.existingMetric && (
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">
                Standard Tracked Metric (24-Metric Coverage Set)
              </label>
              <select
                value={
                  STANDARD_COMPETITOR_METRICS.some((m) => m.key === watchedMetricKey)
                    ? watchedMetricKey
                    : ''
                }
                onChange={(e) => {
                  if (e.target.value) handleSelectStandardMetric(e.target.value);
                }}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white text-[#1F2937]"
              >
                {EVIDENCE_CATEGORIES.map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {STANDARD_COMPETITOR_METRICS.filter((m) => m.category === cat).map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Category</label>
              <select
                {...form.register('category')}
                onChange={(e) => {
                  const cat = e.target.value as EvidenceCategory;
                  form.setValue('category', cat);
                  if (cat !== 'Services') form.setValue('serviceOfferStatus', '');
                }}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white text-[#1F2937]"
              >
                {EVIDENCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Metric Name</label>
              <input
                type="text"
                {...form.register('metricName')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
              />
              {form.formState.errors.metricName && (
                <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.metricName.message}</p>
              )}
            </div>
          </div>

          {watchedCategory === 'Services' && (
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">
                Service Availability Status
              </label>
              <select
                {...form.register('serviceOfferStatus')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white text-[#1F2937]"
              >
                <option value="">Select service availability...</option>
                {SERVICE_OFFER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Observed Value <span className="text-[#DC2626]">*</span>
            </label>
            <input
              type="text"
              placeholder='e.g. Offered (React + Tailwind), or "Unknown"'
              {...form.register('value')}
              className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
            />
            {form.formState.errors.value && (
              <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.value.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Data Status</label>
              <select
                {...form.register('dataStatus')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white text-[#1F2937]"
              >
                {DATA_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Last Verified Date</label>
              <input
                type="date"
                {...form.register('lastVerifiedDate')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937]"
              />
              {form.formState.errors.lastVerifiedDate && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {form.formState.errors.lastVerifiedDate.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Source URL {watchedStatus === 'Verified' && <span className="text-[#DC2626]">*</span>}
            </label>
            <input
              type="url"
              placeholder="https://competitor.com/services"
              {...form.register('sourceUrl')}
              className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
            />
            {watchedStatus === 'Verified' && (
              <p className="mt-1 text-[11px] text-[#64748B] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
                <span>Verified status strictly requires a public http:// or https:// URL.</span>
              </p>
            )}
            {form.formState.errors.sourceUrl && (
              <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.sourceUrl.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Evidence Description <span className="text-[#DC2626]">*</span>
            </label>
            <textarea
              rows={2}
              placeholder="Describe what was observed directly on the source page or listing..."
              {...form.register('evidenceDescription')}
              className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm text-[#1F2937]"
            />
            {form.formState.errors.evidenceDescription && (
              <p className="mt-1 text-xs text-[#DC2626]">
                {form.formState.errors.evidenceDescription.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">Notes</label>
            <textarea
              rows={2}
              placeholder="Optional analyst notes or follow-up check..."
              {...form.register('notes')}
              className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm text-[#1F2937]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 text-sm font-medium text-white hover:bg-[#B91C1C] cursor-pointer disabled:opacity-60"
            >
              {form.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Save Evidence</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
