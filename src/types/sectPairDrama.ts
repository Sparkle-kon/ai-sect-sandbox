import type {SectJobId} from '../engine/sectQuirkCatalog';

export const SECT_PAIR_DRAMA_KINDS=['crush','prank','rivalry','blame'] as const;
export type SectPairDramaKind=typeof SECT_PAIR_DRAMA_KINDS[number];
export interface SectPairDramaPlan {
  readonly tick:number;
  readonly pair:readonly [string,string];
  readonly initiatorId:string;
  readonly jobId:SectJobId;
  readonly kind:SectPairDramaKind;
  readonly siteId:string;
}
export interface SectPairDrama extends SectPairDramaPlan {
  readonly sectId:string;
  readonly outcome:'completed'|'aborted';
  readonly affinityChange:number;
}
export const sectPairDramaEventId=(tick:number,sectId:string):string=>`evt-${tick}-${sectId}-pair-drama`;
export const SECT_PAIR_DRAMA_EVENT_TITLE='同门一桩差事';
export const SECT_PAIR_DRAMA_EVENT_DESCRIPTION='晨会后的两份差事记入汇报。';
