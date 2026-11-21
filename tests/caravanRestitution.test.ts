import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  availableCaravanRestitutionActions, resolveCaravanRestitutionAction, sealCaravanSalvage, visibleCaravanRestitution,
} from '../src/engine/caravanRestitutionEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { CaravanRestitutionMove, Cultivator, LLMDecisionPayload, MapHazard, MarketShipment, WorldEvent } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(686);
  world.tick = 32;
  const [buyer,seller,finder,other,minor] = world.cultivators;
  for (const actor of [buyer,seller,finder,other,minor]) actor.age = 30;
  minor.age = 17;
  const [origin,destination] = world.locations.filter(site=>site.type==='market');
  const available = world.locations.find(site=>site.type==='spirit_vein')!;
  const tile = terrainTileAt(world,available.x,available.y)!;
  const closed = {...available,id:'000-secret-alias',type:'secret_realm' as const};
  world.locations.push(closed);
  const site = world.locations.filter(candidate=>candidate.type!=='secret_realm' && candidate.type!=='abyss' &&
    terrainTileAt(world,candidate.x,candidate.y)?.id===tile.id).sort((a,b)=>a.id<b.id?-1:1)[0];
  finder.locationId=other.locationId=minor.locationId=site.id;
  buyer.locationId=origin.id;
  seller.locationId=destination.id;
  const shipment: MarketShipment = {id:'caravan-345',sequence:345,buyOrderId:'buy-1',sellOrderId:'sell-2',
    buyerId:buyer.id,sellerId:seller.id,originId:origin.id,destinationId:destination.id,good:'earth_root',
    quantity:5,unitPrice:12,departedTick:world.tick-1,arrivalTick:world.tick+1,status:'lost',settledTick:world.tick};
  world.markets.shipments.push(shipment);
  world.markets.receipts.push({id:'receipt-346',sequence:346,shipmentId:shipment.id,tick:world.tick,status:'lost',
    buyerId:shipment.buyerId,sellerId:shipment.sellerId,originId:origin.id,destinationId:destination.id,
    good:shipment.good,quantity:shipment.quantity,unitPrice:shipment.unitPrice});
  const hazard: MapHazard = {id:'actual-moderate-beast-wave',kind:'beast_tide',tileId:tile.id,
    createdTick:world.tick-1,expiresTick:world.tick+1,intensity:2};
  world.mapHazards.push(hazard);
  const proof: WorldEvent = {id:`evt-${world.tick}-market-${shipment.id}`,tick:world.tick,year:world.year,month:world.month,
    title:'实际商队货损',description:'原运单结算失败',category:'diplomacy',actorIds:[buyer.id,seller.id],locationId:destination.id};
  const seal = () => sealCaravanSalvage(world,shipment,proof,hazard);
  const act = (actor: Cultivator,restitutionMove: CaravanRestitutionMove,targetRestitutionId: string,extra:Partial<LLMDecisionPayload>={}) =>
    resolveCaravanRestitutionAction(world,actor,{chosenAction:'CARAVAN_RESTITUTION',innerMonologue:'',
      restitutionMove,targetRestitutionId,...extra});
  return {world,buyer,seller,finder,other,minor,origin,destination,site,tile,shipment,hazard,proof,seal,act};
}

describe('caravan restitution preserves one proven real unit',()=>{
  it('requires exact genuine shipment, its actual lost receipt, current decisive moderate beast tide and canonical site',()=>{
    const {world,shipment,hazard,proof,site,seal} = fixture();
    expect(sealCaravanSalvage(world,structuredClone(shipment),proof,hazard)).toBeUndefined();
    expect(sealCaravanSalvage(world,shipment,proof,structuredClone(hazard))).toBeUndefined();
    expect(sealCaravanSalvage(world,shipment,{...proof,id:'wrong-loss-event'},hazard)).toBeUndefined();
    hazard.kind='meteor';
    expect(seal()).toBeUndefined();
    hazard.kind='beast_tide';
    hazard.intensity=3;
    expect(seal()).toBeUndefined();
    hazard.intensity=2;
    const originalTile=hazard.tileId;
    hazard.tileId=world.terrain.tiles.find(tile=>!world.locations.some(location=>terrainTileAt(world,location.x,location.y)?.id===tile.id))!.id;
    expect(seal()).toBeUndefined();
    hazard.tileId=originalTile;
    const [loss] = world.markets.receipts;
    loss.status='returned';
    expect(seal()).toBeUndefined();
    loss.status='lost';
    expect(seal()).toMatchObject({id:`salvage-${shipment.id}`,shipmentId:shipment.id,sourceLossEventId:proof.id,
      siteId:site.id,tileId:hazard.tileId,hazardId:hazard.id,hazardIntensity:2,good:'earth_root',
      originalQuantity:5,destroyedQuantity:4,units:1,status:'buried'});
    expect(seal()).toBeUndefined();
    expect(world.caravanRestitution.lots).toHaveLength(1);
  });

  it.each(['ineligible-good','small-cargo','expired-hazard','not-lost'] as const)('does not create a survivor for %s',variant=>{
    const {world,shipment,hazard,seal} = fixture();
    if (variant==='ineligible-good') shipment.good=world.markets.receipts[0].good='star_bloom';
    if (variant==='small-cargo') shipment.quantity=world.markets.receipts[0].quantity=1;
    if (variant==='expired-hazard') hazard.expiresTick=world.tick;
    if (variant==='not-lost') shipment.status='delivered';
    expect(seal()).toBeUndefined();
    expect(world.caravanRestitution.lots).toEqual([]);
  });

  it('limits actual discovery to a separate adult at the fixed site and seals without transferring anything',()=>{
    const {world,buyer,seller,finder,minor,other,site,seal,act} = fixture();
    const lot=seal()!;
    const wallets=[buyer,seller,finder,minor,other].map(actor=>[actor.spiritStones,actor.herbs.earth_root]);
    expect(act(finder,'discover',lot.id)).toBeNull();
    expect(availableCaravanRestitutionActions(finder,world,world.tick+1)).toEqual([{
      action:'CARAVAN_RESTITUTION',restitutionMove:'discover',targetRestitutionId:lot.id}]);
    expect(availableCaravanRestitutionActions(finder,world,world.tick+2)).toEqual([]);
    ++world.tick;
    seller.locationId=site.id;
    expect(act(seller,'discover',lot.id)).toBeNull();
    expect(act(minor,'discover',lot.id)).toBeNull();
    expect(act(buyer,'discover',lot.id)).toBeNull();
    expect(act(structuredClone(finder),'discover',lot.id)).toBeNull();
    expect(act(finder,'discover',lot.id,{targetLocationId:site.id})).toBeNull();
    expect(act(finder,'discover',lot.id)).toMatchObject({witnessScope:'participants',actorIds:[finder.id]});
    expect(lot).toMatchObject({status:'sealed',finderId:finder.id,discoveredTick:world.tick});
    expect(act(other,'discover',lot.id)).toBeNull();
    expect(act(finder,'return',lot.id)).toBeNull();
    expect(act(seller,'return',lot.id)).toBeNull();
    expect([buyer,seller,finder,minor,other].map(actor=>[actor.spiritStones,actor.herbs.earth_root])).toEqual(wallets);
    expect(world.resourceFlow.months.flatMap(month=>month.entries)).toEqual([]);
  });

  it.each(['finder','seller'] as const)('returns exactly once without touching any refund, via the real %s',mode=>{
    const {world,buyer,seller,finder,other,origin,site,seal,act} = fixture();
    const lot=seal()!;
    ++world.tick;
    expect(act(finder,'discover',lot.id)).not.toBeNull();
    world.tick+=122; // No fabricated spoilage, timeout or return from mere passage of time.
    expect(act(finder,'return',lot.id)).toBeNull();
    expect(lot.status).toBe('sealed');
    seller.locationId=site.id;
    expect(act(other,'return',lot.id)).toBeNull();
    expect(act(finder,'return',lot.id,{marketQuantity:12})).toBeNull();
    if(mode==='seller') finder.locationId=origin.id; // Seller can reclaim by prior proof; finder need not be present.
    const actor=mode==='seller'?seller:finder;
    const cash=[buyer,seller,finder].map(person=>person.spiritStones);
    const stock=[buyer,seller,finder].map(person=>person.herbs.earth_root);
    const result=act(actor,'return',lot.id);
    expect(result).toMatchObject({witnessScope:'participants',locationId:site.id});
    expect(lot).toMatchObject({status:'returned',returnedTick:world.tick,returnedById:actor.id});
    expect(act(actor,'return',lot.id)).toBeNull();
    expect(act(seller,'return',lot.id)).toBeNull();
    expect([buyer,seller,finder].map(person=>person.spiritStones)).toEqual(cash);
    expect([buyer,seller,finder].map(person=>person.herbs.earth_root)).toEqual([stock[0],stock[1]+1,stock[2]]);
    expect(world.resourceFlow.months.flatMap(month=>month.entries)).toMatchObject([{
      kind:'transfer',mechanism:'market',reason:'caravan_restitution',good:'earth_root',amount:1,
      from:{kind:'salvage',id:lot.id},to:{kind:'actor',id:seller.id},visibility:{kind:'participants',actorIds:[seller.id,finder.id]},
    }]);
  });

  it('projects only current local clues and actual finder/seller history, without exposing a raw shipment link to locals',()=>{
    const {world,buyer,seller,finder,other,site,origin,seal,act} = fixture();
    const lot=seal()!;
    expect(visibleCaravanRestitution(world)).toEqual([]);
    expect(visibleCaravanRestitution(world,buyer)).toEqual([]);
    expect(visibleCaravanRestitution(world,seller)).toEqual([]);
    const anonymous=visibleCaravanRestitution(world,other);
    expect(anonymous).toEqual([{id:'local-restoration-1',siteId:site.id,good:'earth_root',units:1,status:'buried',role:'local'}]);
    expect(JSON.stringify(anonymous)).not.toContain(lot.shipmentId);
    ++world.tick;
    expect(act(finder,'discover',lot.id)).not.toBeNull();
    ++world.tick;
    seller.locationId=site.id;
    expect(act(finder,'return',lot.id)).not.toBeNull();
    finder.locationId=seller.locationId=origin.id;
    expect(visibleCaravanRestitution(world,other)).toEqual([]);
    expect(visibleCaravanRestitution(world,buyer)).toEqual([]);
    expect(visibleCaravanRestitution(world,seller)[0].receipt).toMatchObject({shipmentId:lot.shipmentId,returnedBy:'finder'});
    expect(visibleCaravanRestitution(world,finder)[0].receipt).not.toHaveProperty('shipmentId');
    expect(visibleCaravanRestitution(world,finder)[0].receipt).toMatchObject({returnedBy:'finder'});
  });
});
