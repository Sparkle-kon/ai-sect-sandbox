import type { DialogueExchange,WorldState } from '../types/world';
import { decodeWorldSave,encodeWorldSave,WORLD_SAVE_MAX_BYTES,worldSaveByteCount } from './storageEngine';

import { SHARE_SAVE_REDACTED_TEXT } from './shareSaveRedactionText';

export { SHARE_SAVE_REDACTED_TEXT } from './shareSaveRedactionText';

export interface ShareSavePrivacyCounts {
  readonly privateNotes:number;
  readonly avatarTranscriptFields:number;
  readonly actorThoughtFields:number;
  readonly whisperMemoryFields:number;
  readonly participantEventFields:number;
  readonly eventDialogueBlocks:number;
  readonly archiveDialogueBlocks:number;
  readonly chapterProseFields:number;
  readonly councilDialogueFields:number;
}
export interface ShareSaveProtectedCounts {
  readonly cultivators:number;
  readonly livingCultivators:number;
  readonly locations:number;
  readonly sects:number;
  readonly settlements:number;
  readonly avatarBound:boolean;
  readonly avatarOrderPending:boolean;
}
export interface ShareSavePrivacyInspection {
  readonly tick:number;
  readonly branchLabels:'not_exported';
  readonly counts:ShareSavePrivacyCounts;
  readonly protectedCounts:ShareSaveProtectedCounts;
}
export interface ShareSavePrivacyReview extends ShareSavePrivacyInspection {
  readonly originalBytes:number|null;
  readonly redactedBytes:number|null;
  readonly limitBytes:number;
  readonly status:'ready'|'invalid_source'|'invalid_copy';
  readonly protectedStateVerified:boolean;
}
export interface ConfirmedShareSave { readonly json:string; readonly bytes:number }

type Prepared={source:WorldState;originalJson:string;copyJson:string;copyBytes:number};
const prepared=new WeakMap<ShareSavePrivacyReview,Prepared>();
const encoder=()=>new TextEncoder();
const candidateText=(text:string)=>text.trim().length>0&&text!==SHARE_SAVE_REDACTED_TEXT;
const hiddenText=(text:string)=>candidateText(text)?SHARE_SAVE_REDACTED_TEXT:text;
const presentCount=(texts:readonly string[])=>texts.filter(candidateText).length;
const dialogueCount=(rows:readonly {dialogue?:DialogueExchange}[])=>rows.filter(row=>row.dialogue!==undefined).length;

function countsFor(world:WorldState):ShareSavePrivacyCounts{
  return {
    privateNotes:world.annotations.notes.length,
    avatarTranscriptFields:world.playerAvatar.transcript.reduce((sum,row)=>sum+presentCount([row.message,row.reply,row.effect]),0)+
      (world.playerAvatar.audience?.sessions.reduce((sum,session)=>sum+session.turns.reduce(
        (turns,turn)=>turns+presentCount([turn.message,turn.reply]),0),0)??0),
    actorThoughtFields:world.cultivators.reduce((sum,row)=>sum+presentCount([row.innerMonologue,row.secretGoal]),0),
    whisperMemoryFields:world.cultivators.reduce((sum,row)=>sum+presentCount([...row.memories,...row.coreMemories]
      .filter(memory=>memory.category==='whisper').map(memory=>memory.content)),0),
    participantEventFields:world.events.reduce((sum,row)=>sum+(row.witnessScope==='participants'?presentCount([row.title,row.description]):0),0),
    eventDialogueBlocks:dialogueCount(world.events),
    archiveDialogueBlocks:dialogueCount(world.chronicleArchive.anchors)+
      [...world.chronicleArchive.chapters,...world.coldHistory.chapters].reduce((sum,row)=>sum+dialogueCount(row.anchors),0),
    chapterProseFields:presentCount([...world.chronicleArchive.chapters,...world.coldHistory.chapters].map(row=>row.body)),
    councilDialogueFields:world.councils.reduce((sum,row)=>sum+
      row.rounds.reduce((roundCount,round)=>roundCount+presentCount(round.turns.map(turn=>turn.text)),0)+
      presentCount(row.ballots.map(ballot=>ballot.reason)),0),
  };
}

function protectedCountsFor(world:WorldState):ShareSaveProtectedCounts{
  return {cultivators:world.cultivators.length,livingCultivators:world.cultivators.filter(actor=>actor.alive).length,
    locations:world.locations.length,sects:world.sects.length,settlements:world.settlements.villages.length,
    avatarBound:world.playerAvatar.possessedId!==undefined,avatarOrderPending:world.playerAvatar.pendingOrder!==undefined};
}

/** Counts-only ordinary preview. No parsing, cloning, native validation or narrative output. */
export function inspectShareSavePrivacy(world:WorldState):ShareSavePrivacyInspection{
  return Object.freeze({tick:world.tick,branchLabels:'not_exported',counts:Object.freeze(countsFor(world)),
    protectedCounts:Object.freeze(protectedCountsFor(world))});
}

function redactedClone(world:WorldState):WorldState{
  const copy=structuredClone(world);
  copy.annotations.notes=[];
  for(const entry of copy.playerAvatar.transcript){
    entry.message=hiddenText(entry.message);entry.reply=hiddenText(entry.reply);entry.effect=hiddenText(entry.effect);
  }
  for(const session of copy.playerAvatar.audience?.sessions??[]){
    for(const turn of session.turns){
      turn.message=hiddenText(turn.message);turn.reply=hiddenText(turn.reply);
    }
  }
  for(const actor of copy.cultivators){
    actor.innerMonologue=hiddenText(actor.innerMonologue);
    actor.secretGoal=hiddenText(actor.secretGoal);
    for(const memory of [...actor.memories,...actor.coreMemories])if(memory.category==='whisper')memory.content=hiddenText(memory.content);
  }
  for(const entry of copy.events){
    delete entry.dialogue;
    if(entry.witnessScope==='participants'){
      entry.title=hiddenText(entry.title);entry.description=hiddenText(entry.description);
    }
  }
  for(const entry of copy.chronicleArchive.anchors)delete entry.dialogue;
  for(const chapter of copy.chronicleArchive.chapters){
    chapter.body=hiddenText(chapter.body);
    for(const entry of chapter.anchors)delete entry.dialogue;
  }
  // Cold storage is readonly in the domain model; replace only the cloned cold branch.
  copy.coldHistory={...copy.coldHistory,chapters:copy.coldHistory.chapters.map(chapter=>{
    for(const entry of chapter.anchors)delete entry.dialogue;
    return {...chapter,body:hiddenText(chapter.body)};
  })};
  for(const council of copy.councils){
    for(const round of council.rounds)for(const turn of round.turns)turn.text=hiddenText(turn.text);
    for(const ballot of council.ballots)ballot.reason=hiddenText(ballot.reason);
  }
  return copy;
}

type PathPart=string|number;
type PathRole=string|typeof ITEM;
const ITEM=Symbol('array item');
const pathIs=(path:readonly PathPart[],role:readonly PathRole[])=>path.length===role.length&&role.every((item,index)=>
  item===ITEM?typeof path[index]==='number':path[index]===item);
const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
function isPrivateKind(a:unknown,b:unknown,key:string,value:string){
  return object(a)&&object(b)&&a[key]===value&&b[key]===value;
}

/** An independent protected-data comparison: only these exact structural fields may differ, never arbitrary text/IDs. */
function allowedChange(path:readonly PathPart[],leftParent:unknown,rightParent:unknown){
  const last=path.at(-1);
  if(pathIs(path,['annotations','notes']))return true;
  if((last==='message'||last==='reply'||last==='effect')&&pathIs(path,['playerAvatar','transcript',ITEM,last]))return true;
  if((last==='message'||last==='reply')&&pathIs(path,['playerAvatar','audience','sessions',ITEM,'turns',ITEM,last]))return true;
  if((last==='innerMonologue'||last==='secretGoal')&&pathIs(path,['cultivators',ITEM,last]))return true;
  if(last==='content'&&(pathIs(path,['cultivators',ITEM,'memories',ITEM,last])||
    pathIs(path,['cultivators',ITEM,'coreMemories',ITEM,last]))&&isPrivateKind(leftParent,rightParent,'category','whisper'))return true;
  if((last==='title'||last==='description')&&pathIs(path,['events',ITEM,last])&&
    isPrivateKind(leftParent,rightParent,'witnessScope','participants'))return true;
  if(last==='dialogue'&&(pathIs(path,['events',ITEM,last])||pathIs(path,['chronicleArchive','anchors',ITEM,last])||
    pathIs(path,['chronicleArchive','chapters',ITEM,'anchors',ITEM,last])||
    pathIs(path,['coldHistory','chapters',ITEM,'anchors',ITEM,last])))return true;
  return pathIs(path,['chronicleArchive','chapters',ITEM,'body'])||pathIs(path,['coldHistory','chapters',ITEM,'body'])||
    pathIs(path,['councils',ITEM,'rounds',ITEM,'turns',ITEM,'text'])||
    pathIs(path,['councils',ITEM,'ballots',ITEM,'reason']);
}
function protectedEqual(a:unknown,b:unknown,path:readonly PathPart[]=[],leftParent?:unknown,rightParent?:unknown):boolean{
  if(Object.is(a,b)||allowedChange(path,leftParent,rightParent))return true;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&
    a.every((entry,index)=>protectedEqual(entry,b[index],[...path,index],a,b));
  if(!object(a)||!object(b))return false;
  return [...new Set([...Object.keys(a),...Object.keys(b)])].every(key=>protectedEqual(
    Object.hasOwn(a,key)?a[key]:undefined,Object.hasOwn(b,key)?b[key]:undefined,[...path,key],a,b));
}

function measureEvenIfInvalid(world:WorldState){
  try{return worldSaveByteCount(world);}catch{return null;}
}

/** Preview metadata only. The original and candidate must both pass the ordinary native save boundary. */
export function prepareShareSavePrivacy(world:WorldState):ShareSavePrivacyReview{
  const common={...inspectShareSavePrivacy(world),limitBytes:WORLD_SAVE_MAX_BYTES};
  let originalJson:string;
  let original:WorldState;
  try{
    originalJson=encodeWorldSave(world);
    original=decodeWorldSave(originalJson);
  }catch{
    return Object.freeze({...common,originalBytes:measureEvenIfInvalid(world),redactedBytes:null,status:'invalid_source',
      protectedStateVerified:false});
  }
  const originalBytes=encoder().encode(originalJson).byteLength;
  try{
    const redacted=redactedClone(original);
    const copyJson=encodeWorldSave(redacted);
    const decoded=decodeWorldSave(copyJson);
    if(!protectedEqual(original,decoded) || Object.values(countsFor(decoded)).some(amount=>amount!==0)){
      return Object.freeze({...common,originalBytes,redactedBytes:null,status:'invalid_copy',protectedStateVerified:false});
    }
    const copyBytes=encoder().encode(copyJson).byteLength;
    const review:ShareSavePrivacyReview=Object.freeze({...common,originalBytes,redactedBytes:copyBytes,status:'ready',protectedStateVerified:true});
    prepared.set(review,{source:world,originalJson,copyJson,copyBytes});
    return review;
  }catch{
    return Object.freeze({...common,originalBytes,redactedBytes:null,status:'invalid_copy',protectedStateVerified:false});
  }
}

/** Called only after explicit separate confirmation. The UI binds branch/timeline context in addition to this exact seal. */
export function buildConfirmedShareSave(world:WorldState,review:ShareSavePrivacyReview):ConfirmedShareSave|undefined{
  const seal=prepared.get(review);
  if(!seal||seal.source!==world||review.status!=='ready'||review.tick!==world.tick)return undefined;
  try{
    if(encodeWorldSave(world)!==seal.originalJson)return undefined;
  }catch{return undefined;}
  prepared.delete(review);
  return {json:seal.copyJson,bytes:seal.copyBytes};
}
