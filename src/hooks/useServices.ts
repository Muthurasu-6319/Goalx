import { useMemo } from 'react';
import { useBusinessDataContext } from './useBusinessData';

export function useServices() {
  const { services, loading, error, leads, clients } = useBusinessDataContext();

  const leadCountByService = useMemo(() => {
    const map = new Map<string, number>();
    for (const lead of leads) {
      if (lead.archived) continue;
      if (lead.serviceId) {
        map.set(lead.serviceId, (map.get(lead.serviceId) ?? 0) + 1);
      } else if (lead.serviceCategory) {
        map.set(`name:${lead.serviceCategory}`, (map.get(`name:${lead.serviceCategory}`) ?? 0) + 1);
      }
    }
    return map;
  }, [leads]);

  const getReferenceCounts = (serviceId: string, serviceName: string) => {
    const leadCount = leads.filter(
      (l) => l.serviceId === serviceId || (!l.serviceId && l.serviceCategory === serviceName)
    ).length;
    const clientCount = clients.filter(
      (c) => c.serviceId === serviceId || (!c.serviceId && c.serviceCategory === serviceName)
    ).length;
    return { leadCount, clientCount, total: leadCount + clientCount };
  };

  return {
    services,
    loading,
    error,
    leadCountByService,
    getReferenceCounts,
  };
}
