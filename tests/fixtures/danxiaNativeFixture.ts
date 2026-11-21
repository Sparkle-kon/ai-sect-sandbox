import {createInitialWorld} from '../../src/data/initialWorld';
import {availableSettlementActions} from '../../src/engine/settlementEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../../src/types/world';

export const DANXIA_FIXTURE={seed:2031,frostTick:108,siteId:'loc-danxia',sectId:'sect-danxia',villageSiteId:'loc-market',
  recruiterId:'npc-5',discipleId:'npc-6',staffId:'elder-danxia-1',followupStaffId:'elder-danxia-2',
  volunteerId:'village-loc-market-vol-1'} as const;

export const danxiaActor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const danxiaSite=(world:WorldState)=>world.locations.find(row=>row.id===DANXIA_FIXTURE.siteId)!;
export const danxiaPayload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'依实际乡籍、实耗与日期办理。',...fields});
export function danxiaTurn(world:WorldState,choices:Record<string,LLMDecisionPayload>={}):WorldState {
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,choices[actor.id]??danxiaPayload('REST')])),()=>.99);
}
function assert(condition:unknown,why:string):asserts condition { if(!condition)throw Error(why); }

/** Preconditions (injury, controlled endemic stock, starting loc of seeded recruiter)
 * are fixture inputs; recruitment, travel, paid treatment, schedule and staffed
 * shift all go through normal monthly execution for both compared branches. */
export function preparedDanxiaAppointment(initialReserve=1){
  const f=DANXIA_FIXTURE;
  let world=createInitialWorld(f.seed,'classic');
  while(world.tick<28)world=danxiaTurn(world);
  world=danxiaTurn(world,{[f.recruiterId]:danxiaPayload('EXPLORE',{targetLocationId:f.villageSiteId})});
  assert(danxiaActor(world,f.recruiterId).locationId===f.villageSiteId,'actual recruiter travel');
  const village=world.settlements.villages.find(row=>row.locationId===f.villageSiteId)!;
  const available=availableSettlementActions(danxiaActor(world,f.recruiterId),world).find(row=>row.action==='RECRUIT_SETTLER'&&
    row.targetSettlementId===village.id&&row.targetVolunteerId===f.volunteerId);
  assert(available,'real exact consenting adult candidate');
  world=danxiaTurn(world,{[f.recruiterId]:danxiaPayload('RECRUIT_SETTLER',{targetSettlementId:village.id,targetVolunteerId:f.volunteerId})});
  const patientId=`recruit-${f.volunteerId}`;
  assert(danxiaActor(world,patientId)?.sectId===f.sectId,'native willing adult recruited into Danxia');
  world=danxiaTurn(world,{[patientId]:danxiaPayload('EXPLORE',{targetLocationId:f.siteId})});
  assert(danxiaActor(world,patientId).locationId===f.siteId,'real patient took exact known route to clinic');
  while(world.tick<f.frostTick-5)world=danxiaTurn(world);
  const patient=danxiaActor(world,patientId);
  // Standard fixture baseline injury and finite clinic stock (distinct from civic effect).
  patient.hp=18;patient.pillToxicity=36;
  danxiaSite(world).herbs.jade_leaf=initialReserve;
  world=danxiaTurn(world,{[f.staffId]:danxiaPayload('INFIRMARY',{infirmaryMove:'staff'}),
    [patientId]:danxiaPayload('INFIRMARY',{infirmaryMove:'request'})});
  assert(world.tick===f.frostTick-4,'exact native staff/request tick');
  const source=world.infirmaries.cases.find(row=>row.patientId===patientId);
  assert(source?.status==='waiting','actual care request');
  world=danxiaTurn(world,{[patientId]:danxiaPayload('INFIRMARY',{infirmaryMove:'accept',targetInfirmaryCaseId:source.id})});
  const treated=world.infirmaries.cases.find(row=>row.id===source.id);
  assert(treated?.status==='treated'&&treated.receipt?.tick===f.frostTick-3&&treated.receipt.herbsSpent===2,'actual consent, treatment, paid jade leaves before the frost');
  world=danxiaTurn(world,{[patientId]:danxiaPayload('CARE_FOLLOWUP',{careFollowupMove:'schedule',targetInfirmaryCaseId:source.id})});
  const scheduled=world.careFollowups.appointments.find(row=>row.patientId===patientId);
  assert(scheduled?.status==='scheduled'&&scheduled.dueTick===f.frostTick,'actual follow-up scheduled two ticks prior');
  world=danxiaTurn(world,{[f.followupStaffId]:danxiaPayload('INFIRMARY',{infirmaryMove:'staff'}),
    [f.discipleId]:danxiaPayload('EXPLORE',{targetLocationId:f.siteId}), [patientId]:danxiaPayload('CULTIVATE')});
  assert(world.infirmaries.shifts.some(shift=>shift.guardId===f.followupStaffId&&shift.startedTick===f.frostTick-1&&shift.siteId===f.siteId),
    'independent actual prior-turn signup');
  assert(danxiaActor(world,f.discipleId).locationId===f.siteId&&['内门弟子','真传弟子'].includes(danxiaActor(world,f.discipleId).sectRank),'actual distinct Danxia named inner disciple');
  return {world,patientId,sourceCaseId:source.id,appointmentId:scheduled.id,villageId:village.id};
}
