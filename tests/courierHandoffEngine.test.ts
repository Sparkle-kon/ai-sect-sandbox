import {describe,expect,it} from 'vitest';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {advanceCouriers,availableCourierHandoffActions,courierActedThisTick,courierCheckpoint,projectCourierHandoffs,
  projectLocalCourierHandoff,reconcileCourierDeaths,resolveCourierHandoffAction,visibleCouriers} from '../src/engine/sealedCourierEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {arrivedCourierHandoff,handoffDecision,handoffPerson,handoffSite,handoffTurn,offeredCourierHandoff,transferredCourierHandoff}
  from './fixtures/courierHandoffFixture';
import type {WorldState} from '../src/types/world';

const packet=(world:WorldState)=>world.couriers.dispatches[0];

describe('actual shared post preserves one sealed packet and one original route',()=>{
  it('only exposes a legal exact next offer after actual crossed interior desk, with one native pause if unused',()=>{
    const f=arrivedCourierHandoff(),{world}=f,native=packet(world),window=native.handoff!,old=handoffPerson(world,f.originalId);
    const post=handoffSite(world,f.postId),pathPoint=native.path[native.pathIndex];
    expect(window.pathIndex).toBeGreaterThan(window.fromPathIndex);
    expect(window.pathIndex).toBeLessThan(native.path.length-1);
    expect(terrainTileAt(world,pathPoint.x,pathPoint.y)?.id).toBe(terrainTileAt(world,post.x,post.y)?.id);
    expect(old.locationId).toBe(f.originId); // Only the real cursor, never stale origin, witnesses arrival.
    expect(courierCheckpoint(world,old)).toEqual(pathPoint);
    expect(projectLocalCourierHandoff(world,old)).toEqual({siteId:f.postId,status:'arrived'});
    expect(availableCourierHandoffActions(old,world)).toEqual([]);
    expect(availableCourierHandoffActions(old,world,world.tick+1)).toContainEqual({
      action:'COURIER_HANDOFF',courierHandoffMove:'offer',targetDispatchId:f.id,targetCourierId:f.newId});
    const paused=handoffTurn(world);
    expect(packet(paused)).toMatchObject({pathIndex:window.pathIndex,lastAdvancedTick:window.arrivedTick,
      handoff:{status:'arrived',lastHeldTick:paused.tick}});
    const moving=handoffTurn(paused);
    expect(packet(moving).lastAdvancedTick).toBe(moving.tick);
    expect(packet(moving).handoff).toMatchObject({status:'missed',reason:'unoffered',settledTick:moving.tick});
    expect(packet(moving).handoff!.furthestPathIndex).toBeGreaterThan(window.pathIndex);
    expect(packet(moving).courierId).toBe(f.originalId);
  });

  it('requires exact separate next-date consent, keeps fee and route, and changes only actual custody and old physical post',()=>{
    const f=offeredCourierHandoff(),{world}=f,native=packet(world),pre=native.handoff!;
    const old=handoffPerson(world,f.originalId),next=handoffPerson(world,f.newId),outsider=handoffPerson(world,f.outsiderId);
    const sealed=native.sealed,path=native.path,fee=native.feePaid,purse=[old.spiritStones,next.spiritStones];
    expect(visibleCouriers(world,next)).toEqual([]);
    expect(projectCourierHandoffs(world,outsider)).toEqual([]);
    expect(projectCourierHandoffs(world,next)[0]).toMatchObject({role:'invited',status:'offered',postName:handoffSite(world,f.postId).name});
    expect(JSON.stringify(projectCourierHandoffs(world,next))).not.toContain('offer_relief');
    expect(resolveCourierHandoffAction(world,next,handoffDecision('accept',f.id))).toBeNull();
    world.tick++;
    advanceCouriers(world);
    expect(native.lastAdvancedTick).toBe(pre.arrivedTick);
    expect(pre.lastHeldTick).toBe(world.tick);
    expect(resolveCourierHandoffAction(world,outsider,handoffDecision('accept',f.id))).toBeNull();
    expect(resolveCourierHandoffAction(world,next,handoffDecision('accept',f.id))?.witnessScope).toBe('participants');
    expect(native.sealed).toBe(sealed);
    expect(native.path).toBe(path);
    expect(native.feePaid).toBe(fee);
    expect([old.spiritStones,next.spiritStones]).toEqual(purse);
    expect(native).toMatchObject({status:'in_transit',courierId:next.id,originalCourierId:old.id,pathIndex:pre.pathIndex,
      handoff:{status:'transferred',settledTick:world.tick}});
    expect(old.locationId).toBe(f.postId);
    expect(courierCheckpoint(world,old)).toBeUndefined();
    expect(courierCheckpoint(world,next)).toEqual(path[pre.pathIndex]);
    expect(courierActedThisTick(world,old)).toBe(true);
    expect(courierActedThisTick(world,next)).toBe(true);
    expect(visibleCouriers(world,old)[0]).toMatchObject({role:'previous_courier',feePaid:12});
    expect(visibleCouriers(world,next)[0]).toMatchObject({role:'courier',feePaid:0});
    for(const actor of [old,next]){
      expect(visibleCouriers(world,actor)[0].payload).toBeUndefined();
      expect(visibleCouriers(world,actor)[0].recipientName).toBeUndefined();
    }
    expect(visibleCouriers(world,handoffPerson(world,f.recipientId))).toEqual([]);
    expect(resolveCourierHandoffAction(world,next,handoffDecision('accept',f.id))).toBeNull();
  });

  it('follows original native path to real delivery only and keeps the exact traveled tail once live path is cleared',()=>{
    const f=transferredCourierHandoff();
    let {world}=f;
    const original=structuredClone(packet(world));
    for(let i=0;i<15&&packet(world).status==='in_transit';i++)world=handoffTurn(world);
    const result=packet(world);
    expect(result.status).toBe('delivered');
    expect(result.deadlineTick).toBe(original.deadlineTick);
    expect(result.path).toEqual([]);
    expect(result.pathIndex).toBe(0);
    expect(result.handoff).toMatchObject({status:'transferred',furthestPathIndex:original.path.length-1,
      terminal:{status:'delivered',pathIndex:original.path.length-1,courierId:f.newId,tick:result.deliveredTick}});
    expect(result.handoff!.path).toEqual(original.path);
    expect(visibleCouriers(world,handoffPerson(world,f.recipientId))[0].payload).toEqual(original.sealed);
    const former=handoffPerson(world,f.originalId);
    expect(projectCourierHandoffs(world,former)[0]).not.toHaveProperty('terminalStatus');
    const formerSummary=visibleCouriers(world,former)[0];
    expect(formerSummary).toMatchObject({role:'previous_courier',status:'transferred',settledTick:result.handoff?.settledTick,feePaid:12});
    for(const key of ['deadlineTick','deliveredTick','reason','destinationName','recipientName','payload'])expect(formerSummary).not.toHaveProperty(key);
  });

  it('failed meeting does not create another packet, payoff, receipt of delivery or movement back to old post',()=>{
    const f=offeredCourierHandoff(),{world}=f;
    const newCourier=handoffPerson(world,f.newId),old=handoffPerson(world,f.originalId);
    newCourier.locationId=f.originId;
    const next=handoffTurn(world,{[f.newId]:handoffDecision('accept',f.id)});
    const result=packet(next);
    expect(result.courierId).toBe(old.id);
    expect(result.handoff).toMatchObject({status:'interrupted',reason:'carrier_unavailable'});
    expect(next.couriers.dispatches).toHaveLength(1);
    expect(result.sealed).toEqual(packet(world).sealed);
    expect(result.handoff?.terminal?.status==='delivered').toBe(false);
    expect(visibleCouriers(next,handoffPerson(next,f.recipientId))).toEqual([]);
  });

  it('reconciles a late invalid post title without moving the packet or awarding transfer',()=>{
    const f=offeredCourierHandoff(),{world}=f,dispatch=packet(world),post=handoffSite(world,f.postId);
    delete post.ownerSectId;
    const position=dispatch.pathIndex,lastMovement=dispatch.lastAdvancedTick;
    expect(reconcileCourierDeaths(world)).toHaveLength(1);
    expect(dispatch).toMatchObject({status:'in_transit',courierId:f.originalId,pathIndex:position,lastAdvancedTick:lastMovement,
      handoff:{status:'interrupted',reason:'post_unavailable',settledTick:world.tick}});
    expect(reconcileCourierDeaths(world)).toEqual([]);
    expect(projectLocalCourierHandoff(world,handoffPerson(world,f.originalId))).toBeUndefined();
    expect(visibleCouriers(world,handoffPerson(world,f.newId))).toEqual([]);
  });

  it('native route hazard at the actual paused post defeats consent, reverses actual custody and never invents delivery',()=>{
    const f=offeredCourierHandoff(),{world}=f,post=handoffSite(world,f.postId);
    const struck=applyMapBrush(applyMapBrush(world,'cursed_miasma',[post]),'cursed_miasma',[post]);
    let lost=handoffTurn(struck,{[f.newId]:handoffDecision('accept',f.id)});
    expect(packet(lost)).toMatchObject({status:'returning',reason:'hazard',courierId:f.originalId,
      handoff:{status:'interrupted',reason:'hazard',turnback:{pathIndex:packet(world).pathIndex,tick:lost.tick,reason:'hazard'}}});
    for(let i=0;i<15&&packet(lost).status==='returning';i++)lost=handoffTurn(lost);
    expect(packet(lost)).toMatchObject({status:'lost',reason:'hazard',handoff:{
      furthestPathIndex:packet(world).pathIndex,terminal:{status:'lost',pathIndex:0,courierId:f.originalId}}});
    expect(visibleCouriers(lost,handoffPerson(lost,f.recipientId))).toEqual([]);
  });

  it('actual current carrier death during invite immediately loses only the original packet',()=>{
    const f=offeredCourierHandoff(),{world}=f,old=handoffPerson(world,f.originalId);
    old.alive=false;old.hp=0;
    const next=handoffTurn(world,{[f.newId]:handoffDecision('accept',f.id)});
    expect(packet(next)).toMatchObject({status:'lost',reason:'courier_death',courierId:f.originalId,
      handoff:{status:'interrupted',terminal:{status:'lost',courierId:f.originalId,pathIndex:packet(world).pathIndex}}});
    expect(next.couriers.dispatches).toHaveLength(1);
    expect(visibleCouriers(next,handoffPerson(next,f.newId))).toEqual([]);
  });
});
