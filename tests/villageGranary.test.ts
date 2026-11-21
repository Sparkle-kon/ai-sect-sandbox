import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceSettlements, resolveSettlementAction } from '../src/engine/settlementEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import {
  availableVillageGranaryActions, projectVillageGranary, resolveVillageGranaryAction,
  VILLAGE_GRANARY_CAPACITY, VILLAGE_GRANARY_DISASTER_WINDOW, VILLAGE_GRANARY_RECEIPT_LIMIT,
} from '../src/engine/villageGranaryEngine';
import type { Cultivator, LLMDecisionPayload, VillageGranaryMove } from '../src/types/world';

function fixture() {
  const world=createInitialWorld(6141);
  world.tick=20;
  world.month=8;
  const village=world.settlements.villages.find(item=>item.locationId==='loc-market')!;
  const far=world.settlements.villages.find(item=>item.id!==village.id)!;
  const site=world.locations.find(item=>item.id===village.locationId)!;
  const tile=terrainTileAt(world,site.x,site.y)!;
  const [donor,steward,other,distant,minor] = world.cultivators;
  for (const person of [donor,steward,other,distant,minor]) {
    person.age=28;
    person.locationId=site.id;
    person.spiritStones=50;
    person.herbs.earth_root=10;
    person.herbs.jade_leaf=12;
  }
  minor.age=17;
  distant.locationId=far.locationId;
  const act=(actor: Cultivator,granaryMove: VillageGranaryMove,fields:Partial<LLMDecisionPayload>={}) =>
    resolveVillageGranaryAction(world,actor,{chosenAction:'VILLAGE_GRANARY',innerMonologue:'实物实际清账',
      granaryMove,targetSettlementId:village.id,...fields});
  const disaster=()=>{
    village.stress=24;
    world.mapHazards.push({id:`real-hazard-${world.tick}`,kind:'beast_tide',tileId:tile.id,
      createdTick:world.tick,expiresTick:world.tick+1,intensity:2});
    expect(advanceSettlements(world).some(event=>event.title==='凡村灾情')).toBe(true);
    expect(village.lastDisasterTick).toBe(world.tick);
    return world.tick;
  };
  const fund=()=>{
    expect(act(donor,'donate')).not.toBeNull();
    return world.villageGranaries.granaries.find(item=>item.settlementId===village.id)!;
  };
  const balances=()=>world.resourceFlow.months.flatMap(month=>month.entries);
  return {world,village,far,site,donor,steward,other,distant,minor,act,disaster,fund,balances};
}

describe('public village granary actual inventory',()=>{
  it('does not create inventory before an actual donation, and debits both real assets atomically and once',()=>{
    const {world,village,far,donor,distant,minor,balances,act,fund} = fixture();
    expect(projectVillageGranary(world,donor,village.id)).toMatchObject({siteId:village.locationId,roots:0,stones:0,receipts:[]});
    expect(projectVillageGranary(world,distant,village.id)).toBeUndefined();
    expect(world.villageGranaries.granaries).toEqual([]);
    expect(act(donor,'donate',{targetSettlementId:far.id})).toBeNull();
    expect(act(distant,'donate')).toBeNull();
    expect(act(minor,'donate')).toBeNull();
    expect(act(structuredClone(donor),'donate')).toBeNull();
    expect(act(donor,'donate',{marketQuantity:12})).toBeNull();
    donor.herbs.earth_root=1;
    expect(act(donor,'donate')).toBeNull();
    expect(donor.spiritStones).toBe(50);
    donor.herbs.earth_root=10;
    donor.spiritStones=Infinity;
    expect(act(donor,'donate')).toBeNull();
    expect(donor.herbs.earth_root).toBe(10);
    expect(world.villageGranaries.granaries).toEqual([]);
    donor.spiritStones=50;
    const storage=fund();
    expect(act(donor,'donate')).toBeNull();
    expect([donor.herbs.earth_root,donor.spiritStones]).toEqual([8,42]);
    expect(storage).toMatchObject({settlementId:village.id,roots:2,stones:8,donatedRoots:2,donatedStones:8,
      spentRoots:0,spentStones:0,receipts:[{kind:'donate',tick:world.tick,actorId:donor.id}]});
    expect(balances()).toMatchObject([
      {kind:'transfer',mechanism:'granary',reason:'granary_donation',refId:village.id,good:'earth_root',amount:2,
        from:{kind:'actor',id:donor.id},to:{kind:'granary',id:village.id},visibility:{kind:'participants',actorIds:[donor.id]}},
      {kind:'transfer',mechanism:'granary',reason:'granary_donation',refId:village.id,good:'stone',amount:8},
    ]);
  });

  it('caps actual fixed inventory without touching any rejected contributor',()=>{
    const {world,village,act}=fixture();
    const owners=world.cultivators.slice(0,11);
    for (const actor of owners) {
      actor.age=25;
      actor.locationId=village.locationId;
      actor.herbs.earth_root=2;
      actor.spiritStones=8;
    }
    for (const donor of owners.slice(0,10)) expect(act(donor,'donate')).not.toBeNull();
    const rejected=owners[10];
    expect(act(rejected,'donate')).toBeNull();
    expect([rejected.herbs.earth_root,rejected.spiritStones]).toEqual([2,8]);
    expect(world.villageGranaries.granaries[0]).toMatchObject(VILLAGE_GRANARY_CAPACITY);
    expect(world.villageGranaries.granaries[0].receipts).toHaveLength(10);
  });

  it('reconciles one actual current shortage without personal relief, population, or honor',()=>{
    const {world,village,donor,steward,other,disaster,balances,act,fund}=fixture();
    const actualDisaster=disaster();
    const book=fund();
    const stress=village.stress, population=village.population, willingness=village.volunteers.map(person=>person.willingness);
    const accounts=[donor,steward,other].map(person=>[person.spiritStones,person.herbs.earth_root,person.contribution,person.karma]);
    const personalReliefBefore=world.settlements.records.filter(record=>record.kind==='relief').length;
    expect(act(donor,'draw')).toBeNull(); // Same actor & village already acted in this turn.
    expect(act(steward,'draw')).toMatchObject({locationId:village.locationId,witnessScope:'participants',actorIds:[steward.id]});
    expect(act(other,'draw')).toBeNull();
    expect(act(steward,'donate')).toBeNull();
    expect(village.stress).toBe(stress-8);
    expect(village.population).toBe(population);
    expect(village.volunteers.map(person=>person.willingness)).toEqual(willingness);
    expect(village.lastReliefTick).toBe(world.tick);
    expect(world.settlements.records.filter(record=>record.kind==='relief')).toHaveLength(personalReliefBefore);
    expect([donor,steward,other].map(person=>[person.spiritStones,person.herbs.earth_root,person.contribution,person.karma])).toEqual(accounts);
    expect(book).toMatchObject({roots:1,stones:4,spentRoots:1,spentStones:4,lastDrawTick:world.tick});
    expect(book.receipts.at(-1)).toEqual({kind:'draw',tick:world.tick,actorId:steward.id,disasterTick:actualDisaster,
      stressBefore:stress,stressAfter:stress-8});
    expect(balances().filter(row=>row.kind==='consumption')).toMatchObject([
      {kind:'consumption',mechanism:'granary',reason:'granary_draw',refId:village.id,good:'earth_root',amount:1,from:{kind:'granary',id:village.id}},
      {kind:'consumption',mechanism:'granary',reason:'granary_draw',refId:village.id,good:'stone',amount:4,from:{kind:'granary',id:village.id}},
    ]);
    expect(projectVillageGranary(world,other)?.receipts).toEqual([
      {kind:'donate',tick:world.tick},{kind:'draw',tick:world.tick,disasterTick:actualDisaster,stressBefore:stress,stressAfter:stress-8},
    ]);
    expect(projectVillageGranary(world,steward)?.receipts.at(-1)).toMatchObject({own:true});
    expect(resolveSettlementAction(world,other,{chosenAction:'DELIVER_RELIEF',innerMonologue:'',targetSettlementId:village.id})).toBeNull();
  });

  it('cannot spend against a marker alone, stale actual advance, cooldown, old disaster, or zero survivors',()=>{
    const {world,village,steward,disaster,act,fund}=fixture();
    const book=fund();
    village.stress=55;
    village.lastDisasterTick=world.tick;
    world.settlements.lastAdvancedTick=world.tick;
    expect(act(steward,'draw')).toBeNull();
    delete village.lastDisasterTick;
    delete world.settlements.lastAdvancedTick;
    const hit=disaster();
    ++world.tick;
    expect(act(steward,'draw')).toBeNull(); // New point requires a new real authoritative settlement tick.
    advanceSettlements(world);
    expect(availableVillageGranaryActions(steward,world,world.tick+1)).toContainEqual({
      action:'VILLAGE_GRANARY',granaryMove:'draw',targetSettlementId:village.id});
    expect(availableVillageGranaryActions(steward,world,world.tick+2)).toEqual([]);
    const population=village.population;
    village.population=0;
    expect(act(steward,'draw')).toBeNull();
    village.population=population;
    village.lastReliefTick=world.tick;
    expect(act(steward,'draw')).toBeNull();
    world.tick=hit+VILLAGE_GRANARY_DISASTER_WINDOW+1;
    advanceSettlements(world);
    expect(act(steward,'draw')).toBeNull();
    expect(book).toMatchObject({roots:2,stones:8,spentRoots:0,spentStones:0});
  });

  it('preserves exact assets and book if a named origin is not a physical stop',()=>{
    const {world,village,steward,act,disaster,fund}=fixture();
    disaster();
    const book=fund();
    const now=structuredClone(book);
    const plans=world.relocations.plans;
    plans.push({status:'in_transit',garrisonIds:[steward.id]} as (typeof plans)[number]);
    expect(act(steward,'donate')).toBeNull();
    expect(act(steward,'draw')).toBeNull();
    expect(projectVillageGranary(world,steward,village.id)).toBeUndefined();
    expect([steward.spiritStones,steward.herbs.earth_root]).toEqual([50,10]);
    expect(book).toEqual(now);
  });

  it('bounds old attributed receipt rows, not cumulative donated or remaining actual stock',()=>{
    const {world,village,donor,other,act,fund}=fixture();
    const book=fund();
    const old=Array.from({length:VILLAGE_GRANARY_RECEIPT_LIMIT},(_,index) =>
      ({kind:'donate' as const,tick:index,actorId:donor.id}));
    world.tick=VILLAGE_GRANARY_RECEIPT_LIMIT+1;
    book.receipts=old;
    expect(act(other,'donate')).not.toBeNull();
    expect(act(other,'donate')).toBeNull();
    expect(book.receipts).toHaveLength(VILLAGE_GRANARY_RECEIPT_LIMIT);
    expect(book.receipts[0].tick).toBe(1);
    expect(book.receipts.at(-1)).toEqual({kind:'donate',tick:world.tick,actorId:other.id});
    expect(projectVillageGranary(world,donor,village.id)).toMatchObject({roots:4,stones:16,donatedRoots:4,donatedStones:16});
  });
});
