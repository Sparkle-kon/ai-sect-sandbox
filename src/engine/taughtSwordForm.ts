import type {TaughtSwordPractice,TaughtSwordProof} from '../types/taughtSwordForm';
import type {Cultivator,LocationNode,Technique,TuitionOffer,WorldEvent,WorldState} from '../types/world';
import {doctrineFoundingPhysicallyAt} from './doctrineFoundingEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {onLowerPlane} from './upperPassageIsolation';

const authoredForms:Readonly<Record<string,Readonly<Pick<Technique,'name'|'spiritRoot'>>>>={
  'npc-1':{name:'太虚御剑经',spiritRoot:'金'},
  'npc-2':{name:'寒潮剑诀',spiritRoot:'水'},
};

export function isTaughtSwordTechnique(mentorId:string,technique:Technique):boolean{
  const form=Object.hasOwn(authoredForms,mentorId)?authoredForms[mentorId]:undefined;
  return !!form&&technique.id===undefined&&technique.authorId===undefined&&technique.createdTick===undefined&&
    technique.name===form.name&&technique.spiritRoot===form.spiritRoot;
}

export const taughtSwordPracticeEventId=(learnerId:string,tick:number)=>`evt-${tick}-${learnerId}-taught-sword-practice`;
export const isTaughtSwordPracticeEvent=(row:Pick<WorldEvent,'id'>)=>/^evt-\d+-.+-taught-sword-practice$/.test(row.id);
export const TAUGHT_SWORD_PRACTICE_TEXT={
  title:'旧剑式实修',
  description:'逐势演过亲授的剑式，手上已有了实练的分量。',
} as const;

function unique<T extends {id:string}>(rows:readonly T[],id:string):T|undefined{
  let hit:T|undefined;
  for(const row of rows)if(row.id===id){if(hit)return undefined;hit=row;}
  return hit;
}
const whole=(n:number,lo:number,hi:number)=>Number.isSafeInteger(n)&&n>=lo&&n<=hi;
export function isTaughtSwordSite(site:LocationNode|undefined):site is LocationNode{
  return !!site&&site.type!=='secret_realm'&&(site.type!=='abyss'||site.id==='loc-blood')&&!isScopedExpeditionGate(site);
}
function physicallyAt(world:WorldState,actor:Cultivator,siteId:string):boolean{
  return unique(world.cultivators,actor.id)===actor&&onLowerPlane(actor)&&
    isTaughtSwordSite(unique(world.locations,siteId))&&doctrineFoundingPhysicallyAt(world,actor,siteId,world.tick);
}
function eventDate(world:WorldState,event:WorldEvent,tick:number):boolean{
  const absolute=world.year*12+world.month-1-(world.tick-tick);
  return event.tick===tick&&event.year===Math.floor(absolute/12)&&event.month===absolute%12+1;
}
export function validTaughtSwordPractice(world:WorldState,offer:TuitionOffer,practice:TaughtSwordPractice):boolean{
  return offer.resolvedTick!==undefined&&whole(practice.tick,offer.resolvedTick+1,world.tick)&&
    whole(practice.masteryBefore,0,99)&&practice.masteryAfter===Math.min(100,practice.masteryBefore+3)&&
    isTaughtSwordSite(unique(world.locations,practice.siteId));
}
function exactOffer(world:WorldState,offer:TuitionOffer,learner:Cultivator):boolean{
  const tick=offer.resolvedTick;
  return offer.status==='accepted'&&offer.studentId===learner.id&&offer.mentorId!==learner.id&&
    offer.id===`tuition-${offer.createdTick}-${offer.mentorId}-${offer.studentId}`&&
    unique(world.mentorship.offers,offer.id)===offer&&tick!==undefined&&whole(offer.createdTick,1,world.tick)&&
    whole(tick,offer.createdTick+1,Math.min(world.tick,offer.expiresTick-1))&&
    isTaughtSwordTechnique(offer.mentorId,offer.technique)&&isTaughtSwordTechnique(offer.mentorId,learner.technique);
}
function acceptedSource(world:WorldState,offer:TuitionOffer,requirePresent:boolean):boolean{
  const matches=world.events.filter(row=>row.id===`evt-${offer.id}-accepted`);
  if(!matches.length)return !requirePresent;
  const [row]=matches;
  return matches.length===1&&offer.resolvedTick!==undefined&&eventDate(world,row,offer.resolvedTick)&&
    row.category==='breakthrough'&&row.witnessScope==='participants'&&row.title==='同门传法完成'&&
    typeof offer.outcome==='string'&&row.description===offer.outcome&&row.actorIds.length===2&&
    row.actorIds[0]===offer.mentorId&&row.actorIds[1]===offer.studentId&&
    typeof row.locationId==='string'&&isTaughtSwordSite(unique(world.locations,row.locationId));
}
function practiceSource(world:WorldState,offer:TuitionOffer,practice:TaughtSwordPractice):boolean{
  const matches=world.events.filter(row=>row.id===taughtSwordPracticeEventId(offer.studentId,practice.tick));
  if(!matches.length)return true;
  const [row]=matches;
  return matches.length===1&&eventDate(world,row,practice.tick)&&row.locationId===practice.siteId&&
    row.category==='breakthrough'&&row.witnessScope==='participants'&&row.actorIds.length===1&&
    row.actorIds[0]===offer.studentId&&row.title===TAUGHT_SWORD_PRACTICE_TEXT.title&&
    row.description===TAUGHT_SWORD_PRACTICE_TEXT.description;
}

/** Validates a retained training stamp independently of the present actor's technique/location. */
export function validStoredTaughtSwordPractice(world:WorldState,offer:TuitionOffer):boolean{
  const practice=offer.swordPractice;
  const tick=offer.resolvedTick;
  return !!practice&&offer.status==='accepted'&&offer.studentId!==offer.mentorId&&
    unique(world.cultivators,offer.studentId)!==undefined&&unique(world.cultivators,offer.mentorId)!==undefined&&
    offer.id===`tuition-${offer.createdTick}-${offer.mentorId}-${offer.studentId}`&&
    unique(world.mentorship.offers,offer.id)===offer&&tick!==undefined&&whole(offer.createdTick,1,world.tick)&&
    whole(tick,offer.createdTick+1,Math.min(world.tick,offer.expiresTick-1))&&
    isTaughtSwordTechnique(offer.mentorId,offer.technique)&&validTaughtSwordPractice(world,offer,practice)&&
    acceptedSource(world,offer,false)&&practiceSource(world,offer,practice);
}

/** Called only after a genuine native CULTIVATE has applied its mastery gain. */
export function recordTaughtSwordPractice(world:WorldState,actor:Cultivator,beforeMastery:number):WorldEvent|undefined{
  if(actor.currentAction!=='CULTIVATE'||!whole(beforeMastery,0,99)||
    actor.techniqueMastery!==Math.min(100,beforeMastery+3))return;
  const edges=world.mentorship.lineage.filter(row=>row.studentId===actor.id);
  const [edge]=edges;
  if(edges.length!==1||edge.lastLessonTick>=world.tick||!isTaughtSwordTechnique(edge.mentorId,actor.technique)||
    !isTaughtSwordTechnique(edge.mentorId,edge.technique))return;
  if(!physicallyAt(world,actor,actor.locationId)||!unique(world.cultivators,edge.mentorId))return;
  const sources=world.mentorship.offers.filter(row=>row.mentorId===edge.mentorId&&row.studentId===actor.id&&
    row.resolvedTick===edge.lastLessonTick&&exactOffer(world,row,actor));
  const [offer]=sources;
  if(sources.length!==1||offer.swordPractice||!acceptedSource(world,offer,true))return;
  const id=taughtSwordPracticeEventId(actor.id,world.tick);
  if(world.events.some(row=>row.id===id))return;
  offer.swordPractice={tick:world.tick,siteId:actor.locationId,masteryBefore:beforeMastery,masteryAfter:actor.techniqueMastery};
  return {id,tick:world.tick,year:world.year,month:world.month,category:'breakthrough',actorIds:[actor.id],
    locationId:actor.locationId,witnessScope:'participants',...TAUGHT_SWORD_PRACTICE_TEXT};
}

/** Trust only the exact still-relevant private, dated practice and two current bodies; no fallback to names or affinity. */
export function taughtSwordProof(world:WorldState,learner:Cultivator,mentor:Cultivator):TaughtSwordProof|undefined{
  if(learner.id===mentor.id||learner.locationId!==mentor.locationId||
    !isTaughtSwordTechnique(mentor.id,learner.technique))return;
  const eligible=world.mentorship.offers.filter(row=>row.mentorId===mentor.id&&row.studentId===learner.id&&
    row.swordPractice!==undefined&&row.swordPractice.tick<world.tick&&exactOffer(world,row,learner));
  const latest=eligible.reduce((tick,row)=>Math.max(tick,row.resolvedTick??0),0);
  const sources=eligible.filter(row=>row.resolvedTick===latest);
  if(sources.length!==1||!physicallyAt(world,learner,learner.locationId)||
    !physicallyAt(world,mentor,learner.locationId))return;
  const [offer]=sources, practice=offer.swordPractice;
  if(!practice||!validTaughtSwordPractice(world,offer,practice)||!acceptedSource(world,offer,false)||
    !practiceSource(world,offer,practice))return;
  return {tuitionId:offer.id,learnerId:learner.id,mentorId:mentor.id,lessonTick:latest,
    practiceTick:practice.tick,practiceSiteId:practice.siteId};
}
