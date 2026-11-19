import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface CalcInfoPopoverProps {
  title: string;
  formula: string;
  note?: string;
}

export const CalcInfoPopover: React.FC<CalcInfoPopoverProps> = ({ title, formula, note }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={`How is ${title} calculated?`}
        title="How is this calculated?"
        className="p-1 rounded-lg text-[#64748B] hover:text-[#1F2937] hover:bg-slate-100 cursor-pointer"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${title} formula`}
          className="absolute right-0 top-7 z-40 w-64 bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-lg text-left space-y-1.5"
        >
          <p className="text-[11px] font-semibold text-[#1F2937] uppercase tracking-wider">
            How {title} is calculated
          </p>
          <p className="text-xs text-[#1F2937] leading-relaxed">{formula}</p>
          {note && <p className="text-[11px] text-[#64748B] leading-relaxed">{note}</p>}
        </div>
      )}
    </div>
  );
};
