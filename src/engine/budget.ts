import type { Expense, ExpenseCategory, Trip } from '../lib/types';
import { addDays, parseISO } from './flexDates';

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string }[] = [
  { id: 'flights', label: 'Flights' },
  { id: 'hotels', label: 'Hotels' },
  { id: 'food', label: 'Food' },
  { id: 'transportation', label: 'Transportation' },
  { id: 'attractions', label: 'Attractions' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'misc', label: 'Miscellaneous' },
];

export interface BudgetSummary {
  byCategory: Record<ExpenseCategory, { estimated: number; actual: number; points: number }>;
  estimatedTotal: number;
  actualTotal: number;
  pointsUsed: number;
  remainingBudget: number;
  remainingPoints: number;
  tripDays: number;
  daysLeft: number;
  dailyAllowance: number | null;
  overBudget: boolean;
}

export function tripDays(trip: Pick<Trip, 'startDate' | 'endDate'>): number {
  if (!trip.startDate || !trip.endDate) return 0;
  return Math.max(1, Math.round((parseISO(trip.endDate).getTime() - parseISO(trip.startDate).getTime()) / 86400000) + 1);
}

export function tripDateList(trip: Pick<Trip, 'startDate' | 'endDate'>): string[] {
  const n = tripDays(trip);
  return Array.from({ length: Math.min(n, 60) }, (_, i) => addDays(trip.startDate, i));
}

/**
 * Totals are in the trip's home currency (each expense stores its converted amount).
 * Remaining points = current profile balance minus ACTUAL points recorded on this trip
 * (assumes the balance in Settings hasn't already been reduced for them — the UI says so).
 */
export function summarizeBudget(trip: Trip, expenses: Expense[], balance: number, today: string): BudgetSummary {
  const byCategory = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.id, { estimated: 0, actual: 0, points: 0 }])) as BudgetSummary['byCategory'];
  let est = 0;
  let act = 0;
  let pts = 0;
  for (const e of expenses) {
    const row = byCategory[e.category] ?? byCategory.misc;
    if (e.kind === 'estimated') { row.estimated += e.amountHome; est += e.amountHome; }
    else { row.actual += e.amountHome; act += e.amountHome; row.points += e.pointsUsed; pts += e.pointsUsed; }
  }
  const days = tripDays(trip);
  let daysLeft = days;
  if (trip.startDate && trip.endDate) {
    if (today > trip.endDate) daysLeft = 0;
    else if (today >= trip.startDate) daysLeft = Math.round((parseISO(trip.endDate).getTime() - parseISO(today).getTime()) / 86400000) + 1;
  }
  const remainingBudget = trip.cashBudget - act;
  return {
    byCategory,
    estimatedTotal: est,
    actualTotal: act,
    pointsUsed: pts,
    remainingBudget,
    remainingPoints: balance - pts,
    tripDays: days,
    daysLeft,
    dailyAllowance: daysLeft > 0 ? remainingBudget / daysLeft : null,
    overBudget: remainingBudget < 0,
  };
}
