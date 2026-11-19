import { SavingsTransaction } from '../types';

/**
 * Integer-paise conversion helpers to eliminate floating-point arithmetic errors.
 */
export function rupeesToPaise(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return 0;
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const match = /^(\d+)(?:\.(\d{1,2})\d*)?$/.exec(cleaned);
  if (!match) {
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.round(parsed * 100);
  }
  const whole = parseInt(match[1], 10);
  const frac = (match[2] || '').padEnd(2, '0');
  return whole * 100 + parseInt(frac, 10);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatINR(paise: number, showDecimals = false): string {
  const rupees = paise / 100;
  const hasRemainder = Math.abs(paise % 100) !== 0;
  const decimals = showDecimals || hasRemainder ? 2 : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(rupees);
}

export function sumSavingsTransactionsPaise(transactions: SavingsTransaction[]): number {
  let total = 0;
  for (const tx of transactions) {
    if (tx.type === 'deposit') {
      total += Math.round(tx.amountPaise);
    } else if (tx.type === 'withdraw') {
      total -= Math.round(tx.amountPaise);
    }
  }
  return Math.max(0, total);
}

export function getCurrentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getLastNMonthKeys(count = 6): { key: string; label: string }[] {
  const now = new Date();
  const list: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const label = new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' }).format(dt);
    list.push({ key: `${y}-${m}`, label });
  }
  return list;
}
