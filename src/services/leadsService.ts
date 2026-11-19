import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { sanitizeText } from '../lib/businessUtils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getTodayDateString } from '../lib/goalUtils';
import { rupeesToPaise } from '../lib/moneyUtils';
import { Lead, LeadNoteChannel, LeadSource, LeadStatus } from '../types';

export interface SaveLeadInput {
  clientName: string;
  businessName: string;
  phone: string;
  email: string;
  location: string;
  requirement: string;
  serviceId: string;
  serviceCategory: string;
  leadSource: LeadSource;
  leadGeneratedDate: string;
  assignedPerson: string;
  estimatedBudgetRupees: number;
  followUpDate: string;
  notes: string;
  status: LeadStatus;
  lostReason: string;
}

function getFollowUpEventId(leadId: string): string {
  return `lead_followup_${leadId}`;
}

export async function syncLeadFollowUpCalendarEvent(
  uid: string,
  leadId: string,
  clientName: string,
  serviceCategory: string,
  followUpDate: string,
  notes: string,
  activeLead: boolean
): Promise<void> {
  const eventId = getFollowUpEventId(leadId);
  const calRef = doc(db, 'calendarEvents', eventId);
  try {
    const existingSnap = await getDoc(calRef);
    const shouldHaveEvent = activeLead && Boolean(followUpDate.trim());

    if (shouldHaveEvent) {
      const payload = {
        ownerId: uid,
        title: sanitizeText(`Follow-up: ${clientName}`, 160),
        eventType: 'Client Follow-up' as const,
        date: sanitizeText(followUpDate, 20),
        startTime: '10:00',
        endTime: '10:30',
        allDay: false,
        notes: sanitizeText([serviceCategory, notes].filter(Boolean).join(' · '), 1000),
        reminderMinutes: 30,
        sourceType: 'lead' as const,
        sourceId: leadId,
        updatedAt: serverTimestamp(),
      };
      if (existingSnap.exists()) {
        await updateDoc(calRef, payload);
      } else {
        await setDoc(calRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
    } else if (existingSnap.exists()) {
      await deleteDoc(calRef);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `calendarEvents/${eventId}`);
  }
}

export async function createLead(uid: string, input: SaveLeadInput): Promise<string> {
  try {
    const cleanName = sanitizeText(input.clientName, 160);
    const cleanService = sanitizeText(input.serviceCategory, 160);
    const cleanFollowUp = sanitizeText(input.followUpDate, 20);
    const cleanNotes = sanitizeText(input.notes, 2000);

    const leadRef = await addDoc(collection(db, 'leads'), {
      ownerId: uid,
      companyId: uid,
      clientName: cleanName,
      businessName: sanitizeText(input.businessName, 160),
      phone: sanitizeText(input.phone, 30),
      email: sanitizeText(input.email, 200),
      location: sanitizeText(input.location, 200),
      requirement: sanitizeText(input.requirement, 2000),
      serviceId: sanitizeText(input.serviceId, 128),
      serviceCategory: cleanService,
      leadSource: input.leadSource,
      leadGeneratedDate: sanitizeText(input.leadGeneratedDate, 20),
      assignedPerson: sanitizeText(input.assignedPerson, 120),
      estimatedBudgetPaise: rupeesToPaise(input.estimatedBudgetRupees),
      followUpDate: cleanFollowUp,
      notes: cleanNotes,
      status: input.status,
      lostReason: input.status === 'Lost' ? sanitizeText(input.lostReason, 500) : '',
      archived: false,
      convertedClientId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'leadActivities'), {
      ownerId: uid,
      companyId: uid,
      leadId: leadRef.id,
      fromStatus: '',
      toStatus: input.status,
      date: getTodayDateString(),
      note: input.status === 'Lost' ? sanitizeText(input.lostReason, 500) : 'Lead created',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const isOpen = input.status !== 'Won' && input.status !== 'Lost';
    if (cleanFollowUp && isOpen) {
      await syncLeadFollowUpCalendarEvent(
        uid,
        leadRef.id,
        cleanName,
        cleanService,
        cleanFollowUp,
        cleanNotes,
        true
      );
    }

    return leadRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'leads');
  }
}

export async function updateLead(
  uid: string,
  existingLead: Lead,
  input: SaveLeadInput
): Promise<void> {
  try {
    const cleanName = sanitizeText(input.clientName, 160);
    const cleanService = sanitizeText(input.serviceCategory, 160);
    const cleanFollowUp = sanitizeText(input.followUpDate, 20);
    const cleanNotes = sanitizeText(input.notes, 2000);
    const cleanLostReason = input.status === 'Lost' ? sanitizeText(input.lostReason, 500) : '';

    await updateDoc(doc(db, 'leads', existingLead.id), {
      clientName: cleanName,
      businessName: sanitizeText(input.businessName, 160),
      phone: sanitizeText(input.phone, 30),
      email: sanitizeText(input.email, 200),
      location: sanitizeText(input.location, 200),
      requirement: sanitizeText(input.requirement, 2000),
      serviceId: sanitizeText(input.serviceId, 128),
      serviceCategory: cleanService,
      leadSource: input.leadSource,
      leadGeneratedDate: sanitizeText(input.leadGeneratedDate, 20),
      assignedPerson: sanitizeText(input.assignedPerson, 120),
      estimatedBudgetPaise: rupeesToPaise(input.estimatedBudgetRupees),
      followUpDate: cleanFollowUp,
      notes: cleanNotes,
      status: input.status,
      lostReason: cleanLostReason,
      updatedAt: serverTimestamp(),
    });

    if (existingLead.status !== input.status) {
      await addDoc(collection(db, 'leadActivities'), {
        ownerId: uid,
        companyId: uid,
        leadId: existingLead.id,
        fromStatus: existingLead.status,
        toStatus: input.status,
        date: getTodayDateString(),
        note: cleanLostReason || `Moved from ${existingLead.status} to ${input.status}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const activeLead = !existingLead.archived && input.status !== 'Won' && input.status !== 'Lost';
    await syncLeadFollowUpCalendarEvent(
      uid,
      existingLead.id,
      cleanName,
      cleanService,
      cleanFollowUp,
      cleanNotes,
      activeLead
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `leads/${existingLead.id}`);
  }
}

export async function transitionLeadStatus(
  uid: string,
  lead: Lead,
  nextStatus: LeadStatus,
  lostReason = '',
  activityNote = ''
): Promise<void> {
  if (lead.status === nextStatus) return;
  try {
    const cleanLostReason = nextStatus === 'Lost' ? sanitizeText(lostReason, 500) : '';
    const batch = writeBatch(db);

    batch.update(doc(db, 'leads', lead.id), {
      status: nextStatus,
      lostReason: cleanLostReason,
      updatedAt: serverTimestamp(),
    });

    const actRef = doc(collection(db, 'leadActivities'));
    batch.set(actRef, {
      ownerId: uid,
      companyId: uid,
      leadId: lead.id,
      fromStatus: lead.status,
      toStatus: nextStatus,
      date: getTodayDateString(),
      note: sanitizeText(
        activityNote || cleanLostReason || `Moved from ${lead.status} to ${nextStatus}`,
        500
      ),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();

    const activeLead = !lead.archived && nextStatus !== 'Won' && nextStatus !== 'Lost';
    await syncLeadFollowUpCalendarEvent(
      uid,
      lead.id,
      lead.clientName,
      lead.serviceCategory,
      lead.followUpDate,
      lead.notes,
      activeLead
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `leads/${lead.id}`);
  }
}

export async function setLeadArchived(
  uid: string,
  lead: Lead,
  archived: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'leads', lead.id), {
      archived,
      updatedAt: serverTimestamp(),
    });

    const activeLead = !archived && lead.status !== 'Won' && lead.status !== 'Lost';
    await syncLeadFollowUpCalendarEvent(
      uid,
      lead.id,
      lead.clientName,
      lead.serviceCategory,
      lead.followUpDate,
      lead.notes,
      activeLead
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `leads/${lead.id}`);
  }
}

export async function deleteLeadPermanently(uid: string, leadId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'leads', leadId));

    const actSnap = await getDocs(
      query(
        collection(db, 'leadActivities'),
        where('ownerId', '==', uid),
        where('leadId', '==', leadId),
        limit(200)
      )
    );
    actSnap.forEach((d) => batch.delete(d.ref));

    const noteSnap = await getDocs(
      query(
        collection(db, 'leadNotes'),
        where('ownerId', '==', uid),
        where('leadId', '==', leadId),
        limit(200)
      )
    );
    noteSnap.forEach((d) => batch.delete(d.ref));

    const calRef = doc(db, 'calendarEvents', getFollowUpEventId(leadId));
    const calSnap = await getDoc(calRef);
    if (calSnap.exists()) {
      batch.delete(calRef);
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `leads/${leadId}`);
  }
}

export async function addLeadNote(
  uid: string,
  leadId: string,
  channel: LeadNoteChannel,
  date: string,
  text: string
): Promise<void> {
  try {
    await addDoc(collection(db, 'leadNotes'), {
      ownerId: uid,
      companyId: uid,
      leadId,
      channel,
      date: sanitizeText(date, 20),
      text: sanitizeText(text, 2000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'leadNotes');
  }
}

export async function deleteLeadNote(noteId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'leadNotes', noteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `leadNotes/${noteId}`);
  }
}

export async function convertLeadToClient(uid: string, lead: Lead): Promise<string> {
  if (lead.status !== 'Won') {
    throw new Error('Only Won leads can be converted to a client.');
  }
  if (lead.convertedClientId) {
    throw new Error('This lead has already been converted to a client.');
  }

  try {
    const batch = writeBatch(db);
    const clientRef = doc(collection(db, 'clients'));

    batch.set(clientRef, {
      ownerId: uid,
      companyId: uid,
      clientName: sanitizeText(lead.clientName, 160),
      company: sanitizeText(lead.businessName, 160),
      phone: sanitizeText(lead.phone, 30),
      email: sanitizeText(lead.email, 200),
      address: sanitizeText(lead.location, 500),
      sourceLeadId: lead.id,
      serviceId: sanitizeText(lead.serviceId, 128),
      serviceCategory: sanitizeText(lead.serviceCategory, 160),
      clientManager: sanitizeText(lead.assignedPerson, 120),
      notes: sanitizeText(lead.requirement || lead.notes, 2000),
      status: 'Active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'leads', lead.id), {
      convertedClientId: clientRef.id,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return clientRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `leads/${lead.id}`);
  }
}
