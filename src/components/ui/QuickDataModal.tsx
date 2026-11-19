import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { updateCompanyMetrics, updateCompanyProfile } from '../../services/companyService';
import { awardUserXp, updateUserProfile } from '../../services/userService';

export type QuickModalSection = 'personal' | 'business' | 'competition' | 'gamification';

interface QuickDataModalProps {
  section: QuickModalSection | null;
  onClose: () => void;
}

export const QuickDataModal: React.FC<QuickDataModalProps> = ({ section, onClose }) => {
  const { firebaseUser, userProfile, companyProfile } = useAuth();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  // Personal fields
  const [monthlyIncome, setMonthlyIncome] = useState<string>('');
  const [personalGoalInput, setPersonalGoalInput] = useState('');
  const [personalGoals, setPersonalGoals] = useState<string[]>([]);

  // Business fields
  const [monthlyRevenue, setMonthlyRevenue] = useState<string>('');
  const [activeProjectsCount, setActiveProjectsCount] = useState<string>('');
  const [businessGoalInput, setBusinessGoalInput] = useState('');
  const [businessGoals, setBusinessGoals] = useState<string[]>([]);

  // Competition fields
  const [competitorsTrackedCount, setCompetitorsTrackedCount] = useState<string>('');

  useEffect(() => {
    if (!section) return;
    setMonthlyIncome(userProfile?.monthlyIncome != null ? String(userProfile.monthlyIncome) : '');
    setPersonalGoals(userProfile?.personalGoals ?? []);
    setMonthlyRevenue(companyProfile?.monthlyRevenue != null ? String(companyProfile.monthlyRevenue) : '');
    setActiveProjectsCount(
      companyProfile?.activeProjectsCount != null ? String(companyProfile.activeProjectsCount) : ''
    );
    setBusinessGoals(companyProfile?.goals ?? []);
    setCompetitorsTrackedCount(
      companyProfile?.competitorsTrackedCount != null ? String(companyProfile.competitorsTrackedCount) : ''
    );
  }, [section, userProfile, companyProfile]);

  if (!section || !firebaseUser || !userProfile || !companyProfile) return null;

  const addPersonalGoal = () => {
    const trimmed = personalGoalInput.trim();
    if (!trimmed || personalGoals.length >= 20) return;
    setPersonalGoals((prev) => [...prev, trimmed.slice(0, 160)]);
    setPersonalGoalInput('');
  };

  const addBusinessGoal = () => {
    const trimmed = businessGoalInput.trim();
    if (!trimmed || businessGoals.length >= 20) return;
    setBusinessGoals((prev) => [...prev, trimmed.slice(0, 160)]);
    setBusinessGoalInput('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (section === 'personal') {
        const parsedIncome = monthlyIncome.trim() === '' ? null : Number(monthlyIncome);
        if (parsedIncome !== null && (Number.isNaN(parsedIncome) || parsedIncome < 0)) {
          showToast('Invalid income value', { description: 'Enter a valid non-negative number.', variant: 'error' });
          setSaving(false);
          return;
        }
        await updateUserProfile(firebaseUser.uid, {
          name: userProfile.name,
          email: userProfile.email,
          photoUrl: userProfile.photoUrl || '',
          monthlyIncome: parsedIncome,
          currency: userProfile.currency || 'INR',
          personalGoals,
        });
        await awardUserXp(firebaseUser.uid, userProfile.xp ?? 0, userProfile.streakDays ?? 0, 25);
        showToast('Personal metrics updated', { description: '+25 CEO XP awarded.', variant: 'success' });
      } else if (section === 'business') {
        const parsedRev = monthlyRevenue.trim() === '' ? null : Number(monthlyRevenue);
        const parsedProj = activeProjectsCount.trim() === '' ? null : Math.floor(Number(activeProjectsCount));
        if (
          (parsedRev !== null && (Number.isNaN(parsedRev) || parsedRev < 0)) ||
          (parsedProj !== null && (Number.isNaN(parsedProj) || parsedProj < 0))
        ) {
          showToast('Invalid business metrics', { description: 'Enter valid non-negative numbers.', variant: 'error' });
          setSaving(false);
          return;
        }
        await updateCompanyMetrics(firebaseUser.uid, {
          monthlyRevenue: parsedRev,
          activeProjectsCount: parsedProj,
          competitorsTrackedCount: companyProfile.competitorsTrackedCount ?? null,
        });
        await updateCompanyProfile(firebaseUser.uid, {
          name: companyProfile.name,
          website: companyProfile.website || '',
          industry: companyProfile.industry,
          services: companyProfile.services || [],
          location: companyProfile.location || '',
          startDate: companyProfile.startDate || '',
          stage: companyProfile.stage || '',
          goals: businessGoals,
        });
        await awardUserXp(firebaseUser.uid, userProfile.xp ?? 0, userProfile.streakDays ?? 0, 25);
        showToast('Business data saved', { description: '+25 CEO XP awarded.', variant: 'success' });
      } else if (section === 'competition') {
        const parsedComp =
          competitorsTrackedCount.trim() === '' ? null : Math.floor(Number(competitorsTrackedCount));
        if (parsedComp !== null && (Number.isNaN(parsedComp) || parsedComp < 0)) {
          showToast('Invalid count', { description: 'Enter a valid non-negative integer.', variant: 'error' });
          setSaving(false);
          return;
        }
        await updateCompanyMetrics(firebaseUser.uid, {
          monthlyRevenue: companyProfile.monthlyRevenue ?? null,
          activeProjectsCount: companyProfile.activeProjectsCount ?? null,
          competitorsTrackedCount: parsedComp,
        });
        await awardUserXp(firebaseUser.uid, userProfile.xp ?? 0, userProfile.streakDays ?? 0, 20);
        showToast('Competition baseline updated', { description: '+20 CEO XP awarded.', variant: 'success' });
      } else if (section === 'gamification') {
        await awardUserXp(firebaseUser.uid, userProfile.xp ?? 0, (userProfile.streakDays ?? 0) + 1, 30);
        showToast('Daily CEO check-in logged', { description: '+30 XP earned and streak updated.', variant: 'success' });
      }
      onClose();
    } catch (err) {
      showToast('Could not save changes', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const titles: Record<QuickModalSection, string> = {
    personal: 'Update Personal Financial & Goal Baseline',
    business: 'Log Business Metrics & Goals',
    competition: 'Set Competitive Tracking Baseline',
    gamification: 'Daily Executive Check-In',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <h3 className="text-base font-semibold text-[#1F2937]">{titles[section]}</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {section === 'personal' && (
            <>
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                  Monthly Income ({userProfile.currency || 'INR'})
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                  placeholder="e.g. 150000"
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Personal Goals</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={personalGoalInput}
                    onChange={(e) => setPersonalGoalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addPersonalGoal();
                      }
                    }}
                    placeholder="Add a personal goal"
                    className="flex-1 h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                  <button
                    type="button"
                    onClick={addPersonalGoal}
                    className="h-11 px-4 rounded-xl bg-slate-100 text-[#1F2937] text-sm font-medium hover:bg-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>
                {personalGoals.length > 0 && (
                  <ul className="mt-3 divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
                    {personalGoals.map((goal, idx) => (
                      <li key={idx} className="flex items-center justify-between px-3.5 py-2.5 text-sm text-[#1F2937]">
                        <span className="truncate pr-2">{goal}</span>
                        <button
                          type="button"
                          onClick={() => setPersonalGoals((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {section === 'business' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                    Monthly Revenue ({userProfile.currency || 'INR'})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={monthlyRevenue}
                    onChange={(e) => setMonthlyRevenue(e.target.value)}
                    placeholder="e.g. 450000"
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Active Projects</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={activeProjectsCount}
                    onChange={(e) => setActiveProjectsCount(e.target.value)}
                    placeholder="e.g. 4"
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Business Goals</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={businessGoalInput}
                    onChange={(e) => setBusinessGoalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addBusinessGoal();
                      }
                    }}
                    placeholder="Add a company milestone"
                    className="flex-1 h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                  <button
                    type="button"
                    onClick={addBusinessGoal}
                    className="h-11 px-4 rounded-xl bg-slate-100 text-[#1F2937] text-sm font-medium hover:bg-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>
                {businessGoals.length > 0 && (
                  <ul className="mt-3 divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
                    {businessGoals.map((goal, idx) => (
                      <li key={idx} className="flex items-center justify-between px-3.5 py-2.5 text-sm text-[#1F2937]">
                        <span className="truncate pr-2">{goal}</span>
                        <button
                          type="button"
                          onClick={() => setBusinessGoals((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {section === 'competition' && (
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                Competitors Tracked in Target Market
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={competitorsTrackedCount}
                onChange={(e) => setCompetitorsTrackedCount(e.target.value)}
                placeholder="e.g. 5"
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              />
              <p className="mt-2 text-xs text-[#64748B]">
                Detailed competitor profiles, pricing matrices, and regional battlecards unlock in Phase 2.
              </p>
            </div>
          )}

          {section === 'gamification' && (
            <div className="space-y-3">
              <p className="text-sm text-[#1F2937]">
                Confirm today&apos;s CEO command review to earn <strong>+30 XP</strong> and increment your execution streak.
              </p>
              <p className="text-xs text-[#64748B]">
                Current Level: {userProfile.level ?? 1} · Current XP: {userProfile.xp ?? 0} · Streak: {userProfile.streakDays ?? 0} days
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:text-[#1F2937] hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-11 px-5 rounded-xl bg-[#DC2626] text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {saving ? 'Saving...' : section === 'gamification' ? 'Complete Check-In' : 'Save Data'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
