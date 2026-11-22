import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeAvatar, possessAvatar } from '../src/engine/avatarEngine';
import { activeDestinyTraitOffer, chooseDestinyTraitDecision } from '../src/engine/destinyTraitEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { modelDecisionCandidates } from '../src/engine/modelDecisionTurn';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { DESTINY_TRAIT_IDS } from '../src/types/destinyTrait';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'mock', model: 'mock' };
const reply = (choice: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(choice) } }] }));
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '且留在脚下。' };

function fixture(guided = false, seed = 401) {
  const start = createInitialWorld(seed);
  const [actor] = start.cultivators;
  Object.assign(actor, { realm: '化神', realmStage: 9, qiProgress: 100, hp: 500, maxHp: 500,
    secretGoal: '与觉醒无关的私心，不应进入此请求。' });
  if (guided) expect(possessAvatar(start, actor.id)).toBe(true);
  const options = Object.fromEntries(start.cultivators.map(({ id }) => [id, id === actor.id ?
    { chosenAction: 'BREAKTHROUGH', innerMonologue: '实证破境。' } satisfies LLMDecisionPayload : rest]));
  const world = advanceWorldTick(start, options, () => .1);
  const current = world.cultivators.find(({ id }) => id === actor.id)!;
  expect(current).toMatchObject({ realm: '炼虚', realmStage: 1 });
  const offer = activeDestinyTraitOffer(world, current);
  if (!offer) throw Error('Native successful major advance did not open a verified trait offer');
  expect(offer).toMatchObject({ actorId: current.id, fromRealm: '化神', realm: '炼虚', sourceEventId: `evt-${world.tick}-${current.id}-break` });
  expect(new Set(offer.options).size).toBe(3);
  return { world, actor: current, offer };
}

function nextMonth(world: ReturnType<typeof createInitialWorld>, actorId: string, choice?: LLMDecisionPayload) {
  const other = Object.fromEntries(world.cultivators.filter(({ id }) => id !== actorId).map(({ id }) => [id, rest]));
  return advanceWorldTick(world, { ...other, ...(choice ? { [actorId]: choice } : {}) }, () => .99);
}

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('exact Cognitive and Utility destiny trait choices', () => {
  it('admits one minimal fair request for a native next-turn awakening and canonically applies the offered trait', async () => {
    const { world, actor, offer } = fixture();
    const permitted = { chosenAction: 'AWAKEN_DESTINY', targetDestinyOfferId: offer.id, destinyTraitChoice: offer.options[1] };
    const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(permitted));
    vi.stubGlobal('fetch', transport);
    const onStart = vi.fn();
    const snapshot = structuredClone(world);
    expect(modelDecisionCandidates(world)).toContain(actor);
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick, { onStart })).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 2, { onStart })).resolves.toBeUndefined();
    expect(transport).not.toHaveBeenCalled();
    const choice = await requestCultivatorLLMDecision(actor, world, config, world.tick + 1, { onStart });
    expect(choice).toMatchObject(permitted);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
    const input = JSON.parse(String(transport.mock.calls[0][1]?.body)) as { messages: { content: string }[] };
    const prompt = input.messages.map(({ content }) => content).join(' ');
    for (const trait of offer.options) expect(prompt).toContain(JSON.stringify({ ...permitted, destinyTraitChoice: trait }));
    for (const unrelated of [actor.name, actor.secretGoal, actor.locationId, offer.sourceEventId, 'innerMonologue', 'combatPower']) {
      expect(prompt).not.toContain(unrelated);
    }
    expect(world).toEqual(snapshot);
    const result = nextMonth(world, actor.id, choice).cultivators.find(({ id }) => id === actor.id)!;
    expect(result.destinyTraits?.earned).toContainEqual(expect.objectContaining({
      id: offer.id, traitId: permitted.destinyTraitChoice, chosenTick: world.tick + 1,
    }));
  });

  it('rejects unrelated actions, stale ids, a genuine catalog trait outside this menu and all extra effect, actor or prose fields', async () => {
    const { world, actor, offer } = fixture();
    const permitted = { chosenAction: 'AWAKEN_DESTINY', targetDestinyOfferId: offer.id, destinyTraitChoice: offer.options[0] };
    const unoffered = DESTINY_TRAIT_IDS.find(id => !offer.options.includes(id));
    const invalid = [
      { ...permitted, chosenAction: 'BREAKTHROUGH' }, { ...permitted, targetDestinyOfferId: 'other-offer' },
      { ...permitted, destinyTraitChoice: unoffered }, { ...permitted, tentativeRealm: '渡劫' },
      { ...permitted, targetCultivatorId: actor.id }, { ...permitted, combatPower: 9999 },
      { ...permitted, innerMonologue: '局外模型不能自编内容。' }, [permitted], null,
    ];
    const transport = vi.fn(async () => reply(invalid.shift()));
    vi.stubGlobal('fetch', transport);
    while (invalid.length) {
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    const native = chooseDestinyTraitDecision(world, actor);
    expect(native).toBeDefined();
    expect(computeHeuristicDecision(actor, world)).toEqual(native);
    const settled = nextMonth(world, actor.id).cultivators.find(({ id }) => id === actor.id)!;
    expect(settled.destinyTraits?.earned).toContainEqual(expect.objectContaining({
      id: offer.id, traitId: native?.destinyTraitChoice,
    }));
  });

  it('does not admit a deliberate active avatar and cannot replay a late choice after the actual offer changes', async () => {
    const owned = fixture(true);
    expect(activeAvatar(owned.world)).toBe(owned.actor);
    const transport = vi.fn(async () => reply(null));
    vi.stubGlobal('fetch', transport);
    const onStart = vi.fn();
    await expect(requestCultivatorLLMDecision(owned.actor, owned.world, config, owned.world.tick + 1, { onStart })).resolves.toBeUndefined();
    expect(modelDecisionCandidates(owned.world)).not.toContain(owned.actor);
    expect(transport).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    const fallback = chooseDestinyTraitDecision(owned.world, owned.actor);
    const untrustedChoice = owned.offer.options.find(trait => trait !== fallback?.destinyTraitChoice)!;
    expect(fallback?.destinyTraitChoice).toBeDefined();
    const unattended = nextMonth(owned.world, owned.actor.id, {
      chosenAction: 'AWAKEN_DESTINY', targetDestinyOfferId: owned.offer.id, destinyTraitChoice: untrustedChoice,
      innerMonologue: '这个提案不是有权的玩家点击。',
    }).cultivators.find(({ id }) => id === owned.actor.id)!;
    expect(unattended.destinyTraits?.earned).toContainEqual(expect.objectContaining({
      id: owned.offer.id, traitId: fallback?.destinyTraitChoice,
    }));

    const { world, actor, offer } = fixture();
    const late = vi.fn(async () => {
      delete actor.destinyTraits?.pending;
      return reply({ chosenAction: 'AWAKEN_DESTINY', targetDestinyOfferId: offer.id, destinyTraitChoice: offer.options[0] });
    });
    vi.stubGlobal('fetch', late);
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toBeUndefined();
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('uses a genuinely earned defensive destiny to reduce willingness for an otherwise lawful Utility duel', () => {
    const { world, actor, offer } = fixture(false, 403);
    expect(offer.options).toContain('supreme-patience');
    const after = nextMonth(world, actor.id, { chosenAction: 'AWAKEN_DESTINY', targetDestinyOfferId: offer.id,
      destinyTraitChoice: 'supreme-patience', innerMonologue: '按原选项觉醒。' });
    const self = after.cultivators.find(row => row.id === actor.id)!;
    expect(self.destinyTraits?.earned).toContainEqual(expect.objectContaining({ traitId: 'supreme-patience' }));
    const opponent = after.cultivators.find(row => row.id !== self.id)!;
    opponent.locationId = self.locationId;
    self.qiProgress = 25;
    self.memories = []; self.coreMemories = []; self.reflections = [];
    after.relationships = [{ fromId: self.id, toId: opponent.id, affinity: -80, type: '血仇', note: '' }];
    const earned = self.destinyTraits;
    delete self.destinyTraits;
    expect(computeHeuristicDecision(self, after, () => .5)).toMatchObject({ chosenAction: 'DUEL', targetCultivatorId: opponent.id });
    self.destinyTraits = earned;
    expect(computeHeuristicDecision(self, after, () => .5).chosenAction).not.toBe('DUEL');
    expect(computeHeuristicDecision(self, after, () => .2)).toMatchObject({ chosenAction: 'DUEL', targetCultivatorId: opponent.id });
  });
});
