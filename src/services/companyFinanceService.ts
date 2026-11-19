import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { sanitizeText } from '../lib/businessUtils';
import { RECEIPT_ALLOWED_MIME_TYPES, RECEIPT_MAX_BYTES } from '../lib/constants';
import { db, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import { calculateNetSalaryPaise } from '../lib/financeUtils';
import { formatINR, rupeesToPaise } from '../lib/moneyUtils';
import { sanitizeStorageFileName } from '../lib/urlUtils';
import {
  BudgetFormValues,
  BusinessExpenseFormValues,
  InvoiceFormValues,
  OtherIncomeFormValues,
  RecurringExpenseTemplateFormValues,
  SalaryEditFormValues,
} from '../lib/validators';
import {
  Budget,
  BusinessExpense,
  FinancePaymentMethod,
  Invoice,
  OtherIncome,
  RecurringExpenseTemplate,
  SalaryRecord,
  TeamMember,
} from '../types';

// ---------------------------------------------------------------------------
// Other Income (Non-project company income only)
// ---------------------------------------------------------------------------

export async function createOtherIncome(uid: string, values: OtherIncomeFormValues): Promise<string> {
  try {
    const amountPaise = Math.max(1, rupeesToPaise(values.amountRupees));
    const docRef = await addDoc(collection(db, 'otherIncome'), {
      ownerId: uid,
      companyId: uid,
      source: sanitizeText(values.source, 160),
      clientId: values.clientId.trim().slice(0, 128),
      amountPaise,
      date: values.date,
      method: values.method,
      notes: sanitizeText(values.notes, 1000),
      isDeleted: false,
      deletedAt: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'otherIncome');
  }
}

export async function updateOtherIncomeWithAudit(params: {
  uid: string;
  actorName: string;
  existing: OtherIncome;
  values: OtherIncomeFormValues;
}): Promise<void> {
  const { uid, actorName, existing, values } = params;
  const amountPaise = Math.max(1, rupeesToPaise(values.amountRupees));
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'otherIncome', existing.id), {
      source: sanitizeText(values.source, 160),
      clientId: values.clientId.trim().slice(0, 128),
      amountPaise,
      date: values.date,
      method: values.method,
      notes: sanitizeText(values.notes, 1000),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(db, 'financeAuditLogs')), {
      ownerId: uid,
      companyId: uid,
      entityType: 'otherIncome',
      entityId: existing.id,
      action: 'update',
      actorName: sanitizeText(actorName || 'CEO', 120),
      actorUid: uid,
      timestampIso: new Date().toISOString(),
      oldValueSummary: `${existing.source} · ${formatINR(existing.amountPaise)} · ${existing.date}`.slice(0, 1000),
      newValueSummary: `${sanitizeText(values.source, 120)} · ${formatINR(amountPaise)} · ${values.date}`.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `otherIncome/${existing.id}`);
  }
}

export async function softDeleteOtherIncomeWithAudit(params: {
  uid: string;
  actorName: string;
  income: OtherIncome;
}): Promise<void> {
  const { uid, actorName, income } = params;
  const nowIso = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'otherIncome', income.id), {
      isDeleted: true,
      deletedAt: nowIso,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(db, 'financeAuditLogs')), {
      ownerId: uid,
      companyId: uid,
      entityType: 'otherIncome',
      entityId: income.id,
      action: 'soft_delete',
      actorName: sanitizeText(actorName || 'CEO', 120),
      actorUid: uid,
      timestampIso: nowIso,
      oldValueSummary: `${income.source} · ${formatINR(income.amountPaise)} · ${income.date}`.slice(0, 1000),
      newValueSummary: 'Moved to trash (soft-deleted)',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `otherIncome/${income.id}`);
  }
}

export async function restoreOtherIncomeWithAudit(params: {
  uid: string;
  actorName: string;
  income: OtherIncome;
}): Promise<void> {
  const { uid, actorName, income } = params;
  const nowIso = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'otherIncome', income.id), {
      isDeleted: false,
      deletedAt: '',
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(db, 'financeAuditLogs')), {
      ownerId: uid,
      companyId: uid,
      entityType: 'otherIncome',
      entityId: income.id,
      action: 'restore',
      actorName: sanitizeText(actorName || 'CEO', 120),
      actorUid: uid,
      timestampIso: nowIso,
      oldValueSummary: 'Deleted',
      newValueSummary: `Restored ${income.source} · ${formatINR(income.amountPaise)}`.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `otherIncome/${income.id}`);
  }
}

// ---------------------------------------------------------------------------
// Invoices + Calendar Payment Due Sync (no stored status)
// ---------------------------------------------------------------------------

export async function createInvoiceWithCalendarSync(params: {
  uid: string;
  clientName: string;
  values: InvoiceFormValues;
}): Promise<string> {
  const { uid, clientName, values } = params;
  const amountPaise = Math.max(1, rupeesToPaise(values.amountRupees));
  try {
    const invRef = doc(collection(db, 'invoices'));
    const calRef = doc(db, 'calendarEvents', `inv_due_${invRef.id}`);
    const batch = writeBatch(db);

    batch.set(invRef, {
      ownerId: uid,
      companyId: uid,
      invoiceNumber: sanitizeText(values.invoiceNumber, 60),
      clientId: values.clientId.trim(),
      projectId: values.projectId.trim().slice(0, 128),
      amountPaise,
      issueDate: values.issueDate,
      dueDate: values.dueDate,
      notes: sanitizeText(values.notes, 1000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(calRef, {
      ownerId: uid,
      title: sanitizeText(`Invoice Due: ${values.invoiceNumber} (${clientName})`, 160),
      eventType: 'Payment Due',
      date: values.dueDate,
      startTime: '',
      endTime: '',
      allDay: true,
      notes: sanitizeText(`Invoice ${values.invoiceNumber} · ${formatINR(amountPaise)}`, 1000),
      reminderMinutes: null,
      sourceType: 'invoice',
      sourceId: invRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return invRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'invoices');
  }
}

export async function updateInvoiceWithCalendarSync(params: {
  uid: string;
  existing: Invoice;
  clientName: string;
  values: InvoiceFormValues;
}): Promise<void> {
  const { uid, existing, clientName, values } = params;
  const amountPaise = Math.max(1, rupeesToPaise(values.amountRupees));
  try {
    const invRef = doc(db, 'invoices', existing.id);
    const calRef = doc(db, 'calendarEvents', `inv_due_${existing.id}`);
    const calSnap = await getDoc(calRef);

    const batch = writeBatch(db);
    batch.update(invRef, {
      invoiceNumber: sanitizeText(values.invoiceNumber, 60),
      clientId: values.clientId.trim(),
      projectId: values.projectId.trim().slice(0, 128),
      amountPaise,
      issueDate: values.issueDate,
      dueDate: values.dueDate,
      notes: sanitizeText(values.notes, 1000),
      updatedAt: serverTimestamp(),
    });

    if (calSnap.exists()) {
      batch.update(calRef, {
        title: sanitizeText(`Invoice Due: ${values.invoiceNumber} (${clientName})`, 160),
        eventType: 'Payment Due',
        date: values.dueDate,
        startTime: '',
        endTime: '',
        allDay: true,
        notes: sanitizeText(`Invoice ${values.invoiceNumber} · ${formatINR(amountPaise)}`, 1000),
        reminderMinutes: null,
        sourceType: 'invoice',
        sourceId: existing.id,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(calRef, {
        ownerId: uid,
        title: sanitizeText(`Invoice Due: ${values.invoiceNumber} (${clientName})`, 160),
        eventType: 'Payment Due',
        date: values.dueDate,
        startTime: '',
        endTime: '',
        allDay: true,
        notes: sanitizeText(`Invoice ${values.invoiceNumber} · ${formatINR(amountPaise)}`, 1000),
        reminderMinutes: null,
        sourceType: 'invoice',
        sourceId: existing.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `invoices/${existing.id}`);
  }
}

export async function deleteInvoiceWithCalendarSync(invoiceId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'invoices', invoiceId));
    batch.delete(doc(db, 'calendarEvents', `inv_due_${invoiceId}`));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `invoices/${invoiceId}`);
  }
}

// ---------------------------------------------------------------------------
// Business Expenses + Receipt Upload + Recurring Templates
// ---------------------------------------------------------------------------

export function validateReceiptFile(file: File): string | null {
  if (!RECEIPT_ALLOWED_MIME_TYPES.includes(file.type as (typeof RECEIPT_ALLOWED_MIME_TYPES)[number])) {
    return 'Unsupported file type. Upload PNG, JPG, WEBP, or PDF.';
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    return 'File exceeds 5MB limit.';
  }
  return null;
}

export async function uploadExpenseReceipt(
  uid: string,
  expenseId: string,
  file: File
): Promise<{ url: string; name: string; warning?: string }> {
  const err = validateReceiptFile(file);
  if (err) {
    throw new Error(err);
  }
  if (!storage) {
    return {
      url: '',
      name: '',
      warning: 'Firebase Storage is not configured in this environment; saved expense without attachment.',
    };
  }
  try {
    const safeName = sanitizeStorageFileName(file.name);
    const fileRef = ref(storage, `receipts/${uid}/${expenseId}/${safeName}`);
    await uploadBytes(fileRef, file, { contentType: file.type });
    const url = await getDownloadURL(fileRef);
    return { url, name: safeName };
  } catch {
    return {
      url: '',
      name: '',
      warning: 'Receipt upload could not reach Storage (check Storage rules); expense saved without receipt.',
    };
  }
}

export async function createBusinessExpense(params: {
  uid: string;
  values: BusinessExpenseFormValues;
  receiptFile?: File | null;
}): Promise<{ id: string; warning?: string }> {
  const { uid, values, receiptFile } = params;
  const expRef = doc(collection(db, 'businessExpenses'));
  let attachmentUrl = '';
  let attachmentName = '';
  let warning: string | undefined;

  if (receiptFile) {
    const uploaded = await uploadExpenseReceipt(uid, expRef.id, receiptFile);
    attachmentUrl = uploaded.url;
    attachmentName = uploaded.name;
    warning = uploaded.warning;
  }

  try {
    await setDoc(expRef, {
      ownerId: uid,
      companyId: uid,
      title: sanitizeText(values.title, 160),
      category: sanitizeText(values.category, 80),
      amountPaise: Math.max(1, rupeesToPaise(values.amountRupees)),
      date: values.date,
      paymentMethod: values.paymentMethod,
      paidBy: sanitizeText(values.paidBy, 120),
      description: sanitizeText(values.description, 1000),
      serviceId: values.serviceId.trim().slice(0, 128),
      projectId: values.projectId.trim().slice(0, 128),
      attachmentUrl: attachmentUrl.slice(0, 1000),
      attachmentName: attachmentName.slice(0, 200),
      recurringTemplateId: '',
      recurringMonth: '',
      salaryRecordId: '',
      isDeleted: false,
      deletedAt: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: expRef.id, warning };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'businessExpenses');
  }
}

export async function updateBusinessExpenseWithAudit(params: {
  uid: string;
  actorName: string;
  existing: BusinessExpense;
  values: BusinessExpenseFormValues;
  receiptFile?: File | null;
  clearAttachment?: boolean;
}): Promise<{ warning?: string }> {
  const { uid, actorName, existing, values, receiptFile, clearAttachment } = params;
  let attachmentUrl = clearAttachment ? '' : existing.attachmentUrl;
  let attachmentName = clearAttachment ? '' : existing.attachmentName;
  let warning: string | undefined;

  if (receiptFile) {
    const uploaded = await uploadExpenseReceipt(uid, existing.id, receiptFile);
    if (uploaded.url) {
      attachmentUrl = uploaded.url;
      attachmentName = uploaded.name;
    }
    warning = uploaded.warning;
  }

  const amountPaise = Math.max(1, rupeesToPaise(values.amountRupees));

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'businessExpenses', existing.id), {
      title: sanitizeText(values.title, 160),
      category: sanitizeText(values.category, 80),
      amountPaise,
      date: values.date,
      paymentMethod: values.paymentMethod,
      paidBy: sanitizeText(values.paidBy, 120),
      description: sanitizeText(values.description, 1000),
      serviceId: values.serviceId.trim().slice(0, 128),
      projectId: values.projectId.trim().slice(0, 128),
      attachmentUrl: attachmentUrl.slice(0, 1000),
      attachmentName: attachmentName.slice(0, 200),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(collection(db, 'financeAuditLogs')), {
      ownerId: uid,
      companyId: uid,
      entityType: 'businessExpense',
      entityId: existing.id,
      action: 'update',
      actorName: sanitizeText(actorName || 'CEO', 120),
      actorUid: uid,
      timestampIso: new Date().toISOString(),
      oldValueSummary: `${existing.title} (${existing.category}) · ${formatINR(existing.amountPaise)} · ${existing.date}`.slice(0, 1000),
      newValueSummary: `${sanitizeText(values.title, 80)} (${values.category}) · ${formatINR(amountPaise)} · ${values.date}`.slice(0, 1000),
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return { warning };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `businessExpenses/${existing.id}`);
  }
}

export async function softDeleteBusinessExpenseWithAudit(params: {
  uid: string;
  actorName: string;
  expense: BusinessExpense;
}): Promise<void> {
  const { uid, actorName, expense } = params;
  const nowIso = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'businessExpenses', expense.id), {
      isDeleted: true,
      deletedAt: nowIso,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(db, 'financeAuditLogs')), {
      ownerId: uid,
      companyId: uid,
      entityType: 'businessExpense',
      entityId: expense.id,
      action: 'soft_delete',
      actorName: sanitizeText(actorName || 'CEO', 120),
      actorUid: uid,
      timestampIso: nowIso,
      oldValueSummary: `${expense.title} · ${formatINR(expense.amountPaise)} · ${expense.date}`.slice(0, 1000),
      newValueSummary: 'Moved to trash (soft-deleted)',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `businessExpenses/${expense.id}`);
  }
}

export async function restoreBusinessExpenseWithAudit(params: {
  uid: string;
  actorName: string;
  expense: BusinessExpense;
}): Promise<void> {
  const { uid, actorName, expense } = params;
  const nowIso = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'businessExpenses', expense.id), {
      isDeleted: false,
      deletedAt: '',
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(db, 'financeAuditLogs')), {
      ownerId: uid,
      companyId: uid,
      entityType: 'businessExpense',
      entityId: expense.id,
      action: 'restore',
      actorName: sanitizeText(actorName || 'CEO', 120),
      actorUid: uid,
      timestampIso: nowIso,
      oldValueSummary: 'Deleted',
      newValueSummary: `Restored ${expense.title} · ${formatINR(expense.amountPaise)}`.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `businessExpenses/${expense.id}`);
  }
}

export async function createRecurringExpenseTemplate(
  uid: string,
  values: RecurringExpenseTemplateFormValues
): Promise<string> {
  try {
    const refDoc = await addDoc(collection(db, 'recurringExpenseTemplates'), {
      ownerId: uid,
      companyId: uid,
      title: sanitizeText(values.title, 160),
      category: sanitizeText(values.category, 80),
      amountPaise: Math.max(1, rupeesToPaise(values.amountRupees)),
      dayOfMonth: Math.max(1, Math.min(28, Math.round(values.dayOfMonth))),
      paymentMethod: values.paymentMethod,
      paidBy: sanitizeText(values.paidBy, 120),
      description: sanitizeText(values.description, 1000),
      serviceId: values.serviceId.trim().slice(0, 128),
      projectId: values.projectId.trim().slice(0, 128),
      active: values.active,
      lastGeneratedMonth: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return refDoc.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'recurringExpenseTemplates');
  }
}

export async function updateRecurringExpenseTemplate(
  templateId: string,
  values: RecurringExpenseTemplateFormValues
): Promise<void> {
  try {
    await updateDoc(doc(db, 'recurringExpenseTemplates', templateId), {
      title: sanitizeText(values.title, 160),
      category: sanitizeText(values.category, 80),
      amountPaise: Math.max(1, rupeesToPaise(values.amountRupees)),
      dayOfMonth: Math.max(1, Math.min(28, Math.round(values.dayOfMonth))),
      paymentMethod: values.paymentMethod,
      paidBy: sanitizeText(values.paidBy, 120),
      description: sanitizeText(values.description, 1000),
      serviceId: values.serviceId.trim().slice(0, 128),
      projectId: values.projectId.trim().slice(0, 128),
      active: values.active,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `recurringExpenseTemplates/${templateId}`);
  }
}

export async function deleteRecurringExpenseTemplate(templateId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'recurringExpenseTemplates', templateId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `recurringExpenseTemplates/${templateId}`);
  }
}

/**
 * Generates due recurring expenses for a yyyy-MM month deterministically using
 * doc ID `rec_${template.id}_${month}` so duplicate entries are prevented even across retries.
 */
export async function generateDueRecurringExpenses(params: {
  uid: string;
  templates: RecurringExpenseTemplate[];
  existingExpenses: BusinessExpense[];
  todayStr: string; // YYYY-MM-DD
}): Promise<number> {
  const { uid, templates, existingExpenses, todayStr } = params;
  const currentMonth = todayStr.slice(0, 7);
  const currentDay = Number(todayStr.slice(8, 10));

  const existingIds = new Set(existingExpenses.map((e) => e.id));
  let createdCount = 0;

  for (const tpl of templates) {
    if (!tpl.active) continue;
    if (currentDay < tpl.dayOfMonth) continue;
    if (tpl.lastGeneratedMonth === currentMonth) continue;

    const deterministicId = `rec_${tpl.id}_${currentMonth}`;
    if (existingIds.has(deterministicId)) continue;

    const expRef = doc(db, 'businessExpenses', deterministicId);
    const snap = await getDoc(expRef);
    if (snap.exists()) continue;

    const dayStr = String(tpl.dayOfMonth).padStart(2, '0');
    const dueDate = `${currentMonth}-${dayStr}`;

    try {
      const batch = writeBatch(db);
      batch.set(expRef, {
        ownerId: uid,
        companyId: uid,
        title: sanitizeText(tpl.title, 160),
        category: sanitizeText(tpl.category, 80),
        amountPaise: Math.max(1, tpl.amountPaise),
        date: dueDate,
        paymentMethod: tpl.paymentMethod,
        paidBy: sanitizeText(tpl.paidBy, 120),
        description: sanitizeText(tpl.description || 'Generated from recurring template', 1000),
        serviceId: tpl.serviceId || '',
        projectId: tpl.projectId || '',
        attachmentUrl: '',
        attachmentName: '',
        recurringTemplateId: tpl.id,
        recurringMonth: currentMonth,
        salaryRecordId: '',
        isDeleted: false,
        deletedAt: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'recurringExpenseTemplates', tpl.id), {
        lastGeneratedMonth: currentMonth,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      createdCount += 1;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `businessExpenses/${deterministicId}`);
    }
  }

  return createdCount;
}

// ---------------------------------------------------------------------------
// Salaries & Auto-Linked Employee Salaries Expense
// ---------------------------------------------------------------------------

export async function upsertSalaryRecordDetails(params: {
  uid: string;
  member: TeamMember;
  month: string;
  existingRecord: SalaryRecord | undefined;
  commissionPctUsed: number;
  values: SalaryEditFormValues;
}): Promise<void> {
  const { uid, member, month, existingRecord, commissionPctUsed, values } = params;
  const salaryId = `${member.id}_${month}`;
  const baseSalaryPaise = rupeesToPaise(values.baseSalaryRupees);
  const commissionPaise = rupeesToPaise(values.commissionRupees);
  const incentivePaise = rupeesToPaise(values.incentiveRupees);
  const deductionsPaise = rupeesToPaise(values.deductionsRupees);
  const netPayablePaise = calculateNetSalaryPaise(
    baseSalaryPaise,
    commissionPaise,
    incentivePaise,
    deductionsPaise
  );

  try {
    const salRef = doc(db, 'salaryRecords', salaryId);
    if (existingRecord) {
      await updateDoc(salRef, {
        baseSalaryPaise,
        commissionPaise,
        commissionPctUsed,
        commissionOverride: values.commissionOverride,
        commissionNote: sanitizeText(values.commissionNote, 500),
        incentivePaise,
        deductionsPaise,
        netPayablePaise,
        notes: sanitizeText(values.notes, 500),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(salRef, {
        ownerId: uid,
        companyId: uid,
        memberId: member.id,
        month,
        baseSalaryPaise,
        commissionPaise,
        commissionPctUsed,
        commissionOverride: values.commissionOverride,
        commissionNote: sanitizeText(values.commissionNote, 500),
        incentivePaise,
        deductionsPaise,
        netPayablePaise,
        status: 'Pending',
        paidDate: '',
        paymentMethod: '',
        linkedExpenseId: '',
        notes: sanitizeText(values.notes, 500),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `salaryRecords/${salaryId}`);
  }
}

/**
 * Marks a salary record Paid and atomically creates/restores its 1:1 linked
 * `Employee Salaries` expense (`salexp_${salaryId}`).
 */
export async function markSalaryPaidWithExpense(params: {
  uid: string;
  member: TeamMember;
  month: string;
  existingRecord: SalaryRecord | undefined;
  baseSalaryPaise: number;
  commissionPaise: number;
  commissionPctUsed: number;
  commissionOverride: boolean;
  commissionNote: string;
  incentivePaise: number;
  deductionsPaise: number;
  paidDate: string;
  paymentMethod: FinancePaymentMethod;
}): Promise<void> {
  const {
    uid,
    member,
    month,
    existingRecord,
    baseSalaryPaise,
    commissionPaise,
    commissionPctUsed,
    commissionOverride,
    commissionNote,
    incentivePaise,
    deductionsPaise,
    paidDate,
    paymentMethod,
  } = params;

  const salaryId = `${member.id}_${month}`;
  const netPayablePaise = calculateNetSalaryPaise(
    baseSalaryPaise,
    commissionPaise,
    incentivePaise,
    deductionsPaise
  );

  if (netPayablePaise <= 0) {
    throw new Error('Net payable salary must be greater than ₹0 before marking Paid.');
  }

  const linkedExpenseId = `salexp_${salaryId}`;
  const salRef = doc(db, 'salaryRecords', salaryId);
  const expRef = doc(db, 'businessExpenses', linkedExpenseId);

  try {
    const expSnap = await getDoc(expRef);
    const batch = writeBatch(db);

    if (existingRecord) {
      batch.update(salRef, {
        status: 'Paid',
        paidDate,
        paymentMethod,
        linkedExpenseId,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(salRef, {
        ownerId: uid,
        companyId: uid,
        memberId: member.id,
        month,
        baseSalaryPaise,
        commissionPaise,
        commissionPctUsed,
        commissionOverride,
        commissionNote: sanitizeText(commissionNote, 500),
        incentivePaise,
        deductionsPaise,
        netPayablePaise,
        status: 'Paid',
        paidDate,
        paymentMethod,
        linkedExpenseId,
        notes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (expSnap.exists()) {
      batch.update(expRef, {
        amountPaise: netPayablePaise,
        date: paidDate,
        paymentMethod,
        isDeleted: false,
        deletedAt: '',
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(expRef, {
        ownerId: uid,
        companyId: uid,
        title: sanitizeText(`Salary: ${member.name} (${month})`, 160),
        category: 'Employee Salaries',
        amountPaise: netPayablePaise,
        date: paidDate,
        paymentMethod,
        paidBy: 'Company Account',
        description: sanitizeText(
          `Auto-logged salary payout for ${member.name} (${month}). Base ${formatINR(baseSalaryPaise)} + Commission ${formatINR(commissionPaise)} + Incentive ${formatINR(incentivePaise)} - Deductions ${formatINR(deductionsPaise)}`,
          1000
        ),
        serviceId: '',
        projectId: '',
        attachmentUrl: '',
        attachmentName: '',
        recurringTemplateId: '',
        recurringMonth: '',
        salaryRecordId: salaryId,
        isDeleted: false,
        deletedAt: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `salaryRecords/${salaryId}`);
  }
}

/**
 * Reverts salary status to Pending and soft-deletes its linked `Employee Salaries` expense.
 */
export async function undoSalaryPaidWithExpense(params: {
  uid: string;
  actorName: string;
  record: SalaryRecord;
}): Promise<void> {
  const { uid, actorName, record } = params;
  const linkedId = record.linkedExpenseId || `salexp_${record.id}`;
  const nowIso = new Date().toISOString();

  try {
    const expRef = doc(db, 'businessExpenses', linkedId);
    const expSnap = await getDoc(expRef);
    const batch = writeBatch(db);

    batch.update(doc(db, 'salaryRecords', record.id), {
      status: 'Pending',
      paidDate: '',
      paymentMethod: '',
      linkedExpenseId: '',
      updatedAt: serverTimestamp(),
    });

    if (expSnap.exists()) {
      batch.update(expRef, {
        isDeleted: true,
        deletedAt: nowIso,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, 'financeAuditLogs')), {
        ownerId: uid,
        companyId: uid,
        entityType: 'businessExpense',
        entityId: linkedId,
        action: 'soft_delete',
        actorName: sanitizeText(actorName || 'CEO', 120),
        actorUid: uid,
        timestampIso: nowIso,
        oldValueSummary: `Salary payout (${record.month}) ${formatINR(record.netPayablePaise)}`.slice(0, 1000),
        newValueSummary: 'Auto soft-deleted because salary was reverted to Pending',
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `salaryRecords/${record.id}`);
  }
}

// ---------------------------------------------------------------------------
// Budgets & Deduplicated 80% / 100% Budget Alerts
// ---------------------------------------------------------------------------

export async function createBudget(uid: string, values: BudgetFormValues): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'budgets'), {
      ownerId: uid,
      companyId: uid,
      budgetType: values.budgetType,
      target: sanitizeText(values.target, 160),
      month: values.month,
      limitPaise: Math.max(1, rupeesToPaise(values.limitRupees)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'budgets');
  }
}

export async function updateBudget(budgetId: string, values: BudgetFormValues): Promise<void> {
  try {
    await updateDoc(doc(db, 'budgets', budgetId), {
      budgetType: values.budgetType,
      target: sanitizeText(values.target, 160),
      month: values.month,
      limitPaise: Math.max(1, rupeesToPaise(values.limitRupees)),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `budgets/${budgetId}`);
  }
}

export async function deleteBudget(budgetId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'budgets', budgetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `budgets/${budgetId}`);
  }
}

export async function copyBudgetsFromPreviousMonth(params: {
  uid: string;
  sourceBudgets: Budget[];
  existingTargetBudgets: Budget[];
  targetMonth: string;
}): Promise<number> {
  const { uid, sourceBudgets, existingTargetBudgets, targetMonth } = params;
  const existingKeys = new Set(
    existingTargetBudgets.map((b) => `${b.budgetType}::${b.target.toLowerCase()}`)
  );

  const toCopy = sourceBudgets.filter(
    (b) => !existingKeys.has(`${b.budgetType}::${b.target.toLowerCase()}`)
  );
  if (toCopy.length === 0) return 0;

  try {
    const batch = writeBatch(db);
    for (const src of toCopy) {
      batch.set(doc(collection(db, 'budgets')), {
        ownerId: uid,
        companyId: uid,
        budgetType: src.budgetType,
        target: src.target,
        month: targetMonth,
        limitPaise: src.limitPaise,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return toCopy.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'budgets');
  }
}

/**
 * Ensures deduplicated 80% & 100% budget threshold notifications exist in `inAppNotifications`
 * using deterministic IDs `balert_${budgetId}_${month}_${80|100}`.
 */
export async function syncBudgetThresholdAlert(params: {
  uid: string;
  budget: Budget;
  targetLabel: string;
  threshold: 80 | 100;
  spentPaise: number;
  utilizationPct: number;
}): Promise<void> {
  const { uid, budget, targetLabel, threshold, spentPaise, utilizationPct } = params;
  const alertId = `balert_${budget.id}_${budget.month}_${threshold}`;
  const notifRef = doc(db, 'inAppNotifications', alertId);

  try {
    const snap = await getDoc(notifRef);
    if (snap.exists()) return;

    await setDoc(notifRef, {
      ownerId: uid,
      companyId: uid,
      type: threshold === 100 ? 'budget_100' : 'budget_80',
      title:
        threshold === 100
          ? `Budget Exceeded: ${targetLabel}`.slice(0, 160)
          : `Budget Warning (${threshold}%+): ${targetLabel}`.slice(0, 160),
      message: `${budget.month} ${budget.budgetType} budget for ${targetLabel} is at ${utilizationPct}% (${formatINR(spentPaise)} of ${formatINR(budget.limitPaise)}).`.slice(0, 500),
      month: budget.month,
      sourceId: budget.id,
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking notification sync
  }
}

export async function markNotificationRead(notificationId: string, read = true): Promise<void> {
  try {
    await updateDoc(doc(db, 'inAppNotifications', notificationId), {
      read,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `inAppNotifications/${notificationId}`);
  }
}

export async function deleteInAppNotification(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'inAppNotifications', notificationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `inAppNotifications/${notificationId}`);
  }
}
