import type {Technique} from './world';
export type PavilionFireMove='salvage'|'ward'|'leave'|'secure';

export interface PavilionFireCase {
  id:string;siteId:string;sectId:string;tileId:string;hazardId:string;sourceEventId:string;openedTick:number;heatTick:number;
  scrollId:string;scrollStatus:'shelved'|'carried'|'secured'|'lost';
  copy?:Technique;carrierId?:string;safeSiteId?:string;carriedTick?:number;securedTick?:number;lostTick?:number;
  ward?:{actorId:string;targetId:string;tick:number};
  heat?:{tick:number;damage:{cultivatorId:string;amount:number}[];wardSaved?:number};
}
export interface PavilionFireState {cases:PavilionFireCase[]}
export type PavilionFireOption={action:'PAVILION_FIRE';targetPavilionFireId:string}&(
  {pavilionFireMove:'salvage'|'leave';targetLocationId:string;targetCultivatorId?:never}|
  {pavilionFireMove:'ward';targetCultivatorId:string;targetLocationId?:never}|
  {pavilionFireMove:'secure';targetLocationId?:never;targetCultivatorId?:never}
);
export interface PavilionFireView {
  siteName:string;options:readonly PavilionFireOption[];receipt?:{title:string;description:string};
}

export const PAVILION_FIRE_SECURE_RECEIPT={title:'救出的一卷已安置',
  description:'携出的人在安全处安置了这一卷；不增抄本，不动原本记录。'} as const;
export const pavilionFireActionId=(tick:number,id:string,actorId:string,move:string)=>`evt-${tick}-${id}-${actorId}-${move}`;
