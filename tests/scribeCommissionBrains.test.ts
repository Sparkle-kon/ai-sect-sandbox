import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { possessAvatar } from '../src/engine/avatarEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { scribeCommissionTargets } from '../src/engine/scribeCommissionCognition';
import { availableScribeCommissionActions } from '../src/engine/scribeCommissionEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '且静候。' };
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-scribe' };
const response = (value: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
const byId = (world: WorldState, id: string) => world.cultivators.find((actor) => actor.id === id)!;
const tick = (world: WorldState, commands: Record<string, LLMDecisionPayload> = {}) =>
  advanceWorldTick(world, Object.fromEntries(world.cultivators.map(({ id }) => [id, commands[id] ?? rest])), () => .99, 'utility');
afterEach(() => vi.unstubAllGlobals());

function localNativeSource() {
  const initial = createInitialWorld(106);
  const market = initial.locations.find(({ id }) => id === 'loc-market')!;
  const village = initial.settlements.villages.find(({ locationId }) => locationId === market.id)!;
  const [donor, scribe, outsider] = initial.cultivators;
  for (const person of [donor, scribe]) {
    person.locationId = market.id;
    person.hp = person.maxHp;
    person.spiritStones = 100;
    person.herbs.jade_leaf = 4;
    person.personality = '苟道';
  }
  outsider.locationId = 'loc-market-east';
  village.stress = 80;
  const world = tick(initial, { [donor.id]: { ...rest, chosenAction: 'DELIVER_RELIEF', targetSettlementId: village.id } });
  const source = world.eraHeritage?.facts.find(({ source }) => source.kind === 'relief');
  expect(source).toBeDefined();
  return { world, donor: donor.id, scribe: scribe.id, outsider: outsider.id, sourceId: source!.source.sourceEventId };
}

describe('local sourced manuscript in both brains', () => {
  it('accepts only simulated JSON naming the exact local original, then pays for independently verified native work', async () => {
    let { world, donor, scribe, outsider, sourceId } = localNativeSource();
    const first = availableScribeCommissionActions(byId(world, donor), world, world.tick + 1).find((option) =>
      option.scribeCommissionMove === 'offer' && option.targetCultivatorId === scribe && option.targetChronicleSourceId === sourceId);
    expect(first).toBeDefined();
    const proposal: LLMDecisionPayload = { chosenAction: 'SCRIBE_COMMISSION', ...scribeCommissionTargets(first!),
      innerMonologue: '有一本地方赈谷簿，请照实写。' };
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(proposal));
    vi.stubGlobal('fetch', fetcher);
    await expect(requestCultivatorLLMDecision(byId(world, outsider), world, config, world.tick + 1)).resolves.toBeUndefined();
    expect(fetcher.mock.calls.at(-1)?.[1]?.body ?? '').not.toContain(sourceId);
    for (const fabricated of [
      { targetCultivatorId: outsider }, { targetChronicleSourceId: 'rumor-only' },
      { targetScribeCommissionId: 'self-certified' }, { text: '未曾发生的交割' }, { escrowStones: 0 }, { spokenLine: '有人亲口作了证' },
    ]) {
      fetcher.mockImplementation(async () => response({ ...proposal, ...fabricated }));
      await expect(requestCultivatorLLMDecision(byId(world, donor), world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    fetcher.mockImplementation(async () => response(proposal));
    const modelOffer = await requestCultivatorLLMDecision(byId(world, donor), world, config, world.tick + 1);
    expect(modelOffer).toEqual(proposal);
    const before = byId(world, donor).spiritStones;
    world = tick(world, { [donor]: modelOffer! });
    expect(byId(world, donor).spiritStones).toBe(before);
    const commission = world.scribeCommissions!.commissions[0];
    const accept = { chosenAction: 'SCRIBE_COMMISSION', scribeCommissionMove: 'accept',
      targetScribeCommissionId: commission.id, innerMonologue: '我只写实情。' } as const;
    fetcher.mockImplementation(async () => response(accept));
    await expect(requestCultivatorLLMDecision(byId(world, scribe), world, config, world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(byId(world, donor), world, config, world.tick + 1)).resolves.toBeUndefined();
    const modelAccept = await requestCultivatorLLMDecision(byId(world, scribe), world, config, world.tick + 1);
    expect(modelAccept).toEqual(accept);
    world = tick(world, { [scribe]: modelAccept! });
    expect(byId(world, donor).spiritStones).toBe(before - 8);

    // Quote the next actual month's legal state without performing it first.
    const verificationMonth = tick(world);
    const verify = computeHeuristicDecision(byId(verificationMonth, scribe), verificationMonth, () => .99);
    expect(verify).toMatchObject({ chosenAction: 'SCRIBE_COMMISSION', scribeCommissionMove: 'verify',
      targetScribeCommissionId: commission.id });
    fetcher.mockImplementation(async () => response(verify));
    const modelVerify = await requestCultivatorLLMDecision(byId(world, scribe), world, config, world.tick + 1);
    expect(modelVerify).toEqual(verify);
    expect(applyCultivatorBrainDecision(verificationMonth, byId(verificationMonth, scribe), verify, () => .99)).toBeTruthy();
    const ready = tick(verificationMonth);
    const deliver = computeHeuristicDecision(byId(ready, scribe), ready, () => .99);
    expect(deliver).toMatchObject({ chosenAction: 'SCRIBE_COMMISSION', scribeCommissionMove: 'deliver',
      targetScribeCommissionId: commission.id });
    fetcher.mockImplementation(async () => response({ ...deliver, manuscript: '偷放一段假稿' }));
    await expect(requestCultivatorLLMDecision(byId(ready, scribe), ready, config, ready.tick)).resolves.toBeUndefined();
    fetcher.mockImplementation(async () => response(deliver));
    const modelDeliver = await requestCultivatorLLMDecision(byId(ready, scribe), ready, config, ready.tick);
    expect(modelDeliver).toEqual(deliver);
    const wageBefore = byId(ready, scribe).spiritStones;
    const explicitRequests = fetcher.mock.calls.length;
    expect(applyCultivatorBrainDecision(ready, byId(ready, scribe), modelDeliver!, () => .99)).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(explicitRequests);
    expect(byId(ready, scribe).spiritStones).toBe(wageBefore + 6);
    expect(ready.scribeCommissions!.commissions[0]).toMatchObject({ status: 'delivered', manuscript: expect.any(Object) });
  });

  it('filters the currently possessed actor out of provider authority and rejects direct unsanctioned acts', async () => {
    let { world, donor, scribe, sourceId } = localNativeSource();
    world = tick(world);
    const patron = byId(world, donor);
    expect(possessAvatar(world, patron.id)).toBe(true);
    const propose: LLMDecisionPayload = { chosenAction: 'SCRIBE_COMMISSION', scribeCommissionMove: 'offer',
      targetCultivatorId: scribe, targetChronicleSourceId: sourceId, innerMonologue: '此卷须有据。' };
    vi.stubGlobal('fetch', vi.fn(async () => response(propose)));
    await expect(requestCultivatorLLMDecision(patron, world, config, world.tick)).resolves.toBeUndefined();
    expect(applyCultivatorBrainDecision(world, patron, propose, () => .99)).toBeNull();
    expect(world.scribeCommissions).toBeUndefined();
  });
});
