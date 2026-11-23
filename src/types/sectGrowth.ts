import type {ManagementBuildingId} from './sectManagement';

export const SECT_RATINGS=['不入流','九品','八品','七品','六品','五品','四品','三品','二品','一品','天下名门'] as const;
export type SectRating=typeof SECT_RATINGS[number];

export const SECT_FAILURE_REASONS=['bankruptcy','disciples_gone','leader_lost'] as const;
export type SectFailureReason=typeof SECT_FAILURE_REASONS[number];

export interface SectGrowthMonth {
  readonly tick:number;
  readonly treasury:number;
  readonly overduePrincipal:number;
  readonly closingNet:number;
  readonly livingDisciples:number;
  readonly negativeMonths:number;
}
export interface SectAnnualReview {
  readonly tick:number;
  readonly year:number;
  readonly previousRating:SectRating;
  readonly rating:SectRating;
  readonly score:number;
  readonly stipend:number;
}
export interface SectGrowthFailure {
  readonly tick:number;
  readonly reason:SectFailureReason;
}
export interface SectGrowthState {
  readonly closing:SectGrowthMonth;
  readonly review?:SectAnnualReview;
  readonly failure?:SectGrowthFailure;
}
export type SectGrowthCommand=
  | {readonly kind:'upgrade';readonly building:ManagementBuildingId}
  | {readonly kind:'repay';readonly amount?:number};
