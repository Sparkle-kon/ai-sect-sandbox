import {describe,expect,it} from 'vitest';
import {advanceAlignedWeather,availableAlignedWeatherActions,projectAlignedWeather,projectLocalAlignedWeather,resolveAlignedWeatherAction}
  from '../src/engine/alignedWeatherEngine';
import {advanceFieldObservatories,availableObservatoryFundingActions,projectFieldObservatory,resolveObservatoryAction}
  from '../src/engine/fieldObservatoryEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {localQiWeather} from '../src/engine/weatherEngine';
import {comparedAlignedWeather,fundedAlignedWeather,measuredAlignedWeather,offeredAlignedWeather,paidReading,weatherCompare,weatherPayload,
  weatherPerson,weatherSite} from './fixtures/alignedWeatherFixture';
import type {WorldState} from '../src/types/world';

const comparison=(world:WorldState)=>world.alignedWeather.comparisons[0];

describe('canonical paid aligned weather reports',()=>{
  it('authorizes a separate native same-tile instrument only at funding and measures its actual atmosphere',()=>{
    const f=fundedAlignedWeather(),{world}=f,station=paidReading(world,f.peerId,f.openedTick).station!;
    const site=weatherSite(world,f.siteId);
    expect(station.kind).toBe('edge');
    expect(terrainTileAt(world,station.x,station.y)?.id).toBe(terrainTileAt(world,site.x,site.y)?.id);
    expect(Math.hypot(station.x-site.x,station.y-site.y)).toBeLessThanOrEqual(24);
    expect(availableObservatoryFundingActions(weatherPerson(world,f.peerId),world)).toEqual([]);
    world.tick+=2;world.month+=2;
    const peer=weatherPerson(world,f.peerId);
    const base={observatoryMove:'measure' as const,targetLocationId:f.siteId,targetObservatoryTick:f.openedTick};
    expect(resolveObservatoryAction(world,peer,weatherPayload('FIELD_OBSERVATORY',{...base,observatoryStation:'edge'}))).toBeNull();
    expect(resolveObservatoryAction(world,peer,weatherPayload('FIELD_OBSERVATORY',base))).not.toBeNull();
    const {kind,intensity}=localQiWeather(world,{...site,x:station.x,y:station.y});
    expect(paidReading(world,f.peerId,f.openedTick)).toMatchObject({status:'measured',reading:{kind,intensity}});
    expect(projectFieldObservatory(world,peer).runs[0].station).toBe('edge');
  });

  it('never leaks peer readings/counts or assumes an invitee has native evidence before explicit assent',()=>{
    const f=offeredAlignedWeather(true,'absent'),{world}=f;
    const a=weatherPerson(world,f.proposerId),b=weatherPerson(world,f.peerId),outside=weatherPerson(world,f.outsiderId);
    expect(projectAlignedWeather(world,outside)).toEqual([]);
    expect(projectLocalAlignedWeather(world,outside)).toBeUndefined();
    expect(projectAlignedWeather(world,a)[0].first).toBeDefined();
    expect(projectAlignedWeather(world,b)[0].first).toBeUndefined();
    expect(projectAlignedWeather(world,b)[0].second).toBeUndefined();
    world.tick++;
    expect(availableAlignedWeatherActions(b,world).map(option=>option.alignedWeatherMove)).toEqual(['decline']);
    expect(resolveAlignedWeatherAction(world,b,weatherCompare(f.id,f.openedTick))).toBeNull();
    expect(resolveAlignedWeatherAction(world,a,f.offer)).toBeNull();
    expect(resolveAlignedWeatherAction(world,outside,weatherCompare(f.id,f.openedTick))).toBeNull();
    expect(comparison(world).status).toBe('offered');
  });

  it('records both independently paid original values without averaging prior differing physical reports',()=>{
    const f=offeredAlignedWeather(true),{world}=f;
    const a=weatherPerson(world,f.proposerId),b=weatherPerson(world,f.peerId);
    const sources=[a,b].map(actor=>structuredClone(paidReading(world,actor.id,f.openedTick)));
    expect(resolveAlignedWeatherAction(world,b,weatherCompare(f.id,f.openedTick))).toBeNull();
    world.tick++;
    expect(resolveAlignedWeatherAction(world,b,weatherCompare(f.id,f.openedTick+1))).toBeNull();
    const event=resolveAlignedWeatherAction(world,b,weatherCompare(f.id,f.openedTick));
    expect(event?.witnessScope).toBe('participants');
    expect(event?.actorIds).toEqual([a.id,b.id]);
    expect(comparison(world)).toMatchObject({status:'compared',outcome:'uncertain',measuredTick:f.openedTick+2});
    const result=projectAlignedWeather(world,b)[0];
    expect(result.first?.reading).not.toEqual(result.second?.reading);
    expect(result.second?.station).toBe('edge');
    expect(Object.hasOwn(result.second??{},'x')).toBe(false);
    expect([a,b].map(actor=>paidReading(world,actor.id,f.openedTick))).toEqual(sources);
    expect(projectLocalAlignedWeather(world,b)).toEqual({siteId:f.siteId,measuredTick:f.openedTick+2,outcome:'uncertain'});
    expect(resolveAlignedWeatherAction(world,b,weatherCompare(f.id,f.openedTick))).toBeNull();
    const third=weatherPerson(world,f.outsiderId);
    const reciprocal=weatherPayload('ALIGNED_WEATHER',{alignedWeatherMove:'offer',targetLocationId:f.siteId,
      targetCultivatorId:a.id,targetObservatoryTick:f.openedTick});
    expect(resolveAlignedWeatherAction(world,b,reciprocal)).toBeNull();
    expect(resolveAlignedWeatherAction(world,b,{...reciprocal,targetCultivatorId:third.id})).not.toBeNull();
  });

  it('agrees for genuinely identical independent native samples and keeps the historical pair after native hot history ages',()=>{
    const f=comparedAlignedWeather(false,'loc-vein-north'),{world}=f;
    const a=weatherPerson(world,f.proposerId),b=weatherPerson(world,f.peerId);
    expect(comparison(world).outcome).toBe('agrees');
    expect(comparison(world).first.reading).toEqual(comparison(world).second?.reading);
    const prior=structuredClone(comparison(world));
    world.tick+=9;
    advanceFieldObservatories(world);
    expect(projectFieldObservatory(world,b).runs).toEqual([]);
    expect(paidReading(world,a.id,f.openedTick).status).toBe('measured');
    expect(paidReading(world,b.id,f.openedTick).status).toBe('measured');
    expect(comparison(world)).toEqual(prior);
    expect(projectAlignedWeather(world,b)[0]).toMatchObject({outcome:'agrees',ageTicks:world.tick-prior.measuredTick});
    expect(projectLocalAlignedWeather(world,b)).toBeUndefined();
    const site=weatherSite(world,f.siteId);
    const far=[...world.locations].sort((left,right)=>Math.hypot(right.x-site.x,right.y-site.y)-Math.hypot(left.x-site.x,left.y-site.y))[0];
    b.locationId=far.id;b.exploredTileIds=[];b.rumors=[];
    expect(projectAlignedWeather(world,b)).toEqual([]);
  });

  it('rejects adjacent/remote, forecast-only, out-of-window, and after withdrawal; actual unseen scope stays empty',()=>{
    const f=offeredAlignedWeather(true,'remote'),{world}=f,peer=weatherPerson(world,f.peerId);
    world.tick++;
    expect(resolveAlignedWeatherAction(world,peer,weatherCompare(f.id,f.openedTick))).toBeNull();
    expect(resolveAlignedWeatherAction(world,peer,weatherPayload('ALIGNED_WEATHER',{alignedWeatherMove:'decline',targetAlignedWeatherId:f.id}))).not.toBeNull();
    expect(comparison(world).status).toBe('declined');
    const pending=fundedAlignedWeather();
    const before=weatherPerson(pending.world,pending.proposerId);
    expect(availableAlignedWeatherActions(before,pending.world).some(row=>row.alignedWeatherMove==='offer')).toBe(false);
    const privateView=offeredAlignedWeather();
    const outsider=weatherPerson(privateView.world,privateView.outsiderId);
    expect(projectAlignedWeather(privateView.world,outsider)).toEqual([]);
    privateView.world.tick=comparison(privateView.world).expiresTick;
    advanceAlignedWeather(privateView.world);
    expect(comparison(privateView.world)).toMatchObject({status:'expired',settledTick:privateView.world.tick});
    expect(resolveAlignedWeatherAction(privateView.world,weatherPerson(privateView.world,privateView.peerId),
      weatherCompare(privateView.id,privateView.openedTick))).toBeNull();
    const opt=measuredAlignedWeather();
    expect(availableAlignedWeatherActions(weatherPerson(opt.world,opt.proposerId),opt.world).some(row=>row.alignedWeatherMove==='offer')).toBe(false);
  });
});
