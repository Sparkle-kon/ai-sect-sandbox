import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableMentorshipActions, createMentorshipState, maintainMentorship, mentorshipBudgetRemaining, mentorshipTechniqueMultiplier,
  resolveMentorshipAction } from '../src/engine/mentorshipEngine';
import type { Cultivator, WorldState } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.mentorship = createMentorshipState();
  const [mentor, student, descendant, third, outsider] = world.cultivators;
  for (const actor of [mentor, student, descendant, third]) {
    actor.sectId = mentor.sectId; actor.locationId = mentor.locationId; actor.techniqueMastery = 5;
  }
  outsider.locationId = mentor.locationId;
  outsider.sectId = world.sects.find(({ id }) => id !== mentor.sectId)!.id;
  mentor.techniqueMastery = 90;
  mentor.technique = { id: 'source', name: '流云章', spiritRoot: '金' };
  return { world, mentor, student, descendant, third, outsider };
}
const teach = (world: WorldState, mentor: Cultivator, student: Cultivator) =>
  resolveMentorshipAction(world, mentor, { chosenAction: 'TEACH', targetCultivatorId: student.id, innerMonologue: '传法' }, () => 0);
const answer = (world: WorldState, student: Cultivator, id: string, accept = true, rng = () => .5) =>
  resolveMentorshipAction(world, student, { chosenAction: accept ? 'ACCEPT_TUITION' : 'DECLINE_TUITION', targetTuitionId: id, innerMonologue: '答复' }, rng);

describe('consensual, constrained lineage teaching', () => {
  it('charges per mentor per tick and does not offer unrelated students', () => {
    const { world, mentor, student, descendant, third, outsider } = fixture();
    expect(teach(world, mentor, outsider)).toBeNull();
    expect(teach(world, mentor, student)?.witnessScope).toBe('participants');
    expect(teach(world, mentor, student)).toBeNull();
    expect(teach(world, mentor, descendant)).not.toBeNull();
    expect(mentorshipBudgetRemaining(mentor, world)).toBe(0);
    expect(teach(world, mentor, third)).toBeNull();
    world.tick++;
    maintainMentorship(world);
    expect(mentorshipBudgetRemaining(mentor, world)).toBe(2);
    expect(teach(world, mentor, third)).not.toBeNull();
  });

  it('supports decline and expiry without consuming skill or issuing contribution', () => {
    const { world, mentor, student, descendant } = fixture();
    teach(world, mentor, student);
    const first = world.mentorship.offers[0];
    const technique = { ...student.technique };
    const contribution = mentor.contribution;
    const rng = vi.fn(() => 0);
    expect(answer(world, student, first.id, false, rng)?.title).toBe('弟子婉拒传法');
    expect(first.status).toBe('declined');
    expect(answer(world, student, first.id, true, rng)).toBeNull();
    expect(mentor.contribution).toBe(contribution);
    expect(student.technique).toEqual(technique);
    expect(rng).not.toHaveBeenCalled();
    teach(world, mentor, descendant);
    const pending = world.mentorship.offers[0];
    world.tick = pending.expiresTick;
    maintainMentorship(world);
    expect(pending.status).toBe('expired');
    expect(answer(world, descendant, pending.id)).toBeNull();
  });

  it('accepts once, advances only the student, and carries an interpretation defect along actual lineage with decay', () => {
    const { world, mentor, student, descendant, outsider } = fixture();
    teach(world, mentor, student);
    const first = world.mentorship.offers[0];
    const originalMastery = outsider.techniqueMastery;
    expect(answer(world, student, first.id, true, () => 0)?.title).toBe('同门传法完成');
    expect(answer(world, student, first.id, true, () => 0)).toBeNull();
    expect(student.technique).toEqual(mentor.technique);
    expect(student.technique).not.toBe(mentor.technique);
    expect(student.techniqueMastery).toBeGreaterThan(5);
    expect(outsider.techniqueMastery).toBe(originalMastery);
    expect(world.mentorship.lineage[0]).toMatchObject({ mentorId: mentor.id, studentId: student.id, lessons: 1, flaw: 12 });
    expect(mentorshipTechniqueMultiplier(world, student)).toBeLessThan(1);
    expect(mentorshipTechniqueMultiplier(world, outsider)).toBe(1);
    student.techniqueMastery = 68;
    expect(teach(world, student, descendant)).not.toBeNull();
    expect(answer(world, descendant, world.mentorship.offers[0].id, true, () => .99)).not.toBeNull();
    const edge = world.mentorship.lineage.find(({ studentId }) => studentId === descendant.id)!;
    expect(edge).toMatchObject({ mentorId: student.id, flaw: 9 });
    descendant.currentAction = 'CULTIVATE';
    world.tick++;
    maintainMentorship(world); maintainMentorship(world);
    expect(edge.flaw).toBe(8);
  });

  it('rejects stale teacher state, third-party acceptance, second parents and cycles', () => {
    const { world, mentor, student, descendant } = fixture();
    teach(world, mentor, student);
    const offer = world.mentorship.offers[0];
    expect(answer(world, descendant, offer.id)).toBeNull();
    const site = mentor.locationId;
    mentor.locationId = 'away';
    expect(availableMentorshipActions(student, world).map(({ action }) => action)).not.toContain('ACCEPT_TUITION');
    mentor.locationId = site;
    expect(answer(world, student, offer.id)).not.toBeNull();
    descendant.techniqueMastery = 95;
    expect(teach(world, descendant, student)).toBeNull();
    student.techniqueMastery = 90; mentor.techniqueMastery = 55;
    expect(teach(world, student, mentor)).toBeNull();
  });
});
