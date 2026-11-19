import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { LeadActivity, LeadNote } from '../types';
import { useAuth } from './useAuth';
import { useBusinessDataContext } from './useBusinessData';

export function useLeads() {
  const { leads, loading, error } = useBusinessDataContext();

  const activeLeads = useMemo(() => leads.filter((l) => !l.archived), [leads]);
  const archivedLeads = useMemo(() => leads.filter((l) => l.archived), [leads]);

  return {
    leads,
    activeLeads,
    archivedLeads,
    loading,
    error,
  };
}

export function useLeadTimeline(leadId: string | null) {
  const { firebaseUser, authReady } = useAuth();
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authReady || !firebaseUser || !leadId) {
      setActivities([]);
      setNotes([]);
      setLoading(false);
      return;
    }

    const uid = firebaseUser.uid;
    setLoading(true);
    let doneCount = 0;
    const markDone = () => {
      doneCount += 1;
      if (doneCount >= 2) setLoading(false);
    };

    const unsubAct = onSnapshot(
      query(
        collection(db, 'leadActivities'),
        where('ownerId', '==', uid),
        where('leadId', '==', leadId),
        limit(100)
      ),
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<LeadActivity, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setActivities(items);
        markDone();
      },
      (err) => {
        markDone();
        handleFirestoreError(err, OperationType.LIST, 'leadActivities');
      }
    );

    const unsubNotes = onSnapshot(
      query(
        collection(db, 'leadNotes'),
        where('ownerId', '==', uid),
        where('leadId', '==', leadId),
        limit(100)
      ),
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<LeadNote, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setNotes(items);
        markDone();
      },
      (err) => {
        markDone();
        handleFirestoreError(err, OperationType.LIST, 'leadNotes');
      }
    );

    return () => {
      unsubAct();
      unsubNotes();
    };
  }, [authReady, firebaseUser, leadId]);

  return { activities, notes, loading };
}
