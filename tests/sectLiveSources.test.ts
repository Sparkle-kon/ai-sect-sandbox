import {describe,expect,it,vi} from 'vitest';
import {resolveAlchemy} from '../src/engine/alchemyEngine';
import {collectSectLiveSources,knowsSectLiveSource,resolveSectLiveSource} from '../src/engine/sectLiveSources';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldEvent} from '../src/types/world';

function managed(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!world?.sectManagement)throw new Error('Managed fixture missing');
  return world;
}

function lightning(){
  const previous=managed(),leader=previous.cultivators.find(row=>row.id===previous.sectManagement?.leaderId);
  if(!leader)throw new Error('Managed leader missing');
  leader.realm='筑基';leader.realmStage=9;leader.qiProgress=100;
  const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'稍歇。'};
  const orders=Object.fromEntries(previous.cultivators.map(actor=>[actor.id,rest]));
  orders[leader.id]={chosenAction:'BREAKTHROUGH',innerMonologue:'以此身引劫。'};
  const batch:WorldEvent[]=[];
  const world=advanceWorldTick(previous,orders,()=>.2,'utility',undefined,{
    capturePresentation:false,onCompletedEvents:events=>batch.push(...events),
  });
  const source=collectSectLiveSources(world,previous,batch).find(row=>row.kind==='tribulation');
  const event=source&&resolveSectLiveSource(world,source);
  if(!source||!event)throw new Error('Native lightning source missing');
  return {world,previous,batch,source,event,leader};
}

describe('天机直播来源防混剪',()=>{
  it('只开真正封存的一期：重复、换址、异谱与私份不入镜',()=>{
    const {world,previous,batch,source,event}=lightning();
    expect(resolveSectLiveSource(world,{...source,siteId:'loc-market'})).toBeUndefined();
    expect(collectSectLiveSources(world,previous,[...batch,event])).not.toContainEqual(source);
    const privateCopy=structuredClone(world);
    const sealed={...event,witnessScope:'participants' as const};
    privateCopy.events=privateCopy.events.map(row=>row.id===sealed.id?sealed:row);
    expect(resolveSectLiveSource(privateCopy,source)).toBeUndefined();
    const former=structuredClone(previous);former.random.seed++;
    expect(collectSectLiveSources(world,former,batch)).toEqual([]);
  });

  it('当前同处不能代替当月亲见的人；只核对准确见闻',()=>{
    const {world,source,event,leader}=lightning();
    const sameVenue=world.cultivators.find(row=>row.id!==leader.id&&knowsSectLiveSource(row,source,event));
    if(!sameVenue)throw new Error('Native witness missing');
    const late={...sameVenue,locationId:source.siteId,rumors:[]};
    expect(knowsSectLiveSource(late,source,event)).toBe(false);
    expect(knowsSectLiveSource(sameVenue,source,event)).toBe(true);
    const redacted={...sameVenue,rumors:sameVenue.rumors.map(row=>({...row,witnessScope:'participants' as const}))};
    expect(knowsSectLiveSource(redacted,source,event)).toBe(false);
  });

  it('极端开炉失败只消耗原一骰，若只剩一息仍保持普通失败',()=>{
    const world=managed();
    const actor=world.cultivators.find(row=>row.id==='npc-5');
    if(!actor)throw new Error('Missing native alchemist');
    actor.locationId='loc-danxia';actor.hp=2;actor.herbs.jade_leaf=10;actor.herbs.star_bloom=10;actor.spiritStones=200;
    const before=structuredClone(world),rng=vi.fn(()=>.999);
    const order:LLMDecisionPayload={chosenAction:'BREW_PILL',targetPillId:'golden',innerMonologue:'依旧法开炉。'};
    const burst=resolveAlchemy(world,actor,order,rng);
    expect(rng).toHaveBeenCalledOnce();
    expect(burst?.id).toBe(`evt-${world.tick}-${actor.id}-alchemy-burst-golden`);
    expect(burst?.damage).toEqual([{cultivatorId:actor.id,amount:1}]);
    expect(actor.hp).toBe(1);
    expect(actor.alive).toBe(true);
    const fragile=before.cultivators.find(row=>row.id===actor.id)!;
    fragile.hp=1;
    const normal=resolveAlchemy(before,fragile,order,()=>.999);
    expect(normal?.id).toBe(`evt-${before.tick}-${actor.id}-alchemy`);
    expect(normal?.damage).toBeUndefined();
    expect(fragile.hp).toBe(1);
  });
});
