// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {SoundscapeToggle,useSoundscape} from '../src/components/useSoundscape';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';

const audio=vi.hoisted(()=>{
  const enable=vi.fn(async()=>true),disable=vi.fn(),dispose=vi.fn(),play=vi.fn((_kind:string,_wave?:number)=>true);
  return {enable,disable,dispose,play,create:vi.fn(()=>({enable,disable,dispose,play}))};
});
vi.mock('../src/engine/soundscapeEngine',()=>({createSoundscapeEngine:audio.create}));
const cues=vi.hoisted(()=>vi.fn((world:{tick:number})=>[{id:`clash-${world.tick}`,kind:'clash',tick:world.tick}]));
vi.mock('../src/components/soundscapeCueModel',()=>({projectSoundscapeCues:cues}));

function Sound({world,scopeKey='first',historical=false}:{world:WorldState;scopeKey?:string;historical?:boolean}){
  const sound=useSoundscape({world,scopeKey,historical});
  return <SoundscapeToggle sound={sound}/>;
}

describe('the shared soundscape toggle owns an explicit live opt-in',()=>{
  it('does not allocate before a gesture, deduplicates current ticks, and silences a changed scope',async()=>{
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    vi.stubGlobal('AudioContext',class {});
    let hidden=false;
    vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden);
    const host=document.createElement('main');document.body.append(host);
    const root=createRoot(host);
    const first=createInitialWorld(1),second=advanceWorldTick(first),third=advanceWorldTick(second);
    const button=()=>host.querySelector<HTMLButtonElement>('button')!;
    const render=(world:WorldState,scopeKey='first',historical=false)=>root.render(<Sound world={world} scopeKey={scopeKey} historical={historical}/>);
    try {
      await act(async()=>render(first));
      expect(button().textContent).toContain('仙乐');
      expect(button().getAttribute('aria-pressed')).toBe('false');
      expect(button().className).toMatch(/min-h-11|min-h-\[44px\]/);
      expect(audio.create).not.toHaveBeenCalled();
      await act(async()=>button().click());
      expect(audio.enable).toHaveBeenCalledTimes(1);
      expect(button().textContent).toContain('静音');
      expect(button().getAttribute('aria-pressed')).toBe('true');
      expect(audio.play).not.toHaveBeenCalled();
      await act(async()=>render(second));
      expect(audio.play).toHaveBeenCalledTimes(1);
      expect(audio.play.mock.calls[0]?.[0]).toBe('clash');
      await act(async()=>render({...second}));
      expect(audio.play).toHaveBeenCalledTimes(1);
      hidden=true;
      await act(async()=>document.dispatchEvent(new Event('visibilitychange')));
      expect(audio.disable).toHaveBeenCalled();
      await act(async()=>render(third));
      expect(audio.play).toHaveBeenCalledTimes(1);
      hidden=false;
      await act(async()=>document.dispatchEvent(new Event('visibilitychange')));
      await act(async()=>render(third,'rewind',true));
      expect(button().getAttribute('aria-pressed')).toBe('false');
      expect(audio.play).toHaveBeenCalledTimes(1);
      expect(audio.enable).toHaveBeenCalledTimes(1);
      await act(async()=>render(third,'other-branch'));
      expect(audio.play).toHaveBeenCalledTimes(1);
      expect(audio.enable).toHaveBeenCalledTimes(1);
    } finally {
      await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();
    }
  });

  it('cancels the pending gesture when changing branch before AudioContext settles',async()=>{
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    vi.stubGlobal('AudioContext',class {});
    vi.spyOn(document,'hidden','get').mockReturnValue(false);
    let resolve:((on:boolean)=>void)|undefined;
    audio.enable.mockImplementationOnce(()=>new Promise<boolean>(done=>{resolve=done;}));
    const host=document.createElement('main');document.body.append(host);
    const root=createRoot(host),world=createInitialWorld(3);
    const button=()=>host.querySelector<HTMLButtonElement>('button')!;
    try {
      await act(async()=>root.render(<Sound world={world}/>));
      await act(async()=>button().click());
      expect(button().getAttribute('aria-busy')).toBe('true');
      expect(button().getAttribute('aria-pressed')).toBe('false');
      expect(resolve).toBeDefined();
      await act(async()=>root.render(<Sound world={world} scopeKey="different-branch"/>));
      await act(async()=>resolve?.(true));
      expect(button().getAttribute('aria-busy')).toBeNull();
      expect(button().getAttribute('aria-pressed')).toBe('false');
      expect(audio.disable).toHaveBeenCalled();
      expect(audio.play).not.toHaveBeenCalled();
    } finally {
      await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();
    }
  });

  it('starts quiet in the static page without requesting an audio context',()=>{
    vi.clearAllMocks();
    const html=renderToStaticMarkup(<Sound world={createInitialWorld(2)}/>);
    expect(html).toContain('仙乐');
    expect(html).toContain('aria-pressed="false"');
    expect(audio.create).not.toHaveBeenCalled();
    expect(audio.enable).not.toHaveBeenCalled();
  });
});
