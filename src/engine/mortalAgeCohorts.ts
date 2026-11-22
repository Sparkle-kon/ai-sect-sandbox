import type { HouseholdPresence, MortalAgeCohort } from '../types/world';

/** A world rule for known, anonymous mortal birth cohorts. Baseline ages are never guessed. */
export const MORTAL_OLD_AGE_YEARS = 72;
export const MORTAL_OLD_AGE_TICKS = MORTAL_OLD_AGE_YEARS * 12;

export function creditAdultAge(row: HouseholdPresence, cohort: MortalAgeCohort): void {
  const list = (row.adultAgeCohorts ??= []);
  const existing = list.find(item => item.bornTick === cohort.bornTick);
  if (existing) existing.count += cohort.count;
  else list.push({ ...cohort });
  list.sort((a,b) => a.bornTick-b.bornTick);
}
export function unknownAdultCount(row: HouseholdPresence): number {
  return row.adults - (row.adultAgeCohorts ?? []).reduce((sum,item) => sum + item.count,0);
}
/** General disasters/migration draw untracked adults first and then the oldest available dated slices. */
export function debitAdultAge(row: HouseholdPresence, count: number, priorityBirth?: number): MortalAgeCohort[] {
  const list = row.adultAgeCohorts;
  if (!list?.length || count <= 0) return [];
  const result: MortalAgeCohort[] = [];
  let left = count;
  const withdraw = (item: MortalAgeCohort) => {
    const taken = Math.min(item.count,left);
    if (taken <= 0) return;
    left -= taken;
    item.count -= taken;
    result.push({ bornTick:item.bornTick, count:taken });
  };
  if (priorityBirth !== undefined) {
    const found = list.find(item => item.bornTick === priorityBirth);
    if (found) withdraw(found);
  }
  // Existing total still contains the priority debit; it must not turn into a false unknown.
  const priority = result.reduce((sum,item) => sum + item.count,0);
  left = Math.max(0,left - Math.max(0,unknownAdultCount(row) - priority));
  for (const item of list) if (left > 0) withdraw(item);
  row.adultAgeCohorts = list.filter(item => item.count > 0);
  if (!row.adultAgeCohorts.length) delete row.adultAgeCohorts;
  return result;
}
