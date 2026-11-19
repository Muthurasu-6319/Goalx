import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Clock,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useServices } from '../hooks/useServices';
import { useToast } from '../hooks/useToast';
import { SERVICE_STATUSES } from '../lib/constants';
import { formatINR, paiseToRupees } from '../lib/moneyUtils';
import { BusinessServiceFormValues, businessServiceSchema } from '../lib/validators';
import {
  createBusinessService,
  deleteBusinessService,
  updateBusinessService,
  updateBusinessServiceStatus,
} from '../services/businessServiceCatalog';
import { BusinessService, BusinessServiceStatus } from '../types';

const STATUS_TEXT_COLOR: Record<BusinessServiceStatus, string> = {
  Active: 'text-[#16A34A]',
  Planned: 'text-[#2563EB]',
  Inactive: 'text-[#64748B]',
};

export const ServiceCatalogPage: React.FC = () => {
  const { firebaseUser } = useAuth();
  const { services, loading, error, leadCountByService, getReferenceCounts } = useServices();
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BusinessServiceStatus>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<BusinessService | null>(null);
  const [subTagInput, setSubTagInput] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<BusinessService | null>(null);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<BusinessServiceFormValues>({
    resolver: zodResolver(businessServiceSchema),
    defaultValues: {
      name: '',
      description: '',
      startingPriceRupees: 0,
      estimatedDeliveryDays: 14,
      status: 'Active',
      subServices: [],
    },
  });

  const subServicesValue = form.watch('subServices');

  const filteredServices = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return services.filter((svc) => {
      if (statusFilter !== 'all' && svc.status !== statusFilter) return false;
      if (!q) return true;
      return (
        svc.name.toLowerCase().includes(q) ||
        svc.description.toLowerCase().includes(q) ||
        svc.subServices.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [services, searchTerm, statusFilter]);

  const openCreateModal = () => {
    setEditingService(null);
    setSubTagInput('');
    form.reset({
      name: '',
      description: '',
      startingPriceRupees: 0,
      estimatedDeliveryDays: 14,
      status: 'Active',
      subServices: [],
    });
    setModalOpen(true);
  };

  const openEditModal = (svc: BusinessService) => {
    setEditingService(svc);
    setSubTagInput('');
    form.reset({
      name: svc.name,
      description: svc.description || '',
      startingPriceRupees: paiseToRupees(svc.startingPricePaise),
      estimatedDeliveryDays: svc.estimatedDeliveryDays,
      status: svc.status,
      subServices: svc.subServices ?? [],
    });
    setModalOpen(true);
  };

  const handleAddTag = () => {
    const clean = subTagInput.trim();
    if (!clean) return;
    const current = form.getValues('subServices');
    if (current.length >= 30) {
      showToast('Maximum 30 sub-services allowed', { variant: 'warning' });
      return;
    }
    if (!current.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      form.setValue('subServices', [...current, clean], { shouldValidate: true });
    }
    setSubTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    const current = form.getValues('subServices');
    form.setValue(
      'subServices',
      current.filter((t) => t !== tag),
      { shouldValidate: true }
    );
  };

  const onSubmit = async (values: BusinessServiceFormValues) => {
    if (!firebaseUser) return;
    try {
      if (editingService) {
        await updateBusinessService(editingService.id, values);
        showToast('Service updated', { variant: 'success' });
      } else {
        await createBusinessService(firebaseUser.uid, values);
        showToast('Service added to catalog', { variant: 'success' });
      }
      setModalOpen(false);
    } catch (err) {
      showToast('Unable to save service', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleStatusChange = async (svc: BusinessService, nextStatus: BusinessServiceStatus) => {
    if (svc.status === nextStatus) return;
    try {
      await updateBusinessServiceStatus(svc.id, nextStatus);
      showToast(`${svc.name} marked ${nextStatus}`, { variant: 'success' });
    } catch (err) {
      showToast('Status update failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const deleteRefCounts = deleteTarget
    ? getReferenceCounts(deleteTarget.id, deleteTarget.name)
    : { leadCount: 0, clientCount: 0, total: 0 };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteRefCounts.total > 0) return;
    setDeleting(true);
    try {
      await deleteBusinessService(deleteTarget.id);
      showToast('Service removed', { variant: 'info' });
      setDeleteTarget(null);
    } catch (err) {
      showToast('Delete failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-[#DC2626]">
        Unable to load service catalog: {error}
      </div>
    );
  }

  const activeCount = services.filter((s) => s.status === 'Active').length;
  const plannedCount = services.filter((s) => s.status === 'Planned').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Service Catalog</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            <span className="tabular-nums">{activeCount} active</span>
            <span aria-hidden="true"> · </span>
            <span className="tabular-nums">{plannedCount} planned</span>
            <span aria-hidden="true"> · </span>
            <span>Gen Z Neural-X offerings</span>
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Service</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search services or sub-services (e.g. SCADA, IIoT)..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
          {(['all', ...SERVICE_STATUSES] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === status
                  ? 'bg-white text-[#1F2937] shadow-xs'
                  : 'text-[#64748B] hover:text-[#1F2937]'
              }`}
            >
              {status === 'all' ? 'All' : status}
            </button>
          ))}
        </div>
      </div>

      {/* Service Cards Grid */}
      {filteredServices.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredServices.map((svc) => {
            const leadCount =
              (leadCountByService.get(svc.id) ?? 0) +
              (leadCountByService.get(`name:${svc.name}`) ?? 0);

            return (
              <article
                key={svc.id}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-[#1F2937] leading-snug">
                        {svc.name}
                      </h2>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[#64748B]">
                        <span className={`font-medium ${STATUS_TEXT_COLOR[svc.status]}`}>
                          {svc.status}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {leadCount} {leadCount === 1 ? 'lead' : 'leads'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(svc)}
                        aria-label={`Edit ${svc.name}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(svc)}
                        aria-label={`Delete ${svc.name}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {svc.description && (
                    <p className="text-sm text-[#64748B] leading-relaxed line-clamp-2">
                      {svc.description}
                    </p>
                  )}

                  {svc.subServices && svc.subServices.length > 0 && (
                    <p className="text-xs text-[#64748B] leading-relaxed">
                      <span className="font-medium text-[#1F2937]">Sub-services: </span>
                      {svc.subServices.join(' · ')}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs text-[#64748B]">Starting Price</p>
                    <p className="text-sm font-semibold text-[#1F2937] tabular-nums">
                      {svc.startingPricePaise > 0
                        ? formatINR(svc.startingPricePaise)
                        : 'Set price'}
                    </p>
                  </div>

                  <div className="text-center space-y-0.5">
                    <p className="text-xs text-[#64748B]">Delivery</p>
                    <p className="text-sm font-semibold text-[#1F2937] tabular-nums inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#64748B]" />
                      {svc.estimatedDeliveryDays > 0
                        ? `${svc.estimatedDeliveryDays}d`
                        : 'TBD'}
                    </p>
                  </div>

                  <select
                    aria-label={`Status for ${svc.name}`}
                    value={svc.status}
                    onChange={(e) =>
                      void handleStatusChange(svc, e.target.value as BusinessServiceStatus)
                    }
                    className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#1F2937] cursor-pointer"
                  >
                    {SERVICE_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            title="No services match your filter"
            description="Add a new service offering or adjust your search query."
            actionLabel="Add Service"
            onAction={openCreateModal}
          />
        </div>
      )}

      {/* Create / Edit Modal (full-screen on mobile) */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Layers className="w-5 h-5 text-[#DC2626]" />
                <h2 className="text-base font-semibold text-[#1F2937]">
                  {editingService ? 'Edit Service' : 'Add Service'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
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
              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                  Service Name *
                </label>
                <input
                  type="text"
                  {...form.register('name')}
                  placeholder="e.g., Industrial IoT Telemetry"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
                />
                {form.formState.errors.name && (
                  <p className="mt-1 text-xs text-[#DC2626]">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                  Description
                </label>
                <textarea
                  rows={3}
                  {...form.register('description')}
                  placeholder="Scope, deliverables, and ideal client fit..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                    Starting Price (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    {...form.register('startingPriceRupees', { valueAsNumber: true })}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937] tabular-nums"
                  />
                  {form.formState.errors.startingPriceRupees && (
                    <p className="mt-1 text-xs text-[#DC2626]">
                      {form.formState.errors.startingPriceRupees.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                    Delivery (days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    {...form.register('estimatedDeliveryDays', { valueAsNumber: true })}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937] tabular-nums"
                  />
                  {form.formState.errors.estimatedDeliveryDays && (
                    <p className="mt-1 text-xs text-[#DC2626]">
                      {form.formState.errors.estimatedDeliveryDays.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                    Status
                  </label>
                  <select
                    {...form.register('status')}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937] bg-white"
                  >
                    {SERVICE_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                  Sub-services / Tags
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={subTagInput}
                    onChange={(e) => setSubTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="e.g., SCADA, PLC, EMS"
                    className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-medium text-[#1F2937] hover:bg-slate-100 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                {subServicesValue.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {subServicesValue.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#1F2937]"
                      >
                        <span>{tag}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          aria-label={`Remove ${tag}`}
                          className="text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
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
                  <span>{editingService ? 'Save Changes' : 'Create Service'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation / Reference Block Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={
          deleteRefCounts.total > 0
            ? `Cannot delete "${deleteTarget?.name}"`
            : `Delete "${deleteTarget?.name}"?`
        }
        description={
          deleteRefCounts.total > 0
            ? `This service is currently referenced by ${deleteRefCounts.leadCount} lead(s) and ${deleteRefCounts.clientCount} client(s). Reassign those records or set this service to Inactive instead.`
            : 'This will permanently remove the service from your catalog.'
        }
        variant={deleteRefCounts.total > 0 ? 'warning' : 'danger'}
        confirmLabel="Delete Service"
        cancelLabel={deleteRefCounts.total > 0 ? 'Close' : 'Cancel'}
        confirmDisabled={deleteRefCounts.total > 0}
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
