export const DAO_PATH_IDS=['sword','alchemy','formation','shadow','body'] as const;
export type DaoPathId=typeof DAO_PATH_IDS[number];
export type DaoPathMove='choose'|'practice'|'ready'|'cancel';
export type DaoPathRank=1|2|3;
export interface DaoPathPractice {
  tick:number;
  siteId:string;
  qiPaid:number;
  herbPaid?:'earth_root'|'jade_leaf'|'shadow_moss';
  stonesPaid?:number;
  hpPaid?:number;
  artifactId?:string;
  durabilityGain?:number;
}
export interface DaoPathReady {tick:number;siteId:string;artifactId?:string}
export interface DaoIntentActivation {
  actorId:string;
  pathId:DaoPathId;
  rank:DaoPathRank;
  tick:number;
  readyTick:number;
  readySiteId:string;
  siteId:string;
  eventId:string;
  qiPaid:12;
  artifactId?:string;
}
export interface DaoPathState {
  pathId:DaoPathId;
  chosenTick:number;
  chosenSiteId:string;
  lastActedTick:number;
  bladeId?:string;
  practices:DaoPathPractice[];
  ready?:DaoPathReady;
  activations:DaoIntentActivation[];
}
