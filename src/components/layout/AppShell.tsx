import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  HeartPulse,
  Home,
  IndianRupee,
  Layers,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Radar,
  Settings,
  Sparkles,
  Target,
  Trophy,
  User as UserIcon,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { useToast } from '../../hooks/useToast';
import { ALL_NAV_ITEMS, ROUTE_TITLES, ROUTES } from '../../lib/constants';
import { logoutUser } from '../../services/authService';
import { updateUserSettings } from '../../services/settingsService';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  LayoutDashboard,
  HeartPulse,
  Building2,
  Radar,
  Target,
  FolderKanban,
  CheckSquare,
  CalendarDays,
  BarChart3,
  Sparkles,
  Trophy,
  Bell,
  Settings,
  Wallet,
  Layers,
  BriefcaseBusiness,
  Users,
  UserCog,
  IndianRupee,
};

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { firebaseUser, userProfile, companyProfile, userSettings } = useAuth();
  const { unreadCount } = useNotifications();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [localCollapsed, setLocalCollapsed] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isCollapsed = userSettings?.sidebarCollapsed ?? localCollapsed;

  const handleToggleSidebar = async () => {
    const next = !isCollapsed;
    setLocalCollapsed(next);
    if (firebaseUser && userSettings) {
      try {
        await updateUserSettings(firebaseUser.uid, { sidebarCollapsed: next });
      } catch {
        // Local toggle already updated
      }
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logoutUser();
      setMoreSheetOpen(false);
      showToast('Signed out', { description: 'See you next session.', variant: 'info' });
      navigate(ROUTES.LOGIN);
    } catch (err) {
      showToast('Sign out failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSigningOut(false);
    }
  };

  const currentNav = ALL_NAV_ITEMS.find((item) => item.path === location.pathname);
  const pageTitle =
    ROUTE_TITLES[location.pathname] ??
    (location.pathname.startsWith(`${ROUTES.COMPANY_CLIENTS}/`) ? 'Client Details' : undefined) ??
    (location.pathname.startsWith(`${ROUTES.COMPETITION_REPORT}/`) ? 'Achievement Report' : undefined) ??
    (location.pathname.startsWith(`${ROUTES.COMPETITION}/`) ? 'Competitor Profile' : undefined) ??
    currentNav?.label ??
    'GoalX';

  const displayName = userProfile?.name || firebaseUser?.displayName || 'CEO';
  const avatarUrl = userProfile?.photoUrl || firebaseUser?.photoURL || '';
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const mobilePrimaryPaths = [
    ROUTES.DASHBOARD,
    ROUTES.GOALS,
    ROUTES.COMPANY,
    ROUTES.COMPETITION,
    ROUTES.SETTINGS,
  ];
  const moreMenuItems = ALL_NAV_ITEMS.filter((item) => !mobilePrimaryPaths.includes(item.path as never));

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1F2937] flex flex-col md:flex-row">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden md:flex md:flex-col md:sticky md:top-0 md:h-screen bg-white border-r border-[#E2E8F0] transition-[width] duration-200 shrink-0 ${
          isCollapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#E2E8F0]">
          <NavLink
            to={ROUTES.DASHBOARD}
            className="flex items-center gap-2.5 overflow-hidden whitespace-nowrap"
          >
            <div className="w-8 h-8 rounded-lg bg-[#DC2626] flex items-center justify-center text-white font-bold text-sm shrink-0">
              GX
            </div>
            {!isCollapsed && (
              <span className="text-lg font-bold tracking-tight text-[#1F2937]">GoalX</span>
            )}
          </NavLink>
          <button
            type="button"
            onClick={handleToggleSidebar}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 transition-colors cursor-pointer"
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {ALL_NAV_ITEMS.map((item) => {
            const Icon = ICON_MAP[item.iconName] ?? LayoutDashboard;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `min-h-[42px] flex items-center gap-3 px-3 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-red-50 text-[#DC2626]'
                      : 'text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100/70'
                  }`
                }
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {!isCollapsed && <span className="truncate flex-1">{item.label}</span>}
                {item.path === ROUTES.NOTIFICATIONS && unreadCount > 0 && (
                  <span
                    className={`inline-flex items-center justify-center rounded-full bg-[#DC2626] text-white font-semibold tabular-nums ${
                      isCollapsed ? 'w-2 h-2 text-[0px]' : 'min-w-[20px] h-5 px-1.5 text-[11px]'
                    }`}
                  >
                    {isCollapsed ? '' : unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#E2E8F0]">
          {!isCollapsed && companyProfile && (
            <div className="px-3 py-2 mb-2 text-xs text-[#64748B] truncate">
              {companyProfile.name}
            </div>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            title={isCollapsed ? 'Sign Out' : undefined}
            className="w-full min-h-[42px] flex items-center gap-3 px-3 rounded-xl text-sm font-medium text-[#64748B] hover:text-[#DC2626] hover:bg-red-50/70 transition-colors whitespace-nowrap cursor-pointer"
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            {!isCollapsed && <span>{signingOut ? 'Signing out...' : 'Sign Out'}</span>}
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Compact Header (52px) */}
        <header className="md:hidden sticky top-0 z-30 h-[52px] bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] px-4 flex items-center justify-between gap-4">
          <NavLink to={ROUTES.DASHBOARD} className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-[#DC2626] flex items-center justify-center text-white font-bold text-xs">
              GX
            </div>
            <span className="text-base font-bold tracking-tight text-[#1F2937] whitespace-nowrap">
              GoalX
            </span>
          </NavLink>

          <span className="text-sm font-semibold text-[#1F2937] truncate">{pageTitle}</span>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />
            <NavLink
              to={ROUTES.NOTIFICATIONS}
              aria-label={`Notifications (${unreadCount} unread)`}
              className="relative w-9 h-9 rounded-full bg-slate-100 border border-[#E2E8F0] flex items-center justify-center text-[#1F2937] hover:bg-slate-200 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </NavLink>
            <NavLink
              to={ROUTES.SETTINGS}
              aria-label="Profile and Settings"
              className="w-9 h-9 rounded-full bg-slate-100 border border-[#E2E8F0] overflow-hidden flex items-center justify-center text-xs font-semibold text-[#1F2937]"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                initials || 'CX'
              )}
            </NavLink>
          </div>
        </header>

        {/* Desktop Header (64px, 3-zone contract) */}
        <header className="hidden md:flex sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] px-8 items-center justify-between gap-8">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-[#64748B] whitespace-nowrap">GoalX</span>
            <span className="text-[#64748B]">/</span>
            <span className="font-semibold text-[#1F2937] truncate">{pageTitle}</span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <PWAInstallButton compact />
            <NavLink
              to={ROUTES.NOTIFICATIONS}
              aria-label={`Notifications (${unreadCount} unread)`}
              className="relative min-h-[38px] min-w-[38px] rounded-xl border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 transition-colors"
            >
              <Bell className="w-[18px] h-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-[#DC2626] text-white text-[11px] font-bold flex items-center justify-center tabular-nums">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </NavLink>
            <NavLink
              to={ROUTES.SETTINGS}
              className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 border border-[#E2E8F0] overflow-hidden flex items-center justify-center text-xs font-semibold text-[#1F2937] shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  initials || 'CX'
                )}
              </div>
              <span className="text-sm font-medium text-[#1F2937] whitespace-nowrap max-w-[160px] truncate">
                {displayName}
              </span>
            </NavLink>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Home, Goals, Company, Competition, Profile + More) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] pb-safe"
      >
        <div className="grid grid-cols-6 h-16 items-center">
          <NavLink
            to={ROUTES.DASHBOARD}
            className={({ isActive }) =>
              `min-h-[44px] flex flex-col items-center justify-center gap-1 px-0.5 transition-colors ${
                isActive ? 'text-[#DC2626]' : 'text-[#64748B]'
              }`
            }
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none truncate max-w-full">Home</span>
          </NavLink>

          <NavLink
            to={ROUTES.GOALS}
            className={({ isActive }) =>
              `min-h-[44px] flex flex-col items-center justify-center gap-1 px-0.5 transition-colors ${
                isActive ? 'text-[#DC2626]' : 'text-[#64748B]'
              }`
            }
          >
            <Target className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none truncate max-w-full">Goals</span>
          </NavLink>

          <NavLink
            to={ROUTES.COMPANY}
            className={({ isActive }) =>
              `min-h-[44px] flex flex-col items-center justify-center gap-1 px-0.5 transition-colors ${
                isActive ? 'text-[#DC2626]' : 'text-[#64748B]'
              }`
            }
          >
            <Building2 className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none truncate max-w-full">Company</span>
          </NavLink>

          <NavLink
            to={ROUTES.COMPETITION}
            className={({ isActive }) =>
              `min-h-[44px] flex flex-col items-center justify-center gap-1 px-0.5 transition-colors ${
                isActive ? 'text-[#DC2626]' : 'text-[#64748B]'
              }`
            }
          >
            <Radar className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none truncate max-w-full">Compete</span>
          </NavLink>

          <NavLink
            to={ROUTES.SETTINGS}
            className={({ isActive }) =>
              `min-h-[44px] flex flex-col items-center justify-center gap-1 px-0.5 transition-colors ${
                isActive ? 'text-[#DC2626]' : 'text-[#64748B]'
              }`
            }
          >
            <UserIcon className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none truncate max-w-full">Profile</span>
          </NavLink>

          <button
            type="button"
            onClick={() => setMoreSheetOpen(true)}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-1 px-0.5 transition-colors cursor-pointer ${
              moreSheetOpen ? 'text-[#DC2626]' : 'text-[#64748B]'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none truncate max-w-full">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" Bottom Sheet Drawer */}
      <AnimatePresence>
        {moreSheetOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreSheetOpen(false)}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.2 }}
              className="relative z-10 bg-white rounded-t-3xl border-t border-[#E2E8F0] px-5 pt-3 pb-6 max-h-[82vh] overflow-y-auto"
            >
              <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-[#1F2937]">Command Center Modules</h2>
                <button
                  type="button"
                  onClick={() => setMoreSheetOpen(false)}
                  aria-label="Close menu"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#64748B] hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {moreMenuItems.map((item) => {
                  const Icon = ICON_MAP[item.iconName] ?? LayoutDashboard;
                  const active = location.pathname === item.path;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMoreSheetOpen(false)}
                      className={`min-h-[48px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                        active
                          ? 'bg-red-50 border-red-200 text-[#DC2626]'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#1F2937] hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate flex-1">{item.label}</span>
                      {item.path === ROUTES.NOTIFICATIONS && unreadCount > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#DC2626] text-white text-[11px] font-bold flex items-center justify-center tabular-nums">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>

              <div className="mt-5 pt-4 border-t border-[#E2E8F0] flex items-center justify-between gap-3">
                <PWAInstallButton compact />
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#DC2626] hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{signingOut ? 'Signing out...' : 'Sign Out'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
