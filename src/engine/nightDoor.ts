import type {Cultivator,LLMDecisionPayload,MapHazard,WorldEvent,WorldState} from '../types/world';
import type {NightDoorBlock,NightDoorEncounter,NightDoorOption,NightDoorView} from '../types/nightDoor';
import type {PilgrimageForkChoice,PilgrimageForkRecord} from '../types/pilgrimageFork';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {housingShelterProof,housingVacantCapacity,seasonalHousingRoomHeld} from './seasonalHousingEngine';
import {disasterShelterRoomHeld} from './disasterShelterCheckpoint';
import {knownMapLocations} from './terrainEngine';
import {nightDoorGuestHeld,nightDoorHouseholdHeld} from './nightDoorBeds';
import {acquaintanceSource,adjacentNight,arrivalSource,ARRIVAL_WINDOW,BED_WINDOW,blockProof,doorId,ESCORT_WINDOW,
  exactNight,nightActor,nightEventId,nightFork,nightReceipt,nightReceiptMatches,nightSafe,nightSite,oldChoice,OFFER_WINDOW} from './nightDoorProof';
export {isPrivateNightDoorEvent} from './nightDoorProof';
export type {NightDoorMove,NightDoorOption,NightDoorView} from '../types/nightDoor';

const state=(world:WorldState)=>world.nightDoors??={blocks:[],encounters:[]};
const canonical=(world:WorldState,actor:Cultivator)=>nightActor(world,actor.id)===actor&&actor.alive&&actor.hp>0&&actor.age>=18&&actor.positionPlane===undefined;
const local=(world:WorldState,actor:Cultivator,id:string)=>canonical(world,actor)&&isGrandSiegeFighterPresent(world,actor,id);
const exactEvent=(world:WorldState,id:string)=>exactNight(world.events,row=>row.id===id);
function localHost(world:WorldState,actor:Cultivator,villageId:string,siteId:string,householdId?:string){
  if(!local(world,actor,siteId))return;
  const member=exactNight(world.households.members,row=>row.recruitedId===actor.id);
  const household=member&&exactNight(world.households.groups,row=>row.id===member.householdId);
  return member?.status==='recruited'&&member.settlementId===villageId&&(!householdId||householdId===member.householdId)&&
    household?.presences.filter(row=>row.settlementId===villageId).length===1&&
    household.presences.some(row=>row.settlementId===villageId&&row.adults>0)?member:undefined;
}
function vacant(world:WorldState,row:NightDoorEncounter,tick:number){
  const holds=world.seasonalHousing.claims.filter(claim=>seasonalHousingRoomHeld(claim,tick));
  const evacuation=world.disasterShelter?.cases.filter(disasterShelterRoomHeld)??[];
  return !nightDoorGuestHeld(world,row.guestId,tick)&&!nightDoorHouseholdHeld(world,row.hostHouseholdId,tick)&&
    !holds.some(claim=>claim.guestId===row.guestId||claim.householdId===row.hostHouseholdId)&&
    !evacuation.some(claim=>claim.guest.actorId===row.guestId||claim.host.householdId===row.hostHouseholdId)&&
    holds.filter(claim=>claim.settlementId===row.villageId).length+
      evacuation.filter(claim=>claim.host.settlementId===row.villageId).length<
      housingVacantCapacity(world,row.villageId,tick);
}
function eligibleShelter(world:WorldState,siteId:string,tick:number){
  const village=exactNight(world.settlements.villages,row=>row.locationId===siteId);
  if(!village||village.population<1)return;
  const project=world.villageWorks.projects.find(row=>housingShelterProof(world,village.id,row.id,tick));
  return project?{village,project}:undefined;
}

export function recordNightDoorBlocked(world:WorldState,fork:PilgrimageForkRecord,choice:PilgrimageForkChoice,hazard:MapHazard):void{
  const dest=choice.targetLocationId,actor=nightActor(world,choice.actorId);
  if(nightFork(world,fork.id)!==fork||oldChoice(fork,choice.actorId)!==choice||!dest||choice.status!=='traveling'||
    !actor||!canonical(world,actor)||actor.locationId!==fork.siteId||!world.mapHazards.includes(hazard)||hazard.intensity<2||
    !eligibleShelter(world,dest,world.tick)||world.nightDoors?.blocks.some(row=>row.forkId===fork.id&&row.actorId===actor.id))return;
  const row:NightDoorBlock={forkId:fork.id,actorId:actor.id,destinationId:dest,tick:world.tick,pathIndex:choice.pathIndex!,
    hazardId:hazard.id,hazardTileId:hazard.tileId,hazardCreatedTick:hazard.createdTick,hazardExpiresTick:hazard.expiresTick};
  if(blockProof(world,row,fork,choice))state(world).blocks.push(row);
}
export function recordNightDoorArrival(world:WorldState,fork:PilgrimageForkRecord,choice:PilgrimageForkChoice,event:WorldEvent):void{
  const ledger=world.nightDoors;
  if(!ledger||nightFork(world,fork.id)!==fork||oldChoice(fork,choice.actorId)!==choice||
    choice.status!=='arrived'||choice.steps?.at(-1)?.tick!==world.tick||!choice.targetLocationId)return;
  const siteId=choice.targetLocationId,guest=nightActor(world,choice.actorId);
  const block=exactNight(ledger.blocks,row=>row.forkId===fork.id&&row.actorId===choice.actorId);
  const shelter=eligibleShelter(world,siteId,world.tick);
  if(!block||!blockProof(world,block,fork,choice)||block.tick>=world.tick||!guest||!local(world,guest,siteId)||!shelter||!nightSafe(world,siteId,world.tick))return;
  const id=doorId(fork.id,guest.id);
  if(ledger.encounters.some(row=>row.id===id))return;
  for(const host of world.cultivators.filter(actor=>actor.id!==guest.id&&actor.locationId===siteId)){
    const household=localHost(world,host,shelter.village.id,siteId);
    if(!household)continue;
    const row:NightDoorEncounter={id,forkId:fork.id,guestId:guest.id,hostId:host.id,hostHouseholdId:household.householdId,
      villageId:shelter.village.id,siteId,shelterProjectId:shelter.project.id,arrivalTick:world.tick,arrivalEventId:event.id};
    if(!arrivalSource(world,row,event))continue;
    const nativeTalks=world.witnessedPersonalStory.scenes.filter(scene=>scene.kind==='socialize'&&scene.siteId===siteId&&
      scene.actorIds.includes(host.id)&&scene.witnessIds.includes(host.id)&&scene.actorIds.length===2&&scene.tick<world.tick);
    if(!nativeTalks.some(scene=>scene.actorIds.includes(guest.id))){
      for(const scene of [...nativeTalks].reverse()){
        const other=scene.actorIds.find(id=>id!==host.id&&id!==guest.id),original=exactEvent(world,scene.eventId);
        if(!other||!nightActor(world,other)||!original)continue;
        const candidate={...row,acquaintanceId:other,acquaintanceEventId:original.id};
        if(!acquaintanceSource(world,candidate,original))continue;
        row.acquaintanceId=other;row.acquaintanceEventId=original.id;break;
      }
    }
    ledger.encounters.push(row);return;
  }
}
export function advanceNightDoors(world:WorldState):void{
  const ledger=world.nightDoors;
  if(!ledger)return;
  ledger.blocks=ledger.blocks.filter(block=>{
    if(ledger.encounters.some(row=>row.forkId===block.forkId&&row.guestId===block.actorId))return true;
    const fork=nightFork(world,block.forkId),choice=fork&&oldChoice(fork,block.actorId);
    return choice?.status==='traveling';
  });
  if(!ledger.blocks.length&&!ledger.encounters.length)delete world.nightDoors;
}
function currentSource(world:WorldState,row:NightDoorEncounter){
  const route=nightFork(world,row.forkId),choice=route&&oldChoice(route,row.guestId);
  const source=exactEvent(world,row.arrivalEventId);
  return choice?.status==='arrived'&&choice.targetLocationId===row.siteId&&choice.steps?.at(-1)?.tick===row.arrivalTick&&
    source&&arrivalSource(world,row,source);
}
function exactRefuge(world:WorldState,row:NightDoorEncounter,host:Cultivator,guest:Cultivator,tick:number){
  const knowledge=new Set(knownMapLocations(world,guest).map(site=>site.id));
  return knownMapLocations(world,host).filter(site=>nightSite(world,site.id)===site&&knowledge.has(site.id)&&
    adjacentNight(world,row.siteId,site.id)&&nightSafe(world,site.id,tick))
    .sort((a,b)=>a.id<b.id?-1:1)[0];
}
export function availableNightDoorActions(actor:Cultivator,world:WorldState,tick=world.tick+1):NightDoorOption[]{
  if(!world.nightDoors||!canonical(world,actor)||(tick!==world.tick&&tick!==world.tick+1))return [];
  for(const row of [...world.nightDoors.encounters].reverse()){
    if(row.closedTick!==undefined||tick<=row.arrivalTick||actor.id!==row.hostId&&actor.id!==row.guestId||
      !local(world,actor,row.siteId)||!currentSource(world,row))continue;
    const host=nightActor(world,row.hostId),guest=nightActor(world,row.guestId),offer=row.offer;
    if(!host||!guest||!canonical(world,host)||!canonical(world,guest))continue;
    const base={action:'NIGHT_DOOR',targetNightDoorId:row.id} as const;
    const choices:NightDoorOption[]=[];
    if(offer?.acceptedTick!==undefined){
      if(offer.move==='escort'&&offer.refugeId&&offer.expiresTick!==undefined&&offer.acceptedTick<tick&&tick<offer.expiresTick&&
        !offer.crossed?.some(item=>item.actorId===actor.id)&&knownMapLocations(world,actor).some(site=>site.id===offer.refugeId)&&
        adjacentNight(world,row.siteId,offer.refugeId)&&nightSafe(world,offer.refugeId,tick))
        choices.push({...base,nightDoorMove:'cross',targetLocationId:offer.refugeId});
      if(actor===guest&&!row.identifiedTick&&tick-row.arrivalTick<=ARRIVAL_WINDOW&&local(world,host,row.siteId))
        choices.push({...base,nightDoorMove:'identify'});
      if(choices.length)return choices;
      continue;
    }
    if(tick-row.arrivalTick>ARRIVAL_WINDOW||!localHost(world,host,row.villageId,row.siteId,row.hostHouseholdId)||
      !local(world,guest,row.siteId)||!housingShelterProof(world,row.villageId,row.shelterProjectId,tick)||!nightSafe(world,row.siteId,tick))continue;
    if(actor===host){
      choices.push({...base,nightDoorMove:'close'});
      if(!offer){
        if(vacant(world,row,tick))choices.push({...base,nightDoorMove:'shelter'});
        const refuge=exactRefuge(world,row,host,guest,tick);
        if(refuge)choices.push({...base,nightDoorMove:'escort',targetLocationId:refuge.id});
      }
    }
    if(actor===guest){
      if(row.identifiedTick===undefined)choices.push({...base,nightDoorMove:'identify'});
      if(offer&&offer.tick<tick&&tick-offer.tick<=OFFER_WINDOW&&
        (offer.move==='shelter'?vacant(world,row,tick):!!offer.refugeId&&adjacentNight(world,row.siteId,offer.refugeId)&&
          nightSafe(world,offer.refugeId,tick)&&[host,guest].every(body=>knownMapLocations(world,body).some(site=>site.id===offer.refugeId))))
        choices.push({...base,nightDoorMove:'accept'});
    }
    if(choices.length)return choices;
  }
  return [];
}
export function resolveNightDoorAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload,
  crossNative:(siteId:string)=>boolean):WorldEvent|null{
  if(decision.chosenAction!=='NIGHT_DOOR'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','nightDoorMove','targetNightDoorId','targetLocationId'].includes(key)))return null;
  const option=availableNightDoorActions(actor,world,world.tick).find(row=>row.targetNightDoorId===decision.targetNightDoorId&&
    row.nightDoorMove===decision.nightDoorMove&&row.targetLocationId===decision.targetLocationId);
  const row=option&&exactNight(world.nightDoors?.encounters??[],row=>row.id===option.targetNightDoorId);
  if(!row||!option)return null;
  const move=option.nightDoorMove;
  if(move==='identify')row.identifiedTick=world.tick;
  else if(move==='close')row.closedTick=world.tick;
  else if(move==='shelter'||move==='escort')row.offer={move,tick:world.tick,...(option.targetLocationId?{refugeId:option.targetLocationId}:{})};
  else if(move==='accept'){
    const offer=row.offer!;
    offer.acceptedTick=world.tick;offer.expiresTick=world.tick+(offer.move==='shelter'?BED_WINDOW:ESCORT_WINDOW);
  }else{
    const refuge=option.targetLocationId;
    if(!refuge||!crossNative(refuge)||actor.locationId!==refuge||actor.locationId===row.siteId)return null;
    (row.offer!.crossed??=[]).push({actorId:actor.id,tick:world.tick});
  }
  actor.currentAction='NIGHT_DOOR';
  return nightReceipt(world,row,move,actor.id);
}
export function projectNightDoor(world:WorldState,actor:Cultivator):NightDoorView|undefined{
  if(!world.nightDoors||!canonical(world,actor))return;
  const options=availableNightDoorActions(actor,world);
  for(const row of [...world.nightDoors.encounters].reverse()){
    const host=actor.id===row.hostId;
    if(!host&&actor.id!==row.guestId||!currentSource(world,row))continue;
    const site=nightSite(world,row.siteId);
    if(!site)continue;
    const atDoor=local(world,actor,site.id);
    const cross=row.offer?.crossed?.find(item=>item.actorId===actor.id&&item.tick===world.tick);
    if(!atDoor&&!(cross&&actor.locationId===row.offer?.refugeId))continue;
    const mine=cross?'cross':host&&row.closedTick===world.tick?'close':!host&&row.offer?.acceptedTick===world.tick?'accept':
      host&&row.offer?.tick===world.tick?row.offer.move:!host&&row.identifiedTick===world.tick?'identify':undefined;
    const original=mine&&exactEvent(world,nightEventId(row,mine,actor.id,world.tick));
    const receipt=mine&&original&&nightReceiptMatches(world,row,mine,actor.id,world.tick,original)?
      {title:original.title,description:original.description}:undefined;
    const offered=options.some(option=>option.targetNightDoorId===row.id);
    const arrived=row.arrivalTick===world.tick;
    const lodged=row.offer?.move==='shelter'&&row.offer.acceptedTick!==undefined&&row.offer.expiresTick!>world.tick&&row.closedTick===undefined;
    if(!offered&&!receipt&&!arrived&&!lodged)continue;
    const acquaintance=row.acquaintanceEventId&&exactEvent(world,row.acquaintanceEventId);
    const uncertain=row.identifiedTick===undefined&&!!acquaintance&&acquaintanceSource(world,row,acquaintance);
    const identify=row.identifiedTick===undefined?undefined:exactEvent(world,nightEventId(row,'identify',row.guestId,row.identifiedTick));
    const named=identify&&row.identifiedTick!==undefined&&nightReceiptMatches(world,row,'identify',row.guestId,row.identifiedTick,identify)?
      nightActor(world,row.guestId)?.name.replace(/[\p{C}]/gu,'').trim().slice(0,70):undefined;
    return {siteId:site.id,siteName:site.name,role:host?'host':'guest',options:offered?options:[],
      ...(host&&uncertain?{uncertain:true as const}:{}),...(named?{identifiedGuestName:named}:{}),...(receipt?{receipt}:{})};
  }
}
