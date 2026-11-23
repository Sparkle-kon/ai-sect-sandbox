import type {SectRecurringOutcome,SectRecurringRole} from './sectRecurring';

export const SECT_CHAT_ROOMS=['own','jiuzhou','market','leaders'] as const;
export type SectChatRoomId=typeof SECT_CHAT_ROOMS[number];
export const SECT_CHAT_MONTH_LIMIT=12;
export const SECT_CHAT_POST_LIMIT=8;
export const SECT_CHAT_VARIANTS=[0,1,2,3] as const;
export type SectChatVariant=typeof SECT_CHAT_VARIANTS[number];

export type SectChatSource =
  | {readonly kind:'public_event';readonly eventId:string;readonly eventTick:number;readonly knowledge:'witness'|'rumor'}
  | {readonly kind:'comic';readonly templateId:string}
  | {readonly kind:'recurring';readonly role:Exclude<SectRecurringRole,'cat'>;readonly outcome:SectRecurringOutcome}
  | {readonly kind:'room_greeting';readonly kindOfGreeting:'own'|'market'|'jiuzhou'};
export interface SectChatPost {
  readonly id:string;
  readonly roomId:SectChatRoomId;
  readonly senderId:string;
  readonly tick:number;
  readonly source:'template';
  readonly about:SectChatSource;
  readonly variant:SectChatVariant;
  readonly audience?:readonly [string,string];
}
export interface SectChatMonth {readonly tick:number;readonly posts:readonly SectChatPost[]}
export interface SectChatState {readonly months:readonly SectChatMonth[]}
export const sectChatPostId=(sectId:string,tick:number,index:number):string=>`sect-chat-${sectId}-${tick}-${index}`;
