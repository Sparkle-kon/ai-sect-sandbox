import type { BeastRelease, Cultivator, HabitatMove, HabitatState, HabitatStewardship, LLMDecisionPayload, LocationNode, SpiritBeast,
  WorldEvent, WorldState } from '../types/world';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { terrainTileAt } from './terrainEngine';

export const HABITAT_RESTORE_STONES = 24;
export const HABITAT_RESTORE_ROOTS = 2;
export const HABITAT_RESTORATION_TICKS = 24;
export const HABITAT_SURVEY_DELAY = 3;
export const HABITAT_SURVEY_WINDOW = 12;
export const HABITAT_RESTORE_TICKS = HABITAT_RESTORATION_TICKS;
export const HABITAT_ACCLIMATION_TICKS = HABITAT_SURVEY_DELAY;
export const HABITAT_MIN_HEALTH = .70;
const RETAIN_HISTORY = 64;
const STEWARDS = new Set<Cultivator['sectRank']>(['长老', '太上长老', '掌门']);
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const healthy = (beast: SpiritBeast | undefined): beast is SpiritBeast =>
  Boolean(beast?.alive && beast.hp > 0 && beast.hp >= beast.maxHp * HABITAT_MIN_HEALTH);
const wilderness = (site: LocationNode) => site.type === 'spirit_vein' || site.type === 'secret_realm' || site.type === 'abyss';
const atHabitat = (world: WorldState, site: LocationNode | undefined): site is LocationNode => Boolean(site?.type === 'spirit_vein' &&
  !world.sects.some((sect) => sect.headquartersId === site.id));

export interface HabitatOption {
  action: 'HABITAT';
  habitatMove: HabitatMove;
  targetLocationId?: string;
  targetBeastId?: string;
  targetBeastReleaseId?: string;
}
export interface HabitatView {
  siteId: string;
  capacity?: number;
  wildOccupancy?: number;
  restoration?: HabitatStewardship;
  releases: BeastRelease[];
}

export const createHabitatState = (): HabitatState => ({ stewardships: [], releases: [], nextId: 1 });

function activeStewardship(world: WorldState, site: LocationNode): HabitatStewardship | undefined {
  if (!atHabitat(world, site)) return undefined;
  return world.habitats.stewardships.find((row) => row.siteId === site.id && row.endedTick === undefined &&
    row.restoredTick <= world.tick && row.expiresTick > world.tick && (!site.ownerSectId || site.ownerSectId === row.sponsorSectId) &&
    world.sects.some((sect) => sect.id === row.sponsorSectId));
}

/** Headroom is based on longstanding local ecology rather than today's partly harvested stock. */
export function habitatCapacity(world: WorldState, siteId: string): number {
  const site = world.locations.find(({ id }) => id === siteId);
  if (!site || !wilderness(site)) return 0;
  const terrain = terrainTileAt(world, site.x, site.y);
  const regeneration = Object.values(site.herbCapacity).reduce((sum, amount) => sum + amount, 0);
  const supportiveGround = terrain?.biome === '灵山' || terrain?.biome === '坊市';
  const base = 1 + Number(regeneration >= 8 && site.spiritQi >= 45) + Number(regeneration >= 16 && supportiveGround);
  return base + Number(Boolean(activeStewardship(world, site)));
}

/** Count living wild individuals physically present. Home attachment without a body does not take habitat space. */
export function habitatOccupancy(world: WorldState, siteId: string, omitBeastId?: string): number {
  return new Set(world.spiritBeasts.filter((beast) => beast.alive && beast.hp > 0 && !beast.tamedBy &&
    beast.locationId === siteId && beast.id !== omitBeastId).map(({ id }) => id)).size;
}

export function habitatCanReceiveWildBeast(world: WorldState, siteId: string, omitBeastId?: string): boolean {
  const capacity = habitatCapacity(world, siteId);
  return capacity > 0 && habitatOccupancy(world, siteId, omitBeastId) < capacity;
}

export function isRewildingAcclimating(world: WorldState, beastId: string): boolean {
  return world.habitats.releases.some((release) => release.beastId === beastId &&
    release.releasedTick <= world.tick && release.earliestSurveyTick > world.tick && release.status === 'monitoring');
}

function physicallyHere(world: WorldState, actor: Cultivator): boolean {
  return live(actor) && !pilgrimageCheckpoint(world, actor) &&
    !world.escorts.contracts.some((deal) => deal.escortId === actor.id && deal.status === 'active') &&
    !world.relocations.plans.some((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(actor.id)) &&
    !world.sieges.some((row) => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(actor.id)) &&
    !world.occasions.some((row) => (row.status === 'registration' || row.status === 'running') && row.participantIds.includes(actor.id)) &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon';
}

export function visibleHabitats(world: WorldState, viewer?: Cultivator): HabitatView[] {
  const actor = viewer && world.cultivators.find(({ id }) => id === viewer.id);
  if (!actor) return [];
  const site = world.locations.find(({ id }) => id === actor.locationId);
  const local = physicallyHere(world, actor) && atHabitat(world, site) ? site : undefined;
  const receipts = world.habitats.releases.filter((row) => row.releasedTick <= world.tick &&
    (row.siteId === local?.id || row.formerOwnerId === actor.id));
  const ids = new Set([...(local ? [local.id] : []), ...receipts.map(({ siteId }) => siteId)]);
  return [...ids].map((siteId) => {
    const onSite = local?.id === siteId;
    const restoration = onSite ? activeStewardship(world, local) ?? world.habitats.stewardships.filter((row) =>
      row.siteId === siteId && row.restoredTick <= world.tick).at(-1) : undefined;
    return { siteId, ...(onSite ? { capacity: habitatCapacity(world, siteId), wildOccupancy: habitatOccupancy(world, siteId) } : {}),
      ...(restoration ? { restoration: { ...restoration } } : {}),
      releases: receipts.filter((row) => row.siteId === siteId).map((row) => ({ ...row,
        ...(row.observation ? { observation: { ...row.observation } } : {}) })) };
  });
}

const activeMonitoring = (world: WorldState, row: BeastRelease) =>
  row.status === 'monitoring' && row.releasedTick <= world.tick && row.deadlineTick > world.tick;

export function availableHabitatActions(actor: Cultivator, world: WorldState): HabitatOption[] {
  if (!world.cultivators.includes(actor) || !physicallyHere(world, actor)) return [];
  const site = world.locations.find(({ id }) => id === actor.locationId);
  if (!atHabitat(world, site)) return [];
  const sect = world.sects.find(({ id }) => id === actor.sectId);
  const restored = activeStewardship(world, site);
  const options: HabitatOption[] = [];
  const onDuty = actor.guardAssignment?.locationId === site.id && actor.guardAssignment.assignedTick <= world.tick &&
    actor.guardAssignment.expiresTick > world.tick;
  if (!restored && sect && (!site.ownerSectId || site.ownerSectId === sect.id) &&
      !world.relocations.plans.some((plan) => plan.sectId === sect.id && plan.status === 'in_transit') &&
      (STEWARDS.has(actor.sectRank) || onDuty) && sect.spiritStones >= HABITAT_RESTORE_STONES && actor.herbs.earth_root >= HABITAT_RESTORE_ROOTS) {
    options.push({ action: 'HABITAT', habitatMove: 'restore', targetLocationId: site.id });
  }
  if (restored && habitatCanReceiveWildBeast(world, site.id)) {
    for (const beast of world.spiritBeasts) {
      if (healthy(beast) && beast.tamedBy === actor.id && beast.locationId === site.id &&
          !world.habitats.releases.some((row) => row.beastId === beast.id && activeMonitoring(world, row))) {
        options.push({ action: 'HABITAT', habitatMove: 'release', targetBeastId: beast.id });
      }
    }
  }
  for (const row of world.habitats.releases) {
    if (!activeMonitoring(world, row) || row.siteId !== site.id || world.tick < row.earliestSurveyTick || row.formerOwnerId === actor.id) continue;
    const beast = world.spiritBeasts.find(({ id }) => id === row.beastId);
    if (healthy(beast) && !beast.tamedBy && beast.locationId === site.id) {
      options.push({ action: 'HABITAT', habitatMove: 'survey', targetBeastReleaseId: row.id });
    }
  }
  return options;
}

function event(world: WorldState, id: string, title: string, description: string, locationId: string | undefined, actorIds: string[],
  privateOnly = false): WorldEvent {
  return { id: `evt-${id}`, tick: world.tick, year: world.year, month: world.month, title, description, locationId, actorIds,
    category: 'heavenly', ...(privateOnly ? { witnessScope: 'participants' } : {}) };
}

export function resolveHabitatAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'HABITAT') return null;
  const option = availableHabitatActions(actor, world).find((item) => item.habitatMove === decision.habitatMove &&
    item.targetLocationId === decision.targetLocationId && item.targetBeastId === decision.targetBeastId &&
    item.targetBeastReleaseId === decision.targetBeastReleaseId);
  if (!option) return null;
  const state = world.habitats;
  const site = world.locations.find(({ id }) => id === actor.locationId)!;
  if (option.habitatMove === 'restore') {
    const sect = world.sects.find(({ id }) => id === actor.sectId)!;
    const id = `habitat-restoration-${state.nextId++}`;
    sect.spiritStones -= HABITAT_RESTORE_STONES;
    actor.herbs.earth_root -= HABITAT_RESTORE_ROOTS;
    state.stewardships.push({ id, siteId: site.id, sponsorSectId: sect.id, stewardId: actor.id,
      restoredTick: world.tick, expiresTick: world.tick + HABITAT_RESTORATION_TICKS });
    return event(world, id, '实物恢复灵兽栖地', `${sect.name}支出${HABITAT_RESTORE_STONES}灵石，${actor.name}另交${HABITAT_RESTORE_ROOTS}玄土根；当地限时多一处野生栖位。`,
      site.id, [actor.id]);
  }
  if (option.habitatMove === 'release') {
    const beast = world.spiritBeasts.find(({ id }) => id === option.targetBeastId)!;
    const id = `habitat-release-${state.nextId++}`;
    delete beast.tamedBy;
    beast.homeLocationId = site.id;
    beast.nextActionTick = Math.max(beast.nextActionTick, world.tick + HABITAT_SURVEY_DELAY);
    state.releases.push({ id, beastId: beast.id, formerOwnerId: actor.id, siteId: site.id, releasedTick: world.tick,
      earliestSurveyTick: world.tick + HABITAT_SURVEY_DELAY, deadlineTick: world.tick + HABITAT_SURVEY_WINDOW, status: 'monitoring' });
    return event(world, id, '原有灵兽解除认主并放归', '同一灵兽就地放归，不再助战；尚未有独立后续目击。', site.id, [actor.id]);
  }
  const release = state.releases.find(({ id }) => id === option.targetBeastReleaseId)!;
  const beast = world.spiritBeasts.find(({ id }) => id === release.beastId)!;
  release.status = 'sighted';
  release.observation = { observerId: actor.id, tick: world.tick, hp: beast.hp };
  release.settledTick = world.tick;
  return event(world, `${release.id}-sighted`, '当地后续目击同一野生灵兽', '独立在场者实见仍健康的同一无主灵兽；不代表今后一直留在此地。',
    site.id, [actor.id], true);
}

export function advanceHabitats(world: WorldState): WorldEvent[] {
  const state = world.habitats;
  const events: WorldEvent[] = [];
  for (const row of state.stewardships) {
    if (row.endedTick !== undefined || row.restoredTick > world.tick) continue;
    const site = world.locations.find(({ id }) => id === row.siteId);
    const lost = !atHabitat(world, site) || Boolean(site.ownerSectId && site.ownerSectId !== row.sponsorSectId) ||
      !world.sects.some((sect) => sect.id === row.sponsorSectId);
    if (!lost && row.expiresTick > world.tick) continue;
    row.endedTick = world.tick;
    row.endReason = row.expiresTick <= world.tick ? 'expiry' : 'site_lost';
    events.push(event(world, `${row.id}-ended`, '栖地增益终止', '新增栖位不再有效，未删除或搬移任何原有灵兽。',
      site?.id, [row.stewardId]));
  }
  for (const row of state.releases) {
    if (row.status !== 'monitoring' || row.deadlineTick > world.tick) continue;
    row.status = 'unconfirmed';
    row.settledTick = world.tick;
    events.push(event(world, `${row.id}-unconfirmed`, '放归未获现场证实', '观察窗口结束，未有合格当地目击；不推断灵兽去向、生死或认主状态。',
      undefined, [row.formerOwnerId], true));
  }
  const keepEnded = new Set(state.stewardships.filter((row) => row.endedTick !== undefined)
    .sort((a, b) => (a.endedTick ?? 0) - (b.endedTick ?? 0)).slice(-RETAIN_HISTORY).map(({ id }) => id));
  const keepRelease = new Set(state.releases.filter((row) => row.status !== 'monitoring')
    .sort((a, b) => (a.settledTick ?? 0) - (b.settledTick ?? 0)).slice(-RETAIN_HISTORY).map(({ id }) => id));
  state.stewardships = state.stewardships.filter((row) => row.endedTick === undefined || keepEnded.has(row.id));
  state.releases = state.releases.filter((row) => row.status === 'monitoring' || keepRelease.has(row.id));
  return events;
}
