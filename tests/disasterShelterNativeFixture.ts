import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {availableSeasonalHousingActions} from '../src/engine/seasonalHousingEngine';
import {availableSettlementActions} from '../src/engine/settlementEngine';
import {villageEvolutionPath} from '../src/engine/villageEvolutionEngine';
import {availableDisasterShelterActions} from '../src/engine/disasterShelterEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {A,B,FROM,TO,nativeCorridorFixture,person,place,plot,turn} from './fixtures/villageEvolutionNativeFixture';

export const originSettlementId=FROM,destinationSettlementId=TO;
export const originHouseholdId='household-village-loc-market-first',destinationHouseholdId='household-village-loc-market-east-first';
export const shelterGuest='recruit-village-loc-market-vol-1',shelterHost='recruit-village-loc-market-east-vol-1';
export const shelterActor=person,shelterTurn=turn;
export const shelterCase=(world:WorldState)=>world.disasterShelter?.cases[0];
export const shelterDecision=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,...fields,innerMonologue:'按乡籍、亲允、真实路线和回乡凭据行事。'});
export function shelterRequire(value:unknown,why:string):asserts value{if(!value)throw Error(why);}
export function shelterTilePoint(world:WorldState,tileId:string){
  const tile=world.terrain.tiles.find(row=>row.id===tileId);
  shelterRequire(tile,'Only use an existing physical tile');
  return {x:(tile.col+.5)*1000/world.terrain.columns,y:(tile.row+.5)*600/world.terrain.rows};
}
export function shelterMiasma(world:WorldState,tileId:string){
  const point=shelterTilePoint(world,tileId);
  return applyMapBrush(applyMapBrush(world,'cursed_miasma',[point]),'cursed_miasma',[point]);
}
export function completedNativeShelter(seasonalSetup=false){
  // This existing paid route seed discloses controlled genesis coordinates, demographics and initial reserves.
  // No enrollment, movement, resources, hazard journals, villages, works, route or tick are edited after it.
  const {w:prior,agreementId}=nativeCorridorFixture();
  const recruits=Object.fromEntries([[A,FROM],[B,TO]].map(([id,settlementId])=>{
    const option=availableSettlementActions(person(prior,id),prior).find(row=>
      row.action==='RECRUIT_SETTLER'&&row.targetSettlementId===settlementId);
    shelterRequire(option,'Exact local consenting native recruitment');
    const {action,...fields}=option;
    return [id,shelterDecision(action,fields)] as const;
  }));
  const recruited=turn(prior,recruits);
  for(const [actorId,householdId,settlementId] of [[shelterGuest,originHouseholdId,FROM],[shelterHost,destinationHouseholdId,TO]]){
    const member=recruited.households.members.find(row=>row.recruitedId===actorId);
    shelterRequire(member?.status==='recruited'&&member.householdId===householdId&&member.settlementId===settlementId&&
      recruited.settlements.records.some(row=>row.kind==='recruitment'&&row.cultivatorId===actorId&&row.tick===recruited.tick),
    'Actual household membership and contemporaneous recruitment receipt required');
  }
  let world=turn(recruited,{[B]:shelterDecision('VILLAGE_WORKS',{villageWorkKind:'shelter',targetSettlementId:TO}),
    ...(seasonalSetup?{[shelterGuest]:shelterDecision('EXPLORE',{targetLocationId:place(recruited,TO).id})}:{})});
  for(let i=0;i<8&&world.villageWorks.projects.find(row=>row.kind==='shelter')?.status==='building';i++){
    const visit:Record<string,LLMDecisionPayload>=seasonalSetup?(i===0?{[shelterHost]:shelterDecision('SOCIALIZE',{targetCultivatorId:shelterGuest})}:
      i===1?{[shelterGuest]:shelterDecision('EXPLORE',{targetLocationId:place(recruited,FROM).id})}:{}):{};
    world=turn(world,visit);
  }
  const work=world.villageWorks.projects.find(row=>row.kind==='shelter'&&row.status==='completed');
  const agreement=world.villageSupply.agreements.find(row=>row.id===agreementId);
  shelterRequire(work&&agreement,'Real completed shelter and historical freight');
  const path=villageEvolutionPath(world,agreement,plot(world,FROM),plot(world,TO));
  shelterRequire(path&&path.length===5,'Expected real five-point past supply corridor');
  const home=place(world,FROM),hostSite=place(world,TO);
  return {world,prior,recruited,work,agreement,path,home,hostSite};
}
export function harmedNativeShelter(interiorBlock=false,seasonalSetup=false){
  const ready=completedNativeShelter(seasonalSetup);
  const {path}=ready;
  let after=shelterMiasma(ready.world,path[0]);
  if(interiorBlock)after=shelterMiasma(after,path[2]);
  const regular=seasonalSetup&&availableSeasonalHousingActions(person(after,shelterHost),after,after.tick+1)
    .find(row=>row.housingMove==='offer'&&row.targetCultivatorId===shelterGuest);
  if(seasonalSetup)shelterRequire(regular,'Real sponsored room must be offered after ordinary native visit, socialization and homecoming');
  const world=turn(after,regular?{[shelterHost]:shelterDecision(regular.action,{housingMove:regular.housingMove,
    targetHousingHouseholdId:regular.targetHousingHouseholdId,targetCultivatorId:regular.targetCultivatorId})}:{});
  const hazard=world.mapHazards.find(row=>row.tileId===path[0]&&row.kind==='cursed_miasma');
  const disaster=world.settlements.records.find(row=>row.kind==='disaster'&&row.settlementId===FROM&&
    hazard&&row.id===`settlement-${world.tick}-disaster-${FROM}-${hazard.id}`);
  shelterRequire(hazard?.intensity===2&&disaster,'Real supported intensity 2 source and native public settlement disaster receipt');
  return {...ready,completed:ready.world,world,hazard,disaster};
}
export function shelterOrder(world:WorldState,actorId:string,move:NonNullable<LLMDecisionPayload['disasterShelterMove']>){
  const option=availableDisasterShelterActions(person(world,actorId),world,world.tick+1).find(row=>
    row.disasterShelterMove===move&&(row.disasterShelterMove!=='offer'||row.targetCultivatorId===shelterGuest));
  shelterRequire(option,`No native ${move} option for ${actorId} at T${world.tick}`);
  const {action,...fields}=option;
  return shelterDecision(action,fields);
}
export function shelterOffered(){
  const harm=harmedNativeShelter();
  const world=turn(harm.world,{[shelterHost]:shelterOrder(harm.world,shelterHost,'offer')});
  const row=shelterCase(world);
  shelterRequire(row,'No native offer created');
  return {...harm,harmed:harm.world,world,row};
}
export function shelterAccepted(){
  const offer=shelterOffered();
  const world=turn(offer.world,{[shelterGuest]:shelterOrder(offer.world,shelterGuest,'accept')});
  const row=shelterCase(world);
  shelterRequire(row,'No native accepted case');
  return {...offer,offered:offer.world,world,row};
}
