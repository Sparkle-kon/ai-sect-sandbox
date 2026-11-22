import {renderToStaticMarkup} from 'react-dom/server';
import type {MouseEventHandler} from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MapKeyboardExplorer} from '../src/components/MapKeyboardExplorer';
import {createTerrainMapView,mapActorPositions} from '../src/components/terrainMapView';
import {buildMapPresentation} from '../src/components/mapPresentationView';
import {createInitialWorld} from '../src/data/initialWorld';
import {terrainTileAt} from '../src/engine/terrainEngine';

const harness=vi.hoisted(()=>({
  kind:'sites',
  inspections:new Map<string,MouseEventHandler<HTMLButtonElement>>(),
}));
// Seed the explorer's own category state for SSR. Inspection/paging/projections remain the production code.
vi.mock('react',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('react')>();
  const useState=(initial?:unknown)=>actual.useState(initial==='sites'?harness.kind:initial);
  return {...actual,useState};
});
vi.mock('react/jsx-dev-runtime',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('react/jsx-dev-runtime')>();
  return {...actual,jsxDEV:(...args:Parameters<typeof actual.jsxDEV>)=>{
    const [type,raw]=args;
    const props=raw as {'aria-label'?:string;onClick?:MouseEventHandler<HTMLButtonElement>};
    if(type==='button'&&props['aria-label']?.startsWith('检视 ')&&props.onClick)
      harness.inspections.set(props['aria-label'],props.onClick);
    return actual.jsxDEV(...args);
  }};
});

function fixture(){
  const world=createInitialWorld();
  const [here,remembered,hidden]=world.locations;
  Object.assign(here,{name:'当前试验山门',x:160,y:160});
  Object.assign(remembered,{name:'只曾探索远村',x:800,y:480});
  Object.assign(hidden,{name:'无权知晓秘址',x:920,y:120});
  const [viewer,person,remote]=world.cultivators;
  viewer.locationId=person.locationId=here.id;
  person.name='同地试验人物';
  remote.locationId=remembered.id;
  remote.name='远村藏匿人物';
  viewer.exploredTileIds=[terrainTileAt(world,remembered.x,remembered.y)!.id];
  world.mapPresentation={tick:world.tick,trails:[],effects:[
    {id:'actual-public-breakthrough',tick:world.tick,kind:'breakthrough',locationId:here.id,actorIds:[person.id]},
  ]};
  const onInspectSite=vi.fn(),onInspectActor=vi.fn(),onActor=vi.fn(),onSite=vi.fn();
  const make=(kind:'sites'|'actors'|'events',inspect=true)=>{
    harness.kind=kind;
    const view=createTerrainMapView(world,viewer,true);
    const actorPositions=mapActorPositions(view.seenLocations,view.liveActors,view.trailPositions);
    const presentation=buildMapPresentation(world,view,actorPositions);
    return renderToStaticMarkup(<MapKeyboardExplorer world={world} view={view} actorPositions={actorPositions}
      presentation={presentation} selected={person} follows={false} zoom={1} onFollow={()=>undefined}
      onCamera={()=>undefined} onSite={onSite} onActor={onActor} onFocusLost={()=>undefined}
      onInspectSite={inspect?onInspectSite:undefined} onInspectActor={inspect?onInspectActor:undefined}/>);
  };
  return {make,here,remembered,hidden,person,remote,onInspectSite,onInspectActor,onActor,onSite};
}

function fireInspection(name:string){
  const handler=harness.inspections.get(`检视 ${name}`);
  if(!handler)throw Error('No actual inspection button');
  // Explicit synthetic token for the React click seam: no browser or DOM focus is claimed.
  const currentTarget={tagName:'BUTTON'} as HTMLButtonElement;
  handler({currentTarget} as Parameters<typeof handler>[0]);
  return currentTarget;
}

afterEach(()=>{
  harness.kind='sites';
  harness.inspections.clear();
});

describe('keyboard explorer entity inspection',()=>{
  it('keeps native locate beside a touchable inspection button only for a currently visible site',()=>{
    const {make,here,remembered,hidden,onInspectSite,onSite,onInspectActor}=fixture();
    const html=make('sites');
    expect(html).toMatch(/<button[^>]*>当前试验山门<span/);
    expect(html).toMatch(/<button[^>]*min-h-11[^>]*aria-label="检视 当前试验山门">检视<\/button>/);
    expect(html).toContain(remembered.name);
    expect(html).not.toContain(`检视 ${remembered.name}`);
    expect(html).not.toContain(hidden.name);
    const trigger=fireInspection(here.name);
    expect(onInspectSite.mock.calls).toEqual([[here,trigger]]);
    expect(onSite).not.toHaveBeenCalled();
    expect(onInspectActor).not.toHaveBeenCalled();
  });

  it('inspects an exact current actor independently of the old selected locator',()=>{
    const {make,person,remote,onActor,onInspectSite,onInspectActor}=fixture();
    const html=make('actors');
    expect(html).toMatch(/aria-pressed="true">同地试验人物/);
    expect(html).toContain('aria-label="检视 同地试验人物"');
    expect(html).not.toContain(remote.name);
    const trigger=fireInspection(person.name);
    expect(onInspectActor.mock.calls).toEqual([[person,trigger]]);
    expect(onActor).not.toHaveBeenCalled();
    expect(onInspectSite).not.toHaveBeenCalled();
  });

  it('does not turn event rows into site inspections, and leaves legacy consumers without new buttons',()=>{
    const {make}=fixture();
    const events=make('events');
    expect(events).toMatch(/<button[^>]*>突破<span[^>]*>当前试验山门/);
    expect(events).not.toContain('aria-label="检视 ');
    expect(harness.inspections.size).toBe(0);
    expect(make('sites',false)).not.toContain('aria-label="检视 ');
    expect(make('actors',false)).not.toContain('aria-label="检视 ');
  });
});
