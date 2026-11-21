import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {createHouseholdState,householdCensus,initializeHouseholds} from '../src/engine/householdEngine';
import {advanceSettlements} from '../src/engine/settlementEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';

const origin='village-loc-vein-north',destination='village-loc-market';
const site=(world:WorldState,id:string)=>world.settlements.villages.find(row=>row.id===id)!;
export function oldSettlementFixture(){
  const world=createInitialWorld(11521,'classic');
  world.tick=24;world.year=1002;world.month=12;
  for(const v of world.settlements.villages)v.stress=v.id===origin?70:v.id===destination?5:13;
  const from=site(world,origin),to=site(world,destination);
  from.juvenileCohorts=[{bornTick:12,count:3}];
  to.juvenileCohorts=[{bornTick:6,count:2}];
  world.households=createHouseholdState();
  initializeHouseholds(world);
  return {world,from,to};
}

describe('ordinary E2-5-era village migration parity',()=>{
  it('carries the same four anonymous adults and preserves origin children, named volunteers and real census totals',()=>{
    const {world,from,to}=oldSettlementFixture();
    const before=[from.population,to.population],children=structuredClone([from.juvenileCohorts,to.juvenileCohorts]);
    const names=structuredClone([from.volunteers,to.volunteers]);
    const rawWorld={...world};
    Reflect.deleteProperty(rawWorld,'villageEvolution');
    const raw=JSON.stringify({format:'ai-sect-sandbox',version:1,world:rawWorld});
    const restored=decodeWorldSave(raw);
    expect(restored.villageEvolution).toEqual({villages:[],migrations:[]});
    expect(restored.settlements).toEqual(world.settlements);
    const result=advanceSettlements(restored);
    expect(restored.villageEvolution.migrations).toEqual([]);
    expect(restored.settlements.records).toEqual([expect.objectContaining({
      id:`settlement-24-migration-${origin}-${destination}`,tick:24,kind:'migration',settlementId:origin,targetSettlementId:destination,people:4,
    })]);
    expect(result.map(event=>event.id)).toEqual([`evt-settlement-24-migration-${origin}-${destination}`]);
    const finalFrom=site(restored,origin),finalTo=site(restored,destination);
    expect([finalFrom.population,finalTo.population]).toEqual([before[0]-4,before[1]+4]);
    expect([finalFrom.juvenileCohorts,finalTo.juvenileCohorts]).toEqual(children);
    expect([finalFrom.volunteers,finalTo.volunteers]).toEqual(names);
    expect(restored.villageCensuses.periods.at(-1)?.closing).toEqual(expect.arrayContaining([
      {villageId:origin,population:before[0]-4,juveniles:3},{villageId:destination,population:before[1]+4,juveniles:2},
    ]));
    const originBook=householdCensus(restored,origin)!;
    const destinationBook=householdCensus(restored,destination)!;
    expect(originBook.groups.reduce((sum,row)=>sum+row.migratedOut,0)).toBe(4);
    expect(destinationBook.groups.reduce((sum,row)=>sum+row.migratedIn,0)).toBe(4);
    expect(decodeWorldSave(encodeWorldSave(restored)).settlements).toEqual(restored.settlements);
  });
});
