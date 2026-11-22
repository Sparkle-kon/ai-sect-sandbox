import type {UpperArrayFieldProductionState} from './upperArrayFieldLocalTerms';
import type {WorldState} from '../types/world';
import {upperArrayFieldActedOnTrade,type UpperArrayFieldTradeState} from './upperArrayFieldTradeTerms';

export const UPPER_ARRAY_FIELD_REGION='upper-array-field' as const;
export const UPPER_ARRAY_FIELD_CHART='chart-upper-array-field' as const;
export const UPPER_ARRAY_FIELD_COUNCIL='realm-upper-council' as const;
export const UPPER_ARRAY_FIELD_GATE='array-field-gate' as const;
export const UPPER_ARRAY_FIELD_HOME='array-field-home' as const;
export const UPPER_ARRAY_FIELD_ENTRY_STONES=4;
export const UPPER_ARRAY_FIELD_HOME_STONES=4;
export const UPPER_ARRAY_FIELD_HOME_ROOTS=1;
export const UPPER_ARRAY_FIELD_MOVES=['enter','travel','exit','settle'] as const;
export type UpperArrayFieldMove=typeof UPPER_ARRAY_FIELD_MOVES[number];
export const UPPER_ARRAY_FIELD_SITE_IDS=[
  UPPER_ARRAY_FIELD_GATE,'array-field-path',UPPER_ARRAY_FIELD_HOME,'array-field-source','array-field-practice','array-field-exchange',
] as const;
export type UpperArrayFieldSiteId=typeof UPPER_ARRAY_FIELD_SITE_IDS[number];
export interface UpperArrayFieldSite {
  id:UpperArrayFieldSiteId;chartId:typeof UPPER_ARRAY_FIELD_CHART;regionId:typeof UPPER_ARRAY_FIELD_REGION;
  col:0|1|2;row:0|1|2;name:string;role:'gate'|'path'|'home'|'source'|'practice'|'exchange';
}
const address={chartId:UPPER_ARRAY_FIELD_CHART,regionId:UPPER_ARRAY_FIELD_REGION};
export const UPPER_ARRAY_FIELD_SITES:readonly UpperArrayFieldSite[]=[
  {...address,id:UPPER_ARRAY_FIELD_GATE,col:0,row:1,name:'阵原门',role:'gate'},
  {...address,id:'array-field-path',col:1,row:1,name:'承阵径',role:'path'},
  {...address,id:UPPER_ARRAY_FIELD_HOME,col:2,row:1,name:'结庐台',role:'home'},
  {...address,id:'array-field-source',col:1,row:0,name:'凝纹墩',role:'source'},
  {...address,id:'array-field-practice',col:2,row:0,name:'晨修阵',role:'practice'},
  {...address,id:'array-field-exchange',col:1,row:2,name:'互印垛',role:'exchange'},
];
export const UPPER_ARRAY_FIELD_EDGES=[
 [UPPER_ARRAY_FIELD_GATE,'array-field-path'],['array-field-path',UPPER_ARRAY_FIELD_HOME],
 ['array-field-path','array-field-source'],['array-field-path','array-field-exchange'],
 ['array-field-source','array-field-practice'],['array-field-practice',UPPER_ARRAY_FIELD_HOME],
] as const satisfies readonly (readonly [UpperArrayFieldSiteId,UpperArrayFieldSiteId])[];
export const upperArrayFieldSite=(id:string):UpperArrayFieldSite|undefined=>UPPER_ARRAY_FIELD_SITES.find(row=>row.id===id);
export const upperArrayFieldEdge=(a:string,b:string):boolean=>UPPER_ARRAY_FIELD_EDGES.some(([c,d])=>a===c&&b===d||a===d&&b===c);
export interface UpperArrayFieldVisit {
  id:string;actorId:string;journeyId:string;enteredTick:number;paidStones:4;
  steps:{tick:number;siteId:UpperArrayFieldSiteId}[];exitedTick?:number;deceasedTick?:number;
}
export interface UpperArrayFieldResidence {
  id:string;actorId:string;visitId:string;homeSiteId:typeof UPPER_ARRAY_FIELD_HOME;settledTick:number;paidStones:4;paidRoots:1;
}
export interface UpperArrayFieldState {
  version:1;visits:UpperArrayFieldVisit[];residences:UpperArrayFieldResidence[];
  production?:UpperArrayFieldProductionState;trade?:UpperArrayFieldTradeState;
}
export type UpperArrayFieldMovementOption={action:'UPPER_ARRAY_FIELD'}&(
  {upperArrayFieldMove:Exclude<UpperArrayFieldMove,'exit'>;targetUpperArrayFieldSiteId:UpperArrayFieldSiteId}|
  {upperArrayFieldMove:'exit';targetUpperArrayFieldSiteId:typeof UPPER_ARRAY_FIELD_COUNCIL}
);
export const upperArrayFieldVisitId=(tick:number,actorId:string)=>`upper-array-field-visit-${tick}-${actorId}`;
export const upperArrayFieldResidenceId=(tick:number,actorId:string)=>`upper-array-field-home-${tick}-${actorId}`;
export const upperArrayFieldMovementEventId=(ref:string,move:UpperArrayFieldMove,tick:number)=>`evt-upper-array-field-move-${ref}-${move}-${tick}`;
export function latestUpperArrayFieldVisit(state:UpperArrayFieldState|undefined,actorId:string):UpperArrayFieldVisit|undefined{
  const visits=state?.visits;
  if(visits)for(let i=visits.length-1;i>=0;i--)if(visits[i].actorId===actorId)return visits[i];
  return undefined;
}
export function upperArrayFieldCouncilOffset(state:UpperArrayFieldState|undefined,actorId:string,journeyId:string,siteId:string):UpperArrayFieldVisit|undefined{
  const visit=latestUpperArrayFieldVisit(state,actorId);
  return visit?.journeyId===journeyId&&visit.exitedTick===undefined&&
    visit.steps.at(-1)?.siteId===siteId&&upperArrayFieldSite(siteId)?visit:undefined;
}
export const isUpperArrayFieldCouncilEvent=(id:string)=>id.startsWith('evt-upper-array-field-move-');
export const isUpperArrayFieldEventId=(id:string)=>isUpperArrayFieldCouncilEvent(id)||
  id.startsWith('evt-array-field-local-')||id.startsWith('evt-upper-array-field-trade-');
export function upperArrayFieldActedOutsideGeography(world:WorldState,actorId:string,tick:number):boolean{
  return (world.upperArrayField?.production?.receipts.some(row=>row.actorId===actorId&&row.tick===tick)??false)||
    upperArrayFieldActedOnTrade(world,actorId,tick);
}
