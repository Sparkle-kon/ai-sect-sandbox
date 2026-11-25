import type { SectChallengeState } from './sectChallenge';
import type { SectLiveState } from './sectLive';
import type { SectMomentsState } from './sectMoments';
import type { SectPlayerChatState } from './sectPlayerChat';
import type { SectChatState } from './sectChat';
import type { SectPairDrama } from './sectPairDrama';
import type { SectRecurringState } from './sectRecurring';
import type { SectComedyState } from './sectComedy';
import type { SectGrowthState } from './sectGrowth';
import type { SectJobReport } from './sectJobs';
export const STARTER_SECT_IDS = ['qingyun-odd-jobs','drunken-sword-hermitage'] as const;
export type StarterSectId = typeof STARTER_SECT_IDS[number];
export type StarterDraw = 0|1;

export const SECT_QUIRK_IDS = ['glutton','lost','shy','chatterbox','miser','drama','contrarian','lovestruck',
  'jinx','neat_freak','chuunibyou','coward_king'] as const;
export type SectQuirkId = typeof SECT_QUIRK_IDS[number];
export const SECT_QUIRK_NAMES:Readonly<Record<SectQuirkId,string>> = {
  glutton:'吃货',lost:'路痴',shy:'怕生',chatterbox:'话痨',miser:'财迷',drama:'爱演',contrarian:'抬杠',
  lovestruck:'多情',jinx:'乌鸦嘴',neat_freak:'净过头',chuunibyou:'中二剑客',coward_king:'苟王',
};

export const MANAGEMENT_BUILDING_IDS = ['hall','kitchen','furnace','trainingGround','gate','library'] as const;
export type ManagementBuildingId = typeof MANAGEMENT_BUILDING_IDS[number];
export type ManagementBuildings = Record<ManagementBuildingId,number>;

export interface ManagementDebt {
  readonly creditorId:string;
  principal:number;
  readonly dueTick:number;
  readonly comedyAdjustedTick?:number;
}

export interface SectManagementState {
  readonly version:1;
  readonly starterId:StarterSectId;
  readonly sectId:string;
  readonly leaderId:string;
  readonly homeSiteId:string;
  readonly foundedTick:number;
  readonly draw:StarterDraw;
  readonly foundingDiscipleIds:string[];
  buildings:ManagementBuildings;
  debt?:ManagementDebt;
  latestReport?:SectJobReport;
  growth?:SectGrowthState;
  comedy?:SectComedyState;
  recurring?:SectRecurringState;
  pairDrama?:SectPairDrama;
  chat?:SectChatState;
  playerChat?:SectPlayerChatState;
  moments?:SectMomentsState;
  live?:SectLiveState;
  challenges?:SectChallengeState;
}

/** Stable genesis namespace; a new draw is a new lineage, not a changed live roster. */
export function starterSectIdentity(seed:number,starterId:StarterSectId,draw:StarterDraw) {
  const base=`starter-${seed.toString(36)}-${starterId}-${draw}`;
  return {
    sectId:`${base}-sect`,homeSiteId:`${base}-hq`,leaderId:`${base}-leader`,creditorId:`${base}-wang`,
    foundingDiscipleIds:Array.from({length:starterId==='qingyun-odd-jobs'?3:4},(_,index)=>`${base}-disciple-${index+1}`),
  };
}
