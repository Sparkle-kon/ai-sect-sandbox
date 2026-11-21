import {createInitialWorld} from '../../src/data/initialWorld';
import {resolveAlignedWeatherAction} from '../../src/engine/alignedWeatherEngine';
import {OBSERVATORY_LEAD_TICKS,resolveObservatoryAction} from '../../src/engine/fieldObservatoryEngine';
import {observatoryEdgeStation} from '../../src/engine/observatoryStation';
import {localQiWeather} from '../../src/engine/weatherEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../../src/types/world';

export const weatherPerson=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const weatherSite=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id)!;
export const weatherPayload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'各自实测，同地同刻才复核。',...fields});
export const weatherCompare=(targetAlignedWeatherId:string,targetObservatoryTick:number)=>
  weatherPayload('ALIGNED_WEATHER',{alignedWeatherMove:'compare',targetAlignedWeatherId,targetObservatoryTick});
export const weatherTurn=(world:WorldState,actions:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(({id})=>[id,actions[id]??weatherPayload('REST')])),()=>.99);
export const paidReading=(world:WorldState,id:string,opening:number)=>world.fieldObservatories.byActor[id].runs.find(row=>row.openedTick===opening)!;

export function fundedAlignedWeather(dissent?:boolean,peerSource?:'local'|'remote'|'absent',siteId?:string):
  {world:WorldState;siteId:string;proposerId:string;peerId:string;outsiderId:string;openedTick:number};
export function fundedAlignedWeather(dissent=true,peerSource:'local'|'remote'|'absent'='local',siteId='loc-market'){
  const world=createInitialWorld(149);
  const [proposer,peer,outsider]=world.cultivators;
  const site=weatherSite(world,siteId);
  const remote=world.locations.find(row=>row.id!==site.id&&row.type==='market')!;
  world.month=5;world.tick=26;
  const station=observatoryEdgeStation(world,site)!;
  // Deliberate fixture context: pick a month whose actual same-site field differs across the physical points,
  // then still run both normal funded measurements. No stored report or outcome is edited.
  let found=false;
  for(let i=0;i<30;i++,world.tick++){
    const due=world.tick+OBSERVATORY_LEAD_TICKS;
    const one=localQiWeather(world,site,due),two=localQiWeather(world,{...site,x:station.x,y:station.y},due);
    if(one.kind!==two.kind||one.intensity!==two.intensity){found=true;break;}
  }
  if(!found)throw Error('fixture expected physical local gradient');
  for(const actor of [proposer,peer,outsider]){
    actor.locationId=site.id;actor.age=33;actor.lifespan=120;actor.hp=actor.maxHp;actor.spiritStones=200;
    actor.tribulation=undefined;actor.guardAssignment=undefined;
  }
  const openedTick=world.tick;
  if(!resolveObservatoryAction(world,proposer,weatherPayload('FIELD_OBSERVATORY',{observatoryMove:'fund',targetLocationId:site.id})))
    throw Error('fixture native fund first');
  if(peerSource!=='absent'){
    peer.locationId=peerSource==='remote'?remote.id:site.id;
    if(!resolveObservatoryAction(world,peer,weatherPayload('FIELD_OBSERVATORY',{observatoryMove:'fund',
      targetLocationId:peer.locationId,...(dissent?{observatoryStation:'edge' as const}:{})})))throw Error('fixture native fund second');
  }
  return {world,siteId:site.id,proposerId:proposer.id,peerId:peer.id,outsiderId:outsider.id,openedTick};
}
export function measuredAlignedWeather(dissent=true,peerSource:'local'|'remote'|'absent'='local',siteId?:string){
  const f=fundedAlignedWeather(dissent,peerSource,siteId);
  let {world}=f;
  world=weatherTurn(world);
  const actions:Record<string,LLMDecisionPayload>={};
  for(const id of [f.proposerId,...(peerSource==='absent'?[]:[f.peerId])]){
    const row=paidReading(world,id,f.openedTick);
    actions[id]=weatherPayload('FIELD_OBSERVATORY',{observatoryMove:'measure',targetLocationId:row.locationId,targetObservatoryTick:f.openedTick});
  }
  world=weatherTurn(world,actions);
  for(const id of Object.keys(actions))if(paidReading(world,id,f.openedTick).status!=='measured')throw Error('fixture native normal measurement');
  weatherPerson(world,f.peerId).locationId=f.siteId;
  return {...f,world};
}
export function offeredAlignedWeather(dissent=true,peerSource:'local'|'remote'|'absent'='local',siteId?:string){
  const f=measuredAlignedWeather(dissent,peerSource,siteId);
  f.world.tick++;
  const offer=weatherPayload('ALIGNED_WEATHER',{alignedWeatherMove:'offer',targetLocationId:f.siteId,
    targetCultivatorId:f.peerId,targetObservatoryTick:f.openedTick});
  if(!resolveAlignedWeatherAction(f.world,weatherPerson(f.world,f.proposerId),offer))throw Error('fixture native aligned offer');
  return {...f,id:f.world.alignedWeather.comparisons[0].id,offer};
}
export function comparedAlignedWeather(dissent=true,siteId?:string){
  const f=offeredAlignedWeather(dissent,'local',siteId);
  const world=weatherTurn(f.world,{[f.peerId]:weatherCompare(f.id,f.openedTick)});
  if(!world.alignedWeather.comparisons[0].second)throw Error('fixture native alignment opt-in');
  return {...f,world};
}
