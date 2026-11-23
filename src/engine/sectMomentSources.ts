import {REALM_ORDER} from '../data/initialWorld';
import type {SectMomentKind,SectMomentSource} from '../types/sectMoments';
import type {Cultivator,LocationNode,WorldEvent,WorldState} from '../types/world';
import {isChronicleStoryFact} from './chronicleLead';
import {onLowerPlane} from './upperPassageIsolation';

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const sorted=(ids:readonly string[])=>[...ids].sort(cmp);
const living=(actor:Cultivator)=>actor.alive&&actor.hp>0&&onLowerPlane(actor);
const equalIds=(a:readonly string[]|undefined,b:readonly string[])=>!!a&&a.length===b.length&&a.every((id,i)=>id===b[i]);

function uniqueIndex<T extends {id:string}>(rows:readonly T[]): Map<string,T|undefined> {
  const result=new Map<string,T|undefined>();
  for(const row of rows)result.set(row.id,result.has(row.id)?undefined:row);
  return result;
}

function dated(world:WorldState,event:WorldEvent):boolean{
  return Number.isSafeInteger(event.tick)&&Number.isSafeInteger(event.year)&&Number.isInteger(event.month)&&
    event.month>=1&&event.month<=12&&event.tick>=0&&event.tick<=world.tick&&
    (world.year-event.year)*12+world.month-event.month===world.tick-event.tick;
}

function artifactAction(eventId:string,prefix:string):'forge'|'bind'|undefined{
  if(!eventId.startsWith(prefix))return;
  const match=/^(forge|bind)_artifact-[1-9]\d*$/.exec(eventId.slice(prefix.length));
  return match?.[1]==='forge'?'forge':match?.[1]==='bind'?'bind':undefined;
}

/** Structural source key for an old post whose hot receipt is no longer retained. */
export function isSectMomentSourceId(post:SectMomentSource):boolean {
  const prefix=`evt-${post.tick}-${post.authorId}-`;
  switch(post.kind){
    case 'breakthrough':return post.sourceEventId===prefix+'break'||post.sourceEventId===prefix+'tribulation-passed';
    case 'artifact':return artifactAction(post.sourceEventId,prefix)!==undefined;
    case 'food':return post.sourceEventId===prefix+'management-kitchen';
    case 'travel':return post.sourceEventId===prefix+'explore';
  }
}

const realmRank=(actor:Cultivator)=>REALM_ORDER.indexOf(actor.realm)*10+actor.realmStage;

function gainedArtifact(previous:Cultivator,actor:Cultivator,event:WorldEvent,prefix:string):boolean{
  const action=artifactAction(event.id,prefix);
  if(action==='forge'){
    const forgedPrefix=`artifact-${actor.id}-${event.tick}-`;
    const before=new Set(previous.artifacts.map(item=>item.id));
    return actor.artifacts.some(item=>item.id?.startsWith(forgedPrefix)&&
      /^[1-9]\d*$/.test(item.id.slice(forgedPrefix.length))&&!before.has(item.id));
  }
  if(action==='bind'){
    const before=new Map(previous.artifacts.map((item,i)=>[item.id??`legacy-artifact-${actor.id}-${i}`,item.boundTo]));
    return actor.artifacts.some(item=>!!item.id&&item.boundTo===actor.id&&before.has(item.id)&&before.get(item.id)!==actor.id);
  }
  return false;
}

function receiptKind(world:WorldState,event:WorldEvent,site:LocationNode):SectMomentKind|undefined{
  const authorId=event.actorIds[0];
  if(!authorId||!dated(world,event)||event.locationId!==site.id||site.type==='secret_realm'||site.expeditionOmenId!==undefined)return;
  const prefix=`evt-${event.tick}-${authorId}-`;
  if(event.witnessScope==='participants'){
    const managed=world.sectManagement;
    if(managed&&authorId!==managed.leaderId&&site.id===managed.homeSiteId&&site.type==='sect_hq'&&
      event.id===prefix+'management-kitchen'&&event.category==='diplomacy'&&event.title==='饭堂开了一灶'&&
      event.actorIds.length>=2&&event.actorIds.length<=9&&event.actorIds.includes(managed.leaderId)&&
      new Set(event.actorIds).size===event.actorIds.length)return 'food';
    return;
  }
  if(event.actorIds.length!==1||event.category!=='breakthrough'||!isChronicleStoryFact(event,world.tick))return;
  if(event.id===prefix+'break'||event.id===prefix+'tribulation-passed'&&event.title==='天劫圆满')return 'breakthrough';
  if(event.id===prefix+'explore')return 'travel';
  const action=artifactAction(event.id,prefix);
  if(action==='forge'&&event.title==='炼器开炉，灵宝成形'||action==='bind'&&event.title==='滴血认主')return 'artifact';
}

/** Published receipts remain tied to their original venue and their entire original private audience. */
export function matchesSectMomentEvent(world:WorldState,post:SectMomentSource,event:WorldEvent):boolean {
  if(event.id!==post.sourceEventId||event.tick!==post.tick||event.locationId!==post.siteId||event.actorIds[0]!==post.authorId)return false;
  const site=uniqueIndex(world.locations).get(post.siteId);
  if(!site||receiptKind(world,event,site)!==post.kind)return false;
  return post.kind==='food'?equalIds(post.audience,sorted(event.actorIds)):post.audience===undefined;
}

export function resolveSectMomentSource(world:WorldState,post:SectMomentSource):WorldEvent|undefined {
  const event=uniqueIndex(world.events).get(post.sourceEventId);
  return event&&matchesSectMomentEvent(world,post,event)?event:undefined;
}

function equivalent(stored:WorldEvent,event:WorldEvent):boolean {
  return stored.tick===event.tick&&stored.year===event.year&&stored.month===event.month&&stored.title===event.title&&
    stored.description===event.description&&stored.locationId===event.locationId&&stored.category===event.category&&
    stored.witnessScope===event.witnessScope&&equalIds(stored.actorIds,event.actorIds);
}

/** Only the sealed completed turn batch can turn an actual change into a new photo. */
export function collectSectMomentSources(world:WorldState,previous:WorldState,events:readonly WorldEvent[]):readonly SectMomentSource[]{
  const managed=world.sectManagement;
  if(!managed||world.tick!==previous.tick+1||world.tick<=managed.foundedTick||previous.sectManagement?.sectId!==managed.sectId)return [];
  const completed=uniqueIndex(events),retained=uniqueIndex(world.events),sites=uniqueIndex(world.locations);
  const actors=uniqueIndex(world.cultivators),priorActors=uniqueIndex(previous.cultivators);
  const sources:SectMomentSource[]=[];
  for(const [id,event] of completed){
    const stored=retained.get(id);
    if(!stored||!event||event.tick!==world.tick||!equivalent(stored,event)||!event.locationId)continue;
    const site=sites.get(event.locationId),authorId=event.actorIds[0];
    const actor=actors.get(authorId),before=priorActors.get(authorId);
    if(!site||!actor||!before||!living(actor)||!living(before))continue;
    const kind=receiptKind(world,event,site);
    if(!kind)continue;
    switch(kind){
      case 'breakthrough':{
        if(realmRank(actor)<=realmRank(before))continue;
        if(event.id.endsWith('-tribulation-passed')&&(actor.tribulation?.stage!=='passed'||
          actor.tribulation.resolvedTick!==event.tick||actor.tribulation.targetRealm!==actor.realm))continue;
        break;
      }
      case 'artifact':
        if(!gainedArtifact(before,actor,event,`evt-${world.tick}-${actor.id}-`))continue;
        break;
      case 'travel':
        if(before.locationId===site.id||actor.locationId!==site.id)continue;
        break;
      case 'food':{
        const report=managed.latestReport;
        const rows=report?.rows.filter(row=>row.discipleId===actor.id&&row.jobId==='kitchen'&&row.phase==='performed'&&
          row.siteId===site.id&&row.sourceEventId===id);
        if(actor.sectId!==managed.sectId||report?.settledTick!==event.tick||report.openedTick!==previous.tick||
          report.sectId!==managed.sectId||report.leaderId!==managed.leaderId||rows?.length!==1||
          !rows[0].effects.some(effect=>effect.kind==='herb'&&effect.stage==='native'&&effect.amount===-1))continue;
        break;
      }
    }
    sources.push({tick:event.tick,authorId,kind,sourceEventId:event.id,siteId:site.id,
      ...(kind==='food'?{audience:sorted(event.actorIds)}:{})});
  }
  return sources.sort((a,b)=>cmp(a.sourceEventId,b.sourceEventId));
}

/** Immediate reactions come from the receipt's participants or its native dated eyewitness packet. */
export function knowsSectMoment(actor:Cultivator,source:SectMomentSource,event:WorldEvent):boolean{
  if(actor.id===source.authorId)return false;
  if(source.audience)return source.audience.includes(actor.id)&&event.actorIds.includes(actor.id);
  if(event.actorIds.includes(actor.id))return true;
  return actor.rumors.some(rumor=>rumor.id===`rumor-${event.id}`&&rumor.originEventId===event.id&&
    rumor.originTick===event.tick&&rumor.learnedTick===source.tick&&rumor.learnedTick===event.tick&&
    rumor.subject===event.title&&rumor.locationId===event.locationId&&rumor.witnessScope===undefined&&
    rumor.confidence>=25&&rumor.confidence<=100&&rumor.provenance==='witness'&&rumor.hops===0&&
    rumor.originSourceCultivatorId===actor.id&&rumor.sourceCultivatorId===undefined);
}
