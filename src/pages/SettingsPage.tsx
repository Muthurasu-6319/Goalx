import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Award,
  Bell,
  BellOff,
  Building2,
  CheckCircle2,
  Database,
  Download,
  IndianRupee,
  KeyRound,
  Loader2,
  LogOut,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Sun,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { PWAInstallButton } from '../components/pwa/PWAInstallButton';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FormPageSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { DeleteModuleGroup } from '../lib/collectionRegistry';
import {
  COMPANY_STAGES,
  CURRENCIES,
  DEFAULT_COMMISSION_PCT,
  DEFAULT_COMPANY_EXPENSE_CATEGORIES,
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_GAMIFICATION_XP_CONFIG,
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_TIMEZONE,
  NOTIFICATION_CATEGORY_DEFS,
  TIMEZONE_OPTIONS,
} from '../lib/constants';
import { deleteModuleData, exportGoalXDataZip, ExportProgress, ExportResult } from '../lib/exportUtils';
import {
  AppSettingsFormValues,
  appSettingsSchema,
  ChangePasswordFormValues,
  changePasswordSchema,
  CompanyProfileFormValues,
  companyProfileSchema,
  GamificationXpFormValues,
  gamificationXpConfigSchema,
  UserProfileFormValues,
  userProfileSchema,
} from '../lib/validators';
import { deleteAllAiHistory } from '../services/aiCeoService';
import {
  changeUserPassword,
  getAuthErrorMessage,
  getRecentAuthAgeSeconds,
  getUserProviderIds,
  logoutUser,
  reauthenticateWithGooglePopup,
  reauthenticateWithPassword,
} from '../services/authService';
import { updateCompanyProfile } from '../services/companyService';
import {
  getBrowserNotificationState,
  requestBrowserNotificationPermissionOnlyOnClick,
} from '../services/notificationService';
import { fetchRecentSecurityAuditLogs, logSecurityAuditEvent } from '../services/securityAuditService';
import { updateUserSettings } from '../services/settingsService';
import { updateUserProfile } from '../services/userService';
import { NotificationPreferences, SecurityAuditLog } from '../types';

type SettingsTab =
  | 'profile'
  | 'company'
  | 'appearance'
  | 'notifications'
  | 'gamification'
  | 'finance'
  | 'security'
  | 'data';

const VALID_TABS: SettingsTab[] = [
  'profile',
  'company',
  'appearance',
  'notifications',
  'gamification',
  'finance',
  'security',
  'data',
];

const TAB_ITEMS: { id: SettingsTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'gamification', label: 'Gamification', icon: Award },
  { id: 'finance', label: 'Finance', icon: IndianRupee },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'data', label: 'Data', icon: Database },
];

export const SettingsPage: React.FC = () => {
  const { firebaseUser, dataLoading, userProfile, companyProfile, userSettings } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get('tab') as SettingsTab | null;
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'profile'
  );

  // Sync URL query tab changes (e.g., navigating from Notifications -> ?tab=notifications)
  useEffect(() => {
    if (rawTab && VALID_TABS.includes(rawTab) && rawTab !== activeTab) {
      setActiveTab(rawTab);
    }
  }, [rawTab, activeTab]);

  const switchTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Dynamic list builders
  const [personalGoalInput, setPersonalGoalInput] = useState('');
  const [companyGoalInput, setCompanyGoalInput] = useState('');
  const [customServiceInput, setCustomServiceInput] = useState('');
  const [customCategoryInput, setCustomCategoryInput] = useState('');

  // Appearance state
  const [themeDraft, setThemeDraft] = useState<'light' | 'dark'>('light');
  const [densityDraft, setDensityDraft] = useState<'comfortable' | 'compact'>('comfortable');
  const [reducedMotionDraft, setReducedMotionDraft] = useState(false);
  const [sidebarCollapsedDraft, setSidebarCollapsedDraft] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);

  // Notifications state
  const [notifMasterEnabled, setNotifMasterEnabled] = useState(true);
  const [emailDigestDraft, setEmailDigestDraft] = useState(false);
  const [browserPushDraft, setBrowserPushDraft] = useState(false);
  const [notifPrefsDraft, setNotifPrefsDraft] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFS
  );
  const [pushPermission, setPushPermission] = useState(() => getBrowserNotificationState());
  const [savingNotifs, setSavingNotifs] = useState(false);

  // Security tab state
  const [authAgeSeconds, setAuthAgeSeconds] = useState<number | null>(null);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);

  // Data tab state
  const [includeSalaryExport, setIncludeSalaryExport] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportingScope, setExportingScope] = useState<string | null>(null);
  const [lastExportResult, setLastExportResult] = useState<ExportResult | null>(null);
  const [confirmClearAiOpen, setConfirmClearAiOpen] = useState(false);
  const [clearingAiHistory, setClearingAiHistory] = useState(false);
  const [moduleDeleteTarget, setModuleDeleteTarget] = useState<Exclude<
    DeleteModuleGroup,
    'account_only'
  > | null>(null);
  const [deletingModule, setDeletingModule] = useState(false);

  // Account Deletion Modal state
  const [accountDeleteModalOpen, setAccountDeleteModalOpen] = useState(false);
  const [deleteTypedConfirm, setDeleteTypedConfirm] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountDeletionReport, setAccountDeletionReport] = useState<{
    deletedCollections: Record<string, number>;
    skippedCollections: string[];
    storageDeletedCount: number;
    authDeleted: boolean;
    warnings: string[];
  } | null>(null);

  // Shared Re-Authentication Modal
  const [reauthModal, setReauthModal] = useState<{
    open: boolean;
    reason: string;
    onSuccess: (() => Promise<void> | void) | null;
  }>({ open: false, reason: '', onSuccess: null });
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthLoading, setReauthLoading] = useState(false);
  const [reauthError, setReauthError] = useState('');

  const providerIds = getUserProviderIds();
  const hasPasswordProvider = providerIds.includes('password');
  const hasGoogleProvider = providerIds.includes('google.com');

  // Forms
  const profileForm = useForm<UserProfileFormValues>({
    resolver: zodResolver(userProfileSchema),
    defaultValues: {
      name: '',
      email: '',
      photoUrl: '',
      monthlyIncome: null,
      currency: 'INR',
      timezone: DEFAULT_TIMEZONE,
      bio: '',
      personalGoals: [],
    },
  });

  const companyForm = useForm<CompanyProfileFormValues>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: {
      name: DEFAULT_COMPANY_PROFILE.name,
      website: DEFAULT_COMPANY_PROFILE.website,
      industry: DEFAULT_COMPANY_PROFILE.industry,
      services: DEFAULT_COMPANY_PROFILE.services,
      location: DEFAULT_COMPANY_PROFILE.location,
      startDate: '',
      stage: '',
      goals: [],
    },
  });

  const financePrefsForm = useForm<AppSettingsFormValues>({
    resolver: zodResolver(appSettingsSchema),
    defaultValues: {
      notificationsEnabled: true,
      emailDigest: false,
      weekStartsOn: 'monday',
      currency: 'INR',
      currencyFormat: 'indian',
      accountingBasis: 'cash',
      timezone: DEFAULT_TIMEZONE,
      defaultCommissionPct: DEFAULT_COMMISSION_PCT,
    },
  });

  const gamificationForm = useForm<GamificationXpFormValues>({
    resolver: zodResolver(gamificationXpConfigSchema),
    defaultValues: DEFAULT_GAMIFICATION_XP_CONFIG,
  });

  const passwordForm = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
  });

  useEffect(() => {
    if (userProfile) {
      profileForm.reset({
        name: userProfile.name || '',
        email: userProfile.email || firebaseUser?.email || '',
        photoUrl: userProfile.photoUrl || '',
        monthlyIncome: userProfile.monthlyIncome ?? null,
        currency: userProfile.currency || 'INR',
        timezone: userProfile.timezone || userSettings?.timezone || DEFAULT_TIMEZONE,
        bio: userProfile.bio || '',
        personalGoals: userProfile.personalGoals ?? [],
      });
    }
  }, [userProfile, userSettings?.timezone, firebaseUser, profileForm]);

  useEffect(() => {
    if (companyProfile) {
      companyForm.reset({
        name: companyProfile.name || DEFAULT_COMPANY_PROFILE.name,
        website: companyProfile.website || '',
        industry: companyProfile.industry || DEFAULT_COMPANY_PROFILE.industry,
        services: companyProfile.services ?? DEFAULT_COMPANY_PROFILE.services,
        location: companyProfile.location || '',
        startDate: companyProfile.startDate || '',
        stage: companyProfile.stage || '',
        goals: companyProfile.goals ?? [],
      });
    }
  }, [companyProfile, companyForm]);

  useEffect(() => {
    if (userSettings) {
      setThemeDraft(userSettings.theme === 'dark' ? 'dark' : 'light');
      setDensityDraft(userSettings.density === 'compact' ? 'compact' : 'comfortable');
      setReducedMotionDraft(Boolean(userSettings.reducedMotion));
      setSidebarCollapsedDraft(Boolean(userSettings.sidebarCollapsed));

      setNotifMasterEnabled(userSettings.notificationsEnabled ?? true);
      setEmailDigestDraft(Boolean(userSettings.emailDigest));
      setBrowserPushDraft(Boolean(userSettings.browserPushEnabled));
      setNotifPrefsDraft({
        categories: {
          ...DEFAULT_NOTIFICATION_PREFS.categories,
          ...(userSettings.notificationPrefs?.categories ?? {}),
        },
        quietHoursEnabled: Boolean(userSettings.notificationPrefs?.quietHoursEnabled),
        quietHoursStart: userSettings.notificationPrefs?.quietHoursStart || '22:00',
        quietHoursEnd: userSettings.notificationPrefs?.quietHoursEnd || '07:00',
      });

      financePrefsForm.reset({
        notificationsEnabled: userSettings.notificationsEnabled,
        emailDigest: userSettings.emailDigest,
        weekStartsOn: userSettings.weekStartsOn,
        currency: userSettings.currency || 'INR',
        currencyFormat: userSettings.currencyFormat || 'indian',
        accountingBasis: userSettings.accountingBasis || 'cash',
        timezone: userSettings.timezone || DEFAULT_TIMEZONE,
        defaultCommissionPct: userSettings.defaultCommissionPct ?? DEFAULT_COMMISSION_PCT,
      });

      gamificationForm.reset({
        ...DEFAULT_GAMIFICATION_XP_CONFIG,
        ...(userSettings.gamificationConfig ?? {}),
      });
    }
  }, [userSettings, financePrefsForm, gamificationForm]);

  const loadSecurityTelemetry = async () => {
    if (!firebaseUser?.uid) return;
    setAuditLoading(true);
    try {
      const [age, logs] = await Promise.all([
        getRecentAuthAgeSeconds(),
        fetchRecentSecurityAuditLogs(firebaseUser.uid, 25),
      ]);
      setAuthAgeSeconds(age);
      setAuditLogs(logs);
    } catch {
      // Non-blocking audit fetch
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'security' || activeTab === 'data') {
      void loadSecurityTelemetry();
    }
  }, [activeTab, firebaseUser?.uid]);

  if (dataLoading) {
    return <FormPageSkeleton />;
  }

  // Helper: Require recent authentication (<= 300s) before sensitive action
  const ensureRecentReauthAndRun = async (reason: string, actionFn: () => Promise<void>) => {
    const age = await getRecentAuthAgeSeconds();
    if (age !== null && age <= 300) {
      await actionFn();
      return;
    }
    setReauthPassword('');
    setReauthError('');
    setReauthModal({
      open: true,
      reason,
      onSuccess: actionFn,
    });
  };

  const handleCompleteReauthWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reauthPassword) return;
    setReauthLoading(true);
    setReauthError('');
    try {
      await reauthenticateWithPassword(reauthPassword);
      const age = await getRecentAuthAgeSeconds();
      setAuthAgeSeconds(age);
      const cb = reauthModal.onSuccess;
      setReauthModal({ open: false, reason: '', onSuccess: null });
      if (cb) await cb();
    } catch (err) {
      setReauthError(getAuthErrorMessage(err));
    } finally {
      setReauthLoading(false);
    }
  };

  const handleCompleteReauthWithGoogle = async () => {
    setReauthLoading(true);
    setReauthError('');
    try {
      await reauthenticateWithGooglePopup();
      const age = await getRecentAuthAgeSeconds();
      setAuthAgeSeconds(age);
      const cb = reauthModal.onSuccess;
      setReauthModal({ open: false, reason: '', onSuccess: null });
      if (cb) await cb();
    } catch (err) {
      setReauthError(getAuthErrorMessage(err));
    } finally {
      setReauthLoading(false);
    }
  };

  // Handlers
  const onSaveProfile = async (values: UserProfileFormValues) => {
    if (!firebaseUser) return;
    try {
      await Promise.all([
        updateUserProfile(firebaseUser.uid, {
          name: values.name,
          email: values.email,
          photoUrl: values.photoUrl,
          monthlyIncome: values.monthlyIncome ?? null,
          currency: values.currency,
          timezone: values.timezone || DEFAULT_TIMEZONE,
          bio: values.bio || '',
          personalGoals: values.personalGoals,
        }),
        updateUserSettings(firebaseUser.uid, {
          timezone: values.timezone || DEFAULT_TIMEZONE,
        }),
      ]);
      showToast('Profile saved', { description: 'Your personal CEO profile has been updated.', variant: 'success' });
    } catch (err) {
      showToast('Update failed', {
        description: err instanceof Error ? err.message : 'Unable to save profile.',
        variant: 'error',
      });
    }
  };

  const onSaveCompany = async (values: CompanyProfileFormValues) => {
    if (!firebaseUser) return;
    try {
      await updateCompanyProfile(firebaseUser.uid, {
        name: values.name,
        website: values.website,
        industry: values.industry,
        services: values.services,
        location: values.location,
        startDate: values.startDate,
        stage: values.stage,
        goals: values.goals,
      });
      showToast('Company updated', {
        description: `${values.name} details have been saved.`,
        variant: 'success',
      });
    } catch (err) {
      showToast('Update failed', {
        description: err instanceof Error ? err.message : 'Unable to save company details.',
        variant: 'error',
      });
    }
  };

  const onSaveAppearance = async () => {
    if (!firebaseUser) return;
    setSavingAppearance(true);
    try {
      await updateUserSettings(firebaseUser.uid, {
        theme: themeDraft,
        density: densityDraft,
        reducedMotion: reducedMotionDraft,
        sidebarCollapsed: sidebarCollapsedDraft,
      });
      showToast('Appearance saved', {
        description: `${themeDraft === 'dark' ? 'Dark' : 'Light'} mode & ${densityDraft} density active.`,
        variant: 'success',
      });
    } catch (err) {
      showToast('Failed to save appearance', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSavingAppearance(false);
    }
  };

  const handleEnableBrowserPushClick = async () => {
    const res = await requestBrowserNotificationPermissionOnlyOnClick();
    setPushPermission(res);
    if (res === 'granted' && firebaseUser) {
      setBrowserPushDraft(true);
      await updateUserSettings(firebaseUser.uid, { browserPushEnabled: true });
      showToast('Browser notifications enabled', { variant: 'success' });
    } else if (res === 'denied') {
      showToast('Browser notifications blocked', {
        description: 'Re-enable them in your browser site settings.',
        variant: 'warning',
      });
    }
  };

  const onSaveNotifications = async () => {
    if (!firebaseUser) return;
    setSavingNotifs(true);
    try {
      await updateUserSettings(firebaseUser.uid, {
        notificationsEnabled: notifMasterEnabled,
        emailDigest: emailDigestDraft,
        browserPushEnabled: browserPushDraft,
        notificationPrefs: notifPrefsDraft,
      });
      showToast('Notification preferences saved', { variant: 'success' });
    } catch (err) {
      showToast('Failed to save notifications', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSavingNotifs(false);
    }
  };

  const onSaveGamification = async (values: GamificationXpFormValues) => {
    if (!firebaseUser) return;
    try {
      await updateUserSettings(firebaseUser.uid, {
        gamificationConfig: values,
      });
      showToast('Gamification XP values saved', { variant: 'success' });
    } catch (err) {
      showToast('Failed to save gamification config', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const onSaveFinancePrefs = async (values: AppSettingsFormValues) => {
    if (!firebaseUser) return;
    try {
      await updateUserSettings(firebaseUser.uid, {
        weekStartsOn: values.weekStartsOn,
        currency: values.currency,
        currencyFormat: values.currencyFormat,
        accountingBasis: values.accountingBasis,
        defaultCommissionPct: values.defaultCommissionPct,
      });
      showToast('Finance preferences saved', { variant: 'success' });
    } catch (err) {
      showToast('Update failed', {
        description: err instanceof Error ? err.message : 'Unable to save finance preferences.',
        variant: 'error',
      });
    }
  };

  const handleAddCustomExpenseCategory = async () => {
    if (!firebaseUser) return;
    const trimmed = customCategoryInput.trim().slice(0, 80);
    if (!trimmed) return;
    const existing = userSettings?.customExpenseCategories ?? [];
    if (existing.includes(trimmed)) {
      setCustomCategoryInput('');
      return;
    }
    try {
      await updateUserSettings(firebaseUser.uid, {
        customExpenseCategories: [...existing, trimmed].slice(0, 30),
      });
      setCustomCategoryInput('');
      showToast('Expense category added', { variant: 'success' });
    } catch (err) {
      showToast('Failed to add category', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleRemoveCustomExpenseCategory = async (cat: string) => {
    if (!firebaseUser) return;
    const existing = userSettings?.customExpenseCategories ?? [];
    try {
      await updateUserSettings(firebaseUser.uid, {
        customExpenseCategories: existing.filter((c) => c !== cat),
      });
      showToast('Expense category removed', { variant: 'info' });
    } catch (err) {
      showToast('Failed to remove category', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const onChangePassword = async (values: ChangePasswordFormValues) => {
    if (!firebaseUser) return;
    try {
      await reauthenticateWithPassword(values.currentPassword);
      await changeUserPassword(values.newPassword);
      await logSecurityAuditEvent({
        uid: firebaseUser.uid,
        actorName: userProfile?.name || firebaseUser.displayName || 'CEO',
        action: 'password_change',
        details: 'Updated account password after re-authentication.',
      });
      passwordForm.reset();
      showToast('Password updated', { description: 'Your password has been changed securely.', variant: 'success' });
      void loadSecurityTelemetry();
    } catch (err) {
      showToast('Password change failed', {
        description: getAuthErrorMessage(err),
        variant: 'error',
      });
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!firebaseUser) return;
    setRevokingSessions(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/account/revoke-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const json = (await res.json().catch(() => ({}))) as {
        revoked?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || 'Could not revoke sessions.');
      }
      await logSecurityAuditEvent({
        uid: firebaseUser.uid,
        actorName: userProfile?.name || firebaseUser.displayName || 'CEO',
        action: 'settings_security_change',
        details: json.revoked
          ? 'Revoked all active refresh tokens across devices.'
          : 'Requested session revocation (IAM unavailable on Starter Tier; signed out current session).',
      });
      showToast(json.revoked ? 'All sessions revoked' : 'Signed out this device', {
        description: json.message || 'Sign in again on your devices.',
        variant: json.revoked ? 'success' : 'info',
      });
      await logoutUser();
    } catch (err) {
      showToast('Session revocation error', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setRevokingSessions(false);
    }
  };

  const runDataExport = async (scope: 'personal' | 'business' | 'competitor' | 'all') => {
    if (!firebaseUser) return;
    const includeSalary =
      (scope === 'business' || scope === 'all') && includeSalaryExport;

    const execute = async () => {
      setExportingScope(scope);
      setExportProgress(null);
      try {
        const res = await exportGoalXDataZip({
          uid: firebaseUser.uid,
          actorName: userProfile?.name || firebaseUser.displayName || 'CEO',
          scope,
          includeSalary,
          onProgress: (p) => setExportProgress(p),
        });
        setLastExportResult(res);
        showToast('Export downloaded', {
          description: `${res.fileName} (${res.totalRecords} records, UTF-8 CSV + JSON).`,
          variant: 'success',
        });
      } catch (err) {
        showToast('Export failed', {
          description: err instanceof Error ? err.message : 'Unable to build export archive.',
          variant: 'error',
        });
      } finally {
        setExportingScope(null);
      }
    };

    if (includeSalary) {
      await ensureRecentReauthAndRun(
        'Confidential salary records are included in this export. Re-authenticate to continue.',
        execute
      );
    } else {
      await execute();
    }
  };

  const handleClearAllAiHistory = async () => {
    if (!firebaseUser?.uid) return;
    setClearingAiHistory(true);
    try {
      const res = await deleteAllAiHistory(firebaseUser.uid);
      await logSecurityAuditEvent({
        uid: firebaseUser.uid,
        actorName: userProfile?.name || firebaseUser.displayName || 'CEO',
        action: 'ai_history_delete',
        details: `Deleted ${res.deletedCount} AI CEO conversation, message, briefing, proposal, and baseline records.`,
      });
      setConfirmClearAiOpen(false);
      showToast('AI history cleared', {
        description: `Deleted ${res.deletedCount} AI records.`,
        variant: 'success',
      });
    } catch (err) {
      showToast('Failed to clear AI history', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setClearingAiHistory(false);
    }
  };

  const handleConfirmModuleDelete = async () => {
    if (!firebaseUser?.uid || !moduleDeleteTarget) return;
    setDeletingModule(true);
    try {
      const res = await deleteModuleData({
        uid: firebaseUser.uid,
        actorName: userProfile?.name || firebaseUser.displayName || 'CEO',
        moduleGroup: moduleDeleteTarget,
      });
      setModuleDeleteTarget(null);
      showToast('Module data deleted', {
        description: `Removed ${res.deletedCount} records in the ${moduleDeleteTarget} module.`,
        variant: 'success',
      });
    } catch (err) {
      showToast('Module deletion failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setDeletingModule(false);
    }
  };

  const handleAccountDeleteSubmit = async () => {
    if (!firebaseUser || deleteTypedConfirm !== 'DELETE') return;

    const executeDelete = async () => {
      setDeletingAccount(true);
      try {
        const token = await firebaseUser.getIdToken(true);
        const res = await fetch('/api/account/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ confirmText: 'DELETE' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((data as { error?: string }).error || 'Account deletion failed.');
        }
        setAccountDeletionReport(
          data as {
            deletedCollections: Record<string, number>;
            skippedCollections: string[];
            storageDeletedCount: number;
            authDeleted: boolean;
            warnings: string[];
          }
        );
        showToast('Account deletion completed', { variant: 'info' });
        if ((data as { authDeleted?: boolean }).authDeleted) {
          setTimeout(() => {
            void logoutUser();
          }, 2500);
        }
      } catch (err) {
        showToast('Account deletion failed', {
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'error',
        });
      } finally {
        setDeletingAccount(false);
      }
    };

    await ensureRecentReauthAndRun(
      'Deleting your entire GoalX account requires fresh authentication (within 5 minutes).',
      executeDelete
    );
  };

  const personalGoals = profileForm.watch('personalGoals');
  const watchedServices = companyForm.watch('services');
  const watchedCompanyGoals = companyForm.watch('goals');
  const watchedPhotoUrl = profileForm.watch('photoUrl');
  const customExpenseCats = userSettings?.customExpenseCategories ?? [];

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1F2937]">Settings</h1>
        <p className="mt-1 text-sm text-[#64748B]">
          Manage your profile, company, appearance, notifications, XP rules, finance defaults, security, and data.
        </p>
      </div>

      {/* 8-Tab Navigation */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-full overflow-x-auto">
        {TAB_ITEMS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchTab(tab.id)}
              className={`min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-white text-[#1F2937] shadow-xs'
                  : 'text-[#64748B] hover:text-[#1F2937]'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-[#DC2626]' : ''}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. PROFILE TAB */}
      {activeTab === 'profile' && (
        <form
          onSubmit={profileForm.handleSubmit(onSaveProfile)}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-5"
        >
          <div className="flex items-center gap-4 pb-4 border-b border-[#E2E8F0]">
            <div className="w-14 h-14 rounded-full bg-slate-100 border border-[#E2E8F0] overflow-hidden flex items-center justify-center text-base font-bold text-[#1F2937] shrink-0">
              {watchedPhotoUrl ? (
                <img
                  src={watchedPhotoUrl}
                  alt="Avatar preview"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                (profileForm.watch('name') || 'CX').slice(0, 2).toUpperCase()
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">Personal CEO Details</h2>
              <p className="text-xs text-[#64748B]">Updates reflect across your dashboard, briefings, and timezone rules.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Full Name</label>
              <input
                type="text"
                {...profileForm.register('name')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              />
              {profileForm.formState.errors.name && (
                <p className="mt-1 text-xs text-[#DC2626]">{profileForm.formState.errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Email</label>
              <input
                type="email"
                {...profileForm.register('email')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              />
              {profileForm.formState.errors.email && (
                <p className="mt-1 text-xs text-[#DC2626]">{profileForm.formState.errors.email.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Avatar Photo URL</label>
              <input
                type="url"
                placeholder="https://example.com/photo.jpg"
                {...profileForm.register('photoUrl')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              />
              {profileForm.formState.errors.photoUrl && (
                <p className="mt-1 text-xs text-[#DC2626]">{profileForm.formState.errors.photoUrl.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Timezone</label>
              <select
                {...profileForm.register('timezone')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
              Personal Role / Bio <span className="text-xs font-normal text-[#64748B]">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Founder & CEO at Gen Z Neural-X, building AI & software products from Sivakasi."
              {...profileForm.register('bio')}
              className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                Monthly Personal Income <span className="text-xs font-normal text-[#64748B]">(Optional)</span>
              </label>
              <input
                type="number"
                min={0}
                step="any"
                placeholder="Not set"
                {...profileForm.register('monthlyIncome', { valueAsNumber: true })}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Currency</label>
              <select
                {...profileForm.register('currency')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Personal Goals</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={personalGoalInput}
                onChange={(e) => setPersonalGoalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const trimmed = personalGoalInput.trim();
                    if (trimmed && personalGoals.length < 20) {
                      profileForm.setValue('personalGoals', [...personalGoals, trimmed.slice(0, 160)], {
                        shouldDirty: true,
                      });
                      setPersonalGoalInput('');
                    }
                  }
                }}
                placeholder="Add a personal goal"
                className="flex-1 h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = personalGoalInput.trim();
                  if (trimmed && personalGoals.length < 20) {
                    profileForm.setValue('personalGoals', [...personalGoals, trimmed.slice(0, 160)], {
                      shouldDirty: true,
                    });
                    setPersonalGoalInput('');
                  }
                }}
                className="h-11 px-4 rounded-xl bg-slate-100 text-sm font-medium text-[#1F2937] hover:bg-slate-200 inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
            {personalGoals.length > 0 && (
              <ul className="mt-3 divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
                {personalGoals.map((goal, idx) => (
                  <li key={idx} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                    <span className="text-[#1F2937]">{goal}</span>
                    <button
                      type="button"
                      onClick={() =>
                        profileForm.setValue(
                          'personalGoals',
                          personalGoals.filter((_, i) => i !== idx),
                          { shouldDirty: true }
                        )
                      }
                      className="p-1 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={profileForm.formState.isSubmitting}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
            >
              {profileForm.formState.isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>Save Profile</span>
            </button>
          </div>
        </form>
      )}

      {/* 2. COMPANY TAB */}
      {activeTab === 'company' && (
        <form
          onSubmit={companyForm.handleSubmit(onSaveCompany)}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">Company Configuration</h2>
              <p className="text-xs text-[#64748B]">Edit your business identity, service catalog, and operating footprint.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                companyForm.setValue('name', DEFAULT_COMPANY_PROFILE.name);
                companyForm.setValue('website', DEFAULT_COMPANY_PROFILE.website);
                companyForm.setValue('industry', DEFAULT_COMPANY_PROFILE.industry);
                companyForm.setValue('services', DEFAULT_COMPANY_PROFILE.services);
                companyForm.setValue('location', DEFAULT_COMPANY_PROFILE.location);
                showToast('Loaded Gen Z Neural-X defaults', { description: 'Click Save Company to apply.', variant: 'info' });
              }}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#64748B] hover:text-[#1F2937] hover:bg-slate-50 self-start sm:self-auto cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Gen Z Neural-X Defaults</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Company Name</label>
              <input
                type="text"
                {...companyForm.register('name')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              />
              {companyForm.formState.errors.name && (
                <p className="mt-1 text-xs text-[#DC2626]">{companyForm.formState.errors.name.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Website</label>
              <input
                type="url"
                {...companyForm.register('website')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              />
              {companyForm.formState.errors.website && (
                <p className="mt-1 text-xs text-[#DC2626]">{companyForm.formState.errors.website.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Industry</label>
            <input
              type="text"
              {...companyForm.register('industry')}
              className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Locations</label>
            <input
              type="text"
              {...companyForm.register('location')}
              className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Start Date</label>
              <input
                type="date"
                {...companyForm.register('startDate')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Company Stage</label>
              <select
                {...companyForm.register('stage')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              >
                <option value="">Not specified</option>
                {COMPANY_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">Services Offered</label>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set([...DEFAULT_COMPANY_PROFILE.services, ...watchedServices])).map((svc) => {
                const selected = watchedServices.includes(svc);
                return (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => {
                      const next = selected
                        ? watchedServices.filter((s) => s !== svc)
                        : [...watchedServices, svc].slice(0, 30);
                      companyForm.setValue('services', next, { shouldDirty: true });
                    }}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-red-50 border-red-200 text-[#DC2626]'
                        : 'bg-white border-[#E2E8F0] text-[#64748B] hover:text-[#1F2937]'
                    }`}
                  >
                    {svc}
                  </button>
                );
              })}
            </div>
            <div className="mt-2.5 flex gap-2">
              <input
                type="text"
                value={customServiceInput}
                onChange={(e) => setCustomServiceInput(e.target.value)}
                placeholder="Add another service"
                className="flex-1 h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937]"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = customServiceInput.trim();
                  if (trimmed && !watchedServices.includes(trimmed) && watchedServices.length < 30) {
                    companyForm.setValue('services', [...watchedServices, trimmed.slice(0, 160)], {
                      shouldDirty: true,
                    });
                    setCustomServiceInput('');
                  }
                }}
                className="h-10 px-3.5 rounded-xl bg-slate-100 text-xs font-medium text-[#1F2937] hover:bg-slate-200 cursor-pointer"
              >
                Add Service
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Business Goals</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={companyGoalInput}
                onChange={(e) => setCompanyGoalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const trimmed = companyGoalInput.trim();
                    if (trimmed && watchedCompanyGoals.length < 20) {
                      companyForm.setValue('goals', [...watchedCompanyGoals, trimmed.slice(0, 160)], {
                        shouldDirty: true,
                      });
                      setCompanyGoalInput('');
                    }
                  }
                }}
                placeholder="Add a company goal"
                className="flex-1 h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937]"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = companyGoalInput.trim();
                  if (trimmed && watchedCompanyGoals.length < 20) {
                    companyForm.setValue('goals', [...watchedCompanyGoals, trimmed.slice(0, 160)], {
                      shouldDirty: true,
                    });
                    setCompanyGoalInput('');
                  }
                }}
                className="h-11 px-4 rounded-xl bg-slate-100 text-sm font-medium text-[#1F2937] hover:bg-slate-200 inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
            {watchedCompanyGoals.length > 0 && (
              <ul className="mt-3 divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
                {watchedCompanyGoals.map((goal, idx) => (
                  <li key={idx} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                    <span className="text-[#1F2937]">{goal}</span>
                    <button
                      type="button"
                      onClick={() =>
                        companyForm.setValue(
                          'goals',
                          watchedCompanyGoals.filter((_, i) => i !== idx),
                          { shouldDirty: true }
                        )
                      }
                      className="p-1 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={companyForm.formState.isSubmitting}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
            >
              {companyForm.formState.isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>Save Company</span>
            </button>
          </div>
        </form>
      )}

      {/* 3. APPEARANCE TAB */}
      {activeTab === 'appearance' && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">Theme &amp; Display Preferences</h2>
            <p className="text-xs text-[#64748B]">
              Light theme is the default. Dark theme keeps GoalX red (#DC2626) as the primary accent with AA contrast.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setThemeDraft('light')}
              className={`p-4 rounded-2xl border text-left transition-colors cursor-pointer ${
                themeDraft === 'light'
                  ? 'border-[#DC2626] bg-red-50/40'
                  : 'border-[#E2E8F0] hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#1F2937]">
                  <Sun className="w-4 h-4 text-[#F59E0B]" />
                  Light Theme (Default)
                </span>
                {themeDraft === 'light' && <CheckCircle2 className="w-4 h-4 text-[#DC2626]" />}
              </div>
              <p className="mt-1 text-xs text-[#64748B]">Crisp white cards on light slate canvas.</p>
            </button>

            <button
              type="button"
              onClick={() => setThemeDraft('dark')}
              className={`p-4 rounded-2xl border text-left transition-colors cursor-pointer ${
                themeDraft === 'dark'
                  ? 'border-[#DC2626] bg-red-50/40'
                  : 'border-[#E2E8F0] hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#1F2937]">
                  <Moon className="w-4 h-4 text-[#2563EB]" />
                  Dark Theme
                </span>
                {themeDraft === 'dark' && <CheckCircle2 className="w-4 h-4 text-[#DC2626]" />}
              </div>
              <p className="mt-1 text-xs text-[#64748B]">Deep slate surfaces with high-contrast #F1F5F9 text.</p>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Display Density</label>
              <select
                value={densityDraft}
                onChange={(e) => setDensityDraft(e.target.value as 'comfortable' | 'compact')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white"
              >
                <option value="comfortable">Comfortable (Default)</option>
                <option value="compact">Compact (Tighter spacing)</option>
              </select>
            </div>
            <div className="flex flex-col justify-end">
              <label className="p-3 rounded-xl border border-[#E2E8F0] flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-[#1F2937]">Reduced Motion</p>
                  <p className="text-xs text-[#64748B]">Minimize UI transitions and animations.</p>
                </div>
                <input
                  type="checkbox"
                  checked={reducedMotionDraft}
                  onChange={(e) => setReducedMotionDraft(e.target.checked)}
                  className="w-5 h-5 accent-[#DC2626] cursor-pointer"
                />
              </label>
            </div>
          </div>

          <label className="p-3.5 rounded-xl border border-[#E2E8F0] flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-[#1F2937]">Collapse Desktop Sidebar by Default</p>
              <p className="text-xs text-[#64748B]">Show compact icon rail on wider viewports.</p>
            </div>
            <input
              type="checkbox"
              checked={sidebarCollapsedDraft}
              onChange={(e) => setSidebarCollapsedDraft(e.target.checked)}
              className="w-5 h-5 accent-[#DC2626] cursor-pointer"
            />
          </label>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#E2E8F0]">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => void onSaveAppearance()}
              disabled={savingAppearance}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
            >
              {savingAppearance ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Appearance</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. NOTIFICATIONS TAB */}
      {activeTab === 'notifications' && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-semibold text-[#1F2937]">Notification Preferences</h2>
            <p className="text-xs text-[#64748B]">
              Control which alert categories enter your Notification Center, quiet hours, and optional browser push alerts.
            </p>
          </div>

          {/* Browser Push Control */}
          <div className="rounded-xl border border-[#E2E8F0] p-4 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1F2937]">Browser Push Notifications</p>
                <p className="text-xs text-[#64748B]">
                  Permission is requested only when you click &ldquo;Enable notifications&rdquo;.
                </p>
              </div>
              {pushPermission === 'default' && (
                <button
                  type="button"
                  onClick={() => void handleEnableBrowserPushClick()}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#DC2626] text-white text-xs font-medium hover:bg-[#B91C1C] cursor-pointer shrink-0"
                >
                  Enable notifications
                </button>
              )}
              {pushPermission === 'granted' && (
                <label className="inline-flex items-center gap-2 text-xs font-medium text-[#1F2937] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={browserPushDraft}
                    onChange={(e) => setBrowserPushDraft(e.target.checked)}
                    className="w-4 h-4 accent-[#DC2626]"
                  />
                  <span>Deliver Desktop Alerts</span>
                </label>
              )}
              {pushPermission === 'unsupported' && (
                <span className="text-xs text-[#64748B]">Unsupported in this browser</span>
              )}
            </div>
            {pushPermission === 'denied' && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-950">
                <BellOff className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                <span>
                  Notifications are currently blocked by your browser. Click the site-info icon in the address bar &rarr; Site settings &rarr; Notifications &rarr; Allow, then reload.
                </span>
              </div>
            )}
          </div>

          <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl px-4">
            <label className="py-3.5 flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-sm font-semibold text-[#1F2937]">Enable Unified Notifications</p>
                <p className="text-xs text-[#64748B]">Master switch for GoalX operational and executive alerts.</p>
              </div>
              <input
                type="checkbox"
                checked={notifMasterEnabled}
                onChange={(e) => setNotifMasterEnabled(e.target.checked)}
                className="w-5 h-5 accent-[#DC2626] cursor-pointer"
              />
            </label>
            <label className="py-3.5 flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-[#1F2937]">Weekly Executive Digest</p>
                <p className="text-xs text-[#64748B]">Include weekly performance digest flag in account preferences.</p>
              </div>
              <input
                type="checkbox"
                checked={emailDigestDraft}
                onChange={(e) => setEmailDigestDraft(e.target.checked)}
                className="w-5 h-5 accent-[#DC2626] cursor-pointer"
              />
            </label>
          </div>

          {/* 11 Category Toggles */}
          <div>
            <h3 className="text-sm font-semibold text-[#1F2937] mb-3">Notification Categories</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {NOTIFICATION_CATEGORY_DEFS.map((cat) => {
                const enabled = notifPrefsDraft.categories[cat.key] ?? true;
                return (
                  <label
                    key={cat.key}
                    className="p-3 rounded-xl border border-[#E2E8F0] flex items-start justify-between gap-3 cursor-pointer hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-xs font-semibold text-[#1F2937]">{cat.label}</p>
                      <p className="text-[11px] text-[#64748B] mt-0.5">{cat.description}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) =>
                        setNotifPrefsDraft((prev) => ({
                          ...prev,
                          categories: { ...prev.categories, [cat.key]: e.target.checked },
                        }))
                      }
                      className="w-4 h-4 mt-0.5 accent-[#DC2626] shrink-0 cursor-pointer"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {/* Quiet Hours */}
          <div className="rounded-xl border border-[#E2E8F0] p-4 space-y-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-sm font-semibold text-[#1F2937]">Quiet Hours</p>
                <p className="text-xs text-[#64748B]">Suppress browser desktop popup alerts during off-hours.</p>
              </div>
              <input
                type="checkbox"
                checked={notifPrefsDraft.quietHoursEnabled}
                onChange={(e) =>
                  setNotifPrefsDraft((prev) => ({ ...prev, quietHoursEnabled: e.target.checked }))
                }
                className="w-5 h-5 accent-[#DC2626] cursor-pointer"
              />
            </label>
            {notifPrefsDraft.quietHoursEnabled && (
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">Start Time</label>
                  <input
                    type="time"
                    value={notifPrefsDraft.quietHoursStart}
                    onChange={(e) =>
                      setNotifPrefsDraft((prev) => ({ ...prev, quietHoursStart: e.target.value }))
                    }
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">End Time</label>
                  <input
                    type="time"
                    value={notifPrefsDraft.quietHoursEnd}
                    onChange={(e) =>
                      setNotifPrefsDraft((prev) => ({ ...prev, quietHoursEnd: e.target.value }))
                    }
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm tabular-nums"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void onSaveNotifications()}
              disabled={savingNotifs}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
            >
              {savingNotifs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Notification Preferences</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. GAMIFICATION TAB */}
      {activeTab === 'gamification' && (
        <form
          onSubmit={gamificationForm.handleSubmit(onSaveGamification)}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">Gamification XP Values</h2>
              <p className="text-xs text-[#64748B]">
                Configure default XP points per verified executive action (0 to 5,000 XP).
              </p>
            </div>
            <button
              type="button"
              onClick={() => gamificationForm.reset(DEFAULT_GAMIFICATION_XP_CONFIG)}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#64748B] hover:text-[#1F2937] cursor-pointer self-start"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(
              [
                ['taskComplete', 'Task Completed'],
                ['goalComplete', 'Goal Completed'],
                ['milestoneComplete', 'Milestone Completed'],
                ['habitCheckIn', 'Daily Habit Check-in'],
                ['projectComplete', 'Project Completed'],
                ['clientWon', 'Lead Converted / Won'],
                ['competitorSurpassed', 'Competitor Surpassed'],
                ['monthlyReviewSaved', 'Monthly Review Saved'],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label className="block text-xs font-medium text-[#1F2937] mb-1.5">{label}</label>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  {...gamificationForm.register(field, { valueAsNumber: true })}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm tabular-nums text-[#1F2937]"
                />
              </div>
            ))}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={gamificationForm.formState.isSubmitting}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
            >
              {gamificationForm.formState.isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>Save XP Rules</span>
            </button>
          </div>
        </form>
      )}

      {/* 6. FINANCE TAB */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          <form
            onSubmit={financePrefsForm.handleSubmit(onSaveFinancePrefs)}
            className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-5"
          >
            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">Finance &amp; Accounting Defaults</h2>
              <p className="text-xs text-[#64748B]">
                Configure default accounting basis, sales/delivery commission rule, and currency display preferences.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                  Default Accounting Basis
                </label>
                <select
                  {...financePrefsForm.register('accountingBasis')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white"
                >
                  <option value="cash">Cash Basis (Collections received)</option>
                  <option value="accrual">Accrual Basis (Invoiced revenue)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                  Default Commission (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  {...financePrefsForm.register('defaultCommissionPct', { valueAsNumber: true })}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums text-[#1F2937]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Default Currency</label>
                <select
                  {...financePrefsForm.register('currency')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Currency Format</label>
                <select
                  {...financePrefsForm.register('currencyFormat')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white"
                >
                  <option value="indian">Indian Grouping (₹1,00,000)</option>
                  <option value="standard">International Grouping (100,000)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Week Starts On</label>
                <select
                  {...financePrefsForm.register('weekStartsOn')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white"
                >
                  <option value="monday">Monday</option>
                  <option value="sunday">Sunday</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={financePrefsForm.formState.isSubmitting}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
              >
                {financePrefsForm.formState.isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Save Finance Rules</span>
              </button>
            </div>
          </form>

          {/* Custom Business Expense Categories */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-semibold text-[#1F2937]">Business Expense Categories</h3>
              <p className="text-xs text-[#64748B]">
                Built-in categories are always available; add custom company categories below.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_COMPANY_EXPENSE_CATEGORIES.map((c) => (
                <span
                  key={c}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs text-[#64748B]"
                >
                  {c}
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customCategoryInput}
                onChange={(e) => setCustomCategoryInput(e.target.value)}
                placeholder="Add custom expense category"
                className="flex-1 h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm"
              />
              <button
                type="button"
                onClick={() => void handleAddCustomExpenseCategory()}
                className="h-10 px-4 rounded-xl bg-slate-100 text-xs font-medium text-[#1F2937] hover:bg-slate-200 cursor-pointer"
              >
                Add Category
              </button>
            </div>
            {customExpenseCats.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customExpenseCats.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-red-200 bg-red-50 text-xs font-medium text-[#DC2626]"
                  >
                    <span>{c}</span>
                    <button
                      type="button"
                      onClick={() => void handleRemoveCustomExpenseCategory(c)}
                      className="hover:opacity-75 cursor-pointer"
                      aria-label={`Remove ${c}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. SECURITY TAB */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Login Providers & Session Status */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#1F2937]">Account Authentication &amp; Sessions</h2>
                <p className="text-xs text-[#64748B]">
                  Signed in as {firebaseUser?.email} · Providers:{' '}
                  {providerIds.length > 0 ? providerIds.join(', ') : 'Firebase Auth'}
                  {authAgeSeconds !== null && ` · Last verified ${Math.floor(authAgeSeconds / 60)}m ago`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => logoutUser()}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3.5 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-[#DC2626]" />
                  <span>Sign Out This Device</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleRevokeAllSessions()}
                  disabled={revokingSessions}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/40 px-3.5 py-2 text-xs font-medium text-[#DC2626] hover:bg-red-50 cursor-pointer disabled:opacity-50"
                >
                  {revokingSessions && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Sign Out All Devices</span>
                </button>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#DC2626]" />
              <h3 className="text-base font-semibold text-[#1F2937]">Change Password</h3>
            </div>
            {hasPasswordProvider ? (
              <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Current Password</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    {...passwordForm.register('currentPassword')}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm"
                  />
                  {passwordForm.formState.errors.currentPassword && (
                    <p className="mt-1 text-xs text-[#DC2626]">
                      {passwordForm.formState.errors.currentPassword.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">New Password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    {...passwordForm.register('newPassword')}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm"
                  />
                  {passwordForm.formState.errors.newPassword && (
                    <p className="mt-1 text-xs text-[#DC2626]">
                      {passwordForm.formState.errors.newPassword.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    {...passwordForm.register('confirmNewPassword')}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm"
                  />
                  {passwordForm.formState.errors.confirmNewPassword && (
                    <p className="mt-1 text-xs text-[#DC2626]">
                      {passwordForm.formState.errors.confirmNewPassword.message}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={passwordForm.formState.isSubmitting}
                  className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
                >
                  {passwordForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Update Password</span>
                </button>
              </form>
            ) : (
              <p className="text-xs text-[#64748B]">
                Your account signs in via Google ({firebaseUser?.email}). Password management is handled through your Google Account security settings.
              </p>
            )}
          </div>

          {/* Privacy Notice */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-2">
            <h3 className="text-base font-semibold text-[#1F2937]">Privacy &amp; Data Protection</h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              All GoalX records are scoped strictly to your authenticated Firebase UID and protected by owner-only Firestore &amp; Storage security rules. Sensitive compensation collections require explicit opt-in and fresh re-authentication during exports. AI CEO queries are rate-limited, verified server-side, and never receive other users&apos; data or raw API keys.
            </p>
          </div>

          {/* Security Audit Logs */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#1F2937]">Recent Security Audit Logs</h3>
              <button
                type="button"
                onClick={() => void loadSecurityTelemetry()}
                className="text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
              >
                Refresh
              </button>
            </div>
            {auditLoading ? (
              <p className="text-xs text-[#64748B]">Loading security logs...</p>
            ) : auditLogs.length === 0 ? (
              <p className="text-xs text-[#64748B]">No security audit events logged yet.</p>
            ) : (
              <ul className="divide-y divide-[#E2E8F0] text-xs">
                {auditLogs.map((log) => (
                  <li key={log.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div>
                      <span className="font-semibold text-[#1F2937] uppercase tracking-wide text-[11px]">
                        {log.action.replace(/_/g, ' ')}
                      </span>
                      <p className="text-[#64748B] mt-0.5">{log.details}</p>
                    </div>
                    <span className="text-[#64748B] tabular-nums shrink-0">
                      {log.timestampIso.slice(0, 19).replace('T', ' ')} UTC
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 8. DATA MANAGEMENT TAB */}
      {activeTab === 'data' && (
        <div className="space-y-6">
          {/* Export Data */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">Export Your GoalX Data (UTF-8 CSV + JSON ZIP)</h2>
              <p className="text-xs text-[#64748B]">
                Every CSV uses UTF-8 with BOM (₹ and Tamil characters open cleanly in Excel) and formula neutralization.
              </p>
            </div>

            <label className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSalaryExport}
                onChange={(e) => setIncludeSalaryExport(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-[#DC2626] cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-[#1F2937]">
                  Include confidential salary &amp; compensation records (optional)
                </span>
                <p className="text-[#64748B] mt-0.5">
                  Excluded by default. Checking this requires fresh re-authentication and logs a security audit entry.
                </p>
              </div>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(
                [
                  ['personal', 'Export Personal Data'],
                  ['business', 'Export Business Data'],
                  ['competitor', 'Export Competitor Research'],
                  ['all', 'Export Full Account ZIP'],
                ] as const
              ).map(([scope, label]) => (
                <button
                  key={scope}
                  type="button"
                  disabled={Boolean(exportingScope)}
                  onClick={() => void runDataExport(scope)}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs font-semibold text-[#1F2937] hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  {exportingScope === scope ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#DC2626]" />
                  ) : (
                    <Download className="w-4 h-4 text-[#DC2626]" />
                  )}
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {exportProgress && exportingScope && (
              <div className="rounded-xl border border-[#E2E8F0] p-3 text-xs space-y-1.5">
                <div className="flex justify-between font-medium text-[#1F2937]">
                  <span>Exporting {exportProgress.label}...</span>
                  <span className="tabular-nums">
                    {exportProgress.current} / {exportProgress.total} ({exportProgress.recordsFound} records)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-[#DC2626] transition-all"
                    style={{ width: `${Math.round((exportProgress.current / exportProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {lastExportResult && !exportingScope && (
              <p className="text-xs text-[#16A34A] font-medium">
                Last export: {lastExportResult.fileName} ({lastExportResult.totalRecords} records).
              </p>
            )}
          </div>

          {/* Delete Specific Module Data */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-semibold text-[#1F2937]">Delete Specific Module Data</h3>
              <p className="text-xs text-[#64748B]">
                Remove records from a single module while keeping your account and other modules intact. Immutable audit trails remain preserved.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmClearAiOpen(true)}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3.5 py-2 text-xs font-medium text-[#DC2626] hover:bg-red-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete AI History</span>
              </button>
              {(
                [
                  ['notifications', 'Delete Notifications'],
                  ['personal', 'Delete Personal Data'],
                  ['competitor', 'Delete Competitor Research'],
                  ['business', 'Delete Business Data'],
                ] as const
              ).map(([mod, label]) => (
                <button
                  key={mod}
                  type="button"
                  onClick={() => setModuleDeleteTarget(mod)}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3.5 py-2 text-xs font-medium text-[#1F2937] hover:border-red-300 hover:text-[#DC2626] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Delete Entire Account */}
          <div className="bg-white border border-red-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#DC2626] mt-0.5 shrink-0" />
              <div>
                <h3 className="text-base font-semibold text-[#DC2626]">Delete Entire Account</h3>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  Permanently deletes your GoalX profile, company settings, Personal data, Business &amp; Finance data (including confidential salary records), Competitor Research, AI CEO history, Notifications, uploaded receipt attachments, and Firebase Authentication login. Requires fresh re-authentication and typing DELETE.
                </p>
              </div>
            </div>

            {accountDeletionReport && (
              <div className="rounded-xl border border-[#E2E8F0] p-4 text-xs space-y-2">
                <p className="font-semibold text-[#1F2937]">Account Deletion Summary</p>
                <p className="text-[#64748B]">
                  Auth user deleted: <strong>{accountDeletionReport.authDeleted ? 'Yes' : 'No'}</strong> ·
                  Storage receipts removed: <strong>{accountDeletionReport.storageDeletedCount}</strong>
                </p>
                {accountDeletionReport.warnings.length > 0 && (
                  <ul className="list-disc pl-4 text-amber-800 space-y-0.5">
                    {accountDeletionReport.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setDeleteTypedConfirm('');
                setAccountDeleteModalOpen(true);
              }}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete My GoalX Account</span>
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={confirmClearAiOpen}
        title="Delete all GoalX AI CEO history?"
        description="This permanently deletes all your AI conversations, messages, generated briefings, action proposals, and baseline reviews."
        confirmLabel="Delete All AI History"
        variant="danger"
        loading={clearingAiHistory}
        onConfirm={handleClearAllAiHistory}
        onCancel={() => setConfirmClearAiOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(moduleDeleteTarget)}
        title={`Delete all ${moduleDeleteTarget || ''} module data?`}
        description="This permanently deletes your records in the selected module. Immutable financial/security audit logs remain protected."
        confirmLabel="Delete Module Data"
        variant="danger"
        loading={deletingModule}
        onConfirm={handleConfirmModuleDelete}
        onCancel={() => setModuleDeleteTarget(null)}
      />

      {/* Typed DELETE Account Deletion Modal */}
      {accountDeleteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#DC2626]">Confirm Permanent Account Deletion</h3>
                <p className="text-xs text-[#64748B] mt-1">
                  This action cannot be undone. We recommend exporting a full backup first.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAccountDeleteModalOpen(false)}
                className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-950 space-y-1">
              <p className="font-semibold">Everything below will be permanently removed:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>User profile, company profile, and workspace settings</li>
                <li>Personal goals, milestones, habits, income/expenses, savings, calendar events</li>
                <li>Services, CRM leads, clients, projects, invoices, payments, expenses, payroll &amp; receipts</li>
                <li>Competitors, evidence, scorecards, gaps, and AI CEO history</li>
                <li>Your Firebase Authentication account (non-PII audit stub recorded in accountDeletionLogs)</li>
              </ul>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F2937] mb-1">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
                type="text"
                value={deleteTypedConfirm}
                onChange={(e) => setDeleteTypedConfirm(e.target.value)}
                placeholder="DELETE"
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm font-mono"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAccountDeleteModalOpen(false)}
                disabled={deletingAccount}
                className="min-h-[40px] px-4 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#1F2937] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteTypedConfirm !== 'DELETE' || deletingAccount}
                onClick={() => void handleAccountDeleteSubmit()}
                className="min-h-[40px] inline-flex items-center gap-2 px-4 rounded-xl bg-[#DC2626] text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-40 cursor-pointer"
              >
                {deletingAccount && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Permanently Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-Authentication Modal */}
      {reauthModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#1F2937]">Verify Your Identity</h3>
                <p className="text-xs text-[#64748B] mt-1">{reauthModal.reason}</p>
              </div>
              <button
                type="button"
                onClick={() => setReauthModal({ open: false, reason: '', onSuccess: null })}
                className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reauthError && (
              <p className="text-xs text-[#DC2626] bg-red-50 border border-red-200 rounded-xl p-2.5">
                {reauthError}
              </p>
            )}

            {hasPasswordProvider && (
              <form onSubmit={handleCompleteReauthWithPassword} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F2937] mb-1">
                    Confirm Current Password
                  </label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={reauthPassword}
                    onChange={(e) => setReauthPassword(e.target.value)}
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={reauthLoading || !reauthPassword}
                  className="w-full min-h-[40px] rounded-xl bg-[#DC2626] text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
                >
                  {reauthLoading ? 'Verifying...' : 'Verify with Password'}
                </button>
              </form>
            )}

            {hasGoogleProvider && (
              <button
                type="button"
                disabled={reauthLoading}
                onClick={() => void handleCompleteReauthWithGoogle()}
                className="w-full min-h-[42px] rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#1F2937] hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                {reauthLoading ? 'Opening Google...' : 'Re-authenticate with Google'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
