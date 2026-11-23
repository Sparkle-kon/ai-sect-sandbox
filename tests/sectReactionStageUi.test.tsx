// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {SectJobReportStage} from '../src/components/SectJobReportStage';
import {SectReactionGlyph} from '../src/components/SectReactionGlyph';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {SECT_REACTION_KINDS,type SectReactionCue} from '../src/types/sectReaction';
import type {SectJobReport} from '../src/types/sectJobs';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

function scenario(){
  const start=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  const m=start?.sectManagement;
  if(!start||!m)throw Error('Managed kitchen required');
  const cook=start.cultivators.find(actor=>actor.id===m.foundingDiscipleIds[0]);
  if(!cook)throw Error('Real cook required');
  cook.quirks=['drama'];
  const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在原处调息。'};
  const orders=Object.fromEntries(start.cultivators.filter(row=>row.id!==cook.id).map(actor=>[actor.id,rest]));
  const world=advanceWorldTick(start,orders,()=>.92,'utility',undefined,{
    capturePresentation:false,sectJobAssignments:[{discipleId:cook.id,jobId:'kitchen'}],
  });
  const report=world.sectManagement?.latestReport;
  if(!report)throw Error('Expected settled kitchen receipt');
  expect(world.sectManagement?.buildings.kitchen).toBe(m.buildings.kitchen-1);
  return {world,report,cook,home:m.homeSiteId};
}

it.each([false,true])('keeps the confirmed reaction recognizable and only moves artwork when reduced motion=%s',async reduced=>{
  const {world,report,cook,home}=scenario();
  const before=JSON.stringify(world),reacted=vi.fn<(cue:SectReactionCue|undefined)=>void>(),dismiss=vi.fn();
  const animated:Array<{node:HTMLElement;frames:Keyframe[];timing?:number|KeyframeAnimationOptions}>=[],cancel=vi.fn();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  const animate=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'animate');
  Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:function(this:HTMLElement,frames:Keyframe[],timing?:number|KeyframeAnimationOptions){
    animated.push({node:this,frames,timing});return {cancel};
  }});
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host);
  const render=(current:WorldState,receipt:SectJobReport)=>act(async()=>root.render(<SectJobReportStage world={current}
    report={receipt} present={new Set([cook.id])} onReaction={reacted} onDismiss={dismiss}/>));
  try{
    await render(world,report);
    const visual=host.querySelector('[data-sect-report-art]');
    const glyph=visual?.querySelector('[data-sect-reaction-glyph="smoke"]');
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    expect(glyph?.querySelector('path')).toBeTruthy();
    expect(reacted).toHaveBeenLastCalledWith(expect.objectContaining({kind:'smoke',siteId:home,actorId:cook.id,shake:'kitchen'}));
    const shake=animated.filter(animation=>animation.frames.some(frame=>frame.transform));
    expect(shake).toHaveLength(reduced?0:1);
    if(!reduced){
      expect(shake[0].node).toBe(visual);
      expect(shake[0].timing).toMatchObject({duration:240,iterations:1});
      expect(shake[0].frames).not.toEqual([]);
    }
    // A copied receipt with identical words is not a second source.
    const forged=structuredClone(report);
    await render(world,forged);
    expect(host.querySelector('[data-sect-reaction-glyph]')).toBeNull();
    expect(reacted).toHaveBeenLastCalledWith(undefined);
    expect(animated.filter(animation=>animation.frames.some(frame=>frame.transform))).toHaveLength(reduced?0:1);
    if(!reduced)expect(cancel).toHaveBeenCalled();
    expect(JSON.stringify(world)).toBe(before);
    expect(dismiss).not.toHaveBeenCalled();
  }finally{
    await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();
    if(animate)Object.defineProperty(HTMLElement.prototype,'animate',animate);else Reflect.deleteProperty(HTMLElement.prototype,'animate');
  }
});

it('draws six actually distinct noninteractive shapes without text or player input',()=>{
  const shapes=SECT_REACTION_KINDS.map(kind=>renderToStaticMarkup(<SectReactionGlyph kind={kind}/>));
  expect(new Set(shapes.map(html=>html.match(/<g[^>]*>(.*)<\/g>/u)?.[1])).size).toBe(6);
  for(const shape of shapes){
    expect(shape).toContain('aria-hidden="true"');
    expect(shape).toContain('focusable="false"');
    expect(shape).not.toContain('tabindex');
  }
});
