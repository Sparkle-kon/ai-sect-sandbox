import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeAvatar, possessAvatar } from '../src/engine/avatarEngine';
import { availableHeavenlyAlchemyActions } from '../src/engine/heavenlyAlchemyEngine';
import { availableAutonomousHeavenlyAlchemyActions, requestCultivatorLLMDecision, utilityHeavenlyAlchemyDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { modelDecisionCandidates } from '../src/engine/modelDecisionTurn';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { HeavenlyHeat, HeavenlyQuality } from '../src/types/heavenlyAlchemy';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'mock', model: 'mock' };
const founder = 'npc-5';
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '在现地调息。' };
const actual = (world: WorldState) => world.cultivators.find(row => row.id === founder)!;
const reply = (selection: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(selection) } }] }));
const brew = (heavenlyAlchemyHeat: HeavenlyHeat = 'calm') => ({
  chosenAction: 'HEAVENLY_ALCHEMY', heavenlyAlchemyMove: 'brew', targetHeavenlyRecipeId: 'nine_turn_golden', heavenlyAlchemyHeat,
} as const);
const take = (heavenlyAlchemyQuality: HeavenlyQuality) => ({
  chosenAction: 'HEAVENLY_ALCHEMY', heavenlyAlchemyMove: 'take', targetHeavenlyRecipeId: 'nine_turn_golden', heavenlyAlchemyQuality,
} as const);
const intent = (order: Omit<LLMDecisionPayload, 'innerMonologue'>): LLMDecisionPayload => ({
  ...order, innerMonologue: '现地核验后动手。',
});
function tick(world: WorldState, choice?: LLMDecisionPayload, brain = false, isModel = false, applied?: (id: string, value: boolean) => void) {
  const orders = Object.fromEntries(world.cultivators.filter(row => row.id !== founder || !brain || choice).map(({ id }) =>
    [id, id === founder ? choice ?? rest : rest]));
  return advanceWorldTick(world, orders, () => .62, 'utility', applied, { modelActors: new Set(isModel ? [founder] : []) });
}
function furnished() {
  let world = createInitialWorld(2031);
  const actor = actual(world);
  expect(actor.locationId).toBe('loc-danxia');
  actor.techniqueMastery = 70;
  actor.spiritRoot = '火';
  actor.qiProgress = 24;
  actor.spiritStones = Math.max(720, actor.spiritStones);
  actor.herbs.jade_leaf = 5;
  actor.herbs.star_bloom = 7; // Starting fixture for a genuinely paid native furnace, not a receipt or outcome.
  for (let i = 0; i < 3; i++) world = tick(world);
  expect(world.tick).toBe(4);
  return world;
}

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => vi.unstubAllGlobals());

describe('strict Cognitive and selective Utility use the same paid heavenly alchemy', () => {
  it('chooses only the preheat of a real high-grade furnace and canonically pays/rolls the exact same as Utility', async () => {
    const world = furnished(), actor = actual(world), want = brew();
    expect(availableAutonomousHeavenlyAlchemyActions(actor, world, world.tick + 1).map(row => row.heavenlyAlchemyHeat))
      .toEqual(['calm', 'balanced', 'fierce']);
    expect(modelDecisionCandidates(world)).toContain(actor);
    const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(want));
    vi.stubGlobal('fetch', transport);
    const picked = await requestCultivatorLLMDecision(actor, world, config, world.tick + 1);
    expect(picked).toMatchObject(want);
    expect(transport).toHaveBeenCalledTimes(1);
    const prompt = (JSON.parse(String(transport.mock.calls[0][1]?.body)) as { messages: { content: string }[] })
      .messages.map(row => row.content).join('\n');
    expect(JSON.parse(prompt.slice(prompt.indexOf('许可：') + 3))).toContainEqual(want);
    for (const text of [actor.name, actor.secretGoal, '"roll"', '"heavenlyAlchemyQuality"', '"quantity"', '"spiritStones"']) {
      expect(prompt).not.toContain(text);
    }

    const applied = vi.fn();
    const opted = tick(world, picked, false, true, applied);
    const offline = tick(world, undefined, true);
    expect(applied).toHaveBeenCalledWith(actor.id, true);
    expect(opted.decisionTrace.records.find(row => row.tick === opted.tick && row.actorId === actor.id))
      .toMatchObject({ source: 'model', chosenAction: 'redacted', candidates: [], applied: true });
    const cooked = actual(opted);
    expect(actual(offline).currentAction, actual(offline).innerMonologue).toBe('HEAVENLY_ALCHEMY');
    expect(actual(offline).heavenlyAlchemy).toEqual(cooked.heavenlyAlchemy);
    expect(utilityHeavenlyAlchemyDecision(actor, { ...world, tick: 5 })).toMatchObject(want);
    expect(cooked.heavenlyAlchemy?.attempts).toHaveLength(1);
    expect(cooked.heavenlyAlchemy?.attempts[0]).toMatchObject({ tick: 5, heat: 'calm', roll: 620, recipeId: 'nine_turn_golden' });
    expect(actor.spiritStones - cooked.spiritStones).toBe(120);
    expect(actor.herbs.jade_leaf - cooked.herbs.jade_leaf).toBe(2);
    expect(actor.herbs.star_bloom - cooked.herbs.star_bloom).toBe(3);
    expect(cooked.pills.golden).toBe(actor.pills.golden);
    expect(opted.random).toEqual(offline.random);
  });

  it('rejects output selection, private prose, forged balances, and a stale/scope-shifted proposal', async () => {
    const world = furnished(), actor = actual(world), want = brew();
    const invalid = [
      { ...want, heavenlyAlchemyQuality: 'peerless' }, { ...want, quality: 'peerless' }, { ...want, roll: .999 },
      { ...want, success: true }, { ...want, actorId: actor.id }, { ...want, targetPillId: 'golden' },
      { ...want, innerMonologue: '先写成绝世炼丹师。' }, { ...want, targetLocationId: actor.locationId },
      take('peerless'), [want], null,
    ];
    const transport = vi.fn(async () => reply(invalid.shift()));
    vi.stubGlobal('fetch', transport);
    while (invalid.length) {
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    llmScheduler.resetTickBudget();
    const late = vi.fn(async () => {
      actor.locationId = 'loc-market';
      return reply(want);
    });
    vi.stubGlobal('fetch', late);
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toBeUndefined();
    expect(late).toHaveBeenCalledTimes(1);
    const copy = structuredClone(actor);
    expect(applyCultivatorBrainDecision(world, actor, intent(want), () => 0)).toBeNull();
    expect(actor).toEqual(copy);
  });

  it('permits exact own doses once, keeps ordinary brew unchanged, and reserves the possessed player’s explicit legal ritual', async () => {
    const fresh = furnished();
    const novice = structuredClone(fresh), before = actual(novice);
    before.techniqueMastery = 20;
    expect(availableAutonomousHeavenlyAlchemyActions(before, novice, novice.tick + 1)).toEqual([]);
    const ordinary = tick(novice, intent({ chosenAction: 'BREW_PILL', targetPillId: 'golden' }));
    expect(actual(ordinary).heavenlyAlchemy).toBeUndefined();
    expect(ordinary.events.some(row => row.id === `evt-${ordinary.tick}-${founder}-alchemy`)).toBe(true);
    expect(actual(ordinary).spiritStones).toBeLessThan(before.spiritStones);

    const held = structuredClone(fresh);
    expect(possessAvatar(held, founder)).toBe(true);
    expect(activeAvatar(held)?.id).toBe(founder);
    expect(availableAutonomousHeavenlyAlchemyActions(actual(held), held, held.tick + 1)).toEqual([]);
    expect(availableHeavenlyAlchemyActions(actual(held), held, held.tick + 1)).toContainEqual({
      action: 'HEAVENLY_ALCHEMY', heavenlyAlchemyMove: 'brew', targetHeavenlyRecipeId: 'nine_turn_golden', heavenlyAlchemyHeat: 'calm',
    });
    const noOverride = vi.fn();
    const modelHeld = tick(held, intent(brew()), false, true, noOverride);
    expect(actual(modelHeld).heavenlyAlchemy).toBeUndefined();
    expect(noOverride).toHaveBeenCalledWith(founder, false);
    const userHeld = tick(held, intent(brew()));
    expect(actual(userHeld).heavenlyAlchemy?.attempts).toHaveLength(1);

    const brewed = tick(fresh, intent(brew())), owner = actual(brewed);
    const quality = owner.heavenlyAlchemy!.attempts[0].quality!;
    owner.hp = Math.floor(owner.maxHp * .60);
    expect(quality).toBeDefined();
    const choice = take(quality);
    const api = vi.fn(async () => reply(choice));
    vi.stubGlobal('fetch', api);
    const selected = await requestCultivatorLLMDecision(owner, brewed, config, brewed.tick + 1);
    expect(selected).toMatchObject(choice);
    const used = tick(brewed, selected, false, true);
    expect(actual(used).heavenlyAlchemy?.attempts[0].use).toMatchObject({ tick: used.tick, siteId: owner.locationId });
    expect(actual(used).hp).toBeGreaterThan(owner.hp);
    expect(availableHeavenlyAlchemyActions(actual(used), used, used.tick + 1).some(row => row.heavenlyAlchemyMove === 'take')).toBe(false);
    const repeated = tick(used, intent(choice));
    expect(actual(repeated).heavenlyAlchemy?.attempts.length).toBe(1);
    expect(actual(repeated).heavenlyAlchemy?.attempts[0].use?.tick).toBe(used.tick);
  });
});
