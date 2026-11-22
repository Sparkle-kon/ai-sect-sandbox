import { expect } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

export const auctionSite='loc-market',auctionSeller='npc-1',auctionBidder='npc-6',auctionRival='npc-3';
export const auctionNativeItem='artifact-npc-1-2';
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候原地市期。'};
export const auctionActor=(world:WorldState,id=auctionSeller)=>world.cultivators.find(actor=>actor.id===id)!;
export const auctionTurn=(world:WorldState,orders:Record<string,LLMDecisionPayload>={},roll=.35)=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,orders[actor.id]??rest])),()=>roll,'utility');

export function actualAuctionPeople(){
  let world=createInitialWorld(1,'spirit-bloom');
  expect(auctionActor(world,auctionBidder).locationId).toBe(auctionSite);
  expect(auctionActor(world).artifacts.find(item=>item.id===auctionNativeItem)).toMatchObject({
    name:'九霄护心镜',tier:'灵器',durability:100,
  });
  const arrival:LLMDecisionPayload={chosenAction:'EXPLORE',targetLocationId:auctionSite,innerMonologue:'循确知的市路去万仙坊市。'};
  expect(auctionActor(world,auctionSeller).locationId).not.toBe(auctionSite);
  expect(auctionActor(world,auctionRival).locationId).not.toBe(auctionSite);
  world=auctionTurn(world,{[auctionSeller]:arrival,[auctionRival]:arrival},.95);
  for(const actorId of [auctionSeller,auctionRival]){
    expect(auctionActor(world,actorId).locationId).toBe(auctionSite);
    expect(auctionActor(world,actorId).currentAction).toBe('EXPLORE');
  }
  return world;
}

export const auctionStart=13;
export const auctionBid=(targetAuctionLotId:string,auctionBidStones:number,auctionQuoteBidCount=0):LLMDecisionPayload=>({
  chosenAction:'IMMORTAL_AUCTION',auctionMove:'bid',targetAuctionLotId,auctionBidStones,auctionQuoteBidCount,innerMonologue:'如数押付自己的真灵石。',
});
export const auctionConsign:LLMDecisionPayload={
  chosenAction:'IMMORTAL_AUCTION',auctionMove:'consign_artifact',targetAuctionArtifactId:auctionNativeItem,
  innerMonologue:'以原物交给会场保管。',
};
export const auctionWithdraw=(targetAuctionLotId:string):LLMDecisionPayload=>({
  chosenAction:'IMMORTAL_AUCTION',auctionMove:'withdraw',targetAuctionLotId,innerMonologue:'无出价时领取原物。',
});
export function actualAuctionBeforeListing(){
  let world=actualAuctionPeople();
  while(world.tick+1<auctionStart)world=auctionTurn(world);
  expect(world.tick).toBe(auctionStart-1);
  return world;
}

export const auctionPillSeller='npc-5';
export const auctionConsignPill:LLMDecisionPayload={
  chosenAction:'IMMORTAL_AUCTION',auctionMove:'consign_pill',targetAuctionPillId:'foundation',
  innerMonologue:'寄售自己在真炉炼成的筑基丹。',
};
export function actualNativeAuctionPill(){
  let world=actualAuctionPeople();
  const crafter=auctionPillSeller;
  expect(auctionActor(world,crafter).locationId).toBe('loc-danxia');
  for(const herb of ['jade_leaf','earth_root'] as const){
    world=auctionTurn(world,{[crafter]:{chosenAction:'GATHER_HERBS',targetHerbId:herb,innerMonologue:'在本宗采集实物。'}});
  }
  expect(auctionActor(world,crafter).pills.foundation).toBe(0);
  world=auctionTurn(world,{[crafter]:{chosenAction:'BREW_PILL',targetPillId:'foundation',innerMonologue:'以实根实叶开本宗丹炉。'}},.05);
  expect(auctionActor(world,crafter).pills.foundation).toBe(1);
  expect(world.resourceFlow.months.at(-1)?.entries).toContainEqual(expect.objectContaining({
    mechanism:'alchemy',reason:'brew_output',good:'foundation',amount:1,
  }));
  world=auctionTurn(world,{[crafter]:{chosenAction:'EXPLORE',targetLocationId:auctionSite,innerMonologue:'亲携实丹前往坊市。'}},.95);
  expect(auctionActor(world,crafter).locationId).toBe(auctionSite);
  while(world.tick+1<auctionStart)world=auctionTurn(world);
  return world;
}

export const auctionLot=(world:WorldState)=>world.immortalAuction!.lots.find(lot=>lot.sellerId===auctionSeller)!;
export function actualAuctionListed(){
  const before=actualAuctionBeforeListing();
  const listed=auctionTurn(before,{[auctionSeller]:auctionConsign});
  const lot=auctionLot(listed);
  expect(lot).toMatchObject({sellerId:auctionSeller,listedTick:auctionStart,closesTick:auctionStart+2,minimum:120,
    asset:{kind:'artifact',artifactId:auctionNativeItem,tier:'灵器',durability:100},bids:[]});
  return {before,listed,lot};
}

export function actualAuctionBid(){
  const {before,listed,lot}=actualAuctionListed();
  const bid=auctionTurn(listed,{[auctionRival]:auctionBid(lot.id,120)});
  return {before,listed,lot,bid};
}

export function actualAuctionSold(){
  const {before,listed,lot,bid}=actualAuctionBid();
  const sold=auctionTurn(bid,{[auctionBidder]:auctionBid(lot.id,130,1)});
  return {before,listed,lot,bid,sold};
}
