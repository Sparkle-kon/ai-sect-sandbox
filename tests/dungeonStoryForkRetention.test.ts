import { describe,expect,it } from 'vitest';
import { dungeonStorySnapshotRetained } from '../src/components/useDungeonStoryFork';
import { captureDungeonCounterfactualSource, projectRealDungeonChoice } from '../src/engine/dungeonCounterfactual';
import { createTimeline, recordTimelineWorld } from '../src/engine/timelineEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { resolveGuidedDungeonTurn } from '../src/controllers/guidedDungeonTurn';
import { dungeonActor, dungeonOccasion, enterNativeDungeon } from './expeditionDungeonNativeFixture';

describe('story choice receipts require the actual retained branch frame',()=>{
  it('retains the same garden frame after a true guide step, never after a same-tick substitution',()=>{
    const {world}=enterNativeDungeon();
    const original=createTimeline(world), frame=original.branches[0].snapshots[0];
    const actor=dungeonActor(world);
    const source=captureDungeonCounterfactualSource(world,actor,dungeonOccasion,'main',5)!;
    const option=source.firstOptions.find(row=>row.dungeonMove==='retreat')!;
    const guided=resolveGuidedDungeonTurn({world,actorId:actor.id,branchId:'main',revision:5,option},world,'main',5)!;
    expect(guided.actorId).toBe(actor.id);
    const actual=advanceWorldTick(world,{[guided.actorId]:guided.decision});
    const receipt=projectRealDungeonChoice(source,world,actual,option);
    expect(receipt?.exit).toBe('retreated');
    const history=recordTimelineWorld(original,actual);
    expect(dungeonStorySnapshotRetained(history,'main',frame)).toBe(true);
    const sameTick={...world,interventionSequence:world.interventionSequence+1};
    const replaced=recordTimelineWorld(original,sameTick);
    expect(dungeonStorySnapshotRetained(replaced,'main',frame)).toBe(false);
    expect(dungeonStorySnapshotRetained(history,'other',frame)).toBe(false);
    expect(projectRealDungeonChoice(source,sameTick,actual,option)).toBeUndefined();
  });
});
