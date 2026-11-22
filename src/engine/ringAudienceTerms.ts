import type {RingAudienceAim,RingAudienceRole,RingAudienceStance,RingAudienceTone,RingAudienceTurn} from '../types/ringAudience';
import type {PersonalityTrait} from '../types/world';

export const RING_AUDIENCE_MAX_TURNS=4;
export const RING_AUDIENCE_MAX_SESSIONS=24;
export const RING_AUDIENCE_MESSAGE_LIMIT=220;
export const RING_AUDIENCE_COST={ring:3,heaven:4} as const;
export const RING_AUDIENCE_TABOO_TECHNIQUE='tech-audience-hidden-lantern';
export interface RingAudienceOpenRequest {role:RingAudienceRole;targetId:string;aim:RingAudienceAim}
export interface RingAudienceCursor {sessionId:string;targetId:string;role:RingAudienceRole;expectedTurn:number}
export interface RingAudienceExchangeRequest extends RingAudienceCursor {message:string}
const clamp=(value:number)=>Math.max(0,Math.min(100,value));
const starting:Readonly<Record<PersonalityTrait,number>>={刚正:25,阴险:32,狂傲:28,苟道:23,痴情:34,嗜血:30,逍遥:33,诡诈:27};
const aimWavering:Readonly<Record<RingAudienceAim,number>>={leave_sect:0,learn_taboo:3,challenge_master:-3};
export const ringAudienceInitialWavering=(personality:PersonalityTrait,aim:RingAudienceAim):number=>
  starting[personality]+aimWavering[aim];
export const ringAudienceInitialStance:RingAudienceStance='steady';

export function ringAudienceMessage(value:unknown):string|undefined{
  if(typeof value!=='string'||value.length>RING_AUDIENCE_MESSAGE_LIMIT*2)return undefined;
  const text=value.trim();
  if(!text||Array.from(text).length>RING_AUDIENCE_MESSAGE_LIMIT||/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u.test(text))return undefined;
  return text;
}
/** The classifier recognizes rhetoric only, never actions, beneficiaries, game commands, or names. */
export function ringAudienceTone(message:string):RingAudienceTone{
  if(/必须|不许|强迫|听令|杀了你|否则|威胁|休想违/u.test(message))return 'pressure';
  if(/理解|不必勉强|不必强求|由你自己|敬重|体谅|愿听/u.test(message))return 'empathy';
  if(/道理|理由|权衡|想想|证据|慎思|思量|考虑/u.test(message))return 'reason';
  return 'quiet';
}
export function calculateRingAudienceTurn(aim:RingAudienceAim,role:RingAudienceRole,personality:PersonalityTrait,before:number,
  index:number,tone:RingAudienceTone):Pick<RingAudienceTurn,'after'|'stance'>{
  const adjustment=tone==='reason'?(personality==='刚正'||personality==='诡诈'?22:17):
    tone==='empathy'?(personality==='痴情'||personality==='苟道'?23:19):
      tone==='pressure'?(personality==='狂傲'||personality==='刚正'?-24:personality==='嗜血'?-12:-17):9;
  const attunement=tone==='pressure'?0:aim==='learn_taboo'&&personality==='诡诈'?2:
    aim==='challenge_master'&&personality==='狂傲'?2:role==='heaven'&&tone==='reason'?1:0;
  const after=clamp(before+adjustment+attunement);
  const stance=after>=69&&index>=2?'accepts':tone==='pressure'&&after<=12||index>=RING_AUDIENCE_MAX_TURNS?'rebels':
    after>=43?'wavering':'steady';
  return {after,stance};
}
