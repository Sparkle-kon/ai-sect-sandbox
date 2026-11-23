// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,expect,it,vi} from 'vitest';
import {DungeonBoardCanvas} from '../src/components/DungeonBoardCanvas';
import {DungeonExpeditionRead} from '../src/components/DungeonExpeditionRead';
import {projectDungeonBoard} from '../src/components/dungeonBoardModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {projectExpeditionDungeon} from '../src/engine/expeditionDungeonEngine';
import type {WorldState} from '../src/types/world';
import {dungeonActor,dungeonMove,dungeonOccasion,enterNativeDungeon} from './expeditionDungeonNativeFixture';

const paint=vi.hoisted(()=>vi.fn());
vi.mock('../src/components/dungeonBoardRenderer',()=>({drawDungeonBoard:paint}));

function admitted(world:WorldState,historical=false){
  const viewer=dungeonActor(world);
  const board=projectDungeonBoard(world,createTerrainMapView(world,viewer,true),dungeonOccasion,{viewer,historical});
  const view=projectExpeditionDungeon(world,viewer,dungeonOccasion);
  if(!board||!view)throw Error('missing genuinely admitted dungeon view');
  return {board,view,viewer};
}

const exactButton=(root:ParentNode,text:string)=>Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(value=>value.textContent===text);
const named=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id)?.name??'此行探者';

function viewport(width:number){
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main'),outside=document.createElement('button');
  document.body.append(host,outside);outside.focus();
  const root=createRoot(host),height=Math.round(width*285/640);
  const context={setTransform:vi.fn()} as unknown as CanvasRenderingContext2D;
  const ctx=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context);
  vi.spyOn(HTMLCanvasElement.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(15,82,width,height));
  vi.spyOn(window,'devicePixelRatio','get').mockReturnValue(3);
  paint.mockClear();
  return {host,outside,root,height,context,ctx,stop:async()=>{
    await act(async()=>root.unmount());host.remove();outside.remove();vi.restoreAllMocks();vi.unstubAllGlobals();
  }};
}

describe('native visual dungeon board',()=>{
  it.each([360,390])('maps real ancient hall and fog to a device-independent drawing at %ipx simulated width',async width=>{
    const env=viewport(width);
    const hall=dungeonMove(enterNativeDungeon().world,'gather','garden'),before=JSON.stringify(hall);
    const {board,view,viewer}=admitted(hall);
    const guide=vi.fn(async()=>false);
    try {
      await act(async()=>env.root.render(<DungeonExpeditionRead board={board} view={view} viewerId={viewer.id}
        named={id=>named(hall,id)} tick={hall.tick} controls={{guide}}/>));
      const map=env.host.querySelector('[data-dungeon-board]')!,canvas=map.querySelector('canvas')!;
      expect(canvas.getAttribute('aria-hidden')).toBe('true');
      expect(canvas.width).toBe(width*2);
      expect(canvas.height).toBe(env.height*2);
      expect(paint).toHaveBeenLastCalledWith(env.context,board,width,env.height);
      expect(map.querySelector('[aria-current="location"]')?.textContent).toMatch(/古殿|此处/);
      expect(map.textContent).toContain('未踏足');
      expect(env.host.textContent).not.toContain('护宝妖王：');
      expect(env.host.querySelector('[aria-label="护宝妖王气血"]')).toBeNull();
      expect(document.activeElement).toBe(env.outside);
      await act(async()=>canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:20,clientY:100})));
      expect(guide).not.toHaveBeenCalled();
      const advance=exactButton(env.host,'破阵（耗 18 真气）')!;
      expect(advance.className).toContain('min-h-11');
      await act(async()=>advance.click());
      expect(guide).toHaveBeenCalledTimes(1);
      expect(guide.mock.calls[0]).toEqual([board.options.find(option=>option.dungeonMove==='break_array')]);
      expect(JSON.stringify(hall)).toBe(before);
    } finally {await env.stop();}
  });

  it('keeps a genuine old route readable without a canvas, action or present-day player marker',async()=>{
    const env=viewport(390);
    env.ctx.mockReturnValue(null);
    const hall=dungeonMove(enterNativeDungeon().world,'gather','garden');
    const {board,viewer,view}=admitted(hall,true),guide=vi.fn(async()=>false);
    try {
      await act(async()=>env.root.render(<DungeonBoardCanvas frame={board}/>));
      expect(env.host.querySelector('[aria-label="秘境行路"]')?.textContent).toContain('上古符文阵门');
      expect(env.host.querySelector('[aria-current="location"]')).toBeNull();
      expect(paint).not.toHaveBeenCalled();
      await act(async()=>env.root.render(<DungeonExpeditionRead board={board} view={view} viewerId={viewer.id}
        named={id=>named(hall,id)} tick={hall.tick} controls={{guide}}/>));
      expect(env.host.querySelector('[aria-label="此刻可行"]')).toBeNull();
      expect(guide).not.toHaveBeenCalled();
    } finally {await env.stop();}
  });
});
