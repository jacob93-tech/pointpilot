import { minToHHMM } from './optimize';

export interface SchedIn {
  id: string;
  durationMin: number;
  locked: boolean;
  fixedStartMin?: number;
  openMin?: number;
  closeMin?: number;
  /** travel minutes from the previous stop; null = unknown (never guessed) */
  travelMin: number | null;
}

export interface SchedOut {
  id: string;
  startMin: number;
  endMin: number;
  travelMin: number | null;
  issues: string[];
}

/** Lay out a day's items in their current order. Unknown travel time counts as 0 and is flagged by the caller. */
export function scheduleItems(items: SchedIn[], dayStartMin: number, dayEndMin: number): SchedOut[] {
  let t = dayStartMin;
  const out: SchedOut[] = [];
  for (const it of items) {
    const issues: string[] = [];
    const arrive = t + (it.travelMin ?? 0);
    let start = arrive;
    if (it.locked && it.fixedStartMin != null) {
      if (arrive > it.fixedStartMin + 5) issues.push(`Can't make the fixed ${minToHHMM(it.fixedStartMin)} start (arrive ~${minToHHMM(arrive)})`);
      start = it.fixedStartMin;
    } else if (it.openMin != null && start < it.openMin) start = it.openMin;
    if (it.closeMin != null && start + it.durationMin > it.closeMin) issues.push(`Closes at ${minToHHMM(it.closeMin)}`);
    if (it.openMin != null && start < it.openMin) issues.push(`Opens at ${minToHHMM(it.openMin)}`);
    const end = start + it.durationMin;
    if (end > dayEndMin) issues.push(`Ends after your ${minToHHMM(dayEndMin)} day end`);
    out.push({ id: it.id, startMin: start, endMin: end, travelMin: it.travelMin, issues });
    t = end;
  }
  return out;
}
