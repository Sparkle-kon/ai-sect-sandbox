import type {SectJobId} from '../engine/sectQuirkCatalog';
import type {SectQuirkId} from './sectManagement';

export type SectComicJobTier='windfall'|'mishap'|'success';
export type SectComedyScope='home'|'away';
export type SectComedyMatch =
  | {readonly phase:'ambient';readonly presence?:SectComedyScope;readonly quirks?:readonly SectQuirkId[]}
  | {readonly phase:'performed';readonly job?:SectJobId;readonly tier:SectComicJobTier;readonly quirks?:readonly SectQuirkId[]}
  | {readonly phase:'on_route'|'unavailable';readonly job?:SectJobId;readonly quirks?:readonly SectQuirkId[]};
export type SectComedyEffect =
  | {readonly kind:'qi';readonly amount:-2|-1|1|2}
  | {readonly kind:'kitchen_damage';readonly amount:1};
export type SectComicAppliedEffect =
  | {readonly kind:'qi';readonly amount:number}
  | {readonly kind:'kitchen_damage';readonly amount:-1};
export interface SectComedyTemplate {
  readonly id:string;
  readonly match:SectComedyMatch;
  readonly report:string;
  readonly quote:string;
  readonly effects:readonly SectComedyEffect[];
  readonly chatHook?:{readonly group:'own'|'jiuzhou'|'market'|'leaders';readonly line:string};
  readonly animation?:'sweat'|'black_line'|'sparkle'|'smoke';
}
export type SectComicSource =
  | {readonly phase:'ambient';readonly presence:SectComedyScope}
  | {readonly phase:'performed';readonly jobId:SectJobId;readonly tier:SectComicJobTier;readonly reportEventId?:string}
  | {readonly phase:'on_route'|'unavailable';readonly jobId:SectJobId;readonly reportEventId?:string};
export interface SectComicMoment {
  readonly tick:number;
  readonly templateId:string;
  readonly speakerId:string;
  readonly siteId?:string;
  readonly source:SectComicSource;
  readonly effects:readonly SectComicAppliedEffect[];
}
export interface SectComedyState {
  readonly moments:readonly SectComicMoment[];
}
