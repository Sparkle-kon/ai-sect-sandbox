import type { Cultivator, ExpeditionOmen, ExpeditionOmensState, FieldObservatoryRun, FieldWeatherReading, LocationNode, WorldOccasion, WorldState } from '../types/world';
import { activeCourierForActor, courierActedThisTick } from './sealedCourierEngine';
import { activePilgrimageForActor, pilgrimageActedThisTick } from './pilgrimageEngine';
import { activeEscortForActor } from './escortEngine';
import { activeRelocationForActor } from './relocationEngine';
import { activeSiegeForActor } from './diplomacyEngine';
import { isTribulationActive } from './tribulationEngine';
import { localQiWeather } from './weatherEngine';
import { terrainTileAt } from './terrainEngine';
import { isScopedExpeditionGate, expeditionOmenNativeRun as nativeRun, expeditionOmenLearnedAt as learnedAt, expeditionOmenAt as rowAt } from './expeditionOmenTerms';

export const EXPEDITION_OMEN_QI = 70;
export const EXPEDITION_OMEN_MEASURE_INTENSITY = .35;
export const EXPEDITION_OMEN_OPEN_INTENSITY = .30;
export const EXPEDITION_OMEN_WINDOW_FIRST = 1;
export const EXPEDITION_OMEN_WINDOW_LAST = 3;
export const EXPEDITION_OMEN_RETENTION = 16;
export const createExpeditionOmensState = (): ExpeditionOmensState => ({ rows: [] });

type MeasuredRun = Extract<FieldObservatoryRun, { status: 'measured' }>;
const alive = (actor: Cultivator) => actor.alive && actor.hp > 0;
const active = (o: WorldOccasion) => o.status === 'registration' || o.status === 'running';
const sign = (reading: FieldWeatherReading, minimum: number) =>
  reading.kind === '灵潮' && Number.isFinite(reading.intensity) && reading.intensity >= minimum && reading.intensity <= 1;
const read = (world: WorldState, site: LocationNode): FieldWeatherReading => {
  const { kind, intensity } = localQiWeather(world, site);
  return { kind, intensity };
};
const anchor = (world: WorldState, siteId: string) => world.locations.find(site => site.id === siteId && site.type === 'spirit_vein');
const viableSite = (world: WorldState, site: LocationNode) => {
  const tile = terrainTileAt(world, site.x, site.y);
  return !!tile && site.type === 'spirit_vein' && Number.isFinite(site.spiritQi) && site.spiritQi >= EXPEDITION_OMEN_QI &&
    !world.mapHazards.some(hazard => hazard.tileId === tile.id && hazard.createdTick <= world.tick &&
      world.tick < hazard.expiresTick && hazard.intensity >= 2);
};
/** A modest autonomous investigation; the actual paid due reading alone can reveal a clue. */
export function canInvestigateExpeditionOmen(world:WorldState,actor:Cultivator):boolean {
  if(world.tick<6||(world.tick+actor.id.charCodeAt(actor.id.length-1))%4!==0)return false;
  const site=anchor(world,actor.locationId);
  return !!site&&viableSite(world,site)&&presentAtExpeditionAnchor(world,actor,site.id)&&
    sign(read(world,site),EXPEDITION_OMEN_OPEN_INTENSITY)&&
    !world.expeditionOmens.rows.some(row=>row.siteId===site.id&&liveRegistrationClue(row,world.tick));
}
export const expeditionOmenId = (operatorId: string, openedTick: number) => `expedition-omen-${operatorId}-${openedTick}`;
const liveRegistrationClue = (row: ExpeditionOmen, tick: number) => row.opening ? tick < row.opening.tick + 3 : tick <= row.windowEndsTick;
/** Cabin/courier/pilgrimage use actual movement state, never their stale nominal location. */
export function presentAtExpeditionAnchor(world: WorldState, actor: Cultivator, siteId: string, executionTick = world.tick): boolean {
  return world.cultivators.includes(actor) && alive(actor) && actor.locationId === siteId &&
    !isTribulationActive(actor) && !activeSiegeForActor(world, actor) && !activeCourierForActor(world, actor) &&
    !activePilgrimageForActor(world, actor) && !activeEscortForActor(world, actor) && !activeRelocationForActor(world, actor) &&
    !world.boundaryReliefs.cases.some(row => row.incomingId === actor.id && (row.status === 'travelling' || row.status === 'returning')) &&
    (executionTick !== world.tick || !pilgrimageActedThisTick(world, actor) && !courierActedThisTick(world, actor));
}

/** Invoked only after native paid exact due measurement has actually been written. */
export function recordExpeditionOmen(world: WorldState, actor: Cultivator, site: LocationNode, run: MeasuredRun): void {
  if (run.targetTick !== world.tick || run.station || anchor(world, site.id) !== site || run.locationId !== site.id || !viableSite(world, site) ||
      !sign(run.reading, EXPEDITION_OMEN_MEASURE_INTENSITY) || !presentAtExpeditionAnchor(world, actor, site.id)) return;
  const id = expeditionOmenId(actor.id, run.openedTick);
  if (world.expeditionOmens.rows.some(row => row.id === id)) return;
  const row: ExpeditionOmen = { id, siteId: site.id, operatorId: actor.id, openedTick: run.openedTick,
    measuredTick: world.tick, measuredQi: site.spiritQi, reading: { ...run.reading },
    windowStartsTick: world.tick + EXPEDITION_OMEN_WINDOW_FIRST, windowEndsTick: world.tick + EXPEDITION_OMEN_WINDOW_LAST };
  if (nativeRun(world, row) === run) world.expeditionOmens.rows.push(row);
}

/** The real one-recipient, physically local observatory relay; no clue to forecasts or late hearsay. */
export function recordExpeditionOmenRelay(world: WorldState, actor: Cultivator, site: LocationNode, run: MeasuredRun): void {
  const row = world.expeditionOmens.rows.find(candidate =>
    candidate.operatorId === actor.id && candidate.siteId === site.id && candidate.openedTick === run.openedTick);
  if (!row || row.relay || !run.relay || run.relay.relayedTick !== world.tick || !liveRegistrationClue(row, world.tick) ||
      nativeRun(world, row) !== run) return;
  const recipient = world.cultivators.find(candidate => candidate.id === run.relay?.recipientId);
  if (recipient && presentAtExpeditionAnchor(world, recipient, site.id) && presentAtExpeditionAnchor(world, actor, site.id)) {
    row.relay = { recipientId: recipient.id, tick: world.tick };
  }
}

/** Selection consumes no RNG and runs after actual ordinary actions and territorial changes. */
export function eligibleExpeditionOmen(world: WorldState): { row: ExpeditionOmen; site: LocationNode; reading: FieldWeatherReading } | undefined {
  const ledger = world.expeditionOmens.rows;
  if (!ledger.length || world.occasions.some(o => o.kind === 'expedition' && (active(o) || o.startedTick === world.tick))) return undefined;
  const candidates = [];
  for (const row of ledger) {
    if (row.opening || world.tick < row.windowStartsTick || world.tick > row.windowEndsTick || !nativeRun(world, row)) continue;
    const site = anchor(world, row.siteId);
    if (!site || !viableSite(world, site)) continue;
    const reading = read(world, site);
    if (sign(reading, EXPEDITION_OMEN_OPEN_INTENSITY)) candidates.push({ row, site, reading });
  }
  return candidates.sort((a, b) => a.row.windowEndsTick - b.row.windowEndsTick || b.reading.intensity - a.reading.intensity ||
    (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0))[0];
}

export function recordExpeditionOpening(world: WorldState, selected: NonNullable<ReturnType<typeof eligibleExpeditionOmen>>,
  occasion: WorldOccasion): void {
  const { row, site, reading } = selected;
  row.opening = { tick: world.tick, qi: site.spiritQi, reading, occasionId: occasion.id };
}

/** Exact cited native readings stay available for an active rescue and the bounded clue history. */
export function expeditionOmenPinnedRuns(world: WorldState): Map<string, Set<number>> {
  const pinned = new Map<string, Set<number>>();
  for (const row of world.expeditionOmens.rows) {
    const keys = pinned.get(row.operatorId) ?? new Set<number>();
    keys.add(row.openedTick);
    pinned.set(row.operatorId, keys);
  }
  return pinned;
}

export function advanceExpeditionOmenRetention(world: WorldState): void {
  world.expeditionOmens.rows = world.expeditionOmens.rows.filter(row => world.tick <= row.measuredTick + EXPEDITION_OMEN_RETENTION ||
    world.occasions.some(o => o.id === row.opening?.occasionId && active(o)));
}

export function canJoinOmenExpedition(world: WorldState, actor: Cultivator, occasion: WorldOccasion, executionTick=world.tick): boolean {
  if (!occasion.omenId) return true;
  const row = rowAt(world, occasion);
  const known = row && learnedAt(row, actor.id, executionTick);
  return !!row && known !== undefined && !!nativeRun(world, row) && executionTick < occasion.registrationClosesTick &&
    liveRegistrationClue(row, executionTick) && !!anchor(world, row.siteId) && presentAtExpeditionAnchor(world, actor, row.siteId, executionTick);
}

export function canSeeOccasion(world: WorldState, viewer: Cultivator | undefined, occasion: WorldOccasion): boolean {
  if (!occasion.omenId) return true;
  if (!viewer || !world.cultivators.includes(viewer)) return false;
  const row = rowAt(world, occasion);
  // A bare retained participant list is not private knowledge after its original scoped proof has expired.
  if(!row||!nativeRun(world,row)||learnedAt(row,viewer.id,world.tick)===undefined)return false;
  return occasion.participantIds.includes(viewer.id) ||
    (occasion.status==='registration'&&liveRegistrationClue(row,world.tick)&&presentAtExpeditionAnchor(world,viewer,row.siteId));
}

export function canSeeOccasionLocation(world: WorldState, viewer: Cultivator | undefined, locationId: string): boolean {
  const location = world.locations.find(row => row.id === locationId);
  if (!location || !isScopedExpeditionGate(location)) return true;
  const linked = world.occasions.find(occasion => occasion.omenId === location.expeditionOmenId && occasion.locationId === locationId);
  return !!linked && canSeeOccasion(world, viewer, linked);
}

export interface ExpeditionOmenView {
  siteId: string;
  siteName: string;
  learnedTick: number;
  measuredTick: number;
  windowStartsTick: number;
  windowEndsTick: number;
  status: 'watching' | 'open' | 'missed' | 'closed';
  registrationClosesTick?: number;
}
export function projectExpeditionOmens(world: WorldState, viewer?: Cultivator): ExpeditionOmenView[] {
  if (!viewer || !world.cultivators.includes(viewer)) return [];
  const result: ExpeditionOmenView[] = [];
  for (const row of world.expeditionOmens.rows) {
    const learnedTick = learnedAt(row, viewer.id, world.tick);
    const site = anchor(world, row.siteId);
    if (learnedTick === undefined || !site || !nativeRun(world, row)) continue;
    const occasion = row.opening && world.occasions.find(o => o.id === row.opening?.occasionId && o.omenId === row.id);
    const open = !!occasion && active(occasion) && canSeeOccasion(world,viewer,occasion);
    const status = open ? 'open' : occasion?.participantIds.includes(viewer.id) ? 'closed' :
      world.tick > row.windowEndsTick ? 'missed' : 'watching';
    result.push({ siteId: site.id, siteName: site.name, learnedTick, measuredTick: row.measuredTick,
      windowStartsTick: row.windowStartsTick, windowEndsTick: row.windowEndsTick, status,
      ...(open ? { registrationClosesTick: occasion.registrationClosesTick } : {}) });
  }
  return result;
}
