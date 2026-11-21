import {expect} from 'vitest';
import {createInitialWorld} from '../../src/data/initialWorld';
import {applyMapBrush} from '../../src/engine/mapBrushEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../../src/types/world';

export const workshopCapacityChoice=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,...fields,innerMonologue:'只按原约、实物和已核实的停炉签据办理。'});
export const workshopCapacityMove=(workshopCapacityMove:'offer'|'accept',targetWorkshopId:string)=>
  workshopCapacityChoice('WORKSHOP_CAPACITY',{workshopCapacityMove,targetWorkshopId});
export const workshopCapacityTurn=(world:WorldState,choices:Record<string,LLMDecisionPayload>={},reverse=false)=>{
  const state=structuredClone(world);
  if(reverse)state.cultivators.reverse();
  return advanceWorldTick(state,Object.fromEntries(state.cultivators.map(({id})=>[id,choices[id]??workshopCapacityChoice('REST')])),()=>.99);
};
export const workshopCapacityActor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const workshopCapacityOrder=(world:WorldState,id:string)=>world.workshops.orders.find(row=>row.id===id)!;

export function workshopCapacityFixture(chartered=false,reverse=false){
  const world=createInitialWorld(9301);
  world.tick=22;world.month=5;
  const home=world.sects.find(row=>row.id==='sect-danxia')!;
  const site=world.locations.find(row=>row.id===home.headquartersId)!;
  const supervisor=workshopCapacityActor(world,home.leaderId!);
  const [maker,patron]=world.cultivators.filter(row=>row.id!==supervisor.id&&
    (chartered ? row.sectId===home.id : row.sectId!==home.id)&& !world.sects.some(sect=>sect.leaderId===row.id));
  for(const actor of world.cultivators)actor.locationId='loc-market';
  for(const actor of [maker,patron,supervisor]){
    actor.locationId=site.id;actor.hp=actor.maxHp;actor.spiritStones=300;actor.herbs.earth_root=12;
    actor.techniqueMastery=72;actor.artifacts=[];actor.tribulation=undefined;
  }
  maker.spiritRoot=site.spiritRoot;
  home.facilities.alchemy_hall=1;
  site.furnaceGrade=1;
  const offer=workshopCapacityChoice('WORKSHOP',{workshopMove:'offer',targetCultivatorId:maker.id,workshopTier:'法器',
    workshopQuantity:2,workshopQualityFloor:'standard'});
  const offered=workshopCapacityTurn(world,{[patron.id]:offer},reverse);
  const order=offered.workshops.orders.at(-1)!;
  expect(order).toMatchObject({status:'offered',siteId:site.id,quantity:2});
  expect(!!order.institution).toBe(chartered);
  const funded=workshopCapacityTurn(offered,{[maker.id]:workshopCapacityChoice('WORKSHOP',{
    workshopMove:'accept',targetWorkshopId:order.id,
  })},reverse);
  const fundedOrder=workshopCapacityOrder(funded,order.id);
  expect(fundedOrder).toMatchObject({status:'active',escrowStones:110,escrowHerbs:4});
  const work=workshopCapacityChoice('WORKSHOP',{workshopMove:'work',targetWorkshopId:order.id});
  const blank=workshopCapacityTurn(funded,{[maker.id]:work},reverse);
  expect(workshopCapacityOrder(blank,order.id).work).toMatchObject([{piece:1,stage:'blank',tick:blank.tick}]);
  const queued=workshopCapacityTurn(blank,{[maker.id]:workshopCapacityChoice('FURNACE_RESERVATION',{
    furnaceMove:'reserve',targetLocationId:site.id,targetWorkshopId:order.id,
  })},reverse);
  const booking=queued.furnaceReservations.reservations.find(row=>row.workshopOrderId===order.id)!;
  expect(booking).toMatchObject({status:'queued',actorId:maker.id,siteId:site.id});
  const hit=applyMapBrush(queued,'beast_tide',[site]);
  const damaged=workshopCapacityTurn(hit,{[maker.id]:workshopCapacityMove('offer',order.id)},reverse);
  const caseRow=damaged.furnaceSafety.cases.find(row=>row.siteId===site.id)!;
  expect(caseRow).toMatchObject({damagedTick:damaged.tick,integrity:70,severity:1});
  return {world:damaged,originalDeadline:fundedOrder.deadlineTick!,supervisor:supervisor.id,siteId:site.id,maker:maker.id,
    payer:patron.id,orderId:order.id,bookingId:booking.id,caseId:caseRow.id,blankTick:blank.tick,work,offer,hit};
}
