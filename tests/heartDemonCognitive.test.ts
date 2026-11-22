import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeAvatar, possessAvatar } from '../src/engine/avatarEngine';
import { createDecisionReplayTape, legalTraceCandidates, replayOneTurn } from '../src/engine/decisionTraceEngine';
import { activeHeartDemon, isHeartDemonGuided, queueGuidedHeartDemonChoice, recommendHeartDemonChoice,
  releaseGuidedHeartDemon } from '../src/engine/heartDemonEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision, requiredBeforeOrdinaryDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { modelDecisionCandidates } from '../src/engine/modelDecisionTurn';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { HEART_DEMON_CHOICES } from '../src/types/heartDemon';
import type { Cultivator, LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'mock', model: 'mock' };
const reply = (choice: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(choice) } }] }));
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '尚需休养。' };
const guard: LLMDecisionPayload = { chosenAction: 'FACE_TRIBULATION', tribulationStance: 'guard', innerMonologue: '顶住这道劫雷。' };
const marker = '不准随心魔许可发送的名字';
const person = (world: WorldState, actorId: string) => world.cultivators.find(({ id }) => id === actorId)!;

function advance(world: WorldState, actorId: string, decision?: LLMDecisionPayload,
  trace?: Parameters<typeof advanceWorldTick>[5]) {
  const otherOrders = Object.fromEntries(world.cultivators.filter(({ id }) => id !== actorId).map(({ id }) => [id, rest]));
  return advanceWorldTick(world, { ...otherOrders, ...(decision ? { [actorId]: decision } : {}) }, () => .5, 'utility', undefined, trace);
}

function startTrial(guided = false) {
  const world = createInitialWorld(711);
  const [actor, rival] = world.cultivators;
  world.cultivators = [actor, rival];
  rival.name = marker;
  rival.locationId = actor.locationId;
  rival.hp = rival.maxHp = 1000;
  actor.hp = actor.maxHp = 1500;
  actor.combatPower = 5000;
  rival.combatPower = 500;
  const earlier = advance(world, actor.id, { chosenAction: 'DUEL', targetCultivatorId: rival.id,
    innerMonologue: '一桩真实旧怨。', spokenLine: '早年的旧事，不是心魔证词。' });
  expect(earlier.witnessedPersonalStory.scenes.some(scene => scene.kind === 'duel' && scene.actorIds.includes(rival.id))).toBe(true);
  const trialActor = person(earlier, actor.id);
  Object.assign(trialActor, { realm: '筑基', realmStage: 9, qiProgress: 100, hp: 1200, maxHp: 1200,
    techniqueMastery: 80, artifacts: [], pillToxicity: 0, reflections: [], secretGoal: '心魔选项不得调用私下目标。' });
  trialActor.pills.barrier = 0;
  if (guided) expect(possessAvatar(earlier, actor.id)).toBe(true);
  const starting = advance(earlier, actor.id, { chosenAction: 'BREAKTHROUGH', innerMonologue: '迎接实劫。' });
  const subject = person(starting, actor.id);
  expect(subject.tribulation).toMatchObject({ stage: 'lightning', heartTheatreArmed: true });
  return { world: starting, actor: subject, rival: person(starting, rival.id) };
}

function heart(guided = false) {
  const start = startTrial(guided);
  let world = start.world;
  for (let wave = 1; wave <= 3; wave++) {
    world = advance(world, start.actor.id, guard);
    expect(world.events.some(({ id, tick }) => tick === world.tick && id.endsWith(`-tribulation-wave-${wave}`))).toBe(true);
  }
  const actor = person(world, start.actor.id), trial = actor.tribulation!;
  const frame = activeHeartDemon(world, actor);
  if (!frame) throw Error('No witnessed native survived last-wave heart scene');
  expect(frame).toMatchObject({ openedTick: world.tick, evidence: { kind: 'bond', otherActorId: start.rival.id } });
  expect(isHeartDemonGuided(world, actor, frame)).toBe(guided);
  return { world, actor, trial, frame, rival: person(world, start.rival.id) };
}

const finishChoice = (actor: Cultivator, heartDemonChoice: 'sever' | 'wrath' | 'face') =>
  ({ chosenAction: 'FACE_TRIBULATION' as const, targetHeartTrialId: actor.tribulation!.id, heartDemonChoice });

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('native heart demon choices through the model and offline rule', () => {
  it('offers only an exact native trial choice in one fair request, never a name, bond, earlier words, or arbitrary effect', async () => {
    const { world, actor, trial, frame, rival } = heart();
    const permitted = finishChoice(actor, 'wrath');
    const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(permitted));
    vi.stubGlobal('fetch', transport);
    const onStart = vi.fn();
    const before = structuredClone(world);
    expect(modelDecisionCandidates(world)).toContain(actor);
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick, { onStart })).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 2, { onStart })).resolves.toBeUndefined();
    expect(transport).not.toHaveBeenCalled();
    const picked = await requestCultivatorLLMDecision(actor, world, config, world.tick + 1, { onStart });
    expect(picked).toMatchObject(permitted);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(transport.mock.calls[0][1]?.body)) as { messages: { content: string }[] };
    const prompt = sent.messages.map(row => row.content).join(' ');
    for (const option of HEART_DEMON_CHOICES) expect(prompt).toContain(JSON.stringify(finishChoice(actor, option)));
    for (const privateText of [actor.name, rival.name, rival.id, frame.id, frame.siteId, frame.finalWaveEventId, actor.secretGoal,
      '早年的旧事', 'evidence', 'heartGuide', 'tribulationStance', 'innerMonologue', 'karmaDelta']) expect(prompt).not.toContain(privateText);
    expect(world).toEqual(before);

    // Authentic final lightning is still public, while the following selected heart answer is private.
    const lightning = world.decisionTrace.records.find(row => row.actorId === actor.id && row.tick === world.tick);
    expect(lightning?.chosenAction).toBe('FACE_TRIBULATION');
    expect(legalTraceCandidates(world, actor)).toEqual([]);
    const settled = advance(world, actor.id, picked, { modelActors: new Set([actor.id]) });
    expect(person(settled, actor.id).tribulation?.heartDemon?.result).toMatchObject({ choice: 'wrath', origin: 'model' });
    const privateRow = settled.decisionTrace.records.find(row => row.actorId === actor.id && row.tick === settled.tick);
    expect(privateRow).toMatchObject({ chosenAction: 'redacted', candidates: [], source: 'model' });
    expect(privateRow?.chosenCandidateId).toBeUndefined();
    expect(JSON.stringify(privateRow)).not.toMatch(new RegExp(`wrath|${trial.id}|evidence`));
  });

  it('rejects malformed and mixed legacy replies, then the next true unattended turn applies native Utility choice', async () => {
    const { world, actor, trial, frame } = heart();
    const permitted = finishChoice(actor, 'sever');
    const invalid = [
      { ...permitted, chosenAction: 'REST' }, { ...permitted, targetHeartTrialId: frame.id },
      { ...permitted, heartDemonChoice: 'forgive' }, { ...permitted, targetCultivatorId: actor.id },
      { ...permitted, tribulationStance: 'focus' }, { ...permitted, targetLocationId: frame.siteId },
      { ...permitted, innerMonologue: '不受信任的台词。' }, { ...permitted, masteryDelta: 100 }, [permitted], null,
      { chosenAction: 'FACE_TRIBULATION', tribulationStance: 'focus' },
    ];
    const transport = vi.fn(async () => reply(invalid.shift()));
    vi.stubGlobal('fetch', transport);
    while (invalid.length) {
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    const expected = recommendHeartDemonChoice(world, actor, frame);
    expect(computeHeuristicDecision(actor, world)).toMatchObject({ chosenAction: 'FACE_TRIBULATION',
      targetHeartTrialId: trial.id, heartDemonChoice: expected });
    expect(requiredBeforeOrdinaryDecision(actor, world)?.heartDemonChoice).toBe(expected);
    expect(person(advance(world, actor.id), actor.id).tribulation?.heartDemon?.result).toMatchObject({ choice: expected, origin: 'utility' });
  });

  it('keeps protected and queued actual player answers out of the provider, re-admits explicit release, and rejects late invalidation', async () => {
    const { world, actor, trial } = heart(true);
    expect(activeAvatar(world)).toBeUndefined(); // Seal survives the native loss of the possessed body.
    const permitted = finishChoice(actor, 'face');
    const transport = vi.fn(async () => reply(permitted));
    vi.stubGlobal('fetch', transport);
    const onStart = vi.fn();
    expect(modelDecisionCandidates(world)).not.toContain(actor);
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1, { onStart })).resolves.toBeUndefined();
    expect(computeHeuristicDecision(actor, world).heartDemonChoice).toBeUndefined();
    const waiting = advance(world, actor.id);
    expect(person(waiting, actor.id).tribulation?.heartDemon?.result).toBeUndefined();
    expect(waiting.decisionTrace.records.find(row => row.actorId === actor.id && row.tick === waiting.tick))
      .toMatchObject({ chosenAction: 'redacted', candidates: [], applied: false });
    const queued = queueGuidedHeartDemonChoice(world, actor.id, trial.id, 'sever');
    expect(queued).not.toBe(world);
    const queuedActor = person(queued, actor.id);
    expect(modelDecisionCandidates(queued)).not.toContain(queuedActor);
    await expect(requestCultivatorLLMDecision(queuedActor, queued, config, queued.tick + 1, { onStart })).resolves.toBeUndefined();
    expect(transport).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(person(advance(queued, actor.id), actor.id).tribulation?.heartDemon?.result).toMatchObject({ choice: 'sever', origin: 'player' });

    const released = releaseGuidedHeartDemon(world, actor.id, trial.id);
    const releasedActor = person(released, actor.id);
    expect(modelDecisionCandidates(released)).toContain(releasedActor);
    await expect(requestCultivatorLLMDecision(releasedActor, released, config, released.tick + 1, { onStart })).resolves.toMatchObject(permitted);
    expect(onStart).toHaveBeenCalledTimes(1);
    const stale = vi.fn(async () => {
      releasedActor.locationId = released.locations.find(site => site.id !== releasedActor.locationId)!.id;
      return reply(permitted);
    });
    vi.stubGlobal('fetch', stale);
    await expect(requestCultivatorLLMDecision(releasedActor, released, config, released.tick + 1)).resolves.toBeUndefined();
    expect(stale).toHaveBeenCalledTimes(1);
  });

  it('keeps old lightning stance usable but never discloses future heart guide fields or accepts stale heart tokens', async () => {
    const { world, actor } = startTrial(true);
    expect(actor.tribulation?.heartGuide).toBeTruthy();
    actor.tribulation!.lastOutcome = '私下劫后叙述不是旧雷劫公开选项。';
    const valid = { chosenAction: 'FACE_TRIBULATION', tribulationStance: 'guard', innerMonologue: '且先守御。' };
    const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(valid));
    vi.stubGlobal('fetch', transport);
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toMatchObject(valid);
    const sent = String(transport.mock.calls[0][1]?.body);
    expect(sent).toContain('自身天劫');
    expect(sent).not.toMatch(/heartGuide|heartTheatreArmed|heartDemon|originalPossessionUntilTick|私下劫后叙述/);
    transport.mockResolvedValueOnce(reply({ ...valid, targetHeartTrialId: actor.tribulation!.id, heartDemonChoice: 'face' }));
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1)).resolves.toBeUndefined();
  });

  it('retains exact isolated peer mechanics for permitted replay but never offers the private answer as an alternate', () => {
    const { world, actor, rival } = heart();
    const actual = { ...finishChoice(actor, 'wrath'), innerMonologue: '不可进入复演数据的私念。' };
    const tape = createDecisionReplayTape(world, 'utility');
    const baseline = advance(world, actor.id, actual, { tape, modelActors: new Set([actor.id]) });
    const rows = baseline.decisionTrace.records.filter(row => row.tick === baseline.tick);
    const hidden = rows.find(row => row.actorId === actor.id)!;
    const peer = rows.find(row => row.actorId === rival.id)!;
    const alternate = peer.candidates.find(row => row.action === 'CULTIVATE')!;
    const replay = vi.fn<Parameters<typeof replayOneTurn>[4]>((copy, decisions, mode, onActor, replayDraws, replayHeartModelActors) => {
      expect(decisions[actor.id]).toEqual({ ...finishChoice(actor, 'wrath'), innerMonologue: '' });
      expect(replayHeartModelActors).toEqual(new Set([actor.id]));
      const replayed = advanceWorldTick(copy, decisions, () => .5, mode, undefined, { onActor, replayDraws, replayHeartModelActors });
      expect(person(replayed, actor.id).tribulation?.heartDemon?.result).toMatchObject({ choice: 'wrath', origin: 'model' });
      return replayed;
    });
    expect(replayOneTurn(tape, baseline, hidden.id, 'FACE_TRIBULATION:focus', replay)).toMatchObject({ ok: false });
    expect(replay).not.toHaveBeenCalled();
    expect(alternate).toBeDefined();
    expect(replayOneTurn(tape, baseline, peer.id, alternate.id, replay)).toMatchObject({ ok: true });
    expect(replay).toHaveBeenCalledTimes(2);
  });
});
