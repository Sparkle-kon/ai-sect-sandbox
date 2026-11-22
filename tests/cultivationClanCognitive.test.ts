import { createInitialWorld } from '../src/data/initialWorld';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { possessAvatar } from '../src/engine/avatarEngine';
import { createDecisionReplayTape, replayOneTurn, type DecisionReplayTape } from '../src/engine/decisionTraceEngine';
import { availableCultivationClanActions, projectCultivationClans } from '../src/engine/cultivationClanEngine';
import { clanEventId } from '../src/engine/cultivationClanTerms';
import { availableAutonomousCultivationClanActions, queryCultivatorLLMDecision, requestCultivatorLLMDecision, utilityCultivationClanDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { ClanMove } from '../src/types/cultivationClan';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';
import { actualClanProposal, clanActor, clanFirst, clanMonth, clanOrder, clanPropose,
  clanSecond, clanSite, clanUnion } from './clanDynastyNativeFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://clan-offline.invalid/v1', apiKey: 'mock', model: 'mock' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '在所到之处调息。' };
const response = (item: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(item) } }] }));
const move = (clanMove: Exclude<ClanMove, 'propose'>, targetCultivationUnionId: string) =>
  ({ chosenAction: 'CULTIVATION_CLAN', clanMove, targetCultivationUnionId } as const);
function folkStep(world: WorldState, options: {
  actorId?: string; supplied?: LLMDecisionPayload; fromModel?: boolean; attempted?: boolean;
  earlier?: Record<string, LLMDecisionPayload>; applied?: (id: string, outcome: boolean) => void; tape?: DecisionReplayTape;
} = {}) {
  const { actorId = clanSecond, supplied, fromModel, attempted, earlier = {}, applied, tape } = options;
  const choices = Object.fromEntries(world.cultivators.filter(actor => actor.id !== actorId || supplied)
    .map(actor => [actor.id, actor.id === actorId ? supplied ?? rest : earlier[actor.id] ?? rest]));
  return advanceWorldTick(world, choices, () => .37, fromModel || attempted ? 'deferred' : 'utility', applied,
    { tape, modelActors: new Set(fromModel ? [actorId] : []), suppressAutoClanConsent: new Set(attempted ? [actorId] : []) });
}

function sharedRecord() {
  let trust = createInitialWorld(1, 'spirit-bloom');
  // Spend real Qi through native training so courtship has actual month separation, not edited stats or a clock.
  for (const daoPathMove of ['choose', 'practice', 'practice'] as const) {
    const training = { chosenAction: 'DAO_PATH', daoPathMove, targetDaoPathId: 'body', innerMonologue: '各自在这里实修。' } as const;
    trust = clanMonth(trust, { [clanFirst]: training, [clanSecond]: training });
  }
  for (let i = 0; i < 4; i++) trust = clanMonth(trust, {
    [clanFirst]: { chosenAction: 'SOCIALIZE', targetCultivatorId: clanSecond, innerMonologue: '同处论道。' },
    [clanSecond]: { chosenAction: 'SOCIALIZE', targetCultivatorId: clanFirst, innerMonologue: '同处论道。' },
  });
  const practiced = clanMonth(trust, { [clanFirst]: {
    chosenAction: 'DUAL_CULTIVATE', targetCultivatorId: clanSecond, innerMonologue: '按原有合修吐纳之法同坐。',
  } });
  expect(practiced.events.filter(event => event.tick === practiced.tick && event.actorIds.includes(clanFirst)),
    JSON.stringify([clanActor(trust).qiProgress, clanActor(trust, clanSecond).qiProgress, clanActor(practiced).currentAction, clanActor(practiced).innerMonologue]))
    .toContainEqual(expect.objectContaining({ id: `evt-${practiced.tick}-${clanFirst}-dual_cultivation` }));
  expect(practiced.dramaticBonds?.facts).toContainEqual(expect.objectContaining({
    kind: 'practice', tick: practiced.tick, siteId: clanSite, actorIds: [clanFirst, clanSecond],
  }));
  expect(practiced.cultivationClans).toBeUndefined(); // The old cultivation action cannot consent to a family.
  const proposed = clanMonth(practiced, { [clanFirst]: clanPropose });
  const union = clanUnion(proposed);
  expect(union).toMatchObject({ status: 'proposed', proposedTick: proposed.tick, parents: [clanFirst, clanSecond] });
  return { practiced, proposed, union };
}

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => vi.unstubAllGlobals());

describe('each adult authors only their own exact native clan decision', () => {
  it('gives Cognitive and unattended Utility identical real phased consent and costs, never a unilateral or instant descendant', async () => {
    const { proposed, union } = sharedRecord();
    const deciding = clanActor(proposed, clanSecond);
    const acceptedOrder = move('accept', union.id);
    expect(availableAutonomousCultivationClanActions(deciding, proposed, proposed.tick + 1).map(row => row.clanMove))
      .toEqual(['accept', 'refuse']);
    const outbound: string[] = [];
    let answer: unknown = acceptedOrder;
    const provider = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      outbound.push(String(init?.body));
      return response(answer);
    });
    vi.stubGlobal('fetch', provider);
    const applied = vi.fn();
    const offered = await requestCultivatorLLMDecision(deciding, proposed, config, proposed.tick + 1);
    expect(offered).toMatchObject(acceptedOrder);
    const acceptedOnline = folkStep(proposed, { supplied: offered, fromModel: true, attempted: true, applied });
    const acceptedOffline = folkStep(proposed);
    expect(applied).toHaveBeenCalledWith(clanSecond, true);
    expect(clanUnion(acceptedOnline)).toMatchObject({ status: 'accepted', acceptedTick: proposed.tick + 1 });
    expect(clanUnion(acceptedOffline)).toEqual(clanUnion(acceptedOnline));
    expect(clanUnion(acceptedOnline).ceremony).toBeUndefined();
    expect(acceptedOnline.decisionTrace.records.find(row => row.actorId === clanSecond && row.tick === acceptedOnline.tick))
      .toMatchObject({ source: 'model', chosenAction: 'redacted', candidates: [], applied: true });

    const invitedOnline = clanMonth(acceptedOnline, { [clanFirst]: clanOrder('ceremony_offer', union.id) });
    const invitedOffline = clanMonth(acceptedOffline, { [clanFirst]: clanOrder('ceremony_offer', union.id) });
    answer = move('ceremony', union.id);
    llmScheduler.resetTickBudget();
    const ceremony = await requestCultivatorLLMDecision(clanActor(invitedOnline, clanSecond), invitedOnline, config, invitedOnline.tick + 1);
    expect(ceremony).toMatchObject(answer as object);
    const bondedOnline = folkStep(invitedOnline, { supplied: ceremony, fromModel: true, attempted: true });
    const bondedOffline = folkStep(invitedOffline);
    expect(clanUnion(bondedOnline)).toEqual(clanUnion(bondedOffline));
    expect(clanUnion(bondedOnline)).toMatchObject({ status: 'bonded', ceremony: { actorId: clanSecond, qiPaidEach: 8 } });
    for (const id of [clanFirst, clanSecond]) expect(clanActor(invitedOnline, id).qiProgress - clanActor(bondedOnline, id).qiProgress).toBe(8);
    expect(clanUnion(bondedOnline).plan).toBeUndefined();

    const askedOnline = clanMonth(bondedOnline, { [clanFirst]: clanOrder('family_offer', union.id) });
    const askedOffline = clanMonth(bondedOffline, { [clanFirst]: clanOrder('family_offer', union.id) });
    expect(clanUnion(askedOnline).plan).toMatchObject({ offeredBy: clanFirst, status: 'offered' });
    answer = move('family_accept', union.id);
    llmScheduler.resetTickBudget();
    const consent = await requestCultivatorLLMDecision(clanActor(askedOnline, clanSecond), askedOnline, config, askedOnline.tick + 1);
    expect(consent).toMatchObject(answer as object);
    const expectingOnline = folkStep(askedOnline, { supplied: consent, fromModel: true, attempted: true });
    const expectingOffline = folkStep(askedOffline);
    expect(clanUnion(expectingOnline)).toEqual(clanUnion(expectingOffline));
    expect(clanUnion(expectingOnline).plan).toMatchObject({ offeredBy: clanFirst, acceptedBy: clanSecond, status: 'expecting', earnedTicks: [] });
    expect(expectingOnline.cultivationClans?.children).toEqual([]);
    expect(expectingOnline.random).toEqual(expectingOffline.random);
    expect(projectCultivationClans(expectingOnline, clanActor(expectingOnline, 'elder-danxia-1'))?.unions.find(row => row.id === union.id)?.plan).toBeUndefined();

    const privateAccepted = clanEventId(acceptedOnline.tick, union.id, 'accept');
    const privateFamily = clanEventId(expectingOnline.tick, union.id, 'family_accept');
    const privateIds = new Set([privateAccepted, privateFamily]);
    expect(expectingOnline.cultivators.flatMap(row => row.rumors).some(row => row.originEventId && privateIds.has(row.originEventId))).toBe(false);
    expect(expectingOnline.chronicleArchive.anchors.some(event => privateIds.has(event.id))).toBe(false);
    expect(provider).toHaveBeenCalledTimes(3);
    for (const raw of outbound) {
      const menu = JSON.parse((JSON.parse(raw) as { messages: { content: string }[] }).messages[1].content.split('许可：')[1]);
      expect(menu).toContainEqual({ chosenAction: 'REST' });
      for (const withheld of [deciding.name, deciding.secretGoal, '"parentIds"', '"children"', '"roots"', '"innateTrait"', '"ceremonyOffer"'])
        expect(raw).not.toContain(withheld);
    }
  });

  it('can naturally found a family offline through six independent adult turns, never through an old relationship alone', () => {
    let world = sharedRecord().practiced;
    while (world.tick + 1 < 12) world = clanMonth(world);
    for (const [actorId, step] of [
      [clanFirst, 'propose'], [clanSecond, 'accept'], [clanFirst, 'ceremony_offer'],
      [clanSecond, 'ceremony'], [clanFirst, 'family_offer'], [clanSecond, 'family_accept'],
    ] as const) {
      expect(availableAutonomousCultivationClanActions(clanActor(world, actorId), world, world.tick + 1)
        .some(option => option.clanMove === step)).toBe(true);
      let receipt: WorldState['events'][number] | undefined;
      // An institution can briefly take the month before an optional initial family proposal.
      for (let waited = 0; waited < 4 && !receipt; waited++) {
        world = folkStep(world, { actorId });
        const union = world.cultivationClans?.unions[0];
        if (union) receipt = world.events.find(row => row.id === clanEventId(world.tick, union.id, step));
      }
      expect(receipt).toMatchObject({
        tick: world.tick, actorIds: [actorId, actorId === clanFirst ? clanSecond : clanFirst],
      });
    }
    expect(clanUnion(world).plan).toMatchObject({ offeredBy: clanFirst, acceptedBy: clanSecond, status: 'expecting', earnedTicks: [] });
    expect(world.cultivationClans?.children).toEqual([]);
  });

  it('does not treat high affinity, malformed, declined, stale, or attached player choices as consent', async () => {
    const closeWithoutPractice = actualClanProposal();
    const first = clanActor(closeWithoutPractice.proposed, clanSecond);
    expect(availableCultivationClanActions(first, closeWithoutPractice.proposed, closeWithoutPractice.proposed.tick + 1)
      .some(row => row.clanMove === 'accept')).toBe(true);
    expect(availableAutonomousCultivationClanActions(first, closeWithoutPractice.proposed, closeWithoutPractice.proposed.tick + 1)).toEqual([]);
    expect(clanUnion(folkStep(closeWithoutPractice.proposed)).status).toBe('proposed');

    const { proposed, union } = sharedRecord(), actor = clanActor(proposed, clanSecond), exact = move('accept', union.id);
    const invalid: unknown[] = [
      { ...exact, consent: true }, { ...exact, actorId: clanFirst }, { ...exact, innerMonologue: '谎称双方早就答应了。' },
      { ...exact, children: ['future'] }, { ...exact, roots: ['雷', '木'] }, { ...exact, targetCultivatorId: clanFirst },
      move('family_accept', union.id), move('accept', 'clan-union-wrong'), [exact], null,
    ];
    vi.stubGlobal('fetch', vi.fn(async () => response(invalid.shift())));
    while (invalid.length) {
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(actor, proposed, config, proposed.tick + 1)).resolves.toBeUndefined();
    }
    const tape = createDecisionReplayTape(proposed, 'deferred');
    const failedOnline = folkStep(proposed, { attempted: true, tape });
    expect(clanUnion(failedOnline).status).toBe('proposed');
    const unrelated = failedOnline.decisionTrace.records.find(row => row.actorId === 'npc-7' && row.tick === failedOnline.tick)!;
    expect(replayOneTurn(tape, failedOnline, unrelated.id, 'CULTIVATE', (before, orders, mode, onActor, replayDraws) => {
      expect(orders[clanSecond]).toMatchObject({ chosenAction: 'REST' });
      expect(orders[clanSecond]).not.toHaveProperty('clanMove');
      const replayed = advanceWorldTick(before, orders, () => .37, mode, undefined, { onActor, replayDraws });
      expect(clanUnion(replayed).status).toBe('proposed');
      return replayed;
    })).toMatchObject({ ok: true });
    expect(clanActor(failedOnline, clanSecond).currentAction).toBe('REST');
    vi.stubGlobal('fetch', vi.fn(async () => response({ ...exact, forgedSecondSignature: true })));
    llmScheduler.resetTickBudget();
    await expect(queryCultivatorLLMDecision(actor, proposed, config, undefined, proposed.tick + 1)).resolves.toMatchObject({ chosenAction: 'REST' });

    const awaiting = () => folkStep(proposed, { supplied: { ...rest }, fromModel: true, attempted: true });
    expect(clanUnion(awaiting()).status).toBe('proposed');
    const forgedTrusted = folkStep(proposed, { supplied: { ...exact, targetCultivatorId: clanFirst, innerMonologue: '' }, fromModel: true, attempted: true });
    expect(clanUnion(forgedTrusted).status).toBe('proposed');
    const refused = folkStep(proposed, { supplied: clanOrder('refuse', union.id), fromModel: true, attempted: true });
    expect(clanUnion(refused).status).toBe('refused');

    vi.stubGlobal('fetch', vi.fn(async () => response(exact)));
    llmScheduler.resetTickBudget();
    const branded = await requestCultivatorLLMDecision(actor, proposed, config, proposed.tick + 1);
    expect(branded).toMatchObject(exact);
    const stale = folkStep(proposed, { supplied: branded, fromModel: true, attempted: true, earlier: { [clanFirst]: {
      chosenAction: 'EXPLORE', targetLocationId: 'loc-market', innerMonologue: '本人亲自离开。',
    } } });
    expect(clanActor(stale).locationId).toBe('loc-market');
    expect(clanUnion(stale).status).toBe('proposed');
    const held = structuredClone(proposed);
    expect(possessAvatar(held, clanSecond)).toBe(true);
    expect(utilityCultivationClanDecision(clanActor(held, clanSecond), held)).toBeUndefined();
    expect(clanUnion(folkStep(held, { supplied: branded, fromModel: true, attempted: true })).status).toBe('proposed');
    expect(clanUnion(folkStep(held, { supplied: clanOrder('accept', union.id) })).status).toBe('accepted');
  });
});
