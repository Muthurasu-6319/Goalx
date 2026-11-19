import {
  STALE_EVIDENCE_DAYS,
  STANDARD_COMPETITOR_METRICS,
  StandardCompetitorMetricDef,
} from './constants';
import {
  Competitor,
  CompetitorConfidenceLevel,
  CompetitorEvidence,
  CompetitorMetric,
  CompetitorVerificationStatus,
  DataStatus,
} from '../types';

export function isValidHttpUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!/^https?:\/\/.+/i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeWebsiteDomain(url: string | undefined | null): string {
  if (!url) return '';
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProto);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? '';
  }
}

export function normalizeCompetitorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function sanitizePlainText(input: string, maxLen = 500): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Checks whether a candidate or edited competitor matches an existing competitor
 * by normalized company name or normalized website domain.
 */
export function findDuplicateCompetitor(
  input: { companyName: string; website?: string; excludeId?: string },
  existing: Competitor[]
): Competitor | null {
  const targetName = normalizeCompetitorName(input.companyName);
  const targetDomain = normalizeWebsiteDomain(input.website);

  for (const item of existing) {
    if (input.excludeId && item.id === input.excludeId) continue;
    if (targetName && normalizeCompetitorName(item.companyName) === targetName) {
      return item;
    }
    if (targetDomain && normalizeWebsiteDomain(item.website) === targetDomain) {
      return item;
    }
  }
  return null;
}

export function daysBetweenIsoDates(fromDateStr: string, toDateStr: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDateStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toDateStr)) {
    return 0;
  }
  const fromMs = Date.parse(`${fromDateStr}T00:00:00Z`);
  const toMs = Date.parse(`${toDateStr}T00:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 0;
  return Math.floor((toMs - fromMs) / 86400000);
}

export function isEvidenceStale(
  lastVerifiedDate: string,
  todayStr: string,
  thresholdDays = STALE_EVIDENCE_DAYS
): boolean {
  if (!lastVerifiedDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastVerifiedDate)) {
    return false;
  }
  return daysBetweenIsoDates(lastVerifiedDate, todayStr) > thresholdDays;
}

export function isCompetitorReviewDue(
  competitor: Pick<Competitor, 'nextReviewDate' | 'status'>,
  todayStr: string
): boolean {
  if (
    competitor.status === 'Archived' ||
    competitor.status === 'Inactive' ||
    competitor.status === 'Surpassed'
  ) {
    return false;
  }
  if (!competitor.nextReviewDate || !/^\d{4}-\d{2}-\d{2}$/.test(competitor.nextReviewDate)) {
    return false;
  }
  return competitor.nextReviewDate <= todayStr;
}

/**
 * Per Phase 5A rules:
 * Accepting an AI finding becomes 'Verified' ONLY if a valid source URL exists,
 * otherwise it becomes 'Estimated'.
 */
export function getResolvedAcceptedStatus(sourceUrl: string): DataStatus {
  return isValidHttpUrl(sourceUrl) ? 'Verified' : 'Estimated';
}

export function formatLastVerifiedLabel(lastVerifiedDate: string | undefined | null): string {
  if (!lastVerifiedDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastVerifiedDate)) {
    return 'Last verified: Never verified';
  }
  return `Last verified: ${lastVerifiedDate}`;
}

export function isMetricEvidenced(metric: Pick<CompetitorMetric, 'dataStatus' | 'sourceUrl'>): boolean {
  const hasUrl = isValidHttpUrl(metric.sourceUrl);
  if (!hasUrl) return false;
  return metric.dataStatus === 'Verified' || metric.dataStatus === 'User Entered';
}

export interface CompetitorEvidenceSummary {
  evidencedCount: number;
  totalStandardCount: number;
  coveragePct: number;
  confidenceLevel: CompetitorConfidenceLevel;
  verificationStatus: CompetitorVerificationStatus;
  missingMetrics: StandardCompetitorMetricDef[];
  lastVerifiedDate: string;
  isStaleOver90Days: boolean;
  daysSinceLastVerified: number | null;
}

/**
 * Single shared calculation for Evidence Coverage %, Confidence Level,
 * Missing Info list, Verification Status, and 90-day staleness.
 *
 * Formula:
 * Evidence Coverage % = (standard tracked metrics with status Verified OR User Entered with source URL)
 *                       / (total standard tracked metrics for that competitor)
 */
export function computeCompetitorEvidenceSummary(
  competitor: Pick<Competitor, 'lastVerifiedDate'>,
  metrics: CompetitorMetric[],
  todayStr: string,
  evidenceList: CompetitorEvidence[] = [],
  standardCatalog: StandardCompetitorMetricDef[] = STANDARD_COMPETITOR_METRICS
): CompetitorEvidenceSummary {
  const totalStandardCount = standardCatalog.length;
  const metricByKey = new Map<string, CompetitorMetric>();

  for (const m of metrics) {
    metricByKey.set(m.metricKey, m);
  }

  let evidencedCount = 0;
  const missingMetrics: StandardCompetitorMetricDef[] = [];

  for (const def of standardCatalog) {
    const matched = metricByKey.get(def.key);
    if (matched && isMetricEvidenced(matched)) {
      evidencedCount += 1;
    } else {
      missingMetrics.push(def);
    }
  }

  const coveragePct =
    totalStandardCount > 0
      ? Math.min(100, Math.round((evidencedCount / totalStandardCount) * 100))
      : 0;

  let confidenceLevel: CompetitorConfidenceLevel = 'Low';
  if (coveragePct >= 70) {
    confidenceLevel = 'High';
  } else if (coveragePct >= 40) {
    confidenceLevel = 'Medium';
  }

  let verificationStatus: CompetitorVerificationStatus = 'Unverified';
  if (coveragePct >= 70) {
    verificationStatus = 'Verified';
  } else if (evidencedCount > 0) {
    verificationStatus = 'Partially Verified';
  }

  // Determine latest verified date across competitor, evidenced metrics, and verified evidence records
  const candidateDates: string[] = [];
  if (competitor.lastVerifiedDate && /^\d{4}-\d{2}-\d{2}$/.test(competitor.lastVerifiedDate)) {
    candidateDates.push(competitor.lastVerifiedDate);
  }
  for (const m of metrics) {
    if (
      (m.dataStatus === 'Verified' || m.dataStatus === 'User Entered') &&
      m.lastVerifiedDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(m.lastVerifiedDate)
    ) {
      candidateDates.push(m.lastVerifiedDate);
    }
  }
  for (const e of evidenceList) {
    if (
      (e.dataStatus === 'Verified' || e.dataStatus === 'User Entered') &&
      e.lastVerifiedDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(e.lastVerifiedDate)
    ) {
      candidateDates.push(e.lastVerifiedDate);
    }
  }
  candidateDates.sort((a, b) => b.localeCompare(a));
  const lastVerifiedDate = candidateDates[0] ?? '';

  const daysSinceLastVerified = lastVerifiedDate
    ? daysBetweenIsoDates(lastVerifiedDate, todayStr)
    : null;
  const isStaleOver90Days =
    daysSinceLastVerified !== null && daysSinceLastVerified > STALE_EVIDENCE_DAYS;

  return {
    evidencedCount,
    totalStandardCount,
    coveragePct,
    confidenceLevel,
    verificationStatus,
    missingMetrics,
    lastVerifiedDate,
    isStaleOver90Days,
    daysSinceLastVerified,
  };
}
