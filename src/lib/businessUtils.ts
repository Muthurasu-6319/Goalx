import { BusinessService, Lead, LeadSource, LeadStatus } from '../types';
import { LEAD_SOURCES, LEAD_STATUSES, QUALIFIED_LEAD_STATUSES } from './constants';
import { addDaysToDateString, getTodayDateString } from './goalUtils';
import { getLastNMonthKeys } from './moneyUtils';

/**
 * Strips ASCII control characters, normalizes whitespace, and enforces max length.
 */
export function sanitizeText(value: string, maxLen: number): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function normalizePhoneForMatch(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function normalizeEmailForMatch(email: string): string {
  return email.trim().toLowerCase();
}

export function findDuplicateLeads(
  leads: Lead[],
  phone: string,
  email: string,
  excludeLeadId?: string
): Lead[] {
  const normPhone = normalizePhoneForMatch(phone);
  const normEmail = normalizeEmailForMatch(email);
  if (normPhone.length < 7 && !normEmail) return [];

  return leads.filter((lead) => {
    if (excludeLeadId && lead.id === excludeLeadId) return false;
    const leadPhone = normalizePhoneForMatch(lead.phone || '');
    const leadEmail = normalizeEmailForMatch(lead.email || '');
    const phoneMatch = normPhone.length >= 7 && leadPhone.length >= 7 && leadPhone === normPhone;
    const emailMatch = Boolean(normEmail) && Boolean(leadEmail) && leadEmail === normEmail;
    return phoneMatch || emailMatch;
  });
}

export type DateFilterPreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'this_year'
  | 'custom';

export function getDateRangeBounds(
  preset: DateFilterPreset,
  customStart?: string,
  customEnd?: string,
  todayStr = getTodayDateString()
): { start: string; end: string; label: string } {
  const [y, m, d] = todayStr.split('-').map(Number);
  const todayDt = new Date(y, m - 1, d);

  const fmt = (dt: Date) => {
    const ry = dt.getFullYear();
    const rm = String(dt.getMonth() + 1).padStart(2, '0');
    const rd = String(dt.getDate()).padStart(2, '0');
    return `${ry}-${rm}-${rd}`;
  };

  switch (preset) {
    case 'today':
      return { start: todayStr, end: todayStr, label: 'Today' };
    case 'this_week': {
      const day = todayDt.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const start = addDaysToDateString(todayStr, diffToMonday);
      const end = addDaysToDateString(start, 6);
      return { start, end, label: 'This week' };
    }
    case 'this_month': {
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const end = fmt(new Date(y, m, 0));
      return { start, end, label: 'This month' };
    }
    case 'last_month': {
      const startDt = new Date(y, m - 2, 1);
      const endDt = new Date(y, m - 1, 0);
      return { start: fmt(startDt), end: fmt(endDt), label: 'Last month' };
    }
    case 'last_3_months': {
      const startDt = new Date(y, m - 3, 1);
      return { start: fmt(startDt), end: todayStr, label: 'Last 3 months' };
    }
    case 'this_year': {
      return { start: `${y}-01-01`, end: `${y}-12-31`, label: 'This year' };
    }
    case 'custom': {
      const start = customStart || '1900-01-01';
      const end = customEnd || '9999-12-31';
      return { start, end, label: 'Custom range' };
    }
  }
}

export interface CrmMetricsSummary {
  totalLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  wonLeads: number;
  lostLeads: number;
  activePipelineLeads: number;
  conversionRatePct: number;
}

export function computeCrmMetrics(leads: Lead[]): CrmMetricsSummary {
  const nonArchived = leads.filter((l) => !l.archived);
  const totalLeads = nonArchived.length;
  const newLeads = nonArchived.filter((l) => l.status === 'New').length;
  const qualifiedLeads = nonArchived.filter((l) => QUALIFIED_LEAD_STATUSES.includes(l.status)).length;
  const wonLeads = nonArchived.filter((l) => l.status === 'Won').length;
  const lostLeads = nonArchived.filter((l) => l.status === 'Lost').length;
  const activePipelineLeads = nonArchived.filter(
    (l) => l.status !== 'Won' && l.status !== 'Lost'
  ).length;
  const conversionRatePct = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

  return {
    totalLeads,
    newLeads,
    qualifiedLeads,
    wonLeads,
    lostLeads,
    activePipelineLeads,
    conversionRatePct,
  };
}

export interface SourcePerformanceRow {
  source: LeadSource;
  total: number;
  won: number;
  conversionPct: number;
}

export function computeLeadSourceStats(leads: Lead[]): SourcePerformanceRow[] {
  const nonArchived = leads.filter((l) => !l.archived);
  return LEAD_SOURCES.map((source) => {
    const subset = nonArchived.filter((l) => l.leadSource === source);
    const won = subset.filter((l) => l.status === 'Won').length;
    const total = subset.length;
    return {
      source,
      total,
      won,
      conversionPct: total > 0 ? Math.round((won / total) * 100) : 0,
    };
  }).filter((row) => row.total > 0);
}

export function computeMonthlyLeadTrend(
  leads: Lead[],
  monthsCount = 6
): { month: string; total: number; won: number }[] {
  const nonArchived = leads.filter((l) => !l.archived);
  return getLastNMonthKeys(monthsCount).map(({ key, label }) => {
    const subset = nonArchived.filter((l) => l.leadGeneratedDate.startsWith(key));
    return {
      month: label,
      total: subset.length,
      won: subset.filter((l) => l.status === 'Won').length,
    };
  });
}

export function computeLeadsByService(
  leads: Lead[],
  services: BusinessService[]
): { service: string; count: number; won: number }[] {
  const nonArchived = leads.filter((l) => !l.archived);
  const map = new Map<string, { count: number; won: number }>();

  for (const svc of services) {
    map.set(svc.name, { count: 0, won: 0 });
  }

  for (const lead of nonArchived) {
    const label = lead.serviceCategory || 'Other';
    const current = map.get(label) ?? { count: 0, won: 0 };
    current.count += 1;
    if (lead.status === 'Won') current.won += 1;
    map.set(label, current);
  }

  return Array.from(map.entries())
    .map(([service, stats]) => ({ service, ...stats }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function computeStageDistribution(leads: Lead[]): { status: LeadStatus; count: number }[] {
  const nonArchived = leads.filter((l) => !l.archived);
  return LEAD_STATUSES.map((status) => ({
    status,
    count: nonArchived.filter((l) => l.status === status).length,
  }));
}

export function getFollowUpBuckets(
  leads: Lead[],
  todayStr = getTodayDateString()
): { todayFollowUps: Lead[]; overdueFollowUps: Lead[] } {
  const openLeads = leads.filter(
    (l) => !l.archived && l.status !== 'Won' && l.status !== 'Lost' && Boolean(l.followUpDate)
  );
  const todayFollowUps = openLeads.filter((l) => l.followUpDate === todayStr);
  const overdueFollowUps = openLeads
    .filter((l) => l.followUpDate < todayStr)
    .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
  return { todayFollowUps, overdueFollowUps };
}
