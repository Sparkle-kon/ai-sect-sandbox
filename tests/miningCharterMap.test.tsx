import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {WorldMapCanvas} from '../src/components/WorldMapCanvas';
import {createInitialWorld} from '../src/data/initialWorld';
import {availableNorthMiningCharterActions,projectNorthMiningCharters,type NorthMiningOption} from '../src/engine/northMiningCharterEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const north='loc-vein-north';
const sponsorId='elder-danxia-1';
const minerId='npc-6';
const setId='village-loc-vein-north';
const villagerId='recruit-village-loc-vein-north-vol-1';
const actor=(world:WorldState,actorId:string)=>world.cultivators.find(row=>row.id===actorId)!;
const action=(chosenAction:LLMDecisionPayload['chosenAction'],extra:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'在井边按自己有权核验的采契选择办理。',...extra});
const payload=(option:NorthMiningOption)=>{const {action:chosenAction,...fields}=option;return action(chosenAction,fields);};
const turn=(world:WorldState,orders:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,Object.fromEntries(
  world.cultivators.map(row=>[row.id,Object.hasOwn(orders,row.id)?orders[row.id]:action('REST')])),()=>.99,'utility');

function arrive(world:WorldState,actorId:string){
  const person=actor(world,actorId),known=knownMapLocations(world,person);
  if(person.locationId===north)return;
  if(known.some(row=>row.id===north))applyCultivatorBrainDecision(world,person,action('EXPLORE',{targetLocationId:north}),()=>.99);
  else {
    const unknown=world.locations.filter(row=>row.id!==person.locationId&&!known.includes(row));
    const candidates=unknown.length?unknown:world.locations.filter(row=>row.id!==person.locationId);
    const index=candidates.findIndex(row=>row.id===north);
    expect(index).toBeGreaterThanOrEqual(0);
    let count=0;
    applyCultivatorBrainDecision(world,person,action('EXPLORE'),()=>count++===0?(index+.2)/candidates.length:.99);
  }
  expect(person.locationId).toBe(north);
}

function preparedEvidence(){
  let world=createInitialWorld(725,'spirit-bloom');
  arrive(world,sponsorId);
  const advance=(order:LLMDecisionPayload)=>{world=turn(world,{[sponsorId]:order});};
  advance(action('GATHER_HERBS',{targetHerbId:'earth_root'}));
  advance(action('VILLAGE_WORKS',{targetSettlementId:setId,villageWorkKind:'well'}));
  advance(action('GATHER_HERBS',{targetHerbId:'jade_leaf'}));
  advance(action('SEED_CULTURE',{seedMove:'reserve',targetLocationId:north}));
  const lot=world.seedCulture.lots.find(row=>row.ownerId===sponsorId)!;
  advance(action('SEED_CULTURE',{seedMove:'test',targetSeedLotId:lot.id}));
  advance(action('SEED_CULTURE',{seedMove:'plant',targetSeedLotId:lot.id}));
  advance(action('WATER_VEIN',{waterVeinMove:'open',targetLocationId:north}));
  advance(action('REST'));advance(action('REST'));
  expect(world.tick).toBe(10);
  expect(world.seedCulture.plots[0]?.weather.some(row=>row.waterDeficit===3)).toBe(true);
  arrive(world,minerId);
  world=turn(world,{
    [minerId]:action('WATER_VEIN',{waterVeinMove:'mine',targetLocationId:north}),
    [sponsorId]:action('RECRUIT_SETTLER',{targetSettlementId:setId,targetVolunteerId:'village-loc-vein-north-vol-1'}),
  });
  expect(world.coldWaterVein?.mining.some(row=>row.actorId===minerId)).toBe(true);
  expect(world.households.members.some(row=>row.recruitedId===villagerId&&row.status==='recruited')).toBe(true);
  arrive(world,villagerId);
  return world;
}

describe('scoped map hint for a genuinely ratified native charter',()=>{
  it('shows a current charter only to the local observer; after moving the signer sees only own original',()=>{
    let world=preparedEvidence();
    const markup=(person:string,toolsOpen:boolean)=>renderToStaticMarkup(<WorldMapCanvas world={world} selectedCultivatorId={person}
      onSelectCultivator={()=>undefined} toolsOpen={toolsOpen}/>);
    const label='此处仍有在行的采契。';
    expect(markup(sponsorId,true)).not.toContain(label);
    const proposal=availableNorthMiningCharterActions(actor(world,villagerId),world,world.tick+1)
      .find(row=>row.northMiningMove==='propose'&&row.northMiningStance==='seal');
    expect(proposal).toBeDefined();
    world=turn(world,{[villagerId]:payload(proposal!)});
    expect(markup(sponsorId,true)).not.toContain(label);
    for(const id of [villagerId,minerId,sponsorId]){
      const legal=availableNorthMiningCharterActions(actor(world,id),world,world.tick+1).find(row=>row.northMiningMove==='sign');
      expect(legal).toBeDefined();
      world=turn(world,{[id]:payload(legal!)});
    }
    expect(projectNorthMiningCharters(world,actor(world,sponsorId))?.rows.at(-1)).toMatchObject({status:'ratified',active:true});
    expect(markup(sponsorId,true)).toContain(label);
    expect(markup(sponsorId,false)).not.toContain(label);
    expect(markup('npc-1',true)).not.toContain(label);
    world=turn(world,{[sponsorId]:action('EXPLORE',{targetLocationId:'loc-danxia'})});
    expect(actor(world,sponsorId).locationId).toBe('loc-danxia');
    expect(markup(sponsorId,true)).not.toContain(label);
    const personal=projectNorthMiningCharters(world,actor(world,sponsorId));
    expect(personal?.scope).toBe('personal');
    expect(personal?.rows.at(-1)).toMatchObject({status:'ratified',active:false});
  });
});
