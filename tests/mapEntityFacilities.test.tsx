import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {MapEntityPopover} from '../src/components/MapEntityPopover';
import {projectMapEntityPopover,type MapEntityRead} from '../src/components/mapEntityPopoverModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {damageFurnacesFromBeastTide} from '../src/engine/furnaceSafetyEngine';
import {applyMapBrush} from '../src/engine/mapBrushEngine';

function viewDetails(data:MapEntityRead|undefined){
  return data?.kind==='site'?Object.fromEntries(data.details?.map(row=>[row.label,row.text])??[]):{};
}

describe('map site details',()=>{
  it('moves actual local closure into the selected site without disclosing it remotely, or turning a hover into a ledger',()=>{
    let world=createInitialWorld(1717);
    const siteBefore=world.locations.find(row=>row.id==='loc-taixu')!;
    world=applyMapBrush(world,'beast_tide',[{x:siteBefore.x,y:siteBefore.y}]);
    world.tick++;
    expect(damageFurnacesFromBeastTide(world,world.mapHazards.find(row=>row.kind==='beast_tide')!)).not.toHaveLength(0);
    const site=world.locations.find(row=>row.id===siteBefore.id)!;
    const local=world.cultivators.find(row=>row.locationId===site.id&&row.alive)!;
    const remote=world.cultivators.find(row=>row.locationId!==site.id&&row.alive)!;
    const target={kind:'site',id:site.id} as const;
    const map=createTerrainMapView(world,local,false);
    const owned=projectMapEntityPopover(world,map,target,local.id);
    expect(viewDetails(owned).丹炉).toContain('现场停炉');
    expect(viewDetails(owned).天象).toBeTruthy();
    const distant=projectMapEntityPopover(world,createTerrainMapView(world,remote,false),target,remote.id);
    expect(viewDetails(distant).丹炉).toBe(`${site.furnaceGrade} 阶`);
    expect(JSON.stringify(owned)).not.toContain(world.furnaceSafety.cases[0].id);
    expect(projectMapEntityPopover(world,map,target,local.id,false,false)).not.toHaveProperty('details');
    expect(projectMapEntityPopover(world,map,target,local.id)).toMatchObject({spiritRoot:site.spiritRoot,spiritQi:site.spiritQi});
    expect(owned).toBeDefined();
    if(!owned)throw new Error('expected exact site projection');
    const callbacks={onClose:vi.fn(),onFocus:vi.fn(),onCommit:vi.fn(()=>true)};
    const html=renderToStaticMarkup(<MapEntityPopover data={owned} anchor={{x:40,y:60}} pinned readOnly actions={[]}
      {...callbacks}/>);
    expect(html).toContain('此地设施与近况');
    expect(html).toContain('现场停炉');
    expect(html).toContain('灵脉');
    expect(html).toContain('聚焦此地');
    expect(html).not.toContain('降下机缘');
    const hover=renderToStaticMarkup(<MapEntityPopover data={owned} anchor={{x:40,y:60}} pinned={false} actions={[]} {...callbacks}/>);
    expect(hover).not.toContain('此地设施与近况');
  });

  it('shows population only from a stationary local body, with no identifiers or remote census',()=>{
    const world=createInitialWorld(1717);
    const village=world.settlements.villages.find(row=>row.locationId==='loc-market')!;
    const local=world.cultivators.find(row=>row.locationId===village.locationId&&row.alive)!;
    const view=createTerrainMapView(world,local,false),target={kind:'site',id:village.locationId} as const;
    expect(projectMapEntityPopover(world,view,target,local.id)).toMatchObject({population:village.population});
    view.trailPositions.set(local.id,{x:10,y:10});
    const inMotion=projectMapEntityPopover(world,view,target,local.id);
    expect(inMotion).not.toHaveProperty('population');
    expect(viewDetails(inMotion)).not.toHaveProperty('义仓');
  });
});
