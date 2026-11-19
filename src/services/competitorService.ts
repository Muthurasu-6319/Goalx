import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  computeCompetitorEvidenceSummary,
  findDuplicateCompetitor,
  getResolvedAcceptedStatus,
  isValidHttpUrl,
  sanitizePlainText,
} from '../lib/competitorUtils';
import {
  SEED_LOCAL_COMPETITORS,
  STANDARD_COMPETITOR_METRICS,
  SUGGESTED_BENCHMARK_COMPETITORS,
} from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getTodayDateString } from '../lib/goalUtils';
import {
  CompetitorFormValues,
  CompetitorMetricEvidenceFormValues,
  PendingFindingEditFormValues,
} from '../lib/validators';
import {
  Competitor,
  CompetitorClassification,
  CompetitorEvidence,
  CompetitorMetric,
  CompetitorPendingFinding,
  CompetitorStatus,
  DataStatus,
  EvidenceCategory,
  MarketLevel,
  ServiceOfferStatus,
} from '../types';

function makeSafeMetricDocId(competitorId: string, metricKey: string): string {
  const cleanKey = metricKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  return `${competitorId}_${cleanKey}`.slice(0, 128);
}

function buildCompetitorCalendarEventId(competitorId: string): string {
  return `comp_rev_${competitorId}`.slice(0, 128);
}

/**
 * One-time seed of 8 suggested local unverified competitor candidates
 * ONLY if the user currently has zero competitors and hasn't seeded before.
 */
export async function ensureSeedLocalCompetitors(uid: string): Promise<void> {
  const storageKey = `goalx_competitors_seeded_${uid}`;
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey) === '1') {
      return;
    }

    const existingSnap = await getDocs(
      query(collection(db, 'competitors'), where('ownerId', '==', uid), limit(1))
    );
    if (!existingSnap.empty) {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, '1');
      }
      return;
    }

    const batch = writeBatch(db);
    for (const item of SEED_LOCAL_COMPETITORS) {
      const ref = doc(collection(db, 'competitors'));
      batch.set(ref, {
        ownerId: uid,
        companyId: uid,
        companyName: item.companyName,
        website: '',
        location: item.location,
        marketLevel: item.marketLevel,
        classification: item.classification,
        foundedYear: 'Unknown',
        description: item.description,
        industriesServed: item.industriesServed,
        primaryServices: item.primaryServices,
        pricingModel: 'Unknown',
        targetAudience: 'Unknown',
        threatLevel: 'Unknown',
        status: 'Candidate',
        verificationStatus: 'Unverified',
        nextReviewDate: '',
        lastVerifiedDate: '',
        notes: item.notes,
        seedKey: item.seedKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, '1');
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'competitors');
  }
}

/**
 * Optional button action: adds suggested Regional / National benchmarks
 * deduplicated against existing competitors. Never auto-added.
 */
export async function addSuggestedBenchmarks(
  uid: string,
  existingCompetitors: Competitor[]
): Promise<number> {
  try {
    const batch = writeBatch(db);
    let added = 0;

    for (const bench of SUGGESTED_BENCHMARK_COMPETITORS) {
      const dup = findDuplicateCompetitor(
        { companyName: bench.companyName },
        existingCompetitors
      );
      if (dup) continue;

      const ref = doc(collection(db, 'competitors'));
      batch.set(ref, {
        ownerId: uid,
        companyId: uid,
        companyName: bench.companyName,
        website: '',
        location: bench.location,
        marketLevel: bench.marketLevel,
        classification: bench.classification,
        foundedYear: 'Unknown',
        description: bench.description,
        industriesServed: bench.industriesServed,
        primaryServices: bench.primaryServices,
        pricingModel: 'Unknown',
        targetAudience: 'Unknown',
        threatLevel: 'Unknown',
        status: 'Candidate',
        verificationStatus: 'Unverified',
        nextReviewDate: '',
        lastVerifiedDate: '',
        notes: bench.notes,
        seedKey: bench.seedKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      added += 1;
    }

    if (added > 0) {
      await batch.commit();
    }
    return added;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'competitors');
  }
}

export async function createCompetitorWithCalendarSync(
  uid: string,
  values: CompetitorFormValues
): Promise<string> {
  try {
    const compRef = doc(collection(db, 'competitors'));
    const batch = writeBatch(db);

    const cleanName = sanitizePlainText(values.companyName, 160);
    const cleanWebsite = values.website.trim().slice(0, 300);

    batch.set(compRef, {
      ownerId: uid,
      companyId: uid,
      companyName: cleanName,
      website: isValidHttpUrl(cleanWebsite) ? cleanWebsite : '',
      location: sanitizePlainText(values.location, 200),
      marketLevel: values.marketLevel,
      classification: values.classification,
      foundedYear: sanitizePlainText(values.foundedYear || 'Unknown', 20) || 'Unknown',
      description: sanitizePlainText(values.description, 1500),
      industriesServed: values.industriesServed.map((s) => sanitizePlainText(s, 160)).filter(Boolean).slice(0, 30),
      primaryServices: values.primaryServices.map((s) => sanitizePlainText(s, 160)).filter(Boolean).slice(0, 30),
      pricingModel: sanitizePlainText(values.pricingModel || 'Unknown', 300) || 'Unknown',
      targetAudience: sanitizePlainText(values.targetAudience || 'Unknown', 300) || 'Unknown',
      threatLevel: values.threatLevel,
      status: values.status,
      verificationStatus: 'Unverified',
      nextReviewDate: values.nextReviewDate,
      lastVerifiedDate: '',
      notes: sanitizePlainText(values.notes, 2000),
      seedKey: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (values.nextReviewDate && values.status !== 'Archived' && values.status !== 'Inactive') {
      const calRef = doc(db, 'calendarEvents', buildCompetitorCalendarEventId(compRef.id));
      batch.set(calRef, {
        ownerId: uid,
        title: `Competitor Review: ${cleanName}`.slice(0, 160),
        eventType: 'Competitor Review',
        date: values.nextReviewDate,
        startTime: '',
        endTime: '',
        allDay: true,
        notes: `${values.marketLevel} · ${values.classification}`.slice(0, 1000),
        reminderMinutes: 60,
        sourceType: 'competitor',
        sourceId: compRef.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return compRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'competitors');
  }
}

export async function updateCompetitorWithCalendarSync(params: {
  uid: string;
  competitor: Competitor;
  values: CompetitorFormValues;
  metricsForCompetitor: CompetitorMetric[];
  evidenceForCompetitor: CompetitorEvidence[];
}): Promise<void> {
  const { uid, competitor, values, metricsForCompetitor, evidenceForCompetitor } = params;
  const todayStr = getTodayDateString();
  const summary = computeCompetitorEvidenceSummary(
    competitor,
    metricsForCompetitor,
    todayStr,
    evidenceForCompetitor
  );

  try {
    const batch = writeBatch(db);
    const cleanName = sanitizePlainText(values.companyName, 160);
    const cleanWebsite = values.website.trim().slice(0, 300);

    batch.update(doc(db, 'competitors', competitor.id), {
      companyName: cleanName,
      website: isValidHttpUrl(cleanWebsite) ? cleanWebsite : '',
      location: sanitizePlainText(values.location, 200),
      marketLevel: values.marketLevel,
      classification: values.classification,
      foundedYear: sanitizePlainText(values.foundedYear || 'Unknown', 20) || 'Unknown',
      description: sanitizePlainText(values.description, 1500),
      industriesServed: values.industriesServed.map((s) => sanitizePlainText(s, 160)).filter(Boolean).slice(0, 30),
      primaryServices: values.primaryServices.map((s) => sanitizePlainText(s, 160)).filter(Boolean).slice(0, 30),
      pricingModel: sanitizePlainText(values.pricingModel || 'Unknown', 300) || 'Unknown',
      targetAudience: sanitizePlainText(values.targetAudience || 'Unknown', 300) || 'Unknown',
      threatLevel: values.threatLevel,
      status: values.status,
      verificationStatus: summary.verificationStatus,
      nextReviewDate: values.nextReviewDate,
      lastVerifiedDate: summary.lastVerifiedDate,
      notes: sanitizePlainText(values.notes, 2000),
      updatedAt: serverTimestamp(),
    });

    const calId = buildCompetitorCalendarEventId(competitor.id);
    const calRef = doc(db, 'calendarEvents', calId);
    const existingCal = await getDocs(
      query(
        collection(db, 'calendarEvents'),
        where('ownerId', '==', uid),
        where('sourceType', '==', 'competitor'),
        where('sourceId', '==', competitor.id),
        limit(1)
      )
    );

    const shouldHaveCal =
      Boolean(values.nextReviewDate) &&
      values.status !== 'Archived' &&
      values.status !== 'Inactive';

    if (shouldHaveCal) {
      if (!existingCal.empty) {
        batch.update(existingCal.docs[0].ref, {
          title: `Competitor Review: ${cleanName}`.slice(0, 160),
          date: values.nextReviewDate,
          notes: `${values.marketLevel} · ${values.classification}`.slice(0, 1000),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(calRef, {
          ownerId: uid,
          title: `Competitor Review: ${cleanName}`.slice(0, 160),
          eventType: 'Competitor Review',
          date: values.nextReviewDate,
          startTime: '',
          endTime: '',
          allDay: true,
          notes: `${values.marketLevel} · ${values.classification}`.slice(0, 1000),
          reminderMinutes: 60,
          sourceType: 'competitor',
          sourceId: competitor.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } else if (!existingCal.empty) {
      batch.delete(existingCal.docs[0].ref);
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `competitors/${competitor.id}`);
  }
}

export async function updateCompetitorStatus(
  competitorId: string,
  status: CompetitorStatus
): Promise<void> {
  try {
    await updateDoc(doc(db, 'competitors', competitorId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `competitors/${competitorId}`);
  }
}

export async function deleteCompetitorCascade(params: {
  uid: string;
  competitorId: string;
  metrics: CompetitorMetric[];
  evidence: CompetitorEvidence[];
}): Promise<void> {
  const { uid, competitorId, metrics, evidence } = params;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'competitors', competitorId));

    for (const m of metrics) {
      if (m.competitorId === competitorId) {
        batch.delete(doc(db, 'competitorMetrics', m.id));
      }
    }
    for (const e of evidence) {
      if (e.competitorId === competitorId) {
        batch.delete(doc(db, 'competitorEvidence', e.id));
      }
    }

    const calSnap = await getDocs(
      query(
        collection(db, 'calendarEvents'),
        where('ownerId', '==', uid),
        where('sourceType', '==', 'competitor'),
        where('sourceId', '==', competitorId),
        limit(5)
      )
    );
    for (const c of calSnap.docs) {
      batch.delete(c.ref);
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `competitors/${competitorId}`);
  }
}

/**
 * Saves or updates a tracked metric (`competitorMetrics`) and appends an evidence entry
 * (`competitorEvidence`), while recalculating the parent competitor's verificationStatus
 * and lastVerifiedDate.
 */
export async function saveCompetitorMetricAndEvidence(params: {
  uid: string;
  competitor: Competitor;
  values: CompetitorMetricEvidenceFormValues;
  existingMetrics: CompetitorMetric[];
  existingEvidence: CompetitorEvidence[];
}): Promise<void> {
  const { uid, competitor, values, existingMetrics, existingEvidence } = params;
  const cleanUrl = values.sourceUrl.trim().slice(0, 500);

  if (values.dataStatus === 'Verified' && !isValidHttpUrl(cleanUrl)) {
    throw new Error('Verified data status requires a valid http:// or https:// source URL.');
  }

  const metricId = makeSafeMetricDocId(competitor.id, values.metricKey);
  const existingMetric = existingMetrics.find((m) => m.id === metricId);
  const metricRef = doc(db, 'competitorMetrics', metricId);
  const evidenceRef = doc(collection(db, 'competitorEvidence'));

  const cleanValue = sanitizePlainText(values.value, 500) || 'Unknown';
  const cleanDesc = sanitizePlainText(values.evidenceDescription, 1500);
  const cleanNotes = sanitizePlainText(values.notes, 1000);
  const cleanMetricName = sanitizePlainText(values.metricName, 160);

  const syntheticMetric: CompetitorMetric = {
    id: metricId,
    ownerId: uid,
    companyId: uid,
    competitorId: competitor.id,
    metricKey: values.metricKey,
    metricName: cleanMetricName,
    category: values.category,
    value: cleanValue,
    serviceOfferStatus: values.serviceOfferStatus,
    sourceUrl: cleanUrl,
    evidenceDescription: cleanDesc,
    dataStatus: values.dataStatus,
    lastVerifiedDate: values.lastVerifiedDate,
    notes: cleanNotes,
    createdAt: competitor.createdAt,
    updatedAt: competitor.updatedAt,
  };

  const mergedMetrics = existingMetrics.filter((m) => m.id !== metricId).concat(syntheticMetric);
  const nextSummary = computeCompetitorEvidenceSummary(
    competitor,
    mergedMetrics,
    getTodayDateString(),
    existingEvidence
  );

  try {
    const batch = writeBatch(db);

    if (existingMetric) {
      batch.update(metricRef, {
        metricName: cleanMetricName,
        category: values.category,
        value: cleanValue,
        serviceOfferStatus: values.serviceOfferStatus,
        sourceUrl: cleanUrl,
        evidenceDescription: cleanDesc,
        dataStatus: values.dataStatus,
        lastVerifiedDate: values.lastVerifiedDate,
        notes: cleanNotes,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(metricRef, {
        ownerId: uid,
        companyId: uid,
        competitorId: competitor.id,
        metricKey: values.metricKey,
        metricName: cleanMetricName,
        category: values.category,
        value: cleanValue,
        serviceOfferStatus: values.serviceOfferStatus,
        sourceUrl: cleanUrl,
        evidenceDescription: cleanDesc,
        dataStatus: values.dataStatus,
        lastVerifiedDate: values.lastVerifiedDate,
        notes: cleanNotes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    batch.set(evidenceRef, {
      ownerId: uid,
      companyId: uid,
      competitorId: competitor.id,
      metricId,
      metricKey: values.metricKey,
      category: values.category,
      metricName: cleanMetricName,
      value: cleanValue,
      sourceUrl: cleanUrl,
      sourceTitle: cleanUrl ? new URL(cleanUrl).hostname.replace(/^www\./, '') : 'Manual Note',
      evidenceDescription: cleanDesc,
      dataStatus: values.dataStatus,
      lastVerifiedDate: values.lastVerifiedDate,
      origin: 'Manual',
      notes: cleanNotes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'competitors', competitor.id), {
      verificationStatus: nextSummary.verificationStatus,
      lastVerifiedDate: nextSummary.lastVerifiedDate,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `competitorMetrics/${metricId}`);
  }
}

export async function deleteCompetitorEvidence(evidenceId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'competitorEvidence', evidenceId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `competitorEvidence/${evidenceId}`);
  }
}

export async function deleteCompetitorMetric(metricId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'competitorMetrics', metricId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `competitorMetrics/${metricId}`);
  }
}

export async function logManualResearchSession(params: {
  uid: string;
  competitorId: string;
  targetLabel: string;
  targetUrl?: string;
  summary: string;
}): Promise<void> {
  try {
    const ref = doc(collection(db, 'competitorResearchHistory'));
    const batch = writeBatch(db);
    batch.set(ref, {
      ownerId: params.uid,
      companyId: params.uid,
      competitorId: params.competitorId,
      action: 'manual_research',
      targetLabel: sanitizePlainText(params.targetLabel, 200),
      targetUrl: params.targetUrl && isValidHttpUrl(params.targetUrl) ? params.targetUrl.slice(0, 500) : '',
      runDate: getTodayDateString(),
      status: 'Completed',
      groundingUsed: false,
      summary: sanitizePlainText(params.summary, 2000),
      searchQueries: [],
      sourceUrls: [],
      findingsCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      errorMessage: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'competitorResearchHistory');
  }
}

/**
 * Accept or Edit & Accept a metric finding from the AI Pending Review queue.
 * - Accept: becomes 'Verified' if valid sourceUrl exists, otherwise 'Estimated'.
 * - Edit: uses user-edited value, sourceUrl, status (enforcing Verified requires URL).
 */
export async function reviewMetricPendingFinding(params: {
  uid: string;
  competitor: Competitor;
  finding: CompetitorPendingFinding;
  existingMetrics: CompetitorMetric[];
  existingEvidence: CompetitorEvidence[];
  edited?: PendingFindingEditFormValues;
}): Promise<DataStatus> {
  const { uid, competitor, finding, existingMetrics, existingEvidence, edited } = params;
  const todayStr = getTodayDateString();
  const isEdited = Boolean(edited);

  const finalValue = sanitizePlainText(edited ? edited.value : finding.proposedValue, 500) || 'Unknown';
  const finalSourceUrl = (edited ? edited.sourceUrl : finding.sourceUrl).trim().slice(0, 500);
  const finalDesc = sanitizePlainText(
    edited ? edited.evidenceDescription : finding.evidenceDescription,
    1500
  );
  const finalNotes = sanitizePlainText(
    edited ? edited.notes : finding.confidenceNote || '',
    1000
  );
  const finalStatus: DataStatus = edited
    ? edited.dataStatus
    : getResolvedAcceptedStatus(finalSourceUrl);

  if (finalStatus === 'Verified' && !isValidHttpUrl(finalSourceUrl)) {
    throw new Error('Verified status requires a valid http:// or https:// source URL.');
  }

  const category: EvidenceCategory =
    finding.category === 'Candidate Discovery' ? 'Business Evidence' : finding.category;

  const matchedStandard = STANDARD_COMPETITOR_METRICS.find((m) => m.key === finding.metricKey);
  const metricKey = matchedStandard?.key ?? finding.metricKey;
  const metricName = sanitizePlainText(matchedStandard?.name ?? finding.metricName, 160);
  const metricId = makeSafeMetricDocId(competitor.id, metricKey);
  const existingMetric = existingMetrics.find((m) => m.id === metricId);

  let serviceOfferStatus: ServiceOfferStatus = existingMetric?.serviceOfferStatus ?? '';
  if (category === 'Services') {
    const lowerVal = finalValue.toLowerCase();
    if (lowerVal.includes('not offered') || lowerVal === 'no') serviceOfferStatus = 'Not Offered';
    else if (lowerVal.includes('partial')) serviceOfferStatus = 'Partially Offered';
    else if (lowerVal === 'unknown') serviceOfferStatus = 'Unknown';
    else serviceOfferStatus = 'Offered';
  }

  const metricRef = doc(db, 'competitorMetrics', metricId);
  const evidenceRef = doc(collection(db, 'competitorEvidence'));
  const findingRef = doc(db, 'competitorPendingFindings', finding.id);
  const runRef = doc(db, 'competitorResearchHistory', finding.researchRunId);

  const syntheticMetric: CompetitorMetric = {
    id: metricId,
    ownerId: uid,
    companyId: uid,
    competitorId: competitor.id,
    metricKey,
    metricName,
    category,
    value: finalValue,
    serviceOfferStatus,
    sourceUrl: finalSourceUrl,
    evidenceDescription: finalDesc,
    dataStatus: finalStatus,
    lastVerifiedDate: todayStr,
    notes: finalNotes,
    createdAt: competitor.createdAt,
    updatedAt: competitor.updatedAt,
  };

  const mergedMetrics = existingMetrics.filter((m) => m.id !== metricId).concat(syntheticMetric);
  const nextSummary = computeCompetitorEvidenceSummary(
    competitor,
    mergedMetrics,
    todayStr,
    existingEvidence
  );

  try {
    const batch = writeBatch(db);

    if (existingMetric) {
      batch.update(metricRef, {
        metricName,
        category,
        value: finalValue,
        serviceOfferStatus,
        sourceUrl: finalSourceUrl,
        evidenceDescription: finalDesc,
        dataStatus: finalStatus,
        lastVerifiedDate: todayStr,
        notes: finalNotes,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(metricRef, {
        ownerId: uid,
        companyId: uid,
        competitorId: competitor.id,
        metricKey,
        metricName,
        category,
        value: finalValue,
        serviceOfferStatus,
        sourceUrl: finalSourceUrl,
        evidenceDescription: finalDesc,
        dataStatus: finalStatus,
        lastVerifiedDate: todayStr,
        notes: finalNotes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    batch.set(evidenceRef, {
      ownerId: uid,
      companyId: uid,
      competitorId: competitor.id,
      metricId,
      metricKey,
      category,
      metricName,
      value: finalValue,
      sourceUrl: finalSourceUrl,
      sourceTitle: sanitizePlainText(finding.sourceTitle || 'AI Research Finding', 200),
      evidenceDescription: finalDesc,
      dataStatus: finalStatus,
      lastVerifiedDate: todayStr,
      origin: isEdited ? 'AI Edited' : 'AI Accepted',
      notes: finalNotes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(findingRef, {
      decision: isEdited ? 'Edited' : 'Accepted',
      reviewedAt: new Date().toISOString(),
      reviewedValue: finalValue,
      reviewedDataStatus: finalStatus,
      reviewedNotes: finalNotes,
      acceptedEvidenceId: evidenceRef.id,
      updatedAt: serverTimestamp(),
    });

    batch.update(runRef, {
      acceptedCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'competitors', competitor.id), {
      verificationStatus: nextSummary.verificationStatus,
      lastVerifiedDate: nextSummary.lastVerifiedDate,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return finalStatus;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `competitorPendingFindings/${finding.id}`);
  }
}

/**
 * Accept a discovered competitor candidate from AI discovery Pending Review queue.
 */
export async function acceptDiscoveryCandidateFinding(params: {
  uid: string;
  finding: CompetitorPendingFinding;
  existingCompetitors: Competitor[];
  promoteStatus?: CompetitorStatus;
}): Promise<string> {
  const { uid, finding, existingCompetitors, promoteStatus = 'Candidate' } = params;
  const candidateName = sanitizePlainText(finding.candidateName || finding.metricName, 160);
  const candidateUrl = isValidHttpUrl(finding.sourceUrl) ? finding.sourceUrl : '';

  const duplicate = findDuplicateCompetitor(
    { companyName: candidateName, website: candidateUrl },
    existingCompetitors
  );
  if (duplicate) {
    throw new Error(`"${duplicate.companyName}" already exists in your tracked competitors.`);
  }

  const todayStr = getTodayDateString();
  const marketLevel: MarketLevel =
    finding.candidateMarketLevel === 'Tamil Nadu' || finding.candidateMarketLevel === 'India'
      ? finding.candidateMarketLevel
      : 'Local';

  const classification: CompetitorClassification =
    finding.candidateClassification || 'Direct Competitor';

  try {
    const batch = writeBatch(db);
    const compRef = doc(collection(db, 'competitors'));

    batch.set(compRef, {
      ownerId: uid,
      companyId: uid,
      companyName: candidateName,
      website: candidateUrl.slice(0, 300),
      location: sanitizePlainText(finding.candidateLocation, 200),
      marketLevel,
      classification,
      foundedYear: 'Unknown',
      description: sanitizePlainText(finding.evidenceDescription, 1500),
      industriesServed: [],
      primaryServices: (finding.candidateServices ?? []).slice(0, 30),
      pricingModel: 'Unknown',
      targetAudience: 'Unknown',
      threatLevel: 'Unknown',
      status: promoteStatus,
      verificationStatus: candidateUrl ? 'Partially Verified' : 'Unverified',
      nextReviewDate: '',
      lastVerifiedDate: candidateUrl ? todayStr : '',
      notes: sanitizePlainText(
        `Added from AI-assisted discovery. ${finding.confidenceNote || ''}`,
        2000
      ),
      seedKey: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'competitorPendingFindings', finding.id), {
      decision: 'Accepted',
      reviewedAt: new Date().toISOString(),
      reviewedValue: candidateName,
      reviewedDataStatus: getResolvedAcceptedStatus(candidateUrl),
      reviewedNotes: `Added as ${promoteStatus}`,
      createdCandidateId: compRef.id,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'competitorResearchHistory', finding.researchRunId), {
      acceptedCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return compRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `competitorPendingFindings/${finding.id}`);
  }
}

export async function rejectPendingFinding(
  finding: CompetitorPendingFinding,
  reason = ''
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'competitorPendingFindings', finding.id), {
      decision: 'Rejected',
      reviewedAt: new Date().toISOString(),
      reviewedNotes: sanitizePlainText(reason || 'Rejected by user during verification review', 1000),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'competitorResearchHistory', finding.researchRunId), {
      rejectedCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `competitorPendingFindings/${finding.id}`);
  }
}
