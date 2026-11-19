import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { CalendarEventType, CalendarSourceType } from '../types';

export interface SaveCalendarEventInput {
  title: string;
  eventType: CalendarEventType;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  notes: string;
  reminderMinutes: number | null;
  sourceType?: CalendarSourceType;
  sourceId?: string;
}

export async function createCalendarEvent(uid: string, input: SaveCalendarEventInput): Promise<void> {
  try {
    await addDoc(collection(db, 'calendarEvents'), {
      ownerId: uid,
      title: input.title.trim().slice(0, 160),
      eventType: input.eventType,
      date: input.date.trim().slice(0, 20),
      startTime: input.allDay ? '' : input.startTime.trim().slice(0, 10),
      endTime: input.allDay ? '' : input.endTime.trim().slice(0, 10),
      allDay: input.allDay,
      notes: input.notes.trim().slice(0, 1000),
      reminderMinutes: input.reminderMinutes,
      sourceType: input.sourceType ?? 'manual',
      sourceId: (input.sourceId ?? '').trim().slice(0, 128),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'calendarEvents');
  }
}

export async function updateCalendarEvent(
  eventId: string,
  input: SaveCalendarEventInput
): Promise<void> {
  try {
    await updateDoc(doc(db, 'calendarEvents', eventId), {
      title: input.title.trim().slice(0, 160),
      eventType: input.eventType,
      date: input.date.trim().slice(0, 20),
      startTime: input.allDay ? '' : input.startTime.trim().slice(0, 10),
      endTime: input.allDay ? '' : input.endTime.trim().slice(0, 10),
      allDay: input.allDay,
      notes: input.notes.trim().slice(0, 1000),
      reminderMinutes: input.reminderMinutes,
      sourceType: input.sourceType ?? 'manual',
      sourceId: (input.sourceId ?? '').trim().slice(0, 128),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `calendarEvents/${eventId}`);
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'calendarEvents', eventId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `calendarEvents/${eventId}`);
  }
}
