import {describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {buildCalamityMapFlows,calamityFlowSummary,drawCalamityMapFlows} from '../src/components/calamityArrayMapFlow';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {projectCalamityArrayFlows} from '../src/engine/calamityArray';

vi.mock('../src/engine/calamityArray',()=>({projectCalamityArrayFlows:vi.fn()}));

describe('two native same-place flow proofs',()=>{
  it('renders only living exact visible contributors and distinct flow marks at the same actual site',()=>{
    const world=createInitialWorld(),first=world.cultivators[0];
    const second=world.cultivators.find(actor=>actor.sectId!==first.sectId)!;
    const site=world.locations.find(row=>row.id==='loc-market')!;
    first.locationId=second.locationId=site.id;
    vi.mocked(projectCalamityArrayFlows).mockReturnValue([first,second].map(actor=>({
      actorId:actor.id,sectId:actor.sectId,siteId:site.id,hazardId:'opaque-local-proof',stance:'joint',tick:world.tick,paidQi:8,saved:2,
    })));
    const terrain=createTerrainMapView(world,first,false);
    const result=buildCalamityMapFlows(world,terrain);
    expect(result.map(row=>[row.lane,row.center])).toEqual([[0,{x:site.x,y:site.y}],[1,{x:site.x,y:site.y}]]);
    expect(calamityFlowSummary(result)).toBe('本地实有两股合阵流光');
    expect(buildCalamityMapFlows(world,{...terrain,liveActors:[first]})).toHaveLength(1);
    expect(buildCalamityMapFlows(world,{...terrain,isCurrentLocation:()=>false})).toEqual([]);
    const ellipse=vi.fn(),setLineDash=vi.fn(),restore=vi.fn();
    const ctx={save:vi.fn(),restore,beginPath:vi.fn(),stroke:vi.fn(),ellipse,setLineDash} as unknown as CanvasRenderingContext2D;
    drawCalamityMapFlows(ctx,result,1);
    expect(ellipse.mock.calls.map(([x])=>x)).toEqual([site.x,site.x]);
    expect(setLineDash.mock.calls).toEqual([[[]],[[2.5,1.8]]]);
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
