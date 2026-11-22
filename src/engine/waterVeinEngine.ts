import type { ColdWaterVeinState, Cultivator, LLMDecisionPayload, WaterVeinMove,
  WaterVeinRenewalStance, WaterVeinSymptom, WorldEvent, WorldState } from '../types/world';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { flowActor,flowGranary,flowSect,recordResourceFlow } from './resourceFlowEngine';
import { routeWarningHazardValid } from './routeWarningProof';
import { terrainTileAt } from './terrainEngine';
import { granaryAt, validVillageGranaryBook } from './villageGranaryEngine';
import { nativeNorthGateRenewalAuthorized } from './northGateRenewalEngine';
import { northGateRenewalBlocksOrdinaryOpening } from './northGateRenewalTerms';
import { onLowerPlane } from './upperPassageIsolation';
import { northMiningIsSealed } from './northMiningCharterTerms';
import { northWellNativeMinePermit,northWellPrecinctRestricted,spendNorthWellNativeMinePermit } from './northWellRevisitTerms';
import { WATER_VEIN_BASELINE,WATER_VEIN_BORROW_UNITS,WATER_VEIN_COOLDOWN_TICKS,WATER_VEIN_ID,
  WATER_VEIN_OPEN_STONES,WATER_VEIN_ORE_CAPACITY,WATER_VEIN_RECOVERY_TICKS,WATER_VEIN_RENEWAL_FUNDING,WATER_VEIN_SIGNAL_OFFSETS,
  WATER_VEIN_SITE,WATER_VEIN_SURVEY_STONES,WATER_VEIN_TILES,latestWaterRow,waterVeinOpeningAt,waterVeinPhase,waterVeinSymptomEventId } from './waterVeinTerms';
export {waterVeinFieldDeficit} from './waterVeinTerms';

export interface WaterVeinOption {action:'WATER_VEIN';waterVeinMove:WaterVeinMove;targetLocationId:string}
type Measurement={wellDepth?:number;wellBaseline?:number;fieldDeficit?:number;mineYield:number};
type StanceInfo={paidStones:number;borrowedUnits:number;remainingUnits:number;year:number;month:number};
type CommonView={siteName:string;year:number;month:number;symptom?:WaterVeinSymptom};
export type WaterVeinView=
  | (CommonView&Measurement&{scope:'local';siteId:typeof WATER_VEIN_SITE;ownOpening?:StanceInfo})
  | (CommonView&Measurement&{scope:'survey';ownOpening?:StanceInfo})
  | (CommonView&{scope:'rumor';symptom:WaterVeinSymptom});

const moves=['observe','open','mine'] as const;
const stewards=new Set<Cultivator['sectRank']>(['长老','太上长老','掌门']);
const titles:Record<WaterVeinSymptom,string>={well:'北井水痕见浅',field:'北脉田土现干纹',mine:'北脉采口水声有异',recovered:'北井水痕回到旧线'};
const descriptions:Record<WaterVeinSymptom,string>={
  well:'井壁留下旧水痕，眼下的水面却退得更低；在场者只见了这处变化。',
  field:'北脉取水土壤现出干纹；如果这时真有已播田圃，结实仍须等实际观测与采收。',
  mine:'矿口水声变细，实取多少仍要看实际采账。',
  recovered:'水痕重新接上旧线；已经少收的田与矿不会自行补回。',
};

export function northWaterAddress(world:WorldState){
  const site=world.locations.find(row=>row.id===WATER_VEIN_SITE&&(row.type==='spirit_vein'||row.type==='sect_hq')&&row.spiritRoot==='水');
  if(!site||terrainTileAt(world,site.x,site.y)?.id!==WATER_VEIN_TILES[0])return undefined;
  if(!WATER_VEIN_TILES.every((id,index)=>world.terrain.tiles.some(tile=>tile.id===id&&tile.col===12&&tile.row===2+index)))return undefined;
  const village=world.settlements.villages.find(row=>row.locationId===site.id);
  return village?{site,village}:undefined;
}
export function completedNorthWaterWell(world:WorldState,settlementId:string,tick=world.tick){
  return world.villageWorks.projects.find(row=>row.settlementId===settlementId&&row.kind==='well'&&row.status==='completed'&&
    row.settledTick!==undefined&&row.settledTick<=tick&&row.stonesSpent===32&&row.rootsSpent===2&&row.laborTotal===4);
}
function nativeState(world:WorldState,settlementId:string):ColdWaterVeinState{
  return world.coldWaterVein??={version:1,veinId:WATER_VEIN_ID,siteId:WATER_VEIN_SITE,settlementId,
    tileIds:[...WATER_VEIN_TILES],oreRemaining:WATER_VEIN_ORE_CAPACITY,openings:[],observations:[],mining:[]};
}
function exactlyHere(world:WorldState,actor:Cultivator,tick:number){
  return world.cultivators.includes(actor)&&actor.age>=18&&doctrineFoundingPhysicallyAt(world,actor,WATER_VEIN_SITE,tick);
}
function disabledByHazard(world:WorldState,tick:number){
  return world.mapHazards.some(row=>row.tileId===WATER_VEIN_TILES[0]&&row.intensity>=2&&routeWarningHazardValid(world,row,tick));
}
function ownOpening(state:ColdWaterVeinState|undefined,actor:Cultivator,tick:number):StanceInfo|undefined{
  const opening=waterVeinOpeningAt(state,tick);
  if(!opening||opening.openerId!==actor.id)return undefined;
  return {paidStones:opening.paidStones,borrowedUnits:opening.borrowedUnits,remainingUnits:waterVeinPhase(opening,tick).remainingUnits,
    year:opening.year,month:opening.month};
}

export function availableWaterVeinActions(actor:Cultivator,world:WorldState,executionTick=world.tick):WaterVeinOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||!exactlyHere(world,actor,executionTick)||disabledByHazard(world,executionTick))return [];
  const address=northWaterAddress(world);
  if(!address||(address.site.ownerSectId&&address.site.ownerSectId!==actor.sectId))return [];
  const state=world.coldWaterVein;
  if(state&&(state.veinId!==WATER_VEIN_ID||state.settlementId!==address.village.id))return [];
  if(state&&(state.observations.some(row=>row.actorId===actor.id&&row.tick===executionTick)||
      state.mining.some(row=>row.actorId===actor.id&&row.tick===executionTick)||
      state.openings.some(row=>row.openerId===actor.id&&row.openedTick===executionTick)))return [];
  const options:WaterVeinMove[]=[];
  const sealed=northMiningIsSealed(world,executionTick);
  const restricted=northWellPrecinctRestricted(world,executionTick);
  const well=completedNorthWaterWell(world,address.village.id);
  if(well&&actor.spiritStones>=WATER_VEIN_SURVEY_STONES)options.push('observe');
  const sect=world.sects.find(row=>row.id===actor.sectId);
  const previous=waterVeinOpeningAt(state,executionTick);
  if(!northGateRenewalBlocksOrdinaryOpening(world,executionTick)&&!sealed&&!restricted&&well&&address.village.population>0&&steward(actor)&&sect&&sect.spiritStones>=WATER_VEIN_OPEN_STONES&&
      (!previous||previous.completedTick!==undefined&&executionTick>=previous.openedTick+WATER_VEIN_COOLDOWN_TICKS))options.push('open');
  const mineUnits=Math.min(state?.oreRemaining??WATER_VEIN_ORE_CAPACITY,waterVeinPhase(previous,executionTick).mineYield);
  if(!sealed&&(!restricted||northWellNativeMinePermit(world,actor.id,executionTick))&&mineUnits>0&&actor.spiritStones<=9999-mineUnits)options.push('mine');
  return options.map(waterVeinMove=>({action:'WATER_VEIN',waterVeinMove,targetLocationId:WATER_VEIN_SITE}));
}
function steward(actor:Cultivator){return stewards.has(actor.sectRank);}
export function utilityWaterVeinDecision(actor:Cultivator,world:WorldState):WaterVeinOption|undefined{
  if(actor.locationId!==WATER_VEIN_SITE)return undefined;
  const options=availableWaterVeinActions(actor,world);
  const state=world.coldWaterVein, opening=waterVeinOpeningAt(state,world.tick), phase=waterVeinPhase(opening,world.tick);
  const recent=latestWaterRow(state?.observations,row=>row.actorId===actor.id&&row.tick<=world.tick&&row.tick>=world.tick-6);
  const address=northWaterAddress(world), sect=world.sects.find(row=>row.id===actor.sectId);
  const open=options.find(row=>row.waterVeinMove==='open');
  if(open&&recent?.wellDepth===WATER_VEIN_BASELINE&&address?.site.ownerSectId===actor.sectId&&
    address.village.stress<30&&(sect?.spiritStones??0)>=WATER_VEIN_OPEN_STONES*5)return open;
  if(!recent&&phase.symptom&&phase.symptom!=='recovered')return options.find(row=>row.waterVeinMove==='observe');
  return actor.spiritStones<=35?options.find(row=>row.waterVeinMove==='mine'):undefined;
}

function event(world:WorldState,id:string,title:string,description:string,actorIds:string[],scope?:'participants'):WorldEvent{
  return {id,tick:world.tick,year:world.year,month:world.month,title,description,actorIds,locationId:WATER_VEIN_SITE,category:'diplomacy',
    ...(scope?{witnessScope:scope}:{})};
}
function spending(world:WorldState,actor:Cultivator,id:string,amount:number,op:'open'|'observe',sectId?:string){
  recordResourceFlow(world,{kind:'consumption', mechanism:'water_vein',reason:op==='open'?'cold_gate_opened':'north_well_measured',
    from:sectId?flowSect(sectId):flowActor(actor.id),good:'stone',amount,refId:id,visibility:{kind:'participants',actorIds:[actor.id]}});
}
export function northRenewalWaterTerms(world:WorldState,actor:Cultivator,executionTick=world.tick){
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||!onLowerPlane(actor)||!exactlyHere(world,actor,executionTick)||!steward(actor)||
    (actor.guardAssignment&&actor.guardAssignment.expiresTick>executionTick)||
    disabledByHazard(world,executionTick)||northMiningIsSealed(world,executionTick)||northWellPrecinctRestricted(world,executionTick))return undefined;
  const address=northWaterAddress(world),state=world.coldWaterVein;
  const sect=world.sects.find(row=>row.id===actor.sectId&&row.inactiveSinceTick===undefined);
  if(!address||!sect||!state||state.veinId!==WATER_VEIN_ID||state.settlementId!==address.village.id||
    state.siteId!==address.site.id||address.village.population<=0||
    (address.site.ownerSectId&&address.site.ownerSectId!==sect.id))return undefined;
  const well=completedNorthWaterWell(world,address.village.id,executionTick),previous=waterVeinOpeningAt(state,executionTick);
  if(!well||!previous||previous.completedTick===undefined||executionTick<previous.openedTick+WATER_VEIN_COOLDOWN_TICKS||
    state.observations.some(row=>row.tick===executionTick&&row.actorId===actor.id)||
    state.mining.some(row=>row.tick===executionTick&&row.actorId===actor.id))return undefined;
  const granary=granaryAt(world,address.village.id);
  const rootsAvailable=granary&&validVillageGranaryBook(world,granary)?granary.roots:0;
  return {sect,well,address,rootsAvailable,
    canReuse:sect.spiritStones>=WATER_VEIN_OPEN_STONES,
    canSect:sect.spiritStones>=WATER_VEIN_OPEN_STONES+WATER_VEIN_RENEWAL_FUNDING.sect.extraStones,
    canAccord:sect.spiritStones>=WATER_VEIN_OPEN_STONES+WATER_VEIN_RENEWAL_FUNDING.accord.extraStones&&
      rootsAvailable>=WATER_VEIN_RENEWAL_FUNDING.accord.roots+1};
}

const renewalProse = {
  reuse:['天门沿旧阵再开','本宗实付四十枚灵石。旧阵仍循北井借走九份水灵，先前的采契与运账不倒带。'],
  sect:['本宗独负天门耗损','本宗实付六十四枚灵石，以本宗供养运阵。本次不借北井水灵，也不取下界仓粮。'],
  accord:['两席合议改开天门','本宗实付四十八枚灵石，北地村仓实出一株地根，水脉另借三份水灵。此为当世两席之约。'],
} as const;
/** Internal settlement boundary; never a separate action or authorized merely by a funding quote. */
export function openRenewedNorthWaterGate(world:WorldState,actor:Cultivator,renewalId:string,stance:WaterVeinRenewalStance):WorldEvent|null{
  const authorized=nativeNorthGateRenewalAuthorized(world,actor,renewalId,stance);
  const terms=northRenewalWaterTerms(world,actor);
  const state=world.coldWaterVein;
  if(!authorized||!terms||!state||
    !(stance==='reuse'?terms.canReuse:stance==='sect'?terms.canSect:terms.canAccord))return null;
  const {endorserId}=authorized;
  const granary=granaryAt(world,terms.address.village.id);
  if(stance==='accord'&&(!endorserId||endorserId===actor.id||!granary))return null;
  if(stance!=='accord'&&endorserId!==undefined)return null;
  const funding=WATER_VEIN_RENEWAL_FUNDING[stance],id=`water-gate-${world.tick}`,{sect,well}=terms;
  sect.spiritStones-=WATER_VEIN_OPEN_STONES+funding.extraStones;
  if(funding.roots&&granary)granary.roots-=funding.roots;
  state.openings.push({id,openedTick:world.tick,year:world.year,month:world.month,openerId:actor.id,sectId:sect.id,
    wellProjectId:well.id,paidStones:WATER_VEIN_OPEN_STONES,borrowedUnits:funding.borrowedUnits,renewal:{id:renewalId,stance}});
  spending(world,actor,id,WATER_VEIN_OPEN_STONES,'open',sect.id);
  const visibility={kind:'participants' as const,actorIds:endorserId?[actor.id,endorserId]:[actor.id]};
  if(funding.extraStones)recordResourceFlow(world,{kind:'consumption',mechanism:'water_vein',reason:'cold_gate_renewal_sect',
    from:flowSect(sect.id),good:'stone',amount:funding.extraStones,refId:id,visibility});
  if(funding.roots&&granary)recordResourceFlow(world,{kind:'consumption',mechanism:'water_vein',reason:'cold_gate_renewal_granary',
    from:flowGranary(granary.settlementId),good:'earth_root',amount:funding.roots,refId:id,visibility});
  const [title,description]=renewalProse[stance];
  return event(world,`evt-${id}-opened`,title,description,[actor.id],'participants');
}

export function resolveWaterVeinAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='WATER_VEIN'||!moves.some(value=>value===payload.waterVeinMove)||
    Object.keys(payload).some(key=>!['chosenAction','innerMonologue','spokenLine','waterVeinMove','targetLocationId'].includes(key)))return null;
  const move=payload.waterVeinMove;
  if(!availableWaterVeinActions(actor,world).some(option=>option.waterVeinMove===move&&option.targetLocationId===payload.targetLocationId))return null;
  const address=northWaterAddress(world);
  if(!address)return null;
  const state=nativeState(world,address.village.id);
  const measured=waterVeinPhase(waterVeinOpeningAt(state,world.tick),world.tick);
  const well=completedNorthWaterWell(world,address.village.id);
  if(move==='observe'&&well){
    const id=`water-observation-${world.tick}-${actor.id}`;
    actor.spiritStones-=WATER_VEIN_SURVEY_STONES;
    const {wellDepth,fieldDeficit,mineYield,symptom}=measured;
    state.observations.push({id,actorId:actor.id,tick:world.tick,year:world.year,month:world.month,
      paidStones:WATER_VEIN_SURVEY_STONES,wellDepth,mineYield,...(fieldDeficit===undefined?{}:{fieldDeficit}),...(symptom?{symptom}:{})});
    spending(world,actor,id,WATER_VEIN_SURVEY_STONES,'observe');
    return event(world,`evt-${id}`,'北井实地落尺','本人实付两枚灵石校验北井，取得有日期的本地尺记，不等于勘出暗处来因。',[actor.id],'participants');
  }
  if(move==='open'&&well){
    const sect=world.sects.find(row=>row.id===actor.sectId);
    if(!sect)return null;
    const id=`water-gate-${world.tick}`;
    sect.spiritStones-=WATER_VEIN_OPEN_STONES;
    state.openings.push({id,openedTick:world.tick,year:world.year,month:world.month,openerId:actor.id,sectId:sect.id,
      wellProjectId:well.id,paidStones:WATER_VEIN_OPEN_STONES,borrowedUnits:WATER_VEIN_BORROW_UNITS});
    spending(world,actor,id,WATER_VEIN_OPEN_STONES,'open',sect.id);
    return event(world,`evt-${id}-opened`,'寒玉脉天门借灵','确从本宗实户支付四十灵石，水脉留有满额实欠。门仅引灵，没有人越界。',[actor.id],'participants');
  }
  if(move==='mine'){
    const id=`water-mine-${world.tick}-${actor.id}`;
    const units=Math.min(state.oreRemaining,measured.mineYield);
    if(units<1)return null;
    state.oreRemaining-=units;actor.spiritStones+=units;
    state.mining.push({id,actorId:actor.id,tick:world.tick,units});
    spendNorthWellNativeMinePermit(world,actor.id,id);
    recordResourceFlow(world,{kind:'production',mechanism:'water_vein',reason:'cold_ore_recovered',to:flowActor(actor.id),
      good:'stone',amount:units,refId:id,visibility:{kind:'participants',actorIds:[actor.id]}});
    return event(world,`evt-${id}`,'北脉矿口实取灵石',`从实际矿藏取出 ${units} 枚，当即收入本人持有。`,[actor.id],'participants');
  }
  return null;
}

export function advanceWaterVein(world:WorldState):WorldEvent[]{
  const state=world.coldWaterVein;
  if(!state||(state.lastAdvancedTick??0)>=world.tick)return [];
  state.lastAdvancedTick=world.tick;
  const address=northWaterAddress(world);
  const opening=waterVeinOpeningAt(state,world.tick);
  if(!opening||opening.completedTick!==undefined)return [];
  if(world.tick>=opening.openedTick+WATER_VEIN_RECOVERY_TICKS)opening.completedTick=world.tick;
  if(opening.borrowedUnits===0||!address||address.village.id!==state.settlementId||!completedNorthWaterWell(world,address.village.id))return [];
  const symptom=(Object.keys(WATER_VEIN_SIGNAL_OFFSETS) as WaterVeinSymptom[]).find(key=>
    world.tick-opening.openedTick===WATER_VEIN_SIGNAL_OFFSETS[key]);
  if(!symptom)return [];
  const witnesses=world.cultivators.filter(actor=>exactlyHere(world,actor,world.tick)).map(actor=>actor.id);
  return [event(world,waterVeinSymptomEventId(opening,symptom),titles[symptom],descriptions[symptom],witnesses)];
}
export function projectWaterVein(world:WorldState,viewer?:Cultivator):WaterVeinView|undefined{
  if(!viewer||!world.cultivators.includes(viewer)||!viewer.alive||viewer.hp<=0)return undefined;
  const address=northWaterAddress(world),state=world.coldWaterVein,siteName=address?.site.name;
  if(!address||!siteName)return undefined;
  const opening=waterVeinOpeningAt(state,world.tick);
  if(exactlyHere(world,viewer,world.tick)){
    const {wellDepth,fieldDeficit,mineYield,symptom}=waterVeinPhase(opening,world.tick);
    const high=completedNorthWaterWell(world,address.village.id)?{wellDepth,wellBaseline:WATER_VEIN_BASELINE}:{};
    return {scope:'local',siteName,siteId:WATER_VEIN_SITE,year:world.year,month:world.month,...high,mineYield,fieldDeficit,symptom,
      ownOpening:ownOpening(state,viewer,world.tick)};
  }
  const measured=latestWaterRow(state?.observations,row=>row.actorId===viewer.id&&row.tick<=world.tick);
  if(measured)return {scope:'survey',siteName,year:measured.year,month:measured.month,wellBaseline:WATER_VEIN_BASELINE,
    wellDepth:measured.wellDepth,fieldDeficit:measured.fieldDeficit,mineYield:measured.mineYield,symptom:measured.symptom,
    ownOpening:ownOpening(state,viewer,measured.tick)};
  const candidates=new Map((state?.openings??[]).filter(row=>row.borrowedUnits>0).flatMap(row=>(Object.keys(WATER_VEIN_SIGNAL_OFFSETS) as WaterVeinSymptom[])
    .map(symptom=>[waterVeinSymptomEventId(row,symptom),symptom] as const)));
  const heard=viewer.rumors.filter(row=>row.hops>0&&row.originEventId&&candidates.has(row.originEventId)&&
      row.locationId===WATER_VEIN_SITE&&row.learnedTick<=world.tick&&row.witnessScope!=='participants'&&
      (row.provenance==='conversation'||row.provenance==='flying_sword'))
    .sort((a,b)=>b.originTick-a.originTick||b.learnedTick-a.learnedTick);
  for(const rumor of heard){
    const matching=world.events.find(row=>row.id===rumor.originEventId&&row.tick===rumor.originTick&&row.locationId===WATER_VEIN_SITE&&
      row.witnessScope!=='participants'&&rumor.originSourceCultivatorId!==undefined&&row.actorIds.includes(rumor.originSourceCultivatorId));
    const symptom=rumor.originEventId&&candidates.get(rumor.originEventId);
    if(matching&&symptom)return {scope:'rumor',siteName,year:matching.year,month:matching.month,symptom};
  }
  return undefined;
}
