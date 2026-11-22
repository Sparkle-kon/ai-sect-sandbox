import type {ReactElement} from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {CivicWorldHub,type CivicWorldHubProps} from '../src/components/hubs/CivicWorldHub';
import type {RegionalSimulationControls} from '../src/components/RegionalSimulationPanel';
import {useWorldSimulationController} from '../src/controllers/useWorldSimulationController';
import {advanceWorldTick} from '../src/engine/worldEngine';

const readRegional=vi.hoisted(()=>vi.fn<(controls:RegionalSimulationControls)=>void>());
vi.mock('../src/components/RegionalSimulationPanel',()=>({
  RegionalSimulationPanel:(controls:RegionalSimulationControls)=>{
    readRegional(controls);
    return <output>区域配置子面板</output>;
  },
}));

async function renderReady(element:ReactElement):Promise<string>{
  const {renderToReadableStream}=await vi.importActual<typeof import('react-dom/server')>('react-dom/server.browser');
  const stream=await renderToReadableStream(element);
  await stream.allReady;
  return new Response(stream).text();
}

type Simulation=CivicWorldHubProps['simulation'];
function mount({
  props,drive,hasActor=true,
}:{
  props?:Partial<Omit<CivicWorldHubProps,'simulation'>>;
  drive?:(controller:Simulation)=>void;
  hasActor?:boolean;
}={}){
  let controller:Simulation|undefined;
  function Harness(){
    const simulation=useWorldSimulationController({playbackEnabled:false,inspectCampaign:false,
      onActivate:()=>undefined,onPreviewContextChange:()=>undefined,onHistoricalPreview:()=>undefined});
    controller=simulation;
    drive?.(simulation);
    return <CivicWorldHub simulation={simulation} active selectedCultivator={hasActor?simulation.visibleWorld.cultivators[0]:undefined}
      handedness="left" onChangeHandedness={()=>undefined} onIntervene={()=>undefined} onAnalytics={()=>undefined}
      {...props}/>;
  }
  return {html:renderReady(<Harness/>),current:()=>{
    if(!controller)throw Error('CivicWorldHub must mount the actual simulation hook');
    return controller;
  }};
}

afterEach(()=>readRegional.mockClear());

describe('civic world hub extraction',()=>{
  it('retains all nine live leaves and shows only the initial weather leaf and its provided atlas extras',async()=>{
    const html=await mount({props:{atlasExtras:<aside>精确勘地图鉴补充</aside>}}).html;
    for(const label of ['灵候图与观测','坊市与商队','凡人村镇与赈济','比武与秘境盛会','天机悬赏榜',
      '天道观测与演化统计','天道干预与模型设置','剧本编辑与复演','存档、世界种子与推演速度'])
      expect(html).toContain(label);
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-expanded="true"[^>]*>灵候图与观测/);
    expect(html.match(/精确勘地图鉴补充/g)).toHaveLength(1);
    expect(html).not.toContain('天道干预控制台');
    expect(html).not.toContain('id="world-tick-interval"');
  });

  it('preserves actor-free market guidance and mutually exclusive remembered settings content',async()=>{
    const market=await mount({hasActor:false,props:{initialOpen:'weather',rememberedOpen:'markets',
      atlasExtras:<aside>不应挂载的地图正文</aside>}}).html;
    expect(market).toMatch(/aria-expanded="true"[^>]*>坊市与商队/);
    expect(market).toContain('从人物名册选择实际修士后查看坊市。');
    expect(market).not.toContain('不应挂载的地图正文');
    const settings=await mount({props:{rememberedOpen:'settings'}}).html;
    expect(settings).toContain('id="world-tick-interval"');
    expect(settings).toContain('id="one-hand-control"');
    expect(settings).toContain('重置修仙纪元');
    expect(settings).toContain('区域配置子面板');
    expect(settings).not.toContain('天道干预控制台');
  });

  it('uses the actual historical timeline and never mounts intervention, scenario, or save controls there',async()=>{
    let phase=0;
    const view=mount({props:{rememberedOpen:'settings',atlasExtras:<aside>历史所见图鉴</aside>},drive:simulation=>{
      if(phase===0){phase++;simulation.updateWorld(world=>advanceWorldTick(world,undefined,undefined,'utility'));}
      else if(phase===1){phase++;simulation.handleTimelinePreview(1);}
    }});
    const html=await view.html;
    expect(view.current().world.tick).toBe(2);
    expect(view.current().visibleWorld.tick).toBe(1);
    expect(view.current().browsing.current).toBe(true);
    expect(html).toContain('灵候图与观测');
    expect(html).toContain('天道观测与演化统计');
    expect(html).not.toMatch(/天道干预与模型设置|剧本编辑与复演|存档、世界种子与推演速度|区域配置子面板|重置修仙纪元/);
    expect(readRegional).not.toHaveBeenCalled();
  });

  it('changes focus only to a live fog-scoped site and cannot reuse a callback after the authority changes',async()=>{
    const view=mount({props:{rememberedOpen:'settings'}});
    await view.html;
    const controller=view.current(), controls=readRegional.mock.lastCall?.[0];
    expect(controls?.revisionKey).toBe(controller.world);
    const site=controls?.availableSites.find(({siteId})=>siteId!==controller.world.regionalSimulation?.focusSiteId);
    if(!controls||!site)throw Error('Expected a genuine seen site in the initial simulation');
    expect(controls.onChange({kind:'set_focus',siteId:'fabricated-site'})).toBe(false);
    expect(controller.authority.current).toBe(controller.world);
    expect(controls.onChange({kind:'set_focus',siteId:site.siteId})).toBe(true);
    expect(controller.authority.current.regionalSimulation?.focusSiteId).toBe(site.siteId);
    expect(controller.world.regionalSimulation?.focusSiteId).not.toBe(site.siteId);
    expect(controls.onChange({kind:'set_focus',siteId:site.siteId})).toBe(false);
  });
});
