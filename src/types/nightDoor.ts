export type NightDoorMove='identify'|'shelter'|'close'|'escort'|'accept'|'cross';
export type NightDoorOption={action:'NIGHT_DOOR';targetNightDoorId:string}&(
  {nightDoorMove:'escort'|'cross';targetLocationId:string}|
  {nightDoorMove:'identify'|'shelter'|'close'|'accept';targetLocationId?:never});
export interface NightDoorBlock {
  forkId:string;actorId:string;destinationId:string;tick:number;pathIndex:number;hazardId:string;
  hazardTileId:string;hazardCreatedTick:number;hazardExpiresTick:number;
}
export interface NightDoorEncounter {
  id:string;forkId:string;guestId:string;hostId:string;hostHouseholdId:string;villageId:string;siteId:string;
  shelterProjectId:string;arrivalTick:number;arrivalEventId:string;acquaintanceId?:string;acquaintanceEventId?:string;
  identifiedTick?:number;closedTick?:number;
  offer?:{move:'shelter'|'escort';tick:number;refugeId?:string;acceptedTick?:number;expiresTick?:number;crossed?:{actorId:string;tick:number}[]};
}
export interface NightDoorState {blocks:NightDoorBlock[];encounters:NightDoorEncounter[]}
export interface NightDoorView {
  siteName:string;siteId?:string;role:'host'|'guest';uncertain?:true;identifiedGuestName?:string;
  options:readonly NightDoorOption[];receipt?:{title:string;description:string};
}
