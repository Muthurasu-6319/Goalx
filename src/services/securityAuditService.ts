import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SecurityAuditAction, SecurityAuditLog } from '../types';

function cleanDetails(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

/**
 * Records an immutable security audit event in `securityAuditLogs`.
 * Never blocks user operations if audit write encounters a transient error.
 */
export async function logSecurityAuditEvent(params: {
  uid: string;
  actorName: string;
  action: SecurityAuditAction;
  details: string;
}): Promise<void> {
  const { uid, actorName, action, details } = params;
  if (!uid) return;
  try {
    await addDoc(collection(db, 'securityAuditLogs'), {
      ownerId: uid,
      companyId: uid,
      action,
      actorUid: uid,
      actorName: cleanDetails(actorName || 'CEO').slice(0, 120) || 'CEO',
      details: cleanDetails(details) || action,
      timestampIso: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking audit log write
  }
}

export async function fetchRecentSecurityAuditLogs(uid: string, maxItems = 25): Promise<SecurityAuditLog[]> {
  const q = query(
    collection(db, 'securityAuditLogs'),
    where('ownerId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(maxItems)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<SecurityAuditLog, 'id'>),
  }));
}
