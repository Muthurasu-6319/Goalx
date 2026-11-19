import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { sanitizeText } from '../lib/businessUtils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatINR, rupeesToPaise } from '../lib/moneyUtils';
import { ProjectFormValues, ProjectPaymentFormValues } from '../lib/validators';
import { Project, ProjectPayment, ProjectStatus } from '../types';

export async function createProject(uid: string, values: ProjectFormValues): Promise<string> {
  try {
    const ref = await addDoc(collection(db, 'projects'), {
      ownerId: uid,
      companyId: uid,
      title: sanitizeText(values.title, 160),
      clientId: values.clientId.trim(),
      serviceId: values.serviceId.trim().slice(0, 128),
      serviceCategory: sanitizeText(values.serviceCategory, 160),
      assignedMemberId: values.assignedMemberId.trim().slice(0, 128),
      budgetPaise: rupeesToPaise(values.budgetRupees),
      status: values.status,
      startDate: values.startDate,
      dueDate: values.dueDate || '',
      description: sanitizeText(values.description, 2000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'projects');
  }
}

export async function updateProject(projectId: string, values: ProjectFormValues): Promise<void> {
  try {
    await updateDoc(doc(db, 'projects', projectId), {
      title: sanitizeText(values.title, 160),
      clientId: values.clientId.trim(),
      serviceId: values.serviceId.trim().slice(0, 128),
      serviceCategory: sanitizeText(values.serviceCategory, 160),
      assignedMemberId: values.assignedMemberId.trim().slice(0, 128),
      budgetPaise: rupeesToPaise(values.budgetRupees),
      status: values.status,
      startDate: values.startDate,
      dueDate: values.dueDate || '',
      description: sanitizeText(values.description, 2000),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
  }
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus): Promise<void> {
  try {
    await updateDoc(doc(db, 'projects', projectId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'projects', projectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `projects/${projectId}`);
  }
}

export async function createProjectPayment(
  uid: string,
  project: Project,
  values: ProjectPaymentFormValues
): Promise<string> {
  try {
    const amountPaise = Math.max(1, rupeesToPaise(values.amountRupees));
    const ref = await addDoc(collection(db, 'projectPayments'), {
      ownerId: uid,
      companyId: uid,
      projectId: project.id,
      clientId: project.clientId,
      amountPaise,
      date: values.date,
      method: values.method,
      paymentType: values.paymentType,
      invoiceNumber: sanitizeText(values.invoiceNumber, 60),
      notes: sanitizeText(values.notes, 1000),
      isDeleted: false,
      deletedAt: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'projectPayments');
  }
}

export async function updateProjectPaymentWithAudit(params: {
  uid: string;
  actorName: string;
  existing: ProjectPayment;
  project: Project;
  values: ProjectPaymentFormValues;
}): Promise<void> {
  const { uid, actorName, existing, project, values } = params;
  const amountPaise = Math.max(1, rupeesToPaise(values.amountRupees));
  try {
    const batch = writeBatch(db);
    const payRef = doc(db, 'projectPayments', existing.id);
    batch.update(payRef, {
      projectId: project.id,
      clientId: project.clientId,
      amountPaise,
      date: values.date,
      method: values.method,
      paymentType: values.paymentType,
      invoiceNumber: sanitizeText(values.invoiceNumber, 60),
      notes: sanitizeText(values.notes, 1000),
      updatedAt: serverTimestamp(),
    });

    const auditRef = doc(collection(db, 'financeAuditLogs'));
    batch.set(auditRef, {
      ownerId: uid,
      companyId: uid,
      entityType: 'projectPayment',
      entityId: existing.id,
      action: 'update',
      actorName: sanitizeText(actorName || 'CEO', 120),
      actorUid: uid,
      timestampIso: new Date().toISOString(),
      oldValueSummary: `${formatINR(existing.amountPaise)} · ${existing.date} · ${existing.method} · ${existing.paymentType}`.slice(0, 1000),
      newValueSummary: `${formatINR(amountPaise)} · ${values.date} · ${values.method} · ${values.paymentType}`.slice(0, 1000),
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projectPayments/${existing.id}`);
  }
}

export async function softDeleteProjectPaymentWithAudit(params: {
  uid: string;
  actorName: string;
  payment: ProjectPayment;
}): Promise<void> {
  const { uid, actorName, payment } = params;
  const nowIso = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'projectPayments', payment.id), {
      isDeleted: true,
      deletedAt: nowIso,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(db, 'financeAuditLogs')), {
      ownerId: uid,
      companyId: uid,
      entityType: 'projectPayment',
      entityId: payment.id,
      action: 'soft_delete',
      actorName: sanitizeText(actorName || 'CEO', 120),
      actorUid: uid,
      timestampIso: nowIso,
      oldValueSummary: `${formatINR(payment.amountPaise)} · ${payment.date} · ${payment.method}`.slice(0, 1000),
      newValueSummary: 'Moved to trash (soft-deleted)',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projectPayments/${payment.id}`);
  }
}

export async function restoreProjectPaymentWithAudit(params: {
  uid: string;
  actorName: string;
  payment: ProjectPayment;
}): Promise<void> {
  const { uid, actorName, payment } = params;
  const nowIso = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'projectPayments', payment.id), {
      isDeleted: false,
      deletedAt: '',
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(db, 'financeAuditLogs')), {
      ownerId: uid,
      companyId: uid,
      entityType: 'projectPayment',
      entityId: payment.id,
      action: 'restore',
      actorName: sanitizeText(actorName || 'CEO', 120),
      actorUid: uid,
      timestampIso: nowIso,
      oldValueSummary: 'Deleted',
      newValueSummary: `Restored ${formatINR(payment.amountPaise)} · ${payment.date}`.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projectPayments/${payment.id}`);
  }
}
