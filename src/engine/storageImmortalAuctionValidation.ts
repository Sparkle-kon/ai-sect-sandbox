import type { ImmortalAuctionLot } from '../types/immortalAuction';
import type { Artifact, WorldState } from '../types/world';
import { durabilityOf,maxDurabilityOf } from './artifactEngine';
import { SHARE_SAVE_REDACTED_TEXT } from './shareSaveRedactionText';
import { ALCHEMY_RECIPES } from './alchemyCatalog';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import {
  IMMORTAL_AUCTION_AMBUSH_TICKS, IMMORTAL_AUCTION_BID_STEP, IMMORTAL_AUCTION_DURATION, IMMORTAL_AUCTION_HISTORY,
  IMMORTAL_AUCTION_SITE, IMMORTAL_AUCTION_WINDOW_LOTS, immortalAuctionEventId, immortalAuctionMinimum, immortalAuctionOpening,
} from './immortalAuctionTerms';

type Fail=(path:string)=>never;
const path='immortalAuction';
const privateId=/^evt-([1-9]\d*)-auction-lot-([1-9]\d*)-(?:(?:consign|bid)-.+|sold|withdrawn|no_bid|unavailable)$/u;
const isPrivateId=(id:string)=>privateId.test(id);
const lotSerial=(id:string)=>Number(/^auction-lot-([1-9]\d*)$/u.exec(id)?.[1]);
const eq=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const includesDuplicate=(ids:readonly string[])=>new Set(ids).size!==ids.length;
const parties=(ids:readonly string[])=>[...new Set(ids)];

/** Bid book is the single auction escrow ledger. The earlier leader's refund
 * and terminal charge/return are derived once from the exact sequence. No
 * historical buyer is asserted to still carry the present-day asset. */
export function validateImmortalAuctionHistory(world:WorldState,fail:Fail):void{
  const state=world.immortalAuction;
  const hot=world.events.filter(row=>isPrivateId(row.id));
  const leak=(rows:readonly {id:string}[])=>rows.some(row=>isPrivateId(row.id));
  if(leak(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(row=>leak(row.anchors))||
    world.coldHistory.chapters.some(row=>leak(row.anchors))||
    world.chronicleCausality.nodes.some(row=>isPrivateId(row.eventId))||
    world.chronicleErrata.sources.some(row=>isPrivateId(row.sourceEventId))||
    world.eraHeritage?.facts.some(row=>isPrivateId(row.source.sourceEventId))||
    world.witnesses.facts.some(row=>isPrivateId(row.eventId))||
    world.witnessedPersonalStory.scenes.some(row=>isPrivateId(row.eventId))||
    world.protagonistSuccession.arcs.some(row=>row.opening.some(item=>isPrivateId(item.eventId))||
      row.support.some(item=>isPrivateId(item.eventId))||!!row.death&&isPrivateId(row.death.eventId))||
    world.cultivators.some(actor=>actor.rumors.some(row=>!!row.originEventId&&isPrivateId(row.originEventId)||
      row.id.startsWith('rumor-')&&isPrivateId(row.id.slice('rumor-'.length)))))
    return fail(path+'.privateSource');
  if(!state){if(hot.length)return fail(path+'.source');return;}
  if(!state.lots.length)return fail(path+'.lots');
  if(state.lots.some(row=>!row.terminal)&&!world.locations.some(row=>row.id===IMMORTAL_AUCTION_SITE&&row.type==='market'))return fail(path+'.site');

  const actors=new Map(world.cultivators.map(row=>[row.id,row]));
  const sites=new Set(world.locations.filter(row=>!isScopedExpeditionGate(row)).map(row=>row.id));
  const monthLots=new Map<number,number>();
  const steps=new Set<string>();
  const physical=new Map<string,number>();
  const artifacts=[...world.cultivators.flatMap(row=>row.artifacts),...world.estates.entries.flatMap(row=>row.holdings.artifacts)];
  for(const artifact of artifacts)if(artifact.id)physical.set(artifact.id,(physical.get(artifact.id)??0)+1);
  const custodyEnds=new Map<string,number>();
  const sources=new Map<string,{tick:number;actorIds:string[];title:string;description:string}>();
  let priorSerial=0,priorListed=0;
  const once=(actorId:string,tick:number)=>{
    const key=JSON.stringify([actorId,tick]);
    if(steps.has(key))return fail(path+'.actorTurn');
    steps.add(key);
  };
  const expected=(id:string,tick:number,actorIds:string[],title:string,description:string)=>{
    if(sources.has(id))return fail(path+'.source');
    sources.set(id,{tick,actorIds,title,description});
  };
  const matchesAsset=(lot:ImmortalAuctionLot,item:Artifact)=>lot.asset.kind==='artifact'&&
    item.id===lot.asset.artifactId&&item.name===lot.asset.name&&item.spiritRoot===lot.asset.spiritRoot&&
    item.tier===lot.asset.tier&&durabilityOf(item)===lot.asset.durability&&maxDurabilityOf(item)===lot.asset.maxDurability&&
    item.boundTo===undefined;
  for(const lot of state.lots){
    const {sellerId,listedTick,closesTick,asset,bids,terminal}=lot;
    const serial=lotSerial(lot.id);
    if(!Number.isSafeInteger(serial)||(priorSerial!==0?serial!==priorSerial+1:state.lots.length<IMMORTAL_AUCTION_HISTORY&&serial!==1)||serial>=state.nextId||listedTick<priorListed||
      !actors.has(sellerId)||listedTick>world.tick||!immortalAuctionOpening(listedTick)||
      closesTick!==listedTick+IMMORTAL_AUCTION_DURATION||lot.minimum!==immortalAuctionMinimum(asset))return fail(path+'.lot');
    priorSerial=serial;priorListed=listedTick;
    const lots=(monthLots.get(listedTick)??0)+1;
    if(lots>IMMORTAL_AUCTION_WINDOW_LOTS)return fail(path+'.window');
    monthLots.set(listedTick,lots);
    if(!terminal&&world.tick>=closesTick)return fail(path+'.window');

    const itemName=asset.kind==='artifact'?asset.name:ALCHEMY_RECIPES[asset.pillId].name;
    if(asset.kind==='artifact'){
      if(asset.durability<1||asset.durability>asset.maxDurability||asset.maxDurability<1||
        (custodyEnds.get(asset.artifactId)??0)>=listedTick||
        (physical.get(asset.artifactId)??0)>1||
        (terminal?lot.custody!==undefined:!lot.custody||!matchesAsset(lot,lot.custody)||physical.has(asset.artifactId)))
        return fail(path+'.custody');
      custodyEnds.set(asset.artifactId,terminal?.tick??Infinity);
    }else if(lot.custody!==undefined)return fail(path+'.custody');
    once(sellerId,listedTick);
    expected(immortalAuctionEventId(listedTick,lot.id,'consign',sellerId),listedTick,[sellerId],'万宝大会收寄',
      `「${itemName}」已入实柜，原物不在卖家囊中重复记账。`);

    for(let i=0;i<bids.length;i++){
      const bid=bids[i],previous=bids[i-1],next=bids[i+1];
      const required=previous?previous.stones+IMMORTAL_AUCTION_BID_STEP:lot.minimum;
      if(!actors.has(bid.bidderId)||bid.bidderId===sellerId||bid.tick<=listedTick||bid.tick>closesTick||
        bid.tick>world.tick||bid.tick<(previous?.tick??0)||bid.tick>(terminal?.tick??Infinity)||bid.bidderId===previous?.bidderId||
        (bid.stones!==required&&bid.stones!==required+IMMORTAL_AUCTION_BID_STEP)||
        (next?bid.status!=='outbid'||bid.settledTick!==next.tick:
          terminal?bid.settledTick!==terminal.tick||bid.status!==(terminal.reason==='sold'?'paid':'refunded'):
          bid.status!=='held'||bid.settledTick!==undefined))return fail(path+'.bid');
      once(bid.bidderId,bid.tick);
      expected(immortalAuctionEventId(bid.tick,lot.id,'bid',bid.bidderId),bid.tick,
        parties([bid.bidderId,sellerId,...(previous?[previous.bidderId]:[])]),'万宝大会加价',
        `实存${bid.stones}灵石入柜。${previous?'先前押款已原数退还。':''}`);
    }
    const winner=bids.at(-1),witnesses=lot.witnessIds??[];
    if(!terminal){
      if(lot.departure!==undefined||lot.witnessIds!==undefined)return fail(path+'.terminal');
      continue;
    }
    if(terminal.tick<=listedTick||terminal.tick>closesTick||terminal.tick>world.tick||
      terminal.eventId!==immortalAuctionEventId(terminal.tick,lot.id,terminal.reason)||
      ((terminal.reason==='sold'||terminal.reason==='no_bid')&&terminal.tick!==closesTick))
      return fail(path+'.terminal');
    const sold=terminal.reason==='sold';
    if(sold){
      if(!winner||terminal.buyerId!==winner.bidderId||terminal.stones!==winner.stones||
        lot.witnessIds!==undefined&&(asset.kind!=='artifact'||!witnesses.length)||
        witnesses.some((id,i)=>id===sellerId||id===winner.bidderId||!actors.has(id)||i>0&&witnesses[i-1]>=id))
        return fail(path+'.terminal');
    }else if(terminal.buyerId!==undefined||terminal.stones!==undefined||
      lot.departure!==undefined||lot.witnessIds!==undefined||
      (terminal.reason!=='unavailable'&&winner!==undefined))return fail(path+'.terminal');
    if(terminal.reason==='withdrawn')once(sellerId,terminal.tick);
    expected(terminal.eventId,terminal.tick,[sellerId,...(winner?[winner.bidderId]:[]),...witnesses],
      terminal.reason==='sold'?'万宝大会落槌':terminal.reason==='withdrawn'?'卖家收回原物':terminal.reason==='no_bid'?'万宝流拍':'拍卖未成交',
      sold?`寄卖原物「${itemName}」当面交割；${terminal.stones}灵石实付入原卖家手中。`:
        '这笔交割未成立；原物归原卖家，未用的押款退回原付款人。');
    if(lot.departure&&(asset.kind!=='artifact'||lot.departure.tick<=terminal.tick||lot.departure.tick>world.tick||
      lot.departure.tick>terminal.tick+IMMORTAL_AUCTION_AMBUSH_TICKS||lot.departure.siteId===IMMORTAL_AUCTION_SITE||
      !sites.has(lot.departure.siteId)))return fail(path+'.departure');
    if(lot.departure&&winner){
      const route=lot.departure;
      const explore=world.events.filter(row=>row.id===`evt-${route.tick}-${winner.bidderId}-explore`);
      const trails=world.mapPresentation.trails.filter(row=>row.tick===route.tick&&row.cultivatorId===winner.bidderId);
      if(explore.length>1||explore.some(source=>source.tick!==route.tick||source.locationId!==route.siteId||
        source.category!=='breakthrough'||!eq(source.actorIds,[winner.bidderId]))||
        trails.some(trail=>trail.fromLocationId!==IMMORTAL_AUCTION_SITE||trail.toLocationId!==route.siteId))
        return fail(path+'.departure');
    }
  }
  if(priorSerial+1!==state.nextId)return fail(path+'.history');
  const seen=new Set<string>();
  const oldestHot=world.events.reduce((min,event)=>Math.min(min,event.tick),Infinity);
  for(const event of hot){
    const source=sources.get(event.id);
    const [,nativeTick,nativeSerial]=privateId.exec(event.id)!;
    const redacted=event.title===SHARE_SAVE_REDACTED_TEXT&&event.description===SHARE_SAVE_REDACTED_TEXT;
    if(seen.has(event.id)||Number(nativeTick)!==event.tick||event.tick>world.tick||event.witnessScope!=='participants'||event.category!=='diplomacy'||
      event.locationId!==IMMORTAL_AUCTION_SITE||event.duelWinnerId!==undefined||event.damage!==undefined||
      event.dialogue!==undefined||includesDuplicate(event.actorIds)||event.actorIds.some(id=>!actors.has(id))||
      (source?(source.tick!==event.tick||!eq(source.actorIds,event.actorIds)||!redacted&&(source.title!==event.title||source.description!==event.description)):
        state.lots.length!==IMMORTAL_AUCTION_HISTORY||Number(nativeSerial)>=lotSerial(state.lots[0].id)||
        event.tick>state.lots[0].closesTick))return fail(path+'.source');
    seen.add(event.id);
  }
  for(const [id,source] of sources){
    if(!seen.has(id)&&(source.tick>oldestHot||source.tick===world.tick&&world.events.length<120))
      return fail(path+'.source');
  }
}
