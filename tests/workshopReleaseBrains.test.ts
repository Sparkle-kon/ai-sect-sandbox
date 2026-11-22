import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { possessAvatar } from '../src/engine/avatarEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableWorkshopActions } from '../src/engine/workshopEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorkshopQualityFloor, WorkshopReleaseMove } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'workshop-fixture' };
const response = (value: object) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(value) } }],
}));
const workshop = (fields: Partial<LLMDecisionPayload>): LLMDecisionPayload =>
  ({ chosenAction: 'WORKSHOP', innerMonologue: '只按原约做器。', ...fields });
const release = (workshopReleaseMove: WorkshopReleaseMove, targetWorkshopId: string,
  targetWorkshopReleaseId?: string): LLMDecisionPayload =>
  ({ chosenAction: 'WORKSHOP_RELEASE', innerMonologue: '首件归前账。', workshopReleaseMove, targetWorkshopId,
    ...(targetWorkshopReleaseId === undefined ? {} : { targetWorkshopReleaseId }) });
afterEach(() => vi.unstubAllGlobals());

function firstPiece(floor: WorkshopQualityFloor) {
  const world = createInitialWorld(6031);
  world.tick = 30;
  const [maker, patron, outsider] = world.cultivators;
  const site = world.locations.find(({ id }) => id === 'loc-market')!;
  site.furnaceGrade = 1;
  site.spiritRoot = '木';
  for (const actor of world.cultivators) actor.locationId = world.locations[0].id;
  for (const actor of [maker, patron, outsider]) {
    actor.artifacts = [];
    actor.locationId = site.id;
    actor.realm = '练气';
    actor.hp = actor.maxHp;
    actor.techniqueMastery = 0;
    actor.spiritStones = 400;
    actor.herbs.earth_root = 24;
  }
  maker.spiritRoot = '金';
  maker.personality = '苟道';
  patron.personality = '苟道';
  const proposal = availableWorkshopActions(patron, world).find((option) => option.workshopMove === 'offer' &&
    option.targetCultivatorId === maker.id && option.workshopTier === '法器' && option.workshopQuantity === 2 &&
    option.workshopQualityFloor === floor);
  expect(proposal).toBeDefined();
  expect(applyCultivatorBrainDecision(world, patron, workshop(proposal!), () => 0)).not.toBeNull();
  const order = world.workshops.orders[0];
  const apply = (workshopMove: 'accept' | 'work') => applyCultivatorBrainDecision(world, maker,
    workshop({ workshopMove, targetWorkshopId: order.id }), () => 0);
  expect(apply('accept')).not.toBeNull();
  world.tick++;
  expect(apply('work')).not.toBeNull();
  world.tick++;
  expect(apply('work')).not.toBeNull();
  world.tick++;
  return { world, maker, patron, outsider, order };
}

describe('workshop release in both decision engines', () => {
  it('uses Utility to propose after real failure, then lets the original payer consent or refuse', () => {
    const { world, maker, patron, order } = firstPiece('fine');
    expect(order.work[1]).toMatchObject({ quality: 'standard' });
    const funds = patron.spiritStones;
    const proposed = computeHeuristicDecision(maker, world, () => .99);
    expect(proposed).toMatchObject({ chosenAction: 'WORKSHOP_RELEASE', workshopReleaseMove: 'propose', targetWorkshopId: order.id });
    expect(applyCultivatorBrainDecision(world, maker, proposed, () => .99)).not.toBeNull();
    expect(patron.spiritStones).toBe(funds);
    const record = order.releaseNegotiations![0];
    world.tick++;
    expect(computeHeuristicDecision(maker, world, () => .99)).toMatchObject({ chosenAction: 'REST' });
    const consent = computeHeuristicDecision(patron, world, () => .99);
    expect(consent).toMatchObject({ chosenAction: 'WORKSHOP_RELEASE', workshopReleaseMove: 'accept',
      targetWorkshopId: order.id, targetWorkshopReleaseId: record.id });
    patron.personality = '嗜血';
    const refusal = computeHeuristicDecision(patron, world, () => .99);
    expect(refusal).toMatchObject({ chosenAction: 'WORKSHOP_RELEASE', workshopReleaseMove: 'decline',
      targetWorkshopId: order.id, targetWorkshopReleaseId: record.id });
    expect(applyCultivatorBrainDecision(world, patron, refusal, () => .99)).not.toBeNull();
    expect(record.status).toBe('declined');
    expect(applyCultivatorBrainDecision(world, patron, consent, () => .99)).toBeNull();
    expect(patron.spiritStones).toBe(funds);
  });

  it('accepts exact mocked JSON only for the original parties and only while its real terms are still live', async () => {
    const { world, maker, patron, outsider, order } = firstPiece('standard');
    const proposal = release('propose', order.id);
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(proposal));
    vi.stubGlobal('fetch', fetcher);
    await expect(requestCultivatorLLMDecision(outsider, world, config, world.tick)).resolves.toBeUndefined();
    const outsiderPrompt = fetcher.mock.calls.at(-1)?.[1]?.body;
    expect(outsiderPrompt).not.toContain(order.id);
    const validProposal = await requestCultivatorLLMDecision(patron, world, config, world.tick);
    expect(validProposal).toEqual(proposal);
    expect(applyCultivatorBrainDecision(world, patron, validProposal!, () => .99)).not.toBeNull();
    const record = order.releaseNegotiations![0];
    const consent = release('accept', order.id, record.id);
    fetcher.mockImplementation(async () => response(consent));
    await expect(requestCultivatorLLMDecision(maker, world, config, world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(patron, world, config, world.tick + 1)).resolves.toBeUndefined();
    for (const fields of [{ targetWorkshopReleaseId: 'other-offer' }, { targetWorkshopId: 'other-order' },
      { returnedStones: 1 }, { spokenLine: '替原签人同意' }, { workshopMove: 'cancel' }, { targetCultivatorId: patron.id }]) {
      fetcher.mockImplementation(async () => response({ ...consent, ...fields }));
      await expect(requestCultivatorLLMDecision(maker, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    fetcher.mockImplementation(async () => response(consent));
    const validConsent = await requestCultivatorLLMDecision(maker, world, config, world.tick + 1);
    expect(validConsent).toEqual(consent);
    const prompt = fetcher.mock.calls.at(-1)?.[1]?.body;
    expect(prompt).toContain(record.id);
    expect(prompt).not.toContain('balanceStones');
    world.tick++;
    const siteId = maker.locationId;
    maker.locationId = world.locations[0].id;
    expect(applyCultivatorBrainDecision(world, maker, validConsent!, () => .99)).toBeNull();
    maker.locationId = siteId;
    const balance = patron.spiritStones;
    const remaining = order.escrowStones;
    expect(applyCultivatorBrainDecision(world, maker, validConsent!, () => .99)).not.toBeNull();
    expect(patron.spiritStones).toBe(balance + remaining);
    expect(patron.artifacts.map(({ id }) => id)).toEqual([order.work[1].artifactId]);
  });

  it('does not submit a model or Utility signature for a currently possessed original party', async () => {
    const { world, maker, order } = firstPiece('fine');
    expect(possessAvatar(world, maker.id)).toBe(true);
    const proposal = release('propose', order.id);
    vi.stubGlobal('fetch', vi.fn(async () => response(proposal)));
    await expect(requestCultivatorLLMDecision(maker, world, config, world.tick)).resolves.toBeUndefined();
    expect(computeHeuristicDecision(maker, world, () => .99).chosenAction).not.toBe('WORKSHOP_RELEASE');
    expect(applyCultivatorBrainDecision(world, maker, proposal, () => .99)).toBeNull();
    expect(order.releaseNegotiations).toBeUndefined();
  });
});
