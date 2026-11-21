import type {AlignedWeatherComparison,AlignedWeatherMove,AlignedWeatherState,Cultivator,FieldObservatoryRun,
  LLMDecisionPayload,LocationNode,WorldEvent,WorldState} from '../types/world';
import {ALIGNED_WEATHER_OFFER_TICKS,ALIGNED_WEATHER_SOURCE_MAX_AGE} from './alignedWeatherTerms';
import {OBSERVATORY_COST,OBSERVATORY_LEAD_TICKS,OBSERVATORY_RETENTION_TICKS} from './fieldObservatoryEngine';
import {observatoryStationValid} from './observatoryStation';
import {pilgrimageCheckpoint} from './pilgrimageEngine';
import {currentVisibleTileIds,knownMapLocations,terrainTileAt} from './terrainEngine';

export const createAlignedWeatherState=():AlignedWeatherState=>({comparisons:[],nextId:1});
export type AlignedWeatherOption=
  | {action:'ALIGNED_WEATHER';alignedWeatherMove:'offer';targetLocationId:string;targetCultivatorId:string;targetObservatoryTick:number;targetAlignedWeatherId?:never}
  | {action:'ALIGNED_WEATHER';alignedWeatherMove:'compare';targetAlignedWeatherId:string;targetObservatoryTick:number;targetLocationId?:never;targetCultivatorId?:never}
  | {action:'ALIGNED_WEATHER';alignedWeatherMove:'decline'|'withdraw';targetAlignedWeatherId:string;targetObservatoryTick?:never;targetLocationId?:never;targetCultivatorId?:never};

type Measured=Extract<FieldObservatoryRun,{status:'measured'}>;
const actorAt=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id);
const siteAt=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id&&row.type!=='abyss'&&row.type!=='secret_realm'&&
  !world.occasions.some(occasion=>occasion.kind==='expedition'&&occasion.locationId===row.id));
const active=(row:AlignedWeatherComparison,tick:number)=>row.status==='offered'&&row.offeredTick<tick&&tick<row.expiresTick;
function actualObserver(world:WorldState,actor:Cultivator|undefined,site:LocationNode,tick:number):actor is Cultivator{
  if(!actor||!actor.alive||actor.hp<=0||actor.locationId!==site.id||pilgrimageCheckpoint(world,actor)||
      actor.tribulation?.stage==='lightning'||actor.tribulation?.stage==='heart_demon')return false;
  const id=actor.id;
  if((actor.guardAssignment&&actor.guardAssignment.assignedTick<=tick&&tick<actor.guardAssignment.expiresTick&&
      actor.guardAssignment.locationId!==site.id)||
    world.pilgrimages.journeys.some(row=>(row.organizerId===id||row.companionId===id)&&(row.status==='active'||
      row.startedTick===tick||row.lastMovedTick===tick))||
    world.couriers.dispatches.some(row=>row.courierId===id&&(row.status==='in_transit'||row.status==='returning'||
      row.acceptedTick!==undefined&&(row.acceptedTick===tick||row.lastAdvancedTick===tick||row.settledTick===tick)))||
    world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(id))||
    world.boundaryReliefs.cases.some(row=>row.incomingId===id&&(row.status==='travelling'||row.status==='returning'))||
    world.escorts.contracts.some(row=>row.escortId===id&&row.status==='active')||
    world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(id))||
    world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(id)&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(id)))||
    world.expeditionRescues.requests.some(row=>row.gateSiteId===site.id&&(row.explorerId===id||row.rescuerId===id)&&
      row.supplySpent===1&&(row.status==='extracting'||row.status==='interrupted'&&row.pathIndex>0&&
        !row.arrivedIds?.includes(id)&&world.occasions.some(occasion=>occasion.id===row.occasionId&&occasion.status==='running'))))return false;
  const tile=terrainTileAt(world,site.x,site.y);
  return !!tile&&(actor.exploredTileIds.includes(tile.id)||currentVisibleTileIds(world,actor).has(tile.id));
}
function exactFunding(world:WorldState,actorId:string,openedTick:number):boolean{
  const month=world.resourceFlow.months.find(row=>row.tick===openedTick);
  if(!month||month.entries.length!==month.totalEntries)return true; // Older compact journals keep the native source row instead.
  return month.entries.some(row=>row.kind==='consumption'&&row.refId===`field-observatory-${actorId}-${openedTick}`&&
    row.mechanism==='observatory'&&row.reason==='observatory_instrument'&&row.good==='stone'&&row.amount===OBSERVATORY_COST&&
    row.from.kind==='actor'&&row.from.id===actorId&&row.visibility.kind==='participants'&&
    row.visibility.actorIds.length===1&&row.visibility.actorIds[0]===actorId);
}
function ownRuns(world:WorldState,actorId:string,site:LocationNode,tick:number,maxAge=OBSERVATORY_RETENTION_TICKS):Measured[]{
  const byActor=world.fieldObservatories.byActor;
  const entries=Object.hasOwn(byActor,actorId)?byActor[actorId].runs:[];
  return entries.filter((row):row is Measured=>row.status==='measured'&&row.locationId===site.id&&
    row.targetTick===row.openedTick+OBSERVATORY_LEAD_TICKS&&row.targetTick<tick&&tick-row.targetTick<=maxAge&&
    (!row.station||observatoryStationValid(world,site,row.station))&&exactFunding(world,actorId,row.openedTick));
}
const snapshot=(row:Measured):AlignedWeatherComparison['first']=>({
  openedTick:row.openedTick,reading:{...row.reading},...(row.station?{station:{...row.station}}:{}),
});
function sameSource(native:Measured,saved:AlignedWeatherComparison['first']):boolean{
  return native.openedTick===saved.openedTick&&native.reading.kind===saved.reading.kind&&native.reading.intensity===saved.reading.intensity&&
    (native.station?saved.station?.kind===native.station.kind&&saved.station.x===native.station.x&&saved.station.y===native.station.y:!saved.station);
}
export function availableAlignedWeatherActions(actor:Cultivator,world:WorldState,executionTick=world.tick):AlignedWeatherOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||actorAt(world,actor.id)!==actor)return [];
  const comparisons=world.alignedWeather.comparisons;
  const nearby=comparisons.filter(row=>row.siteId===actor.locationId&&active(row,executionTick)&&
    (row.observerAId===actor.id||row.observerBId===actor.id));
  const actorBuckets=world.fieldObservatories.byActor;
  if(!nearby.length&&(!Object.hasOwn(actorBuckets,actor.id)||!actorBuckets[actor.id].runs.some(row=>row.status==='measured'&&
      row.locationId===actor.locationId&&executionTick-row.targetTick<=ALIGNED_WEATHER_SOURCE_MAX_AGE)))return [];
  const site=siteAt(world,actor.locationId);
  if(!site||!actualObserver(world,actor,site,executionTick))return [];
  const choices:AlignedWeatherOption[]=[];
  const source=ownRuns(world,actor.id,site,executionTick);
  for(const row of nearby){
    if(row.observerAId===actor.id)choices.push({action:'ALIGNED_WEATHER',alignedWeatherMove:'withdraw',targetAlignedWeatherId:row.id});
    if(row.observerBId!==actor.id)continue;
    choices.push({action:'ALIGNED_WEATHER',alignedWeatherMove:'decline',targetAlignedWeatherId:row.id});
    const proposer=actorAt(world,row.observerAId);
    if(!actualObserver(world,proposer,site,executionTick))continue;
    const first=ownRuns(world,proposer.id,site,executionTick).find(run=>run.targetTick===row.measuredTick&&sameSource(run,row.first));
    const second=source.find(run=>run.targetTick===row.measuredTick);
    if(first&&second)choices.push({action:'ALIGNED_WEATHER',alignedWeatherMove:'compare',targetAlignedWeatherId:row.id,
      targetObservatoryTick:second.openedTick});
  }
  const newRuns=source.filter(row=>executionTick-row.targetTick<=ALIGNED_WEATHER_SOURCE_MAX_AGE&&
    !comparisons.some(offer=>offer.observerAId===actor.id&&offer.first.openedTick===row.openedTick));
  if(newRuns.length===0)return choices;
  const peers=world.cultivators.filter(other=>other.id!==actor.id&&actualObserver(world,other,site,executionTick))
    .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  for(const row of newRuns)for(const other of peers){
    if(comparisons.some(existing=>existing.siteId===site.id&&existing.measuredTick===row.targetTick&&
      (existing.observerAId===actor.id&&existing.observerBId===other.id||
        existing.observerAId===other.id&&existing.observerBId===actor.id)))continue;
    choices.push({action:'ALIGNED_WEATHER',alignedWeatherMove:'offer',targetLocationId:site.id,targetCultivatorId:other.id,
      targetObservatoryTick:row.openedTick});
  }
  return choices;
}

const allowedFields=(move:AlignedWeatherMove|undefined)=>[
  'chosenAction','innerMonologue','spokenLine','alignedWeatherMove',
  ...(move==='offer'?['targetLocationId','targetCultivatorId','targetObservatoryTick']:
    move==='compare'?['targetAlignedWeatherId','targetObservatoryTick']:['targetAlignedWeatherId']),
];
function event(world:WorldState,row:AlignedWeatherComparison,suffix:string,title:string,description:string):WorldEvent{
  return {id:`evt-${world.tick}-${row.id}-${suffix}`,tick:world.tick,year:world.year,month:world.month,
    title,description,category:'heavenly',witnessScope:'participants',actorIds:[row.observerAId,row.observerBId],
    ...(siteAt(world,row.siteId)?{locationId:row.siteId}:{})};
}
export function resolveAlignedWeatherAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  const move=payload.alignedWeatherMove;
  if(payload.chosenAction!=='ALIGNED_WEATHER'||Object.entries(payload).some(([key,value])=>value!==undefined&&
    !allowedFields(move).includes(key)&&!(key==='action'&&value==='ALIGNED_WEATHER')))return null;
  const option=availableAlignedWeatherActions(actor,world).find(row=>row.alignedWeatherMove===move&&
    row.targetAlignedWeatherId===payload.targetAlignedWeatherId&&row.targetLocationId===payload.targetLocationId&&
    row.targetObservatoryTick===payload.targetObservatoryTick&&row.targetCultivatorId===payload.targetCultivatorId);
  if(!option)return null;
  const site=siteAt(world,actor.locationId);
  if(!site)return null;
  if(option.alignedWeatherMove==='offer'){
    const first=ownRuns(world,actor.id,site,world.tick,ALIGNED_WEATHER_SOURCE_MAX_AGE)
      .find(run=>run.openedTick===option.targetObservatoryTick);
    if(!first)return null;
    const row:AlignedWeatherComparison={id:`aligned-weather-${world.alignedWeather.nextId++}`,siteId:site.id,
      observerAId:actor.id,observerBId:option.targetCultivatorId,measuredTick:first.targetTick,offeredTick:world.tick,
      expiresTick:world.tick+ALIGNED_WEATHER_OFFER_TICKS,status:'offered',first:snapshot(first)};
    world.alignedWeather.comparisons.push(row);
    return event(world,row,'offered','邀请同地同刻观象复核','邀请不暴露双方实测数值，也不假定对方已有读数。');
  }
  const row=world.alignedWeather.comparisons.find(item=>item.id===option.targetAlignedWeatherId);
  if(!row)return null;
  if(option.alignedWeatherMove==='compare'){
    const second=ownRuns(world,actor.id,site,world.tick).find(run=>
      run.openedTick===option.targetObservatoryTick&&run.targetTick===row.measuredTick);
    if(!second)return null;
    row.second=snapshot(second);
    row.status='compared';row.settledTick=world.tick;
    row.outcome=row.first.reading.kind===row.second.reading.kind&&row.first.reading.intensity===row.second.reading.intensity?'agrees':'uncertain';
    return event(world,row,'compared',row.outcome==='agrees'?'同地同刻实测一致':'同地同刻异读未定',
      '两份原读数独立留档；这是过去的实测比较，不是当前天气，也没有合成新预测。');
  }
  row.status=option.alignedWeatherMove==='decline'?'declined':'withdrawn';row.settledTick=world.tick;
  return event(world,row,row.status,'同刻观象复核不再续行','未得到明确双份授权，邀请未公开测值。');
}
export function advanceAlignedWeather(world:WorldState):void{
  for(const row of world.alignedWeather.comparisons){
    if(row.status==='offered'&&world.tick>=row.expiresTick){row.status='expired';row.settledTick=world.tick;}
  }
}
const projectReading=(row:AlignedWeatherComparison['first'])=>({reading:{...row.reading},station:row.station?.kind??'center' as const});
export function projectAlignedWeather(world:WorldState,viewer?:Cultivator){
  if(!viewer||!viewer.alive||actorAt(world,viewer.id)!==viewer)return [];
  const entries=world.alignedWeather.comparisons.filter(row=>row.observerAId===viewer.id||row.observerBId===viewer.id);
  if(!entries.length)return [];
  const known=new Map(knownMapLocations(world,viewer).map(site=>[site.id,site]));
  return entries.flatMap(row=>{
    const site=known.get(row.siteId);
    if(!site)return [];
    const proposer=row.observerAId===viewer.id;
    return [{id:row.id,siteId:site.id,siteName:site.name,role:proposer?'proposer' as const:'invitee' as const,
      measuredTick:row.measuredTick,offeredTick:row.offeredTick,expiresTick:row.expiresTick,status:row.status,
      settledTick:row.settledTick,outcome:row.outcome,ageTicks:world.tick-row.measuredTick,
      ...(proposer||row.status==='compared'?{first:projectReading(row.first)}:{}),
      ...(row.status==='compared'&&row.second?{second:projectReading(row.second)}:{})}];
  });
}
export function projectLocalAlignedWeather(world:WorldState,viewer?:Cultivator):{
  siteId:string;measuredTick:number;outcome:NonNullable<AlignedWeatherComparison['outcome']>;
}|undefined{
  if(!viewer||actorAt(world,viewer.id)!==viewer)return undefined;
  const site=siteAt(world,viewer.locationId);
  if(!site||!actualObserver(world,viewer,site,world.tick))return undefined;
  const last=world.alignedWeather.comparisons.filter(row=>row.status==='compared'&&row.siteId===site.id&&
    (row.observerAId===viewer.id||row.observerBId===viewer.id)&&world.tick-row.measuredTick<=OBSERVATORY_RETENTION_TICKS)
    .sort((a,b)=>b.measuredTick-a.measuredTick||(b.settledTick??0)-(a.settledTick??0))[0];
  return last?.outcome?{siteId:site.id,measuredTick:last.measuredTick,outcome:last.outcome}:undefined;
}
