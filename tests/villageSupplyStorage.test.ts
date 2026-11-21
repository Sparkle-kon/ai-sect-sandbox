import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { findMapPath } from '../src/engine/mapMotionEngine';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { granaryAt,resolveVillageGranaryAction } from '../src/engine/villageGranaryEngine';
import { resolveVillageSupplyAction } from '../src/engine/villageSupplyEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload,WorldState } from '../src/types/world';

function dispatched() {
  const world=createInitialWorld(725);
  const candidates=world.settlements.villages.map((village)=>({village,site:world.locations.find((site)=>site.id===village.locationId)!}));
  const pair=candidates.flatMap((from)=>candidates.filter((to)=>from!==to).flatMap((to)=>{
    const tiles=findMapPath(world,from.site,to.site,(tile)=>tile.biome!=='魔渊').map((point)=>terrainTileAt(world,point.x,point.y)?.id);
    const count=new Set(tiles).size;
    return count>=2 && count<=12 ? [{from,to,count}] : [];
  })).sort((a,b)=>a.count-b.count)[0];
  expect(pair).toBeDefined();
  const [a,b]=world.cultivators;
  const known=world.terrain.tiles.map((tile)=>tile.id);
  for(const [actor,site] of [[a,pair.from.site],[b,pair.to.site]] as const) {
    actor.age=35;
    actor.locationId=site.id;
    actor.spiritStones=100;
    actor.herbs.earth_root=12;
    actor.exploredTileIds=[...known];
  }
  const sourceId=pair.from.village.id,targetId=pair.to.village.id;
  for (let count=0;count<2;count++) {
    expect(resolveVillageGranaryAction(world,a,{chosenAction:'VILLAGE_GRANARY',granaryMove:'donate_roots',
      targetSettlementId:sourceId,innerMonologue:''})).not.toBeNull();
    expect(resolveVillageGranaryAction(world,b,{chosenAction:'VILLAGE_GRANARY',granaryMove:'donate_stones',
      targetSettlementId:targetId,innerMonologue:''})).not.toBeNull();
    world.tick++;world.month++;
  }
  expect(resolveVillageSupplyAction(world,a,{chosenAction:'VILLAGE_SUPPLY',villageSupplyMove:'offer',
    targetSettlementId:targetId,innerMonologue:''})).not.toBeNull();
  world.tick++;world.month++;
  const pact=world.villageSupply.agreements[0];
  expect(resolveVillageSupplyAction(world,b,{chosenAction:'VILLAGE_SUPPLY',villageSupplyMove:'accept',
    targetVillageSupplyId:pact.id,innerMonologue:''})).not.toBeNull();
  return {world,sourceId,targetId,pact};
}

function corrupt(save:string,mutation:(state:WorldState)=>void) {
  const copy=JSON.parse(save) as {world:WorldState};
  mutation(copy.world);
  return () => decodeWorldSave(JSON.stringify(copy));
}

describe('durable actual village supply transport',()=>{
  it('imports an older save and verifies outbound, arrived and restored checkpoints with net stock conservation',()=>{
    const previous=JSON.parse(encodeWorldSave(createInitialWorld(14))) as {world:Partial<WorldState>};
    delete previous.world.villageSupply;
    expect(decodeWorldSave(JSON.stringify(previous)).villageSupply).toEqual({agreements:[],nextId:1});
    const {world,sourceId,targetId,pact}=dispatched();
    let resumed=decodeWorldSave(encodeWorldSave(world));
    expect(resumed.villageSupply.agreements[0]).toEqual(pact);
    expect(granaryAt(resumed,sourceId)).toMatchObject({roots:2,stones:0});
    expect(granaryAt(resumed,targetId)).toMatchObject({roots:0,stones:8});
    for(let step=0;step<(pact.path?.length ?? 0)-1;step++){
      const orders=Object.fromEntries(resumed.cultivators.map((row)=>[row.id,{chosenAction:'REST',innerMonologue:''} satisfies LLMDecisionPayload]));
      resumed=decodeWorldSave(encodeWorldSave(advanceWorldTick(resumed,orders,()=>.99)));
    }
    expect(resumed.villageSupply.agreements[0].legs?.map(({phase})=>phase)).toEqual(['delivered','delivered']);
    expect(granaryAt(resumed,sourceId)).toMatchObject({roots:2,stones:8});
    expect(granaryAt(resumed,targetId)).toMatchObject({roots:2,stones:8});
  });

  it('rejects a switched route, forged cargo receipt or changed in-transit account',()=>{
    const {world}=dispatched();
    const saved=encodeWorldSave(world);
    expect(corrupt(saved,(state)=>{state.villageSupply.agreements[0].path!.reverse();})).toThrow('villageSupply.agreements.path');
    expect(corrupt(saved,(state)=>{state.villageSupply.agreements[0].legs![0].checkpoint++;})).toThrow('villageSupply.legs.checkpoint');
    expect(corrupt(saved,(state)=>{
      const charge=state.resourceFlow.months.flatMap((row)=>row.entries).find((row)=>row.reason==='village_supply_transport');
      if(charge && 'from' in charge) charge.from.id=state.cultivators.at(-1)!.id;
    })).toThrow('villageSupply.journal.custody');
    expect(corrupt(saved,(state)=>{state.villageGranaries.granaries[0].roots++;})).toThrow('villageGranaries.inventory');
  });
});
