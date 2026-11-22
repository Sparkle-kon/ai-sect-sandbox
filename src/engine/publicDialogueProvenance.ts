import type {ChronicleAnchor,ChronicleChapter,DialogueExchange,DialogueTurn,WorldEvent,WorldState} from '../types/world';
import {publicChronicleChapters} from './coldHistoryEngine';
import {isChronicleStoryFact} from './chronicleLead';

export interface PublicDialogueTurn {
  readonly ordinal:number;
  readonly speakerId:string;
  readonly speakerName:string;
  readonly text:string;
}
type Surface='event'|'chapter';
interface PublicDialogueBase {readonly eventId:string;readonly tick:number;readonly surface:Surface}
export type PublicDialogueProvenance=PublicDialogueBase&(
  | {readonly status:'verified'|'fragment';readonly kind:DialogueExchange['kind'];
    readonly source:DialogueExchange['source'];readonly turns:readonly PublicDialogueTurn[];readonly alternateVersion?:true}
  | {readonly status:'unresolved'|'conflict'}
);
type Fact=WorldEvent|ChronicleAnchor;
export interface PublicDialogueResolver {
  event(eventId:string):PublicDialogueProvenance|undefined;
  chapter(chapterId:string,eventId:string):PublicDialogueProvenance|undefined;
}

const cut=(value:string,max:number)=>value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max);
const sameIds=(left:readonly string[],right:readonly string[])=>left.length===right.length&&left.every((id,i)=>id===right[i]);
const sameTurn=(a:DialogueTurn,b:DialogueTurn)=>a.speakerId===b.speakerId&&a.speakerName===b.speakerName&&a.text===b.text;
const sameDialogue=(a?:DialogueExchange,b?:DialogueExchange)=> !a||!b ? a===b :
  a.kind===b.kind&&a.source===b.source&&a.turns.length===b.turns.length&&a.turns.every((turn,i)=>sameTurn(turn,b.turns[i]));
const sameContext=(a:Fact,b:Fact)=>a.id===b.id&&a.tick===b.tick&&a.year===b.year&&a.month===b.month&&
  a.category===b.category&&a.locationId===b.locationId;
const archivedActorIds=(row:Fact,people:ReadonlySet<string>)=>[...new Set(row.actorIds.filter(id=>people.has(id)))].slice(0,12);
function sameRaw(a:WorldEvent,b:WorldEvent):boolean{
  return sameContext(a,b)&&a.title===b.title&&a.description===b.description&&
    sameIds(a.actorIds,b.actorIds)&&sameDialogue(a.dialogue,b.dialogue);
}
function sameArchive(a:ChronicleAnchor,b:ChronicleAnchor):boolean{
  return sameContext(a,b)&&a.title===b.title&&a.description===b.description&&
    sameIds(a.actorIds,b.actorIds)&&sameDialogue(a.dialogue,b.dialogue);
}
function fitsNativeContext(raw:WorldEvent,old:ChronicleAnchor,people:ReadonlySet<string>):boolean{
  return sameContext(raw,old)&&cut(raw.title,80)===old.title&&cut(raw.description,220)===old.description&&
    sameIds(archivedActorIds(raw,people),old.actorIds);
}
function attributed(row:Fact,people:ReadonlySet<string>):boolean{
  const dialogue=row.dialogue;
  if(!dialogue?.turns.length||!['utility','llm'].includes(dialogue.source)||
      !['combat','trade','dual_cultivation','sect_diplomacy'].includes(dialogue.kind))return false;
  return dialogue.turns.every(turn=>people.has(turn.speakerId)&&row.actorIds.includes(turn.speakerId)&&
    !!turn.speakerName.trim()&&!!turn.text.trim());
}
function archiveComparable(raw:WorldEvent,old:ChronicleAnchor,people:ReadonlySet<string>):'exact'|'variant'|'unknown'|'conflict'{
  if(!fitsNativeContext(raw,old,people))return 'conflict';
  if(!raw.dialogue&&!old.dialogue)return 'exact';
  if(!raw.dialogue||!old.dialogue)return 'unknown';
  if(raw.dialogue.kind!==old.dialogue.kind)return 'conflict';
  const ordered=raw.dialogue.turns.flatMap((turn,index)=>old.actorIds.includes(turn.speakerId)?
    [{turn:{speakerId:turn.speakerId,speakerName:cut(turn.speakerName,45),text:cut(turn.text,140)},index}]:[]).slice(0,4);
  if(ordered.length!==old.dialogue.turns.length||ordered.some(({turn},i)=>
      turn.speakerId!==old.dialogue!.turns[i].speakerId||turn.speakerName!==old.dialogue!.turns[i].speakerName))return 'conflict';
  if(raw.dialogue.source===old.dialogue.source)
    return ordered.every(({turn},i)=>sameTurn(turn,old.dialogue!.turns[i]))?'exact':'conflict';
  // The native optional language pass happens *after* archive capture. It may change only
  // the first two slots. A genuine farewell and all other native tail slots
  // must have independent archived copies with exact attribution and words.
  if(raw.dialogue.source!=='llm'||old.dialogue.source!=='utility'||raw.dialogue.turns.length<3||
      ordered.filter(({index})=>index>=2).length!==raw.dialogue.turns.length-2||
      ordered.some(({turn,index},i)=>index>=2&&!sameTurn(turn,old.dialogue!.turns[i])))return 'conflict';
  return 'variant';
}

function genuineArchives(world:WorldState,throughTick:number){
  const result=new Map<string,ChronicleChapter>();
  const copies=new Map<string,number>();
  for(const chapter of [...world.chronicleArchive.chapters,...(world.coldHistory?.chapters??[])])
    copies.set(chapter.id,(copies.get(chapter.id)??0)+1);
  for(const chapter of publicChronicleChapters(world))if(chapter.endTick<=throughTick&&copies.get(chapter.id)===1)result.set(chapter.id,chapter);
  return result;
}

/** Snapshot-scoped proof reader, no fallback across worlds, branch IDs or selected surfaces. */
export function createPublicDialogueResolver(world:WorldState,throughTick=world.tick):PublicDialogueResolver{
  if(!Number.isSafeInteger(throughTick)||throughTick<0||throughTick>world.tick)return {event:()=>undefined,chapter:()=>undefined};
  const names=new Map(world.cultivators.map(row=>[row.id,row.name]));
  const people=new Set(names.keys());
  const native=new Map<string,WorldEvent[]>(),copies=new Map<string,ChronicleAnchor[]>();
  const hidden=new Set<string>();
  for(const event of world.events){
    if(!isChronicleStoryFact(event,throughTick)){hidden.add(event.id);continue;}
    const cached=native.get(event.id);
    if(cached)cached.push(event);else native.set(event.id,[event]);
  }
  const chapters=genuineArchives(world,throughTick);
  function addArchive(anchor:ChronicleAnchor){
    if(!isChronicleStoryFact(anchor,throughTick))return;
    const cached=copies.get(anchor.id);
    if(cached)cached.push(anchor);else copies.set(anchor.id,[anchor]);
  }
  world.chronicleArchive.anchors.forEach(addArchive);
  for(const chapter of chapters.values())for(const anchor of chapter.anchors)
    if(anchor.tick>=chapter.startTick&&anchor.tick<=chapter.endTick)addArchive(anchor);

  const format=(selected:Fact,surface:Surface):PublicDialogueProvenance|undefined=>{
    if(hidden.has(selected.id))return undefined;
    const originals=native.get(selected.id)??[],root=originals[0];
    const stored=copies.get(selected.id)??[];
    const statusBase={eventId:selected.id,tick:selected.tick,surface};
    const noWords=(status:'unresolved'|'conflict')=>({...statusBase,status});
    if(!selected.dialogue&&!root?.dialogue&&!stored.some(row=>row.dialogue))return undefined;
    if(originals.some(row=>!sameRaw(root,row))||
        stored.some(row=>!sameArchive(stored[0],row)))return noWords('conflict');
    if(!selected.dialogue||!attributed(selected,people))return noWords('unresolved');
    if(root?.dialogue&&!attributed(root,people))return noWords('unresolved');
    let alternateVersion=false;
    if(root&&stored.length){
      for(const version of stored){
        const verdict=archiveComparable(root,version,people);
        if(verdict==='conflict')return noWords('conflict');
        if(verdict==='unknown')return noWords('unresolved');
        if(verdict==='variant')alternateVersion=true;
      }
    }
    const consistentNames=(row:Fact,archived:boolean)=>row.dialogue?.turns.every(turn=>{
      const canonical=names.get(turn.speakerId);
      return canonical!==undefined&&turn.speakerName===(archived?cut(canonical,45):canonical);
    })??false;
    if(!consistentNames(selected,surface==='chapter')||root?.dialogue&&!consistentNames(root,false)||
        stored.some(row=>row.dialogue&&!consistentNames(row,true)))return noWords('unresolved');
    const exactComplete=surface==='event'||!!root?.dialogue&&!alternateVersion&&sameDialogue(root.dialogue,selected.dialogue);
    return {...statusBase,status:exactComplete?'verified':'fragment',kind:selected.dialogue.kind,source:selected.dialogue.source,
      turns:selected.dialogue.turns.map((turn,index)=>({ordinal:index+1,speakerId:turn.speakerId,
        speakerName:turn.speakerName,text:turn.text})),...(alternateVersion?{alternateVersion:true as const}:{})};
  };
  return {
    event(eventId){
      const original=native.get(eventId)?.[0];
      return original&&format(original,'event');
    },
    chapter(chapterId,eventId){
      const chapter=chapters.get(chapterId);
      if(!chapter)return undefined;
      const anchors=chapter.anchors.filter(row=>row.id===eventId&&row.tick>=chapter.startTick&&row.tick<=chapter.endTick);
      if(anchors.length>1)return hidden.has(eventId)?undefined:
        {status:'conflict',eventId,tick:anchors[0].tick,surface:'chapter'};
      const anchor=anchors[0];
      return anchor&&format(anchor,'chapter');
    },
  };
}
