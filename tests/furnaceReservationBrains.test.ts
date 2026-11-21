import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableFurnaceReservationActions, heldFurnaceReservation, openFurnaceTurn } from '../src/engine/furnaceReservationEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-furnace' };
const respond = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(215);
  const actor = world.cultivators[0];
  const site = world.locations.find(({ id }) => id === 'loc-market')!;
  site.furnaceGrade = 1;
  actor.locationId = site.id;
  actor.hp = actor.maxHp;
  actor.spiritStones = 1000;
  actor.herbs.jade_leaf = 3;
  actor.herbs.earth_root = 2;
  actor.pills.foundation = 0;
  const actual = (decision: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, decision, () => .01);
  return { world, actor, site, actual };
}

describe('both brain paths respect tested furnace reservation options', () => {
  it('projects exact execution-tick options, rejects invented targets, and sends only real production through the held slot', async () => {
    const { world, actor, site, actual } = fixture();
    const draft: LLMDecisionPayload = { chosenAction: 'FURNACE_RESERVATION', furnaceMove: 'reserve',
      targetLocationId: site.id, innerMonologue: '按实际许可预约。' };
    expect(availableFurnaceReservationActions(actor, world, world.tick + 1)).toContainEqual({
      action: 'FURNACE_RESERVATION', furnaceMove: 'reserve', targetLocationId: site.id,
    });
    const look = vi.fn(async (_endpoint: RequestInfo | URL, _init?: RequestInit) =>
      respond({ ...draft, targetWorkshopId: 'invented-order' }));
    vi.stubGlobal('fetch', look);
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toBeUndefined();
    expect(world.furnaceReservations.reservations).toEqual([]);
    look.mockImplementation(async () => respond({ ...draft, reservedTick: world.tick + 99 }));
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toBeUndefined();
    look.mockImplementation(async () => respond(draft));
    const answer = await requestCultivatorLLMDecision(actor, world, config, world.tick + 1);
    expect(answer).toMatchObject(draft);
    expect(look.mock.calls[2][1]?.body).toContain('炉位预约仅复制执行回合的实际许可');
    world.tick++;
    expect(actual(answer!)).not.toBeNull();
    expect(world.furnaceReservations.reservations).toHaveLength(1);
    expect(actor.pills.foundation).toBe(0);
    world.tick++;
    openFurnaceTurn(world);
    expect(heldFurnaceReservation(world, actor)).toBeDefined();
    const chosen = computeHeuristicDecision(actor, world, () => .9);
    expect(chosen).toMatchObject({ chosenAction: 'BREW_PILL', targetPillId: 'foundation' });
    expect(actual(chosen)).not.toBeNull();
    expect(world.furnaceReservations.uses.filter(({ actorId, tick }) => actorId === actor.id && tick === world.tick)).toHaveLength(1);
    expect(world.furnaceReservations.reservations[0].status).toBe('used');
    expect(actor.pills.foundation).toBe(1);
  });

  it('accepts only the actual owner cancellation target and never attaches fabricated target clauses', async () => {
    const { world, actor, site, actual } = fixture();
    expect(actual({ chosenAction: 'FURNACE_RESERVATION', furnaceMove: 'reserve', targetLocationId: site.id, innerMonologue: '' })).not.toBeNull();
    const row = world.furnaceReservations.reservations[0];
    const valid: LLMDecisionPayload = { chosenAction: 'FURNACE_RESERVATION', furnaceMove: 'cancel',
      targetFurnaceReservationId: row.id, innerMonologue: '明示取消。' };
    const look = vi.fn(async (_endpoint: RequestInfo | URL, _init?: RequestInit) =>
      respond({ ...valid, targetFurnaceReservationId: 'someone-else' }));
    vi.stubGlobal('fetch', look);
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick)).resolves.toBeUndefined();
    look.mockImplementation(async () => respond({ ...valid, targetCultivatorId: world.cultivators[1].id }));
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick)).resolves.toBeUndefined();
    look.mockImplementation(async () => respond(valid));
    const answer = await requestCultivatorLLMDecision(actor, world, config, world.tick);
    expect(answer).toMatchObject(valid);
    expect(actual(answer!)).not.toBeNull();
    expect(row.status).toBe('cancelled');
    expect(world.furnaceReservations.uses).toEqual([]);
  });
});
