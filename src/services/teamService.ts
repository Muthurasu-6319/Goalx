import { collection, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { sanitizeText } from '../lib/businessUtils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { rupeesToPaise } from '../lib/moneyUtils';
import { TeamMemberFormValues } from '../lib/validators';

export async function createTeamMemberWithPrivate(
  uid: string,
  values: TeamMemberFormValues
): Promise<string> {
  try {
    const memberRef = doc(collection(db, 'teamMembers'));
    const privateRef = doc(db, 'teamMemberPrivate', memberRef.id);
    const batch = writeBatch(db);

    batch.set(memberRef, {
      ownerId: uid,
      companyId: uid,
      name: sanitizeText(values.name, 120),
      role: sanitizeText(values.role, 120),
      department: sanitizeText(values.department, 120),
      email: sanitizeText(values.email, 200),
      phone: sanitizeText(values.phone, 30),
      status: values.status,
      joinedDate: values.joinedDate || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(privateRef, {
      ownerId: uid,
      companyId: uid,
      memberId: memberRef.id,
      baseSalaryPaise: rupeesToPaise(values.baseSalaryRupees),
      commissionRatePct: values.commissionRatePct,
      bankNotes: sanitizeText(values.bankNotes, 500),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return memberRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'teamMembers');
  }
}

export async function updateTeamMemberWithPrivate(
  uid: string,
  memberId: string,
  hasPrivateDoc: boolean,
  values: TeamMemberFormValues
): Promise<void> {
  try {
    const batch = writeBatch(db);
    const memberRef = doc(db, 'teamMembers', memberId);
    const privateRef = doc(db, 'teamMemberPrivate', memberId);

    batch.update(memberRef, {
      name: sanitizeText(values.name, 120),
      role: sanitizeText(values.role, 120),
      department: sanitizeText(values.department, 120),
      email: sanitizeText(values.email, 200),
      phone: sanitizeText(values.phone, 30),
      status: values.status,
      joinedDate: values.joinedDate || '',
      updatedAt: serverTimestamp(),
    });

    if (hasPrivateDoc) {
      batch.update(privateRef, {
        baseSalaryPaise: rupeesToPaise(values.baseSalaryRupees),
        commissionRatePct: values.commissionRatePct,
        bankNotes: sanitizeText(values.bankNotes, 500),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(privateRef, {
        ownerId: uid,
        companyId: uid,
        memberId,
        baseSalaryPaise: rupeesToPaise(values.baseSalaryRupees),
        commissionRatePct: values.commissionRatePct,
        bankNotes: sanitizeText(values.bankNotes, 500),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `teamMembers/${memberId}`);
  }
}

export async function deleteTeamMember(memberId: string, hasPrivateDoc: boolean): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'teamMembers', memberId));
    if (hasPrivateDoc) {
      batch.delete(doc(db, 'teamMemberPrivate', memberId));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `teamMembers/${memberId}`);
  }
}

export async function deleteTeamMemberDocOnly(memberId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'teamMembers', memberId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `teamMembers/${memberId}`);
  }
}
