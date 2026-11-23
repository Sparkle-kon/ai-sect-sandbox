export type AnomalyRelayChannel='witness'|'conversation'|'flying_sword';
export interface AnomalyRelayOrigin {eventId:string;hazardId:string;beastId:string;siteId:string;tileId:string;tick:number}
export interface AnomalyRelayReceipt {
  eventId:string;actorId:string;siteId:string;tick:number;channel:AnomalyRelayChannel;
  confidence:number;hops:number;originalWitnessId:string;senderId?:string;senderSiteId?:string;
}
export interface AnomalyRelayState {origins:AnomalyRelayOrigin[];receipts:AnomalyRelayReceipt[]}
export interface AnomalyRelayScene {siteId:string;siteName:string;tick:number;year:number;month:number;channel:AnomalyRelayChannel}
export interface AnomalyRelayView {scenes:readonly AnomalyRelayScene[];complete:boolean}
