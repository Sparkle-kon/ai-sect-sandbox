import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  advanceBoundaryReliefs,availableBoundaryReliefActions,boundaryReliefBlocksLegacyDispatch,BOUNDARY_RELIEF_GUARD_TICKS,
  BOUNDARY_RELIEF_LATE_GRACE_TICKS,BOUNDARY_RELIEF_OFFER_TICKS,BOUNDARY_RELIEF_QI_PER_TILE,BOUNDARY_RELIEF_STRIDE,
  getCurrentBoundaryCoverage,resolveBoundaryReliefAction,visibleBoundaryReliefs,
} from '../src/engine/boundaryReliefEngine';
import { boundaryReliefCheckpoint } from '../src/engine/boundaryReliefCheckpoint';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { BoundaryRelief,BoundaryReliefMove,Cultivator,LLMDecisionPayload } from '../src/types/world';

function fixture(){
  const world=createInitialWorld(732);
  world.tick=20;world.month=8;
  const sect=world.sects[0];
  const leader=world.cultivators.find(actor=>actor.id===sect.leaderId)!;
  const [incumbent,incoming]=world.cultivators.filter(actor=>actor.sectId===sect.id&&actor.id!==leader.id);
  const outsider=world.cultivators.find(actor=>actor.sectId!==sect.id)!;
  const extra:Cultivator={...structuredClone(incoming),id:'fixture-other-keeper'};
  world.cultivators.push(extra);
  const origin=world.locations.find(site=>site.id===sect.headquartersId)!;
  const post=world.locations.find(site=>site.id==='loc-vein-north')!;
  post.ownerSectId=sect.id;
  leader.locationId=incoming.locationId=extra.locationId=origin.id;
  incumbent.locationId=post.id;
  incumbent.guardAssignment={locationId:post.id,assignedTick:world.tick-1,expiresTick:world.tick+15};
  incoming.qiProgress=95;
  for(const actor of [leader,incumbent,incoming,extra,outsider]){
    actor.exploredTileIds=world.terrain.tiles.map(tile=>tile.id);
  }
  const step=()=>{++world.tick;if(world.month===12){world.month=1;++world.year;}else ++world.month;};
  const act=(actor:Cultivator,move:BoundaryReliefMove,payload:Partial<LLMDecisionPayload>={})=>
    resolveBoundaryReliefAction(world,actor,{chosenAction:'BOUNDARY_RELIEF',boundaryReliefMove:move,innerMonologue:'按实到岗点换防',...payload});
  const submit=(actor:Cultivator,move:Exclude<BoundaryReliefMove,'offer'>,row:BoundaryRelief)=>act(actor,move,{targetBoundaryReliefId:row.id});
  const offer=()=>{
    expect(act(leader,'offer',{targetCultivatorId:incoming.id,targetLocationId:post.id})).not.toBeNull();
    return world.boundaryReliefs.cases[0];
  };
  const embark=()=>{
    const row=offer();step();
    expect(submit(incoming,'accept',row)).not.toBeNull();
    return row;
  };
  return {world,sect,leader,incumbent,incoming,outsider,extra,origin,post,step,act,submit,offer,embark};
}

describe('physically proven boundary relief',()=>{
  it('offers only one precise standing slot and requires named living reserve to accept later',()=>{
    const {world,leader,incumbent,incoming,outsider,extra,origin,post,step,act,submit,offer}=fixture();
    const nominal={targetCultivatorId:incoming.id,targetLocationId:post.id};
    expect(act(outsider,'offer',nominal)).toBeNull();
    expect(act(leader,'offer',{...nominal,targetLocationId:origin.id})).toBeNull();
    const actualGuard=incumbent.guardAssignment;
    incumbent.locationId=origin.id;
    expect(act(leader,'offer',nominal)).toBeNull();
    incumbent.locationId=post.id;
    const row=offer();
    expect(row).toMatchObject({status:'offered',incumbentId:incumbent.id,incumbentAssignedTick:actualGuard!.assignedTick,
      offerExpiresTick:world.tick+BOUNDARY_RELIEF_OFFER_TICKS,coverage:{kind:'incumbent',guardId:incumbent.id}});
    expect(boundaryReliefBlocksLegacyDispatch(world,incoming.id,'different-station')).toBe(true);
    expect(boundaryReliefBlocksLegacyDispatch(world,extra.id,post.id)).toBe(true);
    expect(boundaryReliefBlocksLegacyDispatch(world,extra.id,origin.id)).toBe(false);
    expect(act(leader,'offer',{...nominal,targetCultivatorId:extra.id})).toBeNull();
    expect(submit(incoming,'accept',row)).toBeNull();
    expect(availableBoundaryReliefActions(incoming,world,world.tick+1)).toContainEqual({
      action:'BOUNDARY_RELIEF',boundaryReliefMove:'accept',targetBoundaryReliefId:row.id});
    step();
    expect(submit(extra,'accept',row)).toBeNull();
    expect(submit(incoming,'decline',row)).not.toBeNull();
    expect(row).toMatchObject({status:'declined',closeReason:'declined',closedById:incoming.id,path:[]});
    expect(incumbent.guardAssignment).toBe(actualGuard);
    expect(incoming.guardAssignment).toBeUndefined();
    expect(boundaryReliefBlocksLegacyDispatch(world,incoming.id,post.id)).toBe(false);
  });

  it('keeps incumbent until exact endpoint, charging only traveled cells without changing any unrelated actor state',()=>{
    const {world,leader,incumbent,incoming,outsider,origin,post,step,submit,embark}=fixture();
    const row=embark();
    const initialQi=incoming.qiProgress;
    const originalStatus={hp:incoming.hp,rank:incoming.sectRank,assets:structuredClone(incoming.artifacts),cash:incoming.spiritStones};
    const path=structuredClone(row.path);
    expect(path[0]).toEqual({x:origin.x,y:origin.y});
    expect(path.at(-1)).toEqual({x:post.x,y:post.y});
    expect(row.deadlineTick).toBe(world.tick+Math.ceil((path.length-1)/BOUNDARY_RELIEF_STRIDE)+BOUNDARY_RELIEF_LATE_GRACE_TICKS);
    expect(incoming.guardAssignment).toBeUndefined();
    expect(advanceBoundaryReliefs(world)).toEqual([]);
    expect(incoming.qiProgress).toBe(initialQi);
    expect(getCurrentBoundaryCoverage(world,leader)).toEqual([]);
    expect(visibleBoundaryReliefs(world,leader)[0].coverage).toBeUndefined();
    expect(visibleBoundaryReliefs(world,outsider)).toEqual([]);
    for(let i=1;i<path.length;i++){
      const a=terrainTileAt(world,path[i-1].x,path[i-1].y)!,b=terrainTileAt(world,path[i].x,path[i].y)!;
      expect(Math.abs(a.col-b.col)+Math.abs(a.row-b.row)).toBe(1);
    }
    while(row.status==='travelling'){
      expect(incoming.locationId).toBe(origin.id);
      expect(incoming.guardAssignment).toBeUndefined();
      expect(incumbent.guardAssignment?.locationId).toBe(post.id);
      step();
      const at=row.pathIndex;
      advanceBoundaryReliefs(world);
      expect(row.pathIndex-at).toBeGreaterThan(0);
      expect(row.pathIndex-at).toBeLessThanOrEqual(BOUNDARY_RELIEF_STRIDE);
      expect(advanceBoundaryReliefs(world)).toEqual([]);
      if(row.pathIndex<path.length-1) expect(boundaryReliefCheckpoint(world,incoming)).toEqual(path[row.pathIndex]);
    }
    expect(row).toMatchObject({status:'completed',closedTick:world.tick,outboundSteps:path.length-1,returnSteps:0,
      strainSpent:(path.length-1)*BOUNDARY_RELIEF_QI_PER_TILE,coverage:{kind:'relief',guardId:incoming.id,tick:world.tick}});
    expect(incoming.locationId).toBe(post.id);
    expect(incoming.guardAssignment).toEqual({locationId:post.id,assignedTick:world.tick,expiresTick:world.tick+BOUNDARY_RELIEF_GUARD_TICKS});
    expect(incumbent.guardAssignment).toBeUndefined();
    expect(incoming.qiProgress).toBe(initialQi-row.strainSpent);
    expect({hp:incoming.hp,rank:incoming.sectRank,assets:incoming.artifacts,cash:incoming.spiritStones}).toEqual(originalStatus);
    expect(submit(incoming,'withdraw',row)).toBeNull();
    expect(getCurrentBoundaryCoverage(world,incoming,post.id)).toEqual({postSiteId:post.id,tick:world.tick,kind:'relief'});
    expect(visibleBoundaryReliefs(world,incoming)[0]).not.toHaveProperty('path');
    expect(visibleBoundaryReliefs(world,incoming)[0]).not.toHaveProperty('checkpoint');
  });

  it('keeps a real recorded gap while the original dies and does not turn the approaching reserve into a guard',()=>{
    const {world,incumbent,incoming,outsider,post,step,embark}=fixture();
    const row=embark();
    step();advanceBoundaryReliefs(world);
    incumbent.alive=false;incumbent.hp=0;
    outsider.locationId=post.id;
    step();advanceBoundaryReliefs(world);
    expect(row.status).toBe('travelling');
    expect(incoming.guardAssignment).toBeUndefined();
    expect(row.firstGapTick).toBe(world.tick);
    expect(row.coverage).toEqual({kind:'gap',tick:world.tick});
    expect(getCurrentBoundaryCoverage(world,outsider,post.id)).toEqual({postSiteId:post.id,tick:world.tick,kind:'gap'});
    const gap=row.firstGapTick;
    while(row.status==='travelling'){step();advanceBoundaryReliefs(world);}
    expect(row).toMatchObject({status:'completed',firstGapTick:gap});
    expect(incoming.guardAssignment?.locationId).toBe(post.id);
    const publicRow=getCurrentBoundaryCoverage(world,outsider,post.id)!;
    expect(publicRow.kind).toBe('relief');
    expect(publicRow).not.toHaveProperty('guardId');
  });

  it.each(['withdraw','title','competitor','deadline'] as const)('continues only through the actual reverse prefix after %s',cause=>{
    const {world,sect,leader,incumbent,incoming,extra,origin,post,step,submit,embark}=fixture();
    const row=embark(), initialQi=incoming.qiProgress;
    step();advanceBoundaryReliefs(world);
    const originalOut=row.outboundSteps;
    expect(originalOut).toBe(BOUNDARY_RELIEF_STRIDE);
    const originBinding=incumbent.guardAssignment;
    if(cause==='withdraw') expect(submit(leader,'withdraw',row)).not.toBeNull();
    if(cause==='title') sect.leaderId=extra.id;
    if(cause==='competitor'){
      incumbent.alive=false;incumbent.hp=0;
      extra.locationId=post.id;
      extra.guardAssignment={locationId:post.id,assignedTick:world.tick,expiresTick:world.tick+9};
    }
    if(cause==='deadline'){
      const tile=terrainTileAt(world,row.path[row.pathIndex+1].x,row.path[row.pathIndex+1].y)!;
      world.mapHazards.push({id:'late-block',tileId:tile.id,kind:'beast_tide',intensity:3,createdTick:world.tick,
        expiresTick:row.deadlineTick!+2});
      while(world.tick<row.deadlineTick!-1){step();advanceBoundaryReliefs(world);}
      expect(row).toMatchObject({status:'travelling',pathIndex:originalOut});
    }
    step();advanceBoundaryReliefs(world);
    expect(row).toMatchObject({status:cause==='withdraw'?'withdrawn':cause==='deadline'?'expired':'interrupted',
      closeReason:cause==='withdraw'?'withdrawn':cause==='deadline'?'late':cause==='title'?'title_lost':'conflicting_duty',
      pathIndex:0,outboundSteps:originalOut,returnSteps:originalOut,strainSpent:2*originalOut});
    expect(incoming.locationId).toBe(origin.id);
    expect(incoming.guardAssignment).toBeUndefined();
    expect(incoming.qiProgress).toBe(initialQi-2*originalOut);
    expect(incumbent.guardAssignment).toBe(originBinding);
    if(cause==='competitor') {
      expect(extra.guardAssignment?.locationId).toBe(post.id);
      expect(getCurrentBoundaryCoverage(world,extra,post.id)).toEqual({postSiteId:post.id,tick:world.tick,kind:'other'});
    }
  });

  it('retains the last actually attained point while a reverse tile is unsafe, then recovers without teleport',()=>{
    const {world,leader,incoming,origin,post,step,submit,embark}=fixture();
    const row=embark();
    step();advanceBoundaryReliefs(world);
    const index=row.pathIndex;
    const reverse=row.path[index-1];
    const tile=terrainTileAt(world,reverse.x,reverse.y)!;
    world.mapHazards.push({id:'blocked-return',tileId:tile.id,kind:'meteor',intensity:3,createdTick:world.tick,expiresTick:world.tick+2});
    expect(submit(leader,'withdraw',row)).not.toBeNull();
    step();expect(advanceBoundaryReliefs(world)).toEqual([]);
    expect(row).toMatchObject({status:'returning',pathIndex:index,returnSteps:0,strainSpent:index});
    expect(incoming.locationId).toBe(origin.id);
    expect(boundaryReliefCheckpoint(world,incoming)).toEqual(row.path[index]);
    expect(boundaryReliefBlocksLegacyDispatch(world,incoming.id,post.id)).toBe(true);
    step();expect(advanceBoundaryReliefs(world)).toHaveLength(1);
    expect(row).toMatchObject({status:'withdrawn',pathIndex:0,returnSteps:index,strainSpent:2*index});
  });

  it('declines an impossible acceptance if legitimate reserves lack actual return strain',()=>{
    const {world,incumbent,incoming,step,offer,submit}=fixture();
    const row=offer();
    incoming.qiProgress=0;
    step();
    expect(submit(incoming,'accept',row)).toBeNull();
    expect(row.path).toEqual([]);
    expect(incoming.guardAssignment).toBeUndefined();
    expect(incumbent.guardAssignment).toBeDefined();
    while(world.tick<row.offerExpiresTick)step();
    expect(advanceBoundaryReliefs(world)).toHaveLength(1);
    expect(row).toMatchObject({status:'expired',closeReason:'offer_expired',strainSpent:0});
  });
});
