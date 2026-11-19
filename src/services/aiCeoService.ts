import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  DocumentReference,
} from 'firebase/firestore';
import { getAsiaKolkataDateParts } from '../lib/aiCeoContextUtils';
import {
  AI_CREATED_PROPOSAL_BADGE,
  AI_DAILY_BASELINE_LIMIT,
  AI_DAILY_BRIEFING_LIMIT,
  AI_DAILY_CHAT_LIMIT,
} from '../lib/constants';
import { addDaysToDateString } from '../lib/goalUtils';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AiArea,
  AiBriefing,
  AiBriefingType,
  AiSourceCitation,
  BaselineReview,
} from '../types';

export interface AiCeoStatusResponse {
  available: boolean;
  model: string;
  timeZone: string;
  todayStr: string;
  limits: {
    chat: number;
    briefing: number;
    baseline: number;
  };
  usage: {
    chatCount: number;
    briefingCount: number;
    baselineCount: number;
  };
  reason?: string;
}

export interface SendAiCeoMessageParams {
  message: string;
  conversationId?: string;
  hintArea?: AiArea | 'general';
  focusRecordId?: string;
}

export interface SendAiCeoMessageResult {
  ok: boolean;
  conversationId?: string;
  assistantMessageId?: string;
  answerMarkdown?: string;
  sources?: AiSourceCitation[];
  areaTags?: AiArea[];
  aiUnavailable?: boolean;
  proposalsCreated?: number;
  remainingToday?: number;
  error?: string;
}

export interface BriefingApiResult {
  ok: boolean;
  cached?: boolean;
  briefing?: AiBriefing;
  error?: string;
}

export interface BaselineReviewApiResult {
  ok: boolean;
  review?: BaselineReview;
  error?: string;
}

export interface DecideProposalParams {
  decision: 'confirm' | 'reject' | 'edit';
  title?: string;
  summary?: string;
  payload?: Record<string, unknown>;
  rejectionReason?: string;
}

export interface DecideProposalResult {
  ok: boolean;
  status?: 'Executed' | 'Rejected';
  requestId?: string;
  executedRecordId?: string;
  executedRecordRoute?: string;
  error?: string;
}

const DEFAULT_LIMITS = {
  chat: AI_DAILY_CHAT_LIMIT,
  briefing: AI_DAILY_BRIEFING_LIMIT,
  baseline: AI_DAILY_BASELINE_LIMIT,
};

export async function fetchAiCeoStatus(): Promise<AiCeoStatusResponse> {
  const ist = getAsiaKolkataDateParts();
  try {
    const headers: Record<string, string> = {};
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch('/api/ai-ceo/status', { headers });
    if (!res.ok) {
      return {
        available: false,
        model: 'gemini-4-hydrogen',
        timeZone: 'Asia/Kolkata',
        todayStr: ist.dateStr,
        limits: DEFAULT_LIMITS,
        usage: { chatCount: 0, briefingCount: 0, baselineCount: 0 },
        reason: 'AI CEO status endpoint returned an error. Rule-based briefings remain active.',
      };
    }
    return (await res.json()) as AiCeoStatusResponse;
  } catch {
    return {
      available: false,
      model: 'gemini-4-hydrogen',
      timeZone: 'Asia/Kolkata',
      todayStr: ist.dateStr,
      limits: DEFAULT_LIMITS,
      usage: { chatCount: 0, briefingCount: 0, baselineCount: 0 },
      reason: 'Could not reach AI CEO server. Check your connection.',
    };
  }
}

export async function sendAiCeoMessage(
  params: SendAiCeoMessageParams
): Promise<SendAiCeoMessageResult> {
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, error: 'You must be signed in to message GoalX AI CEO.' };
  }

  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/ai-ceo/chat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: params.message,
        conversationId: params.conversationId ?? '',
        hintArea: params.hintArea ?? 'general',
        focusRecordId: params.focusRecordId ?? '',
      }),
    });
    const data = (await res.json()) as SendAiCeoMessageResult;
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || 'Failed to get response from GoalX AI CEO.',
      };
    }
    return { ...data, ok: true };
  } catch {
    return {
      ok: false,
      error: 'Network error communicating with GoalX AI CEO.',
    };
  }
}

export async function fetchOrGenerateBriefing(params: {
  briefingType?: AiBriefingType;
  regenerate?: boolean;
}): Promise<BriefingApiResult> {
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, error: 'You must be signed in to generate briefings.' };
  }

  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/ai-ceo/briefing', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        briefingType: params.briefingType ?? 'daily',
        regenerate: Boolean(params.regenerate),
      }),
    });
    const data = (await res.json()) as BriefingApiResult;
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || 'Failed to generate briefing.',
      };
    }
    return { ...data, ok: true };
  } catch {
    return {
      ok: false,
      error: 'Network error generating briefing.',
    };
  }
}

export async function generateThreeMonthBaseline(): Promise<BaselineReviewApiResult> {
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, error: 'You must be signed in to run the 3-month baseline review.' };
  }

  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/ai-ceo/baseline-review', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const data = (await res.json()) as BaselineReviewApiResult;
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || 'Failed to compute 3-month baseline review.',
      };
    }
    return { ...data, ok: true };
  } catch {
    return {
      ok: false,
      error: 'Network error running baseline review.',
    };
  }
}

export async function decideActionProposal(
  requestId: string,
  params: DecideProposalParams
): Promise<DecideProposalResult> {
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, error: 'You must be signed in to confirm or reject proposals.' };
  }

  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`/api/ai-ceo/proposals/${encodeURIComponent(requestId)}/decide`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    const data = (await res.json()) as DecideProposalResult;
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || 'Failed to process action proposal.',
      };
    }
    return { ...data, ok: true };
  } catch {
    return {
      ok: false,
      error: 'Network error processing proposal decision.',
    };
  }
}

export async function acceptBaselineTargetAsGoal(
  uid: string,
  title: string,
  timeframeDays: 30 | 60 | 90
): Promise<string> {
  const ist = getAsiaKolkataDateParts();
  const startDate = ist.dateStr;
  const targetDate = addDaysToDateString(startDate, timeframeDays);
  const cleanTitle = title.trim().slice(0, 160);

  if (!cleanTitle) {
    throw new Error('Target title is empty.');
  }

  const payload = {
    ownerId: uid,
    title: cleanTitle,
    description: `${timeframeDays}-day KPI target adopted from GoalX AI CEO 3-Month Baseline Review.`,
    category: 'Career & Leadership',
    startDate,
    targetDate,
    priority: 'High',
    goalType: 'Task-based',
    targetValue: 100,
    currentValue: 0,
    unit: '%',
    notes: `${AI_CREATED_PROPOSAL_BADGE} Source: 3-Month Baseline Review (${timeframeDays}-day target).`,
    status: 'Not Started',
    sourceType: 'aiProposal',
    sourceId: 'baseline_review',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = await addDoc(collection(db, 'goals'), payload);
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'goals');
  }
}

async function commitDeletesInChunks(refs: DocumentReference[]): Promise<void> {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + CHUNK_SIZE)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

export async function deleteAiConversation(
  uid: string,
  conversationId: string
): Promise<void> {
  try {
    const [convSnap, msgSnap, propSnap] = await Promise.all([
      getDocs(query(collection(db, 'aiConversations'), where('ownerId', '==', uid))),
      getDocs(
        query(
          collection(db, 'aiMessages'),
          where('ownerId', '==', uid),
          where('conversationId', '==', conversationId)
        )
      ),
      getDocs(
        query(
          collection(db, 'aiActionRequests'),
          where('ownerId', '==', uid),
          where('conversationId', '==', conversationId)
        )
      ),
    ]);

    const refs: DocumentReference[] = [];
    for (const d of msgSnap.docs) refs.push(d.ref);
    for (const d of propSnap.docs) refs.push(d.ref);
    for (const d of convSnap.docs) {
      if (d.id === conversationId) refs.push(d.ref);
    }

    if (refs.length > 0) {
      await commitDeletesInChunks(refs);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `aiConversations/${conversationId}`);
  }
}

/**
 * Deletes all owner AI history across deletable AI collections
 * (aiConversations, aiMessages, aiBriefings, aiActionRequests, baselineReviews).
 * Does NOT delete aiUsage or activityLogs, which are immutable audit/rate-limit records.
 */
export async function deleteAllAiHistory(uid: string): Promise<{ deletedCount: number }> {
  const collectionsToClear = [
    'aiMessages',
    'aiActionRequests',
    'aiConversations',
    'aiBriefings',
    'baselineReviews',
  ] as const;

  try {
    const snaps = await Promise.all(
      collectionsToClear.map((colName) =>
        getDocs(query(collection(db, colName), where('ownerId', '==', uid)))
      )
    );

    const refs: DocumentReference[] = [];
    for (const snap of snaps) {
      for (const d of snap.docs) {
        refs.push(d.ref);
      }
    }

    if (refs.length > 0) {
      await commitDeletesInChunks(refs);
    }

    return { deletedCount: refs.length };
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'aiHistory');
  }
}
