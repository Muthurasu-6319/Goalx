import { auth } from '../lib/firebase';
import { GamificationSummaryResponse } from '../types';

export async function fetchGamificationSummary(): Promise<GamificationSummaryResponse> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Please sign in to view executive gamification stats.');
  }

  const res = await fetch('/api/gamification/summary', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorJson = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorJson.error || `Failed to fetch gamification stats (${res.status})`);
  }

  return (await res.json()) as GamificationSummaryResponse;
}

export async function syncGamificationXp(): Promise<GamificationSummaryResponse> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Please sign in to sync executive XP.');
  }

  const res = await fetch('/api/gamification/sync-xp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorJson = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorJson.error || `Failed to sync executive XP (${res.status})`);
  }

  return (await res.json()) as GamificationSummaryResponse;
}
