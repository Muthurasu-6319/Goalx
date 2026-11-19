import { useBusinessDataContext } from './useBusinessData';

export function useClients() {
  const { clients, leads, loading, error } = useBusinessDataContext();

  const getClientSourceLead = (sourceLeadId: string) =>
    sourceLeadId ? leads.find((l) => l.id === sourceLeadId) ?? null : null;

  return {
    clients,
    loading,
    error,
    getClientSourceLead,
  };
}
