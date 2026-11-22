import { isChronicleStoryFact } from './chronicleLead';
import type { ChronicleAnchor, ChronicleChapter, WorldEvent, WorldState } from '../types/world';

export interface FocalLayer {
  readonly role:'approach'|'exchange'|'aftermath';
  readonly text:string;
  readonly eventIds:readonly string[];
}
export interface FocalLayerContext {
  readonly world:WorldState;
  readonly focal:ChronicleAnchor;
  readonly throughTick:number;
  readonly anchors:readonly ChronicleAnchor[];
  readonly publicOriginal:(eventId:string)=>WorldEvent|undefined;
}

type ChronicleWindow=Pick<ChronicleChapter,'startTick'|'endTick'|'anchors'>;
const clean=(text:string,max:number)=>text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu,'').trim().slice(0,max);
function index<T extends ChronicleAnchor>(rows:readonly T[],keys?:ReadonlySet<string>):Map<string,T[]> {
  const byId=new Map<string,T[]>();
  for(const row of rows){
    if(keys&&!keys.has(row.id))continue;
    const matches=byId.get(row.id);
    if(matches)matches.push(row);
    else byId.set(row.id,[row]);
  }
  return byId;
}
function sameFact(anchor:ChronicleAnchor,raw:ChronicleAnchor):boolean {
  return anchor.id===raw.id&&anchor.tick===raw.tick&&anchor.year===raw.year&&anchor.month===raw.month&&
    anchor.category===raw.category&&anchor.locationId===raw.locationId&&
    anchor.actorIds.length===raw.actorIds.length&&anchor.actorIds.every((id,i)=>id===raw.actorIds[i])&&
    clean(anchor.title,80)===clean(raw.title,80)&&clean(anchor.description,220)===clean(raw.description,220);
}

/** Extra narrative details need a unique living original in this branch, not just a plausible saved caption. */
export function chapterFocalSources(world:WorldState,chapter:ChronicleWindow):FocalLayerContext['publicOriginal'] {
  const sampled=index(chapter.anchors);
  if(!Number.isSafeInteger(chapter.startTick)||!Number.isSafeInteger(chapter.endTick)||
    chapter.startTick<1||chapter.endTick<chapter.startTick||chapter.endTick>world.tick)return ()=>undefined;
  const keys=new Set(sampled.keys()),live=index(world.events,keys),archived=index(world.chronicleArchive.anchors,keys);
  return eventId=>{
    const cited=sampled.get(eventId),originals=live.get(eventId),retained=archived.get(eventId)??[];
    if(cited?.length!==1||originals?.length!==1||retained.length>1)return undefined;
    const anchor=cited[0],original=originals[0];
    if(anchor.tick<chapter.startTick||!isChronicleStoryFact(anchor,chapter.endTick)||
      !isChronicleStoryFact(original,chapter.endTick)||!sameFact(anchor,original)||
      retained.some(copy=>!isChronicleStoryFact(copy,chapter.endTick)||!sameFact(anchor,copy)))return undefined;
    return original;
  };
}
