import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2, Plus, X } from 'lucide-react';
import { findDuplicateCompetitor } from '../../lib/competitorUtils';
import {
  BENCHMARK_DISCLAIMER_TEXT,
  COMPETITOR_CLASSIFICATIONS,
  COMPETITOR_STATUSES,
  COMPETITOR_THREAT_LEVELS,
  MARKET_LEVELS,
} from '../../lib/constants';
import { CompetitorFormValues, competitorSchema } from '../../lib/validators';
import { Competitor } from '../../types';

const QUICK_SERVICE_TAGS = [
  'Website Development',
  'Web Application Development',
  'Mobile Application Development',
  'AI Solutions',
  'Digital Marketing',
  'Graphic Designing',
  'UI/UX Design',
  'Custom Software Development',
  'Industrial Automation',
];

interface CompetitorFormModalProps {
  open: boolean;
  editingCompetitor: Competitor | null;
  existingCompetitors: Competitor[];
  onClose: () => void;
  onSave: (values: CompetitorFormValues) => Promise<void>;
}

export const CompetitorFormModal: React.FC<CompetitorFormModalProps> = ({
  open,
  editingCompetitor,
  existingCompetitors,
  onClose,
  onSave,
}) => {
  const [industryInput, setIndustryInput] = useState('');
  const [serviceInput, setServiceInput] = useState('');

  const form = useForm<CompetitorFormValues>({
    resolver: zodResolver(competitorSchema),
    defaultValues: {
      companyName: '',
      website: '',
      location: '',
      marketLevel: 'Local',
      classification: 'Direct Competitor',
      foundedYear: 'Unknown',
      description: '',
      industriesServed: [],
      primaryServices: [],
      pricingModel: 'Unknown',
      targetAudience: 'Unknown',
      threatLevel: 'Unknown',
      status: 'Active',
      nextReviewDate: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    setIndustryInput('');
    setServiceInput('');
    if (editingCompetitor) {
      form.reset({
        companyName: editingCompetitor.companyName,
        website: editingCompetitor.website || '',
        location: editingCompetitor.location || '',
        marketLevel: editingCompetitor.marketLevel,
        classification: editingCompetitor.classification,
        foundedYear: editingCompetitor.foundedYear || 'Unknown',
        description: editingCompetitor.description || '',
        industriesServed: editingCompetitor.industriesServed ?? [],
        primaryServices: editingCompetitor.primaryServices ?? [],
        pricingModel: editingCompetitor.pricingModel || 'Unknown',
        targetAudience: editingCompetitor.targetAudience || 'Unknown',
        threatLevel: editingCompetitor.threatLevel,
        status: editingCompetitor.status,
        nextReviewDate: editingCompetitor.nextReviewDate || '',
        notes: editingCompetitor.notes || '',
      });
    } else {
      form.reset({
        companyName: '',
        website: '',
        location: '',
        marketLevel: 'Local',
        classification: 'Direct Competitor',
        foundedYear: 'Unknown',
        description: '',
        industriesServed: [],
        primaryServices: [],
        pricingModel: 'Unknown',
        targetAudience: 'Unknown',
        threatLevel: 'Unknown',
        status: 'Active',
        nextReviewDate: '',
        notes: '',
      });
    }
  }, [open, editingCompetitor, form]);

  const watchedName = form.watch('companyName');
  const watchedWebsite = form.watch('website');
  const watchedClassification = form.watch('classification');
  const watchedIndustries = form.watch('industriesServed');
  const watchedServices = form.watch('primaryServices');

  const duplicateMatch = useMemo(() => {
    if (!watchedName.trim() && !watchedWebsite.trim()) return null;
    return findDuplicateCompetitor(
      {
        companyName: watchedName,
        website: watchedWebsite,
        excludeId: editingCompetitor?.id,
      },
      existingCompetitors
    );
  }, [watchedName, watchedWebsite, editingCompetitor?.id, existingCompetitors]);

  if (!open) return null;

  const isBenchmark =
    watchedClassification === 'Regional Benchmark' ||
    watchedClassification === 'National Benchmark';

  const addIndustryTag = () => {
    const clean = industryInput.trim();
    if (!clean) return;
    if (!watchedIndustries.includes(clean)) {
      form.setValue('industriesServed', [...watchedIndustries, clean], { shouldDirty: true });
    }
    setIndustryInput('');
  };

  const addServiceTag = (tagValue?: string) => {
    const clean = (tagValue ?? serviceInput).trim();
    if (!clean) return;
    if (!watchedServices.includes(clean)) {
      form.setValue('primaryServices', [...watchedServices, clean], { shouldDirty: true });
    }
    if (!tagValue) setServiceInput('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">
              {editingCompetitor ? `Edit ${editingCompetitor.companyName}` : 'Add Competitor or Benchmark'}
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Leave unverified fields as Unknown until backed by a public source URL.
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
          {duplicateMatch && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  Possible duplicate detected: &ldquo;{duplicateMatch.companyName}&rdquo;
                </p>
                <p className="mt-0.5 text-amber-800">
                  Matches existing tracked entry ({duplicateMatch.location || duplicateMatch.marketLevel} · {duplicateMatch.status}). Verify before creating a second profile.
                </p>
              </div>
            </div>
          )}

          {isBenchmark && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2.5 text-xs text-blue-900">
              {BENCHMARK_DISCLAIMER_TEXT}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">
                Company Name <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Acme Digital Systems"
                {...form.register('companyName')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
              />
              {form.formState.errors.companyName && (
                <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.companyName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Official Website</label>
              <input
                type="url"
                placeholder="https://example.com"
                {...form.register('website')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
              />
              {form.formState.errors.website && (
                <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.website.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Location</label>
              <input
                type="text"
                placeholder="e.g. Sivakasi, Tamil Nadu"
                {...form.register('location')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Market Level</label>
              <select
                {...form.register('marketLevel')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white text-[#1F2937]"
              >
                {MARKET_LEVELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Classification</label>
              <select
                {...form.register('classification')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white text-[#1F2937]"
              >
                {COMPETITOR_CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Status</label>
              <select
                {...form.register('status')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white text-[#1F2937]"
              >
                {COMPETITOR_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Threat Level</label>
              <select
                {...form.register('threatLevel')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white text-[#1F2937]"
              >
                {COMPETITOR_THREAT_LEVELS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Founded Year</label>
              <input
                type="text"
                placeholder="Unknown"
                {...form.register('foundedYear')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Next Review Date</label>
              <input
                type="date"
                {...form.register('nextReviewDate')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937]"
              />
              {form.formState.errors.nextReviewDate && (
                <p className="mt-1 text-xs text-[#DC2626]">{form.formState.errors.nextReviewDate.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Pricing Model</label>
              <input
                type="text"
                placeholder="Unknown (or Project-based, Retainer...)"
                {...form.register('pricingModel')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Target Audience</label>
              <input
                type="text"
                placeholder="Unknown (or Local SMEs, Factories...)"
                {...form.register('targetAudience')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
              />
            </div>
          </div>

          {/* Industries Served */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">Industries Served</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={industryInput}
                onChange={(e) => setIndustryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addIndustryTag();
                  }
                }}
                placeholder="e.g. Printing, Fireworks, Retail"
                className="flex-1 h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm"
              />
              <button
                type="button"
                onClick={addIndustryTag}
                className="min-h-[40px] px-3 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
              >
                Add
              </button>
            </div>
            {watchedIndustries.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {watchedIndustries.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      form.setValue(
                        'industriesServed',
                        watchedIndustries.filter((t) => t !== tag),
                        { shouldDirty: true }
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-[#1F2937] hover:bg-red-50 hover:text-[#DC2626] cursor-pointer"
                  >
                    <span>{tag}</span>
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Primary Services */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">Primary Services</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={serviceInput}
                onChange={(e) => setServiceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addServiceTag();
                  }
                }}
                placeholder="Add service observed on official site"
                className="flex-1 h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm"
              />
              <button
                type="button"
                onClick={() => addServiceTag()}
                className="min-h-[40px] px-3 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
              >
                Add
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_SERVICE_TAGS.filter((t) => !watchedServices.includes(t)).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addServiceTag(s)}
                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#E2E8F0] px-2 py-1 text-[11px] text-[#64748B] hover:border-[#DC2626] hover:text-[#DC2626] cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>{s}</span>
                </button>
              ))}
            </div>
            {watchedServices.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {watchedServices.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      form.setValue(
                        'primaryServices',
                        watchedServices.filter((t) => t !== tag),
                        { shouldDirty: true }
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-[#DC2626] hover:bg-red-100 cursor-pointer"
                  >
                    <span>{tag}</span>
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">Description</label>
            <textarea
              rows={2}
              placeholder="Factual positioning summary based on public sources..."
              {...form.register('description')}
              className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm text-[#1F2937]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">Research Notes</label>
            <textarea
              rows={2}
              placeholder="Verification reminders, questions to verify, or regional context..."
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
              <span>{editingCompetitor ? 'Save Changes' : 'Add Competitor'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
