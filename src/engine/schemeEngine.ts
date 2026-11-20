import type { Cultivator, CultivatorScheme, LocationNode, SchemeKind, WorldEvent, WorldState } from '../types/world';
import { recordMemory } from './memoryEngine';

const STARTER_COOLDOWN = 12;
const DEADLINE = 24;
const PILL_PRICE = 400;
const COVER_PRICE = 120;

const STEP_LABELS: Record<SchemeKind, readonly string[]> = {
  infiltration: ['筹措伪装所需的灵石', '在坊市置办身份掩护', '借掩护抵达敌宗驻地', '查探敌宗情报', '返回本宗复命'],
  foundation_pill: ['前往坊市', '接取杂役筹齐四百灵石', '在坊市购买筑基丹', '服丹炼化，推进修为'],
  vengeance: ['查旧账，确认血仇', '沿公开路径找到仇人', '当面对质并尝试击败仇人'],
  artifact_heist: ['记下目标出示的法宝', '准备盗宝所需的行囊', '等到与目标同处一地', '设法夺取法宝'],
};

const schemeKinds = Object.keys(STEP_LABELS) as SchemeKind[];
export function isSchemeKind(value: unknown): value is SchemeKind {
  return typeof value === 'string' && schemeKinds.some((kind) => kind === value);
}

function market(world: WorldState): LocationNode | undefined {
  return world.locations.find((place) => place.type === 'market');
}

function hostileTarget(actor: Cultivator, world: WorldState): Cultivator | undefined {
  const neighbors = world.relationships.flatMap((edge) => {
    if (edge.affinity > -60) return [];
    return edge.fromId === actor.id ? [edge.toId] : edge.toId === actor.id ? [edge.fromId] : [];
  });
  return world.cultivators.find((other) => neighbors.includes(other.id));
}

function buildPlan(actor: Cultivator, world: WorldState, kind: SchemeKind): CultivatorScheme | undefined {
  const deception = actor.personality === '阴险' || actor.personality === '诡诈';
  const base: CultivatorScheme = {
    id: `scheme-${actor.id}-${world.tick}-${kind}`, kind, title: '',
    status: 'active', startedTick: world.tick, stepIndex: 0,
    steps: STEP_LABELS[kind].map((label) => ({ label })),
  };
  switch (kind) {
    case 'foundation_pill':
      if ((actor.realm === '练气' || actor.realm === '筑基') && market(world)) {
        return { ...base, title: '积攒灵石，求取筑基丹', targetLocationId: market(world)?.id };
      }
      return undefined;
    case 'infiltration': {
      const sect = actor.sectId === 'sect-bloodmoon'
        ? world.sects.find((candidate) => candidate.alignment === '正道')
        : world.sects.find((candidate) => candidate.alignment === '魔道');
      if (deception && sect && market(world) && world.locations.some((place) => place.id === sect.headquartersId)) {
        return { ...base, title: `潜入${sect.name}探查`, targetLocationId: sect.headquartersId };
      }
      return undefined;
    }
    case 'vengeance': {
      const target = hostileTarget(actor, world);
      if (target && actor.personality !== '苟道') {
        return { ...base, title: `向${target.name}讨还血债`, targetCultivatorId: target.id };
      }
      return undefined;
    }
    case 'artifact_heist': {
      const target = world.cultivators.find((other) => other.alive && other.id !== actor.id &&
        other.sectId !== actor.sectId && other.locationId === actor.locationId &&
        other.artifacts.some((artifact) => !actor.artifacts.some((owned) => owned.name === artifact.name)));
      const artifactName = target?.artifacts.find((artifact) => !actor.artifacts.some((owned) => owned.name === artifact.name))?.name;
      if (deception && target && artifactName) {
        return { ...base, title: `夺取${target.name}的${artifactName}`, targetCultivatorId: target.id, artifactName };
      }
      return undefined;
    }
  }
}

export function schemeOptions(actor: Cultivator, world: WorldState): SchemeKind[] {
  const previous = actor.activeScheme;
  if (!actor.alive || (previous && (previous.finishedTick === undefined || world.tick - previous.finishedTick < STARTER_COOLDOWN))) return [];
  return schemeKinds.filter((kind) => buildPlan(actor, world, kind) !== undefined);
}

export function utilityScheme(actor: Cultivator, world: WorldState): SchemeKind | undefined {
  const options = schemeOptions(actor, world);
  return options.find((kind) => kind === 'foundation_pill') ??
    options.find((kind) => kind === 'artifact_heist') ??
    options.find((kind) => kind === 'infiltration') ?? options[0];
}

function completeStep(plan: CultivatorScheme, tick: number): void {
  const step = plan.steps[plan.stepIndex];
  if (!step) return;
  step.completedTick = tick;
  plan.stepIndex += 1;
  if (plan.stepIndex === plan.steps.length) {
    plan.status = 'completed';
    plan.finishedTick = tick;
  }
}

function fail(plan: CultivatorScheme, tick: number, reason: string): void {
  plan.status = 'failed';
  plan.finishedTick = tick;
  plan.outcome = reason;
}

export function expireScheme(actor: Cultivator, tick: number): void {
  const plan = actor.activeScheme;
  if (plan?.status !== 'active') return;
  if (!actor.alive || tick - plan.startedTick >= DEADLINE) {
    fail(plan, tick, actor.alive ? '时限已尽，布局未能收束。' : '修士已陨落，谋划中断。');
  }
}

function followPublicSearchRoute(actor: Cultivator, world: WorldState, targetId: string | undefined): void {
  const knownHint = actor.rumors.find((rumor) => {
    const knownName = world.cultivators.find((c) => c.id === targetId)?.name;
    return rumor.locationId && rumor.confidence >= 60 && knownName && rumor.subject.includes(knownName) &&
      world.tick - rumor.originTick <= 6 && rumor.locationId !== actor.locationId;
  });
  const places = world.locations;
  const current = places.findIndex((place) => place.id === actor.locationId);
  const next = places.find((place) => place.id === knownHint?.locationId) ?? places[(current + 1) % places.length];
  if (next) actor.locationId = next.id;
}

function presentTarget(actor: Cultivator, world: WorldState, plan: CultivatorScheme): Cultivator | undefined {
  return world.cultivators.find((other) => other.id === plan.targetCultivatorId && other.locationId === actor.locationId);
}

export function pursueScheme(
  actor: Cultivator, world: WorldState, proposal: SchemeKind | undefined,
  duel: (target: Cultivator) => WorldEvent | null,
  changeAffinity: (target: Cultivator, delta: number) => void,
  rng: () => number,
): WorldEvent | null {
  if (actor.activeScheme?.status !== 'active') {
    if (!proposal || !schemeOptions(actor, world).includes(proposal)) return null;
    actor.activeScheme = buildPlan(actor, world, proposal);
    return null; // Starting the plan itself costs one turn.
  }
  const plan = actor.activeScheme;
  const stage = plan.stepIndex;
  const tick = world.tick;
  expireScheme(actor, tick);
  if (plan.status !== 'active') return null;
  let result: WorldEvent | null = null;
  const bazaar = market(world);

  switch (plan.kind) {
    case 'foundation_pill':
      if (stage <= 2 && !bazaar) fail(plan, tick, '坊市不复存在，购丹无门。');
      else if (stage <= 2 && bazaar && actor.locationId !== bazaar.id) {
        actor.locationId = bazaar.id;
        if (stage === 0) completeStep(plan, tick);
      } else if (stage === 0) completeStep(plan, tick);
      else if (stage === 1) {
        if (actor.spiritStones < PILL_PRICE) actor.spiritStones += 80;
        if (actor.spiritStones >= PILL_PRICE) completeStep(plan, tick);
      } else if (stage === 2) {
        if (actor.spiritStones >= PILL_PRICE) {
          actor.spiritStones -= PILL_PRICE;
          completeStep(plan, tick);
        } else actor.spiritStones += 80; // Replenish funds if robbed after saving.
      } else {
        actor.qiProgress = Math.min(100, actor.qiProgress + 30);
        actor.hp = Math.min(actor.maxHp, actor.hp + Math.round(actor.maxHp * 0.25));
        plan.outcome = '购得筑基丹并成功炼化，灵气与气血有所恢复。';
        completeStep(plan, tick);
      }
      break;
    case 'infiltration':
      if (stage === 0) {
        if (actor.spiritStones < COVER_PRICE) actor.spiritStones += 60;
        if (actor.spiritStones >= COVER_PRICE) completeStep(plan, tick);
      } else if (stage === 1) {
        if (!bazaar) fail(plan, tick, '坊市不复存在，未能取得掩护。');
        else if (actor.locationId !== bazaar.id) actor.locationId = bazaar.id;
        else if (actor.spiritStones < COVER_PRICE) actor.spiritStones += 60;
        else {
          actor.spiritStones -= COVER_PRICE;
          completeStep(plan, tick);
        }
      } else if (stage <= 3) {
        const destination = world.locations.find((place) => place.id === plan.targetLocationId);
        if (!destination) fail(plan, tick, '敌宗驻地已经迁移。');
        else if (stage === 2 || actor.locationId !== destination.id) {
          actor.locationId = destination.id;
          if (stage === 2) completeStep(plan, tick);
        } else {
          actor.karma = Math.max(-100, actor.karma - 4);
          plan.outcome = `探得【${destination.name}】灵气为 ${destination.spiritQi}，并摸清驻地入口。`;
          completeStep(plan, tick);
        }
      } else {
        const home = world.sects.find((sect) => sect.id === actor.sectId)?.headquartersId;
        if (!home || !world.locations.some((place) => place.id === home)) fail(plan, tick, '本宗驻地无从寻访，情报未能送回。');
        else {
          actor.locationId = home;
          completeStep(plan, tick);
        }
      }
      break;
    case 'vengeance': {
      const target = presentTarget(actor, world, plan);
      if (target && !target.alive) fail(plan, tick, `寻至此地时，${target.name}已然陨落。`);
      else if (stage === 0) completeStep(plan, tick);
      else if (!target) followPublicSearchRoute(actor, world, plan.targetCultivatorId);
      else if (stage === 1) completeStep(plan, tick);
      else {
        const ownHp = actor.hp;
        const targetHp = target.hp;
        result = duel(target);
        if (result && actor.alive && (targetHp - target.hp) / target.maxHp >= (ownHp - actor.hp) / actor.maxHp) {
          if (target.alive) changeAffinity(target, 60);
          plan.outcome = `击败${target.name}，了却此番宿怨。`;
          completeStep(plan, tick);
        } else fail(plan, tick, `向${target.name}讨债未果。`);
      }
      break;
    }
    case 'artifact_heist': {
      const target = presentTarget(actor, world, plan);
      if (stage === 0) completeStep(plan, tick);
      else if (stage === 1) {
        if (actor.spiritStones < 60) actor.spiritStones += 60;
        else { actor.spiritStones -= 60; completeStep(plan, tick); }
      } else if (target && !target.alive) fail(plan, tick, '法宝原主已陨落，原定计划失效。');
      else if (!target) followPublicSearchRoute(actor, world, plan.targetCultivatorId);
      else if (stage === 2) completeStep(plan, tick);
      else {
        const item = plan.artifactName;
        const index = item ? target.artifacts.findIndex((artifact) => artifact.name === item) : -1;
        if (index < 0 || !item || actor.artifacts.some((owned) => owned.name === item)) fail(plan, tick, '目标已不再持有可盗取的法宝。');
        else {
          const odds = Math.min(0.85, Math.max(0.2, actor.combatPower / (actor.combatPower + target.combatPower)));
          if (rng() < odds) {
            const [stolen] = target.artifacts.splice(index, 1);
            actor.artifacts.push(stolen);
            changeAffinity(target, -20);
            plan.outcome = `已取得【${item}】。`;
            completeStep(plan, tick);
          } else {
            changeAffinity(target, -30);
            fail(plan, tick, '盗取当场败露，两人因此结怨。');
          }
        }
      }
      break;
    }
  }

  if (plan.status === 'active' || !plan.outcome) return result;
  if (actor.alive) recordMemory(actor, tick, plan.outcome, 8, 'social', plan.status === 'completed' ? 4 : -4);
  if (result) return result;
  return {
    id: `evt-${tick}-${actor.id}-scheme-outcome`, tick, year: world.year, month: world.month,
    title: `${actor.name}的长线谋划${plan.status === 'completed' ? '告成' : '失利'}`,
    description: plan.outcome, category: 'intrigue', witnessScope: 'participants',
    actorIds: [actor.id], locationId: actor.locationId,
  };
}
