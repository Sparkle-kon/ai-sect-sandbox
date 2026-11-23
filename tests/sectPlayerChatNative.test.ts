import { describe, expect, it, vi } from 'vitest';
import { sectRelation } from '../src/engine/diplomacyEngine';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { activeRoguelikeEncounter } from '../src/engine/roguelikeEncounterEngine';
import { projectSectChat } from '../src/engine/sectChat';
import { applySectPlayerChat, prepareSectPlayerChat, projectSectPlayerChat, quoteSectPlayerChatOptions } from '../src/engine/sectPlayerChat';
import { projectSectRecurring } from '../src/engine/sectRecurring';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { availableSettlementActions, SETTLEMENT_RECRUIT_STIPEND } from '../src/engine/settlementEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { SECT_PLAYER_CHAT_ALIASES, SECT_PLAYER_CHAT_IDENTITY_LABELS, type SectPlayerChatDraft, type SectPlayerChatIntent, type SectPlayerChatPreset } from '../src/types/sectPlayerChat';
import { sectRecurringIdentity } from '../src/types/sectRecurring';
import type { LLMDecisionPayload, WorldEvent, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '今月在原处调息。' };

function management(world: WorldState) {
  if (!world.sectManagement) throw new Error('Expected true managed sect');
  return world.sectManagement;
}
function actor(world: WorldState, id: string) {
  const body = world.cultivators.find(row => row.id === id);
  if (!body) throw new Error(`Expected native actor ${id}`);
  return body;
}
function sect(world: WorldState, id = management(world).sectId) {
  const need = world.sects.find(row => row.id === id);
  if (!need) throw new Error(`Expected native sect ${id}`);
  return need;
}
function village(world: WorldState) {
  const need = world.settlements.villages.find(row => row.locationId === 'loc-market');
  if (!need) throw new Error('Expected true market village');
  return need;
}
function month(world: WorldState, extra: Readonly<Record<string, LLMDecisionPayload>> = {},
  modelId?: string, mode: 'utility' | 'deferred' = modelId ? 'deferred' : 'utility') {
  const completed: WorldEvent[] = [];
  const orders = Object.fromEntries(world.cultivators.filter(row => row.alive).map(row => [row.id, extra[row.id] ?? rest]));
  const effective = vi.fn();
  const next = advanceWorldTick(world, orders, undefined, mode, effective, {
    modelActors: modelId ? new Set([modelId]) : undefined, capturePresentation: false, captureTrace: true,
    onCompletedEvents: rows => { completed.push(...rows); },
  });
  expect(next.tick).toBe(world.tick + 1);
  if (modelId) expect(effective).toHaveBeenCalledWith(modelId, true);
  return { next, completed };
}
function starter() {
  const world = createManagedSectWorld(13071, 'classic', 'qingyun-odd-jobs', 0);
  if (!world?.sectManagement?.debt) throw new Error('Expected true Qingyun debt and roster');
  const m = world.sectManagement, creditor = m.debt?.creditorId;
  if (!creditor) throw new Error('Expected original Wang');
  return { world, leader: m.leaderId, young: m.foundingDiscipleIds[0],
    ids: sectRecurringIdentity(m.sectId, creditor) };
}
function movement(world: WorldState, id: string, targetLocationId: string): LLMDecisionPayload {
  const dest = world.locations.find(row => row.id === targetLocationId);
  const tile = dest && terrainTileAt(world, dest.x, dest.y);
  if (!tile) throw new Error('Expected a real world destination');
  const visitor = actor(world, id);
  if (!visitor.exploredTileIds.includes(tile.id)) visitor.exploredTileIds.push(tile.id);
  return { chosenAction: 'EXPLORE', targetLocationId, innerMonologue: '沿记得的山路下山。' };
}
function genuineRumor() {
  const opening = starter();
  const { world, leader, young } = opening;
  actor(world, young).personality = '诡诈';
  const whispered = month(world, { [young]: { chosenAction: 'SCHEMING', targetCultivatorId: leader,
    rumorIntent: 'FABRICATE', innerMonologue: '先捏造一桩江湖见闻。' } });
  const rumorId = `rumor-forged-${whispered.next.tick}-${young}-${leader}`;
  const rumor = actor(whispered.next, leader).rumors.find(row => row.id === rumorId);
  if (!rumor) throw new Error('Expected a genuine need-to-check native lie reaching the leader');
  expect(rumor).toMatchObject({ provenance: 'conversation', sourceCultivatorId: young,
    originSourceCultivatorId: young, learnedTick: whispered.next.tick, lead: true });
  expect(actor(whispered.next, young).rumors.find(row => row.id === rumorId)).toMatchObject({ provenance: 'fabricated' });
  const privateReceipt = whispered.completed.find(row => row.id === `evt-${whispered.next.tick}-${young}-scheme`);
  expect(privateReceipt).toMatchObject({ witnessScope: 'participants' });
  return { ...opening, ready: whispered.next, rumorId, privateReceipt };
}
function recruitFixture() {
  const { world, leader } = starter();
  sect(world).spiritStones = 80;
  let ready = month(world, { [leader]: movement(world, leader, 'loc-market') }).next;
  for (let i = 0; i < 3 && activeRoguelikeEncounter(ready, actor(ready, leader)); i++) ready = month(ready).next;
  expect(activeRoguelikeEncounter(ready, actor(ready, leader))).toBeUndefined();
  const target = village(ready), subject = actor(ready, leader);
  expect(subject.locationId).toBe(target.locationId);
  const candidate = target.volunteers.find(row => row.age >= 18 && row.age <= 47 && row.aptitude >= 58 &&
    row.enlistedCultivatorId === undefined);
  if (!candidate) throw new Error('Expected a real adult potential volunteer');
  target.stress = 20;
  candidate.willingness = 64; // 59 after local stress; timely advertisement adds four, without removing any hard requirement.
  return { ready, leader, candidateId: candidate.id, villageId: target.id };
}

const quick = (preset: SectPlayerChatPreset, roomId: SectPlayerChatDraft['roomId'] = 'jiuzhou'): SectPlayerChatDraft =>
  ({ roomId, identity: 'leader', body: { kind: 'quick', preset } });
const free = (identity: SectPlayerChatDraft['identity'], text: string, roomId: SectPlayerChatDraft['roomId'] = 'jiuzhou'): SectPlayerChatDraft =>
  ({ roomId, identity, body: { kind: 'free', text } });
function choose(world: WorldState, draft: SectPlayerChatDraft, match: (row: SectPlayerChatIntent) => boolean) {
  const option = quoteSectPlayerChatOptions(world, draft.roomId, draft.identity).find(row => match(row.intent));
  if (!option) throw new Error('Expected a current rule-authorized option');
  return option.id;
}
function publish(world: WorldState, draft: SectPlayerChatDraft, chosen?: string): WorldState {
  expect(prepareSectPlayerChat(world, draft, chosen)).toBeTruthy();
  const result = applySectPlayerChat(world, draft, chosen);
  expect(result !== world).toBe(true);
  return result;
}
function retained(world: WorldState) {
  const bytes = encodeEraWorldSave(world);
  const restored = decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(restored) === bytes).toBe(true);
  return restored;
}

describe('掌门传音按真实世界结算', () => {
  it('辟的是本人确实听到的那一句假话，不动私语、未闻消息与真账', () => {
    const { ready, leader, young, rumorId, privateReceipt } = genuineRumor();
    const draft = quick('debunk');
    const options = quoteSectPlayerChatOptions(ready, draft.roomId, draft.identity);
    expect(options.filter(row => row.intent.kind === 'debunk').map(row =>
      row.intent.kind === 'debunk' ? row.intent.rumorId : '')).toEqual([rumorId]);
    const exact = choose(ready, draft, row => row.kind === 'debunk' && row.rumorId === rumorId);
    const before = encodeEraWorldSave(ready);
    expect(applySectPlayerChat(ready, draft, 'forged-option') === ready).toBe(true);
    expect(applySectPlayerChat(ready, { ...draft, roomId: 'own' }, exact) === ready).toBe(true);
    expect(applySectPlayerChat(ready, { ...draft, identity: 'passing_senior', roomId: 'own' }, exact) === ready).toBe(true);
    const untouched = actor(ready, leader).rumors.filter(row => row.id !== rumorId);
    const direct = actor(ready, leader).rumors.find(row => row.id === rumorId);
    if (!direct) throw new Error('Expected the real targeted rumor');
    const corrected = publish(ready, draft, exact);
    expect(actor(corrected, leader).rumors.filter(row => row.id !== rumorId)).toEqual(untouched);
    const correctedPacket = actor(corrected, leader).rumors.find(row => row.id === rumorId);
    expect(!correctedPacket || correctedPacket.lead !== true || correctedPacket.confidence < direct.confidence).toBe(true);
    expect(corrected.events.find(row => row.id === privateReceipt?.id)).toEqual(privateReceipt);
    expect(corrected.markets).toEqual(ready.markets);
    expect(corrected.random).toEqual(ready.random);
    expect(actor(corrected, young).spiritStones).toBe(actor(ready, young).spiritStones);
    expect(encodeEraWorldSave(ready) === before).toBe(true);
    expect(applySectPlayerChat(corrected, draft, exact) === corrected).toBe(true);
    expect(retained(corrected).random).toEqual(ready.random);
  });


  it('门内护短只说给同门，公开护短加名声；哭穷只能接真好友的钱，放话不自动开战', () => {
    const { world, leader, ids } = starter();
    let ready = month(world, { [leader]: movement(world, leader, 'loc-market') }).next;
    const converse = (targetCultivatorId: string): LLMDecisionPayload => ({
      chosenAction: 'SOCIALIZE', targetCultivatorId, innerMonologue: '当面请旧识喝一杯清茶。',
    });
    for (let i = 0; i < 3; i++) ready = month(ready, { [leader]: converse(ids.wang), [ids.wang]: converse(leader) }).next;
    expect(actor(ready, leader).locationId).toBe(actor(ready, ids.wang).locationId);
    sect(ready).spiritStones = 12;
    const originalFunds = sect(ready).spiritStones, originalWang = actor(ready, ids.wang).spiritStones;
    const privateLine = publish(ready, quick('hype', 'own'));
    expect(sect(privateLine).reputation).toBe(sect(ready).reputation);
    expect(projectSectPlayerChat(privateLine).at(-1)).toMatchObject({ roomId: 'own', identity: 'leader' });
    const notice = publish(privateLine, quick('hype'));
    expect(sect(notice).reputation).toBe(sect(ready).reputation + 1);
    const begging = quick('beg');
    const gift = choose(notice, begging, row => row.kind === 'beg' && row.donorId === ids.wang);
    const distant = structuredClone(notice);
    actor(distant, ids.wang).locationId = ids.rivalSiteId;
    expect(applySectPlayerChat(distant, begging, gift) === distant).toBe(true);

    const helped = publish(notice, begging, gift);
    expect(sect(helped).spiritStones).toBe(originalFunds + 2);
    expect(actor(helped, ids.wang).spiritStones).toBe(originalWang - 2);
    expect(helped.events.some(row => row.title === '一笔应急相助' && row.witnessScope === 'participants' &&
      row.actorIds.includes(leader) && row.actorIds.includes(ids.wang))).toBe(true);
    expect(applySectPlayerChat(helped, free('leader', '今月还有一句。')) === helped).toBe(true);

    const cooled = month(helped).next;
    const effect = quick('provoke');
    const chosen = choose(cooled, effect, row => row.kind === 'provoke' && row.targetSectId === ids.rivalSectId);
    const a = management(cooled).sectId, b = ids.rivalSectId;
    const before = sectRelation(cooled, a, b)?.affinity ?? 0;
    const warned = publish(cooled, effect, chosen);
    expect(sectRelation(warned, a, b)?.affinity).toBe(before - 6);
    expect(warned.events).toEqual(cooled.events);
    expect(warned.cultivators.map(row => [row.id, row.hp, row.alive])).toEqual(cooled.cultivators.map(row => [row.id, row.hp, row.alive]));
    expect(warned.random).toEqual(cooled.random);
  });
  it('招新广告只提高下月真心愿，仍要主事修士到场、足额给钱和候选人应允', async () => {
    const { ready, leader, candidateId, villageId } = recruitFixture();
    const eligibility = (world: WorldState) => availableSettlementActions(actor(world, leader), world)
      .some(row => row.action === 'RECRUIT_SETTLER' && row.targetVolunteerId === candidateId);
    expect(eligibility(ready)).toBe(false);
    const draft = quick('recruit_ad');
    const option = choose(ready, draft, row => row.kind === 'recruit_ad');
    const advertised = publish(ready, draft, option);
    expect(advertised.cultivators).toHaveLength(ready.cultivators.length);
    expect(sect(advertised).spiritStones).toBe(sect(ready).spiritStones);
    expect(village(advertised).population).toBe(village(ready).population);
    expect(availableSettlementActions(actor(advertised, leader), advertised, advertised.tick + 1))
      .toEqual(expect.arrayContaining([expect.objectContaining({ action: 'RECRUIT_SETTLER', targetVolunteerId: candidateId })]));
    const request: LLMDecisionPayload = { chosenAction: 'RECRUIT_SETTLER', targetSettlementId: villageId,
      targetVolunteerId: candidateId, innerMonologue: '问确实愿意入门的人。' };
    const without = month(ready, { [leader]: request }).next;
    expect(without.cultivators.some(row => row.id === `recruit-${candidateId}`)).toBe(false);
    const { next: utility, completed } = month(advertised, { [leader]: request });
    expect(utility.decisionTrace.records.find(row => row.actorId === leader && row.tick === utility.tick)?.applied).toBe(true);
    const recruit = actor(utility, `recruit-${candidateId}`);
    expect(recruit).toMatchObject({ sectId: management(ready).sectId, spiritStones: SETTLEMENT_RECRUIT_STIPEND, currentAction: 'REST' });
    expect(village(utility).population).toBe(village(without).population - 1);
    expect(sect(utility).spiritStones).toBe(sect(without).spiritStones - SETTLEMENT_RECRUIT_STIPEND);
    const record = utility.settlements.records.find(row => row.volunteerId === candidateId && row.kind === 'recruitment');
    expect(record).toMatchObject({ tick: utility.tick, people: 1, stones: SETTLEMENT_RECRUIT_STIPEND,
      settlementId: villageId, actorId: leader, cultivatorId: recruit.id });
    expect(completed.some(row => row.id === `evt-${record?.id}` && row.actorIds.includes(recruit.id))).toBe(true);

    for (const blocker of ['distance', 'funds', 'age', 'stress', 'aptitude'] as const) {
      const fork = structuredClone(advertised);
      const volunteer = village(fork).volunteers.find(row => row.id === candidateId);
      if (!volunteer) throw new Error('Expected still actual candidate');
      if (blocker === 'distance') actor(fork, leader).locationId = management(fork).homeSiteId;
      if (blocker === 'funds') sect(fork).spiritStones = 0;
      if (blocker === 'age') volunteer.age = 16;
      if (blocker === 'stress') village(fork).stress = 90;
      if (blocker === 'aptitude') volunteer.aptitude = 30;
      expect(month(fork, { [leader]: request }).next.cultivators.some(row => row.id === recruit.id), blocker).toBe(false);
    }
    const expired = month(advertised).next;
    expect(month(expired, { [leader]: request }).next.cultivators.some(row => row.id === recruit.id)).toBe(false);

    const mock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(request) } }],
    })));
    vi.stubGlobal('fetch', mock);
    llmScheduler.resetTickBudget();
    try {
      const admitted = await requestCultivatorLLMDecision(actor(advertised, leader), advertised, {
        enabled: true, apiBaseUrl: 'https://recruit-chat-fixture.invalid/v1', apiKey: 'fixture', model: 'fixture',
      }, advertised.tick + 1);
      expect(mock).toHaveBeenCalledOnce();
      expect(admitted?.chosenAction).toBe('RECRUIT_SETTLER');
      if (!admitted) throw new Error('Expected exact model-authorized candidate next month');
      const cognitive = month(advertised, { [leader]: admitted }, leader).next;
      expect(cognitive.settlements).toEqual(utility.settlements);
      expect(cognitive.random).toEqual(utility.random);
      expect(sect(cognitive)).toEqual(sect(utility));
      expect(actor(cognitive, recruit.id)).toEqual(recruit);
      expect(retained(cognitive).settlements).toEqual(utility.settlements);
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
  });
});

it('三个马甲可公开发言，只有被真实赵掌门认出的那一个才露馅，隔月仍被他提起', () => {
  const { world, ids, leader } = starter();
  let state = month(world).next;
  expect(actor(state, ids.rival)).toMatchObject({ alive: true, sectId: ids.rivalSectId });
  for (const identity of SECT_PLAYER_CHAT_ALIASES) {
    const starting = state, previous = encodeEraWorldSave(starting);
    const draft = free(identity, '先喝茶，山门那点事容后再议。');
    const quiet = choose(state, draft, row => row.kind === 'chat');
    expect(applySectPlayerChat(state, { ...draft, roomId: 'own' }, quiet) === state).toBe(true);
    state = publish(state, draft, quiet);
    const post = projectSectPlayerChat(state).at(-1);
    expect(post).toMatchObject({ roomId: 'jiuzhou', identity, name: SECT_PLAYER_CHAT_IDENTITY_LABELS[identity], exposed: false });
    expect(JSON.stringify(post)).not.toContain(leader);
    expect(encodeEraWorldSave(starting) === previous).toBe(true);
  }
  const identity = SECT_PLAYER_CHAT_ALIASES[0];
  let revealed: WorldState | undefined;
  let exposedId: string | undefined;
  for (let i = 0; i < 8 && !revealed; i++) {
    const next = month(state).next;
    const draft = free(identity, '某只是路过，诸位不妨当没瞧见。');
    const option = choose(next, draft, row => row.kind === 'chat');
    const prepared = prepareSectPlayerChat(next, draft, option);
    expect(prepared).toBeTruthy();
    const after = publish(next, draft, option);
    const twin = publish(structuredClone(next), draft, option);
    expect(projectSectPlayerChat(after)).toEqual(projectSectPlayerChat(twin));
    expect(after.random).toEqual(next.random);
    const card = projectSectPlayerChat(after).at(-1);
    expect(card?.identity).toBe(identity);
    if (card?.exposed) {
      expect(card.name).toContain('掌门');
      expect(sect(after).reputation).toBeLessThan(sect(next).reputation);
      const knownRival = actor(after, ids.rival);
      expect([...knownRival.memories, ...knownRival.coreMemories].some(row => row.tick === after.tick &&
        row.content.includes(SECT_PLAYER_CHAT_IDENTITY_LABELS[identity]))).toBe(true);
      exposedId = card.id;
      revealed = after;
    } else {
      expect(sect(after).reputation).toBe(sect(next).reputation);
    }
    state = after;
  }
  if (!revealed || !exposedId) throw new Error('The repeated alias must eventually be recognized by the actual rival');
  state = retained(revealed);
  expect(projectSectPlayerChat(state).filter(row => row.exposed).map(row => row.identity)).not.toContain(SECT_PLAYER_CHAT_ALIASES[1]);
  let callback = false;
  for (let i = 0; i < 5; i++) {
    state = month(state).next;
    const rival = projectSectRecurring(state).find(row => row.entityId === ids.rival);
    const privateRemarks = projectSectChat(state).find(room => room.id === 'leaders')?.posts.filter(row =>
      row.senderId === ids.rival && row.tick === state.tick);
    if ([rival?.quote, rival?.recall, ...(privateRemarks?.map(row => row.text) ?? [])]
      .some(text => text?.includes(SECT_PLAYER_CHAT_IDENTITY_LABELS[identity]))) callback = true;
  }
  expect(callback).toBe(true);
  expect(encodeEraWorldSave(state).length).toBeGreaterThan(0);
});
