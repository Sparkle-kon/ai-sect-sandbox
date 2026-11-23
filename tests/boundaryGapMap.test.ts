import {expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {drawBoundaryGapFlag,visibleBoundaryGapCoverage} from '../src/components/boundaryGapMap';
import type {BoundaryCoverageView} from '../src/engine/boundaryReliefEngine';

const fixture=vi.hoisted(()=>({coverage:vi.fn()}));
vi.mock('../src/engine/boundaryReliefEngine',async load=>({...await load<typeof import('../src/engine/boundaryReliefEngine')>(),
  getCurrentBoundaryCoverage:fixture.coverage}));

it('uses only native current coverage admitted by the map, not historical or under fog',()=>{
  const world=createInitialWorld(1);
  const actor=world.cultivators[0];
  const rows:BoundaryCoverageView[]=[{postSiteId:'pass',tick:world.tick,kind:'gap'},
    {postSiteId:'fog',tick:world.tick,kind:'relief'},{postSiteId:'stale',tick:world.tick-1,kind:'relief'}];
  fixture.coverage.mockReturnValue(rows);
  expect([...visibleBoundaryGapCoverage(world,actor,id=>id!=='fog').values()]).toEqual([rows[0]]);
});
it('never draws a flag for vacancy, unrelated guard or absence; draws only actual incumbent and relief distinctly',()=>{
  const fill=vi.fn(),spy=vi.fn();
  const mock={save:spy,restore:spy,translate:spy,scale:spy,beginPath:spy,moveTo:spy,lineTo:spy,stroke:spy,closePath:spy,fill,fillStyle:''};
  const ctx=mock as unknown as CanvasRenderingContext2D;
  for(const state of [undefined,'gap','other'] as const)drawBoundaryGapFlag(ctx,{x:4,y:5},1,state);
  expect(spy).not.toHaveBeenCalled();
  drawBoundaryGapFlag(ctx,{x:4,y:5},1,'incumbent');
  expect(mock.fillStyle).toBe('#b5b1c9');
  drawBoundaryGapFlag(ctx,{x:4,y:5},1,'relief');
  expect(mock.fillStyle).toBe('#9de0c0');
  expect(fill).toHaveBeenCalledTimes(2);
});
