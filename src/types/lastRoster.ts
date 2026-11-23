export type LastRosterMove='new_gate'|'home'|'stay';
export type LastRosterOption =
  {action:'LAST_ROSTER';lastRosterMove:'new_gate'|'home';targetLastRosterId:string;targetLocationId:string} |
  {action:'LAST_ROSTER';lastRosterMove:'stay';targetLastRosterId:string};
export interface LastRosterResolution {
  move:LastRosterMove;tick:number;eventId:string;destinationId?:string;
}
export interface LastRosterPerson {
  actorId:string;home?:{settlementId:string;siteId:string;recruitmentId:string};resolution?:LastRosterResolution;
}
export interface LastRosterEntry {
  id:string;foundingId:string;mergeEventId:string;closedTick:number;closedSectId:string;closedLeaderId:string;
  siteId:string;receivingSectId:string;newGateSiteId:string;people:LastRosterPerson[];
}
export interface LastRosterState {entries:LastRosterEntry[]}
