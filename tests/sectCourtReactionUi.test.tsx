// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {LocalCourtyardCanvas} from '../src/components/LocalCourtyardCanvas';
import {buildLocalCourtyard} from '../src/components/localCourtyardModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import type {SectReactionCue} from '../src/types/sectReaction';

it('anchors the exact current cosmetic cue to a real courtyard sprite, never to a missing, old, out-of-site or legacy figure',async()=>{
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
  const managed=world.sectManagement!;
  const plan=buildLocalCourtyard(world,createTerrainMapView(world,undefined,false),managed.homeSiteId)!;
  const id=managed.foundingDiscipleIds[0],native=plan.actors.find(actor=>actor.id===id);
  if(!native)throw Error('Expected a physically present founding disciple');
  const reaction:SectReactionCue={id:'fixture-smoke-owned-court',actorId:id,tick:world.tick,
    kind:'smoke',cause:'report',siteId:plan.siteId,shake:'kitchen'};
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const oldMatch=window.matchMedia;
  Object.defineProperty(window,'matchMedia',{configurable:true,value:vi.fn(()=>({matches:true,addEventListener(){},removeEventListener(){}}))});
  const animation=vi.fn(()=>({cancel:vi.fn()}));
  const previous=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'animate');
  Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:animation});
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  const render=(cue: SectReactionCue,embedded=true)=>act(async()=>root.render(<LocalCourtyardCanvas plan={plan} embedded={embedded} reaction={cue}/>));
  try{
    await render(reaction);
    const marker=host.querySelector<HTMLElement>('[data-courtyard-reaction="smoke"]');
    expect(marker?.getAttribute('aria-hidden')).toBe('true');
    expect(marker?.style.left).toBe(`${native.x/plan.width*100}%`);
    expect(marker?.className).toContain('pointer-events-none');
    expect(animation).not.toHaveBeenCalled();
    await render({...reaction,tick:world.tick+1});
    expect(host.querySelector('[data-courtyard-reaction]')).toBeNull();
    await render({...reaction,actorId:'npc-999999'});
    expect(host.querySelector('[data-courtyard-reaction]')).toBeNull();
    await render({...reaction,siteId:'loc-market'});
    expect(host.querySelector('[data-courtyard-reaction]')).toBeNull();
    await render(reaction,false);
    expect(host.querySelector('[data-courtyard-reaction]')).toBeNull();
  }finally{
    await act(async()=>root.unmount());host.remove();context.mockRestore();vi.unstubAllGlobals();
    Object.defineProperty(window,'matchMedia',{configurable:true,value:oldMatch});
    if(previous)Object.defineProperty(HTMLElement.prototype,'animate',previous);
    else Reflect.deleteProperty(HTMLElement.prototype,'animate');
  }
});
