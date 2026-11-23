import { isScopedExpeditionGate } from '../engine/expeditionOmenTerms';
import { projectFurnaceSafety } from '../engine/furnaceSafetyEngine';
import { heavenlyAlchemyLightning, projectHeavenlyAlchemy } from '../engine/heavenlyAlchemyEngine';
import {
  HEAVENLY_ALCHEMY_QUALITY, HEAVENLY_ALCHEMY_RECIPES, heavenlyAlchemyEventId, heavenlyBrewId, heavenlyPillQuality,
} from '../engine/heavenlyAlchemyTerms';
import { projectLocalSeedCulture, projectSeedCulture } from '../engine/seedCultureEngine';
import { measureSeedPlot, SEED_GROW_TICKS, SEED_PLOT_UNITS, SEED_READY_TICKS } from '../engine/seedCultureTerms';
import { terrainTileAt } from '../engine/terrainEngine';
import { HEAVENLY_HEATS, HEAVENLY_RECIPE_IDS, type HeavenlyHeat, type HeavenlyQuality, type HeavenlyRecipeId } from '../types/heavenlyAlchemy';
import type { Cultivator, SeedPlot, WorldState } from '../types/world';
import { projectCultivatorPortrait } from './cultivatorPortraitModel';
import { type MapActorSpriteModel } from './mapActorSpriteModel';
import { mapTransitActorIds } from './mapConvoyView';
import type { createTerrainMapView } from './terrainMapView';

export interface AlchemyWorkshopFurnace {
  readonly grade: 1|2|3;
  readonly status: 'open'|'closed'|'reopening';
  readonly mode: 'idle'|'preview'|'receipt';
  readonly heat?: HeavenlyHeat;
  readonly result?: {readonly success:boolean; readonly quality?:HeavenlyQuality; readonly lightning:boolean};
  readonly operator?: MapActorSpriteModel;
}
export interface AlchemyWorkshopPlot {
  readonly id:string;
  readonly stage:'sown'|'sprout'|'leaf'|'flower';
}
export interface AlchemyWorkshopGarden {
  readonly plots:readonly AlchemyWorkshopPlot[];
  readonly growing:number;
  readonly ready:number;
  readonly anonymousGrowing:number;
  readonly anonymousReady:number;
}
export interface AlchemyWorkshopFrame {
  readonly siteId:string;
  readonly siteName:string;
  readonly tick:number;
  readonly furnace?:AlchemyWorkshopFurnace;
  readonly garden?:AlchemyWorkshopGarden;
}
export interface AlchemyWorkshopOptions {
  readonly viewer?:Cultivator;
  readonly historical?:boolean;
  readonly heatPreview?:HeavenlyHeat|{readonly targetHeavenlyRecipeId:HeavenlyRecipeId;readonly heavenlyAlchemyHeat:HeavenlyHeat};
}

function only<T>(rows:readonly T[], predicate:(row:T)=>boolean):T|undefined {
  let match:T|undefined;
  for(const row of rows)if(predicate(row)){
    if(match!==undefined)return;
    match=row;
  }
  return match;
}
const unique=<T extends {id:string}>(rows:readonly T[],id:string)=>only(rows,row=>row.id===id);
const nameFor=(name:string)=>[...name.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,'').trim()].slice(0,64).join('');

function currentFurnace(world:WorldState,viewer:Cultivator,preview?:AlchemyWorkshopOptions['heatPreview']):AlchemyWorkshopFurnace|undefined{
  const siteId=viewer.locationId, safety=projectFurnaceSafety(world,viewer,siteId);
  if(!safety)return;
  const state={grade:safety.installedGrade,status:safety.status};
  if(safety.status!=='open'||safety.installedGrade!==3)return {...state,mode:'idle'};
  const native=projectHeavenlyAlchemy(world,viewer);
  if(!native||native.actorId!==viewer.id||native.siteId!==siteId)return {...state,mode:'idle'};
  const tick=world.tick;
  const heat=typeof preview==='string'?preview:preview?.heavenlyAlchemyHeat;
  if(heat&&native.options.some(row=>row.heavenlyAlchemyMove==='brew'&&row.heavenlyAlchemyHeat===heat&&
    (typeof preview==='string'||row.targetHeavenlyRecipeId===preview?.targetHeavenlyRecipeId))){
    return {...state,mode:'preview',heat};
  }
  const attempt=only(viewer.heavenlyAlchemy?.attempts??[],row=>row.tick===tick);
  if(!attempt||attempt.id!==heavenlyBrewId(viewer.id,tick)||attempt.siteId!==siteId||attempt.use||
    !HEAVENLY_RECIPE_IDS.includes(attempt.recipeId)||!HEAVENLY_HEATS.includes(attempt.heat)||
    !Number.isInteger(attempt.roll)||attempt.roll<0||attempt.roll>999||
    !Number.isFinite(attempt.mastery)||!Number.isFinite(attempt.toxicity)||
    attempt.fireRoot!==(viewer.spiritRoot==='火')||heavenlyPillQuality(attempt)!==attempt.quality){
    return {...state,mode:'idle'};
  }
  const receipt=unique(world.events,heavenlyAlchemyEventId(viewer.id,tick,'brew'));
  const use=only(world.furnaceReservations.uses,row=>row.actorId===viewer.id&&row.tick===tick);
  if(!receipt||!use||use.siteId!==siteId||use.kind!=='brew'||use.workshopOrderId!==undefined||
    !Number.isInteger(use.slot)||use.slot<1||use.slot>safety.installedGrade||
    receipt.tick!==tick||receipt.year!==world.year||receipt.month!==world.month||
    receipt.locationId!==siteId||receipt.actorIds.length!==1||receipt.actorIds[0]!==viewer.id||
    receipt.witnessScope!==undefined||receipt.damage!==undefined||receipt.duelWinnerId!==undefined||receipt.dialogue!==undefined){
    return {...state,mode:'idle'};
  }
  if(use.reservationId!==undefined){
    const paid=unique(world.furnaceReservations.reservations,use.reservationId);
    if(!paid||paid.actorId!==viewer.id||paid.siteId!==siteId||paid.status!=='used'||
      paid.assignedTick!==tick||paid.closedTick!==tick||paid.slot!==use.slot||paid.workshopOrderId!==undefined){
      return {...state,mode:'idle'};
    }
  }
  const quality=attempt.quality, thunder=quality==='immortal'||quality==='peerless';
  const recipe=HEAVENLY_ALCHEMY_RECIPES[attempt.recipeId];
  const authority=thunder?heavenlyAlchemyLightning(world,receipt):undefined;
  const title=!quality?'高阶炼丹失手':thunder?'丹雷落定':'高阶灵丹成就';
  const suffix=quality?`${recipe.name}凝成${HEAVENLY_ALCHEMY_QUALITY[quality].name}。`:`${recipe.name}未能成丹；原材与炉资已尽。`;
  if(receipt.title!==title||receipt.category!==(thunder?'heavenly':'breakthrough')||
    !receipt.description.endsWith(suffix)||thunder&&
    (!authority||authority.actorId!==viewer.id||authority.siteId!==siteId||authority.brewId!==attempt.id||authority.quality!==quality)){
    return {...state,mode:'idle'};
  }
  const appearance=projectCultivatorPortrait(world,viewer);
  const operator:MapActorSpriteModel|undefined=appearance?{id:viewer.id,appearance,pose:'labor'}:undefined;
  return {...state,mode:'receipt',heat:attempt.heat,result:{success:quality!==undefined,lightning:thunder,...(quality?{quality}:{})},
    ...(operator?{operator}:{})};
}

function plotReceipt(world:WorldState,ownerId:string,plot:Omit<SeedPlot,'ownerId'>,
  tick:number,kind:'planted'|'ready',units:number):boolean {
  const id=`evt-${tick}-${plot.id}-${kind}`;
  const expectedTitle=kind==='planted'?'实种入圃':'灵植实熟待收';
  const matching=world.events.filter(event=>event.id===id);
  const receipt=matching.length===1?matching[0]:undefined;
  const prose=!!receipt&&receipt.tick===tick&&receipt.locationId===plot.siteId&&
    (world.year-receipt.year)*12+world.month-receipt.month===world.tick-tick&&
    receipt.actorIds.length===1&&receipt.actorIds[0]===ownerId&&receipt.witnessScope==='participants'&&
    receipt.category==='diplomacy'&&receipt.title===expectedTitle;
  if(matching.length&&!prose)return false;
  const months=world.resourceFlow.months.filter(row=>row.tick===tick);
  const reason=kind==='planted'?'seed_planted':'seed_crop_matured';
  const flows=months.flatMap(month=>month.entries.filter(row=>row.refId===plot.id&&row.reason===reason));
  const flow=flows.length===1?flows[0]:undefined;
  const custody=!!flow&&flow.tick===tick&&flow.mechanism==='seed_culture'&&flow.amount===units&&
    flow.visibility.kind==='participants'&&flow.visibility.actorIds.length===1&&flow.visibility.actorIds[0]===ownerId&&
    (kind==='planted'?flow.kind==='transfer'&&flow.good==='jade_seed'&&flow.from.kind==='seed_lot'&&flow.from.id===plot.lotId:
      flow.kind==='production'&&flow.good==='jade_leaf')&&
    'to' in flow&&flow.to.kind==='seed_plot'&&flow.to.id===plot.id;
  if(flows.length&&!custody||months.some(month=>month.entries.length===month.totalEntries)&&!custody)return false;
  return prose||custody;
}

function ownStage(world:WorldState,plot:Omit<SeedPlot,'ownerId'>,viewer:Cultivator):AlchemyWorkshopPlot|undefined{
  const {id,lotId,plantedTick,maturesTick,maturedTick,status,weather}=plot;
  if(status!=='growing'&&status!=='ready'||plot.loss||plot.settledTick!==undefined||
    !/^seed-plot-[1-9]\d*$/u.test(id)||!Number.isSafeInteger(plantedTick)||plantedTick<1||plantedTick>world.tick||
    maturesTick!==plantedTick+SEED_GROW_TICKS)return;
  const lot=unique(world.seedCulture.lots,lotId);
  if(!lot||lot.siteId!==plot.siteId||lot.ownerId!==viewer.id||lot.createdTick>=plantedTick||
    !lot.tests.some(test=>test.tick>lot.createdTick&&test.tick<plantedTick)||lot.loss&&lot.loss.tick<=plantedTick||
    !plotReceipt(world,viewer.id,plot,plantedTick,'planted',SEED_PLOT_UNITS))return;
  const expected=status==='ready'?SEED_GROW_TICKS:world.tick-plantedTick;
  if(weather.length!==expected||weather.some((reading,i)=>reading.tick!==plantedTick+i+1||
    !Number.isFinite(reading.intensity)||!Number.isFinite(reading.soilQi)||
    !['春','夏','秋','冬'].includes(reading.season)||!['平息','灵潮','罡风','霜息'].includes(reading.kind)||
    reading.waterDeficit!==undefined&&!Number.isFinite(reading.waterDeficit)))return;
  if(status==='growing')return world.tick<maturesTick&&maturedTick===undefined&&plot.yield===undefined?
    {id,stage:expected===0?'sown':expected===1?'sprout':'leaf'}:undefined;
  return maturedTick===maturesTick&&world.tick>=maturedTick&&world.tick<maturedTick+SEED_READY_TICKS&&
    (plot.yield===1||plot.yield===2)&&plot.yield<=SEED_PLOT_UNITS&&
    measureSeedPlot(world.terrain.seed,lotId,id,weather)===plot.yield&&
    plotReceipt(world,viewer.id,plot,maturedTick,'ready',plot.yield)?{id,stage:'flower'}:undefined;
}

function currentGarden(world:WorldState,viewer:Cultivator):AlchemyWorkshopGarden|undefined{
  const local=projectLocalSeedCulture(world,viewer);
  if(!local||local.siteId!==viewer.locationId)return;
  const own=projectSeedCulture(world,viewer).plots.filter(row=>row.siteId===local.siteId&&(row.status==='growing'||row.status==='ready'));
  const plots=own.flatMap(row=>{
    const source=unique(world.seedCulture.plots,row.id), proof=source?.ownerId===viewer.id&&ownStage(world,row,viewer);
    return proof?[proof]:[];
  }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const anonymousReady=Math.max(0,local.ready-own.filter(row=>row.status==='ready').length);
  const anonymousGrowing=Math.max(0,local.growing-own.filter(row=>row.status==='growing').length);
  const flowers=plots.filter(row=>row.stage==='flower').length;
  const growing=anonymousGrowing+plots.length-flowers,ready=anonymousReady+flowers;
  if(!growing&&!ready)return;
  return {plots,growing,ready,anonymousGrowing,anonymousReady};
}

export function projectAlchemyWorkshop(world:WorldState,view:ReturnType<typeof createTerrainMapView>,siteId:string,
  {viewer,historical,heatPreview}:AlchemyWorkshopOptions={}):AlchemyWorkshopFrame|undefined{
  if(historical||!viewer||!viewer.alive||!Number.isFinite(viewer.hp)||viewer.hp<=0||viewer.positionPlane!==undefined||
    unique(world.cultivators,viewer.id)!==viewer||viewer.locationId!==siteId)return;
  const site=unique(world.locations,siteId);
  if(!site||site.type==='secret_realm'||site.type==='abyss'||isScopedExpeditionGate(site))return;
  const tile=terrainTileAt(world,site.x,site.y);
  if(!tile||unique(view.seenLocations,siteId)!==site||view.locationTile.get(siteId)!==tile||
    !view.isCurrentLocation(siteId)||view.tileState(tile)!=='visible'||view.current&&!view.current.has(tile.id)||
    unique(view.liveActors,viewer.id)!==viewer||view.trailPositions.has(viewer.id)||mapTransitActorIds(world).has(viewer.id))return;
  const furnace=currentFurnace(world,viewer,heatPreview),garden=currentGarden(world,viewer);
  if(!furnace&&!garden)return;
  return {siteId,siteName:nameFor(site.name),tick:world.tick,...(furnace?{furnace}:{}),...(garden?{garden}:{})};
}
