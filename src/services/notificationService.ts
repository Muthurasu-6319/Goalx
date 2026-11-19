import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { DEFAULT_NOTIFICATION_PREFS } from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { sanitizeInternalRoute } from '../lib/urlUtils';
import {
  NotificationCategory,
  NotificationItem,
  NotificationPreferences,
  NotificationSeverity,
} from '../types';

export interface DeterministicNotificationInput {
  id: string;
  uid: string;
  category: NotificationCategory;
  type: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  link: string;
  sourceType: string;
  sourceId: string;
}

function sanitizeNotificationId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'notif_item';
}

export function isCategoryEnabled(
  prefs: NotificationPreferences | undefined,
  category: NotificationCategory,
  masterEnabled = true
): boolean {
  if (!masterEnabled) return false;
  if (!prefs) return true;
  return prefs.categories?.[category] ?? DEFAULT_NOTIFICATION_PREFS.categories[category] ?? true;
}

export function isWithinQuietHours(
  prefs: NotificationPreferences | undefined,
  now: Date = new Date()
): boolean {
  if (!prefs || !prefs.quietHoursEnabled) return false;
  const startStr = prefs.quietHoursStart || '22:00';
  const endStr = prefs.quietHoursEnd || '07:00';
  const [sh, sm] = startStr.split(':').map((n) => Number(n));
  const [eh, em] = endStr.split(':').map((n) => Number(n));
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) {
    return false;
  }

  const currentMin = now.getHours() * 60 + now.getMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return currentMin >= startMin && currentMin < endMin;
  }
  // Overnight quiet hours (e.g. 22:00 -> 07:00)
  return currentMin >= startMin || currentMin < endMin;
}

export function getBrowserNotificationState(): 'unsupported' | NotificationPermission {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * MUST ONLY be called from an explicit user click handler (never on page load).
 */
export async function requestBrowserNotificationPermissionOnlyOnClick(): Promise<
  'unsupported' | NotificationPermission
> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function maybeDispatchBrowserNotification(params: {
  title: string;
  body: string;
  tag: string;
  browserPushEnabled?: boolean;
  prefs?: NotificationPreferences;
}): boolean {
  if (!params.browserPushEnabled) return false;
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;
  if (isWithinQuietHours(params.prefs)) return false;

  try {
    const shownKey = `goalx_push_${params.tag}`;
    if (sessionStorage.getItem(shownKey)) return false;
    sessionStorage.setItem(shownKey, '1');
    new Notification(params.title.slice(0, 120), {
      body: params.body.slice(0, 240),
      tag: params.tag,
    });
    return true;
  } catch {
    return false;
  }
}

export async function ensureDeterministicNotification(
  input: DeterministicNotificationInput
): Promise<boolean> {
  const cleanId = sanitizeNotificationId(input.id);
  const notifRef = doc(db, 'notifications', cleanId);
  try {
    const snap = await getDoc(notifRef);
    if (snap.exists()) return false;

    await setDoc(notifRef, {
      ownerId: input.uid,
      companyId: input.uid,
      category: input.category,
      type: input.type.trim().slice(0, 60) || 'system_alert',
      severity: input.severity,
      title: input.title.trim().slice(0, 160),
      message: input.message.trim().slice(0, 500),
      link: sanitizeInternalRoute(input.link),
      sourceType: input.sourceType.trim().slice(0, 80) || 'system',
      sourceId: input.sourceId.trim().slice(0, 128) || cleanId,
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch {
    // Deduplicated sync is non-blocking so UI flows never break
    return false;
  }
}

export async function syncDeterministicNotifications(
  items: DeterministicNotificationInput[],
  existingIds: Set<string>,
  options?: {
    browserPushEnabled?: boolean;
    prefs?: NotificationPreferences;
  }
): Promise<number> {
  const pending = items.filter((item) => !existingIds.has(sanitizeNotificationId(item.id)));
  if (pending.length === 0) return 0;

  let created = 0;
  for (const item of pending.slice(0, 15)) {
    const wasCreated = await ensureDeterministicNotification(item);
    if (wasCreated) {
      created += 1;
      existingIds.add(sanitizeNotificationId(item.id));
      if (item.severity === 'critical' || item.severity === 'warning') {
        maybeDispatchBrowserNotification({
          title: item.title,
          body: item.message,
          tag: sanitizeNotificationId(item.id),
          browserPushEnabled: options?.browserPushEnabled,
          prefs: options?.prefs,
        });
      }
    }
  }
  return created;
}

export async function markUnifiedNotificationRead(
  notificationId: string,
  read = true
): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      read: Boolean(read),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllUnifiedNotificationsRead(
  notifications: NotificationItem[]
): Promise<number> {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return 0;

  try {
    const chunkSize = 400;
    for (let i = 0; i < unread.length; i += chunkSize) {
      const batch = writeBatch(db);
      for (const item of unread.slice(i, i + chunkSize)) {
        batch.update(doc(db, 'notifications', item.id), {
          read: true,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    return unread.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

export async function deleteUnifiedNotification(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `notifications/${notificationId}`);
  }
}

export async function createUnifiedNotificationNow(
  input: Omit<DeterministicNotificationInput, 'id'> & { id?: string }
): Promise<string> {
  const ref = input.id
    ? doc(db, 'notifications', sanitizeNotificationId(input.id))
    : doc(collection(db, 'notifications'));
  try {
    await setDoc(ref, {
      ownerId: input.uid,
      companyId: input.uid,
      category: input.category,
      type: input.type.trim().slice(0, 60) || 'system_alert',
      severity: input.severity,
      title: input.title.trim().slice(0, 160),
      message: input.message.trim().slice(0, 500),
      link: sanitizeInternalRoute(input.link),
      sourceType: input.sourceType.trim().slice(0, 80) || 'system',
      sourceId: input.sourceId.trim().slice(0, 128) || ref.id,
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `notifications/${ref.id}`);
  }
}
