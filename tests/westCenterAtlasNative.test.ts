import {describe,expect,it} from 'vitest';
import {prepareEraCheckpoint,verifyEraCheckpoint,type EraOutputFile} from '../src/engine/eraCheckpointEngine';
import {inspectPhysicalAtlas,projectPhysicalAtlas} from '../src/engine/physicalAtlasEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {moveWestTrip,runNativeWestCenterCrossing,tripActor,WEST_TRIP_COMPANION,WEST_TRIP_PAYER} from './fixtures/westCenterNativeFixture';
import type {WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const input=({bytes}:EraOutputFile)=>({size:bytes.byteLength,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
async function restore(world:WorldState,branchId:string){
  const output=await prepareEraCheckpoint(world,{branchId,label:'实走旧西中界'},codec,{engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
  const reloaded=await verifyEraCheckpoint(input(output.manifestFile),output.parts.map(input).reverse(),codec);
  expect(encodeEraWorldSave(reloaded.world)).toBe(encodeEraWorldSave(world));
  return reloaded.world;
}

describe('E4-1: actual paid crossing through the old west–center border',()=>{
  it('distinguishes chart geometry, a funded road, a paid/moved journey, and a genuine reverse stride',async()=>{
    const proof=runNativeWestCenterCrossing();
    expect([proof.initialSurveyTick,proof.surveyedTick,proof.roadCharteredTick,proof.ready.tick,proof.arrived.tick,proof.finished.tick])
      .toEqual([5,11,13,16,17,21]);
    expect(inspectPhysicalAtlas(proof.ready).regions.map(row=>row.id)).toEqual(['west','center','east']);
    const ready=await restore(proof.ready,'ready-road');
    const roadFor=(world:WorldState)=>inspectPhysicalAtlas(world).routes.find(row=>row.id===proof.roadId);
    expect(roadFor(ready)).toMatchObject({status:'established',traversals:[]});
    const actual=moveWestTrip(ready,proof.roadId);
    expect(encodeEraWorldSave(actual)).toEqual(encodeEraWorldSave(proof.arrived));
    expect(roadFor(actual)).toMatchObject({status:'traversed',traversals:[{kind:'road_crossing',refId:'crossing-2',observedTick:17,
      borders:[{from:{regionId:'west',address:{chartId:'lower-base',tileId:'tile-8-12'}},
        to:{regionId:'center',address:{chartId:'lower-base',tileId:'tile-9-12'}}}]}]});
    const notPaid=moveWestTrip(ready);
    expect(notPaid.roads.crossings).toHaveLength(0);
    expect(roadFor(notPaid)).toMatchObject({status:'established',traversals:[]});
    const reverse=await restore(proof.returnInitial,'actually-on-return');
    expect(proof.returnBoundary).toMatchObject({index:4,from:{id:'tile-9-12',region:'center'},to:{id:'tile-8-12',region:'west'}});
    expect(proof.reverseProgress).toEqual([{tick:18,index:5,tile:'tile-7-12'},{tick:19,index:10,tile:'tile-4-10'},{tick:20,index:15,tile:'tile-4-5'}]);
    const nextDirect=moveWestTrip(proof.returnInitial), nextPortable=moveWestTrip(reverse);
    expect(encodeEraWorldSave(nextPortable)).toBe(encodeEraWorldSave(nextDirect));
    for(const id of [WEST_TRIP_PAYER,WEST_TRIP_COMPANION]){
      const nearby=projectPhysicalAtlas(reverse,tripActor(reverse,id));
      expect(nearby?.home).toMatchObject({point:{address:{chartId:'lower-base',tileId:'tile-7-12'},regionId:'west'}});
      expect(nearby?.home?.locationId).toBeUndefined();
      expect(nearby?.routes).toContainEqual(expect.objectContaining({status:'traversed',id:'road-1'}));
    }
    const distant=reverse.cultivators.find(row=>row.alive&&row.locationId==='loc-tianji')!;
    expect(distant).toBeDefined();
    const distantAtlas=projectPhysicalAtlas(reverse,distant);
    expect(distantAtlas?.home?.point.regionId).toBe('east');
    expect(distantAtlas?.regions).not.toContain('west');
    expect(distantAtlas?.routes).toEqual([]);
    const done=await restore(proof.finished,'real-west-arrival');
    expect(done.pilgrimages.journeys.find(row=>row.id===proof.journeyId)).toMatchObject({status:'completed',spentByEach:16,
      stopsVisited:[{locationId:'loc-danxia',tick:15},{locationId:'loc-market',tick:17},{locationId:'loc-taixu',tick:21}]});
    expect(done.roads.crossings).toHaveLength(1); // The truthful reverse trek is not another toll or cadastral claim.
  });
});
