import {describe,expect,it} from 'vitest';
import {createManagedSectWorld,previewStarterSect} from '../src/engine/starterSectWorld';
import {encodeWorldSave} from '../src/engine/storageEngine';
import {appendManagedRestartTimelineRoot,createTimeline,managedRestartSeed,readTimelineHead,recordTimelineWorld,
  selectTimelineBranch,TIMELINE_MAX_BRANCHES} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload} from '../src/types/world';

function emptySchool(){
  const opening=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
  const management=opening.sectManagement!;
  const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'今日歇息。'};
  for(const actor of opening.cultivators)if(management.foundingDiscipleIds.includes(actor.id))actor.sectId='';
  const failed=advanceWorldTick(opening,Object.fromEntries(opening.cultivators.map(actor=>[actor.id,rest])),()=>.99);
  expect(failed.sectManagement?.growth?.failure).toEqual({tick:failed.tick,reason:'disciples_gone'});
  return {opening,failed,timeline:recordTimelineWorld(createTimeline(opening),failed)};
}

describe('东山再起 preserves the failed timeline',()=>{
  it('uses the exact preview, appends a fresh unrelated root, and leaves old saved bytes intact',()=>{
    const {opening,failed,timeline}=emptySchool();
    expect(managedRestartSeed(createTimeline(opening))).toBeUndefined();
    const old=head(timeline),bytes=encodeWorldSave(old.world),seed=managedRestartSeed(timeline);
    if(seed===undefined)throw Error('A genuine terminal school should offer a different founding seed');
    expect(seed).not.toBe(failed.random.seed);
    const preview=previewStarterSect(seed,'drunken-sword-hermitage',1)!;
    const fresh=createManagedSectWorld(seed,'classic','drunken-sword-hermitage',1)!;
    expect(()=>appendManagedRestartTimelineRoot(timeline,'main',old,opening)).toThrow();
    expect(()=>appendManagedRestartTimelineRoot(timeline,'main',{...old},fresh)).toThrow();
    const next=appendManagedRestartTimelineRoot(timeline,'main',old,fresh);
    expect(next.activeBranchId).not.toBe('main');
    expect(next.branches[0]).toBe(timeline.branches[0]);
    expect(next.branches[1].parentBranchId).toBeUndefined();
    expect(encodeWorldSave(readTimelineHead(next,'main')!)).toBe(bytes);
    const active=readTimelineHead(next)!;
    expect(active.tick).toBe(1);
    expect(active.sectManagement?.growth).toBeUndefined();
    expect(active.sectManagement?.latestReport).toBeUndefined();
    expect(active.sectManagement?.debt).toBeUndefined();
    expect(active.cultivators.filter(actor=>active.sectManagement?.foundingDiscipleIds.includes(actor.id)).map(actor=>actor.name))
      .toEqual(preview.disciples.map(actor=>actor.name));
  });

  it('never prunes the existing branches or mutates an old head when the space is full',()=>{
    const source=emptySchool();
    let current=source.timeline;
    while(current.branches.length<TIMELINE_MAX_BRANCHES){
      current=selectTimelineBranch(current,'main');
      const seed=managedRestartSeed(current)!;
      current=appendManagedRestartTimelineRoot(current,'main',head(current),
        createManagedSectWorld(seed,'classic','drunken-sword-hermitage',0)!);
    }
    current=selectTimelineBranch(current,'main');
    const old=current.branches.slice();
    expect(managedRestartSeed(current)).toBeUndefined();
    expect(()=>appendManagedRestartTimelineRoot(current,'main',head(current),source.opening)).toThrow(/旧卷已满/u);
    expect(current.branches).toEqual(old);
    expect(readTimelineHead(current)?.sectManagement?.growth?.failure?.reason).toBe('disciples_gone');
  });
});

function head(timeline:ReturnType<typeof createTimeline>){
  const row=timeline.branches.find(branch=>branch.id===timeline.activeBranchId)?.snapshots.at(-1);
  if(!row)throw Error('Missing exact active snapshot');
  return row;
}
