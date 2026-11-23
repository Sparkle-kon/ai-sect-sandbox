// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,expect,it,vi} from 'vitest';
import {HeavenlyAlchemyRead} from '../src/components/HeavenlyAlchemyRead';
import {projectHeavenlyAlchemy} from '../src/engine/heavenlyAlchemyEngine';
import {HEAVENLY_ALCHEMY_HEAT} from '../src/engine/heavenlyAlchemyTerms';
import {AlchemyWorkshopCanvas} from '../src/components/AlchemyWorkshopCanvas';
import {projectAlchemyWorkshop} from '../src/components/alchemyWorkshopVisualModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {actualHighAlchemyMaterials,brewActor,brewMonth,brewSiteId,highBrew} from './alchemyLightningNativeFixture';
import {matureSeedCulture,seedPerson} from './fixtures/seedCultureFixture';

const {painting,gardenPainting}=vi.hoisted(()=>({painting:vi.fn(),gardenPainting:vi.fn()}));
vi.mock('../src/components/alchemyWorkshopRenderer',()=>({
  drawAlchemyFurnace:painting,drawSeedGarden:gardenPainting,alchemyGardenPageSize:8,
}));

function shell(width:number){
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main'),outside=document.createElement('button');
  document.body.append(host,outside);outside.focus();
  const root=createRoot(host),height=Math.round(width/2);
  const context={setTransform:vi.fn()} as unknown as CanvasRenderingContext2D;
  const ctx=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context);
  vi.spyOn(HTMLCanvasElement.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(12,84,width,height));
  vi.spyOn(window,'devicePixelRatio','get').mockReturnValue(3);
  vi.spyOn(document,'hidden','get').mockReturnValue(false);
  const raf=vi.spyOn(window,'requestAnimationFrame');
  painting.mockClear();gardenPainting.mockClear();
  return {host,outside,root,width,height,ctx,context,raf,stop:async()=>{
    await act(async()=>root.unmount());host.remove();outside.remove();vi.restoreAllMocks();vi.unstubAllGlobals();
  }};
}

describe('visual furnace and garden keep actual native state separate from illustration',()=>{
  it.each([360,390])('shows an unpaid legal heat preview without animation or focus changes at %ipx simulated width',async width=>{
    const env=shell(width);
    const world=actualHighAlchemyMaterials(),viewer=brewActor(world),snapshot=JSON.stringify(world);
    const frame=projectAlchemyWorkshop(world,createTerrainMapView(world,viewer,true),brewSiteId,{viewer,heatPreview:'fierce'});
    try {
      expect(frame?.furnace).toMatchObject({mode:'preview',heat:'fierce'});
      expect(frame?.furnace?.result).toBeUndefined();
      if(!frame)throw Error('native legal preview absent');
      await act(async()=>env.root.render(<AlchemyWorkshopCanvas frame={frame} kind="furnace"/>));
      const scene=env.host.querySelector('[data-alchemy-workshop="furnace"]')!;
      expect(scene.textContent).toMatch(/火候示意.*尚未耗材.*不能预知成色/);
      expect(scene.textContent).not.toContain('本轮实录');
      const canvas=scene.querySelector('canvas')!;
      expect(canvas.getAttribute('aria-hidden')).toBe('true');
      expect(canvas.width).toBe(width*2);
      expect(canvas.height).toBe(env.height*2);
      expect(painting).toHaveBeenLastCalledWith(env.context,frame.furnace,width,env.height,undefined);
      expect(env.raf).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(env.outside);
      expect(JSON.stringify(world)).toBe(snapshot);
    } finally {await env.stop();}
  });

  it('keeps a proved paid result static when motion is reduced, and respects the closed native fold',async()=>{
    const env=shell(390);
    vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));
    const world=brewMonth(actualHighAlchemyMaterials(),highBrew('nine_turn_golden','fierce'),.99);
    const viewer=brewActor(world);
    const frame=projectAlchemyWorkshop(world,createTerrainMapView(world,viewer,true),brewSiteId,{viewer});
    try {
      expect(frame?.furnace).toMatchObject({mode:'receipt',heat:'fierce',result:{success:true,lightning:true}});
      if(!frame)throw Error('native paid result absent');
      await act(async()=>env.root.render(<AlchemyWorkshopCanvas frame={frame} kind="furnace" active={false}/>));
      expect(painting).not.toHaveBeenCalled();
      expect(env.ctx).not.toHaveBeenCalled();
      await act(async()=>env.root.render(<AlchemyWorkshopCanvas frame={frame} kind="furnace"/>));
      expect(env.host.querySelector('figcaption')?.textContent).toContain('本轮实录');
      expect(env.host.querySelector('figcaption')?.textContent).not.toContain('火候示意');
      expect(painting).toHaveBeenLastCalledWith(env.context,frame.furnace,390,env.height,undefined);
      expect(env.raf).not.toHaveBeenCalled();
    } finally {await env.stop();}
  });

  it('keeps maturity explanatory when Canvas is unavailable and adds no harvest button',async()=>{
    const env=shell(360);
    env.ctx.mockReturnValue(null);
    const {world,ownerId,siteId}=matureSeedCulture(),viewer=seedPerson(world,ownerId);
    const frame=projectAlchemyWorkshop(world,createTerrainMapView(world,viewer,true),siteId,{viewer});
    try {
      expect(frame?.garden?.plots[0]?.stage).toBe('flower');
      if(!frame)throw Error('native growing garden absent');
      await act(async()=>env.root.render(<AlchemyWorkshopCanvas frame={frame} kind="garden"/>));
      const figure=env.host.querySelector('[data-alchemy-workshop="garden"]')!;
      expect(figure.textContent).toMatch(/生长中 0 圃.*实熟待收 1 圃.*观测示意/);
      expect(figure.querySelector('button')).toBeNull();
      expect(gardenPainting).not.toHaveBeenCalled();
      expect(env.raf).not.toHaveBeenCalled();
    } finally {await env.stop();}
  });

  it('previews on the original heat option and only that original button can send a native choice',async()=>{
    const env=shell(390);
    const world=actualHighAlchemyMaterials(),viewer=brewActor(world),snapshot=JSON.stringify(world);
    const view=projectHeavenlyAlchemy(world,viewer),terrain=createTerrainMapView(world,viewer,true);
    const workshop=projectAlchemyWorkshop(world,terrain,brewSiteId,{viewer});
    const guide=vi.fn(async()=>false);
    try {
      if(!view||!workshop)throw Error('native furnace surface unavailable');
      await act(async()=>env.root.render(<HeavenlyAlchemyRead view={view} workshop={workshop}
        tick={world.tick} controls={{guide}} previewWorkshop={option=>projectAlchemyWorkshop(world,terrain,brewSiteId,
          {viewer,heatPreview:option.heavenlyAlchemyHeat})}/>));
      const fold=env.host.querySelector('details')!;
      await act(async()=>{fold.open=true;fold.dispatchEvent(new Event('toggle'));});
      const fierce=Array.from(fold.querySelectorAll('button')).find(btn=>btn.textContent?.includes(HEAVENLY_ALCHEMY_HEAT.fierce.name))!;
      expect(fierce.className).toContain('min-h-11');
      await act(async()=>fierce.focus());
      expect(env.host.querySelector('figcaption')?.textContent).toMatch(/火候示意.*尚未耗材/);
      expect(guide).not.toHaveBeenCalled();
      await act(async()=>fierce.click());
      expect(guide).toHaveBeenCalledTimes(1);
      expect(guide.mock.calls[0]).toEqual([view.options.find(option=>option.heavenlyAlchemyMove==='brew'&&
        option.heavenlyAlchemyHeat==='fierce')]);
      expect(JSON.stringify(world)).toBe(snapshot);
    } finally {await env.stop();}
  });
});
