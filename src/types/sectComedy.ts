import type {SectJobId} from '../engine/sectQuirkCatalog';
import type {ManagementBuildingId,SectQuirkId} from './sectManagement';
import type {SectRecurringRole} from './sectRecurring';
import type {SectChatRoomId} from './sectChat';
import type {HerbId} from './world';

export const COMEDY_ITEM_IDS=['demon-iron-wok','half-stele-rubbing','talking-gourd'] as const;
export const COMEDY_RECRUIT_IDS=['demon-sect-cook','failed-scholar','runaway-princess','retired-assassin'] as const;
export const COMEDY_PET_IDS=['pill-cat','lost-crane','fat-goose'] as const;
export const COMEDY_RELATION_TARGETS=['rival','bloodmoon','host_sect'] as const;
export const COMEDY_MAX_EFFECTS=12;
export const COMEDY_MAX_DELAY=12;
export const COMEDY_PENDING_LIMIT=COMEDY_MAX_EFFECTS*COMEDY_MAX_DELAY;
export type ComedyItemId=typeof COMEDY_ITEM_IDS[number];
export type ComedyRecruitId=typeof COMEDY_RECRUIT_IDS[number];
export type ComedyPetId=typeof COMEDY_PET_IDS[number];
type RelationTarget=typeof COMEDY_RELATION_TARGETS[number];

export type SectComicJobTier='windfall'|'mishap'|'success';
export type SectComedyScope='home'|'away';
export type SectComedyMatch =
  | {readonly phase:'ambient';readonly presence?:SectComedyScope;readonly quirks?:readonly SectQuirkId[]}
  | {readonly phase:'performed';readonly job?:SectJobId;readonly tier:SectComicJobTier;readonly quirks?:readonly SectQuirkId[]}
  | {readonly phase:'on_route'|'unavailable';readonly job?:SectJobId;readonly quirks?:readonly SectQuirkId[]};
export type SectComedyEffect =
  | {readonly kind:'qi'|'stones'|'fame'|'debt';readonly amount:number}
  | {readonly kind:'herb';readonly herb:HerbId;readonly amount:number}
  | {readonly kind:'item'|'item_loss';readonly template:ComedyItemId}
  | {readonly kind:'injury';readonly rate:number}
  | {readonly kind:'kitchen_damage';readonly amount:1}
  | {readonly kind:'building_damage';readonly building:ManagementBuildingId;readonly amount:1}
  | {readonly kind:'sect_relation';readonly target:RelationTarget;readonly amount:number}
  | {readonly kind:'recruit';readonly template:ComedyRecruitId}
  | {readonly kind:'pet';readonly template:ComedyPetId}
  | {readonly kind:'visit';readonly npc:SectRecurringRole;readonly afterMonths:readonly [number,number];readonly reason:string}
  | {readonly kind:'sequel';readonly templateId:string;readonly afterMonths:readonly [number,number]}
  | {readonly kind:'rumor';readonly group:SectChatRoomId;readonly line:string};
export type SectComedyFollowUp =
  | {readonly kind:'visit';readonly npc:SectRecurringRole;readonly dueTick:number}
  | {readonly kind:'sequel';readonly templateId:string;readonly dueTick:number};
export type SectComedyPending=SectComedyFollowUp&{
  readonly originTick:number;readonly originTemplateId:string;readonly effectIndex:number;
  readonly speakerId:string;readonly siteId?:string;
  readonly arrival?:{
    readonly tick:number;readonly visitorId?:string;
    readonly choice?:{readonly id:string;readonly tick:number;readonly effects:readonly SectComicAppliedEffect[]};
  };
};
export interface SectComedyChoiceCommand {readonly id:string;readonly choiceId:string}
export type SectComicAppliedEffect =
  | {readonly kind:'qi'|'stones'|'fame'|'debt'|'injury';readonly amount:number}
  | {readonly kind:'kitchen_damage';readonly amount:-1}
  | {readonly kind:'herb';readonly herb:HerbId;readonly amount:number}
  | {readonly kind:'item'|'item_loss';readonly template:ComedyItemId;readonly itemId:string}
  | {readonly kind:'building_damage';readonly building:ManagementBuildingId;readonly amount:-1}
  | {readonly kind:'sect_relation';readonly targetSectId:string;readonly amount:number}
  | {readonly kind:'recruit';readonly template:ComedyRecruitId;readonly actorId:string}
  | {readonly kind:'pet';readonly template:ComedyPetId;readonly beastId:string}
  | SectComedyFollowUp
  | {readonly kind:'rumor';readonly group:SectChatRoomId};
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
  readonly pending?:readonly SectComedyPending[];
}
