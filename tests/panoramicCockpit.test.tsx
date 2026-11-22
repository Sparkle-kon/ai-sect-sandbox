import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {PanoramicCockpit} from '../src/components/PanoramicCockpit';

const render=()=>renderToStaticMarkup(<PanoramicCockpit
  map={<canvas aria-label="地图测试" />}
  timeControls={<button type="button">推进一月</button>}
  stage={<p>舞台测试</p>}
  inspector={<p>识海测试</p>}
  relationships={<p>拓扑测试</p>}
  chronicle={<p>纪事测试</p>}
/>);

describe('panoramic cockpit composition',()=>{
  it('renders all live areas directly without a disclosure gate and preserves their logical narrow-screen order',()=>{
    const html=render();
    const areas=['推进一月','地图测试','舞台测试','识海测试','拓扑测试','纪事测试'];
    const positions=areas.map(area=>html.indexOf(area));
    expect(positions.every(position=>position>=0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a,b)=>a-b));
    expect(html).not.toContain('<details');
    expect(html).not.toContain('aria-hidden="true">舞台测试');
  });

  it('labels semantic headings and the keyboard-scrollable detail region with matching IDs',()=>{
    const html=render();
    const headings=['全息大盘','九州山河','戏剧舞台','人物与因果','修士识海','因果关系','实时纪事'];
    for(const label of headings){
      const matched=[...html.matchAll(/<h[2-4] id="([^"]+)"[^>]*>(.*?)<\/h[2-4]>/g)].find(item=>item[2].endsWith(label));
      expect(matched?.[1]).toBeDefined();
      expect(html).toContain(`aria-labelledby="${matched?.[1]}"`);
    }
    expect(html.match(/role="region" aria-labelledby="[^"]+" tabindex="0"/g)).toHaveLength(3);
    expect(html).toContain('xl:grid-cols-[minmax(0,47fr)_minmax(0,28fr)_minmax(0,25fr)]');
    expect(html).toContain('xl:overflow-y-auto');
    expect(html).toContain('focus-visible:outline-amber-300');
  });
});
