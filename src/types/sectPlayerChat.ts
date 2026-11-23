import type {MarketGood} from './world';

export const SECT_PLAYER_CHAT_ROOMS=['own','jiuzhou'] as const;
export type SectPlayerChatRoom=typeof SECT_PLAYER_CHAT_ROOMS[number];
export const SECT_PLAYER_CHAT_ALIASES=['passing_senior','heaven_alt','helpful_adept'] as const;
export type SectPlayerChatAlias=typeof SECT_PLAYER_CHAT_ALIASES[number];
export const SECT_PLAYER_CHAT_IDENTITIES=['leader',...SECT_PLAYER_CHAT_ALIASES] as const;
export type SectPlayerChatIdentity=typeof SECT_PLAYER_CHAT_IDENTITIES[number];
export const SECT_PLAYER_CHAT_IDENTITY_LABELS:Readonly<Record<SectPlayerChatIdentity,string>>={
  leader:'掌门号',passing_senior:'路过的前辈',heaven_alt:'天道小号',helpful_adept:'匿名热心修士',
};
export const SECT_PLAYER_CHAT_PRESETS=['hype','beg','provoke','debunk','recruit_ad'] as const;
export type SectPlayerChatPreset=typeof SECT_PLAYER_CHAT_PRESETS[number];
export const SECT_PLAYER_CHAT_INTENT_KINDS=['chat',...SECT_PLAYER_CHAT_PRESETS,'sell'] as const;
export type SectPlayerChatIntent =
  | {readonly kind:'chat'}
  | {readonly kind:'hype';readonly eventId?:string}
  | {readonly kind:'beg';readonly donorId?:string}
  | {readonly kind:'provoke';readonly targetSectId:string}
  | {readonly kind:'debunk';readonly rumorId:string}
  | {readonly kind:'recruit_ad'}
  | {readonly kind:'sell';readonly good:MarketGood};
export type SectPlayerChatEffectKind=Exclude<SectPlayerChatIntent['kind'],'chat'>;

export const SECT_PLAYER_CHAT_MONTH_LIMIT=12;
export const SECT_PLAYER_CHAT_POST_LIMIT=3;
export const SECT_PLAYER_CHAT_TEXT_LIMIT=120;
export type SectPlayerChatBody =
  | {readonly kind:'quick';readonly preset:SectPlayerChatPreset;readonly optionId?:string}
  | {readonly kind:'free';readonly text:string};
export interface SectPlayerChatDraft {
  readonly roomId:SectPlayerChatRoom;
  readonly identity:SectPlayerChatIdentity;
  readonly body:SectPlayerChatBody;
}
export interface SectPlayerChatPost extends SectPlayerChatDraft {
  readonly id:string;
  readonly tick:number;
  readonly intent:SectPlayerChatIntent;
}
export interface SectPlayerChatMonth {
  readonly tick:number;
  readonly usedSlots:number;
  readonly usedEffects:readonly SectPlayerChatEffectKind[];
  readonly posts:readonly SectPlayerChatPost[];
}
export interface SectPlayerChatExposure {
  readonly tick:number;
  readonly recognizerId:string;
  readonly postId:string;
  readonly memoryId?:string;
}
export interface SectPlayerChatAliasState {
  readonly posts:number;
  readonly exposure?:SectPlayerChatExposure;
}
export interface SectPlayerChatState {
  readonly months:readonly SectPlayerChatMonth[];
  readonly aliases:Readonly<Partial<Record<SectPlayerChatAlias,SectPlayerChatAliasState>>>;
  readonly recruitAd?:{readonly postedTick:number;readonly targetTick:number};
}
export const sectPlayerChatPostId=(tick:number,index:number):string=>`sect-player-chat-${tick}-${index}`;

export function sectPlayerChatExposureRoll(seed:number,date:number,identity:SectPlayerChatAlias,slot:number):number{
  let hash=seed>>>0;
  for(const char of `${date}:${identity}:${sectPlayerChatPostId(date,slot)}`)
    hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  return hash%3;
}

/** Player speech remains plain and never becomes an action or a clickable link. */
export function isSectPlayerChatText(value:unknown):value is string{
  if(typeof value!=='string'||!value.length||value.length>SECT_PLAYER_CHAT_TEXT_LIMIT*2||
      value.trim()!==value||[...value].length>SECT_PLAYER_CHAT_TEXT_LIMIT)return false;
  return !/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029<>{}\[\]`*_\\]/u.test(value)&&
    !/^(?:#{1,6}|[-+]|[0-9]+[.)])[\x20\u3000]/u.test(value)&&!value.includes('~~')&&
    !/(?:&(?:#[xX]?[\da-f]+|[a-z]+);|\b(?:https?|ftp|file|data|javascript|mailto):|\b[a-z]+:\/\/|\bwww\.|\b[a-z\d-]+\.[a-z]{2,}(?=\b))/iu.test(value);
}
