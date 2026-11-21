import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  evaluateScenarioObjectives, normalizeScenarioObjectives, SCENARIO_MAX_OBJECTIVES, SCENARIO_MAX_POPULATION_TARGET,
  SCENARIO_MAX_SITE_QI_TARGET, SCENARIO_MAX_TREASURY_TARGET, ScenarioObjectiveError, scenarioObjectivePassed, sealScenarioAudit,
  validateScenarioObjectiveReferences,
} from '../src/engine/scenarioObjectiveEngine';
import type { RelocationPlan, ScenarioObjective } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(3041, 'spirit-bloom');
  const [actor] = world.cultivators;
  const [sect] = world.sects;
  const [site] = world.locations;
  const objectives: ScenarioObjective[] = [
    { kind: 'cultivator_survives', actorId: actor.id },
    { kind: 'living_population', minimum: 1 },
    { kind: 'site_qi', locationId: site.id, minimum: 70 },
    { kind: 'sect_treasury', sectId: sect.id, minimum: 80 },
  ];
  return { world, actor, sect, site, objectives };
}

describe('frozen era objective evidence', () => {
  it('normalizes only typed bounded objectives without reading getters, allows no duplicate metric+subject', () => {
    const { objectives } = fixture();
    expect(normalizeScenarioObjectives(objectives)).toEqual(objectives);
    const invalid = [
      [], Array.from({ length: SCENARIO_MAX_OBJECTIVES + 1 }, (_, i) => ({ kind: 'cultivator_survives', actorId: `NPC-${i}` })),
      [{ kind: 'living_population', minimum: SCENARIO_MAX_POPULATION_TARGET + 1 }],
      [{ kind: 'site_qi', locationId: 'loc-test', minimum: SCENARIO_MAX_SITE_QI_TARGET + 1 }],
      [{ kind: 'sect_treasury', sectId: 'sect-test', minimum: SCENARIO_MAX_TREASURY_TARGET + 1 }],
      [{ kind: 'site_qi', locationId: 'loc-test', minimum: 3.5 }],
      [{ kind: 'cultivator_survives', actorId: 'has hidden whitespace' }],
      [{ kind: 'living_population', minimum: 2, prose: 'do not pass through' }],
      [{ kind: 'living_population', minimum: 2 }, { kind: 'living_population', minimum: 5 }],
      Array(1),
    ];
    for (const value of invalid) expect(() => normalizeScenarioObjectives(value)).toThrow(ScenarioObjectiveError);
    const row = { kind: 'living_population' };
    let consulted = false;
    Object.defineProperty(row, 'minimum', { enumerable: true, get: () => { consulted = true; return 7; } });
    expect(() => normalizeScenarioObjectives([row])).toThrow(/参数无效/);
    expect(consulted).toBe(false);
  });

  it('validates references against initial world and reports dead/removed entities precisely without leaking private details', () => {
    const { world, actor, site, objectives } = fixture();
    expect(() => validateScenarioObjectiveReferences(world, objectives)).not.toThrow();
    expect(() => validateScenarioObjectiveReferences(world, [{ kind: 'cultivator_survives', actorId: 'unknown-actor' }])).toThrow(/初始世界/);
    expect(() => validateScenarioObjectiveReferences(world, [{ kind: 'sect_treasury', sectId: 'unknown-sect', minimum: 0 }])).toThrow(/初始世界/);
    const originalPopulation = world.cultivators.filter((row) => row.alive && row.hp > 0).length;
    actor.alive = false;
    actor.hp = 0;
    actor.innerMonologue = 'INTERNAL_ACTOR_TEST_456';
    world.locations = world.locations.filter(({ id }) => id !== site.id);
    const measurements = evaluateScenarioObjectives(world, objectives);
    expect(measurements.map(({ id }) => id)).toEqual(['objective-1', 'objective-2', 'objective-3', 'objective-4']);
    expect(measurements[0]).toMatchObject({ passed: false, evidence: { kind: 'cultivator_survives', found: true, alive: false, hp: 0 } });
    expect(measurements[1]).toMatchObject({ passed: true, evidence: { kind: 'living_population', count: originalPopulation - 1 } });
    expect(measurements[2]).toMatchObject({ passed: false, evidence: { kind: 'site_qi', found: false, qi: 0 } });
    expect(JSON.stringify(measurements)).not.toContain('INTERNAL_ACTOR_TEST_456');
    expect(scenarioObjectivePassed({ kind: 'site_qi', locationId: site.id, minimum: 0 }, measurements[2].evidence)).toBe(false);
    expect(scenarioObjectivePassed(objectives[1], measurements[2].evidence)).toBe(false);
  });

  it('reports actual exact world Qi and sums only present and unique active treasury custody', () => {
    const { world, sect, site, objectives } = fixture();
    site.spiritQi = SCENARIO_MAX_SITE_QI_TARGET;
    sect.spiritStones = 5;
    const transit: RelocationPlan = { id: 'real-convoy', sectId: sect.id, originId: site.id, destinationId: 'loc-vein-north',
      status: 'in_transit', openedTick: 1, deadlineTick: 4, proposerId: 'test-representative', voterIds: [], votes: [], garrisonIds: [],
      path: [], pathIndex: 0, stoneCost: 0, earthCost: 0, custody: { stones: 79, pavilion: [] }, spent: true };
    const stale: RelocationPlan = { ...transit, id: 'older', status: 'settled', custody: { stones: 97, pavilion: [] } };
    world.relocations.plans.push(stale, transit);
    const before = structuredClone(world);
    const evidence = evaluateScenarioObjectives(world, objectives);
    expect(world).toEqual(before);
    expect(evidence[2]).toMatchObject({ passed: true, evidence: { kind: 'site_qi', found: true, qi: SCENARIO_MAX_SITE_QI_TARGET } });
    expect(evidence[3]).toMatchObject({ passed: true, evidence: { kind: 'sect_treasury', found: true, atSite: 5, inTransit: 79, total: 84 } });
    transit.custody.stones = 74;
    expect(evaluateScenarioObjectives(world, objectives)[3]).toMatchObject({ passed: false, evidence: { total: 79 } });
    world.relocations.plans.push({ ...transit, id: 'conflicting-convoy' });
    expect(() => evaluateScenarioObjectives(world, objectives)).toThrow(/冲突的在途记录/);
  });

  it('only seals at the exact scenario v2 endpoint, is deterministic and does not regrade a sealed branch', () => {
    const { world, actor, objectives } = fixture();
    const id = 'scenario-0123456789abcdef0123456789abcdef';
    expect(() => sealScenarioAudit(world, objectives)).toThrow(/末回合/);
    world.scenarioOrigin = { version: 1, ruleset: 1, id, endTick: world.tick };
    expect(() => sealScenarioAudit(world, objectives)).toThrow(/末回合/);
    world.scenarioOrigin.version = 2;
    const first = sealScenarioAudit(world, objectives);
    expect(world.scenarioAudit).toBeUndefined();
    expect(first).toEqual(sealScenarioAudit(world, objectives));
    expect(first).toMatchObject({ version: 1, scenarioId: id, seed: 3041, profileId: 'spirit-bloom', evaluatedTick: world.tick });
    world.scenarioAudit = first;
    const alternate = structuredClone(world);
    const branchActor = alternate.cultivators.find(({ id }) => id === actor.id)!;
    branchActor.hp = 0;
    branchActor.alive = false;
    expect(evaluateScenarioObjectives(alternate, objectives)[0].passed).toBe(false);
    const originalProof = sealScenarioAudit(alternate, objectives);
    expect(originalProof).toEqual(first);
    expect(originalProof).not.toBe(first);
    expect(originalProof.cards[0].passed).toBe(true);
    expect(() => sealScenarioAudit(alternate, [{ kind: 'living_population', minimum: 1 }])).toThrow(/不一致/);
    alternate.tick++;
    expect(() => sealScenarioAudit(alternate, objectives)).toThrow(/末回合/);
    expect(world.cultivators.find(({ id }) => id === actor.id)?.alive).toBe(true);
  });
});
