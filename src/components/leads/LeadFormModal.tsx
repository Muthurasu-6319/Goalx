import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, BriefcaseBusiness, Loader2, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useServices } from '../../hooks/useServices';
import { useToast } from '../../hooks/useToast';
import { findDuplicateLeads } from '../../lib/businessUtils';
import { LEAD_SOURCES, LEAD_STATUSES } from '../../lib/constants';
import { getTodayDateString } from '../../lib/goalUtils';
import { paiseToRupees } from '../../lib/moneyUtils';
import { LeadFormValues, leadSchema } from '../../lib/validators';
import { createLead, updateLead } from '../../services/leadsService';
import { Lead } from '../../types';

interface LeadFormModalProps {
  open: boolean;
  editingLead: Lead | null;
  existingLeads: Lead[];
  onClose: () => void;
}

export const LeadFormModal: React.FC<LeadFormModalProps> = ({
  open,
  editingLead,
  existingLeads,
  onClose,
}) => {
  const { firebaseUser } = useAuth();
  const { services } = useServices();
  const { showToast } = useToast();

  const defaultService = services[0];

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      clientName: '',
      businessName: '',
      phone: '',
      email: '',
      location: '',
      requirement: '',
      serviceId: defaultService?.id ?? '',
      serviceCategory: defaultService?.name ?? 'Website Development',
      leadSource: 'Direct',
      leadGeneratedDate: getTodayDateString(),
      assignedPerson: '',
      estimatedBudgetRupees: 0,
      followUpDate: '',
      notes: '',
      status: 'New',
      lostReason: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editingLead) {
      form.reset({
        clientName: editingLead.clientName,
        businessName: editingLead.businessName || '',
        phone: editingLead.phone || '',
        email: editingLead.email || '',
        location: editingLead.location || '',
        requirement: editingLead.requirement || '',
        serviceId: editingLead.serviceId || '',
        serviceCategory: editingLead.serviceCategory,
        leadSource: editingLead.leadSource,
        leadGeneratedDate: editingLead.leadGeneratedDate,
        assignedPerson: editingLead.assignedPerson || '',
        estimatedBudgetRupees: paiseToRupees(editingLead.estimatedBudgetPaise),
        followUpDate: editingLead.followUpDate || '',
        notes: editingLead.notes || '',
        status: editingLead.status,
        lostReason: editingLead.lostReason || '',
      });
    } else {
      const firstSvc = services[0];
      form.reset({
        clientName: '',
        businessName: '',
        phone: '',
        email: '',
        location: '',
        requirement: '',
        serviceId: firstSvc?.id ?? '',
        serviceCategory: firstSvc?.name ?? 'Website Development',
        leadSource: 'Direct',
        leadGeneratedDate: getTodayDateString(),
        assignedPerson: '',
        estimatedBudgetRupees: 0,
        followUpDate: '',
        notes: '',
        status: 'New',
        lostReason: '',
      });
    }
  }, [open, editingLead, services, form]);

  const phoneVal = form.watch('phone');
  const emailVal = form.watch('email');
  const statusVal = form.watch('status');

  const duplicates = useMemo(
    () => findDuplicateLeads(existingLeads, phoneVal, emailVal, editingLead?.id),
    [existingLeads, phoneVal, emailVal, editingLead?.id]
  );

  if (!open) return null;

  const handleServiceSelect = (serviceIdOrName: string) => {
    const matched = services.find((s) => s.id === serviceIdOrName || s.name === serviceIdOrName);
    if (matched) {
      form.setValue('serviceId', matched.id, { shouldValidate: true });
      form.setValue('serviceCategory', matched.name, { shouldValidate: true });
    } else {
      form.setValue('serviceId', '', { shouldValidate: true });
      form.setValue('serviceCategory', serviceIdOrName, { shouldValidate: true });
    }
  };

  const onSubmit = async (values: LeadFormValues) => {
    if (!firebaseUser) return;
    try {
      if (editingLead) {
        await updateLead(firebaseUser.uid, editingLead, values);
        showToast('Lead updated', { variant: 'success' });
      } else {
        await createLead(firebaseUser.uid, values);
        showToast('Lead created', {
          description: values.followUpDate ? 'Follow-up synced to Calendar.' : undefined,
          variant: 'success',
        });
      }
      onClose();
    } catch (err) {
      showToast('Failed to save lead', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-2xl bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <BriefcaseBusiness className="w-5 h-5 text-[#DC2626]" />
            <h2 className="text-base font-semibold text-[#1F2937]">
              {editingLead ? 'Edit Lead' : 'Add New Lead'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#64748B] hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto p-5 space-y-4"
        >
          {duplicates.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Possible duplicate contact detected</p>
                <p className="mt-0.5">
                  Matches existing lead:{' '}
                  {duplicates.map((d) => `${d.clientName} (${d.status})`).join(', ')}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                Client Name *
              </label>
              <input
                type="text"
                {...form.register('clientName')}
                placeholder="e.g., Karthik Raja"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
              />
              {form.formState.errors.clientName && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {form.formState.errors.clientName.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                Business Name
              </label>
              <input
                type="text"
                {...form.register('businessName')}
                placeholder="e.g., Sri Lakshmi Mills"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                Phone
              </label>
              <input
                type="tel"
                {...form.register('phone')}
                placeholder="e.g., +91 98765 43210"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
              />
              {form.formState.errors.phone && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {form.formState.errors.phone.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                Email
              </label>
              <input
                type="email"
                {...form.register('email')}
                placeholder="contact@company.com"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
              />
              {form.formState.errors.email && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                Location
              </label>
              <input
                type="text"
                {...form.register('location')}
                placeholder="e.g., Sivakasi, TN"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                Service Category *
              </label>
              <select
                value={form.watch('serviceId') || form.watch('serviceCategory')}
                onChange={(e) => handleServiceSelect(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937] bg-white"
              >
                {services.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name}
                  </option>
                ))}
                {services.length === 0 && (
                  <option value="Custom Software Development">Custom Software Development</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                Lead Source *
              </label>
              <select
                {...form.register('leadSource')}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937] bg-white"
              >
                {LEAD_SOURCES.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                Stage *
              </label>
              <select
                {...form.register('status')}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937] bg-white"
              >
                {LEAD_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                Lead Generated Date *
              </label>
              <input
                type="date"
                {...form.register('leadGeneratedDate')}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                Follow-up Date (syncs to Calendar)
              </label>
              <input
                type="date"
                {...form.register('followUpDate')}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                Estimated Budget (₹)
              </label>
              <input
                type="number"
                min={0}
                step="1"
                {...form.register('estimatedBudgetRupees', { valueAsNumber: true })}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937] tabular-nums"
              />
              {form.formState.errors.estimatedBudgetRupees && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {form.formState.errors.estimatedBudgetRupees.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                Assigned Person
              </label>
              <input
                type="text"
                {...form.register('assignedPerson')}
                placeholder="e.g., Founder / Sales Lead"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
              />
            </div>
          </div>

          {statusVal === 'Lost' && (
            <div>
              <label className="block text-xs font-medium text-[#DC2626] mb-1.5">
                Lost Reason *
              </label>
              <input
                type="text"
                {...form.register('lostReason')}
                placeholder="Budget mismatch, went with competitor, timeline..."
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-red-300 text-sm text-[#1F2937]"
              />
              {form.formState.errors.lostReason && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {form.formState.errors.lostReason.message}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
              Requirement Summary
            </label>
            <textarea
              rows={2}
              {...form.register('requirement')}
              placeholder="Key project deliverables or automation scope..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
              Internal Notes
            </label>
            <textarea
              rows={2}
              {...form.register('notes')}
              placeholder="Context from discovery call..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
            />
          </div>

          <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#DC2626] text-sm font-medium text-white hover:bg-[#B91C1C] cursor-pointer disabled:opacity-60"
            >
              {form.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{editingLead ? 'Save Changes' : 'Create Lead'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
