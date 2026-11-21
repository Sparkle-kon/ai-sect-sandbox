import type {
  Cultivator,LLMDecisionPayload,LocationNode,SeedCultureState,SeedLot,SeedCultureMove,SeedPlot,SeedWeather,WorldEvent,WorldState,
} from '../types/world';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { flowActor,flowSeedLot,flowSeedPlot,recordResourceFlow } from './resourceFlowEngine';
import { routeWarningHazardValid } from './routeWarningProof';
import { localQiWeather } from './weatherEngine';
import { terrainTileAt } from './terrainEngine';
import { measureSeedPlot,measureSeedTrial,SEED_GROW_TICKS,SEED_LOT_UNITS,SEED_PLOT_UNITS,SEED_READY_TICKS,SEED_SAMPLE_UNITS,SEED_SOURCE_HERBS } from './seedCultureTerms';

export const createSeedCultureState=():SeedCultureState=>({lots:[],plots:[],nextLotId:1,nextPlotId:1});
export type SeedCultureOption=
  | {action:'SEED_CULTURE';seedMove:'reserve';targetLocationId:string;targetSeedLotId?:never;targetSeedPlotId?:never}
  | {action:'SEED_CULTURE';seedMove:'test'|'plant';targetSeedLotId:string;targetLocationId?:never;targetSeedPlotId?:never}
  | {action:'SEED_CULTURE';seedMove:'harvest';targetSeedPlotId:string;targetLocationId?:never;targetSeedLotId?:never};

const live=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0;
const personAt=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id);
const runs=(plot:SeedPlot)=>plot.status==='growing'||plot.status==='ready';
function siteFor(world:WorldState,siteId:string,owner:Cultivator):LocationNode|undefined{
  const site=world.locations.find(row=>row.id===siteId);
  return site?.type==='spirit_vein'&&(!site.ownerSectId||site.ownerSectId===owner.sectId)&&
    Number.isSafeInteger(site.herbCapacity.jade_leaf)&&site.herbCapacity.jade_leaf>0&&terrainTileAt(world,site.x,site.y)?site:undefined;
}
function actualHere(world:WorldState,actor:Cultivator,tick:number):boolean{
  if(!live(actor)||actor.age<18||pilgrimageCheckpoint(world,actor)||
    actor.tribulation?.stage==='lightning'||actor.tribulation?.stage==='heart_demon')return false;
  const id=actor.id;
  return !(actor.guardAssignment&&actor.guardAssignment.assignedTick<=tick&&tick<actor.guardAssignment.expiresTick&&
      actor.guardAssignment.locationId!==actor.locationId)&&
    !world.pilgrimages.journeys.some(row=>(row.organizerId===id||row.companionId===id)&&
      (row.status==='active'||row.startedTick===tick||row.lastMovedTick===tick))&&
    !world.couriers.dispatches.some(row=>row.courierId===id&&(row.status==='in_transit'||row.status==='returning'||
      row.acceptedTick!==undefined&&(row.acceptedTick===tick||row.lastAdvancedTick===tick||row.settledTick===tick)))&&
    !world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(id))&&
    !world.boundaryReliefs.cases.some(row=>row.incomingId===id&&(row.status==='travelling'||row.status==='returning'))&&
    !world.escorts.contracts.some(row=>row.status==='active'&&row.escortId===id)&&
    !world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(id))&&
    !world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(id)&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(id)))&&
    !world.expeditionRescues.requests.some(row=>row.gateSiteId===actor.locationId&&(row.explorerId===id||row.rescuerId===id)&&
      row.supplySpent===1&&(row.status==='extracting'||row.status==='interrupted'&&row.pathIndex>0&&
        !row.arrivedIds?.includes(id)&&world.occasions.some(occasion=>occasion.id===row.occasionId&&occasion.status==='running')));
}
function hazardAt(world:WorldState,site:LocationNode,tick:number){
  const tile=terrainTileAt(world,site.x,site.y);
  return tile&&world.mapHazards.filter(row=>row.tileId===tile.id&&row.intensity>=2&&routeWarningHazardValid(world,row,tick))
    .sort((a,b)=>b.intensity-a.intensity||a.createdTick-b.createdTick||(a.id<b.id?-1:a.id>b.id?1:0))[0];
}
function observed(world:WorldState,site:LocationNode):SeedWeather|undefined {
  const tile=terrainTileAt(world,site.x,site.y);
  return tile ? {...localQiWeather(world,site),soilQi:tile.spiritQi} : undefined;
}
const idlePlot=(world:WorldState,siteId:string)=>!world.seedCulture.plots.some(plot=>plot.siteId===siteId&&runs(plot));
const goodHeadroom=(actor:Cultivator,yielded:number)=>
  Number.isSafeInteger(actor.herbs.jade_leaf)&&actor.herbs.jade_leaf>=0&&actor.herbs.jade_leaf+yielded<=10_000;

export function availableSeedCultureActions(actor:Cultivator,world:WorldState,executionTick=world.tick):SeedCultureOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||!world.cultivators.includes(actor)||!actualHere(world,actor,executionTick))return [];
  if (world.seedCulture.lots.some(row=>row.ownerId===actor.id&&
      (row.createdTick===executionTick||row.tests.some(test=>test.tick===executionTick))) ||
    world.seedCulture.plots.some(row=>row.ownerId===actor.id&&
      (row.plantedTick===executionTick||row.status==='harvested'&&row.settledTick===executionTick))) return [];
  const site=siteFor(world,actor.locationId,actor);
  if(!site||hazardAt(world,site,executionTick))return [];
  const lots=world.seedCulture.lots.filter(row=>row.ownerId===actor.id&&row.siteId===site.id&&row.remaining>0);
  const actions:SeedCultureOption[]=[];
  if(lots.length===0&&Number.isSafeInteger(actor.herbs.jade_leaf)&&actor.herbs.jade_leaf>=SEED_SOURCE_HERBS)
    actions.push({action:'SEED_CULTURE',seedMove:'reserve',targetLocationId:site.id});
  const plotOpen=idlePlot(world,site.id);
  for(const lot of lots){
    if(lot.createdTick>=executionTick||lot.remaining<SEED_SAMPLE_UNITS||lot.loss)continue;
    if(!lot.tests.some(row=>row.tick===executionTick)) actions.push({action:'SEED_CULTURE',seedMove:'test',targetSeedLotId:lot.id});
    if(plotOpen&&lot.tests.some(row=>row.tick<executionTick)&&lot.remaining>=SEED_PLOT_UNITS)
      actions.push({action:'SEED_CULTURE',seedMove:'plant',targetSeedLotId:lot.id});
  }
  for(const plot of world.seedCulture.plots){
    if(plot.ownerId!==actor.id||plot.siteId!==site.id||plot.status!=='ready'||plot.maturedTick===undefined||
      plot.yield===undefined||plot.yield===0||executionTick>=plot.maturedTick+SEED_READY_TICKS||
      !goodHeadroom(actor,plot.yield))continue;
    actions.push({action:'SEED_CULTURE',seedMove:'harvest',targetSeedPlotId:plot.id});
  }
  return actions;
}
function event(world:WorldState,id:string,ownerId:string,siteId:string,suffix:string,title:string,description:string):WorldEvent{
  return {id:`evt-${world.tick}-${id}-${suffix}`,tick:world.tick,year:world.year,month:world.month,title,description,
    locationId:siteId,actorIds:[ownerId],category:'diplomacy',witnessScope:'participants'};
}
const info=(ownerId:string,refId:string)=>({mechanism:'seed_culture' as const,refId,visibility:{kind:'participants' as const,actorIds:[ownerId]}});
const keys=['chosenAction','innerMonologue','spokenLine','seedMove'];
function keyFor(move:SeedCultureMove|undefined){
  return move==='reserve'?'targetLocationId':move==='harvest'?'targetSeedPlotId':'targetSeedLotId';
}
export function resolveSeedCultureAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  const move=payload.seedMove,key=keyFor(move);
  if(payload.chosenAction!=='SEED_CULTURE'||Object.keys(payload).some(k=>![...keys,key].includes(k)))return null;
  const option=availableSeedCultureActions(actor,world).find(row=>row.seedMove===move&&row[key]===payload[key]);
  if(!option)return null;
  const site=siteFor(world,actor.locationId,actor);
  if(!site)return null;
  if(option.seedMove==='reserve'){
    const lot:SeedLot={id:`seed-lot-${world.seedCulture.nextLotId++}`,ownerId:actor.id,siteId:site.id,
      createdTick:world.tick,remaining:SEED_LOT_UNITS,tests:[]};
    actor.herbs.jade_leaf-=SEED_SOURCE_HERBS;
    world.seedCulture.lots.push(lot);
    recordResourceFlow(world,{...info(actor.id,lot.id),kind:'consumption',reason:'seed_source_used',
      good:'jade_leaf',amount:SEED_SOURCE_HERBS,from:flowActor(actor.id)});
    recordResourceFlow(world,{...info(actor.id,lot.id),kind:'production',reason:'seed_lot_sealed',
      good:'jade_seed',amount:SEED_LOT_UNITS,to:flowSeedLot(lot.id)});
    return event(world,lot.id,actor.id,site.id,'sealed','翡翠灵叶留下种源','实际耗用两份成熟灵叶，留下六枚另册种子，不能当作成熟药材使用。');
  }
  if(option.seedMove==='harvest'){
    const plot=world.seedCulture.plots.find(row=>row.id===option.targetSeedPlotId);
    if(!plot?.yield)return null;
    actor.herbs.jade_leaf+=plot.yield;
    plot.status='harvested';plot.settledTick=world.tick;
    recordResourceFlow(world,{...info(actor.id,plot.id),kind:'transfer',reason:'seed_harvest_delivered',
      good:'jade_leaf',amount:plot.yield,from:flowSeedPlot(plot.id),to:flowActor(actor.id)});
    return event(world,plot.id,actor.id,site.id,'harvest','本人实收灵叶',`从该田中的已结实收成移交 ${plot.yield} 份。未改动天然采集存量。`);
  }
  const lot=world.seedCulture.lots.find(row=>row.id===option.targetSeedLotId);
  if(!lot)return null;
  if(option.seedMove==='test'){
    const weather=observed(world,site);
    if (!weather) return null;
    const sprouted=measureSeedTrial(world.terrain.seed,lot.id,weather);
    lot.remaining-=SEED_SAMPLE_UNITS;
    lot.tests.push({tick:world.tick,weather,sample:SEED_SAMPLE_UNITS,sprouted});
    recordResourceFlow(world,{...info(actor.id,lot.id),kind:'consumption',reason:'seed_trial_consumed',
      good:'jade_seed',amount:SEED_SAMPLE_UNITS,from:flowSeedLot(lot.id)});
    return event(world,lot.id,actor.id,site.id,'tested','小样实测出苗',`耗去两枚样本，其中 ${sprouted} 枚出苗；不代表其余种子的发芽率。`);
  }
  const plot:SeedPlot={id:`seed-plot-${world.seedCulture.nextPlotId++}`,lotId:lot.id,ownerId:actor.id,siteId:site.id,
    plantedTick:world.tick,maturesTick:world.tick+SEED_GROW_TICKS,status:'growing',weather:[]};
  lot.remaining-=SEED_PLOT_UNITS;
  world.seedCulture.plots.push(plot);
  recordResourceFlow(world,{...info(actor.id,plot.id),kind:'transfer',reason:'seed_planted',
    good:'jade_seed',amount:SEED_PLOT_UNITS,from:flowSeedLot(lot.id),to:flowSeedPlot(plot.id)});
  return event(world,plot.id,actor.id,site.id,'planted','实种入圃','两枚现有种子进入这块实际田圃，须观察至收成日。');
}
function losePlot(world:WorldState,plot:SeedPlot,reason:NonNullable<SeedPlot['loss']>['reason'],hazard?:ReturnType<typeof hazardAt>):WorldEvent{
  const ready=plot.status==='ready',goods=ready?'jade_leaf':'jade_seed';
  const units=ready?(plot.yield??0):SEED_PLOT_UNITS;
  plot.status='lost';plot.settledTick=world.tick;
  plot.loss={reason,units,good:goods,...(hazard?{hazard:{id:hazard.id,kind:hazard.kind,tileId:hazard.tileId,
    createdTick:hazard.createdTick,expiresTick:hazard.expiresTick,intensity:hazard.intensity}}:{})};
  recordResourceFlow(world,{...info(plot.ownerId,plot.id),kind:'loss',reason:'seed_plot_loss',good:goods,amount:units,from:flowSeedPlot(plot.id)});
  return event(world,plot.id,plot.ownerId,plot.siteId,'lost','田圃物料已损','只冲销实际仍在田圃中的种子或收成；没有转成随身药材。');
}
function advancePlot(world:WorldState,plot:SeedPlot):WorldEvent|undefined{
  if(!runs(plot)||world.tick<=plot.plantedTick)return undefined;
  const owner=personAt(world,plot.ownerId);
  if(!owner)return undefined;
  if(!owner.alive)return losePlot(world,plot,'owner_died');
  const site=siteFor(world,plot.siteId,owner);
  if(!site)return losePlot(world,plot,'site_lost');
  const hazard=hazardAt(world,site,world.tick);
  if(hazard)return losePlot(world,plot,'site_hazard',hazard);
  if(plot.status==='ready'){
    return plot.maturedTick!==undefined&&world.tick>=plot.maturedTick+SEED_READY_TICKS?losePlot(world,plot,'spoiled'):undefined;
  }
  const observationTick=plot.plantedTick+plot.weather.length+1;
  if(observationTick!==world.tick||world.tick>plot.maturesTick)return undefined;
  const reading=observed(world,site);
  if (!reading) return undefined;
  plot.weather.push(reading);
  if(world.tick!==plot.maturesTick)return undefined;
  const yielded=measureSeedPlot(world.terrain.seed,plot.lotId,plot.id,plot.weather);
  plot.yield=yielded;plot.maturedTick=world.tick;
  if(!yielded)return losePlot(world,plot,'failed_germination');
  plot.status='ready';
  recordResourceFlow(world,{...info(plot.ownerId,plot.id),kind:'consumption',reason:'seed_crop_rooted',
    good:'jade_seed',amount:yielded,from:flowSeedPlot(plot.id)});
  if(yielded<SEED_PLOT_UNITS)recordResourceFlow(world,{...info(plot.ownerId,plot.id),kind:'loss',reason:'seed_germination_loss',
    good:'jade_seed',amount:SEED_PLOT_UNITS-yielded,from:flowSeedPlot(plot.id)});
  recordResourceFlow(world,{...info(plot.ownerId,plot.id),kind:'production',reason:'seed_crop_matured',good:'jade_leaf',amount:yielded,to:flowSeedPlot(plot.id)});
  return event(world,plot.id,plot.ownerId,plot.siteId,'ready','灵植实熟待收',`记录到 ${yielded} 份实收上限，货仍在田圃，须本人采收。`);
}
export function advanceSeedCulture(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const lot of world.seedCulture.lots){
    if(!lot.remaining||lot.loss||world.tick<=lot.createdTick) continue;
    const owner=personAt(world,lot.ownerId);
    if(!owner)continue;
    const reason=!owner.alive?'owner_died':!siteFor(world,lot.siteId,owner)?'site_lost':undefined;
    if(!reason)continue;
    const units=lot.remaining;
    lot.remaining=0;lot.loss={tick:world.tick,units,reason};
    recordResourceFlow(world,{...info(lot.ownerId,lot.id),kind:'loss',reason:'seed_lot_loss',
      good:'jade_seed',amount:units,from:flowSeedLot(lot.id)});
    events.push(event(world,lot.id,lot.ownerId,lot.siteId,'lost','余种已损','仅核销还存于原册的种子，不会另作遗产药材。'));
  }
  for(const plot of world.seedCulture.plots){
    const result=advancePlot(world,plot);
    if(result)events.push(result);
  }
  return events;
}

export function projectSeedCulture(world:WorldState,viewer?:Cultivator){
  if(!viewer||!world.cultivators.includes(viewer))return {lots:[],plots:[]};
  return {
    lots:world.seedCulture.lots.filter(row=>row.ownerId===viewer.id)
      .map(({ownerId:_,...row})=>({...row,tests:row.tests.map(test=>({...test,weather:{...test.weather}})),loss:row.loss&&{...row.loss}})),
    plots:world.seedCulture.plots.filter(row=>row.ownerId===viewer.id)
      .map(({ownerId:_,...row})=>({...row,weather:row.weather.map(read=>({...read})),loss:row.loss&&{
        good:row.loss.good,units:row.loss.units,reason:row.loss.reason,
      }})),
  };
}
export function projectLocalSeedCulture(world:WorldState,viewer?:Cultivator):{siteId:string;growing:number;ready:number}|undefined{
  if(!viewer||!world.cultivators.includes(viewer)||!actualHere(world,viewer,world.tick))return undefined;
  const site=siteFor(world,viewer.locationId,viewer);
  if(!site)return undefined;
  const plots=world.seedCulture.plots.filter(row=>row.siteId===site.id&&runs(row));
  if(!plots.length)return undefined;
  const growing=plots.filter(row=>row.status==='growing').length;
  return {siteId:site.id,growing,ready:plots.length-growing};
}
