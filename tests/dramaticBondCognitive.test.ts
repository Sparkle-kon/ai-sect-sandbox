import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { projectDramaticBondArcs } from '../src/engine/dramaticBondEngine';
import { createFairModelTurnState } from '../src/engine/fairModelTurnEngine';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { modelDecisionCandidates, runModelDecisionTurn } from '../src/engine/modelDecisionTurn';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'mock', model: 'mock' };
const actorId = 'npc-1', peerId = 'npc-2', secretActorId = 'npc-3', secretPeerId = 'npc-4';
const publicSiteId = 'loc-market';
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '在原地调息。' };
const modelThought = '【哨兵】无事实：自称已经结下道侣之约。';
const modelSpeech = '【哨兵】空口自称曾在异地救过道友。';
const privateThought = '【哨兵】从未公示的第三方暗算意念。';
const proposal: LLMDecisionPayload = {
  chosenAction: 'SOCIALIZE', targetCultivatorId: peerId, innerMonologue: modelThought, spokenLine: modelSpeech,
};
const findActor = (world: WorldState, id: string) => world.cultivators.find(actor => actor.id === id)!;
const onlyRests = (world: WorldState) => Object.fromEntries(world.cultivators.map(({ id }) => [id, rest]));
const society = (world: WorldState, id: string) => world.events.find(event => event.id === `evt-${world.tick}-${id}-social`);
const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));

afterEach(() => { vi.unstubAllGlobals(); llmScheduler.resetTickBudget(); });

function commonBranch() {
  const start = createInitialWorld(2031);
  const actor = findActor(start, actorId), peer = findActor(start, peerId);
  actor.locationId = peer.locationId = publicSiteId;
  actor.qiProgress = 0;
  actor.hp -= 100; // An actual recovery documents T2 ordinary intent before the provider's T3 menu.
  actor.personality = '痴情'; // Native Utility social preference, not a precomputed order.
  for (const other of start.cultivators) {
    if (other !== actor && other !== peer && other.locationId === publicSiteId) other.locationId = 'loc-taixu';
  }
  findActor(start, secretActorId).locationId = findActor(start, secretPeerId).locationId = 'loc-blood';
  const real = advanceWorldTick(start, {
    ...onlyRests(start),
    [peerId]: { chosenAction: 'SOCIALIZE', targetCultivatorId: actorId, innerMonologue: '与同门在坊市谈法。' },
    [secretActorId]: { chosenAction: 'SCHEMING', targetCultivatorId: secretPeerId, innerMonologue: privateThought },
  }, () => .99, 'deferred');
  const meeting = society(real, peerId);
  const scheme = real.events.find(event => event.id === `evt-${real.tick}-${secretActorId}-scheme`);
  expect(meeting?.actorIds).toEqual([peerId, actorId]);
  expect(scheme).toMatchObject({ witnessScope: 'participants', actorIds: [secretActorId, secretPeerId] });
  return { real, meeting: meeting!, scheme: scheme! };
}

describe('dramatic bonds come from the same native settlement for Cognitive and unattended Utility', () => {
  it('projects identical distinct-month public evidence, not arbitrary provider prose or private side activity', async () => {
    const { real, meeting, scheme } = commonBranch();
    const before = structuredClone(real);
    const provider = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response({
      ...proposal,
      dramaticBondFact: { actorIds: [actorId, secretPeerId], winnerId: actorId, kind: 'lethal_duel' },
    }));
    vi.stubGlobal('fetch', provider);

    const eligible = modelDecisionCandidates(real).filter(actor => actor.id === actorId);
    expect(eligible).toEqual([findActor(real, actorId)]);
    const batch = await runModelDecisionTurn({
      state: createFairModelTurnState(), eligible, admission: { slots: 1 }, signal: new AbortController().signal,
      request: (actor, signal, onStart) => requestCultivatorLLMDecision(actor, real, config, real.tick + 1, { signal, onStart }),
    });
    expect(batch.startedActorIds).toEqual([actorId]);
    expect(batch.orders.get(actorId)).toMatchObject(proposal);
    expect(batch.orders.get(actorId)).not.toHaveProperty('dramaticBondFact');
    expect(real).toEqual(before);
    expect(provider).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(provider.mock.calls[0][1]?.body)) as { messages: { content: string }[] };
    const prompt = request.messages.map(row => row.content).join('\n');
    const legalLine = prompt.split('\n').find(line => line.includes('日常选项'));
    expect(legalLine).toContain(`"chosenAction":"SOCIALIZE","targetCultivatorId":"${peerId}"`);
    for (const unauthorized of [scheme.id, scheme.description, privateThought, 'dramaticBondFact', 'sourceEventId', 'lethal_duel', modelThought, modelSpeech]) {
      expect(prompt).not.toContain(unauthorized);
    }

    const othersOnly = onlyRests(real);
    delete othersOnly[actorId];
    const applied = vi.fn();
    const cognitive = advanceWorldTick(real, { ...othersOnly, ...Object.fromEntries(batch.orders) }, () => .99, 'deferred', applied,
      { modelActors: new Set(batch.orders.keys()) });
    const utility = advanceWorldTick(real, othersOnly, () => .99, 'deferred');
    expect(applied).toHaveBeenCalledWith(actorId, true);
    for (const [world, source] of [[cognitive, 'model'], [utility, 'utility']] as const) {
      expect(world.tick).toBe(real.tick + 1);
      const event = society(world, actorId);
      expect(event).toMatchObject({ tick: world.tick, year: world.year, month: world.month,
        locationId: publicSiteId, actorIds: [actorId, peerId] });
      expect(world.decisionTrace.records.find(row => row.actorId === actorId && row.tick === world.tick))
        .toMatchObject({ source, chosenAction: 'SOCIALIZE', applied: true });
    }
    expect(society(cognitive, actorId)?.description).toContain(modelSpeech);
    expect(society(utility, actorId)?.description).not.toContain(modelSpeech);
    expect(cognitive.dramaticBonds).toEqual(utility.dramaticBonds);
    const first = cognitive.dramaticBonds?.facts.find(fact => fact.sourceEventId === meeting.id);
    const second = cognitive.dramaticBonds?.facts.find(fact => fact.sourceEventId === society(cognitive, actorId)?.id);
    expect(first).toMatchObject({ kind: 'encounter', tick: meeting.tick, year: meeting.year, month: meeting.month,
      siteId: publicSiteId, actorIds: [peerId, actorId] });
    expect(second).toMatchObject({ kind: 'encounter', tick: cognitive.tick, year: cognitive.year, month: cognitive.month,
      siteId: publicSiteId, actorIds: [actorId, peerId] });
    const scope = { viewerId: actorId, currentVisibleSiteIds: new Set([publicSiteId]) };
    expect(projectDramaticBondArcs(real, scope)).toEqual([]);
    expect(projectDramaticBondArcs(cognitive, { ...scope, throughTick: real.tick })).toEqual([]);
    const arc = projectDramaticBondArcs(cognitive, scope);
    expect(arc).toEqual(projectDramaticBondArcs(utility, scope));
    expect(arc).toHaveLength(1);
    expect(arc[0]).toMatchObject({ actorIds: [actorId, peerId], title: '故人再会', lastTick: cognitive.tick,
      milestones: [{ tick: meeting.tick, year: meeting.year, month: meeting.month },
        { tick: cognitive.tick, year: cognitive.year, month: cognitive.month }] });
    const serialized = JSON.stringify([cognitive.dramaticBonds, arc]);
    for (const unauthorized of [scheme.id, scheme.description, privateThought, modelThought, modelSpeech, 'lethal_duel']) {
      expect(serialized).not.toContain(unauthorized);
    }
  });
});
