import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import type {Cultivator,HerbId,LLMDecisionPayload,LocationNode,PersonalityTrait,WorldState} from '../types/world';
import {availableAlchemy} from './alchemyEngine';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {cultivationMultiplier} from './elementalEngine';
import {activeSiegeForActor} from './diplomacyEngine';
import {activeEscortForActor} from './escortEngine';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {activeOccasionForActor} from './occasionEngine';
import {activePilgrimageForActor,pilgrimageCheckpoint} from './pilgrimageEngine';
import {activeRelocationForActor} from './relocationEngine';
import {activeCourierForActor,courierActedThisTick} from './sealedCourierEngine';
import {currentVisibleTileIds,terrainTileAt} from './terrainEngine';
import {isTribulationActive} from './tribulationEngine';
import {ordinaryActionAttention} from './ordinaryActionEvidence';

export type OrdinaryIntentAction='REST'|'CULTIVATE'|'SOCIALIZE'|'EXPLORE'|'GATHER_HERBS';
export type OrdinaryIntentFactorKind='personality'|'recovery'|'local_need'|'known_intel'|'prior_commitment'|'repetition';
export interface OrdinaryIntentFactor {readonly kind:OrdinaryIntentFactorKind;readonly points:number}
type IntentChoice=
  | {readonly action:'REST'|'CULTIVATE';readonly targetCultivatorId?:never;readonly targetLocationId?:never;readonly targetHerbId?:never}
  | {readonly action:'SOCIALIZE';readonly targetCultivatorId:string;readonly targetLocationId?:never;readonly targetHerbId?:never}
  | {readonly action:'EXPLORE';readonly targetLocationId:string;readonly targetCultivatorId?:never;readonly targetHerbId?:never}
  | {readonly action:'GATHER_HERBS';readonly targetHerbId:HerbId;readonly targetLocationId?:never;readonly targetCultivatorId?:never};
export type OrdinaryIntentCandidate=IntentChoice&{readonly score:number;readonly factors:readonly OrdinaryIntentFactor[]};
const MAX_REPEAT_PENALTY=27;
const NATIVE_HERB_BAND:Record<HerbId,number>={jade_leaf:4,earth_root:3,star_bloom:2,shadow_moss:2};
const PERSONALITY:Record<PersonalityTrait,Partial<Record<OrdinaryIntentAction,number>>>={
  刚正:{SOCIALIZE:8,GATHER_HERBS:1},
  阴险:{CULTIVATE:5,REST:2,SOCIALIZE:-6},
  狂傲:{CULTIVATE:7,EXPLORE:2,REST:-6},
  苟道:{REST:8,CULTIVATE:4,EXPLORE:-8,GATHER_HERBS:3},
  痴情:{SOCIALIZE:12,REST:2},
  嗜血:{CULTIVATE:6,EXPLORE:3,SOCIALIZE:-9},
  逍遥:{EXPLORE:13,SOCIALIZE:6,CULTIVATE:-3,REST:-2},
  诡诈:{GATHER_HERBS:5,EXPLORE:5,SOCIALIZE:-3},
};
const ordinary=new Set<string>(['REST','CULTIVATE','SOCIALIZE','EXPLORE','GATHER_HERBS']);
export const isOrdinaryIntentAction=(value:unknown):value is OrdinaryIntentAction=>
  typeof value==='string'&&ordinary.has(value);

const bounded=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,Number.isFinite(v)?Math.round(v):0));
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const live=(a:Cultivator)=>a.alive&&a.hp>0;
const publicSite=(site:LocationNode)=>site.type!=='secret_realm'&&site.type!=='abyss';
const actualExecution=(world:WorldState,tick:number)=>tick===world.tick||tick===world.tick+1;
function inTransit(world:WorldState,actor:Cultivator,tick=world.tick){
  return !!activeDanxiaMedicineEscort(world,actor)||!!activeCourierForActor(world,actor)||(tick===world.tick&&courierActedThisTick(world,actor))||!!activeEscortForActor(world,actor)||
    !!activeRelocationForActor(world,actor)||!!pilgrimageCheckpoint(world,actor)||!!boundaryReliefCheckpoint(world,actor)||
    !!expeditionRescueCheckpoint(world,actor)||!!activeSiegeForActor(world,actor);
}
function allowedRoutineActor(world:WorldState,actor:Cultivator,tick:number){
  return world.cultivators.filter(row=>row.id===actor.id).length===1&&world.cultivators.includes(actor)&&live(actor)&&
    actor.hp>=actor.maxHp*.45&&!inTransit(world,actor,tick)&&!isTribulationActive(actor)&&!activeOccasionForActor(world,actor)&&
    !activePilgrimageForActor(world,actor);
}

export function hasOrdinaryIntentHistory(world:WorldState,actor:Cultivator,executionTick=world.tick):boolean{
  return actualExecution(world,executionTick)&&world.cultivators.includes(actor)&&ordinaryActionAttention(actor,executionTick).run>0;
}
function knownLeadWeight(world:WorldState,actor:Cultivator,known:ReadonlySet<string>,siteId:string){
  if(!known.has(siteId))return 0;
  const confidence=Math.max(0,...actor.rumors.filter(row=>row.locationId===siteId&&row.lead&&row.confidence>=65&&
    row.provenance!=='fabricated'&&!row.id.startsWith('rumor-forged-')&&row.witnessScope!=='participants'&&
    row.originTick<=world.tick&&row.learnedTick<=world.tick&&world.tick-row.originTick<=6)
    .map(row=>row.confidence));
  return confidence?bounded((confidence-40)/4,0,14):0;
}
function relevantCommitments(world:WorldState,actor:Cultivator,executionTick:number){
  const peers=new Set<string>();let jadeNeed=0;
  for(const row of world.households.guardianships){
    if(row.status!=='active'||row.acceptedTick===undefined||row.acceptedTick>=executionTick||
      row.guardianId!==actor.id&&row.wardId!==actor.id)continue;
    peers.add(row.guardianId===actor.id?row.wardId:row.guardianId);
  }
  for(const row of world.oaths.contracts){
    if(row.requesterId!==actor.id&&row.providerId!==actor.id)continue;
    if(row.status==='fulfilled'&&row.settledTick!==undefined&&row.settledTick<executionTick&&
      executionTick-row.settledTick<=12&&row.evidence.some(proof=>proof.kind==='delivery'&&proof.quantity>0)){
      peers.add(row.requesterId===actor.id?row.providerId:row.requesterId);
    }
    if(row.status==='active'&&row.providerId===actor.id&&row.term==='jade_herb'&&row.deadlineTick!==undefined&&
      row.deadlineTick>executionTick+1&&row.locationId===actor.locationId){
      jadeNeed=Math.max(jadeNeed,Math.min(8,row.quantity)-actor.herbs.jade_leaf);
    }
  }
  return {peers,jadeNeed};
}
const ordinaryKey=(candidate:IntentChoice)=>[candidate.action,candidate.targetCultivatorId,candidate.targetLocationId,candidate.targetHerbId].filter(Boolean).join(':');
export function matchesOrdinaryIntent(candidate:IntentChoice,payload:Pick<LLMDecisionPayload,'chosenAction'|'targetCultivatorId'|'targetLocationId'|'targetHerbId'>){
  return candidate.action===payload.chosenAction&&candidate.targetCultivatorId===payload.targetCultivatorId&&
    candidate.targetLocationId===payload.targetLocationId&&candidate.targetHerbId===payload.targetHerbId;
}

/** This is an ordinary-choice menu, never a replacement for native due/urgent or possession authority. */
export function rankOrdinaryIntents(world:WorldState,actor:Cultivator,executionTick=world.tick):OrdinaryIntentCandidate[]{
  if(!actualExecution(world,executionTick)||!allowedRoutineActor(world,actor,executionTick))return [];
  const site=world.locations.find(row=>row.id===actor.locationId);
  if(!site)return [];
  const candidates:OrdinaryIntentCandidate[]=[];
  const recorded=ordinaryActionAttention(actor,executionTick);
  const add=(candidate:IntentChoice,base:number,other:readonly OrdinaryIntentFactor[]=[])=>{
    const weighted:OrdinaryIntentFactor[]=[
      {kind:'personality',points:PERSONALITY[actor.personality][candidate.action]??0},...other,
      {kind:'repetition',points:recorded.last===candidate.action?-Math.min(MAX_REPEAT_PENALTY,recorded.run*9):0},
    ];
    const flags=weighted.filter(flag=>flag.points!==0);
    candidates.push({...candidate,score:bounded(base+flags.reduce((sum,flag)=>sum+flag.points,0),0,100),factors:flags});
  };
  const health=actor.hp/Math.max(1,actor.maxHp);
  add({action:'REST'},27,[{kind:'recovery',points:bounded((1-health)*57,0,32)}]);
  add({action:'CULTIVATE'},47,[{kind:'local_need',points:bounded((cultivationMultiplier(actor,site)-1)*12, -9,10)+
    bounded(actor.qiProgress/17,0,5)}]);

  const promises=relevantCommitments(world,actor,executionTick);
  if(publicSite(site)){
    const individuals=new Map<string,number>();
    for(const other of world.cultivators)individuals.set(other.id,(individuals.get(other.id)??0)+1);
    // Actual co-located living party only; no inferred player or rumor relationship.
    for(const other of world.cultivators){
      if(other.id===actor.id||individuals.get(other.id)!==1||!live(other)||other.locationId!==site.id||
         inTransit(world,other,executionTick)||isTribulationActive(other)||activeOccasionForActor(world,other))continue;
      const relation=world.relationships.find(row=>row.fromId===actor.id&&row.toId===other.id||
        row.toId===actor.id&&row.fromId===other.id);
      if(relation&&(relation.type==='血仇'||relation.affinity<=-40))continue;
      add({action:'SOCIALIZE',targetCultivatorId:other.id},40,[{kind:'local_need',
        points:bounded((relation?.affinity??0)/12,-4,7)},
        {kind:'prior_commitment',points:promises.peers.has(other.id)?10:0}]);
    }
  }

  if(!actor.guardAssignment){
    const visible=currentVisibleTileIds(world,actor),explored=new Set(actor.exploredTileIds);
    const candidateSites=world.locations.filter(target=>{
      const tile=terrainTileAt(world,target.x,target.y);
      return publicSite(target)&&target.id!==site.id&&!!tile&&(target.type==='market'||target.type==='sect_hq'||
        visible.has(tile.id)||explored.has(tile.id));
    });
    const known=new Set(candidateSites.map(row=>row.id));
    for(const destination of candidateSites){
      const tileId=terrainTileAt(world,destination.x,destination.y)?.id;
      if(tileId&&visible.has(tileId)&&world.mapHazards.some(row=>row.tileId===tileId&&row.createdTick<=world.tick&&
        row.expiresTick>executionTick&&row.intensity>=2))continue;
      const distance=Math.hypot(destination.x-site.x,destination.y-site.y);
      add({action:'EXPLORE',targetLocationId:destination.id},40,[
        {kind:'known_intel',points:knownLeadWeight(world,actor,known,destination.id)},
        {kind:'local_need',points:-bounded(distance/85,0,8)},
      ]);
    }
  }
  if(publicSite(site))for(const harvest of availableAlchemy(actor,world,executionTick)){
    if(harvest.action!=='GATHER_HERBS'||!harvest.targetHerbId)continue;
    const herb=harvest.targetHerbId,own=actor.herbs[herb],local=site.herbs[herb];
    if(!Number.isFinite(own)||!Number.isFinite(local)||own<0||local<1)continue;
    add({action:'GATHER_HERBS',targetHerbId:herb},35,[
      {kind:'local_need',points:bounded((NATIVE_HERB_BAND[herb]-own)*4,-12,16)+bounded(local/3,0,5)},
      {kind:'prior_commitment',points:herb==='jade_leaf'?bounded(promises.jadeNeed*3,0,9):0},
    ]);
  }
  return candidates.sort((left,right)=>right.score-left.score||cmp(ordinaryKey(left),ordinaryKey(right)));
}

/** A bounded projection of this actor's legal present choices, not narration or private source details. */
export function modelOrdinaryIntentOptions(world:WorldState,actor:Cultivator,executionTick:number):OrdinaryIntentCandidate[]{
  if(!hasOrdinaryIntentHistory(world,actor,executionTick))return [];
  const count=new Map<OrdinaryIntentAction,number>();
  return rankOrdinaryIntents(world,actor,executionTick).filter(candidate=>{
    const kept=count.get(candidate.action)??0;
    if(kept>=2)return false;
    count.set(candidate.action,kept+1);
    return true;
  });
}
