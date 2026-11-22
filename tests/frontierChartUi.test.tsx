import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {FrontierChart,frontierChartGeometry,type FrontierChartData} from '../src/components/FrontierChart';

const chart:FrontierChartData={chartId:'chart-north-snow',name:'北岭雪谷',rows:3,cols:3,currentTileId:'n00',tiles:[
  {chartId:'chart-south-marsh',tileId:'s01',row:0,col:1,name:'冒入的潮闸'},
  {chartId:'chart-north-snow',tileId:'n00',row:0,col:0,name:'雪谷关'},
  {chartId:'chart-north-snow',tileId:'n11',row:1,col:1,name:'此处已知的泉眼'},
  {chartId:'chart-north-snow',tileId:'n-out',row:1,col:3,name:'越界格'},
]};

describe('scoped frontier native chart display',()=>{
  it('only publishes authorized current chart coordinates; no global map fallback',()=>{
    const html=renderToStaticMarkup(<FrontierChart chart={chart}/>);
    expect(html).toContain('此处脚下：雪谷关 · 第 1 行，第 1 列');
    expect(html).toContain('此处已知的泉眼 · 第 2 行，第 2 列');
    expect(html).toContain('aria-current="location"');
    expect(html).not.toContain('冒入的潮闸');
    expect(html).not.toContain('越界格');
    expect(html).not.toContain('n00');
    expect(frontierChartGeometry(chart)?.tiles.map(row=>row.tileId)).toEqual(['n00','n11']);
  });
  it('does not paint a duplicate or missing/stale actual location',()=>{
    expect(frontierChartGeometry({...chart,currentTileId:'missing'})).toBeUndefined();
    expect(frontierChartGeometry({...chart,tiles:[...chart.tiles,{...chart.tiles[1],tileId:'forked-duplicate'}]})).toBeUndefined();
    expect(renderToStaticMarkup(<FrontierChart chart={{...chart,currentTileId:'s01'}}/>)).toBe('');
  });
});
