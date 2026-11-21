import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Download, Share, Smartphone, Sparkles, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

const DISMISS_KEY = 'goalx_pwa_prompt_dismissed_until';

export const PWAInstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [isOpen, setIsOpen] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    if (isInstalled) {
      setIsOpen(false);
      return;
    }

    try {
      const dismissedUntil = localStorage.getItem(DISMISS_KEY);
      if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
        return;
      }
    } catch {
      // Ignore storage errors
    }

    // Auto-prompt after entering the app (1.2s delay for seamless experience)
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 1200);

    return () => clearTimeout(timer);
  }, [isInstalled]);

  const handleDismiss = () => {
    setIsOpen(false);
    try {
      // Re-prompt after 24 hours if dismissed
      const nextDismiss = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_KEY, String(nextDismiss));
    } catch {
      // Ignore storage errors
    }
  };

  const handleInstallClick = async () => {
    setIsInstalling(true);
    try {
      const success = await install();
      if (success) {
        setIsOpen(false);
      }
    } finally {
      setIsInstalling(false);
    }
  };

  if (isInstalled || !isOpen) {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-end sm:items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="pointer-events-auto w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-2xl relative overflow-hidden"
          >
            {/* Top decorative gradient bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-[#DC2626] to-amber-500" />

            {/* Close button */}
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Close install prompt"
              className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header with App Icon */}
            <div className="flex items-start gap-3.5">
              <div className="relative shrink-0">
                <img
                  src="/pwa-192x192.png"
                  alt="GoalX Logo"
                  className="w-13 h-13 rounded-2xl object-contain shadow-md border border-slate-100 bg-white p-0.5"
                />
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 ring-2 ring-white">
                  <Sparkles className="h-2.5 w-2.5 text-white" />
                </span>
              </div>

              <div className="min-w-0 pr-6">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 text-[11px] font-semibold text-[#DC2626] mb-1">
                  <Smartphone className="w-3 h-3" />
                  <span>PWA Available</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-[#1F2937] leading-snug">
                  GoalX App-ah Install Pannunga
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Personal CEO Command Center
                </p>
              </div>
            </div>

            {/* Value props */}
            <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2">
              <div className="flex items-center gap-2.5 text-xs text-[#334155]">
                <CheckCircle2 className="w-4 h-4 text-[#DC2626] shrink-0" />
                <span>One-tap instant access from home screen & desktop</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-[#334155]">
                <CheckCircle2 className="w-4 h-4 text-[#DC2626] shrink-0" />
                <span>Full-screen native app experience without browser tabs</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-[#334155]">
                <CheckCircle2 className="w-4 h-4 text-[#DC2626] shrink-0" />
                <span>Offline caching & faster executive dashboard response</span>
              </div>
            </div>

            {/* iOS Safari instructions */}
            {isIOS && (
              <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#475569] leading-relaxed">
                <p className="font-semibold text-[#1F2937] mb-1 flex items-center gap-1.5">
                  <Share className="w-3.5 h-3.5 text-[#DC2626]" />
                  <span>Safari-la install panna:</span>
                </p>
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li>Safari toolbar-la <strong>Share</strong> button-ah tap pannunga.</li>
                  <li>Keezha scroll panni <strong>Add to Home Screen</strong> select pannunga.</li>
                </ol>
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex items-center gap-2.5">
              {isInstallable ? (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  disabled={isInstalling}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#B91C1C] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-70"
                >
                  <Download className="w-4 h-4" />
                  <span>{isInstalling ? 'Installing...' : 'Install App'}</span>
                </button>
              ) : isIOS ? (
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#B91C1C] transition-colors cursor-pointer"
                >
                  <span>Purinjithu / Got it</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#B91C1C] transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Browser Menu-la Install Pannunga</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDismiss}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-white text-xs sm:text-sm font-medium text-[#64748B] hover:text-[#1F2937] hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Maybe Later
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
