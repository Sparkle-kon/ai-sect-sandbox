import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {CrossRegionConsequenceRead} from '../src/components/CrossRegionConsequenceRead';
import type {FrontierSupplyLink as FrontierSupplyLinkView} from '../src/engine/frontierSupplyLinks';

const reed:FrontierSupplyLinkView={id:'internal-reed-slice',kind:'north_practice',good:'ward_reed',quantity:1,
  harvestedTick:44,loadedTick:48,arrivedTick:54,deliveredTick:56,usedTick:57,result:{kind:'qi_gain',qiGained:7}};
const ore:FrontierSupplyLinkView={id:'hidden-ridge-original',kind:'west_layer',good:'stormstone',quantity:1,
  harvestedTick:43,loadedTick:49,arrivedTick:57,deliveredTick:58,usedTick:59,
  result:{kind:'layer_backlash',realm:'筑基',fromStage:2,toStage:2}};
const frame={tick:59,year:1005,month:11};

it('leads with the actual latest small scene and dates as optional evidence, never exposes source IDs',()=>{
  const html=renderToStaticMarkup(<CrossRegionConsequenceRead consequences={[reed,ore]} viewerName="凌尘子" frame={frame}/>);
  expect(html).toContain('雷脊来石，西井叩关');
  expect(html).toContain('凌尘子用下了一块雷脊来石');
  expect(html).toContain('这回没进层');
  expect(html).not.toContain('叩开了同境一层');
  expect(html).toContain('看这批货的来路');
  expect(html).toContain('仙历 1005 年 11 月');
  expect(html).toContain('更早的远货后事');
  expect(html).toContain('灵气实增 7 点');
  expect(html).not.toContain(reed.id);
  expect(html).not.toContain(ore.id);
  expect(html).not.toContain('<button');
  expect(html).not.toContain('<table');
  expect(html.indexOf('西井叩关')).toBeLessThan(html.indexOf('暖了雪谷一课'));
});
it('never portrays unfinished arrivals, invalid quantities, duplicates or past-frame future use as an actual consequence',()=>{
  for(const mock of [
    [],
    [reed,reed],
    [{...reed,usedTick:reed.deliveredTick}],
    [{...reed,deliveredTick:reed.arrivedTick-1}],
    [{...reed,usedTick:frame.tick+1}],
  ])expect(renderToStaticMarkup(<CrossRegionConsequenceRead consequences={mock} frame={frame}/>)).toBe('');
});
it('distinguishes a completed same-realm advance from a realm breakthrough and keeps the record read-only',()=>{
  const advanced:FrontierSupplyLinkView={...ore,result:{kind:'layer_advanced',realm:'筑基',fromStage:2,toStage:3}};
  const html=renderToStaticMarkup(<CrossRegionConsequenceRead consequences={[advanced]}/>);
  expect(html).toContain('第 2 层至第 3 层');
  expect(html).toContain('未曾破境');
  expect(html).not.toContain('没进层');
  expect(html).not.toContain('更早的远货后事');
});
