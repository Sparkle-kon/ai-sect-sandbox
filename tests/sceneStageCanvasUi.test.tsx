// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {SceneStageCanvas} from '../src/components/SceneStageCanvas';
import {StoryFirstHome} from '../src/components/StoryFirstHome';
import {CockpitStoryStage} from '../src/components/CockpitStoryStage';
import type {SceneStageFrame} from '../src/components/sceneStageModel';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectStoryHomepage} from '../src/engine/storyHomepage';

const mocks=vi.hoisted(()=>({draw:vi.fn()}));
vi.mock('../src/components/sceneStageRenderer',()=>({drawSceneStage:mocks.draw}));
const frame:SceneStageFrame={theme:'market',siteName:'万仙坊市',season:'autumn',cast:[],historical:false};

it('mounts the stage above the existing prose in both readers without another home action',()=>{
  const world=createInitialWorld(1),before=JSON.stringify(world);
  const reading=projectStoryHomepage(world);
  const home=renderToStaticMarkup(<StoryFirstHome stageWorld={world} scene={reading.scene} leadId={reading.lead?.id}
    onContinue={()=>{}} onMore={()=>{}}/>);
  expect(home.match(/<button\b/g)).toHaveLength(2);
  expect(home).toContain('data-scene-stage');
  expect(home.indexOf('data-scene-stage')).toBeLessThan(home.indexOf('data-chronicle-paragraph-text'));
  expect(home).toMatch(/<canvas[^>]*aria-hidden="true"[^>]*pointer-events-none/);
  expect(home).toContain('主角未定');
  expect(home).toContain('开篇人物 · 身在');
  expect(home).toContain('data-stage-portrait');
  expect(home).toContain('saturate-[1.22]');
  expect(home).not.toContain('正式主角');
  const cockpit=renderToStaticMarkup(<CockpitStoryStage world={world}/>);
  expect(cockpit).toContain('本月公开一幕');
  expect(cockpit).toContain('data-scene-stage');
  expect(cockpit.indexOf('data-scene-stage')).toBeLessThan(cockpit.indexOf('陨仙墟异动'));
  expect(JSON.stringify(world)===before).toBe(true);
});

it.each([360,390])('uses capped DPR and leaves controls/focus alone at %ipx simulated width',async width=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main');document.body.append(host);
  const outside=document.createElement('button');document.body.append(outside);outside.focus();
  const root=createRoot(host);
  const transform=vi.fn();
  const context={setTransform:transform} as unknown as CanvasRenderingContext2D;
  const getContext=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context);
  const box=vi.spyOn(HTMLCanvasElement.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,width,width*9/16));
  const raf=vi.spyOn(window,'requestAnimationFrame');
  vi.stubGlobal('devicePixelRatio',3);
  vi.stubGlobal('matchMedia',()=>({matches:true}));
  mocks.draw.mockClear();
  try{
    await act(async()=>root.render(<SceneStageCanvas frame={frame}/>));
    const canvas=host.querySelector('canvas')!;
    expect(canvas.width).toBe(width*2);
    expect(canvas.height).toBe(Math.round(width*9/16)*2);
    expect(mocks.draw).toHaveBeenCalledWith(context,frame,width,Math.round(width*9/16),0);
    expect(transform).toHaveBeenCalledWith(2,0,0,2,0,0);
    expect(raf).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(outside);
    expect(host.querySelector('figcaption')?.textContent).toBe('万仙坊市');
  }finally{
    await act(async()=>root.unmount());host.remove();outside.remove();
    getContext.mockRestore();box.mockRestore();raf.mockRestore();vi.unstubAllGlobals();
  }
});

it('keeps the text venue readable if canvas cannot provide a 2D drawing context',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host);
  const getContext=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  mocks.draw.mockClear();
  try{
    await act(async()=>root.render(<SceneStageCanvas frame={{...frame,historical:true}}/>));
    expect(host.textContent).toContain('万仙坊市');
    expect(host.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true');
    expect(mocks.draw).not.toHaveBeenCalled();
  }finally{
    await act(async()=>root.unmount());host.remove();getContext.mockRestore();vi.unstubAllGlobals();
  }
});
