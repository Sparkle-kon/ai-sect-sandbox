import {describe,expect,it} from 'vitest';
import {projectSectComicMoment} from '../src/engine/sectComedy';
import {sectJobOutcomeOdds} from '../src/engine/sectJobReportRules';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload} from '../src/types/world';

describe('H6 投入新版桥段仍保留旧章',()=>{
  it('真月步采到三株星辉花，旧版无奖励记录仍按自己的文案和收据读回',()=>{
    const before=createManagedSectWorld(1,'classic','qingyun-odd-jobs',0)!;
    const actor=before.cultivators.find(row=>row.id===before.sectManagement?.foundingDiscipleIds[0])!;
    actor.quirks=['lost'];
    const odds=sectJobOutcomeOdds(before,actor,'gather');
    const roll=(odds.success+odds.windfall*.5)/Object.values(odds).reduce((a,b)=>a+b,0);
    const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:''};
    const advanced=advanceWorldTick(before,Object.fromEntries(before.cultivators.filter(row=>row.id!==actor.id)
      .map(row=>[row.id,rest])),()=>roll,'utility',undefined,{
      captureTrace:false,capturePresentation:false,sectJobAssignments:[{discipleId:actor.id,jobId:'gather'}],
    });
    const view=projectSectComicMoment(advanced);
    expect(view).toMatchObject({templateId:'h6-work-gather-lost-windfall',speakerId:actor.id,
      effects:[{kind:'herb',herb:'star_bloom',amount:3}]});
    expect(view?.report).toContain('拣回三株');
    expect(view?.report).toContain(actor.name);
    expect(advanced.cultivators.find(row=>row.id===actor.id)?.herbs.star_bloom).toBe(actor.herbs.star_bloom+3);
    expect(projectSectComicMoment(decodeEraWorldSave(encodeEraWorldSave(advanced)))?.report).toBe(view?.report);

    // Reproduce the settled H5 receipt shape: same job and witness, different ID and no extra harvest.
    const old=structuredClone(advanced),management=old.sectManagement!,moment=management.comedy!.moments.at(-1)!;
    management.comedy={moments:[{...moment,templateId:'work-gather-lost-windfall',effects:[]}]};
    const oldActor=old.cultivators.find(row=>row.id===actor.id)!;
    oldActor.herbs.star_bloom-=3;
    if(management.chat)management.chat={months:management.chat.months.map(month=>({...month,posts:month.posts
      .map(post=>post.about.kind==='comic'?{...post,about:{kind:'comic',templateId:'work-gather-lost-windfall'}}:post)}))};
    const restored=decodeEraWorldSave(encodeEraWorldSave(old));
    expect(projectSectComicMoment(restored)).toMatchObject({templateId:'work-gather-lost-windfall',effects:[],
      report:'采药一趟另有进益。弟子请先看结果，再听自己怎么走的。'});
    expect(projectSectComicMoment(restored)?.report).not.toContain('星辉花');
  });
});
