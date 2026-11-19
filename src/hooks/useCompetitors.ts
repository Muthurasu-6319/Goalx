import { useMemo } from 'react';
import {
  CompetitorEvidenceSummary,
  computeCompetitorEvidenceSummary,
  isCompetitorReviewDue,
} from '../lib/competitorUtils';
import { getTodayDateString } from '../lib/goalUtils';
import {
  Competitor,
  CompetitorEvidence,
  CompetitorMetric,
  CompetitorPendingFinding,
} from '../types';
import { useBusinessDataContext } from './useBusinessData';

export interface EnrichedCompetitor {
  competitor: Competitor;
  metrics: CompetitorMetric[];
  evidence: CompetitorEvidence[];
  summary: CompetitorEvidenceSummary;
  pendingCount: number;
  reviewDue: boolean;
}

export function useCompetitors() {
  const {
    loading,
    error,
    competitors,
    competitorMetrics,
    competitorEvidence,
    competitorResearchHistory,
    competitorPendingFindings,
  } = useBusinessDataContext();

  const todayStr = getTodayDateString();

  const enrichedCompetitors = useMemo<EnrichedCompetitor[]>(() => {
    const metricsByComp = new Map<string, CompetitorMetric[]>();
    for (const m of competitorMetrics) {
      const list = metricsByComp.get(m.competitorId) ?? [];
      list.push(m);
      metricsByComp.set(m.competitorId, list);
    }

    const evidenceByComp = new Map<string, CompetitorEvidence[]>();
    for (const e of competitorEvidence) {
      const list = evidenceByComp.get(e.competitorId) ?? [];
      list.push(e);
      evidenceByComp.set(e.competitorId, list);
    }

    const pendingByComp = new Map<string, number>();
    for (const pf of competitorPendingFindings) {
      if (pf.decision === 'Pending' && pf.competitorId) {
        pendingByComp.set(pf.competitorId, (pendingByComp.get(pf.competitorId) ?? 0) + 1);
      }
    }

    return competitors.map((competitor) => {
      const metrics = metricsByComp.get(competitor.id) ?? [];
      const evidence = evidenceByComp.get(competitor.id) ?? [];
      const summary = computeCompetitorEvidenceSummary(
        competitor,
        metrics,
        todayStr,
        evidence
      );
      return {
        competitor,
        metrics,
        evidence,
        summary,
        pendingCount: pendingByComp.get(competitor.id) ?? 0,
        reviewDue: isCompetitorReviewDue(competitor, todayStr),
      };
    });
  }, [competitors, competitorMetrics, competitorEvidence, competitorPendingFindings, todayStr]);

  const pendingDiscoveryFindings = useMemo(
    () =>
      competitorPendingFindings.filter(
        (f) => f.findingKind === 'candidate_discovery' && f.decision === 'Pending'
      ),
    [competitorPendingFindings]
  );

  const pendingMetricFindingsCount = useMemo(
    () =>
      competitorPendingFindings.filter(
        (f) => f.findingKind === 'metric' && f.decision === 'Pending'
      ).length,
    [competitorPendingFindings]
  );

  const reviewsDue = useMemo(
    () => enrichedCompetitors.filter((item) => item.reviewDue),
    [enrichedCompetitors]
  );

  const staleCompetitors = useMemo(
    () =>
      enrichedCompetitors.filter(
        (item) =>
          item.competitor.status !== 'Archived' &&
          item.competitor.status !== 'Inactive' &&
          item.summary.isStaleOver90Days
      ),
    [enrichedCompetitors]
  );

  const aggregateStats = useMemo(() => {
    const activeTrack = enrichedCompetitors.filter(
      (c) => c.competitor.status !== 'Archived' && c.competitor.status !== 'Inactive'
    );
    const avgCoveragePct =
      activeTrack.length > 0
        ? Math.round(
            activeTrack.reduce((sum, c) => sum + c.summary.coveragePct, 0) / activeTrack.length
          )
        : 0;

    return {
      totalCount: competitors.length,
      trackedActiveCount: activeTrack.filter((c) => c.competitor.status !== 'Candidate').length,
      candidateCount: activeTrack.filter((c) => c.competitor.status === 'Candidate').length,
      avgCoveragePct,
      reviewsDueCount: reviewsDue.length,
      staleCount: staleCompetitors.length,
      pendingFindingsTotal: pendingDiscoveryFindings.length + pendingMetricFindingsCount,
    };
  }, [
    competitors.length,
    enrichedCompetitors,
    pendingDiscoveryFindings.length,
    pendingMetricFindingsCount,
    reviewsDue.length,
    staleCompetitors.length,
  ]);

  return {
    loading,
    error,
    competitors,
    enrichedCompetitors,
    competitorEvidence,
    competitorResearchHistory,
    competitorPendingFindings,
    pendingDiscoveryFindings,
    pendingMetricFindingsCount,
    reviewsDue,
    staleCompetitors,
    aggregateStats,
  };
}
