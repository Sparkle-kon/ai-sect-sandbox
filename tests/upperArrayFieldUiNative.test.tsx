import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {availableUpperPassageActions,projectUpperPassage} from '../src/engine/upperPassageEngine';
import {availableUpperArrayFieldMovementActions,projectUpperArrayFieldMovement,type UpperArrayFieldMovementOption}
  from '../src/engine/upperArrayFieldMovementEngine';
import {projectUpperArrayFieldLocal} from '../src/engine/upperArrayFieldLocalEngine';
import type {UpperPassageMove} from '../src/engine/upperPassageTerms';
import {knownMapLocations} from '../src/engine/terrainEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {UpperArrayFieldPanel} from '../src/components/UpperArrayFieldPanel';
const id='elder-danxia-1';
const actor=(world:WorldState)=>world.cultivators.find(row=>row.id===id)!;
const choice=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'凭原身及实际收据而行。',...fields});
const turn=(world:WorldState,command=choice('REST'))=>advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>
  [row.id,row.id===id?command:choice('REST')])),()=>.99,'utility');
function oldMove(world:WorldState,upperPassageMove:UpperPassageMove){
  const option=availableUpperPassageActions(actor(world),world,world.tick+1).find(row=>row.upperPassageMove===upperPassageMove);
  expect(option).toBeDefined();
  return turn(world,choice('UPPER_PASSAGE',{upperPassageMove,targetUpperPassageNodeId:option!.targetUpperPassageNodeId}));
}
function field(world:WorldState,upperArrayFieldMove:UpperArrayFieldMovementOption['upperArrayFieldMove'],
  targetUpperArrayFieldSiteId:UpperArrayFieldMovementOption['targetUpperArrayFieldSiteId']){
  expect(availableUpperArrayFieldMovementActions(actor(world),world,world.tick+1)).toContainEqual(
    {action:'UPPER_ARRAY_FIELD',upperArrayFieldMove,targetUpperArrayFieldSiteId});
  return turn(world,choice('UPPER_ARRAY_FIELD',{upperArrayFieldMove,targetUpperArrayFieldSiteId}));
}
function counsel(){
  const north='loc-vein-north';
  let world=createInitialWorld(1,'spirit-bloom');
  const traveler=actor(world),known=knownMapLocations(world,traveler);
  const knownTarget=known.some(site=>site.id===north);
  const choices=world.locations.filter(row=>row.id!==traveler.locationId&&!known.includes(row));
  const index=choices.findIndex(row=>row.id===north);
  expect(knownTarget||index>=0).toBe(true);
  let draw=0;
  applyCultivatorBrainDecision(world,traveler,choice('EXPLORE',knownTarget?{targetLocationId:north}:{}),
    ()=>!knownTarget&&draw++===0?(index+.2)/choices.length:.99);
  expect(actor(world).locationId).toBe(north);
  const village=world.settlements.villages.find(row=>row.locationId===north)!;
  world=turn(world,choice('GATHER_HERBS',{targetHerbId:'earth_root'}));
  world=turn(world,choice('VILLAGE_WORKS',{targetSettlementId:village.id,villageWorkKind:'well'}));
  world=turn(world,choice('GATHER_HERBS',{targetHerbId:'earth_root'}));
  world=turn(world);
  expect(world.villageWorks.projects[0]).toMatchObject({status:'completed',laborTotal:4});
  world=turn(world,choice('WATER_VEIN',{waterVeinMove:'open',targetLocationId:north}));
  world=oldMove(world,'enter');
  world=oldMove(world,'advance');
  world=oldMove(world,'advance');
  world=oldMove(world,'advance');
  expect(projectUpperArrayFieldMovement(world,actor(world))).toBeUndefined();
  world=oldMove(world,'read');
  world=oldMove(world,'advance');
  expect(projectUpperArrayFieldMovement(world,actor(world))).toBeUndefined();
  return oldMove(world,'petition');
}


function room(world:WorldState){
  const body=actor(world),movement=projectUpperArrayFieldMovement(world,body),local=projectUpperArrayFieldLocal(world,body);
  return renderToStaticMarkup(<UpperArrayFieldPanel nowTick={world.tick} movement={movement} local={local}
    controls={{scopeKey:body.id+':'+body.locationId,revisionKey:world,choices:[...movement?.options??[],...local?.options??[]],onQueue:()=>false}}/>);
}
it('renders one chart from an actual Council admission through paid home, sourced production and real practice',()=>{
  let world=counsel();
  expect(room(world)).not.toContain('<canvas');
  expect(room(world)).toContain('从议庭步入阵原');
  world=field(world,'enter','array-field-gate');
  const entered=room(world);
  expect(entered.match(/<canvas/g)).toHaveLength(1);
  expect(entered).toContain('阵原门 · 第 2 行，第 1 列');
  expect(entered).not.toContain('凝纹墩');
  expect(projectUpperPassage(world,actor(world))).toBeUndefined();
  world=field(world,'travel','array-field-path');
  world=field(world,'travel','array-field-home');
  world=field(world,'settle','array-field-home');
  expect(room(world)).toContain('已在结庐台实缴落脚');
  world=field(world,'travel','array-field-practice');
  world=field(world,'travel','array-field-source');
  expect(room(world)).toContain('在墩前凝取阵片');
  expect(room(world)).toContain('本人此处可用阵片：0 枚');
  world=turn(world,choice('UPPER_ARRAY_FIELD_LOCAL',{upperArrayFieldLocalMove:'condense',targetUpperArrayFieldSiteId:'array-field-source'}));
  expect(room(world)).toContain('本人此处可用阵片：2 枚');
  world=field(world,'travel','array-field-practice');
  expect(room(world)).toContain('入晨修阵行一课');
  world=turn(world,choice('UPPER_ARRAY_FIELD_LOCAL',{upperArrayFieldLocalMove:'cultivate',targetUpperArrayFieldSiteId:'array-field-practice'}));
  const encoded=encodeEraWorldSave(world),decoded=decodeEraWorldSave(encoded);
  expect(encodeEraWorldSave(decoded)).toBe(encoded);
  expect(room(decoded)).toContain('本人此处可用阵片：1 枚');
  const outsider=decoded.cultivators.find(row=>row.id!==id&&row.alive)!;
  expect(projectUpperArrayFieldMovement(decoded,outsider)).toBeUndefined();
  expect(projectUpperArrayFieldLocal(decoded,outsider)).toBeUndefined();
});
