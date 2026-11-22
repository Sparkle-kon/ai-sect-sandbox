import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { DESTINY_TRAIT_CATALOG } from '../src/engine/destinyTraitCatalog';
import { activeDestinyTraitOffer } from '../src/engine/destinyTraitEngine';
import {
  computeHeuristicDecision, isProviderPersonaDecision, queryCultivatorLLMDecision, requestCultivatorLLMDecision,
} from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { personaLine } from '../src/engine/wildPersonaEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'mock', model: 'mock' };
const reply = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '我留在原地调息。' };

function nativeMonth(world: WorldState, actorId: string, action: LLMDecisionPayload, rng = .99) {
  const inputs = Object.fromEntries(world.cultivators.map(({ id }) => [id, id === actorId ? action : rest]));
  return advanceWorldTick(world, inputs, () => rng, 'deferred');
}

function capturePrompt(outbound: RequestInit | undefined) {
  return (JSON.parse(String(outbound?.body)) as { messages: { role: string; content: string }[] })
    .messages.find(message => message.role === 'user')!.content;
}

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => vi.unstubAllGlobals());

describe('behavioral Cognitive prose stays a private native decision field', () => {
  it('introduces the actual personality and native earned awakening only as first-person private material', async () => {
    const start = createInitialWorld(401);
    const owner = start.cultivators[0];
    Object.assign(owner, { realm: '化神', realmStage: 9, qiProgress: 100, hp: 500, maxHp: 500, personality: '诡诈' });
    const unrelated = start.cultivators[1];
    unrelated.secretGoal = '第三人从未公示的逆脉草图哨兵';
    const pending = nativeMonth(start, owner.id, { chosenAction: 'BREAKTHROUGH', innerMonologue: '依法叩动境界。' }, .1);
    const awakenedActor = pending.cultivators.find(actor => actor.id === owner.id)!;
    const offer = activeDestinyTraitOffer(pending, awakenedActor)!;
    expect(offer).toMatchObject({ actorId: owner.id, openedTick: pending.tick, realm: '炼虚' });
    const choice = { chosenAction: 'AWAKEN_DESTINY', targetDestinyOfferId: offer.id, destinyTraitChoice: offer.options[0] } as const;
    const earnedName = DESTINY_TRAIT_CATALOG[choice.destinyTraitChoice].name;
    const thought = '我只怕心底那缕火比丹炉先烧起来。';
    const mock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(choice));
    vi.stubGlobal('fetch', mock);
    const accepted = await requestCultivatorLLMDecision(awakenedActor, pending, config, pending.tick + 1);
    expect(accepted).toMatchObject(choice);
    expect(isProviderPersonaDecision(accepted)).toBe(true);
    const strictPrompt = capturePrompt(mock.mock.calls[0][1]);
    expect(strictPrompt).not.toContain(earnedName);
    expect(strictPrompt).not.toContain('私下心声');

    const earned = nativeMonth(pending, owner.id, accepted!);
    const current = earned.cultivators.find(actor => actor.id === owner.id)!;
    expect(current.destinyTraits?.earned).toContainEqual(expect.objectContaining({
      traitId: choice.destinyTraitChoice, actorId: owner.id, chosenTick: earned.tick,
    }));
    expect(current.destinyTraits?.pending).toBeUndefined();
    const next = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      reply({ chosenAction: 'REST', innerMonologue: thought }));
    vi.stubGlobal('fetch', next);
    const ordinary = await requestCultivatorLLMDecision(current, earned, config, earned.tick + 1);
    expect(ordinary).toMatchObject({ chosenAction: 'REST', innerMonologue: thought });
    expect(isProviderPersonaDecision(ordinary)).toBe(true);
    const prompt = capturePrompt(next.mock.calls[0][1]);
    expect(prompt).not.toContain(unrelated.secretGoal);
    expect(prompt).toContain('性格：诡诈');
    const role = prompt.split('\n').find(line => line.includes('私下心声'));
    expect(role).toContain(`已真正觉醒的命格「${earnedName}」`);
    expect(role).toContain('不需输出 spokenLine');
    expect(role).toContain('不能写成新增术法、技能或结果');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('keeps a genuine direct API social proposal mechanically identical without publishing its private draft', async () => {
    const start = createInitialWorld(2031);
    const [actor, peer] = start.cultivators;
    actor.locationId = peer.locationId = 'loc-market';
    actor.personality = '刚正';
    const privateThought = '袖里病梅横着长，我偏不肯说它生在何处。';
    const privateDraft = '从未说与任何人的秘密私井位置。';
    const action = { chosenAction: 'SOCIALIZE', targetCultivatorId: peer.id, innerMonologue: privateThought } as const;
    const mock = vi.fn(async () => reply({ ...action, spokenLine: privateDraft }));
    vi.stubGlobal('fetch', mock);
    const chosen = await queryCultivatorLLMDecision(actor, start, config, undefined, start.tick + 1);
    expect(isProviderPersonaDecision(chosen)).toBe(true);
    const authorizedLine = '道友且看这一片山色。';
    const cognitive = nativeMonth(start, actor.id, chosen);
    const explicit = nativeMonth(start, actor.id, { ...action, spokenLine: authorizedLine });
    const sourceId = `evt-${cognitive.tick}-${actor.id}-social`;
    const cognitiveEvent = cognitive.events.find(event => event.id === sourceId)!;
    const explicitEvent = explicit.events.find(event => event.id === sourceId)!;
    expect(cognitiveEvent).toMatchObject({ title: explicitEvent.title, actorIds: [actor.id, peer.id], locationId: 'loc-market' });
    expect(cognitiveEvent.description).toContain(personaLine(actor, 'social_open'));
    expect(cognitiveEvent.description).not.toContain(privateDraft);
    expect(explicitEvent.description).toContain(authorizedLine);
    expect(cognitive.dramaticBonds).toEqual(explicit.dramaticBonds);
    expect(cognitive.relationships).toEqual(explicit.relationships);
    expect(cognitive.random).toEqual(explicit.random);
    for (const id of [actor.id, peer.id]) {
      const cognitiveActor = cognitive.cultivators.find(person => person.id === id)!;
      expect(cognitiveActor).toMatchObject({ hp: explicit.cultivators.find(person => person.id === id)!.hp,
        qiProgress: explicit.cultivators.find(person => person.id === id)!.qiProgress });
    }
    expect(cognitive.cultivators.find(person => person.id === actor.id)?.innerMonologue).toBe(privateThought);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('uses authored style for Utility duel and scheme without changing their lawful targets or spending RNG on prose', () => {
    function fixture(personality: '刚正' | '阴险', affinity: number) {
      const start = createInitialWorld(2031);
      const [actor, peer] = start.cultivators;
      actor.locationId = peer.locationId = 'loc-market';
      actor.qiProgress = 25;
      actor.personality = personality;
      for (const other of start.cultivators.slice(2)) {
        if (other.locationId === actor.locationId) other.locationId = 'loc-taixu';
      }
      start.relationships = [{ fromId: actor.id, toId: peer.id, affinity, type: affinity < -40 ? '血仇' : '同门', note: '' }];
      return { start, actor, peer };
    }
    const duel = fixture('刚正', -80);
    const duelRng = vi.fn(() => .2);
    expect(computeHeuristicDecision(duel.actor, duel.start, duelRng)).toMatchObject({
      chosenAction: 'DUEL', targetCultivatorId: duel.peer.id, innerMonologue: personaLine(duel.actor, 'thought'),
      spokenLine: personaLine(duel.actor, 'combat_open'),
    });
    const scheme = fixture('阴险', 20);
    const schemeRng = vi.fn(() => .2);
    expect(computeHeuristicDecision(scheme.actor, scheme.start, schemeRng)).toMatchObject({
      chosenAction: 'SCHEMING', targetCultivatorId: scheme.peer.id,
      innerMonologue: personaLine(scheme.actor, 'scheme'), rumorIntent: 'FABRICATE',
    });
    expect(duelRng).toHaveBeenCalledTimes(1);
    expect(schemeRng).toHaveBeenCalledTimes(2);
  });

  it('normalizes private prose, keeps the existing command schema, and brands only accepted exact provider objects', async () => {
    const world = createInitialWorld(2031);
    const [actor] = world.cultivators;
    actor.innerMonologue = '旧的真实心事留在此处。';
    const unsafe = '<a href="https://example.invalid">外部伪证</a>';
    const privateSpeech = '坛中一纸从没公开的旧誓。';
    const fictional = '我有三分贪念，不敢与眼下这炉丹火对视。';
    const malformed = { chosenAction: 'REST', innerMonologue: unsafe, spokenLine: privateSpeech, providerPersona: true };
    const valid = { chosenAction: 'REST', innerMonologue: `  ${fictional}  `, spokenLine: privateSpeech };
    const mock = vi.fn()
      .mockResolvedValueOnce(reply(malformed))
      .mockResolvedValueOnce(reply(valid))
      .mockResolvedValueOnce(reply({ chosenAction: 'SCHEMING_SUPERPOWER', innerMonologue: fictional }));
    vi.stubGlobal('fetch', mock);
    expect(isProviderPersonaDecision(malformed)).toBe(false);
    const accepted = await requestCultivatorLLMDecision(actor, world, config, world.tick + 1);
    expect(accepted).toMatchObject({ chosenAction: 'REST', innerMonologue: actor.innerMonologue, spokenLine: privateSpeech });
    expect(isProviderPersonaDecision(accepted)).toBe(true);
    expect(accepted).not.toHaveProperty('providerPersona');
    expect(isProviderPersonaDecision({ ...accepted, providerPersona: true })).toBe(false);
    expect(isProviderPersonaDecision(null)).toBe(false);
    const onSource = vi.fn();
    const direct = await queryCultivatorLLMDecision(actor, world, config, onSource, world.tick + 1);
    expect(direct).toMatchObject({ chosenAction: 'REST', innerMonologue: fictional, spokenLine: privateSpeech });
    expect(isProviderPersonaDecision(direct)).toBe(true);
    expect(onSource).toHaveBeenCalledWith('llm');
    const unavailable = await requestCultivatorLLMDecision(actor, world, config, world.tick + 1);
    expect(unavailable).toBeUndefined();
    const utility = await queryCultivatorLLMDecision(actor, world, { ...config, enabled: false });
    expect(isProviderPersonaDecision(utility)).toBe(false);
    expect(mock).toHaveBeenCalledTimes(3);
  });
});
