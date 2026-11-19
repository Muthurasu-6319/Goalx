import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  PiggyBank,
  Plus,
  Search,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { usePersonalData } from '../hooks/usePersonalData';
import { useToast } from '../hooks/useToast';
import {
  EXPENSE_CATEGORIES,
  INCOME_TYPES,
  PAYMENT_METHODS,
  ROUTES,
} from '../lib/constants';
import { calculateGoalProgressPct, getTodayDateString } from '../lib/goalUtils';
import {
  formatINR,
  getCurrentMonthKey,
  getLastNMonthKeys,
  paiseToRupees,
  rupeesToPaise,
  sumSavingsTransactionsPaise,
} from '../lib/moneyUtils';
import {
  ExpenseFormValues,
  expenseSchema,
  IncomeFormValues,
  incomeSchema,
  SavingsGoalFormValues,
  savingsGoalSchema,
  SavingsTxFormValues,
  savingsTxSchema,
} from '../lib/validators';
import {
  addSavingsTransaction,
  createExpense,
  createIncome,
  createSavingsGoal,
  deleteExpense,
  deleteIncome,
  deleteSavingsGoal,
  deleteSavingsTransaction,
  updateExpense,
  updateIncome,
  updateSavingsGoal,
} from '../services/financeService';
import { PersonalExpense, PersonalIncome, SavingsGoal } from '../types';

const PIE_COLORS = ['#DC2626', '#2563EB', '#16A34A', '#F59E0B', '#64748B', '#0F172A', '#EC4899', '#8B5CF6'];
const PAGE_SIZE = 8;

interface PersonalFinancePageProps {
  defaultTab?: 'ledger' | 'savings';
}

export const PersonalFinancePage: React.FC<PersonalFinancePageProps> = ({
  defaultTab = 'ledger',
}) => {
  const { firebaseUser } = useAuth();
  const { loading, incomes, expenses, savingsGoals, savingsTransactions } = usePersonalData();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [monthFilter, setMonthFilter] = useState(getCurrentMonthKey());
  const [searchTerm, setSearchTerm] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'amount_desc'>('date_desc');
  const [page, setPage] = useState(1);

  // Modals
  const [incomeModalOpen, setIncomeModalOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<PersonalIncome | null>(null);

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<PersonalExpense | null>(null);

  const [savingsModalOpen, setSavingsModalOpen] = useState(false);
  const [editingSavingsGoal, setEditingSavingsGoal] = useState<SavingsGoal | null>(null);

  const [txModalGoal, setTxModalGoal] = useState<SavingsGoal | null>(null);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);

  const todayStr = getTodayDateString();

  // Monthly totals (strictly integer paise)
  const monthlyStats = useMemo(() => {
    let incomePaise = 0;
    let expensePaise = 0;

    for (const item of incomes) {
      if (item.date.startsWith(monthFilter)) {
        incomePaise += item.amountPaise;
      }
    }
    for (const item of expenses) {
      if (item.date.startsWith(monthFilter)) {
        expensePaise += item.amountPaise;
      }
    }

    return {
      incomePaise,
      expensePaise,
      netSavingsPaise: incomePaise - expensePaise,
    };
  }, [incomes, expenses, monthFilter]);

  // Last 6 months Income vs Expense chart
  const sixMonthChart = useMemo(() => {
    const months = getLastNMonthKeys(6);
    return months.map((m) => {
      let inc = 0;
      let exp = 0;
      for (const item of incomes) {
        if (item.date.startsWith(m.key)) inc += item.amountPaise;
      }
      for (const item of expenses) {
        if (item.date.startsWith(m.key)) exp += item.amountPaise;
      }
      return {
        month: m.label,
        Income: paiseToRupees(inc),
        Expenses: paiseToRupees(exp),
      };
    });
  }, [incomes, expenses]);

  // Expense category breakdown for selected month
  const expenseCategoryPie = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of expenses) {
      if (item.date.startsWith(monthFilter)) {
        totals.set(item.category, (totals.get(item.category) ?? 0) + item.amountPaise);
      }
    }
    return Array.from(totals.entries())
      .map(([name, paise]) => ({ name, value: paiseToRupees(paise), paise }))
      .sort((a, b) => b.paise - a.paise);
  }, [expenses, monthFilter]);

  // Unified filtered ledger rows
  const ledgerRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    type LedgerRow =
      | { kind: 'income'; id: string; title: string; subtitle: string; amountPaise: number; date: string; notes: string; raw: PersonalIncome }
      | { kind: 'expense'; id: string; title: string; subtitle: string; amountPaise: number; date: string; notes: string; raw: PersonalExpense };

    const rows: LedgerRow[] = [];

    if (ledgerFilter !== 'expense') {
      for (const i of incomes) {
        if (monthFilter && !i.date.startsWith(monthFilter)) continue;
        if (term && !i.source.toLowerCase().includes(term) && !i.type.toLowerCase().includes(term)) continue;
        rows.push({
          kind: 'income',
          id: i.id,
          title: i.source,
          subtitle: i.type,
          amountPaise: i.amountPaise,
          date: i.date,
          notes: i.notes,
          raw: i,
        });
      }
    }

    if (ledgerFilter !== 'income') {
      for (const e of expenses) {
        if (monthFilter && !e.date.startsWith(monthFilter)) continue;
        if (term && !e.category.toLowerCase().includes(term) && !e.paymentMethod.toLowerCase().includes(term)) continue;
        rows.push({
          kind: 'expense',
          id: e.id,
          title: e.category,
          subtitle: e.paymentMethod,
          amountPaise: e.amountPaise,
          date: e.date,
          notes: e.notes,
          raw: e,
        });
      }
    }

    rows.sort((a, b) => {
      if (sortBy === 'amount_desc') return b.amountPaise - a.amountPaise;
      return b.date.localeCompare(a.date);
    });

    return rows;
  }, [incomes, expenses, monthFilter, searchTerm, ledgerFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(ledgerRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = ledgerRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Savings transactions grouped by savingsGoalId
  const txByGoal = useMemo(() => {
    const map = new Map<string, typeof savingsTransactions>();
    for (const tx of savingsTransactions) {
      const list = map.get(tx.savingsGoalId) ?? [];
      list.push(tx);
      map.set(tx.savingsGoalId, list);
    }
    return map;
  }, [savingsTransactions]);

  const totalVaultPaise = useMemo(
    () => sumSavingsTransactionsPaise(savingsTransactions),
    [savingsTransactions]
  );

  // Forms
  const incomeForm = useForm<IncomeFormValues>({
    resolver: zodResolver(incomeSchema),
    defaultValues: { source: '', type: 'Salary', amountRupees: 0, date: todayStr, notes: '' },
  });

  const expenseForm = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { category: EXPENSE_CATEGORIES[0], amountRupees: 0, date: todayStr, paymentMethod: PAYMENT_METHODS[0], notes: '' },
  });

  const savingsForm = useForm<SavingsGoalFormValues>({
    resolver: zodResolver(savingsGoalSchema),
    defaultValues: { name: '', targetAmountRupees: 0, targetDate: todayStr },
  });

  const txForm = useForm<SavingsTxFormValues>({
    resolver: zodResolver(savingsTxSchema),
    defaultValues: { type: 'deposit', amountRupees: 0, date: todayStr, notes: '' },
  });

  const openIncomeModal = (existing?: PersonalIncome) => {
    setEditingIncome(existing ?? null);
    incomeForm.reset(
      existing
        ? {
            source: existing.source,
            type: existing.type,
            amountRupees: paiseToRupees(existing.amountPaise),
            date: existing.date,
            notes: existing.notes || '',
          }
        : { source: '', type: 'Salary', amountRupees: undefined as unknown as number, date: todayStr, notes: '' }
    );
    setIncomeModalOpen(true);
  };

  const openExpenseModal = (existing?: PersonalExpense) => {
    setEditingExpense(existing ?? null);
    expenseForm.reset(
      existing
        ? {
            category: existing.category,
            amountRupees: paiseToRupees(existing.amountPaise),
            date: existing.date,
            paymentMethod: existing.paymentMethod,
            notes: existing.notes || '',
          }
        : {
            category: EXPENSE_CATEGORIES[0],
            amountRupees: undefined as unknown as number,
            date: todayStr,
            paymentMethod: PAYMENT_METHODS[0],
            notes: '',
          }
    );
    setExpenseModalOpen(true);
  };

  const openSavingsModal = (existing?: SavingsGoal) => {
    setEditingSavingsGoal(existing ?? null);
    savingsForm.reset(
      existing
        ? {
            name: existing.name,
            targetAmountRupees: paiseToRupees(existing.targetAmountPaise),
            targetDate: existing.targetDate,
          }
        : { name: '', targetAmountRupees: undefined as unknown as number, targetDate: todayStr }
    );
    setSavingsModalOpen(true);
  };

  const openTxModal = (goal: SavingsGoal) => {
    setTxModalGoal(goal);
    txForm.reset({
      type: 'deposit',
      amountRupees: undefined as unknown as number,
      date: todayStr,
      notes: '',
    });
  };

  const onSaveIncome = async (values: IncomeFormValues) => {
    if (!firebaseUser) return;
    const amountPaise = rupeesToPaise(values.amountRupees);
    try {
      if (editingIncome) {
        await updateIncome(editingIncome.id, {
          source: values.source,
          type: values.type,
          amountPaise,
          date: values.date,
          notes: values.notes,
        });
        showToast('Income updated', { variant: 'success' });
      } else {
        await createIncome(firebaseUser.uid, {
          source: values.source,
          type: values.type,
          amountPaise,
          date: values.date,
          notes: values.notes,
        });
        showToast('Income recorded', { variant: 'success' });
      }
      setIncomeModalOpen(false);
    } catch (err) {
      showToast('Failed to save income', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const onSaveExpense = async (values: ExpenseFormValues) => {
    if (!firebaseUser) return;
    const amountPaise = rupeesToPaise(values.amountRupees);
    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, {
          category: values.category,
          amountPaise,
          date: values.date,
          paymentMethod: values.paymentMethod,
          notes: values.notes,
        });
        showToast('Expense updated', { variant: 'success' });
      } else {
        await createExpense(firebaseUser.uid, {
          category: values.category,
          amountPaise,
          date: values.date,
          paymentMethod: values.paymentMethod,
          notes: values.notes,
        });
        showToast('Expense recorded', { variant: 'success' });
      }
      setExpenseModalOpen(false);
    } catch (err) {
      showToast('Failed to save expense', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const onSaveSavingsGoal = async (values: SavingsGoalFormValues) => {
    if (!firebaseUser) return;
    const targetAmountPaise = rupeesToPaise(values.targetAmountRupees);
    try {
      if (editingSavingsGoal) {
        await updateSavingsGoal(editingSavingsGoal.id, {
          name: values.name,
          targetAmountPaise,
          targetDate: values.targetDate,
        });
        showToast('Savings goal updated', { variant: 'success' });
      } else {
        await createSavingsGoal(firebaseUser.uid, {
          name: values.name,
          targetAmountPaise,
          targetDate: values.targetDate,
        });
        showToast('Savings goal created', { variant: 'success' });
      }
      setSavingsModalOpen(false);
    } catch (err) {
      showToast('Failed to save savings goal', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const onAddSavingsTx = async (values: SavingsTxFormValues) => {
    if (!firebaseUser || !txModalGoal) return;
    const amountPaise = rupeesToPaise(values.amountRupees);
    const currentSaved = sumSavingsTransactionsPaise(txByGoal.get(txModalGoal.id) ?? []);
    if (values.type === 'withdraw' && amountPaise > currentSaved) {
      showToast('Insufficient savings balance', {
        description: `Available balance is ${formatINR(currentSaved)}.`,
        variant: 'error',
      });
      return;
    }

    try {
      await addSavingsTransaction(firebaseUser.uid, {
        savingsGoalId: txModalGoal.id,
        type: values.type,
        amountPaise,
        date: values.date,
        notes: values.notes,
      });
      showToast(values.type === 'deposit' ? 'Contribution added' : 'Withdrawal recorded', {
        variant: 'success',
      });
      setTxModalGoal(null);
    } catch (err) {
      showToast('Transaction failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Personal Finance</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Personal cashflow and savings vault — kept separate from company accounts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => openIncomeModal()}
            className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3.5 py-2 text-xs sm:text-sm font-medium text-white hover:bg-emerald-700 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Income</span>
          </button>
          <button
            type="button"
            onClick={() => openExpenseModal()}
            className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-3.5 py-2 text-xs sm:text-sm font-medium text-white hover:bg-[#B91C1C] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* Section Tabs (Synced with /life/income & /life/savings) */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => navigate(ROUTES.LIFE_INCOME)}
          className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
            defaultTab === 'ledger'
              ? 'bg-white text-[#1F2937] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          Income & Expenses
        </button>
        <button
          type="button"
          onClick={() => navigate(ROUTES.LIFE_SAVINGS)}
          className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
            defaultTab === 'savings'
              ? 'bg-white text-[#1F2937] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          Savings Goals
        </button>
      </div>

      {/* Shared KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Monthly Income</p>
          <p className="mt-1 text-xl sm:text-2xl font-bold text-[#16A34A] tabular-nums">
            {formatINR(monthlyStats.incomePaise)}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Monthly Expenses</p>
          <p className="mt-1 text-xl sm:text-2xl font-bold text-[#DC2626] tabular-nums">
            {formatINR(monthlyStats.expensePaise)}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Net Savings (Month)</p>
          <p
            className={`mt-1 text-xl sm:text-2xl font-bold tabular-nums ${
              monthlyStats.netSavingsPaise >= 0 ? 'text-[#2563EB]' : 'text-[#DC2626]'
            }`}
          >
            {formatINR(monthlyStats.netSavingsPaise)}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <p className="text-xs text-[#64748B]">Total Savings Vault</p>
          <p className="mt-1 text-xl sm:text-2xl font-bold text-[#1F2937] tabular-nums">
            {formatINR(totalVaultPaise)}
          </p>
        </div>
      </div>

      {defaultTab === 'ledger' ? (
        <>
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-[#1F2937]">Income vs Expenses (6 Months)</h2>
                <p className="text-xs text-[#64748B]">Personal cashflow trend in INR</p>
              </div>
              {incomes.length > 0 || expenses.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sixMonthChart} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 12 }} />
                      <YAxis
                        tick={{ fill: '#64748B', fontSize: 12 }}
                        tickFormatter={(val: number) => `₹${val.toLocaleString('en-IN')}`}
                        width={80}
                      />
                      <Tooltip
                        formatter={(val) =>
                          `₹${Number(val).toLocaleString('en-IN')}`
                        }
                      />
                      <Bar dataKey="Income" fill="#16A34A" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="Expenses" fill="#DC2626" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="No transactions recorded"
                  description="Log your first income or expense entry to view your 6-month trend."
                  actionLabel="Add Income"
                  onAction={() => openIncomeModal()}
                />
              )}
            </section>

            <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-[#1F2937]">Expense Breakdown</h2>
                <p className="text-xs text-[#64748B]">By category for {monthFilter || 'all months'}</p>
              </div>
              {expenseCategoryPie.length > 0 ? (
                <div className="space-y-4">
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseCategoryPie}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={2}
                        >
                          {expenseCategoryPie.map((_, idx) => (
                            <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-1.5 text-xs">
                    {expenseCategoryPie.slice(0, 5).map((cat, idx) => (
                      <li key={cat.name} className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[#1F2937] truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                          />
                          {cat.name}
                        </span>
                        <span className="font-semibold text-[#1F2937] tabular-nums">
                          {formatINR(cat.paise)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <EmptyState
                  title="No expenses this month"
                  description="Log an expense to inspect category distribution."
                  actionLabel="Add Expense"
                  onAction={() => openExpenseModal()}
                />
              )}
            </section>
          </div>

          {/* Filter + Ledger Table */}
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search source or category..."
                  className="w-full h-10 rounded-xl border border-[#E2E8F0] pl-10 pr-3 text-sm"
                />
              </div>

              <input
                type="month"
                value={monthFilter}
                onChange={(e) => {
                  setMonthFilter(e.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937]"
              />

              <select
                value={ledgerFilter}
                onChange={(e) => {
                  setLedgerFilter(e.target.value as 'all' | 'income' | 'expense');
                  setPage(1);
                }}
                className="h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white"
              >
                <option value="all">All Transactions</option>
                <option value="income">Income Only</option>
                <option value="expense">Expenses Only</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date_desc' | 'amount_desc')}
                className="h-10 rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#1F2937] bg-white"
              >
                <option value="date_desc">Sort: Newest Date</option>
                <option value="amount_desc">Sort: Highest Amount</option>
              </select>
            </div>

            {paginatedRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#64748B]">
                No personal income or expense entries found for this filter.
              </div>
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {paginatedRows.map((row) => (
                  <div
                    key={`${row.kind}-${row.id}`}
                    className="py-3.5 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          row.kind === 'income'
                            ? 'bg-emerald-50 text-[#16A34A]'
                            : 'bg-red-50 text-[#DC2626]'
                        }`}
                      >
                        {row.kind === 'income' ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1F2937] truncate">{row.title}</p>
                        <p className="text-xs text-[#64748B] truncate tabular-nums">
                          {row.subtitle} · {row.date}
                          {row.notes ? ` · ${row.notes}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          row.kind === 'income' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }`}
                      >
                        {row.kind === 'income' ? '+' : '-'}
                        {formatINR(row.amountPaise)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          row.kind === 'income'
                            ? openIncomeModal(row.raw)
                            : openExpenseModal(row.raw)
                        }
                        aria-label="Edit entry"
                        className="p-1.5 text-[#64748B] hover:text-[#1F2937] cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          row.kind === 'income'
                            ? deleteIncome(row.id)
                            : deleteExpense(row.id)
                        }
                        aria-label="Delete entry"
                        className="p-1.5 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-[#E2E8F0]">
                <span className="text-xs text-[#64748B] tabular-nums">
                  Page {safePage} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="min-h-[36px] px-3 rounded-xl border border-[#E2E8F0] text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="min-h-[36px] px-3 rounded-xl border border-[#E2E8F0] text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        /* Savings Goals Tab */
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#1F2937]">
              Personal Savings Goals ({savingsGoals.length})
            </h2>
            <button
              type="button"
              onClick={() => openSavingsModal()}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Savings Goal</span>
            </button>
          </div>

          {savingsGoals.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8">
              <EmptyState
                title="No savings goals yet"
                description="Create a target fund and track every deposit and withdrawal as verifiable transactions."
                actionLabel="Create Savings Goal"
                icon={<PiggyBank className="w-5 h-5" />}
                onAction={() => openSavingsModal()}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savingsGoals.map((goal) => {
                const txs = [...(txByGoal.get(goal.id) ?? [])].sort((a, b) =>
                  b.date.localeCompare(a.date)
                );
                const savedPaise = sumSavingsTransactionsPaise(txs);
                const pct = calculateGoalProgressPct(savedPaise, goal.targetAmountPaise);
                const isExpanded = expandedGoalId === goal.id;

                return (
                  <div
                    key={goal.id}
                    className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-[#1F2937]">{goal.name}</h3>
                        <p className="text-xs text-[#64748B] tabular-nums">Target Date: {goal.targetDate}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openSavingsModal(goal)}
                          className="p-1.5 text-[#64748B] hover:text-[#1F2937] cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => firebaseUser && deleteSavingsGoal(firebaseUser.uid, goal.id)}
                          className="p-1.5 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between text-sm tabular-nums">
                        <span className="font-bold text-[#1F2937]">{formatINR(savedPaise)}</span>
                        <span className="text-xs text-[#64748B]">
                          of {formatINR(goal.targetAmountPaise)} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            pct === 100 ? 'bg-[#16A34A]' : 'bg-[#2563EB]'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F0]">
                      <button
                        type="button"
                        onClick={() => setExpandedGoalId(isExpanded ? null : goal.id)}
                        className="text-xs font-medium text-[#64748B] hover:text-[#1F2937] cursor-pointer"
                      >
                        {isExpanded ? 'Hide transactions' : `Transactions (${txs.length})`}
                      </button>

                      <button
                        type="button"
                        onClick={() => openTxModal(goal)}
                        className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-medium text-[#2563EB] hover:bg-blue-100 cursor-pointer"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        <span>Add / Withdraw</span>
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="pt-2 border-t border-[#E2E8F0]">
                        {txs.length === 0 ? (
                          <p className="text-xs text-[#64748B]">No transactions yet.</p>
                        ) : (
                          <ul className="divide-y divide-[#E2E8F0]">
                            {txs.map((tx) => (
                              <li
                                key={tx.id}
                                className="py-2 flex items-center justify-between text-xs"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium text-[#1F2937] truncate">
                                    {tx.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                                    {tx.notes ? ` · ${tx.notes}` : ''}
                                  </p>
                                  <p className="text-[#64748B] tabular-nums">{tx.date}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 tabular-nums">
                                  <span
                                    className={
                                      tx.type === 'deposit'
                                        ? 'font-semibold text-[#16A34A]'
                                        : 'font-semibold text-[#DC2626]'
                                    }
                                  >
                                    {tx.type === 'deposit' ? '+' : '-'}
                                    {formatINR(tx.amountPaise)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => deleteSavingsTransaction(tx.id)}
                                    className="p-1 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="text-xs text-[#64748B]">
            <Link to={ROUTES.LIFE_INCOME} className="text-[#2563EB] hover:underline">
              Switch to Income & Expenses Ledger →
            </Link>
          </div>
        </section>
      )}

      {/* Income Modal */}
      {incomeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <h2 className="text-base font-semibold text-[#1F2937]">
                {editingIncome ? 'Edit Income' : 'Add Personal Income'}
              </h2>
              <button type="button" onClick={() => setIncomeModalOpen(false)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={incomeForm.handleSubmit(onSaveIncome)} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Source</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly Draw / Consulting"
                  {...incomeForm.register('source')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm"
                />
                {incomeForm.formState.errors.source && (
                  <p className="mt-1 text-xs text-[#DC2626]">{incomeForm.formState.errors.source.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Type</label>
                  <select {...incomeForm.register('type')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white">
                    {INCOME_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g. 75000"
                    {...incomeForm.register('amountRupees', { valueAsNumber: true })}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums"
                  />
                  {incomeForm.formState.errors.amountRupees && (
                    <p className="mt-1 text-xs text-[#DC2626]">{incomeForm.formState.errors.amountRupees.message}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Date</label>
                <input type="date" {...incomeForm.register('date')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Notes</label>
                <input type="text" placeholder="Optional note" {...incomeForm.register('notes')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIncomeModalOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={incomeForm.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#16A34A] px-5 text-sm font-medium text-white cursor-pointer">
                  {incomeForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Save</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <h2 className="text-base font-semibold text-[#1F2937]">
                {editingExpense ? 'Edit Expense' : 'Add Personal Expense'}
              </h2>
              <button type="button" onClick={() => setExpenseModalOpen(false)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={expenseForm.handleSubmit(onSaveExpense)} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Category</label>
                  <select {...expenseForm.register('category')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white">
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g. 2450"
                    {...expenseForm.register('amountRupees', { valueAsNumber: true })}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums"
                  />
                  {expenseForm.formState.errors.amountRupees && (
                    <p className="mt-1 text-xs text-[#DC2626]">{expenseForm.formState.errors.amountRupees.message}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Date</label>
                  <input type="date" {...expenseForm.register('date')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Payment Method</label>
                  <select {...expenseForm.register('paymentMethod')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Notes</label>
                <input type="text" placeholder="Optional note" {...expenseForm.register('notes')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setExpenseModalOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={expenseForm.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 text-sm font-medium text-white cursor-pointer">
                  {expenseForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Save</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Savings Goal Modal */}
      {savingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <h2 className="text-base font-semibold text-[#1F2937]">
                {editingSavingsGoal ? 'Edit Savings Goal' : 'New Savings Goal'}
              </h2>
              <button type="button" onClick={() => setSavingsModalOpen(false)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={savingsForm.handleSubmit(onSaveSavingsGoal)} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Goal Name</label>
                <input
                  type="text"
                  placeholder="e.g. Emergency Runway Fund"
                  {...savingsForm.register('name')}
                  className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm"
                />
                {savingsForm.formState.errors.name && (
                  <p className="mt-1 text-xs text-[#DC2626]">{savingsForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Target Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="e.g. 500000"
                    {...savingsForm.register('targetAmountRupees', { valueAsNumber: true })}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums"
                  />
                  {savingsForm.formState.errors.targetAmountRupees && (
                    <p className="mt-1 text-xs text-[#DC2626]">{savingsForm.formState.errors.targetAmountRupees.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Target Date</label>
                  <input type="date" {...savingsForm.register('targetDate')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setSavingsModalOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={savingsForm.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 text-sm font-medium text-white cursor-pointer">
                  {savingsForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Save</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Savings Deposit / Withdraw Modal */}
      {txModalGoal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <div>
                <h2 className="text-base font-semibold text-[#1F2937]">{txModalGoal.name}</h2>
                <p className="text-xs text-[#64748B]">
                  Current Balance: {formatINR(sumSavingsTransactionsPaise(txByGoal.get(txModalGoal.id) ?? []))}
                </p>
              </div>
              <button type="button" onClick={() => setTxModalGoal(null)} className="p-2 text-[#64748B] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={txForm.handleSubmit(onAddSavingsTx)} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Action</label>
                  <select {...txForm.register('type')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm bg-white">
                    <option value="deposit">Add / Deposit</option>
                    <option value="withdraw">Withdraw</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g. 10000"
                    {...txForm.register('amountRupees', { valueAsNumber: true })}
                    className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums"
                  />
                  {txForm.formState.errors.amountRupees && (
                    <p className="mt-1 text-xs text-[#DC2626]">{txForm.formState.errors.amountRupees.message}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Date</label>
                <input type="date" {...txForm.register('date')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1">Note</label>
                <input type="text" placeholder="Optional note" {...txForm.register('notes')} className="w-full h-11 rounded-xl border border-[#E2E8F0] px-3.5 text-sm" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setTxModalGoal(null)} className="min-h-[44px] px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={txForm.formState.isSubmitting} className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 text-sm font-medium text-white cursor-pointer">
                  {txForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Record Transaction</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
