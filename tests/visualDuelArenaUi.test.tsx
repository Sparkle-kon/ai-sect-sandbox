// @vitest-environment jsdom
import {ForbiddenArtCard} from '../src/components/ForbiddenArtCard';
import {projectGuidedVisualDuelArena} from '../src/components/visualGuidedDuelArenaModel';
import {projectGuidedForbiddenDuel,queueGuidedForbiddenArt} from '../src/engine/forbiddenArtEngine';
import {actualForbiddenContact,artActor,strongRivalId} from './forbiddenArtNativeFixture';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {VisualDuelArena} from '../src/components/VisualDuelArena';
import {StoryFirstHome} from '../src/components/StoryFirstHome';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {projectVisualDuelArena} from '../src/components/visualDuelArenaModel';
import {actualCommonBond,actualDefenderWinsLethally,bondActor,firstId,secondId} from './dramaticBondNativeFixture';

const art=vi.hoisted(()=>vi.fn());
vi.mock('../src/components/visualDuelArenaRenderer',()=>({drawVisualDuelArena:art}));

function witnessedClash(){
  const {world,death}=actualDefenderWinsLethally(actualCommonBond().clash);
  const viewer=bondActor(world,secondId),view=createTerrainMapView(world,viewer,false);
  const frame=projectVisualDuelArena(world,view,{kind:'duel',eventId:death.id},{viewer});
  if(!frame)throw Error('expected the native lethal clash');
  return {frame,world,death,viewer,view};
}

const action=(root:ParentNode,text:string)=>Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
  .find(node=>node.textContent===text);

describe('native visual duel presentation',()=>{
  it.each([360,390])('scales the two opponents and finite on-demand replay to %ipx simulated width',async width=>{
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    const {frame,world}=witnessedClash(),before=JSON.stringify(world);
    const host=document.createElement('main'),outside=document.createElement('button');
    document.body.append(host,outside);outside.focus();
    const root=createRoot(host);
    const transform=vi.fn(),context={setTransform:transform} as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context);
    const height=Math.round(width*9/16);
    vi.spyOn(HTMLCanvasElement.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,width,height));
    vi.spyOn(window,'devicePixelRatio','get').mockReturnValue(3);
    const queue=new Map<number,FrameRequestCallback>();
    let handle=0;
    const push=vi.spyOn(window,'requestAnimationFrame').mockImplementation(fn=>{queue.set(++handle,fn);return handle;});
    vi.spyOn(window,'cancelAnimationFrame').mockImplementation(id=>{queue.delete(id);});
    vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));
    vi.spyOn(document,'hidden','get').mockReturnValue(false);
    const turn=async(time:number)=>{
      const next=queue.entries().next().value;
      if(!next)throw Error('missing scheduled visual frame');
      const [id,run]=next;
      queue.delete(id);
      await act(async()=>run(time));
    };
    art.mockClear();
    try {
      await act(async()=>root.render(<VisualDuelArena frame={frame}/>));
      const stage=host.querySelector('[data-visual-duel-arena]')!;
      const canvas=stage.querySelector('canvas')!;
      expect(canvas.getAttribute('aria-hidden')).toBe('true');
      expect(canvas.width).toBe(width*2);
      expect(canvas.height).toBe(height*2);
      expect(transform).toHaveBeenCalledWith(2,0,0,2,0,0);
      expect(art).toHaveBeenLastCalledWith(context,frame,width,height,undefined);
      expect(push).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(outside);
      expect(stage.textContent).toContain(frame.left.name);
      expect(stage.textContent).toContain(frame.right.name);
      expect(stage.querySelector('[aria-label="此番交锋实录"]')?.textContent).toMatch(/实损|胜出/);
      const replay=action(stage,'重看此番交锋')!;
      expect(replay.className).toContain('min-h-11');
      await act(async()=>replay.click());
      expect(action(stage,'演示交锋中…')?.disabled).toBe(true);
      expect(queue.size).toBe(1);
      await turn(0);
      expect(art).toHaveBeenLastCalledWith(context,frame,width,height,0);
      await turn(550);
      expect(art.mock.lastCall?.[4]).toBeGreaterThan(0);
      expect(art.mock.lastCall?.[4]).toBeLessThan(1);
      await turn(1600);
      expect(queue.size).toBe(0);
      expect(action(stage,'重看此番交锋')?.disabled).toBe(false);
      expect(stage.querySelectorAll('button')).toHaveLength(1);
      expect(JSON.stringify(world)).toBe(before);
    } finally {
      await act(async()=>root.unmount());host.remove();outside.remove();vi.restoreAllMocks();vi.unstubAllGlobals();
    }
  });

  it('preserves results without motion, Canvas, fake gauges, or new ways to attack',async()=>{
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    const {world,death,viewer,view}=witnessedClash();
    const archive=projectVisualDuelArena(world,view,{kind:'duel',eventId:death.id},{viewer,historical:true});
    if(!archive)throw Error('expected exact historical duel read');
    const host=document.createElement('main');document.body.append(host);
    const root=createRoot(host);
    const noContext=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
    const raf=vi.spyOn(window,'requestAnimationFrame');
    vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));
    try {
      await act(async()=>root.render(<VisualDuelArena frame={archive}/>));
      expect(host.textContent).toContain('旧录');
      expect(host.textContent).toContain(archive.left.name);
      expect(host.textContent).toContain(archive.right.name);
      expect(host.textContent).toMatch(/胜出/);
      expect(host.querySelectorAll('button,meter')).toHaveLength(0);
      expect(noContext).toHaveBeenCalled();
      expect(raf).not.toHaveBeenCalled();
    } finally {
      await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();
    }
  });

  it('shows a real pending forbidden contact with its existing choices, not a premature strike or a public view',()=>{
    const {offered,contact}=actualForbiddenContact(true),before=JSON.stringify(offered);
    const owner=artActor(offered),rival=artActor(offered,strongRivalId);
    const view=projectGuidedForbiddenDuel(offered)!;
    const arena=projectGuidedVisualDuelArena(offered,owner,'forbidden',contact.id);
    expect(arena).toMatchObject({siteId:contact.siteId,left:{id:owner.id},right:{id:rival.id},damages:[]});
    expect(arena?.outcome).toBeUndefined();
    expect(arena?.accent).toBeUndefined();
    expect(arena?.right.qi).toBeUndefined();
    expect(projectGuidedVisualDuelArena(offered,rival,'forbidden',contact.id)).toBeUndefined();
    expect(projectGuidedVisualDuelArena(offered,owner,'forbidden','wrong-contact')).toBeUndefined();
    const choose=vi.fn(()=>false),advance=vi.fn(()=>false);
    const html=renderToStaticMarkup(<ForbiddenArtCard view={view} arena={arena} busy={false}
      onChoose={choose} onAdvance={advance}/>);
    expect(html).toContain('data-visual-duel-arena');
    expect(html).toContain('不动禁术');
    expect(html.match(/<button\b/g)).toHaveLength(view.options.length);
    expect(html).not.toMatch(/此番交锋实录|重看此番交锋|胜出/);
    expect(choose).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
    expect(JSON.stringify(offered)).toBe(before);
    const queued=queueGuidedForbiddenArt(offered,owner.id,contact.id,'decline');
    expect(queued).not.toBe(offered);
    expect(projectGuidedVisualDuelArena(queued,artActor(queued),'forbidden',contact.id)?.damages).toEqual([]);
  });

  it('replaces the illustration only for the exact selected public clash, preserving both original story actions',()=>{
    const {world,death,viewer}=witnessedClash();
    const before=JSON.stringify(world);
    const props={stageWorld:world,stageViewer:viewer,onContinue:()=>{},onMore:()=>{}};
    const scene={eventId:death.id,title:death.title,paragraph:death.description};
    const home=renderToStaticMarkup(<StoryFirstHome {...props} scene={scene}/>);
    expect(death.actorIds).toEqual([firstId,secondId]);
    expect(home).toContain('data-visual-duel-arena');
    expect(home).toContain('走进故事');
    expect(home).toContain('看下个月');
    expect(home.match(/<button\b/g)).toHaveLength(2);
    expect(home).not.toContain('重看此番交锋');
    const unrelated=renderToStaticMarkup(<StoryFirstHome {...props} scene={{...scene,eventId:'false-duel-event'}}/>);
    expect(unrelated).not.toContain('data-visual-duel-arena');
    expect(unrelated).toContain('data-scene-stage');
    expect(JSON.stringify(world)).toBe(before);
  });
});
