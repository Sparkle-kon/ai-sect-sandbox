import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {WorldMapCanvas} from '../src/components/WorldMapCanvas';
import {createInitialWorld} from '../src/data/initialWorld';
import {configureRegionalSimulation,regionForPoint,SIMULATION_REGION_NAMES} from '../src/engine/regionalSimulationEngine';

describe('regional map label does not widen site knowledge',()=>{
  it('only labels a living observer’s known site in enabled mode and the existing tools',()=>{
    const world=createInitialWorld(2031);
    const viewer=world.cultivators[0];
    const site=world.locations.find(row=>row.id===viewer.locationId)!;
    const label='所选已知地点所属地域：';
    const view=(toolsOpen=true,viewerId:string|null=viewer.id)=>renderToStaticMarkup(<WorldMapCanvas compact toolsOpen={toolsOpen}
      world={world} selectedCultivatorId={viewerId} onSelectCultivator={()=>undefined}/>);
    expect(view()).not.toContain(label);
    expect(configureRegionalSimulation(world,site.id)).toBe(true);
    expect(view()).toContain(label+SIMULATION_REGION_NAMES[regionForPoint(world,site)!]);
    expect(view(false)).not.toContain(label);
    expect(view(true,null)).not.toContain(label);
    const hidden=world.locations.find(row=>row.type==='secret_realm')!;
    viewer.locationId=hidden.id;
    expect(view()).not.toContain(label);
  });
});
