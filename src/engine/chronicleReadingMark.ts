import type {WorldEvent,WorldState} from '../types/world';
import {isChronicleStoryFact} from './chronicleLead';

export const CHRONICLE_READING_MARK_KEY='ai-sect-sandbox:explicit-reading-mark:v1';
export const CHRONICLE_READING_SECTIONS=['record','cause','dialogue'] as const;
const MAX_SCOPES=24;
const MAX_SCROLL=10_000_000;
const MAX_STORED_BYTES=96_000;
export type ChronicleReadingSection=typeof CHRONICLE_READING_SECTIONS[number];
export interface ChronicleReadingScope {
  timelineId:string;
  branchId:string;
  viewerId:string|null;
  previewTick:number|null;
}
export interface ChronicleReadingPosition {
  readonly sections:readonly ChronicleReadingSection[];
  readonly listScrollTop:number;
  readonly pageScrollY:number;
}
export interface ChronicleReadingPlace extends ChronicleReadingPosition {readonly eventId:string}
export interface ChronicleReadingContext {readonly scope:ChronicleReadingScope;readonly world:WorldState}
export type ChronicleReadingStorage=Pick<Storage,'getItem'|'setItem'>;
export interface ChronicleReadingOptions {
  storage?:ChronicleReadingStorage;
  /** Caller rechecks its actual active context/event admissibility after asynchronous hashing. */
  current?:()=>ChronicleReadingContext|undefined;
}
interface StoredMark extends ChronicleReadingPlace {readonly scope:ChronicleReadingScope;readonly digest:string}

const id=(value:unknown):value is string=>typeof value==='string'&&value.length<=240&&
  /^[a-zA-Z0-9_.:@-]+$/.test(value);
const storageFor=(options?:ChronicleReadingOptions)=>options?.storage??globalThis.localStorage;
const natural=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const scopeValid=(scope:unknown):scope is ChronicleReadingScope=>object(scope)&&Object.keys(scope).length===4&&
  id(scope.timelineId)&&id(scope.branchId)&&(scope.viewerId===null||id(scope.viewerId))&&
  (scope.previewTick===null||natural(scope.previewTick));
const exactScope=(a:ChronicleReadingScope,b:ChronicleReadingScope)=>a.timelineId===b.timelineId&&a.branchId===b.branchId&&
  a.viewerId===b.viewerId&&a.previewTick===b.previewTick;
const cleanScope=(scope:ChronicleReadingScope):ChronicleReadingScope=>({timelineId:scope.timelineId,branchId:scope.branchId,
  viewerId:scope.viewerId,previewTick:scope.previewTick});
const sections=(list:readonly ChronicleReadingSection[])=>list.includes('record')?
  CHRONICLE_READING_SECTIONS.filter(kind=>list.includes(kind)):[];
const scroll=(n:number)=>Number.isFinite(n)?Math.min(MAX_SCROLL,Math.max(0,Math.round(n))):0;
const cleanPosition=(position:ChronicleReadingPosition):ChronicleReadingPosition=>({sections:sections(position.sections),
  listScrollTop:scroll(position.listScrollTop),pageScrollY:scroll(position.pageScrollY)});
const openableSection=(value:unknown):value is ChronicleReadingSection=>
  typeof value==='string'&&CHRONICLE_READING_SECTIONS.some(section=>section===value);
function markValid(raw:unknown):raw is StoredMark{
  if(!object(raw)||Object.keys(raw).length!==6||!scopeValid(raw.scope)||!id(raw.eventId)||
      typeof raw.digest!=='string'||!/^[a-f0-9]{64}$/.test(raw.digest)||
      !Array.isArray(raw.sections)||raw.sections.length>3||!raw.sections.every(openableSection)||
      !natural(raw.listScrollTop)||raw.listScrollTop>MAX_SCROLL||!natural(raw.pageScrollY)||raw.pageScrollY>MAX_SCROLL)return false;
  const canonical=sections(raw.sections);
  return canonical.length===raw.sections.length&&raw.sections.every((item,index)=>canonical[index]===item);
}

function read(storage?:ChronicleReadingStorage):StoredMark[]{
  const raw=storage?.getItem(CHRONICLE_READING_MARK_KEY);
  if(!raw||raw.length>MAX_STORED_BYTES)return [];
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{return [];}
  if(!Array.isArray(parsed)||parsed.length>MAX_SCOPES)return [];
  return parsed.filter(markValid).filter((item,index,list)=>
    list.findIndex(other=>exactScope(other.scope,item.scope))===index);
}

function nativePublicScene(scope:ChronicleReadingScope,world:WorldState,eventId:string):WorldEvent|undefined{
  if(!scopeValid(scope)||!id(eventId)||scope.previewTick!==null&&scope.previewTick!==world.tick)return undefined;
  if(scope.viewerId!==null&&world.cultivators.filter(row=>row.id===scope.viewerId).length!==1)return undefined;
  const sources=world.events.filter(row=>row.id===eventId);
  return sources.length===1&&isChronicleStoryFact(sources[0],world.tick)?sources[0]:undefined;
}

/** Explicit native fields only; properties cloned/reordered by save transport hash identically. */
function fullSource(row:WorldEvent):string{
  return JSON.stringify([row.id,row.tick,row.year,row.month,row.title,row.description,row.category,
    row.actorIds,row.locationId??null,row.witnessScope??null,row.duelWinnerId??null,
    row.damage?.map(entry=>[entry.cultivatorId,entry.amount])??null,
    row.dialogue?[row.dialogue.kind,row.dialogue.source,
      row.dialogue.turns.map(turn=>[turn.speakerId,turn.speakerName,turn.text])]:null]);
}
async function sha256(value:string):Promise<string>{
  const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function stillCurrent(scope:ChronicleReadingScope,world:WorldState,eventId:string,source:string,options?:ChronicleReadingOptions):boolean{
  const current=options?.current?options.current():{scope,world};
  if(!current||!exactScope(scope,current.scope))return false;
  const currentSource=nativePublicScene(current.scope,current.world,eventId);
  return !!currentSource&&fullSource(currentSource)===source;
}

/** Counts only. Exact source checks and hashing are deferred until an explicit resume. */
export function hasChronicleReadingPlace(scope:ChronicleReadingScope,options?:ChronicleReadingOptions):boolean{
  try{return scopeValid(scope)&&read(storageFor(options)).some(row=>exactScope(row.scope,scope));}
  catch{return false;}
}

/** Persist one explicitly marked public scene and its own evidence, never source words or entity names. */
export async function markChronicleReadingPlace(scope:ChronicleReadingScope,world:WorldState,eventId:string,
    position:ChronicleReadingPosition,options?:ChronicleReadingOptions):Promise<boolean>{
  try{
    const event=nativePublicScene(scope,world,eventId);
    const storage=storageFor(options);
    if(!storage||!event)return false;
    const expected=cleanScope(scope),place=cleanPosition(position),source=fullSource(event),digest=await sha256(source);
    if(!stillCurrent(expected,world,eventId,source,options))return false;
    const remaining=read(storage).filter(row=>!exactScope(row.scope,expected));
    storage.setItem(CHRONICLE_READING_MARK_KEY,JSON.stringify([{scope:expected,eventId,digest,...place},...remaining].slice(0,MAX_SCOPES)));
    return true;
  }catch{return false;}
}

/** Verification never writes or promotes a stale bookmark; the caller decides whether to focus the exact row. */
export async function resumeChronicleReadingPlace(scope:ChronicleReadingScope,world:WorldState,
    options?:ChronicleReadingOptions):Promise<ChronicleReadingPlace|undefined>{
  try{
    if(!scopeValid(scope))return undefined;
    const storage=storageFor(options),expected=cleanScope(scope);
    const mark=read(storage).find(row=>exactScope(row.scope,expected));
    const event=mark&&nativePublicScene(expected,world,mark.eventId);
    if(!mark||!event)return undefined;
    const source=fullSource(event);
    if(await sha256(source)!==mark.digest||!stillCurrent(expected,world,mark.eventId,source,options))return undefined;
    const fresh=read(storage).find(row=>exactScope(row.scope,expected));
    if(!fresh||fresh.eventId!==mark.eventId||fresh.digest!==mark.digest||
        fresh.listScrollTop!==mark.listScrollTop||fresh.pageScrollY!==mark.pageScrollY||
        fresh.sections.join(',')!==mark.sections.join(','))return undefined;
    return {eventId:mark.eventId,sections:[...mark.sections],listScrollTop:mark.listScrollTop,pageScrollY:mark.pageScrollY};
  }catch{return undefined;}
}
