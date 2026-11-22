import {IMMORTAL_AUCTION_PILLS,type ImmortalAuctionAsset,type ImmortalAuctionBid,type ImmortalAuctionLot,
  type ImmortalAuctionPillId,type ImmortalAuctionTerminal} from '../types/immortalAuction';
import type {Artifact,Cultivator,LLMDecisionPayload,LocationNode,WorldEvent,WorldState} from '../types/world';
import {durabilityOf,maxDurabilityOf} from './artifactEngine';
import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {disasterShelterLocksTravel} from './disasterShelterCheckpoint';
import {activeEscortForActor} from './escortEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {activePilgrimageForActor} from './pilgrimageEngine';
import {activeRelocationForActor} from './relocationEngine';
import {activeCourierForActor} from './sealedCourierEngine';
import {sparringLocksActor} from './sparringEngine';
import {ALCHEMY_RECIPES} from './alchemyCatalog';
import {
  IMMORTAL_AUCTION_AMBUSH_TICKS,IMMORTAL_AUCTION_BID_STEP,IMMORTAL_AUCTION_DURATION,IMMORTAL_AUCTION_HISTORY,
  IMMORTAL_AUCTION_MAX_BID,IMMORTAL_AUCTION_MAX_BIDS,IMMORTAL_AUCTION_PERIOD,IMMORTAL_AUCTION_SITE,IMMORTAL_AUCTION_WINDOW_LOTS,
  immortalAuctionEventId,immortalAuctionHighBid,immortalAuctionMinimum,immortalAuctionNextBid,immortalAuctionOpening,
} from './immortalAuctionTerms';

export type ImmortalAuctionOption={action:'IMMORTAL_AUCTION'}&(
  |{auctionMove:'consign_artifact';targetAuctionArtifactId:string;targetAuctionPillId?:never;targetAuctionLotId?:never;auctionBidStones?:never;auctionQuoteBidCount?:never}
  |{auctionMove:'consign_pill';targetAuctionPillId:ImmortalAuctionPillId;targetAuctionArtifactId?:never;targetAuctionLotId?:never;auctionBidStones?:never;auctionQuoteBidCount?:never}
  |{auctionMove:'bid';targetAuctionLotId:string;auctionBidStones:number;auctionQuoteBidCount:number;targetAuctionArtifactId?:never;targetAuctionPillId?:never}
  |{auctionMove:'withdraw';targetAuctionLotId:string;targetAuctionArtifactId?:never;targetAuctionPillId?:never;auctionBidStones?:never;auctionQuoteBidCount?:never}
);
const unique=<T extends {id:string}>(rows:readonly T[],id:string):T|undefined=>{
  let found:T|undefined;
  for(const row of rows){if(row.id!==id)continue;if(found)return undefined;found=row;}
  return found;
};
const actualMarket=(world:WorldState)=>unique(world.locations,IMMORTAL_AUCTION_SITE)?.type==='market';
function availableBody(world:WorldState,actor:Cultivator,site:LocationNode|undefined):boolean{
  return !!site&&actor.locationId===site.id&&actor.alive&&actor.hp>0&&actor.positionPlane===undefined&&
    !isScopedExpeditionGate(site)&&actor.tribulation?.stage!=='lightning'&&actor.tribulation?.stage!=='heart_demon'&&
    !world.forbiddenDuels?.some(row=>row.attackerId===actor.id||row.defenderId===actor.id)&&
    !world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(actor.id))&&
    !world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(actor.id)&&
      !row.dungeon?.members.some(member=>member.actorId===actor.id&&member.leftTick!==undefined)&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(actor.id)))&&
    !activeDanxiaMedicineEscort(world,actor)&&!activeEscortForActor(world,actor)&&!activePilgrimageForActor(world,actor)&&
    !activeRelocationForActor(world,actor)&&!activeCourierForActor(world,actor)&&!disasterShelterLocksTravel(world,actor)&&
    !expeditionRescueCheckpoint(world,actor)&&!boundaryReliefCheckpoint(world,actor)&&!sparringLocksActor(world,actor);
}
const inMarket=(world:WorldState,actor:Cultivator,site=unique(world.locations,IMMORTAL_AUCTION_SITE))=>
  site?.type==='market'&&availableBody(world,actor,site);
const dark=(world:WorldState,actor:Cultivator)=>actor.spiritRoot==='暗'||
  world.sects.some(sect=>sect.id===actor.sectId&&sect.alignment==='魔道');
function artifactAsset(actor:Cultivator,item:Artifact):Extract<ImmortalAuctionAsset,{kind:'artifact'}>|undefined{
  const {id,tier}=item;
  return id&&tier&&tier!=='法器'&&!item.boundTo&&durabilityOf(item)>=1&&actor.artifacts.filter(value=>value.id===id).length===1?
    {kind:'artifact',artifactId:id,name:item.name,tier,spiritRoot:item.spiritRoot,durability:durabilityOf(item),maxDurability:maxDurabilityOf(item)}:undefined;
}
const actorActed=(lots:readonly ImmortalAuctionLot[],id:string,tick:number)=>
  lots.some(lot=>lot.sellerId===id&&(lot.listedTick===tick||lot.terminal?.reason==='withdrawn'&&lot.terminal.tick===tick)||
    lot.bids.some(bid=>bid.bidderId===id&&bid.tick===tick));
const action='IMMORTAL_AUCTION' as const;
export function availableImmortalAuctionActions(actor:Cultivator,world:WorldState,executionTick=world.tick):ImmortalAuctionOption[]{
  if(executionTick!==world.tick&&executionTick!==world.tick+1||actor.locationId!==IMMORTAL_AUCTION_SITE||
    unique(world.cultivators,actor.id)!==actor||!inMarket(world,actor))return [];
  const lots=world.immortalAuction?.lots??[];
  if(actorActed(lots,actor.id,executionTick))return [];
  const choices:ImmortalAuctionOption[]=[];
  if(immortalAuctionOpening(executionTick)&&lots.filter(lot=>lot.listedTick===executionTick).length<IMMORTAL_AUCTION_WINDOW_LOTS){
    for(const artifact of actor.artifacts){
      const asset=artifactAsset(actor,artifact);
      if(asset&&!lots.some(lot=>!lot.terminal&&lot.asset.kind==='artifact'&&lot.asset.artifactId===asset.artifactId))
        choices.push({action,auctionMove:'consign_artifact',targetAuctionArtifactId:asset.artifactId});
    }
    for(const pillId of IMMORTAL_AUCTION_PILLS)if(actor.pills[pillId]>=1)
      choices.push({action,auctionMove:'consign_pill',targetAuctionPillId:pillId});
  }
  for(const lot of lots){
    if(lot.terminal||executionTick<=lot.listedTick||executionTick>lot.closesTick)continue;
    const high=immortalAuctionHighBid(lot),seller=unique(world.cultivators,lot.sellerId);
    if(!seller||!inMarket(world,seller))continue;
    if(lot.sellerId===actor.id){
      if(!high)choices.push({action,auctionMove:'withdraw',targetAuctionLotId:lot.id});
      continue;
    }
    if(high?.bidderId===actor.id||lot.bids.length>=IMMORTAL_AUCTION_MAX_BIDS||
      lot.asset.kind==='pill'&&actor.pills[lot.asset.pillId]>=99)continue;
    const minimum=immortalAuctionNextBid(lot);
    for(const amount of [minimum,minimum+IMMORTAL_AUCTION_BID_STEP]){
      if(amount<=IMMORTAL_AUCTION_MAX_BID&&actor.spiritStones>=amount)choices.push({action,auctionMove:'bid',
        targetAuctionLotId:lot.id,auctionBidStones:amount,auctionQuoteBidCount:lot.bids.length});
    }
  }
  return choices;
}
const signedFields:ReadonlySet<string>=new Set(['chosenAction','auctionMove','targetAuctionArtifactId','targetAuctionPillId',
  'targetAuctionLotId','auctionBidStones','auctionQuoteBidCount','innerMonologue']);
const matches=(a:ImmortalAuctionOption,b:LLMDecisionPayload)=>a.auctionMove===b.auctionMove&&a.targetAuctionLotId===b.targetAuctionLotId&&
  a.targetAuctionArtifactId===b.targetAuctionArtifactId&&a.targetAuctionPillId===b.targetAuctionPillId&&
  a.auctionBidStones===b.auctionBidStones&&a.auctionQuoteBidCount===b.auctionQuoteBidCount;
const itemName=(asset:ImmortalAuctionAsset)=>asset.kind==='artifact'?asset.name:ALCHEMY_RECIPES[asset.pillId].name;
function event(world:WorldState,lot:ImmortalAuctionLot,move:string,title:string,description:string,actorIds:string[],by?:string):WorldEvent{
  return {id:immortalAuctionEventId(world.tick,lot.id,move,by),tick:world.tick,year:world.year,month:world.month,
    title,description,category:'diplomacy',actorIds,locationId:IMMORTAL_AUCTION_SITE,witnessScope:'participants'};
}
function releaseBid(world:WorldState,bid:ImmortalAuctionBid,status:'outbid'|'refunded'):boolean{
  const bidder=unique(world.cultivators,bid.bidderId);
  if(bid.status!=='held'||!bidder)return false;
  bidder.spiritStones+=bid.stones;
  bid.status=status;bid.settledTick=world.tick;
  return true;
}
function deliverItem(lot:ImmortalAuctionLot,to:Cultivator):boolean{
  if(lot.asset.kind==='pill'){to.pills[lot.asset.pillId]++;return true;}
  const original=lot.custody;
  if(!original?.id||original.id!==lot.asset.artifactId||to.artifacts.some(item=>item.id===original.id))return false;
  to.artifacts.push(original);
  delete lot.custody;return true;
}
function close(world:WorldState,lot:ImmortalAuctionLot,reason:ImmortalAuctionTerminal['reason'],seller:Cultivator,high?:ImmortalAuctionBid):WorldEvent|undefined{
  if(lot.terminal)return undefined;
  const bidder=high&&unique(world.cultivators,high.bidderId);
  if(reason==='sold'&&high&&bidder){
    if(!deliverItem(lot,bidder))return undefined;
    seller.spiritStones+=high.stones;
    high.status='paid';high.settledTick=world.tick;
    const site=unique(world.locations,IMMORTAL_AUCTION_SITE),known=new Set<string>(),nameCounts=new Map<string,number>();
    for(const person of world.cultivators)nameCounts.set(person.id,(nameCounts.get(person.id)??0)+1);
    if(lot.asset.kind==='artifact'){
      for(const person of world.cultivators){
        if(person.id!==seller.id&&person.id!==bidder.id&&nameCounts.get(person.id)===1&&
          availableBody(world,person,site)&&dark(world,person))known.add(person.id);
      }
    }
    const witnesses=[...known].sort();
    if(witnesses.length)lot.witnessIds=witnesses;
    const entry=event(world,lot,'sold','万宝大会落槌',
      `寄卖原物「${itemName(lot.asset)}」当面交割；${high.stones}灵石实付入原卖家手中。`,[seller.id,bidder.id,...witnesses]);
    lot.terminal={tick:world.tick,eventId:entry.id,reason,buyerId:bidder.id,stones:high.stones};
    return entry;
  }
  if(reason==='sold'||high&&!bidder||!deliverItem(lot,seller))return undefined;
  if(high&&!releaseBid(world,high,'refunded'))return undefined;
  const title=reason==='withdrawn'?'卖家收回原物':reason==='no_bid'?'万宝流拍':'拍卖未成交';
  const entry=event(world,lot,reason,title,'这笔交割未成立；原物归原卖家，未用的押款退回原付款人。',
    bidder?[seller.id,bidder.id]:[seller.id]);
  lot.terminal={tick:world.tick,eventId:entry.id,reason};
  return entry;
}
export function resolveImmortalAuctionAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!==action||Object.keys(decision).some(key=>!signedFields.has(key)))return null;
  const option=availableImmortalAuctionActions(actor,world).find(row=>matches(row,decision));
  if(!option)return null;
  if(option.auctionMove==='consign_artifact'||option.auctionMove==='consign_pill'){
    const original=option.auctionMove==='consign_artifact'?unique(actor.artifacts.filter((item):item is Artifact&{id:string}=>!!item.id),
      option.targetAuctionArtifactId):undefined;
    const asset=option.auctionMove==='consign_pill'?{kind:'pill' as const,pillId:option.targetAuctionPillId}:original&&artifactAsset(actor,original);
    if(!asset)return null;
    const state=world.immortalAuction??(world.immortalAuction={nextId:1,lots:[]});
    const lot:ImmortalAuctionLot={id:`auction-lot-${state.nextId++}`,sellerId:actor.id,listedTick:world.tick,
      closesTick:world.tick+IMMORTAL_AUCTION_DURATION,minimum:immortalAuctionMinimum(asset),asset,bids:[],...(original?{custody:original}:{})};
    if(original)actor.artifacts.splice(actor.artifacts.indexOf(original),1);
    else if(asset.kind==='pill')actor.pills[asset.pillId]--;
    state.lots.push(lot);
    if(state.lots.length>IMMORTAL_AUCTION_HISTORY){
      const gone=state.lots.findIndex(row=>row.terminal!==undefined);
      if(gone>=0)state.lots.splice(gone,1);
    }
    return event(world,lot,'consign','万宝大会收寄',`「${itemName(asset)}」已入实柜，原物不在卖家囊中重复记账。`,[actor.id],actor.id);
  }
  const lot=unique(world.immortalAuction?.lots??[],option.targetAuctionLotId);
  if(!lot)return null;
  const high=immortalAuctionHighBid(lot);
  if(option.auctionMove==='withdraw')return close(world,lot,'withdrawn',actor)??null;
  if(high&&!releaseBid(world,high,'outbid'))return null;
  actor.spiritStones-=option.auctionBidStones;
  lot.bids.push({bidderId:actor.id,tick:world.tick,stones:option.auctionBidStones,status:'held'});
  return event(world,lot,'bid','万宝大会加价',
    `实存${option.auctionBidStones}灵石入柜。${high?'先前押款已原数退还。':''}`,[actor.id,lot.sellerId,...(high?[high.bidderId]:[])],actor.id);
}
export function advanceImmortalAuctions(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  if(!world.immortalAuction)return events;
  const market=actualMarket(world);
  for(const lot of world.immortalAuction.lots){
    if(lot.terminal||lot.listedTick>=world.tick)continue;
    const seller=unique(world.cultivators,lot.sellerId),high=immortalAuctionHighBid(lot);
    const bidder=high&&unique(world.cultivators,high.bidderId);
    if(!seller||high&&!bidder)continue;
    const unavailable=!market||!inMarket(world,seller)||bidder&&!inMarket(world,bidder)||
      bidder&&lot.asset.kind==='pill'&&bidder.pills[lot.asset.pillId]>=99;
    if(!unavailable&&world.tick<lot.closesTick)continue;
    const receipt=close(world,lot,unavailable?'unavailable':high?'sold':'no_bid',seller,high);
    if(receipt)events.push(receipt);
  }
  return events;
}
export function immortalAuctionActionApplied(world:WorldState,actorId:string,option:ImmortalAuctionOption):boolean{
  const lots=world.immortalAuction?.lots??[];
  if(option.auctionMove==='bid'){
    const receipt=unique(lots,option.targetAuctionLotId)?.bids[option.auctionQuoteBidCount];
    return receipt?.bidderId===actorId&&receipt.tick===world.tick&&receipt.stones===option.auctionBidStones;
  }
  if(option.auctionMove==='withdraw'){
    const lot=unique(lots,option.targetAuctionLotId);
    return lot?.sellerId===actorId&&lot.terminal?.reason==='withdrawn'&&lot.terminal.tick===world.tick;
  }
  return lots.some(lot=>lot.sellerId===actorId&&lot.listedTick===world.tick&&
    (lot.asset.kind==='artifact'?lot.asset.artifactId===option.targetAuctionArtifactId:lot.asset.pillId===option.targetAuctionPillId));
}
const carryingProof=(actor:Cultivator,lot:ImmortalAuctionLot)=>lot.asset.kind==='artifact'&&
  actor.artifacts.filter(item=>lot.asset.kind==='artifact'&&item.id===lot.asset.artifactId).length===1;
/** The monthly engine calls this only after applying the exact ordinary journey and checking a real location change. */
export function recordImmortalAuctionDeparture(world:WorldState,buyer:Cultivator,fromSiteId:string):void{
  if(!world.immortalAuction||fromSiteId!==IMMORTAL_AUCTION_SITE||buyer.locationId===fromSiteId||
    unique(world.cultivators,buyer.id)!==buyer||!availableBody(world,buyer,unique(world.locations,buyer.locationId)))return;
  for(const lot of world.immortalAuction.lots){
    if(lot.departure||lot.terminal?.reason!=='sold'||lot.terminal.buyerId!==buyer.id||world.tick<=lot.terminal.tick||
      world.tick-lot.terminal.tick>IMMORTAL_AUCTION_AMBUSH_TICKS||!carryingProof(buyer,lot))continue;
    lot.departure={tick:world.tick,siteId:buyer.locationId};
  }
}
export function eligibleAuctionAmbush(world:WorldState,actor:Cultivator):{targetCultivatorId:string;lotId:string}|undefined{
  const lots=world.immortalAuction?.lots;
  if(!lots||actor.locationId===IMMORTAL_AUCTION_SITE||!dark(world,actor)||actor.hp<actor.maxHp*.4||
    unique(world.cultivators,actor.id)!==actor||!availableBody(world,actor,unique(world.locations,actor.locationId)))return undefined;
  for(let i=lots.length-1;i>=0;i--){
    const lot=lots[i],terminal=lot.terminal;
    if(terminal?.reason!=='sold'||!terminal.buyerId||!lot.witnessIds?.includes(actor.id)||!lot.departure||
      lot.departure.siteId!==actor.locationId||lot.departure.tick>world.tick||world.tick-terminal.tick>IMMORTAL_AUCTION_AMBUSH_TICKS)continue;
    const target=unique(world.cultivators,terminal.buyerId);
    if(target&&availableBody(world,target,unique(world.locations,actor.locationId))&&carryingProof(target,lot))return {targetCultivatorId:target.id,lotId:lot.id};
  }
  return undefined;
}
export interface ImmortalAuctionLotView {
  id:string;sellerId:string;listedTick:number;closesTick:number;minimum:number;nextBid?:number;asset:ImmortalAuctionAsset;
  highBid?:Pick<ImmortalAuctionBid,'bidderId'|'stones'|'tick'>;ownBids:ImmortalAuctionBid[];terminal?:ImmortalAuctionTerminal;
}
export interface ImmortalAuctionView {
  actorId:string;siteId:string;opensTick:number;lots:ImmortalAuctionLotView[];options:ImmortalAuctionOption[];
}
export function projectImmortalAuctions(world:WorldState,actor?:Cultivator):ImmortalAuctionView|undefined{
  if(!actor||unique(world.cultivators,actor.id)!==actor||!inMarket(world,actor))return undefined;
  const opensTick=world.tick+(IMMORTAL_AUCTION_PERIOD-(world.tick-1)%IMMORTAL_AUCTION_PERIOD)%IMMORTAL_AUCTION_PERIOD;
  const lots=(world.immortalAuction?.lots??[]).filter(lot=>!lot.terminal||lot.sellerId===actor.id||
    lot.bids.some(bid=>bid.bidderId===actor.id)).slice(-12).reverse().map((lot):ImmortalAuctionLotView=>{
    const high=immortalAuctionHighBid(lot);
    return {id:lot.id,sellerId:lot.sellerId,listedTick:lot.listedTick,closesTick:lot.closesTick,minimum:lot.minimum,
      asset:{...lot.asset},ownBids:lot.bids.filter(row=>row.bidderId===actor.id).map(row=>({...row})),
      ...(lot.terminal?{terminal:{...lot.terminal}}:{nextBid:immortalAuctionNextBid(lot)}),
      ...(high?{highBid:{bidderId:high.bidderId,stones:high.stones,tick:high.tick}}:{})};
  });
  return {actorId:actor.id,siteId:IMMORTAL_AUCTION_SITE,opensTick,lots,
    options:availableImmortalAuctionActions(actor,world,world.tick+1)};
}
