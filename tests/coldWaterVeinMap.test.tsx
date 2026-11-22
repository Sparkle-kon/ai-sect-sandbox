import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {WorldMapCanvas} from '../src/components/WorldMapCanvas';
import {ColdWaterVeinPanel} from '../src/components/ColdWaterVeinPanel';
import {createInitialWorld} from '../src/data/initialWorld';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {projectWaterVein} from '../src/engine/waterVeinEngine';
import type {LLMDecisionPayload} from '../src/types/world';

describe('northern well inside existing native map tools',()=>{
  it('offers a neutral map hint only for an actual local symptom',()=>{
    let world=createInitialWorld(70,'spirit-bloom');
    const id='elder-danxia-1',north='loc-vein-north';
    const eligible=()=>world.cultivators.find(row=>row.id===id)!;
    const action=(chosenAction:LLMDecisionPayload['chosenAction'],detail:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
      ({chosenAction,innerMonologue:'到井边踏勘。',...detail});
    const known=knownMapLocations(world,eligible());
    const other=world.locations.filter(row=>row.id!==eligible().locationId);
    const possible=other.filter(row=>!known.includes(row));
    const choices=possible.length?possible:other;
    const target=choices.findIndex(row=>row.id===north);
    expect(target).toBeGreaterThanOrEqual(0);
    let draw=0;
    applyCultivatorBrainDecision(world,eligible(),action('EXPLORE'),()=>draw++===0?(target+.2)/choices.length:.99);
    expect(eligible().locationId).toBe(north);
    const village=world.settlements.villages.find(row=>row.locationId===north)!;
    const next=(decision:LLMDecisionPayload)=>{world=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(person=>
      [person.id,person.id===id?decision:action('REST')])),()=>.99,'utility');};
    const map=(person:string,toolsOpen:boolean)=>renderToStaticMarkup(<WorldMapCanvas world={world} selectedCultivatorId={person}
      onSelectCultivator={()=>undefined} toolsOpen={toolsOpen}/>);
    const hint='此人正在寒玉井边，可核看水势。';
    next(action('GATHER_HERBS',{targetHerbId:'earth_root'}));
    next(action('VILLAGE_WORKS',{targetSettlementId:village.id,villageWorkKind:'well'}));
    for(let tick=0;tick<2;tick++)next(action('REST'));
    expect(world.villageWorks.projects.find(row=>row.settlementId===village.id&&row.kind==='well')?.status).toBe('completed');
    expect(map(id,true)).not.toContain(hint);
    next(action('WATER_VEIN',{waterVeinMove:'open',targetLocationId:north}));
    expect(world.coldWaterVein?.openings).toHaveLength(1);
    expect(map(id,true)).not.toContain(hint);
    next(action('REST'));
    expect(map(id,true)).toContain(hint);
    expect(map(id,false)).not.toContain(hint);
    const outsider=world.cultivators.find(person=>person.alive&&person.locationId!==north)!;
    expect(map(outsider.id,true)).not.toContain(hint);
    const view=projectWaterVein(world,eligible());
    expect(view?.scope).toBe('local');
    if(!view)throw Error('local water proof missing');
    expect(renderToStaticMarkup(<ColdWaterVeinPanel view={view}/>)).toContain('浅 3 寸');
  });
});
