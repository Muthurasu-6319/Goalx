import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase/firestore';
import {
  areTwoMonthsConsecutive,
  buildOwnMetricsView,
  computeDualScorecards,
  computeProgressionStages,
  evaluateSurpassConditions,
  ratingToScore,
  weightsSum,
} from '../competitorScoringUtils';
import { DEFAULT_RATING_SCORE_MAP, DEFAULT_SCORECARD_WEIGHTS, SCORECARD_METRIC_DEFS } from '../constants';
import {
  Competitor,
  CompetitorMetric,
  CompetitorMonthlyReview,
  OwnMetric,
} from '../../types';

const nowTs = Timestamp.fromDate(new Date('2026-10-15T10:00:00Z'));

function makeCompetitor(overrides: Partial<Competitor> = {}): Competitor {
  return {
    id: 'comp_1',
    ownerId: 'user_1',
    companyId: 'user_1',
    companyName: 'Alpha Tech',
    website: 'https://alphatech.example.com',
    location: 'Sivakasi, Tamil Nadu',
    marketLevel: 'Local',
    classification: 'Direct Competitor',
    foundedYear: '2020',
    description: 'Local competitor',
    industriesServed: ['SMEs'],
    primaryServices: ['Website Development'],
    pricingModel: 'Project based',
    targetAudience: 'Local SMBs',
    threatLevel: 'Medium',
    status: 'Active',
    verificationStatus: 'Verified',
    isActiveTarget: true,
    nextReviewDate: '2026-11-01',
    lastVerifiedDate: '2026-10-10',
    notes: '',
    createdAt: nowTs,
    updatedAt: nowTs,
    ...overrides,
  };
}

function makeCompMetric(
  metricKey: string,
  rating: number,
  dataStatus: CompetitorMetric['dataStatus'] = 'Verified',
  sourceUrl = 'https://alphatech.example.com/about'
): CompetitorMetric {
  const def = SCORECARD_METRIC_DEFS.find((d) => d.metricKey === metricKey)!;
  return {
    id: `comp_1__${metricKey}`,
    ownerId: 'user_1',
    companyId: 'user_1',
    competitorId: 'comp_1',
    metricKey,
    metricName: def?.metricName || metricKey,
    category: 'Digital Presence',
    value: `Rating ${rating}/5`,
    serviceOfferStatus: '',
    rating,
    scorecardGroup: def?.scorecardType || 'Market Presence',
    sourceUrl,
    evidenceDescription: 'Public website evidence',
    dataStatus,
    lastVerifiedDate: '2026-10-10',
    notes: '',
    createdAt: nowTs,
    updatedAt: nowTs,
  };
}

function makeOwnSavedMetric(
  metricKey: string,
  rating: number,
  dataStatus: OwnMetric['dataStatus'] = 'User Entered'
): OwnMetric {
  const def = SCORECARD_METRIC_DEFS.find((d) => d.metricKey === metricKey)!;
  return {
    id: `own__${metricKey}`,
    ownerId: 'user_1',
    companyId: 'user_1',
    metricKey,
    metricName: def?.metricName || metricKey,
    dimensionKey: def?.dimensionKey || 'digital_presence',
    scorecardType: def?.scorecardType || 'Market Presence',
    value: `Own rating ${rating}/5`,
    rating,
    score: rating * 20,
    sourceType: 'User entered',
    sourceUrl: 'https://genzneuralx.com',
    evidenceDescription: 'Internal audit',
    dataStatus,
    lastVerifiedDate: '2026-10-10',
    notes: '',
    createdAt: nowTs,
    updatedAt: nowTs,
  };
}

function makeMonthlyReview(
  month: string,
  scoreAdvantage: number,
  eligibleForSurpass: boolean,
  version = 1
): CompetitorMonthlyReview {
  return {
    id: version > 1 ? `comp_1_${month}_v${version}` : `comp_1_${month}`,
    ownerId: 'user_1',
    companyId: 'user_1',
    competitorId: 'comp_1',
    month,
    version,
    reviewDate: `${month}-28`,
    ownOverallScore: 80,
    competitorOverallScore: 80 - scoreAdvantage,
    scoreAdvantage,
    ownMarketPresenceScore: 80,
    competitorMarketPresenceScore: 80 - scoreAdvantage,
    ownBusinessPerformanceScore: 80,
    competitorBusinessPerformanceScore: 80 - scoreAdvantage,
    comparableCount: 6,
    ownLeadsCount: 5,
    evidenceCoveragePct: 75,
    eligibleForSurpass,
    summary: 'Monthly review snapshot',
    createdAt: nowTs,
  };
}

test('DEFAULT_SCORECARD_WEIGHTS sum strictly to 100 and ratingToScore maps cleanly', () => {
  assert.equal(weightsSum(DEFAULT_SCORECARD_WEIGHTS), 100);
  assert.equal(ratingToScore(0, DEFAULT_RATING_SCORE_MAP), null);
  assert.equal(ratingToScore(1, DEFAULT_RATING_SCORE_MAP), 20);
  assert.equal(ratingToScore(3, DEFAULT_RATING_SCORE_MAP), 60);
  assert.equal(ratingToScore(5, DEFAULT_RATING_SCORE_MAP), 100);
});

test('Unknown is NOT zero and < 5 comparable metrics yields null overall score ("Not enough comparable data")', () => {
  const comp = makeCompetitor();
  const ownSaved = [
    makeOwnSavedMetric('dig_official_website', 4),
    makeOwnSavedMetric('dig_seo_visibility', 4),
    makeOwnSavedMetric('dig_google_business', 4),
  ];
  const ownMetrics = buildOwnMetricsView({
    services: [],
    leads: [],
    clients: [],
    projects: [],
    projectPayments: [],
    otherIncome: [],
    businessExpenses: [],
    teamMembers: [],
    savedOwnMetrics: ownSaved,
    todayStr: '2026-10-15',
  });

  const compMetrics = [
    makeCompMetric('dig_official_website', 3, 'Verified'),
    makeCompMetric('dig_seo_visibility', 3, 'Verified'),
    makeCompMetric('dig_google_business', 2, 'User Entered', ''),
    makeCompMetric('dig_social_channels', 5, 'Estimated', ''), // Estimated must NOT count!
    makeCompMetric('dig_portfolio_cases', 0, 'Unknown', ''), // Unknown must NOT count as 0!
  ];

  const result = computeDualScorecards({
    competitor: comp,
    ownMetrics,
    competitorMetrics: compMetrics,
    todayStr: '2026-10-15',
  });

  assert.equal(result.comparableCount, 3);
  assert.equal(result.hasEnoughComparableData, false);
  assert.equal(result.ownOverallScore, null);
  assert.equal(result.competitorOverallScore, null);
  assert.equal(result.scoreAdvantage, null);
  assert.equal(result.estimatedOnly.length, 1);
  assert.equal(result.estimatedOnly[0].metricKey, 'dig_social_channels');
});

test('Estimated values are excluded from comparable scores and weight re-normalization works when >= 5 comparable', () => {
  const comp = makeCompetitor();
  const ownSaved = [
    makeOwnSavedMetric('dig_official_website', 5), // digital_presence (10) -> 100
    makeOwnSavedMetric('dig_google_business', 4), // customer_reputation (10) -> 80
    makeOwnSavedMetric('dig_portfolio_cases', 5), // portfolio_quality (15) -> 100
    makeOwnSavedMetric('biz_pricing_model', 4), // pricing_value (5) -> 80
    makeOwnSavedMetric('tech_innovation_stack', 5), // technology_innovation (10) -> 100
    makeOwnSavedMetric('dig_seo_visibility', 1), // digital_presence -> comp is Estimated -> MUST BE EXCLUDED!
  ];
  const ownMetrics = buildOwnMetricsView({
    services: [],
    leads: [],
    clients: [],
    projects: [],
    projectPayments: [],
    otherIncome: [],
    businessExpenses: [],
    teamMembers: [],
    savedOwnMetrics: ownSaved,
    todayStr: '2026-10-15',
  });

  const compMetrics = [
    makeCompMetric('dig_official_website', 3, 'Verified'), // 60
    makeCompMetric('dig_google_business', 3, 'Verified'), // 60
    makeCompMetric('dig_portfolio_cases', 3, 'Verified'), // 60
    makeCompMetric('biz_pricing_model', 2, 'User Entered', ''), // 40
    makeCompMetric('tech_innovation_stack', 3, 'Verified'), // 60
    makeCompMetric('dig_seo_visibility', 5, 'Estimated', ''), // 100 but Estimated -> excluded!
  ];

  const result = computeDualScorecards({
    competitor: comp,
    ownMetrics,
    competitorMetrics: compMetrics,
    todayStr: '2026-10-15',
  });

  assert.equal(result.comparableCount, 5);
  assert.equal(result.hasEnoughComparableData, true);
  assert.equal(result.ahead.length, 5);
  assert.equal(result.estimatedOnly.length, 1);

  // Re-normalized weight sum = 10 + 10 + 15 + 5 + 10 = 50
  // Own weighted sum = 100*10 + 80*10 + 100*15 + 80*5 + 100*10 = 4700 => 4700/50 = 94
  // Comp weighted sum = 60*10 + 60*10 + 60*15 + 40*5 + 60*10 = 2900 => 2900/50 = 58
  assert.equal(result.ownOverallScore, 94);
  assert.equal(result.competitorOverallScore, 58);
  assert.equal(result.scoreAdvantage, 36);
});

test('areTwoMonthsConsecutive detects year rollover and rejects non-consecutive gaps', () => {
  assert.equal(areTwoMonthsConsecutive('2025-12', '2026-01'), true);
  assert.equal(areTwoMonthsConsecutive('2026-09', '2026-10'), true);
  assert.equal(areTwoMonthsConsecutive('2026-08', '2026-10'), false);
  assert.equal(areTwoMonthsConsecutive('2026-10', '2026-10'), false);
});

test('evaluateSurpassConditions enforces all 6 conditions strictly', () => {
  const comp = makeCompetitor();
  const ownSaved = [
    makeOwnSavedMetric('dig_official_website', 5),
    makeOwnSavedMetric('dig_google_business', 5),
    makeOwnSavedMetric('dig_portfolio_cases', 5),
    makeOwnSavedMetric('biz_pricing_model', 4),
    makeOwnSavedMetric('tech_innovation_stack', 5),
  ];
  const ownMetrics = buildOwnMetricsView({
    services: [],
    leads: [],
    clients: [],
    projects: [],
    projectPayments: [],
    otherIncome: [],
    businessExpenses: [],
    teamMembers: [],
    savedOwnMetrics: ownSaved,
    todayStr: '2026-10-15',
  });

  // Give enough verified standard metrics so coverage >= 70% (17/24 = 71%)
  const compMetrics: CompetitorMetric[] = [
    makeCompMetric('dig_official_website', 3, 'Verified'),
    makeCompMetric('dig_google_business', 3, 'Verified'),
    makeCompMetric('dig_portfolio_cases', 3, 'Verified'),
    makeCompMetric('biz_pricing_model', 2, 'Verified'),
    makeCompMetric('tech_innovation_stack', 3, 'Verified'),
    // Extra verified standard Phase 5A metrics for coverage >= 70%
    makeCompMetric('svc_website_dev', 0, 'Verified'),
    makeCompMetric('svc_web_apps', 0, 'Verified'),
    makeCompMetric('svc_mobile_apps', 0, 'Verified'),
    makeCompMetric('svc_ai_solutions', 0, 'Verified'),
    makeCompMetric('svc_digital_marketing', 0, 'Verified'),
    makeCompMetric('svc_graphic_design', 0, 'Verified'),
    makeCompMetric('svc_ui_ux', 0, 'Verified'),
    makeCompMetric('svc_custom_software', 0, 'Verified'),
    makeCompMetric('svc_industrial_automation', 0, 'Verified'),
    makeCompMetric('svc_cloud_maintenance', 0, 'Verified'),
    makeCompMetric('dig_social_channels', 0, 'Verified'),
    makeCompMetric('dig_seo_visibility', 0, 'Verified'),
    makeCompMetric('tech_frontend_stack', 0, 'Verified'),
    makeCompMetric('tech_backend_cloud', 0, 'Verified'),
  ];

  const scorecard = computeDualScorecards({
    competitor: comp,
    ownMetrics,
    competitorMetrics: compMetrics,
    todayStr: '2026-10-15',
  });

  assert.ok(scorecard.evidenceCoveragePct >= 70);

  // Case 1: Only 1 monthly review -> fails consecutive months check
  const failOneMonth = evaluateSurpassConditions({
    competitor: comp,
    scorecard,
    monthlyReviews: [makeMonthlyReview('2026-10', 36, true)],
  });
  assert.equal(failOneMonth.canConfirmSurpassed, false);

  // Case 2: Two non-consecutive months -> fails consecutive months check
  const failGapMonths = evaluateSurpassConditions({
    competitor: comp,
    scorecard,
    monthlyReviews: [
      makeMonthlyReview('2026-08', 25, true),
      makeMonthlyReview('2026-10', 36, true),
    ],
  });
  assert.equal(failGapMonths.canConfirmSurpassed, false);

  // Case 3: Two consecutive months with >= 10 pt advantage -> passes all system checks
  const passAll = evaluateSurpassConditions({
    competitor: comp,
    scorecard,
    monthlyReviews: [
      makeMonthlyReview('2026-09', 22, true),
      makeMonthlyReview('2026-10', 36, true),
    ],
  });
  assert.equal(passAll.canConfirmSurpassed, true);

  const stages = computeProgressionStages({
    activeTarget: comp,
    scorecard,
    comparisons: [],
    gaps: [],
    gapLinks: [],
    monthlyReviews: [
      makeMonthlyReview('2026-09', 22, true),
      makeMonthlyReview('2026-10', 36, true),
    ],
    surpassEvaluation: passAll,
  });
  assert.equal(stages[0].completed, true);
  assert.equal(stages[6].completed, true);
  assert.equal(stages[7].completed, true);
});
