import React from 'react';
import { Plus } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel = 'Add data',
  onAction,
  icon,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-6 px-4 rounded-xl bg-[#F8FAFC] border border-dashed border-[#E2E8F0]">
      {icon && (
        <div className="w-10 h-10 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-center text-[#64748B] mb-3">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-[#1F2937]">{title}</p>
      <p className="mt-1 text-xs text-[#64748B] max-w-xs leading-relaxed">{description}</p>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3.5 min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-4 py-2 text-xs font-medium text-white hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          {actionLabel}
        </button>
      )}
    </div>
  );
};
