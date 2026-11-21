import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {AuthoredEraLaunch,canPrepareAuthoredEra,type AuthoredEraLaunchController,type AuthoredEraLaunchState} from '../src/components/AuthoredEraLaunch';
import {ScenarioPanel} from '../src/components/ScenarioPanel';
import {createInitialWorld} from '../src/data/initialWorld';
import {createEraDesignDraft,eraDesignCatalog} from '../src/engine/eraDesignDraft';

const world=createInitialWorld(2031);
const anchor={year:world.year,month:world.month};
const target={year:world.year+1,month:world.month};
const table=eraDesignCatalog(world.random.seed,'classic');
const draft=createEraDesignDraft(world.random.seed,'classic',anchor,target,[
  {kind:'jade_vein_depleted',siteId:table.depletionSites[0].id,spiritQi:40,jadeCapacity:1},
  {kind:'village_capacity',settlementId:table.villages[0].id,capacity:150},
]);
const controller=(state:AuthoredEraLaunchState):AuthoredEraLaunchController=>({
  scopeKey:'private-tabs-scope',state,onPrepare:vi.fn(),onCancel:vi.fn(),onCreate:vi.fn(()=>true),
});

describe('detached authored-era opening UI',()=>{
  it('requires the exact passing preview at the current frame and strictly future target',()=>{
    const report={...anchor,preview:{ready:true,draft}};
    expect(canPrepareAuthoredEra(draft,anchor,report)).toBe(true);
    expect(canPrepareAuthoredEra(draft,target,{...target,preview:report.preview})).toBe(false);
    expect(canPrepareAuthoredEra(draft,{...anchor,month:anchor.month+1},report)).toBe(false);
    expect(canPrepareAuthoredEra(draft,anchor,{...report,preview:{ready:false,draft}})).toBe(false);
    expect(canPrepareAuthoredEra({...draft,target:{year:target.year+1,month:target.month}},anchor,report)).toBe(false);
  });

  it('does not start or expose create on first render and stays in the existing author fold',()=>{
    const work=controller({phase:'idle'});
    const html=renderToStaticMarkup(<AuthoredEraLaunch draft={draft} controller={work}/>);
    expect(html).toContain('开始离线预备');
    expect(html).toContain('从创世离线实推');
    expect(html).not.toMatch(/确认创建独立分支|private-tabs-scope|<select/);
    expect(work.onPrepare).not.toHaveBeenCalled();
    const mount=renderToStaticMarkup(<ScenarioPanel world={world} busy={false} onApply={vi.fn()} authoredEra={work}/>);
    expect(mount.match(/写下纪元条件/g)).toHaveLength(1);
    expect(mount).not.toContain('开始离线预备');
    expect(work.onCreate).not.toHaveBeenCalled();
  });

  it('describes measured offline progress and returns a detached failed state, never live elapsed',()=>{
    const running=controller({phase:'preparing',progress:{current:{...anchor,tick:6},target,phase:'simulating',completedMonths:5,requestedMonths:12}});
    const during=renderToStaticMarkup(<AuthoredEraLaunch draft={draft} controller={running}/>);
    expect(during).toContain('已实推 5 / 12 月');
    expect(during).toContain('演算中的日期');
    expect(during).toContain('原分支没有推进');
    expect(during).toContain('取消预备，保留草案');
    expect(during).not.toContain('确认创建独立分支');
    const failed=renderToStaticMarkup(<AuthoredEraLaunch draft={draft} controller={controller({phase:'failed',
      message:'核验时拟迁成员没有同时到场。'})}/>);
    expect(failed).toContain('草案仍可修改；未创建分支，也未改动原分支');
    expect(failed).not.toContain('确认创建独立分支');
  });

  it('previews exact provenance and named candidates without selecting or confirming creation',()=>{
    const work=controller({phase:'prepared',summary:{...target,tick:13,baselineMonths:12,livingCount:48,
      receiptKey:'internal-receipt',effects:[{label:'作者设定：寒玉灵脉',change:'灵气 85 → 40'}],
      candidates:[{name:'萧微',sectName:'丹霞',siteName:'北地灵脉'}]}});
    const html=renderToStaticMarkup(<AuthoredEraLaunch draft={draft} controller={work}/>);
    for(const text of ['已有实录','作者设定 · 开局时生效','灵气 85 → 40','从此刻之后','萧微 · 丹霞 · 北地灵脉','核对并准备创建','不替你决定入世人物'])expect(html).toContain(text);
    expect(html).not.toMatch(/<select|internal-receipt|确认创建独立分支/);
    expect(work.onCreate).not.toHaveBeenCalled();
  });
});
