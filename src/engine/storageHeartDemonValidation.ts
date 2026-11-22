import type {HeartDemonFrame,HeartDemonEvidence,HeartDemonResult} from '../types/heartDemon';
import type {Cultivator,WorldEvent,WorldState} from '../types/world';
import {matchesWitnessedPersonalScene,witnessedPersonalSceneKind} from './witnessedPersonalStory';
import {heartDemonEffects,heartDemonFinalWaveId,heartDemonFrameId,heartDemonResultEventId} from './heartDemonEngine';

import {HEART_DEMON_AFTERMATH_MONTHS,heartDemonRecoveryEventId,heartDemonRecoveryQi,isHeartDemonRecoveryEvent} from './heartDemonAftermathTerms';
import {isScopedExpeditionGate} from './expeditionOmenTerms';

const privatePrefix='evt-heart-demon-';
const isPrivateReceipt=(id:string)=>id.startsWith(privatePrefix);
const privateProofId=(id:string)=>isPrivateReceipt(id)||isHeartDemonRecoveryEvent(id);
const waveTotals={金丹:3,元婴:4,化神:5} as const;
const pair=(ids:readonly string[],a:string,b:string)=>ids.length===2&&ids.includes(a)&&ids.includes(b);
const own=(event:WorldEvent,actorId:string)=>event.actorIds.length===1&&event.actorIds[0]===actorId;
type Fail=(field:string)=>never;

function validateEvidence(world:WorldState,actor:Cultivator,proof:HeartDemonEvidence,openedTick:number,
  actorIds:ReadonlySet<string>,fail:Fail):void{
  if(proof.kind==='mirror')return;
  if(proof.kind==='reflection'){
    const memoryPrefix=`mem-${proof.memoryTick}-${actor.id}-`;
    const seq=proof.memoryId.slice(memoryPrefix.length);
    if(!proof.memoryId.startsWith(memoryPrefix)||!/^([1-9]\d*)$/u.test(seq)||Number(seq)>actor.memorySequence||
      (proof.reflectionId!==`reflection-${actor.id}-${proof.theme}-obsession`&&
       proof.reflectionId!==`reflection-${actor.id}-${proof.theme}-heart_demon`)||
      proof.memoryCategory==='whisper'||proof.memoryTick<1||proof.memoryTick>proof.reflectionTick||proof.reflectionTick>=openedTick)
      return fail('cultivators.tribulation.heartDemon.reflection');
    const recent=[...actor.memories,...actor.coreMemories].filter(row=>row.id===proof.memoryId);
    const reflection=actor.reflections.filter(row=>row.id===proof.reflectionId&&row.tick===proof.reflectionTick);
    if(recent.length>1||recent.some(row=>row.tick!==proof.memoryTick||row.category!==proof.memoryCategory)||
      reflection.length>1||reflection.some(row=>row.theme!==proof.theme||row.kind==='belief'||!row.sourceMemoryIds.includes(proof.memoryId)))
      return fail('cultivators.tribulation.heartDemon.reflection');
    return;
  }
  const {otherActorId,role,source}=proof;
  if(otherActorId===actor.id||!actorIds.has(otherActorId)||source.tick<1||source.tick>=openedTick)
    return fail('cultivators.tribulation.heartDemon.bond');
  if(source.kind==='lineage'){
    if(role!=='师徒'||!pair([source.mentorId,source.studentId],actor.id,otherActorId))
      return fail('cultivators.tribulation.heartDemon.bond');
    const records=world.mentorship.lineage.filter(row=>row.mentorId===source.mentorId&&row.studentId===source.studentId&&row.formedTick<=openedTick);
    if(records.length>1||records.some(row=>row.formedTick!==source.tick))return fail('cultivators.tribulation.heartDemon.bond');
    return;
  }
  const raw=world.events.filter(row=>row.id===source.eventId);
  const proofRows=world.witnessedPersonalStory.scenes.filter(row=>row.eventId===source.eventId);
  const isExactNativeId=[actor.id,otherActorId].some(id=>source.eventId===`evt-${source.tick}-${id}-duel`||
    source.eventId===`evt-${source.tick}-${id}-social`);
  if(!isExactNativeId||raw.length>1||proofRows.length>1||raw.some(event=>{
    const kind=witnessedPersonalSceneKind(event);
    return (kind!=='duel'&&kind!=='socialize')||role==='血仇'&&kind!=='duel'||
      event.tick!==source.tick||!pair(event.actorIds,actor.id,otherActorId);
  })||proofRows.some(row=>row.tick!==source.tick||(row.kind!=='duel'&&row.kind!=='socialize')||role==='血仇'&&row.kind!=='duel'||
    !pair(row.actorIds,actor.id,otherActorId)||!row.witnessIds.includes(actor.id)||!row.witnessIds.includes(otherActorId)||
    !!raw[0]&&!matchesWitnessedPersonalScene(row,raw[0])))
    return fail('cultivators.tribulation.heartDemon.bond');
}

function visibleWaveMatches(event:WorldEvent,frame:HeartDemonFrame,waves:number):boolean{
  return event.tick===frame.openedTick&&event.locationId===frame.siteId&&own(event,frame.actorId)&&
    event.category==='heavenly'&&event.witnessScope===undefined&&event.title===`第${waves}重雷劫`&&
    event.damage?.length===1&&event.damage[0].cultivatorId===frame.actorId&&event.damage[0].amount>0&&
    event.dialogue===undefined&&event.duelWinnerId===undefined;
}
function resultNumbers(world:WorldState,actor:Cultivator,frame:HeartDemonFrame,result:HeartDemonResult):boolean{
  const {choice,outcome,damage,personalityBefore,personalityAfter}=result;
  const effect=heartDemonEffects(world,actor,frame,choice);
  const signed=(actual:number,nominal:number)=>nominal===0?actual===0:
    nominal>0?actual>=0&&actual<=nominal+1e-7:actual<=0&&actual>=nominal-1e-7;
  const personalityOK=personalityBefore===undefined?personalityAfter===undefined:
    choice==='wrath'&&outcome==='failed'&&personalityBefore!=='嗜血'&&personalityAfter==='嗜血';
  const mastery=outcome==='passed'?effect.masteryDelta:outcome==='died'?0:choice==='wrath'?-4:choice==='sever'?-2:0;
  return personalityOK&&(damage>0)===(outcome!=='passed')&&damage<=480_000_000&&
    signed(result.karmaDelta,outcome==='died'?0:effect.karmaDelta)&&signed(result.masteryDelta,mastery);
}

/** Stable source stamps, not mutable relationship prose, establish the native trial checkpoint. */
export function validateHeartDemonTrials(world:WorldState,actorIds:ReadonlySet<string>,fail:Fail):void{
  const publicRows=(rows:readonly {id:string}[])=>rows.some(row=>privateProofId(row.id));
  if(publicRows(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(chapter=>publicRows(chapter.anchors))||
    world.coldHistory.chapters.some(chapter=>publicRows(chapter.anchors))||
    world.chronicleCausality.nodes.some(row=>privateProofId(row.eventId))||
    world.chronicleErrata.sources.some(row=>privateProofId(row.sourceEventId))||
    world.eraHeritage?.facts.some(row=>privateProofId(row.source.sourceEventId))||
    world.witnessedPersonalStory.scenes.some(row=>privateProofId(row.eventId))||
    world.mapPresentation?.effects.some(row=>privateProofId(row.id))||
    world.protagonistSuccession.arcs.some(row=>[...row.opening,...row.support,...(row.death?[row.death]:[])].some(proof=>privateProofId(proof.eventId))))
    return fail('cultivators.tribulation.heartDemon.publicArchive');

  if(!world.events.some(event=>privateProofId(event.id))&&!world.cultivators.some(actor=>
    actor.heartDemonAftermath||actor.tribulation?.heartTheatreArmed||actor.tribulation?.heartGuide||actor.tribulation?.heartDemon))return;
  const expected=new Map<string,HeartDemonFrame>();
  const actors=new Map<string,Cultivator>();
  const sourceEvents=new Map<string,WorldEvent[]>();
  for(const event of world.events){
    const list=sourceEvents.get(event.id);
    if(list)list.push(event);else sourceEvents.set(event.id,[event]);
  }
  const knownSites=new Map(world.locations.map(site=>[site.id,site]));
  const recoveryProof=new Map<string,{actorId:string;siteId:string;tick:number}>();
  for(const actor of world.cultivators){
    const after=actor.heartDemonAftermath;
    if(after){
      const {trialId,resultEventId,resolvedTick,siteId,endsTick,recovery}=after;
      const trial=actor.tribulation;
      const trialPrefix=`trial-${actor.id}-`;
      const started=trialId.startsWith(trialPrefix)?trialId.slice(trialPrefix.length):'';
      const epoch=Number(started);
      const exactTrial=trial?.id===trialId;
      const frame=exactTrial?trial?.heartDemon:undefined;
      if(!/^[1-9]\d*$/u.test(started)||!Number.isSafeInteger(epoch)||resolvedTick<epoch+4||resolvedTick>world.tick||
        endsTick!==resolvedTick+HEART_DEMON_AFTERMATH_MONTHS||!knownSites.has(siteId)||
        resultEventId!==heartDemonResultEventId(heartDemonFrameId(trialId))||
        (exactTrial?(!frame?.result||frame.actorId!==actor.id||frame.siteId!==siteId||frame.result.resolvedTick!==resolvedTick||
          frame.result.choice!==after.choice||frame.result.outcome!==after.outcome):!trial||trial.startedTick<=resolvedTick))
        return fail('cultivators.heartDemonAftermath.source');
      const publicTerminal=sourceEvents.get(`evt-${resolvedTick}-${actor.id}-tribulation-${after.outcome==='passed'?'passed':'failure'}`)??[];
      if(publicTerminal.length>1||publicTerminal.some(event=>!own(event,actor.id)||event.witnessScope!==undefined||
        event.locationId!==siteId||event.tick!==resolvedTick||event.category!==(after.outcome==='passed'?'breakthrough':'heavenly')))
        return fail('cultivators.heartDemonAftermath.source');
      if(recovery){
        const site=knownSites.get(recovery.siteId);
        if(recovery.tick<=resolvedTick||recovery.tick>endsTick||recovery.tick>world.tick||
          recovery.qiPaid!==heartDemonRecoveryQi(after)||recovery.qiBefore<recovery.qiPaid||
          recovery.eventId!==heartDemonRecoveryEventId(trialId,recovery.tick)||!site||isScopedExpeditionGate(site))
          return fail('cultivators.heartDemonAftermath.recovery');
        recoveryProof.set(recovery.eventId,{actorId:actor.id,siteId:recovery.siteId,tick:recovery.tick});
      }
    }
    actors.set(actor.id,actor);
    const trial=actor.tribulation;
    if(!trial)continue;
    const {heartTheatreArmed:armed,heartGuide:guide,heartDemon:frame,targetRealm,stage,startedTick,lastActedTick,resolvedTick}=trial;
    if(!armed&&!guide&&!frame)continue;
    if(!armed||!Object.hasOwn(waveTotals,targetRealm)||startedTick<1||startedTick>world.tick||
      trial.id!==`trial-${actor.id}-${startedTick}`||lastActedTick===undefined||lastActedTick<startedTick||lastActedTick>world.tick||
      (resolvedTick!==undefined&&(resolvedTick<lastActedTick||resolvedTick>world.tick)))
      return fail('cultivators.tribulation.heartDemon.trial');
    const waves=waveTotals[targetRealm as keyof typeof waveTotals];
    if(trial.totalWaves!==waves||trial.nextWave<1||trial.nextWave>waves+1)
      return fail('cultivators.tribulation.heartDemon.trial');
    if(guide&&(guide.actorId!==actor.id||guide.trialId!==trial.id||guide.grantedTick!==startedTick||
      guide.bindingGeneration<1||guide.bindingGeneration>startedTick+3||
      guide.bindingGeneration>world.playerAvatar.switchAvailableTick||
      guide.originalPossessionUntilTick!==guide.bindingGeneration+2||guide.originalPossessionUntilTick<=startedTick))
      return fail('cultivators.tribulation.heartDemon.guide');
    if(!frame){
      if(stage==='heart_demon'||stage==='passed'||trial.nextWave>waves||(stage==='failed')!==(resolvedTick!==undefined))return fail('cultivators.tribulation.heartDemon.frame');
      continue;
    }
    const {id,actorId,siteId,openedTick,finalWaveEventId,queued,releasedTick,cancelledTick,result}=frame;
    if(id!==heartDemonFrameId(trial.id)||actorId!==actor.id||trial.nextWave!==waves+1||stage==='lightning'||
      openedTick<startedTick+waves||openedTick>world.tick||lastActedTick<openedTick||
      finalWaveEventId!==heartDemonFinalWaveId(actor.id,openedTick,waves))
      return fail('cultivators.tribulation.heartDemon.frame');
    validateEvidence(world,actor,frame.evidence,openedTick,actorIds,fail);
    const original=sourceEvents.get(finalWaveEventId)??[];
    if(original.length>1||original.some(event=>!visibleWaveMatches(event,frame,waves)))
      return fail('cultivators.tribulation.heartDemon.wave');
    if(releasedTick!==undefined&&(!guide||queued||releasedTick<openedTick||releasedTick>world.tick))
      return fail('cultivators.tribulation.heartDemon.release');
    if(queued&&(!guide||queued.queuedTick<openedTick||queued.queuedTick>world.tick))
      return fail('cultivators.tribulation.heartDemon.queue');
    if(cancelledTick!==undefined){
      if(result||queued||stage!=='failed'||cancelledTick!==resolvedTick||cancelledTick<openedTick||
        cancelledTick>world.tick||(releasedTick??0)>cancelledTick||actor.alive||actor.hp!==0)
        return fail('cultivators.tribulation.heartDemon.cancellation');
    }else if(result){
      if(result.resolvedTick!==lastActedTick||result.resolvedTick!==resolvedTick||result.resolvedTick<=openedTick||
        (releasedTick??0)>result.resolvedTick||(result.outcome==='passed')!==(stage==='passed')||stage==='heart_demon'||
        (result.outcome==='died'&&(actor.alive||actor.hp!==0))||
        (result.origin==='player'?(!queued||queued.choice!==result.choice||queued.queuedTick+1!==result.resolvedTick):
          !!queued||!!guide&&releasedTick===undefined)||!resultNumbers(world,actor,frame,result))
        return fail('cultivators.tribulation.heartDemon.result');
      expected.set(heartDemonResultEventId(id),frame);
    }else{
      const activeSite=world.locations.find(site=>site.id===siteId);
      if(stage!=='heart_demon'||resolvedTick!==undefined||lastActedTick!==openedTick||
        !actor.alive||actor.hp<=0||actor.positionPlane!==undefined||actor.locationId!==siteId||
        !activeSite||queued&&queued.queuedTick!==world.tick)
        return fail('cultivators.tribulation.heartDemon.pending');
    }
  }
  const seen=new Set<string>();
  for(const event of world.events){
    if(isHeartDemonRecoveryEvent(event.id)){
      const actorId=event.actorIds[0],proof=recoveryProof.get(event.id),actor=actors.get(actorId);
      const olderPrefix=`evt-dao-heart-mending-trial-${actorId}-`;
      const parts=event.id.startsWith(olderPrefix)?event.id.slice(olderPrefix.length).match(/^([1-9]\d*)-([1-9]\d*)$/u):null;
      const latest=actor?.heartDemonAftermath;
      if(!actor||!own(event,actorId)||seen.has(event.id)||event.category!=='intrigue'||event.witnessScope!=='participants'||
        !event.locationId||event.dialogue!==undefined||event.damage!==undefined||event.duelWinnerId!==undefined||
        (proof?(proof.actorId!==actorId||proof.siteId!==event.locationId||proof.tick!==event.tick):
          !latest||!parts||Number(parts[1])+4>=event.tick||Number(parts[2])!==event.tick||event.tick>=latest.resolvedTick||
          latest.trialId===`trial-${actorId}-${parts[1]}`))
        return fail('cultivators.heartDemonAftermath.privateReceipt');
      seen.add(event.id);
      continue;
    }
    if(!isPrivateReceipt(event.id))continue;
    const actorId=event.actorIds[0],actor=actorId&&actors.get(actorId);
    const frame=expected.get(event.id);
    const prefix=`evt-heart-demon-trial-${actorId}-`;
    const suffix='-resolved';
    // A later actual trial replaces the prior actor-local frame; its bounded exact private event can remain hot.
    const older=event.id.startsWith(prefix)&&event.id.endsWith(suffix)?
      event.id.slice(prefix.length,-suffix.length):'';
    if(!actor||!own(event,actorId)||seen.has(event.id)||event.category!=='intrigue'||event.witnessScope!=='participants'||
      !event.locationId||event.dialogue!==undefined||event.damage!==undefined||event.duelWinnerId!==undefined||
      (frame?(frame.result?.resolvedTick!==event.tick||frame.siteId!==event.locationId):
        !/^[1-9]\d*$/u.test(older)||Number(older)+3>=event.tick||!(actor.tribulation&&event.tick<actor.tribulation.startedTick)))
      return fail('cultivators.tribulation.heartDemon.privateReceipt');
    seen.add(event.id);
  }
}
