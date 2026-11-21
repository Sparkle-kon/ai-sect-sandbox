import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  advanceApprenticeCohorts, availableApprenticeCohortActions, COHORT_MAX_INVITEES,
  recordCohortPractice, resolveApprenticeCohortAction, visibleApprenticeCohorts,
} from '../src/engine/apprenticeCohortEngine';
import { mentorshipBudgetRemaining } from '../src/engine/mentorshipEngine';
import { registerScriptureOriginal } from '../src/engine/scriptureEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { ApprenticeCohort, ApprenticeCohortMove, Cultivator, LLMDecisionPayload, Technique } from '../src/types/world';

function fixture(count = 2) {
  const world = createInitialWorld(7344);
  world.tick = 20;
  const [mentor,...peers] = world.cultivators;
  const students = peers.slice(0,count);
  const outsider = peers[count];
  const textbook: Technique = {id:'registered-curriculum',name:'青山诀',spiritRoot:'木'};
  expect(registerScriptureOriginal(world,textbook,'pavilion',mentor.locationId,mentor.sectId)).toBe(true);
  mentor.technique = {...textbook};
  mentor.techniqueMastery = 70;
  for (const person of students) {
    person.locationId = mentor.locationId;
    person.sectId = mentor.sectId;
    person.technique = {...textbook};
    person.techniqueMastery = 37;
    world.mentorship.lineage.push({mentorId:mentor.id,studentId:person.id,technique:{...textbook},
      formedTick:world.tick-3,lastLessonTick:world.tick-3,lessons:1,flaw:0});
  }
  const options = (actor: Cultivator,tick = world.tick) => availableApprenticeCohortActions(actor,world,tick);
  const act = (actor: Cultivator,cohortMove: ApprenticeCohortMove,extra: Partial<LLMDecisionPayload> = {}) =>
    resolveApprenticeCohortAction(world,actor,{chosenAction:'APPRENTICE_COHORT',innerMonologue:'只按实情结算',cohortMove,...extra});
  const propose = () => options(mentor).find(option => option.cohortMove === 'offer')!;
  const open = () => {
    expect(act(mentor,'offer',propose())).not.toBeNull();
    return world.apprenticeCohorts.cohorts.at(-1)!;
  };
  const move = (actor: Cultivator,cohortMove: ApprenticeCohortMove,row: ApprenticeCohort) =>
    act(actor,cohortMove,{targetCohortId:row.id});
  const sign = (row: ApprenticeCohort) => {
    world.tick = row.openedTick+1;
    for (const student of students) expect(move(student,'accept',row)).not.toBeNull();
    world.tick = row.lessonTick;
  };
  const cultivate = (actor: Cultivator) =>
    applyCultivatorBrainDecision(world,actor,{chosenAction:'CULTIVATE',innerMonologue:''},()=>.6);
  return {world,mentor,students,outsider,textbook,options,act,propose,open,move,sign,cultivate};
}

describe('cohort lessons and independent graduation receipts', () => {
  it('requires registered exact curriculum, historical lineage, finite sorted invite list and actual canonical actors', () => {
    const {world,mentor,students,outsider,textbook,act,options,propose} = fixture(8);
    const roster = [...students].map(student => student.id).sort();
    const best = propose();
    expect(best.cohortInviteeIds).toEqual(roster.slice(0,COHORT_MAX_INVITEES));
    expect(best.targetTechniqueId).toBe(textbook.id);
    expect(options(structuredClone(mentor))).toEqual([]);
    expect(act(mentor,'offer',{...best,cohortInviteeIds:[outsider.id,...roster.slice(0,3)]})).toBeNull();
    expect(act(mentor,'offer',{...best,targetTechniqueId:undefined})).toBeNull();
    expect(act(mentor,'offer',{...best,targetTechniqueId:'same-name-different-id'})).toBeNull();
    expect(act(mentor,'offer',{...best,cohortInviteeIds:[roster[0],roster[0]]})).toBeNull();
    students[0].technique = {...textbook,id:'unregistered-id'};
    students[1].technique = {...textbook,spiritRoot:'水'};
    world.mentorship.lineage.find(edge => edge.studentId === students[2].id)!.formedTick = world.tick+3;
    const updated = propose();
    expect(updated.cohortInviteeIds).not.toContain(students[0].id);
    expect(updated.cohortInviteeIds).not.toContain(students[1].id);
    expect(updated.cohortInviteeIds).not.toContain(students[2].id);
    world.scriptures.originals = [];
    expect(propose()).toBeUndefined();
  });

  it('forms only actual consent and suspends instruction until all applicable end-of-turn checks', () => {
    const {world,mentor,students:[one,two],outsider,open,move,options} = fixture();
    const row = open();
    expect(mentorshipBudgetRemaining(mentor,world)).toBe(2);
    expect(move(one,'accept',row)).toBeNull();
    expect(options(one,world.tick+1)).toContainEqual({action:'APPRENTICE_COHORT',cohortMove:'accept',targetCohortId:row.id});
    expect(options(one,world.tick+2)).toEqual([]);
    expect(advanceApprenticeCohorts(world)).toEqual([]);
    ++world.tick;
    expect(move(outsider,'accept',row)).toBeNull();
    expect(move(one,'accept',row)).not.toBeNull();
    expect(move(one,'accept',row)).toBeNull();
    expect(move(two,'accept',row)).not.toBeNull();
    expect(move(mentor,'teach',row)).toBeNull();
    ++world.tick;
    expect(move(one,'attend',row)).not.toBeNull();
    expect(move(one,'attend',row)).toBeNull();
    expect(move(mentor,'teach',row)).not.toBeNull();
    expect(one.techniqueMastery).toBe(37);
    expect(mentorshipBudgetRemaining(mentor,world)).toBe(2);
    expect(advanceApprenticeCohorts(world)).toHaveLength(2);
    expect(row).toMatchObject({status:'held',teachingTick:world.tick,lessonTick:world.tick,instructionSpent:1});
    expect(row.seats.find(seat=>seat.studentId===one.id)).toMatchObject({status:'attended',masteryGained:1});
    expect(row.seats.find(seat=>seat.studentId===two.id)).toMatchObject({status:'missed',acceptedTick:world.tick-1});
    expect(mentorshipBudgetRemaining(mentor,world)).toBe(1);
    expect([one.techniqueMastery,two.techniqueMastery]).toEqual([38,37]);
    expect(advanceApprenticeCohorts(world)).toEqual([]);
  });

  it.each(['departed','teacher-replaced-text','withdrew'] as const)('no award when actual closure proof fails (%s)',reason=>{
    const {world,mentor,students:[one],open,move,sign,textbook} = fixture();
    const row = open(); sign(row);
    expect(move(mentor,'teach',row)).not.toBeNull();
    expect(move(one,'attend',row)).not.toBeNull();
    if (reason === 'departed') one.locationId = world.locations.find(site=>site.id!==row.siteId)!.id;
    if (reason === 'teacher-replaced-text') mentor.technique = {...textbook,id:'other'};
    if (reason === 'withdrew') expect(move(one,'leave',row)).not.toBeNull();
    expect(advanceApprenticeCohorts(world)).toHaveLength(1);
    expect(row.status).toBe('expired');
    expect(row.instructionSpent).toBeUndefined();
    expect(one.techniqueMastery).toBe(37);
    expect(mentorshipBudgetRemaining(mentor,world)).toBe(2);
  });

  it('awards only later canonical CULTIVATE with actual mastery gain and pins lifetime evidence through history growth',()=>{
    const {world,mentor,students:[one,two],outsider,open,move,sign,cultivate,textbook} = fixture();
    const row = open(); sign(row);
    expect(move(mentor,'teach',row)).not.toBeNull();
    expect(move(one,'attend',row)).not.toBeNull();
    expect(move(two,'attend',row)).not.toBeNull();
    advanceApprenticeCohorts(world);
    expect(cultivate(one)).toBeNull(); // Even genuine independent action at the lesson tick is not a later proof.
    expect(world.apprenticeCohorts.graduations).toEqual([]);
    ++world.tick;
    expect(cultivate(outsider)).toBeNull();
    expect(move(two,'leave',row)).not.toBeNull();
    expect(cultivate(two)).toBeNull();
    expect(row.seats.find(seat=>seat.studentId===two.id)).toMatchObject({status:'attended',masteryGained:1,leftTick:world.tick});
    const lineage = structuredClone(world.mentorship.lineage);
    one.technique = {...textbook,id:'different-canon'};
    expect(cultivate(one)).toBeNull();
    one.technique = {...textbook};
    const gold = one.spiritStones, rank = one.sectRank;
    const lessonSite = row.siteId;
    one.locationId = world.locations.find(site=>site.id!==lessonSite)!.id;
    const proof = cultivate(one);
    expect(proof).toMatchObject({locationId:lessonSite,witnessScope:'participants',actorIds:[mentor.id,one.id]});
    expect(one.spiritStones).toBe(gold);
    expect(one.sectRank).toBe(rank);
    expect(world.mentorship.lineage).toEqual(lineage);
    expect(world.apprenticeCohorts.graduations).toEqual([{cohortId:row.id,mentorId:mentor.id,studentId:one.id,
      techniqueId:textbook.id,tick:world.tick,masteryBefore:44,masteryAfter:47}]);
    ++world.tick;
    expect(cultivate(one)).toBeNull();
    for(let i=0;i<110;i++) world.apprenticeCohorts.cohorts.push({...row,id:`cold-${i}`,status:'expired',seats:[]});
    advanceApprenticeCohorts(world);
    expect(world.apprenticeCohorts.cohorts).toHaveLength(97);
    expect(world.apprenticeCohorts.cohorts[0]).toBe(row);
    expect(world.apprenticeCohorts.graduations).toHaveLength(1);
  });

  it('does not graduate at 39, without genuine gain, or merely by queued practice dispatch',()=>{
    const {world,mentor,students:[one],open,move,sign,cultivate} = fixture();
    one.techniqueMastery = 35;
    const row = open(); sign(row);
    expect(move(one,'attend',row)).not.toBeNull();
    expect(move(mentor,'teach',row)).not.toBeNull();
    advanceApprenticeCohorts(world);
    ++world.tick;
    expect(cultivate(one)).toBeNull();
    expect(one.techniqueMastery).toBe(39);
    expect(recordCohortPractice(world,one,39)).toBeNull();
    expect(recordCohortPractice(world,one,35)).toBeNull();
    ++world.tick;
    expect(cultivate(one)).not.toBeNull();
    expect(world.apprenticeCohorts.graduations[0]).toMatchObject({masteryBefore:39,masteryAfter:42});
  });

  it('projects only participant scope, hides unrelated student identities and yields isolated values',()=>{
    const {world,mentor,students:[one,two],outsider,open} = fixture();
    const row = open();
    const empty = {cohorts:[],graduations:[]};
    expect(visibleApprenticeCohorts(world)).toEqual(empty);
    expect(visibleApprenticeCohorts(world,outsider)).toEqual(empty);
    expect(visibleApprenticeCohorts(world,structuredClone(one))).toEqual(empty);
    expect(visibleApprenticeCohorts(world,mentor).cohorts[0].seats).toHaveLength(2);
    expect(visibleApprenticeCohorts(world,two).cohorts[0].seats.map(seat=>seat.studentId)).toEqual([two.id]);
    const projected = visibleApprenticeCohorts(world,one);
    projected.cohorts[0].seats[0].status = 'left';
    expect(row.seats.every(seat=>seat.status==='invited')).toBe(true);
  });
});
