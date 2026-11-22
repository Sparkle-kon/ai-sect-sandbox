import type {CultivationRealm,MarketGood} from './world';

export type MarketFreightMove='offer'|'accept'|'decline'|'withdraw';
export type MarketFreightBand='light'|'medium'|'heavy';
export interface MarketFreightQuote {
  good:MarketGood; quantity:number; load:number; band:MarketFreightBand; fee:number; rations:number;
}
export interface MarketFreightTerms extends MarketFreightQuote {
  carrierId:string; buyOrderId:string; sellOrderId:string; buyerId:string;
  unitPrice:number; departedTick:number;
  capability?:{realm:CultivationRealm;stage:number;capacity:number};
  dispatchByTick?:number;
  dispatch?:{tick:number;fromTileId:string;toTileId:string;pathIndex:number};
  closedBy?:'declined'|'withdrawn'|'expired'|'incapable'|'shipment_ended';
}
export type MarketFreightOption={action:'MARKET_FREIGHT'}&(
  | {marketFreightMove:'offer';targetShipmentId:string;targetCultivatorId:string;targetEscortId?:never}
  | {marketFreightMove:Exclude<MarketFreightMove,'offer'>;targetEscortId:string;targetShipmentId?:never;targetCultivatorId?:never}
);
