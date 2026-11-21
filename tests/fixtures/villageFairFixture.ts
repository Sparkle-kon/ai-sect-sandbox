import { createInitialWorld } from '../../src/data/initialWorld';
import { marketClosureReason, resolveMarketAction } from '../../src/engine/marketEngine';
import { resolveVillageFairAction } from '../../src/engine/villageFairEngine';
import { resolveVillageGranaryAction } from '../../src/engine/villageGranaryEngine';
import { advanceWorldTick } from '../../src/engine/worldEngine';
import type { LLMDecisionPayload,WorldState } from '../../src/types/world';

export const fairPayload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload =>
  ({chosenAction,innerMonologue:'只核对乡集的真实摊位与到场。',...fields});
export const fairPerson=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const fairReserve=(targetVillageFairId:string,targetMarketOrderId:string)=>fairPayload('VILLAGE_FAIR',
  {villageFairMove:'reserve',targetVillageFairId,targetMarketOrderId});
export const fairTurn=(world:WorldState,actions:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(({id})=>[id,actions[id]??fairPayload('REST')])),()=>.99);

export function announcedVillageFair() {
  const world=createInitialWorld(191);
  const village=world.settlements.villages.find(row=>world.locations.some(place=>place.id===row.locationId && place.type==='market'))!;
  const site=world.locations.find(row=>row.id===village.locationId)!;
  world.tick=29;world.month=6;
  while ([0,1,2,3].some(delta=>marketClosureReason({...world,tick:world.tick+delta},site.id))) world.tick++;
  const [sponsor,first,second,third,outsider]=world.cultivators;
  for(const actor of [sponsor,first,second,third,outsider]){
    actor.age=35;actor.lifespan=120;actor.hp=actor.maxHp;actor.spiritStones=200;
    actor.herbs.earth_root=8;actor.tribulation=undefined;actor.guardAssignment=undefined;
    if(actor!==outsider) actor.locationId=site.id;
  }
  outsider.locationId=world.locations.find(row=>row.id!==site.id && row.type==='market' && !marketClosureReason(world,row.id))!.id;
  if (!resolveVillageGranaryAction(world,sponsor,fairPayload('VILLAGE_GRANARY',
    {granaryMove:'donate_stones',targetSettlementId:village.id}))) throw Error('fixture donation');
  const merchants=[first,second,third];
  const sell=fairPayload('PLACE_MARKET_SELL',{marketGood:'earth_root',marketQuantity:2,marketLimitPrice:12});
  for (const actor of [sponsor,...merchants,outsider]){
    if(!resolveMarketAction(world,actor,sell)) throw Error('fixture native sell');
  }
  world.tick++;
  const announcement=fairPayload('VILLAGE_FAIR',{villageFairMove:'announce',targetSettlementId:village.id});
  if(!resolveVillageFairAction(world,sponsor,announcement)) throw Error('fixture fair announcement');
  const fair=world.villageFairs.fairs[0];
  const orderFor=(actorId:string)=>world.markets.orders.find(row=>row.actorId===actorId)!.id;
  return {world,villageId:village.id,siteId:site.id,sponsorId:sponsor.id,merchantIds:merchants.map(row=>row.id),
    outsiderId:outsider.id,fairId:fair.id,orderFor,announcement};
}

export function reservedVillageFair(){
  const f=announcedVillageFair();
  const [first,second]=f.merchantIds;
  let world=fairTurn(f.world);
  for(const id of [first,second]) {
    if(!resolveVillageFairAction(world,fairPerson(world,id),fairReserve(f.fairId,f.orderFor(id)))) throw Error('fixture reservation');
  }
  return {...f,world};
}
