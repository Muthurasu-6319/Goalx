import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getTodayDateString } from '../lib/goalUtils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { GoalMilestone, GoalPriority, GoalStatus, GoalType, PersonalGoal } from '../types';

export interface SaveGoalInput {
  title: string;
  description: string;
  category: string;
  startDate: string;
  targetDate: string;
  priority: GoalPriority;
  goalType: GoalType;
  targetValue: number;
  currentValue: number;
  unit: string;
  notes: string;
  status: GoalStatus;
  sourceType?: '' | 'competitiveGap';
  sourceId?: string;
}

export async function createPersonalGoal(uid: string, input: SaveGoalInput): Promise<string> {
  const path = 'goals';
  const payload: Record<string, unknown> = {
    ownerId: uid,
    title: input.title.trim().slice(0, 160),
    description: input.description.trim().slice(0, 1000),
    category: input.category.trim().slice(0, 80),
    startDate: input.startDate.trim().slice(0, 20),
    targetDate: input.targetDate.trim().slice(0, 20),
    priority: input.priority,
    goalType: input.goalType,
    targetValue: input.targetValue,
    currentValue: Math.max(0, input.currentValue),
    unit: input.unit.trim().slice(0, 40),
    notes: input.notes.trim().slice(0, 2000),
    status: input.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.sourceType === 'competitiveGap') {
    payload.sourceType = 'competitiveGap';
    payload.sourceId = (input.sourceId ?? '').trim().slice(0, 128);
  }

  try {
    const ref = await addDoc(collection(db, 'goals'), payload);
    if (Number(payload.currentValue) > 0) {
      await addDoc(collection(db, 'goalProgressHistory'), {
        ownerId: uid,
        goalId: ref.id,
        value: Number(payload.currentValue),
        delta: Number(payload.currentValue),
        date: getTodayDateString(),
        note: 'Initial goal baseline',
        createdAt: serverTimestamp(),
      });
    }
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updatePersonalGoal(
  goalId: string,
  input: Omit<SaveGoalInput, 'currentValue'>
): Promise<void> {
  const path = `goals/${goalId}`;
  try {
    await updateDoc(doc(db, 'goals', goalId), {
      title: input.title.trim().slice(0, 160),
      description: input.description.trim().slice(0, 1000),
      category: input.category.trim().slice(0, 80),
      startDate: input.startDate.trim().slice(0, 20),
      targetDate: input.targetDate.trim().slice(0, 20),
      priority: input.priority,
      goalType: input.goalType,
      targetValue: input.targetValue,
      unit: input.unit.trim().slice(0, 40),
      notes: input.notes.trim().slice(0, 2000),
      status: input.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateGoalStatus(goalId: string, currentValue: number, status: GoalStatus): Promise<void> {
  const path = `goals/${goalId}`;
  try {
    await updateDoc(doc(db, 'goals', goalId), {
      currentValue,
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function completePersonalGoal(uid: string, goal: PersonalGoal): Promise<void> {
  const nextVal = Math.max(goal.currentValue, goal.targetValue);
  const delta = nextVal - goal.currentValue;
  const path = `goals/${goal.id}`;

  try {
    await updateDoc(doc(db, 'goals', goal.id), {
      currentValue: nextVal,
      status: 'Completed',
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, 'goalProgressHistory'), {
      ownerId: uid,
      goalId: goal.id,
      value: nextVal,
      delta,
      date: getTodayDateString(),
      note: 'Marked goal as completed',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function logGoalProgress(
  uid: string,
  goal: PersonalGoal,
  newValue: number,
  date: string,
  note: string
): Promise<void> {
  const cleanValue = Math.max(0, newValue);
  const delta = cleanValue - goal.currentValue;
  const nextStatus: GoalStatus =
    cleanValue >= goal.targetValue
      ? 'Completed'
      : goal.status === 'Not Started' && cleanValue > 0
        ? 'In Progress'
        : goal.status;

  try {
    await addDoc(collection(db, 'goalProgressHistory'), {
      ownerId: uid,
      goalId: goal.id,
      value: cleanValue,
      delta,
      date: date.trim().slice(0, 20),
      note: note.trim().slice(0, 500),
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'goals', goal.id), {
      currentValue: cleanValue,
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `goals/${goal.id}`);
  }
}

export async function deletePersonalGoal(uid: string, goalId: string): Promise<void> {
  const path = `goals/${goalId}`;
  try {
    const [milestonesSnap, historySnap] = await Promise.all([
      getDocs(query(collection(db, 'milestones'), where('ownerId', '==', uid), where('goalId', '==', goalId))),
      getDocs(query(collection(db, 'goalProgressHistory'), where('ownerId', '==', uid), where('goalId', '==', goalId))),
    ]);

    const batch = writeBatch(db);
    milestonesSnap.forEach((d) => batch.delete(d.ref));
    historySnap.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'goals', goalId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

async function syncTaskBasedGoalFromMilestones(
  uid: string,
  goal: PersonalGoal,
  updatedMilestones: GoalMilestone[],
  note: string
): Promise<void> {
  if (goal.goalType !== 'Task-based') return;
  const total = Math.max(1, updatedMilestones.length);
  const completedCount = updatedMilestones.filter((m) => m.completed).length;
  const nextStatus: GoalStatus =
    updatedMilestones.length > 0 && completedCount === updatedMilestones.length
      ? 'Completed'
      : completedCount > 0
        ? 'In Progress'
        : goal.status === 'Completed'
          ? 'In Progress'
          : goal.status;

  await updateDoc(doc(db, 'goals', goal.id), {
    title: goal.title,
    description: goal.description,
    category: goal.category,
    startDate: goal.startDate,
    targetDate: goal.targetDate,
    priority: goal.priority,
    goalType: goal.goalType,
    targetValue: total,
    unit: goal.unit || 'tasks',
    notes: goal.notes,
    status: nextStatus,
    updatedAt: serverTimestamp(),
  });

  if (completedCount !== goal.currentValue) {
    const delta = completedCount - goal.currentValue;
    await updateDoc(doc(db, 'goals', goal.id), {
      currentValue: completedCount,
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, 'goalProgressHistory'), {
      ownerId: uid,
      goalId: goal.id,
      value: completedCount,
      delta,
      date: getTodayDateString(),
      note: note.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  }
}

export async function addMilestone(
  uid: string,
  goal: PersonalGoal,
  existingMilestones: GoalMilestone[],
  title: string
): Promise<void> {
  const path = 'milestones';
  const maxOrder = existingMilestones.reduce((max, m) => Math.max(max, m.order), -1);
  const cleanTitle = title.trim().slice(0, 200);

  try {
    const ref = await addDoc(collection(db, 'milestones'), {
      ownerId: uid,
      goalId: goal.id,
      title: cleanTitle,
      completed: false,
      order: maxOrder + 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (goal.goalType === 'Task-based') {
      const nextList = [
        ...existingMilestones,
        { id: ref.id, ownerId: uid, goalId: goal.id, title: cleanTitle, completed: false, order: maxOrder + 1 } as GoalMilestone,
      ];
      await syncTaskBasedGoalFromMilestones(uid, goal, nextList, `Added milestone: ${cleanTitle}`);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateMilestoneTitle(milestoneId: string, title: string): Promise<void> {
  const path = `milestones/${milestoneId}`;
  try {
    await updateDoc(doc(db, 'milestones', milestoneId), {
      title: title.trim().slice(0, 200),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleMilestone(
  uid: string,
  goal: PersonalGoal,
  allGoalMilestones: GoalMilestone[],
  milestone: GoalMilestone
): Promise<void> {
  const path = `milestones/${milestone.id}`;
  const nextCompleted = !milestone.completed;

  try {
    await updateDoc(doc(db, 'milestones', milestone.id), {
      completed: nextCompleted,
      updatedAt: serverTimestamp(),
    });

    if (goal.goalType === 'Task-based') {
      const nextList = allGoalMilestones.map((m) =>
        m.id === milestone.id ? { ...m, completed: nextCompleted } : m
      );
      await syncTaskBasedGoalFromMilestones(
        uid,
        goal,
        nextList,
        `${nextCompleted ? 'Completed' : 'Reopened'} milestone: ${milestone.title}`
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function reorderMilestones(orderedMilestones: GoalMilestone[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    orderedMilestones.forEach((m, index) => {
      batch.update(doc(db, 'milestones', m.id), {
        order: index,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'milestones');
  }
}

export async function deleteMilestone(
  uid: string,
  goal: PersonalGoal,
  allGoalMilestones: GoalMilestone[],
  milestoneId: string
): Promise<void> {
  const path = `milestones/${milestoneId}`;
  try {
    await deleteDoc(doc(db, 'milestones', milestoneId));
    if (goal.goalType === 'Task-based') {
      const nextList = allGoalMilestones.filter((m) => m.id !== milestoneId);
      await syncTaskBasedGoalFromMilestones(uid, goal, nextList, 'Removed milestone');
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
