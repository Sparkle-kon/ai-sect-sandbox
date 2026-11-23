import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { runStoryTriggerAudit } from '../scripts/storyTriggerAuditRunner';
import { createStoryTriggerFunnel } from '../scripts/storyTriggerFunnel';
import type { StoryAuditTurn } from '../scripts/storyTriggerAuditTerms';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldEvent, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '停在原处。' };
const order = (chosenAction: LLMDecisionPayload['chosenAction'], extra: Partial<LLMDecisionPayload> = {}): LLMDecisionPayload =>
  ({ ...rest, chosenAction, ...extra });

describe('native trigger bottleneck funnels', () => {
  it('observes the same exact monthly book without changing the replay fingerprint', () => {
    const collector = createStoryTriggerFunnel(), input = { seed: 2031, ticks: 2, probes: [] };
    const run = runStoryTriggerAudit({ ...input, onCompletedTurn: collector.observe });
    expect(run).toEqual(runStoryTriggerAudit(input));
    expect(collector.summary().observedMonths).toBe(2);
  });

  it('distinguishes true duel evidence, actual public filing, private inspection and private answer', () => {
    const collector = createStoryTriggerFunnel(), site = 'loc-market';
    const fighter = 'npc-5', other = 'npc-2', eyewitness = 'npc-6', reader = 'npc-1';
    let lastTurn: StoryAuditTurn | undefined;
    function step(before: WorldState, commands: Record<string, LLMDecisionPayload>) {
      const captured: { events?: readonly WorldEvent[] } = {};
      const after = advanceWorldTick(before, Object.fromEntries(before.cultivators.map(({ id }) => [id, commands[id] ?? rest])),
        () => .10, 'utility', undefined, { onCompletedEvents: events => { captured.events = events; } });
      if (!captured.events) throw new Error('Expected actual native completed book');
      const turn = { before, after, events: captured.events };
      lastTurn = turn;
      collector.observe(turn);
      collector.observe(turn); // Callers can retry a report, but not inflate the same dates/case.
      return after;
    }
    const arrived = step(createInitialWorld(2031), {
      [fighter]: order('EXPLORE', { targetLocationId: site }),
      [other]: order('EXPLORE', { targetLocationId: site }),
    });
    const duel = step(arrived, { [fighter]: order('DUEL', { targetCultivatorId: other }) });
    const source = duel.witnesses.facts.find(row => row.eventId === `evt-${duel.tick}-${fighter}-duel`);
    if (!source) throw new Error('Expected the original duel and independent witness fact');
    expect(collector.summary().witness).toMatchObject({ facts: 1, independentlyWitnessedDuels: 1, filedClaims: 0 });
    const posted = step(duel, {
      [other]: order('FILE_WITNESS_CLAIM', { targetWitnessEventId: source.eventId, targetCultivatorId: fighter }),
      [reader]: order('EXPLORE', { targetLocationId: site }),
    });
    const claim = posted.witnesses.claims.find(row => row.sourceEventId === source.eventId);
    if (!claim) throw new Error('Expected the actual public filing');
    expect(collector.summary().witness).toMatchObject({ filedClaims: 1, filedFromWitnessedDuel: 1, answerReceipts: 0 });
    const waiting = step(posted, { [reader]: order('WITNESS_INQUIRY',
      { witnessInquiryMove: 'ask', targetCultivatorId: eyewitness, targetWitnessClaimId: claim.id }) });
    expect(collector.summary().witness.answerReceipts).toBe(0);
    const inspected = step(waiting, { [reader]: order('WITNESS_INQUIRY',
      { witnessInquiryMove: 'inspect', targetWitnessClaimId: claim.id }) });
    expect(collector.summary().witness).toMatchObject({ inspectedClaims: 1, inspectionReceipts: 1, answerReceipts: 0 });
    expect(collector.summary().askReadiness).toMatchObject({
      firstNextTurn: {missingRetainedProof: 0, reviewClosed: 0, physicalOrIndependentMissing: 0, legalAsk: 1},
      inspectionsWithAnyLegalAsk: 1,
    });
    const inspection = lastTurn;
    if (!inspection) throw new Error('Expected the exact native inspection book');
    // Controlled snapshots remove one genuine precondition at a time, keeping the actual uncapped inspection receipt.
    const classify = (degrade: (world: WorldState) => void) => {
      const next = structuredClone(inspected);
      degrade(next);
      const observer = createStoryTriggerFunnel();
      observer.observe({ ...inspection, after: next });
      return observer.summary();
    };
    const pruned = classify(world => { world.events = world.events.filter(event => event.id !== source.eventId); });
    expect(pruned.askReadiness.firstNextTurn).toMatchObject({missingRetainedProof: 1, legalAsk: 0});
    const decided = classify(world => { world.witnesses.claims.find(row => row.id === claim.id)!.settledTick = world.tick; });
    expect(decided.askReadiness.firstNextTurn).toMatchObject({reviewClosed: 1, legalAsk: 0});
    const absent = classify(world => {
      for (const actor of world.cultivators) if (source.witnessIds.includes(actor.id) && actor.id !== reader)
        actor.locationId = 'loc-taixu';
    });
    expect(absent.askReadiness.firstNextTurn).toMatchObject({physicalOrIndependentMissing: 1, legalAsk: 0});
    expect(absent.witness.answerReceipts).toBe(0);
    step(inspected, { [reader]: order('WITNESS_INQUIRY',
      { witnessInquiryMove: 'ask', targetCultivatorId: eyewitness, targetWitnessClaimId: claim.id }) });
    const summary = collector.summary();
    expect(summary.observedMonths).toBe(6);
    expect(summary.askReadiness.followupChecks).toEqual({
      missingRetainedProof: 0, reviewClosed: 0, physicalOrIndependentMissing: 0, legalAsk: 1,
    });
    expect(summary.witness).toEqual({ facts: 1, independentlyWitnessedDuels: 1, filedClaims: 1,
      filedFromWitnessedDuel: 1, inspectedClaims: 1, askedClaims: 1, inspectionReceipts: 1, answerReceipts: 1 });
    expect(JSON.stringify(summary)).not.toContain(source.eventId);
    expect(JSON.stringify(summary)).not.toContain(claim.id);
  });
});
