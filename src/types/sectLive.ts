export const SECT_LIVE_KINDS=['tournament','tribulation','furnace','furnace_hazard','combat'] as const;
export type SectLiveKind=typeof SECT_LIVE_KINDS[number];
export const SECT_LIVE_VARIANTS=[0,1,2,3] as const;
export type SectLiveVariant=typeof SECT_LIVE_VARIANTS[number];
export const SECT_LIVE_MONTH_LIMIT=12;
export const SECT_LIVE_MONTHLY_LIMIT=3;
export const SECT_LIVE_WITNESS_LIMIT=6;
export const SECT_LIVE_PLAYER_LINE_LIMIT=3;
export const SECT_LIVE_TEXT_LENGTH=40;
export const SECT_LIVE_GIFT_COST=3;
export const SECT_LIVE_GIFT_REPUTATION=1;
export const SECT_LIVE_CAST_LIMIT=12;

export interface SectLiveBout {
  readonly occasionId:string;
  readonly round:number;
  readonly bout:number;
}

export interface SectLiveSource {
  readonly tick:number;
  readonly kind:SectLiveKind;
  readonly sourceEventId:string;
  readonly siteId:string;
  readonly castIds:readonly string[];
  readonly bout?:SectLiveBout;
}

export interface SectLiveDanmaku {
  readonly actorId:string;
  readonly variant:SectLiveVariant;
}

export interface SectLiveGift {
  readonly tick:number;
  readonly leaderId:string;
  readonly sectId:string;
  readonly cost:typeof SECT_LIVE_GIFT_COST;
  readonly reputation:typeof SECT_LIVE_GIFT_REPUTATION;
}

export interface SectLiveShow extends SectLiveSource {
  readonly id:string;
  readonly danmaku:readonly SectLiveDanmaku[];
  readonly playerLines?:readonly string[];
  readonly gift?:SectLiveGift;
}

export interface SectLiveState {
  readonly shows:readonly SectLiveShow[];
}

export type SectLiveCommand=
  | {readonly kind:'danmaku';readonly showId:string;readonly text:string}
  | {readonly kind:'gift';readonly showId:string};

export const sectLiveShowId=(tick:number,index:number):string=>`sect-live-${tick}-${index}`;

export function isSectLiveText(value:unknown):value is string{
  if(typeof value!=='string'||!value.length||value.length>2*SECT_LIVE_TEXT_LENGTH||
    value.trim()!==value||[...value].length>SECT_LIVE_TEXT_LENGTH)return false;
  return !/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029<>]/u.test(value);
}
