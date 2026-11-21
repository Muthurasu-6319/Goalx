import React, { useState } from 'react';
import { Download, Share } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean; fullWidth?: boolean }> = ({
  compact = false,
  fullWidth = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const baseClasses = `inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] text-white font-medium hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
    fullWidth ? 'w-full' : ''
  } ${compact ? 'min-h-[40px] px-3.5 py-2 text-xs' : 'min-h-[44px] px-4 py-2.5 text-sm'}`;

  if (isInstallable) {
    return (
      <button type="button" onClick={install} className={baseClasses}>
        <Download className="w-4 h-4" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white text-[#1F2937] font-medium hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            fullWidth ? 'w-full' : ''
          } ${compact ? 'min-h-[40px] px-3.5 py-2 text-xs' : 'min-h-[44px] px-4 py-2.5 text-sm'}`}
        >
          <Share className="w-4 h-4 text-[#DC2626]" />
          <span>Install App</span>
        </button>

        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-white border border-[#E2E8F0] p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-[#1F2937]">Install GoalX on iOS</h3>
              <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                1. Tap the <strong>Share</strong> button in Safari&apos;s bottom toolbar.<br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-[#DC2626] py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback for desktop or browsers waiting for user engagement
  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white text-[#1F2937] font-medium hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          fullWidth ? 'w-full' : ''
        } ${compact ? 'min-h-[40px] px-3.5 py-2 text-xs' : 'min-h-[44px] px-4 py-2.5 text-sm'}`}
      >
        <Download className="w-4 h-4 text-[#DC2626]" />
        <span>Install App</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white border border-[#E2E8F0] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#1F2937]">Install GoalX</h3>
            <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
              To install GoalX as an app, click the <strong>Install</strong> icon in your browser&apos;s address bar, or open your browser menu and choose <strong>Install GoalX</strong>.
            </p>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-[#DC2626] py-2.5 text-sm font-medium text-white hover:bg-[#B91C1C] transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
