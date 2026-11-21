import type {HousingClaim,HousingMovement,WorldEvent,WorldState} from '../types/world';
import { routeWarningHazardValid } from './routeWarningProof';
import { housingShelterProof } from './seasonalHousingEngine';
import { terrainTileAt } from './terrainEngine';

export function validateSeasonalHousing(world:WorldState,actors:ReadonlySet<string>,fail:(path:string)=>never):void {
  const {claims,nextId}=world.seasonalHousing;
  if(claims.length!==nextId-1)return fail('seasonalHousing.nextId');
  if(!claims.length)return;
  const ids=new Set<string>(),openHouseholds=new Set<string>(),openGuests=new Set<string>();
  const sites=new Map(world.locations.map(site=>[site.id,site]));
  const villages=new Map(world.settlements.villages.map(row=>[row.id,row]));
  const groups=new Set(world.households.groups.map(({id})=>id));
  const natives=new Map<string,WorldEvent|null>();
  for(const item of world.events)natives.set(item.id,natives.has(item.id)?null:item);
  const knownPublic=(siteId:string)=>{
    const site=sites.get(siteId);
    return site&&site.type!=='secret_realm'&&site.type!=='abyss';
  };
  const nativeMovement=(row:HousingClaim,movement:HousingMovement,token:'arrived'|'moved_out')=>{
    if(movement.fromSiteId===movement.toSiteId||!knownPublic(movement.fromSiteId)||!knownPublic(movement.toSiteId)||
      movement.tick>world.tick)return false;
    const original=natives.get(`evt-${row.id}-${movement.tick}-${token}`);
    return original!==null&&(!original||(original.tick===movement.tick&&original.witnessScope==='participants'&&
      original.category==='diplomacy'&&original.locationId===row.siteId&&original.actorIds.length===2&&
      original.actorIds[0]===row.hostId&&original.actorIds[1]===row.guestId));
  };
  for(const row of claims){
    const serial=Number(row.id.slice('housing-claim-'.length));
    const hostRecord=world.households.members.find(item=>item.recruitedId===row.hostId&&
      item.householdId===row.householdId&&item.settlementId===row.settlementId);
    if(!Number.isSafeInteger(serial)||serial<1||serial>=nextId||row.id!==`housing-claim-${serial}`||ids.has(row.id)||
      !actors.has(row.hostId)||!actors.has(row.guestId)||row.hostId===row.guestId||!groups.has(row.householdId)||!hostRecord||
      !knownPublic(row.siteId)||villages.get(row.settlementId)?.locationId!==row.siteId||
      !housingShelterProof(world,row.settlementId,row.shelterProjectId,row.offeredTick)||
      row.offeredTick>world.tick||row.seasonStartTick-row.offeredTick<2||row.seasonStartTick-row.offeredTick>3||
      row.seasonEndTick!==row.seasonStartTick+3||row.expiresTick!==row.seasonStartTick+1)
      return fail('seasonalHousing.claims.source');
    ids.add(row.id);
    const {acceptedTick,arriveByTick,arrival,checkedInTick,departure,endedTick,hazard,reason,status}=row;
    if(acceptedTick===undefined?(arriveByTick!==undefined||arrival!==undefined||checkedInTick!==undefined):
      (acceptedTick<=row.offeredTick||acceptedTick>=row.expiresTick||acceptedTick>world.tick||arriveByTick!==row.seasonEndTick))
      return fail('seasonalHousing.claims.booking');
    if(arrival&&(acceptedTick===undefined||arrival.tick<=acceptedTick||arrival.tick+1>=row.seasonEndTick||
        arrival.toSiteId!==row.siteId||!nativeMovement(row,arrival,'arrived'))||
      checkedInTick!==undefined&&(!arrival||checkedInTick<=arrival.tick||checkedInTick<row.seasonStartTick||
        checkedInTick>=row.seasonEndTick||checkedInTick>world.tick)||
      departure&&(checkedInTick===undefined||departure.tick<=checkedInTick||departure.tick>=row.seasonEndTick||
        departure.fromSiteId!==row.siteId||!nativeMovement(row,departure,'moved_out')))
      return fail('seasonalHousing.claims.movement');
    if(endedTick!==undefined&&(endedTick>world.tick||endedTick<row.offeredTick||endedTick<(acceptedTick??0)||
      endedTick<(arrival?.tick??0)||endedTick<(checkedInTick??0))||
      status==='offered'&&acceptedTick!==undefined||
      status==='reserved'&&(acceptedTick===undefined||checkedInTick!==undefined)||
      status==='occupied'&&checkedInTick===undefined||
      status==='moved_out'&&(!departure||endedTick!==departure.tick||reason!==undefined||hazard)||
      status!=='moved_out'&&departure||
      status!=='closed'&&status!=='moved_out'&&(reason!==undefined||endedTick!==undefined||hazard)||
      status==='closed'&&(endedTick===undefined||reason===undefined||
        reason==='guest_declined'&&(acceptedTick!==undefined||endedTick<=row.offeredTick||endedTick>=row.expiresTick)||
        reason==='guest_withdrew'&&(acceptedTick===undefined||checkedInTick!==undefined)||
        reason==='offer_expired'&&(acceptedTick!==undefined||endedTick<row.expiresTick)||
        reason==='season_ended'&&(acceptedTick===undefined||endedTick<row.seasonEndTick)||
        reason==='no_spare_room'&&acceptedTick===undefined||
        reason==='route_interrupted'&&!arrival))
      return fail('seasonalHousing.claims.outcome');
    if((reason==='unsafe_shelter')!==(hazard!==undefined))return fail('seasonalHousing.claims.hazard');
    const site=sites.get(row.siteId);
    if(hazard&&(endedTick===undefined||hazard.intensity<2||!site||terrainTileAt(world,site.x,site.y)?.id!==hazard.tileId||
        !routeWarningHazardValid(world,hazard,endedTick)))return fail('seasonalHousing.claims.hazard');
    if((status==='offered'&&world.tick<row.expiresTick||(status==='reserved'||status==='occupied')&&world.tick<row.seasonEndTick)){
      if(openHouseholds.has(row.householdId)||openGuests.has(row.guestId))return fail('seasonalHousing.claims.concurrent');
      openHouseholds.add(row.householdId);openGuests.add(row.guestId);
    }
  }
}
