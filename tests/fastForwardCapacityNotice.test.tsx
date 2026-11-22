import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {CAMPAIGN_FRAME_BYTES,CAMPAIGN_RETAINED_BYTES,FastForwardCapacityNotice,campaignFrameBlocksStart}
  from '../src/components/FastForwardCapacityNotice';
import {CAMPAIGN_SOURCE_MAX_BYTES} from '../src/engine/campaignMemento';
import {ERA_WORLD_SAVE_MAX_BYTES,WORLD_SAVE_MAX_BYTES} from '../src/engine/storageEngine';

describe('separate native archive capacities are not actor ceilings',()=>{
  it('labels one measured frame, retained source limits and the original branch guard',()=>{
    expect(CAMPAIGN_FRAME_BYTES).toBe(ERA_WORLD_SAVE_MAX_BYTES);
    expect(CAMPAIGN_RETAINED_BYTES).toBe(CAMPAIGN_SOURCE_MAX_BYTES);
    const ui=renderToStaticMarkup(<FastForwardCapacityNotice campaign currentBytes={18_405_927} ordinaryLimit={WORLD_SAVE_MAX_BYTES}/>);
    expect(ui).toContain('每份快照 32 MiB，各分支保留的不同快照合计 128 MiB');
    expect(ui).toContain('这里只测了当前一份');
    expect(ui).toContain('不会删除既有分支');
    expect(ui).toContain('这不等于超过长局上限');
    expect(ui).not.toContain('不能启动本次可续长局');
  });
  it('blocks only a measured too-large durable frame and leaves a short detached run independent',()=>{
    expect(campaignFrameBlocksStart(true,CAMPAIGN_FRAME_BYTES)).toBe(false);
    expect(campaignFrameBlocksStart(true,CAMPAIGN_FRAME_BYTES+1)).toBe(true);
    expect(campaignFrameBlocksStart(false,CAMPAIGN_FRAME_BYTES+1)).toBe(false);
    const render=(campaign:boolean)=>renderToStaticMarkup(<FastForwardCapacityNotice campaign={campaign}
      currentBytes={CAMPAIGN_FRAME_BYTES+1} ordinaryLimit={WORLD_SAVE_MAX_BYTES}/>);
    expect(render(true)).toContain('不能启动本次可续长局');
    expect(render(false)).toContain('不以普通 JSON 导入为前提');
    expect(render(false)).not.toContain('128 MiB');
  });
});
