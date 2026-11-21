import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableInfirmaryActions } from '../src/engine/infirmaryEngine';
import { authorTechnique, gainMastery } from '../src/engine/techniqueEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '' };
const clinic = (infirmaryMove: NonNullable<LLMDecisionPayload['infirmaryMove']>, targetInfirmaryCaseId?: string): LLMDecisionPayload =>
  ({ chosenAction: 'INFIRMARY', infirmaryMove, targetInfirmaryCaseId, innerMonologue: '' });
const observation = (observatoryMove: 'fund'|'measure', targetLocationId: string, targetObservatoryTick?: number): LLMDecisionPayload =>
  ({ chosenAction: 'FIELD_OBSERVATORY', observatoryMove, targetLocationId, targetObservatoryTick, innerMonologue: '' });
const lesson = (cohortMove: 'accept'|'teach'|'attend', targetCohortId: string): LLMDecisionPayload =>
  ({ chosenAction: 'APPRENTICE_COHORT', cohortMove, targetCohortId, innerMonologue: '' });
const person = (world: WorldState, id: string) => world.cultivators.find(actor => actor.id === id)!;
const apply = (world: WorldState, id: string, action: LLMDecisionPayload) =>
  applyCultivatorBrainDecision(world, person(world,id), action, () => .99);
const turn = (world:WorldState, options:Record<string,LLMDecisionPayload> = {}, reverse = false) => {
  const input = structuredClone(world);
  if (reverse) input.cultivators.reverse();
  return advanceWorldTick(input, Object.fromEntries(input.cultivators.map(({id}) => [id,options[id] ?? rest])), () => .99);
};

function fixture() {
  const world = createInitialWorld(9301);
  world.tick = 25;
  world.month = 5;
  const sect = world.sects.find(({id}) => id === 'sect-danxia')!;
  const site = world.locations.find(({id}) => id === sect.headquartersId)!;
  const [primary,backup,patient] = world.cultivators.filter(({sectId,id}) => sectId === sect.id && id !== sect.leaderId)
    .sort((a,b) => a.id < b.id ? -1 : 1);
  for (const row of world.cultivators) row.locationId = 'loc-market';
  for (const row of [primary,backup,patient,person(world,sect.leaderId!)]) {
    row.locationId = site.id;
    row.hp = row.maxHp;
    row.spiritStones = 100;
  }
  sect.facilities.alchemy_hall = 2;
  sect.spiritStones = 150;
  site.furnaceGrade = 2;
  site.herbs.jade_leaf = 8;
  return {world,sectId:sect.id,siteId:site.id,primaryId:primary.id,backupId:backup.id,patientId:patient.id,mentorId:sect.leaderId!};
}

function enrolledObservatory(backupSigned:boolean) {
  const {world,sectId,siteId,primaryId,backupId,patientId} = fixture();
  const funded = turn(world,{[primaryId]:observation('fund',siteId)});
  const opened = funded.fieldObservatories.byActor[primaryId].runs[0];
  expect(opened).toMatchObject({status:'pending',targetTick:funded.tick+2});
  const patient = person(funded,patientId);
  patient.hp = Math.round(patient.maxHp * .24);
  patient.pillToxicity = 15;
  const ready = turn(funded,{
    [primaryId]:clinic('staff'), [patientId]:clinic('request'), ...(backupSigned ? {[backupId]:clinic('staff')} : {}),
  });
  expect(ready.infirmaries.shifts).toHaveLength(backupSigned ? 2 : 1);
  const waiting = ready.infirmaries.cases.find(row => row.patientId === patientId)!;
  expect(waiting.status).toBe('waiting');
  const primary = ready.infirmaries.shifts.find(row => row.guardId === primaryId)!;
  const backup = ready.infirmaries.shifts.find(row => row.guardId === backupId);
  const measure = observation('measure',siteId,opened.openedTick);
  return {ready,sectId,siteId,primaryId,backupId,patientId,primary,backup,waiting,measure};
}

describe('real conflict allocation across canonical world turns', () => {
  it.each([false,true])('keeps the paid observatory period regardless of actor order (reversed = %s)', reverse => {
    const {ready,primaryId,patientId,primary,waiting,measure} = enrolledObservatory(false);
    const effect = turn(ready,{[primaryId]:measure,[patientId]:clinic('accept',waiting.id)},reverse);
    expect(effect.fieldObservatories.byActor[primaryId].runs[0].status).toBe('measured');
    expect(effect.infirmaries.cases.find(({id}) => id === waiting.id)).toMatchObject({status:'waiting'});
    expect(effect.infirmaries.cases.find(({id}) => id === waiting.id)?.receipt).toBeUndefined();
    const withheld = effect.infirmaries.shifts.find(({id}) => id === primary.id)!;
    expect(withheld.lastWithheld).toEqual({tick:effect.tick,duty:'observatory'});
    expect(withheld.lastServedTick).toBeUndefined();
    const next = turn(effect,{[patientId]:clinic('accept',waiting.id)},reverse);
    expect(next.infirmaries.cases.find(({id}) => id === waiting.id)?.receipt).toMatchObject({guardId:primaryId,shiftId:primary.id});
  });

  it.each([false,true])('uses the independent signed backup only on exact explicit consent (reversed = %s)', reverse => {
    const {ready,sectId,siteId,primaryId,backupId,patientId,primary,backup,waiting,measure} = enrolledObservatory(true);
    const expected = {guardId:backupId,shiftId:backup!.id,stonesSpent:12,herbsSpent:2,
      handoff:{fromShiftId:primary.id,duty:'observatory'}};
    const options = availableInfirmaryActions(person(ready,patientId),ready,ready.tick+1);
    expect(options.some(option => option.infirmaryMove === 'accept')).toBe(false);
    expect(options).toContainEqual({action:'INFIRMARY',infirmaryMove:'accept_handoff',targetInfirmaryCaseId:waiting.id});
    const wrong = turn(ready,{[primaryId]:measure,[patientId]:clinic('accept',waiting.id)},reverse);
    const paid = turn(ready,{[primaryId]:measure,[patientId]:clinic('accept_handoff',waiting.id)},reverse);
    expect(wrong.infirmaries.cases.find(({id}) => id === waiting.id)?.receipt).toBeUndefined();
    expect(paid.fieldObservatories.byActor[primaryId].runs[0].status).toBe('measured');
    expect(paid.infirmaries.cases.find(({id}) => id === waiting.id)?.receipt).toMatchObject(expected);
    expect(paid.infirmaries.shifts.find(({id}) => id === backup!.id)?.lastServedTick).toBe(paid.tick);
    expect(paid.infirmaries.shifts.find(({id}) => id === primary.id)?.lastServedTick).toBeUndefined();
    expect(wrong.sects.find(({id}) => id===sectId)!.spiritStones - paid.sects.find(({id}) => id===sectId)!.spiritStones).toBe(12);
    expect(wrong.locations.find(({id}) => id===siteId)!.herbs.jade_leaf - paid.locations.find(({id}) => id===siteId)!.herbs.jade_leaf).toBe(2);
    expect(apply(paid,patientId,clinic('accept_handoff',waiting.id))).toBeNull();
  });

  it('does not take an unsigned same-turn substitute or honor the old handoff after the conflict clears', () => {
    const {ready,primaryId,backupId,patientId,waiting,measure} = enrolledObservatory(false);
    const justSigned = turn(ready,{[primaryId]:measure,[backupId]:clinic('staff'),
      [patientId]:clinic('accept_handoff',waiting.id)});
    expect(justSigned.infirmaries.shifts.find(({guardId}) => guardId === backupId)?.startedTick).toBe(justSigned.tick);
    expect(justSigned.infirmaries.cases[0].receipt).toBeUndefined();
    const continuing = person(justSigned,patientId);
    const legal = availableInfirmaryActions(continuing,justSigned,justSigned.tick+1);
    expect(legal.some(option => option.infirmaryMove === 'accept_handoff')).toBe(false);
    expect(legal).toContainEqual({action:'INFIRMARY',infirmaryMove:'accept',targetInfirmaryCaseId:waiting.id});
    const stale = turn(justSigned,{[patientId]:clinic('accept_handoff',waiting.id)});
    expect(stale.infirmaries.cases[0].receipt).toBeUndefined();
  });

  it.each(['absent','unhealthy'] as const)('never substitutes a signed but %s backup', condition => {
    const {ready,primaryId,backupId,patientId,waiting,measure} = enrolledObservatory(true);
    const replacement = person(ready,backupId);
    if (condition === 'absent') replacement.locationId = 'loc-market';
    else replacement.hp = Math.round(replacement.maxHp * .6);
    const after = turn(ready,{[primaryId]:measure,[patientId]:clinic('accept_handoff',waiting.id)});
    expect(after.fieldObservatories.byActor[primaryId].runs[0].status).toBe('measured');
    expect(after.infirmaries.cases.find(({id}) => id === waiting.id)).toMatchObject({status:'waiting'});
    expect(after.infirmaries.cases.find(({id}) => id === waiting.id)?.receipt).toBeUndefined();
    expect(after.infirmaries.shifts.every(({lastServedTick}) => lastServedTick === undefined)).toBe(true);
  });

  it.each([false,true])('does not displace actual agreed group tuition (reversed = %s)', reverse => {
    const {world,siteId,primaryId,backupId,patientId,mentorId} = fixture();
    const mentor = person(world,mentorId);
    mentor.realm = '元婴'; mentor.techniqueMastery = 91;
    expect(authorTechnique(mentor,world)).not.toBeNull();
    gainMastery(mentor,36);
    for (const id of [primaryId,backupId]) {
      const pupil = person(world,id);
      pupil.techniqueMastery = 12;
      expect(apply(world,mentorId,{chosenAction:'TEACH',targetCultivatorId:id,innerMonologue:''})).not.toBeNull();
    }
    const tuition = Object.fromEntries(world.mentorship.offers.map(row => [row.studentId,{
      chosenAction:'ACCEPT_TUITION',targetTuitionId:row.id,innerMonologue:'',
    } satisfies LLMDecisionPayload]));
    const taught = turn(world,tuition);
    expect(taught.mentorship.lineage.filter(row => row.mentorId === mentorId)).toHaveLength(2);
    const opened = turn(taught,{[mentorId]:{chosenAction:'APPRENTICE_COHORT',cohortMove:'offer',
      cohortInviteeIds:[primaryId,backupId].sort(),targetTechniqueId:mentor.technique.id,innerMonologue:''}});
    const cohort = opened.apprenticeCohorts.cohorts[0];
    expect(cohort.siteId).toBe(siteId);
    const pupil = person(opened,primaryId);
    const waiting = person(opened,patientId);
    waiting.hp = Math.round(waiting.maxHp * .24);
    // The charge was signed at opening, before accepting the cohort next turn.
    expect(apply(opened,pupil.id,clinic('staff'))).not.toBeNull();
    const ready = turn(opened,{[primaryId]:lesson('accept',cohort.id),[backupId]:lesson('accept',cohort.id),[patientId]:clinic('request')});
    const caseId = ready.infirmaries.cases[0].id;
    const actual = turn(ready,{[mentorId]:lesson('teach',cohort.id),[primaryId]:lesson('attend',cohort.id),
      [backupId]:lesson('attend',cohort.id),[patientId]:clinic('accept',caseId)},reverse);
    expect(actual.apprenticeCohorts.cohorts[0]).toMatchObject({status:'held',instructionSpent:1});
    expect(actual.apprenticeCohorts.cohorts[0].seats.map(row => row.status)).toEqual(['attended','attended']);
    expect(actual.infirmaries.cases[0]).toMatchObject({status:'waiting'});
    expect(actual.infirmaries.cases[0].receipt).toBeUndefined();
    expect(actual.infirmaries.shifts[0].lastWithheld).toEqual({tick:actual.tick,duty:'cohort'});
  });
});
