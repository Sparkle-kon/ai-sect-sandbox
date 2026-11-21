import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceWitnesses, availableWitnessActions, capturePublicWitnessFact, createWitnessState, resolveWitnessAction, visibleWitnessClaims } from '../src/engine/witnessEngine';
import type { Cultivator, WorldEvent } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(31);
  world.witnesses = createWitnessState();
  const [winner, loser, first, second, reporter, relay] = world.cultivators;
  const place = world.locations[0];
  const other = world.locations[1];
  for (const actor of world.cultivators) actor.locationId = other.id;
  for (const actor of [winner, loser, first, second, reporter]) actor.locationId = place.id;
  const duel: WorldEvent = { id: 'fixture-duel', tick: world.tick, year: world.year, month: world.month, title: '公开比试',
    description: '一场可公开的斗法', category: 'combat', actorIds: [winner.id, loser.id], duelWinnerId: winner.id, locationId: place.id };
  const file = (subject = winner, actor = reporter, eventId = duel.id) => resolveWitnessAction(world, actor, {
    chosenAction: 'FILE_WITNESS_CLAIM', targetCultivatorId: subject.id, targetWitnessEventId: eventId, innerMonologue: '提出指证',
  });
  const respond = (actor: Cultivator, action: 'ATTEST_WITNESS' | 'CHALLENGE_WITNESS') => resolveWitnessAction(world, actor, {
    chosenAction: action, targetWitnessClaimId: world.witnesses.claims[0].id, innerMonologue: '回应指证',
  });
  const reputation = (actor: Cultivator) => world.sects.find(({ id }) => id === actor.sectId)!;
  return { world, winner, loser, first, second, reporter, relay, place, other, duel, file, respond, reputation };
}

describe('witness lineage and bounded reputation appeals', () => {
  it('seals original public facts, counts only two independent first-hand observers, never counts relays or claimant', () => {
    const { world, loser, relay, first, second, reporter, place, duel, file, respond, reputation } = fixture();
    capturePublicWitnessFact(world, duel);
    capturePublicWitnessFact(world, duel);
    expect(world.witnesses.facts).toHaveLength(1);
    expect(world.witnesses.facts[0].witnessIds).toEqual([first.id, second.id, reporter.id].sort((a, b) => a.localeCompare(b)));
    const sect = reputation(loser);
    const before = sect.reputation;
    const publication = file(loser);
    expect(publication?.id).toBe(world.witnesses.claims[0].publicationEventId);
    expect(sect.reputation).toBe(before - 2);
    expect(file(loser)).toBeNull();
    relay.locationId = place.id;
    relay.rumors = [{ id: `rumor-${duel.id}`, subject: duel.title, originTick: world.tick, learnedTick: world.tick,
      sourceCultivatorId: second.id, originSourceCultivatorId: first.id, originEventId: duel.id,
      provenance: 'conversation', confidence: 100, hops: 2 }];
    expect(respond(relay, 'ATTEST_WITNESS')).toBeNull();
    expect(respond(reporter, 'ATTEST_WITNESS')).toBeNull();
    expect(respond(loser, 'ATTEST_WITNESS')).toBeNull();
    expect(respond(first, 'ATTEST_WITNESS')).not.toBeNull();
    expect(respond(first, 'ATTEST_WITNESS')).toBeNull();
    expect(advanceWitnesses(world)).toEqual([]);
    expect(respond(second, 'ATTEST_WITNESS')).not.toBeNull();
    expect(advanceWitnesses(world)[0]?.title).toBe('独立证词印证指证');
    expect(world.witnesses.claims[0]).toMatchObject({ status: 'corroborated', reputationPenalty: 2, reputationRestored: 0 });
    expect(advanceWitnesses(world)).toEqual([]);
    expect(sect.reputation).toBe(before - 2);
  });

  it('permits the accused alone to appeal once against original public evidence, restores only the same charge', () => {
    const { world, winner, first, duel, file, respond, reputation } = fixture();
    capturePublicWitnessFact(world, duel);
    const sect = reputation(winner);
    const before = sect.reputation;
    expect(file()).not.toBeNull();
    expect(sect.reputation).toBe(before - 2);
    expect(respond(first, 'CHALLENGE_WITNESS')).toBeNull();
    expect(respond(winner, 'CHALLENGE_WITNESS')).not.toBeNull();
    expect(world.witnesses.claims[0].status).toBe('disputed');
    expect(world.witnesses.claims[0].appeal).toMatchObject({ verdict: 'upheld', actorId: winner.id });
    expect(respond(winner, 'CHALLENGE_WITNESS')).toBeNull();
    sect.reputation += 3; // An unrelated system's change must not be overwritten.
    expect(advanceWitnesses(world)[0]?.title).toBe('争议指证撤回');
    expect(world.witnesses.claims[0]).toMatchObject({ status: 'retracted', reputationPenalty: 2, reputationRestored: 2 });
    expect(sect.reputation).toBe(before + 3);
    expect(advanceWitnesses(world)).toEqual([]);
    expect(sect.reputation).toBe(before + 3);
  });

  it('separates a contradictory first-hand statement from final retraction, and a failed appeal from corroboration', () => {
    const f = fixture();
    capturePublicWitnessFact(f.world, f.duel);
    f.file();
    expect(f.respond(f.first, 'ATTEST_WITNESS')).not.toBeNull();
    expect(f.world.witnesses.claims[0].status).toBe('disputed');
    expect(advanceWitnesses(f.world)).toEqual([]);
    expect(f.respond(f.second, 'ATTEST_WITNESS')).not.toBeNull();
    expect(advanceWitnesses(f.world)[0]?.title).toBe('争议指证撤回');

    const g = fixture();
    capturePublicWitnessFact(g.world, g.duel);
    g.file(g.loser);
    expect(g.respond(g.loser, 'CHALLENGE_WITNESS')).not.toBeNull();
    const claim = g.world.witnesses.claims[0];
    expect(claim.appeal?.verdict).toBe('rejected');
    expect(advanceWitnesses(g.world)).toEqual([]);
    g.world.tick = claim.deadlineTick;
    expect(advanceWitnesses(g.world)[0]?.title).toBe('证据不足，指证存疑');
    expect(claim).toMatchObject({ status: 'disputed', settledTick: claim.deadlineTick, reputationRestored: 2 });
  });

  it('never captures private/invalid sources, and hearing a public case does not expose later updates remotely', () => {
    const { world, winner, first, relay, other, duel, file, respond } = fixture();
    capturePublicWitnessFact(world, { ...duel, id: 'secret-duel', witnessScope: 'participants' });
    capturePublicWitnessFact(world, { ...duel, id: 'invalid', duelWinnerId: relay.id });
    expect(world.witnesses.facts).toEqual([]);
    expect(file(winner, first, 'secret-duel')).toBeNull();
    capturePublicWitnessFact(world, duel);
    const posted = file()!;
    relay.rumors = [{ id: `rumor-${posted.id}`, subject: posted.title, originTick: world.tick, learnedTick: world.tick,
      originEventId: posted.id, provenance: 'conversation', confidence: 100, hops: 1 }];
    expect(relay.locationId).toBe(other.id);
    expect(visibleWitnessClaims(world, relay)).toEqual([]);
    expect(respond(winner, 'CHALLENGE_WITNESS')).not.toBeNull();
    advanceWitnesses(world);
    expect(visibleWitnessClaims(world, relay)).toEqual([]);
    expect(availableWitnessActions(relay, world)).toEqual([]);
    expect(visibleWitnessClaims(world)[0].status).toBe('retracted');
  });

  it('refuses expired appeals and filing against stale facts', () => {
    const { world, winner, duel, file, respond } = fixture();
    capturePublicWitnessFact(world, duel);
    file();
    const claim = world.witnesses.claims[0];
    world.tick = claim.challengeUntilTick;
    expect(respond(winner, 'CHALLENGE_WITNESS')).toBeNull();
    world.tick = duel.tick + 9;
    expect(availableWitnessActions(winner, world).some((option) => option.action === 'FILE_WITNESS_CLAIM')).toBe(false);
  });
});
