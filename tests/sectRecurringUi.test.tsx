// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {SectManagementHome} from '../src/components/SectManagementHome';
import {projectSectComicMoment} from '../src/engine/sectComedy';
import {projectSectRecurring,settleSectRecurringMonth} from '../src/engine/sectRecurring';
import {ensureSectRecurringCast} from '../src/engine/sectRecurringCast';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldEvent,WorldState} from '../src/types/world';

const quiet:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在原处听山风。'};
function next(source:WorldState){
  const orders=Object.fromEntries(source.cultivators.map(actor=>[actor.id,quiet]));
  return advanceWorldTick(source,orders,()=>.99,'utility',undefined,{capturePresentation:false,sectJobAssignments:[]});
}
function managed(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  const state=world?.sectManagement,sect=world?.sects.find(row=>row.id===state?.sectId);
  if(!world||!state||!sect)throw Error('Expected managed Qingyun seed');
  // The seed deliberately carries reserves so actual scheduled visitors recur instead of stopping at ruin.
  sect.spiritStones=300;
  return {world,state};
}
function mount(){
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host);
  return {host,render:(world:WorldState)=>act(async()=>root.render(<SectManagementHome world={world} onStart={vi.fn()} onOpen={vi.fn()}/>)),
    cleanup:async()=>{await act(async()=>root.unmount());host.remove();context.mockRestore();vi.unstubAllGlobals();}};
}
const visitElements=(host:ParentNode)=>[...host.querySelectorAll('[data-sect-recurring-visit]')];

it('shows a verified recurring memory and existing ordinary beat in one collapsed current-month disclosure',async()=>{
  let {world}=managed();
  let visit:ReturnType<typeof projectSectRecurring>[number]|undefined;
  for(let steps=0;steps<15&&!visit;steps++){
    world=next(world);
    visit=projectSectRecurring(world).find(row=>row.role!=='cat'&&!!row.quote&&!!row.recall);
  }
  if(!visit)throw Error('Expected a genuine later visit recalling an earlier moment');
  const prior=JSON.stringify(world),comic=projectSectComicMoment(world);
  if(!comic)throw Error('Expected independent current-month comedy');
  vi.stubGlobal('innerWidth',360);
  const {host,render,cleanup}=mount();
  try{
    await render(world);
    const cards=host.querySelectorAll<HTMLDetailsElement>('[data-sect-comic-aside]');
    expect(cards).toHaveLength(1);expect(cards[0].open).toBe(false);
    expect(cards[0].querySelector(':scope > div > p')?.textContent).toBe(comic.report);
    expect(cards[0].textContent).toContain(visit.recall);
    const named=cards[0].querySelector(`[data-sect-recurring-visit="${visit.role}"]`);
    expect(named?.querySelector('h3')?.textContent).toContain(visit.name);
    expect(named?.querySelector('[data-cultivator-portrait]')).toBeTruthy();
    expect(named?.querySelector('blockquote')?.textContent).toContain(visit.quote);
    expect(named?.textContent).not.toContain(visit.entityId);
    expect(JSON.stringify(world)).toBe(prior);
    await render({...world,tick:world.tick+1});
    expect(visitElements(host)).toHaveLength(0);
  }finally{await cleanup();}
});

it('uses only a real living spirit beast for the cat portrait and never gives it dialogue',async()=>{
  const seed=managed();
  let world=next(seed.world);
  const refuge=world.sectManagement?.recurring?.catHomeSiteId;
  const holder=world.cultivators.find(row=>row.id===seed.state.foundingDiscipleIds[0]);
  if(!refuge||!holder)throw Error('Expected native cat refuge and founding witness');
  holder.locationId=refuge;holder.pills.foundation=2;
  let cat:ReturnType<typeof projectSectRecurring>[number]|undefined;
  for(let steps=0;steps<15&&!cat;steps++){
    world=next(world);
    cat=projectSectRecurring(world).find(row=>row.role==='cat');
  }
  if(!cat)throw Error('Expected a real recurring pill-cat scene');
  expect(cat.outcome).toBe('pill_taken');
  expect(cat.pill?.holderId).toBe(holder.id);
  expect(world.cultivators.find(row=>row.id===holder.id)?.pills.foundation).toBe(1);
  const {host,render,cleanup}=mount();
  const catCard=()=>host.querySelector('[data-sect-recurring-visit="cat"]');
  try{
    await render(world);
    expect(catCard()?.querySelector('h3')?.textContent).toContain(cat.name);
    expect(catCard()?.querySelector('[data-sect-native-cat]')).toBeTruthy();
    expect(catCard()?.querySelector('blockquote')).toBeNull();
    expect(catCard()?.querySelector('[data-cultivator-portrait]')).toBeNull();
    expect(catCard()?.querySelector('[aria-label="丹药折损"]')?.textContent).toContain('筑基丹 −1 枚');
    // A namesake cannot stand in for the saved unique beast.
    const detached=structuredClone(world);
    const original=detached.spiritBeasts.find(row=>row.id===cat?.entityId);
    if(!original)throw Error('Expected original living beast');
    original.id+='-namesake';
    await render(detached);
    expect(catCard()).toBeNull();
  }finally{await cleanup();}
});

it('reads a witnessed older-style headline in plain words without rewriting the source event',async()=>{
  const {world:prev}=managed();
  const world=structuredClone(prev);
  world.tick++;
  world.month++;
  if(!ensureSectRecurringCast(world))throw Error('Expected the recurring cast to be present');
  const actor=world.cultivators.find(person=>person.id==='elder-tianji-1');
  if(!actor)throw Error('Expected the true Tianji host');
  const headline='坊市本月未实付二十枚灵石';
  const event:WorldEvent={id:'evt-recurring-copy-fixture',tick:world.tick,year:world.year,month:world.month,
    title:headline,description:'坊市这笔买卖还没有付清。',actorIds:[actor.id],locationId:actor.locationId,category:'diplomacy'};
  world.events.unshift(event);
  world.events.unshift(...settleSectRecurringMonth(world,prev,[event]));
  const visit=projectSectRecurring(world).find(row=>row.role==='host');
  expect(visit?.sourceEventId).toBe(event.id);
  const {host,render,cleanup}=mount();
  try{
    await render(world);
    const news=host.querySelector('[data-sect-recurring-visit="host"]');
    expect(news?.textContent).toContain('坊市本月尚未支付二十枚灵石');
    expect(news?.textContent).not.toContain(headline);
    expect(world.events.find(row=>row.id===event.id)?.title).toBe(headline);
  }finally{await cleanup();}
});
