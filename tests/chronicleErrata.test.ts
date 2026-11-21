import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceChronicleErrata, availableChronicleErrataActions, captureChronicleErrataSource, CHRONICLE_ERRATA_WINDOW, createChronicleErrataState,
  pickChronicleReading, resolveChronicleErrataAction, visibleChronicleErrata } from '../src/engine/chronicleErrataEngine';
import { resolveSettlementAction, SETTLEMENT_RELIEF } from '../src/engine/settlementEngine';
import { capturePublicWitnessFact } from '../src/engine/witnessEngine';
import type { ChronicleErrataMove, Cultivator, LLMDecisionPayload, WorldEvent } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(1306);
  world.chronicleErrata = createChronicleErrataState();
  world.tick = 10;
  const [attacker, winner, editor, stranger, propagator] = world.cultivators;
  const locationId = 'loc-market';
  for (const person of [attacker, winner, editor]) person.locationId = locationId;
  stranger.locationId = 'loc-market-east';
  propagator.locationId = 'loc-market-east';
  const event: WorldEvent = {
    id: `evt-${world.tick}-${attacker.id}-duel`, tick: world.tick, year: world.year, month: world.month,
    actorIds: [attacker.id, winner.id], locationId, category: 'combat', duelWinnerId: winner.id,
    title: '不可靠标题', description: '实际结果绝不读取这个字符串。',
  };
  const capture = () => {
    capturePublicWitnessFact(world, event);
    expect(captureChronicleErrataSource(world, event)).toBe(true);
  };
  const act = (actor: Cultivator, move: ChronicleErrataMove, targetChronicleSourceId = event.id, extra: Partial<LLMDecisionPayload> = {}) =>
    resolveChronicleErrataAction(world, actor, { chosenAction: 'CHRONICLE_ERRATA', chronicleErrataMove: move, targetChronicleSourceId,
      innerMonologue: '自由文字与判定无关', ...extra });
  return { world, attacker, winner, editor, stranger, propagator, event, locationId, capture, act };
}

describe('public historiography with append-only factual proof', () => {
  it('rejects synthetic, private, future, noncanonical and collision sources while accepting an actual witness-matched duel once', () => {
    const { world, event, attacker, winner, capture } = fixture();
    expect(captureChronicleErrataSource(world, event)).toBe(false);
    expect(captureChronicleErrataSource(world, { ...event, tick: world.tick + 1 })).toBe(false);
    const privateEcho = { ...event, witnessScope: 'participants' as const };
    capturePublicWitnessFact(world, privateEcho);
    expect(captureChronicleErrataSource(world, privateEcho)).toBe(false);
    world.events.push(privateEcho);
    capturePublicWitnessFact(world, event);
    expect(captureChronicleErrataSource(world, event)).toBe(false);
    world.events = [];
    expect(captureChronicleErrataSource(world, { ...event, duelWinnerId: attacker.id })).toBe(false);
    expect(captureChronicleErrataSource(world, { ...event, id: 'forged-but-persuasive' })).toBe(false);
    capture();
    expect(captureChronicleErrataSource(world, event)).toBe(false);
    expect(world.chronicleErrata.sources).toEqual([{ kind: 'duel', locationId: event.locationId, sourceEventId: event.id, tick: event.tick,
      participantIds: [attacker.id, winner.id], winnerId: winner.id }]);
  });

  it('permits evidence-aware and divergent typed versions, no projection verdict before independent correction, and preserves originals after source eviction', () => {
    const { world, event, attacker, winner, editor, stranger, capture, act } = fixture();
    capture();
    const visible = visibleChronicleErrata(world, winner)[0];
    expect(visible.source).not.toHaveProperty('winnerId');
    expect(visible.correction).toBeUndefined();
    expect(visibleChronicleErrata(world, stranger)).toEqual([]);
    expect(visibleChronicleErrata(world)).toEqual([]);
    expect(act(stranger, 'retell', event.id, { targetCultivatorId: winner.id })).toBeNull();
    attacker.personality = '阴险';
    winner.personality = '苟道';
    expect(pickChronicleReading(world, winner, availableChronicleErrataActions(winner, world))?.targetCultivatorId).toBe(winner.id);
    expect(pickChronicleReading(world, attacker, availableChronicleErrataActions(attacker, world))?.targetCultivatorId).toBe(attacker.id);
    expect(act(attacker, 'retell', event.id, { targetCultivatorId: attacker.id })).not.toBeNull();
    expect(act(attacker, 'retell', event.id, { targetCultivatorId: winner.id })).toBeNull();
    expect(act(winner, 'retell', event.id, { targetCultivatorId: winner.id })).not.toBeNull();
    expect(visibleChronicleErrata(world, editor)[0]).toMatchObject({ conflict: true, correction: undefined });
    expect(act(editor, 'correct')).toBeNull();
    const originalClaims = structuredClone(world.chronicleErrata.retellings);
    world.tick++;
    world.events = [];
    world.chronicleArchive.anchors = [];
    world.witnesses.facts = [];
    expect(act(attacker, 'correct')).toBeNull();
    expect(act(stranger, 'correct')).toBeNull();
    expect(act(editor, 'correct', event.id, { targetCultivatorId: attacker.id })).toBeNull();
    expect(act(editor, 'correct')?.title).toBe('公开史牍追加勘误');
    expect(act(editor, 'correct')).toBeNull();
    expect(world.chronicleErrata.retellings).toEqual(originalClaims);
    expect(visibleChronicleErrata(world, editor)[0].correction).toMatchObject({ editorId: editor.id, reading: { kind: 'duel', winnerId: winner.id },
      contestedRetellingIds: originalClaims.map(({ id }) => id) });
    expect(world.events).toEqual([]);
    expect(world.chronicleArchive.anchors).toEqual([]);
  });

  it('proves real market relief from actual affordable debit and freezes quantities independent of later village ledger churn', () => {
    const { world, attacker, winner, editor, locationId, act } = fixture();
    const village = world.settlements.villages.find((row) => row.locationId === locationId)!;
    village.stress = 60;
    attacker.spiritStones = 100;
    attacker.herbs.jade_leaf = 6;
    const receipt = resolveSettlementAction(world, attacker,
      { chosenAction: 'DELIVER_RELIEF', targetSettlementId: village.id, innerMonologue: '交付物资' })!;
    expect(receipt).toBeDefined();
    expect(attacker.spiritStones).toBe(100 - SETTLEMENT_RELIEF.stones);
    expect(attacker.herbs.jade_leaf).toBe(6 - SETTLEMENT_RELIEF.jade_leaf);
    const ledger = world.settlements.records[0];
    const legitimate = ledger.stones;
    ledger.stones = 0;
    expect(captureChronicleErrataSource(world, receipt)).toBe(false);
    ledger.stones = legitimate;
    expect(captureChronicleErrataSource(world, { ...receipt, title: '判断不能读取任何标题', description: '也不能读取叙事' })).toBe(true);
    expect(visibleChronicleErrata(world, attacker)[0].source).not.toHaveProperty('stones');
    expect(act(attacker, 'retell', receipt.id, { chronicleReliefReading: 'full_supplies' })).not.toBeNull();
    expect(act(winner, 'retell', receipt.id, { chronicleReliefReading: 'unfunded' })).not.toBeNull();
    world.settlements.records = [];
    world.tick++;
    expect(act(editor, 'correct', receipt.id)).not.toBeNull();
    expect(world.chronicleErrata.corrections[0].reading).toEqual({ kind: 'relief', delivery: 'full_supplies' });
  });

  it('keeps unread testimony from old or phantom hubs inaccessible and does not revive a private or expired source', () => {
    const { world, event, attacker, winner, editor, stranger, propagator, capture, act } = fixture();
    capture();
    stranger.locationId = event.locationId!;
    expect(pickChronicleReading(world, stranger, availableChronicleErrataActions(stranger, world))).toBeUndefined();
    expect(act(attacker, 'retell', event.id, { targetCultivatorId: attacker.id })).not.toBeNull();
    expect(act(winner, 'retell', event.id, { targetCultivatorId: winner.id })).not.toBeNull();
    world.tick++;
    propagator.locationId = event.locationId!;
    world.pilgrimages.journeys.push({ id: 'pilgrimage-1', organizerId: editor.id, companionId: propagator.id, status: 'active',
      stopIds: [event.locationId!, 'loc-market-east', 'loc-danxia'], stopsVisited: [{ locationId: event.locationId!, tick: world.tick - 2 }],
      proposedTick: world.tick - 3, offerExpiresTick: world.tick, startedTick: world.tick - 2, expiresTick: world.tick + 5,
      legIndex: 0, path: [{ x: 500, y: 490 }, { x: 540, y: 490 }, { x: 784, y: 160 }], pathIndex: 1, spentByEach: 8, aid: [] });
    expect(visibleChronicleErrata(world, editor)).toEqual([]);
    expect(act(editor, 'correct')).toBeNull();
    world.pilgrimages.journeys = [];
    world.events = [{ ...event, witnessScope: 'participants' }];
    expect(visibleChronicleErrata(world, editor)).toEqual([]);
    expect(act(editor, 'correct')).toBeNull();
    advanceChronicleErrata(world);
    world.events = [];
    expect(visibleChronicleErrata(world, editor)).toEqual([]);
    expect(world.chronicleErrata.retellings).toEqual([]);
    world.tick = event.tick + CHRONICLE_ERRATA_WINDOW;
    expect(captureChronicleErrataSource(world, event)).toBe(false);
  });
});
