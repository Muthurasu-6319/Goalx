import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Bot,
  CalendarClock,
  CheckSquare,
  Loader2,
  MessageSquarePlus,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { ActionProposalCard } from '../components/ai/ActionProposalCard';
import { BaselineReviewPanel } from '../components/ai/BaselineReviewPanel';
import { DailyBriefingCard } from '../components/ai/DailyBriefingCard';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAiCeo } from '../hooks/useAiCeo';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  AI_DISCLAIMER_DECISIONS,
  AI_MAX_INPUT_CHARS,
  AI_SUGGESTED_PROMPTS,
} from '../lib/constants';
import {
  deleteAiConversation,
  sendAiCeoMessage,
} from '../services/aiCeoService';
import { AiActionStatus, AiArea, AiBriefingType } from '../types';

type AiCeoTab = 'chat' | 'briefing' | 'baseline' | 'proposals';

const AREA_OPTIONS: { value: AiArea | 'general'; label: string }[] = [
  { value: 'general', label: 'All Areas (CEO Context)' },
  { value: 'personal', label: 'Personal Goals & Habits' },
  { value: 'finance', label: 'Company Finance' },
  { value: 'leads', label: 'CRM & Leads' },
  { value: 'projects', label: 'Projects & Services' },
  { value: 'team', label: 'Team Operations' },
  { value: 'competition', label: 'Competition & Strategy' },
];

function renderFormattedAssistantText(text: string): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const renderInlineBold = (line: string, keyPrefix: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={`${keyPrefix}-${idx}`} className="font-semibold text-[#1F2937]">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={`${keyPrefix}-${idx}`}>{part}</React.Fragment>;
    });
  };

  lines.forEach((line, i) => {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        nodes.push(
          <pre
            key={`code-${i}`}
            className="my-2 rounded-xl bg-slate-900 text-slate-100 p-3 text-[11px] overflow-x-auto whitespace-pre-wrap font-mono"
          >
            {codeLines.join('\n')}
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      nodes.push(<div key={`sp-${i}`} className="h-2" />);
      return;
    }

    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      nodes.push(
        <div key={`li-${i}`} className="flex items-start gap-2 pl-1">
          <span className="text-[#DC2626] mt-0.5">&bull;</span>
          <span className="flex-1">{renderInlineBold(line.trim().slice(2), `li-${i}`)}</span>
        </div>
      );
      return;
    }

    nodes.push(
      <p key={`p-${i}`} className="leading-relaxed">
        {renderInlineBold(line, `p-${i}`)}
      </p>
    );
  });

  if (inCodeBlock && codeLines.length > 0) {
    nodes.push(
      <pre
        key="code-tail"
        className="my-2 rounded-xl bg-slate-900 text-slate-100 p-3 text-[11px] overflow-x-auto whitespace-pre-wrap font-mono"
      >
        {codeLines.join('\n')}
      </pre>
    );
  }

  return <div className="space-y-1 text-xs sm:text-sm text-[#1F2937]">{nodes}</div>;
}

export const AiCeoPage: React.FC = () => {
  const { firebaseUser } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = useMemo<AiCeoTab>(() => {
    const t = searchParams.get('tab');
    if (t === 'briefing' || t === 'baseline' || t === 'proposals' || t === 'chat') {
      return t;
    }
    return 'chat';
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<AiCeoTab>(initialTab);
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [hintArea, setHintArea] = useState<AiArea | 'general'>('general');
  const [focusRecordId, setFocusRecordId] = useState<string>('');
  const [draftMessage, setDraftMessage] = useState<string>('');
  const [sending, setSending] = useState(false);

  const [briefingType, setBriefingType] = useState<AiBriefingType>('daily');
  const [proposalFilter, setProposalFilter] = useState<'All' | AiActionStatus>('Pending');
  const [deleteTargetConvId, setDeleteTargetConvId] = useState<string | null>(null);
  const [deletingConv, setDeletingConv] = useState(false);

  const prefillAppliedRef = useRef<string>('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const {
    loading,
    status,
    refreshStatus,
    usageSummary,
    ist,
    conversations,
    activeMessages,
    todayDailyBriefing,
    latestWeeklyBriefing,
    latestMonthlyBriefing,
    briefingGenerating,
    generateBriefing,
    proposals,
    proposalsByMessageId,
    pendingProposals,
    expiringSoonProposals,
    latestBaselineReview,
  } = useAiCeo(activeConvId);

  // Sync URL query params (?tab=..., ?area=..., ?prompt=..., ?recordId=...)
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'briefing' || t === 'baseline' || t === 'proposals' || t === 'chat') {
      setActiveTab(t);
    }

    const qPrompt = searchParams.get('prompt') ?? '';
    const qArea = searchParams.get('area') ?? '';
    const qRecordId = searchParams.get('recordId') ?? '';
    const signature = `${qArea}|${qRecordId}|${qPrompt}`;

    if ((qPrompt || qArea || qRecordId) && prefillAppliedRef.current !== signature) {
      prefillAppliedRef.current = signature;
      setActiveTab('chat');
      setActiveConvId('');
      if (
        qArea === 'personal' ||
        qArea === 'finance' ||
        qArea === 'leads' ||
        qArea === 'projects' ||
        qArea === 'team' ||
        qArea === 'competition' ||
        qArea === 'gamification'
      ) {
        setHintArea(qArea);
      }
      if (qRecordId) {
        setFocusRecordId(qRecordId);
      }
      if (qPrompt) {
        setDraftMessage(qPrompt.slice(0, AI_MAX_INPUT_CHARS));
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === 'chat' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeMessages.length, activeTab]);

  const switchTab = (tab: AiCeoTab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const handleSendMessage = async (overridePrompt?: string) => {
    const text = (overridePrompt ?? draftMessage).trim();
    if (!text || sending) return;
    if (text.length > AI_MAX_INPUT_CHARS) {
      showToast('Prompt is too long', {
        description: `Maximum ${AI_MAX_INPUT_CHARS} characters allowed.`,
        variant: 'error',
      });
      return;
    }

    setSending(true);
    try {
      const res = await sendAiCeoMessage({
        message: text,
        conversationId: activeConvId,
        hintArea,
        focusRecordId,
      });
      if (!res.ok) {
        showToast('AI CEO could not respond', {
          description: res.error || 'Please try again.',
          variant: 'error',
        });
        return;
      }

      if (!overridePrompt) {
        setDraftMessage('');
      }
      setFocusRecordId('');
      if (res.conversationId) {
        setActiveConvId(res.conversationId);
      }
      void refreshStatus();

      if (res.proposalsCreated && res.proposalsCreated > 0) {
        showToast(
          `${res.proposalsCreated} Action Proposal${res.proposalsCreated === 1 ? '' : 's'} created`,
          {
            description: 'Review and confirm before any record is created in GoalX.',
            variant: 'info',
          }
        );
      }
    } finally {
      setSending(false);
    }
  };

  const handleDeleteConversation = async () => {
    if (!firebaseUser?.uid || !deleteTargetConvId) return;
    setDeletingConv(true);
    try {
      await deleteAiConversation(firebaseUser.uid, deleteTargetConvId);
      if (activeConvId === deleteTargetConvId) {
        setActiveConvId('');
      }
      setDeleteTargetConvId(null);
      showToast('Conversation deleted', { variant: 'info' });
    } catch (err) {
      showToast('Failed to delete conversation', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setDeletingConv(false);
    }
  };

  const currentBriefing = useMemo(() => {
    if (briefingType === 'weekly') return latestWeeklyBriefing;
    if (briefingType === 'monthly') return latestMonthlyBriefing;
    return todayDailyBriefing;
  }, [briefingType, todayDailyBriefing, latestWeeklyBriefing, latestMonthlyBriefing]);

  const filteredProposals = useMemo(() => {
    if (proposalFilter === 'All') return proposals;
    return proposals.filter((p) => p.status === proposalFilter);
  }, [proposals, proposalFilter]);

  if (loading) return <DashboardSkeleton />;

  const isSunday = ist.dayOfWeek === 0;
  const isFirstOfMonth = ist.dayOfMonth === 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[#1F2937]">GoalX AI CEO</h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-xs font-semibold ${
                status?.available
                  ? 'border-emerald-200 bg-emerald-50 text-[#16A34A]'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {status?.available ? 'Gemini AI Ready' : 'Offline Rule-Based Mode'}
              </span>
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-[#64748B]">
            Executive strategist grounded strictly in your real GoalX metrics ·{' '}
            <span className="font-medium text-[#1F2937]">{AI_DISCLAIMER_DECISIONS}</span>
          </p>
        </div>

        {/* Daily Quota Strip */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 tabular-nums">
            <span className="text-[#64748B]">Chat Today: </span>
            <strong className="text-[#1F2937]">
              {usageSummary.chatCount}/{usageSummary.chatLimit}
            </strong>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 tabular-nums">
            <span className="text-[#64748B]">Briefings: </span>
            <strong className="text-[#1F2937]">
              {usageSummary.briefingCount}/{usageSummary.briefingLimit}
            </strong>
          </div>
          {pendingProposals.length > 0 && (
            <button
              type="button"
              onClick={() => switchTab('proposals')}
              className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer tabular-nums"
            >
              {pendingProposals.length} Pending Proposal{pendingProposals.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>

      {/* Offline Banner if GEMINI_API_KEY not configured */}
      {status && !status.available && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5 text-xs text-amber-900">
          <ShieldAlert className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
          <span>
            {status.reason ||
              'Server GEMINI_API_KEY is not configured. Chat returns verified factual snapshots while 10-section Briefings and 3-Month Baseline Review work offline using GoalX calculations.'}
          </span>
        </div>
      )}

      {/* Workspace Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl w-fit max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => switchTab('chat')}
          className={`min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap cursor-pointer ${
            activeTab === 'chat'
              ? 'bg-white text-[#DC2626] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span>AI CEO Chat</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab('briefing')}
          className={`min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap cursor-pointer ${
            activeTab === 'briefing'
              ? 'bg-white text-[#DC2626] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          <CalendarClock className="w-4 h-4" />
          <span>Briefings</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab('baseline')}
          className={`min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap cursor-pointer ${
            activeTab === 'baseline'
              ? 'bg-white text-[#DC2626] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>3-Month Baseline &amp; KPIs</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab('proposals')}
          className={`min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap cursor-pointer ${
            activeTab === 'proposals'
              ? 'bg-white text-[#DC2626] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>Action Proposals ({pendingProposals.length})</span>
        </button>
      </div>

      {/* TAB 1: AI CEO CHAT */}
      {activeTab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Conversation History Sidebar */}
          <aside className="lg:col-span-4 xl:col-span-3 bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs flex flex-col max-h-[680px]">
            <button
              type="button"
              onClick={() => {
                setActiveConvId('');
                setFocusRecordId('');
              }}
              className="min-h-[42px] w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#B91C1C] transition-colors cursor-pointer"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>New AI Session</span>
            </button>

            <div className="mt-4 flex-1 overflow-y-auto space-y-1.5 pr-1">
              {conversations.length === 0 ? (
                <p className="text-xs text-[#64748B] text-center py-6">
                  No past conversations yet. Start asking your AI CEO below.
                </p>
              ) : (
                conversations.map((conv) => {
                  const selected = conv.id === activeConvId;
                  return (
                    <div
                      key={conv.id}
                      className={`group rounded-xl border p-3 transition-colors flex items-start justify-between gap-2 ${
                        selected
                          ? 'border-[#DC2626]/40 bg-red-50/40'
                          : 'border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-100/70'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveConvId(conv.id)}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <p className="text-xs font-semibold text-[#1F2937] truncate">
                          {conv.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#64748B] truncate">
                          {conv.lastMessagePreview || 'Conversation started'}
                        </p>
                        <p className="mt-1 text-[10px] text-[#64748B] uppercase tracking-wide">
                          {conv.areaHint} · {conv.messageCount} msgs
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTargetConvId(conv.id)}
                        aria-label="Delete conversation"
                        className="p-1.5 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Main Chat Thread & Composer */}
          <section className="lg:col-span-8 xl:col-span-9 bg-white border border-[#E2E8F0] rounded-2xl shadow-xs flex flex-col min-h-[580px] max-h-[680px]">
            {/* Chat Context Bar */}
            <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#64748B]">Focus Context:</span>
                <select
                  value={hintArea}
                  onChange={(e) => setHintArea(e.target.value as AiArea | 'general')}
                  className="h-9 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-xs font-medium text-[#1F2937]"
                >
                  {AREA_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {focusRecordId && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-[#2563EB]">
                    Focused record linked
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[#64748B]">
                Responds in English, Tanglish, or Tamil
              </span>
            </div>

            {/* Thread Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {activeMessages.length === 0 ? (
                <div className="space-y-5 py-2">
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-1.5">
                    <p className="text-sm font-semibold text-[#1F2937]">
                      Ask GoalX AI CEO anything about your life &amp; company
                    </p>
                    <p className="text-xs text-[#64748B] leading-relaxed">
                      Financial math comes exclusively from your Cash/Accrual ledger calculations. Competitor answers cite only Verified or User-Entered sources. Any suggested action is staged as a Proposal requiring your confirmation.
                    </p>
                  </div>

                  {/* Suggested Prompts */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                      Suggested Prompts
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {AI_SUGGESTED_PROMPTS.map((item) => (
                        <button
                          key={item.prompt}
                          type="button"
                          onClick={() => void handleSendMessage(item.prompt)}
                          disabled={sending}
                          className="text-left rounded-xl border border-[#E2E8F0] bg-white p-3 hover:border-[#DC2626]/40 hover:bg-red-50/30 transition-colors cursor-pointer"
                        >
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#DC2626]">
                            {item.group}
                          </span>
                          <span className="mt-0.5 block text-xs font-medium text-[#1F2937]">
                            {item.prompt}
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          void handleSendMessage(
                            'Indha month revenue, expenses and pending CRM leads status sollunga'
                          )
                        }
                        disabled={sending}
                        className="text-left rounded-xl border border-[#E2E8F0] bg-white p-3 hover:border-[#DC2626]/40 hover:bg-red-50/30 transition-colors cursor-pointer"
                      >
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#2563EB]">
                          Tanglish
                        </span>
                        <span className="mt-0.5 block text-xs font-medium text-[#1F2937]">
                          Indha month revenue, expenses and pending CRM leads status sollunga
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleSendMessage(
                            'எங்கள் நிறுவனத்தின் இந்த மாத வருமானம் மற்றும் முக்கிய முன்னுரிமை என்ன?'
                          )
                        }
                        disabled={sending}
                        className="text-left rounded-xl border border-[#E2E8F0] bg-white p-3 hover:border-[#DC2626]/40 hover:bg-red-50/30 transition-colors cursor-pointer"
                      >
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#16A34A]">
                          Tamil
                        </span>
                        <span className="mt-0.5 block text-xs font-medium text-[#1F2937]">
                          எங்கள் நிறுவனத்தின் இந்த மாத வருமானம் மற்றும் முக்கிய முன்னுரிமை என்ன?
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                activeMessages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const msgProposals = proposalsByMessageId.get(msg.id) ?? [];

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2`}
                    >
                      <div
                        className={`max-w-3xl rounded-2xl px-4 py-3.5 ${
                          isUser
                            ? 'bg-[#DC2626] text-white text-xs sm:text-sm'
                            : 'bg-[#F8FAFC] border border-[#E2E8F0] w-full'
                        }`}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B]">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-[#1F2937]">
                                <Bot className="w-3.5 h-3.5 text-[#DC2626]" />
                                <span>GoalX AI CEO</span>
                                {msg.aiUnavailable && (
                                  <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
                                    Factual Snapshot
                                  </span>
                                )}
                              </span>
                              <span>{AI_DISCLAIMER_DECISIONS}</span>
                            </div>

                            {renderFormattedAssistantText(msg.content)}

                            {/* Clickable Source Citations */}
                            {msg.sources && msg.sources.length > 0 && (
                              <div className="pt-2 border-t border-[#E2E8F0] flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] font-medium text-[#64748B] mr-1">
                                  Data Sources:
                                </span>
                                {msg.sources.map((src, sIdx) => (
                                  <Link
                                    key={`${msg.id}-src-${sIdx}`}
                                    to={src.route}
                                    className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#2563EB] hover:border-[#2563EB]/40"
                                  >
                                    <span>{src.label}</span>
                                    {typeof src.count === 'number' && (
                                      <span className="text-[#64748B] tabular-nums">
                                        ({src.count})
                                      </span>
                                    )}
                                    <ArrowUpRight className="w-3 h-3" />
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Linked Action Proposals for this message */}
                      {msgProposals.length > 0 && (
                        <div className="w-full max-w-3xl space-y-2.5 pl-0 sm:pl-3">
                          {msgProposals.map((prop) => (
                            <ActionProposalCard
                              key={prop.id}
                              proposal={prop}
                              onDecided={() => void refreshStatus()}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendMessage();
              }}
              className="p-4 border-t border-[#E2E8F0] bg-[#F8FAFC] rounded-b-2xl space-y-2"
            >
              <div className="flex items-end gap-2.5">
                <textarea
                  rows={2}
                  value={draftMessage}
                  maxLength={AI_MAX_INPUT_CHARS}
                  onChange={(e) => setDraftMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                  placeholder="Ask your AI CEO (English, Tanglish, or Tamil) — e.g. 'Why is revenue behind target?' or 'Which leads need follow-up today?'"
                  className="flex-1 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-xs sm:text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626] resize-none"
                />
                <button
                  type="submit"
                  disabled={sending || !draftMessage.trim()}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                <span>Press Enter to send · Shift+Enter for new line</span>
                <span className="tabular-nums">
                  {draftMessage.length} / {AI_MAX_INPUT_CHARS}
                </span>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* TAB 2: DAILY / WEEKLY / MONTHLY BRIEFINGS */}
      {activeTab === 'briefing' && (
        <DailyBriefingCard
          briefing={currentBriefing}
          briefingType={briefingType}
          onSelectType={(t) => setBriefingType(t)}
          onGenerate={(t, regen) => void generateBriefing(t, regen)}
          loading={briefingGenerating}
          isSunday={isSunday}
          isFirstOfMonth={isFirstOfMonth}
          pendingProposalCount={pendingProposals.length}
        />
      )}

      {/* TAB 3: 3-MONTH COMPANY BASELINE & KPI TARGETS */}
      {activeTab === 'baseline' && (
        <BaselineReviewPanel
          review={latestBaselineReview}
          onGenerated={() => void refreshStatus()}
          quotaUsed={usageSummary.baselineCount}
          quotaLimit={usageSummary.baselineLimit}
        />
      )}

      {/* TAB 4: ACTION PROPOSALS */}
      {activeTab === 'proposals' && (
        <div className="space-y-4">
          {expiringSoonProposals.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-2.5 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-[#F59E0B] shrink-0" />
              <span>
                {expiringSoonProposals.length} pending proposal
                {expiringSoonProposals.length === 1 ? '' : 's'} will expire within 48 hours if left unconfirmed.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
              {(['Pending', 'Executed', 'Rejected', 'Expired', 'All'] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setProposalFilter(st)}
                    className={`min-h-[34px] px-3 rounded-lg text-xs font-medium cursor-pointer ${
                      proposalFilter === st
                        ? 'bg-white text-[#1F2937] shadow-xs'
                        : 'text-[#64748B] hover:text-[#1F2937]'
                    }`}
                  >
                    {st}
                  </button>
                )
              )}
            </div>
            <span className="text-xs text-[#64748B]">{AI_DISCLAIMER_DECISIONS}</span>
          </div>

          {filteredProposals.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-[#1F2937]">
                No {proposalFilter.toLowerCase()} action proposals
              </p>
              <p className="text-xs text-[#64748B] max-w-md mx-auto">
                When GoalX AI CEO recommends creating a Goal, Task, Calendar Event, CRM Lead Follow-up, or Competitive Gap, it appears here for your approval. Proposals expire automatically after 7 days.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredProposals.map((prop) => (
                <ActionProposalCard
                  key={prop.id}
                  proposal={prop}
                  onDecided={() => void refreshStatus()}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete Conversation Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTargetConvId)}
        title="Delete AI Conversation?"
        description="This permanently removes this conversation thread, its messages, and its linked action proposal requests from your history."
        confirmLabel="Delete Conversation"
        variant="danger"
        loading={deletingConv}
        onConfirm={handleDeleteConversation}
        onCancel={() => setDeleteTargetConvId(null)}
      />
    </div>
  );
};
