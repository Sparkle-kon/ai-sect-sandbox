import {campaignSHA256} from '../src/engine/campaignMemento';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {DANXIA_FIXTURE,danxiaActor,danxiaPayload,danxiaTurn,preparedDanxiaAppointment} from '../tests/fixtures/danxiaNativeFixture';
import type {DanxiaMedicineMove,LLMDecisionPayload,WorldState} from '../src/types/world';
declare const __SECT_UTILITY_RULE_VERSION__:string;
const {discipleId:disciple,staffId:escort,villageSiteId}=DANXIA_FIXTURE;
const f=preparedDanxiaAppointment();
const beginning=danxiaTurn(f.world,{[f.patientId]:danxiaPayload('CARE_FOLLOWUP',{careFollowupMove:'attend',targetCareFollowupId:f.appointmentId})});
const incident=beginning.danxiaShortages.cases[0];
if(!incident||incident.status!=='open')throw Error('未发现原生短缺源。');
danxiaActor(beginning,disciple).herbs.jade_leaf=2; // one clearly controlled real initial personal reserve
const create=(move:'retain'|'offer_ship'|'observe',targetCultivatorId?:string)=>danxiaPayload('DANXIA_MEDICINE',
  {danxiaMedicineMove:move,targetDanxiaShortageId:incident.id,...(targetCultivatorId?{targetCultivatorId}:{})});
const op=(move:DanxiaMedicineMove,targetDanxiaMedicineId:string)=>danxiaPayload('DANXIA_MEDICINE',{danxiaMedicineMove:move,targetDanxiaMedicineId});
const scripted=(base:WorldState,actions:Record<string,LLMDecisionPayload>,rng:()=>number)=>{
 const chosen=Object.fromEntries(base.cultivators.map(actor=>[actor.id,actions[actor.id]??danxiaPayload('REST')]));
 return advanceWorldTick(base,chosen,rng,'utility');
};
const waiting=danxiaTurn(beginning,{[disciple]:create('observe')});
const held=danxiaTurn(beginning,{[disciple]:create('retain')});
const heldId=held.danxiaMedicine.commitments[0]?.id;
if(!heldId)throw Error('该留药分支未能实存。');
const ready=danxiaTurn(held,{[disciple]:danxiaPayload('GATHER_HERBS',{targetHerbId:'earth_root'})});
const brewed=scripted(ready,{[disciple]:op('brew',heldId)},()=>0);
const failed=scripted(ready,{[disciple]:op('brew',heldId)},()=>.99);
const offer=danxiaTurn(beginning,{[disciple]:create('offer_ship',escort)});
const transportId=offer.danxiaMedicine.commitments[0]?.id;
if(!transportId)throw Error('该运药分支没有实际邀约。');
const accept=danxiaTurn(offer,{[escort]:op('accept',transportId),[f.patientId]:danxiaPayload('EXPLORE',{targetLocationId:villageSiteId})});
let arrived=accept;
for(let i=0;i<12&&arrived.danxiaMedicine.commitments[0]?.status!=='arrived';i++)arrived=danxiaTurn(arrived);
if(arrived.danxiaMedicine.commitments[0]?.status!=='arrived')throw Error('当事人未实际抵达。');
const received=danxiaTurn(arrived,{[f.patientId]:op('receive',transportId)});
const refused=danxiaTurn(offer,{[escort]:op('decline',transportId)});
const recovered=danxiaTurn(refused,{[disciple]:op('recover',transportId)});
const otherDecisions=Object.fromEntries(beginning.cultivators.filter(actor=>actor.id!==disciple).map(actor=>[actor.id,danxiaPayload('REST')]));
const autonomous=advanceWorldTick(beginning,otherDecisions,()=>.99,'utility');
for(const [label,world] of [['observe',waiting],['brewed',brewed],['brew_failed',failed],['arrived',arrived],
    ['received',received],['refused_recovered',recovered],['autonomous_disciple',autonomous]] as const){
 const raw=encodeEraWorldSave(world);
 if(encodeEraWorldSave(decodeEraWorldSave(raw))!==raw)throw Error('读回的原生世界发生变化。');
 const row=world.danxiaMedicine.commitments[0];
 console.log(JSON.stringify({label,rule:__SECT_UTILITY_RULE_VERSION__,seed:DANXIA_FIXTURE.seed,tick:world.tick,year:world.year,month:world.month,
   sponsor:{name:danxiaActor(world,disciple).name,jade:danxiaActor(world,disciple).herbs.jade_leaf,pill:danxiaActor(world,disciple).pills.foundation,
      action:danxiaActor(world,disciple).currentAction},
   patient:{name:danxiaActor(world,f.patientId).name,jade:danxiaActor(world,f.patientId).herbs.jade_leaf,
     actualNewCare:!!world.careFollowups.appointments.find(appointment=>appointment.id===f.appointmentId)?.receipt},
   status:row?.status??null,escrow:row?.escrow??0,settlement:row?.settlement,disposition:row?.disposition,
   at:[row?.reservedTick??null,row?.acceptedTick??null,row?.departedTick??null,row?.arrivedTick??null],
   sha:await campaignSHA256(new TextEncoder().encode(raw)),byteExactRestore:true}));
}
