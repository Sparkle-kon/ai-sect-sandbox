import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceSettlements, availableSettlementActions, resolveSettlementAction } from '../src/engine/settlementEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { availableVillageGranaryActions } from '../src/engine/villageGranaryEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-granary' };
const respond = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(635);
  const [donor, worker, remote, concurrent] = world.cultivators;
  const village = world.settlements.villages.find(({ locationId }) => locationId === 'loc-market')!;
  const site = world.locations.find(({ id }) => id === village.locationId)!;
  const tile = terrainTileAt(world, site.x, site.y)!;
  donor.locationId = worker.locationId = concurrent.locationId = site.id;
  for (const actor of [donor, worker, concurrent]) {
    actor.qiProgress = 25;
    actor.hp = actor.maxHp;
    actor.spiritStones = 100;
    actor.herbs.earth_root = 4;
    actor.herbs.jade_leaf = 3;
    actor.personality = '刚正';
  }
  world.tick = world.month = 10;
  village.stress = 30;
  advanceSettlements(world);
  const donate = { chosenAction: 'VILLAGE_GRANARY', granaryMove: 'donate', targetSettlementId: village.id,
    innerMonologue: '把现有资粮捐入本村义仓。' } as const;
  const draw = { ...donate, granaryMove: 'draw', innerMonologue: '只在真实灾困支取一份。' } as const;
  const apply = (actor: Cultivator, decision: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, decision, () => .99);
  const arm = () => {
    world.mapHazards.push({ id: 'fixture-real-village-meteor', kind: 'meteor', tileId: tile.id,
      createdTick: world.tick + 1, expiresTick: world.tick + 2, intensity: 3 });
  };
  const step = () => { world.tick++; world.month++; return advanceSettlements(world); };
  return { world, donor, worker, remote, concurrent, village, site, donate, draw, apply, arm, step };
}

describe('local, evidence-grounded village granary choices in both brains', () => {
  it('copies exact local donation fields but never model-selected quantities, beneficiaries or honor', async () => {
    const { world, donor, remote, village, site, donate, apply, step } = fixture();
    const mock = vi.fn(async (_endpoint: RequestInfo | URL, _init?: RequestInit) => respond(donate));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(remote, world, config, world.tick + 1)).resolves.toBeUndefined();
    for (const extra of [{ targetSettlementId: 'imagined-village' }, { quantity: 5 }, { earth_root: 2 },
      { stones: 8 }, { honor: 100 }, { targetCultivatorId: donor.id }]) {
      mock.mockImplementation(async () => respond({ ...donate, ...extra }));
      await expect(requestCultivatorLLMDecision(donor, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async () => respond(donate));
    const approved = await requestCultivatorLLMDecision(donor, world, config, world.tick + 1);
    expect(approved).toMatchObject(donate);
    expect(mock.mock.calls.at(-1)?.[1]?.body).toContain('义仓仅照抄本地已有依据');
    const population = village.population;
    step();
    donor.locationId = remote.locationId;
    expect(apply(donor, approved!)).toBeNull();
    expect([donor.herbs.earth_root, donor.spiritStones]).toEqual([4, 100]);
    donor.locationId = site.id;
    expect(apply(donor, approved!)).not.toBeNull();
    expect([donor.herbs.earth_root, donor.spiritStones, village.population]).toEqual([2, 92, population]);
  });

  it('uses sparse ordinary donations without displacing genuine village relief', () => {
    const { world, donor, village } = fixture();
    expect(computeHeuristicDecision(donor, world, () => .99).chosenAction).not.toBe('VILLAGE_GRANARY');
    let ordinaryDonation: LLMDecisionPayload | undefined;
    village.stress = 0;
    // Several ordinary opt-in dates also have older optional duties; take an actually idle date.
    for (let tick = 39; tick < 600; tick += 37) {
      world.tick = tick;
      const choice = computeHeuristicDecision(donor, world, () => .99);
      if (choice.chosenAction === 'VILLAGE_GRANARY') { ordinaryDonation = choice; break; }
    }
    expect(ordinaryDonation).toMatchObject({ chosenAction: 'VILLAGE_GRANARY', granaryMove: 'donate', targetSettlementId: village.id });
    village.stress = 30;
    expect(availableSettlementActions(donor, world).some(({ action }) => action === 'DELIVER_RELIEF')).toBe(true);
    expect(computeHeuristicDecision(donor, world, () => .99).chosenAction).toBe('DELIVER_RELIEF');
  });

  it('does not advertise a future unseen disaster, then favors actual available public stock over personal relief', async () => {
    const { world, donor, worker, concurrent, village, donate, draw, apply, arm, step } = fixture();
    expect(apply(donor, donate)).not.toBeNull();
    arm();
    const mocked = vi.fn(async () => respond(draw));
    vi.stubGlobal('fetch', mocked);
    await expect(requestCultivatorLLMDecision(worker, world, config, world.tick + 1)).resolves.toBeUndefined();
    expect(step().some(({ title }) => title === '凡村灾情')).toBe(true);
    expect(village.lastDisasterTick).toBe(world.tick);
    expect(availableSettlementActions(worker, world).some(({ action }) => action === 'DELIVER_RELIEF')).toBe(true);
    const allowed = await requestCultivatorLLMDecision(worker, world, config, world.tick + 1);
    expect(allowed).toMatchObject(draw);
    step();
    expect(computeHeuristicDecision(worker, world, () => .99)).toMatchObject({
      chosenAction: 'VILLAGE_GRANARY', granaryMove: 'draw', targetSettlementId: village.id,
    });
    const before = [village.population, village.stress, worker.spiritStones, worker.herbs.earth_root, worker.herbs.jade_leaf];
    const scores = structuredClone(world.competitions);
    expect(apply(worker, allowed!)).not.toBeNull();
    expect(village.stress).toBeLessThan(before[1]);
    expect([village.population, worker.spiritStones, worker.herbs.earth_root, worker.herbs.jade_leaf]).toEqual([before[0], ...before.slice(2)]);
    expect(world.competitions).toEqual(scores);
    expect(apply(concurrent, draw)).toBeNull();
    expect(availableVillageGranaryActions(concurrent, world).some(({ granaryMove }) => granaryMove === 'draw')).toBe(false);
  });

  it('rechecks delay and a concurrent genuine private relief instead of spending another tranche from a stale model plan', async () => {
    const { world, donor, worker, concurrent, village, donate, draw, apply, arm, step } = fixture();
    expect(apply(donor, donate)).not.toBeNull();
    arm();
    step();
    const mock = vi.fn(async () => respond(draw));
    vi.stubGlobal('fetch', mock);
    const approved = await requestCultivatorLLMDecision(worker, world, config, world.tick + 1);
    expect(approved).toMatchObject(draw);
    const vault = structuredClone(world.villageGranaries);
    world.tick++; world.month++;
    expect(apply(worker, approved!)).toBeNull(); // The actual settlement engine has not advanced this turn.
    advanceSettlements(world);
    expect(resolveSettlementAction(world, concurrent, { chosenAction: 'DELIVER_RELIEF',
      targetSettlementId: village.id, innerMonologue: '' })).not.toBeNull();
    expect(village.stress).toBeGreaterThanOrEqual(35);
    expect(apply(worker, approved!)).toBeNull(); // The old model decision does not bypass the cooldown.
    expect(world.villageGranaries).toEqual(vault);
  });
});
