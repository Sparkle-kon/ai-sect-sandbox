import type {SectJobId} from '../engine/sectQuirkCatalog';
import type {HerbId,LLMDecisionPayload,MapPoint} from './world';

export interface SectJobAssignment {readonly discipleId:string;readonly jobId:SectJobId}
export interface SectJobDefinition {readonly id:SectJobId;readonly label:string;readonly intent:string}
export type SectJobPhase='performed'|'on_route'|'unavailable';
export type SectErrandJob='explore'|'stall'|'deliver'|'recruit'|'challenge'|'matchmaking';
export const SECT_ERRAND_OUTCOMES=['completed','refused','road_mishap','road_disaster','contest_lost'] as const;
export type SectErrandOutcome=typeof SECT_ERRAND_OUTCOMES[number];
interface SectErrandRoute {
  readonly fromId:string;readonly homeId:string;readonly turnAt:number;readonly path:readonly MapPoint[];
}
export interface SectErrandPlan extends SectErrandRoute {
  readonly kind:'errand';readonly phase:'performed';readonly job:SectErrandJob;readonly siteId:string;readonly decision:LLMDecisionPayload;
}
export interface SectErrandResult extends SectErrandRoute {readonly outcome:SectErrandOutcome}
export type SectJobPlan =
  | SectErrandPlan
  | {readonly kind:'native';readonly phase:'performed'|'on_route';readonly decision:LLMDecisionPayload;readonly siteId?:string}
  | {readonly kind:'chore';readonly phase:'performed';readonly chore:'kitchen'|'guard'|'festival-debt';readonly decision:LLMDecisionPayload;readonly siteId:string}
  | {readonly kind:'blocked';readonly reason:string};
export interface SectJobEvidence {
  readonly tick:number;readonly discipleId:string;readonly siteId:string;readonly qi:number;
  readonly herbs:Readonly<Record<HerbId,number>>;
  readonly siteHerbs?:Readonly<Record<HerbId,number>>;
  readonly contribution:number;
}
export interface SectJobObservation extends SectJobAssignment {
  readonly tick:number;readonly phase:SectJobPhase;readonly line:string;readonly siteId?:string;readonly sourceEventId?:string;
  readonly errand?:SectErrandResult;
  readonly nativeEffects?:readonly SectJobReportEffect[];
}

export const SECT_JOB_TIERS=['success','windfall','mishap','disaster'] as const;
export type SectJobTier=typeof SECT_JOB_TIERS[number];
export type SectJobReportEffect =
  | {readonly kind:'qi'|'hp'|'contribution';readonly amount:number;readonly stage:'native'|'follow_up'}
  | {readonly kind:'herb';readonly herbId:HerbId;readonly amount:number;readonly stage:'native'};

export interface SectJobReportRow extends SectJobAssignment {
  readonly phase:SectJobPhase;
  readonly tier?:SectJobTier;
  readonly siteId?:string;
  readonly sourceEventId?:string;
  readonly errand?:SectErrandResult;
  readonly effects:readonly SectJobReportEffect[];
}

export interface SectJobReport {
  readonly openedTick:number;
  readonly settledTick:number;
  readonly sectId:string;
  readonly leaderId:string;
  readonly rows:readonly SectJobReportRow[];
}
