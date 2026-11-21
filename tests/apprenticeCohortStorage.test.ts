import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceApprenticeCohorts, resolveApprenticeCohortAction } from '../src/engine/apprenticeCohortEngine';
import { resolveMentorshipAction } from '../src/engine/mentorshipEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { authorTechnique, gainMastery, studyTechnique } from '../src/engine/techniqueEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMDecisionPayload, ApprenticeCohortMove } from '../src/types/world';

function foundation() {
  const world = createInitialWorld(632);
  const mentor = world.cultivators.find(({ id }) => id === 'npc-1')!;
  const students = ['elder-taixu-1', 'elder-taixu-2'].map((id) => world.cultivators.find((actor) => actor.id === id)!);
  mentor.techniqueMastery = 75;
  expect(authorTechnique(mentor, world)).not.toBeNull();
  const techniqueId = mentor.technique.id!;
  gainMastery(mentor, 36);
  for (const student of students) expect(studyTechnique(student, world, techniqueId)).not.toBeNull();
  world.tick++;
  for (const student of students) {
    expect(resolveMentorshipAction(world, mentor, {
      chosenAction: 'TEACH', targetCultivatorId: student.id, innerMonologue: '',
    }, () => .99)).not.toBeNull();
  }
  world.tick++;
  for (const student of students) {
    const tuition = world.mentorship.offers.find(({ studentId }) => studentId === student.id)!;
    expect(resolveMentorshipAction(world, student, {
      chosenAction: 'ACCEPT_TUITION', targetTuitionId: tuition.id, innerMonologue: '',
    }, () => .99)).not.toBeNull();
    student.techniqueMastery = 38;
  }
  const lineage = structuredClone(world.mentorship.lineage);
  const use = (actor: Cultivator, cohortMove: ApprenticeCohortMove, fields: Partial<LLMDecisionPayload> = {}) =>
    resolveApprenticeCohortAction(world, actor, { chosenAction: 'APPRENTICE_COHORT', cohortMove, innerMonologue: '', ...fields });
  world.tick++;
  expect(use(mentor, 'offer', { targetTechniqueId: techniqueId, cohortInviteeIds: students.map(({ id }) => id) })).not.toBeNull();
  const cohort = world.apprenticeCohorts.cohorts[0];
  const args = { targetCohortId: cohort.id };
  world.tick++;
  for (const person of students) expect(use(person, 'accept', args)).not.toBeNull();
  world.tick++;
  expect(use(mentor, 'teach', args)).not.toBeNull();
  for (const person of students) expect(use(person, 'attend', args)).not.toBeNull();
  const settled = advanceApprenticeCohorts(world);
  expect(settled.filter(({ id }) => id === `evt-${cohort.id}-${world.tick}-held`)).toHaveLength(1);
  expect(cohort.instructionSpent).toBe(1);
  return { world, students, cohort, args, use, lineage, techniqueId };
}

describe('independent skill receipts from actual cultivation and portable lineage', () => {
  it('never confuses attendance with graduation, canonical later practice awards once, and withdrawal keeps attendance history', () => {
    const { world, students, cohort, args, use, lineage, techniqueId } = foundation();
    const [graduate, withdrawer] = students;
    expect(cohort.status).toBe('held');
    expect(world.apprenticeCohorts.graduations).toEqual([]);
    expect(decodeWorldSave(encodeWorldSave(world)).apprenticeCohorts).toEqual(world.apprenticeCohorts);
    const practice = (person: Cultivator) =>
      applyCultivatorBrainDecision(world, person, { chosenAction: 'CULTIVATE', innerMonologue: '' }, () => .5);
    const sameTick = structuredClone(world);
    const samePerson = sameTick.cultivators.find(({ id }) => id === graduate.id)!;
    expect(applyCultivatorBrainDecision(sameTick, samePerson, { chosenAction: 'CULTIVATE', innerMonologue: '' }, () => .5)).toBeNull();
    expect(sameTick.apprenticeCohorts.graduations).toEqual([]);
    world.tick++;
    expect(use(withdrawer, 'leave', args)).not.toBeNull();
    expect(practice(withdrawer)).toBeNull();
    expect(cohort.seats.find(({ studentId }) => studentId === withdrawer.id))
      .toMatchObject({ status: 'attended', attendedTick: cohort.lessonTick, leftTick: world.tick });
    const earned = practice(graduate);
    expect(earned?.witnessScope).toBe('participants');
    expect(world.apprenticeCohorts.graduations).toEqual([{
      cohortId: cohort.id, studentId: graduate.id, mentorId: cohort.mentorId, techniqueId,
      tick: world.tick, masteryBefore: 39, masteryAfter: 42,
    }]);
    world.tick++;
    expect(practice(graduate)).toBeNull();
    expect(world.mentorship.lineage).toEqual(lineage);
    expect(world.apprenticeCohorts.graduations).toHaveLength(1);
    const roundTrip = decodeWorldSave(encodeWorldSave(world));
    expect(roundTrip.apprenticeCohorts).toEqual(world.apprenticeCohorts);
    roundTrip.apprenticeCohorts.graduations.push({ ...roundTrip.apprenticeCohorts.graduations[0] });
    expect(() => encodeWorldSave(roundTrip)).toThrow('apprenticeCohorts.graduations.source');
  });
});
