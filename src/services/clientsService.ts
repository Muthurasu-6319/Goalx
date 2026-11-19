import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { sanitizeText } from '../lib/businessUtils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ClientStatus } from '../types';

export interface SaveClientInput {
  clientName: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  serviceId: string;
  serviceCategory: string;
  clientManager: string;
  notes: string;
  status: ClientStatus;
}

export async function createClient(uid: string, input: SaveClientInput): Promise<string> {
  try {
    const ref = await addDoc(collection(db, 'clients'), {
      ownerId: uid,
      companyId: uid,
      clientName: sanitizeText(input.clientName, 160),
      company: sanitizeText(input.company, 160),
      phone: sanitizeText(input.phone, 30),
      email: sanitizeText(input.email, 200),
      address: sanitizeText(input.address, 500),
      sourceLeadId: '',
      serviceId: sanitizeText(input.serviceId, 128),
      serviceCategory: sanitizeText(input.serviceCategory, 160),
      clientManager: sanitizeText(input.clientManager, 120),
      notes: sanitizeText(input.notes, 2000),
      status: input.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'clients');
  }
}

export async function updateClient(clientId: string, input: SaveClientInput): Promise<void> {
  try {
    await updateDoc(doc(db, 'clients', clientId), {
      clientName: sanitizeText(input.clientName, 160),
      company: sanitizeText(input.company, 160),
      phone: sanitizeText(input.phone, 30),
      email: sanitizeText(input.email, 200),
      address: sanitizeText(input.address, 500),
      serviceId: sanitizeText(input.serviceId, 128),
      serviceCategory: sanitizeText(input.serviceCategory, 160),
      clientManager: sanitizeText(input.clientManager, 120),
      notes: sanitizeText(input.notes, 2000),
      status: input.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
  }
}

export async function deleteClient(clientId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'clients', clientId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `clients/${clientId}`);
  }
}
