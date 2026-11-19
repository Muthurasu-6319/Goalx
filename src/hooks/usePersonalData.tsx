import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  CalendarEvent,
  GoalMilestone,
  GoalProgressEntry,
  Habit,
  HabitLog,
  PersonalExpense,
  PersonalGoal,
  PersonalIncome,
  SavingsGoal,
  SavingsTransaction,
} from '../types';
import { useAuth } from './useAuth';

interface PersonalDataContextValue {
  loading: boolean;
  goals: PersonalGoal[];
  milestones: GoalMilestone[];
  goalHistory: GoalProgressEntry[];
  habits: Habit[];
  habitLogs: HabitLog[];
  incomes: PersonalIncome[];
  expenses: PersonalExpense[];
  savingsGoals: SavingsGoal[];
  savingsTransactions: SavingsTransaction[];
  calendarEvents: CalendarEvent[];
}

const PersonalDataContext = createContext<PersonalDataContextValue | undefined>(undefined);

export const PersonalDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, authReady, userProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  const [goals, setGoals] = useState<PersonalGoal[]>([]);
  const [milestones, setMilestones] = useState<GoalMilestone[]>([]);
  const [goalHistory, setGoalHistory] = useState<GoalProgressEntry[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [incomes, setIncomes] = useState<PersonalIncome[]>([]);
  const [expenses, setExpenses] = useState<PersonalExpense[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [savingsTransactions, setSavingsTransactions] = useState<SavingsTransaction[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    if (!authReady || !firebaseUser || !userProfile?.onboardingCompleted) {
      setGoals([]);
      setMilestones([]);
      setGoalHistory([]);
      setHabits([]);
      setHabitLogs([]);
      setIncomes([]);
      setExpenses([]);
      setSavingsGoals([]);
      setSavingsTransactions([]);
      setCalendarEvents([]);
      setLoading(false);
      return;
    }

    const uid = firebaseUser.uid;
    setLoading(true);

    const readyFlags = new Set<string>();
    const totalStreams = 10;
    const markReady = (name: string) => {
      readyFlags.add(name);
      if (readyFlags.size >= totalStreams) {
        setLoading(false);
      }
    };

    const subscribeCollection = <T extends { id: string }>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>
    ) => {
      const q = query(collection(db, colName), where('ownerId', '==', uid));
      return onSnapshot(
        q,
        (snapshot) => {
          const items = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, 'id'>) }) as T);
          setter(items);
          markReady(colName);
        },
        (error) => {
          markReady(colName);
          handleFirestoreError(error, OperationType.LIST, colName);
        }
      );
    };

    const unsubs = [
      subscribeCollection<PersonalGoal>('goals', setGoals),
      subscribeCollection<GoalMilestone>('milestones', setMilestones),
      subscribeCollection<GoalProgressEntry>('goalProgressHistory', setGoalHistory),
      subscribeCollection<Habit>('habits', setHabits),
      subscribeCollection<HabitLog>('habitLogs', setHabitLogs),
      subscribeCollection<PersonalIncome>('incomes', setIncomes),
      subscribeCollection<PersonalExpense>('expenses', setExpenses),
      subscribeCollection<SavingsGoal>('savingsGoals', setSavingsGoals),
      subscribeCollection<SavingsTransaction>('savingsTransactions', setSavingsTransactions),
      subscribeCollection<CalendarEvent>('calendarEvents', setCalendarEvents),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, firebaseUser, userProfile?.onboardingCompleted]);

  return (
    <PersonalDataContext.Provider
      value={{
        loading,
        goals,
        milestones,
        goalHistory,
        habits,
        habitLogs,
        incomes,
        expenses,
        savingsGoals,
        savingsTransactions,
        calendarEvents,
      }}
    >
      {children}
    </PersonalDataContext.Provider>
  );
};

export function usePersonalData() {
  const ctx = useContext(PersonalDataContext);
  if (!ctx) {
    throw new Error('usePersonalData must be used within a PersonalDataProvider');
  }
  return ctx;
}
