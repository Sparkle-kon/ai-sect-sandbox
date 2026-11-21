import { cloneWorldWithColdHistory } from './coldHistoryEngine';
import { courierCheckpoint, reconcileCourierDeaths } from './sealedCourierEngine';
import { advanceHouseholds } from './householdEngine';
import { advancePilgrimages, pilgrimageCheckpoint } from './pilgrimageEngine';
import { advanceSanctuaries } from './sanctuaryEngine';
import { advanceResearch } from './researchEngine';
import { activeEscortForActor } from './escortEngine';
import { reconcileRelicCustody } from './relicEngine';
import { recordNewDeathsForReincarnation } from './reincarnationRuntime';
import { activeRelocationForActor } from './relocationEngine';
import { advanceEstates } from './estateEngine';
import { archiveChronicleEvents } from './novelGenerator';
import type { Cultivator, GodBrushKind, LocationNode, MapHazard, MapPoint, MapTile, WorldEvent, WorldState } from '../types/world';
import { deriveMapPresentation } from './mapMotionEngine';
import { recordMemory } from './memoryEngine';
import { dropInheritance } from './techniqueEngine';
import { terrainTileAt } from './terrainEngine';

const BRUSH_CELL_LIMIT = 18;
const INPUT_LIMIT = 4096;
const BRUSH_TITLES: Record<GodBrushKind, string> = {
  paint_vein: '天道点化灵脉', meteor: '星陨降地', beast_tide: '兽潮席卷', cursed_miasma: '瘴气蔓延',
};
const DURATION: Record<MapHazard['kind'], number> = { meteor: 3, beast_tide: 4, cursed_miasma: 6 };
type Hit = NonNullable<WorldEvent['damage']>[number];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function peopleAtTile(world: WorldState, tileId: string): Cultivator[] {
  const matching = new Set(world.locations.filter((site) => terrainTileAt(world, site.x, site.y)?.id === tileId).map(({ id }) => id));
  return world.cultivators.filter((person) => {
    if (!person.alive || person.hp <= 0) return false;
    const convoy = activeRelocationForActor(world, person) ?? activeEscortForActor(world, person);
    const checkpoint = convoy?.path[convoy.pathIndex] ?? pilgrimageCheckpoint(world, person) ?? courierCheckpoint(world, person);
    return checkpoint ? terrainTileAt(world, checkpoint.x, checkpoint.y)?.id === tileId : matching.has(person.locationId);
  });
}

function hurt(world: WorldState, people: Cultivator[], amount: (person: Cultivator) => number,
  source: string, nonlethal = false): Hit[] {
  const hits: Hit[] = [];
  for (const person of people) {
    const old = person.hp;
    person.hp = Math.max(nonlethal ? 1 : 0, old - amount(person));
    if (person.hp === old) continue;
    hits.push({ cultivatorId: person.id, amount: old - person.hp });
    recordMemory(person, world.tick, `${source}波及自身，损失${old - person.hp}气血。`, 7, 'heavenly', -4);
    if (person.hp === 0) {
      person.alive = false;
      const trial = person.tribulation;
      if (trial && (trial.stage === 'lightning' || trial.stage === 'heart_demon')) {
        trial.stage = 'failed'; trial.resolvedTick = world.tick; trial.lastOutcome = source + '致渡劫中断。';
      }
      dropInheritance(person, world);
    }
  }
  return hits;
}

function nodesIn(world: WorldState, tileId: string): LocationNode[] {
  return world.locations.filter((site) => terrainTileAt(world, site.x, site.y)?.id === tileId);
}

function paintVein(world: WorldState, tile: MapTile): LocationNode[] {
  tile.spiritQi = Math.min(100, tile.spiritQi + 20);
  tile.biome = '灵山';
  const sites = nodesIn(world, tile.id);
  if (sites.length) {
    for (const site of sites) site.spiritQi = Math.min(100, site.spiritQi + 20);
    return sites;
  }
  const site: LocationNode = { id: `brush-vein-${tile.id}`, name: `新生灵脉·${tile.col + 1}/${tile.row + 1}`,
    x: (tile.col + .5) * 1000 / world.terrain.columns, y: (tile.row + .5) * 600 / world.terrain.rows,
    type: 'spirit_vein', spiritRoot: '土', spiritQi: tile.spiritQi, ownerSectId: tile.ownerSectId,
    inheritanceScrolls: [], herbs: { jade_leaf: 1, earth_root: 2, star_bloom: 0, shadow_moss: 0 },
    herbCapacity: { jade_leaf: 2, earth_root: 3, star_bloom: 0, shadow_moss: 0 }, furnaceGrade: 0,
    description: '天道以神笔点化，沉睡灵脉重新涌流。' };
  world.locations.push(site);
  return [site];
}

export function applyMapBrush(prev: WorldState, kind: GodBrushKind, points: MapPoint[]): WorldState {
  if (!Object.prototype.hasOwnProperty.call(BRUSH_TITLES, kind)) return prev;
  const selected = new Set<string>();
  for (const point of points.slice(0, INPUT_LIMIT)) {
    const tile = terrainTileAt(prev, point.x, point.y);
    if (!tile) continue;
    selected.add(tile.id);
    if (selected.size >= BRUSH_CELL_LIMIT) break;
  }
  if (!selected.size) return prev;
  const world = cloneWorldWithColdHistory(prev);
  const sequence = ++world.interventionSequence;
  const brushEvents: WorldEvent[] = [];
  for (const tile of world.terrain.tiles) {
    if (!selected.has(tile.id)) continue;
    const sites = kind === 'paint_vein' ? paintVein(world, tile) : nodesIn(world, tile.id);
    let hits: Hit[] = [];
    if (kind !== 'paint_vein') {
      const prior = world.mapHazards.find((item) => item.tileId === tile.id && item.kind === kind && world.tick < item.expiresTick);
      const intensity = Math.min(3, (prior?.intensity ?? 0) + 1);
      const hazard: MapHazard = { id: `hazard-${sequence}-${tile.id}`, kind, tileId: tile.id, intensity,
        createdTick: world.tick, expiresTick: world.tick + DURATION[kind] };
      world.mapHazards = world.mapHazards.filter((item) => item.tileId !== tile.id || item.kind !== kind);
      world.mapHazards.push(hazard);
      if (kind === 'meteor') {
        tile.spiritQi = clamp(tile.spiritQi - 24, 5, 100);
        tile.biome = '荒漠';
        for (const site of sites) site.spiritQi = clamp(site.spiritQi - 18, 5, 100);
        hits = hurt(world, peopleAtTile(world, tile.id), (person) => Math.max(1, Math.round(person.maxHp * (.19 + .045 * intensity))), BRUSH_TITLES[kind]);
      }
    }
    const locationId = sites[0]?.id;
    const details = kind === 'paint_vein' ? `灵气上升至${tile.spiritQi}。` :
      kind === 'meteor' ? `地脉灵气下降，${hits.length}名修士受波及。` : '灾变将持续数轮，进入受影响地块的修士也会遭遇。';
    brushEvents.push({
      id: `evt-brush-${sequence}-${tile.id}`, tick: world.tick, year: world.year, month: world.month,
      title: BRUSH_TITLES[kind], description: `地块(${tile.col + 1}, ${tile.row + 1})：${details}`,
      category: hits.some(({ cultivatorId }) => world.cultivators.some((person) => person.id === cultivatorId && !person.alive)) ? 'death' : 'heavenly',
      actorIds: hits.map(({ cultivatorId }) => cultivatorId), locationId, ...(hits.length ? { damage: hits } : {}),
    });
  }
  brushEvents.push(...advanceSanctuaries(world), ...advanceResearch(world), ...advancePilgrimages(world), ...reconcileCourierDeaths(world), ...advanceHouseholds(world), ...advanceEstates(world));
  reconcileRelicCustody(world);
  recordNewDeathsForReincarnation(prev, world, brushEvents);
  archiveChronicleEvents(world, brushEvents);
  world.events = [...brushEvents, ...world.events].slice(0, 120);
  world.mapPresentation = deriveMapPresentation(prev, world, brushEvents);
  return world;
}

/** Tick hook; remove expired marks, and apply active hazards to actual present cultivators. */
export function advanceMapHazards(world: WorldState): WorldEvent[] {
  const tileIds = new Set(world.terrain.tiles.map(({ id }) => id));
  world.mapHazards = world.mapHazards.filter((hazard) => hazard.expiresTick > world.tick && tileIds.has(hazard.tileId));
  const events: WorldEvent[] = [];
  for (const hazard of world.mapHazards) {
    if (hazard.kind === 'meteor' || hazard.createdTick >= world.tick) continue;
    const id = `evt-${world.tick}-${hazard.id}`;
    if (world.events.some((entry) => entry.id === id)) continue;
    const people = peopleAtTile(world, hazard.tileId);
    const intensity = clamp(hazard.intensity, 1, 3);
    const damage = hurt(world, people, (person) => Math.max(1, Math.round(person.maxHp *
      (hazard.kind === 'beast_tide' ? .06 + intensity * .025 : .035 + intensity * .022))), BRUSH_TITLES[hazard.kind],
      hazard.kind === 'beast_tide');
    if (!damage.length) continue;
    const defeated = people.some((person) => !person.alive);
    events.push({ id, tick: world.tick, year: world.year, month: world.month, title: BRUSH_TITLES[hazard.kind],
      description: `${hazard.kind === 'beast_tide' ? '兽群扑向当地修士' : '瘴气侵蚀当地修士'}，${damage.length}人受创${defeated ? '，有人陨落' : ''}。`,
      category: defeated ? 'death' : 'heavenly', actorIds: damage.map(({ cultivatorId }) => cultivatorId),
      damage, locationId: people[0]?.locationId });
  }
  return events;
}
