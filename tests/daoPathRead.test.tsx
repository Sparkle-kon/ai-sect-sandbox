import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {DaoPathRead} from '../src/components/DaoPathRead';
import type {DaoPathOption,DaoPathView} from '../src/engine/daoPathEngine';
import {DAO_PATH_IDS} from '../src/types/daoPath';

const blank:DaoPathView={actorId:'own-original-body',rank:0,practiceCount:0,options:[],activations:[]};
const start=DAO_PATH_IDS.map(targetDaoPathId=>({action:'DAO_PATH',daoPathMove:'choose',targetDaoPathId} as const));
const sword:DaoPathView={...blank,pathId:'sword',rank:1,practiceCount:2,nextRankAt:4,artifactName:'照霜',
  options:[{action:'DAO_PATH',daoPathMove:'practice',targetDaoPathId:'sword'},{action:'DAO_PATH',daoPathMove:'ready',targetDaoPathId:'sword'}]};

describe('Dao path read',()=>{
  it('starts as one optional fold with the five real paths and no invented previously learned intent',()=>{
    const view={...blank,options:start};
    expect(renderToStaticMarkup(<DaoPathRead view={view} tick={4}/>)).toBe('');
    const html=renderToStaticMarkup(<DaoPathRead view={view} tick={4} controls={{guide:vi.fn(async()=>true)}}/>);
    expect(html).toContain('择一条道途');
    for(const name of ['剑道','丹道','阵道','魔道','体修'])expect(html).toContain(`入${name}`);
    expect(html).not.toContain('已在交手中施展');
    expect(html).not.toContain('own-original-body');
  });
  it('distinguishes paid practice against a real named blade from merely ready',()=>{
    const guide=vi.fn(async(_option:DaoPathOption)=>true);
    const html=renderToStaticMarkup(<DaoPathRead view={sword} tick={7} controls={{guide}}/>);
    expect(html).toContain('万剑归宗 · 初窥');
    expect(html).toContain('所系本命之器：照霜');
    expect(html).toContain('实修 2 次');
    expect(html).toContain('6 真气、1 株玄土根');
    expect(html).toContain('实际出手时才耗 12 真气');
    expect(html).not.toContain('已在交手中施展');
    expect(guide).not.toHaveBeenCalled();
  });
  it('shows readiness and true casting separately, with no historical commands',()=>{
    const prepared={...sword,ready:{tick:7,expiresTick:11,artifactId:'proof-blade'}};
    const waiting=renderToStaticMarkup(<DaoPathRead view={prepared} tick={7}/>);
    expect(waiting).toContain('已蓄意，未出手 · 余 4 月');
    expect(waiting).not.toContain('已在交手中施展');
    expect(waiting).not.toContain('proof-blade');
    expect(waiting).not.toContain('行一轮功课');
    const paid:DaoPathView={...sword,activations:[{actorId:sword.actorId,pathId:'sword',rank:1,tick:9,readyTick:7,readySiteId:'site-sword',
      siteId:'actual-site',eventId:'native-event-key',qiPaid:12,artifactId:'proof-blade'}]};
    const done=renderToStaticMarkup(<DaoPathRead view={paid} tick={9}/>);
    expect(done).toContain('已在交手中施展万剑归宗');
    expect(done).toContain('实耗 12 真气');
    expect(done).not.toContain('native-event-key');
  });
});
