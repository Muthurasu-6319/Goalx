import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { sanitizeText } from '../lib/businessUtils';
import { DEFAULT_SEED_SERVICES } from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { rupeesToPaise } from '../lib/moneyUtils';
import { BusinessServiceStatus } from '../types';

export interface SaveBusinessServiceInput {
  name: string;
  description: string;
  startingPriceRupees: number;
  estimatedDeliveryDays: number;
  status: BusinessServiceStatus;
  subServices: string[];
}

export async function ensureSeedBusinessServices(uid: string): Promise<void> {
  const storageKey = `goalx_services_seeded_${uid}`;
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey) === '1') {
      return;
    }

    const q = query(
      collection(db, 'businessServices'),
      where('ownerId', '==', uid),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, '1');
      }
      return;
    }

    const batch = writeBatch(db);
    for (const item of DEFAULT_SEED_SERVICES) {
      const ref = doc(collection(db, 'businessServices'));
      batch.set(ref, {
        ownerId: uid,
        companyId: uid,
        name: item.name,
        description: item.description,
        startingPricePaise: item.startingPricePaise,
        estimatedDeliveryDays: item.estimatedDeliveryDays,
        status: item.status,
        subServices: item.subServices,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, '1');
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'businessServices');
  }
}

export async function createBusinessService(
  uid: string,
  input: SaveBusinessServiceInput
): Promise<string> {
  try {
    const cleanTags = input.subServices
      .map((t) => sanitizeText(t, 160))
      .filter(Boolean)
      .slice(0, 30);

    const ref = await addDoc(collection(db, 'businessServices'), {
      ownerId: uid,
      companyId: uid,
      name: sanitizeText(input.name, 160),
      description: sanitizeText(input.description, 1000),
      startingPricePaise: rupeesToPaise(input.startingPriceRupees),
      estimatedDeliveryDays: Math.max(0, Math.min(3650, Math.round(input.estimatedDeliveryDays))),
      status: input.status,
      subServices: cleanTags,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'businessServices');
  }
}

export async function updateBusinessService(
  serviceId: string,
  input: SaveBusinessServiceInput
): Promise<void> {
  try {
    const cleanTags = input.subServices
      .map((t) => sanitizeText(t, 160))
      .filter(Boolean)
      .slice(0, 30);

    await updateDoc(doc(db, 'businessServices', serviceId), {
      name: sanitizeText(input.name, 160),
      description: sanitizeText(input.description, 1000),
      startingPricePaise: rupeesToPaise(input.startingPriceRupees),
      estimatedDeliveryDays: Math.max(0, Math.min(3650, Math.round(input.estimatedDeliveryDays))),
      status: input.status,
      subServices: cleanTags,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `businessServices/${serviceId}`);
  }
}

export async function updateBusinessServiceStatus(
  serviceId: string,
  status: BusinessServiceStatus
): Promise<void> {
  try {
    await updateDoc(doc(db, 'businessServices', serviceId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `businessServices/${serviceId}`);
  }
}

export async function deleteBusinessService(serviceId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'businessServices', serviceId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `businessServices/${serviceId}`);
  }
}
