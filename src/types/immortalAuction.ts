import type {Artifact,ArtifactTier,SpiritRoot} from './world';
export const IMMORTAL_AUCTION_PILLS=['foundation','golden'] as const;
export type ImmortalAuctionPillId=typeof IMMORTAL_AUCTION_PILLS[number];
export type ImmortalAuctionMove='consign_artifact'|'consign_pill'|'bid'|'withdraw';
export type ImmortalAuctionAsset =
  | {kind:'pill';pillId:ImmortalAuctionPillId}
  | {kind:'artifact';artifactId:string;name:string;tier:Exclude<ArtifactTier,'法器'>;spiritRoot:SpiritRoot;durability:number;maxDurability:number};
export interface ImmortalAuctionBid {
  bidderId:string;tick:number;stones:number;status:'held'|'outbid'|'refunded'|'paid';settledTick?:number;
}
export interface ImmortalAuctionTerminal {
  tick:number;eventId:string;reason:'sold'|'withdrawn'|'no_bid'|'unavailable';buyerId?:string;stones?:number;
}
export interface ImmortalAuctionLot {
  id:string;sellerId:string;listedTick:number;closesTick:number;minimum:number;asset:ImmortalAuctionAsset;
  custody?:Artifact;
  bids:ImmortalAuctionBid[];
  terminal?:ImmortalAuctionTerminal;
  witnessIds?:string[];
  departure?:{tick:number;siteId:string};
}
export interface ImmortalAuctionState {nextId:number;lots:ImmortalAuctionLot[]}
