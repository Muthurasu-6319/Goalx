import { useMemo } from 'react';
import {
  computeCompetitorEvidenceSummary,
  isCompetitorReviewDue,
} from '../lib/competitorUtils';
import { getTodayDateString } from '../lib/goalUtils';
import { useBusinessDataContext } from './useBusinessData';

export function useCompetitorEvidence(competitorId: string | undefined) {
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

  const competitor = useMemo(
    () => competitors.find((c) => c.id === competitorId) ?? null,
    [competitors, competitorId]
  );

  const metrics = useMemo(
    () => competitorMetrics.filter((m) => m.competitorId === competitorId),
    [competitorMetrics, competitorId]
  );

  const evidence = useMemo(
    () => competitorEvidence.filter((e) => e.competitorId === competitorId),
    [competitorEvidence, competitorId]
  );

  const researchHistory = useMemo(
    () => competitorResearchHistory.filter((r) => r.competitorId === competitorId),
    [competitorResearchHistory, competitorId]
  );

  const allFindings = useMemo(
    () => competitorPendingFindings.filter((f) => f.competitorId === competitorId),
    [competitorPendingFindings, competitorId]
  );

  const pendingFindings = useMemo(
    () => allFindings.filter((f) => f.decision === 'Pending'),
    [allFindings]
  );

  const reviewedFindings = useMemo(
    () => allFindings.filter((f) => f.decision !== 'Pending'),
    [allFindings]
  );

  const summary = useMemo(() => {
    if (!competitor) return null;
    return computeCompetitorEvidenceSummary(competitor, metrics, todayStr, evidence);
  }, [competitor, metrics, todayStr, evidence]);

  const reviewDue = useMemo(
    () => (competitor ? isCompetitorReviewDue(competitor, todayStr) : false),
    [competitor, todayStr]
  );

  return {
    loading,
    error,
    competitor,
    allCompetitors: competitors,
    metrics,
    evidence,
    researchHistory,
    pendingFindings,
    reviewedFindings,
    summary,
    reviewDue,
  };
}
