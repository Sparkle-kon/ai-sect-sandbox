import { describe, expect, it, vi } from 'vitest';
import { publicChronicleSceneEvents } from '../src/engine/chronicleLead';
import { llmScheduler } from '../src/engine/llmScheduler';
import { enrichSectChatMonth } from '../src/engine/sectChatModelProvider';
import { marketClosureReason } from '../src/engine/marketEngine';
import { projectSectChat } from '../src/engine/sectChat';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { SECT_CHAT_POST_LIMIT, type SectChatPost } from '../src/types/sectChat';
import type { SectJobAssignment } from '../src/types/sectJobs';
import { sectPairDramaEventId } from '../src/types/sectPairDrama';
import { sectRecurringIdentity } from '../src/types/sectRecurring';
import type { LLMConfig, LLMDecisionPayload, WorldEvent, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '暂且在原处歇息。' };
const market = 'loc-market';

function management(world: WorldState) {
  if (!world.sectManagement) throw new Error('Expected a real player-managed sect');
  return world.sectManagement;
}

function person(world: WorldState, id: string) {
  const actor = world.cultivators.find(row => row.id === id);
  if (!actor) throw new Error(`Missing native cultivator ${id}`);
  return actor;
}

function month(world: WorldState, decisions: Readonly<Record<string, LLMDecisionPayload>> = {},
  assignments: readonly SectJobAssignment[] = [], rng?: () => number) {
  const completed: WorldEvent[] = [];
  const orders = Object.fromEntries(world.cultivators.filter(row => row.alive).map(row => [row.id, decisions[row.id] ?? rest]));
  const next = advanceWorldTick(world, orders, rng, 'utility', undefined, {
    capturePresentation: false, sectJobAssignments: assignments,
    onCompletedEvents: rows => { completed.push(...rows); },
  });
  expect(next.tick).toBe(world.tick + 1);
  return { next, completed };
}

function starter() {
  const world = createManagedSectWorld(13071, 'classic', 'qingyun-odd-jobs', 0);
  if (!world) throw new Error('Expected real Qingyun world generation');
  const state = management(world);
  const creditor = state.debt?.creditorId;
  if (!creditor) throw new Error('Expected the original sect creditor');
  const [young, first, second] = state.foundingDiscipleIds;
  if (!young || !first || !second) throw new Error('Expected the three founding disciples');
  person(world, first).quirks = ['contrarian'];
  person(world, second).quirks = ['coward_king'];
  return { world, ids: sectRecurringIdentity(state.sectId, creditor), young, first, second };
}

function knownTravel(world: WorldState, id: string, targetLocationId: string): LLMDecisionPayload {
  const target = world.locations.find(row => row.id === targetLocationId);
  const tile = target && terrainTileAt(world, target.x, target.y);
  if (!tile) throw new Error('Expected a real lower-world destination');
  const actor = person(world, id);
  if (!actor.exploredTileIds.includes(tile.id)) actor.exploredTileIds.push(tile.id);
  return { chosenAction: 'EXPLORE', targetLocationId, innerMonologue: '循熟路访一回邻宗。' };
}

function witnessedFixture() {
  const { world: genesis, ids, young, first, second } = starter();
  // The named rival must have been installed by a true native month, not invented by chat.
  let world = month(genesis).next;
  for (let i = 0; i < 12 && marketClosureReason({ ...world, tick: world.tick + 1 }, market); i++) world = month(world).next;
  expect(marketClosureReason({ ...world, tick: world.tick + 1 }, market)).toBeUndefined();
  const wang = person(world, ids.wang);
  expect(wang.locationId).toBe(market);
  expect(wang.spiritStones).toBeGreaterThanOrEqual(11);
  expect(person(world, ids.rival).locationId).toBe(ids.rivalSiteId);
  // Remove prior ordinary mailbox traffic so the genuine source packets below cannot lose a capacity tie.
  for (const actor of world.cultivators) actor.rumors = [];
  const { next, completed } = month(world, {
    [ids.wang]: { chosenAction: 'PLACE_MARKET_BUY', marketGood: 'jade_leaf', marketQuantity: 1, marketLimitPrice: 11,
      innerMonologue: '今日在坊市挂一份买单。' },
    [young]: { chosenAction: 'SCHEMING', targetCultivatorId: first, innerMonologue: '这桩盘算只在袖里。' },
  }, [first, second].map(discipleId => ({ discipleId, jobId: 'kitchen' })));
  const marketFact = completed.find(row => row.id.includes('-market-order-') && row.actorIds.includes(ids.wang));
  if (!marketFact) throw new Error('Expected the genuine market order acknowledged by native rules');
  expect(marketFact).toMatchObject({ tick: next.tick, locationId: market, category: 'diplomacy' });
  expect(marketFact.witnessScope).toBeUndefined();
  expect(next.markets.orders).toEqual(expect.arrayContaining([expect.objectContaining({
    actorId: ids.wang, good: 'jade_leaf', placedTick: next.tick,
  })]));
  const kitchenId = sectPairDramaEventId(next.tick, management(next).sectId);
  expect(management(next).pairDrama).toMatchObject({ pair: [first, second], kind: 'blame', outcome: 'aborted' });
  expect(completed.find(row => row.id === kitchenId)).toMatchObject({ actorIds: [first, second], witnessScope: 'participants' });
  const privateFactId = `evt-${next.tick}-${young}-scheme`;
  expect(completed.find(row => row.id === privateFactId)).toMatchObject({ actorIds: [young, first], witnessScope: 'participants' });
  expect(person(next, first).rumors.find(row => row.originEventId === privateFactId)).toMatchObject({
    witnessScope: 'participants', provenance: 'witness',
  });
  expect(person(next, ids.wang).rumors.find(row => row.originEventId === marketFact.id)).toMatchObject({
    provenance: 'witness', learnedTick: next.tick, hops: 0,
  });
  expect(publicChronicleSceneEvents(next).some(row => row.id === privateFactId || row.id === kitchenId)).toBe(false);
  expect(person(next, ids.rival).rumors.some(row => row.originEventId === marketFact.id ||
    row.originEventId === privateFactId || row.originEventId === kitchenId)).toBe(false);
  return { firstMonth: next, ids, first, marketFact, privateFactId, kitchenId };
}

function relay(fixture: ReturnType<typeof witnessedFixture>) {
  const { firstMonth, first, ids, marketFact, privateFactId } = fixture;
  const fork = structuredClone(firstMonth);
  // Native rumor delivery only takes one packet per listener per month. Isolate the genuinely acquired packets;
  // do not manufacture any origin, relay, confidence, witness or disclosure.
  for (const actor of fork.cultivators) {
    actor.rumors = actor.rumors.filter(row => actor.id === ids.wang && row.originEventId === marketFact.id ||
      actor.id === first && row.originEventId === privateFactId);
  }
  const privateVisit = month(fork, { [first]: knownTravel(fork, first, ids.rivalSiteId) }).next;
  expect(person(privateVisit, first).locationId).toBe(person(privateVisit, ids.rival).locationId);
  expect(person(privateVisit, ids.rival).rumors.some(row => row.originEventId === privateFactId)).toBe(false);
  const { next } = month(fork, { [ids.wang]: knownTravel(fork, ids.wang, ids.rivalSiteId) });
  const rival = person(next, ids.rival);
  expect(person(next, ids.wang).locationId).toBe(rival.locationId);
  expect(rival.rumors.find(row => row.originEventId === marketFact.id)).toMatchObject({
    learnedTick: next.tick, originTick: firstMonth.tick, sourceCultivatorId: ids.wang,
    provenance: 'conversation', confidence: 84, hops: 1,
  });
  expect(rival.rumors.some(row => row.originEventId === privateFactId)).toBe(false);
  return next;
}

function chat(world: WorldState) {
  const state = management(world).chat;
  if (!state) throw new Error('Expected the native month to produce offline chat');
  return state;
}

const config: LLMConfig = {
  enabled: true, sectChatEnabled: true, apiBaseUrl: 'https://sect-provider-qa.invalid/v1', apiKey: 'test-only-bearer', model: 'fixture-roleplay',
};

interface Slot {
  readonly postId: string;
  readonly senderId: string;
  readonly name: string;
  readonly sect: string;
  readonly personality: string;
  readonly quirks: readonly string[];
  readonly mood: string;
  readonly knowledge?: 'witness' | 'rumor';
}
interface Batch {
  readonly roomId: 'jiuzhou' | 'market';
  readonly group: string;
  readonly slots: readonly Slot[];
  readonly trigger?: { readonly title: string };
  readonly recentMessages: readonly { readonly postId: string; readonly senderId: string; readonly text: string }[];
}
const line = '我倒想去踢馆，掌门先借我一双跑得快的靴。';
const answer = (payload: unknown) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(payload) } }],
  usage: { prompt_tokens: 19, completion_tokens: 7, total_tokens: 26 },
}));
function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an object from actual mocked wire body');
  return input as Record<string, unknown>;
}
function wire(init: RequestInit | undefined): { batch: Batch; raw: string } {
  const raw = String(init?.body ?? '');
  const envelope = record(JSON.parse(raw));
  const messages = envelope.messages;
  if (!Array.isArray(messages)) throw new Error('Expected provider chat-completions format');
  const user = messages.map(record).find(row => row.role === 'user')?.content;
  if (typeof user !== 'string') throw new Error('Expected scoped JSON under user role');
  return { batch: record(JSON.parse(user)) as unknown as Batch, raw };
}
function templateOf(post: SectChatPost): SectChatPost {
  if (post.source === 'template') return post;
  const { text: _text, replyTo: _replyTo, ...binding } = post;
  return { ...binding, source: 'template' };
}
function stripOverlay(world: WorldState): WorldState {
  const copy = structuredClone(world);
  const state = management(copy);
  state.chat = { months: chat(copy).months.map(row => ({ ...row, posts: row.posts.map(templateOf) })) };
  return copy;
}
function stub(respond: (batch: Batch) => Response | Promise<Response>) {
  const captured: { batch: Batch; raw: string; request: RequestInit | undefined }[] = [];
  const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const { batch, raw } = wire(init);
    captured.push({ batch, raw, request: init });
    return respond(batch);
  });
  vi.stubGlobal('fetch', request);
  llmScheduler.resetTickBudget();
  return { request, captured };
}
function scopeChecks(row: ReturnType<typeof stub>['captured'][number]) {
  const { batch, raw, request } = row;
  expect(['jiuzhou', 'market']).toContain(batch.roomId);
  expect(batch.group.trim()).not.toBe('');
  expect(batch.slots.length).toBeGreaterThan(0);
  expect(batch.recentMessages.length).toBeLessThanOrEqual(20);
  expect(raw).not.toContain(config.apiKey);
  expect(new Headers(request?.headers).get('authorization')).toBe(`Bearer ${config.apiKey}`);
  for (const slot of batch.slots) {
    expect(slot.name.trim()).not.toBe('');
    expect(slot.personality.trim()).not.toBe('');
    expect(Array.isArray(slot.quirks)).toBe(true);
    expect(slot.mood.trim()).not.toBe('');
  }
}

describe('仙门群聊的模拟模型只改发言', () => {
  it('同一真实买单随实际见闻分两月传开，密事与密谈不送出，覆盖只落在原有话位', async () => {
    const fixture = witnessedFixture();
    const { firstMonth, ids, marketFact, privateFactId, kitchenId } = fixture;
    const secondMonth = relay(fixture);
    const baseline = encodeEraWorldSave(secondMonth);
    const metrics = llmScheduler.getSnapshot();
    const firstWire = stub(batch => answer({ messages: batch.slots.map(({ postId, senderId }) => ({ postId, senderId, text: line })) }));
    try {
      const firstResult = await enrichSectChatMonth(firstMonth, config);
      expect(firstWire.request).toHaveBeenCalled();
      const direct = firstWire.captured.find(row => row.batch.trigger?.title === marketFact.title);
      if (!direct) throw new Error('Expected the real market fact in an independently witnessed first-month batch');
      expect(direct.batch.slots.some(row => row.senderId === ids.wang && row.knowledge === 'witness')).toBe(true);
      expect(direct.batch.slots.some(row => row.senderId === ids.rival)).toBe(false);
      expect(projectSectChat(firstResult).flatMap(room => room.posts).some(post => post.text === line)).toBe(true);

      // Each real provider response contains only text with its original identity (one eligible post per slot).
      firstWire.captured.length = 0;
      const enriched = await enrichSectChatMonth(secondMonth, config);
      const learned = firstWire.captured.find(row => row.batch.trigger?.title === marketFact.title);
      if (!learned) throw new Error('Expected an exact newly heard market fact');
      expect(learned.batch).toMatchObject({ roomId: 'jiuzhou', slots: expect.arrayContaining([
        expect.objectContaining({ senderId: ids.rival, knowledge: 'rumor' }),
      ]) });
      const all = [...firstWire.captured, direct];
      for (const item of all) {
        scopeChecks(item);
        expect(item.raw).not.toContain(privateFactId);
        expect(item.raw).not.toContain(kitchenId);
        expect(item.raw).not.toContain('这桩盘算只在袖里');
        expect(item.raw).not.toContain('设局算计');
        expect(item.raw).not.toContain('债务');
        expect(item.raw).not.toContain('掌门私聊');
        expect(item.raw).not.toContain('本宗内部群');
      }
      for (const room of projectSectChat(enriched).filter(group => group.id === 'own' || group.id === 'leaders')) {
        expect(room).toEqual(projectSectChat(secondMonth).find(group => group.id === room.id));
      }
      const posts = chat(enriched).months.at(-1)?.posts ?? [];
      expect(posts.filter(post => post.source === 'llm').length).toBeGreaterThan(0);
      expect(encodeEraWorldSave(stripOverlay(enriched))).toBe(baseline);
      expect(encodeEraWorldSave(secondMonth)).toBe(baseline);
      expect(chat(decodeEraWorldSave(encodeEraWorldSave(enriched)))).toEqual(chat(enriched));
      expect(posts.length).toBeGreaterThanOrEqual(3);
      expect(posts.length).toBeLessThanOrEqual(SECT_CHAT_POST_LIMIT);
      const nextMetrics = llmScheduler.getSnapshot();
      expect(nextMetrics.byKind.sect_chat - metrics.byKind.sect_chat).toBe(firstWire.request.mock.calls.length);
      expect(nextMetrics.usage.totalTokens - metrics.usage.totalTokens).toBe(26 * firstWire.request.mock.calls.length);
      expect(nextMetrics.byKind.decision).toBe(metrics.byKind.decision);
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
  });

  it('真实公开破境另开一拨群聊，不挤掉坊市月报，也不让模型决定破境', async () => {
    const { world: genesis, ids, first } = starter();
    const ready = month(genesis).next;
    const breaker = person(ready, first);
    breaker.realmStage = 2;
    breaker.qiProgress = 100;
    const purchase: LLMDecisionPayload = { chosenAction: 'PLACE_MARKET_BUY', marketGood: 'jade_leaf',
      marketQuantity: 1, marketLimitPrice: 11, innerMonologue: '坊市问一份药价。' };
    expect(marketClosureReason({ ...ready, tick: ready.tick + 1 }, market)).toBeUndefined();
    const quiet = month(ready, { [ids.wang]: purchase }, [], () => .24).next;
    const { next: major, completed } = month(ready, {
      [ids.wang]: purchase, [first]: { chosenAction: 'BREAKTHROUGH', innerMonologue: '此刻行功冲关。' },
    }, [], () => .24);
    const breakthrough = completed.find(row => row.id === `evt-${major.tick}-${first}-break`);
    if (!breakthrough) throw new Error('Expected a true native public breakthrough');
    expect(breakthrough).toMatchObject({ category: 'breakthrough', actorIds: [first] });
    expect(breakthrough.witnessScope).toBeUndefined();
    expect(person(major, first).realmStage).toBe(3);
    const majorPosts = chat(major).months.at(-1)?.posts ?? [];
    const quietPosts = chat(quiet).months.at(-1)?.posts ?? [];
    expect(majorPosts.length).toBeGreaterThan(quietPosts.length);
    expect(majorPosts.length).toBeLessThanOrEqual(SECT_CHAT_POST_LIMIT);
    expect(majorPosts.some(row => row.about.kind === 'public_event' && row.about.eventId === breakthrough.id)).toBe(true);
    expect(majorPosts.some(row => row.roomId === 'market' && row.about.kind === 'public_event' &&
      row.about.eventId.includes('-market-order-'))).toBe(true);

    const mocked = stub(batch => answer({ messages: batch.slots.map(({ postId, senderId }) => ({ postId, senderId, text: line })) }));
    try {
      const enriched = await enrichSectChatMonth(major, config);
      const result = chat(enriched).months.at(-1)?.posts.find(row => row.about.kind === 'public_event' && row.about.eventId === breakthrough.id);
      expect(mocked.captured.find(row => row.batch.trigger?.title === breakthrough.title)?.batch.slots).toEqual(
        expect.arrayContaining([expect.objectContaining({ senderId: first, knowledge: 'witness' })]));
      expect(result).toMatchObject({ source: 'llm', text: line });
      expect(encodeEraWorldSave(stripOverlay(enriched))).toBe(encodeEraWorldSave(major));
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
  });

  it('关闭、脏 JSON、外房冒名、长句与迟到回信都保留离线原样', async () => {
    const { firstMonth } = witnessedFixture();
    const transport = stub(() => answer({ messages: [] }));
    try {
      expect(await enrichSectChatMonth(firstMonth, { ...config, sectChatEnabled: false })).toBe(firstMonth);
      expect(transport.request).not.toHaveBeenCalled();

      const privatePost = chat(firstMonth).months.at(-1)?.posts.find(post => post.roomId === 'leaders');
      if (!privatePost) throw new Error('Expected a genuine leader-private message');
      const single = (make: (slot: Slot) => unknown) => (batch: Batch) =>
        answer({ messages: [make(batch.slots[0])] });
      const badRequests = [
        ['malformed body', () => new Response('{not-json')],
        ['mechanical extra fields', single(({ postId, senderId }) => ({ postId, senderId, text: line, chosenAction: 'DUEL', targetCultivatorId: privatePost.senderId }))],
        ['private post spoof', single(() => ({ postId: privatePost.id, senderId: privatePost.senderId, text: line }))],
        ['overlong line', single(({ postId, senderId }) => ({ postId, senderId, text: '长'.repeat(41) }))],
        ['embedded URL', single(({ postId, senderId }) => ({ postId, senderId, text: '点这 https://test.invalid' }))],
        ['private reply target', single(({ postId, senderId }) => ({ postId, senderId, text: line, replyTo: privatePost.id }))],
        ['wrong speaker', single(({ postId, senderId }) => ({ postId, senderId: senderId === privatePost.senderId ? management(firstMonth).leaderId : privatePost.senderId, text: line }))],
      ] as const;
      for (const [label, respond] of badRequests) {
        const bad = stub(respond);
        expect(await enrichSectChatMonth(firstMonth, config) === firstMonth, label).toBe(true);
        expect(bad.request).toHaveBeenCalled();
      }
      const pending: (() => void)[] = [];
      const late = stub(batch => new Promise(resolve => {
        pending.push(() => resolve(answer({ messages: batch.slots.map(({ postId, senderId }) => ({ postId, senderId, text: line })) })));
      }));
      const controller = new AbortController();
      const after = enrichSectChatMonth(firstMonth, config, controller.signal);
      await vi.waitFor(() => expect(late.request).toHaveBeenCalled());
      controller.abort();
      pending.forEach(send => send());
      expect(await after).toBe(firstMonth);
      expect(chat(firstMonth).months.every(row => row.posts.every(post => post.source === 'template'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
  });
});
