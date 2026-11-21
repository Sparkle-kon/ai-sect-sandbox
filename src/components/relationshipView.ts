import type { Cultivator, RelationshipEdge, WorldState } from '../types/world';

export const RELATION_NEIGHBORHOOD_LIMIT = 6;
export const RELATION_PAGE_SIZE = 8;
export type RelationDirection = 'outbound' | 'inbound' | 'self' | 'other';
export type RelationFilter = 'all' | 'outbound' | 'inbound' | 'reciprocal';
export interface RelationRecord {
  key: number;
  edge: RelationshipEdge;
  from?: Cultivator;
  to?: Cultivator;
  direction: RelationDirection;
  reciprocal: boolean;
}
export interface RelationPeer {
  actor: Cultivator;
  strongest: number;
  outbound: number;
  inbound: number;
}

const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const normalized = (text: string) => text.normalize('NFKC').trim().toLowerCase();
const compareRecords = (a: RelationRecord, b: RelationRecord) => Math.abs(b.edge.affinity) - Math.abs(a.edge.affinity)
  || lexical(a.edge.fromId, b.edge.fromId) || lexical(a.edge.toId, b.edge.toId) || lexical(a.edge.type, b.edge.type)
  || a.edge.affinity - b.edge.affinity || a.key - b.key;

/** A persisted directed record stays a record even if its reverse/missing endpoint also exists. */
export function buildRelationshipView(world: WorldState, selectedId: string | null) {
  const actors = new Map(world.cultivators.map((actor) => [actor.id, actor]));
  const selected = selectedId === null ? undefined : actors.get(selectedId);
  const adjacency = new Map<string, Set<string>>();
  for (const { fromId, toId } of world.relationships) {
    const targets = adjacency.get(fromId);
    if (targets) targets.add(toId);
    else adjacency.set(fromId, new Set([toId]));
  }

  const records: RelationRecord[] = world.relationships.map<RelationRecord>((edge, key) => {
    const direction = !selected ? 'other' : edge.fromId === selected.id
      ? edge.toId === selected.id ? 'self' : 'outbound'
      : edge.toId === selected.id ? 'inbound' : 'other';
    return { key, edge, from: actors.get(edge.fromId), to: actors.get(edge.toId), direction,
      reciprocal: edge.fromId !== edge.toId && Boolean(adjacency.get(edge.toId)?.has(edge.fromId)) };
  }).sort(compareRecords);
  const direct = records.filter(({ direction }) => direction !== 'other');
  const peers = new Map<string, RelationPeer>();
  for (const record of direct) {
    const actor = record.direction === 'outbound' ? record.to : record.direction === 'inbound' ? record.from : undefined;
    if (!actor) continue;
    const peer = peers.get(actor.id) ?? { actor, strongest: record.edge.affinity, outbound: 0, inbound: 0 };
    if (record.direction === 'outbound') peer.outbound++;
    else peer.inbound++;
    peers.set(actor.id, peer);
  }
  return {
    selected, records, direct, peerCount: peers.size,
    peers: [...peers.values()].sort((a, b) => Math.abs(b.strongest) - Math.abs(a.strongest) || lexical(a.actor.id, b.actor.id))
      .slice(0, RELATION_NEIGHBORHOOD_LIMIT),
  };
}

export function pageRelationshipRecords(records: readonly RelationRecord[], query: string, filter: RelationFilter, requestedPage: number) {
  const needle = normalized(query);
  const picked = records.filter((row) =>
    (filter === 'all' || (filter === 'reciprocal' ? row.reciprocal : row.direction === filter)) &&
    (!needle || normalized(`${row.from?.name ?? '失载修士'} ${row.to?.name ?? '失载修士'} ${row.edge.type} ${row.edge.affinity}`).includes(needle)));
  const pages = Math.max(1, Math.ceil(picked.length / RELATION_PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, Number.isSafeInteger(requestedPage) ? requestedPage : 0));
  return { rows: picked.slice(page * RELATION_PAGE_SIZE, (page + 1) * RELATION_PAGE_SIZE), page, pages, total: picked.length };
}
