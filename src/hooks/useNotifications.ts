import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { getFollowUpBuckets } from '../lib/businessUtils';
import { ROUTES } from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getTodayDateString } from '../lib/goalUtils';
import { formatINR, getCurrentMonthKey } from '../lib/moneyUtils';
import {
  deleteUnifiedNotification,
  DeterministicNotificationInput,
  isCategoryEnabled,
  markAllUnifiedNotificationsRead,
  markUnifiedNotificationRead,
  syncDeterministicNotifications,
} from '../services/notificationService';
import { NotificationItem } from '../types';
import { useAuth } from './useAuth';
import { useBusinessDataContext } from './useBusinessData';
import { useCompetitionAnalytics } from './useCompetitionAnalytics';
import { useCompetitors } from './useCompetitors';
import { useInvoices } from './useInvoices';
import { usePersonalData } from './usePersonalData';

export function useNotifications(options?: { enableSync?: boolean }) {
  const enableSync = options?.enableSync ?? true;
  const { firebaseUser, userProfile, userSettings } = useAuth();
  const { goals, habits, habitLogs } = usePersonalData();
  const {
    leads,
    clients,
    projects,
    teamMembers,
    salaryRecords,
    inAppNotifications,
    loading: bizLoading,
  } = useBusinessDataContext();
  const { derivedInvoices } = useInvoices();
  const { reviewsDue, staleCompetitors } = useCompetitors();
  const {
    activeTarget,
    activeTargetSurpassEval,
    overdueOrDueGaps,
    monthlyReviewDueForTarget,
  } = useCompetitionAnalytics();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const syncedThisSessionRef = useRef<Set<string>>(new Set());

  const uid = firebaseUser?.uid ?? '';
  const todayStr = getTodayDateString();
  const currentMonth = getCurrentMonthKey();

  useEffect(() => {
    if (!uid || !userProfile?.onboardingCompleted) {
      setNotifications([]);
      setLoading(false);
      syncedThisSessionRef.current.clear();
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'notifications'), where('ownerId', '==', uid), limit(250)),
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<NotificationItem, 'id'>) }) as NotificationItem
        );
        list.sort((a, b) => {
          const tb = b.createdAt?.toMillis?.() ?? 0;
          const ta = a.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setNotifications(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'notifications');
      }
    );

    return () => unsub();
  }, [uid, userProfile?.onboardingCompleted]);

  // Synchronize deterministic notifications across modules respecting category preferences
  useEffect(() => {
    if (!enableSync || !uid || !userProfile?.onboardingCompleted || bizLoading || loading) {
      return;
    }
    const masterEnabled = userSettings?.notificationsEnabled ?? true;
    if (!masterEnabled) return;

    const prefs = userSettings?.notificationPrefs;
    const candidates: DeterministicNotificationInput[] = [];
    const clientMap = new Map(clients.map((c) => [c.id, c]));

    // 1. Budgets (mirror legacy inAppNotifications into unified collection)
    if (isCategoryEnabled(prefs, 'deadlines', masterEnabled)) {
      for (const n of inAppNotifications) {
        candidates.push({
          id: `${n.type}_${n.sourceId}_${n.month}`,
          uid,
          category: 'deadlines',
          type: n.type,
          severity: n.type === 'budget_100' ? 'critical' : 'warning',
          title: n.title,
          message: n.message,
          link: `${ROUTES.COMPANY_FINANCE}?tab=budgets`,
          sourceType: 'budget',
          sourceId: n.sourceId,
        });
      }
    }

    // 2. Overdue & due-soon invoices
    if (isCategoryEnabled(prefs, 'payments', masterEnabled)) {
      for (const d of derivedInvoices) {
        if (d.status === 'Overdue') {
          const client = clientMap.get(d.invoice.clientId);
          candidates.push({
            id: `invoice_overdue_${d.invoice.id}`,
            uid,
            category: 'payments',
            type: 'invoice_overdue',
            severity: 'critical',
            title: `Overdue Invoice: ${d.invoice.invoiceNumber}`,
            message: `${client?.clientName || 'Client'} owes ${formatINR(d.balancePaise)} (${d.daysOverdue}d overdue, due ${d.invoice.dueDate}).`,
            link: `${ROUTES.COMPANY_FINANCE}?tab=invoices`,
            sourceType: 'invoice',
            sourceId: d.invoice.id,
          });
        }
      }
    }

    // 3. Pending monthly payroll
    if (isCategoryEnabled(prefs, 'attendance', masterEnabled)) {
      const paidIds = new Set(
        salaryRecords
          .filter((s) => s.month === currentMonth && s.status === 'Paid')
          .map((s) => s.memberId)
      );
      const pendingMembers = teamMembers.filter((m) => m.status === 'Active' && !paidIds.has(m.id));
      if (pendingMembers.length > 0 && Number(todayStr.slice(8, 10)) >= 25) {
        candidates.push({
          id: `payroll_pending_${uid}_${currentMonth}`,
          uid,
          category: 'attendance',
          type: 'payroll_pending',
          severity: 'warning',
          title: `Monthly Payroll Pending (${currentMonth})`,
          message: `${pendingMembers.length} active team member${pendingMembers.length === 1 ? '' : 's'} awaiting salary settlement for ${currentMonth}.`,
          link: `${ROUTES.COMPANY_FINANCE}?tab=salaries`,
          sourceType: 'salary',
          sourceId: currentMonth,
        });
      }
    }

    // 4. CRM Follow-ups
    if (isCategoryEnabled(prefs, 'follow_ups', masterEnabled)) {
      const buckets = getFollowUpBuckets(leads, todayStr);
      for (const l of buckets.overdueFollowUps.slice(0, 8)) {
        candidates.push({
          id: `lead_followup_overdue_${l.id}_${l.followUpDate}`,
          uid,
          category: 'follow_ups',
          type: 'lead_followup_overdue',
          severity: 'warning',
          title: `Overdue Follow-up: ${l.clientName}`,
          message: `Scheduled follow-up on ${l.followUpDate} (${l.status}).`,
          link: ROUTES.COMPANY_LEADS,
          sourceType: 'lead',
          sourceId: l.id,
        });
      }
    }

    // 5. Projects near/past deadline
    if (isCategoryEnabled(prefs, 'projects', masterEnabled)) {
      for (const p of projects) {
        if (
          (p.status === 'Planning' || p.status === 'In Progress') &&
          p.dueDate &&
          p.dueDate <= todayStr
        ) {
          candidates.push({
            id: `project_due_${p.id}_${p.dueDate}`,
            uid,
            category: 'projects',
            type: 'project_deadline',
            severity: 'warning',
            title: `Project Deadline Reached: ${p.title}`,
            message: `Project status is ${p.status} with deadline ${p.dueDate}.`,
            link: ROUTES.PROJECTS,
            sourceType: 'project',
            sourceId: p.id,
          });
        }
      }
    }

    // 6. Personal Goals overdue
    if (isCategoryEnabled(prefs, 'goals', masterEnabled)) {
      for (const g of goals) {
        if (
          g.status !== 'Completed' &&
          g.status !== 'Archived' &&
          g.targetDate &&
          g.targetDate < todayStr
        ) {
          const pct = g.targetValue > 0 ? Math.min(100, Math.round((g.currentValue / g.targetValue) * 100)) : 0;
          candidates.push({
            id: `goal_overdue_${g.id}_${g.targetDate}`,
            uid,
            category: 'goals',
            type: 'goal_overdue',
            severity: 'warning',
            title: `Goal Target Date Passed: ${g.title}`,
            message: `Target date was ${g.targetDate} (${pct}% complete).`,
            link: ROUTES.GOALS,
            sourceType: 'goal',
            sourceId: g.id,
          });
        }
      }
    }

    // 7. Habits reminder if active habits unchecked today
    if (isCategoryEnabled(prefs, 'habits', masterEnabled)) {
      const activeHabits = habits.filter((h) => h.active);
      const checkedToday = new Set(
        habitLogs.filter((l) => l.date === todayStr && l.completed).map((l) => l.habitId)
      );
      const pendingHabitsCount = activeHabits.filter((h) => !checkedToday.has(h.id)).length;
      if (pendingHabitsCount > 0 && new Date().getHours() >= 18) {
        candidates.push({
          id: `habit_evening_${uid}_${todayStr}`,
          uid,
          category: 'habits',
          type: 'habit_reminder',
          severity: 'info',
          title: `Daily Habits Check-in (${todayStr})`,
          message: `${pendingHabitsCount} active habit${pendingHabitsCount === 1 ? '' : 's'} remaining today.`,
          link: ROUTES.HABITS,
          sourceType: 'habit',
          sourceId: todayStr,
        });
      }
    }

    // 8. Competitor Reviews & Stale Evidence
    if (isCategoryEnabled(prefs, 'competitor_reviews', masterEnabled)) {
      for (const r of reviewsDue.slice(0, 6)) {
        candidates.push({
          id: `comp_review_${r.competitor.id}_${r.competitor.nextReviewDate}`,
          uid,
          category: 'competitor_reviews',
          type: 'competitor_review_due',
          severity: 'warning',
          title: `Competitor Review Due: ${r.competitor.companyName}`,
          message: `Scheduled review date was ${r.competitor.nextReviewDate}.`,
          link: `${ROUTES.COMPETITION}/${r.competitor.id}`,
          sourceType: 'competitor',
          sourceId: r.competitor.id,
        });
      }
      for (const s of staleCompetitors.slice(0, 6)) {
        candidates.push({
          id: `comp_stale_${s.competitor.id}_${currentMonth}`,
          uid,
          category: 'competitor_reviews',
          type: 'competitor_evidence_stale',
          severity: 'info',
          title: `Stale Competitor Evidence: ${s.competitor.companyName}`,
          message: `Evidence was last verified over 90 days ago (${s.summary.lastVerifiedDate || 'Unknown'}).`,
          link: `${ROUTES.COMPETITION}/${s.competitor.id}`,
          sourceType: 'competitor',
          sourceId: s.competitor.id,
        });
      }
    }

    // 9. Competitive Targets, Gaps & Surpass Readiness
    if (isCategoryEnabled(prefs, 'targets', masterEnabled)) {
      for (const gap of overdueOrDueGaps.slice(0, 6)) {
        candidates.push({
          id: `gap_due_${gap.id}_${gap.deadline || currentMonth}`,
          uid,
          category: 'targets',
          type: 'competitive_gap_due',
          severity: 'warning',
          title: `Competitive Gap Due: ${gap.title}`,
          message: `Deadline ${gap.deadline} (${gap.progressPct}% complete).`,
          link: ROUTES.COMPETITION_GAPS,
          sourceType: 'competitiveGap',
          sourceId: gap.id,
        });
      }
      if (monthlyReviewDueForTarget && activeTarget) {
        candidates.push({
          id: `monthly_scorecard_${activeTarget.id}_${currentMonth}`,
          uid,
          category: 'targets',
          type: 'monthly_scorecard_due',
          severity: 'info',
          title: `Monthly Scorecard Snapshot Due: ${activeTarget.companyName}`,
          message: `Record ${currentMonth} progression snapshot for your active target.`,
          link: ROUTES.COMPETITION_SCORECARDS,
          sourceType: 'competitor',
          sourceId: activeTarget.id,
        });
      }
    }

    if (
      isCategoryEnabled(prefs, 'achievements', masterEnabled) &&
      activeTargetSurpassEval?.canConfirmSurpassed &&
      activeTarget
    ) {
      candidates.push({
        id: `surpass_ready_${activeTarget.id}_${currentMonth}`,
        uid,
        category: 'achievements',
        type: 'surpass_ready',
        severity: 'success',
        title: `Ready to Surpass: ${activeTarget.companyName}`,
        message: `All 6 Surpass checks passed for ${activeTarget.companyName}. Open Scorecards to confirm.`,
        link: ROUTES.COMPETITION_SCORECARDS,
        sourceType: 'competitor',
        sourceId: activeTarget.id,
      });
    }

    const existingIds = new Set(notifications.map((n) => n.id));
    for (const id of syncedThisSessionRef.current) existingIds.add(id);

    const freshCandidates = candidates.filter((c) => !existingIds.has(c.id));
    if (freshCandidates.length === 0) return;

    for (const c of freshCandidates) {
      syncedThisSessionRef.current.add(c.id);
    }

    void syncDeterministicNotifications(freshCandidates, existingIds, {
      browserPushEnabled: userSettings?.browserPushEnabled,
      prefs: userSettings?.notificationPrefs,
    });
  }, [
    enableSync,
    uid,
    userProfile?.onboardingCompleted,
    userSettings?.notificationsEnabled,
    userSettings?.notificationPrefs,
    userSettings?.browserPushEnabled,
    bizLoading,
    loading,
    notifications,
    inAppNotifications,
    derivedInvoices,
    clients,
    salaryRecords,
    teamMembers,
    leads,
    projects,
    goals,
    habits,
    habitLogs,
    reviewsDue,
    staleCompetitors,
    overdueOrDueGaps,
    monthlyReviewDueForTarget,
    activeTarget,
    activeTargetSurpassEval?.canConfirmSurpassed,
    todayStr,
    currentMonth,
  ]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const markRead = useCallback(async (id: string, read = true) => {
    await markUnifiedNotificationRead(id, read);
  }, []);

  const markAllRead = useCallback(async () => {
    return markAllUnifiedNotificationsRead(notifications);
  }, [notifications]);

  const removeNotification = useCallback(async (id: string) => {
    await deleteUnifiedNotification(id);
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    removeNotification,
  };
}
