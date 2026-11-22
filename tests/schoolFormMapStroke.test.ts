import {describe,expect,it,vi} from 'vitest';
import {projectSchoolFormStrokes} from '../src/engine/schoolFormDuel';
import {createInitialWorld} from '../src/data/initialWorld';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {buildSchoolFormMapStrokes,drawSchoolFormMapStrokes} from '../src/components/schoolFormMapStroke';

vi.mock('../src/engine/schoolFormDuel',()=>({projectSchoolFormStrokes:vi.fn()}));

describe('anonymous map stroke at a proved native duel',()=>{
  it('requires canonical visible actors and ground, paints no identifiers or unverified forward hit',()=>{
    const world=createInitialWorld(),[a,b]=world.cultivators,site=world.locations.find(row=>row.id==='loc-market')!;
    a.locationId=b.locationId=site.id;
    vi.mocked(projectSchoolFormStrokes).mockReturnValue([{actorId:a.id,opponentId:b.id,siteId:site.id}]);
    const view=createTerrainMapView(world,a,false);
    const plan=buildSchoolFormMapStrokes(world,view);
    expect(plan).toEqual([{siteId:site.id,x:site.x,y:site.y}]);
    expect(buildSchoolFormMapStrokes(world,{...view,liveActors:[a]})).toEqual([]);
    expect(buildSchoolFormMapStrokes(world,{...view,isCurrentLocation:()=>false})).toEqual([]);
    vi.mocked(projectSchoolFormStrokes).mockReturnValue([]);
    expect(buildSchoolFormMapStrokes(world,view)).toEqual([]);
    const quadraticCurveTo=vi.fn(),restore=vi.fn();
    const ctx={save:vi.fn(),restore,moveTo:vi.fn(),beginPath:vi.fn(),stroke:vi.fn(),quadraticCurveTo} as unknown as CanvasRenderingContext2D;
    drawSchoolFormMapStrokes(ctx,plan,1);
    expect(quadraticCurveTo).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
