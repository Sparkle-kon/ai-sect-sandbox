import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {FrontierPanel} from '../src/components/FrontierPanel';
import {FrontierPortPanel} from '../src/components/FrontierPortPanel';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectFrontierMovement} from '../src/engine/frontierMovementEngine';
import {projectFrontierPort} from '../src/engine/frontierPortLocalEngine';
import {projectFrontierPortTrade} from '../src/engine/frontierPortTradeEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const actorId='elder-danxia-2',rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'从实到之处行事。'};
const byId=(world:WorldState)=>world.cultivators.find(actor=>actor.id===actorId);
const step=(world:WorldState,order:LLMDecisionPayload)=>advanceWorldTick(world,Object.fromEntries(
  world.cultivators.filter(actor=>actor.alive&&actor.hp>0).map(actor=>[actor.id,actor.id===actorId?order:rest])),()=>.99,'utility');

it('keeps the actually scoped east dock and visibly nearby nonwalkable sea separate from the old eastern market',()=>{
  let world=createInitialWorld(1,'spirit-bloom');
  world=step(world,{...rest,chosenAction:'GATHER_HERBS',targetHerbId:'earth_root'});
  world=step(world,{...rest,chosenAction:'EXPLORE',targetLocationId:'loc-market-east'});
  const old=projectFrontierMovement(world,byId(world));
  expect(old?.scope).toBe('anchor');
  const ground=renderToStaticMarkup(<FrontierPanel view={old} portPanel={<FrontierPortPanel movement={old}/>}/>);
  expect(ground).toContain('外港牌关在这处旧图锚点之外');
  expect(ground).not.toContain('<canvas');
  for(const [move,site] of [['enter','frontier-east-gate'],['travel','frontier-east-causeway'],
    ['travel','frontier-east-dock']] as const){
    world=step(world,{...rest,chosenAction:'FRONTIER',frontierMove:move,targetFrontierSiteId:site});
  }
  const packed=encodeEraWorldSave(world),restored=decodeEraWorldSave(packed),actor=byId(restored);
  const current=projectFrontierMovement(restored,actor),local=projectFrontierPort(restored,actor),trades=projectFrontierPortTrade(restored,actor);
  if(!current||!local)throw Error('Actual east dock projection missing');
  const html=renderToStaticMarkup(<FrontierPanel view={current} controls={{
    scopeKey:'exact:viewer',revisionKey:restored,choices:current.options,onQueue:()=>false
  }} portPanel={<FrontierPortPanel movement={current} local={local} trades={trades}/>}/>);
  expect(html).toContain('登验泊位 · 第 1 行，第 2 列');
  expect(html).toContain('外海潮口 · 第 1 行，第 1 列 · 水格不可步行');
  expect(html).toContain('眼下港务');
  expect(html).not.toContain('走到外海潮口');
  expect(html).not.toContain('霜药');
  expect(html).not.toContain('海陆货约');
  expect(encodeEraWorldSave(restored)).toBe(packed);
});
