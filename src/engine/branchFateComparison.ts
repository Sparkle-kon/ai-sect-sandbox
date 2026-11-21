import type {CultivationRealm,WorldEvent,WorldState} from '../types/world';
import {detectCampaignStop} from './campaignStopCondition';
import {isChronicleStoryFact} from './chronicleLead';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {activeEscortForActor} from './escortEngine';
import {pilgrimageCheckpoint} from './pilgrimageEngine';
import {activeRelocationForActor} from './relocationEngine';
import {activeCourierForActor} from './sealedCourierEngine';
import {currentVisibleTileIds,knownMapLocations,terrainTileAt} from './terrainEngine';
import type {TimelineBranch,TimelineSnapshot,WorldTimeline} from './timelineEngine';
import {sameGeneratedWorld} from './worldIdentity';
import {matchesWitnessedPersonalScene} from './witnessedPersonalStory';
import {executeGodIntervention} from './worldEngine';

export type BranchFateSubject={readonly kind:'actor'|'settlement'|'sect';readonly id:string};
type Side='left'|'right';
interface FactBase {readonly side:Side;readonly tick:number;readonly eventId:string}
export type BranchFateFact=FactBase&(
  | {readonly kind:'bestow'}
  | {readonly kind:'realm';readonly fromRealm:CultivationRealm;readonly fromStage:number;readonly toRealm:CultivationRealm;readonly toStage:number}
  | {readonly kind:'life';readonly outcome:'fallen'}
  | {readonly kind:'population';readonly before:number;readonly after:number}
  | {readonly kind:'leader';readonly previousLeaderId:string;readonly leaderId:string}
);
type BranchFateFailure='same_branch'|'missing_branch'|'bad_date'|'unknown_origin'|'subject_unavailable'|'incomplete_before_difference';
export type BranchFateResult=
  | {readonly ok:false;readonly reason:BranchFateFailure}
  | {readonly ok:true;readonly subject:{readonly kind:BranchFateSubject['kind'];readonly name:string};
    readonly originTick:number;readonly throughTick:number;readonly coverage:'complete'|'broken_after_difference';
    readonly firstDifference?:{readonly tick:number;readonly kind:BranchFateFact['kind'];readonly left?:BranchFateFact;readonly right?:BranchFateFact};
    readonly consequence?:BranchFateFact;readonly remoteCause:'unknown'};

const nat=(v:number)=>Number.isSafeInteger(v)&&v>=0;
const one=<T,>(rows:readonly T[],match:(item:T)=>boolean):T|undefined=>{
  const found=rows.filter(match);return found.length===1?found[0]:undefined;
};
const branchAt=(timeline:WorldTimeline,id:string)=>one(timeline.branches,row=>row.id===id);
const actorAt=(world:WorldState,id:string)=>one(world.cultivators,row=>row.id===id);
const sectAt=(world:WorldState,id:string)=>one(world.sects,row=>row.id===id);
const villageAt=(world:WorldState,id:string)=>one(world.settlements.villages,row=>row.id===id);
const place=(world:WorldState,id:string)=>one(world.locations,row=>row.id===id&&row.type!=='secret_realm'&&row.type!=='abyss');
const dated=(world:WorldState,event:WorldEvent)=>event.tick===world.tick&&event.year===world.year&&event.month===world.month;
const clean=(label:string)=>[...label.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').trim()].slice(0,80).join('');
function frame(branch:TimelineBranch,tick:number):TimelineSnapshot|undefined{
  return one(branch.snapshots,row=>row.tick===tick&&row.world.tick===tick);
}
function lineage(timeline:WorldTimeline,leaf:TimelineBranch,tick:number){
  const path=new Map<string,{branch:TimelineBranch;ceiling:number}>();
  let at:TimelineBranch|undefined=leaf,ceiling=tick;
  while(at){
    if(path.has(at.id))return undefined;
    path.set(at.id,{branch:at,ceiling});
    const parent:string|undefined=at.parentBranchId;
    if(!parent)return at.id==='main'?path:undefined;
    if(at.forkTick===undefined||!nat(at.forkTick))return undefined;
    ceiling=Math.min(ceiling,at.forkTick);
    at=branchAt(timeline,parent);
  }
  return undefined;
}
// Cold snapshots are data trees. Compare all native fields without depending on insertion order
// of JSON object keys after structured clone or verified storage read-back. Arrays keep exact order;
// absent/undefined optional object fields have the same canonical portable JSON representation.
function samePortableState(a:unknown,b:unknown):boolean{
  const remaining:[unknown,unknown][]=[[a,b]];
  while(remaining.length){
    const [x,y]=remaining.pop()!;
    if(x===y)continue;
    if(!x||!y||typeof x!=='object'||typeof y!=='object')return false;
    if(Array.isArray(x)||Array.isArray(y)){
      if(!Array.isArray(x)||!Array.isArray(y)||x.length!==y.length)return false;
      for(let i=0;i<x.length;i++)remaining.push([x[i],y[i]]);
      continue;
    }
    const xRecord=x as Record<string,unknown>,yRecord=y as Record<string,unknown>;
    const keys=Object.keys(xRecord).filter(key=>xRecord[key]!==undefined);
    if(keys.length!==Object.keys(yRecord).filter(key=>yRecord[key]!==undefined).length)return false;
    for(const key of keys){
      if(!Object.hasOwn(yRecord,key))return false;
      remaining.push([xRecord[key],yRecord[key]]);
    }
  }
  return true;
}
function sameWorld(a:WorldState,b:WorldState){
  return a===b||sameGeneratedWorld(a,b)&&a.tick===b.tick&&a.year===b.year&&a.month===b.month&&
    a.interventionSequence===b.interventionSequence&&a.random.state===b.random.state&&samePortableState(a,b);
}
function sameAge(a:WorldState,b:WorldState){
  return a.tick===b.tick&&a.year===b.year&&a.month===b.month&&sameGeneratedWorld(a,b)&&
    a.worldgen?.birthTick===b.worldgen?.birthTick;
}
function safeEvent(world:WorldState,match:(event:WorldEvent)=>boolean){
  const event=one(world.events,row=>dated(world,row)&&isChronicleStoryFact(row,world.tick)&&match(row));
  return event&&world.events.filter(row=>row.id===event.id).length===1?event:undefined;
}

/** Reproduction starts only from the proved retained native ancestor, never reconstructed genesis. */
function realBestow(source:WorldState,candidate:WorldState):WorldEvent|undefined{
  if(!sameAge(source,candidate)||candidate.interventionSequence!==source.interventionSequence+1||candidate.random.state!==source.random.state)return undefined;
  const id=`evt-god-treasure-${source.tick}-${source.interventionSequence+1}`;
  const event=safeEvent(candidate,row=>row.id===id&&row.category==='heavenly'&&!!row.locationId&&!!place(source,row.locationId));
  if(!event?.locationId)return undefined;
  return sameWorld(executeGodIntervention(source,{type:'SPAWN_TREASURE',targetLocationId:event.locationId}),candidate)?event:undefined;
}

interface Origin { readonly world:WorldState;readonly leftGift?:WorldEvent;readonly rightGift?:WorldEvent }
function sharedOrigin(timeline:WorldTimeline,left:TimelineBranch,right:TimelineBranch,through:number):Origin|undefined{
  const a=lineage(timeline,left,through),b=lineage(timeline,right,through);
  if(!a||!b)return undefined;
  // Deepest common native parent, not merely two saves that use the same seed/date.
  const common=[...a.values()].find(row=>b.has(row.branch.id));
  if(!common)return undefined;
  const ceiling=Math.min(common.ceiling,b.get(common.branch.id)!.ceiling);
  const candidates=common.branch.snapshots.filter(row=>row.tick<=ceiling).sort((x,y)=>y.tick-x.tick);
  for(const slot of candidates){
    if(!nat(slot.tick)||frame(common.branch,slot.tick)!==slot)continue;
    const x=frame(left,slot.tick)?.world,y=frame(right,slot.tick)?.world;
    if(!x||!y||!sameAge(slot.world,x)||!sameAge(slot.world,y))continue;
    const leftEqual=sameWorld(slot.world,x),rightEqual=sameWorld(slot.world,y);
    const leftGift=leftEqual?undefined:realBestow(slot.world,x),rightGift=rightEqual?undefined:realBestow(slot.world,y);
    if((leftEqual||leftGift)&&(rightEqual||rightGift))
      return {world:slot.world,...(leftGift?{leftGift}:{}),...(rightGift?{rightGift}:{})};
  }
  return undefined;
}

const clearlySettled=(world:WorldState,actor:WorldState['cultivators'][number])=>
  !activeCourierForActor(world,actor)&&!activeEscortForActor(world,actor)&&!activeRelocationForActor(world,actor)&&
  !pilgrimageCheckpoint(world,actor)&&!expeditionRescueCheckpoint(world,actor)&&!boundaryReliefCheckpoint(world,actor)&&
  !world.sieges.some(siege=>siege.status==='marching'&&siege.participantIds.includes(actor.id));

function visibleEntityName(source:WorldState,subject:BranchFateSubject,viewerId:string|null|undefined){
  const viewer=viewerId?actorAt(source,viewerId):undefined;
  if(!viewer?.alive||viewer.hp<=0)return undefined;
  if(subject.kind==='actor'){
    const actor=actorAt(source,subject.id),location=actor&&place(source,actor.locationId);
    if(!actor||!location)return undefined;
    if(actor.id!==viewer.id){
      if(!clearlySettled(source,actor)||!clearlySettled(source,viewer))return undefined;
      const tile=terrainTileAt(source,location.x,location.y);
      if(!tile||!currentVisibleTileIds(source,viewer).has(tile.id))return undefined;
    }
    return clean(actor.name)||undefined;
  }
  const known=new Set(knownMapLocations(source,viewer).map(row=>row.id));
  if(subject.kind==='settlement'){
    const village=villageAt(source,subject.id);
    return village&&known.has(village.locationId)&&place(source,village.locationId)?clean(village.name)||undefined:undefined;
  }
  const sect=sectAt(source,subject.id);
  return sect&&known.has(sect.headquartersId)&&place(source,sect.headquartersId)?clean(sect.name)||undefined:undefined;
}

export type BranchFateSubjectChoice=BranchFateSubject&{readonly name:string};

/** Lists only subjects which the exact reading viewer can identify at the proven common point. */
export function listBranchFateSubjects(timeline:WorldTimeline,leftId:string,rightId:string,throughTick:number,
    viewerId?:string|null):BranchFateSubjectChoice[]{
  if(leftId===rightId||!nat(throughTick)||!viewerId)return [];
  const left=branchAt(timeline,leftId),right=branchAt(timeline,rightId);
  if(!left||!right||!frame(left,throughTick)||!frame(right,throughTick))return [];
  const origin=sharedOrigin(timeline,left,right,throughTick)?.world;
  if(!origin)return [];
  const groups:readonly (readonly [BranchFateSubject['kind'],readonly {id:string}[]])[]=[
    ['actor',origin.cultivators],['settlement',origin.settlements.villages],['sect',origin.sects]
  ];
  return groups.flatMap(([kind,rows])=>rows.flatMap(({id}):BranchFateSubjectChoice[]=>{
    const name=visibleEntityName(origin,{kind,id},viewerId);
    return name?[{kind,id,name}]:[];
  }));
}

function giftFact(side:Side,event:WorldEvent|undefined,source:WorldState,current:WorldState,subject:BranchFateSubject):BranchFateFact|undefined{
  if(subject.kind!=='actor'||!event?.actorIds.includes(subject.id))return undefined;
  const before=actorAt(source,subject.id),after=actorAt(current,subject.id);
  if(!before||!after||after.spiritStones!==before.spiritStones+500||
      after.qiProgress!==Math.min(100,before.qiProgress+30))return undefined;
  return {side,kind:'bestow',tick:event.tick,eventId:event.id};
}

function actorFact(side:Side,id:string,before:WorldState,after:WorldState):BranchFateFact|undefined{
  const old=actorAt(before,id),current=actorAt(after,id);
  if(!old||!current||!old.alive||old.hp<=0)return undefined;
  if(!current.alive&&current.hp===0){
    const receipt=detectCampaignStop({kind:'actor_died',actorId:id},before,after,after.events);
    if(receipt?.eventId)return {side,kind:'life',tick:after.tick,eventId:receipt.eventId,outcome:'fallen'};
    return undefined;
  }
  if(old.realm===current.realm&&old.realmStage===current.realmStage)return undefined;
  const source=safeEvent(after,row=>row.category==='breakthrough'&&row.actorIds.length===1&&row.actorIds[0]===id&&
    (row.id===`evt-${after.tick}-${id}-break`||row.id===`evt-${after.tick}-${id}-tribulation-passed`));
  if(!source)return undefined;
  return {side,kind:'realm',tick:after.tick,eventId:source.id,fromRealm:old.realm,fromStage:old.realmStage,toRealm:current.realm,toStage:current.realmStage};
}
function villageFact(side:Side,id:string,before:WorldState,after:WorldState):BranchFateFact|undefined{
  const old=villageAt(before,id),current=villageAt(after,id);
  if(!old||!current||old.population===current.population)return undefined;
  const delta=current.population-old.population;
  const records=after.settlements.records.filter(row=>row.tick===after.tick&&(row.settlementId===id||row.targetSettlementId===id)&&
    row.people>0&&row.kind!=='relief');
  if(records.length!==1)return undefined; // One displayed consequence must explain only its own proved number.
  const row=records[0],gain=row.kind==='growth'||row.kind==='migration'&&row.targetSettlementId===id;
  if(delta!==(gain?row.people:-row.people))return undefined;
  const event=safeEvent(after,event=>event.id===`evt-${row.id}`&&event.category==='diplomacy'&&
    villageAt(after,row.settlementId)?.locationId===event.locationId);
  return event&&{side,kind:'population',tick:after.tick,eventId:event.id,before:old.population,after:current.population};
}
function leaderFact(side:Side,id:string,before:WorldState,after:WorldState,origin:WorldState):BranchFateFact|undefined{
  const start=sectAt(origin,id)?.leaderId;
  if(!start)return undefined;
  const hit=detectCampaignStop({kind:'sect_leader_changed',sectId:id,initialLeaderId:start},before,after,after.events);
  if(hit?.kind!=='sect_leader_changed'||!hit.eventId)return undefined;
  return {side,kind:'leader',tick:after.tick,eventId:hit.eventId,previousLeaderId:hit.fromActorId,leaderId:hit.toActorId};
}
function observedFact(side:Side,subject:BranchFateSubject,before:WorldState,after:WorldState,origin:WorldState):BranchFateFact|undefined{
  if(subject.kind==='actor')return actorFact(side,subject.id,before,after);
  if(subject.kind==='settlement')return villageFact(side,subject.id,before,after);
  return leaderFact(side,subject.id,before,after,origin);
}
function equalSubjects(left:WorldState,right:WorldState,subject:BranchFateSubject):boolean|undefined{
  if(subject.kind==='actor'){
    const a=actorAt(left,subject.id),b=actorAt(right,subject.id);
    return a&&b?a.alive===b.alive&&a.realm===b.realm&&a.realmStage===b.realmStage:undefined;
  }
  if(subject.kind==='settlement'){
    const a=villageAt(left,subject.id),b=villageAt(right,subject.id);
    return a&&b?a.population===b.population:undefined;
  }
  const a=sectAt(left,subject.id),b=sectAt(right,subject.id);
  return a&&b?a.leaderId===b.leaderId:undefined;
}
function scopedFact(fact:BranchFateFact|undefined,before:WorldState,after:WorldState,
    viewerId:string|null|undefined):BranchFateFact|undefined{
  if(!fact||!viewerId)return undefined;
  const event=safeEvent(after,row=>row.id===fact.eventId);
  if(!event?.locationId||!place(after,event.locationId))return undefined;
  const canSee=(world:WorldState)=>{
    const viewer=actorAt(world,viewerId),site=place(world,event.locationId!);
    const tile=site&&terrainTileAt(world,site.x,site.y);
    return !!viewer?.alive&&viewer.hp>0&&clearlySettled(world,viewer)&&!!tile&&currentVisibleTileIds(world,viewer).has(tile.id);
  };
  const witnessed=after.witnessedPersonalStory.scenes.some(row=>
    row.witnessIds.includes(viewerId)&&matchesWitnessedPersonalScene(row,event));
  const directlyFallen=fact.kind==='life'&&event.actorIds.includes(viewerId)&&
    !!actorAt(before,viewerId)?.alive&&actorAt(after,viewerId)?.alive===false&&actorAt(after,viewerId)?.hp===0&&canSee(before);
  // Where a current frame is insufficient, use exact emission-time witness custody
  // or the confirmed selected deceased themselves, never their old neighbor's stale location.
  return witnessed||directlyFallen||canSee(after)?fact:undefined;
}
function bestowReadiness(origin:WorldState,gifted:WorldState,actorId:string){
  const source=actorAt(origin,actorId),gift=actorAt(gifted,actorId);
  return !!source&&!!gift&&source.qiProgress<92&&gift.qiProgress>=92;
}
const next=(a:WorldState,b:WorldState)=>b.tick===a.tick+1&&b.month===a.month%12+1&&b.year===a.year+(a.month===12?1:0);

/** Read-only from one verified timeline. Event itself explains its directly observed native change, not wider causation. */
export function compareBranchFate(timeline:WorldTimeline,leftId:string,rightId:string,throughTick:number,
    subject:BranchFateSubject,viewerId?:string|null):BranchFateResult{
  if(leftId===rightId)return {ok:false,reason:'same_branch'};
  const left=branchAt(timeline,leftId),right=branchAt(timeline,rightId);
  if(!left||!right)return {ok:false,reason:'missing_branch'};
  if(!nat(throughTick)||!frame(left,throughTick)||!frame(right,throughTick))return {ok:false,reason:'bad_date'};
  const shared=sharedOrigin(timeline,left,right,throughTick);
  if(!shared)return {ok:false,reason:'unknown_origin'};
  const label=visibleEntityName(shared.world,subject,viewerId);
  if(!label)return {ok:false,reason:'subject_unavailable'};
  let lt=frame(left,shared.world.tick)!.world,rt=frame(right,shared.world.tick)!.world;
  const leftAny=giftFact('left',shared.leftGift,shared.world,lt,subject);
  const rightAny=giftFact('right',shared.rightGift,shared.world,rt,subject);
  const leftGift=scopedFact(leftAny,shared.world,lt,viewerId);
  const rightGift=scopedFact(rightAny,shared.world,rt,viewerId);
  if((leftAny&&!leftGift||rightAny&&!rightGift)&&!!leftAny!==!!rightAny)
    return {ok:false,reason:'incomplete_before_difference'};
  type Visible=Extract<BranchFateResult,{ok:true}>;
  let first:Visible['firstDifference'],consequence:BranchFateFact|undefined,broken=false;
  if(!!leftGift!==!!rightGift)first={tick:shared.world.tick,kind:'bestow',...(leftGift?{left:leftGift}:{}),...(rightGift?{right:rightGift}:{})};
  for(let tick=shared.world.tick+1;tick<=throughTick;tick++){
    const x=frame(left,tick)?.world,y=frame(right,tick)?.world;
    if(!x||!y||!sameAge(x,y)||!next(lt,x)||!next(rt,y)){broken=true;break;}
    const equal=equalSubjects(x,y,subject);
    if(equal===undefined){broken=true;break;}
    if(!equal){
      const a=scopedFact(observedFact('left',subject,lt,x,shared.world),lt,x,viewerId);
      const b=scopedFact(observedFact('right',subject,rt,y,shared.world),rt,y,viewerId);
      if(a||b){
        if(!first)first={tick,kind:(a??b)!.kind,...(a?{left:a}:{}),...(b?{right:b}:{})};
        else if(!consequence&&first.kind==='bestow'&&subject.kind==='actor'&&tick===first.tick+1){
          const provenLeft=first.left&&a?.kind==='realm'&&bestowReadiness(shared.world,lt,subject.id);
          const provenRight=first.right&&b?.kind==='realm'&&bestowReadiness(shared.world,rt,subject.id);
          consequence=provenLeft?a:provenRight?b:undefined;
        }
      }else if(!first||equalSubjects(lt,x,subject)===false||equalSubjects(rt,y,subject)===false){
        // A newly changed field without an authorized source cannot be reported as an observed difference.
        broken=true;
        break;
      }
    }
    lt=x;rt=y;
  }
  if(broken&&!first)return {ok:false,reason:'incomplete_before_difference'};
  return {ok:true,subject:{kind:subject.kind,name:label},originTick:shared.world.tick,throughTick,
    coverage:broken?'broken_after_difference':'complete',...(first?{firstDifference:first}:{}),
    ...(consequence?{consequence}:{}),remoteCause:'unknown'};
}
