import type {DramaticBondFact} from '../types/dramaticBond';
import type {Cultivator,LocationNode,WorldEvent,WorldState} from '../types/world';
import {activeAvatar} from './avatarEngine';
import {
  DRAMATIC_BOND_FACTS_MAX,dramaticBondCompareFacts,dramaticBondCompareIds,dramaticBondEventKind,
  dramaticBondReadVenue,dramaticBondUnique,dramaticBondVenue,dramaticBondWitnessIds,matchesDramaticBondFact,
} from './dramaticBondTerms';

export {matchesDramaticBondFact} from './dramaticBondTerms';

const clean=(s:string)=>Array.from(s.replace(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu,' ').replace(/\s+/gu,' ').trim()).slice(0,64).join('');
const local=(actor:Cultivator,site:LocationNode)=>
  actor.positionPlane===undefined&&actor.locationId===site.id;
const aliveBelow=(actor:Cultivator|undefined):actor is Cultivator=>Boolean(actor?.alive&&actor.hp>0&&actor.positionPlane===undefined);

/** Called only for the immediate, actual native actor-action return, prior to other turns/phases. */
export function captureDramaticBondFact(world:WorldState,event:WorldEvent):void{
  const kind=dramaticBondEventKind(event);
  if(!kind||!event.locationId||event.tick!==world.tick||event.year!==world.year||event.month!==world.month)return;
  const site=dramaticBondVenue(world,event.locationId),[firstId,secondId]=event.actorIds;
  if(!site||world.dramaticBonds?.facts.some(fact=>fact.sourceEventId===event.id)||world.events.some(row=>row.id===event.id))return;
  const first=dramaticBondUnique(world.cultivators,firstId),second=dramaticBondUnique(world.cultivators,secondId);
  if(!first||!second||!local(first,site)||!local(second,site))return;
  const fact:DramaticBondFact={kind,sourceEventId:event.id,tick:event.tick,year:event.year,month:event.month,siteId:site.id,
    actorIds:[first.id,second.id],venueKindAtSource:site.type};
  if(kind==='lethal_duel'){
    const winner=event.duelWinnerId===first.id?first:second,fallen=winner===first?second:first;
    if(!aliveBelow(winner)||fallen.alive||fallen.hp!==0)return;
    fact.winnerId=winner.id;fact.fallenId=fallen.id;
  }else{
    if(!aliveBelow(first)||!aliveBelow(second))return;
    if(kind==='duel')fact.winnerId=event.duelWinnerId;
    if(kind==='practice'){
      const a=dramaticBondUnique(world.sects,first.sectId),b=dramaticBondUnique(world.sects,second.sectId);
      if(!a||!b)return;
      fact.alignmentsAtSource=[a.alignment,b.alignment];
    }
  }
  const witnessIds=dramaticBondWitnessIds(world,event);
  if(witnessIds.length)fact.witnessIds=witnessIds;
  const state=world.dramaticBonds??(world.dramaticBonds={facts:[]});
  state.facts.push(fact);
  state.facts.sort(dramaticBondCompareFacts);
  if(state.facts.length>DRAMATIC_BOND_FACTS_MAX)state.facts.splice(0,state.facts.length-DRAMATIC_BOND_FACTS_MAX);
}

export interface DramaticBondReadScope{
  viewerId?:string|null;
  subjectId?:string|null;
  throughTick?:number;
  currentVisibleSiteIds:ReadonlySet<string>;
}
export interface DramaticBondArcView{
  actorIds:[string,string];
  names:[string,string];
  title:string;
  summary:string;
  lastTick:number;
  milestones:{tick:number;year:number;month:number;siteName:string;text:string}[];
  witnessName?:string;
}
type Scene={fact:DramaticBondFact;site:LocationNode;hot?:WorldEvent};
const pair=(ids:[string,string]):[string,string]=>dramaticBondCompareIds(ids[0],ids[1])<0?ids:[ids[1],ids[0]];
const pairKey=(ids:[string,string])=>JSON.stringify(pair(ids));
const opposing=(fact:DramaticBondFact)=>fact.kind==='practice'&&(
  fact.alignmentsAtSource?.[0]==='正道'&&fact.alignmentsAtSource[1]==='魔道'||
  fact.alignmentsAtSource?.[0]==='魔道'&&fact.alignmentsAtSource[1]==='正道');
const fight=(fact:DramaticBondFact)=>fact.kind==='duel'||fact.kind==='lethal_duel';
function actorsById(world:WorldState){
  const result=new Map<string,Cultivator|undefined>();
  for(const actor of world.cultivators)result.set(actor.id,result.has(actor.id)?undefined:actor);
  return result;
}
function sceneText(scene:Scene,actors:ReadonlyMap<string,Cultivator|undefined>):string{
  const {fact}=scene,[a,b]=fact.actorIds.map(id=>clean(actors.get(id)?.name??''));
  if(fact.kind==='encounter')return `当面论道，${a}与${b}各陈所见。`;
  if(fact.kind==='practice')return `${a}与${b}同坐吐纳，共行周天。`;
  const winner=clean(actors.get(fact.winnerId??'')?.name??'');
  if(fact.kind==='lethal_duel')return `斗法既罢，${winner}胜出，${clean(actors.get(fact.fallenId??'')?.name??'')}未能离开战地。`;
  return `两人交手，${winner}占得上风。`;
}

/** All grouping, ranks, labels, and eligible casts derive only from authorized previously public evidence. */
export function projectDramaticBondArcs(world:WorldState,scope:DramaticBondReadScope):DramaticBondArcView[]{
  const through=scope.throughTick??world.tick,facts=world.dramaticBonds?.facts;
  if(!facts?.length||!scope.currentVisibleSiteIds.size||!Number.isSafeInteger(through)||through<1||through>world.tick)return [];
  const actors=actorsById(world),viewer=scope.viewerId?actors.get(scope.viewerId):undefined;
  if(scope.viewerId&&!aliveBelow(viewer)||scope.subjectId&&!actors.get(scope.subjectId))return [];
  const claimed=new Set(facts.map(fact=>fact.sourceEventId));
  const hot=new Map<string,WorldEvent|undefined>();
  for(const event of world.events){
    if(!claimed.has(event.id))continue;
    // An impossible collision on a previously public proof ID means the frame is inconsistent.
    // Other private events do not enter the public source index.
    hot.set(event.id,hot.has(event.id)||event.witnessScope!==undefined?undefined:event);
  }
  const uniqueFacts=new Map<string,number>();
  for(const fact of facts)uniqueFacts.set(fact.sourceEventId,(uniqueFacts.get(fact.sourceEventId)??0)+1);
  const groups=new Map<string,Scene[]>();
  const sites=new Map<string,LocationNode|undefined>();
  for(const fact of facts){
    if(fact.tick>through||uniqueFacts.get(fact.sourceEventId)!==1||!scope.currentVisibleSiteIds.has(fact.siteId)||
      !fact.actorIds.every(id=>clean(actors.get(id)?.name??'')))continue;
    const venueKey=JSON.stringify([fact.siteId,fact.venueKindAtSource]);
    if(!sites.has(venueKey))sites.set(venueKey,dramaticBondReadVenue(world,fact));
    const site=sites.get(venueKey),event=hot.get(fact.sourceEventId);
    if(!site||(hot.has(fact.sourceEventId)&&(!event||!matchesDramaticBondFact(fact,event))))continue;
    const key=pairKey(fact.actorIds),scene:Scene={fact,site,hot:event};
    const group=groups.get(key);
    if(group)group.push(scene);else groups.set(key,[scene]);
  }
  const result:{view:DramaticBondArcView;score:number;key:string}[]=[];
  for(const [key,scenes] of groups){
    scenes.sort((a,b)=>dramaticBondCompareFacts(a.fact,b.fact));
    const actorIds=pair(scenes[0].fact.actorIds),last=scenes.at(-1);
    if(!last||scope.subjectId&&!actorIds.includes(scope.subjectId))continue;
    const distinct=new Set(scenes.map(scene=>scene.fact.tick));
    if(distinct.size<2)continue;
    // Count independent months, never action volume from a single date or scores from raw relationships.
    const fights=new Set(scenes.filter(scene=>fight(scene.fact)).map(scene=>scene.fact.tick)).size;
    const joined=scenes.some(scene=>opposing(scene.fact));
    const decisive=scenes.some(scene=>scene.fact.kind==='lethal_duel');
    const title=fights>=2?'宿敌交锋':joined?'正魔同修':fights?'再会交锋':'故人再会';
    const summary=fights>=2?(decisive?'旧日几度交锋，终于分出一场生死。':'两人不止一次刀剑相向，胜负各有实录。'):
      joined?'一正一魔，曾并肩同修。卷中只记同修，不议私情。':
        fights?'两人不止一次相逢，卷上有一场确凿的交手。':'数度相逢，各有明证。';
    const names:[string,string]=[clean(actors.get(actorIds[0])!.name),clean(actors.get(actorIds[1])!.name)];
    // The optional third role is the current viewer's own actual corroborated witness standing AND
    // a separate authorized encounter involving them. It never changes a title, score, or tie-break.
    const viewerIsLinked=viewer&&!actorIds.includes(viewer.id)&&actorIds.some(id=>groups.has(pairKey([id,viewer.id])));
    const witnessed=viewerIsLinked&&scenes.some(({hot:source,fact})=>source&&fact.witnessIds?.includes(viewer.id)&&
      dramaticBondWitnessIds(world,source).includes(viewer.id));
    const highlights=scenes.length<=5?scenes:[scenes[0],...scenes.slice(-4)];
    result.push({key,score:(decisive?8:0)+Math.min(fights,3)*3+(joined?3:0)+Math.min(distinct.size,5),view:{
      actorIds,names,title,summary,lastTick:last.fact.tick,milestones:highlights.map(scene=>({
        tick:scene.fact.tick,year:scene.fact.year,month:scene.fact.month,siteName:clean(scene.site.name),text:sceneText(scene,actors),
      })),...(witnessed?{witnessName:clean(viewer.name)}:{}),
    }});
  }
  return result.sort((a,b)=>b.score-a.score||b.view.lastTick-a.view.lastTick||dramaticBondCompareIds(a.key,b.key))
    .slice(0,5).map(row=>row.view);
}

export interface PersonalDramaticBondView{
  actorId:string;
  scenes:{title:string;text:string;tick:number}[];
}

/** Only the exact current realized avatar can read their own signed or initiated acts. Never used above. */
export function projectPersonalDramaticBonds(world:WorldState,viewerId?:string|null,subjectId?:string|null):PersonalDramaticBondView|undefined{
  const viewer=viewerId?dramaticBondUnique(world.cultivators,viewerId):undefined;
  if(!aliveBelow(viewer)||activeAvatar(world)!==viewer||subjectId&&subjectId!==viewer.id)return undefined;
  const scenes:PersonalDramaticBondView['scenes']=[];
  const name=(id:string)=>clean(dramaticBondUnique(world.cultivators,id)?.name??'');
  for(const row of world.mentorship.lineage){
    if(row.mentorId!==viewer.id&&row.studentId!==viewer.id||row.lessons<1||row.formedTick>row.lastLessonTick||row.lastLessonTick>world.tick)continue;
    const offer=world.mentorship.offers.find(item=>item.mentorId===row.mentorId&&item.studentId===row.studentId&&
      item.status==='accepted'&&item.resolvedTick===row.lastLessonTick);
    const other=name(row.mentorId===viewer.id?row.studentId:row.mentorId);
    if(!other||!offer)continue;
    scenes.push({title:'亲历传法',tick:row.lastLessonTick,text:row.mentorId===viewer.id?`你曾当面传法于${other}。`:`你曾当面受${other}传法。`});
  }
  for(const row of world.expeditionRescues.requests){
    if(row.status!=='rescued'||!row.rescuerId||!row.arrivedIds?.includes(viewer.id)||
      !row.arrivedIds.includes(row.rescuerId)||!row.arrivedIds.includes(row.explorerId)||
      row.rescuerId!==viewer.id&&row.explorerId!==viewer.id||row.finishedTick===undefined||row.finishedTick>world.tick)continue;
    const other=name(row.rescuerId===viewer.id?row.explorerId:row.rescuerId);
    if(other)scenes.push({title:'亲历撤离',tick:row.finishedTick,text:`你与${other}沿实路同行，均已抵达出口。`});
  }
  const unique=new Map<string,number>();
  for(const event of world.events)unique.set(event.id,(unique.get(event.id)??0)+1);
  for(const event of world.events){
    if(event.tick>world.tick||event.category!=='intrigue'||event.witnessScope!=='participants'||event.actorIds.length!==2||
      event.actorIds[0]!==viewer.id||event.actorIds[1]===viewer.id||
      event.id!==`evt-${event.tick}-${viewer.id}-scheme`||unique.get(event.id)!==1)continue;
    const other=name(event.actorIds[1]);
    if(other)scenes.push({title:'亲自设局',tick:event.tick,text:`你曾暗中针对${other}设局。`});
  }
  return {actorId:viewer.id,scenes:scenes.sort((a,b)=>b.tick-a.tick||dramaticBondCompareIds(a.title,b.title)||
    dramaticBondCompareIds(a.text,b.text)).slice(0,5)};
}
