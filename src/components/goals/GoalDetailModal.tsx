import React, { useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePersonalData } from '../../hooks/usePersonalData';
import { useToast } from '../../hooks/useToast';
import {
  calculateGoalProgressPct,
  getEffectiveGoalStatus,
  getTodayDateString,
} from '../../lib/goalUtils';
import {
  addMilestone,
  completePersonalGoal,
  deleteMilestone,
  deletePersonalGoal,
  logGoalProgress,
  reorderMilestones,
  toggleMilestone,
  updateGoalStatus,
  updateMilestoneTitle,
} from '../../services/goalsService';
import { PersonalGoal } from '../../types';
import { CircularProgress } from './CircularProgress';

interface GoalDetailModalProps {
  goal: PersonalGoal | null;
  onClose: () => void;
  onEdit: (goal: PersonalGoal) => void;
}

export const GoalDetailModal: React.FC<GoalDetailModalProps> = ({ goal, onClose, onEdit }) => {
  const { firebaseUser } = useAuth();
  const { milestones, goalHistory } = usePersonalData();
  const { showToast } = useToast();

  const [progressValue, setProgressValue] = useState<string>('');
  const [progressDate, setProgressDate] = useState<string>(getTodayDateString());
  const [progressNote, setProgressNote] = useState<string>('');
  const [savingProgress, setSavingProgress] = useState(false);

  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [editingMilestoneText, setEditingMilestoneText] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  if (!goal || !firebaseUser) return null;

  const goalMilestones = milestones
    .filter((m) => m.goalId === goal.id)
    .sort((a, b) => a.order - b.order);

  const historyEntries = goalHistory
    .filter((h) => h.goalId === goal.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const pct = calculateGoalProgressPct(goal.currentValue, goal.targetValue);
  const effectiveStatus = getEffectiveGoalStatus(goal);

  const handleLogProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericVal = Number(progressValue);
    if (progressValue.trim() === '' || Number.isNaN(numericVal) || numericVal < 0) {
      showToast('Enter a valid progress value', { variant: 'error' });
      return;
    }
    setSavingProgress(true);
    try {
      await logGoalProgress(firebaseUser.uid, goal, numericVal, progressDate, progressNote);
      setProgressValue('');
      setProgressNote('');
      showToast('Progress logged to history', { variant: 'success' });
    } catch (err) {
      showToast('Failed to update progress', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSavingProgress(false);
    }
  };

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMilestoneTitle.trim();
    if (!trimmed) return;
    setBusyAction(true);
    try {
      await addMilestone(firebaseUser.uid, goal, goalMilestones, trimmed);
      setNewMilestoneTitle('');
      showToast('Milestone added', { variant: 'success' });
    } catch (err) {
      showToast('Error adding milestone', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleMoveMilestone = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= goalMilestones.length) return;
    const reordered = [...goalMilestones];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    try {
      await reorderMilestones(reordered);
    } catch (err) {
      showToast('Failed to reorder milestones', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleSaveMilestoneTitle = async (id: string) => {
    const trimmed = editingMilestoneText.trim();
    if (!trimmed) return;
    try {
      await updateMilestoneTitle(id, trimmed);
      setEditingMilestoneId(null);
      setEditingMilestoneText('');
    } catch (err) {
      showToast('Failed to rename milestone', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handleComplete = async () => {
    setBusyAction(true);
    try {
      await completePersonalGoal(firebaseUser.uid, goal);
      showToast('Goal marked completed', { variant: 'success' });
    } catch (err) {
      showToast('Action failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleArchive = async () => {
    setBusyAction(true);
    try {
      const nextStatus = goal.status === 'Archived' ? 'In Progress' : 'Archived';
      await updateGoalStatus(goal.id, goal.currentValue, nextStatus);
      showToast(nextStatus === 'Archived' ? 'Goal archived' : 'Goal restored', { variant: 'info' });
    } catch (err) {
      showToast('Action failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleDelete = async () => {
    setBusyAction(true);
    try {
      await deletePersonalGoal(firebaseUser.uid, goal.id);
      showToast('Goal deleted', { variant: 'info' });
      onClose();
    } catch (err) {
      showToast('Delete failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
      setBusyAction(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-3xl bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-4 min-w-0">
            <CircularProgress percentage={pct} size={52} />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-[#1F2937] truncate">{goal.title}</h2>
              <p className="text-xs text-[#64748B] truncate">
                {goal.category} · {goal.goalType} · {effectiveStatus} · Due {goal.targetDate}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#64748B] hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[78vh] overflow-y-auto">
          {/* Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
            <div className="text-sm font-medium text-[#1F2937] tabular-nums">
              Current: <span className="font-bold">{goal.currentValue}</span> / {goal.targetValue}{' '}
              {goal.unit}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onEdit(goal)}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-slate-50 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
              {effectiveStatus !== 'Completed' && (
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={handleComplete}
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Complete</span>
                </button>
              )}
              <button
                type="button"
                disabled={busyAction}
                onClick={handleArchive}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#64748B] hover:text-[#1F2937] hover:bg-slate-50 cursor-pointer"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>{goal.status === 'Archived' ? 'Unarchive' : 'Archive'}</span>
              </button>
              <button
                type="button"
                disabled={busyAction}
                onClick={handleDelete}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-[#DC2626] hover:bg-red-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {goal.description && (
            <p className="text-sm text-[#64748B] leading-relaxed">{goal.description}</p>
          )}

          {/* Manual Progress Update (Disabled only if Task-based auto mode) */}
          <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[#1F2937]">Log Progress Update</h3>
            {goal.goalType === 'Task-based' ? (
              <p className="text-xs text-[#64748B]">
                This goal is Task-based. Toggle milestones below to automatically update progress and record history.
              </p>
            ) : (
              <form onSubmit={handleLogProgress} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={progressValue}
                  onChange={(e) => setProgressValue(e.target.value)}
                  placeholder={`New total (${goal.unit || 'value'})`}
                  className="h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm text-[#1F2937] tabular-nums focus:outline-none focus:border-[#DC2626]"
                />
                <input
                  type="date"
                  value={progressDate}
                  onChange={(e) => setProgressDate(e.target.value)}
                  className="h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm text-[#1F2937] focus:outline-none focus:border-[#DC2626]"
                />
                <input
                  type="text"
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                  placeholder="Update note (optional)"
                  className="h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm text-[#1F2937] focus:outline-none focus:border-[#DC2626]"
                />
                <button
                  type="submit"
                  disabled={savingProgress}
                  className="h-10 rounded-xl bg-[#DC2626] text-white text-sm font-medium hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
                >
                  {savingProgress ? 'Saving...' : 'Save Update'}
                </button>
              </form>
            )}
          </div>

          {/* Milestones Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#1F2937]">
              Milestones ({goalMilestones.filter((m) => m.completed).length}/{goalMilestones.length})
            </h3>
            <form onSubmit={handleAddMilestone} className="flex gap-2">
              <input
                type="text"
                value={newMilestoneTitle}
                onChange={(e) => setNewMilestoneTitle(e.target.value)}
                placeholder="Add a milestone step..."
                className="flex-1 h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] focus:outline-none focus:border-[#DC2626]"
              />
              <button
                type="submit"
                disabled={busyAction}
                className="h-10 px-4 rounded-xl bg-slate-100 text-xs font-medium text-[#1F2937] hover:bg-slate-200 inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>

            {goalMilestones.length > 0 ? (
              <ul className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
                {goalMilestones.map((m, idx) => (
                  <li key={m.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleMilestone(firebaseUser.uid, goal, goalMilestones, m)}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 cursor-pointer ${
                          m.completed
                            ? 'bg-[#16A34A] border-[#16A34A] text-white'
                            : 'border-[#CBD5E1] bg-white'
                        }`}
                      >
                        {m.completed && <Check className="w-3.5 h-3.5" />}
                      </button>

                      {editingMilestoneId === m.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editingMilestoneText}
                            onChange={(e) => setEditingMilestoneText(e.target.value)}
                            className="flex-1 h-8 rounded-lg border border-[#E2E8F0] px-2.5 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveMilestoneTitle(m.id)}
                            className="text-xs font-medium text-[#16A34A] cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`text-sm truncate ${
                            m.completed ? 'line-through text-[#64748B]' : 'text-[#1F2937]'
                          }`}
                        >
                          {m.title}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveMilestone(idx, -1)}
                        aria-label="Move up"
                        className="p-1 text-[#64748B] hover:text-[#1F2937] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === goalMilestones.length - 1}
                        onClick={() => handleMoveMilestone(idx, 1)}
                        aria-label="Move down"
                        className="p-1 text-[#64748B] hover:text-[#1F2937] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMilestoneId(m.id);
                          setEditingMilestoneText(m.title);
                        }}
                        aria-label="Edit milestone"
                        className="p-1 text-[#64748B] hover:text-[#1F2937] cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMilestone(firebaseUser.uid, goal, goalMilestones, m.id)}
                        aria-label="Delete milestone"
                        className="p-1 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#64748B]">No milestones added yet.</p>
            )}
          </div>

          {/* Append-Only Progress History */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#1F2937]">
              Progress History ({historyEntries.length})
            </h3>
            {historyEntries.length > 0 ? (
              <ul className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
                {historyEntries.map((entry) => (
                  <li key={entry.id} className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-[#1F2937] truncate">
                        {entry.note || 'Progress updated'}
                      </p>
                      <p className="text-[#64748B] tabular-nums">{entry.date}</p>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <p className="font-semibold text-[#1F2937]">
                        {entry.value} {goal.unit}
                      </p>
                      <p className={entry.delta >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}>
                        {entry.delta >= 0 ? `+${entry.delta}` : entry.delta}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#64748B]">No progress logs recorded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
