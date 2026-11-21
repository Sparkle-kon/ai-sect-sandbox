import {describe,expect,it} from 'vitest';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {action,actor,housingFixture,occupiedHousing,step} from './fixtures/seasonalHousingFixture';

function alter(raw:string, change:(world:WorldState)=>void){
  const record:{world:WorldState}=JSON.parse(raw);change(record.world);
  return ()=>decodeWorldSave(JSON.stringify(record));
}
describe('housing save evidence separates rooms, arrival, residence and departure',()=>{
  it('loads earlier saves without a claim and round-trips the two actual endpoints and finite term',()=>{
    const f=housingFixture(), old:{world:Partial<WorldState>}=JSON.parse(encodeWorldSave(f.world));
    delete old.world.seasonalHousing;
    expect(decodeWorldSave(JSON.stringify(old)).seasonalHousing).toEqual({claims:[],nextId:1});
    const current=occupiedHousing();
    const left=step(current.world,{[current.guestId]:action('EXPLORE',{targetLocationId:current.originId})});
    const decoded=decodeWorldSave(encodeWorldSave(left));
    const row=decoded.seasonalHousing.claims[0];
    expect(row).toMatchObject({status:'moved_out',departure:{fromSiteId:current.siteId,toSiteId:current.originId}});
    expect(decoded.seasonalHousing).toEqual(left.seasonalHousing);
    expect(decoded.households).toEqual(left.households);
  });

  it('fails closed on falsely attributed physical departure, household authority, or sleeping entitlement',()=>{
    const f=occupiedHousing();
    const left=step(f.world,{[f.guestId]:action('EXPLORE',{targetLocationId:f.originId})});
    const raw=encodeWorldSave(left);
    expect(alter(raw,w=>{w.seasonalHousing.claims[0].departure!.toSiteId=f.siteId;}))
      .toThrow('seasonalHousing.claims.movement');
    expect(alter(raw,w=>{w.seasonalHousing.claims[0].shelterProjectId='never-completed';}))
      .toThrow('seasonalHousing.claims.source');
    expect(alter(raw,w=>{delete w.seasonalHousing.claims[0].acceptedTick;}))
      .toThrow('seasonalHousing.claims.booking');
    expect(alter(raw,w=>{w.events.find(e=>e.id.endsWith('-moved_out'))!.witnessScope=undefined;}))
      .toThrow('seasonalHousing.claims.movement');
  });

  it('reopens an actually closed unsafe room without a fabricated departure even after the brush hazard clears',()=>{
    const f=occupiedHousing();
    const site=f.world.locations.find(v=>v.id===f.siteId)!;
    let world=step(applyMapBrush(applyMapBrush(f.world,'cursed_miasma',[site]),'cursed_miasma',[site]));
    const hazard=world.seasonalHousing.claims[0].hazard!;
    while(world.tick<=hazard.expiresTick)world=step(world);
    expect(world.mapHazards.find(({id})=>id===hazard.id)).toBeUndefined();
    const decoded=decodeWorldSave(encodeWorldSave(world));
    expect(decoded.seasonalHousing.claims[0]).toMatchObject({status:'closed',hazard,reason:'unsafe_shelter'});
    expect(decoded.seasonalHousing.claims[0].departure).toBeUndefined();
    expect(actor(decoded,f.guestId).locationId).toBe(f.siteId);
  });
});
