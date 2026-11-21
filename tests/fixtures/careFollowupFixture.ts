import {createInitialWorld} from '../../src/data/initialWorld';
import {resolveCareFollowupAction} from '../../src/engine/careFollowupEngine';
import {resolveInfirmaryAction} from '../../src/engine/infirmaryEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {CareFollowupMove,LLMDecisionPayload,WorldState} from '../../src/types/world';

export const carePerson=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const careSect=(world:WorldState,id:string)=>world.sects.find(row=>row.id===id)!;
export const careSite=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id)!;
export const carePayload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'按实际出诊、到场与耗材办理静养。',...fields});
export const careChoice=(careFollowupMove:CareFollowupMove,id:string)=>carePayload('CARE_FOLLOWUP',
  careFollowupMove==='schedule'?{careFollowupMove,targetInfirmaryCaseId:id}:{careFollowupMove,targetCareFollowupId:id});
export const careTurn=(world:WorldState,actions:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(({id})=>[id,actions[id]??carePayload('REST')])),()=>.99);

export function dischargedCareFollowup(){
  const world=createInitialWorld(90142);
  world.tick=10;world.month=5;
  const sect=world.sects[2];
  const site=careSite(world,sect.headquartersId);
  const [sourceGuard,patient,otherGuard]=world.cultivators.filter(row=>row.sectId===sect.id&&row.id!==sect.leaderId);
  const [acute,outsider]=world.cultivators.filter(row=>row.sectId!==sect.id&&
    !world.sects.some(other=>other.leaderId===row.id));
  acute.sectId=sect.id;acute.sectRank='外门弟子';
  sect.facilities.alchemy_hall=1;sect.spiritStones=240;site.herbs.jade_leaf=8;
  for(const actor of [sourceGuard,patient,otherGuard,acute,outsider]){
    actor.locationId=site.id;actor.hp=200;actor.maxHp=200;actor.pillToxicity=0;
    actor.age=30;actor.lifespan=120;actor.tribulation=undefined;actor.guardAssignment=undefined;
  }
  patient.hp=50;patient.pillToxicity=19;
  if(!resolveInfirmaryAction(world,sourceGuard,carePayload('INFIRMARY',{infirmaryMove:'staff'})))throw Error('fixture source staffing');
  if(!resolveInfirmaryAction(world,patient,carePayload('INFIRMARY',{infirmaryMove:'request'})))throw Error('fixture source actual request');
  const sourceCaseId=world.infirmaries.cases[0].id;
  const sourceShiftId=world.infirmaries.shifts[0].id;
  world.tick++;
  if(!resolveInfirmaryAction(world,patient,carePayload('INFIRMARY',{infirmaryMove:'accept',targetInfirmaryCaseId:sourceCaseId})))
    throw Error('fixture native discharge');
  return {world,sectId:sect.id,siteId:site.id,patientId:patient.id,sourceGuardId:sourceGuard.id,guardId:otherGuard.id,
    outsiderId:outsider.id,acuteId:acute.id,sourceCaseId,sourceShiftId};
}
export function scheduledCareFollowup(){
  const f=dischargedCareFollowup(),patient=carePerson(f.world,f.patientId);
  f.world.tick++;
  if(!resolveCareFollowupAction(f.world,patient,careChoice('schedule',f.sourceCaseId)))throw Error('fixture schedule');
  return {...f,id:f.world.careFollowups.appointments[0].id};
}
export function supportedCareFollowup(useOriginal=false){
  const f=scheduledCareFollowup();
  f.world.tick++;
  const serving=carePerson(f.world,useOriginal?f.sourceGuardId:f.guardId);
  if(!resolveInfirmaryAction(f.world,serving,carePayload('INFIRMARY',{infirmaryMove:'staff'})))throw Error('fixture later actual staffing');
  return {...f,shiftId:f.world.infirmaries.shifts.at(-1)!.id};
}
export function attendedCareFollowup(){
  const f=supportedCareFollowup();
  const world=careTurn(f.world,{[f.patientId]:careChoice('attend',f.id)});
  if(!world.careFollowups.appointments[0].receipt)throw Error('fixture true later attendance');
  return {...f,world};
}
