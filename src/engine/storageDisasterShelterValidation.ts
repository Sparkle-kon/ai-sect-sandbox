import type {DisasterShelter,DisasterShelterParty} from '../types/disasterShelter';
import type {WorldState} from '../types/world';
import {DISASTER_SHELTER_MAX_OPEN,DISASTER_SHELTER_OFFER_TICKS,disasterShelterOpen,disasterShelterRoomHeld,disasterShelterStrandedInterior} from './disasterShelterCheckpoint';
import {routeWarningHazardValid} from './routeWarningProof';
import {housingShelterProof,seasonalHousingRoomHeld} from './seasonalHousingEngine';
import {terrainTileAt} from './terrainEngine';
import {supplyLegEndpoints} from './villageSupplyAccounting';
import {VILLAGE_WORK_RULES} from './villageWorksEngine';

type Fail=(field:string)=>never;
const caseId=/^disaster-shelter-([1-9][0-9]*)$/u;
const eventPrefix='evt-disaster-shelter-';
const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((value,index)=>value===b[index]);
const living=(actor:WorldState['cultivators'][number]|undefined)=>!!actor?.alive&&actor.hp>0;

type EventProof={row:DisasterShelter;tick:number;siteId?:string};

/** Replay on immutable native proofs; current actor position corroborates only an active custody, not old history. */
export function validateDisasterShelter(world:WorldState,fail:Fail):void{
  const state=world.disasterShelter;
  const exposed=(anchors:readonly {id:string}[])=>anchors.some(row=>row.id.startsWith(eventPrefix));
  if(exposed(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(chapter=>exposed(chapter.anchors))||
    world.coldHistory.chapters.some(chapter=>exposed(chapter.anchors)))return fail('disasterShelter.archive');
  if(!state){
    if(world.events.some(event=>event.id.startsWith(eventPrefix)))return fail('disasterShelter.event');
    return;
  }
  const {cases}=state;
  if(!cases.length)return fail('disasterShelter.retention');
  const actors=new Map(world.cultivators.map(row=>[row.id,row]));
  const villagers=new Map(world.settlements.villages.map(row=>[row.id,row]));
  const members=new Map(world.households.members.map(row=>[row.volunteerId,row]));
  const household=new Map(world.households.groups.map(row=>[row.id,row]));
  const sites=new Map(world.locations.map(row=>[row.id,row]));
  const cells=new Map(world.terrain.tiles.map(row=>[row.id,row]));
  const sources=new Map(world.settlements.records.map(row=>[row.id,row]));
  const agreements=new Map(world.villageSupply.agreements.map(row=>[row.id,row]));
  const kept=new Set<string>(),heldGuests=new Set<string>(),heldRooms=new Map<string,number>();
  const involvedByGuest=new Map<string,number>();
  let openCount=0,previous=0,previousOffer=-1;
  const byId=new Map<string,EventProof>();
  const turn=(tick:number)=>Number.isSafeInteger(tick)&&tick>=1&&tick<=world.tick;
  const offerBefore=(party:DisasterShelterParty,at:number)=>{
    const member=members.get(party.volunteerId),actor=actors.get(party.actorId),village=villagers.get(party.settlementId);
    const group=household.get(party.householdId);
    if(!actor||actor.age<18||!member||member.recruitedId!==party.actorId||party.actorId!==`recruit-${party.volunteerId}`||
      member.householdId!==party.householdId||member.settlementId!==party.settlementId||member.registeredTick>=at||
      !group?.presences.some(row=>row.settlementId===party.settlementId)||village?.locationId!==party.siteId)return false;
    return member.settledTick!==undefined&&
      (member.status==='recruited'&&member.settledTick<=at||
       member.status==='deceased'&&member.settledTick>=at);
  };
  const event=(row:DisasterShelter,tick:number,phase:string,siteId?:string)=>{
    const id=`evt-${row.id}-${tick}-${phase}`;
    if(byId.has(id))return fail('disasterShelter.event');
    byId.set(id,{row,tick,siteId});
  };

  for(const row of cases){
    const {guest,host,hazard,path,offeredTick,expiresTick,status,steps,pathIndex,acceptedTick,closedTick,closeReason}=row;
    const serial=Number(caseId.exec(row.id)?.[1]);
    const open=disasterShelterOpen(row);
    const origin=sites.get(guest.siteId),target=sites.get(host.siteId);
    const originTile=origin&&terrainTileAt(world,origin.x,origin.y),destinationTile=target&&terrainTileAt(world,target.x,target.y);
    const terminalReason=status==='declined'||status==='withdrawn'||status==='expired'?status:
      status==='stranded'||status==='lost'?closeReason:undefined;
    if(!Number.isSafeInteger(serial)||serial<=previous||serial>=state.nextId||offeredTick<previousOffer||
      !turn(offeredTick)||expiresTick!==offeredTick+DISASTER_SHELTER_OFFER_TICKS||
      guest.actorId===host.actorId||guest.householdId===host.householdId||guest.settlementId===host.settlementId||
      guest.siteId===host.siteId||!offerBefore(guest,offeredTick)||!offerBefore(host,offeredTick))
      return fail('disasterShelter.references');
    previous=serial;previousOffer=offeredTick;
    if(!originTile||!destinationTile||path.length<2||new Set(path).size!==path.length||
      path[0]!==originTile.id||path.at(-1)!==destinationTile.id||pathIndex>=path.length)return fail('disasterShelter.route');
    for(let index=1;index<path.length;index++){
      const last=cells.get(path[index-1]),next=cells.get(path[index]);
      if(!last||!next||Math.abs(last.col-next.col)+Math.abs(last.row-next.row)!==1)return fail('disasterShelter.route');
    }
    const disaster=sources.get(row.disasterRecordId);
    if(!disaster||disaster.kind!=='disaster'||disaster.tick!==row.disasterTick||
      disaster.settlementId!==guest.settlementId||hazard.tileId!==originTile.id||row.disasterTick>=offeredTick||hazard.intensity<2||
      row.disasterRecordId!==`settlement-${row.disasterTick}-disaster-${guest.settlementId}-${hazard.id}`||
      !routeWarningHazardValid(world,hazard,row.disasterTick)||!routeWarningHazardValid(world,hazard,offeredTick))
      return fail('disasterShelter.disaster');
    const agreement=agreements.get(row.agreementId);
    if(!agreement||!agreement.path||agreement.acceptedTick===undefined||row.deliveredTick<=agreement.acceptedTick||
      row.deliveredTick>=row.disasterTick||!agreement.legs?.some(candidate=>{
        const endpoints=supplyLegEndpoints(agreement,candidate.good);
        return endpoints.source===guest.settlementId&&endpoints.destination===host.settlementId&&candidate.phase==='delivered'&&
          candidate.settledTick===row.deliveredTick&&candidate.checkpoint===path.length-1&&
          same(path,candidate.good==='earth_root'?agreement.path!:[...agreement.path!].reverse());
      }))return fail('disasterShelter.deliveredRoute');
    if(!housingShelterProof(world,host.settlementId,row.shelterProjectId,offeredTick))return fail('disasterShelter.shelter');
    event(row,offeredTick,'offer',guest.siteId);

    const holds=disasterShelterRoomHeld(row);
    if(open!==(closedTick===undefined)||closedTick!==undefined&&(!turn(closedTick)||closedTick<offeredTick)||
      (status==='stranded'||status==='lost')&&closeReason!=='party_unavailable'&&closeReason!=='site_unavailable'||
      closeReason!==terminalReason||
      status==='expired'&&(acceptedTick!==undefined||closedTick!==expiresTick)||
      status==='declined'&&(acceptedTick!==undefined||closedTick===undefined||closedTick<=offeredTick||closedTick>=expiresTick)||
      status==='withdrawn'&&(steps.length!==0||closedTick===undefined||acceptedTick===undefined&&closedTick>=expiresTick)||
      status==='lost'&&(closeReason!=='party_unavailable'||actors.get(guest.actorId)?.alive!==false)||
      status==='stranded'&&closeReason==='party_unavailable'&&(acceptedTick!==undefined||actors.get(host.actorId)?.alive!==false)||
      status==='stranded'&&closeReason==='site_unavailable'&&acceptedTick===undefined||
      status==='offered'&&world.tick>=expiresTick)
      return fail('disasterShelter.closure');
    if(open||disasterShelterStrandedInterior(row)){
      if(kept.has(guest.actorId))return fail('disasterShelter.overlap');
      kept.add(guest.actorId);
      if(++openCount>DISASTER_SHELTER_MAX_OPEN)return fail('disasterShelter.overlap');
    }
    const guestThrough=involvedByGuest.get(guest.actorId);
    if(guestThrough!==undefined&&offeredTick<guestThrough)return fail('disasterShelter.overlap');
    involvedByGuest.set(guest.actorId,closedTick??Infinity);
    if(holds){
      if(heldGuests.has(guest.actorId))return fail('disasterShelter.capacity');
      heldGuests.add(guest.actorId);
      heldRooms.set(host.settlementId,(heldRooms.get(host.settlementId)??0)+1);
    }

    if(acceptedTick!==undefined){
      if(!turn(acceptedTick)||acceptedTick<=offeredTick||acceptedTick>=expiresTick||acceptedTick>(closedTick??world.tick)||
        !routeWarningHazardValid(world,hazard,acceptedTick)||
        status==='offered'||status==='declined'||status==='expired')return fail('disasterShelter.consent');
      event(row,acceptedTick,'accept',guest.siteId);
    }else if(status==='reserved'||status==='outbound'||status==='occupied'||status==='returning'||status==='returned'||
      steps.length||row.returnRequestedTick!==undefined)return fail('disasterShelter.consent');

    let index=0,previousStep=acceptedTick??Infinity;
    let departed:number|undefined,arrived:number|undefined,reverseDeparture:number|undefined,arrivedHome:number|undefined;
    const {returnRequestedTick:request}=row;
    if(request!==undefined){
      if(!turn(request)||request>(closedTick??world.tick))return fail('disasterShelter.return');
      event(row,request,'return-requested',host.siteId);
    }
    for(const step of steps){
      const {tick,direction}=step;
      const from=path[index];
      const fromAllowsOriginHazard=direction==='outbound'&&index===0;
      if(!turn(tick)||tick<=previousStep||tick>(closedTick??world.tick))return fail('disasterShelter.step');
      previousStep=tick;
      if(direction==='outbound'){
        if(arrived!==undefined||request!==undefined&&tick>=request)return fail('disasterShelter.step');
        index++;
        departed??=tick;
        if(index===path.length-1){arrived=tick;event(row,tick,'occupied',host.siteId);}
        else event(row,tick,'outbound');
      }else{
        if(!arrived||request===undefined||tick<=request||index<=0)return fail('disasterShelter.return');
        index--;
        reverseDeparture??=tick;
        if(index===0){arrivedHome=tick;event(row,tick,'returned',guest.siteId);}
        else event(row,tick,'returning');
      }
      if(path[index]!==step.tileId||step.pathIndex!==index||
        world.mapHazards.some(active=>(active.tileId===step.tileId||
          active.tileId===from&&(!fromAllowsOriginHazard||active.id!==hazard.id))&&active.intensity>=2&&
          active.createdTick<tick&&routeWarningHazardValid(world,active,tick)))
        return fail('disasterShelter.step');
    }
    if(pathIndex!==index||row.departedTick!==departed||row.arrivedTick!==arrived||
      row.returnDepartedTick!==reverseDeparture||row.returnedTick!==arrivedHome||
      request!==undefined&&(arrived===undefined||request<=arrived)||
      status==='reserved'&&steps.length>0||status==='outbound'&&(departed===undefined||arrived!==undefined)||
      status==='occupied'&&(arrived===undefined||request!==undefined)||status==='returning'&&(request===undefined||arrivedHome!==undefined)||
      (status==='returned')!==(arrivedHome!==undefined)||status==='returned'&&closedTick!==arrivedHome)
      return fail('disasterShelter.progress');

    const visitor=actors.get(guest.actorId);
    if(open&&!living(visitor)||status==='offered'&&!living(actors.get(host.actorId)))return fail('disasterShelter.presence');
    if(open&&status!=='offered'||status==='stranded'&&index>0&&index<path.length-1&&living(visitor)){
      const currentAnchor=arrived===undefined?guest.siteId:host.siteId;
      // Lower anchor IDs stay at the last actual settlement, never at an invented intermediate site.
      if(!visitor||visitor.positionPlane!==undefined||visitor.locationId!==currentAnchor||
        status!=='stranded'&&(origin?.type==='secret_realm'||origin?.type==='abyss'||target?.type==='secret_realm'||target?.type==='abyss'))
        return fail('disasterShelter.presence');
    }
    if(closedTick!==undefined&&status!=='returned')event(row,closedTick,status,
      status==='stranded'||status==='lost'?undefined:guest.siteId);
  }

  for(const seasonal of world.seasonalHousing.claims){
    if(!seasonalHousingRoomHeld(seasonal,world.tick))continue;
    if(heldGuests.has(seasonal.guestId))return fail('disasterShelter.capacity');
    if(heldRooms.has(seasonal.settlementId))
      heldRooms.set(seasonal.settlementId,(heldRooms.get(seasonal.settlementId)??0)+1);
  }
  for(const [id,used] of heldRooms){
    // Once a room is truly promised, a later birth or ordinary immigration cannot
    // falsify its historic consent or justify silently removing a physical guest.
    const built=world.villageWorks.projects.filter(project=>project.settlementId===id&&
      housingShelterProof(world,id,project.id,world.tick)).length*VILLAGE_WORK_RULES.shelter.capacityGain;
    if(used>built)return fail('disasterShelter.capacity');
  }
  const seen=new Set<string>();
  for(const fact of world.events){
    if(!fact.id.startsWith(eventPrefix))continue;
    const proof=byId.get(fact.id);
    if(!proof||seen.has(fact.id)||fact.tick!==proof.tick||fact.locationId!==proof.siteId||
      fact.category!=='diplomacy'||fact.witnessScope!=='participants'||
      !same(fact.actorIds,[proof.row.host.actorId,proof.row.guest.actorId]))return fail('disasterShelter.event');
    seen.add(fact.id);
  }
}
