import { describe,expect,it } from 'vitest';
import { eligibleAuctionAmbush } from "../src/engine/immortalAuctionEngine";
import { decodeEraWorldSave,encodeEraWorldSave } from '../src/engine/storageEngine';
import {
  actualAuctionBid,actualAuctionListed,actualAuctionSold,actualNativeAuctionPill,auctionActor,auctionBid,auctionBidder,
  auctionConsign,auctionConsignPill,auctionLot,auctionNativeItem,auctionPillSeller,auctionRival,auctionSeller,
  auctionSite,auctionStart,auctionTurn,auctionWithdraw,
} from './immortalAuctionNativeFixture';
import type { WorldState } from '../src/types/world';

function strict(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}
const stones=(world:WorldState,actorId:string)=>auctionActor(world,actorId).spiritStones;
const original=(world:WorldState,actorId:string)=>auctionActor(world,actorId).artifacts.find(item=>item.id===auctionNativeItem);

describe('native immortal auction',()=>{
  it('escrows one real artifact and two real bids, returns the previous full bid and gives the winner that same original',()=>{
    const {before,listed,lot,bid,sold}=actualAuctionSold();
    const originalItem=original(before,auctionSeller);
    expect(originalItem?.boundTo).toBeUndefined();
    expect(original(listed,auctionSeller)).toBeUndefined();
    expect(lot.custody).toEqual(originalItem);
    expect(lot.bids).toEqual([]);
    expect(stones(listed,auctionSeller)).toBe(stones(before,auctionSeller));
    const low=auctionLot(bid);
    expect(low.bids).toEqual([{bidderId:auctionRival,tick:auctionStart+1,stones:120,status:'held'}]);
    expect(stones(bid,auctionRival)).toBe(stones(listed,auctionRival)-120);
    expect(stones(bid,auctionSeller)).toBe(stones(listed,auctionSeller));
    expect(original(bid,auctionRival)).toBeUndefined();
    const closed=auctionLot(sold);
    expect(closed.bids).toEqual([
      {bidderId:auctionRival,tick:auctionStart+1,stones:120,status:'outbid',settledTick:auctionStart+2},
      {bidderId:auctionBidder,tick:auctionStart+2,stones:130,status:'paid',settledTick:auctionStart+2},
    ]);
    expect(closed.terminal).toMatchObject({reason:'sold',buyerId:auctionBidder,stones:130,tick:auctionStart+2});
    expect(sold.events.find(event=>event.id===closed.terminal?.eventId)).toMatchObject({locationId:auctionSite,tick:sold.tick,witnessScope:'participants'});
    expect(closed.custody).toBeUndefined();
    expect(original(sold,auctionBidder)).toEqual(originalItem);
    expect(original(sold,auctionSeller)).toBeUndefined();
    expect(stones(sold,auctionRival)).toBe(stones(listed,auctionRival));
    expect(stones(sold,auctionBidder)).toBe(stones(bid,auctionBidder)-130);
    expect(stones(sold,auctionSeller)).toBe(stones(bid,auctionSeller)+130);
    const reread=strict(bid);
    expect(encodeEraWorldSave(auctionTurn(reread,{[auctionBidder]:auctionBid(lot.id,130,1)})))
      .toBe(encodeEraWorldSave(sold));
    const stale=auctionTurn(strict(sold),{[auctionRival]:auctionBid(lot.id,140)});
    expect(auctionLot(stale)).toEqual(closed);
    expect(stones(stale,auctionRival)).toBe(stones(sold,auctionRival));
  });

  it('rejects self, arbitrary undercut and stale bids and returns an honest unsold original exactly once',()=>{
    const {before,listed,lot}=actualAuctionListed();
    const self=auctionTurn(listed,{[auctionSeller]:auctionBid(lot.id,120),[auctionBidder]:auctionBid(lot.id,119)});
    expect(auctionLot(self).bids).toEqual([]);
    expect(stones(self,auctionBidder)).toBe(stones(listed,auctionBidder));
    expect(stones(self,auctionSeller)).toBe(stones(listed,auctionSeller));
    const exhausted=auctionTurn(self);
    expect(auctionLot(exhausted).terminal).toMatchObject({reason:'no_bid',tick:auctionStart+2});
    expect(original(exhausted,auctionSeller)).toEqual(original(before,auctionSeller));
    const withdrawn=auctionTurn(listed,{[auctionSeller]:auctionWithdraw(lot.id)});
    expect(auctionLot(withdrawn).terminal).toMatchObject({reason:'withdrawn',tick:auctionStart+1});
    expect(original(withdrawn,auctionSeller)).toEqual(original(before,auctionSeller));
    const stale=auctionTurn(strict(withdrawn),{[auctionSeller]:auctionWithdraw(lot.id)});
    expect(auctionActor(stale,auctionSeller).artifacts.filter(item=>item.id===auctionNativeItem)).toHaveLength(1);
    expect(auctionLot(stale)).toEqual(auctionLot(withdrawn));
    const leading=actualAuctionBid();
    const protectedAuction=auctionTurn(leading.bid,{[auctionSeller]:auctionWithdraw(leading.lot.id)});
    expect(auctionLot(protectedAuction).terminal).toMatchObject({reason:'sold',buyerId:auctionRival,stones:120});
    expect(original(protectedAuction,auctionRival)).toEqual(original(before,auctionSeller));
    const wrongMonth=auctionTurn(before);
    const noListing=auctionTurn(wrongMonth,{[auctionSeller]:auctionConsign});
    expect(noListing.immortalAuction?.lots??[]).toEqual([]);
    expect(original(noListing,auctionSeller)).toEqual(original(before,auctionSeller));
  });

  it('moves an actually brewed premium pill through the independent paid native pill lot',()=>{
    const before=actualNativeAuctionPill();
    const listed=auctionTurn(before,{[auctionPillSeller]:auctionConsignPill});
    const lot=listed.immortalAuction?.lots.find(row=>row.sellerId===auctionPillSeller);
    expect(lot).toMatchObject({asset:{kind:'pill',pillId:'foundation'},minimum:55,listedTick:auctionStart});
    const placed=auctionTurn(listed,{[auctionBidder]:auctionBid(lot!.id,55)});
    const sold=auctionTurn(strict(placed));
    expect(sold.immortalAuction?.lots.find(row=>row.id===lot!.id)?.terminal)
      .toMatchObject({reason:'sold',buyerId:auctionBidder,stones:55,tick:auctionStart+2});
    expect(auctionActor(before,auctionPillSeller).pills.foundation).toBe(1);
    expect(auctionActor(listed,auctionPillSeller).pills.foundation).toBe(0);
    expect(auctionActor(sold,auctionBidder).pills.foundation).toBe(1);
    expect(stones(sold,auctionPillSeller)).toBe(stones(placed,auctionPillSeller)+55);
    expect(stones(sold,auctionBidder)).toBe(stones(listed,auctionBidder)-55);
    strict(sold);
  });
});

it('licenses a witnessed dangerous road encounter only after the real award walks out of the market',()=>{
  const {sold,lot}=actualAuctionSold();
  expect(eligibleAuctionAmbush(sold,auctionActor(sold,auctionRival))).toBeUndefined();
  expect(auctionLot(sold).departure).toBeUndefined();
  const shelter='loc-danxia';
  const depart={chosenAction:'EXPLORE',targetLocationId:shelter,innerMonologue:'循地图中的路离开万仙坊市。'} as const;
  const unseen='elder-blood-1';
  expect(auctionActor(sold,unseen).locationId).not.toBe(auctionSite);
  expect(auctionLot(sold).witnessIds).toContain(auctionRival);
  expect(auctionLot(sold).witnessIds).not.toContain(unseen);
  const separated=auctionTurn(sold,{[auctionBidder]:depart,[unseen]:{...depart,targetLocationId:auctionSite}},.95);
  expect(auctionActor(separated,auctionBidder).locationId).toBe(shelter);
  expect(auctionLot(separated).departure).toEqual({tick:separated.tick,siteId:shelter});
  expect(original(separated,auctionBidder)).toEqual(original(sold,auctionBidder));
  expect(eligibleAuctionAmbush(separated,auctionActor(separated,auctionRival))).toBeUndefined();
  expect(auctionActor(separated,unseen).locationId).toBe(auctionSite);
  const sameRoad=auctionTurn(separated,{[auctionRival]:depart,[unseen]:depart},.95);
  expect(auctionActor(sameRoad,unseen).locationId).toBe(shelter);
  expect(eligibleAuctionAmbush(sameRoad,auctionActor(sameRoad,unseen))).toBeUndefined();
  expect(auctionActor(sameRoad,auctionRival).locationId).toBe(shelter);
  expect(eligibleAuctionAmbush(sameRoad,auctionActor(sameRoad,auctionRival))).toEqual({
    targetCultivatorId:auctionBidder,lotId:lot.id,
  });
  const attack={chosenAction:'DUEL',targetCultivatorId:auctionBidder,targetAuctionAmbushLotId:lot.id,
    innerMonologue:'循先前亲见的那笔成交，截住眼前真身。'} as const;
  const wrong=auctionTurn(sameRoad,{[auctionRival]:{...attack,targetAuctionAmbushLotId:lot.id+'-wrong'}});
  expect(wrong.events.some(event=>event.tick===wrong.tick&&event.duelWinnerId&&event.actorIds.includes(auctionRival))).toBe(false);
  const battle=auctionTurn(strict(sameRoad),{[auctionRival]:attack});
  expect(battle.events.find(event=>event.tick===battle.tick&&event.duelWinnerId&&event.actorIds[0]===auctionRival))
    .toMatchObject({locationId:shelter,actorIds:[auctionRival,auctionBidder]});
  expect(auctionActor(battle,auctionBidder).hp).toBeLessThan(auctionActor(sameRoad,auctionBidder).hp);
  expect(auctionLot(battle).terminal).toEqual(auctionLot(sold).terminal);
});
