import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  CompetitorScorecardResult,
  ratingToScore,
  roundScore,
  weightsSum,
} from '../lib/competitorScoringUtils';
import {
  computeCompetitorEvidenceSummary,
  isValidHttpUrl,
  sanitizePlainText,
} from '../lib/competitorUtils';
import {
  DEFAULT_RATING_SCORE_MAP,
  DEFAULT_SCORECARD_WEIGHTS,
  SCORECARD_METRIC_DEFS,
  STANDARD_COMPETITOR_METRICS,
  SURPASS_REQUIRED_COMPARABLE,
  SURPASS_REQUIRED_COVERAGE_PCT,
  SURPASS_REQUIRED_MONTHS,
} from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getTodayDateString } from '../lib/goalUtils';
import { CompetitiveGapFormValues, OwnMetricFormValues, ScoreConfigFormValues } from '../lib/validators';
import {
  CompetitiveGap,
  CompetitiveGoalLink,
  Competitor,
  CompetitorEvidence,
  CompetitorMetric,
  CompetitorMonthlyReview,
  CompetitorScoreConfig,
  DataStatus,
  EvidenceCategory,
  GapActionOrigin,
  OwnMetric,
  RatingScoreMap,
  TaskStatus,
} from '../types';

export function buildOwnMetricDocId(uid: string, metricKey: string): string {
  return `${uid}__${metricKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 120);
}

export function buildCompetitorMetricDocId(competitorId: string, metricKey: string): string {
  return `${competitorId}__${metricKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 120);
}

export function buildGapCalendarDocId(gapId: string): string {
  return `gapcal_${gapId}`.slice(0, 120);
}

export async function upsertOwnMetric(params: {
  uid: string;
  values: OwnMetricFormValues;
  existingOwnMetrics: OwnMetric[];
  ratingScoreMap?: RatingScoreMap;
}): Promise<void> {
  const { uid, values, existingOwnMetrics, ratingScoreMap = DEFAULT_RATING_SCORE_MAP } = params;
  const cleanUrl = values.sourceUrl.trim().slice(0, 500);
  if (values.dataStatus === 'Verified' && !isValidHttpUrl(cleanUrl)) {
    throw new Error('Verified status requires a valid http:// or https:// source URL.');
  }

  const docId = buildOwnMetricDocId(uid, values.metricKey);
  const existing = existingOwnMetrics.find((m) => m.id === docId || m.metricKey === values.metricKey);
  const scoreVal = ratingToScore(values.rating, ratingScoreMap) ?? 0;

  const payload = {
    ownerId: uid,
    companyId: uid,
    metricKey: values.metricKey,
    metricName: sanitizePlainText(values.metricName, 160),
    dimensionKey: values.dimensionKey,
    scorecardType: values.scorecardType,
    value: sanitizePlainText(values.value, 500) || 'Unknown',
    rating: values.dataStatus === 'Unknown' ? 0 : values.rating,
    score: values.dataStatus === 'Unknown' ? 0 : scoreVal,
    sourceType: 'User entered' as const,
    sourceUrl: cleanUrl,
    evidenceDescription: sanitizePlainText(values.evidenceDescription, 1500),
    dataStatus: values.dataStatus,
    lastVerifiedDate: values.lastVerifiedDate || getTodayDateString(),
    notes: sanitizePlainText(values.notes, 1000),
    updatedAt: serverTimestamp(),
  };

  try {
    if (existing) {
      await updateDoc(doc(db, 'ownMetrics', existing.id), {
        metricName: payload.metricName,
        dimensionKey: payload.dimensionKey,
        scorecardType: payload.scorecardType,
        value: payload.value,
        rating: payload.rating,
        score: payload.score,
        sourceType: payload.sourceType,
        sourceUrl: payload.sourceUrl,
        evidenceDescription: payload.evidenceDescription,
        dataStatus: payload.dataStatus,
        lastVerifiedDate: payload.lastVerifiedDate,
        notes: payload.notes,
        updatedAt: serverTimestamp(),
      });
    } else {
      const batch = writeBatch(db);
      batch.set(doc(db, 'ownMetrics', docId), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `ownMetrics/${docId}`);
  }
}

export async function saveCompetitorScoreConfig(params: {
  uid: string;
  values: ScoreConfigFormValues;
  existingConfig: CompetitorScoreConfig | null;
}): Promise<void> {
  const { uid, values, existingConfig } = params;
  if (weightsSum(values.weights) !== 100) {
    throw new Error('Dimension weights must sum strictly to 100.');
  }

  const ref = doc(db, 'competitorScoreConfigs', uid);
  try {
    if (existingConfig) {
      await updateDoc(ref, {
        weights: values.weights,
        ratingScoreMap: values.ratingScoreMap,
        minComparableMetrics: existingConfig.minComparableMetrics || SURPASS_REQUIRED_COMPARABLE,
        minScoreAdvantage: existingConfig.minScoreAdvantage || 10,
        minEvidenceCoveragePct: existingConfig.minEvidenceCoveragePct || SURPASS_REQUIRED_COVERAGE_PCT,
        minConsecutiveMonths: existingConfig.minConsecutiveMonths || SURPASS_REQUIRED_MONTHS,
        updatedAt: serverTimestamp(),
      });
    } else {
      const batch = writeBatch(db);
      batch.set(ref, {
        ownerId: uid,
        companyId: uid,
        weights: values.weights,
        ratingScoreMap: values.ratingScoreMap,
        minComparableMetrics: SURPASS_REQUIRED_COMPARABLE,
        minScoreAdvantage: 10,
        minEvidenceCoveragePct: SURPASS_REQUIRED_COVERAGE_PCT,
        minConsecutiveMonths: SURPASS_REQUIRED_MONTHS,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `competitorScoreConfigs/${uid}`);
  }
}

export async function resetCompetitorScoreConfig(
  uid: string,
  existingConfig: CompetitorScoreConfig | null
): Promise<void> {
  await saveCompetitorScoreConfig({
    uid,
    existingConfig,
    values: {
      weights: DEFAULT_SCORECARD_WEIGHTS,
      ratingScoreMap: DEFAULT_RATING_SCORE_MAP,
    },
  });
}

export async function upsertCompetitorMetricRating(params: {
  uid: string;
  competitor: Competitor;
  metricKey: string;
  metricName: string;
  rating: number;
  value: string;
  dataStatus: DataStatus;
  sourceUrl: string;
  evidenceDescription: string;
  existingMetrics: CompetitorMetric[];
  existingEvidence: CompetitorEvidence[];
}): Promise<void> {
  const {
    uid,
    competitor,
    metricKey,
    metricName,
    rating,
    value,
    dataStatus,
    sourceUrl,
    evidenceDescription,
    existingMetrics,
    existingEvidence,
  } = params;

  const cleanUrl = sourceUrl.trim().slice(0, 500);
  if (dataStatus === 'Verified' && !isValidHttpUrl(cleanUrl)) {
    throw new Error('Verified status requires a valid http:// or https:// source URL.');
  }

  const metricId = buildCompetitorMetricDocId(competitor.id, metricKey);
  const existing = existingMetrics.find((m) => m.id === metricId || (m.competitorId === competitor.id && m.metricKey === metricKey));
  const scorecardDef = SCORECARD_METRIC_DEFS.find((d) => d.metricKey === metricKey);
  const standardDef = STANDARD_COMPETITOR_METRICS.find((d) => d.key === metricKey);

  const category: EvidenceCategory =
    existing?.category ??
    standardDef?.category ??
    (scorecardDef?.scorecardType === 'Market Presence' ? 'Digital Presence' : 'Business Evidence');

  const todayStr = getTodayDateString();
  const cleanValue = sanitizePlainText(value || `Rated ${rating}/5`, 500) || 'Unknown';
  const cleanDesc = sanitizePlainText(
    evidenceDescription || existing?.evidenceDescription || 'Scorecard rating evaluation',
    1500
  );
  const finalRating = dataStatus === 'Unknown' ? 0 : Math.min(5, Math.max(0, rating));
  const scorecardGroup = scorecardDef?.scorecardType ?? existing?.scorecardGroup ?? '';

  const syntheticMetric: CompetitorMetric = {
    id: metricId,
    ownerId: uid,
    companyId: uid,
    competitorId: competitor.id,
    metricKey,
    metricName: sanitizePlainText(metricName, 160),
    category,
    value: cleanValue,
    serviceOfferStatus: existing?.serviceOfferStatus ?? '',
    rating: finalRating,
    scorecardGroup,
    sourceUrl: cleanUrl,
    evidenceDescription: cleanDesc,
    dataStatus,
    lastVerifiedDate: dataStatus === 'Unknown' ? '' : todayStr,
    notes: existing?.notes ?? '',
    createdAt: competitor.createdAt,
    updatedAt: competitor.updatedAt,
  };

  const mergedMetrics = existingMetrics
    .filter((m) => m.competitorId === competitor.id && m.id !== metricId)
    .concat(syntheticMetric);
  const nextSummary = computeCompetitorEvidenceSummary(
    competitor,
    mergedMetrics,
    todayStr,
    existingEvidence.filter((e) => e.competitorId === competitor.id)
  );

  try {
    const batch = writeBatch(db);
    const ref = doc(db, 'competitorMetrics', existing?.id ?? metricId);
    if (existing) {
      batch.update(ref, {
        metricName: syntheticMetric.metricName,
        category,
        value: cleanValue,
        serviceOfferStatus: syntheticMetric.serviceOfferStatus,
        rating: finalRating,
        scorecardGroup,
        sourceUrl: cleanUrl,
        evidenceDescription: cleanDesc,
        dataStatus,
        lastVerifiedDate: syntheticMetric.lastVerifiedDate,
        notes: syntheticMetric.notes,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(ref, {
        ownerId: uid,
        companyId: uid,
        competitorId: competitor.id,
        metricKey,
        metricName: syntheticMetric.metricName,
        category,
        value: cleanValue,
        serviceOfferStatus: '',
        rating: finalRating,
        scorecardGroup,
        sourceUrl: cleanUrl,
        evidenceDescription: cleanDesc,
        dataStatus,
        lastVerifiedDate: syntheticMetric.lastVerifiedDate,
        notes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

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

export async function setActiveCompetitorTarget(params: {
  targetCompetitorId: string;
  allCompetitors: Competitor[];
}): Promise<void> {
  const { targetCompetitorId, allCompetitors } = params;
  const target = allCompetitors.find((c) => c.id === targetCompetitorId);
  if (!target) throw new Error('Selected competitor not found.');
  if (target.status === 'Surpassed') {
    throw new Error('Surpassed competitors cannot be re-selected as Active Target.');
  }

  try {
    const batch = writeBatch(db);
    for (const c of allCompetitors) {
      if (c.id === targetCompetitorId) {
        const nextStatus =
          c.status === 'Candidate' || c.status === 'Watching' ? 'Active' : c.status;
        batch.update(doc(db, 'competitors', c.id), {
          isActiveTarget: true,
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      } else if (c.isActiveTarget) {
        batch.update(doc(db, 'competitors', c.id), {
          isActiveTarget: false,
          updatedAt: serverTimestamp(),
        });
      }
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `competitors/${targetCompetitorId}`);
  }
}

export async function saveComparisonSnapshot(params: {
  uid: string;
  scorecard: CompetitorScorecardResult;
  gapsClosedCount: number;
  notes?: string;
}): Promise<string> {
  const { uid, scorecard, gapsClosedCount, notes = '' } = params;
  const month = getTodayDateString().slice(0, 7);
  try {
    const ref = await addDoc(collection(db, 'competitorComparisons'), {
      ownerId: uid,
      companyId: uid,
      competitorId: scorecard.competitorId,
      competitorName: sanitizePlainText(scorecard.competitorName, 160),
      snapshotKind: 'comparison',
      month,
      ownOverallScore: scorecard.ownOverallScore ?? 0,
      competitorOverallScore: scorecard.competitorOverallScore ?? 0,
      ownMarketPresenceScore: scorecard.ownMarketPresenceScore ?? 0,
      competitorMarketPresenceScore: scorecard.competitorMarketPresenceScore ?? 0,
      ownBusinessPerformanceScore: scorecard.ownBusinessPerformanceScore ?? 0,
      competitorBusinessPerformanceScore: scorecard.competitorBusinessPerformanceScore ?? 0,
      comparableCount: scorecard.comparableCount,
      ownLeadCount: scorecard.ahead.length,
      competitorLeadCount: scorecard.behind.length,
      equalCount: scorecard.equal.length,
      missingCount: scorecard.missing.length + scorecard.estimatedOnly.length,
      scoreAdvantage: scorecard.scoreAdvantage ?? 0,
      aheadMetrics: scorecard.ahead.map((r) => r.metricName).slice(0, 30),
      behindMetrics: scorecard.behind.map((r) => r.metricName).slice(0, 30),
      equalMetrics: scorecard.equal.map((r) => r.metricName).slice(0, 30),
      missingMetrics: scorecard.missing.map((r) => r.metricName).slice(0, 30),
      gapsClosedCount,
      notes: sanitizePlainText(notes, 1500),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'competitorComparisons');
  }
}

export async function saveMonthlyReviewSnapshot(params: {
  uid: string;
  competitor: Competitor;
  month: string; // YYYY-MM
  reviewDate: string; // YYYY-MM-DD
  summary: string;
  scorecard: CompetitorScorecardResult;
  existingReviews: CompetitorMonthlyReview[];
  minScoreAdvantage?: number;
  minComparable?: number;
  minCoveragePct?: number;
}): Promise<{ reviewId: string; version: number }> {
  const {
    uid,
    competitor,
    month,
    reviewDate,
    summary,
    scorecard,
    existingReviews,
    minScoreAdvantage = 10,
    minComparable = 5,
    minCoveragePct = 70,
  } = params;

  const sameMonthReviews = existingReviews.filter(
    (r) => r.competitorId === competitor.id && r.month === month
  );
  const maxVersion = sameMonthReviews.reduce((max, r) => Math.max(max, r.version || 1), 0);
  const nextVersion = maxVersion + 1;
  const reviewId =
    nextVersion === 1 ? `${competitor.id}_${month}` : `${competitor.id}_${month}_v${nextVersion}`;

  const ownOverall = scorecard.ownOverallScore ?? 0;
  const compOverall = scorecard.competitorOverallScore ?? 0;
  const advantage = scorecard.scoreAdvantage ?? roundScore(ownOverall - compOverall);
  const eligible =
    scorecard.hasEnoughComparableData &&
    scorecard.comparableCount >= minComparable &&
    scorecard.ahead.length >= 4 &&
    advantage >= minScoreAdvantage &&
    scorecard.evidenceCoveragePct >= minCoveragePct;

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'competitorMonthlyReviews', reviewId), {
      ownerId: uid,
      companyId: uid,
      competitorId: competitor.id,
      month,
      version: nextVersion,
      reviewDate,
      ownOverallScore: ownOverall,
      competitorOverallScore: compOverall,
      scoreAdvantage: advantage,
      ownMarketPresenceScore: scorecard.ownMarketPresenceScore ?? 0,
      competitorMarketPresenceScore: scorecard.competitorMarketPresenceScore ?? 0,
      ownBusinessPerformanceScore: scorecard.ownBusinessPerformanceScore ?? 0,
      competitorBusinessPerformanceScore: scorecard.competitorBusinessPerformanceScore ?? 0,
      comparableCount: scorecard.comparableCount,
      ownLeadsCount: scorecard.ahead.length,
      evidenceCoveragePct: scorecard.evidenceCoveragePct,
      eligibleForSurpass: eligible,
      summary: sanitizePlainText(summary, 1500),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return { reviewId, version: nextVersion };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `competitorMonthlyReviews/${reviewId}`);
  }
}

export async function createCompetitiveGap(params: {
  uid: string;
  values: CompetitiveGapFormValues;
  suggestedActionOrigin: GapActionOrigin;
  templateKey?: string;
  evidenceIds?: string[];
}): Promise<string> {
  const { uid, values, suggestedActionOrigin, templateKey = '', evidenceIds = [] } = params;
  const gapRef = doc(collection(db, 'competitiveGaps'));
  const calId = values.deadline ? buildGapCalendarDocId(gapRef.id) : '';
  const cleanTitle = sanitizePlainText(values.title, 160);

  try {
    const batch = writeBatch(db);
    batch.set(gapRef, {
      ownerId: uid,
      companyId: uid,
      title: cleanTitle,
      description: sanitizePlainText(values.description, 1500),
      linkedCompetitorIds: values.linkedCompetitorIds.slice(0, 20),
      linkedMetricKey: sanitizePlainText(values.linkedMetricKey, 80),
      evidenceIds: evidenceIds.slice(0, 20),
      businessImpact: values.businessImpact,
      priority: values.priority,
      estimatedEffort: values.estimatedEffort,
      suggestedAction: sanitizePlainText(values.suggestedAction, 1500),
      suggestedActionOrigin,
      deadline: values.deadline,
      status: values.status,
      progressPct: values.status === 'Done' ? 100 : values.progressPct,
      convertedGoalId: '',
      convertedTaskId: '',
      calendarEventId: calId,
      templateKey: sanitizePlainText(templateKey, 80),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (values.deadline && calId) {
      batch.set(doc(db, 'calendarEvents', calId), {
        ownerId: uid,
        title: `Gap Deadline: ${cleanTitle}`.slice(0, 160),
        eventType: 'Gap Deadline',
        date: values.deadline,
        startTime: '',
        endTime: '',
        allDay: true,
        notes: sanitizePlainText(values.suggestedAction || values.description, 1000),
        reminderMinutes: 60,
        sourceType: 'competitiveGap',
        sourceId: gapRef.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return gapRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `competitiveGaps/${gapRef.id}`);
  }
}

export async function updateCompetitiveGap(params: {
  uid: string;
  gap: CompetitiveGap;
  values: CompetitiveGapFormValues;
  suggestedActionOrigin?: GapActionOrigin;
}): Promise<void> {
  const { uid, gap, values, suggestedActionOrigin } = params;
  const cleanTitle = sanitizePlainText(values.title, 160);
  const calId = buildGapCalendarDocId(gap.id);
  const calRef = doc(db, 'calendarEvents', calId);

  const shouldHaveCalendar = Boolean(values.deadline) && values.status !== 'Dismissed';

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'competitiveGaps', gap.id), {
      title: cleanTitle,
      description: sanitizePlainText(values.description, 1500),
      linkedCompetitorIds: values.linkedCompetitorIds.slice(0, 20),
      linkedMetricKey: sanitizePlainText(values.linkedMetricKey, 80),
      evidenceIds: gap.evidenceIds ?? [],
      businessImpact: values.businessImpact,
      priority: values.priority,
      estimatedEffort: values.estimatedEffort,
      suggestedAction: sanitizePlainText(values.suggestedAction, 1500),
      suggestedActionOrigin: suggestedActionOrigin ?? gap.suggestedActionOrigin,
      deadline: values.deadline,
      status: values.status,
      progressPct: values.status === 'Done' ? 100 : values.progressPct,
      calendarEventId: shouldHaveCalendar ? calId : '',
      updatedAt: serverTimestamp(),
    });

    if (shouldHaveCalendar) {
      batch.set(
        calRef,
        {
          ownerId: uid,
          title: `Gap Deadline: ${cleanTitle}`.slice(0, 160),
          eventType: 'Gap Deadline',
          date: values.deadline,
          startTime: '',
          endTime: '',
          allDay: true,
          notes: sanitizePlainText(values.suggestedAction || values.description, 1000),
          reminderMinutes: 60,
          sourceType: 'competitiveGap',
          sourceId: gap.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      );
    } else if (gap.calendarEventId) {
      batch.delete(doc(db, 'calendarEvents', gap.calendarEventId));
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `competitiveGaps/${gap.id}`);
  }
}

export async function deleteCompetitiveGap(gap: CompetitiveGap): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'competitiveGaps', gap.id));
    if (gap.calendarEventId) {
      batch.delete(doc(db, 'calendarEvents', gap.calendarEventId));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `competitiveGaps/${gap.id}`);
  }
}

export async function convertGapToGoal(params: {
  uid: string;
  gap: CompetitiveGap;
  existingLinks: CompetitiveGoalLink[];
}): Promise<string> {
  const { uid, gap, existingLinks } = params;
  const linkId = `${gap.id}_goal`;
  if (gap.convertedGoalId || existingLinks.some((l) => l.id === linkId)) {
    throw new Error('This gap has already been converted to a Goal.');
  }

  const todayStr = getTodayDateString();
  const goalRef = doc(collection(db, 'goals'));
  const targetDate = gap.deadline || todayStr;

  try {
    const batch = writeBatch(db);
    batch.set(goalRef, {
      ownerId: uid,
      title: gap.title.slice(0, 160),
      description: (gap.suggestedAction || gap.description || 'Competitive advantage goal').slice(0, 1000),
      category: 'Career & Leadership',
      startDate: todayStr,
      targetDate,
      priority: gap.priority,
      goalType: 'Percentage',
      targetValue: 100,
      currentValue: gap.progressPct,
      unit: '%',
      notes: `Linked to Competitive Gap (${gap.linkedMetricKey || 'General'}).`.slice(0, 2000),
      status: gap.progressPct >= 100 ? 'Completed' : 'In Progress',
      sourceType: 'competitiveGap',
      sourceId: gap.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'competitiveGoals', linkId), {
      ownerId: uid,
      companyId: uid,
      gapId: gap.id,
      targetType: 'goal',
      goalId: goalRef.id,
      taskId: '',
      competitorId: gap.linkedCompetitorIds[0] ?? '',
      title: gap.title.slice(0, 160),
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'competitiveGaps', gap.id), {
      convertedGoalId: goalRef.id,
      status: gap.status === 'Open' ? 'In Progress' : gap.status,
      progressPct: gap.progressPct,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return goalRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `competitiveGoals/${linkId}`);
  }
}

export async function convertGapToTask(params: {
  uid: string;
  gap: CompetitiveGap;
  existingLinks: CompetitiveGoalLink[];
}): Promise<string> {
  const { uid, gap, existingLinks } = params;
  const linkId = `${gap.id}_task`;
  if (gap.convertedTaskId || existingLinks.some((l) => l.id === linkId)) {
    throw new Error('This gap has already been converted to a Task.');
  }

  const taskRef = doc(collection(db, 'tasks'));
  try {
    const batch = writeBatch(db);
    batch.set(taskRef, {
      ownerId: uid,
      companyId: uid,
      title: gap.title.slice(0, 160),
      description: sanitizePlainText(gap.suggestedAction || gap.description, 1500),
      priority: gap.priority,
      status: 'Todo',
      dueDate: gap.deadline,
      sourceType: 'competitiveGap',
      sourceId: gap.id,
      competitorId: gap.linkedCompetitorIds[0] ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'competitiveGoals', linkId), {
      ownerId: uid,
      companyId: uid,
      gapId: gap.id,
      targetType: 'task',
      goalId: '',
      taskId: taskRef.id,
      competitorId: gap.linkedCompetitorIds[0] ?? '',
      title: gap.title.slice(0, 160),
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'competitiveGaps', gap.id), {
      convertedTaskId: taskRef.id,
      status: gap.status === 'Open' ? 'In Progress' : gap.status,
      progressPct: gap.progressPct,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return taskRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `competitiveGoals/${linkId}`);
  }
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  try {
    await updateDoc(doc(db, 'tasks', taskId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
  }
}

export async function deleteTaskItem(taskId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'tasks', taskId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `tasks/${taskId}`);
  }
}

export function exportAchievementReportCsv(params: {
  competitor: Competitor;
  scorecard: CompetitorScorecardResult;
  reviews: CompetitorMonthlyReview[];
  gapsClosedCount: number;
}): void {
  const { competitor, scorecard, reviews, gapsClosedCount } = params;
  const esc = (v: unknown) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows: string[][] = [
    ['GoalX Competitive Achievement Report'],
    ['Company', 'Gen Z Neural-X'],
    ['Surpassed Competitor', competitor.companyName],
    ['Location', competitor.location],
    ['Market Level', competitor.marketLevel],
    ['Date Surpassed', competitor.surpassedDate || getTodayDateString()],
    ['Comparable Metrics', String(scorecard.comparableCount)],
    ['Gen Z Neural-X Overall Score', String(scorecard.ownOverallScore ?? 'Not enough comparable data')],
    ['Competitor Overall Score', String(scorecard.competitorOverallScore ?? 'Not enough comparable data')],
    ['Score Advantage', String(scorecard.scoreAdvantage ?? 0)],
    ['Own Market Presence Score', String(scorecard.ownMarketPresenceScore ?? 'Unknown')],
    ['Competitor Market Presence Score', String(scorecard.competitorMarketPresenceScore ?? 'Unknown')],
    ['Own Business Performance Score', String(scorecard.ownBusinessPerformanceScore ?? 'Unknown')],
    ['Competitor Business Performance Score', String(scorecard.competitorBusinessPerformanceScore ?? 'Unknown')],
    ['Gaps Closed', String(gapsClosedCount)],
    [],
    ['Metric', 'Scorecard Group', 'Own Score', 'Competitor Score', 'Delta', 'Status'],
    ...scorecard.ahead.map((r) => [r.metricName, r.scorecardType, String(r.ownScore), String(r.competitorScore), String(r.delta), 'Ahead']),
    ...scorecard.equal.map((r) => [r.metricName, r.scorecardType, String(r.ownScore), String(r.competitorScore), '0', 'Equal']),
    ...scorecard.behind.map((r) => [r.metricName, r.scorecardType, String(r.ownScore), String(r.competitorScore), String(r.delta), 'Competitor Ahead']),
    [],
    ['Monthly Review Month', 'Version', 'Own Score', 'Competitor Score', 'Advantage', 'Comparable Count', 'Eligible'],
    ...reviews.map((rev) => [
      rev.month,
      String(rev.version),
      String(rev.ownOverallScore),
      String(rev.competitorOverallScore),
      String(rev.scoreAdvantage),
      String(rev.comparableCount),
      String(rev.eligibleForSurpass),
    ]),
  ];

  const csvContent = rows.map((row) => row.map(esc).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `goalx-achievement-${competitor.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
