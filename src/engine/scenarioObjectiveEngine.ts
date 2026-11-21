import { verifiableDanxiaScenarioOutcome } from './scenarioDanxiaOutcome';
import type { ScenarioAudit, ScenarioAuditCard, ScenarioAuditEvidence, ScenarioObjective, WorldState } from '../types/world';

export const SCENARIO_MIN_OBJECTIVES = 1;
export const SCENARIO_MAX_OBJECTIVES = 6;
export const SCENARIO_MAX_POPULATION_TARGET = 100_000;
export const SCENARIO_MAX_SITE_QI_TARGET = 150;
export const SCENARIO_MAX_TREASURY_TARGET = 50_000;
export const SCENARIO_AUDIT_VERSION = 1;

export class ScenarioObjectiveError extends Error {
  constructor(readonly code: 'schema' | 'initial_ref' | 'authority', message: string, readonly objectiveIndex?: number) {
    super(message);
    this.name = 'ScenarioObjectiveError';
  }
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) return undefined;
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) return undefined;
    copy[key] = descriptor.value;
  }
  return copy;
}

const isId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(value);
const isInteger = (value: unknown, low: number, high: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= low && value <= high;
const unsignedZero = (value: number) => value === 0 ? 0 : value;

function normalizeObjective(value: unknown): ScenarioObjective | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const kind: unknown = Object.getOwnPropertyDescriptor(value, 'kind')?.value;
  switch (kind) {
    case 'cultivator_survives': {
      const row = exactRecord(value, ['kind', 'actorId']);
      return row && isId(row.actorId) ? { kind, actorId: row.actorId } : undefined;
    }
    case 'living_population': {
      const row = exactRecord(value, ['kind', 'minimum']);
      return row && isInteger(row.minimum, 1, SCENARIO_MAX_POPULATION_TARGET) ? { kind, minimum: row.minimum } : undefined;
    }
    case 'site_qi': {
      const row = exactRecord(value, ['kind', 'locationId', 'minimum']);
      return row && isId(row.locationId) && isInteger(row.minimum, 0, SCENARIO_MAX_SITE_QI_TARGET) ?
        { kind, locationId: row.locationId, minimum: unsignedZero(row.minimum) } : undefined;
    }
    case 'sect_treasury': {
      const row = exactRecord(value, ['kind', 'sectId', 'minimum']);
      return row && isId(row.sectId) && isInteger(row.minimum, 0, SCENARIO_MAX_TREASURY_TARGET) ?
        { kind, sectId: row.sectId, minimum: unsignedZero(row.minimum) } : undefined;
    }
    case 'danxia_medicine_outcome': {
      const row = exactRecord(value, ['kind','actorId','settlementId','required']);
      if(!row || !isId(row.actorId) || !isId(row.settlementId) ||
        (row.required!=='delivered'&&row.required!=='renewed'&&row.required!=='switched'&&row.required!=='refused'))return undefined;
      return {kind,actorId:row.actorId,settlementId:row.settlementId,required:row.required};
    }
    default:
      return undefined;
  }
}

/** One frozen check for each metric/subject; redundant thresholds do not multiply cards. */
export function scenarioObjectiveKey(objective: ScenarioObjective): string {
  switch (objective.kind) {
    case 'cultivator_survives': return `${objective.kind}:${objective.actorId}`;
    case 'site_qi': return `${objective.kind}:${objective.locationId}`;
    case 'sect_treasury': return `${objective.kind}:${objective.sectId}`;
    case 'living_population': return objective.kind;
    case 'danxia_medicine_outcome': return `${objective.kind}:${objective.actorId}:${objective.settlementId}:${objective.required}`;
  }
}

export function normalizeScenarioObjectives(input: unknown): ScenarioObjective[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length < SCENARIO_MIN_OBJECTIVES ||
    input.length > SCENARIO_MAX_OBJECTIVES || Reflect.ownKeys(input).length !== input.length + 1) {
    throw new ScenarioObjectiveError('schema', `剧本须含 ${SCENARIO_MIN_OBJECTIVES} 至 ${SCENARIO_MAX_OBJECTIVES} 项结构化目标。`);
  }
  const seen = new Set<string>();
  return Array.from({ length: input.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    const objective = descriptor?.enumerable && 'value' in descriptor ? normalizeObjective(descriptor.value) : undefined;
    if (!objective) throw new ScenarioObjectiveError('schema', '目标类型、阈值或参数无效，不能包含自定义字段或文本。', index);
    const key = scenarioObjectiveKey(objective);
    if (seen.has(key)) throw new ScenarioObjectiveError('schema', '同一对象的同类指标只可设置一项。', index);
    seen.add(key);
    return objective;
  });
}

export function validateScenarioObjectiveReferences(world: WorldState, objectives: readonly ScenarioObjective[]): void {
  objectives.forEach((objective, index) => {
    const valid = objective.kind === 'cultivator_survives' ? world.cultivators.some((actor) => actor.id === objective.actorId && actor.alive && actor.hp > 0) :
      objective.kind === 'site_qi' ? world.locations.some(({ id }) => id === objective.locationId) :
      objective.kind === 'sect_treasury' ? world.sects.some(({ id }) => id === objective.sectId) :
      objective.kind === 'danxia_medicine_outcome' ?
        world.cultivators.some(actor=>actor.id===objective.actorId&&actor.alive&&actor.hp>0)&&
        world.settlements.villages.some(village=>village.id===objective.settlementId&&village.population>0) : true;
    if (!valid) throw new ScenarioObjectiveError('initial_ref', '目标引用须来自此种子和谱系的实际初始世界。', index);
  });
}

export function scenarioObjectivePassed(objective: ScenarioObjective, evidence: ScenarioAuditEvidence): boolean {
  switch (objective.kind) {
    case 'cultivator_survives': return evidence.kind === objective.kind && evidence.found && evidence.alive && evidence.hp > 0;
    case 'living_population': return evidence.kind === objective.kind && evidence.count >= objective.minimum;
    case 'site_qi': return evidence.kind === objective.kind && evidence.found && evidence.qi >= objective.minimum;
    case 'sect_treasury': return evidence.kind === objective.kind && evidence.found && evidence.total >= objective.minimum;
    case 'danxia_medicine_outcome': return evidence.kind===objective.kind&&evidence.verified;
  }
}

/** Compare final canonical numeric state; no log sightings, dialogue, hidden data or side effects are needed. */
export function evaluateScenarioObjectives(world: WorldState, input: readonly ScenarioObjective[]): ScenarioAuditCard[] {
  const objectives = normalizeScenarioObjectives(input);
  return objectives.map((objective, index): ScenarioAuditCard => {
    const id = `objective-${index + 1}`;
    switch (objective.kind) {
      case 'danxia_medicine_outcome': {
        const evidence={kind:objective.kind,verified:verifiableDanxiaScenarioOutcome(world,objective)};
        return {id,objective,passed:scenarioObjectivePassed(objective,evidence),evidence};
      }
      case 'cultivator_survives': {
        const actor = world.cultivators.find((row) => row.id === objective.actorId);
        const evidence = { kind: objective.kind, found: Boolean(actor), alive: Boolean(actor?.alive && actor.hp > 0), hp: actor?.hp ?? 0 };
        return { id, objective, passed: scenarioObjectivePassed(objective, evidence), evidence };
      }
      case 'living_population': {
        const evidence = { kind: objective.kind, count: world.cultivators.filter((actor) => actor.alive && actor.hp > 0).length };
        return { id, objective, passed: scenarioObjectivePassed(objective, evidence), evidence };
      }
      case 'site_qi': {
        const site = world.locations.find((row) => row.id === objective.locationId);
        const evidence = { kind: objective.kind, found: Boolean(site), qi: site?.spiritQi ?? 0 };
        return { id, objective, passed: scenarioObjectivePassed(objective, evidence), evidence };
      }
      case 'sect_treasury': {
        const sect = world.sects.find((row) => row.id === objective.sectId);
        const voyages = sect ? world.relocations.plans.filter((row) => row.sectId === sect.id && row.status === 'in_transit') : [];
        if (voyages.length > 1) throw new ScenarioObjectiveError('authority', '当前财库有冲突的在途记录，不能签发目标凭证。', index);
        const atSite = sect?.spiritStones ?? 0;
        const inTransit = voyages[0]?.custody.stones ?? 0;
        const evidence = { kind: objective.kind, found: Boolean(sect), atSite, inTransit, total: atSite + inTransit };
        return { id, objective, passed: scenarioObjectivePassed(objective, evidence), evidence };
      }
    }
  });
}

/** Scenario replay alone attaches the returned report after its complete, isolated v2 endpoint. Never mutates the input. */
export function sealScenarioAudit(world: WorldState, input: readonly ScenarioObjective[]): ScenarioAudit {
  const origin = world.scenarioOrigin;
  if (!origin || (origin.version !== 2 && origin.version !== 3) || origin.ruleset !== 1 || origin.endTick !== world.tick) {
    throw new ScenarioObjectiveError('authority', '只能在目标版剧本离线复演的确切末回合签发凭证。');
  }
  const objectives = normalizeScenarioObjectives(input);
  if(objectives.some(item=>item.kind==='danxia_medicine_outcome')!==(origin.version===3)){
    throw new ScenarioObjectiveError('authority','过程目标与已核验剧本版本不一致。');
  }
  const profileId = world.worldgen?.profileId ?? 'classic';
  const seed = world.random.seed;
  if (world.scenarioAudit) {
    const report = world.scenarioAudit;
    if (report.version !== SCENARIO_AUDIT_VERSION || report.scenarioId !== origin.id || report.evaluatedTick !== world.tick ||
      report.seed !== seed || report.profileId !== profileId ||
      JSON.stringify(report.cards.map(({ objective }) => objective)) !== JSON.stringify(objectives)) {
      throw new ScenarioObjectiveError('authority', '这份已封存的凭证与复演终点或目标不一致。');
    }
    return structuredClone(report);
  }
  return { version: SCENARIO_AUDIT_VERSION, scenarioId: origin.id, seed, profileId, evaluatedTick: world.tick,
    cards: evaluateScenarioObjectives(world, objectives) };
}
