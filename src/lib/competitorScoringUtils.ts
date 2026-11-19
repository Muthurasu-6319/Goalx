import {
  DEFAULT_RATING_SCORE_MAP,
  DEFAULT_SCORECARD_WEIGHTS,
  SCORECARD_METRIC_DEFS,
  SCORE_DIMENSIONS,
  ScorecardMetricDef,
  SURPASS_REQUIRED_ADVANTAGE,
  SURPASS_REQUIRED_COMPARABLE,
  SURPASS_REQUIRED_COVERAGE_PCT,
  SURPASS_REQUIRED_LEADS,
  SURPASS_REQUIRED_MONTHS,
} from './constants';
import {
  BusinessExpense,
  BusinessService,
  Client,
  CompetitiveGap,
  CompetitiveGoalLink,
  Competitor,
  CompetitorComparison,
  CompetitorEvidence,
  CompetitorMetric,
  CompetitorMonthlyReview,
  CompetitorScoreConfig,
  DataStatus,
  GoalPriority,
  Lead,
  OtherIncome,
  OwnMetric,
  Project,
  ProjectPayment,
  RatingScoreMap,
  ScorecardDimensionKey,
  ScorecardType,
  ScorecardWeights,
  TeamMember,
} from '../types';
import { computeCompetitorEvidenceSummary, isValidHttpUrl } from './competitorUtils';

// ---------------------------------------------------------------------------
// Basic Helpers
// ---------------------------------------------------------------------------

export function isComparableStatus(status: DataStatus | undefined | null): boolean {
  return status === 'Verified' || status === 'User Entered';
}

export function isValidRating(rating: number | undefined | null): boolean {
  return typeof rating === 'number' && Number.isFinite(rating) && rating >= 1 && rating <= 5;
}

export function ratingToScore(
  rating: number | undefined | null,
  map: RatingScoreMap = DEFAULT_RATING_SCORE_MAP
): number | null {
  if (!isValidRating(rating)) return null;
  const r = Math.round(rating as number);
  if (r <= 1) return map.r1;
  if (r === 2) return map.r2;
  if (r === 3) return map.r3;
  if (r === 4) return map.r4;
  return map.r5;
}

export function weightsSum(weights: ScorecardWeights): number {
  return (
    weights.revenue_growth +
    weights.client_acquisition +
    weights.project_delivery +
    weights.service_portfolio +
    weights.technology_innovation +
    weights.portfolio_quality +
    weights.customer_reputation +
    weights.digital_presence +
    weights.team_operations +
    weights.pricing_value
  );
}

export function getNormalizedConfig(
  config?: Partial<CompetitorScoreConfig> | null
): {
  weights: ScorecardWeights;
  ratingScoreMap: RatingScoreMap;
  minComparableMetrics: number;
  minScoreAdvantage: number;
  minEvidenceCoveragePct: number;
  minConsecutiveMonths: number;
} {
  const weights =
    config?.weights && weightsSum(config.weights) === 100
      ? config.weights
      : DEFAULT_SCORECARD_WEIGHTS;

  return {
    weights,
    ratingScoreMap: config?.ratingScoreMap ?? DEFAULT_RATING_SCORE_MAP,
    minComparableMetrics: config?.minComparableMetrics ?? SURPASS_REQUIRED_COMPARABLE,
    minScoreAdvantage: config?.minScoreAdvantage ?? SURPASS_REQUIRED_ADVANTAGE,
    minEvidenceCoveragePct: config?.minEvidenceCoveragePct ?? SURPASS_REQUIRED_COVERAGE_PCT,
    minConsecutiveMonths: config?.minConsecutiveMonths ?? SURPASS_REQUIRED_MONTHS,
  };
}

/**
 * Checks whether two YYYY-MM strings represent consecutive calendar months
 * (e.g. "2026-09" and "2026-10", or "2025-12" and "2026-01").
 */
export function areTwoMonthsConsecutive(earlierMonth: string, laterMonth: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(earlierMonth) || !/^\d{4}-\d{2}$/.test(laterMonth)) {
    return false;
  }
  const [y1, m1] = earlierMonth.split('-').map(Number);
  const [y2, m2] = laterMonth.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) === 1;
}

export function roundScore(val: number): number {
  return Math.round(val * 10) / 10;
}

// ---------------------------------------------------------------------------
// Gen Z Neural-X Own Metrics Derivation (Real GoalX Data Only)
// ---------------------------------------------------------------------------

export interface DerivedOwnMetricView {
  metricKey: string;
  metricName: string;
  dimensionKey: ScorecardDimensionKey;
  scorecardType: ScorecardType;
  value: string;
  rating: number; // 0 = Unknown/unrated, 1-5 valid
  score: number; // 0-100 (0 when unrated)
  sourceType: 'Calculated from GoalX data' | 'User entered';
  sourceUrl: string;
  evidenceDescription: string;
  dataStatus: DataStatus;
  lastVerifiedDate: string;
  notes: string;
  derivableFromGoalX: boolean;
  description: string;
}

export interface GoalXOwnDataInputs {
  services: BusinessService[];
  leads: Lead[];
  clients: Client[];
  projects: Project[];
  projectPayments: ProjectPayment[];
  otherIncome: OtherIncome[];
  businessExpenses: BusinessExpense[];
  teamMembers: TeamMember[];
  savedOwnMetrics: OwnMetric[];
  ratingScoreMap?: RatingScoreMap;
  todayStr: string;
}

function getMonthKeyFromDate(dateStr: string): string {
  return /^\d{4}-\d{2}/.test(dateStr) ? dateStr.slice(0, 7) : '';
}

function rateFromPctThresholds(pct: number, thresholds: [number, number, number, number]): number {
  if (pct >= thresholds[3]) return 5;
  if (pct >= thresholds[2]) return 4;
  if (pct >= thresholds[1]) return 3;
  if (pct >= thresholds[0]) return 2;
  return 1;
}

/**
 * Computes all 15 Gen Z Neural-X metrics combining real GoalX operational data
 * (`Calculated from GoalX data`) and user-entered metrics (`User entered`).
 * Never invents numbers when GoalX data is empty.
 */
export function buildOwnMetricsView(inputs: GoalXOwnDataInputs): DerivedOwnMetricView[] {
  const {
    services,
    leads,
    clients,
    projects,
    projectPayments,
    otherIncome,
    businessExpenses,
    teamMembers,
    savedOwnMetrics,
    ratingScoreMap = DEFAULT_RATING_SCORE_MAP,
    todayStr,
  } = inputs;

  const savedByKey = new Map<string, OwnMetric>(savedOwnMetrics.map((m) => [m.metricKey, m]));
  const currentMonth = todayStr.slice(0, 7);

  // 1. Month-over-Month Revenue Growth (only when >= 2 distinct months have collections)
  const monthlyRevenue = new Map<string, number>();
  for (const p of projectPayments) {
    if (p.isDeleted) continue;
    const mk = getMonthKeyFromDate(p.date);
    if (mk) monthlyRevenue.set(mk, (monthlyRevenue.get(mk) ?? 0) + p.amountPaise);
  }
  for (const inc of otherIncome) {
    if (inc.isDeleted) continue;
    const mk = getMonthKeyFromDate(inc.date);
    if (mk) monthlyRevenue.set(mk, (monthlyRevenue.get(mk) ?? 0) + inc.amountPaise);
  }
  const sortedRevMonths = Array.from(monthlyRevenue.keys()).sort();

  const deriveCalculated = (def: ScorecardMetricDef): DerivedOwnMetricView => {
    const saved = savedByKey.get(def.metricKey);
    const makeResult = (
      value: string,
      rating: number,
      dataStatus: DataStatus,
      evidenceDescription: string
    ): DerivedOwnMetricView => ({
      metricKey: def.metricKey,
      metricName: def.metricName,
      dimensionKey: def.dimensionKey,
      scorecardType: def.scorecardType,
      value,
      rating,
      score: ratingToScore(rating, ratingScoreMap) ?? 0,
      sourceType: 'Calculated from GoalX data',
      sourceUrl: saved?.sourceUrl ?? '',
      evidenceDescription,
      dataStatus,
      lastVerifiedDate: todayStr,
      notes: saved?.notes ?? '',
      derivableFromGoalX: true,
      description: def.description,
    });

    if (def.metricKey === 'biz_revenue_growth') {
      if (sortedRevMonths.length < 2) {
        return makeResult(
          'Unknown (need ≥ 2 months of finance collections)',
          0,
          'Unknown',
          `Only ${sortedRevMonths.length} month(s) of recorded collections in GoalX Finance.`
        );
      }
      const prevMk = sortedRevMonths[sortedRevMonths.length - 2];
      const currMk = sortedRevMonths[sortedRevMonths.length - 1];
      const prevAmt = monthlyRevenue.get(prevMk) ?? 0;
      const currAmt = monthlyRevenue.get(currMk) ?? 0;
      if (prevAmt <= 0) {
        return makeResult(
          `Unknown (prior month ${prevMk} baseline is ₹0)`,
          0,
          'Unknown',
          `Prior month ${prevMk} has zero recorded collections; cannot compute MoM % growth.`
        );
      }
      const growthPct = ((currAmt - prevAmt) / prevAmt) * 100;
      const rating =
        growthPct >= 20 ? 5 : growthPct >= 5 ? 4 : growthPct >= -5 ? 3 : growthPct >= -20 ? 2 : 1;
      return makeResult(
        `${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}% MoM (${prevMk} → ${currMk})`,
        rating,
        'User Entered',
        `Derived from GoalX Finance collections (${sortedRevMonths.length} months of ledger records).`
      );
    }

    if (def.metricKey === 'biz_client_acquisition') {
      const activeLeads = leads.filter((l) => !l.archived);
      if (activeLeads.length === 0 && clients.length === 0) {
        return makeResult(
          'Unknown (no leads or clients recorded yet)',
          0,
          'Unknown',
          'Add leads or clients in GoalX CRM to compute acquisition metrics.'
        );
      }
      const wonLeads = activeLeads.filter((l) => l.status === 'Won').length;
      const convPct = activeLeads.length > 0 ? Math.round((wonLeads / activeLeads.length) * 100) : 0;
      const signalScore =
        clients.length >= 10 || (wonLeads >= 5 && convPct >= 25)
          ? 5
          : clients.length >= 5 || wonLeads >= 3
            ? 4
            : clients.length >= 2 || activeLeads.length >= 5
              ? 3
              : 2;
      return makeResult(
        `${clients.length} clients · ${activeLeads.length} leads (${wonLeads} won, ${convPct}% conv.)`,
        signalScore,
        'User Entered',
        'Derived live from GoalX Leads CRM and Clients directory.'
      );
    }

    if (def.metricKey === 'biz_project_delivery') {
      const relevant = projects.filter((p) => p.status !== 'Cancelled');
      if (relevant.length === 0) {
        return makeResult(
          'Unknown (no projects tracked yet)',
          0,
          'Unknown',
          'Add client projects with due dates in GoalX Projects to measure on-time delivery.'
        );
      }
      const withDue = relevant.filter((p) => Boolean(p.dueDate));
      if (withDue.length === 0) {
        const completedCount = relevant.filter((p) => p.status === 'Completed').length;
        return makeResult(
          `${completedCount}/${relevant.length} completed (no due dates set)`,
          completedCount > 0 ? 3 : 2,
          'User Entered',
          'Derived from GoalX Projects; add due dates to compute strict on-time delivery %.'
        );
      }
      let onTime = 0;
      for (const p of withDue) {
        if (p.status === 'Completed') {
          const updatedIso = p.updatedAt?.toDate ? p.updatedAt.toDate().toISOString().slice(0, 10) : p.dueDate;
          if (updatedIso <= p.dueDate) onTime += 1;
        } else if (p.dueDate >= todayStr) {
          onTime += 1;
        }
      }
      const onTimePct = Math.round((onTime / withDue.length) * 100);
      const rating = rateFromPctThresholds(onTimePct, [50, 70, 85, 95]);
      return makeResult(
        `${onTimePct}% on-time / on-schedule (${onTime}/${withDue.length} projects)`,
        rating,
        'User Entered',
        'Derived from GoalX Projects comparing due dates and completion status.'
      );
    }

    if (def.metricKey === 'biz_service_portfolio') {
      const activeServices = services.filter((s) => s.status === 'Active');
      if (activeServices.length === 0) {
        return makeResult(
          'Unknown (no active services configured)',
          0,
          'Unknown',
          'Configure services in GoalX Company Services Catalog.'
        );
      }
      const count = activeServices.length;
      const rating = count >= 8 ? 5 : count >= 5 ? 4 : count >= 3 ? 3 : 2;
      return makeResult(
        `${count} active services (${activeServices.slice(0, 3).map((s) => s.name).join(', ')}${count > 3 ? '…' : ''})`,
        rating,
        'User Entered',
        `Derived from ${count} active records in GoalX businessServices catalog.`
      );
    }

    if (def.metricKey === 'biz_team_operations') {
      const activeMembers = teamMembers.filter((m) => m.status === 'Active');
      if (activeMembers.length === 0) {
        return makeResult(
          'Unknown (no active team members logged)',
          0,
          'Unknown',
          'Add team members in GoalX Team & Compensation to calculate capacity.'
        );
      }
      const count = activeMembers.length;
      const rating = count >= 10 ? 5 : count >= 5 ? 4 : count >= 3 ? 3 : count >= 1 ? 2 : 1;
      return makeResult(
        `${count} active team member${count === 1 ? '' : 's'}`,
        rating,
        'User Entered',
        `Derived from ${count} active member records in GoalX teamMembers.`
      );
    }

    if (def.metricKey === 'biz_customer_retention') {
      const activeOrRecurring = clients.filter((c) => c.status === 'Active' || c.status === 'Recurring');
      if (activeOrRecurring.length === 0) {
        return makeResult(
          'Unknown (no clients logged yet)',
          0,
          'Unknown',
          'Add clients in GoalX Clients to track recurring retention rate.'
        );
      }
      const recurringCount = activeOrRecurring.filter((c) => c.status === 'Recurring').length;
      const ratioPct = Math.round((recurringCount / activeOrRecurring.length) * 100);
      const rating = rateFromPctThresholds(ratioPct, [10, 25, 45, 65]);
      return makeResult(
        `${recurringCount}/${activeOrRecurring.length} recurring (${ratioPct}%)`,
        rating,
        'User Entered',
        'Derived from Recurring vs Active client status in GoalX Clients.'
      );
    }

    if (def.metricKey === 'biz_profitability') {
      const totalRev = Array.from(monthlyRevenue.values()).reduce((sum, v) => sum + v, 0);
      const totalExp = businessExpenses
        .filter((e) => !e.isDeleted)
        .reduce((sum, e) => sum + e.amountPaise, 0);
      if (totalRev <= 0) {
        return makeResult(
          'Unknown (no revenue collections yet)',
          0,
          'Unknown',
          `Profitability requires > ₹0 collected revenue in GoalX Finance (${currentMonth}).`
        );
      }
      const marginPct = ((totalRev - totalExp) / totalRev) * 100;
      const rating =
        marginPct >= 35 ? 5 : marginPct >= 20 ? 4 : marginPct >= 5 ? 3 : marginPct >= 0 ? 2 : 1;
      return makeResult(
        `${marginPct.toFixed(1)}% net margin`,
        rating,
        'User Entered',
        'Derived from total GoalX Finance collections minus non-deleted expenses.'
      );
    }

    // Fallback for any future derivable metric
    return makeResult('Unknown', 0, 'Unknown', 'No GoalX derivation rule matched.');
  };

  return SCORECARD_METRIC_DEFS.map((def) => {
    if (def.derivableFromGoalX) {
      return deriveCalculated(def);
    }
    const saved = savedByKey.get(def.metricKey);
    if (!saved) {
      return {
        metricKey: def.metricKey,
        metricName: def.metricName,
        dimensionKey: def.dimensionKey,
        scorecardType: def.scorecardType,
        value: 'Unknown',
        rating: 0,
        score: 0,
        sourceType: 'User entered',
        sourceUrl: '',
        evidenceDescription: 'Enter Gen Z Neural-X self-assessment and evidence.',
        dataStatus: 'Unknown',
        lastVerifiedDate: '',
        notes: '',
        derivableFromGoalX: false,
        description: def.description,
      };
    }
    const computedScore = ratingToScore(saved.rating, ratingScoreMap) ?? 0;
    return {
      metricKey: def.metricKey,
      metricName: saved.metricName || def.metricName,
      dimensionKey: def.dimensionKey,
      scorecardType: def.scorecardType,
      value: saved.value || 'Unknown',
      rating: saved.rating,
      score: computedScore,
      sourceType: 'User entered',
      sourceUrl: saved.sourceUrl,
      evidenceDescription: saved.evidenceDescription,
      dataStatus: saved.dataStatus,
      lastVerifiedDate: saved.lastVerifiedDate,
      notes: saved.notes,
      derivableFromGoalX: false,
      description: def.description,
    };
  });
}

// ---------------------------------------------------------------------------
// Dual Scorecards & Side-by-Side Comparison Engine
// ---------------------------------------------------------------------------

export type MetricComparisonBucket = 'ahead' | 'behind' | 'equal' | 'missing' | 'estimated';

export interface ComparedMetricRow {
  metricKey: string;
  metricName: string;
  dimensionKey: ScorecardDimensionKey;
  dimensionLabel: string;
  scorecardType: ScorecardType;
  ownMetric: DerivedOwnMetricView;
  competitorMetric: CompetitorMetric | null;
  ownScore: number | null; // 0-100 or null
  competitorScore: number | null; // 0-100 or null
  isComparable: boolean;
  isEstimatedOnly: boolean;
  bucket: MetricComparisonBucket;
  missingReason: string;
  delta: number | null; // ownScore - competitorScore
}

export interface DimensionScoreBreakdown {
  dimensionKey: ScorecardDimensionKey;
  label: string;
  scorecardType: ScorecardType;
  weight: number;
  comparableMetricsCount: number;
  ownScore: number | null;
  competitorScore: number | null;
  delta: number | null;
}

export interface CompetitorScorecardResult {
  competitorId: string;
  competitorName: string;
  comparableCount: number;
  hasEnoughComparableData: boolean;
  minComparableRequired: number;

  // Overall weighted across comparable metrics (null if comparableCount < minComparableRequired)
  ownOverallScore: number | null;
  competitorOverallScore: number | null;
  scoreAdvantage: number | null; // ownOverallScore - competitorOverallScore

  // Separate Scorecard A: Market Presence
  ownMarketPresenceScore: number | null;
  competitorMarketPresenceScore: number | null;
  marketPresenceComparableCount: number;
  competitorMarketPresenceStandaloneCount: number;

  // Separate Scorecard B: Business Performance
  ownBusinessPerformanceScore: number | null;
  competitorBusinessPerformanceScore: number | null;
  businessPerformanceComparableCount: number;
  competitorBusinessPerformanceStandaloneCount: number;

  // 4 Comparison Buckets (+ separated estimated items)
  ahead: ComparedMetricRow[];
  behind: ComparedMetricRow[];
  equal: ComparedMetricRow[];
  missing: ComparedMetricRow[];
  estimatedOnly: ComparedMetricRow[];

  dimensionBreakdowns: DimensionScoreBreakdown[];
  evidenceCoveragePct: number;
  whatToImprove: string[];
  autoGapProposals: {
    metricKey: string;
    metricName: string;
    title: string;
    description: string;
    competitorValue: string;
    ownValue: string;
    priority: GoalPriority;
    suggestedAction: string;
  }[];
  nextActionsToReachComparable: string[];
}

export function computeDualScorecards(params: {
  competitor: Competitor;
  ownMetrics: DerivedOwnMetricView[];
  competitorMetrics: CompetitorMetric[];
  competitorEvidence?: CompetitorEvidence[];
  config?: Partial<CompetitorScoreConfig> | null;
  todayStr: string;
}): CompetitorScorecardResult {
  const { competitor, ownMetrics, competitorMetrics, competitorEvidence = [], config, todayStr } = params;
  const normConfig = getNormalizedConfig(config);

  const compByKey = new Map<string, CompetitorMetric>(
    competitorMetrics.filter((m) => m.competitorId === competitor.id).map((m) => [m.metricKey, m])
  );
  const ownByKey = new Map<string, DerivedOwnMetricView>(ownMetrics.map((m) => [m.metricKey, m]));
  const dimLabelMap = new Map(SCORE_DIMENSIONS.map((d) => [d.key, d.label]));

  const evidenceSummary = computeCompetitorEvidenceSummary(
    competitor,
    competitorMetrics.filter((m) => m.competitorId === competitor.id),
    todayStr,
    competitorEvidence.filter((e) => e.competitorId === competitor.id)
  );

  const rows: ComparedMetricRow[] = [];
  const ahead: ComparedMetricRow[] = [];
  const behind: ComparedMetricRow[] = [];
  const equal: ComparedMetricRow[] = [];
  const missing: ComparedMetricRow[] = [];
  const estimatedOnly: ComparedMetricRow[] = [];

  for (const def of SCORECARD_METRIC_DEFS) {
    const own = ownByKey.get(def.metricKey)!;
    const comp = compByKey.get(def.metricKey) ?? null;

    const ownValid = isComparableStatus(own.dataStatus) && isValidRating(own.rating);
    const compStatusOk = Boolean(comp && isComparableStatus(comp.dataStatus));
    const compRatingOk = Boolean(comp && isValidRating(comp.rating));
    const compIsEstimated = Boolean(comp && comp.dataStatus === 'Estimated' && isValidRating(comp.rating));

    const ownScore = ownValid ? ratingToScore(own.rating, normConfig.ratingScoreMap) : null;
    const compScore = comp && isValidRating(comp.rating) && comp.dataStatus !== 'Unknown'
      ? ratingToScore(comp.rating, normConfig.ratingScoreMap)
      : null;

    const isComparable = ownValid && compStatusOk && compRatingOk && ownScore !== null && compScore !== null;

    let bucket: MetricComparisonBucket = 'missing';
    let missingReason = '';
    let delta: number | null = null;

    if (isComparable && ownScore !== null && compScore !== null) {
      delta = roundScore(ownScore - compScore);
      if (delta > 0) {
        bucket = 'ahead';
      } else if (delta < 0) {
        bucket = 'behind';
      } else {
        bucket = 'equal';
      }
    } else if (compIsEstimated) {
      bucket = 'estimated';
      missingReason = 'Competitor value is Estimated (excluded from official comparable score).';
    } else {
      bucket = 'missing';
      const reasons: string[] = [];
      if (!ownValid) reasons.push('Gen Z Neural-X metric is Unknown or unrated');
      if (!comp) reasons.push('Competitor metric not recorded');
      else if (comp.dataStatus === 'Unknown') reasons.push('Competitor status is Unknown');
      else if (!compStatusOk) reasons.push(`Competitor status is ${comp.dataStatus}`);
      else if (!compRatingOk) reasons.push('Competitor 1–5 rating not assigned');
      missingReason = reasons.join(' · ');
    }

    const row: ComparedMetricRow = {
      metricKey: def.metricKey,
      metricName: def.metricName,
      dimensionKey: def.dimensionKey,
      dimensionLabel: dimLabelMap.get(def.dimensionKey) || def.dimensionKey,
      scorecardType: def.scorecardType,
      ownMetric: own,
      competitorMetric: comp,
      ownScore,
      competitorScore: compScore,
      isComparable,
      isEstimatedOnly: compIsEstimated && !isComparable,
      bucket,
      missingReason,
      delta,
    };
    rows.push(row);

    if (bucket === 'ahead') ahead.push(row);
    else if (bucket === 'behind') behind.push(row);
    else if (bucket === 'equal') equal.push(row);
    else if (bucket === 'estimated') estimatedOnly.push(row);
    else missing.push(row);
  }

  const comparableRows = rows.filter((r) => r.isComparable);
  const comparableCount = comparableRows.length;
  const hasEnoughComparableData = comparableCount >= normConfig.minComparableMetrics;

  // Compute per-dimension scores across comparable rows
  const dimensionBreakdowns: DimensionScoreBreakdown[] = SCORE_DIMENSIONS.map((dim) => {
    const dimComparable = comparableRows.filter((r) => r.dimensionKey === dim.key);
    if (dimComparable.length === 0) {
      return {
        dimensionKey: dim.key,
        label: dim.label,
        scorecardType: dim.scorecardType,
        weight: normConfig.weights[dim.key],
        comparableMetricsCount: 0,
        ownScore: null,
        competitorScore: null,
        delta: null,
      };
    }
    const ownAvg =
      dimComparable.reduce((sum, r) => sum + (r.ownScore ?? 0), 0) / dimComparable.length;
    const compAvg =
      dimComparable.reduce((sum, r) => sum + (r.competitorScore ?? 0), 0) / dimComparable.length;
    return {
      dimensionKey: dim.key,
      label: dim.label,
      scorecardType: dim.scorecardType,
      weight: normConfig.weights[dim.key],
      comparableMetricsCount: dimComparable.length,
      ownScore: roundScore(ownAvg),
      competitorScore: roundScore(compAvg),
      delta: roundScore(ownAvg - compAvg),
    };
  });

  const computeWeightedFromDimensions = (dims: DimensionScoreBreakdown[]) => {
    const active = dims.filter((d) => d.comparableMetricsCount > 0 && d.weight > 0);
    const totalW = active.reduce((sum, d) => sum + d.weight, 0);
    if (totalW <= 0) return { own: null, comp: null };
    const own = active.reduce((sum, d) => sum + (d.ownScore ?? 0) * d.weight, 0) / totalW;
    const comp = active.reduce((sum, d) => sum + (d.competitorScore ?? 0) * d.weight, 0) / totalW;
    return { own: roundScore(own), comp: roundScore(comp) };
  };

  // Overall score ONLY if comparableCount >= minComparableMetrics
  const overallWeighted = computeWeightedFromDimensions(dimensionBreakdowns);
  const ownOverallScore = hasEnoughComparableData ? overallWeighted.own : null;
  const competitorOverallScore = hasEnoughComparableData ? overallWeighted.comp : null;
  const scoreAdvantage =
    ownOverallScore !== null && competitorOverallScore !== null
      ? roundScore(ownOverallScore - competitorOverallScore)
      : null;

  // Separate Scorecard A (Market Presence) vs Scorecard B (Business Performance)
  // Standalone competitor scorecard uses Verified/User Entered rated metrics for that scorecard group
  const computeStandaloneGroupScore = (group: ScorecardType): { compScore: number | null; count: number } => {
    const groupDims = SCORE_DIMENSIONS.filter((d) => d.scorecardType === group);
    let weightedSum = 0;
    let totalW = 0;
    let count = 0;
    for (const dim of groupDims) {
      const dimMetrics = rows.filter(
        (r) =>
          r.dimensionKey === dim.key &&
          r.competitorMetric &&
          isComparableStatus(r.competitorMetric.dataStatus) &&
          isValidRating(r.competitorMetric.rating)
      );
      if (dimMetrics.length === 0) continue;
      count += dimMetrics.length;
      const w = normConfig.weights[dim.key];
      if (w <= 0) continue;
      const avg =
        dimMetrics.reduce(
          (s, r) => s + (ratingToScore(r.competitorMetric?.rating, normConfig.ratingScoreMap) ?? 0),
          0
        ) / dimMetrics.length;
      weightedSum += avg * w;
      totalW += w;
    }
    return {
      compScore: totalW > 0 ? roundScore(weightedSum / totalW) : null,
      count,
    };
  };

  const mpDims = dimensionBreakdowns.filter((d) => d.scorecardType === 'Market Presence');
  const bpDims = dimensionBreakdowns.filter((d) => d.scorecardType === 'Business Performance');
  const mpWeighted = computeWeightedFromDimensions(mpDims);
  const bpWeighted = computeWeightedFromDimensions(bpDims);
  const mpComparableCount = comparableRows.filter((r) => r.scorecardType === 'Market Presence').length;
  const bpComparableCount = comparableRows.filter((r) => r.scorecardType === 'Business Performance').length;
  const mpStandalone = computeStandaloneGroupScore('Market Presence');
  const bpStandalone = computeStandaloneGroupScore('Business Performance');

  const whatToImprove: string[] = [];
  for (const r of behind) {
    whatToImprove.push(
      `Close gap on ${r.metricName}: ${competitor.companyName} leads (${r.competitorScore} vs ${r.ownScore}).`
    );
  }
  for (const r of equal) {
    whatToImprove.push(
      `Break tie on ${r.metricName} (both scored ${r.ownScore}) by upgrading delivery or verified proof.`
    );
  }
  if (evidenceSummary.coveragePct < normConfig.minEvidenceCoveragePct) {
    whatToImprove.push(
      `Raise verified competitor evidence from ${evidenceSummary.coveragePct}% to ${normConfig.minEvidenceCoveragePct}% for reliable benchmarking.`
    );
  }

  const autoGapProposals = behind.map((r) => ({
    metricKey: r.metricKey,
    metricName: r.metricName,
    title: `Outperform ${competitor.companyName} on ${r.metricName}`,
    description: `${competitor.companyName} scores ${r.competitorScore}/100 (status: ${r.competitorMetric?.dataStatus}, observed: "${r.competitorMetric?.value || 'N/A'}") vs Gen Z Neural-X ${r.ownScore}/100 ("${r.ownMetric.value}").`,
    competitorValue: r.competitorMetric?.value || 'N/A',
    ownValue: r.ownMetric.value,
    priority: (Math.abs(r.delta ?? 0) >= 40 ? 'High' : 'Medium') as GoalPriority,
    suggestedAction: `Upgrade ${r.metricName} evidence and execution from rating ${r.ownMetric.rating}/5 to ${Math.min(5, (r.competitorMetric?.rating ?? 3) + 1)}/5.`,
  }));

  const nextActionsToReachComparable: string[] = [];
  if (!hasEnoughComparableData) {
    const needed = normConfig.minComparableMetrics - comparableCount;
    nextActionsToReachComparable.push(
      `Need ${needed} more comparable metric${needed === 1 ? '' : 's'} (Verified or User Entered with 1–5 rating on both sides).`
    );
    for (const r of [...missing, ...estimatedOnly].slice(0, 4)) {
      nextActionsToReachComparable.push(`${r.metricName}: ${r.missingReason}`);
    }
  }

  return {
    competitorId: competitor.id,
    competitorName: competitor.companyName,
    comparableCount,
    hasEnoughComparableData,
    minComparableRequired: normConfig.minComparableMetrics,
    ownOverallScore,
    competitorOverallScore,
    scoreAdvantage,
    ownMarketPresenceScore: mpWeighted.own,
    competitorMarketPresenceScore: mpWeighted.comp ?? mpStandalone.compScore,
    marketPresenceComparableCount: mpComparableCount,
    competitorMarketPresenceStandaloneCount: mpStandalone.count,
    ownBusinessPerformanceScore: bpWeighted.own,
    competitorBusinessPerformanceScore: bpWeighted.comp ?? bpStandalone.compScore,
    businessPerformanceComparableCount: bpComparableCount,
    competitorBusinessPerformanceStandaloneCount: bpStandalone.count,
    ahead,
    behind,
    equal,
    missing,
    estimatedOnly,
    dimensionBreakdowns,
    evidenceCoveragePct: evidenceSummary.coveragePct,
    whatToImprove,
    autoGapProposals,
    nextActionsToReachComparable,
  };
}

// ---------------------------------------------------------------------------
// 8-Stage Progression & 6-Condition Surpass Verification Engine
// ---------------------------------------------------------------------------

export interface ProgressionStageStatus {
  stage: number;
  key: string;
  label: string;
  completed: boolean;
  active: boolean;
  detail: string;
}

export interface SurpassConditionCheck {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface SurpassEvaluationResult {
  allSystemConditionsPassed: boolean;
  canConfirmSurpassed: boolean;
  conditions: SurpassConditionCheck[];
  latestTwoReviews: [CompetitorMonthlyReview, CompetitorMonthlyReview] | null;
}

/**
 * Evaluates all 6 required rules to confirm a competitor as Surpassed.
 * Condition 6 is explicit user confirmation in UI before submitting.
 */
export function evaluateSurpassConditions(params: {
  competitor: Competitor;
  scorecard: CompetitorScorecardResult;
  monthlyReviews: CompetitorMonthlyReview[];
  config?: Partial<CompetitorScoreConfig> | null;
}): SurpassEvaluationResult {
  const { competitor, scorecard, monthlyReviews, config } = params;
  const normConfig = getNormalizedConfig(config);

  const compReviews = monthlyReviews.filter((r) => r.competitorId === competitor.id);

  // Deduplicate by month taking the latest version (highest version number)
  const latestByMonth = new Map<string, CompetitorMonthlyReview>();
  for (const r of compReviews) {
    const existing = latestByMonth.get(r.month);
    if (!existing || r.version > existing.version) {
      latestByMonth.set(r.month, r);
    }
  }
  const sortedMonthly = Array.from(latestByMonth.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  let latestTwoReviews: [CompetitorMonthlyReview, CompetitorMonthlyReview] | null = null;
  let consecutivePassed = false;
  if (sortedMonthly.length >= 2) {
    const prev = sortedMonthly[sortedMonthly.length - 2];
    const curr = sortedMonthly[sortedMonthly.length - 1];
    latestTwoReviews = [prev, curr];
    consecutivePassed =
      areTwoMonthsConsecutive(prev.month, curr.month) &&
      prev.eligibleForSurpass &&
      curr.eligibleForSurpass &&
      prev.scoreAdvantage >= normConfig.minScoreAdvantage &&
      curr.scoreAdvantage >= normConfig.minScoreAdvantage;
  }

  const c1 = scorecard.comparableCount >= normConfig.minComparableMetrics;
  const c2 = scorecard.ahead.length >= SURPASS_REQUIRED_LEADS;
  const c3 =
    scorecard.scoreAdvantage !== null && scorecard.scoreAdvantage >= normConfig.minScoreAdvantage;
  const c4 = consecutivePassed;
  const c5 = scorecard.evidenceCoveragePct >= normConfig.minEvidenceCoveragePct;

  const conditions: SurpassConditionCheck[] = [
    {
      key: 'min_comparable',
      label: `At least ${normConfig.minComparableMetrics} comparable metrics (Verified / User Entered)`,
      passed: c1,
      detail: `${scorecard.comparableCount} / ${normConfig.minComparableMetrics} comparable`,
    },
    {
      key: 'min_leads',
      label: `Gen Z Neural-X leads in at least ${SURPASS_REQUIRED_LEADS} comparable metrics`,
      passed: c2,
      detail: `Leading in ${scorecard.ahead.length} / ${SURPASS_REQUIRED_LEADS} metrics`,
    },
    {
      key: 'min_advantage',
      label: `Overall weighted score advantage ≥ ${normConfig.minScoreAdvantage} points`,
      passed: c3,
      detail:
        scorecard.scoreAdvantage !== null
          ? `${scorecard.scoreAdvantage >= 0 ? '+' : ''}${scorecard.scoreAdvantage} pts`
          : 'Not enough comparable data',
    },
    {
      key: 'two_consecutive_months',
      label: `Advantage ≥ ${normConfig.minScoreAdvantage} pts across ${normConfig.minConsecutiveMonths} consecutive monthly reviews`,
      passed: c4,
      detail: latestTwoReviews
        ? `${latestTwoReviews[0].month} (+${latestTwoReviews[0].scoreAdvantage}) & ${latestTwoReviews[1].month} (+${latestTwoReviews[1].scoreAdvantage})`
        : `${sortedMonthly.length} / 2 monthly reviews saved`,
    },
    {
      key: 'min_evidence_coverage',
      label: `Competitor evidence coverage ≥ ${normConfig.minEvidenceCoveragePct}%`,
      passed: c5,
      detail: `${scorecard.evidenceCoveragePct}% / ${normConfig.minEvidenceCoveragePct}%`,
    },
    {
      key: 'active_target',
      label: 'Competitor is currently set as Active Target (not already Surpassed)',
      passed: Boolean(competitor.isActiveTarget) && competitor.status !== 'Surpassed',
      detail: competitor.status === 'Surpassed' ? 'Already Surpassed' : competitor.isActiveTarget ? 'Active Target' : 'Not Active Target',
    },
  ];

  const allSystemConditionsPassed = conditions.every((c) => c.passed);

  return {
    allSystemConditionsPassed,
    canConfirmSurpassed: allSystemConditionsPassed,
    conditions,
    latestTwoReviews,
  };
}

/**
 * Derives the 8-stage progression strictly from real Firestore state.
 */
export function computeProgressionStages(params: {
  activeTarget: Competitor | null;
  scorecard: CompetitorScorecardResult | null;
  comparisons: CompetitorComparison[];
  gaps: CompetitiveGap[];
  gapLinks: CompetitiveGoalLink[];
  monthlyReviews: CompetitorMonthlyReview[];
  surpassEvaluation: SurpassEvaluationResult | null;
}): ProgressionStageStatus[] {
  const {
    activeTarget,
    scorecard,
    comparisons,
    gaps,
    gapLinks,
    monthlyReviews,
    surpassEvaluation,
  } = params;

  const targetId = activeTarget?.id ?? '';
  const targetComparisons = comparisons.filter((c) => c.competitorId === targetId);
  const targetGaps = gaps.filter((g) => g.linkedCompetitorIds.includes(targetId));
  const targetGapIds = new Set(targetGaps.map((g) => g.id));
  const targetLinks = gapLinks.filter((l) => targetGapIds.has(l.gapId));
  const targetReviews = monthlyReviews.filter((r) => r.competitorId === targetId);

  const s1 = Boolean(activeTarget);
  const s2 = Boolean(activeTarget && scorecard && scorecard.evidenceCoveragePct >= 40);
  const s3 = Boolean(scorecard && scorecard.hasEnoughComparableData) || targetComparisons.length > 0;
  const s4 = targetGaps.length > 0;
  const s5 = targetLinks.length > 0 || targetGaps.some((g) => Boolean(g.convertedGoalId || g.convertedTaskId));
  const s6 = targetGaps.some((g) => g.progressPct > 0 || g.status === 'In Progress' || g.status === 'Done');
  const s7 = targetReviews.length > 0;
  const s8 = activeTarget?.status === 'Surpassed' || Boolean(surpassEvaluation?.canConfirmSurpassed);

  const flags = [s1, s2, s3, s4, s5, s6, s7, s8];
  const firstIncompleteIdx = flags.findIndex((f) => !f);

  const details = [
    activeTarget ? `Target: ${activeTarget.companyName}` : 'Choose 1 Active Target',
    scorecard ? `${scorecard.evidenceCoveragePct}% evidence coverage` : 'Collect verified evidence',
    scorecard
      ? `${scorecard.comparableCount}/${scorecard.minComparableRequired} comparable metrics`
      : 'Score & compare metrics',
    `${targetGaps.length} gap${targetGaps.length === 1 ? '' : 's'} linked`,
    `${targetLinks.length} goal/task link${targetLinks.length === 1 ? '' : 's'}`,
    targetGaps.length > 0
      ? `${Math.round(targetGaps.reduce((s, g) => s + (g.status === 'Done' ? 100 : g.progressPct), 0) / targetGaps.length)}% avg gap progress`
      : 'Update gap execution',
    `${targetReviews.length} monthly snapshot${targetReviews.length === 1 ? '' : 's'}`,
    activeTarget?.status === 'Surpassed'
      ? `Surpassed on ${activeTarget.surpassedDate || 'recorded'}`
      : surpassEvaluation?.canConfirmSurpassed
        ? 'Ready for CEO confirmation'
        : 'Meet all 6 surpass checks',
  ];

  const labels = [
    'Select Active Target',
    'Research & Evidence',
    'Compare Metrics',
    'Identify Gaps',
    'Goals & Tasks',
    'Track Progress',
    'Monthly Review',
    'Confirm Surpassed',
  ];

  const keys = [
    'select_target',
    'research_competitor',
    'compare_metrics',
    'identify_gaps',
    'create_goals',
    'track_progress',
    'monthly_review',
    'confirm_surpassed',
  ];

  return labels.map((label, idx) => ({
    stage: idx + 1,
    key: keys[idx],
    label,
    completed: flags[idx],
    active: firstIncompleteIdx === idx || (firstIncompleteIdx === -1 && idx === 7),
    detail: details[idx],
  }));
}

export function computeOverallGapsProgress(gaps: CompetitiveGap[]): {
  totalActive: number;
  completedCount: number;
  avgProgressPct: number;
} {
  const activeGaps = gaps.filter((g) => g.status !== 'Dismissed');
  if (activeGaps.length === 0) {
    return { totalActive: 0, completedCount: 0, avgProgressPct: 0 };
  }
  const completedCount = activeGaps.filter((g) => g.status === 'Done').length;
  const avgProgressPct = Math.round(
    activeGaps.reduce((sum, g) => sum + (g.status === 'Done' ? 100 : g.progressPct), 0) /
      activeGaps.length
  );
  return { totalActive: activeGaps.length, completedCount, avgProgressPct };
}
