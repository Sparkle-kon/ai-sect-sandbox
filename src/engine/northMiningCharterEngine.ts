import type { Cultivator, LLMDecisionPayload, NorthMiningCharter, NorthMiningCharterSignature, NorthMiningDetour,
  NorthMiningStance, WorldEvent, WorldState } from '../types/world';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { findMapPath } from './mapMotionEngine';
import { routeWarningHazardValid } from './routeWarningProof';
import { terrainTileAt } from './terrainEngine';
import { flowSect, recordResourceFlow } from './resourceFlowEngine';
import { measureSeedPlot } from './seedCultureTerms';
import { waterVeinPhase } from './waterVeinTerms';
import { northWaterAddress, completedNorthWaterWell } from './waterVeinEngine';
import { activeNorthMiningCharter,NORTH_MINING_CHARTER_TICKS,NORTH_MINING_DETOUR_COST,NORTH_MINING_MARKET,
  NORTH_MINING_ROLES,NORTH_MINING_SETTLEMENT,NORTH_MINING_SITE,NORTH_MINING_WATER_MIDPOINTS } from './northMiningCharterTerms';

export type NorthMiningOption=
  | {action:'NORTH_MINING_CHARTER';northMiningMove:'propose';northMiningStance:NorthMiningStance;targetNorthMiningCharterId?:never}
  | {action:'NORTH_MINING_CHARTER';northMiningMove:'sign';targetNorthMiningCharterId:string;northMiningStance?:never};
export interface NorthMiningCharterView{
  scope:'local'|'personal';
  rows:{id:string;stance:NorthMiningStance;status:NorthMiningCharter['status'];active:boolean;year:number;month:number;
    signedRoles:NorthMiningCharterSignature['role'][];paidStones?:number;hasVerifiedPassage?:boolean;fieldWasReduced:boolean}[];
}
const stances:readonly NorthMiningStance[]=['seal','continue','detour'];
const steward=new Set<Cultivator['sectRank']>(['掌门','太上长老','长老']);
const midpoints=new Set<string>(NORTH_MINING_WATER_MIDPOINTS);
const actors=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id);
const physicallyHere=(world:WorldState,actor:Cultivator,tick:number)=>actor.age>=18&&world.cultivators.includes(actor)&&
  doctrineFoundingPhysicallyAt(world,actor,NORTH_MINING_SITE,tick);

export function computeNorthMiningDetour(world:WorldState,tick=world.tick):NorthMiningDetour|undefined{
  const north=northWaterAddress(world),village=world.settlements.villages.find(row=>row.id===NORTH_MINING_MARKET&&row.population>0);
  const market=world.locations.find(row=>row.id===village?.locationId&&row.type==='market');
  if(!north||north.village.id!==NORTH_MINING_SETTLEMENT||north.village.population<=0||!market||!village)return undefined;
  const blocked=new Set(world.mapHazards.filter(row=>row.intensity>=2&&routeWarningHazardValid(world,row,tick)).map(row=>row.tileId));
  const route=(avoidWater:boolean)=>{
    const tiles:string[]=[];
    for(const point of findMapPath(world,market,north.site,tile=>tile.biome!=='魔渊'&&
      (!avoidWater||(!midpoints.has(tile.id)&&!blocked.has(tile.id))))){
      const tile=terrainTileAt(world,point.x,point.y);
      if(!tile)return undefined;
      if(tiles.at(-1)!==tile.id)tiles.push(tile.id);
    }
    return tiles.length>=2&&tiles.length<=32?tiles:undefined;
  };
  const originalTiles=route(false),detourTiles=route(true);
  if(!originalTiles||!detourTiles||!originalTiles.some(id=>midpoints.has(id))||
    !detourTiles.some(id=>!originalTiles.includes(id)))return undefined;
  return {fromSettlementId:village.id,toSettlementId:north.village.id,originalTiles,detourTiles};
}
function currentRouteStillLegal(world:WorldState,route:NorthMiningDetour,tick:number):boolean{
  const sites=world.settlements.villages;
  const from=world.locations.find(row=>row.id===sites.find(village=>village.id===route.fromSettlementId&&village.population>0)?.locationId);
  const to=world.locations.find(row=>row.id===sites.find(village=>village.id===route.toSettlementId&&village.population>0)?.locationId);
  if(!from||!to||terrainTileAt(world,from.x,from.y)?.id!==route.detourTiles[0]||
    terrainTileAt(world,to.x,to.y)?.id!==route.detourTiles.at(-1))return false;
  const tiles=new Map(world.terrain.tiles.map(tile=>[tile.id,tile]));
  const blocked=new Set(world.mapHazards.filter(row=>row.intensity>=2&&routeWarningHazardValid(world,row,tick)).map(row=>row.tileId));
  return route.detourTiles.every((id,index)=>{
    const tile=tiles.get(id),prev=index>0&&tiles.get(route.detourTiles[index-1]);
    return !!tile&&tile.biome!=='魔渊'&&!midpoints.has(id)&&!blocked.has(id)&&
      (index===0||!!prev&&Math.abs(prev.col-tile.col)+Math.abs(prev.row-tile.row)===1);
  });
}
function sourceFor(world:WorldState,tick:number){
  const water=world.coldWaterVein, north=northWaterAddress(world);
  if(!water||!north||water.settlementId!==north.village.id||north.village.population<=0)return undefined;
  const well=completedNorthWaterWell(world,north.village.id,tick);
  if(!well)return undefined;
  for(let i=water.openings.length-1;i>=0;i--){
    const opening=water.openings[i];
    if(opening.openedTick>=tick||opening.wellProjectId!==well.id||
      (north.site.ownerSectId&&north.site.ownerSectId!==opening.sectId))continue;
    const plot=world.seedCulture.plots.find(row=>row.siteId===north.site.id&&row.maturedTick!==undefined&&
      row.maturedTick<=tick&&row.yield!==undefined&&row.weather.some(sample=>sample.tick>=opening.openedTick+2&&
        sample.tick<=opening.openedTick+5&&sample.waterDeficit!==undefined&&sample.waterDeficit===waterVeinPhase(opening,sample.tick).fieldDeficit));
    const reading=plot?.weather.find(sample=>sample.tick>=opening.openedTick+2&&sample.tick<=opening.openedTick+5&&
      sample.waterDeficit!==undefined&&sample.waterDeficit===waterVeinPhase(opening,sample.tick).fieldDeficit);
    const receipt=water.mining.find(row=>row.tick<=tick&&row.tick>=opening.openedTick+3&&row.tick<=opening.openedTick+5&&row.units===1);
    if(plot&&reading?.waterDeficit!==undefined&&receipt)return {north,opening,plot,reading,fieldDeficit:reading.waterDeficit,receipt,well};
  }
  return undefined;
}
function householdProof(world:WorldState,actor:Cultivator,settlementId:string,tick:number){
  const member=world.households.members.find(row=>row.status==='recruited'&&row.recruitedId===actor.id&&
    row.settlementId===settlementId&&row.settledTick!==undefined&&row.settledTick<tick);
  if(!member||!world.households.groups.some(row=>row.id===member.householdId&&
    row.presences.some(place=>place.settlementId===settlementId&&
      (place.adults>0||place.juvenileCohorts.some(cohort=>cohort.count>0)))))return undefined;
  return {householdId:member.householdId,volunteerId:member.volunteerId,recruitedTick:member.settledTick!};
}
function termsFor(actor:Cultivator,world:WorldState,row:NorthMiningCharter,role:NorthMiningCharterSignature['role'],tick:number):
  NorthMiningCharterSignature|undefined{
  if(!physicallyHere(world,actor,tick))return undefined;
  if(role==='household'){
    const proof=householdProof(world,actor,row.settlementId,tick);
    return proof?{actorId:actor.id,role,tick,...proof}:undefined;
  }
  if(role==='miner'){
    const slip=world.coldWaterVein?.mining.find(item=>item.id===row.miningReceiptId&&item.actorId===actor.id&&item.tick<tick);
    return slip?{actorId:actor.id,role,tick,miningReceiptId:slip.id}:undefined;
  }
  const address=northWaterAddress(world);
  const sect=world.sects.find(item=>item.id===actor.sectId&&item.id===row.sponsorSectId);
  if(!steward.has(actor.sectRank)||!sect||!address||(address.site.ownerSectId&&address.site.ownerSectId!==sect.id))return undefined;
  if(row.stance==='detour'&&(!row.route||sect.spiritStones<NORTH_MINING_DETOUR_COST||!currentRouteStillLegal(world,row.route,tick)))return undefined;
  return {actorId:actor.id,role,tick,sectId:sect.id};
}
function liveRow(world:WorldState,tick:number){
  return world.northMiningCharters?.charters.find(row=>row.status==='proposed'&&row.proposedTick<=tick&&tick<row.expiresTick);
}
function sourceStillValid(world:WorldState,row:NorthMiningCharter,tick:number):boolean{
  const address=northWaterAddress(world);
  if(!address||address.village.id!==row.settlementId||address.village.population<=0||
    completedNorthWaterWell(world,row.settlementId,tick)?.id!==row.wellProjectId||
    world.mapHazards.some(hazard=>hazard.tileId===world.coldWaterVein?.tileIds[0]&&hazard.intensity>=2&&routeWarningHazardValid(world,hazard,tick)))
    return false;
  return !(address.site.ownerSectId&&address.site.ownerSectId!==row.sponsorSectId);
}
export function availableNorthMiningCharterActions(actor:Cultivator,world:WorldState,executionTick=world.tick):NorthMiningOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||!physicallyHere(world,actor,executionTick))return [];
  const row=liveRow(world,executionTick);
  if(row){
    const latest=row.signatures.at(-1)?.tick??row.proposedTick,role=NORTH_MINING_ROLES[row.signatures.length];
    if(!role||latest>=executionTick||row.signatures.some(item=>item.actorId===actor.id)||!sourceStillValid(world,row,executionTick)||
      !termsFor(actor,world,row,role,executionTick))return [];
    if(role==='sect'&&!row.signatures.every(sig=>{
      const signer=actors(world,sig.actorId);
      return !!signer&&!!termsFor(signer,world,row,sig.role,executionTick);
    }))return [];
    return [{action:'NORTH_MINING_CHARTER',northMiningMove:'sign',targetNorthMiningCharterId:row.id}];
  }
  if(world.northMiningCharters?.charters.some(item=>item.proposedTick===executionTick))return [];
  const evidence=sourceFor(world,executionTick);
  if(!evidence||!householdProof(world,actor,evidence.north.village.id,executionTick))return [];
  const active=activeNorthMiningCharter(world,executionTick);
  // A single source must never endlessly reauthorize the same settled choice.
  if(active&&active.openingId===evidence.opening.id)return [];
  const route=computeNorthMiningDetour(world,executionTick);
  return stances.filter(stance=>stance!=='detour'||!!route).map(northMiningStance=>
    ({action:'NORTH_MINING_CHARTER',northMiningMove:'propose',northMiningStance}));
}
export function utilityNorthMiningDecision(actor:Cultivator,world:WorldState):NorthMiningOption|undefined{
  if(actor.locationId!==NORTH_MINING_SITE)return undefined;
  const options=availableNorthMiningCharterActions(actor,world);
  const exact=options.find(option=>option.northMiningMove==='sign');
  if(exact)return exact;
  const address=northWaterAddress(world);
  if(!address)return undefined;
  return options.find(option=>option.northMiningMove==='propose'&&option.northMiningStance==
    (address.village.stress>=40?'seal':actor.personality==='刚正'?'detour':'continue'));
}
function event(world:WorldState,row:NorthMiningCharter,actor:Cultivator,title:string,description:string):WorldEvent{
  return {id:`evt-${row.id}-${world.tick}-${actor.id}`,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',
    actorIds:[actor.id],locationId:NORTH_MINING_SITE,witnessScope:'participants',title,description};
}
export function resolveNorthMiningCharterAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='NORTH_MINING_CHARTER'||Object.keys(payload).some(key=>!['chosenAction','innerMonologue','spokenLine',
    'northMiningMove','northMiningStance','targetNorthMiningCharterId'].includes(key)))return null;
  const option=availableNorthMiningCharterActions(actor,world).find(row=>row.northMiningMove===payload.northMiningMove&&
    row.northMiningStance===payload.northMiningStance&&row.targetNorthMiningCharterId===payload.targetNorthMiningCharterId);
  if(!option)return null;
  if(option.northMiningMove==='propose'){
    const proof=sourceFor(world,world.tick);
    if(!proof)return null;
    const route=option.northMiningStance==='detour'?computeNorthMiningDetour(world):undefined;
    if(option.northMiningStance==='detour'&&!route)return null;
    const state=world.northMiningCharters??={version:1,charters:[]};
    const row:NorthMiningCharter={id:`north-mining-charter-${world.tick}`,proposedTick:world.tick,year:world.year,
      month:world.month,expiresTick:world.tick+NORTH_MINING_CHARTER_TICKS,proposerId:actor.id,
      stance:option.northMiningStance,status:'proposed',siteId:NORTH_MINING_SITE,settlementId:proof.north.village.id,
      wellProjectId:proof.well.id,openingId:proof.opening.id,plotId:proof.plot.id,fieldObservedTick:proof.reading.tick,fieldDeficit:proof.fieldDeficit,
      miningReceiptId:proof.receipt.id,sponsorSectId:proof.opening.sectId,signatures:[],...(route?{route}:{})};
    state.charters.push(row);
    return event(world,row,actor,'井边立下采契议案','先依原井、当时的田尺与一笔实采立议；今日并未签契、出资或改路。');
  }
  const row=liveRow(world,world.tick),role=row&&NORTH_MINING_ROLES[row.signatures.length];
  if(!row||!role||row.id!==option.targetNorthMiningCharterId)return null;
  const signature=termsFor(actor,world,row,role,world.tick);
  if(!signature)return null;
  if(signature.role!=='sect'){
    row.signatures.push(signature);
    return event(world,row,actor,'采契留下实际签名',role==='household'?'此人只凭原户资格签本席，不代表全村。':'此人以本人已实收的原矿据签本席。');
  }
  const sect=world.sects.find(item=>item.id===signature.sectId)!;
  const paid=row.stance==='detour'?NORTH_MINING_DETOUR_COST:0;
  if(sect.spiritStones<paid)return null;
  if(paid){
    sect.spiritStones-=paid;
    recordResourceFlow(world,{kind:'consumption',mechanism:'north_mining_charter',reason:'north_detour_paid',from:flowSect(sect.id),
      amount:paid,good:'stone',refId:row.id,visibility:{kind:'participants',actorIds:[...row.signatures.map(item=>item.actorId),actor.id]}});
  }
  row.signatures.push(signature);
  row.status='ratified';row.paidStones=paid;row.ratifiedTick=world.tick;
  const description=row.stance==='seal'?'原契开始阻止新借灵和新开采；以前的水债仍按原期限归还，不没收旧收入。':
    row.stance==='continue'?'维持原来矿口准入与存量，未从公库付款，也不抹去实际田尺。':
    '实从本宗库支出二十四灵石。旧运件不倒带，待新货实际走过才有路证。';
  return event(world,row,actor,'三席签成原采契',description);
}
export function advanceNorthMiningCharters(world:WorldState):void{
  for(const row of world.northMiningCharters?.charters??[])if(row.status==='proposed'&&row.expiresTick<=world.tick)row.status='expired';
}

export function projectNorthMiningCharters(world:WorldState,viewer?:Cultivator):NorthMiningCharterView|undefined{
  if(!viewer||!viewer.alive||viewer.hp<=0||!world.cultivators.includes(viewer))return undefined;
  const local=physicallyHere(world,viewer,world.tick);
  const active=local?activeNorthMiningCharter(world):undefined;
  const rows=(world.northMiningCharters?.charters??[]).filter(row=>row.proposedTick<=world.tick&&
    (local||row.status==='ratified'&&row.signatures.some(item=>item.actorId===viewer.id))).map(row=>{
    const own=row.signatures.some(item=>item.actorId===viewer.id);
    const plot=(local||own)&&world.seedCulture.plots.find(item=>item.id===row.plotId);
    const fieldWasReduced=!!plot&&plot.yield!==undefined&&plot.yield<measureSeedPlot(world.terrain.seed,plot.lotId,plot.id,
      plot.weather.map(({waterDeficit:_,...weather})=>weather));
    return {id:row.id,stance:row.stance,status:row.status,active:active?.id===row.id,year:row.year,month:row.month,
      signedRoles:row.signatures.map(item=>item.role),fieldWasReduced,
      ...(own&&row.paidStones!==undefined?{paidStones:row.paidStones}:{}),
      ...(local&&row.stance==='detour'&&row.status==='ratified'?{hasVerifiedPassage:row.firstPassage!==undefined}:{})};
  });
  return local||rows.length?{scope:local?'local':'personal',rows}:undefined;
}
