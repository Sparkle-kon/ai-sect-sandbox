import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceSettlements } from '../src/engine/settlementEngine';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import {
  availableVillageGranaryActions,granaryAt,presentAtVillageGranary,projectVillageGranary,resolveVillageGranaryAction,
} from '../src/engine/villageGranaryEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator,LLMDecisionPayload,VillageGranaryMove } from '../src/types/world';

function villageFixture() {
  const world=createInitialWorld(171774);
  world.tick=27;
  world.month=8;
  const village=world.settlements.villages.find(row=>row.locationId==='loc-market')!;
  const [owner,peer,other,child,away]=world.cultivators;
  for (const actor of [owner,peer,other,child]) {
    actor.locationId=village.locationId; actor.age=25;
    actor.spiritStones=24.5; actor.herbs.earth_root=6;
  }
  child.age=17;
  away.locationId=world.sects[0].headquartersId;
  const move=(actor:Cultivator,granaryMove:VillageGranaryMove,extra:Partial<LLMDecisionPayload>={})=>
    resolveVillageGranaryAction(world,actor,{chosenAction:'VILLAGE_GRANARY',innerMonologue:'只凭原有库存',granaryMove,
      targetSettlementId:village.id,...extra});
  return {world,village,owner,peer,other,child,away,move};
}

describe('unilateral native real granary donation',()=>{
  it('debits only each elected asset, records each proof separately, and retains exact mixed donations',()=>{
    const {world,village,owner,peer,other,move}=villageFixture();
    owner.spiritStones=0;
    peer.herbs.earth_root=0;
    const stock=[village.population,village.stress];
    expect(availableVillageGranaryActions(owner,world).map(row=>row.granaryMove)).toEqual(['donate_roots']);
    expect(availableVillageGranaryActions(peer,world).map(row=>row.granaryMove)).toEqual(['donate_stones']);
    expect(move(owner,'donate')).toBeNull();
    expect(move(owner,'donate_roots')).toMatchObject({witnessScope:'participants',actorIds:[owner.id]});
    expect(move(owner,'donate_roots')).toBeNull();
    expect(move(peer,'donate_stones')).not.toBeNull();
    expect(move(other,'donate')).not.toBeNull();
    expect([owner.herbs.earth_root,owner.spiritStones,peer.herbs.earth_root,peer.spiritStones]).toEqual([4,0,0,16.5]);
    const book=granaryAt(world,village.id)!;
    expect(book).toMatchObject({roots:4,stones:16,donatedRoots:4,donatedStones:16,rootOnlyDonations:1,stoneOnlyDonations:1,
      receipts:[{kind:'donate_roots',actorId:owner.id},{kind:'donate_stones',actorId:peer.id},{kind:'donate',actorId:other.id}]});
    expect(projectVillageGranary(world,owner,village.id)?.receipts.map(({kind,own})=>[kind,own])).toEqual([
      ['donate_roots',true],['donate_stones',undefined],['donate',undefined],
    ]);
    expect([village.population,village.stress]).toEqual(stock);
    expect(world.resourceFlow.months.flatMap(month=>month.entries).map(({reason,good,amount})=>[reason,good,amount])).toEqual([
      ['granary_donation_roots','earth_root',2],['granary_donation_stones','stone',8],
      ['granary_donation','earth_root',2],['granary_donation','stone',8],
    ]);
    expect(decodeWorldSave(encodeWorldSave(world)).villageGranaries).toEqual(world.villageGranaries);
  });

  it('requires actual adult strength of proof, current onsite and no fabricated quantities or concurrent double credit',()=>{
    const {world,village,owner,child,away,move}=villageFixture();
    expect(presentAtVillageGranary(world,owner)?.id).toBe(village.id);
    expect(presentAtVillageGranary(world,child)).toBeUndefined();
    expect(presentAtVillageGranary(world,structuredClone(owner))).toBeUndefined();
    expect(presentAtVillageGranary(world,owner,world.tick+2)).toBeUndefined();
    expect(move(child,'donate_roots')).toBeNull();
    expect(move(away,'donate_stones')).toBeNull();
    expect(move(owner,'donate_roots',{marketQuantity:4})).toBeNull();
    const routes=world.relocations.plans;
    routes.push({status:'in_transit',garrisonIds:[owner.id]} as (typeof routes)[number]);
    expect(presentAtVillageGranary(world,owner)).toBeUndefined();
    expect(move(owner,'donate_stones')).toBeNull();
    expect(granaryAt(world,village.id)).toBeUndefined();
    routes.pop();
    expect(move(owner,'donate_stones')).not.toBeNull();
    expect(move(owner,'donate_roots')).toBeNull();
  });

  it('keeps both native capacities finite independently in a 525-record actual roster without trimming anyone',()=>{
    const {world,village,owner,move}=villageFixture();
    while(world.cultivators.length<525) {
      const i=world.cultivators.length;
      world.cultivators.push({...structuredClone(owner),id:`later-granary-${i}`,name:`新录${i}`});
    }
    const tail=world.cultivators.slice(-22);
    for(const actor of tail.slice(0,10)) expect(move(actor,'donate_roots')).not.toBeNull();
    expect(move(tail[10],'donate_roots')).toBeNull();
    expect(move(tail[10],'donate_stones')).not.toBeNull();
    for(const actor of tail.slice(11,20)) expect(move(actor,'donate_stones')).not.toBeNull();
    expect(move(tail[20],'donate_stones')).toBeNull();
    expect(move(tail[21],'donate')).toBeNull();
    expect(granaryAt(world,village.id)).toMatchObject({roots:20,stones:80,rootOnlyDonations:10,stoneOnlyDonations:10});
    expect(tail[20].spiritStones).toBe(24.5);
    expect(tail[21].herbs.earth_root).toBe(6);
    expect(world.cultivators).toHaveLength(525);
  });

  it('reconciles unilateral funding with real old draw and rejects corrupted amount, counter, and journal corroboration',()=>{
    const {world,village,owner,peer,other,move}=villageFixture();
    const site=world.locations.find(row=>row.id===village.locationId)!;
    const tile=terrainTileAt(world,site.x,site.y)!;
    village.stress=25;
    world.mapHazards.push({id:'real-granary-test-tide',kind:'beast_tide',tileId:tile.id,intensity:2,
      createdTick:world.tick,expiresTick:world.tick+1});
    expect(advanceSettlements(world).some(row=>row.title==='凡村灾情')).toBe(true);
    expect(move(owner,'donate_roots')).not.toBeNull();
    expect(move(peer,'donate_stones')).not.toBeNull();
    expect(move(other,'draw')).not.toBeNull();
    const correct=decodeWorldSave(encodeWorldSave(world));
    const retained=granaryAt(correct,village.id)!;
    expect(retained).toMatchObject({roots:1,stones:4,spentRoots:1,spentStones:4,rootOnlyDonations:1,stoneOnlyDonations:1});
    for(const defect of ['counter','asset','journal'] as const) {
      const broken=structuredClone(correct);
      const ledger=granaryAt(broken,village.id)!;
      if(defect==='counter') ledger.rootOnlyDonations=0;
      if(defect==='asset') ledger.stones++;
      if(defect==='journal') {
        const row=broken.resourceFlow.months.flatMap(month=>month.entries).find(row=>row.reason==='granary_donation_stones')!;
        row.reason='granary_donation_roots';
      }
      expect(()=>encodeWorldSave(broken)).toThrow(/villageGranar/);
    }
  });
});
