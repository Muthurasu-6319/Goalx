import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { CompanyProfile, UserProfile, UserSettings } from '../types';

interface AuthContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  dataLoading: boolean;
  userProfile: UserProfile | null;
  companyProfile: CompanyProfile | null;
  userSettings: UserSettings | null;
  dataError: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setUserProfile(null);
        setCompanyProfile(null);
        setUserSettings(null);
        setDataLoading(false);
        setDataError(null);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!authReady || !firebaseUser) {
      return;
    }

    setDataLoading(true);
    setDataError(null);

    let userLoaded = false;
    let companyLoaded = false;
    let settingsLoaded = false;

    const markLoaded = () => {
      if (userLoaded && companyLoaded && settingsLoaded) {
        setDataLoading(false);
      }
    };

    const userPath = `users/${firebaseUser.uid}`;
    const unsubUser = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snapshot) => {
        setUserProfile(snapshot.exists() ? (snapshot.data() as UserProfile) : null);
        userLoaded = true;
        markLoaded();
      },
      (error) => {
        setDataLoading(false);
        setDataError(error.message);
        handleFirestoreError(error, OperationType.GET, userPath);
      }
    );

    const companyPath = `companies/${firebaseUser.uid}`;
    const unsubCompany = onSnapshot(
      doc(db, 'companies', firebaseUser.uid),
      (snapshot) => {
        setCompanyProfile(snapshot.exists() ? (snapshot.data() as CompanyProfile) : null);
        companyLoaded = true;
        markLoaded();
      },
      (error) => {
        setDataLoading(false);
        setDataError(error.message);
        handleFirestoreError(error, OperationType.GET, companyPath);
      }
    );

    const settingsPath = `settings/${firebaseUser.uid}`;
    const unsubSettings = onSnapshot(
      doc(db, 'settings', firebaseUser.uid),
      (snapshot) => {
        setUserSettings(snapshot.exists() ? (snapshot.data() as UserSettings) : null);
        settingsLoaded = true;
        markLoaded();
      },
      (error) => {
        setDataLoading(false);
        setDataError(error.message);
        handleFirestoreError(error, OperationType.GET, settingsPath);
      }
    );

    return () => {
      unsubUser();
      unsubCompany();
      unsubSettings();
    };
  }, [authReady, firebaseUser]);

  // Synchronize Appearance settings (Light/Dark theme, density, reduced motion) to DOM
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    let storedTheme: string | null = null;
    try {
      storedTheme = localStorage.getItem('goalx_theme');
    } catch {
      storedTheme = null;
    }
    const theme = userSettings?.theme ?? (storedTheme === 'dark' ? 'dark' : 'light');
    const density = userSettings?.density ?? 'comfortable';
    const reducedMotion = Boolean(userSettings?.reducedMotion);

    root.classList.toggle('dark', theme === 'dark');
    root.dataset.density = density;
    root.dataset.reducedMotion = reducedMotion ? 'true' : 'false';

    if (userSettings?.theme) {
      try {
        localStorage.setItem('goalx_theme', userSettings.theme);
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [userSettings?.theme, userSettings?.density, userSettings?.reducedMotion]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        authReady,
        dataLoading,
        userProfile,
        companyProfile,
        userSettings,
        dataError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
