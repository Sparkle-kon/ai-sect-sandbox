import {describe,expect,it} from 'vitest';
import {advanceCareFollowups,availableCareFollowupActions,projectCareFollowups,projectLocalCareFollowupCapacity,
  resolveCareFollowupAction,shouldVolunteerCareFollowup} from '../src/engine/careFollowupEngine';
import {resolveInfirmaryAction} from '../src/engine/infirmaryEngine';
import {careChoice,carePayload,carePerson,careSect,careSite,careTurn,dischargedCareFollowup,scheduledCareFollowup,supportedCareFollowup}
  from './fixtures/careFollowupFixture';
import type {WorldState} from '../src/types/world';

const appointment=(world:WorldState)=>world.careFollowups.appointments[0];
const paidRows=(world:WorldState)=>world.resourceFlow.months.flatMap(month=>month.entries).filter(row=>row.mechanism==='care_followup');
const ordinary=(world:WorldState,id:string)=>world.infirmaries.cases.find(row=>row.id===id)!;

describe('actual later clinic session rather than duplicate discharge',()=>{
  it('requires exactly the former patient and actually paid completed source; scheduling changes no health, inventory, staff or original discharge',()=>{
    const f=dischargedCareFollowup(),{world}=f,patient=carePerson(world,f.patientId);
    const base=structuredClone({source:ordinary(world,f.sourceCaseId),hp:patient.hp,pills:patient.pillToxicity,
      stock:careSite(world,f.siteId).herbs,treasury:careSect(world,f.sectId).spiritStones,shifts:world.infirmaries.shifts});
    expect(resolveCareFollowupAction(world,patient,careChoice('schedule',f.sourceCaseId))).toBeNull();
    world.tick++;
    expect(resolveCareFollowupAction(world,carePerson(world,f.sourceGuardId),careChoice('schedule',f.sourceCaseId))).toBeNull();
    const phantom=structuredClone(world);
    const row=ordinary(phantom,f.sourceCaseId);
    row.status='waiting';
    delete row.receipt;
    expect(resolveCareFollowupAction(phantom,carePerson(phantom,f.patientId),careChoice('schedule',f.sourceCaseId))).toBeNull();
    expect(resolveCareFollowupAction(world,patient,careChoice('schedule',f.sourceCaseId))?.actorIds).toEqual([f.patientId]);
    expect(appointment(world)).toMatchObject({sourceCaseId:f.sourceCaseId,dischargedTick:world.tick-1,dueTick:world.tick+2,expiresTick:world.tick+4});
    expect({source:ordinary(world,f.sourceCaseId),hp:patient.hp,pills:patient.pillToxicity,stock:careSite(world,f.siteId).herbs,
      treasury:careSect(world,f.sectId).spiritStones,shifts:world.infirmaries.shifts}).toEqual(base);
    expect(paidRows(world)).toEqual([]);
  });

  it('uses an independently signed distinct real present guard, and consumes only actual local public supplies once after explicit consent',()=>{
    const f=supportedCareFollowup(),{world}=f;
    const patient=carePerson(world,f.patientId),site=careSite(world,f.siteId),treasury=careSect(world,f.sectId);
    expect(resolveCareFollowupAction(world,patient,careChoice('attend',f.id))).toBeNull();
    world.tick++;
    const hp=patient.hp,toxins=patient.pillToxicity,stones=treasury.spiritStones,leaf=site.herbs.jade_leaf,personal=patient.spiritStones;
    const source=structuredClone(ordinary(world,f.sourceCaseId));
    expect(projectLocalCareFollowupCapacity(world,patient)).toEqual({siteId:f.siteId,beds:1,available:1});
    expect(resolveCareFollowupAction(world,carePerson(world,f.guardId),careChoice('attend',f.id))).toBeNull();
    const event=resolveCareFollowupAction(world,patient,careChoice('attend',f.id));
    expect(event?.actorIds).toEqual([f.patientId,f.guardId]);
    expect(event?.witnessScope).toBe('participants');
    expect(resolveCareFollowupAction(world,patient,careChoice('attend',f.id))).toBeNull();
    expect(appointment(world)).toMatchObject({status:'attended',settledTick:world.tick,receipt:{
      tick:world.tick,shiftId:f.shiftId,guardId:f.guardId,stonesSpent:6,herbsSpent:1,hpRestored:40,toxicityRemoved:4}});
    expect(patient.hp).toBe(hp+40);
    expect(patient.pillToxicity).toBe(toxins-4);
    expect(patient.spiritStones).toBe(personal);
    expect(treasury.spiritStones).toBe(stones-6);
    expect(site.herbs.jade_leaf).toBe(leaf-1);
    expect(ordinary(world,f.sourceCaseId)).toEqual(source);
    expect(world.infirmaries.cases).toHaveLength(1);
    expect(paidRows(world).map(row=>[row.good,row.amount])).toEqual([['stone',6],['jade_leaf',1]]);
    expect(projectCareFollowups(world,carePerson(world,f.guardId))).toHaveLength(1);
    expect(projectCareFollowups(world,carePerson(world,f.sourceGuardId))).toEqual([]);
    expect(projectCareFollowups(world,carePerson(world,f.outsiderId))).toEqual([]);
    expect(JSON.stringify(projectCareFollowups(world,patient))).not.toContain(f.guardId);
  });

  it('defers the first unsupported appointment; exact original guard is not a new independent visit',()=>{
    const f=supportedCareFollowup(true),{world}=f,patient=carePerson(world,f.patientId);
    const supplies=careSite(world,f.siteId).herbs.jade_leaf,stones=careSect(world,f.sectId).spiritStones;
    world.tick++;
    expect(resolveCareFollowupAction(world,patient,careChoice('attend',f.id))).toBeNull();
    expect(advanceCareFollowups(world)).toEqual([]);
    expect(appointment(world).status).toBe('scheduled');
    world.tick++;
    expect(advanceCareFollowups(world)).toHaveLength(1);
    expect(appointment(world)).toMatchObject({status:'closed',closure:'staff_unavailable',settledTick:world.tick});
    expect(advanceCareFollowups(world)).toEqual([]);
    expect(careSect(world,f.sectId).spiritStones).toBe(stones);
    expect(careSite(world,f.siteId).herbs.jade_leaf).toBe(supplies);
    expect(paidRows(world)).toEqual([]);
  });

  it('turns a genuinely deferred first date into one real final-date appointment only after prior independent signing',()=>{
    const f=scheduledCareFollowup(),{world}=f,patient=carePerson(world,f.patientId);
    world.tick=appointment(world).dueTick;
    expect(resolveCareFollowupAction(world,patient,careChoice('attend',f.id))).toBeNull();
    const guard=carePerson(world,f.guardId);
    expect(resolveInfirmaryAction(world,guard,carePayload('INFIRMARY',{infirmaryMove:'staff'}))).not.toBeNull();
    expect(resolveCareFollowupAction(world,patient,careChoice('attend',f.id))).toBeNull();
    expect(advanceCareFollowups(world)).toEqual([]);
    world.tick++;
    expect(resolveCareFollowupAction(world,patient,careChoice('attend',f.id))).not.toBeNull();
    expect(appointment(world)).toMatchObject({status:'attended',settledTick:world.tick,receipt:{guardId:guard.id,tick:world.tick}});
    expect(advanceCareFollowups(world)).toEqual([]);
    expect(paidRows(world)).toHaveLength(2);
  });

  it('suggests a real volunteer only before a supported date and only for a distinct available native staff actor',()=>{
    const f=scheduledCareFollowup();
    const volunteer=carePerson(f.world,f.guardId);
    const original=carePerson(f.world,f.sourceGuardId);
    const patient=carePerson(f.world,f.patientId);
    expect(shouldVolunteerCareFollowup(f.world,volunteer)).toBe(false); // The original shift still holds capacity today.
    expect(shouldVolunteerCareFollowup(f.world,volunteer,f.world.tick+1)).toBe(true);
    f.world.tick++;
    expect(shouldVolunteerCareFollowup(f.world,volunteer)).toBe(true);
    expect(shouldVolunteerCareFollowup(f.world,original)).toBe(false);
    expect(shouldVolunteerCareFollowup(f.world,patient)).toBe(false);
    expect(shouldVolunteerCareFollowup(f.world,carePerson(f.world,f.outsiderId))).toBe(false);
    careSite(f.world,f.siteId).herbs.jade_leaf=0;
    expect(shouldVolunteerCareFollowup(f.world,volunteer)).toBe(false);
    const staffed=supportedCareFollowup();
    expect(shouldVolunteerCareFollowup(staffed.world,carePerson(staffed.world,staffed.acuteId))).toBe(false);
  });

  it('gives real existing acute queue first right before optional follow-up in either actor-system execution order',()=>{
    const f=supportedCareFollowup(),{world}=f,acute=carePerson(world,f.acuteId);
    acute.hp=40;
    expect(resolveInfirmaryAction(world,acute,carePayload('INFIRMARY',{infirmaryMove:'request'}))).not.toBeNull();
    const acuteId=world.infirmaries.cases.at(-1)!.id;
    const choices={[f.patientId]:careChoice('attend',f.id),[f.acuteId]:carePayload('INFIRMARY',{infirmaryMove:'accept',
      targetInfirmaryCaseId:acuteId})};
    const reverse=structuredClone(world);
    reverse.cultivators.reverse();
    for(const input of [world,reverse]){
      const next=careTurn(input,choices);
      expect(ordinary(next,acuteId).status).toBe('treated');
      expect(appointment(next).status).toBe('scheduled');
      expect(paidRows(next)).toEqual([]);
    }
  });

  it('closes when travel, replenishment, or actual need is unproved; neither a no-show nor withdrawal is a second fee or discharge',()=>{
    for(const expected of ['patient_absent','no_need','supplies_unavailable','not_confirmed'] as const){
      const f=supportedCareFollowup(),{world}=f,patient=carePerson(world,f.patientId);
      world.tick+=2;
      if(expected==='patient_absent')patient.locationId='loc-market';
      if(expected==='no_need'){patient.hp=patient.maxHp;patient.pillToxicity=0;}
      if(expected==='supplies_unavailable')careSite(world,f.siteId).herbs.jade_leaf=0;
      if(expected!=='not_confirmed')expect(availableCareFollowupActions(patient,world).some(row=>row.careFollowupMove==='attend')).toBe(false);
      advanceCareFollowups(world);
      expect(appointment(world)).toMatchObject({status:'closed',closure:expected,settledTick:world.tick});
      expect(appointment(world).receipt).toBeUndefined();
      expect(world.infirmaries.cases).toHaveLength(1);
      expect(paidRows(world)).toEqual([]);
    }
    const withdrawn=scheduledCareFollowup();
    withdrawn.world.tick++;
    expect(resolveCareFollowupAction(withdrawn.world,carePerson(withdrawn.world,withdrawn.patientId),careChoice('withdraw',withdrawn.id))).not.toBeNull();
    expect(appointment(withdrawn.world)).toMatchObject({status:'withdrawn',settledTick:withdrawn.world.tick});
    expect(resolveCareFollowupAction(withdrawn.world,carePerson(withdrawn.world,withdrawn.patientId),careChoice('schedule',withdrawn.sourceCaseId))).toBeNull();
    expect(paidRows(withdrawn.world)).toEqual([]);
  });
});
