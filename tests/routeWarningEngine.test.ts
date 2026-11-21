import { describe,expect,it } from 'vitest';
import { availableRouteWarningActions,projectOwnRouteWarningHistory,projectRouteWarnings,resolveRouteWarningAction,
  visiblePublicRouteWarnings } from '../src/engine/routeWarningEngine';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { makeRouteWarningFixtureDecision as make,routeWarningFixture as ready,routeWarningFixtureAction as warning,
  routeWarningFixtureActor as person,routeWarningFixtureTurn as turn } from './fixtures/routeWarningFixture';

describe('public warnings from real checkpoint travel only',()=>{
  it('takes one prior observation, refuses shared-party and same-tick support, and accepts a disjoint genuine second journey',()=>{
    const {world,left,right,one,partner,two,hazard,outsider}=ready();
    const observed=world.routeWarnings.observations;
    expect(observed).toHaveLength(4);
    expect(observed.map(row=>row.id)).toEqual(['route-observation-1','route-observation-2','route-observation-3','route-observation-4']);
    const first=observed.find(row=>row.actorId===one)!, rival=observed.find(row=>row.actorId===two)!, friend=observed.find(row=>row.actorId===partner)!;
    expect(first).toMatchObject({journeyId:left,partyIds:[one,partner],legIndex:0,toTileId:hazard.tileId,hazard,observedTick:world.tick});
    expect(rival).toMatchObject({journeyId:right,toTileId:hazard.tileId});
    expect(first.exitTileId).toBeDefined();
    expect(resolveRouteWarningAction(world,person(world,one),warning('post',first.id))).toBeNull();
    expect(resolveRouteWarningAction(world,person(world,outsider),warning('post',first.id))).toBeNull();
    const posted=turn(world,{[one]:warning('post',first.id)});
    const notice=posted.routeWarnings.notices[0];
    expect(notice).toMatchObject({id:'route-warning-1',observation:first,postedTick:posted.tick});
    expect(notice.expiresTick).toBe(Math.min(first.observedTick+4,hazard.expiresTick));
    expect(resolveRouteWarningAction(posted,person(posted,two),warning('corroborate',rival.id,notice.id))).toBeNull();
    expect(availableRouteWarningActions(person(posted,partner),posted,posted.tick+1)).toEqual([]);
    expect(availableRouteWarningActions(person(posted,two),posted,posted.tick+1)).toEqual([
      {action:'ROUTE_WARNING',routeWarningMove:'corroborate',targetRouteObservationId:rival.id,targetRouteWarningId:notice.id},
    ]);
    expect(resolveRouteWarningAction(posted,person(posted,partner),warning('corroborate',friend.id,notice.id))).toBeNull();
    const corroborated=turn(posted,{[two]:warning('corroborate',rival.id,notice.id)});
    expect(corroborated.routeWarnings.notices[0]).toMatchObject({corroboration:{tick:corroborated.tick,observation:rival}});
    expect(corroborated.routeWarnings.observations.some(row=>row.id===first.id||row.id===rival.id)).toBe(false);
    expect(decodeWorldSave(encodeWorldSave(corroborated)).routeWarnings).toEqual(corroborated.routeWarnings);
    const safe=visiblePublicRouteWarnings(corroborated,new Set([first.fromTileId,first.toTileId]));
    expect(safe).toEqual([{id:notice.id,fromTileId:first.fromTileId,toTileId:first.toTileId,kind:hazard.kind,intensity:hazard.intensity,
      observedTick:first.observedTick,postedTick:notice.postedTick,expiresTick:notice.expiresTick,corroborated:true,corroboratedTick:corroborated.tick}]);
    expect(visiblePublicRouteWarnings(corroborated,new Set([first.fromTileId]))).toEqual([]);
    expect(visiblePublicRouteWarnings(corroborated)).toEqual([]);
    expect(projectRouteWarnings(corroborated)).toEqual([]);
    expect(projectOwnRouteWarningHistory(corroborated,person(corroborated,two))).toEqual([]);
  });

  it('retires actual posted terms at exact expiry or by the original reporter, never by another party',()=>{
    const {world,one,two}=ready();
    const first=world.routeWarnings.observations.find(row=>row.actorId===one)!;
    const posted=turn(world,{[one]:warning('post',first.id)});
    const notice=posted.routeWarnings.notices[0];
    const auth=turn(posted,{[two]:warning('retract',undefined,notice.id)});
    expect(auth.routeWarnings.notices[0].retractedTick).toBeUndefined();
    const retracted=turn(posted,{[one]:warning('retract',undefined,notice.id)});
    expect(projectOwnRouteWarningHistory(retracted,person(retracted,one))).toContainEqual(expect.objectContaining({id:notice.id,status:'retracted'}));
    expect(projectRouteWarnings(retracted)).toEqual([]);
    let expired=posted;
    while(expired.tick<notice.expiresTick)expired=turn(expired);
    expect(projectRouteWarnings(expired)).toEqual([]);
    expect(expired.routeWarnings.observations).toEqual([]);
    expect(projectOwnRouteWarningHistory(expired,person(expired,one))).toContainEqual(expect.objectContaining({id:notice.id,status:'expired'}));
    expect(expired.routeWarnings.notices[0].observation).toEqual(first);
  });

  it('does not mistake a visually animated ordinary flight or fabricated unknown token for a physically walked segment',()=>{
    const {world,outsider,start,middle,stop}=ready();
    const traveler=person(world,outsider);
    traveler.locationId=start;
    const moved=turn(world,{[outsider]:make('EXPLORE',{targetLocationId:middle})});
    expect(person(moved,outsider).locationId).toBe(middle);
    expect(moved.mapPresentation.trails.some(row=>row.cultivatorId===outsider)).toBe(true);
    expect(moved.routeWarnings.observations.some(row=>row.actorId===outsider)).toBe(false);
    expect(resolveRouteWarningAction(moved,person(moved,outsider),warning('post','route-observation-99'))).toBeNull();
    const movedAgain=turn(moved,{[outsider]:make('EXPLORE',{targetLocationId:stop})});
    expect(person(movedAgain,outsider).locationId).toBe(stop);
    expect(movedAgain.routeWarnings.notices).toEqual([]);
    expect(terrainTileAt(moved,260,220)?.id).toBe(world.mapHazards[0].tileId);
  });
});
