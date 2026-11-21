import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {describeConfirmation, sameStorageContext, WorldStoragePanel} from '../src/components/WorldStoragePanel';
import {createInitialWorld} from '../src/data/initialWorld';
import {createMemorySaveBackend, createSaveStore} from '../src/engine/storageEngine';
import {executeGodIntervention} from '../src/engine/worldEngine';

describe('read-only save comparison attached to the existing save controller', () => {
  it('SSR leaves local storage untouched and requires both optional methods before offering the workflow', () => {
    const world = createInitialWorld(24);
    const unexpected = vi.fn((): never => { throw new Error('No store access on server render'); });
    const base = {list:unexpected,inspect:unexpected,loadSelected:unexpected,capabilities:unexpected,save:unexpected,delete:unexpected};
    const render = (withMethods: Partial<{reviewResumePair:typeof unexpected;loadReviewedResume:typeof unexpected}> = {}) =>
      renderToStaticMarkup(<WorldStoragePanel world={world} busy={false} store={{...base,...withMethods}}
        onNewWorld={unexpected} onRestore={unexpected} />);
    const heading = '对照续局存档';
    for (const absent of [render(),render({reviewResumePair:unexpected}),render({loadReviewedResume:unexpected})]) {
      expect(absent).toContain('核验此槽');
      expect(absent).not.toContain(heading);
    }
    expect(render({reviewResumePair:unexpected,loadReviewedResume:unexpected})).toContain(heading);
    expect(unexpected).not.toHaveBeenCalled();
  });

  it('names the exact slot and version with replacement and retention warnings even for visually identical saves', async () => {
    const backend = createMemorySaveBackend(), store = createSaveStore(backend,()=>10);
    const base = createInitialWorld(117);
    const altered = executeGodIntervention(base,{type:'WHISPER_MIND',targetCultivatorId:base.cultivators[0].id,
      whisperText:'只有这个存档中的实际改动'});
    const lineage = {timelineId:'test-world',branchId:'main',label:'同一个显示名'};
    await store.save('slot-1','同一个存档名',base,null,lineage);
    await store.save('slot-2','同一个存档名',altered,null,{...lineage,branchId:'branch-1'});
    const prior = await store.inspect('slot-2');
    await store.save('slot-2','同一个存档名',base,prior.headRevision,lineage);

    const review = await store.reviewResumePair({slotId:'slot-1',point:'current'},{slotId:'slot-2',point:'previous'});
    expect(review.relation).toBe('same_timeline_other_branch');
    const left = describeConfirmation({kind:'restore_compare',review,side:'left'});
    const right = describeConfirmation({kind:'restore_compare',review,side:'right'});
    expect(left).toContain('存档位 1 的当前版');
    expect(right).toContain('存档位 2 的恢复点');
    for (const exact of [left,right]) {
      expect(exact).toContain('同一个存档名');
      expect(exact).toContain('同一个显示名');
      expect(exact).toContain(`Tick #${base.tick}`);
      expect(exact).toContain('未保存的当前进度将被替换');
      expect(exact).toContain('两处原候选不改动');
      expect(exact).not.toContain('只有这个存档中的实际改动');
    }
    expect(right).not.toBe(left);
    expect(await store.inspect('slot-2')).toMatchObject({previous:{selection:{sourceBranch:{branchId:'branch-1'}}}});

    const absent = await store.reviewResumePair({slotId:'slot-1',point:'current'},{slotId:'slot-4',point:'current'});
    expect(describeConfirmation({kind:'restore_compare',review:absent,side:'right'})).toBe('所选候选尚不可载入。');
  });

  it('invalidates scope on a switch-away and return even when both the branch label and the original world pointer recur', () => {
    const world = createInitialWorld(24);
    const reviewed = {world,version:81,branchId:'main',timelineId:'lineage-A'};
    expect(sameStorageContext(reviewed,{...reviewed})).toBe(true);
    expect(sameStorageContext(reviewed,{...reviewed,branchId:'branch-1',version:82})).toBe(false);
    expect(sameStorageContext(reviewed,{...reviewed,version:83})).toBe(false);
    expect(sameStorageContext(reviewed,{...reviewed,world:structuredClone(world)})).toBe(false);
    expect(sameStorageContext(reviewed,{...reviewed,timelineId:'lineage-B'})).toBe(false);
  });
});
