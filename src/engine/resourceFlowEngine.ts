import type {
  ResourceFlowAccount, ResourceFlowDraft, ResourceFlowEntry, ResourceFlowMonth, ResourceFlowState,
  ResourceFlowTotal, ResourceFlowVisibility, WorldState,
} from '../types/world';

export const RESOURCE_FLOW_MONTH_LIMIT = 6;
export const RESOURCE_FLOW_DETAIL_LIMIT = 96;
export const RESOURCE_FLOW_REASON = /^[a-z][a-z0-9_]{0,39}$/;

export const createResourceFlowState = (): ResourceFlowState => ({ nextId: 1, months: [] });

export const flowActor = (id: string): ResourceFlowAccount => ({ kind: 'actor', id });
export const flowSeedLot = (id:string):ResourceFlowAccount => ({kind:'seed_lot',id});
export const flowSeedPlot = (id:string):ResourceFlowAccount => ({kind:'seed_plot',id});
export const flowSite = (id: string): ResourceFlowAccount => ({ kind: 'site', id });
export const flowSect = (id: string): ResourceFlowAccount => ({ kind: 'sect', id });
export const flowOrder = (id: string): ResourceFlowAccount => ({ kind: 'order', id });
export const flowShipment = (id: string): ResourceFlowAccount => ({ kind: 'shipment', id });
export const flowGranary = (id: string): ResourceFlowAccount => ({ kind: 'granary', id });
export const flowVillageFairStall = (fairId:string,orderId:string):ResourceFlowAccount =>
  ({kind:'village_fair',id:`${fairId}:${orderId}`});
export const flowVillageSupplyLeg = (agreementId: string, good: 'earth_root'|'stone'): ResourceFlowAccount =>
  ({ kind:'village_supply', id:`${agreementId}:${good}` });
export const flowSalvage = (id: string): ResourceFlowAccount => ({ kind: 'salvage', id });
export const flowWorkshop = (id: string): ResourceFlowAccount => ({ kind: 'workshop', id });
export const flowRelocation = (id: string): ResourceFlowAccount => ({ kind: 'relocation', id });
export const flowOath = (id: string, pocket: 'payment' | 'collateral'): ResourceFlowAccount => ({ kind: 'oath', id, pocket });

export function sameFlowAccount(a: ResourceFlowAccount, b: ResourceFlowAccount): boolean {
  return a.kind === b.kind && a.id === b.id && (a.kind !== 'oath' || b.kind === 'oath' && a.pocket === b.pocket);
}

export function openResourceFlowMonth(world: WorldState): ResourceFlowMonth {
  const { months } = world.resourceFlow;
  const previous = months.at(-1);
  if (previous?.tick === world.tick) return previous;
  const current: ResourceFlowMonth = {
    tick: world.tick, year: world.year, month: world.month, totalEntries: 0, totals: [], entries: [],
  };
  months.push(current);
  while (months[0].tick <= world.tick - RESOURCE_FLOW_MONTH_LIMIT || months.length > RESOURCE_FLOW_MONTH_LIMIT) {
    months.shift();
  }
  return current;
}

function addTotal(totals: ResourceFlowTotal[], row: ResourceFlowDraft): void {
  let bucket = totals.find(({ good }) => good === row.good);
  if (!bucket) {
    bucket = { good: row.good, transfer: 0, production: 0, consumption: 0, loss: 0 };
    totals.push(bucket);
  }
  bucket[row.kind] += row.amount;
}

function copyVisibility(visibility: ResourceFlowVisibility): ResourceFlowVisibility {
  if (visibility.kind === 'known_sites') return { kind: visibility.kind, siteIds: [...visibility.siteIds] };
  if (visibility.kind === 'participants') return { kind: visibility.kind, actorIds: [...visibility.actorIds] };
  return { kind: visibility.kind };
}

function validVisibility(visibility: ResourceFlowVisibility): boolean {
  if (visibility.kind === 'observer') return true;
  const ids = visibility.kind === 'known_sites' ? visibility.siteIds : visibility.actorIds;
  return ids.length >= 1 && ids.length <= 8 && ids.every(id => id.length > 0) && new Set(ids).size === ids.length;
}

/** Called beside a successful canonical mutation. This journal is not the inventory or the permission gate. */
export function recordResourceFlow(world: WorldState, draft: ResourceFlowDraft): void {
  if (!Number.isFinite(draft.amount) || draft.amount <= 0 || !RESOURCE_FLOW_REASON.test(draft.reason) ||
      !draft.refId || !validVisibility(draft.visibility) ||
      'from' in draft && !draft.from.id || 'to' in draft && !draft.to.id ||
      draft.kind === 'transfer' && sameFlowAccount(draft.from, draft.to)) return;
  const month = openResourceFlowMonth(world);
  const id = world.resourceFlow.nextId++;
  month.totalEntries += 1;
  addTotal(month.totals, draft);
  const metadata = { ...draft, id, tick: world.tick, visibility: copyVisibility(draft.visibility) };
  let entry: ResourceFlowEntry;
  if (draft.kind === 'transfer') entry = { ...metadata, kind: draft.kind, from: { ...draft.from }, to: { ...draft.to } };
  else if (draft.kind === 'production') entry = { ...metadata, kind: draft.kind, to: { ...draft.to } };
  else entry = { ...metadata, kind: draft.kind, from: { ...draft.from } };
  month.entries.push(entry);
  if (month.entries.length > RESOURCE_FLOW_DETAIL_LIMIT) month.entries.shift();
}

export function resourceFlowNet(total: ResourceFlowTotal): number {
  return total.production - total.consumption - total.loss;
}

export function resourceFlowAccountDelta(row: ResourceFlowDraft, account: ResourceFlowAccount): number {
  const debit = 'from' in row && sameFlowAccount(row.from, account) ? row.amount : 0;
  const credit = 'to' in row && sameFlowAccount(row.to, account) ? row.amount : 0;
  return credit - debit;
}

export type ResourceFlowViewScope =
  | { kind: 'observer' }
  | { kind: 'actor'; actorId?: string; visibleSiteIds: ReadonlySet<string> };
export interface ResourceFlowMonthView {
  tick: number;
  year: number;
  month: number;
  closed: boolean;
  rows: readonly ResourceFlowEntry[];
  totals: readonly ResourceFlowTotal[];
  omittedEntries?: number;
  partial: boolean;
}

function permits(row: ResourceFlowEntry, scope: ResourceFlowViewScope): boolean {
  if (scope.kind === 'observer') return true;
  if (row.visibility.kind === 'observer') return false;
  if (row.visibility.kind === 'known_sites') return row.visibility.siteIds.every(id => scope.visibleSiteIds.has(id));
  return Boolean(scope.actorId && row.visibility.actorIds.includes(scope.actorId));
}

/** Actor scope never projects a world-wide total or omission count from partly visible details. */
export function projectResourceFlowMonth(world: WorldState, tick: number,
  scope: ResourceFlowViewScope): ResourceFlowMonthView | undefined {
  const month = world.resourceFlow.months.find(row => row.tick === tick);
  if (!month || month.tick > world.tick) return undefined;
  const { year, month: calendarMonth } = month;
  const closed = tick < world.tick;
  if (scope.kind === 'observer') {
    const omittedEntries = month.totalEntries - month.entries.length;
    return {
      // Follow-up receipts are party records even when the observer is viewing world totals.
      tick, year, month: calendarMonth, closed, rows: month.entries.filter(row => row.mechanism !== 'care_followup'), totals: month.totals,
      omittedEntries, partial: omittedEntries > 0,
    };
  }
  // Preserve the durable receipt IDs in the observer journal; scoped IDs are local
  // ordinals so gaps in the global allocator do not disclose filtered movements.
  const rows = month.entries.filter(row => permits(row, scope)).map((row, index) => ({ ...row, id: index + 1 }));
  const totals: ResourceFlowTotal[] = [];
  for (const row of rows) addTotal(totals, row);
  return { tick, year, month: calendarMonth, closed, rows, totals, partial: true };
}
