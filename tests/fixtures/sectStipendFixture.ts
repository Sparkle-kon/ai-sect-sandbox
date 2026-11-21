import { createInitialWorld } from '../../src/data/initialWorld';
import { resolveInfirmaryAction } from '../../src/engine/infirmaryEngine';
import { resolveSectStipendAction } from '../../src/engine/sectStipendEngine';
import { resolveServiceRetirementAction } from '../../src/engine/serviceRetirementEngine';
import { advanceWorldTick } from '../../src/engine/worldEngine';
import type { LLMDecisionPayload, SectStipendMove,WorldState } from '../../src/types/world';

export const stipendPerson=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const stipendSect=(world:WorldState,id:string)=>world.sects.find(row=>row.id===id)!;
export const stipendPayload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'核对本期是否实际兑付，不另欠账。',...fields});
export const stipendDecision=(stipendMove:SectStipendMove,id:string)=>
  stipendPayload('SECT_STIPEND',stipendMove==='offer'?{stipendMove,targetInfirmaryCaseId:id}:{stipendMove,targetStipendId:id});
export const stipendTurn=(world:WorldState,decisions:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(({id})=>[id,decisions[id]??stipendPayload('REST')])),()=>.99);

export function retiredClinicGuard(){
  const world=createInitialWorld(90142);
  world.tick=10;world.month=5;
  const sect=world.sects[2];
  const hq=world.locations.find(row=>row.id===sect.headquartersId)!;
  const leader=stipendPerson(world,sect.leaderId!);
  const [guard,patient,successor]=world.cultivators.filter(row=>row.sectId===sect.id && row.id!==leader.id);
  sect.facilities.alchemy_hall=1;sect.spiritStones=240;hq.herbs.jade_leaf=6;
  for(const actor of [leader,guard,patient,successor]){
    actor.age=35;actor.lifespan=120;actor.locationId=hq.id;actor.maxHp=200;actor.hp=200;
    actor.tribulation=undefined;actor.guardAssignment=undefined;
  }
  patient.hp=65;patient.pillToxicity=9;
  if(!resolveInfirmaryAction(world,guard,stipendPayload('INFIRMARY',{infirmaryMove:'staff'})))throw Error('fixture shift');
  if(!resolveInfirmaryAction(world,patient,stipendPayload('INFIRMARY',{infirmaryMove:'request'})))throw Error('fixture request');
  const infirmary=world.infirmaries.cases[0];
  const shift=world.infirmaries.shifts[0];
  world.tick++;
  if(!resolveInfirmaryAction(world,patient,stipendPayload('INFIRMARY',{infirmaryMove:'accept',targetInfirmaryCaseId:infirmary.id})))
    throw Error('fixture actual treatment');
  world.tick++;
  if(!resolveServiceRetirementAction(world,guard,stipendPayload('SECT_SERVICE',{serviceMove:'retire'})))throw Error('fixture actual retirement');
  const retire=world.serviceRetirement.history.at(-1)!;
  const outsider=world.cultivators.find(row=>row.sectId!==sect.id)!;
  return {world,sectId:sect.id,siteId:hq.id,leaderId:leader.id,patientId:patient.id,recipientId:guard.id,successorId:successor.id,
    caseId:infirmary.id,shiftId:shift.id,retirementId:retire.id,outsiderId:outsider.id};
}
export function offeredSectStipend(){
  const f=retiredClinicGuard();
  f.world.tick++;
  if(!resolveSectStipendAction(f.world,stipendPerson(f.world,f.leaderId),stipendDecision('offer',f.caseId)))throw Error('fixture offer');
  return {...f,stipendId:f.world.sectStipends.stipends[0].id};
}
export function acceptedSectStipend(){
  const f=offeredSectStipend();
  f.world.tick++;
  if(!resolveSectStipendAction(f.world,stipendPerson(f.world,f.recipientId),stipendDecision('accept',f.stipendId)))throw Error('fixture accept');
  return f;
}
