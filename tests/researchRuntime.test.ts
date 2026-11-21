import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableResearchActions, researchTechniqueId, RESEARCH_DEPOSIT } from '../src/engine/researchEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const idle = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(
  world.cultivators.map(({ id }) => [id, { chosenAction: 'REST', innerMonologue: '静候' }]));
afterEach(() => vi.unstubAllGlobals());

function campus() {
  const world = createInitialWorld(53);
  world.tick = 19; world.month = 6;
  const [steward, student] = world.cultivators;
  const sect = world.sects.find(({ id }) => id === steward.sectId)!;
  world.relationships = [];
  for (const row of world.diplomacy) { row.pact = 'neutral'; row.affinity = 0; }
  for (const actor of [steward, student]) {
    actor.locationId = sect.headquartersId;
    actor.hp = actor.maxHp;
    actor.realm = '筑基'; actor.realmStage = 1;
    actor.qiProgress = 10; actor.techniqueMastery = 30;
    actor.spiritStones = 180; actor.herbs.earth_root = 4;
  }
  return { world, steward, student, sect };
}

describe('shared research in real agreed turns', () => {
  it('uses the same factual proposal in both brains and finishes two actors’ contributions into one canonical copy', async () => {
    const { world, steward, student, sect } = campus();
    const local = computeHeuristicDecision(steward, world, () => .99);
    expect(local).toMatchObject({ chosenAction: 'RESEARCH', researchMove: 'propose' });
    const mock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(local) } }] })));
    vi.stubGlobal('fetch', mock);
    const source = vi.fn();
    const model = await queryCultivatorLLMDecision(steward, world, config, source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(model).toMatchObject({ chosenAction: 'RESEARCH', researchMove: 'propose', researchTopic: local.researchTopic });
    let active = advanceWorldTick(world, { ...idle(world), [steward.id]: model }, () => .99);
    const initial = active.research.projects[0];
    expect(initial).toMatchObject({ sectId: sect.id, status: 'open', contributors: [] });
    for (const id of [steward.id, student.id]) {
      const actor = active.cultivators.find((row) => row.id === id)!;
      const join = availableResearchActions(actor, active).find(({ researchMove }) => researchMove === 'join')!;
      expect(applyCultivatorBrainDecision(active, actor, { ...join, chosenAction: 'RESEARCH', innerMonologue: '自愿加入' }, () => .99)).not.toBeNull();
      expect(actor.spiritStones).toBe(180 - RESEARCH_DEPOSIT.stones);
      expect(availableResearchActions(actor, active).some(({ researchMove }) => researchMove === 'work')).toBe(false);
    }
    active = decodeWorldSave(encodeWorldSave(active));
    for (let i = 0; i < 2; i++) {
      const work = { chosenAction: 'RESEARCH', researchMove: 'work', targetResearchId: initial.id,
        innerMonologue: '付实际研习与材料' } satisfies LLMDecisionPayload;
      active = advanceWorldTick(active, { ...idle(active), [steward.id]: work, [student.id]: work }, () => .99);
    }
    const outcome = active.research.projects[0];
    const discovery = researchTechniqueId(sect.id, outcome.topic);
    expect(outcome).toMatchObject({ status: 'completed', discoveryTechniqueId: discovery });
    expect(outcome.contributors.map(({ spent, escrow, workTurns }) => ({ spent, escrow, workTurns }))).toEqual(
      Array.from({ length: 2 }, () => ({ spent: { stones: 20, earthRoots: 2 }, escrow: { stones: 0, earthRoots: 0 }, workTurns: 2 })));
    expect(active.sects.find(({ id }) => id === sect.id)!.pavilion.filter(({ id }) => id === discovery)).toHaveLength(1);
    expect(active.scriptures.originals.filter(({ id }) => id === discovery)).toHaveLength(1);
    expect(active.cultivators.find(({ id }) => id === steward.id)!.spiritStones).toBe(160);
    expect(decodeWorldSave(encodeWorldSave(active)).research).toEqual(active.research);
    const tamp = structuredClone(active);
    tamp.research.projects[0].contributors[0].spent.stones++;
    expect(() => encodeWorldSave(tamp)).toThrow(/research.projects.escrow/);
  });

  it('credits unspent research supplies before the estate sweep when a member actually dies', () => {
    const { world, steward, student } = campus();
    const create = { chosenAction: 'RESEARCH', researchMove: 'propose', researchTopic: 'qi_foundation',
      innerMonologue: '提议' } satisfies LLMDecisionPayload;
    expect(applyCultivatorBrainDecision(world, steward, create, () => .99)).not.toBeNull();
    const project = world.research.projects[0];
    expect(applyCultivatorBrainDecision(world, student, { chosenAction: 'RESEARCH', researchMove: 'join',
      targetResearchId: project.id, innerMonologue: '出资' }, () => .99)).not.toBeNull();
    world.month = 12;
    student.age = student.lifespan - 1;
    const after = advanceWorldTick(world, idle(world), () => .99);
    const member = after.research.projects[0].contributors[0];
    expect(member).toMatchObject({ withdrawReason: 'ineligible', escrow: { stones: 0, earthRoots: 0 } });
    const estate = after.estates.entries.find(({ deceasedId }) => deceasedId === student.id)!;
    expect(estate.holdings.stones).toBe(180);
    expect(estate.holdings.herbs.earth_root).toBe(4);
    expect(decodeWorldSave(encodeWorldSave(after)).research).toEqual(after.research);
  });
});
