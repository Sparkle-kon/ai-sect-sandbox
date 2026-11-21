import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  availableInfirmaryActions, beginClinicDutyTurn, infirmaryCapacity, resolveInfirmaryAction, visibleInfirmaries,
} from '../src/engine/infirmaryEngine';
import { resolveObservatoryAction } from '../src/engine/fieldObservatoryEngine';
import { advanceApprenticeCohorts, resolveApprenticeCohortAction } from '../src/engine/apprenticeCohortEngine';
import { registerScriptureOriginal } from '../src/engine/scriptureEngine';
import type { Cultivator, InfirmaryMove, LLMDecisionPayload } from '../src/types/world';

function fixture() {
  const world=createInitialWorld(1810);
  world.tick=20;
  const sect=world.sects[0];
  const site=world.locations.find(place=>place.id===sect.headquartersId)!;
  sect.facilities.alchemy_hall=2;
  sect.spiritStones=120;
  site.herbs.jade_leaf=16;
  const [primary,alternate,patient,secondary,other]=world.cultivators.filter(actor=>actor.id!==sect.leaderId).slice(0,5)
    .sort((a,b)=>a.id<b.id?-1:1);
  for(const actor of [primary,alternate,patient,secondary,other]) {
    actor.sectId=sect.id;
    actor.locationId=site.id;
    actor.hp=actor.maxHp;
    actor.spiritStones=150;
    actor.pillToxicity=0;
  }
  patient.hp=Math.round(patient.maxHp*.25); patient.pillToxicity=14;
  secondary.hp=Math.round(secondary.maxHp*.4);
  const clinic=(actor:Cultivator,infirmaryMove:InfirmaryMove,targetInfirmaryCaseId?:string,extra:Partial<LLMDecisionPayload>={}) =>
    resolveInfirmaryAction(world,actor,{chosenAction:'INFIRMARY',innerMonologue:'仅按已核实排班',infirmaryMove,targetInfirmaryCaseId,...extra});
  const observatory=(actor:Cultivator,observatoryMove:'fund'|'measure',targetObservatoryTick?:number) =>
    resolveObservatoryAction(world,actor,{chosenAction:'FIELD_OBSERVATORY',innerMonologue:'按原封存期限测量',
      observatoryMove,targetLocationId:site.id,targetObservatoryTick});
  const wallet=()=>[sect.spiritStones,site.herbs.jade_leaf,patient.hp,patient.pillToxicity,secondary.hp];
  const register=(withReplacement=true,withSecondPatient=false)=>{
    expect(clinic(primary,'staff')).not.toBeNull();
    if(withReplacement) expect(clinic(alternate,'staff')).not.toBeNull();
    expect(clinic(patient,'request')).not.toBeNull();
    if(withSecondPatient) expect(clinic(secondary,'request')).not.toBeNull();
    return {first:world.infirmaries.cases[0],second:world.infirmaries.cases[1],original:world.infirmaries.shifts[0],
      backup:world.infirmaries.shifts[1]};
  };
  return {world,sect,site,primary,alternate,patient,secondary,other,clinic,observatory,wallet,register};
}

describe('real staffed priority and patient-authorized clinic handoff',()=>{
  it('preview is read-only, freezes actual priority, and a later exact accepted handoff pays once',()=>{
    const {world,sect,site,primary,alternate,patient,other,clinic,observatory,wallet,register}=fixture();
    const started=world.tick;
    expect(observatory(primary,'fund')?.title).toContain('出资布设');
    ++world.tick;
    const {first,original,backup}=register();
    const before=wallet();
    expect(availableInfirmaryActions(patient,world,world.tick+1)).toContainEqual({
      action:'INFIRMARY',infirmaryMove:'accept_handoff',targetInfirmaryCaseId:first.id});
    expect(original.lastWithheld).toBeUndefined();
    expect(availableInfirmaryActions(patient,world,world.tick+2)).toEqual([]);
    ++world.tick;
    beginClinicDutyTurn(world);
    expect(original.lastWithheld).toEqual({tick:world.tick,duty:'observatory'});
    expect(visibleInfirmaries(world,patient)?.ownDutyDisposition).toBe('handoff_available');
    expect(visibleInfirmaries(world,other)?.ownDutyDisposition).toBeUndefined();
    expect(clinic(patient,'accept',first.id)).toBeNull();
    expect(clinic(other,'accept_handoff',first.id)).toBeNull();
    expect(clinic(patient,'accept_handoff',first.id,{targetCultivatorId:alternate.id})).toBeNull();
    expect(wallet()).toEqual(before);
    expect(observatory(primary,'measure',started)?.title).toContain('实际读数');
    expect(clinic(patient,'accept_handoff',first.id)?.title).toBe('本人明确接受替班护诊');
    expect(first.receipt).toMatchObject({guardId:alternate.id,shiftId:backup.id,tick:world.tick,
      handoff:{fromShiftId:original.id,duty:'observatory'}});
    expect(original.lastServedTick).toBeUndefined();
    expect(backup.lastServedTick).toBe(world.tick);
    expect(sect.spiritStones).toBe(before[0]-12);
    expect(site.herbs.jade_leaf).toBe(before[1]-2);
    expect(patient.hp).toBeGreaterThan(before[2]);
    expect(clinic(patient,'accept_handoff',first.id)).toBeNull();
    const own=visibleInfirmaries(world,patient)?.ownCases[0].receipt;
    if(own?.handoff) own.handoff.duty='cohort';
    expect(first.receipt?.handoff?.duty).toBe('observatory');
  });

  it('withholds without an actual alternate and does not silently backfill when the agreed alternate moves',()=>{
    const single=fixture();
    expect(single.observatory(single.primary,'fund')).not.toBeNull();
    ++single.world.tick;
    const {first,original}=single.register(false);
    ++single.world.tick;
    beginClinicDutyTurn(single.world);
    const before=single.wallet();
    expect(infirmaryCapacity(single.world,single.sect.id).available).toBe(0);
    expect(visibleInfirmaries(single.world,single.patient)?.ownDutyDisposition).toBe('waiting_conflict');
    expect(single.clinic(single.patient,'accept_handoff',first.id)).toBeNull();
    expect(single.clinic(single.patient,'accept',first.id)).toBeNull();
    expect(single.wallet()).toEqual(before);
    expect(original.lastWithheld?.duty).toBe('observatory');

    const pair=fixture();
    expect(pair.observatory(pair.primary,'fund')).not.toBeNull();
    ++pair.world.tick;
    const queued=pair.register(true,true);
    ++pair.world.tick;
    beginClinicDutyTurn(pair.world);
    expect(pair.clinic(pair.secondary,'accept',queued.second.id)).toBeNull();
    const untouched=pair.wallet();
    pair.alternate.locationId=pair.world.locations.find(site=>site.id!==pair.site.id)!.id;
    beginClinicDutyTurn(pair.world); // Cannot reopen and produce a late substitute.
    expect(pair.clinic(pair.patient,'accept_handoff',queued.first.id)).toBeNull();
    expect(pair.clinic(pair.patient,'accept',queued.first.id)).toBeNull();
    expect(pair.wallet()).toEqual(untouched);
  });

  it('allocates to sorted primary commitments, not request order, and requires an exact prior cohort',()=>{
    const {world,primary,alternate,patient,other,site,clinic,register}=fixture();
    const technique={id:'duty-shared-original',name:'排课原本',spiritRoot:'水' as const};
    expect(registerScriptureOriginal(world,technique,'pavilion',site.id,primary.sectId)).toBe(true);
    for(const actor of [primary,patient,other]) {
      actor.technique={...technique};
      actor.techniqueMastery=actor===primary?80:38;
    }
    for(const trainee of [patient,other]) world.mentorship.lineage.push({mentorId:primary.id,
      studentId:trainee.id,technique:{...technique},formedTick:10,lastLessonTick:10,lessons:1,flaw:0});
    expect(resolveApprenticeCohortAction(world,primary,{chosenAction:'APPRENTICE_COHORT',innerMonologue:'',
      cohortMove:'offer',cohortInviteeIds:[patient.id,other.id].sort(),targetTechniqueId:technique.id})).not.toBeNull();
    const cohort=world.apprenticeCohorts.cohorts[0];
    ++world.tick;
    const {first,original}=register();
    expect(resolveApprenticeCohortAction(world,other,{chosenAction:'APPRENTICE_COHORT',innerMonologue:'',
      cohortMove:'accept',targetCohortId:cohort.id})).not.toBeNull();
    ++world.tick;
    beginClinicDutyTurn(world);
    expect(original.lastWithheld).toEqual({tick:world.tick,duty:'cohort'});
    expect(clinic(patient,'accept_handoff',first.id)).not.toBeNull();
    expect(first.receipt).toMatchObject({guardId:alternate.id,handoff:{fromShiftId:original.id,duty:'cohort'}});
    for (const [actor,move] of [[primary,'teach'],[other,'attend']] as const) {
      expect(resolveApprenticeCohortAction(world,actor,{chosenAction:'APPRENTICE_COHORT',innerMonologue:'',
        cohortMove:move,targetCohortId:cohort.id})).not.toBeNull();
    }
    expect(advanceApprenticeCohorts(world)).toHaveLength(2);
    expect(original.lastServedTick).toBeUndefined();
  });
  it('gives a signed apprentice’s same-site prepaid exact reading priority over credit in a genuine cohort',()=>{
    const {world,primary,alternate,other,site,observatory}=fixture();
    const original={id:'cohort-and-weather',name:'清气校本',spiritRoot:'金' as const};
    expect(registerScriptureOriginal(world,original,'pavilion',site.id,primary.sectId)).toBe(true);
    for (const actor of [primary,alternate,other]) {
      actor.technique={...original};
      actor.techniqueMastery=actor===primary?80:37;
    }
    for (const actor of [alternate,other]) world.mentorship.lineage.push({mentorId:primary.id,studentId:actor.id,
      technique:{...original},formedTick:10,lastLessonTick:10,lessons:1,flaw:0});
    const openedTick=world.tick;
    expect(observatory(alternate,'fund')).not.toBeNull();
    expect(resolveApprenticeCohortAction(world,primary,{chosenAction:'APPRENTICE_COHORT',innerMonologue:'',
      cohortMove:'offer',cohortInviteeIds:[alternate.id,other.id].sort(),targetTechniqueId:original.id})).not.toBeNull();
    const cohort=world.apprenticeCohorts.cohorts[0];
    const doCohort=(actor:Cultivator,cohortMove:'accept'|'teach'|'attend') =>
      resolveApprenticeCohortAction(world,actor,{chosenAction:'APPRENTICE_COHORT',innerMonologue:'',
        cohortMove,targetCohortId:cohort.id});
    ++world.tick;
    expect(doCohort(alternate,'accept')).not.toBeNull();
    expect(doCohort(other,'accept')).not.toBeNull();
    ++world.tick;
    expect(doCohort(alternate,'attend')).toBeNull();
    expect(observatory(alternate,'measure',openedTick)).not.toBeNull();
    expect(doCohort(alternate,'attend')).toBeNull();
    expect(doCohort(primary,'teach')).not.toBeNull();
    expect(doCohort(other,'attend')).not.toBeNull();
    expect(advanceApprenticeCohorts(world)).toHaveLength(2);
    expect(alternate.techniqueMastery).toBe(37);
    expect(other.techniqueMastery).toBe(38);
    expect(cohort.seats.find(seat=>seat.studentId===alternate.id)).toMatchObject({status:'missed'});
    expect(cohort.seats.find(seat=>seat.studentId===other.id)).toMatchObject({status:'attended',masteryGained:1});
  });
  it('keeps the unconflicted triage dynamic after ordinary refusal even after a real turn begins',()=>{
    const {world,primary,patient,secondary,clinic,register}=fixture();
    const {first,second,original}=register(false,true);
    ++world.tick;
    beginClinicDutyTurn(world);
    expect(clinic(secondary,'accept',second.id)).toBeNull();
    expect(clinic(patient,'refuse',first.id)).not.toBeNull();
    expect(clinic(secondary,'accept_handoff',second.id)).toBeNull();
    expect(clinic(secondary,'accept',second.id)).not.toBeNull();
    expect(second.receipt).toMatchObject({guardId:primary.id});
    expect(second.receipt?.handoff).toBeUndefined();
    expect(original.lastWithheld).toBeUndefined();
  });
});
