import { afterEach, describe, expect, it, vi } from 'vitest';
import { possessAvatar } from '../src/engine/avatarEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorkshopEstateMove, WorldState } from '../src/types/world';
import { buildEstatePhysicalBlank, estateActor, estateHeirId, estateMakerId, estateMonth, estatePatronId,
  estateWork, patronEstate } from './workshopEstateNativeFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-probate' };
const exact = (world: WorldState, move: WorkshopEstateMove): LLMDecisionPayload => ({
  chosenAction: 'WORKSHOP_ESTATE', workshopEstateMove: move, targetWorkshopId: estateWork(world).id,
  innerMonologue: '只照当事人原约续作。',
});
const response = (content: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
afterEach(() => vi.unstubAllGlobals());

function actualProbate() {
  const held = estateMonth(buildEstatePhysicalBlank());
  expect(estateActor(held, estatePatronId).alive).toBe(false);
  expect(estateWork(held).status).toBe('probate_hold');
  expect(patronEstate(held).status).toBe('open');
  let ready = held;
  while (ready.tick <= patronEstate(held).closesTick) ready = estateMonth(ready);
  expect(patronEstate(ready)).toMatchObject({ status: 'settled', beneficiaryId: estateHeirId });
  return { held, ready };
}

describe('probate-pinned workshop custody through both brains', () => {
  it('uses the original qualified heir and maker only, with exact offered/accepted months and no fabricated result', async () => {
    const { held, ready } = actualProbate();
    const offer = exact(ready, 'offer');
    const responseStub = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(offer));
    vi.stubGlobal('fetch', responseStub);
    await expect(requestCultivatorLLMDecision(estateActor(held, estateHeirId), held, config, held.tick + 1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(estateActor(ready, estateMakerId), ready, config, ready.tick + 1)).resolves.toBeUndefined();
    for (const invented of [
      { targetWorkshopId: 'another-order' }, { targetEstateId: patronEstate(ready).id },
      { targetCultivatorId: estateHeirId }, { refundedStones: 9 },
      { settledTick: ready.tick }, { workshopMove: 'work' }, { spokenLine: '替掌炉人答应' },
    ]) {
      responseStub.mockImplementation(async () => response({ ...offer, ...invented }));
      await expect(requestCultivatorLLMDecision(estateActor(ready, estateHeirId), ready, config, ready.tick + 1)).resolves.toBeUndefined();
    }
    responseStub.mockImplementation(async () => response(offer));
    const modelOffer = await requestCultivatorLLMDecision(estateActor(ready, estateHeirId), ready, config, ready.tick + 1);
    expect(modelOffer).toEqual(offer);
    const payer = estateActor(ready, estateHeirId).spiritStones;
    const first = estateMonth(ready, { [estateHeirId]: modelOffer! });
    expect(estateActor(first, estateHeirId).spiritStones).toBe(payer);
    const originalBlank = estateWork(first).work[0];
    expect(estateWork(first)).toMatchObject({ status: 'probate_hold', estateContinuation: { phase: 'offered' } });
    const reply = exact(first, 'accept');
    responseStub.mockImplementation(async () => response(reply));
    await expect(requestCultivatorLLMDecision(estateActor(first, estateMakerId), first, config, first.tick)).resolves.toBeUndefined();
    const nextReply = await requestCultivatorLLMDecision(estateActor(first, estateMakerId), first, config, first.tick + 1);
    expect(nextReply).toEqual(reply);

    const utilityFrame = estateMonth(first);
    const maker = estateActor(utilityFrame, estateMakerId);
    maker.personality = '苟道';
    expect(computeHeuristicDecision(maker, utilityFrame, () => .99)).toMatchObject({
      chosenAction: 'WORKSHOP_ESTATE', workshopEstateMove: 'accept', targetWorkshopId: estateWork(first).id,
    });
    const declined = structuredClone(utilityFrame);
    const otherMaker = estateActor(declined, estateMakerId);
    otherMaker.personality = '嗜血';
    expect(computeHeuristicDecision(otherMaker, declined, () => .99)).toMatchObject({
      chosenAction: 'WORKSHOP_ESTATE', workshopEstateMove: 'decline', targetWorkshopId: estateWork(first).id,
    });
    const resumed = estateMonth(first, { [estateMakerId]: nextReply! });
    expect(estateWork(resumed)).toMatchObject({ id: estateWork(ready).id, status: 'active',
      work: [originalBlank], estateContinuation: { phase: 'resumed', beneficiaryId: estateHeirId } });
    expect(estateActor(resumed, estateHeirId).spiritStones).toBe(payer);
  });

  it('does not have an automated brain speak on behalf of a possessed probate beneficiary', async () => {
    const { ready } = actualProbate();
    const heir = estateActor(ready, estateHeirId);
    expect(possessAvatar(ready, heir.id)).toBe(true);
    const offer = exact(ready, 'offer');
    vi.stubGlobal('fetch', vi.fn(async () => response(offer)));
    await expect(requestCultivatorLLMDecision(heir, ready, config, ready.tick + 1)).resolves.toBeUndefined();
    expect(computeHeuristicDecision(heir, ready, () => .99).chosenAction).not.toBe('WORKSHOP_ESTATE');
    expect(applyCultivatorBrainDecision(ready, heir, offer, () => .99)).toBeNull();
    expect(estateWork(ready).estateContinuation).toMatchObject({ phase: 'held' });
  });
});
