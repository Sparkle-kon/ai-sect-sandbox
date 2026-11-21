import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceDoctrines, availableDoctrineActions, createDoctrineState, doctrineSupport, DOCTRINE_TRAINING_COST,
  DOCTRINE_TRAINING_GAIN, resolveDoctrineAction } from '../src/engine/doctrineEngine';
import type { Cultivator, DoctrineMove, LLMDecisionPayload } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(15);
  world.doctrines = createDoctrineState();
  const sect = world.sects[0];
  const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const members = world.cultivators.filter((person) => person.sectId === sect.id && person.id !== leader.id);
  const [steward, student] = members;
  const outsider = world.cultivators.find((person) => person.sectId !== sect.id)!;
  for (const person of [leader, steward, student, outsider]) person.locationId = sect.headquartersId;
  sect.spiritStones = 400;
  const evidence = (person: Cultivator, intensity = 8) => {
    const id = `private-evidence-${person.id}`;
    person.memories.push({ id, tick: world.tick, content: '不可公开的个人回忆', importance: 9,
      emotionalValence: 3, decayRate: .01, category: 'cultivation' });
    person.reflections.push({ id: `belief-${person.id}`, source: 'utility', tick: world.tick, kind: 'belief', theme: 'cultivation',
      intensity, statement: '隐藏的私有感悟', sourceMemoryIds: [id, id] });
  };
  const act = (actor: Cultivator, doctrineMove: DoctrineMove, params: Partial<LLMDecisionPayload> = {}) =>
    resolveDoctrineAction(world, actor, { chosenAction: 'DOCTRINE', doctrineMove, innerMonologue: '按当下公开依据行事', ...params });
  const endorse = (actor: Cultivator) => act(actor, 'endorse', { doctrineTheme: 'cultivation' });
  const found = () => {
    evidence(steward, 10); evidence(student); evidence(leader);
    expect(endorse(steward)).not.toBeNull();
    expect(endorse(student)).not.toBeNull();
    expect(endorse(leader)).not.toBeNull();
    return world.doctrines.schools[0];
  };
  return { world, sect, leader, steward, student, outsider, evidence, act, endorse, found };
}

describe('evidence-based autonomous schools', () => {
  it('uses unique matching retained experiences, one supporter each regardless of rank, and preserves evidence privacy', () => {
    const { world, sect, leader, steward, student, outsider, evidence, act, endorse } = fixture();
    evidence(steward);
    evidence(student);
    student.memories[student.memories.length - 1].category = 'whisper';
    expect(endorse(student)).toBeNull();
    expect(endorse(leader)).toBeNull();
    const row = endorse(steward);
    expect(row?.title).toBe('有据立论');
    expect(endorse(steward)).toBeNull();
    expect(world.doctrines.endorsements[0].evidenceCount).toBe(1);
    expect(JSON.stringify(world.doctrines)).not.toMatch(/private-evidence|私有感悟|个人回忆.*不可公开/);
    const school = world.doctrines.schools[0];
    expect(doctrineSupport(world, school)).toMatchObject({ supporters: 1, threshold: 3 });
    expect(act(leader, 'propose_separation', { targetDoctrineSchoolId: school.id })).toBeNull();
    evidence(outsider);
    expect(endorse(outsider)).toBeNull();
    expect(sect.spiritStones).toBe(400);
    world.tick += 25;
    expect(endorse(steward)).toBeNull();
    expect(doctrineSupport(world, school).supporters).toBe(0);
  });

  it('needs both separate signatories; rejection and repeated settlement never change member property', () => {
    const { world, sect, steward, student, leader, act, found } = fixture();
    const school = found();
    expect(act(steward, 'propose_separation', { targetDoctrineSchoolId: school.id })).not.toBeNull();
    const first = world.doctrines.proposals[0];
    expect(first).toMatchObject({ status: 'pending', amount: 80, votes: [{ actorId: steward.id, tick: world.tick, verdict: 'accept' }] });
    expect(act(steward, 'accept', { targetDoctrineProposalId: first.id })).toBeNull();
    expect(act(student, 'accept', { targetDoctrineProposalId: first.id })).toBeNull();
    expect(act(leader, 'decline', { targetDoctrineProposalId: first.id })?.title).toBe('道统议约被拒');
    expect(first.status).toBe('declined');
    expect(act(leader, 'accept', { targetDoctrineProposalId: first.id })).toBeNull();
    expect(school.memberIds).toEqual([]);
    expect(school.treasury).toBe(0);
    expect(sect.spiritStones).toBe(400);
    expect(advanceDoctrines(world)).toEqual([]);
  });

  it('transfers the original funded amount once, makes members opt in, trains with real chest funds, and reconciles cleanly', () => {
    const { world, sect, steward, student, leader, act, found } = fixture();
    const school = found();
    const propertyAndOffices = structuredClone({ pavilion: sect.pavilion, facilities: sect.facilities,
      territory: world.terrain.tiles.map(({ ownerSectId }) => ownerSectId), rank: student.sectRank });
    const balances = () => sect.spiritStones + school.treasury + student.spiritStones;
    const beforeTotal = balances();
    const mastery = student.techniqueMastery;
    act(leader, 'propose_separation', { targetDoctrineSchoolId: school.id });
    const separation = world.doctrines.proposals[0];
    expect(act(steward, 'accept', { targetDoctrineProposalId: separation.id })?.title).toBe('道统和平分立');
    expect(act(steward, 'accept', { targetDoctrineProposalId: separation.id })).toBeNull();
    expect(school.memberIds).toEqual([steward.id]);
    expect(sect.spiritStones).toBe(320);
    expect(school.treasury).toBe(80);
    expect(balances()).toBe(beforeTotal);
    expect(act(steward, 'fund_training', { targetDoctrineSchoolId: school.id, targetCultivatorId: student.id })).toBeNull();
    expect(act(student, 'join', { targetDoctrineSchoolId: school.id })).not.toBeNull();
    expect(act(student, 'join', { targetDoctrineSchoolId: school.id })).toBeNull();
    expect(act(steward, 'fund_training', { targetDoctrineSchoolId: school.id, targetCultivatorId: student.id })?.title).toBe('道统学舍资助修习');
    expect(act(steward, 'fund_training', { targetDoctrineSchoolId: school.id, targetCultivatorId: student.id })).toBeNull();
    expect(student.techniqueMastery).toBe(Math.min(100, mastery + DOCTRINE_TRAINING_GAIN));
    expect(student.sectId).toBe(sect.id);
    expect(school.treasury).toBe(80 - DOCTRINE_TRAINING_COST);
    expect(balances()).toBe(beforeTotal);
    expect(act(steward, 'propose_reconciliation', { targetDoctrineSchoolId: school.id })).toBeNull();

    world.tick += 12;
    expect(act(steward, 'propose_reconciliation', { targetDoctrineSchoolId: school.id })).not.toBeNull();
    const reconciliation = world.doctrines.proposals[1];
    expect(reconciliation.amount).toBe(80 - DOCTRINE_TRAINING_COST);
    expect(act(leader, 'accept', { targetDoctrineProposalId: reconciliation.id })?.title).toBe('宗门道统和解');
    expect(act(leader, 'accept', { targetDoctrineProposalId: reconciliation.id })).toBeNull();
    expect(school).toMatchObject({ status: 'reconciled', treasury: 0, memberIds: [] });
    expect(sect.spiritStones).toBe(400 - DOCTRINE_TRAINING_COST);
    expect(balances()).toBe(beforeTotal);
    expect({ pavilion: sect.pavilion, facilities: sect.facilities, territory: world.terrain.tiles.map(({ ownerSectId }) => ownerSectId),
      rank: student.sectRank }).toEqual(propertyAndOffices);
  });

  it('blocks acceptance on lost supporting membership or expired ballots without leaking or transferring funds', () => {
    const { world, sect, leader, steward, student, act, found } = fixture();
    const school = found();
    act(leader, 'propose_separation', { targetDoctrineSchoolId: school.id });
    const invalid = world.doctrines.proposals[0];
    student.alive = false;
    expect(doctrineSupport(world, school).supporters).toBe(2);
    expect(act(steward, 'accept', { targetDoctrineProposalId: invalid.id })).toBeNull();
    expect(advanceDoctrines(world)[0]?.title).toBe('道统议约条件失效');
    expect(invalid.status).toBe('invalidated');
    expect(school.treasury).toBe(0);
    expect(sect.spiritStones).toBe(400);

    student.alive = true; world.tick += 7;
    expect(act(student, 'endorse', { doctrineTheme: 'cultivation' })).not.toBeNull();
    expect(act(leader, 'propose_separation', { targetDoctrineSchoolId: school.id })).not.toBeNull();
    const expired = world.doctrines.proposals[1];
    world.tick = expired.expiresTick;
    expect(act(steward, 'accept', { targetDoctrineProposalId: expired.id })).toBeNull();
    expect(advanceDoctrines(world)[0]?.title).toBe('道统议约届满');
    expect(expired.status).toBe('expired');
    expect(advanceDoctrines(world)).toEqual([]);
    expect(sect.spiritStones).toBe(400);
  });

  it('renews legitimate endorsement by time, excludes cross-charter affiliation, and replaces a departed steward deterministically', () => {
    const { world, sect, steward, student, leader, act, found, evidence } = fixture();
    const school = found();
    act(leader, 'propose_separation', { targetDoctrineSchoolId: school.id });
    act(steward, 'accept', { targetDoctrineProposalId: world.doctrines.proposals[0].id });
    act(student, 'join', { targetDoctrineSchoolId: school.id });
    world.tick += 8;
    evidence(student);
    const social = student.memories[student.memories.length - 1];
    social.category = 'social';
    student.reflections[student.reflections.length - 1].theme = 'community';
    expect(act(student, 'endorse', { doctrineTheme: 'community' })).toBeNull();
    expect(availableDoctrineActions(student, world).some((option) => option.doctrineMove === 'join')).toBe(false);
    expect(act(steward, 'leave', { targetDoctrineSchoolId: school.id })).not.toBeNull();
    expect(school.stewardId).toBe(student.id);
    expect(school.memberIds).toEqual([student.id]);
    expect(student.sectId).toBe(sect.id);
    expect(school.treasury).toBe(80);
  });
});
