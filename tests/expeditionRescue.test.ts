import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  advanceExpeditionRescues, availableExpeditionRescueActions, EXPEDITION_RESCUE_DISTRESS_HP, EXPEDITION_RESCUE_HERB,
  EXPEDITION_RESCUE_OFFER_TICKS, EXPEDITION_RESCUE_STRIDE, expireOccasionRescues, hasOpenExpeditionRescue,
  rescuedMemberOutOfOccasion, rescueHoldsExpeditionRoll, resolveExpeditionRescueAction, visibleExpeditionRescues,
} from '../src/engine/expeditionRescueEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, ExpeditionRescue, ExpeditionRescueMove, LLMDecisionPayload, LocationNode, WorldOccasion } from '../src/types/world';

function fixture() {
  const world=createInitialWorld(801);
  world.tick=22;
  world.month=10;
  const [explorer,helper,witness,outsider]=world.cultivators;
  const site = (id:string,x:number,type:LocationNode['type']):LocationNode =>
    ({...structuredClone(world.locations[0]),id,name:id,x,y:300,type,ownerSectId:undefined});
  const gate=site('actual-expedition-gate',512,'secret_realm');
  const exit=site('permanent-rescue-exit',690,'market');
  const shared=site('shared-tile-not-exit',518,'market');
  const fake=site('other-secret-gate',570,'secret_realm');
  const dangerous=site('unsafe-abyss-endpoint',562,'abyss');
  world.locations=[gate,exit,shared,fake,dangerous];
  const entrants=[explorer,helper,witness];
  for (const actor of world.cultivators) {
    actor.locationId=gate.id;
    actor.herbs[EXPEDITION_RESCUE_HERB]=2;
    actor.hp=actor.maxHp;
    actor.exploredTileIds=world.terrain.tiles.map(tile=>tile.id);
  }
  explorer.hp=Math.floor(explorer.maxHp*EXPEDITION_RESCUE_DISTRESS_HP);
  const occasion:WorldOccasion={id:'local-expedition-22',kind:'expedition',title:'测试星门',locationId:gate.id,startedTick:18,
    registrationClosesTick:21,expiresTick:32,status:'running',participantIds:entrants.map(actor=>actor.id),
    remainingIds:[helper.id,witness.id],bouts:[],expeditions:[],round:1};
  world.occasions=[occasion];
  const act=(actor:Cultivator,rescueMove:ExpeditionRescueMove,payload:Partial<LLMDecisionPayload>={})=>
    resolveExpeditionRescueAction(world,actor,{chosenAction:'EXPEDITION_RESCUE',rescueMove,innerMonologue:'只走原路',...payload});
  const decide=(actor:Cultivator,move:'accept'|'withdraw',row:ExpeditionRescue)=>act(actor,move,{targetExpeditionRescueId:row.id});
  const signal=()=>{
    expect(act(explorer,'signal',{targetOccasionId:occasion.id})).toMatchObject({witnessScope:'participants'});
    return world.expeditionRescues.requests[0];
  };
  const step=()=>{++world.tick;if(world.month===12){world.month=1;++world.year;}else ++world.month;};
  const embark=()=>{
    const row=signal();step();
    expect(decide(helper,'accept',row)).not.toBeNull();
    return row;
  };
  return {world,gate,exit,shared,occasion,explorer,helper,witness,outsider,act,decide,signal,step,embark};
}

describe('actual consensual expedition extraction',()=>{
  it('captures only actual reachable gate witnesses, and voluntary withdrawal never spends or moves',()=>{
    const {world,gate,occasion,explorer,helper,witness,outsider,act,decide,signal,step}=fixture();
    witness.locationId='permanent-rescue-exit';
    expect(act(outsider,'signal',{targetOccasionId:occasion.id})).toBeNull();
    const row=signal();
    expect(row).toMatchObject({status:'signaled',gateSiteId:gate.id,explorerId:explorer.id,witnessIds:[helper.id],
      offerExpiresTick:world.tick+EXPEDITION_RESCUE_OFFER_TICKS,path:[],pathIndex:0});
    expect(visibleExpeditionRescues(world,witness)).toEqual([]);
    expect(visibleExpeditionRescues(world,outsider)).toEqual([]);
    expect(visibleExpeditionRescues(world,helper)[0]).toMatchObject({role:'witness',status:'signaled'});
    expect(decide(helper,'accept',row)).toBeNull();
    expect(decide(helper,'withdraw',row)).toBeNull();
    expect(availableExpeditionRescueActions(helper,world,world.tick+1)).toContainEqual(
      {action:'EXPEDITION_RESCUE',rescueMove:'accept',targetExpeditionRescueId:row.id});
    step();
    witness.locationId=gate.id;
    expect(decide(witness,'accept',row)).toBeNull(); // Not actually present when the signal was made.
    expect(decide(outsider,'accept',row)).toBeNull();
    expect(decide(explorer,'withdraw',row)).not.toBeNull();
    expect(row).toMatchObject({status:'withdrawn',reason:'withdrawn',path:[]});
    expect(decide(helper,'accept',row)).toBeNull();
    expect(helper.herbs[EXPEDITION_RESCUE_HERB]).toBe(2);
    expect([explorer.locationId,helper.locationId]).toEqual([gate.id,gate.id]);
  });

  it('charges only first consenting actual helper, then walks orthogonal, one stride per tick, preserving original people and cargo',()=>{
    const {world,gate,exit,occasion,explorer,helper,witness,decide,signal,step}=fixture();
    const people=[explorer,helper];
    const cargo=(persons:Cultivator[])=>persons.map(({id,artifacts,spiritStones,herbs,pills,hp})=>({id,artifacts,spiritStones,herbs,pills,hp}));
    const before=structuredClone(cargo(people));
    before[1].herbs[EXPEDITION_RESCUE_HERB]--;
    const row=signal();
    step();
    expect(decide(helper,'accept',row)).toMatchObject({witnessScope:'participants',actorIds:[explorer.id,helper.id]});
    expect(row).toMatchObject({status:'extracting',rescuerId:helper.id,exitSiteId:exit.id,supplySpent:1,pathIndex:0});
    expect(decide(witness,'accept',row)).toBeNull();
    expect(decide(explorer,'withdraw',row)).toBeNull();
    expect(visibleExpeditionRescues(world,witness)).toEqual([]);
    expect(visibleExpeditionRescues(world,explorer)[0]).not.toHaveProperty('path');
    expect(advanceExpeditionRescues(world)).toEqual([]);
    expect(rescueHoldsExpeditionRoll(world,occasion.id,helper.id)).toBe(true);
    expect(row.path[0]).toEqual({x:gate.x,y:gate.y});
    expect(row.path.at(-1)).toEqual({x:exit.x,y:exit.y});
    expect(row.path.length-1).toBeGreaterThan(EXPEDITION_RESCUE_STRIDE);
    for (let i=1;i<row.path.length;i++) {
      const prev=terrainTileAt(world,row.path[i-1].x,row.path[i-1].y)!;
      const next=terrainTileAt(world,row.path[i].x,row.path[i].y)!;
      expect(Math.abs(prev.col-next.col)+Math.abs(prev.row-next.row)).toBe(1);
    }
    while (row.status === 'extracting') {
      expect(people.map(person=>person.locationId)).toEqual([gate.id,gate.id]);
      step();
      const previous=row.pathIndex;
      expect(advanceExpeditionRescues(world)).toHaveLength(1);
      expect(row.pathIndex-previous).toBeGreaterThan(0);
      expect(row.pathIndex-previous).toBeLessThanOrEqual(EXPEDITION_RESCUE_STRIDE);
      expect(advanceExpeditionRescues(world)).toEqual([]);
    }
    expect(row).toMatchObject({status:'rescued',arrivedIds:[explorer.id,helper.id],pathIndex:row.path.length-1,finishedTick:world.tick});
    expect(people.map(person=>person.locationId)).toEqual([exit.id,exit.id]);
    expect(cargo(people)).toEqual(before);
    expect(witness.herbs[EXPEDITION_RESCUE_HERB]).toBe(2);
    expect(world.cultivators.filter(person=>person.id===explorer.id)).toHaveLength(1);
    expect(rescueHoldsExpeditionRoll(world,occasion.id,helper.id)).toBe(false);
    expect(rescuedMemberOutOfOccasion(world,occasion.id,explorer.id)).toBe(true);
    helper.locationId='independent-later-site';
    expect(rescuedMemberOutOfOccasion(world,occasion.id,helper.id)).toBe(true);
    expect(visibleExpeditionRescues(world,explorer)[0]).toMatchObject({role:'explorer',arrived:true,stepsDone:row.pathIndex});
  });

  it.each(['shortage','real deadline','unsafe plan'] as const)('rejects %s before the paid acceptance',mode=>{
    const {world,gate,exit,occasion,helper,decide,signal,step}=fixture();
    const row=signal();
    if(mode==='shortage') helper.herbs[EXPEDITION_RESCUE_HERB]=0;
    if(mode==='real deadline') occasion.expiresTick=world.tick+3;
    if(mode==='unsafe plan') world.mapHazards.push({id:'blocked-exit',tileId:terrainTileAt(world,exit.x,exit.y)!.id,
      kind:'meteor',createdTick:world.tick,expiresTick:world.tick+4,intensity:2});
    const stock=helper.herbs[EXPEDITION_RESCUE_HERB];
    step();
    expect(decide(helper,'accept',row)).toBeNull();
    expect(row).toMatchObject({status:'signaled',path:[]});
    expect(row.supplySpent).toBeUndefined();
    expect(helper.herbs[EXPEDITION_RESCUE_HERB]).toBe(stock);
    expect(helper.locationId).toBe(gate.id);
    expect(hasOpenExpeditionRescue(world,occasion.id)).toBe(true);
    expect(expireOccasionRescues(world,occasion.id)).toHaveLength(1);
    expect(expireOccasionRescues(world,occasion.id)).toEqual([]);
    expect(row).toMatchObject({status:'expired',reason:'gate_closed'});
  });

  it('preserves an actual stranded checkpoint instead of falsely rejoining the gate after a new route hazard',()=>{
    const {world,occasion,explorer,helper,embark,step}=fixture();
    const row=embark();
    step(); expect(advanceExpeditionRescues(world)).toHaveLength(1);
    expect(row.pathIndex).toBe(2);
    const point=row.path[row.pathIndex];
    const blocked=row.path[row.pathIndex+1];
    step();
    world.mapHazards.push({id:'new-hazard',tileId:terrainTileAt(world,blocked.x,blocked.y)!.id,
      kind:'meteor',createdTick:world.tick,expiresTick:world.tick+2,intensity:2});
    expect(advanceExpeditionRescues(world)).toHaveLength(1);
    expect(row).toMatchObject({status:'interrupted',reason:'unsafe_route',pathIndex:2,finishedTick:world.tick});
    expect(row.arrivedIds).toBeUndefined();
    expect(visibleExpeditionRescues(world,explorer)[0]).toMatchObject({checkpoint:point,arrived:false});
    expect(availableExpeditionRescueActions(helper,world)).toEqual([]);
    expect(rescueHoldsExpeditionRoll(world,occasion.id,explorer.id)).toBe(true);
    expect(rescuedMemberOutOfOccasion(world,occasion.id,explorer.id)).toBe(false);
    expect(advanceExpeditionRescues(world)).toEqual([]);
    expect(hasOpenExpeditionRescue(world,occasion.id)).toBe(true);
    world.tick=occasion.expiresTick;
    expect(hasOpenExpeditionRescue(world,occasion.id)).toBe(false);
  });

  it('can report a true lone survivor at the exact endpoint, never a two-member rescue after an actual death',()=>{
    const {world,exit,gate,occasion,explorer,helper,embark,step}=fixture();
    const row=embark();
    step();advanceExpeditionRescues(world);
    explorer.alive=false;explorer.hp=0;
    while(row.status==='extracting'){ step();advanceExpeditionRescues(world); }
    expect(row).toMatchObject({status:'interrupted',reason:'participant_lost',arrivedIds:[helper.id],pathIndex:row.path.length-1});
    expect(helper.locationId).toBe(exit.id);
    expect(explorer.locationId).toBe(gate.id);
    expect(rescuedMemberOutOfOccasion(world,occasion.id,helper.id)).toBe(true);
    expect(rescuedMemberOutOfOccasion(world,occasion.id,explorer.id)).toBe(false);
  });
});
