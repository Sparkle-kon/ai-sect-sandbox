import {describe,expect,it} from 'vitest';
import {resolveGuidedWorldTurn} from '../src/controllers/guidedWorldTurn';
import {availableFrontierNightHuntActions} from '../src/engine/frontierNightHunt';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';
const actorId='elder-danxia-1';
const step=(world:WorldState, decision:Omit<LLMDecisionPayload,'innerMonologue'>)=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===actorId?
    {...decision,innerMonologue:'走实际当地一步。'}:{chosenAction:'REST',innerMonologue:''}] as const)),()=>.99,'utility');

describe('guided snowfield turn is a single capability, not a transferable weather/trail prediction',()=>{
  it('binds exact visit-owner view and rejects branch, epoch, fabricated destination and alternate actor scopes',()=>{
    let world=prepareNorthWellHistoricalSource().world;
    world=step(world,{chosenAction:'GATHER_HERBS',targetHerbId:'earth_root'});
    world=step(world,{chosenAction:'FRONTIER',frontierMove:'enter',targetFrontierSiteId:'frontier-north-gate'});
    world=step(world,{chosenAction:'FRONTIER',frontierMove:'travel',targetFrontierSiteId:'frontier-north-lee-west'});
    world=step(world,{chosenAction:'FRONTIER',frontierMove:'travel',targetFrontierSiteId:'frontier-north-lee-mid'});
    const actor=world.cultivators.find(row=>row.id===actorId)!;
    const option=availableFrontierNightHuntActions(actor,world).find(row=>row.frontierNightHuntMove==='return')!;
    const exact={kind:'frontier-night-hunt',world,actorId,option,branchId:'north',revision:4} as const;
    const granted=resolveGuidedWorldTurn(exact,world,'north',4)!;
    expect(granted.actorId).toBe(actorId);
    expect(granted.decision).toMatchObject({chosenAction:'FRONTIER_NIGHT_HUNT',
      frontierNightHuntMove:'return',targetFrontierSiteId:'frontier-north-lee-west'});
    expect(resolveGuidedWorldTurn(exact,world,'other',4)).toBeUndefined();
    expect(resolveGuidedWorldTurn(exact,world,'north',5)).toBeUndefined();
    expect(resolveGuidedWorldTurn(exact,structuredClone(world),'north',4)).toBeUndefined();
    expect(resolveGuidedWorldTurn({...exact,actorId:'elder-danxia-2'},world,'north',4)).toBeUndefined();
    expect(resolveGuidedWorldTurn({...exact,option:{...option,targetFrontierSiteId:'loc-vein-north'}},world,'north',4)).toBeUndefined();
    const result=step(world,granted.decision);
    expect(result.cultivators.find(row=>row.id===actorId)?.locationId).toBe('frontier-north-lee-west');
    expect(result.events).toContainEqual(expect.objectContaining({tick:result.tick,locationId:'frontier-north-lee-west',
      title:'走过相邻一格',actorIds:[actorId],witnessScope:'participants'}));
    expect(resolveGuidedWorldTurn(exact,result,'north',4)).toBeUndefined();
  });
});
