import {expect} from 'vitest';
import {createInitialWorld} from '../../src/data/initialWorld';
import {resolveSettlementAction} from '../../src/engine/settlementEngine';
import {resolveVillageWorksAction} from '../../src/engine/villageWorksEngine';
import {availableSeasonalHousingActions} from '../../src/engine/seasonalHousingEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {HousingMove,LLMDecisionPayload,WorldState} from '../../src/types/world';

export const action=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'按实地房舍记录行动。',...fields});
export const housing=(housingMove:HousingMove,fields:Partial<LLMDecisionPayload>)=>action('SEASONAL_HOUSING',{housingMove,...fields});
export const actor=(w:WorldState,id:string)=>w.cultivators.find(row=>row.id===id)!;
export const step=(w:WorldState,choices:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(w,
  Object.fromEntries(w.cultivators.map(({id})=>[id,choices[id]??action('REST')])),()=>.99);

export function housingFixture(){
  let world=createInitialWorld(9);world.tick=18;world.month=8;
  const sponsor=world.cultivators[0],sponsorId=sponsor.id,sect=world.sects.find(row=>row.id===sponsor.sectId)!;
  const village=world.settlements.villages.find(row=>row.locationId==='loc-market')!,siteId=village.locationId;
  sponsor.locationId=siteId;sponsor.herbs.earth_root=8;sponsor.hp=sponsor.maxHp;sponsor.age=40;
  sponsor.tribulation=undefined;sponsor.guardAssignment=undefined;sect.spiritStones=1000;
  for(const community of world.settlements.villages)community.stress=10;
  const volunteer=village.volunteers[0];
  Object.assign(volunteer,{age:25,aptitude:95,willingness:95});
  expect(resolveSettlementAction(world,sponsor,action('RECRUIT_SETTLER',{targetSettlementId:village.id,
    targetVolunteerId:volunteer.id}))).not.toBeNull();
  const hostId=`recruit-${volunteer.id}`;
  const member=world.households.members.find(row=>row.recruitedId===hostId)!;
  expect(resolveVillageWorksAction(world,sponsor,action('VILLAGE_WORKS',{villageWorkKind:'shelter',
    targetSettlementId:village.id}))).not.toBeNull();
  world=step(world,{[hostId]:action('SOCIALIZE',{targetCultivatorId:sponsorId})});
  expect(world.relationships.some(row=>row.fromId===hostId&&row.toId===sponsorId||
    row.toId===hostId&&row.fromId===sponsorId)).toBe(true);
  world=step(world,{[sponsorId]:action('EXPLORE',{targetLocationId:sect.headquartersId})});
  for(let loops=0;loops<10&&(world.villageWorks.projects[0].status!=='completed'||!([3,6,9,12].includes(world.month)));loops++)world=step(world);
  expect(world.villageWorks.projects[0].status).toBe('completed');
  expect(actor(world,sponsorId).locationId).toBe(sect.headquartersId);
  return {world,hostId,guestId:sponsorId,settlementId:village.id,householdId:member.householdId,siteId,originId:sect.headquartersId};
}
export function occupiedHousing(){
  const f=housingFixture();
  let {world}=f;
  const offer=housing('offer',{targetHousingHouseholdId:f.householdId,targetCultivatorId:f.guestId});
  expect(availableSeasonalHousingActions(actor(world,f.hostId),world,world.tick+1)).toContainEqual({action:'SEASONAL_HOUSING',
    housingMove:'offer',targetHousingHouseholdId:f.householdId,targetCultivatorId:f.guestId});
  world=step(world,{[f.hostId]:offer});
  const id=world.seasonalHousing.claims[0].id,target={targetHousingClaimId:id};
  expect(world.seasonalHousing.claims[0]).toMatchObject({status:'offered'});
  world=step(world,{[f.guestId]:housing('accept',target)});
  expect(world.seasonalHousing.claims[0]).toMatchObject({status:'reserved'});
  expect(world.seasonalHousing.claims[0].checkedInTick).toBeUndefined();
  world=step(world,{[f.guestId]:action('EXPLORE',{targetLocationId:f.siteId})});
  expect(world.seasonalHousing.claims[0]).toMatchObject({status:'reserved',arrival:{tick:world.tick,fromSiteId:f.originId,toSiteId:f.siteId}});
  world=step(world,{[f.guestId]:housing('check_in',target)});
  expect(world.seasonalHousing.claims[0]).toMatchObject({status:'occupied',checkedInTick:world.tick});
  return {...f,world,id,target};
}
