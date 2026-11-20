import { REALM_BASE_POWER, REALM_LIFESPAN, REALM_ORDER } from '../data/initialWorld';
import type { CultivationRealm, Cultivator, TribulationStance, TribulationTrial, WorldEvent, WorldState } from '../types/world';
import { artifactPowerMultiplier, wearArtifact } from './artifactEngine';
import { recordMemory } from './memoryEngine';
import { dropInheritance } from './techniqueEngine';

const STORMS: Partial<Record<CultivationRealm, { waves: number; strength: number; heart: number }>> = {
  金丹: { waves: 3, strength: .14, heart: 30 }, 元婴: { waves: 4, strength: .15, heart: 35 },
  化神: { waves: 5, strength: .16, heart: 42 }, 渡劫: { waves: 6, strength: .17, heart: 50 },
};
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const STANCES: Record<TribulationStance, { damage: number; pressure: number; will: number; name: string }> = {
  guard: { damage: .62, pressure: 4, will: 0, name: '御雷护体' },
  focus: { damage: .87, pressure: -5, will: 12, name: '凝神守心' },
  defy: { damage: 1.2, pressure: -9, will: 5, name: '逆雷砺心' },
};

export function tribulationTarget(actor: Cultivator): CultivationRealm | undefined {
  if (actor.realmStage !== 9) return undefined;
  const target = REALM_ORDER[REALM_ORDER.indexOf(actor.realm) + 1];
  return target && STORMS[target] ? target : undefined;
}

export function isTribulationActive(actor: Cultivator): boolean {
  return actor.tribulation?.stage === 'lightning' || actor.tribulation?.stage === 'heart_demon';
}

function trialEvent(world: WorldState, actor: Cultivator, token: string, title: string, description: string,
  category: WorldEvent['category'] = 'heavenly', participants?: string[]): WorldEvent {
  return { id: `evt-${world.tick}-${actor.id}-tribulation-${token}`, tick: world.tick, year: world.year, month: world.month,
    title, description, category, actorIds: participants ?? [actor.id], locationId: actor.locationId };
}

export function triggerTribulation(world: WorldState, actor: Cultivator): WorldEvent | null {
  if (!actor.alive || actor.hp <= 0 || actor.qiProgress < 90 || isTribulationActive(actor)) return null;
  const target = tribulationTarget(actor);
  const storm = target ? STORMS[target] : undefined;
  if (!target || !storm) return null;
  const previous = actor.tribulation;
  if (previous?.stage === 'failed' && previous.resolvedTick !== undefined && world.tick - previous.resolvedTick < 3) return null;
  const description = `${actor.name}引动${target}天劫，须渡过${storm.waves}重雷劫与心魔一关。`;
  actor.tribulation = { id: `trial-${actor.id}-${world.tick}`, targetRealm: target, startedTick: world.tick, stage: 'lightning',
    nextWave: 1, totalWaves: storm.waves, pressure: 0, interruptions: 0, lastActedTick: world.tick, lastOutcome: description };
  recordMemory(actor, world.tick, description, 8, 'heavenly', 1);
  return trialEvent(world, actor, 'start', '天劫降临', description);
}

export function recommendedTribulationStance(actor: Cultivator): TribulationStance {
  if (actor.tribulation?.stage === 'heart_demon') return 'focus';
  const health = actor.hp / Math.max(1, actor.maxHp);
  if (health < .53) return 'guard';
  if (health > .78 && (actor.tribulation?.pressure ?? 0) >= 16 && actor.personality === '狂傲') return 'defy';
  return (actor.tribulation?.pressure ?? 0) >= 10 ? 'focus' : 'guard';
}

function failTrial(world: WorldState, actor: Cultivator, trial: TribulationTrial, reason: string): WorldEvent {
  const lethal = actor.hp <= 0;
  actor.hp = Math.max(0, actor.hp);
  actor.qiProgress = lethal ? 0 : 35;
  if (lethal) {
    actor.alive = false;
    dropInheritance(actor, world);
  }
  trial.stage = 'failed';
  trial.resolvedTick = world.tick;
  trial.lastOutcome = `${actor.name}${reason}${lethal ? '，身死道消。' : '，修为受挫但仍存性命。'}`;
  recordMemory(actor, world.tick, trial.lastOutcome, 10, 'heavenly', -5);
  return trialEvent(world, actor, 'failure', lethal ? '渡劫陨落' : '渡劫失败', trial.lastOutcome, lethal ? 'death' : 'heavenly');
}

export function resolveTribulation(world: WorldState, actor: Cultivator, stance: TribulationStance | undefined, rng: () => number): WorldEvent | null {
  const trial = actor.tribulation;
  if (!actor.alive || !trial || !isTribulationActive(actor) || trial.startedTick >= world.tick ||
      (trial.lastActedTick ?? trial.startedTick) >= world.tick) return null;
  const storm = STORMS[trial.targetRealm];
  if (!storm || tribulationTarget(actor) !== trial.targetRealm) return null;
  trial.lastActedTick = world.tick;
  const posture = STANCES[stance ?? recommendedTribulationStance(actor)];
  if (trial.stage === 'lightning') {
    const wave = trial.nextWave;
    const equipment = Math.min(.32, (artifactPowerMultiplier(actor) - 1) * 1.7);
    const toxicity = clamp(actor.pillToxicity, 0, 100);
    let fraction = (storm.strength + (wave - 1) * .018) * (.85 + .3 * rng()) * posture.damage * (1 - equipment);
    fraction += trial.pressure * .001 + toxicity * .00045;
    let pillUsed = false;
    if (actor.pills.barrier > 0 && toxicity < 72 &&
        (actor.hp / actor.maxHp <= .45 || fraction * actor.maxHp >= actor.hp * .60)) {
      actor.pills.barrier--;
      actor.pillToxicity = Math.min(100, toxicity + 24);
      fraction *= 1 - .42 * Math.max(.30, 1 - toxicity / 100);
      pillUsed = true;
    }
    const damage = Math.max(1, Math.round(actor.maxHp * fraction));
    actor.hp = Math.max(0, actor.hp - damage);
    wearArtifact(actor, actor.hp > 0);
    trial.pressure = clamp(trial.pressure + posture.pressure, 0, 100);
    if (actor.hp === 0) return failTrial(world, actor, trial, `未能承受第${wave}重劫雷${pillUsed ? '，破障丹护持亦告破' : ''}`);
    trial.nextWave++;
    if (wave >= trial.totalWaves) trial.stage = 'heart_demon';
    trial.lastOutcome = `${actor.name}以${posture.name}扛过第${wave}/${trial.totalWaves}重劫雷，损失${damage}气血${pillUsed ? '，耗费一枚破障丹抵消部分雷力' : ''}。${trial.stage === 'heart_demon' ? '雷云消退，心魔随即浮现。' : ''}`;
    return trialEvent(world, actor, `wave-${wave}`, `第${wave}重雷劫`, trial.lastOutcome);
  }
  const grudges = world.relationships.filter((edge) => (edge.fromId === actor.id || edge.toId === actor.id) &&
    (edge.type === '血仇' || edge.affinity <= -40)).reduce((total, edge) => total + (edge.affinity <= -60 ? 6 : 4), 0);
  const obsessions = actor.reflections.reduce((sum, reflection) => sum + (reflection.kind === 'heart_demon' ? reflection.intensity * 2 :
    reflection.kind === 'obsession' ? reflection.intensity : 0), 0);
  const beliefs = actor.reflections.reduce((sum, reflection) => sum + (reflection.kind === 'belief' ? reflection.intensity * 1.6 : 0), 0);
  const burden = storm.heart + trial.pressure * .30 + Math.min(26, grudges) + Math.min(40, obsessions) + actor.pillToxicity * .08;
  const stability = 44 + actor.techniqueMastery * .23 + Math.min(26, beliefs) + actor.karma * .06 + posture.will;
  if (stability < burden) {
    const damage = Math.max(1, Math.round(actor.maxHp * clamp(.14 + (burden - stability) * .009, .14, .48)));
    actor.hp = Math.max(0, actor.hp - damage);
    return failTrial(world, actor, trial, `心魔压过道心，反噬${damage}气血`);
  }
  actor.realm = trial.targetRealm;
  actor.realmStage = 1;
  actor.qiProgress = 0;
  const fraction = actor.hp / Math.max(1, actor.maxHp);
  const base = REALM_BASE_POWER[actor.realm];
  actor.maxHp = Math.round(base * 1.08);
  actor.hp = clamp(Math.round(actor.maxHp * Math.max(.35, fraction)), 1, actor.maxHp);
  actor.combatPower = Math.round(base * 1.1);
  actor.lifespan = REALM_LIFESPAN[actor.realm];
  trial.stage = 'passed';
  trial.resolvedTick = world.tick;
  trial.lastOutcome = `${actor.name}渡过劫雷与心魔，踏入【${actor.realm}】境！`;
  recordMemory(actor, world.tick, trial.lastOutcome, 10, 'cultivation', 5);
  return trialEvent(world, actor, 'passed', '天劫圆满', trial.lastOutcome, 'breakthrough');
}

export function availableAmbushTargets(actor: Cultivator, world: WorldState): Cultivator[] {
  if (!actor.alive || actor.hp <= 0 || isTribulationActive(actor)) return [];
  return world.cultivators.filter((target) => target.id !== actor.id && target.alive && target.hp > 0 &&
    target.locationId === actor.locationId && isTribulationActive(target) && (target.tribulation?.interruptions ?? 0) < 3 &&
    world.relationships.some((edge) => ((edge.fromId === actor.id && edge.toId === target.id) ||
      (edge.fromId === target.id && edge.toId === actor.id)) && (edge.affinity <= -40 || edge.type === '血仇')));
}

export function interfereTribulation(world: WorldState, actor: Cultivator, targetId: string | undefined, rng: () => number): WorldEvent | null {
  const target = availableAmbushTargets(actor, world).find((candidate) => candidate.id === targetId);
  if (!target?.tribulation) return null;
  const trial = target.tribulation;
  const strength = clamp(actor.combatPower / Math.max(1, target.combatPower), .35, 1.5);
  const damage = Math.min(target.hp - 1, Math.max(1, Math.round(target.maxHp * (.045 + .025 * rng()) * strength)));
  target.hp -= damage;
  trial.pressure = clamp(trial.pressure + 13, 0, 100);
  trial.interruptions++;
  actor.karma = clamp(actor.karma - 8, -100, 100);
  trial.lastOutcome = `${actor.name}趁${target.name}渡劫扰乱气机，造成${damage}气血损失并升高劫压。`;
  recordMemory(target, world.tick, trial.lastOutcome, 8, 'combat', -4);
  recordMemory(actor, world.tick, trial.lastOutcome, 6, 'combat', 1);
  return trialEvent(world, actor, `ambush-${trial.interruptions}-${target.id}`, '天劫遭人干扰', trial.lastOutcome, 'intrigue', [actor.id, target.id]);
}
