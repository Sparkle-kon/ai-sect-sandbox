import { describe,expect,it } from 'vitest';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { advanceMarkets,resolveMarketAction } from '../src/engine/marketEngine';
import { advanceVillageFairs,availableVillageFairActions,projectLocalVillageFair,projectVillageFairs,
  resolveVillageFairAction } from '../src/engine/villageFairEngine';
import { announcedVillageFair,fairPayload,fairPerson,fairReserve,fairTurn,reservedVillageFair } from './fixtures/villageFairFixture';
import type { WorldState } from '../src/types/world';

const fair=(world:WorldState)=>world.villageFairs.fairs[0];
const feeRows=(world:WorldState)=>world.resourceFlow.months.flatMap(month=>month.entries).filter(row=>row.mechanism==='village_fair');
const offerPopulation=(world:WorldState)=>world.settlements.villages.map(({id,population})=>[id,population]);
const directReserve=(f:ReturnType<typeof announcedVillageFair>,id:string,orderId=f.orderFor(id))=>
  resolveVillageFairAction(f.world,fairPerson(f.world,id),fairReserve(f.fairId,orderId));

describe('local fair stalls name actual native escrow, not copied stock',()=>{
  it('seals chronological competition for the last slot without cash or order movement from losers',()=>{
    let f=announcedVillageFair();
    const [a,b,c]=f.merchantIds;
    expect(directReserve(f,a)).toBeNull();
    expect(availableVillageFairActions(fairPerson(f.world,a),f.world,f.world.tick+1)).toContainEqual({
      action:'VILLAGE_FAIR',villageFairMove:'reserve',targetVillageFairId:f.fairId,targetMarketOrderId:f.orderFor(a)});
    f={...f,world:fairTurn(f.world)};
    const orders=structuredClone(f.world.markets.orders);
    const residents=offerPopulation(f.world);
    expect(directReserve(f,f.sponsorId)).toBeNull();
    expect(directReserve(f,f.outsiderId)).toBeNull();
    expect(directReserve(f,a,f.orderFor(b))).toBeNull();
    expect(directReserve(f,a)?.witnessScope).toBe('participants');
    expect(directReserve(f,a)).toBeNull();
    expect(directReserve(f,b)).not.toBeNull();
    const rejected=fairPerson(f.world,c).spiritStones;
    expect(directReserve(f,c)).toBeNull();
    expect(fairPerson(f.world,c).spiritStones).toBe(rejected);
    expect(f.world.markets.orders).toEqual(orders);
    expect(offerPopulation(f.world)).toEqual(residents);
    expect(feeRows(f.world).map(row=>[row.kind,row.amount])).toEqual([['transfer',4],['transfer',4]]);
  });

  it('opens on the real day and exposes only anonymous live goods, which vanish after native sale without undoing earned fee',()=>{
    const f=reservedVillageFair();
    const [seller,buyer,other]=f.merchantIds;
    const books=structuredClone(f.world.markets.orders);
    const base=offerPopulation(f.world);
    const world=fairTurn(f.world);
    expect(world.markets.orders).toEqual(books);
    expect(offerPopulation(world)).toEqual(base);
    expect(fair(world).status).toBe('open');
    expect(advanceVillageFairs(world)).toEqual([]);
    expect(projectLocalVillageFair(world,fairPerson(world,seller))).toEqual({siteId:f.siteId,paidStalls:2});
    expect(projectVillageFairs(world,fairPerson(world,f.outsiderId))).toBeUndefined();
    const local=projectVillageFairs(world,fairPerson(world,other));
    expect(local?.offerings).toEqual(Array.from({length:2},()=>({good:'earth_root',quantity:2,unitPrice:12})));
    for(const id of [seller,buyer]) expect(JSON.stringify(local)).not.toContain(id);
    expect(feeRows(world).filter(row=>row.kind==='consumption')).toHaveLength(2);
    const buyerActor=fairPerson(world,buyer),sellerActor=fairPerson(world,seller);
    const boughtBefore=buyerActor.herbs.earth_root;
    const saleBefore=sellerActor.spiritStones;
    expect(resolveMarketAction(world,buyerActor,fairPayload('PLACE_MARKET_BUY',
      {marketGood:'earth_root',marketQuantity:4,marketLimitPrice:12}))).not.toBeNull();
    advanceMarkets(world);
    expect(buyerActor.herbs.earth_root).toBe(boughtBefore+4);
    expect(sellerActor.spiritStones).toBe(saleBefore+24);
    expect(world.markets.receipts.some(row=>row.status==='local_fill'&&row.sellerId===sellerActor.id)).toBe(true);
    expect(projectVillageFairs(world,sellerActor)?.offerings).toHaveLength(1);
    expect(projectVillageFairs(world,sellerActor)?.ownStall?.offering).toEqual({good:'earth_root',quantity:2,unitPrice:12});
    buyerActor.locationId=fairPerson(world,f.outsiderId).locationId;
    expect(projectVillageFairs(world,sellerActor)?.offerings).toEqual([]);
    expect(fair(world).stalls[1].status).toBe('paid');
    const next=fairTurn(world);
    expect(fair(next).status).toBe('ended');
    expect(projectLocalVillageFair(next,fairPerson(next,seller))).toBeUndefined();
    expect(feeRows(next).filter(row=>row.reason==='fair_refund_fee')).toEqual([]);
  });

  it('cancels after actual map hazard and returns only held cash once, branch-isolated without withdrawing stock',()=>{
    const f=reservedVillageFair(),[a,b]=f.merchantIds;
    const site=f.world.locations.find(row=>row.id===f.siteId)!;
    const point={x:site.x,y:site.y};
    const goodBranch=structuredClone(f.world);
    const danger=applyMapBrush(applyMapBrush(f.world,'beast_tide',[point]),'beast_tide',[point]);
    const before=[a,b].map(id=>fairPerson(danger,id).spiritStones);
    const orders=structuredClone(danger.markets.orders);
    const bad=fairTurn(danger);
    expect(fair(bad)).toMatchObject({status:'cancelled',closure:'site_hazard',hazard:{kind:'beast_tide',intensity:2},
      stalls:[{status:'refunded',feeEscrow:0},{status:'refunded',feeEscrow:0}]});
    expect([a,b].map(id=>fairPerson(bad,id).spiritStones)).toEqual(before.map(value=>value+4));
    expect(bad.markets.orders).toEqual(orders);
    expect(advanceVillageFairs(bad)).toEqual([]);
    expect(feeRows(bad).filter(row=>row.reason==='fair_refund_fee')).toHaveLength(2);
    expect(fair(fairTurn(goodBranch)).status).toBe('open');
    expect(fair(goodBranch).status).toBe('announced');
  });

  it('releases an already withdrawn merchant stock seat without creating a backfill after deadline',()=>{
    let f=reservedVillageFair();
    const [a,,c]=f.merchantIds;
    const merchant=fairPerson(f.world,a);
    expect(resolveMarketAction(f.world,merchant,fairPayload('CANCEL_MARKET_ORDER',{targetMarketOrderId:f.orderFor(a)}))).not.toBeNull();
    const cash=merchant.spiritStones;
    f={...f,world:fairTurn(f.world)};
    expect(fair(f.world)).toMatchObject({status:'open',stalls:[
      {status:'refunded',releaseReason:'order_unavailable',feeEscrow:0},{status:'paid',feeEscrow:0}]});
    expect(fairPerson(f.world,a).spiritStones).toBe(cash+4);
    expect(directReserve(f,c)).toBeNull();
    expect(f.world.markets.orders.find(row=>row.id===f.orderFor(a))).toMatchObject({status:'cancelled',escrowGoods:0});
  });

  it('keeps an uncreditable fee in escrow until original payee can receive it, without fabricating a refund',()=>{
    const f=reservedVillageFair(),[a]=f.merchantIds;
    const site=f.world.locations.find(row=>row.id!==f.siteId && row.type==='market')!;
    fairPerson(f.world,f.sponsorId).locationId=site.id;
    f.world.tick++;
    const merchant=fairPerson(f.world,a);
    merchant.spiritStones=1_000_000_000;
    advanceVillageFairs(f.world);
    expect(fair(f.world)).toMatchObject({status:'cancelled',closure:'sponsor_absent',stalls:[
      {status:'refund_due',feeEscrow:4},{status:'refunded',feeEscrow:0}]});
    expect(feeRows(f.world).filter(row=>row.reason==='fair_refund_fee')).toHaveLength(1);
    expect(merchant.spiritStones).toBe(1_000_000_000);
    merchant.spiritStones=80;
    f.world.tick++;
    advanceVillageFairs(f.world);
    expect(merchant.spiritStones).toBe(84);
    expect(fair(f.world).stalls[0]).toMatchObject({status:'refunded',feeEscrow:0,settledTick:f.world.tick});
    expect(feeRows(f.world).filter(row=>row.reason==='fair_refund_fee')).toHaveLength(2);
    expect(advanceVillageFairs(f.world)).toEqual([]);
  });

  it('returns a dead merchant’s real fee through ordinary estate capture, not an alternate beneficiary',()=>{
    const f=reservedVillageFair();
    const [a]=f.merchantIds;
    const original=fairPerson(f.world,a);
    const before=original.spiritStones;
    original.alive=false;original.hp=0;
    const world=fairTurn(f.world);
    expect(fair(world).stalls[0]).toMatchObject({status:'refunded',releaseReason:'merchant_absent',feeEscrow:0});
    expect(fairPerson(world,a).spiritStones).toBe(0);
    expect(world.estates.entries.find(row=>row.deceasedId===a)?.holdings.stones).toBe(before+4);
    expect(advanceVillageFairs(world)).toEqual([]);
  });
});
