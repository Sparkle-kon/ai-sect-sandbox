import type {Cultivator,LLMDecisionPayload,WitnessClaim,WorldEvent,WorldState} from '../types/world';
import {doctrineFoundingPhysicallyAt} from './doctrineFoundingEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {onLowerPlane} from './upperPassageIsolation';
import {matchesWitnessedPersonalScene,WITNESSED_PERSONAL_STORY_TICKS} from './witnessedPersonalStory';

export type WitnessInquiryOption={action:'WITNESS_INQUIRY';targetWitnessClaimId:string}&(
  {witnessInquiryMove:'inspect';targetCultivatorId?:never}|{witnessInquiryMove:'ask';targetCultivatorId:string});
export interface WitnessInquiryView {
  venueName:string;
  claim:{text:string;reviewSettled?:true};
  witness?:{name:string;canAsk:boolean;reply?:{text:string}};
  options:readonly WitnessInquiryOption[];
}
const body=(world:WorldState,id:string)=>one(world.cultivators,row=>row.id===id);
function one<T>(list:readonly T[],match:(row:T)=>boolean):T|undefined {
  let result:T|undefined;
  for(const row of list)if(match(row)){if(result!==undefined)return;result=row;}
  return result;
}
function local(world:WorldState,actor:Cultivator,siteId:string,tick:number):boolean{
  return body(world,actor.id)===actor&&onLowerPlane(actor)&&doctrineFoundingPhysicallyAt(world,actor,siteId,tick);
}
function date(world:WorldState,event:WorldEvent,tick:number):boolean{
  const absolute=world.year*12+world.month-1-(world.tick-tick);
  return event.tick===tick&&event.year===Math.floor(absolute/12)&&event.month===absolute%12+1;
}
const ids=(actual:readonly string[],expected:readonly string[])=>actual.length===expected.length&&actual.every((id,i)=>id===expected[i]);
const label=(text:string)=>text.replace(/[\p{C}]/gu,'').trim().slice(0,60);
const NS='evt-witness-inquiry-';
const readTitle='亲阅当地指证',readText='这里只照录张榜人的说法，不把它当成已经核定的结果。';
const askTitle='当场者只说所见',askText='这是一人的当场见闻，不是证词登记，也不是裁断。';
const eventId=(move:'inspect'|'ask',tick:number,actorId:string,claimId:string)=>`${NS}${move}-${tick}-${actorId}-${claimId}`;
export const isPrivateWitnessInquiryEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&event.id.startsWith(NS);

function authority(world:WorldState,claim:WitnessClaim,tick:number){
  if(claim.filedTick>=tick||tick>=claim.deadlineTick)return;
  const site=one(world.locations,row=>row.id===claim.locationId);
  if(!site||site.type==='secret_realm'||site.type==='abyss'||isScopedExpeditionGate(site))return;
  const posted=one(world.events,row=>row.id===claim.publicationEventId);
  if(!posted||posted.witnessScope!==undefined||posted.id!==`evt-${claim.filedTick}-${claim.id}-posted`||
     !date(world,posted,claim.filedTick)||posted.category!=='diplomacy'||posted.title!=='坊间指证待复核'||
     posted.locationId!==site.id||!ids(posted.actorIds,[claim.claimantId,claim.subjectId]))return;
  const original=one(world.events,row=>row.id===claim.sourceEventId);
  const scene=one(world.witnessedPersonalStory.scenes,row=>row.eventId===claim.sourceEventId);
  const fact=one(world.witnesses.facts,row=>row.eventId===claim.sourceEventId);
  if(!original||!scene||!fact||original.witnessScope!==undefined||scene.kind!=='duel'||scene.siteId!==site.id||
     scene.tick>=claim.filedTick||scene.tick<tick-WITNESSED_PERSONAL_STORY_TICKS||
     !matchesWitnessedPersonalScene(scene,original)||!date(world,original,scene.tick)||
     fact.locationId!==site.id||fact.tick!==scene.tick||!ids(fact.participantIds,scene.actorIds)||
     !original.duelWinnerId||fact.winnerId!==original.duelWinnerId||!scene.actorIds.includes(claim.subjectId))return;
  const claimant=body(world,claim.claimantId),subject=body(world,claim.subjectId),winner=body(world,original.duelWinnerId);
  if(!claimant||!subject||!winner||posted.description!==`${claimant.name}公开主张${subject.name}在所引斗法中落败；登记为未经证实。`)return;
  const counts=(keys:readonly string[])=>{
    const result=new Map<string,number>();
    for(const key of keys)result.set(key,(result.get(key)??0)+1);
    return result;
  };
  const factCount=counts(fact.witnessIds),sceneCount=counts(scene.witnessIds);
  const witnessIds=fact.witnessIds.filter(id=>!scene.actorIds.includes(id)&&id!==claim.claimantId&&
    factCount.get(id)===1&&sceneCount.get(id)===1);
  return {site,claimant,subject,winner,witnessIds};
}
function receipt(world:WorldState,claim:WitnessClaim,actor:Cultivator,move:'inspect'|'ask',until:number,witness?:Cultivator){
  const earliest=Math.max(claim.filedTick+1,world.tick-12);
  const result:WorldEvent[]=[];
  for(const row of world.events){
    const actors=witness?[actor.id,witness.id]:[actor.id];
    const [title,description]=move==='inspect'?[readTitle,readText]:[askTitle,askText];
    if(row.tick<earliest||row.tick>until||row.id!==eventId(move,row.tick,actor.id,claim.id)||
      !isPrivateWitnessInquiryEvent(row)||row.locationId!==claim.locationId||
      row.category!=='intrigue'||row.title!==title||row.description!==description||!ids(row.actorIds,actors)||
      !date(world,row,row.tick)||one(world.events,event=>event.id===row.id)!==row)continue;
    result.push(row);
  }
  return result.length===1?result[0]:undefined;
}
const verdictTitle={
  corroborated:'独立证词印证指证',
  retracted:'争议指证撤回',
  disputed:'证据不足，指证存疑',
} as const;

function recentlySettledForPrivateQuestion(world:WorldState,claim:WitnessClaim,tick:number):boolean{
  const style=world.storyteller?.style,settled=claim.settledTick;
  if((style!=='wandering_jianghu'&&style!=='great_calamity')||settled===undefined||
     settled<=claim.filedTick||settled>=tick||tick-settled!==1||tick>=claim.deadlineTick||
     claim.status==='pending'||!claim.reason)return false;
  const verdict=one(world.events,row=>row.id===`evt-${settled}-${claim.id}-settled`);
  return !!verdict&&date(world,verdict,settled)&&verdict.witnessScope===undefined&&
    verdict.category==='diplomacy'&&verdict.locationId===claim.locationId&&ids(verdict.actorIds,[claim.subjectId])&&
    verdict.title===verdictTitle[claim.status]&&verdict.description===claim.reason;
}

function cases(world:WorldState,actor:Cultivator,tick:number){
  if((tick!==world.tick&&tick!==world.tick+1)||!world.witnesses.claims.some(row=>row.locationId===actor.locationId)||
    !local(world,actor,actor.locationId,tick))return [];
  return world.witnesses.claims.flatMap(claim=>{
    if(claim.locationId!==actor.locationId||one(world.witnesses.claims,row=>row.id===claim.id)!==claim)return [];
    const closed=claim.settledTick!==undefined;
    if(closed&&!recentlySettledForPrivateQuestion(world,claim,tick))return [];
    const direct=authority(world,claim,tick);
    if(!direct)return [];
    const read=receipt(world,claim,actor,'inspect',world.tick);
    // The former reader may finish that private question, never initiate a new inquiry into an ended review.
    if(closed&&(!read||read.tick>claim.settledTick!||tick-read.tick>2))return [];
    const other=read?direct.witnessIds.flatMap(id=>{
      if(id===actor.id)return [];
      const witness=body(world,id);
      if(!witness||!local(world,witness,direct.site.id,tick))return [];
      const reply=receipt(world,claim,actor,'ask',world.tick,witness);
      return [{witness,reply}];
    }):[];
    const options:WitnessInquiryOption[]=!read?[{action:'WITNESS_INQUIRY',witnessInquiryMove:'inspect',targetWitnessClaimId:claim.id}]:
      read.tick<tick?other.filter(row=>!row.reply).map(({witness})=>
      ({action:'WITNESS_INQUIRY',witnessInquiryMove:'ask',targetWitnessClaimId:claim.id,targetCultivatorId:witness.id})):[];
    return [{claim,direct,read,other,options}];
  }).sort((a,b)=>b.claim.filedTick-a.claim.filedTick||(a.claim.id<b.claim.id?-1:1));
}

export function availableWitnessInquiryActions(actor:Cultivator,world:WorldState,executionTick=world.tick+1):WitnessInquiryOption[]{
  return cases(world,actor,executionTick).flatMap(row=>row.options);
}

export function resolveWitnessInquiry(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='WITNESS_INQUIRY'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','witnessInquiryMove','targetWitnessClaimId','targetCultivatorId'].includes(key)))return null;
  const chosen=availableWitnessInquiryActions(actor,world,world.tick).find(row=>
    row.witnessInquiryMove===decision.witnessInquiryMove&&row.targetWitnessClaimId===decision.targetWitnessClaimId&&
    row.targetCultivatorId===decision.targetCultivatorId);
  if(!chosen)return null;
  const id=eventId(chosen.witnessInquiryMove,world.tick,actor.id,chosen.targetWitnessClaimId);
  if(world.events.some(row=>row.id===id))return null;
  const asking=chosen.witnessInquiryMove==='ask';
  return {id,tick:world.tick,year:world.year,month:world.month,title:asking?askTitle:readTitle,
    description:asking?askText:readText,category:'intrigue',actorIds:asking?[actor.id,chosen.targetCultivatorId]:[actor.id],
    locationId:actor.locationId,witnessScope:'participants'};
}

export function projectWitnessInquiry(world:WorldState,viewer:Cultivator):WitnessInquiryView|undefined{
  const recentReply=cases(world,viewer,world.tick).find(row=>row.claim.settledTick!==undefined&&
    row.other.some(({reply})=>reply?.tick===world.tick));
  const current=recentReply??cases(world,viewer,world.tick+1)[0];
  if(!current)return;
  const {direct,other,options}=current;
  const candidate=(recentReply?other.find(({reply})=>reply?.tick===world.tick):undefined)??
    other.find(row=>row.reply)??other[0];
  return {venueName:label(direct.site.name),claim:{text:`${label(direct.claimant.name)}在此张榜，称${label(direct.subject.name)}在所引斗法中落败。${current.claim.settledTick===undefined?
    '这里只照录公示。':'公议已经有了结论，这里只说当时的见闻。'}`,
    ...(current.claim.settledTick!==undefined?{reviewSettled:true as const}:{})},
    options:(recentReply?[]:options).filter(row=>row.witnessInquiryMove==='inspect'||row.targetCultivatorId===candidate?.witness.id),
    ...(candidate?{witness:{name:label(candidate.witness.name),canAsk:!candidate.reply&&options.some(row=>row.targetCultivatorId===candidate.witness.id),
      ...(candidate.reply?{reply:{text:`“我只看见${label(direct.winner.name)}在那场交锋中占了上风。旁的事，我不能作证。”`}}:{})}}:{})};
}
