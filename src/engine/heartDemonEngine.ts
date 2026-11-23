import {HEART_DEMON_CHOICES,type HeartDemonChoice,type HeartDemonEvidence,type HeartDemonFrame,type HeartDemonGuide,
  type HeartDemonOrigin,type HeartDemonOutcome} from '../types/heartDemon';
import type {CultivationRealm,Cultivator,LLMDecisionPayload,TribulationTrial,WorldEvent,WorldState} from '../types/world';
import {cloneWorldWithColdHistory} from './coldHistoryEngine';
import {recordMemory} from './memoryEngine';
import {matchesWitnessedPersonalScene} from './witnessedPersonalStory';

const REALMS:ReadonlySet<CultivationRealm>=new Set(['金丹','元婴','化神']);
const isChoice=(candidate:HeartDemonChoice|undefined):candidate is HeartDemonChoice=>
  candidate!==undefined&&HEART_DEMON_CHOICES.includes(candidate);
const ascii=(a:string,b:string)=>a<b?-1:a>b?1:0;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const alive=(actor:Cultivator)=>actor.alive&&actor.hp>0&&actor.positionPlane===undefined;
type Bond=Extract<HeartDemonEvidence,{kind:'bond'}>;
const roles:ReadonlySet<string>=new Set(['血仇','道侣','师徒','挚友']);

export const isHeartDemonRealm=(realm:CultivationRealm):boolean=>REALMS.has(realm);
export const heartDemonFrameId=(trialId:string)=>`heart-demon-${trialId}`;
export const heartDemonFinalWaveId=(actorId:string,tick:number,waves:number)=>`evt-${tick}-${actorId}-tribulation-wave-${waves}`;
export const heartDemonResultEventId=(frameId:string)=>`evt-${frameId}-resolved`;
const labels:Record<HeartDemonChoice,string>={sever:'斩断尘缘',wrath:'以杀止杀',face:'直面愧疚'};
const actorAt=(world:WorldState,id:string):Cultivator|undefined=>{
  const rows=world.cultivators.filter(row=>row.id===id);
  return rows.length===1?rows[0]:undefined;
};
const pair=(left:string,right:string,a:string,b:string)=>left===a&&right===b||left===b&&right===a;
const role=(value:string):value is Bond['role']=>roles.has(value);
const privateKeys=new Set(['chosenAction','innerMonologue','targetHeartTrialId','heartDemonChoice']);

function currentBond(world:WorldState,actorId:string,evidence:Bond){
  return world.relationships.some(edge=>pair(edge.fromId,edge.toId,actorId,evidence.otherActorId)&&edge.type===evidence.role);
}

/** Sources are exact native pair facts; a similar title, name, or bare relationship is not enough. */
export function heartDemonBondSourceRetained(world:WorldState,actorId:string,bond:Bond,throughTick:number):boolean{
  const {source,otherActorId}=bond;
  if(source.tick>throughTick||source.tick<0||actorId===otherActorId||!actorAt(world,otherActorId))return false;
  if(source.kind==='lineage'){
    return bond.role==='师徒'&&pair(source.mentorId,source.studentId,actorId,otherActorId)&&
      world.mentorship.lineage.filter(row=>row.mentorId===source.mentorId&&row.studentId===source.studentId&&row.formedTick===source.tick).length===1;
  }
  const originals=world.events.filter(row=>row.id===source.eventId);
  const [event]=originals;
  return originals.length===1&&!!event&&event.tick===source.tick&&event.actorIds.length===2&&
    pair(event.actorIds[0],event.actorIds[1],actorId,otherActorId)&&world.witnessedPersonalStory.scenes.some(row=>
      row.eventId===source.eventId&&row.witnessIds.includes(actorId)&&row.witnessIds.includes(otherActorId)&&
      (bond.role!=='血仇'||row.kind==='duel')&&matchesWitnessedPersonalScene(row,event));
}

function evidenceFor(world:WorldState,actor:Cultivator):HeartDemonEvidence{
  const relations=world.relationships.flatMap(edge=>{
    const otherActorId=edge.fromId===actor.id?edge.toId:edge.toId===actor.id?edge.fromId:undefined;
    return otherActorId&&otherActorId!==actor.id&&role(edge.type)?[{otherActorId,role:edge.type,weight:Math.abs(edge.affinity)}]:[];
  }).sort((a,b)=>b.weight-a.weight||ascii(a.otherActorId,b.otherActorId));
  for(const relation of relations){
    const {otherActorId,role}=relation;
    if(role==='师徒'){
      const lineage=world.mentorship.lineage.filter(row=>pair(row.mentorId,row.studentId,actor.id,otherActorId)&&
        row.formedTick<world.tick).sort((a,b)=>b.formedTick-a.formedTick);
      for(const row of lineage){
        const candidate:Bond={kind:'bond',otherActorId,role,source:{kind:'lineage',mentorId:row.mentorId,studentId:row.studentId,tick:row.formedTick}};
        if(heartDemonBondSourceRetained(world,actor.id,candidate,world.tick))return candidate;
      }
    }
    const scenes=world.witnessedPersonalStory.scenes.filter(row=>row.tick<world.tick&&row.actorIds.includes(actor.id)&&
      row.actorIds.includes(otherActorId)).sort((a,b)=>b.tick-a.tick||ascii(a.eventId,b.eventId));
    for(const row of scenes){
      const candidate:Bond={kind:'bond',otherActorId,role,source:{kind:'scene',eventId:row.eventId,tick:row.tick}};
      if(heartDemonBondSourceRetained(world,actor.id,candidate,world.tick))return candidate;
    }
  }
  const memoryById=new Map([...actor.coreMemories,...actor.memories].map(row=>[row.id,row]));
  const reflections=actor.reflections.filter(row=>row.kind!=='belief'&&row.tick<world.tick)
    .sort((a,b)=>b.intensity-a.intensity||b.tick-a.tick||ascii(a.id,b.id));
  for(const reflection of reflections){
    for(const memoryId of reflection.sourceMemoryIds){
      const memory=memoryById.get(memoryId);
      if(memory&&memory.tick<=reflection.tick&&memory.category!=='whisper')
        return {kind:'reflection',reflectionId:reflection.id,reflectionTick:reflection.tick,theme:reflection.theme,
          memoryId,memoryTick:memory.tick,memoryCategory:memory.category};
    }
  }
  return {kind:'mirror'};
}

/** Only the native, survived final bolt may create a new theatre. A loaded old trial never grows one retroactively. */
export function openHeartDemonFrame(world:WorldState,actor:Cultivator,trial:TribulationTrial,finalWave:WorldEvent):HeartDemonFrame|undefined{
  if(!trial.heartTheatreArmed||trial.heartDemon||actor.tribulation!==trial||!isHeartDemonRealm(trial.targetRealm)||
    !alive(actor)||actorAt(world,actor.id)!==actor||trial.stage!=='heart_demon'||trial.nextWave!==trial.totalWaves+1||
    trial.startedTick>=world.tick||trial.lastActedTick!==world.tick||
    finalWave.id!==heartDemonFinalWaveId(actor.id,world.tick,trial.totalWaves)||finalWave.tick!==world.tick||
    finalWave.year!==world.year||finalWave.month!==world.month||finalWave.category!=='heavenly'||
    finalWave.witnessScope!==undefined||finalWave.actorIds.length!==1||finalWave.actorIds[0]!==actor.id||
    finalWave.title!==`第${trial.totalWaves}重雷劫`||finalWave.description!==trial.lastOutcome||finalWave.damage?.length!==1||
    finalWave.damage[0].cultivatorId!==actor.id||finalWave.damage[0].amount<=0||finalWave.locationId!==actor.locationId||world.locations.filter(site=>site.id===actor.locationId).length!==1)return undefined;
  const frame:HeartDemonFrame={id:heartDemonFrameId(trial.id),actorId:actor.id,siteId:actor.locationId,openedTick:world.tick,
    finalWaveEventId:finalWave.id,evidence:evidenceFor(world,actor)};
  trial.heartDemon=frame;
  return frame;
}

export function activeHeartDemon(world:WorldState,actor:Cultivator):HeartDemonFrame|undefined{
  const trial=actor.tribulation,frame=trial?.heartDemon;
  if(!frame||!trial?.heartTheatreArmed||trial.stage!=='heart_demon'||frame.result||frame.cancelledTick!==undefined||
    !alive(actor)||actorAt(world,actor.id)!==actor||frame.actorId!==actor.id||frame.siteId!==actor.locationId||
    frame.openedTick>world.tick||frame.openedTick!==trial.lastActedTick||trial.nextWave!==trial.totalWaves+1||
    frame.id!==heartDemonFrameId(trial.id)||frame.finalWaveEventId!==heartDemonFinalWaveId(actor.id,frame.openedTick,trial.totalWaves))return undefined;
  return frame;
}

function guideFor(actor:Cultivator,frame:HeartDemonFrame):HeartDemonGuide|undefined{
  const trial=actor.tribulation,guide=trial?.heartGuide;
  return trial?.heartDemon===frame&&guide?.actorId===actor.id&&guide.trialId===trial.id&&guide.grantedTick===trial.startedTick&&
    guide.originalPossessionUntilTick>guide.grantedTick?guide:undefined;
}
function replaced(world:WorldState,guide:HeartDemonGuide):boolean{
  // This generation only advances on a real successful native attachment. Expiry/forced loss of the
  // old possessed body is not a replacement and must not skip the trial; the newer binding can itself expire.
  return world.playerAvatar.switchAvailableTick>guide.bindingGeneration;
}
export function isHeartDemonGuided(world:WorldState,actor:Cultivator,frame:HeartDemonFrame):boolean{
  const guide=guideFor(actor,frame);
  return !!guide&&frame.releasedTick===undefined&&(frame.queued!==undefined||!replaced(world,guide))&&
    activeHeartDemon(world,actor)===frame;
}
export function recommendHeartDemonChoice(_world:WorldState,actor:Cultivator,frame:HeartDemonFrame):HeartDemonChoice{
  const aggressive=actor.personality==='嗜血'||actor.personality==='狂傲';
  if(aggressive&&actor.hp/Math.max(1,actor.maxHp)>.48)return 'wrath';
  if(actor.personality==='苟道'||actor.personality==='阴险'||actor.personality==='诡诈')return 'sever';
  if(frame.evidence.kind==='bond'&&frame.evidence.role==='血仇'&&actor.personality==='刚正')return 'face';
  return 'face';
}

export type HeartDemonResolution=
  | {kind:'legacy'} | {kind:'waiting'}
  | {kind:'ready';frame:HeartDemonFrame;choice:HeartDemonChoice;origin:HeartDemonOrigin};
export function prepareHeartDemonResolution(world:WorldState,actor:Cultivator,trial:TribulationTrial,
  decision?:LLMDecisionPayload,modelInput=false):HeartDemonResolution{
  if(!trial.heartDemon)return {kind:'legacy'};
  const frame=activeHeartDemon(world,actor);
  if(!frame||trial!==actor.tribulation||world.tick<=frame.openedTick)return {kind:'waiting'};
  const guide=guideFor(actor,frame);
  if(frame.queued&&guide&&frame.releasedTick===undefined){
    if(frame.queued.queuedTick>=world.tick)return {kind:'waiting'};
    return {kind:'ready',frame,choice:frame.queued.choice,origin:'player'};
  }
  if(guide&&frame.releasedTick===undefined){
    if(!replaced(world,guide))return {kind:'waiting'};
    frame.releasedTick=world.tick;
  }
  const selected=world.storyteller?.pendingHighlightChoice;
  const row=world.storyteller?.highlights?.at(-1);
  if(!guide && selected?.key.kind==='heart_demon' && selected.key.actorId===actor.id && selected.key.siteId===frame.siteId &&
      selected.key.sourceId===frame.id && selected.key.openedTick===frame.openedTick && frame.openedTick===world.tick-1 &&
      row?.kind==='heart_demon' && row.tick===frame.openedTick && row.actorId===actor.id && row.sourceId===frame.id &&
      row.chosen===selected.optionId && (selected.optionId==='face'||selected.optionId==='sever'||selected.optionId==='wrath')) {
    if(world.storyteller) delete world.storyteller.pendingHighlightChoice;
    return {kind:'ready',frame,choice:selected.optionId,origin:'director'};
  }
  if(modelInput&&decision?.chosenAction==='FACE_TRIBULATION'&&decision.targetHeartTrialId===trial.id&&isChoice(decision.heartDemonChoice)&&
    Object.entries(decision).every(([key,value])=>value===undefined||privateKeys.has(key))){
    return {kind:'ready',frame,choice:decision.heartDemonChoice,origin:'model'};
  }
  return {kind:'ready',frame,choice:recommendHeartDemonChoice(world,actor,frame),origin:'utility'};
}

const ownFrame=(world:WorldState,actorId:string,trialId:string)=>{
  const actor=actorAt(world,actorId);
  const frame=actor&&activeHeartDemon(world,actor);
  return actor&&actor.tribulation?.id===trialId&&frame&&isHeartDemonGuided(world,actor,frame)&&!frame.queued?frame:undefined;
};
export function queueGuidedHeartDemonChoice(world:WorldState,actorId:string,trialId:string,choice:HeartDemonChoice):WorldState{
  if(!isChoice(choice)||!ownFrame(world,actorId,trialId))return world;
  const updated=cloneWorldWithColdHistory(world),frame=ownFrame(updated,actorId,trialId);
  if(!frame)return world;
  frame.queued={choice,queuedTick:world.tick};
  return updated;
}
export function releaseGuidedHeartDemon(world:WorldState,actorId:string,trialId:string):WorldState{
  if(!ownFrame(world,actorId,trialId))return world;
  const updated=cloneWorldWithColdHistory(world),frame=ownFrame(updated,actorId,trialId);
  if(!frame)return world;
  frame.releasedTick=world.tick;
  return updated;
}

export interface HeartDemonEffects {burdenDelta:number;stabilityDelta:number;karmaDelta:number;masteryDelta:number}
export function heartDemonEffects(_world:WorldState,_actor:Cultivator,frame:HeartDemonFrame,choice:HeartDemonChoice):HeartDemonEffects{
  if(choice==='sever')return {burdenDelta:frame.evidence.kind==='bond'?-8:-5,stabilityDelta:1,karmaDelta:-2,masteryDelta:3};
  if(choice==='wrath')return {burdenDelta:8,
    stabilityDelta:frame.evidence.kind==='bond'&&frame.evidence.role==='血仇'?17:10,karmaDelta:-7,masteryDelta:8};
  return {burdenDelta:frame.evidence.kind==='reflection'?-5:-2,stabilityDelta:7,karmaDelta:4,masteryDelta:5};
}
export function recordHeartDemonResult(world:WorldState,actor:Cultivator,frame:HeartDemonFrame,choice:HeartDemonChoice,
  origin:HeartDemonOrigin,outcome:HeartDemonOutcome,damage:number):WorldEvent{
  const {karmaDelta,masteryDelta}=heartDemonEffects(world,actor,frame,choice);
  const karma=actor.karma,mastery=actor.techniqueMastery;
  if(outcome!=='died'){
    actor.karma=clamp(karma+karmaDelta,-100,100);
    actor.techniqueMastery=clamp(mastery+(outcome==='passed'?masteryDelta:choice==='wrath'?-4:choice==='sever'?-2:0),0,100);
  }
  const before=actor.personality;
  if(outcome==='failed'&&alive(actor)&&choice==='wrath')actor.personality='嗜血';
  frame.result={choice,origin,resolvedTick:world.tick,outcome,damage,karmaDelta:actor.karma-karma,
    masteryDelta:actor.techniqueMastery-mastery,...(before!==actor.personality?{personalityBefore:before,personalityAfter:actor.personality}:{})};
  if(origin==='director'){
    const row=world.storyteller?.highlights?.at(-1);
    if(row?.kind==='heart_demon'&&row.sourceId===frame.id&&row.actorId===actor.id&&row.chosen===choice){
      row.resolutionTick=world.tick;
      row.resolutionEventId=heartDemonResultEventId(frame.id);
    }
  }
  const title=outcome==='passed'?'照破心魔':outcome==='failed'?'心魔反噬':'幻境未尽，道途已止';
  const ending=outcome==='passed'?'幻象散去，道心重新握在手中。':
    outcome==='failed'?before!==actor.personality?'幻象虽散，杀意却没有退去。':'幻象散开时，反噬已落在此身。':'未及走出幻境，道途便在这里断绝。';
  const description=`幻境之中，选择了「${labels[choice]}」。${ending}`;
  recordMemory(actor,world.tick,description,8,'heavenly',outcome==='passed'?4:-4);
  return {id:heartDemonResultEventId(frame.id),tick:world.tick,year:world.year,month:world.month,
    title,description,category:'intrigue',actorIds:[actor.id],locationId:frame.siteId,witnessScope:'participants'};
}

export function interruptHeartDemon(trial:TribulationTrial,tick:number):void{
  const frame=trial.heartDemon;
  if(!frame||frame.result||frame.cancelledTick!==undefined)return;
  delete frame.queued;
  frame.cancelledTick=tick;
}

export interface GuidedHeartDemonView {
  actorId:string;actorName:string;trialId:string;frame:HeartDemonFrame;likenessName?:string;
}
const displayName=(value:string)=>value.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,' ').trim().slice(0,80);
export function projectGuidedHeartDemon(world:WorldState):GuidedHeartDemonView|undefined{
  for(const actor of world.cultivators){
    const trial=actor.tribulation,frame=trial?.heartDemon;
    if(!trial||!frame||actorAt(world,actor.id)!==actor)continue;
    const guide=guideFor(actor,frame);
    if(!guide||frame.releasedTick!==undefined)continue;
    const terminalNow=frame.result?.resolvedTick===world.tick&&frame.result.origin==='player'||
      frame.cancelledTick===world.tick&&!replaced(world,guide);
    if(!isHeartDemonGuided(world,actor,frame)&&!terminalNow)continue;
    const evidence=frame.evidence;
    const likeness=evidence.kind==='bond'&&currentBond(world,actor.id,evidence)&&
      heartDemonBondSourceRetained(world,actor.id,evidence,frame.openedTick)?actorAt(world,evidence.otherActorId):undefined;
    return {actorId:actor.id,actorName:displayName(actor.name),trialId:trial.id,frame:structuredClone(frame),
      ...(likeness?{likenessName:displayName(likeness.name)}:{})};
  }
  return undefined;
}
