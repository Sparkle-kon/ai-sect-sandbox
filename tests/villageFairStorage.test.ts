import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { announcedVillageFair,fairTurn,reservedVillageFair } from './fixtures/villageFairFixture';
import type { WorldState } from '../src/types/world';

function reloaded(world:WorldState){return decodeWorldSave(encodeWorldSave(world));}
function corrupt(raw:string,edit:(world:WorldState)=>void){
  const data=JSON.parse(raw) as {world:WorldState};edit(data.world);
  return ()=>decodeWorldSave(JSON.stringify(data));
}
function realTide(world:WorldState,siteId:string){
  const {x,y}=world.locations.find(row=>row.id===siteId)!;
  return applyMapBrush(applyMapBrush(world,'beast_tide',[{x,y}]),'beast_tide',[{x,y}]);
}

describe('village fairs retain exact independent fee and goods provenance in saves',()=>{
  it('loads old and reserved worlds, preserves a real normal opening and an earlier cancellation with zero invented fees',()=>{
    const old=JSON.parse(encodeWorldSave(createInitialWorld(42))) as {world:Partial<WorldState>};
    delete old.world.villageFairs;
    expect(decodeWorldSave(JSON.stringify(old)).villageFairs).toEqual({fairs:[],nextId:1});
    const genuine=reservedVillageFair(), opened=reloaded(fairTurn(reloaded(genuine.world)));
    expect(opened.villageFairs.fairs[0].stalls.map(row=>row.status)).toEqual(['paid','paid']);
    expect(opened.markets.orders).toEqual(genuine.world.markets.orders);
    const heldCancel=reloaded(fairTurn(realTide(genuine.world,genuine.siteId)));
    expect(heldCancel.villageFairs.fairs[0].stalls.map(row=>row.status)).toEqual(['refunded','refunded']);
    const announced=announcedVillageFair();
    const early=reloaded(fairTurn(realTide(announced.world,announced.siteId)));
    expect(early.villageFairs.fairs[0]).toMatchObject({status:'cancelled',closure:'site_hazard',closedTick:early.tick,stalls:[]});
    expect(early.tick).toBeLessThan(early.villageFairs.fairs[0].opensTick);
  });

  it('rejects extra stock, forged cash, duplicate last seat and mismatch of the actual weather checkpoint',()=>{
    const f=reservedVillageFair(), finished=fairTurn(f.world);
    const good=encodeWorldSave(finished);
    expect(corrupt(good,world=>{world.villageFairs.fairs[0].stalls[0].offering!.quantity++;})).toThrow('villageFairs.stalls.source');
    expect(corrupt(good,world=>{
      world.resourceFlow.months.flatMap(row=>row.entries).find(row=>row.reason==='fair_local_service')!.reason='not_this_fee';
    })).toThrow('villageFairs.fee.source');
    expect(corrupt(good,world=>{world.villageFairs.fairs[0].stalls[1]=world.villageFairs.fairs[0].stalls[0];}))
      .toThrow('villageFairs.stalls.source');
    const storm=encodeWorldSave(fairTurn(realTide(f.world,f.siteId)));
    expect(corrupt(storm,world=>{world.villageFairs.fairs[0].hazard!.tileId='tile-0-0';})).toThrow('villageFairs.hazard');
  });
});
