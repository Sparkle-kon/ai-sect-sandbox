import type {ImmortalAuctionAsset,ImmortalAuctionLot} from '../types/immortalAuction';

export const IMMORTAL_AUCTION_SITE='loc-market';
export const IMMORTAL_AUCTION_PERIOD=12;
export const IMMORTAL_AUCTION_DURATION=2;
export const IMMORTAL_AUCTION_BID_STEP=10;
export const IMMORTAL_AUCTION_MAX_BID=100_000;
export const IMMORTAL_AUCTION_MAX_BIDS=24;
export const IMMORTAL_AUCTION_WINDOW_LOTS=8;
export const IMMORTAL_AUCTION_HISTORY=48;
export const IMMORTAL_AUCTION_AMBUSH_TICKS=6;
export const immortalAuctionOpening=(tick:number):boolean=>Number.isSafeInteger(tick)&&tick>=1&&(tick-1)%IMMORTAL_AUCTION_PERIOD===0;
export const immortalAuctionEventId=(tick:number,id:string,move:string,actorId?:string)=>
  `evt-${tick}-${id}-${move}${actorId?'-'+actorId:''}`;
export const immortalAuctionMinimum=(asset:ImmortalAuctionAsset):number=>asset.kind==='pill'?
  asset.pillId==='foundation'?55:145:asset.tier==='灵器'?120:asset.tier==='法宝'?240:420;
export const immortalAuctionHighBid=(lot:ImmortalAuctionLot)=>lot.bids.at(-1)?.status==='held'?lot.bids.at(-1):undefined;
export const immortalAuctionNextBid=(lot:ImmortalAuctionLot):number=>{
  const high=immortalAuctionHighBid(lot);
  return high?high.stones+IMMORTAL_AUCTION_BID_STEP:lot.minimum;
};
