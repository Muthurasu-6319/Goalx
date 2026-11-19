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
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { IncomeType } from '../types';

export interface SaveIncomeInput {
  source: string;
  type: IncomeType;
  amountPaise: number;
  date: string;
  notes: string;
}

export interface SaveExpenseInput {
  category: string;
  amountPaise: number;
  date: string;
  paymentMethod: string;
  notes: string;
}

export interface SaveSavingsGoalInput {
  name: string;
  targetAmountPaise: number;
  targetDate: string;
}

export interface AddSavingsTxInput {
  savingsGoalId: string;
  type: 'deposit' | 'withdraw';
  amountPaise: number;
  date: string;
  notes: string;
}

export async function createIncome(uid: string, input: SaveIncomeInput): Promise<void> {
  try {
    await addDoc(collection(db, 'incomes'), {
      ownerId: uid,
      source: input.source.trim().slice(0, 160),
      type: input.type,
      amountPaise: Math.max(0, Math.round(input.amountPaise)),
      date: input.date.trim().slice(0, 20),
      notes: input.notes.trim().slice(0, 500),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'incomes');
  }
}

export async function updateIncome(incomeId: string, input: SaveIncomeInput): Promise<void> {
  try {
    await updateDoc(doc(db, 'incomes', incomeId), {
      source: input.source.trim().slice(0, 160),
      type: input.type,
      amountPaise: Math.max(0, Math.round(input.amountPaise)),
      date: input.date.trim().slice(0, 20),
      notes: input.notes.trim().slice(0, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `incomes/${incomeId}`);
  }
}

export async function deleteIncome(incomeId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'incomes', incomeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `incomes/${incomeId}`);
  }
}

export async function createExpense(uid: string, input: SaveExpenseInput): Promise<void> {
  try {
    await addDoc(collection(db, 'expenses'), {
      ownerId: uid,
      category: input.category.trim().slice(0, 80),
      amountPaise: Math.max(0, Math.round(input.amountPaise)),
      date: input.date.trim().slice(0, 20),
      paymentMethod: input.paymentMethod.trim().slice(0, 60),
      notes: input.notes.trim().slice(0, 500),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'expenses');
  }
}

export async function updateExpense(expenseId: string, input: SaveExpenseInput): Promise<void> {
  try {
    await updateDoc(doc(db, 'expenses', expenseId), {
      category: input.category.trim().slice(0, 80),
      amountPaise: Math.max(0, Math.round(input.amountPaise)),
      date: input.date.trim().slice(0, 20),
      paymentMethod: input.paymentMethod.trim().slice(0, 60),
      notes: input.notes.trim().slice(0, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `expenses/${expenseId}`);
  }
}

export async function deleteExpense(expenseId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'expenses', expenseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `expenses/${expenseId}`);
  }
}

export async function createSavingsGoal(uid: string, input: SaveSavingsGoalInput): Promise<void> {
  try {
    await addDoc(collection(db, 'savingsGoals'), {
      ownerId: uid,
      name: input.name.trim().slice(0, 160),
      targetAmountPaise: Math.max(1, Math.round(input.targetAmountPaise)),
      targetDate: input.targetDate.trim().slice(0, 20),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'savingsGoals');
  }
}

export async function updateSavingsGoal(goalId: string, input: SaveSavingsGoalInput): Promise<void> {
  try {
    await updateDoc(doc(db, 'savingsGoals', goalId), {
      name: input.name.trim().slice(0, 160),
      targetAmountPaise: Math.max(1, Math.round(input.targetAmountPaise)),
      targetDate: input.targetDate.trim().slice(0, 20),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `savingsGoals/${goalId}`);
  }
}

export async function deleteSavingsGoal(uid: string, savingsGoalId: string): Promise<void> {
  try {
    const txSnap = await getDocs(
      query(
        collection(db, 'savingsTransactions'),
        where('ownerId', '==', uid),
        where('savingsGoalId', '==', savingsGoalId)
      )
    );
    const batch = writeBatch(db);
    txSnap.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'savingsGoals', savingsGoalId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `savingsGoals/${savingsGoalId}`);
  }
}

export async function addSavingsTransaction(uid: string, input: AddSavingsTxInput): Promise<void> {
  try {
    await addDoc(collection(db, 'savingsTransactions'), {
      ownerId: uid,
      savingsGoalId: input.savingsGoalId,
      type: input.type,
      amountPaise: Math.max(1, Math.round(input.amountPaise)),
      date: input.date.trim().slice(0, 20),
      notes: input.notes.trim().slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'savingsTransactions');
  }
}

export async function deleteSavingsTransaction(txId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'savingsTransactions', txId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `savingsTransactions/${txId}`);
  }
}
