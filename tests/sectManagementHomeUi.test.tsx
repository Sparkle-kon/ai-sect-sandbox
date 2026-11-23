// @vitest-environment jsdom
import {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {SectManagementHome} from '../src/components/SectManagementHome';
import {createInitialWorld} from '../src/data/initialWorld';
import {createManagedSectWorld,previewStarterSect} from '../src/engine/starterSectWorld';
import {SECT_QUIRK_NAMES} from '../src/types/sectManagement';

it('draws one shared opening reroll and confirms an actual new sect with its real court and disciples',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host),onOpen=vi.fn();
  const seed=13071;
  const start=vi.fn();
  function Harness(){
    const [world,setWorld]=useState(()=>createInitialWorld(seed));
    return <SectManagementHome world={world} onOpen={onOpen} onStart={(choice,draw)=>{
      start(choice,draw);
      const next=createManagedSectWorld(seed,'classic',choice,draw);
      if(!next)return false;
      setWorld(next);return true;
    }}/>;
  }
  const find=(label:string)=>[...host.querySelectorAll('button')].find(row=>row.textContent?.trim()===label);
  const roster=()=>host.querySelector('[aria-label="开局弟子"]');
  try{
    await act(async()=>root.render(<Harness/>));
    expect(host.querySelectorAll('details summary')).toHaveLength(1);
    expect(host.textContent).toContain('青云杂役派');
    expect(host.textContent).toContain('醉剑小筑');
    expect(host.textContent).toContain('80 枚');
    expect(roster()?.querySelectorAll(':scope > li')).toHaveLength(3);
    const first=roster()?.textContent;
    await act(async()=>find('重抽一次')?.click());
    expect(roster()?.textContent).not.toBe(first);
    expect(find('已重抽一次')?.disabled).toBe(true);
    const other=host.querySelectorAll<HTMLInputElement>('input[type=radio]')[1];
    await act(async()=>other.click());
    expect(find('已重抽一次')?.disabled).toBe(true);
    expect(roster()?.querySelectorAll(':scope > li')).toHaveLength(4);
    expect(start).not.toHaveBeenCalled();
    const settlers=previewStarterSect(seed,'drunken-sword-hermitage',1)?.disciples;
    await act(async()=>{
      const confirm=find('确认接掌醉剑小筑');
      confirm?.click();confirm?.click();
    });
    expect(start.mock.calls).toEqual([['drunken-sword-hermitage',1]]);
    expect(host.querySelector('h1')?.textContent).toBe('醉剑小筑');
    expect(host.querySelectorAll('[data-local-courtyard] canvas')).toHaveLength(1);
    expect(host.textContent).toContain('本宗弟子 · 4 人');
    for(const row of settlers??[]){
      expect(host.textContent).toContain(row.name);
      for(const quirk of row.quirks)expect(host.textContent).toContain(SECT_QUIRK_NAMES[quirk]);
    }
    expect(find('返回九州山河全图')).toBeUndefined();
    const more=host.querySelector('details')!;
    expect(more.open).toBe(false);
    await act(async()=>more.querySelector('summary')?.click());
    expect(more.open).toBe(true);
    await act(async()=>find('读档')?.click());
    expect(onOpen.mock.calls).toEqual([['saves']]);
    expect(more.open).toBe(false);
  }finally{
    await act(async()=>root.unmount());host.remove();
    vi.restoreAllMocks();vi.unstubAllGlobals();
  }
});
