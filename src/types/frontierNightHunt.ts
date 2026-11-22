import type {QiWeatherKind} from '../engine/weatherEngine';
import type {FrontierSiteId} from '../engine/frontierTerms';

export type FrontierNightHuntMove='trace'|'wait'|'return';
export type FrontierNightHuntOutcome='found'|'obscured'|'quiet'|'contact';
export const FRONTIER_NIGHT_HUNT_SITE='frontier-north-lee-mid' as const;
export const FRONTIER_NIGHT_HUNT_BEAST='frontier-north-snow-fox' as const;
export const FRONTIER_NIGHT_HUNT_BEAST_HP=60;
export const FRONTIER_NIGHT_HUNT_HISTORY=96;
export const FRONTIER_NIGHT_HUNT_TRACE_QI=2;

export interface FrontierNightHuntTrace {
  actorId:string;
  visitId:string;
  tick:number;
  siteId:typeof FRONTIER_NIGHT_HUNT_SITE;
  weatherKind:QiWeatherKind;
  intensity:number;
  found:boolean;
}

export interface FrontierNightHuntReceipt {
  actorId:string;
  visitId:string;
  tick:number;
  siteId:typeof FRONTIER_NIGHT_HUNT_SITE;
  move:'trace'|'wait';
  outcome:FrontierNightHuntOutcome;
  paidQi:number;
  damage:number;
  beastDamage:number;
  traceTick?:number;
}

export interface FrontierNightHuntState {
  beast:{id:typeof FRONTIER_NIGHT_HUNT_BEAST;siteId:typeof FRONTIER_NIGHT_HUNT_SITE;
    introducedTick:number;hp:number;alive:boolean};
  traces:FrontierNightHuntTrace[];
  receipts:FrontierNightHuntReceipt[];
}

export type FrontierNightHuntOption={action:'FRONTIER_NIGHT_HUNT'}&(
  {frontierNightHuntMove:'trace'|'wait';targetFrontierSiteId:typeof FRONTIER_NIGHT_HUNT_SITE}|
  {frontierNightHuntMove:'return';targetFrontierSiteId:FrontierSiteId|'loc-vein-north'}
);

export interface FrontierNightHuntView {
  siteId:FrontierSiteId;
  weather:{kind:QiWeatherKind;intensity:number};
  options:readonly FrontierNightHuntOption[];
  last?:Pick<FrontierNightHuntReceipt,'move'|'outcome'|'tick'|'paidQi'|'damage'|'beastDamage'>;
  observed?:{kind:'妖兽';siteId:typeof FRONTIER_NIGHT_HUNT_SITE;alive:boolean};
}
