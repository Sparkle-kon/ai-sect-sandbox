import type {Cultivator,LLMDecisionPayload,LocationNode,MapHazard,WorldEvent,WorldState} from '../types/world';
import type {FurnaceEmergencyCase,FurnaceEmergencyOption,FurnaceEmergencyView} from '../types/furnaceEmergency';
import {isFurnaceSafetyClosed} from './furnaceSafetyEngine';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {knownMapLocations,noteTerrainVisit} from './terrainEngine';
export type {FurnaceEmergencyMove,FurnaceEmergencyOption,FurnaceEmergencyView} from '../types/furnaceEmergency';

import {actualClosure,actualInjury,actorAt,adjacent,caseId,eventId,exact,furnaceEmergencyOriginals,isPhase,matching,MAX_WARD,
  receipt,siteAllowed,siteAt,sourceAt,tileAt,USE_WINDOW,type EventKind} from './furnaceEmergencyProof';
export {isPrivateFurnaceEmergencyEvent} from './furnaceEmergencyProof';

const BRACE_QI=8;
const at=(world:WorldState,actor:Cultivator,id:string)=>actorAt(world,actor.id)===actor&&actor.age>=18&&isGrandSiegeFighterPresent(world,actor,id);
const rows=(world:WorldState)=>world.furnaceEmergencies?.cases??[];
function refuge(world:WorldState,actor:Cultivator,from:LocationNode,tick:number,peer?:Cultivator){
  const shared=peer&&new Set(knownMapLocations(world,peer).map(site=>site.id));
  return knownMapLocations(world,actor).filter(to=>siteAllowed(to)&&(!shared||shared.has(to.id))&&
    siteAt(world,to.id)===to&&adjacent(world,from,to)&&!world.mapHazards.some(hazard=>
      hazard.tileId===tileAt(world,to)?.id&&hazard.createdTick<=tick&&hazard.expiresTick>tick))
    .sort((a,b)=>a.id<b.id?-1:1)[0];
}
export function recordFurnaceEmergency(world:WorldState,events:readonly WorldEvent[]):void{
  const open=world.furnaceSafety.cases.filter(row=>row.damagedTick===world.tick&&!row.reopenedTick);
  if(!open.length)return;
  for(const hazardCase of open){
    const site=siteAt(world,hazardCase.siteId);
    const hazard=exact(world.mapHazards,row=>row.id===hazardCase.hazardId);
    if(!site||!siteAllowed(site)||!hazard||!isPhase(hazard,world.tick)||hazard.tileId!==tileAt(world,site)?.id)continue;
    const wound=exact(events,event=>event.id===`evt-${world.tick}-${hazard.id}`);
    const closed=exact(events,event=>event.id===`evt-${hazardCase.id}-closed-${world.tick}`);
    if(!wound||!closed)continue;
    for(const hit of wound.damage??[]){
      const student=actorAt(world,hit.cultivatorId);
      if(!student||!at(world,student,site.id)||!Number.isSafeInteger(hit.amount)||hit.amount<=0)continue;
      const use=world.furnaceReservations.uses.filter(row=>row.actorId===student.id&&row.siteId===site.id&&row.kind==='brew'&&
        row.tick<world.tick&&world.tick-row.tick<=USE_WINDOW).sort((a,b)=>b.tick-a.tick)[0];
      const line=exact(world.mentorship.lineage,row=>row.studentId===student.id);
      const offer=line&&world.mentorship.offers.filter(row=>row.studentId===student.id&&row.mentorId===line.mentorId&&
        row.status==='accepted'&&row.resolvedTick!==undefined&&use&&row.resolvedTick<use.tick)
        .sort((a,b)=>b.resolvedTick!-a.resolvedTick!)[0];
      if(!line||!offer||!use||!actorAt(world,offer.mentorId)||!world.resourceFlow.months.find(month=>month.tick===use.tick)?.entries
        .some(entry=>entry.kind==='consumption'&&entry.mechanism==='alchemy'&&entry.reason==='brew_fee'&&entry.refId===site.id&&
          entry.from.kind==='actor'&&entry.from.id===student.id&&entry.amount>0))continue;
      const row:FurnaceEmergencyCase={id:caseId(hazardCase.id,student.id),safetyId:hazardCase.id,siteId:site.id,studentId:student.id,
        mentorId:offer.mentorId,tuitionId:offer.id,usedTick:use.tick,damagedTick:world.tick,hazardId:hazard.id,
        injuryEventId:wound.id,injuryHp:hit.amount};
      if(!actualInjury(world,row,wound)||!actualClosure(world,row,closed)||rows(world).some(item=>item.id===row.id))continue;
      (world.furnaceEmergencies??={cases:[]}).cases.push(row);
    }
  }
}
function trueOpen(world:WorldState,row:FurnaceEmergencyCase,tick:number){
  const hazard=exact(world.mapHazards,hazard=>hazard.id===row.hazardId),site=siteAt(world,row.siteId);
  return hazard&&site&&isPhase(hazard,tick)&&hazard.tileId===tileAt(world,site)?.id&&
    isFurnaceSafetyClosed(world,site.id,tick)&&furnaceEmergencyOriginals(world,row)?{hazard,site}:undefined;
}
export function availableFurnaceEmergencyActions(actor:Cultivator,world:WorldState,tick=world.tick+1):FurnaceEmergencyOption[]{
  if(tick!==world.tick&&tick!==world.tick+1)return [];
  for(const row of rows(world)){
    if((row.studentId!==actor.id&&row.mentorId!==actor.id)||tick<=row.damagedTick||!at(world,actor,row.siteId))continue;
    const source=trueOpen(world,row,tick);
    if(!source)continue;
    const {site,hazard}=source,base={action:'FURNACE_EMERGENCY',targetFurnaceEmergencyId:row.id} as const;
    const student=actorAt(world,row.studentId),mentor=actorAt(world,row.mentorId);
    if(actor.id===row.studentId&&!row.decision){
      const exit=refuge(world,actor,site,tick);
      const options:FurnaceEmergencyOption[]=[];
      if(tick+1<hazard.expiresTick&&actor.qiProgress>=BRACE_QI&&site.herbs.earth_root>=1)options.push({...base,furnaceEmergencyMove:'brace'});
      if(exit)options.push({...base,furnaceEmergencyMove:'retreat',targetLocationId:exit.id});
      if(tick+1<hazard.expiresTick&&mentor&&at(world,mentor,site.id)&&refuge(world,actor,site,tick,mentor))
        options.push({...base,furnaceEmergencyMove:'request_rescue'});
      return options;
    }
    const d=row.decision;
    if(actor.id===row.mentorId&&d?.move==='request_rescue'&&d.acceptedTick===undefined&&tick===d.tick+1&&
      student&&at(world,student,site.id)&&refuge(world,student,site,tick,actor)?.id===d.refugeId)
      return [{...base,furnaceEmergencyMove:'accept_rescue'}];
  }
  return [];
}
function moveOne(world:WorldState,actor:Cultivator,to:LocationNode){actor.locationId=to.id;noteTerrainVisit(world,actor);}
export function resolveFurnaceEmergencyAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='FURNACE_EMERGENCY'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','furnaceEmergencyMove','targetFurnaceEmergencyId','targetLocationId'].includes(key)))return null;
  const option=availableFurnaceEmergencyActions(actor,world,world.tick).find(row=>row.targetFurnaceEmergencyId===decision.targetFurnaceEmergencyId&&
    row.furnaceEmergencyMove===decision.furnaceEmergencyMove&&row.targetLocationId===decision.targetLocationId);
  const row=option&&exact(rows(world),row=>row.id===option.targetFurnaceEmergencyId);
  if(!row||!option)return null;
  const move=option.furnaceEmergencyMove,site=siteAt(world,row.siteId)!;
  if(move==='accept_rescue')row.decision!.acceptedTick=world.tick;
  else if(move==='retreat'){
    const exit=siteAt(world,option.targetLocationId)!;
    moveOne(world,actor,exit);row.decision={move,tick:world.tick,refugeId:exit.id,crossedTick:world.tick};
  }else if(move==='request_rescue'){
    const exit=refuge(world,actor,site,world.tick,actorAt(world,row.mentorId));
    if(!exit)return null;
    row.decision={move,tick:world.tick,refugeId:exit.id};
  }else row.decision={move,tick:world.tick};
  actor.currentAction='FURNACE_EMERGENCY';
  return receipt(world,row,move);
}
export function applyFurnaceEmergencyBrace(world:WorldState,hazard:MapHazard,student:Cultivator,nominal:number):number{
  const row=exact(rows(world),row=>row.hazardId===hazard.id&&row.studentId===student.id&&row.decision?.move==='brace'&&
    row.decision.tick+1===world.tick&&row.decision.appliedTick===undefined);
  const d=row?.decision,site=row&&siteAt(world,row.siteId);
  if(!row||!d||!site||!at(world,student,site.id)||!trueOpen(world,row,world.tick)||!isPhase(hazard,world.tick)||
    student.qiProgress<BRACE_QI||site.herbs.earth_root<1||nominal<=1)return nominal;
  const mitigated=nominal-Math.min(MAX_WARD,nominal-1);
  // Native beast tide has a one-HP floor. An already saturated hit may not really be reduced.
  const cap=Math.max(0,student.hp-1),delta=Math.min(nominal,cap)-Math.min(mitigated,cap);
  if(!Number.isSafeInteger(delta)||delta<=0)return nominal;
  student.qiProgress-=BRACE_QI;site.herbs.earth_root--;d.appliedTick=world.tick;d.preventedHp=delta;d.storedRoot=1;
  return mitigated;
}
export function advanceFurnaceEmergencies(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const row of rows(world)){
    const d=row.decision,site=siteAt(world,row.siteId);
    if(!d||!site)continue;
    if(d.move==='brace'){
      if(d.appliedTick===world.tick)events.push(receipt(world,row,'applied'));
      if(d.storedRoot&&d.returnedTick===undefined&&!world.mapHazards.some(h=>h.tileId===tileAt(world,site)?.id&&h.createdTick<=world.tick&&h.expiresTick>world.tick)&&
        site.herbs.earth_root<site.herbCapacity.earth_root){
        site.herbs.earth_root++;d.returnedTick=world.tick;events.push(receipt(world,row,'returned'));
      }
    }
    if(d.move==='request_rescue'&&d.acceptedTick!==undefined&&d.acceptedTick+1===world.tick&&d.crossedTick===undefined&&d.refugeId){
      const student=actorAt(world,row.studentId),mentor=actorAt(world,row.mentorId);
      if(!student||!mentor||!at(world,student,site.id)||!at(world,mentor,site.id))continue;
      const exit=refuge(world,student,site,world.tick,mentor);
      if(!exit||exit.id!==d.refugeId)continue;
      moveOne(world,student,exit);moveOne(world,mentor,exit);d.crossedTick=world.tick;
      events.push(receipt(world,row,'crossed'));
    }
  }
  return events;
}

export function furnaceEmergencyCrossingLocked(world:WorldState,actor:Cultivator,tick=world.tick):boolean{
  return rows(world).some(row=>{
    const d=row.decision;
    if(d?.move!=='request_rescue'||d.acceptedTick===undefined||tick!==d.acceptedTick+1||d.crossedTick!==undefined||
      row.studentId!==actor.id&&row.mentorId!==actor.id||!at(world,actor,row.siteId))return false;
    const peer=actorAt(world,actor.id===row.studentId?row.mentorId:row.studentId);
    return !!peer&&at(world,peer,row.siteId);
  });
}
export function projectFurnaceEmergency(world:WorldState,actor:Cultivator):FurnaceEmergencyView|undefined{
  if(actorAt(world,actor.id)!==actor||!actor.alive||actor.hp<=0||actor.positionPlane!==undefined)return;
  const options=availableFurnaceEmergencyActions(actor,world);
  for(const row of [...rows(world)].reverse()){
    const student=actor.id===row.studentId,mentor=actor.id===row.mentorId;
    if(!student&&!mentor)continue;
    const site=siteAt(world,row.siteId),d=row.decision;
    if(!site)continue;
    const phases:[EventKind,number|undefined][]=[];
    if(d&&(student||d.move==='request_rescue')){
      phases.push([d.move,d.tick],['applied',d.appliedTick],['returned',d.returnedTick],['accept_rescue',d.acceptedTick],
        ['crossed',d.move==='request_rescue'?d.crossedTick:undefined]);
    }
    for(const [kind,tick] of phases.reverse()){
      if(tick!==world.tick)continue;
      const event=sourceAt(world,eventId(row,kind,tick));
      if(event&&matching(world,row,kind,event,tick)&&event.locationId===actor.locationId)
        return {siteName:site.name,siteId:site.id,options,receipt:{title:event.title,description:event.description}};
    }
    if(options.some(option=>option.targetFurnaceEmergencyId===row.id))return {siteName:site.name,siteId:site.id,options};
  }
}
