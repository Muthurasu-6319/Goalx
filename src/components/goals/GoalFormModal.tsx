import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import {
  GOAL_CATEGORIES,
  GOAL_PRIORITIES,
  GOAL_STATUSES,
  GOAL_TYPES,
} from '../../lib/constants';
import { addDaysToDateString, getTodayDateString } from '../../lib/goalUtils';
import { PersonalGoalFormValues, personalGoalSchema } from '../../lib/validators';
import { createPersonalGoal, updatePersonalGoal } from '../../services/goalsService';
import { PersonalGoal } from '../../types';

interface GoalFormModalProps {
  open: boolean;
  editingGoal: PersonalGoal | null;
  onClose: () => void;
}

export const GoalFormModal: React.FC<GoalFormModalProps> = ({ open, editingGoal, onClose }) => {
  const { firebaseUser } = useAuth();
  const { showToast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PersonalGoalFormValues>({
    resolver: zodResolver(personalGoalSchema),
    defaultValues: {
      title: '',
      description: '',
      category: GOAL_CATEGORIES[0],
      startDate: getTodayDateString(),
      targetDate: addDaysToDateString(getTodayDateString(), 30),
      priority: 'Medium',
      goalType: 'Numeric',
      targetValue: 100,
      currentValue: 0,
      unit: '',
      notes: '',
      status: 'Not Started',
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editingGoal) {
      reset({
        title: editingGoal.title,
        description: editingGoal.description || '',
        category: editingGoal.category,
        startDate: editingGoal.startDate,
        targetDate: editingGoal.targetDate,
        priority: editingGoal.priority,
        goalType: editingGoal.goalType,
        targetValue: editingGoal.targetValue,
        currentValue: editingGoal.currentValue,
        unit: editingGoal.unit || '',
        notes: editingGoal.notes || '',
        status: editingGoal.status,
      });
    } else {
      const today = getTodayDateString();
      reset({
        title: '',
        description: '',
        category: GOAL_CATEGORIES[0],
        startDate: today,
        targetDate: addDaysToDateString(today, 30),
        priority: 'Medium',
        goalType: 'Numeric',
        targetValue: 100,
        currentValue: 0,
        unit: '',
        notes: '',
        status: 'Not Started',
      });
    }
  }, [open, editingGoal, reset]);

  if (!open || !firebaseUser) return null;

  const selectedGoalType = watch('goalType');

  const onSubmit = async (values: PersonalGoalFormValues) => {
    try {
      if (editingGoal) {
        await updatePersonalGoal(editingGoal.id, {
          title: values.title,
          description: values.description,
          category: values.category,
          startDate: values.startDate,
          targetDate: values.targetDate,
          priority: values.priority,
          goalType: values.goalType,
          targetValue: values.targetValue,
          unit: values.unit,
          notes: values.notes,
          status: values.status,
        });
        showToast('Goal updated', { variant: 'success' });
      } else {
        await createPersonalGoal(firebaseUser.uid, values);
        showToast('Goal created', { description: values.title, variant: 'success' });
      }
      onClose();
    } catch (err) {
      showToast('Could not save goal', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-[#1F2937]">
            {editingGoal ? 'Edit Personal Goal' : 'New Personal Goal'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#64748B] hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">Title</label>
            <input
              type="text"
              placeholder="e.g. Learn PostgreSQL"
              {...register('title')}
              className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
            />
            {errors.title && <p className="mt-1 text-xs text-[#DC2626]">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">Description</label>
            <textarea
              rows={2}
              placeholder="e.g. Complete indexing, query optimization, and build a sample schema"
              {...register('description')}
              className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
            />
            {errors.description && <p className="mt-1 text-xs text-[#DC2626]">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Category</label>
              <select
                {...register('category')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              >
                {GOAL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Goal Type</label>
              <select
                {...register('goalType')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              >
                {GOAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Priority</label>
              <select
                {...register('priority')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              >
                {GOAL_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Start Date</label>
              <input
                type="date"
                {...register('startDate')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              />
              {errors.startDate && <p className="mt-1 text-xs text-[#DC2626]">{errors.startDate.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Target Date</label>
              <input
                type="date"
                {...register('targetDate')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              />
              {errors.targetDate && <p className="mt-1 text-xs text-[#DC2626]">{errors.targetDate.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Status</label>
              <select
                {...register('status')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              >
                {GOAL_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Target Value</label>
              <input
                type="number"
                step="any"
                min={0.01}
                placeholder="e.g. 12"
                {...register('targetValue', { valueAsNumber: true })}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              />
              {errors.targetValue && (
                <p className="mt-1 text-xs text-[#DC2626]">{errors.targetValue.message}</p>
              )}
            </div>

            {!editingGoal && (
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Starting Value</label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  placeholder="0"
                  disabled={selectedGoalType === 'Task-based'}
                  {...register('currentValue', { valueAsNumber: true })}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] tabular-nums disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                />
                {errors.currentValue && (
                  <p className="mt-1 text-xs text-[#DC2626]">{errors.currentValue.message}</p>
                )}
              </div>
            )}

            <div className={editingGoal ? 'sm:col-span-2' : ''}>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">Unit</label>
              <input
                type="text"
                placeholder="e.g. chapters, km, hrs, ₹"
                {...register('unit')}
                className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
              />
            </div>
          </div>

          {selectedGoalType === 'Task-based' && (
            <p className="text-xs text-[#2563EB]">
              Task-based goals automatically derive progress from their completed milestones.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">Notes</label>
            <textarea
              rows={2}
              placeholder="Optional context, resources, or blockers..."
              {...register('notes')}
              className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:text-[#1F2937] hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{editingGoal ? 'Save Goal' : 'Create Goal'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
