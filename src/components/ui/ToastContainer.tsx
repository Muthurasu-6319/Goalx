import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { ToastVariant } from '../../types';

const VARIANT_STYLES: Record<ToastVariant, { border: string; iconColor: string; Icon: React.FC<{ className?: string }> }> = {
  success: { border: 'border-[#16A34A]/30', iconColor: 'text-[#16A34A]', Icon: CheckCircle2 },
  error: { border: 'border-[#DC2626]/30', iconColor: 'text-[#DC2626]', Icon: AlertCircle },
  warning: { border: 'border-[#F59E0B]/30', iconColor: 'text-[#F59E0B]', Icon: AlertTriangle },
  info: { border: 'border-[#2563EB]/30', iconColor: 'text-[#2563EB]', Icon: Info },
};

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useToast();

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const { border, iconColor, Icon } = VARIANT_STYLES[toast.variant];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className={`pointer-events-auto bg-white border ${border} rounded-xl p-3.5 shadow-lg flex items-start gap-3`}
            >
              <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1F2937]">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-xs text-[#64748B] leading-relaxed">{toast.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="p-1 text-[#64748B] hover:text-[#1F2937] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
