import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, KeyRound, Loader2, Mail } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { ROUTES } from '../lib/constants';
import {
  ForgotPasswordFormValues,
  forgotPasswordSchema,
  LoginFormValues,
  loginSchema,
} from '../lib/validators';
import {
  getAuthErrorMessage,
  loginWithEmail,
  loginWithGoogle,
  resetPassword,
} from '../services/authService';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const {
    register: registerReset,
    handleSubmit: handleResetSubmit,
    formState: { errors: resetErrors, isSubmitting: isResetSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onLogin = async (values: LoginFormValues) => {
    setAuthError(null);
    try {
      await loginWithEmail(values.email, values.password);
      showToast('Welcome back', { description: 'Signed in to GoalX.', variant: 'success' });
      navigate(ROUTES.DASHBOARD);
    } catch (err) {
      const msg = getAuthErrorMessage(err);
      setAuthError(msg);
      showToast('Sign in failed', { description: msg, variant: 'error' });
    }
  };

  const onGoogleSignIn = async () => {
    setAuthError(null);
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      showToast('Signed in with Google', { variant: 'success' });
      navigate(ROUTES.DASHBOARD);
    } catch (err) {
      const msg = getAuthErrorMessage(err);
      setAuthError(msg);
      showToast('Google sign-in failed', { description: msg, variant: 'error' });
    } finally {
      setGoogleLoading(false);
    }
  };

  const onForgotPassword = async (values: ForgotPasswordFormValues) => {
    setAuthError(null);
    try {
      await resetPassword(values.email);
      setResetSent(true);
      showToast('Reset email sent', {
        description: `Check ${values.email} for password reset instructions.`,
        variant: 'success',
      });
    } catch (err) {
      const msg = getAuthErrorMessage(err);
      setAuthError(msg);
      showToast('Reset failed', { description: msg, variant: 'error' });
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
          {!showReset ? (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-[#1F2937]">Sign in to your workspace</h2>
                <p className="mt-1 text-sm text-[#64748B]">
                  Access your personal goals and company command center.
                </p>
              </div>

              {authError && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-[#DC2626]">
                  {authError}
                </div>
              )}

              <button
                type="button"
                onClick={onGoogleSignIn}
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
                <span className="text-xs text-[#64748B]">or with email</span>
                <div className="h-px flex-1 bg-[#E2E8F0]" />
              </div>

              <form onSubmit={handleSubmit(onLogin)} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-sm font-medium text-[#1F2937] mb-1.5">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-email"
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-password" className="block text-sm font-medium text-[#1F2937]">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowReset(true);
                        setResetSent(false);
                        setAuthError(null);
                      }}
                      className="text-xs font-medium text-[#DC2626] hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      {...register('password')}
                      className="w-full h-11 rounded-xl border border-[#E2E8F0] pl-10 pr-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                    />
                  </div>
                  {errors.password && <p className="mt-1 text-xs text-[#DC2626]">{errors.password.message}</p>}
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
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-[#64748B]">
                New to GoalX?{' '}
                <Link to={ROUTES.REGISTER} className="font-medium text-[#DC2626] hover:underline">
                  Create an account
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-[#1F2937]">Reset your password</h2>
                <p className="mt-1 text-sm text-[#64748B]">
                  Enter your account email and we&apos;ll send a reset link.
                </p>
              </div>

              {authError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-[#DC2626]">
                  {authError}
                </div>
              )}

              {resetSent && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-[#16A34A]">
                  Password reset instructions have been sent to your email address.
                </div>
              )}

              <form onSubmit={handleResetSubmit(onForgotPassword)} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium text-[#1F2937] mb-1.5">
                    Account Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    placeholder="ceo@genzneuralx.com"
                    {...registerReset('email')}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                  />
                  {resetErrors.email && (
                    <p className="mt-1 text-xs text-[#DC2626]">{resetErrors.email.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isResetSubmitting}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isResetSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Reset Link'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setShowReset(false);
                  setAuthError(null);
                }}
                className="mt-4 w-full min-h-[44px] text-sm font-medium text-[#64748B] hover:text-[#1F2937] cursor-pointer"
              >
                Back to Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
