// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {LocalCourtyardCanvas} from '../src/components/LocalCourtyardCanvas';
import {WorldMapCanvas} from '../src/components/WorldMapCanvas';
import {buildLocalCourtyard} from '../src/components/localCourtyardModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';

const artwork=vi.hoisted(()=>vi.fn());
vi.mock('../src/components/localCourtyardRenderer',()=>({drawLocalCourtyard:artwork}));
vi.mock('../src/components/seasonalAtmosphereRenderer',()=>({drawSeasonalAtmosphere:vi.fn()}));

function button(root:ParentNode,text:string) {
  const node=Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find(value=>value.textContent?.trim()===text||value.getAttribute('aria-label')===text);
  if(!node)throw Error(`Missing enabled target: ${text}`);
  return node;
}

it.each([360,390])('maps the painted touch location and the semantic buttons to the same native record at %ipx simulated width',async width=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host);
  const world=createInitialWorld(1),prior=JSON.stringify(world);
  const site=world.locations.find(location=>location.id==='loc-danxia')!;
  const viewer=world.cultivators.find(actor=>actor.locationId===site.id&&actor.alive)!;
  const plan=buildLocalCourtyard(world,createTerrainMapView(world,viewer,false),site.id,{viewer});
  expect(plan).toBeDefined();
  if(!plan)throw Error('missing native courtyard');
  const facility=plan.facilities.find(row=>row.kind==='furnace')!;
  expect(facility).toBeDefined();
  const caller=vi.fn();
  const ctx={setTransform:vi.fn()} as unknown as CanvasRenderingContext2D;
  const getContext=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx);
  const rect=new DOMRect(12,83,width,width*5/8);
  const canvasRect=vi.spyOn(HTMLCanvasElement.prototype,'getBoundingClientRect').mockReturnValue(rect);
  vi.spyOn(window,'devicePixelRatio','get').mockReturnValue(3);
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));
  artwork.mockClear();
  try {
    await act(async()=>root.render(<LocalCourtyardCanvas plan={plan} onReturn={caller}/>));
    const canvas=host.querySelector('canvas')!;
    expect(canvas.width).toBe(width*2);
    expect(canvas.height).toBe(Math.round(rect.height*2));
    expect(artwork).toHaveBeenCalledWith(ctx,plan,640,400,0);
    expect(document.activeElement?.textContent).toBe(site.name);
    expect(button(host,'返回九州山河全图').className).toContain('min-h-11');
    await act(async()=>canvas.dispatchEvent(new MouseEvent('click',{
      bubbles:true,clientX:rect.x+facility.x*rect.width/640,clientY:rect.y+facility.y*rect.height/400,
    })));
    const selected=()=>host.querySelector('[aria-label="庭院图中所选"]')?.textContent;
    expect(selected()).toContain(facility.label);
    expect(selected()).toContain(facility.detail);
    const list=host.querySelector('[aria-label="庭院人物与设施"]')!;
    const active=list.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')!;
    expect(active.textContent).toContain(facility.label);
    expect(active.className).toContain('min-h-11');
    await act(async()=>active.click());
    expect(selected()).toContain(facility.detail);
    await act(async()=>active.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    expect(caller).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(world)).toBe(prior);
  } finally {
    await act(async()=>root.unmount());host.remove();getContext.mockRestore();canvasRect.mockRestore();
    vi.restoreAllMocks();vi.unstubAllGlobals();
  }
});

it('opens from the current native site inspection, restores the old map and rejects a new branch',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host);
  const getContext=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));
  const scroll=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollIntoView');
  Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});
  const world=createInitialWorld(1);
  const site=world.locations.find(location=>location.id==='loc-danxia')!;
  const viewer=world.cultivators.find(actor=>actor.locationId===site.id&&actor.alive)!;
  const select=vi.fn();
  const render=(source=world,key='a',historical=false,revision=0)=>
    root.render(<WorldMapCanvas world={source} scopeKey={key} historical={historical} inspectionRevision={revision} compact
      selectedCultivatorId={viewer.id} onSelectCultivator={select} fogEnabled={false}/>);
  const box=host.querySelector.bind(host);
  const eventually=async(callback:()=>void)=>{
    for(let attempt=0;attempt<35;attempt++){
      try { callback();return; } catch(error){ if(attempt===34)throw error; }
      await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});
    }
  };
  try {
    await act(async()=>render());
    const map=box('canvas')!;
    const summary=Array.from(host.querySelectorAll('summary')).find(node=>node.textContent==='山河索引')!;
    const explorer=summary.closest('details')!;
    await act(async()=>{explorer.open=true;explorer.dispatchEvent(new Event('toggle'));});
    await eventually(()=>expect(button(host,`检视 ${site.name}`)).toBeTruthy());
    const inspect=button(host,`检视 ${site.name}`);
    await act(async()=>{inspect.focus();inspect.click();});
    const enter=button(host,'本地图景');
    await act(async()=>{enter.focus();enter.click();});
    let court=box('[data-local-courtyard]')!;
    expect(court).toBeTruthy();
    expect(document.activeElement?.textContent).toBe(site.name);
    expect(map.isConnected).toBe(true);
    expect(map.closest('[hidden]')).toBeTruthy();
    await act(async()=>button(court,'返回九州山河全图').click());
    expect(box('[data-local-courtyard]')).toBeNull();
    expect(box('canvas')).toBe(map);
    expect(map.closest('[hidden]')).toBeNull();
    expect(document.activeElement).toBe(enter);
    await act(async()=>enter.click());
    const newer={...world,tick:world.tick+1};
    await act(async()=>render(newer));
    court=box('[data-local-courtyard]')!;
    expect(court).toBeTruthy();
    expect(court.querySelector('h3')?.textContent).toBe(site.name);
    await act(async()=>render(newer,'a',false,1));
    expect(box('[data-local-courtyard]')).toBeNull();
    expect(box('canvas')).toBe(map);
    await act(async()=>button(host,`检视 ${site.name}`).click());
    await act(async()=>button(host,'本地图景').click());
    expect(box('[data-local-courtyard]')).toBeTruthy();
    await act(async()=>render(newer,'new-branch',false,1));
    expect(box('[data-local-courtyard]')).toBeNull();
    expect(box('canvas')).toBe(map);
    expect(map.closest('[hidden]')).toBeNull();
    expect(select).not.toHaveBeenCalled();
  } finally {
    await act(async()=>root.unmount());host.remove();getContext.mockRestore();
    if(scroll)Object.defineProperty(HTMLElement.prototype,'scrollIntoView',scroll);
    else Reflect.deleteProperty(HTMLElement.prototype,'scrollIntoView');
    vi.unstubAllGlobals();
  }
});
