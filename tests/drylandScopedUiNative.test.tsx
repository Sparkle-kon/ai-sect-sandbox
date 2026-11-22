import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {FrontierPanel} from '../src/components/FrontierPanel';
import {FrontierDrylandPanel} from '../src/components/FrontierDrylandPanel';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectFrontierMovement} from '../src/engine/frontierMovementEngine';
import {projectFrontierDrylandLocal} from '../src/engine/frontierDrylandLocalEngine';
import {projectFrontierDrylandTrade} from '../src/engine/frontierDrylandTradeEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import type {FrontierMovementOption} from '../src/engine/frontierMovementEngine';

const western='npc-1',ridge='npc-8',rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'只依眼前实在地点照料。'};
const find=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id);
const step=(world:WorldState,orders:Record<string,LLMDecisionPayload>)=>advanceWorldTick(world,Object.fromEntries(
  world.cultivators.filter(row=>row.alive&&row.hp>0).map(row=>[row.id,orders[row.id]??rest])),()=>.99,'utility');
const move=(frontierMove:FrontierMovementOption['frontierMove'],targetFrontierSiteId:FrontierMovementOption['targetFrontierSiteId']):LLMDecisionPayload=>
  ({...rest,chosenAction:'FRONTIER',frontierMove,targetFrontierSiteId});
function read(world:WorldState,id:string){
  const who=find(world,id);
  const movement=projectFrontierMovement(world,who),local=projectFrontierDrylandLocal(world,who);
  const trades=projectFrontierDrylandTrade(world,who);
  return renderToStaticMarkup(<FrontierPanel view={movement}
    drylandPanel={<FrontierDrylandPanel nowTick={world.tick} movement={movement} local={local} trades={trades}/>}/>);
}

it('renders paid actual West water work and Ridge herd work from a strict native replay without cross-chart disclosure',()=>{
  let world=createInitialWorld(1,'spirit-bloom');
  const before=encodeEraWorldSave(world);
  const herb={...rest,chosenAction:'GATHER_HERBS' as const,targetHerbId:'earth_root' as const};
  world=step(world,{[western]:herb,[ridge]:herb});
  world=step(world,{[western]:herb,[ridge]:herb});
  const westAnchor=read(world,western),ridgeAnchor=read(world,ridge);
  expect(westAnchor).toContain('漠关在这处旧图锚点之外');
  expect(westAnchor).not.toContain('<canvas');
  expect(ridgeAnchor).toContain('雷脊关在这处旧图锚点之外');
  expect(ridgeAnchor).not.toContain('<canvas');
  world=step(world,{[western]:move('enter','frontier-west-gate'),[ridge]:move('enter','frontier-ridge-gate')});
  world=step(world,{[western]:move('travel','frontier-west-trail'),[ridge]:move('travel','frontier-ridge-saddle')});
  world=step(world,{[western]:move('travel','frontier-west-home'),[ridge]:move('travel','frontier-ridge-home')});
  world=step(world,{[western]:move('settle','frontier-west-home'),[ridge]:move('settle','frontier-ridge-home')});
  world=step(world,{[western]:move('travel','frontier-west-trail'),[ridge]:move('travel','frontier-ridge-saddle')});
  world=step(world,{[western]:move('travel','frontier-west-well'),[ridge]:move('travel','frontier-ridge-pasture')});
  world=step(world,{[western]:{...rest,chosenAction:'FRONTIER_DRYLAND',frontierDrylandMove:'open_well',targetFrontierSiteId:'frontier-west-well'},
    [ridge]:{...rest,chosenAction:'FRONTIER_DRYLAND',frontierDrylandMove:'tend_herd',targetFrontierSiteId:'frontier-ridge-pasture'}});
  expect(read(world,western)).toContain('井工已经开，槽未成');
  world=step(world,{[western]:{...rest,chosenAction:'FRONTIER_DRYLAND',frontierDrylandMove:'draw_water',targetFrontierSiteId:'frontier-west-well'}});
  const packed=encodeEraWorldSave(world),restored=decodeEraWorldSave(packed);
  const westHtml=read(restored,western),ridgeHtml=read(restored,ridge);
  expect(westHtml).toContain('持秤井 · 第 1 行，第 2 列');
  expect(westHtml).toContain('3 / 6 份水');
  expect(westHtml).not.toContain('本地实有小牧群');
  expect(westHtml).not.toContain('本地仓实存');
  expect(ridgeHtml).toContain('牧场 · 第 1 行，第 2 列');
  expect(ridgeHtml).toContain('本地实有小牧群 2 头，现可用牧工 2 份');
  expect(ridgeHtml).not.toContain('同一井槽');
  expect(ridgeHtml).not.toContain('本地仓实存');
  expect(westHtml.match(/<canvas/g)).toHaveLength(1);
  expect(ridgeHtml.match(/<canvas/g)).toHaveLength(1);
  expect(encodeEraWorldSave(restored)).toBe(packed);
  expect(encodeEraWorldSave(decodeEraWorldSave(before))).toBe(before);
});
