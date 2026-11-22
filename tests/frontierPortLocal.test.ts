import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {resolveFrontierMovementAction} from '../src/engine/frontierMovementEngine';
import {availableFrontierPortLocalActions,creditPortSalt,debitPortSalt,portHullAtBerth,portRiggingStock,portSaltStock,
  projectFrontierPort,resolveFrontierPortLocalAction,wearPortHull} from '../src/engine/frontierPortLocalEngine';
import {validateFrontierPortLocal,validateFrontierPortLocalShape} from '../src/engine/frontierPortLocalValidation';
import type {FrontierMovementMove,FrontierSiteId} from '../src/engine/frontierTerms';
import type {FrontierPortLocalMove} from '../src/engine/frontierPortTerms';
import type {Cultivator,WorldState} from '../src/types/world';

const actorId='npc-5';
const who=(world:WorldState)=>world.cultivators.find(row=>row.id===actorId)!;
const fail=(path:string):never=>{throw new Error(path);};
function month(world:WorldState){
  world.tick++;
  if(world.month===12){world.month=1;world.year++;}
  else world.month++;
}
function step(world:WorldState,actor:Cultivator,frontierMove:FrontierMovementMove,targetFrontierSiteId:FrontierSiteId){
  const result=resolveFrontierMovementAction(world,actor,{chosenAction:'FRONTIER',frontierMove,targetFrontierSiteId,innerMonologue:'确按邻格走。'});
  expect(result,frontierMove+' '+targetFrontierSiteId).not.toBeNull();
}
const work=(world:WorldState,actor:Cultivator,frontierPortMove:FrontierPortLocalMove,targetFrontierSiteId=actor.locationId as FrontierSiteId)=>
  resolveFrontierPortLocalAction(world,actor,{chosenAction:'FRONTIER_PORT',frontierPortMove,targetFrontierSiteId,innerMonologue:'只用实有舟材。'});
const typed=(world:WorldState)=>{
  validateFrontierPortLocalShape(JSON.parse(JSON.stringify(world.frontier?.port)) as unknown,'frontier.port.shape',fail);
  validateFrontierPortLocal(world,[],fail);
};
function resident(){
  const world=createInitialWorld(1,'spirit-bloom'),actor=who(world);
  expect(actor.locationId).toBe('loc-danxia');
  for(let i=0;i<5;i++){
    expect(applyCultivatorBrainDecision(world,actor,{chosenAction:'GATHER_HERBS',targetHerbId:'earth_root',
      innerMonologue:'本人下山采自有母根。'},()=>.99)).not.toBeNull();month(world);
  }
  expect(actor.herbs.earth_root).toBeGreaterThanOrEqual(9);
  applyCultivatorBrainDecision(world,actor,{chosenAction:'EXPLORE',targetLocationId:'loc-market-east',innerMonologue:'原路去东坊。'},()=>.99);
  expect(actor.locationId).toBe('loc-market-east');
  month(world);step(world,actor,'enter','frontier-east-gate');
  expect(world.frontier?.port).toBeUndefined();
  expect(projectFrontierPort(world,actor)).toMatchObject({siteId:'frontier-east-gate',resident:false});
  expect(availableFrontierPortLocalActions(actor,world)).toEqual([]);
  month(world);step(world,actor,'travel','frontier-east-causeway');
  month(world);step(world,actor,'travel','frontier-east-home');
  month(world);step(world,actor,'settle','frontier-east-home');
  expect(world.frontier?.port).toBeUndefined();
  month(world);step(world,actor,'travel','frontier-east-boatyard');
  expect(work(world,actor,'commission')).toBeNull();
  month(world);
  return {world,actor};
}
function built(){
  const {world,actor}=resident(),stones=actor.spiritStones,roots=actor.herbs.earth_root;
  expect(work(world,actor,'commission','frontier-east-tideflat')).toBeNull();
  expect(work(world,actor,'commission')).not.toBeNull();
  expect([stones-actor.spiritStones,roots-actor.herbs.earth_root]).toEqual([12,3]);
  const hull=portHullAtBerth(world)!;
  expect(hull).toMatchObject({id:`frontier-hull-${world.tick}-${actor.id}`,condition:4});
  expect(wearPortHull(world,hull.id)).toBe(false);
  expect(work(world,actor,'commission')).toBeNull();
  month(world);
  expect(work(world,actor,'weave_rigging')).not.toBeNull();
  expect(portRiggingStock(world)).toBe(1);
  expect(work(world,actor,'repair')).toBeNull();
  month(world);
  return {world,actor,hull};
}
describe('east-offshore local receipts',()=>{
  it('constructs the only hull from real named wallets, consumes existing rigging/stamina, and repairs without minting materials',()=>{
    const {world,actor,hull}=built();
    expect(world.month).toBe(2);
    const hp=actor.hp,qi=actor.qiProgress;
    expect(work(world,actor,'practice')).toBeNull();
    expect([actor.hp,actor.qiProgress,portRiggingStock(world)]).toEqual([hp,qi,1]);
    month(world); // March window opens.
    expect(work(world,actor,'practice')).not.toBeNull();
    expect([actor.hp,actor.qiProgress,portRiggingStock(world)]).toEqual([hp-6,Math.min(100,qi+6),0]);
    expect(work(world,actor,'repair')).toBeNull();
    month(world);
    const stones=actor.spiritStones,roots=actor.herbs.earth_root;
    expect(work(world,actor,'repair')).not.toBeNull();
    expect([stones-actor.spiritStones,roots-actor.herbs.earth_root,hull.condition,portRiggingStock(world)]).toEqual([4,2,6,0]);
    expect(projectFrontierPort(world,actor)?.hull).toMatchObject({condition:6,status:'berthed'});
    typed(world);
    const saved=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(saved))).toBe(saved);
    const forged=structuredClone(world);forged.frontier!.port!.hull!.condition=5;
    expect(()=>typed(forged)).toThrow('frontier.port.local.hull.replay');
  });

  it('harvests only actual tideflat work and keeps near storage visibility separate from vessel/elsewhere',()=>{
    const {world,actor}=built();
    month(world);step(world,actor,'travel','frontier-east-home');
    month(world);step(world,actor,'travel','frontier-east-warehouse');
    month(world);step(world,actor,'travel','frontier-east-tideflat');
    expect(work(world,actor,'gather')).toBeNull();
    while(world.month!==7)month(world);
    const material=actor.herbs.earth_root,hp=actor.hp,worldBefore=JSON.stringify(world.frontier?.port);
    expect(work(world,actor,'gather')).toBeNull();
    month(world);
    expect(work(world,actor,'gather')).toBeNull();
    expect(JSON.stringify(world.frontier?.port)).toBe(worldBefore);
    expect([material,hp]).toEqual([actor.herbs.earth_root,actor.hp]);
    month(world);
    expect(work(world,actor,'gather')).not.toBeNull();
    expect([material-actor.herbs.earth_root,hp-actor.hp,portSaltStock(world)]).toEqual([1,4,2]);
    expect(work(world,actor,'gather')).toBeNull();
    expect(projectFrontierPort(world,actor)?.tide).toBe('open');
    expect(projectFrontierPort(world,actor)).not.toHaveProperty('stock');
    expect(projectFrontierPort(world,structuredClone(actor))).toBeUndefined();
    month(world);step(world,actor,'travel','frontier-east-warehouse');
    expect(projectFrontierPort(world,actor)?.stock).toEqual({reef_salt:2,port_rigging:1});
    expect(projectFrontierPort(world,actor)).not.toHaveProperty('hull');
    expect(projectFrontierPort(world,world.cultivators.find(row=>row.id!==actor.id))).toBeUndefined();
    typed(world);
    const stolen=structuredClone(world);const batch=debitPortSalt(stolen,2)!;
    expect(creditPortSalt(stolen,batch)).toBe(true);
    expect(creditPortSalt(stolen,batch)).toBe(false);
    expect(()=>typed(stolen)).not.toThrow();
    const forgery=structuredClone(world);forgery.frontier!.port!.stock.push({...forgeFirst(forgery),amount:1});
    expect(()=>typed(forgery)).toThrow('frontier.port.local.stock.replay');
  });

  it('distinguishes physical berth from a reserved hull and does not spend HP, materials or Qi while assigned',()=>{
    const {world,actor,hull}=built();
    month(world);
    // Explicit occupancy precondition fixture, not an acceptance (native voyage has its own tests).
    world.frontier!.port!.trade={agreements:[{
      id:'port-trade-fixture',sellerId:actor.id,buyerId:'npc-6',offeredTick:2,status:'shipping',
      voyage:{hullId:hull.id,loadResidenceId:world.frontier!.residences[0].id,loadedTick:world.tick-1,lots:[],rigging:[],
        checkpoints:[],feeStones:3,cursor:0,status:'outbound',walks:[],waits:[]},
    }],nextId:1};
    expect(portHullAtBerth(world)).toBeUndefined();
    expect(projectFrontierPort(world,actor)?.hull?.status).toBe('reserved');
    const snapshot=JSON.stringify({actor,port:world.frontier!.port});
    expect(work(world,actor,'practice')).toBeNull();
    expect(work(world,actor,'repair')).toBeNull();
    expect(JSON.stringify({actor,port:world.frontier!.port})).toBe(snapshot);
  });
});
function forgeFirst(world:WorldState){return world.frontier!.port!.stock[0];}
