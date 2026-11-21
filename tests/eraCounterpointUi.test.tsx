import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {EraCounterpointForm,EraCounterpointPanel,EraCounterpointReading,EraCounterpointUnavailable} from '../src/components/EraCounterpointPanel';
import {TimelinePanel} from '../src/components/TimelinePanel';
import {createInitialWorld} from '../src/data/initialWorld';
import type {WorldTimeline} from '../src/engine/timelineEngine';
import type {projectEraCounterpoint} from '../src/engine/eraCounterpointEngine';

type Reading=Extract<ReturnType<typeof projectEraCounterpoint>,{ok:true}>;
const opening={tick:6,year:1001,month:6}, exact={tick:7,year:1001,month:7};
const naturalEvidence={kind:'native_snapshot',tick:7} as const;
const authoredEvidence={kind:'authored_opening',tick:6} as const;

function timelineFixture():WorldTimeline {
  const native=createInitialWorld();
  Object.assign(native,exact);
  const authored=structuredClone(native);
  // This row is only pick-list metadata. No author-origin proof or verification is implied on SSR.
  authored.authoredEraOrigin={openedTick:opening.tick} as NonNullable<typeof authored.authoredEraOrigin>;
  return {activeBranchId:'hidden-original-id',nextBranchNumber:2,branches:[
    {id:'hidden-original-id',label:'真自然线',snapshots:[{tick:native.tick,world:native}]},
    {id:'hidden-authored-id',label:'真作者线',snapshots:[{tick:authored.tick,world:authored}]},
  ]};
}

describe('quiet scoped era comparison',()=>{
  it('adds only one default-closed Timeline fold, with explicit options and no automatic verify',()=>{
    const timeline=timelineFixture();
    const select=vi.fn();
    const fold=renderToStaticMarkup(<EraCounterpointPanel timeline={timeline}/>);
    expect(fold).toMatch(/^<details class=/);
    expect(fold).toContain('自然与作者同读');
    expect(renderToStaticMarkup(<EraCounterpointPanel timeline={{...timeline,branches:[timeline.branches[0]]}} />)).toBe('');
    expect(fold).not.toMatch(/<details[^>]+open|<select|已核对/);
    const form=renderToStaticMarkup(<EraCounterpointForm timeline={timeline} viewerId="hidden-viewer-id"/>);
    expect(form).toContain('真自然线');
    expect(form).toContain('真作者线');
    expect(form.match(/value="" selected=""/g)).toHaveLength(3);
    expect(form).toContain('核对这两条分支');
    expect(form).not.toMatch(/hidden-.*-id|作者开局已经核对|实住/);
    const integrated=renderToStaticMarkup(<TimelinePanel timeline={timeline} previewTick={null} busy={false}
      onSelectBranch={select} onPreview={vi.fn()} onFork={vi.fn()}/>);
    expect(integrated.match(/自然与作者同读/g)).toHaveLength(1);
    expect(select).not.toHaveBeenCalled();
  });

  it('reports missing and mismatching origin as no proof without using a convenient frame',()=>{
    const missing=renderToStaticMarkup(<EraCounterpointUnavailable reason="opening_unretained"/>);
    const mismatch=renderToStaticMarkup(<EraCounterpointUnavailable reason="baseline_mismatch"/>);
    expect(missing).toContain('自然原帧已不在保留窗口，不能证明同源');
    expect(mismatch).toContain('核验摘要不一致，不能证明同源');
    expect(missing+mismatch).not.toMatch(/实住|寒玉|<button/);
  });

  it('reads exact dates and distinguishes existing, authored and later facts without interpreting unavailable as absence',()=>{
    const result:Reading={ok:true,opening,natural:{
      branchId:'hidden-original-id',label:'自然线',source:'native',asOf:exact,firstRetained:opening,
      north:{siteId:'private-north',name:'寒玉脉',qi:80,ownership:{kind:'unowned'},evidence:naturalEvidence,ownershipEvidence:naturalEvidence,qiEvidence:naturalEvidence},
      village:{settlementId:'private-village',name:'岭西',population:45,capacity:70,householdGroups:4,registeredResidents:3,
        evidence:naturalEvidence,populationEvidence:naturalEvidence,capacityEvidence:naturalEvidence},
      obligations:[{kind:'observatory',openedTick:6,dueTick:8,status:'pending'}],
    },authored:{
      branchId:'hidden-authored-id',label:'作者线',source:'authored',asOf:exact,firstRetained:opening,
      north:{siteId:'private-north',name:'寒玉脉',qi:50,ownership:{kind:'owned',sectName:'丹霞北支'},evidence:authoredEvidence,ownershipEvidence:authoredEvidence,qiEvidence:naturalEvidence},
      obligations:[{kind:'courier',openedTick:7,dueTick:10,status:'in_transit'}],
    }};
    const html=renderToStaticMarkup(<EraCounterpointReading result={result}/>);
    for(const text of ['1001 年 6 月','1001 年 7 月','已有实录','作者设定 · 开局生效','开局后的实录','已核对为无主','归属丹霞北支','实记家户 4 户','此视角没有在地村户实据','观象约定','封信托付'])expect(html).toContain(text);
    expect(html).toMatch(/归属丹霞北支<\/p><span[^>]*>作者设定 · 开局生效/);
    expect(html).toMatch(/灵气 50<\/p><span[^>]*>已有实录/);
    expect(html).not.toMatch(/hidden-.*-id|private-north|private-village|当前人口 0|没有承诺。$/);
  });
});
