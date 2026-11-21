import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { resolveMentorshipAction } from '../src/engine/mentorshipEngine';
import { availableScriptureActions, resolveScriptureAction } from '../src/engine/scriptureEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { authorTechnique, masteryMultiplier } from '../src/engine/techniqueEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const rest = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(
  world.cultivators.map(({ id }) => [id, { chosenAction: 'REST', innerMonologue: '调息' }]));
afterEach(() => vi.unstubAllGlobals());

describe('scripture editions through real turn and JSON cognitive paths', () => {
  it('compares the same legal annotation across both brains and applies misread tradeoffs to actual cultivation', async () => {
    const world = createInitialWorld(41);
    world.tick = 15;
    world.month = 4;
    const actor = world.cultivators[0];
    actor.realm = '元婴';
    actor.hp = actor.maxHp;
    actor.qiProgress = 0;
    actor.techniqueMastery = 80;
    expect(authorTechnique(actor, world)).not.toBeNull();
    actor.techniqueMastery = 51;
    const original = structuredClone(world.scriptures.originals[0]);
    const choice = computeHeuristicDecision(actor, world, () => .99);
    expect(choice).toMatchObject({ chosenAction: 'SCRIPTURE', editionMove: 'annotate', targetScriptureOriginalId: original.id });

    const client = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(choice) } }] })));
    vi.stubGlobal('fetch', client);
    const source = vi.fn();
    const model = await queryCultivatorLLMDecision(actor, world, config, source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(model).toMatchObject({ chosenAction: 'SCRIPTURE', editionMove: 'annotate', targetScriptureOriginalId: original.id });
    const a = advanceWorldTick(world, { ...rest(world), [actor.id]: model }, () => .99);
    const b = advanceWorldTick(world, { ...rest(world), [actor.id]: choice }, () => .99);
    expect(a.scriptures).toEqual(b.scriptures);
    expect(a.scriptures.originals[0]).toEqual(original);
    expect(a.scriptures.editions).toHaveLength(1);
    expect(a.scriptures.editions[0]).toMatchObject({ kind: 'misread', originalId: original.id, authorId: actor.id });
    const annotated = a.cultivators.find(({ id }) => id === actor.id)!;
    const originalCombat = masteryMultiplier(annotated, 'combat');
    const sameStart = structuredClone(a);
    const option = availableScriptureActions(annotated, a).find(({ editionMove }) => editionMove === 'adopt')!;
    expect(option).toBeDefined();
    expect(resolveScriptureAction(a, annotated, { ...option, chosenAction: 'SCRIPTURE', innerMonologue: '参修异本' })).not.toBeNull();
    expect(masteryMultiplier(annotated, 'combat')).toBeLessThan(originalCombat);
    const train = { ...rest(a), [actor.id]: { chosenAction: 'CULTIVATE', innerMonologue: '定量参修' } } satisfies Record<string, LLMDecisionPayload>;
    const improvedQi = advanceWorldTick(a, train, () => .99).cultivators.find(({ id }) => id === actor.id)!.qiProgress;
    const withOriginal = advanceWorldTick(sameStart, train, () => .99).cultivators.find(({ id }) => id === actor.id)!.qiProgress;
    expect(improvedQi).toBeGreaterThan(withOriginal);
    expect(decodeWorldSave(encodeWorldSave(a)).scriptures).toEqual(a.scriptures);
    annotated.activeEdition!.kind = 'corrected';
    expect(() => encodeWorldSave(a)).toThrow(/scriptures.active.references/);
  });

  it('does not transfer a mentor’s edition or retain the student’s old edition when the underlying technique changes', () => {
    const world = createInitialWorld();
    world.tick = 16;
    const [student, mentor] = world.cultivators;
    mentor.locationId = student.locationId;
    mentor.sectId = student.sectId;
    for (const actor of [student, mentor]) {
      actor.realm = '元婴';
      actor.techniqueMastery = 90;
      expect(authorTechnique(actor, world)).not.toBeNull();
      const annotate = availableScriptureActions(actor, world).find(({ editionMove }) => editionMove === 'annotate')!;
      expect(resolveScriptureAction(world, actor, { ...annotate, chosenAction: 'SCRIPTURE', innerMonologue: '别录' })).not.toBeNull();
      const adopt = availableScriptureActions(actor, world).find(({ editionMove }) => editionMove === 'adopt')!;
      expect(resolveScriptureAction(world, actor, { ...adopt, chosenAction: 'SCRIPTURE', innerMonologue: '参修' })).not.toBeNull();
    }
    student.techniqueMastery = 42;
    mentor.techniqueMastery = 89;
    expect(student.activeEdition).toBeDefined();
    expect(mentor.activeEdition).toBeDefined();
    expect(resolveMentorshipAction(world, mentor, { chosenAction: 'TEACH', targetCultivatorId: student.id, innerMonologue: '传原法' }, () => .99)).not.toBeNull();
    const offer = world.mentorship.offers[0];
    expect(resolveMentorshipAction(world, student, { chosenAction: 'ACCEPT_TUITION', targetTuitionId: offer.id, innerMonologue: '接受' }, () => .99)).not.toBeNull();
    expect(student.technique.id).toBe(mentor.technique.id);
    expect(student.activeEdition).toBeUndefined();
    expect(mentor.activeEdition).toBeDefined();
    expect(world.scriptures.editions).toHaveLength(2);
  });

  it('keeps old textual sources but creates no fake drafts when migrating a legacy save', () => {
    const world = createInitialWorld();
    const { scriptures, ...legacy } = world;
    const imported = decodeWorldSave(JSON.stringify({ world: legacy, format: 'ai-sect-sandbox', version: 1 }));
    expect(imported.scriptures).toEqual(scriptures);
    expect(imported.cultivators.map(({ technique }) => technique)).toEqual(world.cultivators.map(({ technique }) => technique));
    expect(imported.sects.map(({ pavilion }) => pavilion)).toEqual(world.sects.map(({ pavilion }) => pavilion));
  });
});
