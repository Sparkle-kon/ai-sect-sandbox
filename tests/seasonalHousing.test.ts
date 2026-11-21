import {describe,expect,it} from 'vitest';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {householdCensus} from '../src/engine/householdEngine';
import {availableSeasonalHousingActions,projectSeasonalHousing} from '../src/engine/seasonalHousingEngine';
import {action,actor,housing,housingFixture,occupiedHousing,step} from './fixtures/seasonalHousingFixture';

describe('native seasonal household lodging without census residency',()=>{
  it('uses real built capacity, separate consent and arrival, then releases only after native actual departure',()=>{
    const f=occupiedHousing(),{world}=f;
    const before=householdCensus(world,f.settlementId);
    const exit=step(world,{[f.guestId]:action('EXPLORE',{targetLocationId:f.originId})});
    expect(exit.seasonalHousing.claims[0]).toMatchObject({status:'moved_out',departure:{tick:exit.tick,fromSiteId:f.siteId,toSiteId:f.originId}});
    expect(actor(exit,f.guestId).locationId).toBe(f.originId);
    expect(householdCensus(exit,f.settlementId)).toEqual(before);
    const outsider=exit.cultivators.find(row=>row.id!==f.hostId&&row.id!==f.guestId)!;
    expect(projectSeasonalHousing(exit,outsider)).toEqual([]);
    expect(projectSeasonalHousing(exit,actor(exit,f.hostId))).toHaveLength(1);
    expect(exit.cultivators).toHaveLength(world.cultivators.length);
  });

  it('frees the authentic room for a later season without erasing earlier presence or departure',()=>{
    const f=occupiedHousing();
    let world=step(f.world,{[f.guestId]:action('EXPLORE',{targetLocationId:f.originId})});
    const original=structuredClone(world.seasonalHousing.claims[0]);
    expect(original.departure?.toSiteId).toBe(f.originId);
    const repeat={targetHousingHouseholdId:f.householdId,targetCultivatorId:f.guestId};
    // Move-out leaves the actual guest elsewhere. A new offer still waits until the next lawful quarter window.
    while((world.month)%3===2)world=step(world);
    world=step(world,{[f.hostId]:housing('offer',repeat)});
    expect(world.seasonalHousing.claims).toHaveLength(2);
    expect(world.seasonalHousing.claims[0]).toEqual(original);
    expect(world.seasonalHousing.claims[1]).toMatchObject({status:'offered',householdId:f.householdId});
  });

  it('does not turn season expiry into a departure or move anybody',()=>{
    const f=occupiedHousing();
    let {world}=f;
    const end=world.seasonalHousing.claims[0].seasonEndTick;
    while(world.tick<end)world=step(world);
    expect(world.seasonalHousing.claims[0]).toMatchObject({status:'closed',reason:'season_ended',endedTick:end});
    expect(world.seasonalHousing.claims[0].departure).toBeUndefined();
    expect(actor(world,f.guestId).locationId).toBe(f.siteId);
  });

  it('closes unsafe actual accommodation without fabricating a move-out at the hazard',()=>{
    const f=occupiedHousing(),site=f.world.locations.find(row=>row.id===f.siteId)!;
    const bad=applyMapBrush(applyMapBrush(f.world,'cursed_miasma',[site]),'cursed_miasma',[site]);
    const closed=step(bad);
    expect(closed.seasonalHousing.claims[0]).toMatchObject({status:'closed',reason:'unsafe_shelter',hazard:{intensity:2}});
    expect(closed.seasonalHousing.claims[0].departure).toBeUndefined();
    expect(actor(closed,f.guestId).locationId).toBe(f.siteId);
  });

  it('does not accept supposed spare space without actual completed native shelter or real host identity',()=>{
    const f=housingFixture(),{world}=f;
    const stranger=world.cultivators.find(row=>row.id!==f.hostId&&row.id!==f.guestId)!;
    stranger.name=actor(world,f.hostId).name;
    stranger.locationId=f.siteId;
    expect(availableSeasonalHousingActions(stranger,world,world.tick+1)).toEqual([]);
    world.villageWorks.projects=[];
    expect(availableSeasonalHousingActions(actor(world,f.hostId),world,world.tick+1)).toEqual([]);
  });
});
