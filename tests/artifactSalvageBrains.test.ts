import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableArtifactSalvageActions } from '../src/engine/artifactSalvageEngine';
import { legalTraceCandidates, recordDecisionTrace } from '../src/engine/decisionTraceEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableWorkshopActions, WORKSHOP_HERB } from '../src/engine/workshopEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-artifact-salvage' };
const respond = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(637);
  const actor = world.cultivators.find(({ id }) => id === 'npc-6')!;
  const outsider = world.cultivators.find(({ id }) => id === 'elder-danxia-1')!;
  const site = world.locations.find(({ id }) => id === 'loc-danxia')!;
  actor.locationId = outsider.locationId = site.id;
  // Begin early enough for two genuinely made pieces, then check on an ordinary idle turn.
  world.tick = 23;
  actor.qiProgress = 20;
  actor.hp = actor.maxHp;
  actor.spiritStones = 1000;
  actor.herbs[WORKSHOP_HERB] = 8;
  outsider.techniqueMastery = 100;
  const apply = (person: Cultivator, decision: LLMDecisionPayload) =>
    applyCultivatorBrainDecision(world, person, decision, () => .99);
  const offer = availableWorkshopActions(actor, world).find((option) => option.workshopMove === 'offer' &&
    option.targetCultivatorId === outsider.id && option.workshopTier === '法器' && option.workshopQuantity === 2 &&
    option.workshopQualityFloor === 'standard')!;
  expect(offer).toBeDefined();
  expect(apply(actor, { ...offer, chosenAction: 'WORKSHOP', innerMonologue: '' })).not.toBeNull();
  const order = world.workshops.orders[0];
  world.tick++;
  expect(apply(outsider, { chosenAction: 'WORKSHOP', workshopMove: 'accept', targetWorkshopId: order.id, innerMonologue: '' })).not.toBeNull();
  for (let work = 0; work < 4; work++) {
    world.tick++;
    expect(apply(outsider, { chosenAction: 'WORKSHOP', workshopMove: 'work', targetWorkshopId: order.id, innerMonologue: '' })).not.toBeNull();
  }
  expect(order.status).toBe('completed');
  world.tick++;
  const [spare, alternate] = actor.artifacts.filter(({ id }) => id?.startsWith('workshop-artifact-'));
  expect(spare).toBeDefined();
  expect(alternate).toBeDefined();
  spare.durability = 0; // Simulate ordinary wear; the provenance itself is not a fixture.
  const command = { chosenAction: 'SALVAGE_ARTIFACT' as const, targetArtifactId: spare.id!, targetLocationId: site.id, innerMonologue: '依照现场核过的旧器与炉点。' };
  return { world, actor, outsider, spare, alternate, site, command, apply };
}

describe('grounded repair salvage in both brains', () => {
  it('copies exactly both authorized targets and rejects foreign, incomplete or forged contracts', async () => {
    const { world, actor, outsider, spare, site, command, apply } = fixture();
    expect(availableArtifactSalvageActions(actor, world, world.tick + 1)).toContainEqual({
      action: 'SALVAGE_ARTIFACT', targetArtifactId: spare.id, targetLocationId: command.targetLocationId,
    });
    const mock = vi.fn(async (_endpoint: RequestInfo | URL, _init?: RequestInit) => respond(command));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(outsider, world, config, world.tick + 1)).resolves.toBeUndefined();
    for (const bad of [
      { targetArtifactId: undefined }, { targetArtifactId: 'artifact-npc-5-1' },
      { targetLocationId: undefined }, { targetLocationId: 'loc-market' },
      { materials: 4 }, { durability: 0 }, { ownerId: actor.id }, { spokenLine: '退还灵材' },
    ]) {
      mock.mockImplementation(async () => respond({ ...command, ...bad }));
      await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async () => respond(command));
    const valid = await requestCultivatorLLMDecision(actor, world, config, world.tick + 1);
    expect(valid).toMatchObject(command);
    const prompt = mock.mock.calls.at(-1)?.[1]?.body;
    expect(spare.workshopOrigin).toMatchObject({ makerId: outsider.id, siteId: site.id });
    expect(prompt).toContain('拆解旧器 SALVAGE_ARTIFACT');
    expect(prompt).toContain(spare.id);
    expect(prompt).not.toContain('workshopOrigin');
    expect(prompt).not.toContain('blankTick');
    expect(prompt).not.toContain('finishedTick');
    expect(spare.durability).toBe(0);
    expect(actor.artifacts).toContain(spare); // Provider parsing does not own actual custody.
    const trace = recordDecisionTrace(world, actor.id, legalTraceCandidates(world, actor), valid!, 'model', true);
    expect(trace.chosenAction).toBe('redacted');
    expect(JSON.stringify(trace)).not.toContain(spare.id);
    world.tick++;
    const beforeRoots = actor.herbs.earth_root;
    actor.locationId = 'loc-market';
    expect(apply(actor, valid!)).toBeNull(); // No extrapolation from the provider's prior snapshot.
    expect(actor.artifacts).toContain(spare);
    actor.locationId = site.id;
    expect(apply(actor, valid!)).not.toBeNull();
    expect(actor.artifacts).not.toContain(spare);
    expect(actor.herbs.earth_root).toBe(beforeRoots + 1);
    expect(apply(actor, valid!)).toBeNull();
    expect(actor.herbs.earth_root).toBe(beforeRoots + 1);
  });

  it('Utility picks only the unique fully broken spare and leaves alternatives or ambiguous spares alone', () => {
    const { world, actor, spare, alternate, command } = fixture();
    expect(computeHeuristicDecision(actor, world, () => .99)).toMatchObject({
      chosenAction: command.chosenAction, targetArtifactId: command.targetArtifactId, targetLocationId: command.targetLocationId,
    });
    spare.durability = 1;
    expect(computeHeuristicDecision(actor, world, () => .99).chosenAction).not.toBe('SALVAGE_ARTIFACT');
    spare.durability = 0;
    alternate.durability = 0;
    expect(computeHeuristicDecision(actor, world, () => .99).chosenAction).not.toBe('SALVAGE_ARTIFACT');
    actor.artifacts = [spare];
    expect(computeHeuristicDecision(actor, world, () => .99).chosenAction).not.toBe('SALVAGE_ARTIFACT');
  });
});
