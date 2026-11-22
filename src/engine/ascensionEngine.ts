import type {AscensionMove,AscensionTerminal,AscensionTrial,AscensionWave,AscensionWaveNumber} from '../types/ascension';
import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {disasterShelterLocksTravel} from './disasterShelterCheckpoint';
import {activeEscortForActor} from './escortEngine';
import {awake,inPeak,openSite,unique} from './ascensionProof';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {activePilgrimageForActor} from './pilgrimageEngine';
import {activeRelocationForActor} from './relocationEngine';
import {activeCourierForActor} from './sealedCourierEngine';
import {sparringLocksActor} from './sparringEngine';
import {dropInheritance} from './techniqueEngine';
import {
  ASCENSION_OPEN_QI,ASCENSION_QI,ASCENSION_RETRY_TICKS,ASCENSION_TRIAL_HISTORY,ASCENSION_WAVES,IMMORTAL_ASCENSION_ADDRESS,
  ascensionDamage,ascensionEventId,ascensionTrialId,type AscensionEventToken,
} from './ascensionTerms';

export {IMMORTAL_ASCENSION_ADDRESS} from './ascensionTerms';
export {ascensionEventProof,verifiedImmortalAscension,type AscensionEventProof} from './ascensionProof';
export type AscensionOption={action:'ASCENSION'}&(
  |{ascensionMove:'start';targetAscensionTrialId?:never}
  |{ascensionMove:Exclude<AscensionMove,'start'>;targetAscensionTrialId:string}
);
function local(world:WorldState,actor:Cultivator):boolean{
  return awake(actor)&&actor.positionPlane===undefined&&unique(world.cultivators,actor.id)===actor&&!!openSite(world,actor.locationId);
}
function openBody(world:WorldState,actor:Cultivator){
  return local(world,actor)&&actor.tribulation?.stage!=='lightning'&&actor.tribulation?.stage!=='heart_demon'&&
    !world.forbiddenDuels?.some(row=>row.attackerId===actor.id||row.defenderId===actor.id)&&
    !world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(actor.id))&&
    !world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(actor.id)&&
      !row.dungeon?.members.some(member=>member.actorId===actor.id&&member.leftTick!==undefined)&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(actor.id)))&&
    !activeDanxiaMedicineEscort(world,actor)&&!activeEscortForActor(world,actor)&&!activePilgrimageForActor(world,actor)&&
    !activeRelocationForActor(world,actor)&&!activeCourierForActor(world,actor)&&!disasterShelterLocksTravel(world,actor)&&
    !expeditionRescueCheckpoint(world,actor)&&!boundaryReliefCheckpoint(world,actor)&&!sparringLocksActor(world,actor);
}
const isActive=(row:AscensionTrial)=>row.phase==='warning'||row.phase==='lightning';
export function activeAscensionForActor(world:WorldState,actor:Cultivator):AscensionTrial|undefined{
  return world.ascension?.trials.find(row=>row.actorId===actor.id&&isActive(row));
}
export function availableAscensionActions(actor:Cultivator,world:WorldState,executionTick=world.tick):AscensionOption[]{
  if(executionTick!==world.tick&&executionTick!==world.tick+1||!inPeak(actor)||!local(world,actor))return [];
  const trial=activeAscensionForActor(world,actor);
  if(trial){
    if(trial.siteId!==actor.locationId||executionTick<=(trial.waves.at(-1)?.tick??trial.startedTick))return [];
    const options:AscensionOption[]=[{action:'ASCENSION',ascensionMove:'retreat',targetAscensionTrialId:trial.id}];
    for(const stance of ['advance','guard'] as const){
      if(actor.qiProgress>=ASCENSION_QI[stance])options.unshift({action:'ASCENSION',ascensionMove:stance,targetAscensionTrialId:trial.id});
    }
    return options;
  }
  const recent=(world.ascension?.trials??[]).filter(row=>row.actorId===actor.id).at(-1)?.terminal;
  return actor.qiProgress===100&&openBody(world,actor)&&(!recent||executionTick>=recent.tick+ASCENSION_RETRY_TICKS)?
    [{action:'ASCENSION',ascensionMove:'start'}]:[];
}
const allowed:ReadonlySet<string>=new Set(['chosenAction','ascensionMove','targetAscensionTrialId','innerMonologue']);
const nextWave=(trial:AscensionTrial):AscensionWaveNumber|undefined=>
  trial.waves.length===0?1:trial.waves.length===1?2:trial.waves.length===2?3:undefined;
function event(world:WorldState,trial:AscensionTrial,token:AscensionEventToken,title:string,description:string,
  category:WorldEvent['category']='heavenly'):WorldEvent{
  return {id:ascensionEventId(trial.actorId,world.tick,token),tick:world.tick,year:world.year,month:world.month,
    title,description,category,actorIds:[trial.actorId],locationId:trial.siteId};
}
function close(trial:AscensionTrial,issue:WorldEvent,status:AscensionTerminal['status'],reason?:AscensionTerminal['reason']):void{
  trial.phase=status;
  trial.terminal={status,tick:issue.tick,year:issue.year,month:issue.month,eventId:issue.id,...(reason?{reason}:{})};
}
function departImmortal(world:WorldState,actor:Cultivator):void{
  actor.positionPlane='immortal';
  actor.locationId=IMMORTAL_ASCENSION_ADDRESS;
  actor.sectId='';actor.sectRank='外门弟子';
  delete actor.guardAssignment;
  if(world.playerAvatar.possessedId===actor.id){
    delete world.playerAvatar.possessedId;
    delete world.playerAvatar.possessionUntilTick;
  }
  if(world.playerAvatar.pendingOrder?.actorId===actor.id)delete world.playerAvatar.pendingOrder;
}
export function resolveAscensionAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='ASCENSION'||Object.keys(decision).some(key=>!allowed.has(key)))return null;
  const option=availableAscensionActions(actor,world).find(row=>row.ascensionMove===decision.ascensionMove&&row.targetAscensionTrialId===decision.targetAscensionTrialId);
  if(!option)return null;
  if(option.ascensionMove==='start'){
    const trials=(world.ascension??(world.ascension={trials:[]})).trials;
    const history=trials.filter(row=>row.actorId===actor.id);
    if(history.length>=ASCENSION_TRIAL_HISTORY){
      const prior=history[0];
      if(!prior.terminal)return null;
      trials.splice(trials.indexOf(prior),1);
    }
    const trial:AscensionTrial={id:ascensionTrialId(actor.id,world.tick),actorId:actor.id,siteId:actor.locationId,
      sectIdBefore:actor.sectId,startedTick:world.tick,startedYear:world.year,startedMonth:world.month,
      openingQiPaid:ASCENSION_OPEN_QI,phase:'warning',waves:[]};
    actor.qiProgress-=ASCENSION_OPEN_QI;
    trials.push(trial);
    return event(world,trial,'warning','九天云涌','道气已付，三重飞升雷劫尚未落下。');
  }
  const trial=activeAscensionForActor(world,actor),wave=trial&&nextWave(trial);
  if(!trial||!wave||trial.id!==option.targetAscensionTrialId)return null;
  if(option.ascensionMove==='retreat'){
    const end=event(world,trial,'retreated','收势撤坛','当事人亲手收势留在下界，未判作飞升。');
    close(trial,end,'retreated');
    return end;
  }
  const stance=option.ascensionMove,qiPaid=ASCENSION_QI[stance],beforeHp=actor.hp,qiBefore=actor.qiProgress;
  actor.qiProgress-=qiPaid;
  actor.hp=Math.max(0,actor.hp-ascensionDamage(actor.maxHp,wave,stance));
  let proof:WorldEvent;
  if(actor.hp===0){
    actor.alive=false;
    dropInheritance(actor,world);
    proof=event(world,trial,`failed-${wave}`,'飞升雷下陨落',`第${wave}重真雷已至，原身未能承住，未入仙门。`,'death');
    close(trial,proof,'failed','lightning');
  }else if(wave===ASCENSION_WAVES){
    proof=event(world,trial,'succeeded','九天仙门启','三重真雷皆已亲历并生还；此身越过仙门，未曾陨落，也不再返回下界。');
    close(trial,proof,'succeeded');
    departImmortal(world,actor);
  }else{
    proof=event(world,trial,`wave-${wave}`,`飞升第${wave}重雷`,`此身承过第${wave}重真雷，尚未进入仙门。`);
    trial.phase='lightning';
  }
  const row:AscensionWave={wave,tick:world.tick,year:world.year,month:world.month,stance,eventId:proof.id,
    maxHp:actor.maxHp,beforeHp,afterHp:actor.hp,qiBefore,qiPaid};
  trial.waves.push(row);
  proof.damage=[{cultivatorId:actor.id,amount:beforeHp-actor.hp}];
  return proof;
}

/** Call on actual native aftermath, never from an option preview. */
export function reconcileAscensionInterruptions(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const trial of world.ascension?.trials??[]){
    if(!isActive(trial)||world.tick<trial.startedTick)continue;
    const actor=unique(world.cultivators,trial.actorId);
    if(actor&&local(world,actor)&&inPeak(actor)&&actor.locationId===trial.siteId)continue;
    const interrupted=event(world,trial,'interrupted','飞升仪止','原身不能继续守在原址；此仪未成，不另报飞升或陨落。');
    interrupted.witnessScope='participants';
    close(trial,interrupted,'failed','interrupted');
    events.push(interrupted);
  }
  return events;
}
export interface AscensionView{actorId:string;trial?:AscensionTrial;options:AscensionOption[]}
export function projectAscension(world:WorldState,actor:Cultivator|undefined):AscensionView|undefined{
  if(!actor||unique(world.cultivators,actor.id)!==actor)return undefined;
  const trial=(world.ascension?.trials??[]).filter(row=>row.actorId===actor.id).at(-1);
  const options=availableAscensionActions(actor,world,world.tick+1);
  return trial||options.length?{actorId:actor.id,...(trial?{trial:structuredClone(trial)}:{}),options}:undefined;
}
