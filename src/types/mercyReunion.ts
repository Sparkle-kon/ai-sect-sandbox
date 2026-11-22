export type MercyReunionMove='stand_down'|'aid'|'accept_aid'|'challenge';
export interface MercyReunionCase {
  id:string;victorId:string;sparedId:string;siteId:string;sparedTick:number;sourceEventId:string;
  hpBefore:number;lethalDamage:number;appliedDamage:number;
  departure?:{actorId:string;fromSiteId:string;toSiteId:string;tick:number};
  reunion?:{actorId:string;siteId:string;tick:number};
  aid?:{offeredTick:number;proposerId:string;targetId:string;destinationId:string;acceptedTick?:number};
  outcome?:{move:'stand_down'|'aid'|'challenge';actorId:string;tick:number;sourceEventId:string};
}
export interface MercyReunionState {cases:MercyReunionCase[]}
export type MercyReunionOption={action:'MERCY_REUNION';targetMercyReunionId:string}&(
  {mercyReunionMove:'aid';targetLocationId:string}|
  {mercyReunionMove:Exclude<MercyReunionMove,'aid'>;targetLocationId?:never});
export interface MercyReunionView {
  siteName:string;otherName:string;options:readonly MercyReunionOption[];receipt?:{title:string;description:string};
}
