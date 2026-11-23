import {matchSectChallengeResult,SECT_CHALLENGE_PUBLIC_TITLE} from './sectChallengeProof';
import {LABELS} from '../data/sectChatVoices';
import {SECT_QUIRK_NAMES} from '../types/sectManagement';
import type {PersonalityTrait,WorldEvent,WorldState} from '../types/world';
import {onLowerPlane} from './upperPassageIsolation';
import {projectSectChat} from './sectChat';

export const SECT_CHAT_MODEL_BATCH_LIMIT=4;
type PublicRoom='jiuzhou'|'market';

export interface SectChatModelSlot {
  readonly postId:string;
  readonly senderId:string;
  readonly name:string;
  readonly sect:string;
  readonly personality:string;
  readonly quirks:readonly string[];
  readonly mood:string;
  readonly knowledge?:'witness'|'rumor';
}
export interface SectChatModelBatch {
  readonly roomId:PublicRoom;
  readonly group:string;
  readonly slots:readonly SectChatModelSlot[];
  readonly trigger?:{readonly title:string};
  readonly recentMessages:readonly {readonly postId:string;readonly senderId:string;readonly text:string}[];
}
const profileText=(text:string,max:number)=>[...text.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,' ').trim()].slice(0,max).join('');
function unique<T extends {id:string}>(items:readonly T[],id:string):T|undefined{
  const rows=items.filter(row=>row.id===id);
  return rows.length===1?rows[0]:undefined;
}

const IDLE_MOOD:Readonly<Record<PersonalityTrait,string>>={
  刚正:'平和',阴险:'审慎',狂傲:'颇有兴致',苟道:'戒备',痴情:'温和',嗜血:'躁动',逍遥:'闲适',诡诈:'饶有兴味',
};
function sceneMood(personality:PersonalityTrait,event:WorldEvent|undefined,knowledge:SectChatModelSlot['knowledge']):string{
  if(event?.category==='death')return '凝重';
  if(knowledge==='rumor')return '将信将疑';
  if(event?.category==='breakthrough')return personality==='狂傲'?'不服输':'振奋';
  if(event?.category==='combat'||event?.category==='heavenly')return personality==='苟道'?'心有余悸':'紧张';
  return IDLE_MOOD[personality];
}

/** Allow exactly one public room and one proven topic (or no facts) per quote; never export raw actor text. */
export function quoteSectChatModelMonth(world:WorldState):readonly SectChatModelBatch[]{
  const month=world.sectManagement?.chat?.months.at(-1);
  if(!month||month.tick!==world.tick||world.sectManagement?.growth?.failure)return [];
  const visible=new Map(projectSectChat(world).filter(room=>room.id==='jiuzhou'||room.id==='market')
    .flatMap(room=>room.posts.filter(row=>row.tick===world.tick).map(row=>[row.id,row] as const)));
  type WorkingBatch=Omit<SectChatModelBatch,'slots'>&{slots:SectChatModelSlot[];major:boolean};
  const batches=new Map<string,WorkingBatch>();
  const usedPostIds=new Set<string>();
  for(const post of month.posts){
    const {roomId,about,senderId}=post;
    const card=visible.get(post.id);
    if(!card||usedPostIds.has(post.id)||post.source!=='template'||post.audience!==undefined||roomId!=='jiuzhou'&&roomId!=='market'||
      about.kind!=='room_greeting'&&about.kind!=='public_event')continue;
    const actor=unique(world.cultivators,senderId);
    if(!actor?.alive||actor.hp<=0||!onLowerPlane(actor)||card.senderId!==senderId)continue;
    const event=about.kind==='public_event'&&card.sourceEventId===about.eventId?unique(world.events,about.eventId):undefined;
    if(about.kind==='public_event'&&(!event||event.witnessScope!==undefined||event.tick!==about.eventTick))continue;
    if(event?.title===SECT_CHALLENGE_PUBLIC_TITLE&&matchSectChallengeResult(world,event))continue;
    const knowledge=about.kind==='public_event'?about.knowledge:undefined;
    const key=JSON.stringify([roomId,event?.id??null,event?.tick??null]);
    const existing=batches.get(key);
    const title=event?profileText(event.title,60):undefined;
    if(event&&!title)continue;
    const sect=actor.sectId?unique(world.sects,actor.sectId):undefined;
    const slot:SectChatModelSlot={postId:post.id,senderId,name:profileText(actor.name,32),sect:sect?profileText(sect.name,32):'散修',
      personality:profileText(actor.personality,16),quirks:[...new Set(actor.quirks??[])].slice(0,2).map(id=>SECT_QUIRK_NAMES[id]),
      mood:sceneMood(actor.personality,event,knowledge),...(knowledge?{knowledge}:{})};
    if(!slot.name||!slot.sect||!slot.personality||existing?.slots.some(row=>row.senderId===senderId))continue;
    usedPostIds.add(post.id);
    if(existing)existing.slots.push(slot);
    else batches.set(key,{roomId,group:LABELS[roomId],slots:[slot],...(title?{trigger:{title}}:{}),recentMessages:[],
      major:!!event&&event.tick===world.tick&&['combat','breakthrough','heavenly','death'].includes(event.category)});
  }
  // Preserve the first three regular voices, then use remaining admission on the
  // largest genuine thread. Same-room fact identities remain separate even if titles agree.
  const all=[...batches.values()];
  const regular=all.filter(batch=>!batch.major).slice(0,3);
  const tail=all.filter(batch=>!regular.includes(batch)).sort((a,b)=>Number(b.major)-Number(a.major)||b.slots.length-a.slots.length);
  return [...regular,...tail].slice(0,SECT_CHAT_MODEL_BATCH_LIMIT)
    .map(({roomId,group,slots,trigger,recentMessages})=>({roomId,group,slots,...(trigger?{trigger}:{}),recentMessages}));
}
