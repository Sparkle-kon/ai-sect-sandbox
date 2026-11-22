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

describe('proved night trail in known terrain only',()=>{
  const trail={chartId:chart.chartId,tileId:'n11'};
  it('annotates only the already admitted exact non-sea cell',()=>{
    const html=renderToStaticMarkup(<FrontierChart chart={chart} trail={trail}/>);
    expect(html).toContain('此处已知的泉眼 · 第 2 行，第 2 列 · 此处曾查见足迹');
    expect(html).not.toContain('n11');
  });
  it('omits absent, foreign, unknown and sea marks from accessible terrain',()=>{
    for(const invalid of [undefined,{...trail,chartId:'chart-south-marsh'},{...trail,tileId:'n-out'}]){
      expect(renderToStaticMarkup(<FrontierChart chart={chart} trail={invalid}/>)).not.toContain('曾查见足迹');
    }
    const maritime:FrontierChartData={...chart,tiles:chart.tiles.map(tile=>tile.tileId===trail.tileId?{...tile,surface:'sea'}:tile)};
    expect(renderToStaticMarkup(<FrontierChart chart={maritime} trail={trail}/>)).not.toContain('曾查见足迹');
  });
});

describe('actually crossed gorge section',()=>{
  const walked:FrontierChartData={...chart,currentTileId:'n01',tiles:[...chart.tiles,
    {chartId:chart.chartId,tileId:'n01',row:0,col:1,name:'今到歇脚处'}]};
  const crossing={chartId:chart.chartId,fromTileId:'n00',toTileId:'n01'};
  it('mirrors only the authenticated directed pair in text without native IDs',()=>{
    const html=renderToStaticMarkup(<FrontierChart chart={walked} crossing={crossing}/>);
    expect(html).toContain('实经一段：雪谷关 至 今到歇脚处。');
    expect(html).not.toMatch(/n00|n01/);
  });
  it('hides missing, nonadjacent, foreign or reversed stale pairs instead of extending the map',()=>{
    const invalid=[undefined,{...crossing,toTileId:'n11'},{...crossing,fromTileId:'n-out'},
      {...crossing,chartId:'chart-south-marsh'},{...crossing,fromTileId:'n01',toTileId:'n00'}];
    for(const crossing of invalid)expect(renderToStaticMarkup(<FrontierChart chart={walked} crossing={crossing}/>))
      .not.toContain('实经一段');
  });
});

describe('anonymous paid waterfront lamp',()=>{
  const lamp={chartId:chart.chartId,tileId:'n11'};
  it('shows only the lamp in its exact admitted known land tile',()=>{
    const html=renderToStaticMarkup(<FrontierChart chart={chart} lamp={lamp}/>);
    expect(html).toContain('此处已知的泉眼 · 第 2 行，第 2 列 · 此处实点了一盏灯');
    expect(html).not.toMatch(/n11|亡者|祭奠人/);
  });
  it('omits unprovided, unknown, foreign-chart or sea lamps',()=>{
    const maritime:FrontierChartData={...chart,tiles:chart.tiles.map(tile=>tile.tileId===lamp.tileId?{...tile,surface:'sea'}:tile)};
    for(const [data,mark] of [[chart,undefined],[chart,{...lamp,chartId:'elsewhere'}],[chart,{...lamp,tileId:'n-out'}],[maritime,lamp]] as const){
      expect(renderToStaticMarkup(<FrontierChart chart={data} lamp={mark}/>)).not.toContain('实点了一盏灯');
    }
  });
});
