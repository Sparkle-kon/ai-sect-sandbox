import { describe, expect, it, vi } from 'vitest';
import { publicChronicleSceneEvents } from '../src/engine/chronicleLead';
import { marketClosureReason } from '../src/engine/marketEngine';
import { projectSectChat } from '../src/engine/sectChat';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { SECT_CHAT_POST_LIMIT, SECT_CHAT_ROOMS } from '../src/types/sectChat';
import type { SectJobAssignment } from '../src/types/sectJobs';
import { sectPairDramaEventId } from '../src/types/sectPairDrama';
import { sectRecurringIdentity } from '../src/types/sectRecurring';
import type { LLMDecisionPayload, WorldEvent, WorldState } from '../src/types/world';

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
  assignments: readonly SectJobAssignment[] = []) {
  const completed: WorldEvent[] = [];
  const orders = Object.fromEntries(world.cultivators.filter(row => row.alive).map(row => [row.id, decisions[row.id] ?? rest]));
  const next = advanceWorldTick(world, orders, undefined, 'utility', undefined, {
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

describe('仙门群聊的相识和传闻不越界', () => {
  it('首月赵掌门不知市场和灶房；次月只认王掌柜当面传来的公开消息', () => {
    const fixture = witnessedFixture();
    const { firstMonth, ids, marketFact, privateFactId, kitchenId } = fixture;
    const firstPosts = chat(firstMonth).months.find(row => row.tick === firstMonth.tick)?.posts;
    if (!firstPosts) throw new Error('Expected first month postings');
    expect(firstPosts).toEqual(expect.arrayContaining([expect.objectContaining({
      about: { kind: 'public_event', eventId: marketFact.id, eventTick: firstMonth.tick, knowledge: 'witness' },
    })]));
    expect(firstPosts.some(row => row.senderId === ids.rival && row.about.kind === 'public_event' &&
      row.about.eventId === marketFact.id)).toBe(false);

    const secondMonth = relay(fixture);
    const secondPosts = chat(secondMonth).months.find(row => row.tick === secondMonth.tick)?.posts;
    if (!secondPosts) throw new Error('Expected second month postings');
    expect(secondPosts).toEqual(expect.arrayContaining([expect.objectContaining({
      senderId: ids.rival, roomId: 'jiuzhou',
      about: { kind: 'public_event', eventId: marketFact.id, eventTick: firstMonth.tick, knowledge: 'rumor' },
    })]));
    for (const row of [...firstPosts, ...secondPosts]) {
      if (row.about.kind === 'public_event') expect([privateFactId, kitchenId]).not.toContain(row.about.eventId);
    }
    const links = projectSectChat(secondMonth).flatMap(room => room.posts);
    expect(links.some(post => post.senderId === ids.rival && post.sourceEventId === marketFact.id)).toBe(true);
    expect(links.some(post => post.sourceEventId === privateFactId || post.sourceEventId === kitchenId)).toBe(false);
    expect(secondMonth.chronicleArchive.anchors.some(row => row.id === marketFact.id)).toBe(true);
    const restored = decodeEraWorldSave(encodeEraWorldSave(secondMonth));
    expect(chat(restored)).toEqual(chat(secondMonth));
    expect(projectSectChat(restored)).toEqual(projectSectChat(secondMonth));

    const archived = structuredClone(secondMonth);
    archived.events = archived.events.filter(row => row.id !== marketFact.id);
    archived.chronicleArchive.anchors = archived.chronicleArchive.anchors.filter(row => row.id !== marketFact.id);
    expect(projectSectChat(archived).flatMap(room => room.posts).some(post => post.sourceEventId === marketFact.id)).toBe(false);
  });

  it('平月也用真实角色写可信短句；同一月份重演、存读档一致，不调模型', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      const { world, ids } = starter();
      const baseline = month(world).next;
      const opening = chat(baseline).months.find(row => row.tick === baseline.tick);
      if (!opening) throw new Error('Expected first quiet month posts');
      expect(opening.posts.length).toBeGreaterThanOrEqual(3);
      expect(opening.posts.length).toBeLessThanOrEqual(SECT_CHAT_POST_LIMIT);
      expect(new Set(opening.posts.map(row => row.roomId)).size).toBeGreaterThanOrEqual(2);
      for (const post of opening.posts) {
        expect(SECT_CHAT_ROOMS).toContain(post.roomId);
        expect(post.source).toBe('template');
        expect(person(baseline, post.senderId).alive).toBe(true);
      }
      expect(opening.posts.some(row => row.senderId === ids.wang && row.about.kind === 'recurring')).toBe(true);
      const groups = projectSectChat(baseline);
      expect(groups.map(row => row.id)).toEqual(SECT_CHAT_ROOMS);
      expect(new Set(groups.map(row => row.label)).size).toBe(4);
      const rendered = groups.flatMap(room => room.posts);
      expect(rendered).toHaveLength(opening.posts.length);
      expect(new Set(rendered.map(row => row.text)).size).toBeGreaterThanOrEqual(3);
      expect(rendered.every(row => row.text.trim().length > 0)).toBe(true);
      expect(chat(month(world).next)).toEqual(chat(baseline));
      const bytes = encodeEraWorldSave(baseline);
      expect(chat(decodeEraWorldSave(bytes))).toEqual(chat(baseline));
      expect(month(baseline).next.random).toEqual(month(decodeEraWorldSave(bytes)).next.random);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
