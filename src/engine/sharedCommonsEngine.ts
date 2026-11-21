import type { CommonsCloseReason, CommonsMove, CommonsParty, CommonsQuotaRound, Cultivator, HerbId, LLMDecisionPayload, LocationNode, Sect,
  SharedCommonsPact, SharedCommonsState, WorldEvent, WorldState } from '../types/world';
import { knownMapLocations } from './terrainEngine';
import { isRetiredFromService } from './serviceRetirementEngine';

export const COMMONS_OFFER_TICKS = 4;
export const COMMONS_TERM_TICKS = 12;
export const COMMONS_ROUND_TICKS = 3;
export const COMMONS_MAINTENANCE_UNIT = 3;
export const COMMONS_MAX_RESERVE = 8;
export const COMMONS_CLOSED_HISTORY = 32;
const MAX_GATHER = 2;
const MAX_FORM_OPTIONS = 12;
const HERBS: readonly HerbId[] = ['jade_leaf', 'earth_root', 'star_bloom', 'shadow_moss'];
export interface SharedCommonsOption {
  action: 'SHARED_COMMONS';
  commonsMove: CommonsMove;
  targetCommonsId?: string;
  targetLocationId?: string;
  targetHerbId?: HerbId;
  targetSectId?: string;
  targetCommonsThirdSectId?: string;
}
export const createSharedCommonsState = (): SharedCommonsState => ({ pacts: [], nextId: 1 });
const live = (actor: Cultivator | undefined): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const findSite = (world: WorldState, siteId: string) => world.locations.find(({ id }) => id === siteId);
const findActor = (world: WorldState, id: string | undefined) => world.cultivators.find((actor) => actor.id === id);
const findSect = (world: WorldState, id: string) => world.sects.find((sect) => sect.id === id);
const transit = (world: WorldState, sect: Sect) => world.relocations.plans.find((row) => row.sectId === sect.id && row.status === 'in_transit');
const offerLive = (world: WorldState, pact: SharedCommonsPact) =>
  pact.status === 'offered' && pact.openedTick <= world.tick && pact.offerExpiresTick > world.tick;
const stageLive = (world: WorldState, pact: SharedCommonsPact) =>
  pact.status === 'active' && (pact.startsTick ?? Infinity) <= world.tick && (pact.endsTick ?? 0) > world.tick;
const atWar = (world: WorldState, a: string, b: string) => world.diplomacy.some((row) => row.pact === 'war' &&
  ((row.sectAId === a && row.sectBId === b) || (row.sectAId === b && row.sectBId === a)));

function validCommonsSite(world: WorldState, site: LocationNode | undefined, herb: HerbId): site is LocationNode {
  return Boolean(site && !site.ownerSectId && (site.type === 'market' || site.type === 'spirit_vein') && site.herbCapacity[herb] > 0 &&
    !world.sects.some(({ headquartersId }) => headquartersId === site.id));
}

function physicallyHere(world: WorldState, actor: Cultivator, siteId: string): boolean {
  return actor.locationId === siteId &&
    !world.pilgrimages.journeys.some((row) => row.status === 'active' && row.path.length && (row.organizerId === actor.id || row.companionId === actor.id)) &&
    !world.escorts.contracts.some((row) => row.status === 'active' && row.escortId === actor.id) &&
    !world.couriers.dispatches.some((row) => (row.status === 'in_transit' || row.status === 'returning') && row.courierId === actor.id) &&
    !world.relocations.plans.some((row) => row.status === 'in_transit' && row.garrisonIds.includes(actor.id));
}

function currentSigner(actor: Cultivator | undefined, sect: Sect | undefined): actor is Cultivator {
  return live(actor) && !!sect && sect.leaderId === actor.id && actor.sectId === sect.id && actor.sectRank === '掌门' &&
    !isRetiredFromService(actor);
}

function canSign(world: WorldState, actor: Cultivator, sect: Sect, site: LocationNode): boolean {
  const headquarters = findSite(world, sect.headquartersId);
  return (physicallyHere(world, actor, site.id) || (headquarters?.ownerSectId === sect.id && physicallyHere(world, actor, headquarters.id))) &&
    !transit(world, sect) && !world.sieges.some((row) => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(actor.id)) &&
    !world.occasions.some((row) => (row.status === 'registration' || row.status === 'running') && row.participantIds.includes(actor.id)) &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon' &&
    knownMapLocations(world, actor).includes(site);
}

function occupied(world: WorldState, siteId: string): boolean {
  return world.sharedCommons.pacts.some((row) => row.siteId === siteId && (offerLive(world, row) ||
    (row.status === 'active' && (row.endsTick ?? 0) > world.tick)));
}

export function availableSharedCommonsActions(actor: Cultivator, world: WorldState, includeOffers = true): SharedCommonsOption[] {
  const sect = findSect(world, actor.sectId);
  if (!sect || !currentSigner(actor, sect)) return [];
  const options: SharedCommonsOption[] = [];
  for (const pact of world.sharedCommons.pacts) {
    if (!offerLive(world, pact)) continue;
    const own = pact.parties.find((row) => row.sectId === sect.id && row.signerId === actor.id && row.signedTick === undefined);
    if (!own) continue;
    const site = findSite(world, pact.siteId);
    if (!validCommonsSite(world, site, pact.herbId) || !canSign(world, actor, sect, site)) continue;
    options.push({ action: 'SHARED_COMMONS', commonsMove: 'decline', targetCommonsId: pact.id });
    if (pact.parties.every((row) => currentSigner(findActor(world, row.signerId), findSect(world, row.sectId))) &&
      pact.parties.every((a) => pact.parties.every((b) => !atWar(world, a.sectId, b.sectId)))) {
      options.push({ action: 'SHARED_COMMONS', commonsMove: 'sign', targetCommonsId: pact.id });
    }
  }
  if (!includeOffers) return options;
  const sites = knownMapLocations(world, actor).filter((site) => !site.ownerSectId &&
    (site.type === 'market' || site.type === 'spirit_vein') && !occupied(world, site.id) && canSign(world, actor, sect, site))
    .sort((a, b) => a.id.localeCompare(b.id));
  let added = 0;
  for (const site of sites) {
    const guests = world.sects.filter((other) => other.id !== sect.id && !atWar(world, sect.id, other.id))
      .sort((a, b) => a.id.localeCompare(b.id)).filter((other) => {
        const leader = findActor(world, other.leaderId);
        return currentSigner(leader, other) && knownMapLocations(world, leader).includes(site);
      });
    for (const herbId of HERBS) {
      if (!validCommonsSite(world, site, herbId)) continue;
      for (let i = 0; i < guests.length; i++) for (let j = i + 1; j < guests.length; j++) {
        if (atWar(world, guests[i].id, guests[j].id)) continue;
        options.push({ action: 'SHARED_COMMONS', commonsMove: 'offer', targetLocationId: site.id, targetHerbId: herbId,
          targetSectId: guests[i].id, targetCommonsThirdSectId: guests[j].id });
        if (++added >= MAX_FORM_OPTIONS) return options;
      }
    }
  }
  return options;
}

function event(world: WorldState, row: SharedCommonsPact, stage: string, title: string, description: string, actorIds: string[],
  privateOnly = false): WorldEvent {
  return { id: `evt-${row.id}-${stage}-${world.tick}`, tick: world.tick, month: world.month, year: world.year,
    title, description, actorIds, locationId: findSite(world, row.siteId)?.id, category: 'diplomacy',
    ...(privateOnly ? { witnessScope: 'participants' } : {}) };
}
function close(world: WorldState, pact: SharedCommonsPact, reason: CommonsCloseReason): void {
  pact.status = 'closed';
  pact.settledTick = world.tick;
  pact.closeReason = reason;
}

export function resolveSharedCommonsAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'SHARED_COMMONS' || !world.cultivators.includes(actor)) return null;
  const option = availableSharedCommonsActions(actor, world, decision.commonsMove === 'offer').find((row) =>
    row.commonsMove === decision.commonsMove && row.targetCommonsId === decision.targetCommonsId && row.targetLocationId === decision.targetLocationId &&
    row.targetHerbId === decision.targetHerbId && row.targetSectId === decision.targetSectId &&
    row.targetCommonsThirdSectId === decision.targetCommonsThirdSectId);
  if (!option) return null;
  if (option.commonsMove === 'offer') {
    const parties = [{ sectId: actor.sectId, signerId: actor.id, share: 2 as const, signedTick: world.tick },
      ...[option.targetSectId!, option.targetCommonsThirdSectId!].map((sectId) => ({ sectId, signerId: findSect(world, sectId)!.leaderId!, share: 1 as const }))];
    const pact: SharedCommonsPact = { id: `shared-commons-${world.sharedCommons.nextId++}`, siteId: option.targetLocationId!,
      herbId: option.targetHerbId!, proposerSectId: actor.sectId, openedTick: world.tick, offerExpiresTick: world.tick + COMMONS_OFFER_TICKS,
      status: 'offered', parties, rounds: [] };
    world.sharedCommons.pacts.push(pact);
    return event(world, pact, 'offered', '三宗共管邀约', '邀约按权重二比一比一议定；尚未扣资或预留实地药草。', parties.map(({ signerId }) => signerId), true);
  }
  const pact = world.sharedCommons.pacts.find(({ id }) => id === option.targetCommonsId)!;
  if (option.commonsMove === 'decline') {
    close(world, pact, 'declined');
    return event(world, pact, 'closed', '共管邀约未获共同同意', '没有扣资、采集配额或地权变化。', pact.parties.map(({ signerId }) => signerId), true);
  }
  pact.parties.find(({ signerId }) => signerId === actor.id)!.signedTick = world.tick;
  if (pact.parties.every(({ signedTick }) => signedTick !== undefined)) {
    pact.activatedTick = world.tick;
    pact.startsTick = world.tick + 1;
    pact.endsTick = pact.startsTick + COMMONS_TERM_TICKS;
    pact.status = 'active';
    return event(world, pact, 'signed', '三宗完成共管签署', '下回合开始按实际库存与实付维护费分配，不改变地点所有权。', pact.parties.map(({ signerId }) => signerId));
  }
  return event(world, pact, `sign-${pact.parties.findIndex(({ signerId }) => signerId === actor.id)}`, '同意参与共管', '仍须全部签署才能开账。', pact.parties.map(({ signerId }) => signerId), true);
}

/** The same fixed-weight apportionment is used by replay and strict save validation. */
export function commonsQuotaShares(stockAtOpen: number, parties: readonly CommonsParty[], roundIndex: number): number[] {
  // Preserve at least one unreserved herb when possible; quota is a right over the same stock, never a second stockpile.
  const objective = Math.max(0, Math.min(COMMONS_MAX_RESERVE, Math.floor(stockAtOpen) - 1));
  const weight = parties.reduce((sum, party) => sum + party.share, 0);
  if (!weight) return [];
  const shares = parties.map((party) => Math.floor(objective * party.share / weight));
  const index = roundIndex % parties.length;
  const order = parties.map((party, position) => ({ position, remainder: objective * party.share % weight,
    rotation: (position - index + parties.length) % parties.length }))
    .sort((a, b) => b.remainder - a.remainder || a.rotation - b.rotation);
  const extras = objective - shares.reduce((sum, amount) => sum + amount, 0);
  for (const { position } of order.slice(0, extras)) shares[position]++;
  return shares;
}

function makeRound(world: WorldState, pact: SharedCommonsPact, site: LocationNode, startTick: number): CommonsQuotaRound {
  const stockAtOpen = Math.floor(site.herbs[pact.herbId]);
  const shares = commonsQuotaShares(stockAtOpen, pact.parties, Math.floor((startTick - pact.startsTick!) / COMMONS_ROUND_TICKS));
  const allocations = pact.parties.map((party, position) => {
    const maintenanceDue = party.share * COMMONS_MAINTENANCE_UNIT;
    const sect = findSect(world, party.sectId), moving = sect && transit(world, sect);
    const balance = moving ? moving.custody.stones : (sect?.spiritStones ?? 0);
    const maintenancePaid = balance >= maintenanceDue ? maintenanceDue : 0;
    if (maintenancePaid && moving) moving.custody.stones -= maintenancePaid;
    else if (maintenancePaid && sect) sect.spiritStones -= maintenancePaid;
    return { sectId: party.sectId, maintenanceDue, maintenancePaid, quota: maintenancePaid ? shares[position] : 0, used: 0 };
  });
  return { startTick, endsTick: startTick + COMMONS_ROUND_TICKS, stockAtOpen,
    reserved: allocations.reduce((sum, row) => sum + row.quota, 0), allocations, harvests: [] };
}

export function advanceSharedCommons(world: WorldState): WorldEvent[] {
  const state = world.sharedCommons;
  const events: WorldEvent[] = [];
  for (const pact of state.pacts) {
    if (pact.openedTick > world.tick || pact.status === 'closed') continue;
    const site = findSite(world, pact.siteId);
    const siteReason = !site ? 'site_lost' : site.ownerSectId || world.sects.some(({ headquartersId }) => headquartersId === site.id) ?
      'title_change' : !validCommonsSite(world, site, pact.herbId) ? 'site_lost' : undefined;
    const reason = siteReason ?? (pact.status === 'offered' ? (pact.offerExpiresTick <= world.tick ? 'offer_expiry' :
      pact.parties.some((row) => !currentSigner(findActor(world, row.signerId), findSect(world, row.sectId))) ? 'stale_signer' : undefined) :
      ((pact.endsTick ?? Infinity) <= world.tick ? 'term_complete' : undefined));
    if (reason) {
      close(world, pact, reason);
      events.push(event(world, pact, 'closed', '共管结束', '原有采集和维护实付保留；未领配额自动消失，不复制库存。',
        pact.parties.map(({ signerId }) => signerId), pact.activatedTick === undefined));
      continue;
    }
    if (!site || !stageLive(world, pact)) continue;
    const offset = world.tick - pact.startsTick!;
    if (offset % COMMONS_ROUND_TICKS !== 0 || pact.rounds.some(({ startTick }) => startTick === world.tick)) continue;
    const quota = makeRound(world, pact, site, world.tick);
    pact.rounds.push(quota);
    const unpaid = quota.allocations.filter((row) => row.maintenancePaid < row.maintenanceDue).length;
    events.push(event(world, pact, 'round', '共管开账分配实地采量', `共预留${quota.reserved}株，${unpaid}方未实付而无当期配额；公有余量仍可采。`,
      pact.parties.map(({ signerId }) => signerId)));
  }
  const closed = new Set(state.pacts.filter((row) => row.status === 'closed').sort((a, b) => (a.settledTick ?? 0) - (b.settledTick ?? 0))
    .slice(-COMMONS_CLOSED_HISTORY).map(({ id }) => id));
  state.pacts = state.pacts.filter((row) => row.status !== 'closed' || closed.has(row.id));
  return events;
}

function applicable(world: WorldState, site: LocationNode, herbId: HerbId): SharedCommonsPact | undefined {
  return validCommonsSite(world, site, herbId) ? world.sharedCommons.pacts.find((row) =>
    row.siteId === site.id && row.herbId === herbId && stageLive(world, row)) : undefined;
}
function currentRound(world: WorldState, pact: SharedCommonsPact): CommonsQuotaRound | undefined {
  return pact.rounds.find((row) => row.startTick <= world.tick && row.endsTick > world.tick);
}

export function currentCommonsRound(world: WorldState, pact: SharedCommonsPact): CommonsQuotaRound | undefined {
  return stageLive(world, pact) && validCommonsSite(world, findSite(world, pact.siteId), pact.herbId) ? currentRound(world, pact) : undefined;
}

export function commonsHarvestLimit(world: WorldState, actor: Cultivator, site: LocationNode, herbId: HerbId): number {
  if (!world.sharedCommons.pacts.length) return MAX_GATHER;
  const actual = findSite(world, site.id);
  if (!actual) return MAX_GATHER;
  const pact = applicable(world, actual, herbId);
  if (!pact) return MAX_GATHER;
  if (!live(actor) || !physicallyHere(world, actor, actual.id)) return 0;
  const round = currentRound(world, pact);
  const member = pact.parties.some((party) => party.sectId === actor.sectId);
  if (!round) return member ? 0 : MAX_GATHER;
  const allocation = round.allocations.find(({ sectId }) => sectId === actor.sectId);
  if (member) return allocation && !round.harvests.some((receipt) => receipt.actorId === actor.id && receipt.tick === world.tick) ?
    Math.max(0, Math.min(MAX_GATHER, allocation.quota - allocation.used, Math.floor(actual.herbs[herbId]))) : 0;
  const reserved = round.allocations.reduce((sum, row) => sum + row.quota - row.used, 0);
  return Math.max(0, Math.min(MAX_GATHER, Math.floor(actual.herbs[herbId]) - reserved));
}

/** Capture allocation usage immediately before canonical alchemy moves actual herbs. */
export function settleCommonsHarvest(world: WorldState, actor: Cultivator, site: LocationNode, herbId: HerbId, amount: number): boolean {
  const actual = findSite(world, site.id);
  const pact = actual && applicable(world, actual, herbId);
  if (!pact) return true; // existing alchemy/title checks remain authoritative without a commons.
  if (!actual || !world.cultivators.includes(actor) || !Number.isSafeInteger(amount) || amount < 1 ||
      amount > commonsHarvestLimit(world, actor, actual, herbId) || amount > actual.herbs[herbId] || actor.herbs[herbId] + amount > 99) return false;
  const round = currentRound(world, pact);
  const allocation = round?.allocations.find(({ sectId }) => sectId === actor.sectId);
  if (round && allocation) {
    allocation.used += amount;
    round.harvests.push({ tick: world.tick, actorId: actor.id, sectId: actor.sectId, units: amount });
  }
  return true;
}

export function visibleSharedCommons(world: WorldState, viewer?: Cultivator): SharedCommonsPact[] {
  const selected = viewer && findActor(world, viewer.id);
  if (!selected || !world.sharedCommons.pacts.length) return [];
  const known = new Set(knownMapLocations(world, selected).map(({ id }) => id));
  return world.sharedCommons.pacts.filter((pact) => pact.openedTick <= world.tick && known.has(pact.siteId) &&
    (pact.parties.some(({ sectId }) => sectId === selected.sectId) ||
      (pact.activatedTick !== undefined && live(selected) && physicallyHere(world, selected, pact.siteId))))
    .map((pact) => ({ ...pact, parties: pact.parties.map((row) => ({ ...row })), rounds: pact.rounds.map((round) => ({
      ...round, allocations: round.allocations.map((row) => ({ ...row })),
      harvests: round.harvests.filter(({ sectId }) => sectId === selected.sectId).map((row) => ({ ...row })),
    })) }));
}
