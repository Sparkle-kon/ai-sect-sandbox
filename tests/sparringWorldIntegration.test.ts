import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveSparringAction } from '../src/engine/sparringEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, SparringMove, WorldState } from '../src/types/world';

const chosen = (sparringMove: SparringMove, fields: Partial<LLMDecisionPayload> = {}): LLMDecisionPayload =>
  ({ chosenAction: 'SPARRING', innerMonologue: '只按双方同意的安全练习条款。', sparringMove, ...fields });

function fixture(firstLate: boolean) {
  const world = createInitialWorld(14809);
  const [proposer, partner] = world.cultivators;
  for (const person of [proposer, partner]) {
    person.locationId = 'loc-taixu';
    person.qiProgress = 50;
    person.techniqueMastery = 27;
    person.hp = person.maxHp;
  }
  // The authoritative actor order can finish either readiness or yield first.
  if (firstLate) world.cultivators = [partner, proposer, ...world.cultivators.slice(2)];
  const offer = resolveSparringAction(world, proposer, chosen('offer', { targetCultivatorId: partner.id, sparringRounds: 1 }));
  expect(offer?.witnessScope).toBe('participants');
  const agreement = world.sparring.agreements[0];
  expect(resolveSparringAction(world, partner, chosen('accept', { targetSparringId: agreement.id }))).not.toBeNull();
  const run = (move: SparringMove) => {
    const orders = Object.fromEntries(world.cultivators.map((person) => [
      person.id,
      person.id === proposer.id ? chosen('ready', { targetSparringId: agreement.id }) :
        person.id === partner.id ? chosen(move, { targetSparringId: agreement.id }) :
          { chosenAction: 'REST' as const, innerMonologue: '旁人照常休整。' },
    ]));
    return advanceWorldTick(world, orders);
  };
  return { world, proposer, partner, agreement, run };
}

describe('real-world simulation sequencing for consensual sparring', () => {
  it.each([false, true])('the ready-versus-yield turn leaves no practice cost in actor order reversed=%s', (reversed) => {
    const { world, proposer, partner, agreement, run } = fixture(reversed);
    const yielded = run('yield');
    const row = yielded.sparring.agreements[0];
    expect(row).toMatchObject({ id: agreement.id, status: 'yielded', closedById: partner.id, rounds: [] });
    expect(row.readiness).toBeUndefined();
    for (const person of [proposer, partner]) {
      const after = yielded.cultivators.find(({ id }) => person.id === id)!;
      expect(after.qiProgress).toBe(person.qiProgress);
      expect(after.techniqueMastery).toBe(person.techniqueMastery);
      expect(after.artifacts).toEqual(person.artifacts);
      expect(after.hp).toBe(person.hp);
    }
    expect(yielded.cultivators).toHaveLength(world.cultivators.length);
    expect(yielded.events.filter((event) => event.id.includes(agreement.id)).every(
      (event) => event.witnessScope === 'participants' && !event.duelWinnerId && !event.damage,
    )).toBe(true);
  });

  it('writes exactly one genuine practice receipt and no unrelated combat effects, and validates the save', () => {
    const { proposer, partner, run } = fixture(false);
    const completed = run('ready');
    const comparison = run('yield');
    const agreement = completed.sparring.agreements[0];
    expect(agreement.status).toBe('completed');
    expect(agreement.rounds).toHaveLength(1);
    for (const person of [proposer, partner]) {
      const after = completed.cultivators.find(({ id }) => person.id === id)!;
      expect(after.qiProgress).toBe(person.qiProgress - 3);
      expect(after.techniqueMastery).toBe(person.techniqueMastery + 1);
      expect(after.artifacts).toEqual(person.artifacts);
      expect(after.hp).toBe(person.hp);
      expect(after.transgressions).toBe(person.transgressions);
    }
    const unrelated = (world: WorldState) => [world.bounties, world.competitions.scores, world.competitions.honors, world.estates];
    expect(unrelated(completed)).toEqual(unrelated(comparison));
    expect(decodeWorldSave(encodeWorldSave(completed)).sparring).toEqual(completed.sparring);
    const forged = structuredClone(completed);
    forged.sparring.agreements[0].rounds[0].members[1].actorId = proposer.id;
    expect(() => encodeWorldSave(forged)).toThrow('sparring.rounds.source');
  });
});
