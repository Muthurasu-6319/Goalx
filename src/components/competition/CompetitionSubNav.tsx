import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Award, Compass, GitCompareArrows, ListChecks, Radar } from 'lucide-react';
import { ROUTES } from '../../lib/constants';

interface CompetitionSubNavProps {
  pendingCount?: number;
  openGapsCount?: number;
}

export const CompetitionSubNav: React.FC<CompetitionSubNavProps> = ({
  pendingCount = 0,
  openGapsCount = 0,
}) => {
  const location = useLocation();

  const links = [
    {
      label: 'Radar',
      to: ROUTES.COMPETITION,
      icon: Radar,
      exact: true,
    },
    {
      label: 'Compare',
      to: ROUTES.COMPETITION_COMPARE,
      icon: GitCompareArrows,
      exact: true,
    },
    {
      label: 'Scorecards',
      to: ROUTES.COMPETITION_SCORECARDS,
      icon: Award,
      exact: true,
    },
    {
      label: openGapsCount > 0 ? `Gaps (${openGapsCount})` : 'Gaps',
      to: ROUTES.COMPETITION_GAPS,
      icon: ListChecks,
      exact: true,
    },
    {
      label: pendingCount > 0 ? `Discover (${pendingCount})` : 'Discover',
      to: ROUTES.COMPETITION_DISCOVER,
      icon: Compass,
      exact: true,
    },
  ];

  return (
    <nav
      aria-label="Competition sections"
      className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto w-full sm:w-fit"
    >
      {links.map((item) => {
        const Icon = item.icon;
        const active = item.exact
          ? location.pathname === item.to
          : location.pathname.startsWith(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              active
                ? 'bg-white text-[#1F2937] shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2937]'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};
