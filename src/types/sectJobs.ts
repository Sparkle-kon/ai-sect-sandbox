import type {SectJobId} from '../engine/sectQuirkCatalog';
import type {HerbId,LLMDecisionPayload} from './world';

export interface SectJobAssignment {readonly discipleId:string;readonly jobId:SectJobId}
export interface SectJobDefinition {readonly id:SectJobId;readonly label:string;readonly intent:string}
export type SectJobPhase='performed'|'on_route'|'unavailable';
export type SectJobPlan =
  | {readonly kind:'native';readonly phase:'performed'|'on_route';readonly decision:LLMDecisionPayload;readonly siteId?:string}
  | {readonly kind:'chore';readonly phase:'performed';readonly chore:'kitchen'|'guard';readonly decision:LLMDecisionPayload;readonly siteId:string}
  | {readonly kind:'blocked';readonly reason:string};
export interface SectJobEvidence {
  readonly tick:number;readonly discipleId:string;readonly siteId:string;readonly qi:number;
  readonly herbs:Readonly<Record<HerbId,number>>;
}
export interface SectJobObservation extends SectJobAssignment {
  readonly tick:number;readonly phase:SectJobPhase;readonly line:string;readonly siteId?:string;readonly sourceEventId?:string;
}
