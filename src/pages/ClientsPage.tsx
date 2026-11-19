import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useClients } from '../hooks/useClients';
import { useServices } from '../hooks/useServices';
import { useToast } from '../hooks/useToast';
import { CLIENT_STATUSES, ROUTES } from '../lib/constants';
import { ClientFormValues, clientSchema } from '../lib/validators';
import { createClient, deleteClient, updateClient } from '../services/clientsService';
import { Client, ClientStatus } from '../types';

const PAGE_SIZE = 10;

const CLIENT_STATUS_COLOR: Record<ClientStatus, string> = {
  Active: 'text-[#16A34A]',
  Recurring: 'text-[#2563EB]',
  Inactive: 'text-[#64748B]',
};

export const ClientsPage: React.FC = () => {
  const { firebaseUser } = useAuth();
  const { clients, loading, error } = useClients();
  const { services } = useServices();
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'name_asc'>('newest');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      clientName: '',
      company: '',
      phone: '',
      email: '',
      address: '',
      serviceId: '',
      serviceCategory: '',
      clientManager: '',
      notes: '',
      status: 'Active',
    },
  });

  const filteredClients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = clients.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.clientName.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.clientManager.toLowerCase().includes(q)
      );
    });

    return list.sort((a, b) => {
      if (sortBy === 'name_asc') return a.clientName.localeCompare(b.clientName);
      return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
    });
  }, [clients, searchTerm, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filteredClients.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openCreateModal = () => {
    setEditingClient(null);
    form.reset({
      clientName: '',
      company: '',
      phone: '',
      email: '',
      address: '',
      serviceId: '',
      serviceCategory: '',
      clientManager: '',
      notes: '',
      status: 'Active',
    });
    setModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    form.reset({
      clientName: client.clientName,
      company: client.company || '',
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
      serviceId: client.serviceId || '',
      serviceCategory: client.serviceCategory || '',
      clientManager: client.clientManager || '',
      notes: client.notes || '',
      status: client.status,
    });
    setModalOpen(true);
  };

  const handleServiceSelect = (serviceId: string) => {
    const matched = services.find((s) => s.id === serviceId);
    form.setValue('serviceId', matched?.id ?? '');
    form.setValue('serviceCategory', matched?.name ?? '');
  };

  const onSubmit = async (values: ClientFormValues) => {
    if (!firebaseUser) return;
    try {
      if (editingClient) {
        await updateClient(editingClient.id, values);
        showToast('Client updated', { variant: 'success' });
      } else {
        await createClient(firebaseUser.uid, values);
        showToast('Client created', { variant: 'success' });
      }
      setModalOpen(false);
    } catch (err) {
      showToast('Failed to save client', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteClient(deleteTarget.id);
      showToast('Client deleted', { variant: 'info' });
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
        Unable to load clients: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Clients</h1>
          <p className="mt-1 text-sm text-[#64748B] tabular-nums">
            {clients.length} total · {clients.filter((c) => c.status !== 'Inactive').length} active
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Client</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Search client, company, phone, manager..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#1F2937]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            {(['all', ...CLIENT_STATUSES] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white text-[#1F2937] shadow-xs'
                    : 'text-[#64748B] hover:text-[#1F2937]'
                }`}
              >
                {st === 'all' ? 'All' : st}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E2E8F0] bg-white text-xs font-medium text-[#1F2937]"
          >
            <option value="newest">Newest First</option>
            <option value="name_asc">Name A–Z</option>
          </select>
        </div>
      </div>

      {/* Clients Table / Cards */}
      {paginated.length > 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                  <th className="py-3 px-4">Client / Company</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Service & Manager</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Projects</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-sm">
                {paginated.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <Link
                        to={`${ROUTES.COMPANY_CLIENTS}/${client.id}`}
                        className="font-semibold text-[#1F2937] hover:text-[#DC2626]"
                      >
                        {client.clientName}
                      </Link>
                      {client.company && (
                        <p className="text-xs text-[#64748B]">{client.company}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-[#64748B]">
                      <p className="text-[#1F2937]">{client.phone || '—'}</p>
                      <p className="truncate max-w-[180px]">{client.email || '—'}</p>
                    </td>
                    <td className="py-3 px-4 text-xs text-[#64748B]">
                      <p className="text-[#1F2937]">{client.serviceCategory || '—'}</p>
                      <p>{client.clientManager || 'Unassigned'}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-semibold ${CLIENT_STATUS_COLOR[client.status]}`}>
                        {client.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-[#64748B]">0 / No projects yet</td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          to={`${ROUTES.COMPANY_CLIENTS}/${client.id}`}
                          className="px-2.5 py-1.5 text-xs font-medium text-[#2563EB] hover:underline"
                        >
                          Details
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEditModal(client)}
                          aria-label={`Edit ${client.clientName}`}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(client)}
                          aria-label={`Delete ${client.clientName}`}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
              <span className="tabular-nums">
                Page {safePage} of {totalPages} ({filteredClients.length} clients)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#E2E8F0] disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#E2E8F0] disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            title="No clients yet"
            description="Convert a Won lead from Leads & CRM or manually add an existing client."
            actionLabel="Add Client"
            onAction={openCreateModal}
          />
        </div>
      )}

      {/* Add / Edit Client Modal (full-screen on mobile) */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-xl bg-white sm:rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-[#DC2626]" />
                <h2 className="text-base font-semibold text-[#1F2937]">
                  {editingClient ? 'Edit Client' : 'Add Client'}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    {...form.register('clientName')}
                    placeholder="e.g., Meenakshi Sundaram"
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
                    Company
                  </label>
                  <input
                    type="text"
                    {...form.register('company')}
                    placeholder="e.g., Southern Textiles Pvt Ltd"
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
                    placeholder="+91 98765 43210"
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
                    placeholder="client@company.com"
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
                    Primary Service
                  </label>
                  <select
                    value={form.watch('serviceId')}
                    onChange={(e) => handleServiceSelect(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937] bg-white"
                  >
                    <option value="">None / General</option>
                    {services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                    Status
                  </label>
                  <select
                    {...form.register('status')}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937] bg-white"
                  >
                    {CLIENT_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                  Client Manager
                </label>
                <input
                  type="text"
                  {...form.register('clientManager')}
                  placeholder="Account owner name"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                  Address
                </label>
                <input
                  type="text"
                  {...form.register('address')}
                  placeholder="City, district, state"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F2937] mb-1.5">
                  Notes
                </label>
                <textarea
                  rows={3}
                  {...form.register('notes')}
                  placeholder="Engagement notes, billing preferences..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm text-[#1F2937]"
                />
              </div>

              <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#1F2937] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#DC2626] text-sm font-medium text-white hover:bg-[#B91C1C] cursor-pointer disabled:opacity-60"
                >
                  {form.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingClient ? 'Save Changes' : 'Create Client'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation (warns if linked lead exists) */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete client "${deleteTarget?.clientName}"?`}
        description={
          deleteTarget?.sourceLeadId
            ? 'Warning: This client is linked to a converted CRM lead record. Deleting the client record will leave the source lead without an active client profile.'
            : 'This permanently deletes the client record from your directory.'
        }
        variant={deleteTarget?.sourceLeadId ? 'warning' : 'danger'}
        confirmLabel="Delete Client"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
