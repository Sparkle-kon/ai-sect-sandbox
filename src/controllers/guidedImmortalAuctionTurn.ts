import {activeAvatar} from '../engine/avatarEngine';
import {availableImmortalAuctionActions,type ImmortalAuctionOption} from '../engine/immortalAuctionEngine';
import type {LLMDecisionPayload,WorldState} from '../types/world';

export interface GuidedImmortalAuctionTurn {
  readonly kind:'immortal-auction';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:ImmortalAuctionOption;
}

function sameAuctionOption(a:ImmortalAuctionOption,b:ImmortalAuctionOption){
  if(a.auctionMove==='consign_artifact'&&b.auctionMove==='consign_artifact')return a.targetAuctionArtifactId===b.targetAuctionArtifactId;
  if(a.auctionMove==='consign_pill'&&b.auctionMove==='consign_pill')return a.targetAuctionPillId===b.targetAuctionPillId;
  if(a.auctionMove==='withdraw'&&b.auctionMove==='withdraw')return a.targetAuctionLotId===b.targetAuctionLotId;
  return a.auctionMove==='bid'&&b.auctionMove==='bid'&&a.targetAuctionLotId===b.targetAuctionLotId&&a.auctionBidStones===b.auctionBidStones&&a.auctionQuoteBidCount===b.auctionQuoteBidCount;
}

export function resolveGuidedImmortalAuctionTurn(request:GuidedImmortalAuctionTurn,world:WorldState,branchId:string,revision:number):
  {actorId:string;decision:LLMDecisionPayload}|undefined{
  if(world!==request.world||branchId!==request.branchId||revision!==request.revision)return undefined;
  const actor=activeAvatar(world);
  if(!actor||actor.id!==request.actorId)return undefined;
  const option=availableImmortalAuctionActions(actor,world,world.tick+1).find(row=>sameAuctionOption(row,request.option));
  if(!option)return undefined;
  const base={chosenAction:'IMMORTAL_AUCTION' as const,innerMonologue:'只认眼前这一口确价与当面的原物。'};
  switch(option.auctionMove){
    case 'consign_artifact':return {actorId:actor.id,decision:{...base,auctionMove:option.auctionMove,targetAuctionArtifactId:option.targetAuctionArtifactId}};
    case 'consign_pill':return {actorId:actor.id,decision:{...base,auctionMove:option.auctionMove,targetAuctionPillId:option.targetAuctionPillId}};
    case 'withdraw':return {actorId:actor.id,decision:{...base,auctionMove:option.auctionMove,targetAuctionLotId:option.targetAuctionLotId}};
    case 'bid':return {actorId:actor.id,decision:{...base,auctionMove:option.auctionMove,targetAuctionLotId:option.targetAuctionLotId,
      auctionBidStones:option.auctionBidStones,auctionQuoteBidCount:option.auctionQuoteBidCount}};
  }
}
