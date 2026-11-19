import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  CalendarDays,
  CheckSquare,
  FolderKanban,
  HeartPulse,
  Radar,
  Settings,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { ALL_NAV_ITEMS, ROUTES } from '../lib/constants';

const PAGE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  HeartPulse,
  Radar,
  Target,
  FolderKanban,
  CheckSquare,
  CalendarDays,
  BarChart3,
  Sparkles,
  Trophy,
  Bell,
};

interface ComingSoonPageProps {
  path: string;
}

export const ComingSoonPage: React.FC<ComingSoonPageProps> = ({ path }) => {
  const item = ALL_NAV_ITEMS.find((nav) => nav.path === path);
  const Icon = (item && PAGE_ICONS[item.iconName]) || Target;

  return (
    <div className="min-h-[60vh] flex items-center justify-center py-8">
      <div className="w-full max-w-lg bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-red-50 text-[#DC2626] flex items-center justify-center mx-auto mb-5">
          <Icon className="w-7 h-7" />
        </div>

        <p className="text-xs font-medium text-[#DC2626] tracking-wide">Phase 2 Module</p>
        <h1 className="mt-1.5 text-2xl font-bold text-[#1F2937]">
          {item?.label ?? 'Module'} — Coming in next phase
        </h1>
        <p className="mt-2.5 text-sm text-[#64748B] leading-relaxed">
          {item?.description ||
            'This module is architected in your GoalX navigation and will be unlocked in the upcoming build phase.'}
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to={ROUTES.DASHBOARD}
            className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          <Link
            to={ROUTES.SETTINGS}
            className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 py-2.5 text-sm font-medium text-[#1F2937] hover:bg-slate-50 transition-colors"
          >
            <Settings className="w-4 h-4 text-[#64748B]" />
            <span>Configure Profile</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
