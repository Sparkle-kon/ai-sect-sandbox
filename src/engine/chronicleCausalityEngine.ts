import type { CausalChronicleKind, CausalChronicleNode, CausalChronicleOutcome, CausalChroniclePredecessor,
  CausalChronicleRelation, CausalChronicleState, WorldEvent, WorldState } from '../types/world';
import { canFocusChronicleSite } from './chronicleFocusEngine';

export const CAUSAL_CHRONICLE_MAX_NODES = 256;
export const CAUSAL_CHRONICLE_MAX_PREDECESSORS = 8;
const MAX_VIEW_DEPTH = 3;
const MAX_VIEW_ROWS = 24;

export interface CausalChronicleNodeInput {
  kind: CausalChronicleKind;
  entityId: string;
  predecessors?: readonly CausalChroniclePredecessor[];
  outcome?: CausalChronicleOutcome;
}
export type CausalChronicleFactView = Pick<CausalChronicleNode, 'eventId' | 'tick' | 'kind' | 'outcome'>;
export interface CausalChronicleView {
  entry: CausalChronicleFactView;
  previous: Array<{ relation: CausalChronicleRelation; node: CausalChronicleView }>;
}

export const createCausalChronicleState = (): CausalChronicleState => ({ nodes: [], nextSequence: 1 });

export function isCausalChronicleTerminal(kind: CausalChronicleKind): boolean {
  return kind === 'truce_signed' || kind === 'sect_election' || kind === 'market_settlement';
}

export function causalChronicleOutcomeCompatible(kind: CausalChronicleKind, outcome?: CausalChronicleOutcome): boolean {
  switch (kind) {
    case 'truce_signed': return outcome === 'truce_with_withdrawal' || outcome === 'truce_signed';
    case 'sect_election': return outcome === 'elected';
    case 'market_settlement': return outcome === 'local_fill' || outcome === 'delivered' || outcome === 'route_loss' ||
      outcome === 'escort_failed' || outcome === 'endpoint_missing' || outcome === 'market_closed';
    default: return outcome === undefined;
  }
}

/** Relation encodes source role. Equal-tick fact links still have a real earlier producer order. */
export function causalPredecessorCompatible(node: CausalChronicleNode, parent: CausalChronicleNode,
  relation: CausalChronicleRelation): boolean {
  if (node.eventId === parent.eventId || parent.sequence >= node.sequence || parent.tick > node.tick) return false;
  switch (relation) {
    case 'withdrew_siege': return node.kind === 'truce_signed' && node.outcome === 'truce_with_withdrawal' && parent.kind === 'siege_launched';
    case 'filled_vacancy': return node.kind === 'sect_election' && parent.kind === 'sect_vacancy' && parent.entityId === node.entityId;
    case 'matched_buy_order': return (node.kind === 'market_shipment' || (node.kind === 'market_settlement' && node.outcome === 'local_fill')) &&
      parent.kind === 'market_buy_order';
    case 'matched_sell_order': return (node.kind === 'market_shipment' || (node.kind === 'market_settlement' && node.outcome === 'local_fill')) &&
      parent.kind === 'market_sell_order';
    case 'settled_shipment': return node.kind === 'market_settlement' && node.outcome !== 'local_fill' && parent.kind === 'market_shipment' &&
      parent.entityId === node.entityId && parent.tick < node.tick;
    default: return false;
  }
}

function publicRow(event: WorldEvent, tick: number): boolean {
  return !!event.id && !event.id.startsWith('evt-sealed-dispatch-') && event.witnessScope !== 'participants' &&
    event.category === 'diplomacy' && Number.isSafeInteger(event.tick) && event.tick >= 0 && event.tick <= tick;
}

/** Raw feed may later refute a retained breadcrumb; absence caused by trimming is not evidence of secrecy. */
function refuted(world: WorldState, eventId: string, tick: number, locationId?: string, current?: WorldEvent): boolean {
  let matches = 0;
  for (const row of world.events) {
    if (row.id !== eventId) continue;
    if (++matches > 1 || !publicRow(row, world.tick) || row.tick !== tick || row.locationId !== locationId ||
        (current && row !== current)) return true;
  }
  return false;
}

export function causalChronicleEventId(world: WorldState, kind: CausalChronicleKind, entityId: string): string | undefined {
  const { nodes } = world.chronicleCausality;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const row = nodes[i];
    if (row.kind === kind && row.entityId === entityId && row.tick <= world.tick &&
        !refuted(world, row.eventId, row.tick, row.locationId)) return row.eventId;
  }
  return undefined;
}

/** Producer hook. It never reconstructs a relationship from a title, generated prose, or current identity. */
export function recordCausalChronicleNode(world: WorldState, event: WorldEvent, input: CausalChronicleNodeInput): void {
  if (!event || event.tick !== world.tick || !publicRow(event, world.tick) || !input.entityId ||
      !causalChronicleOutcomeCompatible(input.kind, input.outcome) ||
      refuted(world, event.id, event.tick, event.locationId, event)) return;
  const state = world.chronicleCausality;
  if (state.nodes.some(({ eventId }) => eventId === event.id)) return;
  const node: CausalChronicleNode = {
    eventId: event.id, tick: event.tick, sequence: state.nextSequence, kind: input.kind, entityId: input.entityId,
    ...(event.locationId ? { locationId: event.locationId } : {}), predecessors: [],
    ...(input.outcome ? { outcome: input.outcome } : {}),
  };
  const matched = new Set<string>();
  const relations = new Set<CausalChronicleRelation>();
  for (const next of input.predecessors ?? []) {
    if (node.predecessors.length >= CAUSAL_CHRONICLE_MAX_PREDECESSORS) break;
    if (matched.has(next.eventId) || (next.relation !== 'withdrew_siege' && relations.has(next.relation))) continue;
    const parent = state.nodes.find(({ eventId }) => eventId === next.eventId);
    if (!parent || !causalPredecessorCompatible(node, parent, next.relation) ||
        refuted(world, parent.eventId, parent.tick, parent.locationId)) continue;
    matched.add(parent.eventId);
    relations.add(next.relation);
    node.predecessors.push({ eventId: parent.eventId, relation: next.relation });
  }
  state.nextSequence++;
  state.nodes.push(node);
  if (state.nodes.length > CAUSAL_CHRONICLE_MAX_NODES) advanceCausalChronicle(world);
}

export function advanceCausalChronicle(world: WorldState): void {
  const state = world.chronicleCausality;
  if (state.nodes.length <= CAUSAL_CHRONICLE_MAX_NODES) return;
  const openOrders = new Set(world.markets.orders.filter(({ status }) => status === 'open').map(({ id }) => id));
  const traveling = new Set(world.markets.shipments.filter(({ status }) => status === 'in_transit').map(({ id }) => id));
  const sieges = new Set(world.sieges.filter(({ status }) => status === 'marching' || status === 'sieging').map(({ id }) => id));
  const vacancies = new Set(world.sects.flatMap(({ officeVacancy }) => officeVacancy ? [officeVacancy.eventId] : []));
  const active = (row: CausalChronicleNode) => row.kind === 'market_buy_order' || row.kind === 'market_sell_order' ?
    openOrders.has(row.entityId) : row.kind === 'market_shipment' ? traveling.has(row.entityId) :
      row.kind === 'siege_launched' ? sieges.has(row.entityId) : row.kind === 'sect_vacancy' && vacancies.has(row.eventId);
  const rows = new Map(state.nodes.map((node) => [node.eventId, node]));
  const keep = new Set<string>();
  function pin(node: CausalChronicleNode) {
    if (keep.size >= CAUSAL_CHRONICLE_MAX_NODES || keep.has(node.eventId)) return;
    keep.add(node.eventId);
    for (const edge of node.predecessors) {
      const parent = rows.get(edge.eventId);
      if (parent && causalPredecessorCompatible(node, parent, edge.relation)) pin(parent);
    }
  }
  const ordered = state.nodes.slice().sort((a, b) => b.sequence - a.sequence);
  // Reserve all active roots before ancestors, so a pathological old chain cannot evict another active root.
  for (const row of ordered) if (active(row) && keep.size < CAUSAL_CHRONICLE_MAX_NODES) keep.add(row.eventId);
  for (const row of ordered) if (active(row) && keep.has(row.eventId)) {
    for (const edge of row.predecessors) {
      const parent = rows.get(edge.eventId);
      if (parent && causalPredecessorCompatible(row, parent, edge.relation)) pin(parent);
    }
  }
  for (const row of ordered) {
    if (keep.size >= CAUSAL_CHRONICLE_MAX_NODES) break;
    pin(row);
  }
  state.nodes = state.nodes.filter(({ eventId }) => keep.has(eventId)).map((node) => {
    const predecessors = node.predecessors.filter(({ eventId }) => keep.has(eventId));
    return predecessors.length === node.predecessors.length ? node : { ...node, predecessors };
  });
}

function scopedChainBuilder(world: WorldState, viewerId: string) {
  const nodes = new Map(world.chronicleCausality.nodes.map((row) => [row.eventId, row]));
  const observed = new Map<string, boolean>();
  const publicNode = new Map<string, boolean>();
  function permitted(row: CausalChronicleNode): boolean {
    if (!row.locationId || row.tick > world.tick) return false;
    if (!observed.has(row.locationId)) observed.set(row.locationId, canFocusChronicleSite(world, row.locationId, viewerId));
    if (!observed.get(row.locationId)) return false;
    if (!publicNode.has(row.eventId)) publicNode.set(row.eventId, !refuted(world, row.eventId, row.tick, row.locationId));
    return publicNode.get(row.eventId) === true;
  }
  function chain(id: string, depth = 0): CausalChronicleView | undefined {
    const row = nodes.get(id);
    if (!row || !permitted(row)) return undefined;
    const previous: CausalChronicleView['previous'] = [];
    if (depth < MAX_VIEW_DEPTH) {
      for (const edge of row.predecessors.slice(0, CAUSAL_CHRONICLE_MAX_PREDECESSORS)) {
        const parent = nodes.get(edge.eventId);
        if (!parent || !causalPredecessorCompatible(row, parent, edge.relation)) continue;
        const child = chain(parent.eventId, depth + 1);
        if (child) previous.push({ relation: edge.relation, node: child });
      }
    }
    return { entry: { eventId: row.eventId, tick: row.tick, kind: row.kind, ...(row.outcome ? { outcome: row.outcome } : {}) }, previous };
  }
  return chain;
}

export function buildCausalChronicleChain(world: WorldState, eventId: string, viewerId?: string | null): CausalChronicleView | undefined {
  if (!viewerId || !world.chronicleCausality.nodes.length) return undefined;
  return scopedChainBuilder(world, viewerId)(eventId);
}

export function visibleCausalChronicle(world: WorldState, viewerId?: string | null, limit = 12): CausalChronicleView[] {
  if (!viewerId || !world.chronicleCausality.nodes.length || !Number.isSafeInteger(limit) || limit <= 0) return [];
  const cap = Math.min(limit, MAX_VIEW_ROWS);
  const chain = scopedChainBuilder(world, viewerId);
  const output: CausalChronicleView[] = [];
  const { nodes } = world.chronicleCausality;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const row = nodes[i];
    if (!isCausalChronicleTerminal(row.kind)) continue;
    const visible = chain(row.eventId);
    if (visible) output.push(visible);
    if (output.length >= cap) break;
  }
  return output;
}
