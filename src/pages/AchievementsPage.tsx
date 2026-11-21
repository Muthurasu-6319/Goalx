import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  BarChart3,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  Crown,
  Flag,
  Flame,
  HelpCircle,
  ListChecks,
  Loader2,
  Radar,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../hooks/useAuth';
import { ROUTES } from '../lib/constants';
import {
  AchievementCategory,
  AchievementItem,
  GamificationSummaryResponse,
  XpSourceType,
  XpTransaction,
} from '../types';
import { fetchGamificationSummary, syncGamificationXp } from '../services/gamificationService';

const ACHIEVEMENT_ICONS: Record<string, React.FC<{ className?: string }>> = {
  CheckCircle2,
  ListChecks,
  Flame,
  Zap,
  ShieldCheck,
  Target,
  Flag,
  Briefcase,
  TrendingUp,
  FolderCheck: Briefcase,
  Award,
  Radar,
  Crosshair,
  Crown,
  Star,
  Trophy,
};

function getLevelTitle(level: number): string {
  if (level >= 10) return 'Chief Executive Officer';
  if (level >= 8) return 'Executive Vice President';
  if (level >= 5) return 'Senior Executive';
  if (level >= 3) return 'Operational Leader';
  if (level >= 2) return 'Rising Strategist';
  return 'Associate Leader';
}

function getSourceTypeBadge(type: XpSourceType): { label: string; color: string } {
  switch (type) {
    case 'task':
      return { label: 'Task', color: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'habit':
      return { label: 'Habit', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'goal':
      return { label: 'Goal', color: 'bg-purple-50 text-purple-700 border-purple-200' };
    case 'milestone':
      return { label: 'Milestone', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'project':
      return { label: 'Project', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'lead':
      return { label: 'Client Win', color: 'bg-green-50 text-green-700 border-green-200' };
    case 'competitor_review':
      return { label: 'Market Intel', color: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'gap_closed':
      return { label: 'Gap Closed', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
    case 'competitor_surpassed':
      return { label: 'Competitor Victory', color: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'achievement':
      return { label: 'Achievement', color: 'bg-yellow-50 text-yellow-800 border-yellow-300' };
    default:
      return { label: 'Action', color: 'bg-slate-50 text-slate-700 border-slate-200' };
  }
}

export const AchievementsPage: React.FC = () => {
  const { firebaseUser, userProfile } = useAuth();
  const [data, setData] = useState<GamificationSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<'all' | AchievementCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [txFilter, setTxFilter] = useState<'all' | XpSourceType>('all');

  const loadData = async (isManualSync = false) => {
    try {
      if (isManualSync) {
        setSyncing(true);
        setSyncNotice(null);
        const res = await syncGamificationXp();
        setData(res);
        if (res.syncResult && res.syncResult.awardedXp > 0) {
          setSyncNotice(
            `Earned +${res.syncResult.awardedXp} XP from ${res.syncResult.newTransactionsCount} newly verified action(s)!`
          );
        } else {
          setSyncNotice('All completed actions are currently up to date.');
        }
      } else {
        setLoading(true);
        // Initial sync ensures newly completed tasks/goals get verified immediately
        const res = await syncGamificationXp().catch(async () => {
          return await fetchGamificationSummary();
        });
        setData(res);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gamification data');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, [firebaseUser]);

  // Derived calculations
  const totalXp = data?.userXp?.totalXp ?? userProfile?.xp ?? 0;
  const level = data?.userXp?.level ?? userProfile?.level ?? 1;
  const streakDays = data?.userXp?.streakDays ?? userProfile?.streakDays ?? 0;
  const xpIntoLevel = totalXp % 250;
  const xpNeededForNextLevel = 250 - xpIntoLevel;
  const xpProgressPct = Math.min(100, Math.round((xpIntoLevel / 250) * 100));

  const filteredAchievements = useMemo(() => {
    if (!data?.achievements) return [];
    return data.achievements.filter((ach) => {
      if (categoryFilter !== 'all' && ach.category !== categoryFilter) return false;
      if (statusFilter === 'unlocked' && !ach.isUnlocked) return false;
      if (statusFilter === 'locked' && ach.isUnlocked) return false;
      return true;
    });
  }, [data?.achievements, categoryFilter, statusFilter]);

  const unlockedCount = useMemo(() => {
    return data?.achievements?.filter((a) => a.isUnlocked).length ?? 0;
  }, [data?.achievements]);

  const totalAchievements = data?.achievements?.length ?? 16;

  const filteredTransactions = useMemo(() => {
    if (!data?.recentTransactions) return [];
    if (txFilter === 'all') return data.recentTransactions;
    return data.recentTransactions.filter((tx) => tx.sourceType === txFilter);
  }, [data?.recentTransactions, txFilter]);

  if (loading && !data) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#DC2626]" />
        <p className="text-sm font-medium text-[#64748B]">Calculating Executive XP & Badges...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-[#DC2626] border border-red-200">
              <Trophy className="w-3.5 h-3.5" />
              Phase 6A Executive Gamification
            </span>
            <span className="text-xs text-[#64748B]">Verified Server-Side</span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#1F2937]">
            Executive Achievements & XP
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Track verified CEO leadership points, consistency streaks, and milestone badges.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center">
          <Link
            to={ROUTES.SETTINGS}
            className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#64748B] hover:text-[#1F2937] hover:border-slate-300 transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>XP Settings</span>
          </Link>
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={syncing}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer shadow-xs transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Verifying Actions...' : 'Sync & Claim XP'}</span>
          </button>
        </div>
      </div>

      {syncNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncNotice(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-medium ml-2 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-[#DC2626]">
          {error}
        </div>
      )}

      {/* Top 3 Core Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Level & XP Progress */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-[#DC2626] flex items-center justify-center font-bold text-base">
                L{level}
              </div>
              <div>
                <p className="text-xs font-medium text-[#64748B]">Executive Rank</p>
                <h3 className="text-base font-bold text-[#1F2937] leading-tight">
                  {getLevelTitle(level)}
                </h3>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-[#475569] tabular-nums">
              Level {level}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs text-[#64748B]">Total Verified XP</p>
                <p className="text-2xl font-bold text-[#1F2937] tabular-nums">{totalXp} XP</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[#64748B]">To Level {level + 1}</p>
                <p className="text-xs font-semibold text-[#DC2626] tabular-nums">
                  {xpNeededForNextLevel} XP needed
                </p>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-[#64748B] mb-1.5 tabular-nums">
                <span>Progress to Level {level + 1}</span>
                <span>{xpIntoLevel} / 250 XP ({xpProgressPct}%)</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#DC2626] transition-all duration-500 ease-out"
                  style={{ width: `${xpProgressPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Executive Check-in Streak */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-[#64748B]">Daily Leadership</p>
                <h3 className="text-base font-bold text-[#1F2937] leading-tight">
                  Check-in Streak
                </h3>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              Consistency
            </span>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs text-[#64748B]">Active Streak</p>
                <p className="text-2xl font-bold text-amber-600 tabular-nums">
                  {streakDays} {streakDays === 1 ? 'Day' : 'Days'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[#64748B]">Schedule Status</p>
                <p className="text-xs font-semibold text-emerald-600">
                  {streakDays > 0 ? 'Active & Protected' : 'Ready to start'}
                </p>
              </div>
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Complete your daily habits or scheduled tasks every day to safeguard your executive momentum and unlock streak badges.
            </p>
          </div>
        </div>

        {/* Card 3: Badges Unlocked */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-[#64748B]">Milestones</p>
                <h3 className="text-base font-bold text-[#1F2937] leading-tight">
                  Executive Badges
                </h3>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 tabular-nums">
              {unlockedCount} / {totalAchievements} Unlocked
            </span>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs text-[#64748B]">Completion Rate</p>
                <p className="text-2xl font-bold text-purple-700 tabular-nums">
                  {Math.round((unlockedCount / totalAchievements) * 100)}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[#64748B]">Available Badges</p>
                <p className="text-xs font-semibold text-[#64748B] tabular-nums">
                  {totalAchievements - unlockedCount} remaining
                </p>
              </div>
            </div>

            <div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-600 transition-all duration-500 ease-out"
                  style={{ width: `${(unlockedCount / totalAchievements) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly XP Chart */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#1F2937] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#DC2626]" />
              <span>7-Day Executive XP Velocity</span>
            </h2>
            <p className="text-xs text-[#64748B]">
              XP points earned across verified daily habits, closed projects, and milestone achievements.
            </p>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-xs text-[#64748B]">This Week: </span>
            <span className="text-sm font-bold text-[#DC2626] tabular-nums">
              +{data?.weekTotalXp ?? 0} XP
            </span>
          </div>
        </div>

        <div className="h-56 sm:h-64 w-full pt-2">
          {data?.weeklyBreakdown && data.weeklyBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.weeklyBreakdown} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value: unknown) => [`${value} XP`, 'Earned XP']}
                  labelFormatter={(label) => `Day: ${label}`}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Bar dataKey="xp" fill="#DC2626" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-[#64748B]">
              No XP recorded in the last 7 days. Complete an action to see your weekly velocity.
            </div>
          )}
        </div>
      </section>

      {/* Executive Achievements Catalog */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#1F2937] flex items-center gap-2">
              <Award className="w-4 h-4 text-[#DC2626]" />
              <span>Executive Badge Catalog</span>
            </h2>
            <p className="text-xs text-[#64748B]">
              Official GoalX executive unlockable milestones across personal discipline and business growth.
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs">
              {(
                [
                  ['all', 'All Status'],
                  ['unlocked', 'Unlocked'],
                  ['locked', 'Locked'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setStatusFilter(val)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                    statusFilter === val
                      ? 'bg-white text-[#1F2937] shadow-xs'
                      : 'text-[#64748B] hover:text-[#1F2937]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs">
              {(
                [
                  ['all', 'All Areas'],
                  ['personal', 'Personal'],
                  ['business', 'Business'],
                  ['competitor', 'Competitor'],
                  ['mastery', 'Mastery'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setCategoryFilter(val)}
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer capitalize ${
                    categoryFilter === val
                      ? 'bg-white text-[#1F2937] shadow-xs'
                      : 'text-[#64748B] hover:text-[#1F2937]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Badges Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredAchievements.map((ach) => {
            const Icon = ACHIEVEMENT_ICONS[ach.iconName] || Trophy;
            return (
              <div
                key={ach.achievementKey}
                className={`relative rounded-2xl p-4.5 border transition-all flex flex-col justify-between ${
                  ach.isUnlocked
                    ? 'bg-amber-50/20 border-amber-200/80 shadow-xs'
                    : 'bg-white border-[#E2E8F0] opacity-80 hover:opacity-100'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        ach.isUnlocked
                          ? 'bg-amber-100 text-amber-700 shadow-xs'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md tabular-nums ${
                        ach.isUnlocked
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-[#64748B]'
                      }`}
                    >
                      +{ach.rewardXp} XP
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-[#1F2937] leading-tight mb-1">
                    {ach.title}
                  </h4>
                  <p className="text-xs text-[#64748B] leading-relaxed line-clamp-2">
                    {ach.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#E2E8F0]/80">
                  {ach.isUnlocked ? (
                    <div className="flex items-center justify-between text-xs text-amber-700 font-medium">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                        <span>Unlocked</span>
                      </span>
                      {ach.unlockedAt && (
                        <span className="text-[10px] text-[#64748B] tabular-nums">
                          {ach.unlockedAt.slice(0, 10)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-[#64748B] tabular-nums">
                        <span>Target</span>
                        <span>{ach.requiredCount} required</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-slate-300"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(((ach.currentCount ?? 0) / ach.requiredCount) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredAchievements.length === 0 && (
          <div className="py-8 text-center text-sm text-[#64748B]">
            No achievements found for the selected filter combination.
          </div>
        )}
      </section>

      {/* XP Transactions Ledger */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#E2E8F0]">
          <div>
            <h2 className="text-base font-bold text-[#1F2937] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#DC2626]" />
              <span>Deterministic XP Ledger</span>
            </h2>
            <p className="text-xs text-[#64748B]">
              Immutable transaction history. Each real-world action awards XP exactly once.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#64748B]">Filter Source:</span>
            <select
              value={txFilter}
              onChange={(e) => setTxFilter(e.target.value as 'all' | XpSourceType)}
              className="h-9 rounded-xl border border-[#E2E8F0] px-3 text-xs text-[#1F2937] bg-white cursor-pointer"
            >
              <option value="all">All Sources</option>
              <option value="task">Tasks</option>
              <option value="habit">Habits</option>
              <option value="goal">Personal Goals</option>
              <option value="milestone">Milestones</option>
              <option value="project">Projects</option>
              <option value="lead">Client Wins</option>
              <option value="competitor_review">Market Intel</option>
              <option value="competitor_surpassed">Competitor Victory</option>
              <option value="achievement">Achievement Unlocks</option>
            </select>
          </div>
        </div>

        {filteredTransactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B] font-medium">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Reason / Action</th>
                  <th className="py-2.5 px-3">Source Type</th>
                  <th className="py-2.5 px-3 text-right">Awarded XP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filteredTransactions.map((tx) => {
                  const badge = getSourceTypeBadge(tx.sourceType);
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 text-[#64748B] tabular-nums whitespace-nowrap">
                        {tx.date || (typeof tx.createdAt === 'string' ? tx.createdAt.slice(0, 10) : 'Today')}
                      </td>
                      <td className="py-3 px-3 font-medium text-[#1F2937]">
                        <p className="line-clamp-1">{tx.reason}</p>
                        <p className="text-[10px] text-[#94A3B8] font-mono mt-0.5">{tx.id}</p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-medium border ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap font-bold text-emerald-600 tabular-nums">
                        +{tx.amount} XP
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center space-y-2">
            <Trophy className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-medium text-[#1F2937]">No XP Transactions Found</p>
            <p className="text-xs text-[#64748B] max-w-sm mx-auto">
              Complete tasks in Tasks, log habits in Habits, or deliver projects in Projects, then click "Sync & Claim XP" above.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
