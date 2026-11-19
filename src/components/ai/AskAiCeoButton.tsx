import React from 'react';
import { Link } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { ROUTES } from '../../lib/constants';
import { AiArea } from '../../types';

interface AskAiCeoButtonProps {
  area: AiArea;
  prompt: string;
  recordId?: string;
  label?: string;
  className?: string;
}

export const AskAiCeoButton: React.FC<AskAiCeoButtonProps> = ({
  area,
  prompt,
  recordId,
  label = 'Ask AI CEO',
  className = '',
}) => {
  const params = new URLSearchParams();
  params.set('area', area);
  params.set('prompt', prompt);
  if (recordId) {
    params.set('recordId', recordId);
  }

  return (
    <Link
      to={`${ROUTES.AI_CEO}?${params.toString()}`}
      className={`min-h-[40px] inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-[#1F2937] hover:border-[#DC2626]/40 hover:bg-red-50/40 transition-colors whitespace-nowrap shrink-0 ${className}`}
    >
      <Bot className="w-4 h-4 text-[#DC2626] shrink-0" />
      <span>{label}</span>
    </Link>
  );
};
