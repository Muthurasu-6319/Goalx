import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Loader2, LogOut, Plus, SkipForward, Trash2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { COMPANY_STAGES, CURRENCIES, DEFAULT_COMPANY_PROFILE, ROUTES } from '../lib/constants';
import { companyProfileSchema, userProfileSchema } from '../lib/validators';
import { logoutUser } from '../services/authService';
import { createCompanyProfile, getCompanyProfile, updateCompanyProfile } from '../services/companyService';
import { createDefaultSettings, getUserSettings } from '../services/settingsService';
import { createUserProfile, getUserProfile, updateUserProfile } from '../services/userService';

export const OnboardingPage: React.FC = () => {
  const { firebaseUser, userProfile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Step 1: Personal fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [personalGoalInput, setPersonalGoalInput] = useState('');
  const [personalGoals, setPersonalGoals] = useState<string[]>([]);

  // Step 2: Company fields (default Gen Z Neural-X)
  const [companyName, setCompanyName] = useState(DEFAULT_COMPANY_PROFILE.name);
  const [website, setWebsite] = useState(DEFAULT_COMPANY_PROFILE.website);
  const [industry, setIndustry] = useState(DEFAULT_COMPANY_PROFILE.industry);
  const [location, setLocation] = useState(DEFAULT_COMPANY_PROFILE.location);
  const [services, setServices] = useState<string[]>(DEFAULT_COMPANY_PROFILE.services);
  const [customService, setCustomService] = useState('');
  const [startDate, setStartDate] = useState('');
  const [stage, setStage] = useState('');
  const [companyGoalInput, setCompanyGoalInput] = useState('');
  const [companyGoals, setCompanyGoals] = useState<string[]>([]);

  useEffect(() => {
    if (firebaseUser) {
      setName(userProfile?.name || firebaseUser.displayName || '');
      setEmail(userProfile?.email || firebaseUser.email || '');
      setPhotoUrl(userProfile?.photoUrl || firebaseUser.photoURL || '');
    }
  }, [firebaseUser, userProfile]);

  const handleAddPersonalGoal = () => {
    const trimmed = personalGoalInput.trim();
    if (!trimmed || personalGoals.length >= 20) return;
    setPersonalGoals((prev) => [...prev, trimmed.slice(0, 160)]);
    setPersonalGoalInput('');
  };

  const handleAddCompanyGoal = () => {
    const trimmed = companyGoalInput.trim();
    if (!trimmed || companyGoals.length >= 20) return;
    setCompanyGoals((prev) => [...prev, trimmed.slice(0, 160)]);
    setCompanyGoalInput('');
  };

  const handleToggleService = (svc: string) => {
    setServices((prev) =>
      prev.includes(svc) ? prev.filter((item) => item !== svc) : [...prev, svc].slice(0, 30)
    );
  };

  const handleAddCustomService = () => {
    const trimmed = customService.trim();
    if (!trimmed || services.includes(trimmed) || services.length >= 30) return;
    setServices((prev) => [...prev, trimmed.slice(0, 160)]);
    setCustomService('');
  };

  const validateStep1 = (skipOptional = false): boolean => {
    setFormError(null);
    const parsedIncome =
      skipOptional || monthlyIncome.trim() === '' ? null : Number(monthlyIncome);

    const check = userProfileSchema.safeParse({
      name: name.trim() || firebaseUser?.displayName || 'CEO',
      email: email.trim() || firebaseUser?.email || '',
      photoUrl: skipOptional ? '' : photoUrl.trim(),
      monthlyIncome: parsedIncome,
      currency,
      personalGoals: skipOptional ? [] : personalGoals,
    });

    if (!check.success) {
      setFormError(check.error.issues[0]?.message || 'Please check your profile inputs.');
      return false;
    }
    return true;
  };

  const handleNextStep = (skipOptional = false) => {
    if (skipOptional) {
      setMonthlyIncome('');
      setPersonalGoals([]);
    }
    if (!validateStep1(skipOptional)) return;
    setStep(2);
  };

  const handleComplete = async (skipOptionalCompany = false) => {
    if (!firebaseUser) return;
    setFormError(null);

    const parsedIncome = monthlyIncome.trim() === '' ? null : Number(monthlyIncome);
    const userPayload = {
      name: (name.trim() || firebaseUser.displayName || 'CEO').slice(0, 120),
      email: (email.trim() || firebaseUser.email || '').slice(0, 200),
      photoUrl: photoUrl.trim().slice(0, 1000),
      monthlyIncome:
        parsedIncome !== null && !Number.isNaN(parsedIncome) && parsedIncome >= 0 ? parsedIncome : null,
      currency,
      personalGoals,
      onboardingCompleted: true,
    };

    const companyPayload = {
      name: (companyName.trim() || DEFAULT_COMPANY_PROFILE.name).slice(0, 160),
      website: (skipOptionalCompany ? DEFAULT_COMPANY_PROFILE.website : website.trim()).slice(0, 300),
      industry: (industry.trim() || DEFAULT_COMPANY_PROFILE.industry).slice(0, 160),
      services,
      location: (location.trim() || DEFAULT_COMPANY_PROFILE.location).slice(0, 300),
      startDate: skipOptionalCompany ? '' : startDate.trim().slice(0, 40),
      stage: skipOptionalCompany ? '' : stage.trim().slice(0, 80),
      goals: skipOptionalCompany ? [] : companyGoals,
    };

    const companyCheck = companyProfileSchema.safeParse(companyPayload);
    if (!companyCheck.success) {
      setFormError(companyCheck.error.issues[0]?.message || 'Please check your company details.');
      return;
    }

    setSubmitting(true);
    try {
      const existingUser = await getUserProfile(firebaseUser.uid);
      if (existingUser) {
        await updateUserProfile(firebaseUser.uid, userPayload);
      } else {
        await createUserProfile({
          ownerId: firebaseUser.uid,
          ...userPayload,
        });
      }

      const existingCompany = await getCompanyProfile(firebaseUser.uid);
      if (existingCompany) {
        await updateCompanyProfile(firebaseUser.uid, companyPayload);
      } else {
        await createCompanyProfile(firebaseUser.uid, companyPayload);
      }

      const existingSettings = await getUserSettings(firebaseUser.uid);
      if (!existingSettings) {
        await createDefaultSettings(firebaseUser.uid, currency);
      }

      showToast('Command Center Ready', {
        description: `${companyPayload.name} and your CEO profile are set up.`,
        variant: 'success',
      });
      navigate(ROUTES.DASHBOARD, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save onboarding details.';
      setFormError(msg);
      showToast('Setup error', { description: msg, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <img
              src="/favicon.png"
              alt="GoalX"
              className="w-9 h-9 rounded-xl object-contain shadow-xs"
            />
            <div>
              <h1 className="text-lg font-bold text-[#1F2937]">GoalX Setup</h1>
              <p className="text-xs text-[#64748B]">Step {step} of 2 · Optional questions are skippable</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => logoutUser()}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 rounded-xl text-xs font-medium text-[#64748B] hover:text-[#DC2626] hover:bg-white border border-transparent hover:border-[#E2E8F0] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div
            className={`h-1.5 rounded-full transition-colors ${
              step >= 1 ? 'bg-[#DC2626]' : 'bg-[#E2E8F0]'
            }`}
          />
          <div
            className={`h-1.5 rounded-full transition-colors ${
              step >= 2 ? 'bg-[#DC2626]' : 'bg-[#E2E8F0]'
            }`}
          />
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 shadow-xs">
          {formError && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-[#DC2626]">
              {formError}
            </div>
          )}

          {step === 1 ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-[#1F2937]">Personal CEO Profile</h2>
                <p className="mt-1 text-sm text-[#64748B]">
                  Confirm your identity and optionally set your monthly income and personal goals.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                    Full Name <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                    Email <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                  Photo URL <span className="text-xs font-normal text-[#64748B]">(Optional)</span>
                </label>
                <input
                  type="url"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                    Monthly Income <span className="text-xs font-normal text-[#64748B]">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={monthlyIncome}
                    onChange={(e) => setMonthlyIncome(e.target.value)}
                    placeholder="Leave blank to skip"
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                  Personal Goals <span className="text-xs font-normal text-[#64748B]">(Optional)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={personalGoalInput}
                    onChange={(e) => setPersonalGoalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddPersonalGoal();
                      }
                    }}
                    placeholder="e.g. Read 24 books this year"
                    className="flex-1 h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                  <button
                    type="button"
                    onClick={handleAddPersonalGoal}
                    className="h-11 px-4 rounded-xl bg-slate-100 text-sm font-medium text-[#1F2937] hover:bg-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>
                {personalGoals.length > 0 && (
                  <ul className="mt-3 divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
                    {personalGoals.map((goal, idx) => (
                      <li key={idx} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                        <span className="text-[#1F2937]">{goal}</span>
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

              <div className="pt-3 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleNextStep(true)}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-medium text-[#64748B] hover:text-[#1F2937] hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>Skip optional & continue</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNextStep(false)}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] transition-colors cursor-pointer"
                >
                  <span>Next: Company Profile</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-[#1F2937]">Company Command Profile</h2>
                <p className="mt-1 text-sm text-[#64748B]">
                  Pre-configured with Gen Z Neural-X defaults. Edit any field or skip optional items.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                    Business Name <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Website</label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://genzneuralx.com"
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                  Industry <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Operating Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-2">Services Offered</label>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set([...DEFAULT_COMPANY_PROFILE.services, ...services])).map((svc) => {
                    const selected = services.includes(svc);
                    return (
                      <button
                        key={svc}
                        type="button"
                        onClick={() => handleToggleService(svc)}
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-red-50 border-red-200 text-[#DC2626]'
                            : 'bg-white border-[#E2E8F0] text-[#64748B] hover:text-[#1F2937]'
                        }`}
                      >
                        {svc}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2.5 flex gap-2">
                  <input
                    type="text"
                    value={customService}
                    onChange={(e) => setCustomService(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomService();
                      }
                    }}
                    placeholder="Add custom service"
                    className="flex-1 h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomService}
                    className="h-10 px-3.5 rounded-xl bg-slate-100 text-xs font-medium text-[#1F2937] hover:bg-slate-200 cursor-pointer"
                  >
                    Add Service
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                    Start Date <span className="text-xs font-normal text-[#64748B]">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                    Stage <span className="text-xs font-normal text-[#64748B]">(Optional)</span>
                  </label>
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  >
                    <option value="">Select stage (optional)</option>
                    {COMPANY_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
                  Business Goals <span className="text-xs font-normal text-[#64748B]">(Optional)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={companyGoalInput}
                    onChange={(e) => setCompanyGoalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCompanyGoal();
                      }
                    }}
                    placeholder="e.g. Close 10 enterprise automation clients in Tamil Nadu"
                    className="flex-1 h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                  <button
                    type="button"
                    onClick={handleAddCompanyGoal}
                    className="h-11 px-4 rounded-xl bg-slate-100 text-sm font-medium text-[#1F2937] hover:bg-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>
                {companyGoals.length > 0 && (
                  <ul className="mt-3 divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
                    {companyGoals.map((goal, idx) => (
                      <li key={idx} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                        <span className="text-[#1F2937]">{goal}</span>
                        <button
                          type="button"
                          onClick={() => setCompanyGoals((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={submitting}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-medium text-[#64748B] hover:text-[#1F2937] hover:bg-slate-50 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleComplete(true)}
                    disabled={submitting}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-medium text-[#64748B] hover:text-[#1F2937] hover:bg-slate-50 cursor-pointer"
                  >
                    <SkipForward className="w-4 h-4" />
                    <span>Skip optional & finish</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleComplete(false)}
                    disabled={submitting}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Complete Setup</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
