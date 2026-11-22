import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {availableFrontierPortTradeActions,resolveFrontierPortTradeAction} from '../src/engine/frontierPortTradeEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {configureRegionalSimulation,beginRegionalSimulationTurn,deferRegionalActorTurn,regionalModelPassiveActorIds,
  renewRegionalProtectionAfterEvent} from '../src/engine/regionalSimulationEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const buyerId='npc-8',sellerId='elder-danxia-2';
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const command=(chosenAction:LLMDecisionPayload['chosenAction'],props:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'依本人的实际货契核账。',...props});
const turn=(world:WorldState,overrides:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.filter(row=>row.alive&&row.hp>0).map(row=>[row.id,overrides[row.id]??command('REST')])),
  ()=>.99,'utility',undefined,{captureTrace:false,capturePresentation:false});
function visit(world:WorldState,actorId:string,to:string){
  const a=actor(world,actorId),known=knownMapLocations(world,a);
  if(a.locationId===to)return;
  const reachable=world.locations.filter(row=>row.id!==a.locationId&&!(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const unknown=reachable.filter(row=>!known.includes(row)),pool=unknown.length?unknown:reachable;
  const wantsKnown=known.some(row=>row.id===to),index=pool.findIndex(row=>row.id===to);
  expect(wantsKnown||index>=0).toBe(true);
  let i=0;
  applyCultivatorBrainDecision(world,a,command('EXPLORE',wantsKnown?{targetLocationId:to}:{}),
    ()=>!wantsKnown&&i++===0?(index+.25)/pool.length:.99);
  expect(a.locationId).toBe(to);
}
const deal=(world:WorldState)=>world.frontier?.port?.trade?.agreements[0];
const order=(world:WorldState,id:string,move:'propose'|'accept'|'recover_roots')=>{
  const option=availableFrontierPortTradeActions(actor(world,id),world,world.tick).find(row=>
    row.frontierPortTradeMove===move&&(move!=='propose'||row.targetCultivatorId===buyerId));
  expect(option).toBeDefined();
  const {action,...fields}=option!;
  expect(resolveFrontierPortTradeAction(world,actor(world,id),command(action,fields))).not.toBeNull();
};

describe('far actor cadence keeps regional debt with its actual holder',()=>{
  it('protects a native signed escrow after load expiry until its original buyer actually recovers it',()=>{
    let world=createInitialWorld(1,'spirit-bloom');
    expect(actor(world,buyerId).locationId).toBe('loc-tianji');
    world=turn(world,{[buyerId]:command('GATHER_HERBS',{targetHerbId:'earth_root'})});
    const paidRoots=actor(world,buyerId).herbs.earth_root;
    expect(paidRoots).toBeGreaterThanOrEqual(2);
    const unpaidProbe=structuredClone(world);
    expect(configureRegionalSimulation(unpaidProbe,'loc-taixu')).toBe(true);
    expect(regionalModelPassiveActorIds(unpaidProbe)).toContain(buyerId);
    visit(world,buyerId,'loc-market');visit(world,sellerId,'loc-market');
    order(world,sellerId,'propose');
    world=turn(world);
    order(world,buyerId,'accept');
    expect(actor(world,buyerId).herbs.earth_root).toBe(paidRoots-2);
    expect(deal(world)?.roots).toBe('inland_escrow');
    world=turn(world);
    visit(world,buyerId,'loc-tianji');
    expect(configureRegionalSimulation(world,'loc-taixu')).toBe(true);
    expect(regionalModelPassiveActorIds(world)).not.toContain(buyerId);
    expect(beginRegionalSimulationTurn(world)?.protectedActors).toContain(buyerId);
    expect(beginRegionalSimulationTurn(world)?.protectedActors).toContain(sellerId);
    while(world.tick<deal(world)!.signedTick!+48)world=turn(world);
    expect(deal(world)).toMatchObject({status:'expired',roots:'refundable_inland'});
    expect(actor(world,buyerId).locationId).toBe('loc-tianji');
    expect(actor(world,buyerId).herbs.earth_root).toBe(paidRoots-2);
    expect(regionalModelPassiveActorIds(world)).not.toContain(buyerId);
    expect(beginRegionalSimulationTurn(world)?.protectedActors).toContain(buyerId);
    expect(beginRegionalSimulationTurn(world)?.protectedActors).not.toContain(sellerId);

    // The held late claim is still proof on strict reload, not a newly funded arrangement.
    const before=encodeEraWorldSave(world);
    world=decodeEraWorldSave(before);
    expect(encodeEraWorldSave(world)).toBe(before);
    world=turn(world);
    visit(world,buyerId,'loc-market');
    order(world,buyerId,'recover_roots');
    expect(actor(world,buyerId).herbs.earth_root).toBe(paidRoots);
    expect(deal(world)).toMatchObject({status:'expired',roots:'refunded_inland',rootsReleasedTick:world.tick});
    expect(availableFrontierPortTradeActions(actor(world,buyerId),world).some(row=>row.frontierPortTradeMove==='recover_roots')).toBe(false);
    world=turn(world);
    visit(world,buyerId,'loc-tianji');
    expect(beginRegionalSimulationTurn(world)?.protectedActors).not.toContain(buyerId);
    expect(regionalModelPassiveActorIds(world)).toContain(buyerId);
  });
  it('recognizes a fresh actual obligation during the running turn, without protecting an unrelated remote actor',()=>{
    let world=createInitialWorld(1,'spirit-bloom');
    world=turn(world,{[buyerId]:command('GATHER_HERBS',{targetHerbId:'earth_root'})});
    visit(world,sellerId,'loc-market');
    expect(configureRegionalSimulation(world,'loc-taixu')).toBe(true);
    const cadence=beginRegionalSimulationTurn(world)!;
    expect(cadence.candidateActors.has(buyerId)).toBe(true);
    // A real in-month encounter resets the protection selector before a later candidate could defer.
    visit(world,buyerId,'loc-market');
    order(world,sellerId,'propose');
    renewRegionalProtectionAfterEvent(cadence);
    const unaffected=([...cadence.candidateActors.keys()].find(id=>id!==buyerId&&id!==sellerId)!);
    expect(deferRegionalActorTurn(world,cadence,actor(world,unaffected))).toBe(true);
    expect(cadence.protectedActors).toContain(buyerId);
    expect(cadence.protectedActors).toContain(sellerId);
    expect(cadence.protectedActors).not.toContain(unaffected);
  });
});
