import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, KeyRound, Loader2, Mail, User as UserIcon } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { ROUTES } from '../lib/constants';
import { RegisterFormValues, registerSchema } from '../lib/validators';
import { getAuthErrorMessage, loginWithGoogle, registerWithEmail } from '../services/authService';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const onRegister = async (values: RegisterFormValues) => {
    setAuthError(null);
    try {
      await registerWithEmail(values.name, values.email, values.password);
      showToast('Account created', {
        description: 'Complete your quick CEO setup to launch your command center.',
        variant: 'success',
      });
      navigate(ROUTES.ONBOARDING);
    } catch (err) {
      const msg = getAuthErrorMessage(err);
      setAuthError(msg);
      showToast('Sign up failed', { description: msg, variant: 'error' });
    }
  };

  const onGoogleSignUp = async () => {
    setAuthError(null);
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      showToast('Signed in with Google', { variant: 'success' });
      navigate(ROUTES.ONBOARDING);
    } catch (err) {
      const msg = getAuthErrorMessage(err);
      setAuthError(msg);
      showToast('Google sign-up failed', { description: msg, variant: 'error' });
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="w-full max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-[#DC2626] flex items-center justify-center text-white font-bold text-base shadow-sm">
            GX
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#1F2937]">GoalX</h1>
            <p className="text-xs text-[#64748B]">Personal CEO Command Center</p>
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[#1F2937]">Create your CEO account</h2>
            <p className="mt-1 text-sm text-[#64748B]">
              Start tracking personal and business execution in one workspace.
            </p>
          </div>

          {authError && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-[#DC2626]">
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={onGoogleSignUp}
            disabled={googleLoading || isSubmitting}
            className="w-full min-h-[44px] flex items-center justify-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium text-[#1F2937] hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            <span>Continue with Google</span>
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#E2E8F0]" />
            <span className="text-xs text-[#64748B]">or register with email</span>
            <div className="h-px flex-1 bg-[#E2E8F0]" />
          </div>

          <form onSubmit={handleSubmit(onRegister)} className="space-y-4">
            <div>
              <label htmlFor="reg-name" className="block text-sm font-medium text-[#1F2937] mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reg-name"
                  type="text"
                  autoComplete="name"
                  placeholder="Muthu Rasu"
                  {...register('name')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] pl-10 pr-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                />
              </div>
              {errors.name && <p className="mt-1 text-xs text-[#DC2626]">{errors.name.message}</p>}
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-sm font-medium text-[#1F2937] mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  placeholder="ceo@genzneuralx.com"
                  {...register('email')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] pl-10 pr-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-[#DC2626]">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-sm font-medium text-[#1F2937] mb-1.5">
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  {...register('password')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] pl-10 pr-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                />
              </div>
              {errors.password && <p className="mt-1 text-xs text-[#DC2626]">{errors.password.message}</p>}
            </div>

            <div>
              <label htmlFor="reg-confirm" className="block text-sm font-medium text-[#1F2937] mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reg-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  {...register('confirmPassword')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] pl-10 pr-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                />
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-[#DC2626]">{errors.confirmPassword.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || googleLoading}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#64748B]">
            Already have an account?{' '}
            <Link to={ROUTES.LOGIN} className="font-medium text-[#DC2626] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
