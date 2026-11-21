import type { Artifact, Cultivator, LLMDecisionPayload, LocationNode, RelicExhibit, RelicExhibitCloseReason,
  RelicExhibitMove, RelicExhibitState, RelicFragment, Sect, WorldEvent, WorldState } from '../types/world';
import { isRetiredFromService } from './serviceRetirementEngine';

export const RELIC_EXHIBIT_OFFER_TICKS = 3;
export const RELIC_EXHIBIT_DURATION = 6;
export const RELIC_EXHIBIT_HISTORY = 48;
const MAX_OFFER_OPTIONS = 4;
const live = (actor: Cultivator): boolean => actor.alive && actor.hp > 0;

export type RelicExhibitOption =
  | { action: 'RELIC_EXHIBIT'; exhibitMove: 'offer'; targetArtifactId: string; targetRelicExhibitId?: never }
  | { action: 'RELIC_EXHIBIT'; exhibitMove: Exclude<RelicExhibitMove, 'offer'>; targetRelicExhibitId: string; targetArtifactId?: never };
type SourceKind = RelicFragment['source']['kind'];
export type RelicExhibitView =
  | { scope: 'public'; id: string; siteId: string; setId: RelicExhibit['setId']; acceptedTick: number; expiresTick: number; sourceKinds: SourceKind[] }
  | (Omit<RelicExhibit, 'custody' | 'hostLeaderId'> & { scope: 'participant'; sourceKinds: SourceKind[] });

export const createRelicExhibitState = (): RelicExhibitState => ({ entries: [], nextId: 1 });
const person = (world: WorldState, id: string): Cultivator | undefined => world.cultivators.find((actor) => actor.id === id);
const actorLive = (actor: Cultivator | undefined): actor is Cultivator => actor !== undefined && live(actor);

function availableOnFoot(world: WorldState, actor: Cultivator): boolean {
  return live(actor) && actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon' &&
    !world.couriers.dispatches.some((row) => row.courierId === actor.id &&
      (row.status === 'in_transit' || row.status === 'returning' || row.lastAdvancedTick === world.tick)) &&
    !world.pilgrimages.journeys.some((row) => row.status === 'active' &&
      (row.organizerId === actor.id || row.companionId === actor.id) && (row.path.length > 0 || row.lastMovedTick === world.tick)) &&
    !world.escorts.contracts.some((row) => row.status === 'active' && row.escortId === actor.id) &&
    !world.relocations.plans.some((row) => row.status === 'in_transit' && row.garrisonIds.includes(actor.id)) &&
    !world.sieges.some((row) => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(actor.id));
}

function pavilionAt(world: WorldState, siteId: string): { sect: Sect; site: LocationNode; leader: Cultivator } | undefined {
  const site = world.locations.find(({ id }) => id === siteId);
  if (!site || site.type === 'secret_realm' || !site.ownerSectId) return undefined;
  const sect = world.sects.find(({ id }) => id === site.ownerSectId);
  if (!sect || sect.headquartersId !== site.id || sect.facilities.scripture_pavilion < 1 ||
      world.sieges.some((row) => row.status === 'sieging' && row.destinationId === site.id)) return undefined;
  const leader = sect.leaderId ? person(world, sect.leaderId) : undefined;
  return actorLive(leader) && leader.sectId === sect.id && !isRetiredFromService(leader) ? { sect, site, leader } : undefined;
}

function officialHost(world: WorldState, exhibit: RelicExhibit): Cultivator | undefined {
  const hall = pavilionAt(world, exhibit.siteId);
  return hall?.sect.id === exhibit.hostSectId && hall.leader.id === exhibit.hostLeaderId ? hall.leader : undefined;
}

function exhibitProof(world: WorldState, item?: Artifact): [RelicFragment, RelicFragment] | undefined {
  const [frameId, coreId] = item?.relicFragmentIds ?? [];
  if (!item?.id || !item.relicSetId || item.relicFragmentIds?.length !== 2 || !frameId || !coreId || frameId === coreId) return undefined;
  const matches = world.relics.fragments.filter((fragment) => fragment.holder.kind === 'consumed' && fragment.holder.id === item.id);
  if (matches.length !== 2) return undefined;
  const frame = matches.find((fragment) => fragment.id === frameId && fragment.slot === 'frame');
  const core = matches.find((fragment) => fragment.id === coreId && fragment.slot === 'core');
  return frame && core && [frame, core].every(({ setId, source }) => setId === item.relicSetId && source.tick <= world.tick) ?
    [frame, core] : undefined;
}

function ownerItem(world: WorldState, actor: Cultivator, exhibit: RelicExhibit): Artifact | undefined {
  const item = actor.artifacts.find(({ id }) => id === exhibit.artifactId);
  return item?.relicSetId === exhibit.setId && (!item.boundTo || item.boundTo === actor.id) && exhibitProof(world, item) ? item : undefined;
}

function usableContract(world: WorldState, exhibit: RelicExhibit): boolean {
  const owner = person(world, exhibit.ownerId);
  if (!actorLive(owner) || !officialHost(world, exhibit) || exhibit.offeredTick > world.tick) return false;
  if (exhibit.status === 'offered') return exhibit.offerExpiresTick > world.tick && !!ownerItem(world, owner, exhibit);
  return exhibit.status === 'on_display' && (exhibit.acceptedTick ?? Infinity) <= world.tick &&
    (exhibit.expiresTick ?? 0) > world.tick && !!exhibit.custody;
}

export function availableRelicExhibitActions(actor: Cultivator, world: WorldState, includeOffers = true): RelicExhibitOption[] {
  if (!availableOnFoot(world, actor) || !world.cultivators.includes(actor)) return [];
  const rows = world.relicExhibits.entries;
  const options: RelicExhibitOption[] = [];
  for (const row of rows) {
    const owner = row.ownerId === actor.id;
    const host = row.hostLeaderId === actor.id;
    if ((!owner && !host) || !usableContract(world, row)) continue;
    const add = (exhibitMove: Exclude<RelicExhibitMove, 'offer'>) =>
      options.push({ action: 'RELIC_EXHIBIT', exhibitMove, targetRelicExhibitId: row.id });
    if (owner) { add('recall'); continue; }
    if (actor.locationId !== row.siteId) continue;
    if (row.status === 'on_display') add('close');
    else {
      add('decline');
      const lender = person(world, row.ownerId)!;
      if (lender.locationId === row.siteId && availableOnFoot(world, lender) &&
          !rows.some((other) => other.id !== row.id && other.status === 'on_display' && other.siteId === row.siteId)) add('accept');
    }
  }
  if (!includeOffers || !actor.artifacts.some((item) => item.relicSetId)) return options;
  const hall = pavilionAt(world, actor.locationId);
  if (!hall || hall.leader.id === actor.id || hall.leader.locationId !== actor.locationId || !availableOnFoot(world, hall.leader) ||
      rows.some((row) => row.status !== 'closed' && row.siteId === hall.site.id)) return options;
  const allocated = new Set(rows.filter((row) => row.status !== 'closed').map(({ artifactId }) => artifactId));
  const candidates = actor.artifacts.filter((item): item is Artifact & { id: string } => !!item.id && !!item.relicSetId &&
      (!item.boundTo || item.boundTo === actor.id) && !allocated.has(item.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const item of candidates) {
    if (exhibitProof(world, item)) options.push({ action: 'RELIC_EXHIBIT', exhibitMove: 'offer', targetArtifactId: item.id });
    if (options.filter(({ exhibitMove }) => exhibitMove === 'offer').length >= MAX_OFFER_OPTIONS) break;
  }
  return options;
}

function event(world: WorldState, exhibit: RelicExhibit, verb: string, title: string, description: string): WorldEvent {
  return { id: `evt-${world.tick}-${exhibit.id}-${verb}`, tick: world.tick, year: world.year, month: world.month,
    title, description, actorIds: [exhibit.ownerId, exhibit.hostLeaderId], category: 'diplomacy', witnessScope: 'participants',
    ...(world.locations.some(({ id }) => id === exhibit.siteId) ? { locationId: exhibit.siteId } : {}) };
}

function close(world: WorldState, exhibit: RelicExhibit, reason: RelicExhibitCloseReason): WorldEvent | undefined {
  if (exhibit.status === 'closed') return undefined;
  const item = exhibit.custody;
  const lender = item ? person(world, exhibit.ownerId) : undefined;
  // Retain the sole physical object if an invalid in-memory state has lost the lender, rather than erase it.
  if (item && !lender) return undefined;
  if (item && lender) {
    if (lender.artifacts.some(({ id }) => id === item.id)) return undefined;
    delete exhibit.custody;
    if (item.boundTo === lender.id && lender.artifacts.some(({ boundTo }) => boundTo === lender.id)) delete item.boundTo;
    lender.artifacts.push(item); // Death uses this real corpse ledger before regular probate runs.
  }
  exhibit.status = 'closed';
  exhibit.closedTick = world.tick;
  exhibit.closeReason = reason;
  return event(world, exhibit, reason, item ? '古器撤展交还' : '古器借展未成',
    !item ? '借展未成立，馆方未接收实物。' :
      reason === 'owner_died' ? '撤下唯一实物并交回身后财物账，继承另按实物遗产裁定。' : '撤下唯一实物并交还原物主，未改变器物磨损。');
}

export function resolveRelicExhibitAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'RELIC_EXHIBIT') return null;
  const option = availableRelicExhibitActions(actor, world, decision.exhibitMove === 'offer').find((row) =>
    row.exhibitMove === decision.exhibitMove && row.targetArtifactId === decision.targetArtifactId &&
    row.targetRelicExhibitId === decision.targetRelicExhibitId);
  if (!option) return null;
  const ledger = world.relicExhibits;
  if (option.exhibitMove === 'offer') {
    const hall = pavilionAt(world, actor.locationId)!;
    const item = actor.artifacts.find(({ id }) => id === option.targetArtifactId)!;
    const exhibit: RelicExhibit = { id: `exhibit-${ledger.nextId++}`, artifactId: option.targetArtifactId, setId: item.relicSetId!,
      ownerId: actor.id, hostSectId: hall.sect.id, hostLeaderId: hall.leader.id, siteId: hall.site.id, status: 'offered',
      offeredTick: world.tick, offerExpiresTick: world.tick + RELIC_EXHIBIT_OFFER_TICKS };
    ledger.entries.push(exhibit);
    return event(world, exhibit, 'offer', '古器限期借展邀约', '馆方尚未接收实物，物主仍可收回邀约。');
  }
  const exhibit = ledger.entries.find(({ id }) => id === option.targetRelicExhibitId)!;
  if (option.exhibitMove === 'accept') {
    const lender = person(world, exhibit.ownerId)!;
    const index = lender.artifacts.findIndex(({ id }) => id === exhibit.artifactId);
    if (index < 0) return null;
    const [object] = lender.artifacts.splice(index, 1);
    exhibit.custody = object;
    exhibit.status = 'on_display';
    exhibit.acceptedTick = world.tick;
    exhibit.expiresTick = world.tick + RELIC_EXHIBIT_DURATION;
    return event(world, exhibit, 'display', '古器原物入馆', '双边同意，原物离开物主的储物戒，由场馆限期保管。');
  }
  return close(world, exhibit, option.exhibitMove === 'decline' ? 'declined' : option.exhibitMove === 'close' ? 'host_closed' :
    exhibit.status === 'offered' ? 'withdrawn' : 'recalled') ?? null;
}

export function advanceRelicExhibits(world: WorldState): WorldEvent[] {
  const ledger = world.relicExhibits;
  if (!ledger.entries.length) return [];
  const events: WorldEvent[] = [];
  for (const exhibit of ledger.entries) {
    if (exhibit.status === 'closed') continue;
    const lender = person(world, exhibit.ownerId);
    let reason: RelicExhibitCloseReason | undefined;
    if (lender && !actorLive(lender)) reason = 'owner_died';
    else if (!officialHost(world, exhibit)) reason = 'host_breach';
    else if (exhibit.status === 'offered') {
      if (world.tick >= exhibit.offerExpiresTick) reason = 'offer_expired';
      else if (!lender || !ownerItem(world, lender, exhibit)) reason = 'item_unavailable';
    } else if (world.tick >= (exhibit.expiresTick ?? Infinity)) reason = 'term_complete';
    if (reason) {
      const receipt = close(world, exhibit, reason);
      if (receipt) events.push(receipt);
    }
  }
  const closed = new Set(ledger.entries.filter((row) => row.status === 'closed')
    .sort((a, b) => (a.closedTick ?? 0) - (b.closedTick ?? 0)).slice(-RELIC_EXHIBIT_HISTORY));
  ledger.entries = ledger.entries.filter((row) => row.status !== 'closed' || closed.has(row));
  return events;
}

function sourceKinds(world: WorldState, exhibit: RelicExhibit): SourceKind[] {
  return [...new Set(world.relics.fragments.filter((fragment) => fragment.setId === exhibit.setId && fragment.source.tick <= world.tick &&
    fragment.holder.kind === 'consumed' && fragment.holder.id === exhibit.artifactId).map(({ source }) => source.kind))].sort();
}

export function visibleRelicExhibits(world: WorldState, viewer?: Cultivator): RelicExhibitView[] {
  if (!viewer || !world.relicExhibits.entries.length) return [];
  const actor = person(world, viewer.id);
  if (!actor) return [];
  const onFoot = availableOnFoot(world, actor);
  const view: RelicExhibitView[] = [];
  for (const row of world.relicExhibits.entries) {
    if (row.offeredTick > world.tick) continue;
    if (row.ownerId === actor.id || row.hostLeaderId === actor.id) {
      const { custody: _private, hostLeaderId: _hostId, ...receipt } = row;
      view.push({ ...receipt, scope: 'participant', sourceKinds: sourceKinds(world, row) });
    } else if (onFoot && actor.locationId === row.siteId && row.status === 'on_display' &&
        row.acceptedTick !== undefined && row.expiresTick !== undefined && usableContract(world, row)) {
      view.push({ scope: 'public', id: row.id, siteId: row.siteId, setId: row.setId, acceptedTick: row.acceptedTick,
        expiresTick: row.expiresTick, sourceKinds: sourceKinds(world, row) });
    }
  }
  return view;
}
