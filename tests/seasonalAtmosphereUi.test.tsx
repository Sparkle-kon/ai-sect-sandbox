// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,expect,it,vi} from 'vitest';
import {LocalCourtyardCanvas} from '../src/components/LocalCourtyardCanvas';
import {SceneStageCanvas} from '../src/components/SceneStageCanvas';
import {buildLocalCourtyard} from '../src/components/localCourtyardModel';
import {projectSceneStage} from '../src/components/sceneStageModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';

const {weather,stage,courtyard}=vi.hoisted(()=>({weather:vi.fn(),stage:vi.fn(),courtyard:vi.fn()}));
vi.mock('../src/components/seasonalAtmosphereRenderer',()=>({drawSeasonalAtmosphere:weather}));
vi.mock('../src/components/sceneStageRenderer',()=>({drawSceneStage:stage}));
vi.mock('../src/components/localCourtyardRenderer',()=>({drawLocalCourtyard:courtyard}));

function canvasHarness(width:number,height:number,options:{reduced?:boolean;hidden?:boolean}={}){
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main'),outside=document.createElement('button');
  document.body.append(host,outside);outside.focus();
  const root=createRoot(host);
  const context={setTransform:vi.fn()} as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context);
  vi.spyOn(HTMLCanvasElement.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(0,10,width,height));
  vi.spyOn(window,'devicePixelRatio','get').mockReturnValue(3);
  vi.spyOn(document,'hidden','get').mockReturnValue(!!options.hidden);
  vi.stubGlobal('matchMedia',()=>({matches:!!options.reduced,addEventListener:()=>{},removeEventListener:()=>{}}));
  const pending=new Map<number,FrameRequestCallback>();
  let token=0;
  const request=vi.spyOn(window,'requestAnimationFrame').mockImplementation(fn=>{pending.set(++token,fn);return token;});
  vi.spyOn(window,'cancelAnimationFrame').mockImplementation(id=>{pending.delete(id);});
  const advance=async(time:number)=>{
    const first=pending.entries().next().value;
    if(!first)throw Error('no scheduled Canvas animation');
    const [id,run]=first;pending.delete(id);await act(async()=>run(time));
  };
  stage.mockClear();courtyard.mockClear();weather.mockClear();
  return {host,outside,root,context,pending,request,advance,stop:async()=>{
    await act(async()=>root.unmount());host.remove();outside.remove();vi.restoreAllMocks();vi.unstubAllGlobals();
  }};
}

function opening(){
  const world=createInitialWorld(1),snapshot=JSON.stringify(world);
  const frame=projectSceneStage(world,{eventId:'evt-init-1'});
  expect(frame.atmosphere?.season).toBe('spring');
  return {world,snapshot,frame};
}

describe('seasonal atmosphere shares native canvases without owning controls',()=>{
  it.each([360,390])('paints local scenery once at simulated %ipx when motion is reduced',async width=>{
    const height=Math.round(width*9/16),env=canvasHarness(width,height,{reduced:true});
    try {
      const {world,snapshot,frame}=opening();
      await act(async()=>env.root.render(<SceneStageCanvas frame={frame}/>));
      const canvas=env.host.querySelector('canvas')!;
      expect(canvas.getAttribute('aria-hidden')).toBe('true');
      expect(canvas.width).toBe(width*2);
      expect(canvas.height).toBe(height*2);
      expect(stage).toHaveBeenLastCalledWith(env.context,frame,width,height,0);
      expect(weather).toHaveBeenLastCalledWith(env.context,frame.atmosphere,{x:0,y:0,width,height},0);
      expect(env.request).not.toHaveBeenCalled();
      expect(env.host.querySelector('button')).toBeNull();
      expect(document.activeElement).toBe(env.outside);
      expect(JSON.stringify(world)).toBe(snapshot);
    } finally {await env.stop();}
  });

  it('ends the scenic loop without advancing actual native time',async()=>{
    const env=canvasHarness(360,203);
    try {
      const {world,snapshot,frame}=opening();
      await act(async()=>env.root.render(<SceneStageCanvas frame={frame}/>));
      expect(env.pending.size).toBe(1);
      await env.advance(100);
      await env.advance(250);
      expect(weather.mock.lastCall?.[3]).toBeGreaterThan(0);
      await env.advance(4400);
      expect(env.pending.size).toBe(0);
      expect(weather.mock.lastCall?.[3]).toBe(0);
      expect(JSON.stringify(world)).toBe(snapshot);
    } finally {await env.stop();}
  });

  it('stays static in a hidden current courtyard and preserves its only native return button',async()=>{
    const width=390,height=Math.round(width*5/8),env=canvasHarness(width,height,{hidden:true});
    try {
      const {world,snapshot}=opening();
      const viewer=world.cultivators.find(actor=>actor.locationId==='loc-danxia'&&actor.alive)!;
      const plan=buildLocalCourtyard(world,createTerrainMapView(world,viewer,true),viewer.locationId,{viewer});
      const leaves=vi.fn();
      if(!plan)throw Error('missing genuine courtyard');
      expect(plan.atmosphere?.season).toBe('spring');
      await act(async()=>env.root.render(<LocalCourtyardCanvas plan={plan} onReturn={leaves}/>));
      expect(courtyard).toHaveBeenCalled();
      expect(weather).toHaveBeenLastCalledWith(env.context,plan.atmosphere,{x:0,y:0,width:640,height:400},0);
      expect(env.request).not.toHaveBeenCalled();
      const button=Array.from(env.host.querySelectorAll('button')).find(node=>node.textContent==='返回九州山河全图')!;
      expect(button.className).toContain('min-h-11');
      await act(async()=>button.click());
      expect(leaves).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(world)).toBe(snapshot);
    } finally {await env.stop();}
  });
});
