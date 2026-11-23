import type {SectRecurringOutcome,SectRecurringRole} from './sectRecurring';

export const SECT_CHAT_ROOMS=['own','jiuzhou','market','leaders'] as const;
export type SectChatRoomId=typeof SECT_CHAT_ROOMS[number];
export const SECT_CHAT_MONTH_LIMIT=12;
export const SECT_CHAT_POST_LIMIT=12;
export const SECT_CHAT_MODEL_TEXT_LIMIT=40;
export const SECT_CHAT_VARIANTS=[0,1,2,3] as const;
export type SectChatVariant=typeof SECT_CHAT_VARIANTS[number];

export type SectChatSource =
  | {readonly kind:'public_event';readonly eventId:string;readonly eventTick:number;readonly knowledge:'witness'|'rumor'}
  | {readonly kind:'comic';readonly templateId:string}
  | {readonly kind:'recurring';readonly role:Exclude<SectRecurringRole,'cat'>;readonly outcome:SectRecurringOutcome}
  | {readonly kind:'room_greeting';readonly kindOfGreeting:'own'|'market'|'jiuzhou'};
interface SectChatPostBase {
  readonly id:string;
  readonly roomId:SectChatRoomId;
  readonly senderId:string;
  readonly tick:number;
  readonly about:SectChatSource;
  readonly variant:SectChatVariant;
  readonly audience?:readonly [string,string];
}
export type SectChatPost=SectChatPostBase&(
  | {readonly source:'template'}
  | {readonly source:'llm';readonly text:string;readonly replyTo?:string}
);
export type SectChatModelPost=Extract<SectChatPost,{source:'llm'}>;

/** Speaker-owned prose stays plain, short, single-line text; the narrator never interprets it. */
export function isSectChatModelText(value:unknown):value is string {
  if(typeof value!=='string'||value.length===0||value.length>SECT_CHAT_MODEL_TEXT_LIMIT*2||
    value.trim()!==value||[...value].length>SECT_CHAT_MODEL_TEXT_LIMIT)return false;
  return !/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029<>{}\[\]`*_\\]/u.test(value)&&
    !/^(?:#{1,6}|[-+]|[0-9]+[.)])[\x20\u3000]/u.test(value)&&!value.includes('~~')&&
    !/(?:&(?:#[xX]?[\da-f]+|[a-z]+);|\b(?:https?|ftp|file|data|javascript|mailto):|\b[a-z]+:\/\/|\bwww\.|\b[a-z\d-]+\.[a-z]{2,}(?=\b))/iu.test(value);
}

/** Chat credentials are only sent over HTTPS, except to a model deliberately hosted on this device. */
export function sectChatModelEndpoint(raw:string):string|undefined {
  try{
    const url=new URL(raw.trim());
    if(url.username||url.password||url.search||url.hash||
      (url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))return;
    return `${url.href.replace(/\/+$/,'')}/chat/completions`;
  }catch{return;}
}

type ReplyContext=Pick<SectChatPost,'tick'|'roomId'|'about'|'audience'>;
/** Position is checked separately by the caller, against the earlier slots of this month. */
export function sameSectChatReplyContext(post:ReplyContext,target:ReplyContext):boolean{
  if(post.tick!==target.tick||post.roomId!==target.roomId||post.roomId==='own'||post.roomId==='leaders'||
    post.audience!==undefined||target.audience!==undefined)return false;
  const current=post.about,original=target.about;
  return current.kind==='room_greeting'&&original.kind==='room_greeting'||
    current.kind==='public_event'&&original.kind==='public_event'&&current.eventId===original.eventId&&
    current.eventTick===original.eventTick;
}

export interface SectChatMonth {readonly tick:number;readonly posts:readonly SectChatPost[]}
export interface SectChatState {readonly months:readonly SectChatMonth[]}
export const sectChatPostId=(sectId:string,tick:number,index:number):string=>`sect-chat-${sectId}-${tick}-${index}`;
