import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { possessAvatar } from '../src/engine/avatarEngine';
import { availableDaoPathActions } from '../src/engine/daoPathEngine';
import { DAO_PATHS, daoPathEventId } from '../src/engine/daoPathTerms';
import { availableAutonomousDaoPathActions, requestCultivatorLLMDecision, utilityDaoPathDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { modelDecisionCandidates } from '../src/engine/modelDecisionTurn';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { DaoPathId, DaoPathMove } from '../src/types/daoPath';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'mock', model: 'mock' };
const founder = 'npc-5';
const actual = (world: WorldState) => world.cultivators.find(row => row.id === founder)!;
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '且在现地调息。' };
const command = (daoPathMove: DaoPathMove, targetDaoPathId: DaoPathId = 'alchemy') =>
  ({ chosenAction: 'DAO_PATH', daoPathMove, targetDaoPathId } as const);
const intent = (order: Omit<LLMDecisionPayload, 'innerMonologue'>): LLMDecisionPayload =>
  ({ ...order, innerMonologue: '现地核验后动手。' });
const reply = (selection: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(selection) } }] }));
function tick(world: WorldState, choice?: LLMDecisionPayload, heuristic = false,
  isModel = false, applied?: (id: string, result: boolean) => void) {
  const orders = Object.fromEntries(world.cultivators.filter(row => row.id !== founder || !heuristic || choice).map(({ id }) =>
    [id, id === founder ? choice ?? rest : rest]));
  return advanceWorldTick(world, orders, () => .62, 'utility', applied, { modelActors: new Set(isModel ? [founder] : []) });
}
function furnished() {
  let world = createInitialWorld(2031);
  const actor = actual(world);
  expect(actor.locationId).toBe('loc-danxia');
  // Qualifying starting stock and individual skill only. All path identity, proofs, payments and ranks below are native.
  actor.techniqueMastery = 50;
  actor.spiritRoot = '火';
  actor.qiProgress = 65;
  actor.herbs.jade_leaf = 4;
  world = tick(world, intent(command('choose')));
  expect(world.events.find(event => event.id === daoPathEventId(founder, 2, 'choose')))
    .toMatchObject({ locationId: 'loc-danxia', witnessScope: 'participants' });
  world = tick(world, intent(command('practice')));
  expect(actual(world).daoPath?.practices).toHaveLength(1);
  world = tick(tick(world));
  expect(world.tick).toBe(5);
  return world;
}

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => vi.unstubAllGlobals());

describe('Cognitive and selective offline Utility share the paid Dao Path lane', () => {
  it('offers only one real path practice and settles the exact same second rank payment without a combat roll', async () => {
    const world = furnished(), actor = actual(world), want = command('practice');
    expect(availableAutonomousDaoPathActions(actor, world, world.tick + 1))
      .toEqual([{ action: 'DAO_PATH', daoPathMove: 'practice', targetDaoPathId: 'alchemy' }]);
    expect(modelDecisionCandidates(world)).toContain(actor);
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(want));
    vi.stubGlobal('fetch', fetchMock);
    const picked = await requestCultivatorLLMDecision(actor, world, config, world.tick + 1);
    expect(picked).toMatchObject(want);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const prompt = (JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { messages: { content: string }[] })
      .messages.map(row => row.content).join('\n');
    expect(JSON.parse(prompt.slice(prompt.indexOf('许可：') + 3))).toEqual([want]);
    for (const secret of [actor.name, actor.secretGoal, '"rank"', '"artifactId"', '"damage"', '"color"', '"hp"'])
      expect(prompt).not.toContain(secret);

    const applied = vi.fn();
    const online = tick(world, picked, false, true, applied);
    const utility = tick(world, undefined, true);
    const practised = actual(online);
    const receipt = online.events.find(event => event.id === daoPathEventId(founder, 6, 'practice'));
    expect(applied).toHaveBeenCalledWith(founder, true);
    expect(receipt).toMatchObject({ witnessScope: 'participants', locationId: 'loc-danxia' });
    expect(receipt?.daoIntents).toBeUndefined();
    expect(practised.currentAction).toBe('DAO_PATH');
    expect(practised.daoPath?.practices).toHaveLength(2);
    expect(practised.daoPath?.practices.at(-1)).toMatchObject({ tick: 6, siteId: actor.locationId,
      qiPaid: DAO_PATHS.alchemy.qi, herbPaid: 'jade_leaf' });
    expect(actor.herbs.jade_leaf - practised.herbs.jade_leaf).toBe(1);
    expect(practised.daoPath?.activations).toEqual([]);
    expect(actual(utility).currentAction, actual(utility).innerMonologue).toBe('DAO_PATH');
    expect(actual(utility).daoPath).toEqual(practised.daoPath);
    expect(actual(utility).qiProgress).toBe(practised.qiProgress);
    expect(utility.random).toEqual(online.random);
    expect(online.decisionTrace.records.find(row => row.actorId === founder && row.tick === online.tick))
      .toMatchObject({ source: 'model', chosenAction: 'redacted', candidates: [], applied: true });

    const prepared = tick(online, intent(command('ready')));
    expect(actual(prepared).daoPath?.ready).toMatchObject({ tick: 7, siteId: actor.locationId });
    expect(actual(prepared).daoPath?.activations).toEqual([]); // Only a later actual duel can record an activation.
    expect(prepared.events.find(event => event.id === daoPathEventId(founder, 7, 'ready'))?.daoIntents).toBeUndefined();
    const privateReceipts = new Set([
      daoPathEventId(founder, 2, 'choose'), daoPathEventId(founder, 3, 'practice'),
      daoPathEventId(founder, 6, 'practice'), daoPathEventId(founder, 7, 'ready'),
    ]);
    expect(prepared.cultivators.flatMap(row => row.rumors)
      .filter(row => row.originEventId !== undefined && privateReceipts.has(row.originEventId))).toEqual([]);

  });

  it('rejects smuggled mechanics and forged choice or text, including a formerly legal option from an old site', async () => {
    const world = furnished(), actor = actual(world), want = command('practice');
    const invalid = [
      { ...want, damage: 999 }, { ...want, rank: 3 }, { ...want, color: '#fff' },
      { ...want, actorId: founder }, { ...want, targetLocationId: 'loc-market' },
      { ...want, innerMonologue: '我已得天阶剑意。' }, { ...want, spokenLine: '我已胜了。' },
      command('choose', 'sword'), command('ready'), command('cancel'), [want], null,
    ];
    vi.stubGlobal('fetch', vi.fn(async () => reply(invalid.shift())));
    while (invalid.length) {
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    const old = vi.fn(async () => {
      actor.locationId = 'loc-market';
      return reply(want);
    });
    vi.stubGlobal('fetch', old);
    llmScheduler.resetTickBudget();
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toBeUndefined();
    expect(old).toHaveBeenCalledTimes(1);
    expect(availableDaoPathActions(actor, world)).not.toContainEqual({ action: 'DAO_PATH', daoPathMove: 'practice', targetDaoPathId: 'alchemy' });
    const prior = structuredClone(actor);
    expect(applyCultivatorBrainDecision(world, actor, intent(want), () => 0)).toBeNull();
    expect(actor).toEqual(prior);
  });

  it('never directs an attached body through the provider; an exact trusted native choice can still use its real stock', async () => {
    const world = furnished(), actor = actual(world), want = command('practice');
    vi.stubGlobal('fetch', vi.fn(async () => reply(want)));
    const branded = await requestCultivatorLLMDecision(actor, world, config, world.tick + 1);
    expect(branded).toMatchObject(want);
    const held = structuredClone(world);
    expect(possessAvatar(held, founder)).toBe(true);
    const owned = actual(held);
    expect(availableAutonomousDaoPathActions(owned, held, held.tick + 1)).toEqual([]);
    expect(utilityDaoPathDecision(owned, { ...held, tick: 6 })).toBeUndefined();
    llmScheduler.resetTickBudget();
    await expect(requestCultivatorLLMDecision(owned, held, config, held.tick + 1)).resolves.toBeUndefined();
    const applied = vi.fn();
    const denied = tick(held, branded, false, true, applied);
    expect(applied).toHaveBeenCalledWith(founder, false);
    expect(actual(denied).daoPath).toEqual(owned.daoPath);
    expect(actual(denied).herbs.jade_leaf).toBe(owned.herbs.jade_leaf);
    const approved = tick(held, intent(want));
    expect(actual(approved).daoPath?.practices).toHaveLength(2);
    expect(actual(approved).herbs.jade_leaf).toBe(owned.herbs.jade_leaf - 1);
  });
});
