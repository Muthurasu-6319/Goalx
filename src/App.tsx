import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, PublicOnlyRoute } from './components/layout/ProtectedRoute';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ToastContainer } from './components/ui/ToastContainer';
import { AuthProvider } from './hooks/useAuth';
import { BusinessDataProvider } from './hooks/useBusinessData';
import { PersonalDataProvider } from './hooks/usePersonalData';
import { ToastProvider } from './hooks/useToast';
import { ROUTES } from './lib/constants';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AiCeoPage } from './pages/AiCeoPage';
import { CalendarPage } from './pages/CalendarPage';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { AchievementsPage } from './pages/AchievementsPage';
import { ClientsPage } from './pages/ClientsPage';
import { CompanyPage } from './pages/CompanyPage';
import { CompareCompetitorsPage } from './pages/CompareCompetitorsPage';
import { CompetitionPage } from './pages/CompetitionPage';
import { CompetitiveGapsPage } from './pages/CompetitiveGapsPage';
import { CompetitorAchievementReportPage } from './pages/CompetitorAchievementReportPage';
import { CompetitorProfilePage } from './pages/CompetitorProfilePage';
import { DashboardPage } from './pages/DashboardPage';
import { FinancePage } from './pages/FinancePage';
import { GoalsPage } from './pages/GoalsPage';
import { HabitsPage } from './pages/HabitsPage';
import { LeadsPage } from './pages/LeadsPage';
import { LifeHubPage } from './pages/LifeHubPage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PersonalFinancePage } from './pages/PersonalFinancePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { RegisterPage } from './pages/RegisterPage';
import { ScorecardsPage } from './pages/ScorecardsPage';
import { ServiceCatalogPage } from './pages/ServiceCatalogPage';
import { SettingsPage } from './pages/SettingsPage';
import { TeamPage } from './pages/TeamPage';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <PersonalDataProvider>
            <BusinessDataProvider>
              <BrowserRouter>
              <ToastContainer />
              <OfflineIndicator />
              <Routes>
                {/* Public auth routes */}
                <Route
                  path={ROUTES.LOGIN}
                  element={
                    <PublicOnlyRoute>
                      <LoginPage />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path={ROUTES.REGISTER}
                  element={
                    <PublicOnlyRoute>
                      <RegisterPage />
                    </PublicOnlyRoute>
                  }
                />

                {/* Onboarding route (requires auth, skips main shell) */}
                <Route
                  path={ROUTES.ONBOARDING}
                  element={
                    <ProtectedRoute requireOnboarding={false} useShell={false}>
                      <OnboardingPage />
                    </ProtectedRoute>
                  }
                />

                {/* Phase 1 & 2 Protected App Routes */}
                <Route
                  path={ROUTES.DASHBOARD}
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.LIFE}
                  element={
                    <ProtectedRoute>
                      <LifeHubPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.LIFE_GOALS}
                  element={
                    <ProtectedRoute>
                      <GoalsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.GOALS}
                  element={
                    <ProtectedRoute>
                      <GoalsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.HABITS}
                  element={
                    <ProtectedRoute>
                      <HabitsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.LIFE_INCOME}
                  element={
                    <ProtectedRoute>
                      <PersonalFinancePage defaultTab="ledger" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.LIFE_SAVINGS}
                  element={
                    <ProtectedRoute>
                      <PersonalFinancePage defaultTab="savings" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.CALENDAR}
                  element={
                    <ProtectedRoute>
                      <CalendarPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.COMPANY}
                  element={
                    <ProtectedRoute>
                      <CompanyPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.COMPANY_SERVICES}
                  element={
                    <ProtectedRoute>
                      <ServiceCatalogPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.COMPANY_LEADS}
                  element={
                    <ProtectedRoute>
                      <LeadsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.COMPANY_CLIENTS}
                  element={
                    <ProtectedRoute>
                      <ClientsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={`${ROUTES.COMPANY_CLIENTS}/:clientId`}
                  element={
                    <ProtectedRoute>
                      <ClientDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.PROJECTS}
                  element={
                    <ProtectedRoute>
                      <ProjectsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.COMPANY_TEAM}
                  element={
                    <ProtectedRoute>
                      <TeamPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.COMPANY_FINANCE}
                  element={
                    <ProtectedRoute>
                      <FinancePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.NOTIFICATIONS}
                  element={
                    <ProtectedRoute>
                      <NotificationsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.SETTINGS}
                  element={
                    <ProtectedRoute>
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path={ROUTES.COMPETITION}
                  element={
                    <ProtectedRoute>
                      <CompetitionPage defaultTab="list" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.COMPETITION_DISCOVER}
                  element={
                    <ProtectedRoute>
                      <CompetitionPage defaultTab="discover" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.COMPETITION_COMPARE}
                  element={
                    <ProtectedRoute>
                      <CompareCompetitorsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.COMPETITION_SCORECARDS}
                  element={
                    <ProtectedRoute>
                      <ScorecardsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={ROUTES.COMPETITION_GAPS}
                  element={
                    <ProtectedRoute>
                      <CompetitiveGapsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={`${ROUTES.COMPETITION_REPORT}/:competitorId`}
                  element={
                    <ProtectedRoute>
                      <CompetitorAchievementReportPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path={`${ROUTES.COMPETITION}/:competitorId`}
                  element={
                    <ProtectedRoute>
                      <CompetitorProfilePage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path={ROUTES.ANALYTICS}
                  element={
                    <ProtectedRoute>
                      <AnalyticsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path={ROUTES.AI_CEO}
                  element={
                    <ProtectedRoute>
                      <AiCeoPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path={ROUTES.ACHIEVEMENTS}
                  element={
                    <ProtectedRoute>
                      <AchievementsPage />
                    </ProtectedRoute>
                  }
                />

                {/* Root & fallback redirects */}
                <Route path="/" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
                <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
              </Routes>
              </BrowserRouter>
            </BusinessDataProvider>
          </PersonalDataProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
