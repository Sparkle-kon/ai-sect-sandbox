import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {buildConfirmedShareSave,prepareShareSavePrivacy,SHARE_SAVE_REDACTED_TEXT} from '../src/engine/shareSavePrivacy';
import type {WorldState} from '../src/types/world';
import {actualAuctionBid,actualAuctionListed,actualAuctionSold,actualNativeAuctionPill,
  auctionActor,auctionBidder,auctionConsignPill,auctionLot,auctionNativeItem,auctionPillSeller,auctionSeller,
  auctionTurn,auctionWithdraw} from './immortalAuctionNativeFixture';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';

function reopen(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}
function reject(world:WorldState,edit:(copy:WorldState)=>void,path:RegExp){
  const copy=structuredClone(world);edit(copy);
  expect(()=>encodeEraWorldSave(copy)).toThrow(path);
}

describe('native immortal auction storage',()=>{
  it('keeps old saves byte-exact with no optional auction ledger',()=>{
    const initial=createInitialWorld(1,'spirit-bloom');
    const raw=encodeWorldSave(initial);
    expect(raw).not.toContain('"immortalAuction"');
    expect(encodeWorldSave(decodeWorldSave(raw))).toBe(raw);
    expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
  });

  it('round-trips original physical custody, exact old leader refund, and one genuine winning transfer',()=>{
    const {listed,bid,sold}=actualAuctionSold();
    const preview=prepareShareSavePrivacy(sold);
    expect(preview.status).toBe('ready');
    const shared=decodeWorldSave(buildConfirmedShareSave(sold,preview)!.json);
    expect(shared.immortalAuction).toEqual(sold.immortalAuction);
    expect(shared.events.find(event=>event.id===auctionLot(sold).terminal!.eventId))
      .toMatchObject({title:SHARE_SAVE_REDACTED_TEXT,description:SHARE_SAVE_REDACTED_TEXT});
    for(const world of [listed,bid,sold])expect(auctionLot(reopen(world))).toEqual(auctionLot(world));
    expect(auctionActor(listed,auctionSeller).artifacts.some(item=>item.id===auctionNativeItem)).toBe(false);
    expect(auctionLot(listed).custody?.id).toBe(auctionNativeItem);
    expect(auctionLot(bid).bids[0]).toMatchObject({status:'held',stones:120});
    expect(auctionLot(sold)).toMatchObject({
      terminal:{reason:'sold',buyerId:auctionBidder,stones:130},
      bids:[{status:'outbid',settledTick:sold.tick},{status:'paid',settledTick:sold.tick}],
    });
    expect(auctionActor(sold,auctionBidder).artifacts.filter(item=>item.id===auctionNativeItem)).toHaveLength(1);
    reject(listed,w=>{auctionActor(w,auctionSeller).artifacts.push({...auctionLot(w).custody!});},/immortalAuction.custody/);
    reject(listed,w=>{auctionLot(w).custody!.boundTo=auctionSeller;},/immortalAuction.custody/);
    reject(bid,w=>{auctionLot(w).bids[0].settledTick=w.tick;},/immortalAuction.bid/);
    reject(sold,w=>{auctionLot(w).terminal!.stones!++;},/immortalAuction.terminal/);
    reject(sold,w=>{auctionLot(w).bids[0].status='paid';},/immortalAuction.bid/);
    reject(sold,w=>{auctionLot(w).terminal!.buyerId=auctionSeller;},/immortalAuction.terminal/);
    reject(sold,w=>{auctionLot(w).terminal!.eventId+='fake';},/immortalAuction.terminal/);
    reject(sold,w=>{const stamped=w.events.find(event=>event.id===auctionLot(w).terminal!.eventId)!;delete stamped.witnessScope;},/immortalAuction.source/);
    reject(sold,w=>{
      const source=w.events.find(event=>event.id===auctionLot(w).terminal!.eventId)!;
      source.title=SHARE_SAVE_REDACTED_TEXT;
    },/immortalAuction.source/);
  });

  it('restores one native unbid artifact on withdrawal and separately returns one original ordinary pill',()=>{
    const {listed,lot}=actualAuctionListed();
    const withdrawn=auctionTurn(listed,{[auctionSeller]:auctionWithdraw(lot.id)});
    expect(auctionLot(reopen(withdrawn))).toMatchObject({terminal:{reason:'withdrawn'}});
    expect(auctionActor(withdrawn,auctionSeller).artifacts.filter(item=>item.id===auctionNativeItem)).toHaveLength(1);
    const {bid}=actualAuctionBid();
    reject(bid,w=>{auctionLot(w).terminal={tick:w.tick,eventId:`evt-${w.tick}-${auctionLot(w).id}-withdrawn`,reason:'withdrawn'};delete auctionLot(w).custody;},/immortalAuction.bid/);

    const before=actualNativeAuctionPill();
    const onSale=auctionTurn(before,{[auctionPillSeller]:auctionConsignPill});
    const pillLot=onSale.immortalAuction!.lots.find(row=>row.sellerId===auctionPillSeller)!;
    expect(pillLot).toMatchObject({asset:{kind:'pill',pillId:'foundation'},minimum:55});
    expect(pillLot.custody).toBeUndefined();
    expect(auctionActor(onSale,auctionPillSeller).pills.foundation).toBe(0);
    const expired=auctionTurn(auctionTurn(onSale));
    expect(reopen(expired).immortalAuction!.lots.find(row=>row.id===pillLot.id)?.terminal?.reason).toBe('no_bid');
    expect(auctionActor(expired,auctionPillSeller).pills.foundation).toBe(1);
  });
});
