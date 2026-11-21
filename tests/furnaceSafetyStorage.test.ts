import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { damageFurnacesFromBeastTide, resolveFurnaceSafetyAction } from '../src/engine/furnaceSafetyEngine';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import type { FurnaceSafetyMove, WorldState } from '../src/types/world';

function precedent() {
  let world = createInitialWorld(1981);
  const sect = world.sects[0];
  const original = world.locations.find(({id}) => id===sect.headquartersId)!;
  world = applyMapBrush(world,'beast_tide',[{x:original.x,y:original.y}]);
  world = applyMapBrush(world,'beast_tide',[{x:original.x,y:original.y}]);
  const hazard = world.mapHazards.find(({kind}) => kind==='beast_tide')!;
  const actor = world.cultivators.find(({id}) => id===sect.leaderId)!;
  actor.locationId = original.id;
  actor.spiritStones = 80;
  actor.herbs.earth_root = 6;
  world.tick++;
  expect(damageFurnacesFromBeastTide(world,hazard)).toHaveLength(1);
  const repair = world.furnaceSafety.cases[0];
  const act = (furnaceSafetyMove: FurnaceSafetyMove) =>
    resolveFurnaceSafetyAction(world,actor,{chosenAction:'FURNACE_SAFETY',innerMonologue:'',furnaceSafetyMove,targetFurnaceSafetyId:repair.id});
  world.tick = hazard.expiresTick;
  expect(act('inspect')).not.toBeNull();
  world.tick++;
  expect(act('repair')).not.toBeNull();
  world.tick++;
  expect(act('reopen')).not.toBeNull();
  return { world,repair };
}

function corrupt(save: string, update: (world: WorldState) => void) {
  const copy = JSON.parse(save) as {world:WorldState};
  update(copy.world);
  return () => decodeWorldSave(JSON.stringify(copy));
}

describe('saved furnace facility proofs', () => {
  it('reads an old save unchanged and retains genuine impact, expenditure and later reopening records',()=>{
    const bare = createInitialWorld(19);
    const old = JSON.parse(encodeWorldSave(bare)) as {world:Partial<WorldState>};
    delete old.world.furnaceSafety;
    expect(decodeWorldSave(JSON.stringify(old)).furnaceSafety).toEqual({nextId:1,cases:[]});
    const {world,repair} = precedent();
    const persisted = decodeWorldSave(encodeWorldSave(world));
    expect(persisted.furnaceSafety.cases[0]).toEqual(repair);
    expect(repair.integrity).toBe(90);
    expect(repair.receipts.map(({kind})=>kind)).toEqual(['inspect','repair','reopen']);
    expect(persisted.resourceFlow).toEqual(world.resourceFlow);
  });

  it('rejects forged site proof, skipped rehabilitation, fake opening and incorrect personal supply debit',()=>{
    const save = encodeWorldSave(precedent().world);
    expect(corrupt(save, (world) => { world.furnaceSafety.cases[0].hazardTileId = 'not-on-this-site'; }))
      .toThrow('furnaceSafety.cases.impact');
    expect(corrupt(save, (world) => { world.furnaceSafety.cases[0].receipts.shift(); }))
      .toThrow('furnaceSafety.cases.receipts');
    expect(corrupt(save, (world) => { world.furnaceSafety.cases[0].reopenedTick!++; }))
      .toThrow('furnaceSafety.cases.reopen');
    expect(corrupt(save, (world) => {
      world.resourceFlow.months.flatMap(({entries})=>entries).find((entry)=>entry.reason==='furnace_safety_repair')!.amount++;
    })).toThrow('furnaceSafety.journal.custody');
  });
});
