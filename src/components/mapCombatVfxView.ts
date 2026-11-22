import { FORBIDDEN_ART_IDS } from '../types/forbiddenArt';
import { isScopedExpeditionGate } from '../engine/expeditionOmenTerms';
import { isTribulationActive, tribulationTarget } from '../engine/tribulationEngine';
import { terrainTileAt } from '../engine/terrainEngine';
import { isUpperPassageEvent, onLowerPlane } from '../engine/upperPassageIsolation';
import type { Cultivator, LocationNode, TribulationTrial, WorldEvent, WorldState } from '../types/world';
import { mapTransitActorIds } from './mapConvoyView';
import { projectMapBattlefields, type MapBattlefield } from './mapBattlefieldView';
import type { buildMapPresentation } from './mapPresentationView';
import type { createTerrainMapView } from './terrainMapView';

type Presentation = ReturnType<typeof buildMapPresentation>;
type Terrain = ReturnType<typeof createTerrainMapView>;
type PresentationEffect = Presentation['effects'][number];
export interface MapCombatEffect extends PresentationEffect {
  amount?: number;
  wave?: number;
  totalWaves?: number;
  majorAdvance?: boolean;
  forbiddenArtAccent?: true;
}

export interface MapCombatVfxPlan {
  effects: MapCombatEffect[];
  storms: readonly { id: string; location: LocationNode; wave: number; totalWaves: number }[];
  sieges: readonly { id: string; location: LocationNode; impact: boolean }[];
  hasTransient: boolean;
  battlefields?: readonly MapBattlefield[];
}

type EffectProof = Omit<MapCombatEffect, 'location' | 'tick'> & { locationId: string };
const sameActors = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
const living = (actor: Cultivator) => actor.alive && actor.hp > 0;
const positiveAmount = (amount: number) => Number.isFinite(amount) && amount > 0;

function uniqueById<T extends { id: string }>(rows: readonly T[]) {
  const index = new Map<string, T | undefined>();
  for (const row of rows) index.set(row.id, index.has(row.id) ? undefined : row);
  return index;
}

function genuineTrial(actor: Cultivator, tick: number): TribulationTrial | undefined {
  const row = actor.tribulation;
  if (row && row.id === `trial-${actor.id}-${row.startedTick}` && row.startedTick <= tick &&
      Number.isSafeInteger(row.totalWaves) && row.totalWaves >= 3 && row.totalWaves <= 6 &&
      Number.isSafeInteger(row.nextWave) && row.nextWave >= 1 && row.nextWave <= row.totalWaves + 1) return row;
  return undefined;
}

/** Shared source for the combat painter and accessible descriptions. No saved prose or net HP delta is evidence. */
export function buildMapCombatVfxPlan(world: WorldState, view: Terrain, presentation: Presentation): MapCombatVfxPlan {
  const { tick, year, month } = world;
  const actualSites = uniqueById(world.locations);
  const sites = new Map(view.seenLocations.filter((site) => {
    const tile = terrainTileAt(world, site.x, site.y);
    return actualSites.get(site.id) === site && !isScopedExpeditionGate(site) && view.isCurrentLocation(site.id) &&
      !!tile && view.tileState(tile) === 'visible' && (!view.current || view.current.has(tile.id));
  }).map((site) => [site.id, site]));
  const rawEvents = uniqueById(world.events);
  const actors = uniqueById(world.cultivators);
  const publicSource = (id: string): WorldEvent | undefined => {
    const event = rawEvents.get(id);
    return event?.tick === tick && event.year === year && event.month === month && event.locationId && sites.has(event.locationId) &&
      event.witnessScope !== 'participants' && !isUpperPassageEvent(event) ? event : undefined;
  };
  const visibleActors = new Set(view.liveActors);
  const travellers = mapTransitActorIds(world);
  const grounded = (actor: Cultivator) => onLowerPlane(actor) && !travellers.has(actor.id) && !view.trailPositions.has(actor.id);

  // This decorates only an already-proven native duel clash, never a free-standing combat or damage mark.
  const hasCommittedForbiddenArt = (event: WorldEvent, locationId: string) => {
    const scar = event.forbiddenArt;
    if (!scar || scar.siteId !== locationId || scar.tick !== tick || !Number.isSafeInteger(scar.openedTick) ||
        scar.openedTick < 0 || scar.openedTick > tick || !scar.id || !scar.contactId || !scar.artifactId ||
        !FORBIDDEN_ART_IDS.includes(scar.artId) || !['player', 'utility', 'model'].includes(scar.origin) ||
        scar.ownerId === scar.opponentId || !event.actorIds.includes(scar.ownerId) || !event.actorIds.includes(scar.opponentId)) return false;
    const paid = [scar.paid?.hp, scar.paid?.lifespan, scar.paid?.durability];
    if (!paid.every(amount => Number.isFinite(amount) && amount >= 0) || !paid.some(positiveAmount)) return false;
    const owner = actors.get(scar.ownerId), opponent = actors.get(scar.opponentId);
    if (!owner || !opponent || !grounded(owner) || !grounded(opponent) || owner.locationId !== locationId ||
        opponent.locationId !== locationId) return false;
    // A native kill can leave one participant absent from the living actor layer. Otherwise both must be visible.
    const visibleOrNativeFallen = (actor: Cultivator) => visibleActors.has(actor) ||
      (event.category === 'death' && !actor.alive && actor.hp === 0 && event.duelWinnerId !== actor.id);
    if (!visibleOrNativeFallen(owner) || !visibleOrNativeFallen(opponent)) return false;
    return scar.result === 'reversal' ? event.duelWinnerId === owner.id :
      scar.result === 'fallen' ? event.category === 'death' && !owner.alive && owner.hp === 0 && event.duelWinnerId !== owner.id :
      scar.result === 'survived' && living(owner);
  };

  const storms: MapCombatVfxPlan['storms'][number][] = [];
  for (const actor of view.liveActors) {
    if (actor !== actors.get(actor.id) || !living(actor) || !grounded(actor) || !isTribulationActive(actor)) continue;
    const trial = genuineTrial(actor, tick);
    const site = sites.get(actor.locationId);
    if (!trial || !site || trial.stage !== 'lightning' || trial.nextWave > trial.totalWaves ||
      trial.resolvedTick !== undefined || tribulationTarget(actor) !== trial.targetRealm) continue;
    const startId = `evt-${trial.startedTick}-${actor.id}-tribulation-start`;
    // A live trial may outlast the retained event window. If its start is still present,
    // don't let the durable status override explicit private or contested ancestry.
    if (trial.startedTick === tick || rawEvents.has(startId)) {
      const start = rawEvents.get(startId);
      if (!start || start.tick !== trial.startedTick || start.witnessScope === 'participants' ||
          (trial.startedTick === tick && (start.year !== year || start.month !== month)) ||
          start.category !== 'heavenly' || start.locationId !== site.id || !sameActors(start.actorIds, [actor.id])) continue;
    }
    storms.push({ id: trial.id, location: site, wave: trial.nextWave, totalWaves: trial.totalWaves });
  }

  const sieges: MapCombatVfxPlan['sieges'][number][] = [];
  const sects = uniqueById(world.sects);
  for (const siege of uniqueById(world.sieges).values()) {
    if (!siege || siege.status !== 'sieging' || siege.startedTick >= tick || siege.lastResolvedTick === undefined ||
        siege.lastResolvedTick > tick || siege.lastResolvedTick <= siege.startedTick || siege.attackerSectId === siege.defenderSectId) continue;
    const site = sites.get(siege.destinationId);
    if (!site || !sects.get(siege.attackerSectId) || sects.get(siege.defenderSectId)?.headquartersId !== site.id ||
        (site.ownerSectId && site.ownerSectId !== siege.defenderSectId)) continue;
    // A public campaign status is not proof combat began at this site until a real living raider is there.
    if (!siege.participantIds.some((id) => {
      const actor = actors.get(id);
      return !!actor && living(actor) && grounded(actor) && actor.locationId === site.id;
    })) continue;
    const source = publicSource(`evt-${tick}-dip-${siege.id}`);
    const impact = siege.lastResolvedTick === tick && siege.rounds > 0 && source?.category === 'diplomacy' &&
      source.locationId === site.id && source.title === '护山阵接战' && source.actorIds.some((id) => siege.participantIds.includes(id));
    sieges.push({ id: siege.id, location: site, impact });
  }

  const proofs = new Map<string, EffectProof | undefined>();
  const add = (row: EffectProof) => proofs.set(row.id, proofs.has(row.id) ? undefined : row);
  if (world.mapPresentation.tick === tick) {
    for (const id of rawEvents.keys()) {
      const event = publicSource(id);
      if (!event?.locationId) continue;
      const { actorIds, locationId } = event;
      if (actorIds.some((actorId) => {
        const actor = actors.get(actorId);
        return !actor || !onLowerPlane(actor);
      })) continue;
      const [first, second] = actorIds;
      const lead = first === undefined ? undefined : actors.get(first);
      const prefix = `evt-${tick}-${first}`;
      const lone = !!lead && actorIds.length === 1;
      const damageRows = event.damage ?? [];
      if (first && second && actorIds.length === 2 && second !== first && (event.duelWinnerId === first || event.duelWinnerId === second) &&
          ((event.id === prefix + '-duel' && event.category === 'combat') ||
           (event.id === prefix + '-kill' && event.category === 'death'))) {
        add({ id: id + '-clash', kind: 'clash', locationId, actorIds,
          ...(hasCommittedForbiddenArt(event, locationId) ? { forbiddenArtAccent: true } : {}) });
      }

      const trial = lone && lead ? genuineTrial(lead, tick) : undefined;
      const trialAtSite = !!lead && grounded(lead) && lead.locationId === locationId;
      const strikePrefix = `evt-god-strike-${tick}-`;
      const strike = lone && trialAtSite && event.category === 'heavenly' && id.startsWith(strikePrefix) &&
        /^[1-9]\d*$/.test(id.slice(strikePrefix.length));
      if (strike) add({ id: id + '-lightning', kind: 'lightning', locationId, actorIds, text: '天道雷击' });
      if (lone && lead && trial && trialAtSite && trial.startedTick < tick && trial.lastActedTick === tick) {
        const hit = damageRows.length === 1 && damageRows[0].cultivatorId === first && positiveAmount(damageRows[0].amount);
        const survivedWave = hit && living(lead) && isTribulationActive(lead) && event.category === 'heavenly' &&
          trial.nextWave > 1 && id === prefix + `-tribulation-wave-${trial.nextWave - 1}`;
        const lethalWave = hit && !lead.alive && lead.hp === 0 && event.category === 'death' &&
          trial.stage === 'failed' && trial.resolvedTick === tick && trial.nextWave <= trial.totalWaves &&
          id === prefix + '-tribulation-failure';
        if (survivedWave || lethalWave) {
          const wave = lethalWave ? trial.nextWave : trial.nextWave - 1;
          add({ id: id + '-lightning', kind: 'lightning', locationId, actorIds, text: `第${wave}重雷劫`, wave, totalWaves: trial.totalWaves });
        }
      }
      if (lone && lead && living(lead) && trialAtSite && event.category === 'breakthrough') {
        const ordinary = id === prefix + '-break';
        const trialPassed = id === prefix + '-tribulation-passed' && trial?.stage === 'passed' &&
          trial.resolvedTick === tick && trial.targetRealm === lead.realm && lead.realmStage === 1;
        if (ordinary || trialPassed) add({ id: prefix + '-map-breakthrough', kind: 'breakthrough', locationId, actorIds,
          text: `${lead.realm}${lead.realmStage}层`, majorAdvance: lead.realmStage === 1 });
      }

      // The source receipt is the exact applied hit. Exclude source-less month net HP deltas.
      if (id.startsWith('evt-god-strike-') && !strike) continue;
      for (const { cultivatorId, amount } of damageRows) {
        if (!positiveAmount(amount) || !actorIds.includes(cultivatorId)) continue;
        add({ id: `${id}-damage-${cultivatorId}`, kind: 'damage', locationId, actorIds: [cultivatorId],
          text: `−${amount} HP`, amount });
      }
    }
  }

  const effects: MapCombatEffect[] = [];
  for (const row of uniqueById(presentation.effects).values()) {
    if (!row || row.tick !== tick) continue;
    const proof = proofs.get(row.id);
    const location = sites.get(row.locationId);
    if (!proof || !location || location !== row.location || proof.kind !== row.kind ||
        proof.locationId !== location.id || !sameActors(proof.actorIds, row.actorIds)) continue;
    effects.push({ ...proof, actorIds: [...proof.actorIds], tick, location });
  }
  const battlefields = projectMapBattlefields(world, sites);
  return { effects, storms, sieges, ...(battlefields.length ? { battlefields } : {}), hasTransient: effects.length > 0 || sieges.some(({ impact }) => impact) };
}
