import {describe,expect,it} from 'vitest';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {configureRegionalSimulation} from '../src/engine/regionalSimulationEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {inspectPhysicalAtlas,locatePhysicalAtlasAddress,physicalAtlasHome,projectPhysicalAtlas} from '../src/engine/physicalAtlasEngine';
import {PHYSICAL_ATLAS_CHART_ID,type PhysicalAtlasBorder} from '../src/engine/physicalAtlasTerms';
import {resolveVillageGranaryAction} from '../src/engine/villageGranaryEngine';
import {resolveVillageSupplyAction} from '../src/engine/villageSupplyEngine';

const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const spot=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id)!;
const address=(tileId:string)=>({chartId:PHYSICAL_ATLAS_CHART_ID,tileId});
const edge=({from,to}:PhysicalAtlasBorder)=>[from.address.tileId,to.address.tileId];
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静守。'};
const month=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive).map(row=>[row.id,rest])),()=>.99);

function freightFixture(){
  const world=createInitialWorld(725);world.tick=24;world.month=5;
  const [a,b]=world.settlements.villages;
  const A=spot(world,a.locationId),B=spot(world,b.locationId);
  // Small labelled geometry fixture adapted from the native supply engine test.
  // Only the initial geometry is adjusted. Both deposits, offer, acceptance and motion use native rules.
  A.x=220;A.y=220;B.x=380;B.y=220;
  const [form,receive,other]=world.cultivators;
  for(const actor of [form,receive,other]){
    actor.age=35;actor.hp=actor.maxHp;actor.spiritStones=150;actor.herbs.earth_root=30;
    actor.tribulation=undefined;actor.exploredTileIds=world.terrain.tiles.map(row=>row.id);
  }
  form.locationId=A.id;receive.locationId=B.id;other.locationId=B.id;
  const donate=(targetSettlementId:string,granaryMove:'donate_roots'|'donate_stones'):LLMDecisionPayload=>
    ({chosenAction:'VILLAGE_GRANARY',granaryMove,targetSettlementId,innerMonologue:'捐给真仓。'});
  for(let i=0;i<2;i++){
    expect(resolveVillageGranaryAction(world,form,donate(a.id,'donate_roots'))).not.toBeNull();
    expect(resolveVillageGranaryAction(world,receive,donate(b.id,'donate_stones'))).not.toBeNull();
    world.tick++;
  }
  expect(resolveVillageSupplyAction(world,form,{...rest,chosenAction:'VILLAGE_SUPPLY',villageSupplyMove:'offer',targetSettlementId:b.id})).not.toBeNull();
  const route=world.villageSupply.agreements[0];
  world.tick++;
  expect(resolveVillageSupplyAction(world,receive,{...rest,chosenAction:'VILLAGE_SUPPLY',villageSupplyMove:'accept',targetVillageSupplyId:route.id})).not.toBeNull();
  return {world,a:a.id,b:b.id,tick:world.tick,signer:receive.id,outsider:other.id};
}

describe('three real lower chart regions, independent of E3 annual buckets',()=>{
  it('keeps tile and dynamic site titles separate, represents physical hinge cells, and mutates nothing',()=>{
    const world=createInitialWorld(1,'spirit-bloom');
    const actual=inspectPhysicalAtlas(world);
    expect(actual.regions.map(({id,tileCount})=>[id,tileCount])).toEqual([['west',135],['center',120],['east',120]]);
    expect(actual.regions.find(row=>row.id==='center')?.locationIds).toContain('loc-vein-north');
    expect(actual.regions.find(row=>row.id==='east')?.locationIds).toContain('loc-market-east');
    expect(actual.regions.find(row=>row.id==='west')?.locationIds).toContain('loc-danxia');
    expect(actual.borders).toHaveLength(30);
    expect(actual.borders.map(edge)).toContainEqual(['tile-8-6','tile-9-6']);
    expect(actual.borders.map(edge)).toContainEqual(['tile-16-13','tile-17-13']);
    expect(locatePhysicalAtlasAddress(world,address('tile-12-2'))?.regionId).toBe('center');
    expect(locatePhysicalAtlasAddress(world,{...address('tile-12-2'),chartId:'region-upper'} as unknown as ReturnType<typeof address>)).toBeUndefined();
    expect(locatePhysicalAtlasAddress(world,address('realm-upper-array'))).toBeUndefined();
    expect(world.regionalSimulation).toBeUndefined();
    const zero=encodeEraWorldSave(world);
    inspectPhysicalAtlas(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(zero))).toBe(zero);
    expect(encodeEraWorldSave(world)).toBe(zero);
    const copy=structuredClone(world);
    expect(configureRegionalSimulation(copy,'loc-danxia')).toBe(true);
    expect(inspectPhysicalAtlas(copy)).toEqual(actual);
    expect(world.regionalSimulation).toBeUndefined();

    const elder=person(world,'elder-danxia-1');
    const home=physicalAtlasHome(world,elder);
    expect(home?.locationId).toBe('loc-danxia');
    expect(home?.locationOwnerSectId).toBe('sect-danxia');
    const tile=world.terrain.tiles.find(row=>row.id===home?.point.address.tileId)!;
    tile.ownerSectId='sect-tianji';
    expect(physicalAtlasHome(world,elder)).toMatchObject({locationOwnerSectId:'sect-danxia',tileOwnerSectId:'sect-tianji'});
    expect(inspectPhysicalAtlas(world).regions.find(row=>row.id==='west')).not.toHaveProperty('ownerSectId');
  });

  it('does not turn hollow cells, duplicated IDs, invalid numeric grid or busy/upper states into atlas facts',()=>{
    const world=createInitialWorld(1,'spirit-bloom');
    const actor=person(world,'elder-danxia-1');
    const previous=physicalAtlasHome(world,actor);
    expect(previous?.point.regionId).toBe('west');
    expect(projectPhysicalAtlas(world)).toBeUndefined();
    expect(physicalAtlasHome(world,structuredClone(actor))).toBeUndefined();
    actor.positionPlane='threshold';
    expect(projectPhysicalAtlas(world,actor)).toBeUndefined();
    delete actor.positionPlane;
    actor.guardAssignment={locationId:'loc-market',assignedTick:world.tick,expiresTick:world.tick+1};
    expect(physicalAtlasHome(world,actor)).toBeUndefined();
    delete actor.guardAssignment;
    actor.alive=false;actor.hp=0;
    expect(projectPhysicalAtlas(world,actor)).toBeUndefined();
    actor.alive=true;actor.hp=actor.maxHp;
    world.locations.push({...spot(world,actor.locationId)});
    expect(projectPhysicalAtlas(world,actor)).toBeUndefined();
    world.locations.pop();
    const noEast=structuredClone(world);
    noEast.locations=noEast.locations.filter(site=>site.x<680);
    expect(inspectPhysicalAtlas(noEast).regions.map(row=>row.id)).toEqual(['west','center']);
    expect(inspectPhysicalAtlas(noEast).borders).toHaveLength(15);
    world.terrain.tiles[0].id='tile-1-0';
    expect(inspectPhysicalAtlas(world)).toEqual({regions:[],borders:[],routes:[]});
  });

  it('reports only known current boundaries, not all explored edges or scoped expedition-site substitutes',()=>{
    const world=createInitialWorld(1,'spirit-bloom');
    const elder=person(world,'elder-danxia-1');
    elder.exploredTileIds=world.terrain.tiles.map(row=>row.id);
    expect(projectPhysicalAtlas(world,elder)?.regions).toEqual(['west']);
    expect(projectPhysicalAtlas(world,elder)?.borders).toEqual([]);
    elder.locationId='loc-secret-1';
    expect(projectPhysicalAtlas(world,elder)).toBeUndefined();
    elder.locationId='loc-market';
    expect(projectPhysicalAtlas(world,elder)?.regions).toEqual(['center']);
    expect(projectPhysicalAtlas(world,elder)?.routes).toEqual([]);
  });
});

describe('typed native village freight boundary proof',()=>{
  it('distinguishes acceptance from actual movement, captures both directions, and does not leak another supplier’s route',()=>{
    const {world,tick,signer,outsider}=freightFixture();
    const atDispatch=inspectPhysicalAtlas(world).routes;
    expect(atDispatch).toHaveLength(1);
    expect(atDispatch[0]).toMatchObject({kind:'village_supply',status:'established',establishedTick:tick,traversals:[]});
    expect(atDispatch[0].borders.map(edge)).toEqual([['tile-8-5','tile-9-5']]);
    expect(projectPhysicalAtlas(world,person(world,signer))?.routes[0]).toMatchObject({status:'established',traversedBorders:[]});
    expect(projectPhysicalAtlas(world,person(world,outsider))?.routes).toEqual([]);
    let finish=world;
    while(finish.villageSupply.agreements[0].status==='active'&&finish.tick<tick+10)finish=month(finish);
    expect(finish.villageSupply.agreements[0].legs?.map(row=>row.phase)).toEqual(['delivered','delivered']);
    const proof=inspectPhysicalAtlas(finish).routes[0];
    expect(proof.status).toBe('traversed');
    expect(proof.traversals.map(row=>[row.refId,row.borders.map(edge)])).toEqual([
      ['village-supply-1:earth_root',[['tile-8-5','tile-9-5']]],
      ['village-supply-1:stone',[['tile-9-5','tile-8-5']]],
    ]);
    const actualSigner=person(finish,signer);
    expect(projectPhysicalAtlas(finish,actualSigner)?.routes[0]?.traversedBorders.map(edge))
      .toEqual([['tile-8-5','tile-9-5'],['tile-9-5','tile-8-5']]);
    expect(projectPhysicalAtlas(finish,person(finish,outsider))?.routes).toEqual([]);
    const encoded=encodeEraWorldSave(finish);
    expect(inspectPhysicalAtlas(decodeEraWorldSave(encoded)).routes).toEqual([proof]);
    actualSigner.locationId='loc-blood';
    expect(projectPhysicalAtlas(finish,actualSigner)?.routes??[]).toEqual([]);
  });

  it('rejects dropped/diagonal/duplicate nodes, and ignores impossible early traversal as evidence',()=>{
    const {world}=freightFixture();
    const remove=structuredClone(world);remove.villageSupply.agreements[0].path?.splice(2,1);
    expect(inspectPhysicalAtlas(remove).routes).toEqual([]);
    const duplicate=structuredClone(world);
    duplicate.villageSupply.agreements.push(structuredClone(duplicate.villageSupply.agreements[0]));
    expect(inspectPhysicalAtlas(duplicate).routes).toEqual([]);
    const shortcut=structuredClone(world);shortcut.villageSupply.agreements[0].path![2]='tile-7-4';
    expect(inspectPhysicalAtlas(shortcut).routes).toEqual([]);
    const lie=structuredClone(world);lie.villageSupply.agreements[0].legs![0].checkpoint=4;
    expect(inspectPhysicalAtlas(lie).routes[0]).toMatchObject({status:'established',traversals:[]});
  });
});
