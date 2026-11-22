import {describe,expect,it} from 'vitest';
import {buildMapTravelTrajectory} from '../src/components/mapTravelTrajectory';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {terrainTileAt} from '../src/engine/terrainEngine';
import type {Cultivator,WorldState} from '../src/types/world';
import {acceptedNativeFreight,freightActor,freightCarrier,freightContract,freightMonth,freightOther,freightRequire,
  freightSeller,nativeFreightShipment} from './marketFreightNativeFixture';
import {mealActor,mealHost,mealJourney,mealMonth,mealOutsider,pilgrimageOrder} from './waypostMealNativeFixture';

const project=(world:WorldState,viewer:Cultivator,previous?:WorldState,fog=false)=>
  buildMapTravelTrajectory(world,createTerrainMapView(world,viewer,fog),viewer,previous);
const noMotion={markers:[],hasMotion:false};

function physicalCargo(){
  const accepted=acceptedNativeFreight();
  let before=accepted.offered,world=accepted.world;
  for(let i=0;i<5&&!freightContract(world)?.freight?.dispatch;i++){
    before=world;
    world=freightMonth(world);
  }
  const row=freightContract(world);
  freightRequire(row?.freight?.dispatch&&row.pathIndex>0&&row.status==='active','Expected a real native freight dispatch');
  return {before,world,row};
}

function physicalPilgrimage(){
  // Two bodies start at the genuine central market; the native public route to their farther second stop remains unedited.
  let world=createInitialWorld(13071);
  const guest='npc-2';
  for(const id of [mealHost,guest]){
    const actor=mealActor(world,id);
    actor.locationId='loc-market';actor.spiritStones=100;actor.exploredTileIds=[];actor.rumors=[];
  }
  world=mealMonth(world,{[mealHost]:pilgrimageOrder(world,mealHost,'propose',guest)});
  world=mealMonth(world,{[guest]:pilgrimageOrder(world,guest,'accept')});
  for(let i=0;i<8&&mealJourney(world,mealHost).status==='active';i++){
    const before=world;
    world=mealMonth(before,{[mealHost]:pilgrimageOrder(before,mealHost,'advance')});
    const old=mealJourney(before,mealHost),row=mealJourney(world,mealHost);
    if(row.legIndex===old.legIndex&&old.pathIndex>0&&row.pathIndex>old.pathIndex)return {before,world,row,old};
  }
  throw Error('Expected two actual strides within a single native paid leg');

}

describe('native transport trajectory projection',()=>{
  it('shows only the selected actual carrier at a settled freight dispatch—not buyer, seller, unrelated colocated body or unescorted load',()=>{
    const {world,row}=physicalCargo();
    const carrier=freightActor(world,freightCarrier);
    const point=row.path[row.pathIndex];
    expect(project(world,carrier)).toEqual({markers:[{id:row.id,kind:'caravan',point,walked:[]}],hasMotion:false});
    expect(project(world,freightActor(world,freightOther))).toEqual(noMotion);
    expect(project(world,freightActor(world,freightSeller))).toEqual(noMotion);
    expect(project(world,structuredClone(carrier))).toEqual(noMotion);
    const unescorted=nativeFreightShipment();
    expect(project(unescorted.world,freightActor(unescorted.world,freightCarrier))).toEqual(noMotion);
  });

  it('exposes exactly the latest native cargo stride and falls back to the same static endpoint for missing or changed proof',()=>{
    const first=physicalCargo();
    // The first dispatch may be in the consent frame. Take a distinct month to guarantee retained prior path.
    const before=first.world,world=freightMonth(before);
    const old=freightContract(before),row=freightContract(world);
    freightRequire(old&&row?.status==='active'&&row.pathIndex>old.pathIndex,'Expected adjacent native cargo strides');
    const carrier=freightActor(world,freightCarrier);
    const got=project(world,carrier,before);
    expect(got.hasMotion).toBe(true);
    expect(got.markers[0].walked).toEqual(row.path.slice(old.pathIndex,row.pathIndex+1));
    expect(got.markers[0].walked.at(-1)).toEqual(row.path[row.pathIndex]);

    const altered=structuredClone(before);
    freightContract(altered)!.path[0].x+=.001;
    const drift=structuredClone(before);drift.month=drift.month===1?2:1;
    for(const invalid of [undefined,world,altered,drift])expect(project(world,carrier,invalid)).toEqual(project(world,carrier));

    const noReceipt=structuredClone(world);
    freightContract(noReceipt)!.lastCrossedTileIds=[];
    expect(project(noReceipt,freightActor(noReceipt,freightCarrier),before).hasMotion).toBe(false);
  });

  it('shows only the chosen paid pilgrimage and returns no earlier, proposed or independently located party',()=>{
    const {before,world,row,old}=physicalPilgrimage();
    const leader=mealActor(world,mealHost);
    const result=project(world,leader,before);
    expect(result.markers).toEqual([{id:row.id,kind:'pilgrimage',point:row.path[row.pathIndex],
      walked:row.path.slice(old.pathIndex,row.pathIndex+1)}]);
    expect(result.hasMotion).toBe(true);
    expect(project(world,mealActor(world,mealOutsider),before)).toEqual(noMotion);
    expect(project(world,leader,undefined)).toEqual({markers:[{id:row.id,kind:'pilgrimage',point:row.path[row.pathIndex],walked:[]}],hasMotion:false});

    const missed=mealMonth(world);
    expect(project(missed,mealActor(missed,mealHost),world)).toEqual(project(world,leader,undefined));
  });

  it('does not clip a stride into a fake move when any traversed tile loses current visibility',()=>{
    const {before,world,row,old}=physicalPilgrimage();
    const leader=mealActor(world,mealHost), view=createTerrainMapView(world,leader,false);
    const points=row.path.slice(old.pathIndex,row.pathIndex+1);
    const ids=points.map(p=>terrainTileAt(world,p.x,p.y)?.id);
    const hidden=ids.find((id,i)=>i>0&&i<ids.length-1&&id!==ids[0]&&id!==ids.at(-1));
    expect(hidden).toBeDefined();
    const physicallyHidden=createTerrainMapView(world,leader,true);
    // Narrow test projection for one obscured interior tile, with real current checkpoint preserved.
    const current=new Set(world.terrain.tiles.map(({id})=>id).filter(id=>id!==hidden));
    const restricted={...physicallyHidden,current,tileState:(tile:typeof world.terrain.tiles[number])=>
      current.has(tile.id)?'visible' as const:'explored' as const};
    expect(buildMapTravelTrajectory(world,view,leader,before).hasMotion).toBe(true);
    expect(buildMapTravelTrajectory(world,restricted,leader,before)).toEqual(project(world,leader));
  });
});
