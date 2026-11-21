import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createDecisionReplayTape, createDecisionTraceState, DECISION_TRACE_LIMIT, legalTraceCandidates,
  recordDecisionTrace, rememberReplayDecision, replayOneTurn } from '../src/engine/decisionTraceEngine';
import type { ReplayAdvance } from '../src/engine/decisionTraceEngine';
import { worldRandom } from '../src/engine/worldRandom';
import type { DecisionTraceCandidate } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(999);
  world.decisionTrace = createDecisionTraceState();
  const [actor, peer] = world.cultivators;
  const market = world.locations.find(({ type }) => type === 'market')!;
  const hidden = world.locations.find(({ type }) => type === 'secret_realm')!;
  actor.locationId = market.id;
  peer.locationId = market.id;
  actor.hp = Math.round(actor.maxHp * .35);
  actor.qiProgress = 15;
  return { world, actor, peer, hidden };
}

describe('public decision traces and one-turn isolated comparison', () => {
  it('deterministically ranks only legal public alternatives and re-ranks a forced tribulation without ordinary turns', () => {
    const { world, actor, peer, hidden } = fixture();
    const first = legalTraceCandidates(world, actor);
    expect(first).toEqual(legalTraceCandidates(structuredClone(world), structuredClone(actor)));
    expect(first[0].action).toBe('REST');
    expect(first.some(({ id }) => id.includes(hidden.id))).toBe(false);
    expect(first).toContainEqual(expect.objectContaining({ action: 'SOCIALIZE', targetCultivatorId: peer.id }));
    actor.qiProgress = 100;
    expect(legalTraceCandidates(world, actor).some(({ action }) => action === 'BREAKTHROUGH')).toBe(true);
    actor.tribulation = { id: 'forced-trial', targetRealm: '金丹', startedTick: 0, stage: 'heart_demon', nextWave: 1,
      totalWaves: 3, pressure: 50, interruptions: 0 };
    expect(legalTraceCandidates(world, actor).map(({ tribulationStance }) => tribulationStance)).toEqual(['focus', 'guard', 'defy']);
    actor.tribulation.lastActedTick = world.tick;
    expect(legalTraceCandidates(world, actor)).toEqual([]);
  });

  it('allowlists typed public data, redacts original private action and bounds saved observations', () => {
    const { world, actor, hidden } = fixture();
    const candidates: DecisionTraceCandidate[] = [...legalTraceCandidates(world, actor),
      { id: 'api-key-tail', action: 'REST', reason: 'recover', score: 2, targetLocationId: hidden.id },
      { id: 'private-destination', action: 'EXPLORE', reason: 'travel', score: 100, targetLocationId: hidden.id }];
    const payload = { chosenAction: 'PURSUE_SCHEME' as const, proposedScheme: 'infiltration' as const,
      innerMonologue: 'PRIVATE_INTERNAL_REASON', spokenLine: 'PRIVATE_DIALOGUE', targetLocationId: hidden.id };
    const record = recordDecisionTrace(world, actor.id, candidates, payload, 'model', true);
    expect(record.chosenAction).toBe('redacted');
    expect(record.chosenCandidateId).toBeUndefined();
    expect(JSON.stringify(record)).not.toMatch(/PRIVATE|infiltration|api-key-tail|private-destination/);
    expect(record.candidates.some((entry) => entry.targetLocationId === hidden.id)).toBe(false);
    for (let i = 0; i < DECISION_TRACE_LIMIT + 5; i++) {
      world.tick++;
      recordDecisionTrace(world, actor.id, [], { chosenAction: 'REST', innerMonologue: 'none' }, 'utility', true);
    }
    expect(world.decisionTrace.records).toHaveLength(DECISION_TRACE_LIMIT);
    expect(world.decisionTrace.records[0].tick).toBe(7);
  });

  it('reuses untouched seeded snapshots and draw accounting; fixes all peer decisions while isolating control and alternate', () => {
    const { world, actor, peer } = fixture();
    const tape = createDecisionReplayTape(world, 'deferred');
    rememberReplayDecision(tape, actor.id, { chosenAction: 'REST', innerMonologue: 'private thought', spokenLine: 'private line' }, 3);
    rememberReplayDecision(tape, peer.id, { chosenAction: 'SOCIALIZE', targetCultivatorId: actor.id, innerMonologue: 'private' }, 1);
    expect(JSON.stringify(tape)).not.toMatch(/private|SOCIALIZE|world|random/);
    const after = structuredClone(world);
    after.tick++;
    const candidates = legalTraceCandidates(after, after.cultivators[0]);
    const trace = recordDecisionTrace(after, actor.id, candidates, { chosenAction: 'REST', innerMonologue: 'private' }, 'utility', true);
    after.cultivators[0].hp = 999; // A later-world/presentation enhancement isn't the mechanical control.
    const starts: number[] = [];
    const replay: ReplayAdvance = (copy, decisions, councilMode, onActor, draws) => {
      expect(councilMode).toBe('deferred');
      starts.push(copy.random.state);
      const rng = worldRandom(copy);
      expect(draws[actor.id]).toBe(3);
      expect(draws[peer.id]).toBe(1);
      for (let i = 0; i < draws[actor.id]; i++) rng();
      const amount = Math.round(7 * rng());
      expect(decisions[peer.id]).toEqual({ chosenAction: 'SOCIALIZE', targetCultivatorId: actor.id, innerMonologue: '' });
      expect(decisions[actor.id].innerMonologue).toBe('');
      expect(decisions[actor.id].spokenLine).toBeUndefined();
      copy.tick++;
      const target = copy.cultivators[0];
      const allowed = legalTraceCandidates(copy, target);
      target.hp += decisions[actor.id].chosenAction === 'REST' ? 10 + amount : 1 + amount;
      onActor(target.id, allowed, true);
      copy.events.push({ id: 'private-sample', actorIds: [target.id], tick: copy.tick, title: 'private', description: 'private',
        category: 'heavenly', year: copy.year, month: copy.month, witnessScope: 'participants' });
      return copy;
    };
    const initial = structuredClone(world);
    const baselineBefore = structuredClone(after);
    const result = replayOneTurn(tape, after, trace.id, 'CULTIVATE', replay);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.comparison.baseline.hp - result.comparison.alternate.hp).toBe(9);
    expect(result.comparison.baseline.hp).not.toBe(999);
    expect(result.comparison.baseline.publicEventCount).toBe(0);
    expect(result.comparison.alternate.publicEventCount).toBe(0);
    expect(starts).toEqual([initial.random.state, initial.random.state]);
    expect(world).toEqual(initial);
    expect(after).toEqual(baselineBefore);
  });

  it('rejects invalid alternates and replay where the event never had a legal execution turn', () => {
    const { world, actor } = fixture();
    const tape = createDecisionReplayTape(world, 'utility');
    const orig = { chosenAction: 'REST' as const, innerMonologue: '' };
    rememberReplayDecision(tape, actor.id, orig);
    world.tick++;
    const trace = recordDecisionTrace(world, actor.id, legalTraceCandidates(world, actor), orig, 'utility', true);
    let calls = 0;
    const replay: ReplayAdvance = (copy, decisions, _mode, onActor) => {
      calls++;
      copy.tick++;
      const legal = decisions[actor.id].chosenAction === 'REST' ? legalTraceCandidates(copy, copy.cultivators[0]) : [];
      onActor(actor.id, legal, true);
      return copy;
    };
    expect(replayOneTurn(tape, world, trace.id, 'not-legal', replay).ok).toBe(false);
    expect(replayOneTurn(tape, world, trace.id, 'REST', replay).ok).toBe(false);
    expect(calls).toBe(0);
    expect(replayOneTurn(tape, world, trace.id, 'CULTIVATE', replay).ok).toBe(false);
    expect(calls).toBe(2);
    expect(replayOneTurn(structuredClone(tape), world, trace.id, 'CULTIVATE', replay).ok).toBe(false);
  });
});
