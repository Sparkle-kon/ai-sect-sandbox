import {DAO_PATH_IDS,type DaoIntentActivation,type DaoPathId,type DaoPathMove,type DaoPathPractice} from '../types/daoPath';
import type {Artifact,Cultivator,LLMDecisionPayload,LocationNode,WorldEvent,WorldState} from '../types/world';
import {durabilityOf,equippedArtifact,maxDurabilityOf} from './artifactEngine';
import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {disasterShelterLocksTravel} from './disasterShelterCheckpoint';
import {activeEscortForActor} from './escortEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {activePilgrimageForActor} from './pilgrimageEngine';
import {activeRelocationForActor} from './relocationEngine';
import {activeCourierForActor} from './sealedCourierEngine';
import {sparringLocksActor} from './sparringEngine';
import {isSectActive} from './sectActivity';
import {
  DAO_PATHS,DAO_PATH_MAX_PRACTICES,DAO_PATH_RANK_COUNTS,DAO_INTENT_HISTORY,DAO_INTENT_READY_TICKS,DAO_INTENT_QI,
  daoPathEventId,daoPathRank,
} from './daoPathTerms';

export interface DaoPathOption{action:'DAO_PATH';daoPathMove:DaoPathMove;targetDaoPathId:DaoPathId}
const unique=<T extends {id:string}>(items:readonly T[],id:string):T|undefined=>{
  let row:T|undefined;
  for(const value of items){if(value.id!==id)continue;if(row)return undefined;row=value;}
  return row;
};
function local(world:WorldState,actor:Cultivator,combat=false):LocationNode|undefined{
  if(!actor.alive||actor.hp<=0||actor.positionPlane!==undefined||unique(world.cultivators,actor.id)!==actor||
    actor.tribulation?.stage==='lightning'||actor.tribulation?.stage==='heart_demon'||
    (!combat&&world.forbiddenDuels?.some(row=>row.attackerId===actor.id||row.defenderId===actor.id))||
    world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(actor.id))||
    world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(actor.id)&&
      !row.dungeon?.members.some(member=>member.actorId===actor.id&&member.leftTick!==undefined)&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(actor.id)))||
    activeDanxiaMedicineEscort(world,actor)||activeEscortForActor(world,actor)||activePilgrimageForActor(world,actor)||
    activeRelocationForActor(world,actor)||activeCourierForActor(world,actor)||disasterShelterLocksTravel(world,actor)||
    expeditionRescueCheckpoint(world,actor)||boundaryReliefCheckpoint(world,actor)||sparringLocksActor(world,actor))return undefined;
  const site=unique(world.locations,actor.locationId);
  return site&&site.type!=='secret_realm'&&site.type!=='abyss'&&!isScopedExpeditionGate(site)?site:undefined;
}
function boundBlade(actor:Cultivator,id?:string):Artifact|undefined{
  const equipped=equippedArtifact(actor);
  return equipped?.id&&(!id||equipped.id===id)&&equipped.boundTo===actor.id&&durabilityOf(equipped)>0&&
    actor.artifacts.filter(value=>value.id===equipped.id).length===1?equipped:undefined;
}
function formation(world:WorldState,actor:Cultivator,site:LocationNode){
  const sect=unique(world.sects,actor.sectId);
  return isSectActive(sect)&&sect.headquartersId===site.id&&site.ownerSectId===sect.id&&sect.facilities.qi_array>0;
}
function eligible(world:WorldState,actor:Cultivator,site:LocationNode,pathId:DaoPathId){
  if(pathId==='sword')return Boolean(boundBlade(actor,actor.daoPath?.bladeId));
  if(pathId==='alchemy')return site.furnaceGrade>=2;
  if(pathId==='formation')return formation(world,actor,site);
  return true;
}
const affordable=(actor:Cultivator,id:DaoPathId)=>{
  const rule=DAO_PATHS[id];
  return actor.qiProgress>=rule.qi&&actor.spiritStones>=(rule.stones??0)&&actor.hp>(rule.hp??0)&&
    (!rule.herb||actor.herbs[rule.herb]>=1);
};
export function availableDaoPathActions(actor:Cultivator,world:WorldState,executionTick=world.tick):DaoPathOption[]{
  if(executionTick!==world.tick&&executionTick!==world.tick+1)return [];
  const site=local(world,actor),state=actor.daoPath;
  if(!site||state&&state.lastActedTick>=executionTick)return [];
  const option=(targetDaoPathId:DaoPathId,daoPathMove:DaoPathMove):DaoPathOption=>({action:'DAO_PATH',targetDaoPathId,daoPathMove});
  if(!state)return DAO_PATH_IDS.filter(pathId=>eligible(world,actor,site,pathId)).map(pathId=>option(pathId,'choose'));
  const pathId=state.pathId,choices:DaoPathOption[]=[];
  if(state.ready)choices.push(option(pathId,'cancel'));
  if(!eligible(world,actor,site,pathId))return choices;
  if(state.practices.length<DAO_PATH_MAX_PRACTICES&&affordable(actor,pathId))choices.unshift(option(pathId,'practice'));
  if(daoPathRank(state.practices.length)>0&&actor.qiProgress>=DAO_INTENT_QI&&
    (!state.ready||executionTick>state.ready.tick+DAO_INTENT_READY_TICKS))choices.unshift(option(pathId,'ready'));
  return choices;
}
const allowedKeys:ReadonlySet<string>=new Set(['chosenAction','daoPathMove','targetDaoPathId','innerMonologue']);
export function resolveDaoPathAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='DAO_PATH'||Object.keys(decision).some(key=>!allowedKeys.has(key)))return null;
  const site=local(world,actor);
  const option=availableDaoPathActions(actor,world).find(row=>row.daoPathMove===decision.daoPathMove&&row.targetDaoPathId===decision.targetDaoPathId);
  if(!site||!option)return null;
  const {daoPathMove:move,targetDaoPathId:pathId}=option,rule=DAO_PATHS[pathId];
  const stamp={tick:world.tick,siteId:site.id};
  const blade=pathId==='sword'?boundBlade(actor,actor.daoPath?.bladeId):undefined;
  let title:string,description:string;
  if(move==='choose'){
    actor.daoPath={pathId,chosenTick:world.tick,chosenSiteId:site.id,lastActedTick:world.tick,
      ...(blade?.id?{bladeId:blade.id}:{}),practices:[],activations:[]};
    title=`初问${rule.name}`;description='只选定修行道途，尚未领悟临阵真意。';
  }else{
    const state=actor.daoPath;
    if(!state)return null;
    state.lastActedTick=world.tick;
    if(move==='practice'){
      const receipts:DaoPathPractice={...stamp,qiPaid:rule.qi};
      actor.qiProgress-=rule.qi;
      if(rule.herb){actor.herbs[rule.herb]--;receipts.herbPaid=rule.herb;}
      if(rule.stones){actor.spiritStones-=rule.stones;receipts.stonesPaid=rule.stones;}
      if(rule.hp){actor.hp-=rule.hp;receipts.hpPaid=rule.hp;}
      if(blade?.id){
        const old=durabilityOf(blade),max=maxDurabilityOf(blade);
        blade.maxDurability=max+1;blade.durability=old+1;
        receipts.artifactId=blade.id;receipts.durabilityGain=1;
      }
      state.practices.push(receipts);
      title=daoPathRank(state.practices.length)>daoPathRank(state.practices.length-1)?`初见${rule.intent}`:`实修${rule.name}`;
      description='确已付出材料或气血；所得道行按实入册。';
    }else if(move==='ready'){
      state.ready={...stamp,...(blade?.id?{artifactId:blade.id}:{})};
      title=`蓄势：${rule.intent}`;description='取意不出，未耗临阵灵气；待后来亲历真斗法方可引动。';
    }else{
      delete state.ready;title='散去蓄势';description='只撤去临阵准备，未支付或返还能量。';
    }
  }
  return {id:daoPathEventId(actor.id,world.tick,move),tick:world.tick,year:world.year,month:world.month,category:'breakthrough',
    title,description,actorIds:[actor.id],locationId:site.id,witnessScope:'participants'};
}
type PaidIntent=Omit<DaoIntentActivation,'eventId'>;
const actualPaid=new WeakMap<PaidIntent,WorldState>();
/** Pure exact legal forecast (suspending a threatened contact cannot spend). */
export function previewDaoDuelIntents(world:WorldState,attacker:Cultivator,defender:Cultivator):PaidIntent[]{
  if(!attacker.daoPath?.ready&&!defender.daoPath?.ready)return [];
  const site=local(world,attacker,true);
  if(attacker.id===defender.id||attacker.locationId!==defender.locationId||!site||!local(world,defender,true))return [];
  const spent:PaidIntent[]=[];
  for(const actor of [attacker,defender]){
    const state=actor.daoPath,ready=state?.ready;
    if(!state||!ready||ready.tick>=world.tick||world.tick>ready.tick+DAO_INTENT_READY_TICKS||actor.qiProgress<DAO_INTENT_QI)continue;
    const pathId=state.pathId,rank=daoPathRank(state.practices.filter(row=>row.tick<=ready.tick).length);
    if(!rank||pathId==='sword'&&(!ready.artifactId||ready.artifactId!==state.bladeId||!boundBlade(actor,ready.artifactId))||
      pathId==='formation'&&!formation(world,actor,site))continue;
    const receipt:PaidIntent={actorId:actor.id,pathId,rank,tick:world.tick,readyTick:ready.tick,readySiteId:ready.siteId,siteId:actor.locationId,qiPaid:DAO_INTENT_QI,
      ...(ready.artifactId?{artifactId:ready.artifactId}:{})};
    spent.push(receipt);
  }
  return spent;
}
/** Only the actual committed native duel calls this after any non-violent interception or escape. */
export function consumeDaoDuelIntents(world:WorldState,attacker:Cultivator,defender:Cultivator):PaidIntent[]{
  const paid=previewDaoDuelIntents(world,attacker,defender);
  for(const item of paid){
    const actor=item.actorId===attacker.id?attacker:defender;
    actor.qiProgress-=DAO_INTENT_QI;
    if(actor.daoPath)delete actor.daoPath.ready;
    actualPaid.set(item,world);
  }
  return paid;
}
export function recordDaoDuelIntents(world:WorldState,event:WorldEvent,paid:readonly PaidIntent[]):void{
  if(!paid.length||event.witnessScope!==undefined||event.tick!==world.tick||event.year!==world.year||event.month!==world.month||
    (event.category!=='combat'&&event.category!=='death')||event.actorIds.length!==2||!event.duelWinnerId||
    !event.actorIds.includes(event.duelWinnerId)||event.id!==`evt-${world.tick}-${event.actorIds[0]}-${event.category==='death'?'kill':'duel'}`)return;
  const rows:DaoIntentActivation[]=[];
  for(const item of paid){
    const state=unique(world.cultivators,item.actorId)?.daoPath;
    if(!state||actualPaid.get(item)!==world||item.siteId!==event.locationId||!event.actorIds.includes(item.actorId))continue;
    actualPaid.delete(item);
    const record={...item,eventId:event.id};
    state.activations.push(record);
    if(state.activations.length>DAO_INTENT_HISTORY)state.activations.splice(0,state.activations.length-DAO_INTENT_HISTORY);
    rows.push(record);
  }
  if(rows.length)event.daoIntents=rows;
}
export interface DaoPathView {
  actorId:string;pathId?:DaoPathId;rank:ReturnType<typeof daoPathRank>;practiceCount:number;nextRankAt?:number;
  ready?:{tick:number;expiresTick:number;artifactId?:string};artifactName?:string;
  options:DaoPathOption[];activations:DaoIntentActivation[];
}
export function projectDaoPath(world:WorldState,actor:Cultivator):DaoPathView|undefined{
  if(!local(world,actor))return undefined;
  const state=actor.daoPath,count=state?.practices.length??0;
  const ready=state?.ready,blade=state?.pathId==='sword'?boundBlade(actor,state.bladeId):undefined;
  return {actorId:actor.id,pathId:state?.pathId,rank:daoPathRank(count),practiceCount:count,
    nextRankAt:DAO_PATH_RANK_COUNTS.find(value=>value>count),artifactName:blade?.name,
    ...(ready&&world.tick<=ready.tick+DAO_INTENT_READY_TICKS?{ready:{tick:ready.tick,
      expiresTick:ready.tick+DAO_INTENT_READY_TICKS,artifactId:ready.artifactId}}:{}),
    options:availableDaoPathActions(actor,world,world.tick+1),activations:(state?.activations??[]).slice(-4).map(row=>({...row}))};
}
export function projectDaoDuelIntents(world:WorldState,event:WorldEvent):DaoIntentActivation[]{
  if(event.tick!==world.tick||event.witnessScope!==undefined||!world.events.includes(event)||
    world.events.filter(row=>row.id===event.id).length!==1)return [];
  return (event.daoIntents??[]).filter(item=>item.eventId===event.id&&item.tick===event.tick&&item.siteId===event.locationId&&
    event.actorIds.includes(item.actorId)&&unique(world.cultivators,item.actorId)?.daoPath?.activations.some(row=>
      row.eventId===item.eventId&&row.pathId===item.pathId&&row.rank===item.rank&&row.siteId===item.siteId&&
      row.artifactId===item.artifactId&&row.readyTick===item.readyTick&&row.readySiteId===item.readySiteId&&row.qiPaid===item.qiPaid)).map(row=>({...row}));
}
