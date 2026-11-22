import type {MapPoint,RegionalPromotion,WorldState} from '../types/world';
import {REGIONAL_PROMOTION_HISTORY,REGIONAL_PROMOTION_LENGTH,regionalPromotionKey,regionalPromotionTileEndpoints} from './regionalPromotionEngine';
import {regionForPoint} from './simulationRegionGeometry';
import {terrainTileAt} from './terrainEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';

const equal=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((value,i)=>value===b[i]);
const stableParticipants=(ids:readonly string[])=>ids.every((id,i)=>i===0||ids[i-1]<id);
const kindSerial=(id:string,prefix:string,cap:number)=>id.startsWith(prefix)&&/^[1-9][0-9]*$/u.test(id.slice(prefix.length))&&
  Number.isSafeInteger(Number(id.slice(prefix.length)))&&Number(id.slice(prefix.length))<cap;
function livePath(world:WorldState,path:readonly MapPoint[],a:number,b:number):string[]|undefined{
  if(a>=path.length||b>=path.length)return undefined;
  const points=a<b?path.slice(a,b+1):path.slice(b,a+1).reverse();
  const ids=points.map(point=>terrainTileAt(world,point.x,point.y)?.id);
  return ids.some(id=>id===undefined)?undefined:[...new Set(ids as string[])];
}

/** Promotions describe already-observed native boundaries, never fabricate replay, geography, cargo or relationships. */
export function validateRegionalPromotions(world:WorldState,fail:(path:string)=>never):void{
  const state=world.regionalSimulation,rows=state?.promotions;
  if(!state||!rows?.length)return;
  const keyPath='regionalSimulation.promotions';
  const people=new Map(world.cultivators.map(person=>[person.id,person]));
  const locations=new Map(world.locations.map(place=>[place.id,place]));
  const couriers=new Map(world.couriers.dispatches.map(row=>[row.id,row]));
  const escorts=new Map(world.escorts.contracts.map(row=>[row.id,row]));
  const shipments=new Map(world.markets.shipments.map(row=>[row.id,row]));
  const sieges=new Map(world.sieges.map(row=>[row.id,row]));
  const registrations=new Map(state.registrations.filter(row=>row.kind==='actor').map(row=>[row.id,row]));
  const events=new Map<string,typeof world.events>();
  for(const event of world.events)(events.get(event.id)??(events.set(event.id,[]),events.get(event.id)!)).push(event);
  const keys=new Set<string>();
  const address=(row:Extract<RegionalPromotion,{sourceSiteId:string}>)=>{
    const from=locations.get(row.sourceSiteId),to=locations.get(row.destinationSiteId);
    return !!from&&!!to&&from.id!==to.id&&from.type!=='secret_realm'&&from.type!=='abyss'&&!isScopedExpeditionGate(from)&&
      to.type!=='secret_realm'&&to.type!=='abyss'&&!isScopedExpeditionGate(to)&&
      regionForPoint(world,from)===row.fromRegionId&&regionForPoint(world,to)===row.toRegionId;
  };
  for(const row of rows){
    const key=regionalPromotionKey(row);
    if(keys.has(key)||row.observedTick>world.tick||world.tick-row.observedTick>=REGIONAL_PROMOTION_HISTORY||
      row.startsTick!==row.observedTick+(row.kind==='courier_crossed'?0:1)||
      row.throughTick!==row.startsTick+REGIONAL_PROMOTION_LENGTH-1||row.fromRegionId===row.toRegionId)fail(`${keyPath}.clock`);
    keys.add(key);
    if(row.kind==='courier_crossed'||row.kind==='escort_crossed'){
      const region=regionalPromotionTileEndpoints(world,row.crossedTileIds);
      if(!region||region.fromRegionId!==row.fromRegionId||region.toRegionId!==row.toRegionId||
        !people.has(row.actorId)||Math.abs(row.endIndex-row.startIndex)<1||
        row.crossedTileIds.length>Math.abs(row.endIndex-row.startIndex)+1)fail(`${keyPath}.route`);
      if(row.kind==='courier_crossed'){
        if(!kindSerial(row.sourceId,'sealed-dispatch-',world.couriers.nextId))fail(`${keyPath}.courier`);
        const native=couriers.get(row.sourceId);
        if(native&&(native.acceptedTick===undefined||native.acceptedTick>=row.observedTick||
          native.courierId!==row.actorId&&native.originalCourierId!==row.actorId))fail(`${keyPath}.courier`);
        if(native?.lastAdvancedTick===row.observedTick&&native.path.length&&native.pathIndex===row.endIndex){
          const actual=livePath(world,native.path,row.startIndex,row.endIndex);
          if(!actual||!equal(actual,row.crossedTileIds))fail(`${keyPath}.courier.actual`);
        }
      }else{
        if(!kindSerial(row.sourceId,'escort-',world.markets.nextId)||!kindSerial(row.shipmentId,'caravan-',world.markets.nextId)||
          row.shipmentId.slice('caravan-'.length)!==row.sourceId.slice('escort-'.length)||
          row.startIndex>=row.endIndex)fail(`${keyPath}.escort`);
        const native=escorts.get(row.sourceId),shipment=shipments.get(row.shipmentId);
        if(native&&(native.shipmentId!==row.shipmentId||native.escortId!==row.actorId||native.acceptedTick===undefined||
          native.acceptedTick>row.observedTick)||shipment&&shipment.departedTick>=row.observedTick)fail(`${keyPath}.escort`);
        if(native?.acceptedTick===row.observedTick){
          if(row.startIndex!==0)fail(`${keyPath}.escort.pickup`);
          const signed=events.get(`evt-${row.observedTick}-${row.sourceId}-accepted`);
          if(signed&&(signed.length!==1||signed[0].tick!==row.observedTick||signed[0].category!=='diplomacy'||
            signed[0].locationId!==native.originId||!equal(signed[0].actorIds,[native.clientId,row.actorId])))
            fail(`${keyPath}.escort.pickup`);
        }
        if(native?.lastAdvancedTick===row.observedTick&&native.path.length&&native.pathIndex===row.endIndex){
          const actual=livePath(world,native.path,row.startIndex,row.endIndex);
          if(!actual||!equal(actual,row.crossedTileIds)||!equal(row.crossedTileIds,native.lastCrossedTileIds))
            fail(`${keyPath}.escort.actual`);
        }
      }
      continue;
    }
    if(!address(row))fail(`${keyPath}.address`);
    if(row.kind==='siege_arrived'){
      const siege=sieges.get(row.sourceId);
      if(!siege||siege.startedTick+2!==row.observedTick||siege.destinationId!==row.destinationSiteId||
        !people.has(row.actorId)||!siege.participantIds.includes(row.actorId)||
        row.eventId!==`evt-${row.observedTick}-dip-${row.sourceId}`)fail(`${keyPath}.siege`);
      const found=events.get(row.eventId);
      if(found&&(found.length!==1||found[0].tick!==row.observedTick||found[0].category!=='diplomacy'||
        found[0].locationId!==row.destinationSiteId||found[0].witnessScope==='participants'||
        !equal(found[0].actorIds,siege.participantIds)))fail(`${keyPath}.siege.event`);
    }else{
      const actor=people.get(row.sourceId),registration=registrations.get(row.sourceId);
      if(!actor||!registration||registration.registeredTick>=row.observedTick||registration.originRegionId!==row.toRegionId||
        !stableParticipants(row.witnessIds)||row.witnessIds.some(id=>id===row.sourceId||!people.has(id)))fail(`${keyPath}.return`);
      const eventId=`evt-${row.observedTick}-${row.sourceId}-explore`;
      if(row.eventId!==undefined&&row.eventId!==eventId)fail(`${keyPath}.return.event`);
      const found=events.get(eventId);
      if(found&&(row.eventId!==eventId||found.length!==1||found[0].tick!==row.observedTick||found[0].category!=='breakthrough'||
        found[0].locationId!==row.destinationSiteId||!equal(found[0].actorIds,[row.sourceId])))
        fail(`${keyPath}.return.event`);
    }
  }
}
