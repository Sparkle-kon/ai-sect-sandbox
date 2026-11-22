import type {ChronicleAnchor,ProtagonistArc,ProtagonistEvidence,ProtagonistSuccessionState,WorldEvent,WorldState} from '../types/world';
import {isChronicleStoryFact,type ChronicleLead} from './chronicleLead';
import {sameGeneratedWorld} from './worldIdentity';
import {verifiedImmortalAscension} from './ascensionProof';

export const PROTAGONIST_OPEN_WINDOW=24;
export const PROTAGONIST_SUSTAIN_WINDOW=12;
export const PROTAGONIST_OPEN_EVIDENCE=3;
export const PROTAGONIST_SUPPORT_LIMIT=8;
export const createProtagonistSuccessionState=():ProtagonistSuccessionState=>({arcs:[]});

type Fact=ChronicleAnchor|WorldEvent;
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const decisive=new Set<Fact['category']>(['combat','breakthrough','death','intrigue']);
const asc=(a:ProtagonistEvidence,b:ProtagonistEvidence)=>a.tick-b.tick||compare(a.eventId,b.eventId);
const detailOrder=(a:ProtagonistEvidence,b:ProtagonistEvidence)=>
  Number(b.attribution==='named_first')-Number(a.attribution==='named_first')||
  Number(decisive.has(b.category))-Number(decisive.has(a.category))||compare(a.eventId,b.eventId);
const cut=(value:string,max:number)=>value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max);
const canonicalFields=(world:WorldState,fact:Fact,known?:ReadonlySet<string>)=>{
  const ids=[...new Set(fact.actorIds.filter(id=>known?known.has(id):world.cultivators.some(row=>row.id===id)))].slice(0,12);
  const dialogue=fact.dialogue?.turns.filter(turn=>ids.includes(turn.speakerId)).slice(0,4)
    .map(turn=>[turn.speakerId,cut(turn.speakerName,45),cut(turn.text,140)]);
  return JSON.stringify([fact.tick,fact.year,fact.month,fact.category,
    cut(fact.title,80),cut(fact.description,220),ids,fact.locationId??null,
    dialogue?.length?[fact.dialogue?.kind,fact.dialogue?.source,dialogue]:null]);
};
/** Recent certified public originals, with any still-retained conflict or private original blocking all copies. */
export function protagonistFactIndex(world:WorldState,throughTick=world.tick){
  const known=new Set(world.cultivators.map(row=>row.id));
  const byId=new Map<string,Fact>(),signatures=new Map<string,string>(),disputed=new Set<string>();
  const native=new Map<string,WorldEvent>();
  for(const row of world.events){
    const prior=native.get(row.id);
    if(prior&&(prior.duelWinnerId!==row.duelWinnerId||JSON.stringify(prior.damage)!==JSON.stringify(row.damage)))
      disputed.add(row.id);
    if(!prior)native.set(row.id,row);
  }
  for(const fact of [...world.events,...world.chronicleArchive.anchors]){
    // A now-authoritative private or future original overrides an apparently harmless older copy.
    if(!isChronicleStoryFact(fact,throughTick)){disputed.add(fact.id);continue;}
    const signature=canonicalFields(world,fact,known), prior=signatures.get(fact.id);
    if(prior&&prior!==signature){disputed.add(fact.id);continue;}
    if(!prior){signatures.set(fact.id,signature);byId.set(fact.id,fact);}
  }
  for(const id of disputed)byId.delete(id);
  return {byId,disputed,native};
}
type Attribution=ProtagonistEvidence['attribution'];
function namedActors(fact:Fact,names:ReadonlyMap<string,string>):Map<string,Attribution>{
  const ids=[...new Set(fact.actorIds)];
  if(!ids.length||ids.length>6||fact.category==='heavenly')return new Map();
  const counts=new Map<string,number>();
  for(const id of ids){const name=names.get(id);if(name)counts.set(name,(counts.get(name)??0)+1);}
  const result=new Map<string,Attribution>();
  for(const id of ids){
    const name=names.get(id);
    if(!name)continue;
    const named=counts.get(name)===1&&(fact.title.includes(name)||fact.description.includes(name))&&
      ![...counts.keys()].some(other=>other!==name&&other.includes(name)&&
        (fact.title.includes(other)||fact.description.includes(other)));
    const quotes=fact.dialogue?.turns.some(turn=>turn.speakerId===id&&turn.speakerName.trim()===name);
    if(named||quotes)result.set(id,quotes?'direct_quote':'named_participant');
  }
  const first=ids[0],name=names.get(first);
  if(result.size===1&&result.has(first)&&name&&counts.get(name)===1&&fact.title.includes(name)){
    result.set(first,'named_first');
  }
  return result;
}
const evidence=(fact:Fact,attribution:Attribution):ProtagonistEvidence=>({eventId:fact.id,tick:fact.tick,category:fact.category,attribution});
function evidenceRows(world:WorldState,facts:Iterable<Fact>,fromTick:number){
  const names=new Map(world.cultivators.map(row=>[row.id,row.name.trim()]));
  const result=new Map<string,ProtagonistEvidence[]>();
  for(const fact of facts){
    if(fact.tick<fromTick)continue;
    for(const [actorId,attribution]of namedActors(fact,names)){
      const next=evidence(fact,attribution);
      const rows=result.get(actorId);
      if(rows)rows.push(next);
      else result.set(actorId,[next]);
    }
  }
  return result;
}
export function qualifiesProtagonistOpening(rows:readonly ProtagonistEvidence[]):boolean{
  return rows.length===PROTAGONIST_OPEN_EVIDENCE&&new Set(rows.map(row=>row.tick)).size===rows.length&&
    new Set(rows.map(row=>row.eventId)).size===rows.length&&new Set(rows.map(row=>row.category)).size>=2&&
    rows.some(row=>decisive.has(row.category))&&rows.some(row=>row.attribution==='named_first');
}
function openingSet(rows:readonly ProtagonistEvidence[]):ProtagonistEvidence[]|undefined{
  if(rows.length<PROTAGONIST_OPEN_EVIDENCE||new Set(rows.map(row=>row.tick)).size<3||
    new Set(rows.map(row=>row.category)).size<2||!rows.some(row=>decisive.has(row.category))||
    !rows.some(row=>row.attribution==='named_first'))return undefined;
  const ordered=[...rows].sort((a,b)=>b.tick-a.tick||detailOrder(a,b));
  for(let i=0;i<ordered.length-2;i++)for(let j=i+1;j<ordered.length-1;j++){
    if(ordered[i].tick===ordered[j].tick)continue;
    for(let k=j+1;k<ordered.length;k++){
      if(ordered[j].tick===ordered[k].tick)continue;
      const trial=[ordered[i],ordered[j],ordered[k]];
      if(qualifiesProtagonistOpening(trial))return trial.sort(asc);
    }
  }
  return undefined;
}
const last=(rows:readonly ProtagonistEvidence[])=>rows.at(-1)?.tick??-1;
interface QualifiedLead { actorId:string; opening:ProtagonistEvidence[] }
function pickLead(world:WorldState,arcs:readonly ProtagonistArc[],all:Map<string,ProtagonistEvidence[]>,throughTick:number):QualifiedLead|undefined{
  const previous=arcs.at(-1);
  const predecessorIds=new Set(previous?[...previous.opening,...previous.support,...(previous.death?[previous.death]:[])].map(row=>row.eventId):[]);
  const mostRecent=new Map(arcs.map(row=>[row.actorId,row.endedTick??0]));
  const living=new Set(world.cultivators.filter(row=>row.alive&&row.hp>0&&row.positionPlane!=='immortal').map(row=>row.id));
  const choices: QualifiedLead[]=[];
  for(const [actorId,rows] of all){
    if(!living.has(actorId))continue;
    const after=Math.max(previous?.openedTick??-1,mostRecent.get(actorId)??-1,throughTick-PROTAGONIST_OPEN_WINDOW);
    const opening=openingSet(rows.filter(row=>row.tick>after&&!predecessorIds.has(row.eventId)));
    if(opening)choices.push({actorId,opening});
  }
  return choices.sort((a,b)=>
    last(b.opening)-last(a.opening)||b.opening[0].tick-a.opening[0].tick||compare(a.actorId,b.actorId))[0];
}
function evidenceStillAllowed(index:ReturnType<typeof protagonistFactIndex>,item:ProtagonistEvidence,actorId:string):boolean{
  if(index.disputed.has(item.eventId))return false;
  const retained=index.byId.get(item.eventId);
  return !retained||(retained.tick===item.tick&&retained.category===item.category&&retained.actorIds.includes(actorId));
}
function sustain(arc:ProtagonistArc,rows:readonly ProtagonistEvidence[]):void{
  const days=new Map(arc.support.map(row=>[row.tick,row]));
  for(const row of rows){
    if(row.tick<=arc.openedTick || days.has(row.tick))continue;
    days.set(row.tick,row);
  }
  arc.support=[...days.values()].sort(asc).slice(-PROTAGONIST_SUPPORT_LIMIT);
}
function publicDeathRole(fact:Fact,native:WorldEvent|undefined,actorId:string,names:ReadonlyMap<string,string>):Attribution|undefined {
  const ids=[...new Set(fact.actorIds)];
  if(fact.category!=='death')return undefined;
  if(ids.length===1&&ids[0]===actorId&&namedActors(fact,names).get(actorId)==='named_first')return 'named_first';
  const winner=native?.duelWinnerId;
  if(ids.length===2&&ids.includes(actorId)&&winner&&winner!==actorId&&ids.includes(winner))return 'named_participant';
  return undefined;
}
function publicDeathEvidence(index:ReturnType<typeof protagonistFactIndex>,actorId:string,throughTick:number,
  names:ReadonlyMap<string,string>):ProtagonistEvidence|undefined {
  for(const fact of index.byId.values()){
    if(fact.tick!==throughTick)continue;
    const role=publicDeathRole(fact,index.native.get(fact.id),actorId,names);
    if(role)return evidence(fact,role);
  }
  return undefined;
}
function close(arc:ProtagonistArc,throughTick:number,reason:NonNullable<ProtagonistArc['closeReason']>,death?:ProtagonistEvidence){
  arc.endedTick=throughTick;
  arc.closeReason=reason;
  if(death)arc.death=death;
}
export function advanceProtagonistSuccession(world:WorldState,previous?:WorldState):void{
  const state=world.protagonistSuccession;
  if(!previous||previous.tick!==world.tick-1||!sameGeneratedWorld(world,previous)||
    previous.worldgen?.birthTick!==world.worldgen?.birthTick)return;
  const throughTick=previous.tick;
  if(!Number.isSafeInteger(throughTick)||throughTick<0||throughTick<=(state.lastEvaluatedTick??-1))return;
  state.lastEvaluatedTick=throughTick;
  const index=protagonistFactIndex(previous,throughTick);
  const rows=evidenceRows(previous,index.byId.values(),Math.max(0,throughTick-PROTAGONIST_OPEN_WINDOW+1));
  for(const matches of rows.values())matches.sort((a,b)=>a.tick-b.tick||detailOrder(a,b));
  const current=state.arcs.at(-1);
  if(current&&current.endedTick===undefined){
    const actor=previous.cultivators.find(row=>row.id===current.actorId);
    const facts=rows.get(current.actorId)??[];
    if(!actor||!actor.alive||actor.hp<=0){
      const death=publicDeathEvidence(index,current.actorId,throughTick,new Map(previous.cultivators.map(row=>[row.id,row.name.trim()])));
      close(current,throughTick,death?'public_death':'evidence_lost',death);
    }else if(current.opening.some(row=>!evidenceStillAllowed(index,row,current.actorId))){
      close(current,throughTick,'evidence_lost');
    }else if(actor.positionPlane==='immortal'&&verifiedImmortalAscension(previous,actor)?.terminal.tick===throughTick){
      // A proven departure ends participation in the lower story, not the person's life.
      close(current,throughTick,'receded');
    }else{
      sustain(current,facts);
      const recent=[...current.opening,...current.support].filter(row=>row.tick>throughTick-PROTAGONIST_SUSTAIN_WINDOW&&
        evidenceStillAllowed(index,row,current.actorId));
      if(throughTick-current.openedTick>=PROTAGONIST_SUSTAIN_WINDOW&&new Set(recent.map(row=>row.tick)).size<2)
        close(current,throughTick,'receded');
      else return;
    }
  }
  const ready=pickLead(previous,state.arcs,rows,throughTick);
  if(!ready)return;
  state.arcs.push({id:`protagonist-arc-${throughTick}`,actorId:ready.actorId,openedTick:throughTick,
    ...(current?{predecessorArcId:current.id}:{}),opening:ready.opening,support:[]});
}

export function projectProtagonistSuccession(world:WorldState,throughTick=world.tick){
  if(!Number.isSafeInteger(throughTick)||throughTick<0||throughTick>world.tick)return {active:undefined,archived:[]};
  const index=protagonistFactIndex(world,throughTick);
  const people=new Map(world.cultivators.map(row=>[row.id,row.name.trim()]));
  const livingLead=world.protagonistSuccession.arcs.at(-1);
  const departing=livingLead&&livingLead.endedTick===undefined
    ? world.cultivators.find(row=>row.id===livingLead.actorId&&row.positionPlane==='immortal') : undefined;
  const departureTick=departing&&verifiedImmortalAscension(world,departing)?.terminal.tick;
  const projectedProof=(proof:ProtagonistEvidence)=>{
    const original=index.byId.get(proof.eventId),title=original&&cut(original.title,80);
    return {...proof,...(title?{title}:{})};
  };
  const slices=world.protagonistSuccession.arcs.filter(row=>row.openedTick<=throughTick).map(arc=>{
    const ended=arc.endedTick!==undefined&&arc.endedTick<=throughTick;
    const available=[...arc.opening,...arc.support].filter(row=>row.tick<=throughTick&&evidenceStillAllowed(index,row,arc.actorId));
    const nativeDeath=arc.death&&index.native.get(arc.death.eventId);
    const death=ended&&arc.death&&evidenceStillAllowed(index,arc.death,arc.actorId)&&
      (!nativeDeath||publicDeathRole(nativeDeath,nativeDeath,arc.actorId,people)===arc.death.attribution)?
      projectedProof(arc.death):undefined;
    return {id:arc.id,actorId:arc.actorId,name:people.get(arc.actorId),openedTick:arc.openedTick,
      predecessorArcId:arc.predecessorArcId,endedTick:ended?arc.endedTick:undefined,
      closeReason:ended?(arc.closeReason==='public_death'&&!death?'evidence_lost' as const:arc.closeReason):undefined,
      ...(death?{death}:{}),evidence:available.map(projectedProof),
      compromised:arc.opening.some(row=>!evidenceStillAllowed(index,row,arc.actorId))};
  });
  return {active:slices.find(row=>row.endedTick===undefined&&!row.compromised&&!!row.name&&
    !(departureTick!==undefined&&departureTick<=throughTick&&row.actorId===departing?.id)),archived:slices.filter(row=>row.endedTick!==undefined)};
}

export function projectEarnedChronicleLead(world:WorldState,chapterFacts:readonly Fact[],throughTick:number):
  (ChronicleLead&{arcId:string})|undefined{
  const active=projectProtagonistSuccession(world,throughTick).active;
  if(!active?.name)return undefined;
  const authority=protagonistFactIndex(world,throughTick);
  const known=new Set(world.cultivators.map(row=>row.id));
  const chapterById=new Map<string,Fact>(),conflicts=new Set<string>();
  for(const fact of chapterFacts){
    const previous=chapterById.get(fact.id),original=authority.byId.get(fact.id);
    if(!isChronicleStoryFact(fact,throughTick)||
      previous&&canonicalFields(world,previous,known)!==canonicalFields(world,fact,known)||
      original&&canonicalFields(world,original,known)!==canonicalFields(world,fact,known)){
      conflicts.add(fact.id);continue;
    }
    chapterById.set(fact.id,fact);
  }
  const matching=active.evidence.filter(row=>{
    const available=chapterById.get(row.eventId);
    return !conflicts.has(row.eventId)&&available&&available.tick===row.tick&&available.category===row.category&&
      available.actorIds.includes(active.actorId);
  }).sort(asc);
  if(matching.length<2)return undefined;
  return {arcId:active.id,actorId:active.actorId,name:active.name,eventIds:matching.map(row=>row.eventId),
    firstTick:matching[0].tick,lastTick:matching[matching.length-1].tick};
}
