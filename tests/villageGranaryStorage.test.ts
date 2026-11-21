import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceSettlements } from '../src/engine/settlementEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { resolveVillageGranaryAction } from '../src/engine/villageGranaryEngine';
import type { VillageGranaryMove, WorldState } from '../src/types/world';

function staffedGranary() {
  const world = createInitialWorld(1653);
  const initial = encodeWorldSave(world);
  const village = world.settlements.villages[0];
  const site = world.locations.find(({id}) => id === village.locationId)!;
  const actor = world.cultivators[0];
  actor.locationId = site.id;
  actor.age = 50;
  actor.herbs.earth_root = 6;
  actor.spiritStones = 40.5;
  const act = (granaryMove: VillageGranaryMove) => resolveVillageGranaryAction(world, actor,
    { chosenAction:'VILLAGE_GRANARY',innerMonologue:'',granaryMove,targetSettlementId:village.id });
  expect(act('donate')).not.toBeNull();
  world.tick += 1;
  world.month += 1;
  village.stress = 38.5;
  const tileId = terrainTileAt(world, site.x, site.y)!.id;
  world.mapHazards.push({id:'warehouse-hazard',kind:'beast_tide',tileId,intensity:2,
    createdTick:world.tick,expiresTick:world.tick+2});
  advanceSettlements(world);
  expect(act('draw')).not.toBeNull();
  return { world, initial };
}

function alter(save: string, mutate: (world: WorldState) => void) {
  const parsed = JSON.parse(save) as { world: WorldState };
  mutate(parsed.world);
  return () => decodeWorldSave(JSON.stringify(parsed));
}

describe('public granary save evidence', () => {
  it('loads an older same-version save with no fabricated reserve and round-trips actual finite stocks and fractional stress', () => {
    const {world, initial} = staffedGranary();
    const older = JSON.parse(initial) as {world: Partial<WorldState>};
    delete older.world.villageGranaries;
    expect(decodeWorldSave(JSON.stringify(older)).villageGranaries).toEqual({granaries:[]});
    const loaded = decodeWorldSave(encodeWorldSave(world));
    expect(loaded.villageGranaries).toEqual(world.villageGranaries);
    expect(loaded.resourceFlow).toEqual(world.resourceFlow);
    const {roots,stones,receipts} = loaded.villageGranaries.granaries[0];
    expect({roots,stones}).toEqual({roots:1,stones:4});
    expect(receipts.at(-1)).toMatchObject({kind:'draw',stressBefore:64.5,stressAfter:56.5});
  });

  it('rejects out-of-conservation inventories, duplicate villages or fabricated sources', () => {
    const {world} = staffedGranary();
    const save = encodeWorldSave(world);
    expect(alter(save, (w) => { w.villageGranaries.granaries[0].stones++; })).toThrow('villageGranaries.inventory');
    expect(alter(save, (w) => { w.villageGranaries.granaries.push(w.villageGranaries.granaries[0]); })).toThrow('villageGranaries.inventory');
    expect(alter(save, (w) => { w.villageGranaries.granaries[0].receipts[0].actorId = 'not-a-person'; })).toThrow('villageGranaries.receipts.source');
    expect(alter(save, (w) => {
      const draw = w.villageGranaries.granaries[0].receipts.at(-1);
      if (draw?.kind !== 'draw') throw new Error('missing fixture draw');
      draw.disasterTick = draw.tick + 1;
    })).toThrow('villageGranaries.receipts.draw');
  });

  it('rejects disguised awards, other recipients, and missing exact book counterparts while detail is retained', () => {
    const {world} = staffedGranary();
    const save = encodeWorldSave(world);
    expect(alter(save, (w) => {
      const entry = w.resourceFlow.months[0].entries.find((row) => row.mechanism === 'granary');
      if (entry?.kind !== 'transfer') throw new Error('missing donation');
      entry.to = {kind:'actor',id:w.cultivators[1].id};
    })).toThrow('villageGranaries.journal.coordinates');
    expect(alter(save, (w) => {
      const book = w.resourceFlow.months[0];
      book.entries = book.entries.filter(({mechanism}) => mechanism !== 'granary');
      book.totalEntries = book.entries.length;
    })).toThrow('villageGranaries.journal.missing');
  });
});
