import {createInitialWorld} from '../../src/data/initialWorld';
import {resolveCourierAction} from '../../src/engine/sealedCourierEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {CourierHandoffMove,LLMDecisionPayload,WorldState} from '../../src/types/world';

export const handoffPerson=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const handoffSite=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id)!;
export const handoffPayload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只按已到达的真实驿站与密封原件交接。',...fields});
export const handoffDecision=(courierHandoffMove:CourierHandoffMove,targetDispatchId:string,targetCourierId?:string)=>
  handoffPayload('COURIER_HANDOFF',{courierHandoffMove,targetDispatchId,...(targetCourierId?{targetCourierId}:{})});
export const handoffTurn=(world:WorldState,actions:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(({id})=>[id,actions[id]??handoffPayload('REST')])),()=>.99);

export function nativeCourierHandoffRoute(){
  const world=createInitialWorld(8293);
  world.tick=21;world.month=5;
  // Existing surveyed x-first public route Taixu → Blood passes through the same real Tianji desk tile.
  const origin=handoffSite(world,'loc-taixu'),post=handoffSite(world,'loc-tianji'),destination=handoffSite(world,'loc-blood');
  const [sender,courier,newCourier,outsider]=world.cultivators.filter(row=>!world.sects.some(sect=>sect.leaderId===row.id));
  const recipient=handoffPerson(world,world.sects.find(sect=>sect.headquartersId===destination.id)!.leaderId!);
  for(const actor of world.cultivators) actor.locationId='loc-market';
  for(const actor of [sender,courier,newCourier,outsider,recipient]){
    actor.age=36;actor.lifespan=120;actor.hp=actor.maxHp;actor.spiritStones=150;
    actor.tribulation=undefined;actor.guardAssignment=undefined;
  }
  sender.locationId=origin.id;courier.locationId=origin.id;newCourier.locationId=post.id;recipient.locationId=destination.id;
  if(!resolveCourierAction(world,sender,handoffPayload('SEALED_COURIER',{courierMove:'send',targetCourierId:courier.id,
    targetCultivatorId:recipient.id,dispatchCue:'offer_relief'})))throw Error('fixture actual native send');
  const id=world.couriers.dispatches[0].id;
  world.tick++;
  if(!resolveCourierAction(world,courier,handoffPayload('SEALED_COURIER',{courierMove:'accept',targetDispatchId:id})))
    throw Error('fixture actual native pickup');
  return {world,id,senderId:sender.id,originalId:courier.id,newId:newCourier.id,recipientId:recipient.id,
    outsiderId:outsider.id,originId:origin.id,postId:post.id,destinationId:destination.id};
}
export function arrivedCourierHandoff(){
  const f=nativeCourierHandoffRoute();
  let {world}=f;
  for(let i=0;i<12&&!world.couriers.dispatches[0].handoff;i++)world=handoffTurn(world);
  const checkpoint=world.couriers.dispatches[0].handoff;
  if(!checkpoint||checkpoint.status!=='arrived'||checkpoint.postId!==f.postId)throw Error('fixture actual reached Tianji checkpoint');
  return {...f,world};
}
export function offeredCourierHandoff(){
  const f=arrivedCourierHandoff();
  const world=handoffTurn(f.world,{[f.originalId]:handoffDecision('offer',f.id,f.newId)});
  if(world.couriers.dispatches[0].handoff?.status!=='offered')throw Error('fixture actual held offer date');
  return {...f,world};
}
export function transferredCourierHandoff(){
  const f=offeredCourierHandoff();
  const world=handoffTurn(f.world,{[f.newId]:handoffDecision('accept',f.id)});
  if(world.couriers.dispatches[0].handoff?.status!=='transferred')throw Error('fixture actual physically transferred packet');
  return {...f,world};
}
