import { describe, expect, it } from 'vitest';
import { availableEncounters } from '../src/engine/encounterEngine';
import { certifyProtagonistHandoff, protagonistHandoffTieAuthority, readProtagonistHandoff } from '../src/engine/protagonistHandoff';
import type { ProtagonistArc } from '../src/types/world';
import { earnedProtagonistStory, storyPayload, storyPerson, storyTurn } from './fixtures/protagonistSuccessionFixture';

function nativeThreeTiesAndExit() {
  const f = earnedProtagonistStory();
  const first = f.leadId;
  const second = f.witnessId;
  let world = f.world;
  const act = (chosenAction: 'SOCIALIZE' | 'DUAL_CULTIVATE' | 'DUEL') => {
    world = storyTurn(world, { [first]: storyPayload(chosenAction, { targetCultivatorId: second }) }, .1);
  };
  // Put two exact originals into a mechanically safe starting training posture. The social trust,
  // practice, actual damage, public mortality and archived predecessor are all native monthly output.
  for (const id of [first, second]) {
    const actor = storyPerson(world, id);
    actor.qiProgress = 0;
    actor.hp = actor.maxHp;
    actor.combatPower = 15;
  }
  const canPractice = () => availableEncounters(storyPerson(world, first), world)
    .some(row => row.action === 'DUAL_CULTIVATE' && row.targetId === second);
  for (let i = 0; i < 12 && !canPractice(); i++) act('SOCIALIZE');
  if (!canPractice()) throw Error('the original pair did not qualify for native practice');
  act('DUAL_CULTIVATE');
  act('DUEL');
  const beforeExit = world;
  world = structuredClone(world);
  world.month = 12;
  const departing = storyPerson(world, first);
  departing.age = departing.lifespan - 1;
  world = storyTurn(world, {}, .99);
  const closed = storyTurn(world, {}, .99);
  const predecessor = closed.protagonistSuccession.arcs.find(row => row.actorId === first)!;
  expect(predecessor.closeReason).toBe('public_death');
  expect(predecessor.endedTick).toBe(world.tick);
  return { world, predecessor, beforeExit, candidateId: second, unrelatedId: f.successorId };
}

describe('three old witnessed meetings before an exact native protagonist exit', () => {
  it('certifies three separately dated acts and reads only from the original public evidence', () => {
    const { world, predecessor, beforeExit, candidateId, unrelatedId } = nativeThreeTiesAndExit();
    expect(certifyProtagonistHandoff(beforeExit, predecessor, candidateId, beforeExit.tick)).toBeUndefined();
    expect(certifyProtagonistHandoff(world, predecessor, unrelatedId, world.tick)).toBeUndefined();
    const proof = certifyProtagonistHandoff(world, predecessor, candidateId, world.tick)!;
    expect(proof.exitKind).toBe('public_death');
    expect(proof.exitEventId).toBe(predecessor.death?.eventId);
    expect(proof.ties.map(row => row.kind)).toEqual(['encounter', 'practice', 'duel']);
    expect(new Set(proof.ties.map(row => row.tick)).size).toBe(3);
    for (const row of proof.ties) expect(world.events.some(event => event.id === row.eventId)).toBe(true);
    const candidateArc: ProtagonistArc = { id: `protagonist-arc-${world.tick}`, actorId: candidateId,
      openedTick: world.tick, predecessorArcId: predecessor.id, opening: [], support: [], handoff: proof };
    expect(readProtagonistHandoff(world, candidateArc, predecessor, world.tick)?.ties.map(row => row.title))
      .toEqual(['同席相逢', '并肩同修', '旧日交手']);
    expect(readProtagonistHandoff(world, candidateArc, predecessor, world.tick - 1)).toBeUndefined();
  });

  it('refuses duplicate, private or cold missing practice rather than borrowing a same-name body', () => {
    const { world, predecessor, candidateId, unrelatedId } = nativeThreeTiesAndExit();
    const proof = certifyProtagonistHandoff(world, predecessor, candidateId, world.tick)!;
    const practice = proof.ties.find(row => row.kind === 'practice')!;
    const original = world.events.find(row => row.id === practice.eventId)!;
    const privateWorld = { ...world, events: world.events.map(row => row === original ? { ...row, witnessScope: 'participants' as const } : row) };
    expect(protagonistHandoffTieAuthority(privateWorld, predecessor.actorId, candidateId, practice, world.tick)).toBe('disputed');
    const duplicate = { ...world, events: [...world.events, { ...original }] };
    expect(certifyProtagonistHandoff(duplicate, predecessor, candidateId, world.tick)).toBeUndefined();
    expect(certifyProtagonistHandoff({ ...world, dramaticBonds: undefined }, predecessor, candidateId, world.tick)).toBeUndefined();
    const wrongBody = structuredClone(world);
    storyPerson(wrongBody, unrelatedId).name = storyPerson(wrongBody, candidateId).name;
    expect(protagonistHandoffTieAuthority(wrongBody, predecessor.actorId, unrelatedId, practice, world.tick)).toBe('disputed');
    expect(certifyProtagonistHandoff(world, { ...predecessor, closeReason: 'receded' }, candidateId, world.tick)).toBeUndefined();
  });
});
