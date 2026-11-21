import type { Cultivator, LLMDecisionPayload, LocationNode, SanctuaryCharter, SanctuaryIncident, SanctuaryMove, SanctuaryPass,
  SanctuaryPassEndReason, SanctuaryState, WorldEvent, WorldState } from '../types/world';
import { knownMapLocations } from './terrainEngine';

export const SANCTUARY_FOUND_COST = 60;
export const SANCTUARY_MAX_SHIELD = 60;
export const SANCTUARY_REPAIR_COST = 20;
export const SANCTUARY_REPAIR_HP = 30;
export const SANCTUARY_CHARTER_TICKS = 12;
export const SANCTUARY_PASS_TICKS = 6;
export const SANCTUARY_BLOCK_HP = 20;
export const SANCTUARY_KARMA_PENALTY = 8;
const ARCHIVED_CHARTERS = 48;
const ARCHIVED_INCIDENTS = 96;
const ARCHIVED_PASSES = 96;

export interface SanctuaryOption {
  action: 'SANCTUARY';
  sanctuaryMove: SanctuaryMove;
  targetLocationId?: string;
  targetSanctuaryId?: string;
}
export interface VisibleSanctuary {
  charter: SanctuaryCharter;
  ownPass?: SanctuaryPass;
  incidents: SanctuaryIncident[];
}
export interface SanctuaryDuelInterception { blocked: boolean; event: WorldEvent }

export const createSanctuaryState = (): SanctuaryState => ({ charters: [], passes: [], incidents: [], nextId: 1 });
const alive = (actor: Cultivator) => actor.alive && actor.hp > 0;
const wanted = (world: WorldState, actor: Cultivator) => world.bounties.some((bounty) =>
  bounty.targetCultivatorId === actor.id && bounty.status === 'open');

function suspendedByDuty(world: WorldState, actor: Cultivator): boolean {
  return world.sieges.some((siege) => (siege.status === 'marching' || siege.status === 'sieging') && siege.participantIds.includes(actor.id)) ||
    world.escorts.contracts.some((contract) => contract.escortId === actor.id && contract.status === 'active') ||
    world.relocations.plans.some((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(actor.id)) ||
    world.occasions.some((occasion) => (occasion.status === 'registration' || occasion.status === 'running') &&
      occasion.participantIds.includes(actor.id));
}

function validSite(world: WorldState, site: LocationNode | undefined, sponsorId: string): site is LocationNode {
  return Boolean(site && (site.type === 'market' || site.type === 'spirit_vein') &&
    (!site.ownerSectId || site.ownerSectId === sponsorId) && !world.sects.some((sect) => sect.headquartersId === site.id));
}

export function isSanctuaryCharterActive(world: WorldState, charter: SanctuaryCharter): boolean {
  return charter.status === 'active' && charter.openedTick <= world.tick && world.tick < charter.expiresTick &&
    world.sects.some((sect) => sect.id === charter.sponsorSectId) &&
    validSite(world, world.locations.find((site) => site.id === charter.siteId), charter.sponsorSectId);
}

function activePassFor(world: WorldState, actor: Cultivator, charter: SanctuaryCharter): SanctuaryPass | undefined {
  if (!alive(actor) || wanted(world, actor)) return undefined;
  return world.sanctuary.passes.find((pass) => pass.actorId === actor.id && pass.charterId === charter.id &&
    pass.status === 'active' && pass.issuedTick <= world.tick && pass.expiresTick > world.tick);
}

/** A safe-conduct ticket is not a travel shield: here and in movement, this only returns the held right. */
export function activeSanctuaryPass(world: WorldState, actor: Cultivator): SanctuaryPass | undefined {
  for (const charter of world.sanctuary.charters) {
    if (!isSanctuaryCharterActive(world, charter)) continue;
    const pass = activePassFor(world, actor, charter);
    if (pass) return pass;
  }
  return undefined;
}

function charterForDuel(world: WorldState, attacker: Cultivator, defender: Cultivator): SanctuaryCharter | undefined {
  if (attacker.id === defender.id || !alive(attacker) || !alive(defender) || attacker.locationId !== defender.locationId ||
      suspendedByDuty(world, attacker) || suspendedByDuty(world, defender)) return undefined;
  return world.sanctuary.charters.find((charter) => charter.siteId === defender.locationId && isSanctuaryCharterActive(world, charter));
}

export function sanctuaryCanShield(world: WorldState, attacker: Cultivator, defender: Cultivator): boolean {
  const charter = charterForDuel(world, attacker, defender);
  return Boolean(charter && charter.shieldHp >= SANCTUARY_BLOCK_HP && activePassFor(world, defender, charter));
}

export function visibleSanctuaries(world: WorldState, viewer?: Cultivator): VisibleSanctuary[] {
  const actor = viewer && world.cultivators.find((item) => item.id === viewer.id);
  if (!actor) return [];
  const known = new Set(knownMapLocations(world, actor).map(({ id }) => id));
  return world.sanctuary.charters.filter((charter) => charter.openedTick <= world.tick).flatMap((charter) => {
    const ownPass = world.sanctuary.passes.find((pass) => pass.charterId === charter.id && pass.actorId === actor.id &&
      pass.issuedTick <= world.tick);
    if (!ownPass && !known.has(charter.siteId) && charter.founderId !== actor.id) return [];
    const incidents = world.sanctuary.incidents.filter((item) => item.charterId === charter.id && item.tick <= world.tick &&
      (item.aggressorId === actor.id || item.visitorId === actor.id));
    return [{ charter, ownPass, incidents }];
  });
}

export function availableSanctuaryActions(actor: Cultivator, world: WorldState): SanctuaryOption[] {
  if (!world.cultivators.includes(actor) || !alive(actor) || suspendedByDuty(world, actor)) return [];
  const sect = world.sects.find((candidate) => candidate.id === actor.sectId && candidate.leaderId === actor.id && actor.sectRank === '掌门');
  const local = world.locations.find((site) => site.id === actor.locationId);
  const charters = world.sanctuary.charters.filter((charter) => isSanctuaryCharterActive(world, charter));
  const options: SanctuaryOption[] = [];
  if (sect && sect.spiritStones >= SANCTUARY_FOUND_COST && validSite(world, local, sect.id) &&
      !charters.some((charter) => charter.siteId === local.id)) {
    options.push({ action: 'SANCTUARY', sanctuaryMove: 'found', targetLocationId: local.id });
  }
  if (!charters.length) return options;
  const ownPass = activeSanctuaryPass(world, actor);
  const known = new Set(!ownPass && !wanted(world, actor) ? knownMapLocations(world, actor).map(({ id }) => id) : []);
  for (const charter of charters) {
    if (sect?.id === charter.sponsorSectId && local?.id === charter.siteId && sect.spiritStones >= SANCTUARY_REPAIR_COST &&
        charter.shieldHp < charter.maxShieldHp && charter.lastRepairTick !== world.tick) {
      options.push({ action: 'SANCTUARY', sanctuaryMove: 'repair', targetSanctuaryId: charter.id });
    }
    if (ownPass?.charterId === charter.id) {
      options.push({ action: 'SANCTUARY', sanctuaryMove: 'surrender', targetSanctuaryId: charter.id });
    } else if (known.has(charter.siteId) && !world.sanctuary.passes.some((pass) => pass.actorId === actor.id && pass.charterId === charter.id)) {
      options.push({ action: 'SANCTUARY', sanctuaryMove: 'take_pass', targetSanctuaryId: charter.id });
    }
  }
  return options;
}

function event(world: WorldState, id: string, title: string, description: string, actorIds: string[], locationId?: string,
  privateReceipt = false): WorldEvent {
  return { id: `evt-${id}`, title, description, actorIds, locationId, tick: world.tick, year: world.year, month: world.month,
    category: 'diplomacy', ...(privateReceipt ? { witnessScope: 'participants' } : {}) };
}

const passReason: Record<SanctuaryPassEndReason, string> = {
  expiry: '敕令届满', charter_ended: '避难敕令随章程终止', surrendered: '本人交回敕令',
  violation: '在避难站主动挑起斗法', ineligible: '持令人陨落或受正式悬赏，不再符合条件',
};
function closePass(world: WorldState, pass: SanctuaryPass, reason: SanctuaryPassEndReason): void {
  pass.status = 'ended';
  pass.endedTick = world.tick;
  pass.endReason = reason;
}

export function resolveSanctuaryAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'SANCTUARY') return null;
  const option = availableSanctuaryActions(actor, world).find((candidate) => decision.sanctuaryMove === candidate.sanctuaryMove &&
    decision.targetLocationId === candidate.targetLocationId && decision.targetSanctuaryId === candidate.targetSanctuaryId);
  if (!option) return null;
  const state = world.sanctuary;
  if (option.sanctuaryMove === 'found') {
    const sect = world.sects.find((item) => item.id === actor.sectId)!;
    const site = world.locations.find((item) => item.id === option.targetLocationId)!;
    const charter: SanctuaryCharter = { id: `sanctuary-charter-${state.nextId++}`, siteId: site.id, sponsorSectId: sect.id, founderId: actor.id,
      status: 'active', openedTick: world.tick, expiresTick: world.tick + SANCTUARY_CHARTER_TICKS,
      shieldHp: SANCTUARY_MAX_SHIELD, maxShieldHp: SANCTUARY_MAX_SHIELD, stonesSpent: SANCTUARY_FOUND_COST };
    sect.spiritStones -= SANCTUARY_FOUND_COST;
    state.charters.push(charter);
    return event(world, charter.id, '避难章程生效', `${sect.name}在${site.name}出资护持，合格行客可自行领取通行敕令。`, [actor.id], site.id);
  }
  const charter = state.charters.find((item) => item.id === option.targetSanctuaryId)!;
  if (option.sanctuaryMove === 'repair') {
    const sect = world.sects.find((item) => item.id === charter.sponsorSectId)!;
    const actual = Math.min(SANCTUARY_REPAIR_HP, charter.maxShieldHp - charter.shieldHp);
    charter.shieldHp += actual;
    charter.stonesSpent += SANCTUARY_REPAIR_COST;
    charter.lastRepairTick = world.tick;
    sect.spiritStones -= SANCTUARY_REPAIR_COST;
    return event(world, `${charter.id}-repair-${world.tick}`, '避难护阵修复', `${sect.name}支出${SANCTUARY_REPAIR_COST}灵石，修复${actual}点护阵。`, [actor.id], charter.siteId);
  }
  if (option.sanctuaryMove === 'take_pass') {
    const pass: SanctuaryPass = { id: `sanctuary-pass-${state.nextId++}`, charterId: charter.id, actorId: actor.id,
      status: 'active', issuedTick: world.tick, expiresTick: Math.min(world.tick + SANCTUARY_PASS_TICKS, charter.expiresTick) };
    state.passes.push(pass);
    return event(world, pass.id, '自愿领取通行敕令', '持令者仅在指定避难站内受护，无行路免伤。', [actor.id], actor.locationId, true);
  }
  const pass = activePassFor(world, actor, charter)!;
  closePass(world, pass, 'surrendered');
  return event(world, `${pass.id}-ended`, '交回通行敕令', passReason.surrendered, [actor.id], actor.locationId, true);
}

function incidentEvent(world: WorldState, charter: SanctuaryCharter, incident: SanctuaryIncident): WorldEvent {
  const title: Record<SanctuaryIncident['kind'], string> = { blocked: '避难护阵挡下斗法', exhausted: '护阵不足，违例斗法未被制止', forfeited: '持令者违例，通行权撤销' };
  const description: Record<SanctuaryIncident['kind'], string> = {
    blocked: `护阵消耗${incident.shieldSpent}点；此次斗法未发生。`,
    exhausted: '此处通行权仍有效，但余阵不足以挡下挑战。',
    forfeited: '持令者主动挑起斗法，失去本站避难通行权。',
  };
  return event(world, incident.id, title[incident.kind], description[incident.kind], [incident.aggressorId, incident.visitorId], charter.siteId);
}

/** Called after ordinary duel target validation but before combat rolls, damage, and loot. */
export function interceptSanctuaryDuel(world: WorldState, attacker: Cultivator, defender: Cultivator): SanctuaryDuelInterception | undefined {
  if (!world.cultivators.includes(attacker) || !world.cultivators.includes(defender)) return undefined;
  const charter = charterForDuel(world, attacker, defender);
  if (!charter) return undefined;
  const state = world.sanctuary;
  const existing = state.incidents.find((item) => item.charterId === charter.id && item.tick === world.tick &&
    item.aggressorId === attacker.id && item.visitorId === defender.id);
  if (existing) return { blocked: existing.kind === 'blocked', event: incidentEvent(world, charter, existing) };
  const attackerPass = activePassFor(world, attacker, charter);
  const defenderPass = activePassFor(world, defender, charter);
  if (!attackerPass && !defenderPass) return undefined;
  if (attackerPass) closePass(world, attackerPass, 'violation');
  const blocked = Boolean(defenderPass && charter.shieldHp >= SANCTUARY_BLOCK_HP);
  const shieldSpent = blocked ? SANCTUARY_BLOCK_HP : 0;
  charter.shieldHp -= shieldSpent;
  const karma = attacker.karma;
  attacker.karma = Math.max(-100, karma - SANCTUARY_KARMA_PENALTY);
  const id = `sanctuary-incident-${state.nextId++}`;
  const incident: SanctuaryIncident = { id, charterId: charter.id, tick: world.tick, aggressorId: attacker.id, visitorId: defender.id,
    kind: blocked ? 'blocked' : defenderPass ? 'exhausted' : 'forfeited', shieldSpent, karmaPenalty: karma - attacker.karma,
    sourceEventId: `evt-${id}` };
  state.incidents.push(incident);
  return { blocked, event: incidentEvent(world, charter, incident) };
}

export function advanceSanctuaries(world: WorldState): WorldEvent[] {
  const state = world.sanctuary;
  const events: WorldEvent[] = [];
  for (const charter of state.charters) {
    if (charter.status !== 'active' || isSanctuaryCharterActive(world, charter)) continue;
    charter.status = 'ended';
    charter.endedTick = world.tick;
    charter.endReason = world.tick >= charter.expiresTick ? 'expiry' : 'site_lost';
    events.push(event(world, `${charter.id}-ended`, '避难章程终止', charter.endReason === 'expiry' ? '章程届满，护阵不再提供保护。' :
      '原址消失或不再符合设立条件，护阵停止护持。', [charter.founderId], world.locations.some(({ id }) => id === charter.siteId) ? charter.siteId : undefined));
  }
  const charterMap = new Map(state.charters.map((charter) => [charter.id, charter]));
  if (state.passes.some((pass) => pass.status === 'active')) {
    const people = new Map(world.cultivators.map((actor) => [actor.id, actor]));
    const bounties = new Set(world.bounties.filter((bounty) => bounty.status === 'open').map((bounty) => bounty.targetCultivatorId));
    for (const pass of state.passes) {
      if (pass.status !== 'active') continue;
      const charter = charterMap.get(pass.charterId);
      const actor = people.get(pass.actorId);
      const reason = charter?.status !== 'active' ? 'charter_ended' : world.tick >= pass.expiresTick ? 'expiry' :
        !actor || !alive(actor) || bounties.has(pass.actorId) ? 'ineligible' : undefined;
      if (!reason) continue;
      closePass(world, pass, reason);
      events.push(event(world, `${pass.id}-ended`, '通行敕令失效', passReason[reason], [pass.actorId], actor?.locationId, true));
    }
  }
  const active = new Set(state.charters.filter((charter) => charter.status === 'active').map(({ id }) => id));
  const closed = new Set(state.charters.filter((charter) => charter.status === 'ended').slice(-ARCHIVED_CHARTERS).map(({ id }) => id));
  state.charters = state.charters.filter(({ id }) => active.has(id) || closed.has(id));
  // Keep every current-charter prior holder to prevent repeated reissue after surrender or breach.
  const oldPass = new Set(state.passes.filter((pass) => closed.has(pass.charterId)).slice(-ARCHIVED_PASSES).map(({ id }) => id));
  state.passes = state.passes.filter((pass) => active.has(pass.charterId) || oldPass.has(pass.id));
  const recent = new Set(state.incidents.filter((incident) => incident.tick < world.tick &&
    (active.has(incident.charterId) || closed.has(incident.charterId))).slice(-ARCHIVED_INCIDENTS).map(({ id }) => id));
  state.incidents = state.incidents.filter((incident) => incident.tick === world.tick || recent.has(incident.id));
  return events;
}
