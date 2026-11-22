import {expect,it,vi} from 'vitest';
import {frontierChartGeometry,paintFrontierChart,type FrontierChartData} from '../src/components/FrontierChart';
import {frontierChartInk} from '../src/components/frontierChartInk';

const chartIds=['chart-east-offshore','chart-western-saltwell','chart-plateau-thunderridge','chart-upper-array-field',
  'chart-north-snow','chart-south-marsh'];

function trace(){
  const path=vi.fn(),clip=vi.fn(),arc=vi.fn(),strokeText=vi.fn(),fillText=vi.fn(),
    fill=vi.fn(),stroke=vi.fn(),curve=vi.fn(),line=vi.fn(),rect=vi.fn(),addColorStop=vi.fn();
  const ctx={save:vi.fn(),restore:vi.fn(),clearRect:vi.fn(),fillRect:fill,strokeRect:stroke,
    beginPath:path,rect,clip,translate:vi.fn(),scale:vi.fn(),createLinearGradient:vi.fn(()=>({addColorStop})),
    moveTo:vi.fn(),lineTo:line,arc,bezierCurveTo:curve,quadraticCurveTo:curve,closePath:vi.fn(),
    stroke:vi.fn(),strokeText,fillText} as unknown as CanvasRenderingContext2D;
  return {ctx,clip,strokeText,fillText,fill,curve,line,rect,addColorStop};
}
const chart=(chartId:string):FrontierChartData=>({chartId,name:'本图',rows:3,cols:3,currentTileId:'here',
  tiles:[{chartId,tileId:'here',name:'今所',row:0,col:0},
    {chartId,tileId:'peer',name:'本图邻地',row:1,col:0},
    {chartId:'another-chart',tileId:'remote',name:'别界不能画',row:0,col:1},
    {chartId,tileId:'bad',name:'越界不能画',row:9,col:0}]});

it('has distinct named chart ink palettes, including the separate Upper Array and a neutral fallback',()=>{
  expect(chartIds.map(id=>frontierChartInk(id).motif)).toEqual(['coast','salt','ridge','lattice','snow','reed']);
  expect(new Set(chartIds.map(id=>frontierChartInk(id).wash)).size).toBe(chartIds.length);
  expect(frontierChartInk('foreign').motif).toBe('plain');
});

it('paints only scoped validated geometry, clipping each authorized cell while preserving names and coordinates',()=>{
  const model=frontierChartGeometry(chart('chart-upper-array-field'))!;
  const {ctx,clip,fillText,strokeText}=trace();
  paintFrontierChart(ctx,model);
  expect(clip).toHaveBeenCalledTimes(2);
  expect(fillText.mock.calls.map(([text])=>text)).toEqual(['1·1','今所','2·1','本图邻地']);
  expect(strokeText.mock.calls).toEqual(fillText.mock.calls);
  expect(model.tiles.map(({tileId})=>tileId)).toEqual(['here','peer']);
});

it('differentiates the represented water tile without painting a third cell or any water beside a land-only frontier',()=>{
  const chartId='chart-east-offshore';
  const land=frontierChartGeometry(chart(chartId))!;
  const east=chart(chartId);
  const coast=frontierChartGeometry({...east,tiles:[...east.tiles,{chartId,tileId:'water',name:'许可外海',row:2,col:0,surface:'sea'}]})!;
  const first=trace(),second=trace();
  paintFrontierChart(first.ctx,land);paintFrontierChart(second.ctx,coast);
  expect(first.clip).toHaveBeenCalledTimes(2);
  expect(second.clip).toHaveBeenCalledTimes(3);
  expect(first.addColorStop.mock.calls).not.toContainEqual([0,'#164354']);
  expect(second.addColorStop.mock.calls).toContainEqual([0,'#164354']);
  expect(second.fillText).toHaveBeenCalledWith('许可外海',expect.any(Number),expect.any(Number),expect.any(Number));
  const again=trace();paintFrontierChart(again.ctx,coast);
  expect(again.curve.mock.calls).toEqual(second.curve.mock.calls);
  expect(again.rect.mock.calls).toEqual(second.rect.mock.calls);
});
