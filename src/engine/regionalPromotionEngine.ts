import type { RegionalTurn } from './regionalSimulationEngine';
import { regionForColumn, regionForPoint } from './simulationRegionGeometry';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { terrainTileAt } from './terrainEngine';
import type { Cultivator, MapPoint, RegionalPromotion, SimulationRegionId, WorldEvent, WorldState } from '../types/world';

export const REGIONAL_PROMOTION_LENGTH=3;
export const REGIONAL_PROMOTION_HISTORY=36;
const realTick=(world:WorldState,before:WorldState)=>before.tick+1===world.tick;
const pointEquals=(a:MapPoint,b:MapPoint)=>a.x===b.x&&a.y===b.y;
const site=(world:WorldState,id:string)=>world.locations.find(item=>item.id===id);
const ordinarySite=(item:ReturnType<typeof site>)=>!!item&&item.type!=='secret_realm'&&item.type!=='abyss'&&!isScopedExpeditionGate(item);
const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const live=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0;

export const regionalPromotionKey=(row:RegionalPromotion)=>`${row.observedTick}:${row.kind}:${row.sourceId}`;

function retain(world:WorldState,row:RegionalPromotion):void {
  const state=world.regionalSimulation;
  if(!state)return;
  const history=(state.promotions??=[]);
  if(!history.some(value=>regionalPromotionKey(value)===regionalPromotionKey(row)))history.push(row);
}
function crossedPointTiles(world:WorldState,path:readonly MapPoint[],start:number,end:number):string[]|undefined {
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<0||start>=path.length||end>=path.length||start===end)return undefined;
  const points=start<end?path.slice(start,end+1):path.slice(end,start+1).reverse();
  const tiles=points.map(point=>terrainTileAt(world,point.x,point.y)?.id);
  if(tiles.some(tile=>tile===undefined))return undefined;
  return [...new Set(tiles as string[])];
}
export function regionalPromotionTileEndpoints(world:WorldState,tileIds:readonly string[]):
  {fromRegionId:SimulationRegionId;toRegionId:SimulationRegionId}|undefined {
  const tiles=new Map(world.terrain.tiles.map(tile=>[tile.id,tile]));
  const a=tiles.get(tileIds[0]),b=tiles.get(tileIds.at(-1)??'');
  const fromRegionId=a&&regionForColumn(a.col,world.terrain.columns);
  const toRegionId=b&&regionForColumn(b.col,world.terrain.columns);
  if(!fromRegionId||!toRegionId||fromRegionId===toRegionId||tileIds.length<2||new Set(tileIds).size!==tileIds.length)return undefined;
  for(const [index,id] of tileIds.entries()){
    const current=tiles.get(id),prior=index>0?tiles.get(tileIds[index-1]):undefined;
    if(!current||index>0&&(!prior||Math.abs(prior.col-current.col)+Math.abs(prior.row-current.row)!==1))return undefined;
  }
  return {fromRegionId,toRegionId};
}

const clock=(observedTick:number,startsTick:number)=>({observedTick,startsTick,throughTick:startsTick+REGIONAL_PROMOTION_LENGTH-1});
export function activeRegionalPromotionRegions(world:WorldState,tick=world.tick):ReadonlySet<SimulationRegionId> {
  return new Set((world.regionalSimulation?.promotions??[]).filter(row=>row.startsTick<=tick&&tick<=row.throughTick)
    .flatMap(row=>[row.fromRegionId,row.toRegionId]));
}

/** Early native courier phase already happened. Exact stored cursor proof only; terminal-erased paths stay unclaimed. */
export function recordRegionalEarlyPromotions(world:WorldState,before:WorldState):void {
  const state=world.regionalSimulation;
  if(!state||!realTick(world,before))return;
  if(state.promotions)state.promotions=state.promotions.filter(row=>row.observedTick>world.tick-REGIONAL_PROMOTION_HISTORY);
  const prior=new Map(before.couriers.dispatches.map(row=>[row.id,row]));
  for(const row of world.couriers.dispatches) {
    if(row.lastAdvancedTick!==world.tick||(row.status!=='in_transit'&&row.status!=='returning'))continue;
    const old=prior.get(row.id);
    if(!old||(old.status!=='in_transit'&&old.status!=='returning')||
      old.courierId!==row.courierId||old.senderId!==row.senderId||old.recipientId!==row.recipientId||
      old.path.length!==row.path.length||!old.path.every((point,index)=>pointEquals(point,row.path[index]))||
      !live(world.cultivators.find(actor=>actor.id===row.courierId)))continue;
    const tiles=crossedPointTiles(world,row.path,old.pathIndex,row.pathIndex);
    const regions=tiles&&regionalPromotionTileEndpoints(world,tiles);
    if(!tiles||!regions)continue;
    retain(world,{kind:'courier_crossed',sourceId:row.id,actorId:row.courierId,startIndex:old.pathIndex,endIndex:row.pathIndex,
      crossedTileIds:tiles,...regions,...clock(world.tick,world.tick)});
  }
}

/** Escorted trades and siege move after actor turns. No late evidence is applied to an already completed month. */
export function recordRegionalLatePromotions(world:WorldState,before:WorldState,events:readonly WorldEvent[]):void {
  if(!world.regionalSimulation||!realTick(world,before))return;
  const escorts=new Map(before.escorts.contracts.map(row=>[row.id,row]));
  for(const row of world.escorts.contracts){
    if(row.lastAdvancedTick!==world.tick||!row.escortId)continue;
    const old=escorts.get(row.id);
    const shipment=world.markets.shipments.find(value=>value.id===row.shipmentId);
    if(!old||old.shipmentId!==row.shipmentId||old.clientId!==row.clientId||old.originId!==row.originId||
      old.destinationId!==row.destinationId||old.pathIndex>=row.pathIndex||row.acceptedTick===undefined||
      !shipment||shipment.departedTick>=world.tick||shipment.originId!==row.originId||shipment.destinationId!==row.destinationId)continue;
    const continuing=old.status==='active'&&old.escortId===row.escortId&&row.acceptedTick<world.tick&&
      old.acceptedTick===row.acceptedTick;
    // Native market moves after actors: a genuinely accepted escort can also take its first stride
    // this month. The paid previous offer plus the real scoped acceptance identifies this custody.
    const acceptedHere=old.status==='offered'&&old.feeEscrow>0&&old.pathIndex===0&&old.path.length===0&&
      row.acceptedTick===world.tick&&events.filter(event=>event.id===`evt-${world.tick}-${row.id}-accepted`&&
        event.tick===world.tick&&event.category==='diplomacy'&&event.witnessScope==='participants'&&event.locationId===row.originId&&
        same(event.actorIds,[row.clientId,row.escortId!])).length===1;
    if(!continuing&&!acceptedHere)continue;
    const tiles=crossedPointTiles(world,row.path,old.pathIndex,row.pathIndex);
    const regions=tiles&&regionalPromotionTileEndpoints(world,tiles);
    if(!tiles||!regions||!same(tiles,row.lastCrossedTileIds))continue;
    retain(world,{kind:'escort_crossed',sourceId:row.id,shipmentId:row.shipmentId,actorId:row.escortId,
      startIndex:old.pathIndex,endIndex:row.pathIndex,crossedTileIds:tiles,...regions,...clock(world.tick,world.tick+1)});
  }
  const sieges=new Map(before.sieges.map(row=>[row.id,row]));
  for(const row of world.sieges){
    if(row.status!=='sieging'||row.lastResolvedTick!==world.tick)continue;
    const old=sieges.get(row.id);
    const attacker=world.sects.find(sect=>sect.id===row.attackerSectId);
    const source=attacker&&site(world,attacker.headquartersId),target=site(world,row.destinationId);
    if(!old||old.status!=='marching'||old.destinationId!==row.destinationId||old.attackerSectId!==row.attackerSectId||
      old.defenderSectId!==row.defenderSectId||!same(old.participantIds,row.participantIds)||!source||!target||
      !ordinarySite(source)||!ordinarySite(target))continue;
    const fromRegionId=regionForPoint(world,source),toRegionId=regionForPoint(world,target);
    if(!fromRegionId||!toRegionId||fromRegionId===toRegionId)continue;
    const found=events.filter(item=>item.id===`evt-${world.tick}-dip-${row.id}`&&item.tick===world.tick&&item.category==='diplomacy'&&
      item.locationId===target.id&&same(item.actorIds,row.participantIds)&&item.witnessScope!=='participants');
    const actuallyArrived=row.participantIds.find(id=>{
      const beforeActor=before.cultivators.find(actor=>actor.id===id);
      const afterActor=world.cultivators.find(actor=>actor.id===id);
      return live(beforeActor)&&live(afterActor)&&beforeActor.locationId===source.id&&afterActor.locationId===target.id;
    });
    if(found.length!==1||!actuallyArrived)continue;
    retain(world,{kind:'siege_arrived',sourceId:row.id,sourceSiteId:source.id,destinationSiteId:target.id,eventId:found[0].id,
      actorId:actuallyArrived,fromRegionId,toRegionId,...clock(world.tick,world.tick+1)});
  }
}

/** Narrow native arrival after a real ordinary move. No new relationship or named claim is created. */
export function recordRegionalActorReturn(world:WorldState,turn:RegionalTurn|undefined,actor:Cultivator,
  priorLocationId:string,chosenAction:string,actual?:WorldEvent|null):void {
  if(!turn||turn.tick!==world.tick||!world.regionalSimulation||chosenAction!=='EXPLORE'||actor.currentAction!=='EXPLORE'||!live(actor)||
    !world.cultivators.includes(actor)||actor.locationId===priorLocationId)return;
  if(actual&&(actual.id!==`evt-${world.tick}-${actor.id}-explore`||actual.tick!==world.tick||actual.category!=='breakthrough'||
    actual.locationId!==actor.locationId||!same(actual.actorIds,[actor.id])))return;
  const origin=site(world,priorLocationId),target=site(world,actor.locationId);
  if(!origin||!target||!ordinarySite(origin)||!ordinarySite(target))return;
  const fromRegionId=regionForPoint(world,origin),toRegionId=regionForPoint(world,target);
  const registered=world.regionalSimulation.registrations.find(row=>row.kind==='actor'&&row.id===actor.id);
  if(!fromRegionId||!toRegionId||fromRegionId===toRegionId||
    !registered||registered.registeredTick>=world.tick||registered.originRegionId!==toRegionId)return;
  const known=new Set(world.relationships.flatMap(edge=>edge.affinity>0&&edge.fromId===actor.id?[edge.toId]:
    edge.affinity>0&&edge.toId===actor.id?[edge.fromId]:[]));
  const witnesses=world.cultivators.filter(observer=>known.has(observer.id)&&
    doctrineFoundingPhysicallyAt(world,observer,target.id,world.tick)).map(observer=>observer.id).sort();
  retain(world,{kind:'actor_returned',sourceId:actor.id,sourceSiteId:origin.id,destinationSiteId:target.id,
    ...(actual?{eventId:actual.id}:{}),witnessIds:witnesses,fromRegionId,toRegionId,...clock(world.tick,world.tick+1)});
}

export interface RegionalPromotionView {
  kind:RegionalPromotion['kind'];observedTick:number;startsTick:number;throughTick:number;
  fromRegionId:SimulationRegionId;toRegionId:SimulationRegionId;active:boolean;
}

/** Scope never borrows from another actor; payload and route point geometry are not projected. */
export function projectRegionalPromotions(world:WorldState,viewer?:Cultivator):RegionalPromotionView[] {
  if(!viewer||!world.cultivators.includes(viewer))return [];
  return (world.regionalSimulation?.promotions??[]).flatMap((row):RegionalPromotionView[]=>{
    let allowed=false;
    if(row.kind==='actor_returned')allowed=row.sourceId===viewer.id||row.witnessIds.includes(viewer.id);
    else if(row.kind==='escort_crossed'||row.kind==='courier_crossed'){
      allowed=row.actorId===viewer.id;
    } else {
      const siege=world.sieges.find(value=>value.id===row.sourceId&&value.destinationId===row.destinationSiteId);
      allowed=row.actorId===viewer.id||!!siege&&siege.participantIds.includes(viewer.id)||
        doctrineFoundingPhysicallyAt(world,viewer,row.destinationSiteId,world.tick);
    }
    return allowed?[{kind:row.kind,observedTick:row.observedTick,startsTick:row.startsTick,throughTick:row.throughTick,
      fromRegionId:row.fromRegionId,toRegionId:row.toRegionId,active:row.startsTick<=world.tick&&world.tick<=row.throughTick}]:[];
  });
}
