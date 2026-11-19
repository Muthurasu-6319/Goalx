import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ROUTES } from '../../lib/constants';
import { AppShell } from './AppShell';
import { DashboardSkeleton } from '../ui/Skeleton';

const FullScreenLoader: React.FC = () => (
  <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
    <div className="w-full max-w-5xl">
      <DashboardSkeleton />
    </div>
  </div>
);

export const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  requireOnboarding?: boolean;
  useShell?: boolean;
}> = ({ children, requireOnboarding = true, useShell = true }) => {
  const { firebaseUser, authReady, dataLoading, userProfile } = useAuth();

  if (!authReady || (firebaseUser && dataLoading)) {
    return useShell ? (
      <div className="min-h-screen bg-[#F8FAFC] p-6 max-w-7xl mx-auto">
        <DashboardSkeleton />
      </div>
    ) : (
      <FullScreenLoader />
    );
  }

  if (!firebaseUser) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  if (requireOnboarding && (!userProfile || !userProfile.onboardingCompleted)) {
    return <Navigate to={ROUTES.ONBOARDING} replace />;
  }

  if (!requireOnboarding && userProfile?.onboardingCompleted) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return useShell ? <AppShell>{children}</AppShell> : <>{children}</>;
};

export const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, authReady, dataLoading, userProfile } = useAuth();

  if (!authReady || (firebaseUser && dataLoading)) {
    return <FullScreenLoader />;
  }

  if (firebaseUser) {
    if (!userProfile || !userProfile.onboardingCompleted) {
      return <Navigate to={ROUTES.ONBOARDING} replace />;
    }
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <>{children}</>;
};
