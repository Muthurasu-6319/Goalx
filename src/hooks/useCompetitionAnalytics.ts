import { useMemo } from 'react';
import {
  buildOwnMetricsView,
  computeDualScorecards,
  computeOverallGapsProgress,
  computeProgressionStages,
  CompetitorScorecardResult,
  evaluateSurpassConditions,
  getNormalizedConfig,
} from '../lib/competitorScoringUtils';
import { getTodayDateString } from '../lib/goalUtils';
import { useBusinessDataContext } from './useBusinessData';

export function useCompetitionAnalytics() {
  const {
    loading,
    error,
    services,
    leads,
    clients,
    projects,
    projectPayments,
    otherIncome,
    businessExpenses,
    teamMembers,
    competitors,
    competitorMetrics,
    competitorEvidence,
    ownMetrics: savedOwnMetrics,
    competitorScoreConfigs,
    competitorComparisons,
    competitorMonthlyReviews,
    competitiveGaps,
    competitiveGoals,
    tasks,
    rewardEvents,
  } = useBusinessDataContext();

  const todayStr = getTodayDateString();
  const currentMonth = todayStr.slice(0, 7);

  const scoreConfig = competitorScoreConfigs[0] ?? null;
  const normalizedConfig = useMemo(() => getNormalizedConfig(scoreConfig), [scoreConfig]);

  const ownMetrics = useMemo(
    () =>
      buildOwnMetricsView({
        services,
        leads,
        clients,
        projects,
        projectPayments,
        otherIncome,
        businessExpenses,
        teamMembers,
        savedOwnMetrics,
        ratingScoreMap: normalizedConfig.ratingScoreMap,
        todayStr,
      }),
    [
      services,
      leads,
      clients,
      projects,
      projectPayments,
      otherIncome,
      businessExpenses,
      teamMembers,
      savedOwnMetrics,
      normalizedConfig.ratingScoreMap,
      todayStr,
    ]
  );

  const scorecardByCompetitor = useMemo(() => {
    const map = new Map<string, CompetitorScorecardResult>();
    for (const comp of competitors) {
      map.set(
        comp.id,
        computeDualScorecards({
          competitor: comp,
          ownMetrics,
          competitorMetrics,
          competitorEvidence,
          config: scoreConfig,
          todayStr,
        })
      );
    }
    return map;
  }, [competitors, ownMetrics, competitorMetrics, competitorEvidence, scoreConfig, todayStr]);

  const activeTarget = useMemo(
    () =>
      competitors.find((c) => c.isActiveTarget && c.status !== 'Surpassed') ??
      competitors.find((c) => c.status === 'Active') ??
      null,
    [competitors]
  );

  const activeTargetScorecard = activeTarget
    ? scorecardByCompetitor.get(activeTarget.id) ?? null
    : null;

  const activeTargetSurpassEval = useMemo(() => {
    if (!activeTarget || !activeTargetScorecard) return null;
    return evaluateSurpassConditions({
      competitor: activeTarget,
      scorecard: activeTargetScorecard,
      monthlyReviews: competitorMonthlyReviews,
      config: scoreConfig,
    });
  }, [activeTarget, activeTargetScorecard, competitorMonthlyReviews, scoreConfig]);

  const activeTargetStages = useMemo(
    () =>
      computeProgressionStages({
        activeTarget,
        scorecard: activeTargetScorecard,
        comparisons: competitorComparisons,
        gaps: competitiveGaps,
        gapLinks: competitiveGoals,
        monthlyReviews: competitorMonthlyReviews,
        surpassEvaluation: activeTargetSurpassEval,
      }),
    [
      activeTarget,
      activeTargetScorecard,
      competitorComparisons,
      competitiveGaps,
      competitiveGoals,
      competitorMonthlyReviews,
      activeTargetSurpassEval,
    ]
  );

  const gapsProgress = useMemo(
    () => computeOverallGapsProgress(competitiveGaps),
    [competitiveGaps]
  );

  // Comparable Ranking across non-archived competitors with >= 5 comparable metrics
  const comparableRanking = useMemo(() => {
    const eligible = competitors
      .filter((c) => c.status !== 'Archived')
      .map((c) => {
        const sc = scorecardByCompetitor.get(c.id)!;
        return { competitor: c, scorecard: sc };
      })
      .filter((item) => item.scorecard.hasEnoughComparableData && item.scorecard.competitorOverallScore !== null);

    // Build combined leaderboard including Gen Z Neural-X using average comparable own score
    if (eligible.length === 0) return { hasData: false as const, entries: [], ownRank: null };

    const activeTargetOwn = activeTargetScorecard?.ownOverallScore ?? eligible[0].scorecard.ownOverallScore ?? 0;
    const entries = [
      {
        id: 'genz_neural_x',
        name: 'Gen Z Neural-X (You)',
        score: activeTargetOwn,
        isOwn: true,
        status: 'Active',
      },
      ...eligible.map((item) => ({
        id: item.competitor.id,
        name: item.competitor.companyName,
        score: item.scorecard.competitorOverallScore ?? 0,
        isOwn: false,
        status: item.competitor.status,
      })),
    ].sort((a, b) => b.score - a.score);

    const ownIdx = entries.findIndex((e) => e.isOwn);
    return {
      hasData: true as const,
      entries,
      ownRank: ownIdx >= 0 ? ownIdx + 1 : null,
      totalRanked: entries.length,
    };
  }, [competitors, scorecardByCompetitor, activeTargetScorecard]);

  // Phase 5B Action Alerts (Gap deadlines due/overdue, monthly review due, surpass ready)
  const overdueOrDueGaps = useMemo(
    () =>
      competitiveGaps.filter(
        (g) =>
          g.status !== 'Done' &&
          g.status !== 'Dismissed' &&
          g.deadline &&
          g.deadline <= todayStr
      ),
    [competitiveGaps, todayStr]
  );

  const monthlyReviewDueForTarget = useMemo(() => {
    if (!activeTarget || activeTarget.status === 'Surpassed') return false;
    return !competitorMonthlyReviews.some(
      (r) => r.competitorId === activeTarget.id && r.month === currentMonth
    );
  }, [activeTarget, competitorMonthlyReviews, currentMonth]);

  const surpassedCompetitors = useMemo(
    () => competitors.filter((c) => c.status === 'Surpassed'),
    [competitors]
  );

  const candidateNextTargets = useMemo(
    () =>
      competitors.filter(
        (c) =>
          c.id !== activeTarget?.id &&
          (c.status === 'Candidate' || c.status === 'Watching' || c.status === 'Active')
      ),
    [competitors, activeTarget]
  );

  return {
    loading,
    error,
    todayStr,
    currentMonth,
    scoreConfig,
    normalizedConfig,
    ownMetrics,
    competitors,
    competitorMetrics,
    competitorEvidence,
    competitorComparisons,
    competitorMonthlyReviews,
    competitiveGaps,
    competitiveGoals,
    tasks,
    rewardEvents,
    scorecardByCompetitor,
    activeTarget,
    activeTargetScorecard,
    activeTargetSurpassEval,
    activeTargetStages,
    gapsProgress,
    comparableRanking,
    overdueOrDueGaps,
    monthlyReviewDueForTarget,
    surpassedCompetitors,
    candidateNextTargets,
  };
}
