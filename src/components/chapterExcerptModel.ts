import type {ChronicleAnchor, WorldEvent, WorldState} from '../types/world';
import {canFocusChronicleSite} from '../engine/chronicleFocusEngine';
import {terrainTileAt} from '../engine/terrainEngine';
import {isChronicleStoryFact} from '../engine/chronicleLead';
import {publicChronicleExcerpt, writePublicChronicleScene} from '../engine/chroniclePublicProse';
import {createPublicDialogueResolver} from '../engine/publicDialogueProvenance';

interface ExcerptRow {
  readonly id:string;
  readonly title:string;
  readonly text:string;
  readonly citation:string;
}
export interface ChapterExcerptProjection {
  readonly rows:readonly ExcerptRow[];
  readonly excludedCount:number;
}
export interface ChapterExcerptDraft { readonly text:string }

interface Scope {
  readonly chapterId:string;
  readonly scopeKey:string;
  readonly viewerId:string|undefined;
  readonly tick:number;
  readonly year:number;
  readonly month:number;
  readonly startTick:number;
  readonly endTick:number;
}
interface Evidence { readonly id:string; readonly proof:string }
interface ProjectionProof { readonly scope:Scope; readonly evidence:readonly Evidence[] }
const projections=new WeakMap<ChapterExcerptProjection,ProjectionProof>();
const drafts=new WeakMap<ChapterExcerptDraft,ProjectionProof>();

const archiveCut=(s:string,n:number)=>s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,n);
const safeLine=(s:string)=>s.replace(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu,' ').replace(/\s+/gu,' ').trim();
// Standalone text is often auto-linked by the receiving app, even without a URL scheme.
const linkedText=/(?:\b(?:https?|ftp|file|data|javascript|mailto|blob):|:\s*[/\\]{2}|(?:^|[\s(（])[/\\]{2}|\bwww\.|\b(?:[a-z0-9][a-z0-9-]*\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})(?=$|[^a-z0-9-])|\b(?:\d{1,3}\.){3}\d{1,3}\b)/iu;
const internalToken=/\b(?:evt|loc|npc|elder|tile|branch|chapter|cultivator|sect|avatar)-[a-z0-9][a-z0-9_-]*\b/iu;
const sameIds=(left:readonly string[],right:readonly string[])=>left.length===right.length&&left.every((id,i)=>id===right[i]);
const chronological=(year:number,month:number)=>Number.isSafeInteger(year)&&year>=1&&Number.isSafeInteger(month)&&month>=1&&month<=12;
const categorySet=new Set<WorldEvent['category']>(['breakthrough','combat','intrigue','heavenly','death','diplomacy']);
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;

function matches(raw:WorldEvent,anchor:ChronicleAnchor,people:ReadonlySet<string>):boolean{
  return raw.tick===anchor.tick&&raw.year===anchor.year&&raw.month===anchor.month&&raw.category===anchor.category&&
    raw.locationId===anchor.locationId&&archiveCut(raw.title,80)===anchor.title&&archiveCut(raw.description,220)===anchor.description&&
    sameIds([...new Set(raw.actorIds.filter(id=>people.has(id)))].slice(0,12),anchor.actorIds);
}
function eventProof(raw:WorldEvent|ChronicleAnchor):string{
  const speech=raw.dialogue;
  return JSON.stringify([raw.id,raw.tick,raw.year,raw.month,raw.category,raw.locationId,raw.title,raw.description,raw.actorIds,
    speech&&[speech.kind,speech.source,speech.turns.map(turn=>[turn.speakerId,turn.speakerName,turn.text])]]);
}

export function projectChapterExcerpt(world:WorldState,chapterId:string,scopeKey:string,viewerId?:string):ChapterExcerptProjection|undefined {
  if(!scopeKey||!Number.isSafeInteger(world.tick)||world.tick<0||!chronological(world.year,world.month))return undefined;
  const people=new Set(world.cultivators.map(person=>person.id));
  const viewer=viewerId===undefined?undefined:world.cultivators.find(actor=>actor.id===viewerId);
  if(viewerId!==undefined&&!viewer)return undefined;
  const explored=viewer?.alive&&viewer.hp>0&&viewer.positionPlane===undefined?new Set(viewer.exploredTileIds):new Set<string>();
  const visibility=new Map<string,boolean>();
  const isVisible=(id:string)=>{
    let visible=visibility.get(id);
    if(visible===undefined){visible=canFocusChronicleSite(world,id,viewerId);visibility.set(id,visible);}
    return visible;
  };
  const restrictedNames=world.locations.flatMap(site=>site.type==='secret_realm'||site.type==='abyss'?[safeLine(site.name).normalize('NFKC')]:[]).filter(Boolean);
  const notShareable=(line:string)=>{
    const comparable=line.normalize('NFKC');
    return linkedText.test(comparable)||internalToken.test(comparable)||
      restrictedNames.some(name=>comparable.includes(name));
  };
  const sites=new Map<string,WorldState['locations']>();
  for(const site of world.locations){
    const matches=sites.get(site.id);
    if(matches)matches.push(site);else sites.set(site.id,[site]);
  }
  const chapters=[...world.chronicleArchive.chapters,...(world.coldHistory?.chapters??[])];
  const matchesChapter=chapters.filter(chapter=>chapter.id===chapterId);
  if(matchesChapter.length!==1)return undefined;
  const [chapter]=matchesChapter;
  if(!Number.isSafeInteger(chapter.startTick)||!Number.isSafeInteger(chapter.endTick)||chapter.startTick<0||
    chapter.startTick>chapter.endTick||chapter.endTick>world.tick)return undefined;

  const anchorCounts=new Map<string,number>();
  for(const anchor of chapter.anchors)anchorCounts.set(anchor.id,(anchorCounts.get(anchor.id)??0)+1);
  const occurrences=new Map<string,WorldEvent[]>();
  for(const event of world.events)if(anchorCounts.has(event.id)){
    const rows=occurrences.get(event.id);
    if(rows)rows.push(event);else occurrences.set(event.id,[event]);
  }
  const comparisons=[...world.chronicleArchive.anchors,...chapters.flatMap(row=>row.anchors)];
  let dialogue:ReturnType<typeof createPublicDialogueResolver>|undefined;
  const rows:ExcerptRow[]=[], evidence:Evidence[]=[];
  const ordered=chapter.anchors.map((anchor,index)=>({anchor,index}))
    .sort((a,b)=>a.anchor.tick-b.anchor.tick||a.index-b.index||cmp(a.anchor.id,b.anchor.id));
  for(const {anchor} of ordered){
    const original=occurrences.get(anchor.id);
    if(!/^[a-z0-9][a-z0-9_-]{0,199}$/i.test(anchor.id)||anchorCounts.get(anchor.id)!==1||original?.length!==1)continue;
    const [raw]=original;
    if(raw.witnessScope!==undefined||!isChronicleStoryFact(raw,world.tick)||!categorySet.has(raw.category)||
      !chronological(raw.year,raw.month)||raw.tick<chapter.startTick||raw.tick>chapter.endTick||
      raw.year*12+raw.month>world.year*12+world.month||!matches(raw,anchor,people)||
      comparisons.some(other=>other.id===raw.id&&!matches(raw,other,people)))continue;

    const siteMatches=raw.locationId===undefined?undefined:sites.get(raw.locationId);
    const site=siteMatches?.length===1?siteMatches[0]:undefined;
    const publicLandmark=site?.type==='market'||site?.type==='sect_hq';
    const tile=site&&terrainTileAt(world,site.x,site.y);
    const visible=site&&isVisible(site.id);
    if(raw.locationId!==undefined&&(!site||!tile||site.type==='abyss'||site.type==='secret_realm'||
      !publicLandmark&&!visible&&!explored.has(tile.id)))continue;
    const visibleSite=visible&&site?safeLine(site.name):undefined;

    // The archived title/description can be clipped. Never expand that scene beyond the
    // mutually attested 80/220-character excerpt, or recover prose from the chapter body.
    const scene=writePublicChronicleScene({title:anchor.title,description:anchor.description,category:raw.category});
    const title=safeLine(scene.title), body=safeLine(scene.paragraph);
    const sourceTitle=safeLine(publicChronicleExcerpt(anchor.title));
    if(!title||!body||!sourceTitle||[title,body,sourceTitle].some(notShareable))continue;

    const lines:string[]=[];
    if(raw.dialogue&&anchor.dialogue){
      dialogue??=createPublicDialogueResolver(world);
      const live=dialogue.event(anchor.id), archived=dialogue.chapter(chapterId,anchor.id);
      if(live?.status==='verified'&&!live.alternateVersion&&
        (archived?.status==='verified'||archived?.status==='fragment')&&!archived.alternateVersion&&
        live.kind===archived.kind&&live.source===archived.source&&archived.turns.every((turn,index)=>{
          const current=live.turns[index];
          return current&&turn.speakerId===current.speakerId&&turn.speakerName===archiveCut(current.speakerName,45)&&
            turn.text===archiveCut(current.text,140);
        })){
        const quoteLines=archived.turns.map(turn=>`${safeLine(turn.speakerName)}：「${safeLine(turn.text)}」`);
        if(quoteLines.every(line=>!notShareable(line)))lines.push(...quoteLines);
      }
    }
    const text=[body,...lines].join('\n');
    const citation=`仙历${raw.year}年${raw.month}月 · 原始公开事件：${sourceTitle}${visibleSite&&!notShareable(visibleSite)?` · ${visibleSite}`:''}`;
    rows.push(Object.freeze({id:anchor.id,title,text,citation}));
    evidence.push({id:anchor.id,proof:JSON.stringify([eventProof(raw),eventProof(anchor)])});
  }
  const projection=Object.freeze({rows:Object.freeze(rows),excludedCount:chapter.anchors.length-rows.length});
  projections.set(projection,{scope:{chapterId,scopeKey,viewerId,tick:world.tick,year:world.year,month:world.month,
    startTick:chapter.startTick,endTick:chapter.endTick},evidence});
  return projection;
}

export function prepareChapterExcerpt(projection:ChapterExcerptProjection,selectedIds:readonly string[]):ChapterExcerptDraft|undefined{
  const source=projections.get(projection);
  const selected=new Set(selectedIds);
  if(!source||!selected.size||selected.size!==selectedIds.length||selected.size>projection.rows.length)return undefined;
  const rows=projection.rows.filter(row=>selected.has(row.id));
  if(rows.length!==selected.size)return undefined;
  const draft=Object.freeze({text:rows.map(({title,text,citation})=>`${title}\n${text}\n${citation}`).join('\n\n')+'\n'});
  drafts.set(draft,{scope:source.scope,evidence:source.evidence.filter(row=>selected.has(row.id))});
  return draft;
}

export function confirmChapterExcerpt(world:WorldState,chapterId:string,scopeKey:string,viewerId:string|undefined,
  draft:ChapterExcerptDraft):{filename:string;text:string}|undefined{
  const old=drafts.get(draft);
  if(!old||old.scope.chapterId!==chapterId||old.scope.scopeKey!==scopeKey||old.scope.viewerId!==viewerId||
    old.scope.tick!==world.tick||old.scope.year!==world.year||old.scope.month!==world.month)return undefined;
  const current=projectChapterExcerpt(world,chapterId,scopeKey,viewerId);
  if(!current)return undefined;
  const rebuilt=prepareChapterExcerpt(current,old.evidence.map(row=>row.id));
  const fresh=rebuilt&&drafts.get(rebuilt);
  if(!rebuilt||!fresh||fresh.scope.startTick!==old.scope.startTick||fresh.scope.endTick!==old.scope.endTick||
    fresh.evidence.some((row,i)=>row.id!==old.evidence[i].id||row.proof!==old.evidence[i].proof)||rebuilt.text!==draft.text)return undefined;
  return {filename:'天道纪事选页.txt',text:rebuilt.text};
}
