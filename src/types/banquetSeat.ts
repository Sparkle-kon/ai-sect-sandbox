export type BanquetSeatMove = 'attend'|'decline'|'late';
export type BanquetSeatOption={action:'BANQUET_SEAT';banquetSeatMove:BanquetSeatMove;targetBanquetSeatId:string};
export interface BanquetSeatChoice {
  actorId:string; move:BanquetSeatMove; tick:number; eventId:string; fromSiteId?:string;
}
export interface BanquetSeatTable {
  id:string; occasionId:string; siteId:string; invitationEventId:string; crownEventId:string;
  invitedTick:number; seatTick:number; finalistIds:[string,string]; choices:BanquetSeatChoice[];
  summary?:{tick:number;eventId:string;presentIds:string[]};
}
export interface BanquetSeatState { tables:BanquetSeatTable[] }
