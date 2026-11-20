import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableTechniques, mayAuthorTechnique } from '../src/engine/techniqueEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';

afterEach(() => vi.unstubAllGlobals());
describe('original techniques, mastery, and inheritance', () => {
  it('increases practice mastery deterministically, caps it, and gates authorship on realm and experience', () => {
    const world = createInitialWorld();
    const actor = world.cultivators[0];
    actor.techniqueMastery = 74;
    actor.qiProgress = 10;
    expect(mayAuthorTechnique(actor)).toBe(false);
    const practice = { chosenAction: 'CULTIVATE', innerMonologue: '磨练' } as const;
    applyCultivatorBrainDecision(world, actor, practice, () => 0.5);
    expect(actor.techniqueMastery).toBe(77);
    expect(mayAuthorTechnique(actor)).toBe(true);
    expect(computeHeuristicDecision(actor, world, () => 0.5).chosenAction).toBe('AUTHOR_TECHNIQUE');
    for (let i = 0; i < 20; i++) applyCultivatorBrainDecision(world, actor, practice, () => 0.5);
    expect(actor.techniqueMastery).toBe(100);
    actor.realm = '金丹';
    expect(mayAuthorTechnique(actor)).toBe(false);
  });

  it('creates a stable history-based original and deposits a separate copy in its sect pavilion', () => {
    const world = createInitialWorld();
    const [author, pupil] = world.cultivators;
    author.techniqueMastery = 75;
    const decision = { chosenAction: 'AUTHOR_TECHNIQUE', innerMonologue: '著经' } as const;
    const event = applyCultivatorBrainDecision(world, author, decision, () => 0.5);
    const original = author.authoredTechnique;
    expect(original).toMatchObject({ name: '守正长生金诀', spiritRoot: '金', authorId: author.id, createdTick: 1 });
    expect(event?.description).toContain('藏经阁');
    expect(world.sects[0].pavilion).toEqual([original]);
    expect(world.sects[0].pavilion[0]).not.toBe(original);
    expect(applyCultivatorBrainDecision(world, author, decision, () => 0.5)).toBeNull();
    expect(availableTechniques(pupil, world)).toEqual([]);
    pupil.locationId = world.sects[0].headquartersId;
    expect(availableTechniques(pupil, world)[0]?.source).toBe('pavilion');
    applyCultivatorBrainDecision(world, pupil, {
      chosenAction: 'STUDY_TECHNIQUE', innerMonologue: '观经', targetTechniqueId: original?.id,
    });
    expect(pupil.technique).toEqual(original);
    expect(pupil.techniqueMastery).toBe(15 + world.sects[0].facilities.scripture_pavilion * 5);
    expect(world.sects[0].pavilion).toHaveLength(1);
  });

  it('drops a true original on death and allows one on-site recovery regardless of sect', () => {
    let world = createInitialWorld();
    const [author, , visitor] = world.cultivators;
    author.techniqueMastery = 77;
    applyCultivatorBrainDecision(world, author, { chosenAction: 'AUTHOR_TECHNIQUE', innerMonologue: '著经' });
    const original = author.technique;
    world.month = 12;
    world.tick = 12;
    author.age = author.lifespan - 1;
    visitor.locationId = author.locationId;
    world.cultivators = [author, visitor];
    world = advanceWorldTick(world, { [visitor.id]: { chosenAction: 'CULTIVATE', innerMonologue: '入定' } }, () => 0.5);
    const site = world.locations.find((place) => place.id === author.locationId);
    expect(site?.inheritanceScrolls).toEqual([original]);
    expect(world.cultivators[0].alive).toBe(false);
    applyCultivatorBrainDecision(world, world.cultivators[1], {
      chosenAction: 'STUDY_TECHNIQUE', innerMonologue: '拾遗学艺', targetTechniqueId: original.id,
    });
    expect(world.cultivators[1].technique).toEqual(original);
    expect(site?.inheritanceScrolls).toEqual([]);
    expect(world.sects[0].pavilion).toEqual([original]);
  });

  it('hands only legally accessible texts to the LLM and revalidates its selection', async () => {
    const world = createInitialWorld();
    const [author, pupil] = world.cultivators;
    author.techniqueMastery = 80;
    applyCultivatorBrainDecision(world, author, { chosenAction: 'AUTHOR_TECHNIQUE', innerMonologue: '开卷' });
    const original = author.technique;
    const response = vi.fn(async (_url: string, _request: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        chosenAction: 'STUDY_TECHNIQUE', innerMonologue: '研习', targetTechniqueId: original.id,
      }) } }],
    })));
    vi.stubGlobal('fetch', response);
    const config = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'test', model: 'fixture' };
    expect((await queryCultivatorLLMDecision(pupil, world, config)).chosenAction).not.toBe('STUDY_TECHNIQUE');
    expect(response.mock.calls[0][1].body).not.toEqual(expect.stringContaining(original.name));
    pupil.locationId = world.sects[0].headquartersId;
    expect((await queryCultivatorLLMDecision(pupil, world, config)).targetTechniqueId).toBe(original.id);
    expect(response.mock.calls[1][1].body).toEqual(expect.stringContaining(original.name));
  });
});
