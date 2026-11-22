import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { possessAvatar } from '../src/engine/avatarEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { modelDecisionCandidates } from '../src/engine/modelDecisionTurn';
import { activeRoguelikeEncounter } from '../src/engine/roguelikeEncounterEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { ROGUELIKE_ENCOUNTER_CHOICES } from '../src/types/roguelikeEncounter';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'mock', model: 'mock' };
const response = (choice: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(choice) } }] }));
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '停在实到之处。' };
function fixture(guided = false) {
  const start = createInitialWorld(153); // This exact native arrival has an autonomous encounter opening roll of zero.
  const [actor] = start.cultivators;
  const destination = start.locations.find(({ id }) => id === 'loc-secret-1')!;
  actor.exploredTileIds.push(terrainTileAt(start, destination.x, destination.y)!.id);
  actor.secretGoal = '无关的私下念头，不可发送。';
  if (guided) expect(possessAvatar(start, actor.id)).toBe(true);
  const options = Object.fromEntries(start.cultivators.map(({ id }) => [id, id === actor.id ?
    { chosenAction: 'EXPLORE', targetLocationId: destination.id, innerMonologue: '由真实已知路线探索。' } satisfies LLMDecisionPayload : rest]));
  const world = advanceWorldTick(start, options, () => .99);
  const arrived = world.cultivators.find(({ id }) => id === actor.id)!;
  const encounter = activeRoguelikeEncounter(world, arrived);
  if (!encounter) throw Error('Native arrival did not open the authored encounter');
  expect(encounter.guided).toBe(guided);
  expect(arrived.locationId).toBe(destination.id);
  expect(world.events.some(row => row.id === `evt-${world.tick}-${actor.id}-explore`)).toBe(false);
  return { world, actor: arrived, encounter };
}

function settleTurn(world: ReturnType<typeof createInitialWorld>, actorId: string, choice?: LLMDecisionPayload) {
  const otherOrders = Object.fromEntries(world.cultivators.filter(({ id }) => id !== actorId).map(({ id }) => [id, rest]));
  return advanceWorldTick(world, { ...otherOrders, ...(choice ? { [actorId]: choice } : {}) }, () => .99);
}

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('native roguelike choice through the fair Cognitive and Utility decision seams', () => {
  it('uses one minimal fair request for this actual next-turn option and no hidden or manufactured state', async () => {
    const { world, actor, encounter } = fixture();
    const permitted = { chosenAction: 'ROGUELIKE_ENCOUNTER', targetRoguelikeEncounterId: encounter.id, roguelikeEncounterChoice: 'bold' };
    const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(permitted));
    vi.stubGlobal('fetch', transport);
    const onStart = vi.fn();
    const snapshot = structuredClone(world);
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick, { onStart })).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 2, { onStart })).resolves.toBeUndefined();
    expect(modelDecisionCandidates(world)).toContain(actor);
    expect(transport).not.toHaveBeenCalled();

    const decision = await requestCultivatorLLMDecision(actor, world, config, world.tick + 1, { onStart });
    expect(decision).toMatchObject(permitted);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
    const input = JSON.parse(String(transport.mock.calls[0][1]?.body)) as { messages: { content: string }[]; max_tokens: number };
    const prompt = input.messages.map(({ content }) => content).join(' ');
    for (const choice of ROGUELIKE_ENCOUNTER_CHOICES) expect(prompt).toContain(JSON.stringify({ ...permitted, roguelikeEncounterChoice: choice }));
    for (const privateData of [actor.name, encounter.siteId, encounter.fromSiteId, actor.secretGoal, 'innerMonologue', 'affinityDelta']) {
      expect(prompt).not.toContain(privateData);
    }
    expect(world).toEqual(snapshot);
    expect(settleTurn(world, actor.id, decision).roguelikeEncounters?.find(row => row.id === encounter.id)).toMatchObject({
      status: 'resolved', choice: 'bold', resolvedTick: world.tick + 1,
    });
  });

  it('rejects malformed, wrong-ID and extra actor/effect/narration fields, then delegates to Utility on failure', async () => {
    const { world, actor, encounter } = fixture();
    const permitted = { chosenAction: 'ROGUELIKE_ENCOUNTER', targetRoguelikeEncounterId: encounter.id, roguelikeEncounterChoice: 'cautious' };
    const payloads = [
      { ...permitted, chosenAction: 'REST' }, { ...permitted, targetRoguelikeEncounterId: 'encounter-other-actor-or-frame' },
      { ...permitted, roguelikeEncounterChoice: 'forge-new-choice' }, { ...permitted, targetCultivatorId: actor.id },
      { ...permitted, outcome: { hpDelta: +100 } }, { ...permitted, innerMonologue: '不受信任的额外叙述。' },
      { ...permitted, siteScope: encounter.siteId }, [permitted], null,
    ];
    const transport = vi.fn(async () => response(payloads.shift()));
    vi.stubGlobal('fetch', transport);
    while (payloads.length) {
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    // Canonical fallback is chosen after the clock advances, not against the still-open render snapshot.
    const execution = structuredClone(world);
    execution.tick++; execution.month++;
    const expected = computeHeuristicDecision(execution.cultivators.find(({ id }) => id === actor.id)!, execution);
    expect(expected).toMatchObject({ chosenAction: 'ROGUELIKE_ENCOUNTER', targetRoguelikeEncounterId: encounter.id });
    expect(ROGUELIKE_ENCOUNTER_CHOICES).toContain(expected.roguelikeEncounterChoice);
    expect(settleTurn(world, actor.id).roguelikeEncounters?.find(row => row.id === encounter.id)).toMatchObject({
      status: 'resolved', choice: expected.roguelikeEncounterChoice,
    });
  });

  it('drops a valid reply if the exact local opportunity ceased to exist while the provider was responding', async () => {
    const { world, actor, encounter } = fixture();
    const late = vi.fn(async () => {
      encounter.status = 'expired';
      return response({ chosenAction: 'ROGUELIKE_ENCOUNTER', targetRoguelikeEncounterId: encounter.id, roguelikeEncounterChoice: 'bold' });
    });
    vi.stubGlobal('fetch', late);
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toBeUndefined();
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('does not contact the provider or consume fair admission for an actual guided encounter, even without an explicit answer', async () => {
    const { world, actor, encounter } = fixture(true);
    const noRequest = vi.fn(async () => response({ chosenAction: 'ROGUELIKE_ENCOUNTER',
      targetRoguelikeEncounterId: encounter.id, roguelikeEncounterChoice: 'bold' }));
    vi.stubGlobal('fetch', noRequest);
    const onStart = vi.fn();
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1, { onStart })).resolves.toBeUndefined();
    expect(noRequest).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(modelDecisionCandidates(world)).not.toContain(actor);
    expect(settleTurn(world, actor.id).roguelikeEncounters?.find(row => row.id === encounter.id)).toMatchObject({
      status: 'resolved', choice: 'leave', outcome: { hpDelta: 0, qiDelta: 0, karmaDelta: 0, lifespanDelta: 0, affinityDelta: 0 },
    });
  });
});
