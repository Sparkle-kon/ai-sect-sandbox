import {recordWildMigration} from './wildMigrationStamp';
import { courierCheckpoint } from './sealedCourierEngine';
import { habitatCanReceiveWildBeast, isRewildingAcclimating } from './habitatEngine';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { weatherHabitatScore } from './weatherEngine';
import type { Cultivator, LLMDecisionPayload, LocationNode, SpiritBeast, WorldEvent, WorldState } from '../types/world';
import { activeSiegeForActor } from './diplomacyEngine';
import { recordMemory } from './memoryEngine';
import { terrainTileAt } from './terrainEngine';
import { dropInheritance } from './techniqueEngine';
import { isTribulationActive } from './tribulationEngine';

const RULES: Record<SpiritBeast['kind'], { name: string; hp: number; power: number; risk: number }> = {
  妖兽: { name: '玄纹灵狼', hp: 240, power: 180, risk: .36 },
  凶兽: { name: '赤瞳岩狰', hp: 440, power: 330, risk: .57 },
  瑞兽: { name: '踏霞灵鹿', hp: 180, power: 120, risk: 0 },
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const wilderness = (node: LocationNode) => node.type === 'spirit_vein' || node.type === 'secret_realm' || node.type === 'abyss';

export function spawnInitialBeasts(locations: LocationNode[]): SpiritBeast[] {
  return locations.filter(wilderness).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 8).map((place, index) => {
    const kind = place.type === 'abyss' || place.spiritRoot === '暗' ? '凶兽' :
      place.spiritRoot === '木' || place.spiritRoot === '水' || place.spiritRoot === '天灵根' ? '瑞兽' : '妖兽';
    const rule = RULES[kind];
    return { id: `beast-${place.id}`, name: rule.name, kind, locationId: place.id, homeLocationId: place.id,
      hp: rule.hp, maxHp: rule.hp, power: rule.power, cultivation: 5, alive: true, nextActionTick: 18 + index * 2 };
  });
}

function ownerPet(world: WorldState, actor: Cultivator): SpiritBeast | undefined {
  return world.spiritBeasts.find((beast) => beast.alive && beast.hp > 0 && beast.tamedBy === actor.id);
}

function occupied(world: WorldState, actor: Cultivator): boolean {
  return isTribulationActive(actor) || Boolean(activeSiegeForActor(world, actor)) ||
    world.occasions.some((occasion) => (occasion.status === 'registration' || occasion.status === 'running') &&
      occasion.participantIds.includes(actor.id));
}

function feed(actor: Cultivator, beast: SpiritBeast): 'jade_leaf' | 'star_bloom' | undefined {
  if (beast.kind === '凶兽') return actor.herbs.star_bloom >= 2 ? 'star_bloom' : undefined;
  return actor.herbs.jade_leaf >= 1 ? 'jade_leaf' : undefined;
}

export function availableBeastTames(actor: Cultivator, world: WorldState): Array<{ action: 'TAME_BEAST'; targetBeastId: string }> {
  if (!live(actor) || actor.hp / Math.max(1, actor.maxHp) < .25 || occupied(world, actor) || ownerPet(world, actor) ||
      !world.locations.some(({ id }) => id === actor.locationId)) return [];
  return world.spiritBeasts.filter((beast) => beast.alive && beast.hp > 0 && !beast.tamedBy && beast.locationId === actor.locationId && !isRewildingAcclimating(world, beast.id) &&
    (beast.kind !== '凶兽' || (actor.realm !== '练气' && actor.realm !== '筑基')) && feed(actor, beast))
    .map(({ id }) => ({ action: 'TAME_BEAST', targetBeastId: id }));
}

export function guardingHerbBeast(world: WorldState, actor: Cultivator): SpiritBeast | undefined {
  return world.spiritBeasts.find((beast) => beast.alive && beast.hp > 0 && !beast.tamedBy && beast.kind !== '瑞兽' &&
    world.tick >= 18 && beast.locationId === actor.locationId && beast.locationId === beast.homeLocationId &&
    // Adept cultivators overpower minor beasts; greater risks remain meaningful.
    actor.combatPower < beast.power * 1.75);
}

export function petCombatBonus(world: WorldState, actor: Cultivator): number {
  const pet = ownerPet(world, actor);
  if (!live(actor) || !pet || pet.locationId !== actor.locationId) return 1;
  const stamina = clamp(pet.hp / pet.maxHp, 0, 1);
  return 1 + (.035 + Math.min(.095, pet.power / 5_000) + pet.cultivation * .00035) * stamina;
}

function event(world: WorldState, suffix: string, title: string, description: string, actorIds: string[],
  locationId: string, category: WorldEvent['category'] = 'heavenly'): WorldEvent {
  return { id: `evt-${world.tick}-beast-${suffix}`, tick: world.tick, year: world.year, month: world.month,
    title, description, actorIds, locationId, category };
}

export function tameSpiritBeast(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload, rng: () => number): WorldEvent | null {
  if (decision.chosenAction !== 'TAME_BEAST' || !availableBeastTames(actor, world).some((option) => option.targetBeastId === decision.targetBeastId)) return null;
  const beast = world.spiritBeasts.find(({ id }) => id === decision.targetBeastId)!;
  const herb = feed(actor, beast)!;
  actor.herbs[herb] -= beast.kind === '凶兽' ? 2 : 1;
  const baseline = beast.kind === '瑞兽' ? .69 : beast.kind === '妖兽' ? .47 : .28;
  const success = rng() < clamp(baseline + Math.min(.27, actor.combatPower / Math.max(1, beast.power) * .11) +
    (actor.personality === '逍遥' || actor.personality === '苟道' ? .08 : 0), .1, .95);
  if (success) {
    beast.tamedBy = actor.id;
    beast.nextActionTick = world.tick + 2;
  } else {
    beast.nextActionTick = Math.max(beast.nextActionTick, world.tick + 1);
  }
  const description = success ? `${actor.name}以灵草建立信任，${beast.name}认其为主，往后同路助战。` :
    `${actor.name}献上灵草，${beast.name}仍不肯亲近，灵草已消耗。`;
  recordMemory(actor, world.tick, description, success ? 8 : 5, 'cultivation', success ? 4 : -1);
  return event(world, `tame-${beast.id}-${actor.id}-${actor.memorySequence}`, success ? '灵兽认主' : '驯兽未成',
    description, [actor.id], actor.locationId);
}

function ensureTide(world: WorldState, beast: SpiritBeast, place: LocationNode): WorldEvent | undefined {
  if (beast.kind !== '凶兽' || world.tick % 36 !== 0) return undefined;
  const tile = terrainTileAt(world, place.x, place.y);
  if (!tile || world.mapHazards.some((hazard) => hazard.kind === 'beast_tide' && hazard.tileId === tile.id && hazard.expiresTick > world.tick)) return undefined;
  world.mapHazards.push({ id: `natural-beast-tide-${world.tick}-${beast.id}`, kind: 'beast_tide', tileId: tile.id,
    createdTick: world.tick, expiresTick: world.tick + 4, intensity: 1 });
  return event(world, `tide-${beast.id}`, '凶兽引动兽潮', `${beast.name}长啸，${place.name}附近即将爆发短暂兽潮。`, [], place.id);
}

export function advanceSpiritBeasts(world: WorldState, rng: () => number): WorldEvent[] {
  const results: WorldEvent[] = [];
  const sites = world.locations.filter(wilderness);
  for (const beast of world.spiritBeasts) {
    if (!beast.alive || beast.hp <= 0) continue;
    const owner = beast.tamedBy ? world.cultivators.find((person) => person.id === beast.tamedBy && live(person)) : undefined;
    if (owner) {
      if (world.locations.some(({ id }) => id === owner.locationId)) beast.locationId = owner.locationId;
    } else {
      if (beast.tamedBy) delete beast.tamedBy;
      if (sites.length && !sites.some(({ id }) => id === beast.locationId)) {
        const capacity = sites.filter(({ id }) => habitatCanReceiveWildBeast(world, id, beast.id));
        // When every habitat is full, an orphan remains a real wild animal at its last known site.
        const refuge = capacity.find(({ id }) => id === beast.homeLocationId) ?? capacity[0];
        if (refuge) beast.locationId = refuge.id;
      }
    }
    let place = world.locations.find(({ id }) => id === beast.locationId);
    if (!place) continue;
    const tide = !owner && world.tick > 0 ? ensureTide(world, beast, place) : undefined;
    if (tide) results.push(tide);
    if (beast.nextActionTick > world.tick) continue;
    beast.nextActionTick = world.tick + (owner ? 2 : 3);
    beast.cultivation = clamp(beast.cultivation + (place.spiritQi >= 65 ? 4 : 2), 0, 100);
    beast.power = RULES[beast.kind].power + 2 * beast.cultivation;
    beast.hp = Math.min(beast.maxHp, beast.hp + (owner ? 16 : 10));
    if (owner || isRewildingAcclimating(world, beast.id)) continue;
    const target = world.cultivators.filter((actor) => live(actor) && actor.locationId === beast.locationId && !pilgrimageCheckpoint(world, actor) && !courierCheckpoint(world, actor) &&
      (actor.realm === '练气' || actor.realm === '筑基') && !occupied(world, actor))
      .sort((a, b) => a.combatPower - b.combatPower || a.id.localeCompare(b.id))[0];
    if (target && RULES[beast.kind].risk > 0 && rng() < RULES[beast.kind].risk) {
      const initial = target.hp;
      const force = clamp(beast.power / Math.max(1, target.combatPower), .30, 1.5);
      target.hp = Math.max(0, target.hp - Math.max(1, Math.round(target.maxHp * .16 * force)));
      beast.hp = Math.max(0, beast.hp - Math.round(beast.maxHp * clamp(.04 + .10 / force, .07, .32)));
      if (!beast.hp) beast.alive = false;
      if (!target.hp) {
        target.alive = false;
        dropInheritance(target, world);
      }
      const damage = initial - target.hp;
      const description = `${beast.name}袭击${target.name}，修士损失${damage}气血并反击${!target.alive ? '，终因重伤陨落' : !beast.alive ? '，击退妖患' : ''}。`;
      recordMemory(target, world.tick, description, 8, 'combat', -3);
      results.push({ ...event(world, `attack-${beast.id}`, '荒野妖兽袭击', description, [target.id], place.id, target.alive ? 'combat' : 'death'),
        damage: [{ cultivatorId: target.id, amount: damage }] });
      continue;
    }
    if (sites.length <= 1 || rng() >= .45) continue;
    const previous = place;
    const destination = sites.filter(({ id }) => id !== previous.id && habitatCanReceiveWildBeast(world, id, beast.id))
      .sort((a, b) => weatherHabitatScore(world, previous, b, beast.kind) - weatherHabitatScore(world, previous, a, beast.kind) ||
        Math.hypot(a.x - previous.x, a.y - previous.y) - Math.hypot(b.x - previous.x, b.y - previous.y) || a.id.localeCompare(b.id))[0];
    if (!destination) continue;
    place = destination;
    beast.locationId = place.id;
    const roam=event(world, `roam-${beast.id}`, '妖兽游踪', `${beast.name}离开原处，在${place.name}附近出没。`, [], place.id);
    recordWildMigration(world,beast,previous,place,roam);
    results.push(roam);
  }
  return results;
}
