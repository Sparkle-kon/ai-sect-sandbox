import {describe,expect,it} from 'vitest';
import {projectSectMomentScene} from '../src/components/sectMomentScene';
import {collectSectMomentSources,resolveSectMomentSource} from '../src/engine/sectMomentSources';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldEvent} from '../src/types/world';

function sceneFixture(){
  const previous=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  const management=previous?.sectManagement;
  if(!previous||!management)throw new Error('Managed sect fixture missing');
  const [chef,breaker]=management.foundingDiscipleIds;
  const actor=previous.cultivators.find(person=>person.id===breaker);
  if(!actor)throw new Error('Breakthrough author missing');
  actor.qiProgress=100;
  const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'且歇片刻。'};
  const orders=Object.fromEntries(previous.cultivators.map(person=>[person.id,rest]));
  orders[breaker]={chosenAction:'BREAKTHROUGH',innerMonologue:'今夕再冲一层。'};
  const complete:WorldEvent[]=[];
  const world=advanceWorldTick(previous,orders,()=>.12,'utility',undefined,{
    capturePresentation:false,sectJobAssignments:[{discipleId:chef,jobId:'kitchen'}],
    onCompletedEvents:events=>complete.push(...events),
  });
  const sources=collectSectMomentSources(world,previous,complete);
  const meal=sources.find(row=>row.kind==='food');
  const visible=sources.find(row=>row.kind==='breakthrough'&&row.authorId===breaker);
  if(!meal||!visible)throw new Error('Expected native food and breakthrough receipts');
  return {previous,world,complete,meal,visible};
}

describe('朋友圈小图仅认当时实景',()=>{
  it('公共破境留当时地点、不画此刻人物；篡改地点或热尾重复凭据就拒绝画',()=>{
    const {world,visible}=sceneFixture();
    const photo=projectSectMomentScene(world,visible);
    expect(photo).toMatchObject({siteId:visible.siteId,sourceId:visible.sourceEventId,historical:true,cast:[]});
    const moved=structuredClone(world);
    const actor=moved.cultivators.find(person=>person.id===visible.authorId);
    if(!actor)throw new Error('Missing source author');
    actor.locationId='loc-market';
    expect(projectSectMomentScene(moved,visible)).toEqual(photo);
    expect(projectSectMomentScene(world,{...visible,siteId:'loc-market'})).toBeUndefined();
    const event=resolveSectMomentSource(world,visible);
    if(!event)throw new Error('Missing historical receipt');
    moved.events.push(structuredClone(event));
    expect(projectSectMomentScene(moved,visible)).toBeUndefined();
  });

  it('同席才可看饭堂景，私域名单扩大或收窄都不得复用照片',()=>{
    const {world,meal}=sceneFixture();
    expect(projectSectMomentScene(world,meal)).toMatchObject({siteName:'本门饭堂',historical:true,cast:[]});
    expect(projectSectMomentScene(world,{...meal,audience:undefined})).toBeUndefined();
    expect(projectSectMomentScene(world,{...meal,audience:[...(meal.audience??[]),'npc-1'].sort()})).toBeUndefined();
    expect(projectSectMomentScene(world,{...meal,audience:meal.audience?.slice(0,-1)})).toBeUndefined();
    const missing=structuredClone(world);
    missing.events=missing.events.filter(event=>event.id!==meal.sourceEventId);
    expect(projectSectMomentScene(missing,meal)).toBeUndefined();
  });

  it('凭据中的真升级或饭堂开销被撤去，不能再从同月文字补投',()=>{
    const {world,previous,complete,meal,visible}=sceneFixture();
    const altered=structuredClone(world);
    const before=previous.cultivators.find(person=>person.id===visible.authorId);
    const actor=altered.cultivators.find(person=>person.id===visible.authorId);
    if(!before||!actor)throw new Error('Missing before-and-after pair');
    actor.realm=before.realm;
    actor.realmStage=before.realmStage;
    const report=altered.sectManagement?.latestReport;
    if(!report||!altered.sectManagement)throw new Error('Missing native meeting report');
    altered.sectManagement.latestReport={...report,rows:report.rows.map(row=>row.sourceEventId===meal.sourceEventId?{...row,effects:[]}:row)};
    expect(collectSectMomentSources(altered,previous,complete).some(source=>
      source.sourceEventId===meal.sourceEventId||source.sourceEventId===visible.sourceEventId)).toBe(false);
  });
});
