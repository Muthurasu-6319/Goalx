import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { DEFAULT_TIMEZONE } from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile } from '../types';

export interface CreateUserInput {
  ownerId: string;
  name: string;
  email: string;
  photoUrl?: string;
  monthlyIncome?: number | null;
  currency?: string;
  timezone?: string;
  bio?: string;
  personalGoals?: string[];
  onboardingCompleted: boolean;
}

export interface UpdateUserProfileInput {
  name: string;
  email: string;
  photoUrl: string;
  monthlyIncome: number | null;
  currency: string;
  timezone?: string;
  bio?: string;
  personalGoals: string[];
  onboardingCompleted?: boolean;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createUserProfile(input: CreateUserInput): Promise<void> {
  const path = `users/${input.ownerId}`;
  const cleanGoals = (input.personalGoals || [])
    .map((g) => g.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 20);

  const payload = {
    ownerId: input.ownerId,
    name: input.name.trim().slice(0, 120) || 'CEO',
    email: input.email.trim().slice(0, 200),
    photoUrl: (input.photoUrl || '').trim().slice(0, 1000),
    monthlyIncome: input.monthlyIncome ?? null,
    currency: (input.currency || 'INR').trim().slice(0, 10),
    timezone: (input.timezone || DEFAULT_TIMEZONE).trim().slice(0, 80),
    bio: (input.bio || '').trim().slice(0, 500),
    personalGoals: cleanGoals,
    onboardingCompleted: input.onboardingCompleted,
    xp: input.onboardingCompleted ? 50 : 0,
    level: 1,
    streakDays: input.onboardingCompleted ? 1 : 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', input.ownerId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUserProfile(uid: string, input: UpdateUserProfileInput): Promise<void> {
  const path = `users/${uid}`;
  const cleanGoals = input.personalGoals
    .map((g) => g.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 20);

  const updates: Record<string, unknown> = {
    name: input.name.trim().slice(0, 120),
    email: input.email.trim().slice(0, 200),
    photoUrl: input.photoUrl.trim().slice(0, 1000),
    monthlyIncome: input.monthlyIncome ?? null,
    currency: input.currency.trim().slice(0, 10),
    personalGoals: cleanGoals,
    updatedAt: serverTimestamp(),
  };

  if (input.timezone !== undefined) {
    updates.timezone = input.timezone.trim().slice(0, 80) || DEFAULT_TIMEZONE;
  }
  if (input.bio !== undefined) {
    updates.bio = input.bio.trim().slice(0, 500);
  }
  if (typeof input.onboardingCompleted === 'boolean') {
    updates.onboardingCompleted = input.onboardingCompleted;
  }

  try {
    await updateDoc(doc(db, 'users', uid), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function awardUserXp(
  uid: string,
  currentXp: number,
  currentStreak: number,
  xpDelta: number
): Promise<void> {
  const path = `users/${uid}`;
  const nextXp = Math.max(0, Math.min(10000000, currentXp + xpDelta));
  const nextLevel = Math.max(1, Math.floor(nextXp / 250) + 1);
  const nextStreak = Math.max(1, currentStreak);

  try {
    await updateDoc(doc(db, 'users', uid), {
      xp: nextXp,
      level: nextLevel,
      streakDays: nextStreak,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
