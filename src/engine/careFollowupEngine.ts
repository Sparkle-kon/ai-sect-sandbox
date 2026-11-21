import type {CareFollowup,CareFollowupMove,CareFollowupsState,Cultivator,InfirmaryCase,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {availableInfirmaryActions,clinicAccessForFollowup,clinicFollowupSupport,INFIRMARY_SHIFT_TICKS,INFIRMARY_TREATMENT_HERBS,INFIRMARY_TREATMENT_STONES,spareLocalClinicForFollowup} from './infirmaryEngine';
import {hasCohortStaffedDuty} from './apprenticeCohortEngine';
import {hasDueObservatoryDuty} from './staffedDutyEngine';
import {flowSect,flowSite,recordResourceFlow} from './resourceFlowEngine';
import {CARE_FOLLOWUP_APPOINTMENT_TICKS,CARE_FOLLOWUP_DELAY_TICKS,CARE_FOLLOWUP_DETOX,CARE_FOLLOWUP_HEAL_FRACTION,
  CARE_FOLLOWUP_JADE_LEAF,CARE_FOLLOWUP_NEED_THRESHOLD,CARE_FOLLOWUP_SCHEDULE_WINDOW,CARE_FOLLOWUP_STONES} from './careFollowupTerms';

export const createCareFollowupsState=():CareFollowupsState=>({appointments:[],nextId:1});
export type CareFollowupOption =
  | {action:'CARE_FOLLOWUP';careFollowupMove:'schedule';targetInfirmaryCaseId:string;targetCareFollowupId?:never}
  | {action:'CARE_FOLLOWUP';careFollowupMove:Exclude<CareFollowupMove,'schedule'>;targetCareFollowupId:string;targetInfirmaryCaseId?:never};

const live=(person:Cultivator|undefined):person is Cultivator=>!!person?.alive&&person.hp>0;
const personAt=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id);
const needsCare=(actor:Cultivator)=>actor.pillToxicity>0||actor.hp/Math.max(1,actor.maxHp)<=CARE_FOLLOWUP_NEED_THRESHOLD;
function validSource(world:WorldState,actor:Cultivator,row:InfirmaryCase,tick:number){
  const receipt=row.receipt;
  return row.status==='treated'&&row.patientId===actor.id&&receipt&&row.settledTick===receipt.tick&&row.queuedTick<receipt.tick&&
    receipt.tick<tick&&tick-receipt.tick<=CARE_FOLLOWUP_SCHEDULE_WINDOW&&receipt.guardId!==actor.id&&
    receipt.stonesSpent===INFIRMARY_TREATMENT_STONES&&receipt.herbsSpent===INFIRMARY_TREATMENT_HERBS&&
    (receipt.hpRestored>0||receipt.toxicityRemoved>0)&&world.infirmaries.shifts.some(shift=>shift.id===receipt.shiftId&&
      shift.guardId===receipt.guardId&&shift.sectId===row.sectId&&shift.siteId===row.siteId&&
      shift.startedTick<receipt.tick&&receipt.tick<shift.expiresTick&&(shift.lastServedTick??-1)>=receipt.tick)?receipt:undefined;
}
function stillTitled(world:WorldState,row:CareFollowup):boolean{
  const sect=world.sects.find(item=>item.id===row.sectId);
  return !!sect&&sect.headquartersId===row.siteId&&sect.facilities.alchemy_hall>=1&&
    world.locations.some(site=>site.id===row.siteId&&site.ownerSectId===sect.id&&site.type!=='secret_realm'&&site.type!=='abyss')&&
    !world.relocations.plans.some(relocation=>relocation.sectId===sect.id&&relocation.status==='in_transit');
}
function treatment(world:WorldState,patient:Cultivator,row:CareFollowup,tick:number){
  if(!stillTitled(world,row)||patient.sectId!==row.sectId||!live(patient))return {reason:'patient_ineligible' as const};
  const access=clinicAccessForFollowup(world,patient,tick);
  if(access?.site.id!==row.siteId)return {reason:'patient_absent' as const};
  if(!needsCare(patient))return {reason:'no_need' as const};
  return clinicFollowupSupport(world,patient,row.sourceGuardId,tick);
}
export function availableCareFollowupActions(actor:Cultivator,world:WorldState,executionTick=world.tick):CareFollowupOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||personAt(world,actor.id)!==actor||!live(actor))return [];
  const owned=world.careFollowups.appointments.filter(row=>row.patientId===actor.id);
  const actions:CareFollowupOption[]=[];
  const open=owned.find(row=>row.status==='scheduled'&&executionTick<row.expiresTick);
  if(open){
    if(executionTick>open.scheduledTick)actions.push({action:'CARE_FOLLOWUP',careFollowupMove:'withdraw',targetCareFollowupId:open.id});
    if(executionTick>=open.dueTick&&'shift' in treatment(world,actor,open,executionTick))
      actions.push({action:'CARE_FOLLOWUP',careFollowupMove:'attend',targetCareFollowupId:open.id});
    return actions;
  }
  if(owned.some(row=>row.settledTick===executionTick))return actions;
  const access=clinicAccessForFollowup(world,actor,executionTick);
  if(!access)return actions;
  for(const row of world.infirmaries.cases){
    if(row.sectId!==access.sect.id||row.siteId!==access.site.id||owned.some(item=>item.sourceCaseId===row.id)||
        !validSource(world,actor,row,executionTick))continue;
    actions.push({action:'CARE_FOLLOWUP',careFollowupMove:'schedule',targetInfirmaryCaseId:row.id});
  }
  return actions;
}
const bases=['chosenAction','innerMonologue','spokenLine','careFollowupMove'];
function event(world:WorldState,row:CareFollowup,suffix:string,title:string,description:string,guardId?:string):WorldEvent{
  return {id:`evt-${world.tick}-${row.id}-${suffix}`,tick:world.tick,year:world.year,month:world.month,
    title,description,category:'diplomacy',witnessScope:'participants',actorIds:guardId?[row.patientId,guardId]:[row.patientId],
    ...(world.locations.some(site=>site.id===row.siteId)?{locationId:row.siteId}:{})};
}
export function resolveCareFollowupAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  const move=payload.careFollowupMove;
  const target=move==='schedule'?'targetInfirmaryCaseId':'targetCareFollowupId';
  if(payload.chosenAction!=='CARE_FOLLOWUP'||Object.entries(payload).some(([key,value])=>
      value!==undefined&&![...bases,target].includes(key)&&!(key==='action'&&value==='CARE_FOLLOWUP')))return null;
  const option=availableCareFollowupActions(actor,world).find(row=>row.careFollowupMove===move&&row[target]===payload[target]);
  if(!option)return null;
  if(option.careFollowupMove==='schedule'){
    const source=world.infirmaries.cases.find(row=>row.id===option.targetInfirmaryCaseId);
    const receipt=source&&validSource(world,actor,source,world.tick);
    if(!source||!receipt)return null;
    const dueTick=world.tick+CARE_FOLLOWUP_DELAY_TICKS;
    const row:CareFollowup={id:`care-followup-${world.careFollowups.nextId++}`,sourceCaseId:source.id,sourceShiftId:receipt.shiftId,
      sourceGuardId:receipt.guardId,dischargedTick:receipt.tick,patientId:actor.id,sectId:source.sectId,siteId:source.siteId,
      scheduledTick:world.tick,dueTick,expiresTick:dueTick+CARE_FOLLOWUP_APPOINTMENT_TICKS,status:'scheduled'};
    world.careFollowups.appointments.push(row);
    return event(world,row,'scheduled','本人约定静养复诊','已核验原次实际出诊，只排复诊日期：未扣公库、药材，也未再次施治。');
  }
  const row=world.careFollowups.appointments.find(item=>item.id===option.targetCareFollowupId);
  if(!row)return null;
  if(option.careFollowupMove==='withdraw'){
    row.status='withdrawn';row.settledTick=world.tick;
    return event(world,row,'withdrawn','本人取消静养复诊','未施治，也未扣公库或药材。');
  }
  const support=treatment(world,actor,row,world.tick);
  if(!('shift' in support)||!support.shift||!support.site||!support.sect)return null;
  const {shift,site,sect}=support;
  const hpRestored=Math.min(Math.max(0,actor.maxHp-actor.hp),Math.round(actor.maxHp*CARE_FOLLOWUP_HEAL_FRACTION));
  const toxicityRemoved=Math.min(CARE_FOLLOWUP_DETOX,actor.pillToxicity);
  if(hpRestored<=0&&toxicityRemoved<=0)return null;
  sect.spiritStones-=CARE_FOLLOWUP_STONES;
  site.herbs.jade_leaf-=CARE_FOLLOWUP_JADE_LEAF;
  actor.hp+=hpRestored;
  actor.pillToxicity-=toxicityRemoved;
  shift.lastServedTick=world.tick;
  row.status='attended';row.settledTick=world.tick;row.receipt={tick:world.tick,guardId:shift.guardId,shiftId:shift.id,
    stonesSpent:CARE_FOLLOWUP_STONES,herbsSpent:CARE_FOLLOWUP_JADE_LEAF,maxHpAtVisit:actor.maxHp,hpRestored,toxicityRemoved};
  const metadata={kind:'consumption' as const,mechanism:'care_followup' as const,refId:row.id,
    visibility:{kind:'participants' as const,actorIds:[actor.id,shift.guardId]}};
  recordResourceFlow(world,{...metadata,reason:'followup_public_stones',good:'stone',amount:CARE_FOLLOWUP_STONES,from:flowSect(sect.id)});
  recordResourceFlow(world,{...metadata,reason:'followup_local_leaf',good:'jade_leaf',amount:CARE_FOLLOWUP_JADE_LEAF,from:flowSite(site.id)});
  return event(world,row,'attended','本人实际到场复诊','独立值守完成本次复诊，公库与地库按真实支出结算；不改写原次出诊。',shift.guardId);
}
export function advanceCareFollowups(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const row of world.careFollowups.appointments){
    if(row.status!=='scheduled')continue;
    const patient=personAt(world,row.patientId);
    const ineligible=!live(patient)||patient.sectId!==row.sectId||!stillTitled(world,row);
    if(!ineligible&&world.tick<row.expiresTick-1)continue;
    const support=!ineligible&&patient?treatment(world,patient,row,world.tick):undefined;
    row.status='closed';row.settledTick=world.tick;
    row.closure=ineligible?'patient_ineligible':support?.reason??'not_confirmed';
    events.push(event(world,row,'closed','复诊机会结束，未施治','未取得本次复诊的实际条件与本人同意；不扣公库、药材或个人费用。'));
  }
  return events;
}

export function projectCareFollowups(world:WorldState,viewer?:Cultivator){
  if(!viewer||personAt(world,viewer.id)!==viewer)return [];
  return world.careFollowups.appointments.flatMap(row=>{
    if(row.patientId!==viewer.id&&row.receipt?.guardId!==viewer.id)return [];
    const receipt=row.receipt;
    return [{id:row.id,siteId:row.siteId,sectId:row.sectId,role:row.patientId===viewer.id?'patient' as const:'attending_guard' as const,
      dischargedTick:row.dischargedTick,scheduledTick:row.scheduledTick,dueTick:row.dueTick,expiresTick:row.expiresTick,
      status:row.status,settledTick:row.settledTick,closure:row.closure,receipt:receipt&&{
        tick:receipt.tick,stonesSpent:receipt.stonesSpent,herbsSpent:receipt.herbsSpent,
        hpRestored:receipt.hpRestored,toxicityRemoved:receipt.toxicityRemoved,
      }}];
  });
}
export function projectLocalCareFollowupCapacity(world:WorldState,viewer?:Cultivator){
  return viewer&&personAt(world,viewer.id)===viewer?spareLocalClinicForFollowup(world,viewer):undefined;
}

/** Anonymous suggestion only: signing now must plausibly cover one real future appointment date. */
export function shouldVolunteerCareFollowup(world:WorldState,actor:Cultivator,executionTick=world.tick):boolean{
  if(!world.careFollowups.appointments.some(row=>row.status==='scheduled'&&row.siteId===actor.locationId&&
      row.dueTick<executionTick+INFIRMARY_SHIFT_TICKS&&row.expiresTick>executionTick+1))return false;
  if(!availableInfirmaryActions(actor,world,executionTick).some(option=>option.infirmaryMove==='staff'))return false;
  const clinic=clinicAccessForFollowup(world,actor,executionTick);
  if(!clinic)return false;
  const {site,sect}=clinic;
  if(hasDueObservatoryDuty(world,actor,site.id,executionTick)||hasCohortStaffedDuty(world,actor,site.id,executionTick))return false;
  return world.careFollowups.appointments.some(row=>{
    if(row.status!=='scheduled'||row.siteId!==site.id||row.sectId!==sect.id||
      actor.id===row.patientId||actor.id===row.sourceGuardId)return false;
    const first=Math.max(row.dueTick,executionTick+1),last=Math.min(row.expiresTick,executionTick+INFIRMARY_SHIFT_TICKS);
    if(first>=last)return false;
    const patient=personAt(world,row.patientId);
    if(!patient||!live(patient)||!needsCare(patient)||clinicAccessForFollowup(world,patient,executionTick)?.site.id!==site.id)return false;
    for(let tick=first;tick<last;tick++){
      if(hasDueObservatoryDuty(world,actor,site.id,tick)||hasCohortStaffedDuty(world,actor,site.id,tick))continue;
      // Already supported, or genuinely out of beds/supplies: do not suggest duplicative staffing.
      const potential=treatment(world,patient,row,tick);
      if(potential.reason==='staff_unavailable')return true;
    }
    return false;
  });
}
