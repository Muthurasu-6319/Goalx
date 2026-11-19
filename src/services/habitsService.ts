import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { HabitScheduleType } from '../types';

export interface SaveHabitInput {
  name: string;
  icon: string;
  scheduleType: HabitScheduleType;
  weekdays: number[];
  weeklyTarget: number;
  reminderTime: string;
  active: boolean;
}

export async function createHabit(uid: string, input: SaveHabitInput): Promise<string> {
  const path = 'habits';
  try {
    const ref = await addDoc(collection(db, 'habits'), {
      ownerId: uid,
      name: input.name.trim().slice(0, 120),
      icon: input.icon.trim().slice(0, 40),
      scheduleType: input.scheduleType,
      weekdays: input.weekdays.slice(0, 7),
      weeklyTarget: Math.min(7, Math.max(1, input.weeklyTarget)),
      reminderTime: input.reminderTime.trim().slice(0, 20),
      active: input.active,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateHabit(habitId: string, input: SaveHabitInput): Promise<void> {
  const path = `habits/${habitId}`;
  try {
    await updateDoc(doc(db, 'habits', habitId), {
      name: input.name.trim().slice(0, 120),
      icon: input.icon.trim().slice(0, 40),
      scheduleType: input.scheduleType,
      weekdays: input.weekdays.slice(0, 7),
      weeklyTarget: Math.min(7, Math.max(1, input.weeklyTarget)),
      reminderTime: input.reminderTime.trim().slice(0, 20),
      active: input.active,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteHabit(uid: string, habitId: string): Promise<void> {
  const path = `habits/${habitId}`;
  try {
    const logsSnap = await getDocs(
      query(collection(db, 'habitLogs'), where('ownerId', '==', uid), where('habitId', '==', habitId))
    );
    const batch = writeBatch(db);
    logsSnap.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'habits', habitId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Deterministic ID `${habitId}_${date}` guarantees at most one log per habit per date.
 */
export async function setHabitLogForDate(
  uid: string,
  habitId: string,
  date: string,
  completed: boolean
): Promise<void> {
  const logId = `${habitId}_${date}`;
  const path = `habitLogs/${logId}`;
  const ref = doc(db, 'habitLogs', logId);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        completed,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        habitId,
        date,
        completed,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
