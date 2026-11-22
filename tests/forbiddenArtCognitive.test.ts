import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDecisionReplayTape, legalTraceCandidates, replayOneTurn } from '../src/engine/decisionTraceEngine';
import { activeForbiddenDuel, availableForbiddenArtOptions, chooseForbiddenArtDecision, forbiddenDuelForParticipant, queueGuidedForbiddenArt } from '../src/engine/forbiddenArtEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { modelDecisionCandidates } from '../src/engine/modelDecisionTurn';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { FORBIDDEN_ART_IDS, type ForbiddenArtChoice } from '../src/types/forbiddenArt';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';
import { actualThreatenedDuel, artActor, artDuel, artOwnerId, artTurn, strongRivalId } from './forbiddenArtNativeFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'mock', model: 'mock' };
const reply = (choice: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(choice) } }] }));
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '暂且守静。' };

function encounter(guided = false) {
  const { wounded, itemId } = actualThreatenedDuel(guided);
  const world = artTurn(wounded, { [strongRivalId]: artDuel(artOwnerId) });
  const owner = artActor(world), counterpart = artActor(world, strongRivalId);
  const contact = activeForbiddenDuel(world, owner);
  if (!contact) throw Error('A real DUEL did not open its original weaker defender contact');
  expect(contact).toMatchObject({ ownerId: owner.id, attackerId: strongRivalId, defenderId: owner.id, guided, artifactId: itemId });
  const options = availableForbiddenArtOptions(world, contact);
  expect(options.some(option => option.choice !== 'decline')).toBe(true);
  return { wounded, world, owner, counterpart, contact, options };
}
const orderFor = (id: string, forbiddenArtChoice: ForbiddenArtChoice) =>
  ({ chosenAction: 'FORBIDDEN_ART' as const, targetForbiddenDuelId: id, forbiddenArtChoice });

function finish(world: WorldState, ownerOrder?: LLMDecisionPayload, traceOptions?: Parameters<typeof advanceWorldTick>[5],
  recordDecisionEffect?: Parameters<typeof advanceWorldTick>[4]) {
  const orders = Object.fromEntries(world.cultivators.filter(row => row.id !== artOwnerId).map(({ id }) => [id, rest]));
  return advanceWorldTick(world, { ...orders, ...(ownerOrder ? { [artOwnerId]: ownerOrder } : {}) }, () => .10,
    'utility', recordDecisionEffect, traceOptions);
}

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('actual suspended forbidden-art contact through Cognitive and Utility', () => {
  it('admits exactly the threatened defender, sends only the current legal menu, and applies its model-authored choice at the original attacker slot', async () => {
    const { world, owner, counterpart, contact, options } = encounter();
    const permitted = orderFor(contact.id, options.find(option => option.choice !== 'decline')!.choice);
    const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(permitted));
    vi.stubGlobal('fetch', transport);
    const onStart = vi.fn();
    const before = structuredClone(world);
    expect(forbiddenDuelForParticipant(world, counterpart)).toBe(contact);
    expect(modelDecisionCandidates(world)).toContain(owner);
    expect(modelDecisionCandidates(world)).not.toContain(counterpart);
    await expect(requestCultivatorLLMDecision(counterpart, world, config, world.tick + 1, { onStart })).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(owner, world, config, world.tick, { onStart })).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(owner, world, config, world.tick + 2, { onStart })).resolves.toBeUndefined();
    expect(transport).not.toHaveBeenCalled();
    const decision = await requestCultivatorLLMDecision(owner, world, config, world.tick + 1, { onStart });
    expect(decision).toMatchObject(permitted);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
    const input = JSON.parse(String(transport.mock.calls[0][1]?.body)) as { messages: { content: string }[] };
    const prompt = input.messages.map(({ content }) => content).join(' ');
    for (const option of options) expect(prompt).toContain(JSON.stringify(orderFor(contact.id, option.choice)));
    for (const unauthorized of [owner.name, counterpart.name, contact.siteId, contact.artifactId, 'innerMonologue', 'rolls',
      'attackScore', 'projectedDamage', 'paid', 'durability', 'lifespan']) expect(prompt).not.toContain(unauthorized);
    expect(world).toEqual(before);

    const applied = vi.fn();
    const after = finish(world, decision, { modelActors: new Set([owner.id]) }, applied);
    const scar = artActor(after).forbiddenScars?.find(row => row.contactId === contact.id);
    expect(scar).toMatchObject({ artId: permitted.forbiddenArtChoice, ownerId: owner.id, opponentId: counterpart.id,
      tick: world.tick + 1, origin: 'model' });
    expect(applied).toHaveBeenCalledWith(owner.id, true);
    const row = after.decisionTrace.records.find(record => record.actorId === owner.id && record.tick === after.tick);
    expect(row).toMatchObject({ source: 'model', applied: true, chosenAction: 'redacted', candidates: [] });
    expect(JSON.stringify(row)).not.toMatch(/forbiddenArtChoice|targetForbiddenDuelId|taixu-sword-seal/);
  });

  it('rejects invalid/off-menu/wrong-contact actions, costs, names, lore and stale replies; Utility chooses from the same active actual menu', async () => {
    const { wounded, world, owner, counterpart, contact, options } = encounter();
    const permitted = orderFor(contact.id, options.find(option => option.choice !== 'decline')!.choice);
    const unavailable = FORBIDDEN_ART_IDS.find(id => options.every(option => option.choice !== id));
    expect(unavailable).toBeDefined();
    const invalid = [
      { ...permitted, chosenAction: 'DUEL' }, { ...permitted, targetForbiddenDuelId: `${contact.id}-other` },
      { ...permitted, forbiddenArtChoice: unavailable }, { ...permitted, targetCultivatorId: counterpart.id },
      { ...permitted, innerMonologue: '任意说法不是许可。' }, { ...permitted, cost: { hp: 0 } },
      { ...permitted, projected: { result: 'reversal' } }, { ...permitted, rolls: [0, 0, 0, 0] }, [permitted], null,
    ];
    const transport = vi.fn(async () => reply(invalid.shift()));
    vi.stubGlobal('fetch', transport);
    while (invalid.length) {
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(owner, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    // No actual pending duel: the broad decision lane won't accept hidden forbidden fields on an ordinary action.
    transport.mockResolvedValueOnce(reply({ ...permitted, chosenAction: 'REST', innerMonologue: '且静候。' }));
    await expect(requestCultivatorLLMDecision(artActor(wounded), wounded, config, wounded.tick + 1)).resolves.toBeUndefined();

    expect(legalTraceCandidates(world, owner)).toEqual([]);
    expect(legalTraceCandidates(world, counterpart)).toEqual([]);
    const native = chooseForbiddenArtDecision(world, owner);
    expect(native).toMatchObject({ chosenAction: 'FORBIDDEN_ART', targetForbiddenDuelId: contact.id });
    expect(options.map(option => option.choice)).toContain(native?.forbiddenArtChoice);
    expect(computeHeuristicDecision(owner, world)).toEqual(native);
    expect(computeHeuristicDecision(counterpart, world).forbiddenArtChoice).toBeUndefined();
    const terminal = finish(world);
    const proof = artActor(terminal).forbiddenScars?.find(row => row.contactId === contact.id);
    if (native?.forbiddenArtChoice === 'decline') expect(proof).toBeUndefined();
    else expect(proof).toMatchObject({ origin: 'utility', artId: native?.forbiddenArtChoice });

    const stale = vi.fn(async () => {
      counterpart.locationId = world.locations.find(site => site.id !== contact.siteId)!.id;
      return reply(permitted);
    });
    vi.stubGlobal('fetch', stale);
    await expect(requestCultivatorLLMDecision(owner, world, config, world.tick + 1)).resolves.toBeUndefined();
    expect(stale).toHaveBeenCalledTimes(1);
  });

  it('never contacts a provider for either participant in a genuine guided contact or allows untrusted paid selection', async () => {
    const { world, owner, counterpart, contact, options } = encounter(true);
    const forbiddenArtChoice = options.find(option => option.choice !== 'decline')!.choice;
    const permitted = orderFor(contact.id, forbiddenArtChoice);
    const transport = vi.fn(async () => reply(permitted));
    vi.stubGlobal('fetch', transport);
    const onStart = vi.fn();
    expect(modelDecisionCandidates(world)).not.toContain(owner);
    expect(modelDecisionCandidates(world)).not.toContain(counterpart);
    for (const actor of [owner, counterpart]) {
      await expect(requestCultivatorLLMDecision(actor, world, config, world.tick + 1, { onStart })).resolves.toBeUndefined();
    }
    expect(transport).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    const after = finish(world, { ...permitted, innerMonologue: '这一条不具备引导者授权。' }, { modelActors: new Set([owner.id]) });
    expect(artActor(after).forbiddenScars?.find(row => row.contactId === contact.id)).toBeUndefined();
    const queued = queueGuidedForbiddenArt(world, owner.id, contact.id, forbiddenArtChoice);
    expect(queued).not.toBe(world);
    const queuedOwner = artActor(queued);
    await expect(requestCultivatorLLMDecision(queuedOwner, queued, config, queued.tick + 1, { onStart })).resolves.toBeUndefined();
    expect(transport).not.toHaveBeenCalled();
    expect(artActor(finish(queued)).forbiddenScars?.find(row => row.contactId === contact.id))
      .toMatchObject({ origin: 'player', artId: forbiddenArtChoice });
  });

  it('retains the exact model choice privately in a peer replay but never exposes the owner as a public alternate', () => {
    const { world, owner, contact, options } = encounter();
    const picked = orderFor(contact.id, options.find(option => option.choice !== 'decline')!.choice);
    const tape = createDecisionReplayTape(world, 'utility');
    const baseline = finish(world, { ...picked, innerMonologue: '不能保存在回放内的私语。' }, { tape, modelActors: new Set([owner.id]) });
    const own = baseline.decisionTrace.records.find(row => row.actorId === owner.id && row.tick === baseline.tick)!;
    const peer = baseline.decisionTrace.records.find(row => row.actorId === 'npc-1' && row.tick === baseline.tick)!;
    const alternate = peer.candidates.find(row => row.action === 'CULTIVATE')!;
    const replay = vi.fn<Parameters<typeof replayOneTurn>[4]>((copy, decisions, mode, onActor,
      replayDraws, replayHeartModelActors, replayForbiddenModelActors) => {
      expect(decisions[owner.id]).toEqual({ ...picked, innerMonologue: '' });
      expect(replayHeartModelActors).toBeUndefined();
      expect(replayForbiddenModelActors).toEqual(new Set([owner.id]));
      const replayed = advanceWorldTick(copy, decisions, () => .10, mode, undefined, {
        onActor, replayDraws, replayHeartModelActors, replayForbiddenModelActors,
      });
      expect(artActor(replayed).forbiddenScars?.find(row => row.contactId === contact.id)).toMatchObject({
        origin: 'model', artId: picked.forbiddenArtChoice,
      });
      return replayed;
    });
    expect(replayOneTurn(tape, baseline, own.id, 'FORBIDDEN_ART', replay)).toMatchObject({ ok: false });
    expect(replay).not.toHaveBeenCalled();
    expect(replayOneTurn(tape, baseline, peer.id, alternate.id, replay)).toMatchObject({ ok: true });
    expect(replay).toHaveBeenCalledTimes(2);
  });
});
