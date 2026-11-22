import {describe,expect,it} from 'vitest';
import {immortalAuctionMapMark} from '../src/components/immortalAuctionMapMark';
import {resolveGuidedImmortalAuctionTurn} from '../src/controllers/guidedImmortalAuctionTurn';
import {possessAvatar} from '../src/engine/avatarEngine';
import {availableImmortalAuctionActions,immortalAuctionActionApplied} from '../src/engine/immortalAuctionEngine';
import {actualAuctionSold,auctionActor,auctionBidder,auctionRival,auctionSite,auctionTurn} from './immortalAuctionNativeFixture';

describe('actual auction scope, quote revision and visible market',()=>{
  it('does not authorize a numerically equal old quote when a real rival has changed the bid book',()=>{
    const {listed,lot,bid}=actualAuctionSold();
    const quote=availableImmortalAuctionActions(auctionActor(listed,auctionBidder),listed,listed.tick+1)
      .find(row=>row.auctionMove==='bid'&&row.targetAuctionLotId===lot.id&&row.auctionBidStones===130)!;
    expect(quote).toMatchObject({auctionBidStones:130,auctionQuoteBidCount:0});
    expect(possessAvatar(bid,auctionBidder)).toBe(true);
    const scope={kind:'immortal-auction' as const,world:bid,branchId:'main',revision:3,actorId:auctionBidder};
    expect(resolveGuidedImmortalAuctionTurn({...scope,option:quote},bid,'main',3)).toBeUndefined();
    const fresh=availableImmortalAuctionActions(auctionActor(bid,auctionBidder),bid,bid.tick+1)
      .find(row=>row.auctionMove==='bid'&&row.targetAuctionLotId===lot.id&&row.auctionBidStones===130)!;
    expect(fresh).toMatchObject({auctionQuoteBidCount:1});
    expect(resolveGuidedImmortalAuctionTurn({...scope,option:fresh},bid,'other',3)).toBeUndefined();
    const choice=resolveGuidedImmortalAuctionTurn({...scope,option:fresh},bid,'main',3)!;
    const accepted=auctionTurn(bid,{[auctionBidder]:choice.decision});
    expect(immortalAuctionActionApplied(accepted,auctionBidder,fresh)).toBe(true);
    expect(immortalAuctionActionApplied(accepted,auctionRival,fresh)).toBe(false);
  });
  it('maps only real currently visible goods without exposing a settled buyer or an older frame',()=>{
    const {listed,sold}=actualAuctionSold();
    expect(immortalAuctionMapMark(listed,id=>id===auctionSite,false)).toEqual({siteId:auctionSite,count:1});
    expect(immortalAuctionMapMark(listed,()=>false,false)).toBeUndefined();
    expect(immortalAuctionMapMark(listed,()=>true,true)).toBeUndefined();
    expect(immortalAuctionMapMark(sold,()=>true,false)).toBeUndefined();
  });
});
