import { useMemo } from 'react';
import { useBusinessDataContext } from './useBusinessData';

export function useTeam() {
  const { teamMembers, teamMemberPrivate, salaryRecords, projects, loading, error } =
    useBusinessDataContext();

  const privateByMemberId = useMemo(() => {
    const map = new Map(teamMemberPrivate.map((p) => [p.memberId, p]));
    return map;
  }, [teamMemberPrivate]);

  return {
    teamMembers,
    teamMemberPrivate,
    privateByMemberId,
    salaryRecords,
    projects,
    loading,
    error,
  };
}
