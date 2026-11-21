import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableApprenticeCohortActions, advanceApprenticeCohorts, resolveApprenticeCohortAction } from '../src/engine/apprenticeCohortEngine';
import { maintainMentorship, mentorshipBudgetRemaining, resolveMentorshipAction, spendMentorshipBudget } from '../src/engine/mentorshipEngine';
import { authorTechnique, gainMastery } from '../src/engine/techniqueEngine';
import type { Cultivator, LLMDecisionPayload } from '../src/types/world';

function instructionalFixture() {
  const world = createInitialWorld(72);
  world.tick = 20;
  const mentor = world.cultivators[0];
  const [first, second, third] = world.cultivators.filter(({ sectId, id }) => sectId === mentor.sectId && id !== mentor.id);
  const fourth = world.cultivators.find(({ sectId, id }) => sectId !== mentor.sectId &&
    !world.sects.some(({ leaderId }) => leaderId === id))!;
  mentor.realm = '元婴';
  mentor.techniqueMastery = 91;
  expect(authorTechnique(mentor, world)).not.toBeNull();
  expect(world.scriptures.originals[0].id).toBe(mentor.technique.id);
  gainMastery(mentor, 36);
  for (const actor of [first, second, third, fourth]) {
    actor.sectId = mentor.sectId;
    actor.locationId = mentor.locationId;
    actor.techniqueMastery = 12;
    actor.currentAction = 'REST';
    actor.tribulation = undefined;
  }
  const ordinaryOffer = (student: Cultivator) => resolveMentorshipAction(world, mentor,
    { chosenAction: 'TEACH', targetCultivatorId: student.id, innerMonologue: '' }, () => .99);
  const next = (tick = world.tick + 1) => { world.tick = tick; maintainMentorship(world); };
  next();
  expect(ordinaryOffer(first)).not.toBeNull();
  expect(ordinaryOffer(second)).not.toBeNull();
  expect(mentorshipBudgetRemaining(mentor, world)).toBe(0);
  expect(mentorshipBudgetRemaining(mentor, world, world.tick + 1)).toBe(2);
  expect(mentorshipBudgetRemaining(mentor, world, world.tick + 2)).toBe(0);
  const due = new Map(world.mentorship.offers.map((offer) => [offer.studentId, offer.id]));
  next();
  for (const student of [first, second]) {
    expect(resolveMentorshipAction(world, student, { chosenAction: 'ACCEPT_TUITION', targetTuitionId: due.get(student.id),
      innerMonologue: '' }, () => .99)?.title).toBe('同门传法完成');
  }
  expect(mentorshipBudgetRemaining(mentor, world)).toBe(2);
  const baselineLineage = structuredClone(world.mentorship.lineage);
  const cohortMove = (actor: Cultivator, id: string, move: Exclude<LLMDecisionPayload['cohortMove'], 'offer' | undefined>) =>
    resolveApprenticeCohortAction(world, actor, { chosenAction: 'APPRENTICE_COHORT', cohortMove: move,
      targetCohortId: id, innerMonologue: '' });
  next();
  const offer = availableApprenticeCohortActions(mentor, world).find(({ cohortMove }) => cohortMove === 'offer');
  expect(offer).toMatchObject({ action: 'APPRENTICE_COHORT', cohortInviteeIds: [first.id, second.id].sort() });
  expect(resolveApprenticeCohortAction(world, mentor, { ...offer, chosenAction: 'APPRENTICE_COHORT', innerMonologue: '' })).not.toBeNull();
  const cohort = world.apprenticeCohorts.cohorts.at(-1)!;
  expect(mentorshipBudgetRemaining(mentor, world)).toBe(2);
  next();
  expect(cohortMove(first, cohort.id, 'accept')).not.toBeNull();
  expect(cohortMove(second, cohort.id, 'accept')).not.toBeNull();
  next(cohort.lessonTick);
  return { world, mentor, first, second, third, fourth, cohort, baselineLineage, ordinaryOffer, cohortMove };
}

describe('one shared actual instruction budget across mentorship modes', () => {
  it('spends one cohort period for two independently consenting attendees, preserving prior lineage and one later old slot', () => {
    const { world, mentor, first, second, third, fourth, cohort, baselineLineage, ordinaryOffer, cohortMove } = instructionalFixture();
    const before = new Map([first, second].map((student) => [student.id, student.techniqueMastery]));
    expect(cohortMove(second, cohort.id, 'attend')).not.toBeNull();
    expect(cohortMove(mentor, cohort.id, 'teach')).not.toBeNull();
    expect(cohortMove(first, cohort.id, 'attend')).not.toBeNull();
    expect(mentorshipBudgetRemaining(mentor, world)).toBe(2);
    const receipts = advanceApprenticeCohorts(world);
    expect(receipts.filter(({ title }) => title === '本期合班授课已结算')).toHaveLength(1);
    expect(receipts.filter(({ title }) => title === '核实本期合班到课')).toHaveLength(2);
    expect(receipts.every(({ witnessScope }) => witnessScope === 'participants')).toBe(true);
    expect(cohort).toMatchObject({ status: 'held', instructionSpent: 1 });
    expect(cohort.seats.map(({ studentId, status }) => ({ studentId, status }))).toEqual(
      [first.id, second.id].sort().map((studentId) => ({ studentId, status: 'attended' })));
    expect(cohort.seats.every(({ studentId, masteryGained }) => masteryGained ===
      [first, second].find(({ id }) => id === studentId)!.techniqueMastery - before.get(studentId)!)).toBe(true);
    expect(world.mentorship.lineage).toEqual(baselineLineage);
    expect(world.mentorship.budgets).toEqual([{ mentorId: mentor.id, tick: world.tick, spent: 1 }]);
    expect(mentorshipBudgetRemaining(mentor, world)).toBe(1);
    expect(advanceApprenticeCohorts(world)).toEqual([]);
    expect(ordinaryOffer(third)?.title).toBe('师门传法邀约');
    expect(ordinaryOffer(fourth)).toBeNull();
    expect(mentorshipBudgetRemaining(mentor, world)).toBe(0);
    expect(world.mentorship.lineage).toEqual(baselineLineage);
  });

  it('does not spend teacher or create attendance if only readiness was real and nobody actually attended', () => {
    const { world, mentor, cohort, baselineLineage, cohortMove } = instructionalFixture();
    expect(cohortMove(mentor, cohort.id, 'teach')).not.toBeNull();
    expect(advanceApprenticeCohorts(world)).toHaveLength(1);
    expect(cohort).toMatchObject({ status: 'expired', reason: 'no_confirmed_attendance' });
    expect(cohort.instructionSpent).toBeUndefined();
    expect(cohort.seats.every(({ attendedTick }) => attendedTick === undefined)).toBe(true);
    expect(mentorshipBudgetRemaining(mentor, world)).toBe(2);
    expect(world.mentorship.lineage).toEqual(baselineLineage);
    expect(spendMentorshipBudget(world, structuredClone(mentor))).toBe(false);
    expect(world.mentorship.budgets).toEqual([]);
  });

  it('does not create a cohort instruction after existing legitimate tuition has exhausted both turn slots', () => {
    const { world, mentor, first, third, fourth, cohort, baselineLineage, ordinaryOffer, cohortMove } = instructionalFixture();
    expect(cohortMove(mentor, cohort.id, 'teach')).not.toBeNull();
    expect(cohortMove(first, cohort.id, 'attend')).not.toBeNull();
    expect(ordinaryOffer(third)).not.toBeNull();
    expect(ordinaryOffer(fourth)).not.toBeNull();
    expect(advanceApprenticeCohorts(world)).toHaveLength(1);
    expect(cohort).toMatchObject({ status: 'expired', reason: 'no_budget' });
    expect(cohort.instructionSpent).toBeUndefined();
    expect(world.mentorship.budgets).toEqual([{ mentorId: mentor.id, tick: world.tick, spent: 2 }]);
    expect(world.mentorship.lineage).toEqual(baselineLineage);
    expect(world.apprenticeCohorts.graduations).toEqual([]);
  });
});
