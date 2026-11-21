import {describe,expect,it} from 'vitest';
import {householdCensus} from '../src/engine/householdEngine';
import {publicChronicleSceneEvents} from '../src/engine/chronicleLead';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {granaryAt} from '../src/engine/villageGranaryEngine';
import {projectVillageEvolution} from '../src/engine/villageEvolutionEngine';
import type {WorldState} from '../src/types/world';

import {FROM,TO,A,plot,person,town,place,nativeCorridorFixture,wait,turn} from './fixtures/villageEvolutionNativeFixture';
const load=(w:WorldState)=>decodeWorldSave(encodeWorldSave(w));

describe('quarterly real settlement change and anonymous people',()=>{
  it('records independent real freight and well before a town; transfers true supported adults and leaves minors/named and stock',()=>{
    const {w:ready,agreementId}=nativeCorridorFixture();
    const controlled=structuredClone(ready);
    // Controlled stress input against the genuinely built assets. All three
    // qualifying surveys arise via normal monthly settlement sampling.
    const origin=plot(controlled,FROM);
    origin.stress=72;
    const duration=24;
    const supported=wait(controlled,state=>state.villageEvolution.migrations.some(r=>r.fromSettlementId===FROM),duration);
    const move=supported.villageEvolution.migrations.find(r=>r.fromSettlementId===FROM)!;
    expect(move).toMatchObject({agreementId,fromSettlementId:FROM,toSettlementId:TO,people:4,leftJuveniles:3,
      leftNamed:origin.volunteers.filter(row=>!row.enlistedCultivatorId).length});
    expect(move.fromBefore-move.fromAfter).toBe(move.people);
    expect(move.toAfter-move.toBefore).toBe(move.people);
    expect(move.households.reduce((sum,row)=>sum+row.adults,0)).toBe(move.people);
    expect(plot(supported,FROM).juvenileCohorts).toEqual(origin.juvenileCohorts);
    expect(plot(supported,FROM).volunteers.map(row=>row.id)).toEqual(origin.volunteers.map(row=>row.id));
    const census=supported.villageCensuses.periods.find(row=>row.tick===move.tick)!;
    expect(census.movements.find(row=>row.id===move.id)).toMatchObject({kind:'migration',people:4,targetVillageId:TO});
    expect(householdCensus(supported,FROM)?.juveniles).toBe(3);
    expect(granaryAt(supported,FROM)?.roots).toBe(granaryAt(ready,FROM)?.roots);
    expect(granaryAt(supported,TO)?.stones).toBe(granaryAt(ready,TO)?.stones);
    expect(town(supported,TO)).toMatchObject({status:'town',registeredName:plot(ready,TO).name});
    expect(projectVillageEvolution(supported,person(supported,A),plot(ready,TO).name)).toHaveLength(1);
    const restored=load(supported);
    expect(restored.villageEvolution).toEqual(supported.villageEvolution);
    let sealed=restored;
    for(let i=0;i<12;i++)sealed=turn(sealed);
    expect(town(sealed,TO).samples.every(sample=>sample.tick>move.tick)).toBe(true);
    expect(load(sealed).villageEvolution.villages.find(row=>row.settlementId===TO)?.changes[0].growthSamples)
      .toEqual(town(supported,TO).changes[0].growthSamples);

    let blockedSource=controlled;
    while(blockedSource.tick<move.tick-1)blockedSource=turn(blockedSource);
    expect(blockedSource.villageEvolution.migrations.some(row=>row.fromSettlementId===FROM)).toBe(false);
    const middleId=move.path[Math.floor(move.path.length/2)];
    const middle=blockedSource.terrain.tiles.find(tile=>tile.id===middleId)!;
    const point={x:(middle.col+.5)*1000/blockedSource.terrain.columns,
      y:(middle.row+.5)*600/blockedSource.terrain.rows};
    const blocked=turn(applyMapBrush(applyMapBrush(blockedSource,'cursed_miasma',[point]),'cursed_miasma',[point]));
    expect(blocked.tick).toBe(move.tick);
    expect(blocked.villageEvolution.migrations.some(row=>row.tick===move.tick&&row.fromSettlementId===FROM)).toBe(false);
    expect(blocked.settlements.records.some(row=>row.tick===move.tick&&row.kind==='migration'&&
      row.settlementId===FROM&&row.targetSettlementId===TO)).toBe(false);
    expect(town(blocked,TO).samples.at(-1)?.passableCorridors).toBe(0);
    for(const change of ['minors','route','fakeName','double','oldWell'] as const){
      const forged=structuredClone(restored),track=forged.villageEvolution.migrations.find(r=>r.id===move.id)!;
      if(change==='minors')track.leftJuveniles=track.fromAfter+1;
      if(change==='route')track.path.reverse();
      if(change==='fakeName')town(forged,TO).registeredName='冒造的旧地名';
      if(change==='double')forged.villageEvolution.migrations.push(structuredClone(track));
      if(change==='oldWell')town(forged,TO).changes[0].growthSamples![0].wellId='forged-well';
      expect(()=>encodeWorldSave(forged)).toThrow(expect.objectContaining({code:'invalid_world'}));
    }
  });

  it('settles the same mechanics in the model-turn lane and keeps an unknown frontier out of public story',()=>{
    const {w}=nativeCorridorFixture();
    const exactPlace=place(w,TO);
    exactPlace.type='spirit_vein';
    plot(w,FROM).stress=72;
    const reached=wait(w,state=>state.villageEvolution.migrations.some(row=>row.fromSettlementId===FROM),24);
    let base=w;
    while(base.tick<reached.tick-1)base=turn(base);
    const deferred=turn(base,{},'deferred');
    expect(deferred.villageEvolution).toEqual(reached.villageEvolution);
    expect(deferred.settlements).toEqual(reached.settlements);
    const receipt=deferred.villageEvolution.migrations.find(row=>row.tick===deferred.tick&&row.fromSettlementId===FROM)!;
    const move=deferred.events.find(row=>row.id===`evt-${receipt.id}`)!;
    const state=deferred.events.find(row=>row.id===`evt-village-evolution-${TO}-${deferred.tick}`)!;
    expect(move).toMatchObject({witnessScope:'participants'});
    expect(move.locationId).toBeUndefined();
    expect(move.description).not.toContain(plot(deferred,TO).name);
    expect(state).toMatchObject({witnessScope:'participants'});
    expect(publicChronicleSceneEvents(deferred).some(row=>row.id===move.id||row.id===state.id)).toBe(false);
  });

  it('records the last real adult departure and only actual arrival can reoccupy the same old mapped place',()=>{
    const {w:ready}=nativeCorridorFixture(true);
    let pressure=ready;
    // A native mortal disaster leaves no fabricated settlers at the site.
    // Start with one real tracked adult; native evacuation itself is tested
    // in the independent supported cohort test above.
    const marker=place(pressure,FROM);
    pressure=applyMapBrush(pressure,'meteor',[{x:marker.x,y:marker.y}]);
    const ruins=wait(pressure,w=>town(w,FROM)?.status==='ruin',6);
    expect(plot(ruins,FROM).population).toBe(0);
    expect(town(ruins,FROM)).toMatchObject({registeredName:plot(ready,FROM).name,status:'ruin',
      changes:[expect.objectContaining({reason:'depopulated',sourceRecordId:expect.any(String),population:0})]});
    expect(load(ruins).villageEvolution).toEqual(ruins.villageEvolution);
    const refreshed=structuredClone(ruins), receiver=plot(refreshed,FROM);
    const other=plot(refreshed,TO);
    // Controlled stress fork only: actual legacy demographic transfer and
    // actual returned residents, not direct assignment to ruin.population.
    for(const v of refreshed.settlements.villages)if(v.id!==receiver.id&&v.id!==other.id)v.stress=65;
    receiver.stress=4;other.stress=80;
    const inhabited=wait(refreshed,w=>town(w,FROM).status==='village',10);
    expect(plot(inhabited,FROM).population).toBeGreaterThan(0);
    expect(town(inhabited,FROM)).toMatchObject({siteId:marker.id,registeredName:plot(ready,FROM).name,status:'village',
      changes:[expect.objectContaining({reason:'depopulated'}),expect.objectContaining({reason:'actual_return',sourceRecordId:expect.any(String)})]});
    expect(projectVillageEvolution(inhabited,person(inhabited,A),plot(ready,FROM).name)[0]).toMatchObject({siteId:marker.id,status:'village'});
    expect(granaryAt(inhabited,FROM)?.roots).toBe(granaryAt(ready,FROM)?.roots);
    expect(load(inhabited).villageEvolution).toEqual(inhabited.villageEvolution);
  });
});
