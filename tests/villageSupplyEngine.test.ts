import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { projectResourceFlowMonth } from '../src/engine/resourceFlowEngine';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { granaryAt,resolveVillageGranaryAction } from '../src/engine/villageGranaryEngine';
import { advanceVillageSupply,availableVillageSupplyActions,projectVillageSupply,resolveVillageSupplyAction,
  visibleVillageSupplyCheckpoints } from '../src/engine/villageSupplyEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload,WorldState } from '../src/types/world';

const make=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,...fields,innerMonologue:'只配送实际村仓实余，逐格核对。'});
const rest=make('REST');
const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const village=(world:WorldState,id:string)=>world.settlements.villages.find(row=>row.id===id)!;
const site=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id)!;
const turn=(world:WorldState,actions:Record<string,LLMDecisionPayload>={})=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.map(({id})=>[id,actions[id]??rest])),()=>.99);
const supply=(villageSupplyMove:'accept'|'decline'|'withdraw',targetVillageSupplyId:string)=>
  make('VILLAGE_SUPPLY',{villageSupplyMove,targetVillageSupplyId});

function seed(){
  const world=createInitialWorld(725);
  world.tick=24;world.month=5;
  const [a,b]=world.settlements.villages;
  const A=site(world,a.locationId),B=site(world,b.locationId);
  A.x=220;A.y=220;B.x=380;B.y=220;
  const [proposer,acceptor,outsider]=world.cultivators;
  proposer.locationId=A.id;acceptor.locationId=B.id;
  [proposer,acceptor].forEach(actor=>{
    actor.age=35;actor.hp=actor.maxHp;actor.spiritStones=150;actor.herbs.earth_root=30;
    actor.tribulation=undefined;actor.exploredTileIds=world.terrain.tiles.map(row=>row.id);
  });
  outsider.locationId=world.locations.find(row=>row.id!==A.id&&row.id!==B.id)!.id;
  return {world,a:a.id,b:b.id,proposer:proposer.id,acceptor:acceptor.id,outsider:outsider.id};
}

function offered(){
  const f=seed();
  const {world,a,b,proposer,acceptor}=f;
  const donorA=person(world,proposer),donorB=person(world,acceptor);
  const donate=(id:string,granaryMove:'donate_roots'|'donate_stones')=>
    make('VILLAGE_GRANARY',{granaryMove,targetSettlementId:id});
  for(let n=0;n<2;n++){
    expect(resolveVillageGranaryAction(world,donorA,donate(a,'donate_roots'))).not.toBeNull();
    expect(resolveVillageGranaryAction(world,donorB,donate(b,'donate_stones'))).not.toBeNull();
    world.tick++;
  }
  expect(granaryAt(world,a)).toMatchObject({roots:4,stones:0});
  expect(granaryAt(world,b)).toMatchObject({roots:0,stones:16});
  const offer=make('VILLAGE_SUPPLY',{villageSupplyMove:'offer',targetSettlementId:b});
  expect(resolveVillageSupplyAction(world,donorA,offer)?.witnessScope).toBe('participants');
  const id=world.villageSupply.agreements[0].id;
  return {...f,id,offer};
}
function accepted(){
  const f=offered();
  const {world,a,b,proposer,acceptor,id}=f;
  expect(resolveVillageSupplyAction(world,person(world,acceptor),supply('accept',id))).toBeNull();
  const prevFees=[proposer,acceptor].map(who=>person(world,who).spiritStones);
  world.tick++;
  expect(resolveVillageSupplyAction(world,person(world,acceptor),supply('accept',id))?.witnessScope).toBe('participants');
  expect([proposer,acceptor].map(who=>person(world,who).spiritStones)).toEqual(prevFees.map(stones=>stones-4));
  expect(granaryAt(world,a)).toMatchObject({roots:2,stones:0});
  expect(granaryAt(world,b)).toMatchObject({roots:0,stones:8});
  expect(world.villageSupply.agreements[0]).toMatchObject({status:'active',acceptedTick:world.tick,
    legs:[{phase:'outbound',checkpoint:0,good:'earth_root'},{phase:'outbound',checkpoint:0,good:'stone'}]});
  expect(world.villageSupply.agreements[0].path?.length).toBeGreaterThan(3);
  return f;
}
const positions=(world:WorldState,a:string,b:string)=>[a,b].map(id=>village(world,id).population);
const totals=(world:WorldState,a:string,b:string)=>{
  const va=granaryAt(world,a)!,vb=granaryAt(world,b)!;
  return [va.roots+vb.roots,va.stones+vb.stones];
};

describe('real granary supply dispatch, route custody and exact outcomes',()=>{
  it('demands each genuine donor and on-hand stock only at accept; a stale departed signer cannot fund a duplicate',()=>{
    const {world,a,b,proposer,acceptor,outsider,id,offer}=offered();
    expect(projectVillageSupply(world,person(world,outsider))).toEqual([]);
    expect(projectVillageSupply(world,person(world,acceptor))).toHaveLength(1);
    expect(availableVillageSupplyActions(person(world,acceptor),world).some(row=>row.villageSupplyMove==='accept')).toBe(false);
    expect(resolveVillageSupplyAction(world,person(world,proposer),offer)).toBeNull();
    world.tick++;
    expect(availableVillageSupplyActions(person(world,acceptor),world)).toContainEqual(expect.objectContaining({villageSupplyMove:'accept'}));
    expect(resolveVillageSupplyAction(world,person(world,acceptor),{...supply('accept',id),targetSettlementId:b})).toBeNull();
    person(world,proposer).locationId=site(world,village(world,b).locationId).id;
    expect(resolveVillageSupplyAction(world,person(world,acceptor),supply('accept',id))).toBeNull();
    expect(granaryAt(world,a)).toMatchObject({roots:4,stones:0});
    expect(granaryAt(world,b)).toMatchObject({roots:0,stones:16});
    expect(resolveVillageSupplyAction(world,person(world,acceptor),supply('decline',id))).not.toBeNull();
    expect(world.villageSupply.agreements[0]).toMatchObject({status:'declined'});
    expect(world.villageSupply.agreements[0].legs).toBeUndefined();
    expect(projectResourceFlowMonth(world,world.tick,{kind:'observer'})?.rows.some(row=>row.mechanism==='village_supply')??false).toBe(false);
  });

  it('uses real checkpoint progression, filters private and fogged routes, then delivers two opposite goods once',()=>{
    const {world,a,b,proposer,acceptor,id}=accepted();
    const finishedAt=world.tick+(world.villageSupply.agreements[0].path!.length-1);
    const knownOnly=new Set([world.villageSupply.agreements[0].path![0]]);
    expect(visibleVillageSupplyCheckpoints(world,knownOnly)).toMatchObject([{route:[expect.any(Object)],returning:false}]);
    expect(visibleVillageSupplyCheckpoints(world,new Set())).toEqual([]);
    expect(visibleVillageSupplyCheckpoints(world)).toHaveLength(2);
    const resumed=decodeWorldSave(encodeWorldSave(world));
    expect(resumed.villageSupply).toEqual(world.villageSupply);
    expect(totals(resumed,a,b)).toEqual([2,8]);
    expect(resolveVillageSupplyAction(world,person(world,acceptor),supply('accept',id))).toBeNull();
    let now=world;
    const population=positions(world,a,b);
    while(now.tick<finishedAt){
      now=turn(now);
      if(now.tick<finishedAt) expect(totals(now,a,b)).toEqual([2,8]);
    }
    expect(positions(now,a,b)).toEqual(population);
    expect(granaryAt(now,a)).toMatchObject({roots:2,stones:8});
    expect(granaryAt(now,b)).toMatchObject({roots:2,stones:8});
    expect(totals(now,a,b)).toEqual([4,16]);
    expect(now.villageSupply.agreements[0]).toMatchObject({status:'completed',closedTick:now.tick,
      legs:[{phase:'delivered',settledTick:now.tick},{phase:'delivered',settledTick:now.tick}]});
    expect(visibleVillageSupplyCheckpoints(now)).toEqual([]);
    const flows=projectResourceFlowMonth(now,now.tick,{kind:'observer'})?.rows.filter(row=>row.refId===id);
    expect(flows?.map(({good,amount,kind,reason})=>[good,amount,kind,reason])).toEqual([
      ['earth_root',2,'transfer','village_supply_arrival'],['stone',8,'transfer','village_supply_arrival'],
    ]);
    expect(advanceVillageSupply(now)).toEqual([]);
    expect(totals(turn(now),a,b)).toEqual([4,16]);
    expect(projectVillageSupply(now,person(now,proposer))).toHaveLength(1);
  });

  it('does not let repeated actual donations fill capacity already promised to an incoming load',()=>{
    const {world,a,b,proposer,acceptor}=accepted();
    const target=village(world,b);
    const neighbors=world.cultivators.filter(row=>row.id!==proposer&&row.id!==acceptor).slice(0,10);
    for(const actor of neighbors){
      actor.locationId=target.locationId;
      actor.age=35;
      actor.herbs.earth_root=30;
      actor.hp=actor.maxHp;
      actor.tribulation=undefined;
    }
    const deposit=make('VILLAGE_GRANARY',{granaryMove:'donate_roots',targetSettlementId:b});
    for(const donor of neighbors.slice(0,9))expect(resolveVillageGranaryAction(world,donor,deposit)).not.toBeNull();
    expect(granaryAt(world,b)?.roots).toBe(18);
    expect(resolveVillageGranaryAction(world,neighbors[9],deposit)).toBeNull();
    let now=world;
    const route=world.villageSupply.agreements[0].path!;
    for(let i=1;i<route.length;i++)now=turn(now);
    expect(granaryAt(now,b)?.roots).toBe(20);
    expect(totals(now,a,b)[0]).toBe(22);
  });

  it('turns one real route back from an actual unsafe next checkpoint; the other still settles independently',()=>{
    const {world,a,b,id}=accepted();
    const path=world.villageSupply.agreements[0].path!;
    const tile=world.terrain.tiles.find(row=>row.id===path[1])!;
    const point={x:(tile.col+.5)*1000/world.terrain.columns,y:(tile.row+.5)*600/world.terrain.rows};
    const wet=applyMapBrush(applyMapBrush(world,'cursed_miasma',[point]),'cursed_miasma',[point]);
    const turned=turn(wet);
    const row=turned.villageSupply.agreements[0];
    expect(row.legs?.[0]).toMatchObject({phase:'returned',checkpoint:0,settledTick:turned.tick,turnback:{
      tick:turned.tick,cause:'unsafe_next',hazard:{tileId:tile.id,kind:'cursed_miasma',intensity:2},
    }});
    expect(row.legs?.[1]).toMatchObject({phase:'outbound',checkpoint:1});
    expect(totals(turned,a,b)).toEqual([4,8]);
    let now=turned;
    for(let count=0;count<path.length+2&&now.villageSupply.agreements[0].status==='active';count++)now=turn(now);
    expect(now.villageSupply.agreements[0].legs?.[0]).toMatchObject({phase:'returned',checkpoint:0});
    // The return path replenishes only the original source's actual roots.
    expect(granaryAt(now,a)?.roots).toBe(4);
    expect(granaryAt(now,b)?.roots).toBe(0);
    expect(totals(now,a,b)).toEqual([4,16]);
    const exact=projectResourceFlowMonth(now,now.villageSupply.agreements[0].legs![0].settledTick!,{kind:'observer'})?.rows.find(row=>
      row.refId===id&&row.reason==='village_supply_return'&&row.good==='earth_root');
    expect(exact).toMatchObject({kind:'transfer',amount:2,to:{kind:'granary',id:a}});
  });

  it('seals a live crossed severe beast tide loss at the exact route checkpoint and never replenishes the destroyed crates',()=>{
    const {world,a,b,id}=accepted();
    const path=world.villageSupply.agreements[0].path!;
    const tile=world.terrain.tiles.find(row=>row.id===path[1])!;
    const point={x:(tile.col+.5)*1000/world.terrain.columns,y:(tile.row+.5)*600/world.terrain.rows};
    let struck=world;
    for(let n=0;n<3;n++)struck=applyMapBrush(struck,'beast_tide',[point]);
    expect(terrainTileAt(struck,point.x,point.y)?.id).toBe(tile.id);
    const actual=struck.mapHazards.find(hazard=>hazard.tileId===tile.id&&hazard.kind==='beast_tide')!;
    let now=turn(struck);
    const lossTick=now.tick;
    expect(now.villageSupply.agreements[0].legs?.[0]).toMatchObject({phase:'lost',checkpoint:1,settledTick:lossTick,loss:actual});
    expect(projectResourceFlowMonth(now,lossTick,{kind:'observer'})?.rows.find(row=>row.refId===id&&row.reason==='village_supply_loss'))
      .toMatchObject({kind:'loss',amount:2,good:'earth_root'});
    for(let count=0;count<path.length+4;count++)now=turn(now);
    expect(now.mapHazards.some(hazard=>hazard.id===actual.id)).toBe(false);
    expect(now.villageSupply.agreements[0].legs?.[0]).toMatchObject({phase:'lost',loss:actual,settledTick:lossTick});
    expect(decodeWorldSave(encodeWorldSave(now)).villageSupply).toEqual(now.villageSupply);
    expect(totals(now,a,b)[0]).toBe(2);
    expect(advanceVillageSupply(now)).toEqual([]);
  });
});
