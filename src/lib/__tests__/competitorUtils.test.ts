import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp } from 'firebase/firestore';
import { STANDARD_COMPETITOR_METRICS } from '../constants';
import {
  computeCompetitorEvidenceSummary,
  findDuplicateCompetitor,
  formatLastVerifiedLabel,
  getResolvedAcceptedStatus,
  isCompetitorReviewDue,
  isEvidenceStale,
  isMetricEvidenced,
  isValidHttpUrl,
  normalizeWebsiteDomain,
  sanitizePlainText,
} from '../competitorUtils';
import { Competitor, CompetitorMetric } from '../../types';

const nowTs = Timestamp.fromMillis(1700000000000);

function makeCompetitor(overrides: Partial<Competitor> = {}): Competitor {
  return {
    id: 'comp_1',
    ownerId: 'u1',
    companyId: 'u1',
    companyName: 'BrandBee Media',
    website: 'https://brandbeemedia.example.com',
    location: 'Sivakasi, Tamil Nadu',
    marketLevel: 'Local',
    classification: 'Service-Specific Competitor',
    foundedYear: 'Unknown',
    description: 'Local digital agency',
    industriesServed: [],
    primaryServices: [],
    pricingModel: 'Unknown',
    targetAudience: 'Unknown',
    threatLevel: 'Unknown',
    status: 'Candidate',
    verificationStatus: 'Unverified',
    nextReviewDate: '',
    lastVerifiedDate: '',
    notes: '',
    createdAt: nowTs,
    updatedAt: nowTs,
    ...overrides,
  };
}

function makeMetric(key: string, overrides: Partial<CompetitorMetric> = {}): CompetitorMetric {
  return {
    id: `comp_1_${key}`,
    ownerId: 'u1',
    companyId: 'u1',
    competitorId: 'comp_1',
    metricKey: key,
    metricName: key,
    category: 'Services',
    value: 'Offered',
    serviceOfferStatus: 'Offered',
    sourceUrl: 'https://brandbeemedia.example.com/services',
    evidenceDescription: 'Listed on official services page',
    dataStatus: 'Verified',
    lastVerifiedDate: '2026-11-01',
    notes: '',
    createdAt: nowTs,
    updatedAt: nowTs,
    ...overrides,
  };
}

test('computeCompetitorEvidenceSummary calculates exact coverage %, confidence, and missing metrics', () => {
  const comp = makeCompetitor();
  const total = STANDARD_COMPETITOR_METRICS.length; // 24

  // Empty metrics -> 0%, Low, Unverified
  const empty = computeCompetitorEvidenceSummary(comp, [], '2026-11-18');
  assert.equal(empty.evidencedCount, 0);
  assert.equal(empty.totalStandardCount, total);
  assert.equal(empty.coveragePct, 0);
  assert.equal(empty.confidenceLevel, 'Low');
  assert.equal(empty.verificationStatus, 'Unverified');
  assert.equal(empty.missingMetrics.length, total);

  // 10 verified/user-entered metrics with URL + 1 estimated (should NOT count) + 1 user-entered without URL (should NOT count)
  const tenKeys = STANDARD_COMPETITOR_METRICS.slice(0, 10).map((m) =>
    makeMetric(m.key, {
      dataStatus: m.key === 'svc_web_apps' ? 'User Entered' : 'Verified',
      sourceUrl: 'https://example.com/proof',
    })
  );
  const estimatedMetric = makeMetric(STANDARD_COMPETITOR_METRICS[10].key, {
    dataStatus: 'Estimated',
    sourceUrl: 'https://example.com/est',
  });
  const userEnteredNoUrl = makeMetric(STANDARD_COMPETITOR_METRICS[11].key, {
    dataStatus: 'User Entered',
    sourceUrl: '',
  });

  const medium = computeCompetitorEvidenceSummary(
    comp,
    [...tenKeys, estimatedMetric, userEnteredNoUrl],
    '2026-11-18'
  );
  assert.equal(medium.evidencedCount, 10);
  assert.equal(medium.coveragePct, Math.round((10 / total) * 100)); // 42%
  assert.equal(medium.confidenceLevel, 'Medium');
  assert.equal(medium.verificationStatus, 'Partially Verified');
  assert.equal(medium.missingMetrics.length, total - 10);

  // 17 metrics -> 71% -> High confidence & Verified
  const seventeen = STANDARD_COMPETITOR_METRICS.slice(0, 17).map((m) => makeMetric(m.key));
  const high = computeCompetitorEvidenceSummary(comp, seventeen, '2026-11-18');
  assert.equal(high.coveragePct, Math.round((17 / total) * 100)); // 71%
  assert.equal(high.confidenceLevel, 'High');
  assert.equal(high.verificationStatus, 'Verified');
});

test('getResolvedAcceptedStatus requires valid http/https sourceUrl for Verified', () => {
  assert.equal(getResolvedAcceptedStatus('https://example.com/about'), 'Verified');
  assert.equal(getResolvedAcceptedStatus('http://example.com'), 'Verified');
  assert.equal(getResolvedAcceptedStatus(''), 'Estimated');
  assert.equal(getResolvedAcceptedStatus('javascript:alert(1)'), 'Estimated');
});

test('isMetricEvidenced rejects Verified/User Entered without valid source URL', () => {
  assert.equal(isMetricEvidenced({ dataStatus: 'Verified', sourceUrl: 'https://a.com' }), true);
  assert.equal(isMetricEvidenced({ dataStatus: 'User Entered', sourceUrl: 'https://a.com' }), true);
  assert.equal(isMetricEvidenced({ dataStatus: 'User Entered', sourceUrl: '' }), false);
  assert.equal(isMetricEvidenced({ dataStatus: 'Estimated', sourceUrl: 'https://a.com' }), false);
  assert.equal(isMetricEvidenced({ dataStatus: 'Unknown', sourceUrl: '' }), false);
});

test('findDuplicateCompetitor matches normalized names and domains while excluding self', () => {
  const existing = [
    makeCompetitor({ id: 'c1', companyName: 'BrandBee Media', website: 'https://www.brandbee.in/about' }),
    makeCompetitor({ id: 'c2', companyName: 'K7 Digital', website: '' }),
  ];

  assert.equal(
    findDuplicateCompetitor({ companyName: 'BrandBee  Media!', website: '' }, existing)?.id,
    'c1'
  );
  assert.equal(
    findDuplicateCompetitor({ companyName: 'Different Name', website: 'http://brandbee.in' }, existing)?.id,
    'c1'
  );
  assert.equal(
    findDuplicateCompetitor({ companyName: 'BrandBee Media', website: 'https://brandbee.in', excludeId: 'c1' }, existing),
    null
  );
  assert.equal(normalizeWebsiteDomain('https://www.example.com/services'), 'example.com');
});

test('staleness (>90 days), review due checks, and formatting helpers work accurately', () => {
  assert.equal(isEvidenceStale('2026-08-01', '2026-11-18', 90), true); // 109 days
  assert.equal(isEvidenceStale('2026-09-01', '2026-11-18', 90), false); // 78 days
  assert.equal(isEvidenceStale('', '2026-11-18', 90), false);

  assert.equal(isCompetitorReviewDue({ nextReviewDate: '2026-11-18', status: 'Active' }, '2026-11-18'), true);
  assert.equal(isCompetitorReviewDue({ nextReviewDate: '2026-11-10', status: 'Watching' }, '2026-11-18'), true);
  assert.equal(isCompetitorReviewDue({ nextReviewDate: '2026-11-10', status: 'Archived' }, '2026-11-18'), false);

  assert.equal(formatLastVerifiedLabel('2026-11-18'), 'Last verified: 2026-11-18');
  assert.equal(formatLastVerifiedLabel(''), 'Last verified: Never verified');
  assert.equal(isValidHttpUrl('https://genzneuralx.com'), true);
  assert.equal(isValidHttpUrl('ftp://genzneuralx.com'), false);
  assert.equal(sanitizePlainText('<b>Hello</b>  World\nTest', 50), 'Hello World Test');
});
