import {describe,expect,it} from 'vitest';
import {projectSharedTurningPoints} from '../src/components/sharedTurningPointsModel';
import {createInitialWorld} from '../src/data/initialWorld';
import {marketClosureReason} from '../src/engine/marketEngine';
import {createTimeline,forkTimeline,readTimelineHead,recordTimelineWorld} from '../src/engine/timelineEngine';
import type {WorldState} from '../src/types/world';
import {giveEarnedStoryScenes,protagonistStoryWorld,storyPayload,storyPerson,storyTurn} from './fixtures/protagonistSuccessionFixture';
import {sealTurningChapter} from './fixtures/chapterTurningPointsFixture';

const market='loc-market';
function quiet(world:WorldState){return storyTurn(world,{},.99);}

/** Bounded controlled starting state, actual core-owned events, market receipts, arcs, and chapter seal. The separate T401 fixture owns natural-seed feasibility. */
function earnedPair(){
  const f=protagonistStoryWorld();
  const generated=createInitialWorld(49011);
  const buyerId=f.leadId,sellerId=f.successorId,secondWitnessId=f.otherWitnessId;
  // The shared fixture aliases the two names for its tests. Restore the genuine generated display name here.
  storyPerson(f.world,sellerId).name=storyPerson(generated,sellerId).name;
  storyPerson(f.world,buyerId).spiritStones=1200;
  storyPerson(f.world,buyerId).pills.foundation=0;
  for(const id of [sellerId,secondWitnessId])storyPerson(f.world,id).pills.foundation=4;
  let world=giveEarnedStoryScenes(f.world,buyerId,f.witnessId);
  world=quiet(world);
  const first=world.protagonistSuccession.arcs.find(row=>row.actorId===buyerId);
  expect(first?.opening).toHaveLength(3);
  while(world.tick<first!.openedTick+13)world=quiet(world);
  expect(world.protagonistSuccession.arcs.find(row=>row.actorId===buyerId)?.closeReason).toBe('receded');
  world=giveEarnedStoryScenes(world,sellerId,secondWitnessId);
  world=quiet(world);
  const second=world.protagonistSuccession.arcs.find(row=>row.actorId===sellerId);
  expect(second?.opening).toHaveLength(3);
  expect(second?.predecessorArcId).toBe(first?.id);
  expect(new Set([...first!.opening,...second!.opening].map(row=>row.eventId)).size).toBe(6);
  const outsider=world.cultivators.find(row=>row.locationId!==market&&row.alive&&row.id!==buyerId&&row.id!==sellerId);
  expect(outsider).toBeDefined();
  return {world,buyerId,sellerId,outsiderId:outsider!.id,buyerWitnessId:f.witnessId,sellerWitnessId:secondWitnessId};
}

function matchingTurn(world:WorldState,buyerId:string,sellerId:string){
  let base=world;
  let attempt=0;
  while(marketClosureReason(base,market)&&attempt++<15)base=quiet(base);
  expect(marketClosureReason(base,market)).toBeUndefined();
  const next=storyTurn(base,{
    [buyerId]:storyPayload('PLACE_MARKET_BUY',{marketGood:'foundation',marketQuantity:2,marketLimitPrice:30}),
    [sellerId]:storyPayload('PLACE_MARKET_SELL',{marketGood:'foundation',marketQuantity:2,marketLimitPrice:20}),
  },.99);
  const receipt=next.markets.receipts.find(row=>row.status==='local_fill'&&row.tick===next.tick&&row.buyerId===buyerId&&row.sellerId===sellerId);
  expect(receipt).toMatchObject({originId:market,destinationId:market,quantity:2,good:'foundation'});
  const turn=next.chronicleCausality.nodes.find(row=>row.kind==='market_settlement'&&row.entityId===receipt!.id);
  expect(turn?.predecessors.map(row=>row.relation)).toEqual(['matched_buy_order','matched_sell_order']);
  return {world:next,eventId:turn!.eventId,receiptId:receipt!.id,tick:next.tick};
}
function sharedFixture(twice=true){
  const start=earnedPair();
  const first=matchingTurn(start.world,start.buyerId,start.sellerId);
  const follow=(world:WorldState)=>storyTurn(world,{
    [start.buyerId]:storyPayload('SOCIALIZE',{targetCultivatorId:start.buyerWitnessId}),
    [start.sellerId]:storyPayload('SOCIALIZE',{targetCultivatorId:start.sellerWitnessId}),
  },.99);
  const between=follow(first.world);
  const chapterFirst=sealTurningChapter(between);
  const second=twice?matchingTurn(between,start.buyerId,start.sellerId):undefined;
  const world=second?follow(second.world):between;
  const chapter=second?sealTurningChapter(world):chapterFirst;
  expect(chapterFirst.anchors.some(anchor=>anchor.id===first.eventId)).toBe(true);
  if(second)expect(chapter.anchors.some(anchor=>anchor.id===second.eventId)).toBe(true);
  const buyerAfter='evt-'+world.tick+'-'+start.buyerId+'-social';
  const sellerAfter='evt-'+world.tick+'-'+start.sellerId+'-social';
  expect(world.events.some(row=>row.id===buyerAfter)).toBe(true);
  expect(world.events.some(row=>row.id===sellerAfter)).toBe(true);
  return {...start,world,chapter,chapterFirst,first,second,buyerAfter,sellerAfter,
    buyerBetween:'evt-'+between.tick+'-'+start.buyerId+'-social',
    sellerBetween:'evt-'+between.tick+'-'+start.sellerId+'-social'};
}
const read=(world:WorldState,id:string,viewer:string,throughTick?:number)=>projectSharedTurningPoints(world,id,viewer,throughTick);

describe('separate earned arcs may meet or reunite only in one proven public local fill',()=>{
  it('keeps distinct roles, prior chapters and each independently witnessed aftermath in the real native unit sequence',()=>{
    const result=sharedFixture(),{world,chapter,chapterFirst,buyerId,sellerId,first,second,buyerAfter,sellerAfter,buyerBetween,sellerBetween}=result;
    const before=JSON.stringify(world);
    const turns=[...read(world,chapterFirst.id,buyerId),...read(world,chapter.id,buyerId)];
    expect(turns.map(({eventId,reunion})=>[eventId,reunion])).toEqual([[first.eventId,false],[second!.eventId,true]]);
    expect(turns).toHaveLength(2);
    for(const turn of turns){
      expect(turn.siteName).toBe('万仙坊市');
      const buyer=turn.people.find(p=>p.role==='buyer'),seller=turn.people.find(p=>p.role==='seller');
      const matched=world.markets.receipts.find(row=>row.id===(turn.eventId===first.eventId?first:second!).receiptId)!;
      const actual=matched.quantity*matched.unitPrice;
      expect(buyer?.settlement).toContain('实付 '+actual+' 灵石');
      expect(seller?.settlement).toContain('实收 '+actual+' 灵石');
      expect(buyer).toMatchObject({actorId:buyerId,aftermath:{eventId:turn.eventId===first.eventId?buyerBetween:buyerAfter}});
      expect(seller).toMatchObject({actorId:sellerId,aftermath:{eventId:turn.eventId===first.eventId?sellerBetween:sellerAfter}});
      expect(buyer?.arcId).not.toBe(seller?.arcId);
      expect(buyer?.earlier.eventId).not.toBe(seller?.earlier.eventId);
      expect(Math.max(buyer!.earlier.tick,seller!.earlier.tick)).toBeLessThan(turn.tick);
      expect(Math.min(buyer!.aftermath!.tick,seller!.aftermath!.tick)).toBeGreaterThan(turn.tick);
      expect(turn.people.map(row=>row.settlement).join('')).not.toMatch(/猜想|宿命|注定/u);
    }
    expect(JSON.stringify(world)).toBe(before);
    expect(read(world,chapter.id,result.outsiderId)).toEqual([]);
    expect(read(world,chapter.id,buyerId,chapter.endTick-1)).toEqual([]);
    expect(read(world,'unrelated-chapter',buyerId)).toEqual([]);
    expect(read(world,chapter.id,buyerId,world.tick+1)).toEqual([]);
    const noEarlierReceipt=structuredClone(world);
    noEarlierReceipt.markets.receipts=noEarlierReceipt.markets.receipts.filter(row=>row.id!==first.receiptId);
    expect(read(noEarlierReceipt,chapter.id,buyerId).map(row=>[row.eventId,row.reunion])).toEqual([[second!.eventId,false]]);
  });

  it('withholds a private shadow, absent or duplicated settlement, and an unrelated causal parent instead of stitching the old anchor',()=>{
    const {world,chapter,first,buyerId}=sharedFixture(false);
    const archiveSupported=structuredClone(world);
    archiveSupported.events=archiveSupported.events.filter(event=>event.id!==first.eventId);
    expect(read(archiveSupported,chapter.id,buyerId)).toHaveLength(1); // the separate canonical public anchor still exists
    const cases:Array<[string,(copy:WorldState)=>void]>=[
      ['private shadow',copy=>{copy.events.find(event=>event.id===first.eventId)!.witnessScope='participants';}],
      ['chapter copy without independent original',copy=>{
        copy.events=copy.events.filter(event=>event.id!==first.eventId);
        copy.chronicleArchive.anchors=copy.chronicleArchive.anchors.filter(anchor=>anchor.id!==first.eventId);
      }],
      ['missing market receipt',copy=>{copy.markets.receipts=copy.markets.receipts.filter(row=>row.id!==first.receiptId);}],
      ['smaller quantity still within the original orders',copy=>{copy.markets.receipts.find(r=>r.id===first.receiptId)!.quantity=1;}],
      ['false journal receiver',copy=>{
        const money=copy.resourceFlow.months.flatMap(book=>book.entries).find(row=>
          row.refId===first.receiptId&&row.reason==='local_fill'&&row.good==='stone');
        if(money?.kind!=='transfer')throw Error('test actual retained settlement missing');
        money.to.id=buyerId;
      }],
      ['leaked journal privacy',copy=>{
        const money=copy.resourceFlow.months.flatMap(book=>book.entries).find(row=>
          row.refId===first.receiptId&&row.reason==='local_fill'&&row.good==='stone')!;
        money.visibility={kind:'observer'};
      }],
      ['duplicated market receipt',copy=>{copy.markets.receipts.push(structuredClone(copy.markets.receipts.find(row=>row.id===first.receiptId)!));}],
      ['duplicated live source',copy=>{copy.events.push(structuredClone(copy.events.find(row=>row.id===first.eventId)!));}],
      ['missing native causal order',copy=>{copy.chronicleCausality.nodes.find(row=>row.eventId===first.eventId)!.predecessors.splice(0,1);}],
      ['ambiguous chapter',copy=>{copy.chronicleArchive.chapters.push(structuredClone(copy.chronicleArchive.chapters[0]));}],
    ];
    for(const [label,mutate] of cases){
      const copy=structuredClone(world);mutate(copy);
      expect(read(copy,chapter.id,buyerId),label).toEqual([]);
    }
  });

  it('never shares an opening, overlaps arc windows, or substitutes a same-name bystander when one person lacks an independent arc',()=>{
    const {world,chapter,buyerId,sellerId,outsiderId}=sharedFixture(false);
    const a=world.protagonistSuccession.arcs.find(row=>row.actorId===buyerId)!;
    const b=world.protagonistSuccession.arcs.find(row=>row.actorId===sellerId)!;
    const disjoint=structuredClone(world);
    storyPerson(disjoint,outsiderId).name=storyPerson(disjoint,sellerId).name;
    expect(read(disjoint,chapter.id,buyerId)[0]?.people.map(p=>p.actorId)).toEqual(expect.arrayContaining([buyerId,sellerId]));
    disjoint.protagonistSuccession.arcs.find(row=>row.id===b.id)!.actorId=outsiderId;
    expect(read(disjoint,chapter.id,buyerId)).toEqual([]);
    const duplicated=structuredClone(world);
    duplicated.protagonistSuccession.arcs.find(row=>row.id===b.id)!.opening=structuredClone(a.opening);
    expect(read(duplicated,chapter.id,buyerId)).toEqual([]);
    const overlap=structuredClone(world);
    overlap.protagonistSuccession.arcs.find(row=>row.id===a.id)!.endedTick=b.openedTick+1;
    expect(read(overlap,chapter.id,buyerId)).toEqual([]);
  });

  it('withholds only the vanished actual aftermath, and does not turn a joint scene into either person’s separate fate',()=>{
    const {world,chapter,buyerId,sellerId,first,buyerAfter,sellerAfter}=sharedFixture(false);
    const copy=structuredClone(world);
    copy.events=copy.events.filter(row=>row.id!==sellerAfter);
    const at=read(copy,chapter.id,buyerId).find(row=>row.eventId===first.eventId)!;
    expect(at.people.find(row=>row.actorId===buyerId)?.aftermath?.eventId).toBe(buyerAfter);
    expect(at.people.find(row=>row.actorId===sellerId)?.aftermath).toBeUndefined();
    const independent=earnedPair(),filled=matchingTurn(independent.world,independent.buyerId,independent.sellerId);
    const onlyTogether=storyTurn(filled.world,{
      [independent.buyerId]:storyPayload('SOCIALIZE',{targetCultivatorId:independent.sellerId}),
    },.99);
    const current=sealTurningChapter(onlyTogether);
    const readBack=read(onlyTogether,current.id,independent.buyerId);
    expect(readBack[0]?.people.every(row=>row.aftermath===undefined)).toBe(true);
  });

  it('keeps another true same-tick branch with the same fill and chapter labels from borrowing the missing second arc',()=>{
    const {world,buyerId,sellerId,sellerWitnessId}=earnedPair();
    const timeline=createTimeline(world),mainFill=matchingTurn(readTimelineHead(timeline)!,buyerId,sellerId);
    const mainChapter=sealTurningChapter(mainFill.world);
    const main=recordTimelineWorld(timeline,mainFill.world);
    const fork=forkTimeline(main,world.tick,{type:'WHISPER_MIND',targetCultivatorId:buyerId,whisperText:'这条线不遇原来的卖家。'},'另线');
    const forkFill=matchingTurn(readTimelineHead(fork)!,buyerId,sellerWitnessId);
    const forkChapter=sealTurningChapter(forkFill.world);
    expect(forkFill.tick).toBe(mainFill.tick);
    expect(forkFill.eventId).toBe(mainFill.eventId);
    expect(forkChapter.id).toBe(mainChapter.id);
    expect(read(mainFill.world,mainChapter.id,buyerId)).toHaveLength(1);
    expect(read(forkFill.world,forkChapter.id,buyerId)).toEqual([]);
    expect(read(readTimelineHead(main,'main')!,mainChapter.id,buyerId)[0]?.people.some(row=>row.actorId===sellerId)).toBe(true);
  });
});
