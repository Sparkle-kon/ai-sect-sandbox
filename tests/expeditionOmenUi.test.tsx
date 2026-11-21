import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { mapExplorerIndex } from '../src/components/MapKeyboardExplorer';
import { buildMapPresentation } from '../src/components/mapPresentationView';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { WorldOccasionsPanel } from '../src/components/WorldOccasionsPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveObservatoryAction } from '../src/engine/fieldObservatoryEngine';
import { advanceOccasions } from '../src/engine/occasionEngine';
import { localQiWeather } from '../src/engine/weatherEngine';
import type { Cultivator } from '../src/types/world';

function measuredFixture() {
  const world=createInitialWorld();
  const sites=world.locations.filter(l=>l.type==='spirit_vein'&&l.spiritQi>=70);
  const next=Array.from({length:55},(_,i)=>i+3).flatMap(tick=>sites.map(site=>({tick,site}))).find(({tick,site})=>{
    const original=localQiWeather(world,site,tick), subsequent=localQiWeather(world,site,tick+1);
    return original.kind==='灵潮'&&original.intensity>=.35&&subsequent.kind==='灵潮'&&subsequent.intensity>=.30;
  });
  if(!next)throw Error('expected independently measurable native tide');
  const [owner,recipient,outsider,hiddenEntrant]=world.cultivators;
  for(const actor of [owner,recipient,outsider,hiddenEntrant])actor.locationId=next.site.id;
  const birthOrdinal=12*world.year+world.month-1-world.tick;
  const step=(tick:number)=>{
    world.tick=tick;world.year=Math.floor((birthOrdinal+tick)/12);world.month=(birthOrdinal+tick)%12+1;
  };
  const doAction=(observatoryMove:'fund'|'measure'|'relay',target?:Cultivator)=>
    resolveObservatoryAction(world,owner,{chosenAction:'FIELD_OBSERVATORY',observatoryMove,innerMonologue:'',
      ...(observatoryMove!=='fund'?{targetObservatoryTick:next.tick-2}:{}),...(target?{targetCultivatorId:target.id}:{})});
  step(next.tick-2);expect(doAction('fund')).toBeTruthy();
  step(next.tick);expect(doAction('measure')).toBeTruthy();
  const panel=(actor:Cultivator)=>renderToStaticMarkup(<WorldOccasionsPanel world={world} cultivator={actor} />);
  const open=(relay:boolean)=>{
    step(next.tick+1);
    if(relay)expect(doAction('relay',recipient)).toBeTruthy();
    expect(advanceOccasions(world,()=>.99)).toHaveLength(1);
    const occasion=world.occasions[0];
    const gate=world.locations.find(({id})=>id===occasion.locationId)!;
    return {occasion,gate};
  };
  return {world,owner,recipient,outsider,hiddenEntrant,next,panel,open};
}

describe('actually scoped native expedition clues and map parity',()=>{
  it('shows only the owner before relay, then the actual received date and no private result prose',()=>{
    const f=measuredFixture();
    expect(f.panel(f.owner)).toContain('候访窗口，尚无开门实录');
    expect(f.panel(f.recipient)).not.toMatch(/本人秘境线索|开门实录/);
    const {occasion,gate}=f.open(true);
    occasion.expeditions.push({cultivatorId:f.outsider.id,tick:f.world.tick,outcome:'wounded',description:'不得从别人记录读出的原话。'});
    const relay=f.panel(f.recipient);
    expect(relay).toContain(`实测第 ${f.next.tick} 轮 · 获知第 ${f.next.tick+1} 轮`);
    expect(relay).toContain('已核实秘境开启');
    expect(relay).toContain(gate.name);
    expect(relay).not.toContain('不得从别人记录读出的原话');
    expect(f.panel(f.outsider)).not.toMatch(/本人秘境线索|已核实秘境开启|活跃 1 场/);
    expect(f.panel(f.outsider)).not.toContain(gate.name);
  });

  it.each([true,false])('does not paint, focus or index unlearned terrain gates even with fog=%s',fog=>{
    const f=measuredFixture();
    const {occasion,gate}=f.open(false);
    f.hiddenEntrant.locationId=gate.id;
    for(const viewer of [f.outsider,undefined]) {
      const view=createTerrainMapView(f.world,viewer,fog);
      expect(view.seenLocations.some(site=>site.id===gate.id)).toBe(false);
      expect(view.isCurrentLocation(gate.id)).toBe(false);
      expect(view.locationTile.has(gate.id)).toBe(false);
      expect(view.liveActors.some(actor=>actor.id===f.hiddenEntrant.id)).toBe(false);
      const actors=mapActorPositions(view.seenLocations,view.liveActors,view.trailPositions);
      const index=mapExplorerIndex(f.world,view,actors,buildMapPresentation(f.world,view,actors));
      expect(index.sites.some(({site})=>site.id===gate.id)).toBe(false);
      expect(index.events.some(({site})=>site.id===gate.id)).toBe(false);
    }
    const seen=createTerrainMapView(f.world,f.owner,fog);
    expect(seen.seenLocations).toContain(gate);
    expect(seen.visibleOpenOccasions).toContain(occasion);
    const actors=mapActorPositions(seen.seenLocations,seen.liveActors,seen.trailPositions);
    expect(mapExplorerIndex(f.world,seen,actors,buildMapPresentation(f.world,seen,actors)).events
      .some(({site})=>site.id===gate.id)).toBe(true);
    const hiddenHtml=renderToStaticMarkup(<WorldMapCanvas world={f.world} selectedCultivatorId={f.outsider.id} onSelectCultivator={()=>undefined} />);
    expect(hiddenHtml).not.toContain(gate.name);
    expect(hiddenHtml).not.toContain(occasion.title);
  });
});
