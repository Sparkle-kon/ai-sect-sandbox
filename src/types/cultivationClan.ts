import type {FictionalGender,SpiritRoot} from './world';
export const CLAN_MOVES=['propose','accept','refuse','ceremony_offer','ceremony','family_offer','family_accept','family_refuse'] as const;
export type ClanMove=typeof CLAN_MOVES[number];
export const CLAN_INNATE_TRAITS=['clear_meridians','steadfast_vessel','keen_insight'] as const;
export type ClanInnateTrait=typeof CLAN_INNATE_TRAITS[number];
export interface ClanFamilyPlan {
  offeredBy:string;offeredTick:number;
  status:'offered'|'declined'|'expecting'|'born'|'lost';
  acceptedBy?:string;acceptedTick?:number;earnedTicks:number[];closedTick?:number;childId?:string;
}
export interface CultivationUnion {
  id:string;clanId:string;ancestorClanIds?:string[];
  parents:[string,string];siteId:string;proposedTick:number;
  status:'proposed'|'accepted'|'bonded'|'refused'|'expired';
  acceptedTick?:number;closedTick?:number;
  ceremonyOffer?:{actorId:string;tick:number};
  ceremony?:{actorId:string;tick:number;qiPaidEach:8};
  plan?:ClanFamilyPlan;
}
export type ClanRoots=[SpiritRoot]|[SpiritRoot,SpiritRoot];
export interface CultivationClanChild {
  id:string;clanId:string;unionId:string;parentIds:[string,string];siteId:string;
  birthTick:number;maturesAtTick:number;name:string;gender:FictionalGender;
  parentRoots:[SpiritRoot,SpiritRoot];roots:ClanRoots;innateTrait:ClanInnateTrait;
  maturedTick?:number;
}
export interface CultivationClanHeritage {
  childId:string;clanId:string;roots:ClanRoots;innateTrait:ClanInnateTrait;
}
export interface CultivationClanState {nextId:number;unions:CultivationUnion[];children:CultivationClanChild[]}
