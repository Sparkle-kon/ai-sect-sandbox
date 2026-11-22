import { activeDanxiaMedicineEscort, danxiaMedicineActedThisTick } from '../engine/danxiaMedicineTerms';
import { activeSiegeForActor } from '../engine/diplomacyEngine';
import { disasterShelterLocksTravel } from '../engine/disasterShelterCheckpoint';
import { activeEscortForActor } from '../engine/escortEngine';
import { isScopedExpeditionGate } from '../engine/expeditionOmenTerms';
import { activeOccasionForActor } from '../engine/occasionEngine';
import { activePilgrimageForActor, pilgrimageActedThisTick } from '../engine/pilgrimageEngine';
import { createPublicDialogueResolver } from '../engine/publicDialogueProvenance';
import { activeRelocationForActor } from '../engine/relocationEngine';
import { activeCourierForActor, courierActedThisTick } from '../engine/sealedCourierEngine';
import { sparringLocksActor } from '../engine/sparringEngine';
import { terrainTileAt } from '../engine/terrainEngine';
import { isTribulationActive, tribulationTarget } from '../engine/tribulationEngine';
import { onLowerPlane } from '../engine/upperPassageIsolation';
import type { Cultivator, WorldState } from '../types/world';
import type { MapCombatVfxPlan } from './mapCombatVfxView';
import { mapTransitActorIds } from './mapConvoyView';
import type { createTerrainMapView } from './terrainMapView';

export type MapActorBadgeKind = 'critical' | 'ready' | 'heart-demon';

export interface MapActorBadgeFact {
  actorId: string;
  statuses: readonly MapActorBadgeKind[];
  quote?: string;
}

type Terrain = ReturnType<typeof createTerrainMapView>;
const CRITICAL_HEALTH = .45; // The utility recovery gate takes precedence over breakthrough below this boundary.
const READY_QI = 92; // Utility and legal decision trace agree at 92; major tribulation merely permits 90.
const MAX_QUOTE_GLYPHS = 22;

function uniqueById<T extends { id: string }>(rows: readonly T[]) {
  const result = new Map<string, T | undefined>();
  for (const row of rows) result.set(row.id, result.has(row.id) ? undefined : row);
  return result;
}

function heartDemon(world: WorldState, actor: Cultivator) {
  const trial = actor.tribulation;
  return trial?.stage === 'heart_demon' && Number.isSafeInteger(trial.startedTick) &&
    trial.startedTick < world.tick && trial.id === `trial-${actor.id}-${trial.startedTick}` &&
    trial.resolvedTick === undefined && trial.lastActedTick !== undefined &&
    trial.lastActedTick > trial.startedTick && trial.lastActedTick <= world.tick &&
    Number.isSafeInteger(trial.totalWaves) && trial.totalWaves >= 3 && trial.totalWaves <= 6 &&
    trial.nextWave === trial.totalWaves + 1 && tribulationTarget(actor) === trial.targetRealm;
}

function isBreakthroughReady(world: WorldState, actor: Cultivator) {
  if (!Number.isFinite(actor.qiProgress) || actor.qiProgress < READY_QI || actor.qiProgress > 100 ||
      !Number.isSafeInteger(actor.realmStage) || actor.realmStage < 1 || actor.realmStage > 9 ||
      (actor.realm === '渡劫' && actor.realmStage === 9) || isTribulationActive(actor)) return false;
  const prior = actor.tribulation;
  const waiting = prior?.stage === 'failed' && prior.resolvedTick !== undefined && world.tick - prior.resolvedTick < 3;
  if (waiting && tribulationTarget(actor)) return false;
  // Real execution locks, not stale action-display labels or a new model inference.
  return !(activeDanxiaMedicineEscort(world, actor) || danxiaMedicineActedThisTick(world, actor) ||
    activeEscortForActor(world, actor) || activeRelocationForActor(world, actor) ||
    activeCourierForActor(world, actor) || courierActedThisTick(world, actor) ||
    activePilgrimageForActor(world, actor) || pilgrimageActedThisTick(world, actor) ||
    activeOccasionForActor(world, actor) || activeSiegeForActor(world, actor) ||
    disasterShelterLocksTravel(world, actor) || sparringLocksActor(world, actor));
}

function quoteExcerpt(text: string) {
  if (/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069<>]/u.test(text)) return undefined;
  const glyphs = Array.from(text.trim());
  if (glyphs.length < 2) return undefined;
  return glyphs.length > MAX_QUOTE_GLYPHS ? glyphs.slice(0, MAX_QUOTE_GLYPHS - 1).join('') + '…' : glyphs.join('');
}

/** Read only stable, direct current actor facts; the painter decides which solo markers actually fit. */
export function buildMapActorBadgeView(
  world: WorldState, view: Terrain, combat: MapCombatVfxPlan, includeQuote: boolean,
): ReadonlyMap<string, MapActorBadgeFact> {
  const actors = uniqueById(world.cultivators);
  const actualSites = uniqueById(world.locations);
  const sites = new Map(view.seenLocations.filter(site => {
    const tile = terrainTileAt(world, site.x, site.y);
    return actualSites.get(site.id) === site && !isScopedExpeditionGate(site) &&
      view.isCurrentLocation(site.id) && !!tile && view.tileState(tile) === 'visible' && (!view.current || view.current.has(tile.id));
  }).map(site => [site.id, site]));
  const travellers = mapTransitActorIds(world);
  const direct = new Map<string, Cultivator>();
  const result = new Map<string, MapActorBadgeFact>();
  for (const actor of view.liveActors) {
    if (actor !== actors.get(actor.id) || !onLowerPlane(actor) || !actor.alive ||
        !(Number.isFinite(actor.hp) && actor.hp > 0 && Number.isFinite(actor.maxHp) && actor.maxHp > 0) ||
        !sites.has(actor.locationId) || travellers.has(actor.id) || view.trailPositions.has(actor.id)) continue;
    direct.set(actor.id, actor);
    const statuses: MapActorBadgeKind[] = [];
    if (actor.hp < actor.maxHp * CRITICAL_HEALTH) statuses.push('critical');
    else if (isBreakthroughReady(world, actor)) statuses.push('ready');
    if (heartDemon(world, actor)) statuses.push('heart-demon');
    if (statuses.length) result.set(actor.id, { actorId: actor.id, statuses });
  }
  if (!includeQuote || world.mapPresentation.tick !== world.tick || !combat.effects.some(row => row.kind === 'clash')) return result;

  const events = uniqueById(world.events);
  const proofs = createPublicDialogueResolver(world);
  const actualEffects = uniqueById(world.mapPresentation.effects);
  for (const effect of uniqueById(combat.effects).values()) {
    if (!effect || effect.kind !== 'clash' || effect.tick !== world.tick || !effect.id.endsWith('-clash')) continue;
    const rawEffect = actualEffects.get(effect.id);
    const [speakerId, opponentId] = effect.actorIds;
    const actor = direct.get(speakerId);
    const site = sites.get(effect.locationId);
    if (!actor || !site || actor.locationId !== site.id || effect.location !== site ||
        !rawEffect || rawEffect.tick !== world.tick || rawEffect.kind !== 'clash' || rawEffect.locationId !== site.id ||
        rawEffect.actorIds.length !== 2 || rawEffect.actorIds[0] !== speakerId || rawEffect.actorIds[1] !== opponentId ||
        result.get(actor.id)?.quote) continue;
    const source = events.get(effect.id.slice(0, -'-clash'.length));
    if (!source || source.tick !== world.tick || source.year !== world.year || source.month !== world.month ||
        source.locationId !== site.id || source.witnessScope === 'participants' || !opponentId || speakerId === opponentId ||
        source.actorIds.length !== 2 || source.actorIds[0] !== speakerId || source.actorIds[1] !== opponentId ||
        (source.duelWinnerId !== speakerId && source.duelWinnerId !== opponentId) ||
        !(source.category === 'combat' && source.id === `evt-${world.tick}-${speakerId}-duel` ||
          source.category === 'death' && source.id === `evt-${world.tick}-${speakerId}-kill`)) continue;
    const proof = proofs.event(source.id);
    if (proof?.status !== 'verified' || proof.surface !== 'event' || proof.kind !== 'combat' || proof.tick !== world.tick) continue;
    const first = proof.turns[0];
    const quote = first?.ordinal === 1 && first.speakerId === actor.id ? quoteExcerpt(first.text) : undefined;
    if (quote) result.set(actor.id, { actorId: actor.id, statuses: result.get(actor.id)?.statuses ?? [], quote });
  }
  return result;
}
