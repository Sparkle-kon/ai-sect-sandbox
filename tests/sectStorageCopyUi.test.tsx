// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {WorldStoragePanel} from '../src/components/WorldStoragePanel';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {createMemorySaveBackend,createSaveStore,encodeWorldSave} from '../src/engine/storageEngine';

it('shows readable import and comparison failures without exposing diagnostics or changing the sect world',async()=>{
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!world)throw new Error('Expected a real managed sect');
  const store=createSaveStore(createMemorySaveBackend(),()=>10);
  const onRestore=vi.fn(()=>true),onNewWorld=vi.fn(()=>true);
  const host=document.createElement('div');
  document.body.appendChild(host);
  const root=createRoot(host);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const scan=()=>[host.textContent,...[...host.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap(element=>
    ['aria-label','title','placeholder'].map(name=>element.getAttribute(name)))].join('\n');
  const forbidden=/实付|托管|凭据|原生|不替|不补/;
  const button=(name:string)=>[...host.querySelectorAll('button')].find(node=>node.textContent===name);
  const waitUntilIdle=async()=>{
    const busy=()=>[...host.querySelectorAll('[role="status"]')].some(node=>node.textContent==='处理中…');
    for(let i=0;i<100&&busy();i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});
    expect(busy()).toBe(false);
  };
  const press=async(name:string)=>{
    const action=button(name);
    if(!action||action.disabled)throw new Error('Expected enabled button: '+name);
    await act(async()=>action.click());
    await waitUntilIdle();
  };
  try{
    await store.save('slot-1','青云开山',world,null);
    await store.save('slot-2','青云山门',world,null);
    await act(async()=>root.render(<WorldStoragePanel world={world} busy={false} store={store}
      onRestore={onRestore} onNewWorld={onNewWorld}/>));

    const selects=[...host.querySelectorAll('select')].slice(1,5);
    expect(selects).toHaveLength(4);
    for(const [index,value] of ['slot-1','current','slot-2','current'].entries()){
      await act(async()=>{
        selects[index].value=value;
        selects[index].dispatchEvent(new Event('change',{bubbles:true}));
      });
    }
    await press('核验并对照');
    await press('选择甲档续局');
    expect(scan()).toContain('未保存的当前进度将被替换');
    expect(scan()).not.toMatch(forbidden);
    await store.save('slot-2','刚换了副本',world,(await store.inspect('slot-2')).headRevision);
    await press('确认执行');
    expect(scan()).toContain('刚才比过的存档有变，未载入。请重新对照两份存档。');
    expect(scan()).not.toMatch(forbidden);

    const input=host.querySelector<HTMLInputElement>('input[type="file"][accept=".json,application/json"]');
    if(!input)throw new Error('Expected JSON file input');
    const importRaw=async(raw:string)=>{
      const file=new File([raw],'旧山门.json',{type:'application/json'});
      Object.defineProperty(file,'text',{value:async()=>raw});
      Object.defineProperty(input,'files',{configurable:true,value:[file]});
      await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
      await waitUntilIdle();
      expect(scan()).not.toMatch(forbidden);
    };
    const valid=encodeWorldSave(world);
    const unsupported=valid.replace('"format":"ai-sect-sandbox"', '"format":"unknown"');
    expect(unsupported).not.toBe(valid);
    await importRaw(unsupported);
    expect(scan()).toContain('不支持这个存档格式或版本。');
    const broken=valid.replace('"world":{', '"world":{"credential":"hidden",');
    expect(broken).not.toBe(valid);
    await importRaw(broken);
    expect(scan()).toContain('这份世界存档未通过校验。请换一份完整的存档。');
    expect(scan()).not.toMatch(/world\.credential|hidden/);
    expect(onRestore).not.toHaveBeenCalled();
    expect(onNewWorld).not.toHaveBeenCalled();
  }finally{
    await act(async()=>root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
},12000);
