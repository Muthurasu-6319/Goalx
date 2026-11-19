import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import {
  getAsiaKolkataDateParts,
  isProposalExpired,
  isProposalExpiringSoon,
} from '../lib/aiCeoContextUtils';
import {
  AI_DAILY_BASELINE_LIMIT,
  AI_DAILY_BRIEFING_LIMIT,
  AI_DAILY_CHAT_LIMIT,
} from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AiActionRequest,
  AiBriefing,
  AiBriefingType,
  AiConversation,
  AiMessage,
  AiUsage,
  BaselineReview,
} from '../types';
import {
  AiCeoStatusResponse,
  fetchAiCeoStatus,
  fetchOrGenerateBriefing,
} from '../services/aiCeoService';
import { useAuth } from './useAuth';

function tsMillis(ts?: Timestamp | unknown): number {
  if (ts && typeof (ts as Timestamp).toMillis === 'function') {
    return (ts as Timestamp).toMillis();
  }
  return 0;
}

export function useAiCeo(activeConversationId?: string) {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? '';

  const [status, setStatus] = useState<AiCeoStatusResponse | null>(null);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [allMessages, setAllMessages] = useState<AiMessage[]>([]);
  const [briefings, setBriefings] = useState<AiBriefing[]>([]);
  const [proposals, setProposals] = useState<AiActionRequest[]>([]);
  const [baselineReviews, setBaselineReviews] = useState<BaselineReview[]>([]);
  const [todayUsageDoc, setTodayUsageDoc] = useState<AiUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefingGenerating, setBriefingGenerating] = useState(false);

  const ist = useMemo(() => getAsiaKolkataDateParts(), []);

  const refreshStatus = useCallback(async () => {
    const res = await fetchAiCeoStatus();
    setStatus(res);
    return res;
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, uid]);

  useEffect(() => {
    if (!uid) {
      setConversations([]);
      setAllMessages([]);
      setBriefings([]);
      setProposals([]);
      setBaselineReviews([]);
      setTodayUsageDoc(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let pendingInitial = 6;
    const markSettled = () => {
      pendingInitial = Math.max(0, pendingInitial - 1);
      if (pendingInitial === 0) setLoading(false);
    };

    const unsubs: (() => void)[] = [];

    unsubs.push(
      onSnapshot(
        query(collection(db, 'aiConversations'), where('ownerId', '==', uid)),
        (snap) => {
          const list = snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as AiConversation
          );
          list.sort((a, b) => tsMillis(b.updatedAt) - tsMillis(a.updatedAt));
          setConversations(list);
          markSettled();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'aiConversations')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'aiMessages'), where('ownerId', '==', uid)),
        (snap) => {
          const list = snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as AiMessage
          );
          list.sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
          setAllMessages(list);
          markSettled();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'aiMessages')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'aiBriefings'), where('ownerId', '==', uid)),
        (snap) => {
          const list = snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as AiBriefing
          );
          list.sort((a, b) => {
            const cmp = (b.date || '').localeCompare(a.date || '');
            return cmp !== 0 ? cmp : tsMillis(b.updatedAt) - tsMillis(a.updatedAt);
          });
          setBriefings(list);
          markSettled();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'aiBriefings')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'aiActionRequests'), where('ownerId', '==', uid)),
        (snap) => {
          const list = snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as AiActionRequest
          );
          list.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
          setProposals(list);
          markSettled();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'aiActionRequests')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'baselineReviews'), where('ownerId', '==', uid)),
        (snap) => {
          const list = snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as BaselineReview
          );
          list.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
          setBaselineReviews(list);
          markSettled();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'baselineReviews')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'aiUsage'), where('ownerId', '==', uid)),
        (snap) => {
          const todayKey = `${uid}_${ist.dateStr}`;
          const matched = snap.docs.find((d) => d.id === todayKey || d.data().date === ist.dateStr);
          setTodayUsageDoc(
            matched ? ({ id: matched.id, ...matched.data() } as AiUsage) : null
          );
          markSettled();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'aiUsage')
      )
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [uid, ist.dateStr]);

  const activeMessages = useMemo(() => {
    if (!activeConversationId) return [];
    return allMessages.filter((m) => m.conversationId === activeConversationId);
  }, [allMessages, activeConversationId]);

  const proposalsByMessageId = useMemo(() => {
    const map = new Map<string, AiActionRequest[]>();
    for (const p of proposals) {
      const list = map.get(p.messageId) ?? [];
      list.push(p);
      map.set(p.messageId, list);
    }
    return map;
  }, [proposals]);

  const normalizedProposals = useMemo(
    () =>
      proposals.map((p) => {
        if (p.status === 'Pending' && isProposalExpired(p.expiresAtIso)) {
          return { ...p, status: 'Expired' as const };
        }
        return p;
      }),
    [proposals]
  );

  const pendingProposals = useMemo(
    () => normalizedProposals.filter((p) => p.status === 'Pending'),
    [normalizedProposals]
  );

  const expiringSoonProposals = useMemo(
    () =>
      pendingProposals.filter((p) => isProposalExpiringSoon(p.expiresAtIso)),
    [pendingProposals]
  );

  const todayDailyBriefing = useMemo(
    () =>
      briefings.find(
        (b) => b.briefingType === 'daily' && b.date === ist.dateStr
      ) ?? null,
    [briefings, ist.dateStr]
  );

  const latestWeeklyBriefing = useMemo(
    () => briefings.find((b) => b.briefingType === 'weekly') ?? null,
    [briefings]
  );

  const latestMonthlyBriefing = useMemo(
    () => briefings.find((b) => b.briefingType === 'monthly') ?? null,
    [briefings]
  );

  const latestBaselineReview = useMemo(
    () => baselineReviews[0] ?? null,
    [baselineReviews]
  );

  const usageSummary = useMemo(
    () => ({
      chatCount: todayUsageDoc?.chatCount ?? status?.usage.chatCount ?? 0,
      chatLimit: status?.limits.chat ?? AI_DAILY_CHAT_LIMIT,
      briefingCount:
        todayUsageDoc?.briefingCount ?? status?.usage.briefingCount ?? 0,
      briefingLimit: status?.limits.briefing ?? AI_DAILY_BRIEFING_LIMIT,
      baselineCount:
        todayUsageDoc?.baselineCount ?? status?.usage.baselineCount ?? 0,
      baselineLimit: status?.limits.baseline ?? AI_DAILY_BASELINE_LIMIT,
    }),
    [todayUsageDoc, status]
  );

  const generateBriefing = useCallback(
    async (briefingType: AiBriefingType = 'daily', regenerate = false) => {
      setBriefingGenerating(true);
      try {
        const res = await fetchOrGenerateBriefing({ briefingType, regenerate });
        void refreshStatus();
        return res;
      } finally {
        setBriefingGenerating(false);
      }
    },
    [refreshStatus]
  );

  return {
    loading,
    status,
    refreshStatus,
    usageSummary,
    ist,
    conversations,
    activeMessages,
    allMessages,
    briefings,
    todayDailyBriefing,
    latestWeeklyBriefing,
    latestMonthlyBriefing,
    briefingGenerating,
    generateBriefing,
    proposals: normalizedProposals,
    proposalsByMessageId,
    pendingProposals,
    expiringSoonProposals,
    baselineReviews,
    latestBaselineReview,
  };
}
