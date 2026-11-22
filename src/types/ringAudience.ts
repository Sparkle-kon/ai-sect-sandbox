import type {PersonalityTrait} from './world';
export const RING_AUDIENCE_AIMS=['leave_sect','learn_taboo','challenge_master'] as const;
export type RingAudienceAim=typeof RING_AUDIENCE_AIMS[number];
export type RingAudienceRole='ring'|'heaven';
export type RingAudienceTone='reason'|'empathy'|'pressure'|'quiet';
export type RingAudienceStance='steady'|'wavering'|'accepts'|'rebels';
export type RingAudienceStatus='open'|'sealed'|'declined'|'closed'|'executed'|'expired';
export interface RingAudienceTurn { index:number;tick:number;message:string;reply:string;source:'utility'|'llm';tone:RingAudienceTone;before:number;after:number;stance:RingAudienceStance;cost:number }
export interface RingAudienceSession {
 id:string;role:RingAudienceRole;targetId:string;aim:RingAudienceAim;openedTick:number;openingSectId:string;leaderId?:string;
 personalityAtOpening:PersonalityTrait;initialWavering:number;wavering:number;stance:RingAudienceStance;status:RingAudienceStatus;turns:RingAudienceTurn[];
 sealedTick?:number;closedTick?:number;execution?:{tick:number;effect:'left'|'learned'|'confronted';eventId:string};
}
export interface RingAudienceState {nextId:number;sessions:RingAudienceSession[]}
