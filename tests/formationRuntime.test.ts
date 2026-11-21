import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceFormations, availableFormationActions, visibleFormationLinks } from '../src/engine/formationNetworkEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const act = <T extends Pick<LLMDecisionPayload, 'formationMove'>>(args: T): LLMDecisionPayload =>
  ({ ...args, chosenAction: 'FORMATION_NETWORK', innerMonologue: '只传已核对的实际灵气' });
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(4203);
  world.tick = 22;
  const [first, second, third] = world.sects;
  const leaderA = world.cultivators.find(({ id }) => id === first.leaderId)!;
  const leaderB = world.cultivators.find(({ id }) => id === second.leaderId)!;
  const allyA = world.cultivators.find(({ id, sectId }) => sectId === first.id && id !== leaderA.id)!;
  const outsider = world.cultivators.find(({ sectId }) => sectId === third.id)!;
  const placeA = world.locations.find(({ id }) => id === first.headquartersId)!;
  const placeB = world.locations.find(({ id }) => id === second.headquartersId)!;
  leaderA.locationId = allyA.locationId = placeA.id;
  leaderB.locationId = placeB.id;
  for (const [site, sect] of [[placeA, first], [placeB, second]] as const) {
    site.ownerSectId = sect.id;
    sect.facilities.qi_array = 1;
    sect.spiritStones = 1_000;
  }
  for (const treaty of world.diplomacy) { treaty.pact = 'neutral'; treaty.affinity = 0; }
  leaderA.qiProgress = 100;
  leaderB.qiProgress = 0;
  allyA.qiProgress = 5;
  const submit = (actor: typeof leaderA, decision: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, decision, () => .99);
  return { world, first, second, third, placeA, placeB, leaderA, leaderB, allyA, outsider, submit };
}

describe('actual array relay accounting through both brains', () => {
  it('moves real Qi and exposes a true break, while preserving charge through repair, asset loss, and saving', async () => {
    const { world, first, second, third, placeA, placeB, leaderA, leaderB, outsider, submit } = fixture();
    const offer = availableFormationActions(leaderA, world).find((row) => row.targetSectId === second.id && row.formationMove === 'offer')!;
    expect(offer).toBeDefined();
    expect(submit(leaderA, act(offer))).not.toBeNull();
    expect(first.spiritStones + second.spiritStones).toBe(2_000);
    const { id: targetFormationLinkId } = world.formations.links[0];
    world.tick++;
    expect(submit(leaderB, act({ formationMove: 'accept', targetFormationLinkId }))).not.toBeNull();
    const link = world.formations.links[0];
    expect(link).toMatchObject({ status: 'active', openedPaymentEach: 24, sentTotal: 0, deliveredTotal: 0 });
    expect(first.spiritStones + second.spiritStones).toBe(2_000 - 48);
    expect(visibleFormationLinks(world, outsider)).toEqual([]);
    world.tick++;
    const rule = act({ formationMove: 'dispatch', targetFormationLinkId });
    expect(submit(leaderA, rule)).not.toBeNull();
    expect(leaderA.qiProgress).toBe(80);
    expect(link.sentTotal).toBe(20);
    expect(link.deliveredTotal + link.transmissionLoss).toBe(20);
    expect(link.deliveredTotal).toBeGreaterThan(0);
    expect(submit(leaderA, rule)).toBeNull();
    world.tick++;
    leaderB.qiProgress = 99.5; // imported saves may have fractional Qi; real network packets are integral
    expect(availableFormationActions(leaderB, world, false).some(({ formationMove }) => formationMove === 'draw')).toBe(false);
    leaderB.qiProgress = 0;
    const draw = computeHeuristicDecision(leaderB, world, () => .99);
    expect(draw).toMatchObject({ chosenAction: 'FORMATION_NETWORK', formationMove: 'draw', targetFormationLinkId });
    expect(submit(leaderB, draw)).not.toBeNull();
    expect(leaderB.qiProgress).toBe(link.drawnTotal);
    expect(leaderB.qiProgress).toBeGreaterThan(0);

    world.tick++;
    const source = vi.fn();
    const response = (decision: LLMDecisionPayload) =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }));
    const request = vi.fn(async () => response(act({ formationMove: 'overload', targetFormationLinkId: 'fake-link' })));
    vi.stubGlobal('fetch', request);
    const nope = await queryCultivatorLLMDecision(leaderA, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(nope.formationMove).not.toBe('overload');
    request.mockImplementation(async () => response(act({ formationMove: 'overload', targetFormationLinkId })));
    const accepted = await queryCultivatorLLMDecision(leaderA, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(submit(leaderA, accepted)).not.toBeNull();
    expect(leaderA.qiProgress).toBe(40);
    expect(link.status).toBe('broken');
    expect(link.sentTotal).toBe(60);
    expect(decodeWorldSave(encodeWorldSave(world)).formations).toEqual(world.formations);
    expect(submit(leaderB, act({ formationMove: 'repair', targetFormationLinkId }))).toBeNull();
    world.tick++;
    const opening = second.spiritStones;
    expect(submit(leaderB, act({ formationMove: 'repair', targetFormationLinkId }))).not.toBeNull();
    expect(second.spiritStones).toBe(opening - 18);
    expect(link.status).toBe('active');

    // Real endpoint title changes; remaining held qi must be accounted for, not silently duplicated elsewhere.
    placeB.ownerSectId = third.id;
    expect(advanceFormations(world)).toHaveLength(1);
    expect(link).toMatchObject({ status: 'ended', heldA: 0, heldB: 0, endReason: 'site_lost' });
    expect(link.sentTotal).toBe(link.deliveredTotal + link.transmissionLoss);
    expect(link.deliveredTotal).toBe(link.drawnTotal + link.dissipatedTotal);
    expect(leaderA.qiProgress + leaderB.qiProgress + link.transmissionLoss + link.dissipatedTotal).toBe(100);
    expect(advanceFormations(world)).toEqual([]);
    expect(decodeWorldSave(encodeWorldSave(world)).formations).toEqual(world.formations);
    const forged = structuredClone(world);
    forged.formations.links[0].heldB = 1;
    expect(() => encodeWorldSave(forged)).toThrow(/formations.links.conservation/);
    expect(placeA.ownerSectId).toBe(first.id);
  });

  it('migrates earlier worlds without creating unearned qi or phantom links', () => {
    const { world } = fixture();
    const { formations, ...old } = world;
    const restored = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: old }));
    expect(restored.formations).toEqual(formations);
    expect(restored.cultivators.map(({ qiProgress }) => qiProgress)).toEqual(world.cultivators.map(({ qiProgress }) => qiProgress));
  });
});
