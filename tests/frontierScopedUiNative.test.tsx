import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {FrontierPanel,type FrontierControls} from '../src/components/FrontierPanel';
import {projectFrontierMovement} from '../src/engine/frontierMovementEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';

const northern='elder-danxia-1',southern='elder-danxia-2';
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'按当前山行实址过月。'};
const byId=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id);
const step=(world:WorldState,commands:Record<string,LLMDecisionPayload>)=>advanceWorldTick(world,Object.fromEntries(
  world.cultivators.filter(actor=>actor.alive&&actor.hp>0).map(actor=>[actor.id,commands[actor.id]??rest])),()=>.99,'utility');

it('renders the actual paid December northern station, its safe neighbor, and separate old-market/southern viewpoints',()=>{
  let world=prepareNorthWellHistoricalSource().world;
  world=step(world,{[northern]:{...rest,chosenAction:'GATHER_HERBS',targetHerbId:'earth_root'},
    [southern]:{...rest,chosenAction:'GATHER_HERBS',targetHerbId:'earth_root'}});
  const old=projectFrontierMovement(world,byId(world,northern));
  expect(old?.scope).toBe('anchor');
  expect(renderToStaticMarkup(<FrontierPanel view={old}/>)).not.toContain('<canvas');
  world=step(world,{[northern]:{...rest,chosenAction:'FRONTIER',frontierMove:'enter',targetFrontierSiteId:'frontier-north-gate'},
    [southern]:{...rest,chosenAction:'EXPLORE',targetLocationId:'loc-market'}});
  expect([world.tick,world.month]).toEqual([36,12]);
  const packed=encodeEraWorldSave(world),native=decodeEraWorldSave(packed);
  expect(encodeEraWorldSave(native)).toBe(packed);
  const north=projectFrontierMovement(native,byId(native,northern));
  const south=projectFrontierMovement(native,byId(native,southern));
  if(!north||!south)throw Error('Exact frontier/native anchor readers missing');
  const controls:FrontierControls={scopeKey:'source:north',revisionKey:native,choices:north.options,onQueue:()=>false};
  const html=renderToStaticMarkup(<FrontierPanel view={north} controls={controls}/>);
  expect(html).toContain('此处脚下：雪谷关 · 第 2 行，第 1 列');
  expect(html).toContain('第 36 轮实付 8 灵石、1 份地根');
  expect(html).toContain('走到西背风台');
  expect(html).not.toContain('走到北岭直脊');
  expect(html).not.toContain('南泽');
  const southHtml=renderToStaticMarkup(<FrontierPanel view={south}/>);
  expect(southHtml).not.toContain('<canvas');
  expect(southHtml).not.toContain('雪谷关');
  expect(southHtml).toContain('灵田泽关');
  const enteredSouth=step(native,{[southern]:{...rest,chosenAction:'FRONTIER',frontierMove:'enter',
    targetFrontierSiteId:'frontier-south-gate'}});
  const actualSouth=projectFrontierMovement(enteredSouth,byId(enteredSouth,southern));
  if(!actualSouth)throw Error('Actual southern arrival missing');
  const ownSouth=renderToStaticMarkup(<FrontierPanel view={actualSouth} controls={{...controls,revisionKey:enteredSouth,choices:actualSouth.options}}/>);
  expect(ownSouth).toContain('此处脚下：灵田泽关 · 第 2 行，第 1 列');
  expect(ownSouth).toContain('走到泽心埂');
  expect(ownSouth).toContain('第 37 轮实付 8 灵石、1 份地根');
  expect(ownSouth).not.toContain('雪谷关');
  expect(projectFrontierMovement(native,{...byId(native,northern)!})).toBeUndefined();
  expect(encodeEraWorldSave(native)).toBe(packed);
});
