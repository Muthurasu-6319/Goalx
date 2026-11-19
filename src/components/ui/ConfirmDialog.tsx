import React from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  confirmDisabled?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  confirmDisabled = false,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  const isDanger = variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isDanger ? 'bg-red-50 dark:bg-red-950/50 text-[#DC2626]' : 'bg-amber-50 dark:bg-amber-950/50 text-[#F59E0B]'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#1F2937]">{title}</h3>
              <p className="mt-1 text-sm text-[#64748B] leading-relaxed">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#64748B] hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
          >
            {cancelLabel}
          </button>
          {!confirmDisabled && (
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={loading}
              className={`min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-60 ${
                isDanger
                  ? 'bg-[#DC2626] hover:bg-[#B91C1C]'
                  : 'bg-[#F59E0B] hover:bg-amber-600'
              }`}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{confirmLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
