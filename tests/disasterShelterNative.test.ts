import {describe,expect,it} from 'vitest';
import {availableDisasterShelterActions} from '../src/engine/disasterShelterEngine';
import {disasterShelterCheckpoint,disasterShelterRoomHeld} from '../src/engine/disasterShelterCheckpoint';
import {seasonalHousingRoomHeld} from '../src/engine/seasonalHousingEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {villageEvolutionPath} from '../src/engine/villageEvolutionEngine';
import type {WorldState} from '../src/types/world';
import {plot} from './fixtures/villageEvolutionNativeFixture';
import {destinationHouseholdId,destinationSettlementId,harmedNativeShelter,originHouseholdId,originSettlementId,
  shelterAccepted,shelterActor,shelterCase,shelterDecision,shelterGuest,shelterHost,shelterMiasma,shelterOffered,
  shelterOrder,shelterRequire,shelterTilePoint,shelterTurn} from './disasterShelterNativeFixture';

const checkpoint=(world:WorldState)=>{
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
};
const parity=(world:WorldState)=>{
  expect(encodeEraWorldSave(shelterTurn(checkpoint(world)))).toBe(encodeEraWorldSave(shelterTurn(world)));
};
const caseRoomHeld=(world:WorldState)=>{const row=shelterCase(world);return row?disasterShelterRoomHeld(row):false;};
const noChangeOfHome=(world:WorldState)=>{
  expect(world.households.members.find(row=>row.recruitedId===shelterGuest))
    .toMatchObject({householdId:originHouseholdId,settlementId:originSettlementId,status:'recruited'});
  expect(world.households.members.find(row=>row.recruitedId===shelterHost))
    .toMatchObject({householdId:destinationHouseholdId,settlementId:destinationSettlementId,status:'recruited'});
};
function arrive(){
  const setup=shelterAccepted();
  let world=setup.world;
  for(let i=1;i<setup.path.length;i++)world=shelterTurn(world);
  expect(shelterCase(world)).toMatchObject({status:'occupied',arrivedTick:world.tick});
  return {...setup,accepted:setup.world,world};
}

describe('native disaster shelter across a real previously paid corridor',()=>{
  it('keeps distinct host offer, guest consent, one real step per month, occupation only after lawful arrival and actual safe homecoming',()=>{
    const setup=shelterAccepted(),{harmed,offered,path,home,hostSite,hazard,agreement,disaster,work}=setup;
    const consent=setup.world;
    expect(shelterCase(harmed)).toBeUndefined();
    expect(shelterCase(offered)).toMatchObject({status:'offered',steps:[],pathIndex:0});
    expect(caseRoomHeld(offered)).toBe(false);
    expect(caseRoomHeld(consent)).toBe(true);
    expect(shelterCase(consent)).toMatchObject({status:'reserved',steps:[],pathIndex:0,
      host:{actorId:shelterHost,householdId:destinationHouseholdId,siteId:hostSite.id},
      guest:{actorId:shelterGuest,householdId:originHouseholdId,siteId:home.id},
      shelterProjectId:work.id,agreementId:agreement.id,disasterRecordId:disaster.id,disasterTick:disaster.tick,
      hazard:{id:hazard.id,intensity:2,tileId:path[0]},offeredTick:offered.tick,acceptedTick:consent.tick,path});
    expect(villageEvolutionPath(consent,agreement,plot(consent,originSettlementId),plot(consent,destinationSettlementId))).toBeUndefined();
    expect(consent.mapHazards.some(row=>row.id===hazard.id)).toBe(true);
    let world=consent,control=harmed;
    for(let i=1;i<path.length;i++){
      // While committed, injected generic exploration must not jump the guest over the real route cursor.
      world=shelterTurn(world,{[shelterGuest]:shelterDecision('EXPLORE',{targetLocationId:hostSite.id})});
      expect(shelterCase(world)).toMatchObject({pathIndex:i,steps:Array.from({length:i},(_,j)=>({
        tick:consent.tick+j+1,pathIndex:j+1,tileId:path[j+1],direction:'outbound'}))});
      const atEnd=i===path.length-1;
      expect(shelterCase(world)?.arrivedTick).toBe(atEnd?world.tick:undefined);
      expect(shelterCase(world)?.status).toBe(atEnd?'occupied':'outbound');
      expect(shelterActor(world,shelterGuest).locationId).toBe(atEnd?hostSite.id:home.id);
      expect(disasterShelterCheckpoint(world,shelterActor(world,shelterGuest))).toEqual(atEnd?undefined:shelterTilePoint(world,path[i]));
      expect(caseRoomHeld(world)).toBe(true);
      if(i===2)parity(world);
      noChangeOfHome(world);
    }
    expect(shelterCase(world)?.departedTick).toBe(consent.tick+1);
    const arrived=world;
    expect(availableDisasterShelterActions(shelterActor(arrived,shelterGuest),arrived,arrived.tick)
      .some(option=>option.disasterShelterMove==='return')).toBe(false);
    world=shelterTurn(arrived,{[shelterGuest]:shelterOrder(arrived,shelterGuest,'return')});
    const requested=world;
    expect(shelterCase(requested)).toMatchObject({status:'returning',pathIndex:path.length-1,returnRequestedTick:requested.tick,
      steps:shelterCase(arrived)?.steps});
    expect(shelterActor(requested,shelterGuest).locationId).toBe(hostSite.id);
    expect(caseRoomHeld(requested)).toBe(true);
    for(let i=path.length-2;i>=0;i--){
      world=shelterTurn(world);
      expect(shelterCase(world)?.steps.at(-1)).toEqual({tick:world.tick,pathIndex:i,tileId:path[i],direction:'return'});
      expect(shelterActor(world,shelterGuest).locationId).toBe(i===0?home.id:hostSite.id);
      expect(shelterCase(world)?.status).toBe(i===0?'returned':'returning');
      expect(disasterShelterCheckpoint(world,shelterActor(world,shelterGuest))).toEqual(i===0?undefined:shelterTilePoint(world,path[i]));
      expect(caseRoomHeld(world)).toBe(false);
    }
    expect(shelterCase(world)).toMatchObject({returnedTick:world.tick,returnDepartedTick:requested.tick+1,steps:expect.arrayContaining(shelterCase(arrived)?.steps??[])});
    noChangeOfHome(world);
    while(control.tick<world.tick)control=shelterTurn(control);
    expect(world.households).toEqual(control.households);
    expect(world.settlements.villages).toEqual(control.settlements.villages);
    parity(world);
  });

  it('rejects an otherwise identical documented origin disaster if the existing interior path is already unsafe',()=>{
    const baseline=harmedNativeShelter(),sibling=harmedNativeShelter(true);
    expect(sibling.hazard).toEqual(baseline.hazard);
    expect(sibling.disaster).toEqual(baseline.disaster);
    expect(sibling.path).toEqual(baseline.path);
    expect(sibling.world.mapHazards.some(row=>row.intensity===2&&row.tileId===sibling.path[2])).toBe(true);
    expect(availableDisasterShelterActions(shelterActor(sibling.world,shelterHost),sibling.world,sibling.world.tick+1)
      .some(option=>option.disasterShelterMove==='offer')).toBe(false);
    const refused=shelterTurn(sibling.world,{[shelterHost]:shelterDecision('DISASTER_SHELTER',{
      disasterShelterMove:'offer',targetCultivatorId:shelterGuest})});
    expect(shelterCase(refused)).toBeUndefined();
  });

  it('waits behind a new native interior hazard without forging a crossing, then walks when it actually lifts',()=>{
    const {world:reserved,path,home}=shelterAccepted();
    const first=shelterTurn(reserved);
    expect(shelterCase(first)?.pathIndex).toBe(1);
    let world=shelterMiasma(first,path[2]);
    const hazard=world.mapHazards.find(row=>row.tileId===path[2]);
    shelterRequire(hazard?.intensity===2,'Actual later miasma');
    for(let i=world.tick+1;i<hazard.expiresTick;i++){
      world=shelterTurn(world);
      expect(shelterCase(world)).toMatchObject({status:'outbound',pathIndex:1,steps:shelterCase(first)?.steps});
      expect(shelterActor(world,shelterGuest).locationId).toBe(home.id);
    }
    parity(world);
    world=shelterTurn(world);
    expect(world.tick).toBe(hazard.expiresTick);
    expect(shelterCase(world)).toMatchObject({status:'outbound',pathIndex:2});
    expect(shelterCase(world)?.steps.at(-1)).toMatchObject({tick:world.tick,tileId:path[2]});
    expect(shelterCase(world)?.arrivedTick).toBeUndefined();
  });

  it('does not let a different actor sign and does not make a return occur for a dead guest',()=>{
    const offered=shelterOffered(),wrong='npc-1';
    expect(availableDisasterShelterActions(shelterActor(offered.world,wrong),offered.world,offered.world.tick+1)
      .some(option=>option.disasterShelterMove==='accept')).toBe(false);
    const impersonation=shelterTurn(offered.world,{[wrong]:shelterDecision('DISASTER_SHELTER',{
      disasterShelterMove:'accept',targetDisasterShelterId:offered.row.id})});
    expect(shelterCase(impersonation)).toMatchObject({status:'offered',steps:[]});
    const arrived=arrive();
    let world=arrived.world;
    for(let i=0;i<6&&shelterActor(world,shelterGuest).alive;i++)world=applyMapBrush(world,'meteor',[arrived.hostSite]);
    expect(shelterActor(world,shelterGuest).alive).toBe(false);
    world=shelterTurn(world,{[shelterGuest]:shelterDecision('DISASTER_SHELTER',{
      disasterShelterMove:'return',targetDisasterShelterId:arrived.row.id})});
    expect(shelterCase(world)?.status).not.toBe('returned');
    expect(shelterCase(world)?.returnedTick).toBeUndefined();
    expect(shelterActor(world,shelterGuest)).toMatchObject({alive:false,hp:0,locationId:arrived.hostSite.id});
  });

  it('does not promise a second room to the same actual guest with a signed seasonal reservation',()=>{
    const {world}=harmedNativeShelter(false,true);
    const oldOffer=world.seasonalHousing.claims.find(row=>row.hostId===shelterHost&&row.guestId===shelterGuest);
    shelterRequire(oldOffer?.status==='offered','Real season room offered by actual local member');
    const reserved=shelterTurn(world,{[shelterGuest]:shelterDecision('SEASONAL_HOUSING',{
      housingMove:'accept',targetHousingClaimId:oldOffer.id})});
    const claim=reserved.seasonalHousing.claims.find(row=>row.id===oldOffer.id);
    shelterRequire(claim?.status==='reserved'&&seasonalHousingRoomHeld(claim,reserved.tick+1),'Real signed room custodied');
    const host=shelterActor(reserved,shelterHost);
    expect(availableDisasterShelterActions(host,reserved,reserved.tick+1).some(row=>
      row.disasterShelterMove==='offer'&&row.targetCultivatorId===shelterGuest)).toBe(false);
    const refused=shelterTurn(reserved,{[shelterHost]:shelterDecision('DISASTER_SHELTER',{
      disasterShelterMove:'offer',targetCultivatorId:shelterGuest})});
    expect(shelterCase(refused)).toBeUndefined();
    expect(refused.seasonalHousing.claims.find(row=>row.id===oldOffer.id)?.status).toBe('reserved');
    noChangeOfHome(refused);
  });
});
