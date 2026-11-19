import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  DEFAULT_GAMIFICATION_XP_CONFIG,
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_TIMEZONE,
} from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  CurrencyFormatMode,
  DisplayDensity,
  GamificationXpConfig,
  NotificationPreferences,
  ThemeMode,
  UserSettings,
} from '../types';

export interface UpdateSettingsInput {
  theme?: ThemeMode;
  density?: DisplayDensity;
  reducedMotion?: boolean;
  notificationsEnabled?: boolean;
  browserPushEnabled?: boolean;
  notificationPrefs?: NotificationPreferences;
  emailDigest?: boolean;
  weekStartsOn?: 'monday' | 'sunday';
  currency?: string;
  currencyFormat?: CurrencyFormatMode;
  accountingBasis?: 'cash' | 'accrual';
  timezone?: string;
  sidebarCollapsed?: boolean;
  defaultCommissionPct?: number;
  customExpenseCategories?: string[];
  gamificationConfig?: GamificationXpConfig;
}

export async function getUserSettings(uid: string): Promise<UserSettings | null> {
  const path = `settings/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'settings', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserSettings;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createDefaultSettings(uid: string, currency = 'INR'): Promise<void> {
  const path = `settings/${uid}`;
  const payload = {
    ownerId: uid,
    theme: 'light' as const,
    density: 'comfortable' as const,
    reducedMotion: false,
    notificationsEnabled: true,
    browserPushEnabled: false,
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    emailDigest: false,
    weekStartsOn: 'monday' as const,
    currency: currency.trim().slice(0, 10) || 'INR',
    currencyFormat: 'indian' as const,
    accountingBasis: 'cash' as const,
    timezone: DEFAULT_TIMEZONE,
    sidebarCollapsed: false,
    defaultCommissionPct: 5,
    customExpenseCategories: [],
    gamificationConfig: DEFAULT_GAMIFICATION_XP_CONFIG,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'settings', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUserSettings(uid: string, input: UpdateSettingsInput): Promise<void> {
  const path = `settings/${uid}`;
  const updates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (input.theme !== undefined) updates.theme = input.theme;
  if (input.density !== undefined) updates.density = input.density;
  if (input.reducedMotion !== undefined) updates.reducedMotion = Boolean(input.reducedMotion);
  if (input.notificationsEnabled !== undefined) {
    updates.notificationsEnabled = Boolean(input.notificationsEnabled);
  }
  if (input.browserPushEnabled !== undefined) {
    updates.browserPushEnabled = Boolean(input.browserPushEnabled);
  }
  if (input.notificationPrefs !== undefined) {
    updates.notificationPrefs = {
      categories: { ...DEFAULT_NOTIFICATION_PREFS.categories, ...input.notificationPrefs.categories },
      quietHoursEnabled: Boolean(input.notificationPrefs.quietHoursEnabled),
      quietHoursStart: input.notificationPrefs.quietHoursStart.slice(0, 5),
      quietHoursEnd: input.notificationPrefs.quietHoursEnd.slice(0, 5),
    };
  }
  if (input.emailDigest !== undefined) updates.emailDigest = Boolean(input.emailDigest);
  if (input.weekStartsOn !== undefined) updates.weekStartsOn = input.weekStartsOn;
  if (input.currency !== undefined) updates.currency = input.currency.trim().slice(0, 10);
  if (input.currencyFormat !== undefined) updates.currencyFormat = input.currencyFormat;
  if (input.accountingBasis !== undefined) updates.accountingBasis = input.accountingBasis;
  if (input.timezone !== undefined) updates.timezone = input.timezone.trim().slice(0, 80) || DEFAULT_TIMEZONE;
  if (input.sidebarCollapsed !== undefined) updates.sidebarCollapsed = Boolean(input.sidebarCollapsed);
  if (input.defaultCommissionPct !== undefined) {
    updates.defaultCommissionPct = Math.max(0, Math.min(100, Number(input.defaultCommissionPct)));
  }
  if (input.customExpenseCategories !== undefined) {
    updates.customExpenseCategories = input.customExpenseCategories
      .map((c) => c.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 30);
  }
  if (input.gamificationConfig !== undefined) {
    const clampXp = (val: number) => Math.max(0, Math.min(5000, Math.round(Number(val) || 0)));
    updates.gamificationConfig = {
      taskComplete: clampXp(input.gamificationConfig.taskComplete),
      goalComplete: clampXp(input.gamificationConfig.goalComplete),
      milestoneComplete: clampXp(input.gamificationConfig.milestoneComplete),
      habitCheckIn: clampXp(input.gamificationConfig.habitCheckIn),
      projectComplete: clampXp(input.gamificationConfig.projectComplete),
      clientWon: clampXp(input.gamificationConfig.clientWon),
      competitorSurpassed: clampXp(input.gamificationConfig.competitorSurpassed),
      monthlyReviewSaved: clampXp(input.gamificationConfig.monthlyReviewSaved),
    };
  }

  try {
    await updateDoc(doc(db, 'settings', uid), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
