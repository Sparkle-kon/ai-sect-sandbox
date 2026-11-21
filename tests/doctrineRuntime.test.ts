import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableDoctrineActions, resolveDoctrineAction } from '../src/engine/doctrineEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { recordMemory } from '../src/engine/memoryEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const offlineConfig: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
afterEach(() => vi.unstubAllGlobals());

function doctrineFixture() {
  const world = createInitialWorld(41);
  world.tick = 16;
  world.month = 4;
  const actor = world.cultivators[0];
  const sect = world.sects.find(({ id }) => id === actor.sectId)!;
  actor.locationId = sect.headquartersId;
  actor.qiProgress = 20;
  actor.hp = actor.maxHp;
  const tick = world.tick - 2;
  recordMemory(actor, tick, '同门共同修复阵法。', 9, 'social', 2);
  recordMemory(actor, tick, '互相传授已验证的经义。', 9, 'social', 3);
  actor.reflections = [{ id: 'doctrine-fixture-belief', tick: tick + 1, kind: 'belief', theme: 'community',
    intensity: 9, statement: '此句不应进入公开历史。', sourceMemoryIds: actor.memories.filter(({ tick: memoryTick, category }) => memoryTick === tick && category === 'social').map(({ id }) => id), source: 'utility' }];
  return { world, actor };
}

const mockDecision = (decision: LLMDecisionPayload) => vi.fn(async () => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(decision) } }],
})));
const quietDecisions = (actorIds: string[]): Record<string, LLMDecisionPayload> =>
  Object.fromEntries(actorIds.map((id) => [id, { chosenAction: 'REST', innerMonologue: '静候' }]));

describe('doctrines through both cognitive motors and saved worlds', () => {
  it('offers the same evidenced legal move to both engines and commits only the canonical action', async () => {
    const { world, actor } = doctrineFixture();
    expect(availableDoctrineActions(actor, world)).toContainEqual(expect.objectContaining({ doctrineMove: 'endorse', doctrineTheme: 'community' }));
    const utility = computeHeuristicDecision(actor, world, () => .99);
    expect(utility).toMatchObject({ chosenAction: 'DOCTRINE', doctrineMove: 'endorse', doctrineTheme: 'community' });
    const mock = mockDecision(utility);
    vi.stubGlobal('fetch', mock);
    const source = vi.fn();
    const model = await queryCultivatorLLMDecision(actor, world, offlineConfig, source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(model).toMatchObject({ chosenAction: 'DOCTRINE', doctrineMove: 'endorse', doctrineTheme: 'community' });
    expect(mock).toHaveBeenCalledTimes(1);

    const base = quietDecisions(world.cultivators.map(({ id }) => id));
    const execute = (decision: LLMDecisionPayload) => advanceWorldTick(world, { ...base, [actor.id]: decision }, () => .99);
    const a = execute(utility);
    const b = execute(model);
    expect(a.doctrines).toEqual(b.doctrines);
    expect(a.doctrines.endorsements).toHaveLength(1);
    expect(a.doctrines.endorsements[0]).toMatchObject({ actorId: actor.id, theme: 'community' });
    expect(JSON.stringify(a.doctrines.records)).not.toContain('此句不应进入公开历史');
    expect(decodeWorldSave(encodeWorldSave(a)).doctrines).toEqual(a.doctrines);
    a.doctrines.endorsements.push({ ...a.doctrines.endorsements[0] });
    expect(() => encodeWorldSave(a)).toThrow(/doctrines.endorsements.actorId/);
  });

  it('round-trips an unsettled bilateral charter and returns the same real fund transfer after reload', () => {
    const { world, actor } = doctrineFixture();
    const sect = world.sects.find(({ id }) => id === actor.sectId)!;
    const members = world.cultivators.filter((person) => person.sectId === sect.id && person.alive);
    expect(members.length).toBeGreaterThanOrEqual(3);
    for (const member of members) {
      member.locationId = sect.headquartersId;
      if (member.id !== actor.id) {
        recordMemory(member, 14, '同门信守各自承诺。', 9, 'social', 3);
        member.reflections = [{ id: `belief-${member.id}`, tick: 15, theme: 'community', kind: 'belief', intensity: 9,
          statement: '同行有据。', sourceMemoryIds: [member.memories.find(({ tick, category }) => tick === 14 && category === 'social')!.id], source: 'utility' }];
      }
      expect(resolveDoctrineAction(world, member, { chosenAction: 'DOCTRINE', doctrineMove: 'endorse',
        doctrineTheme: 'community', innerMonologue: '登记' })).not.toBeNull();
    }
    const leader = members.find(({ id }) => id === sect.leaderId)!;
    const option = availableDoctrineActions(leader, world).find(({ doctrineMove }) => doctrineMove === 'propose_separation')!;
    expect(option).toBeDefined();
    expect(resolveDoctrineAction(world, leader, { ...option, chosenAction: option.action, innerMonologue: '签议' })).not.toBeNull();
    const balance = sect.spiritStones;
    const pending = decodeWorldSave(encodeWorldSave(world));
    expect(pending.doctrines.proposals[0].status).toBe('pending');
    for (const version of [world, pending]) {
      const proposal = version.doctrines.proposals[0];
      const steward = version.cultivators.find(({ id }) => id === proposal.stewardId)!;
      const vote = availableDoctrineActions(steward, version).find(({ doctrineMove }) => doctrineMove === 'accept')!;
      expect(vote).toBeDefined();
      expect(resolveDoctrineAction(version, steward, { ...vote, chosenAction: vote.action, innerMonologue: '准予分立' })).not.toBeNull();
      expect(version.doctrines.schools[0]).toMatchObject({ status: 'autonomous', treasury: proposal.amount, memberIds: [steward.id] });
      expect(version.sects.find(({ id }) => id === sect.id)?.spiritStones).toBe(balance - proposal.amount);
      expect(decodeWorldSave(encodeWorldSave(version)).doctrines).toEqual(version.doctrines);
    }
    expect(pending.doctrines).toEqual(world.doctrines);
  });

  it('rejects a model-invented proposal ID and migrates a previous snapshot without adding funds or supporters', async () => {
    const { world, actor } = doctrineFixture();
    const mock = mockDecision({ chosenAction: 'DOCTRINE', doctrineMove: 'accept', targetDoctrineProposalId: 'never-existed',
      innerMonologue: '不可由模型发明道统动议。' });
    vi.stubGlobal('fetch', mock);
    const source = vi.fn();
    const fallback = await queryCultivatorLLMDecision(actor, world, offlineConfig, source);
    expect(source).not.toHaveBeenCalledWith('llm');
    expect(fallback.targetDoctrineProposalId).toBeUndefined();
    expect(mock).toHaveBeenCalledTimes(1);

    const { doctrines: current, ...legacy } = world;
    const restored = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: legacy }));
    expect(restored.doctrines).toEqual(current);
    expect(restored.sects).toEqual(world.sects);
  });
});
