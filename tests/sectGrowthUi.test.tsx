// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {SectManagementHome} from '../src/components/SectManagementHome';
import {buildLocalCourtyard,hitLocalCourtyard,type LocalCourtyardPlan} from '../src/components/localCourtyardModel';
import {drawLocalCourtyard} from '../src/components/localCourtyardRenderer';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {advanceSectGrowth,applySectGrowthCommand} from '../src/engine/sectGrowth';
import {createManagedSectWorld,previewStarterSect} from '../src/engine/starterSectWorld';
import {MANAGEMENT_BUILDING_IDS} from '../src/types/sectManagement';
import type {SectGrowthCommand} from '../src/types/sectGrowth';
import type {WorldState} from '../src/types/world';

function fixture(){
  const world=createManagedSectWorld(407,'classic','qingyun-odd-jobs',0);
  const state=world?.sectManagement,sect=world?.sects.find(row=>row.id===state?.sectId);
  if(!world||!state||!sect)throw Error('Missing managed Qingyun seed');
  return {world,state,sect};
}
const button=(host:ParentNode,label:string)=>{
  const match=[...host.querySelectorAll<HTMLButtonElement>('button')].find(row=>row.textContent?.trim()===label||row.getAttribute('aria-label')===label);
  if(!match)throw Error('Missing control: '+label);
  return match;
};
const byId=(world:WorldState)=>world.sectManagement?.sectId;
const court=(world:WorldState,siteId=world.sectManagement?.homeSiteId??'')=>{
  const result=buildLocalCourtyard(world,createTerrainMapView(world,undefined,false),siteId);
  if(!result)throw Error('Missing genuine courtyard');
  return result;
};

it.each([360,1440])('shows live rank, treasury and countdown, with priced and exact six-building commands at %ipx',async width=>{
  let {world,sect}=fixture();
  sect.spiritStones=450;
  world={...world,tick:world.tick+1,month:world.month+1};
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('innerWidth',width);
  const getContext=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host);
  const calls=vi.fn((expected:WorldState,order:SectGrowthCommand)=>{
    if(expected!==world)return false;
    const updated=structuredClone(world);
    if(!applySectGrowthCommand(updated,order))return false;
    world=updated;
    return true;
  });
  const render=()=>act(async()=>root.render(<SectManagementHome world={world} onManagementAction={calls} onStart={vi.fn()} onOpen={vi.fn()}/>));
  try{
    await render();
    const header=host.querySelector('h1')?.closest('header');
    expect(header?.className).toContain('sticky');
    expect(header?.textContent).toContain('青云杂役派');
    expect(header?.textContent).toContain('不入流');
    expect(header?.textContent).toContain('灵石 450 枚');
    expect(header?.textContent).toContain('余 5 月');
    expect(host.querySelector('[aria-label="仙盟考核"]')?.textContent).toContain('距首次仙盟年考约 11 月');
    const disclose=[...host.querySelectorAll('details')].find(row=>row.querySelector('summary')?.textContent==='山门营造');
    if(!disclose)throw Error('Missing buildings disclosure');
    expect(disclose.open).toBe(false);disclose.open=true;
    const buildings=disclose.querySelector('[aria-label="宗门建筑"]');
    expect(buildings?.querySelectorAll('li')).toHaveLength(6);
    const add=button(disclose,'修建丹房，用 20 枚灵石'),expected=world;
    const earliest=court(world);expect(earliest.facilities.some(row=>row.kind==='furnace')).toBe(false);
    await act(async()=>{add.click();add.click();});
    expect(calls).toHaveBeenCalledTimes(1);
    expect(calls).toHaveBeenCalledWith(expected,{kind:'upgrade',building:'furnace'});
    await render();
    expect(header?.textContent).toContain('灵石 430 枚');
    expect(disclose.open).toBe(true);
    expect(court(world).facilities).toContainEqual(expect.objectContaining({kind:'furnace',level:1}));
    expect(button(disclose,'升级丹房，用 40 枚灵石').disabled).toBe(false);
    await act(async()=>button(host,'还清 80 枚灵石').click());
    await render();
    expect(header?.textContent).toContain('灵石 350 枚');
    expect(header?.textContent).toContain('暂无欠款');
    expect(world.tick).toBe(expected.tick);
  }finally{
    await act(async()=>root.unmount());host.remove();getContext.mockRestore();vi.unstubAllGlobals();
  }
});

function paints(plan:LocalCourtyardPlan){
  const rect=vi.fn(),pen:Record<string,unknown>={fillRect:rect};
  for(const name of ['beginPath','clip','closePath','ellipse','fill','fillText','lineTo','moveTo','quadraticCurveTo','rect',
    'restore','rotate','roundRect','save','scale','stroke','translate'])pen[name]=()=>{};
  drawLocalCourtyard(pen as unknown as CanvasRenderingContext2D,plan,640,400,0);
  return rect.mock.calls;
}

it('draws level changes for each of the exact six paid structures and leaves the unrelated legacy court untouched',()=>{
  const {world,sect}=fixture();
  sect.spiritStones=450;
  const legacy=court(world,'loc-danxia');
  const aliases={hall:'hall',kitchen:'kitchen',furnace:'furnace',trainingGround:'training',gate:'gate',library:'pavilion'} as const;
  for(const id of MANAGEMENT_BUILDING_IDS){
    const before=court(world),kind=aliases[id];
    const previous=before.facilities.find(row=>row.kind===kind)?.level??0;
    expect(applySectGrowthCommand(world,{kind:'upgrade',building:id})).toBe(true);
    const updated=court(world),next=updated.facilities.find(row=>row.kind===kind);
    expect(updated.facilities.filter(row=>row.kind===kind)).toHaveLength(1);
    if(!next)throw Error('Missing upgraded fixture facility '+kind);
    expect(next.level).toBe(previous+1);
    expect(hitLocalCourtyard(updated,next)).toEqual({kind:'facility',id:next.id});
    expect(paints(updated)).not.toEqual(paints(before));
    expect(court(world,'loc-danxia')).toEqual(legacy);
  }
});

it('keeps annual and failure state true, and starts a new sect only after explicit restart confirmation',async()=>{
  let {world,state}=fixture();
  const prior=world;
  world=structuredClone(prior);world.tick+=12;world.year++;world.month=1;
  const reviewBase={...prior,tick:world.tick-1};
  expect(advanceSectGrowth(world,reviewBase).some(row=>row.title==='仙盟年考')).toBe(true);
  state=world.sectManagement!;
  const review=state.growth?.review;
  if(!review)throw Error('Expected native annual review');
  const confirm=vi.fn().mockResolvedValue(true),restart=vi.fn().mockReturnValue(true),start=vi.fn().mockReturnValue(false);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const getContext=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host),restartSeed=800;
  const render=()=>act(async()=>root.render(<SectManagementHome world={world} onStart={start} onOpen={vi.fn()}
    onConfirmJobs={confirm} onRestart={restart} restartSeed={restartSeed}/>));
  try{
    await render();
    expect(host.querySelector('[aria-label="仙盟考核"]')?.textContent).toContain(review.rating);
    const next=structuredClone(world);next.tick++;next.month++;
    for(const member of next.cultivators.filter(row=>row.id!==state.leaderId&&row.sectId===state.sectId)){member.alive=false;member.hp=0;}
    advanceSectGrowth(next,world);world=next;
    const before=JSON.stringify(world);
    await render();
    expect(host.querySelector('[data-sect-failure]')?.textContent).toContain('门中已没有弟子');
    expect(host.querySelector('[data-sect-morning]')).toBeNull();
    await act(async()=>button(host,'东山再起').click());
    expect(restart).not.toHaveBeenCalled();
    const preview=previewStarterSect(restartSeed,'qingyun-odd-jobs',0)?.disciples[0];
    expect(host.querySelector('[aria-label="开局弟子"]')?.textContent).toContain(preview?.name);
    await act(async()=>button(host,'取消，留在旧山门').click());
    expect(host.querySelector('[data-sect-failure]')).toBeTruthy();
    expect(restart).not.toHaveBeenCalled();
    await act(async()=>button(host,'东山再起').click());
    const chosen=button(host,'确认接掌青云杂役派');
    await act(async()=>{chosen.click();chosen.click();});
    expect(restart).toHaveBeenCalledTimes(1);
    expect(restart).toHaveBeenCalledWith(world,'qingyun-odd-jobs',0);
    expect(byId(world)).toBe(state.sectId);
    expect(JSON.stringify(world)).toBe(before);
    expect(start).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  }finally{
    await act(async()=>root.unmount());host.remove();getContext.mockRestore();vi.unstubAllGlobals();
  }
});
