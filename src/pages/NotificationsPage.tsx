import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BellOff,
  Bot,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Settings,
  Trash2,
} from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAiCeo } from '../hooks/useAiCeo';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { useToast } from '../hooks/useToast';
import { NOTIFICATION_CATEGORY_DEFS, ROUTES } from '../lib/constants';
import { sanitizeInternalRoute } from '../lib/urlUtils';
import {
  getBrowserNotificationState,
  requestBrowserNotificationPermissionOnlyOnClick,
} from '../services/notificationService';
import { updateUserSettings } from '../services/settingsService';
import { NotificationCategory, NotificationItem, NotificationSeverity } from '../types';

const PAGE_SIZE = 12;

const CATEGORY_LABEL_MAP = new Map<NotificationCategory, string>(
  NOTIFICATION_CATEGORY_DEFS.map((c) => [c.key, c.label])
);

function formatNotifTime(item: NotificationItem): string {
  const ts = item.createdAt?.toDate?.();
  if (!ts) return 'Just now';
  return ts.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SeverityIcon({ severity }: { severity: NotificationSeverity }) {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />;
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />;
    default:
      return <Info className="w-4 h-4 text-[#2563EB] shrink-0" />;
  }
}

export const NotificationsPage: React.FC = () => {
  const { firebaseUser, userSettings } = useAuth();
  const {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    removeNotification,
  } = useNotifications();
  const {
    todayDailyBriefing,
    pendingProposals,
    expiringSoonProposals,
    ist,
  } = useAiCeo();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [readFilter, setReadFilter] = useState<'all' | 'unread'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [markingAll, setMarkingAll] = useState(false);
  const [pushPermission, setPushPermission] = useState(() => getBrowserNotificationState());

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (readFilter === 'unread' && n.read) return false;
      if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
      return true;
    });
  }, [notifications, readFilter, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const handleFilterChange = (nextRead: 'all' | 'unread', nextCategory: string) => {
    setReadFilter(nextRead);
    setCategoryFilter(nextCategory);
    setPage(1);
  };

  const handleEnableBrowserPush = async () => {
    const result = await requestBrowserNotificationPermissionOnlyOnClick();
    setPushPermission(result);
    if (result === 'granted' && firebaseUser) {
      try {
        await updateUserSettings(firebaseUser.uid, { browserPushEnabled: true });
        showToast('Browser notifications enabled', {
          description: 'Critical and warning alerts will also appear as desktop notifications.',
          variant: 'success',
        });
      } catch {
        showToast('Browser permission granted', { variant: 'info' });
      }
    } else if (result === 'denied') {
      showToast('Browser notifications blocked', {
        description: 'Follow the instructions below to allow notifications in your browser settings.',
        variant: 'warning',
      });
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      const count = await markAllRead();
      showToast(
        count > 0 ? `Marked ${count} notification${count === 1 ? '' : 's'} as read` : 'All caught up',
        { variant: 'success' }
      );
    } catch (err) {
      showToast('Failed to mark all as read', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setMarkingAll(false);
    }
  };

  const handleOpenNotification = async (item: NotificationItem) => {
    if (!item.read) {
      void markRead(item.id, true);
    }
    navigate(sanitizeInternalRoute(item.link, ROUTES.NOTIFICATIONS));
  };

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Notification Center</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Unified alerts for deadlines, budgets, payments, follow-ups, goals, competitors, and AI proposals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={markingAll}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4 text-[#16A34A]" />
              <span>{markingAll ? 'Updating...' : 'Mark all read'}</span>
            </button>
          )}
          <Link
            to={`${ROUTES.SETTINGS}?tab=notifications`}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#1F2937] hover:bg-slate-50"
          >
            <Settings className="w-4 h-4 text-[#64748B]" />
            <span>Preferences</span>
          </Link>
        </div>
      </div>

      {/* Browser Push Opt-In Banner (NEVER asks on page load; strictly on user click) */}
      {pushPermission !== 'unsupported' && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {pushPermission === 'default' && (
            <>
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-[#DC2626] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">
                    Desktop &amp; Browser Alerts
                  </p>
                  <p className="text-xs text-[#64748B]">
                    Optionally enable browser push alerts for overdue invoices and budget breaches. Nothing is sent externally without your permission.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleEnableBrowserPush()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#DC2626] text-white text-xs font-medium hover:bg-[#B91C1C] shrink-0 cursor-pointer"
              >
                Enable notifications
              </button>
            </>
          )}

          {pushPermission === 'denied' && (
            <div className="flex items-start gap-3">
              <BellOff className="w-5 h-5 text-[#F59E0B] mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-[#1F2937]">
                  Browser Notifications Blocked
                </p>
                <p className="text-xs text-[#64748B] mt-0.5">
                  To re-enable: click the lock/site-info icon in your browser address bar &rarr; Site settings &rarr; Notifications &rarr; select <strong>Allow</strong>, then reload this page.
                </p>
              </div>
            </div>
          )}

          {pushPermission === 'granted' && (
            <div className="flex items-center justify-between w-full gap-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                <p className="text-xs text-[#64748B]">
                  Browser permission granted.{' '}
                  {userSettings?.browserPushEnabled
                    ? 'Desktop push alerts are active (respecting quiet hours).'
                    : 'Turn on Desktop Push inside Notification Preferences whenever you want popup alerts.'}
                </p>
              </div>
              <Link
                to={`${ROUTES.SETTINGS}?tab=notifications`}
                className="text-xs font-medium text-[#2563EB] hover:underline shrink-0"
              >
                Configure
              </Link>
            </div>
          )}
        </div>
      )}

      {/* AI CEO Quick Highlights */}
      {(todayDailyBriefing || pendingProposals.length > 0) && (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#DC2626]" />
              <h2 className="text-sm font-semibold text-[#1F2937]">
                GoalX AI CEO ({pendingProposals.length} pending proposals)
              </h2>
            </div>
            <Link
              to={ROUTES.AI_CEO}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#DC2626] hover:underline"
            >
              <span>Open AI CEO</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {todayDailyBriefing && (
              <Link
                to={`${ROUTES.AI_CEO}?tab=briefing`}
                className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 flex items-center justify-between gap-2 hover:border-blue-300"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#1F2937]">
                    Daily Briefing Ready ({ist.dateStr})
                  </p>
                  <p className="text-[#64748B] truncate mt-0.5">
                    {todayDailyBriefing.topPriority}
                  </p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-[#2563EB] shrink-0" />
              </Link>
            )}
            {expiringSoonProposals.length > 0 && (
              <Link
                to={`${ROUTES.AI_CEO}?tab=proposals`}
                className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-center justify-between gap-2 text-amber-950"
              >
                <span className="font-semibold">
                  {expiringSoonProposals.length} proposal{expiringSoonProposals.length === 1 ? '' : 's'} expiring within 48h
                </span>
                <ArrowUpRight className="w-4 h-4 text-[#DC2626] shrink-0" />
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => handleFilterChange('all', categoryFilter)}
            className={`min-h-[36px] px-3.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              readFilter === 'all'
                ? 'bg-white text-[#1F2937] shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2937]'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('unread', categoryFilter)}
            className={`min-h-[36px] px-3.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              readFilter === 'unread'
                ? 'bg-white text-[#DC2626] shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2937]'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="notif-category-filter" className="text-xs font-medium text-[#64748B] whitespace-nowrap">
            Category:
          </label>
          <select
            id="notif-category-filter"
            value={categoryFilter}
            onChange={(e) => handleFilterChange(readFilter, e.target.value)}
            className="h-9 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20"
          >
            <option value="all">All Categories</option>
            {NOTIFICATION_CATEGORY_DEFS.map((cat) => (
              <option key={cat.key} value={cat.key}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Unified Notification Feed */}
      {pagedItems.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
          <EmptyState
            title={readFilter === 'unread' ? 'No unread notifications' : 'All caught up'}
            description={
              readFilter === 'unread'
                ? 'Every alert in this filter has been read.'
                : 'No alerts match the current filter.'
            }
            icon={<Bell className="w-5 h-5" />}
          />
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
          <ul className="divide-y divide-[#E2E8F0]">
            {pagedItems.map((item) => (
              <li
                key={item.id}
                className={`p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  item.read ? 'opacity-75' : 'bg-red-50/25'
                }`}
              >
                <button
                  type="button"
                  onClick={() => void handleOpenNotification(item)}
                  className="flex-1 text-left min-w-0 cursor-pointer group"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <SeverityIcon severity={item.severity} />
                    <span className="text-sm font-semibold text-[#1F2937] group-hover:text-[#DC2626] transition-colors truncate">
                      {item.title}
                    </span>
                    {!item.read && (
                      <span className="w-2 h-2 rounded-full bg-[#DC2626] shrink-0" aria-label="Unread" />
                    )}
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-[#64748B]">
                      {CATEGORY_LABEL_MAP.get(item.category) ?? item.category}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#64748B] leading-relaxed">{item.message}</p>
                  <p className="mt-1 text-[11px] text-[#64748B] tabular-nums">
                    {formatNotifTime(item)} · Click to open record &rarr;
                  </p>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void markRead(item.id, !item.read)}
                    className="min-h-[36px] inline-flex items-center gap-1 px-3 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{item.read ? 'Mark Unread' : 'Mark Read'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeNotification(item.id)}
                    aria-label="Delete notification"
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 sm:px-6 py-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
              <span className="tabular-nums">
                Page {safePage} of {totalPages} ({filtered.length} alerts)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-[34px] inline-flex items-center gap-1 px-2.5 rounded-lg border border-[#E2E8F0] text-[#1F2937] disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-[34px] inline-flex items-center gap-1 px-2.5 rounded-lg border border-[#E2E8F0] text-[#1F2937] disabled:opacity-40 cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
