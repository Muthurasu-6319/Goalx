import { auth } from '../lib/firebase';
import { CompetitorResearchAction } from '../types';

export interface AiStatusResponse {
  available: boolean;
  groundingEnabled: boolean;
  model: string;
  dailyLimit: number;
  reason?: string;
}

export interface RunAiResearchParams {
  action: Exclude<CompetitorResearchAction, 'manual_research'>;
  competitorId?: string;
  websiteUrl?: string;
  region?: string;
  servicesFocus?: string;
}

export interface RunAiResearchResult {
  ok: boolean;
  runId?: string;
  findingsCount?: number;
  groundingUsed?: boolean;
  summary?: string;
  remainingToday?: number;
  unavailable?: boolean;
  error?: string;
}

export async function fetchCompetitorAiStatus(): Promise<AiStatusResponse> {
  try {
    const res = await fetch('/api/competition/ai-status');
    if (!res.ok) {
      return {
        available: false,
        groundingEnabled: false,
        model: 'gemini-4-hydrogen',
        dailyLimit: 20,
        reason: 'AI research status endpoint unavailable.',
      };
    }
    return (await res.json()) as AiStatusResponse;
  } catch {
    return {
      available: false,
      groundingEnabled: false,
      model: 'gemini-4-hydrogen',
      dailyLimit: 20,
      reason: 'AI research server unavailable — enter findings manually.',
    };
  }
}

export async function runCompetitorAiResearch(
  params: RunAiResearchParams
): Promise<RunAiResearchResult> {
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, error: 'You must be signed in to run AI research.' };
  }

  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/competition/research', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const data = (await res.json()) as {
      ok?: boolean;
      runId?: string;
      findingsCount?: number;
      groundingUsed?: boolean;
      summary?: string;
      remainingToday?: number;
      available?: boolean;
      code?: string;
      error?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        unavailable: res.status === 503 || data.code === 'GEMINI_UNAVAILABLE',
        error: data.error || 'AI research failed. Please enter findings manually.',
      };
    }

    return {
      ok: true,
      runId: data.runId,
      findingsCount: data.findingsCount ?? 0,
      groundingUsed: Boolean(data.groundingUsed),
      summary: data.summary ?? '',
      remainingToday: data.remainingToday,
    };
  } catch {
    return {
      ok: false,
      unavailable: true,
      error: 'AI research unavailable — enter findings manually.',
    };
  }
}

export async function suggestGapActionAi(params: {
  competitorName: string;
  metricName: string;
  ownValue: string;
  competitorValue: string;
  evidenceSummary: string;
}): Promise<{ ok: boolean; suggestedAction?: string; origin?: 'AI-assisted'; error?: string }> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'Not authenticated' };
  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/competition/suggest-gap-action', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      suggestedAction?: string;
      origin?: 'AI-assisted';
      error?: string;
    };
    if (!res.ok || !data.suggestedAction) {
      return { ok: false, error: data.error || 'AI suggestion unavailable' };
    }
    return { ok: true, suggestedAction: data.suggestedAction, origin: 'AI-assisted' };
  } catch {
    return { ok: false, error: 'AI suggestion unavailable' };
  }
}

export interface ConfirmSurpassedResult {
  ok: boolean;
  competitorId?: string;
  comparisonId?: string;
  rewardEventId?: string;
  surpassedDate?: string;
  scoreAdvantage?: number;
  error?: string;
}

export async function confirmCompetitorSurpassed(
  competitorId: string
): Promise<ConfirmSurpassedResult> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'You must be signed in.' };
  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/competition/confirm-surpassed', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ competitorId, confirmedByUser: true }),
    });
    const data = (await res.json()) as ConfirmSurpassedResult;
    if (!res.ok) {
      return { ok: false, error: data.error || 'Surpass verification failed.' };
    }
    return { ...data, ok: true };
  } catch {
    return { ok: false, error: 'Network error confirming surpassed status.' };
  }
}

export interface NextCompetitorsResult {
  ok: boolean;
  mode?: 'ai_pending_review' | 'local_candidates';
  runId?: string;
  queuedPendingCount?: number;
  localSuggestions?: {
    id: string;
    companyName: string;
    location: string;
    marketLevel: string;
    classification: string;
  }[];
  error?: string;
}

export async function researchNextCompetitors(params: {
  surpassedCompetitorId: string;
  region?: string;
}): Promise<NextCompetitorsResult> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'You must be signed in.' };
  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/competition/next-competitors', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    const data = (await res.json()) as NextCompetitorsResult;
    if (!res.ok) return { ok: false, error: data.error || 'Next target lookup failed.' };
    return { ...data, ok: true };
  } catch {
    return { ok: false, error: 'Network error researching next targets.' };
  }
}

