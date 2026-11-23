import {describe,expect,it,vi} from 'vitest';
import {availableArtifactActions} from '../src/engine/artifactEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {applySectMomentCommand,projectSectMoments,settleSectMomentsMonth} from '../src/engine/sectMoments';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {SectJobAssignment} from '../src/types/sectJobs';
import type {LLMDecisionPayload,WorldEvent,WorldState} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'今月且调息。'};
const breakthrough:LLMDecisionPayload={chosenAction:'BREAKTHROUGH',innerMonologue:'今夕闭门，且试冲关。'};
const forge:LLMDecisionPayload={chosenAction:'FORGE_ARTIFACT',forgeTier:'法器',innerMonologue:'借炉铸器。'};
const travel:LLMDecisionPayload={chosenAction:'EXPLORE',targetLocationId:'loc-market',innerMonologue:'循旧路去坊市看看。'};
const findActor=(world:WorldState,id:string)=>{
  const match=world.cultivators.find(actor=>actor.id===id);
  if(!match)throw new Error('Missing native actor '+id);
  return match;
};
function fixture(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!world?.sectManagement)throw new Error('Missing managed sect');
  const {leaderId,foundingDiscipleIds,homeSiteId}=world.sectManagement;
  const [cook,traveler,breaker]=foundingDiscipleIds;
  const visitor=world.cultivators.find(actor=>actor.alive&&actor.sectId!==world.sectManagement?.sectId&&actor.id==='npc-1');
  if(!visitor)throw new Error('Missing native visiting witness');
  const market=world.locations.find(site=>site.id==='loc-market');
  const tile=market&&terrainTileAt(world,market.x,market.y);
  if(!tile)throw new Error('Missing native travel destination');
  findActor(world,traveler).exploredTileIds.push(tile.id);
  const practitioner=findActor(world,breaker);
  practitioner.qiProgress=100;
  findActor(world,cook).herbs.jade_leaf=2;
  visitor.locationId=homeSiteId;
  const furnace=world.locations.find(site=>site.id==='loc-danxia');
  const smith=world.cultivators.find(actor=>actor.id==='npc-4');
  if(!smith||!furnace)throw new Error('Missing native alchemist and furnace');
  smith.locationId=furnace.id;
  smith.techniqueMastery=85;
  smith.spiritStones=1_000;
  expect(availableArtifactActions(smith,world,world.tick+1)).toContainEqual({action:'FORGE_ARTIFACT',forgeTier:'法器'});
  const board:readonly SectJobAssignment[]=[{discipleId:cook,jobId:'kitchen'}];
  return {world,leaderId,cook,traveler,breaker,smith:smith.id,outsider:visitor.id,board};
}
function month(world:WorldState,overrides:Readonly<Record<string,LLMDecisionPayload>>,board?:readonly SectJobAssignment[],
    roll=.12,modelActor?:string){
  const events:WorldEvent[]=[];
  const orders=Object.fromEntries(world.cultivators.map(actor=>[actor.id,overrides[actor.id]??rest]));
  const admitted=vi.fn();
  const next=advanceWorldTick(world,orders,()=>roll,modelActor?'deferred':'utility',admitted,{
    sectJobAssignments:board,modelActors:modelActor?new Set([modelActor]):undefined,
    capturePresentation:false,onCompletedEvents:rows=>events.push(...rows),
  });
  if(modelActor)expect(admitted).toHaveBeenCalledWith(modelActor,true);
  return {next,events};
}
function book(world:WorldState){
  const feed=world.sectManagement?.moments;
  if(!feed)throw new Error('Expected native moments from the finished managed month');
  return feed;
}
function settled(){
  const source=fixture();
  const {world,breaker,smith,traveler,board}=source;
  return {...source,...month(world,{[breaker]:breakthrough,[smith]:forge,[traveler]:travel},board)};
}

describe('修仙朋友圈来自确实发生的见闻',()=>{
  it('一月内四类真实见闻各有原事件，饭堂只认入席人的私份',()=>{
    const data=settled(),{next,events,cook,leaderId,outsider,breaker,smith,traveler}=data;
    const posts=book(next).posts;
    expect(posts.map(post=>post.kind).sort()).toEqual(['artifact','breakthrough','food','travel']);
    for(const [kind,author] of [['breakthrough',breaker],['artifact',smith],['travel',traveler],['food',cook]] as const){
      const post=posts.find(row=>row.kind===kind);
      expect(post).toMatchObject({authorId:author,tick:next.tick});
      expect(events.find(event=>event.id===post?.sourceEventId)).toMatchObject({tick:next.tick,locationId:post?.siteId});
    }
    expect(findActor(next,breaker).realmStage).toBe(findActor(data.world,breaker).realmStage+1);
    expect(findActor(next,smith).artifacts.some(item=>item.id?.startsWith(`artifact-${smith}-${next.tick}-`))).toBe(true);
    expect(findActor(next,traveler).locationId).toBe('loc-market');
    const meal=posts.find(row=>row.kind==='food');
    if(!meal)throw new Error('Expected native meal');
    const mealReceipt=events.find(row=>row.id===meal.sourceEventId);
    expect(mealReceipt?.witnessScope).toBe('participants');
    expect(meal.audience).toContain(leaderId);
    expect(meal.audience).not.toContain(outsider);
    expect(meal.reactions.every(reaction=>mealReceipt?.actorIds.includes(reaction.actorId))).toBe(true);
    expect(projectSectMoments(next).posts).toHaveLength(4);
  });

  it('失败冲关、炸炉未成、未抵达的预想不成动态，并且不重投当前月份',()=>{
    const {world,breaker,smith,traveler}=fixture();
    const {next,events}=month(world,{[breaker]:breakthrough,[smith]:forge,[traveler]:{...travel,targetLocationId:'absent'}},undefined,.99);
    expect(events.some(row=>row.id===`evt-${next.tick}-${breaker}-fail`)).toBe(true);
    expect(events.some(row=>row.title==='炉火失控，炼器失败')).toBe(true);
    expect(findActor(next,traveler).locationId).toBe(findActor(world,traveler).locationId);
    expect(next.sectManagement?.moments?.posts??[]).toEqual([]);
    settleSectMomentsMonth(next,world,events);
    expect(next.sectManagement?.moments?.posts??[]).toEqual([]);

    const successful=settled();
    const before=structuredClone(book(successful.next));
    settleSectMomentsMonth(successful.next,successful.world,successful.events);
    expect(book(successful.next)).toEqual(before);
  });

  it('同月的换地假影与伪造饭局不能按贴互动',()=>{
    const {next,outsider}=settled();
    const draft=structuredClone(next);
    const forge=book(draft).posts.find(post=>post.kind==='artifact');
    const dinner=book(draft).posts.find(post=>post.kind==='food');
    if(!forge||!dinner)throw new Error('Expected native forge and meal');
    draft.events=draft.events.map(row=>row.id===forge.sourceEventId?{...row,locationId:'loc-market'}:
      row.id===dinner.sourceEventId?{...row,actorIds:[...row.actorIds,outsider]}:row);
    const view=projectSectMoments(draft).posts;
    expect(view.some(row=>row.post.id===forge.id||row.post.id===dinner.id)).toBe(false);
    expect(applySectMomentCommand(draft,{kind:'like',postId:forge.id})).toBe(false);
    expect(applySectMomentCommand(draft,{kind:'comment',postId:dinner.id,text:'未受邀。'})).toBe(false);
    expect(book(draft)).toEqual(book(next));
  });

  it('赞、留言、屏蔽只影响本账，不能改变修为财货或已结事实',()=>{
    const {next}=settled();
    const target=book(next).posts.find(post=>post.kind==='artifact');
    if(!target)throw new Error('Expected native public forge');
    const {sectManagement,...underlying}=next;
    const raw=structuredClone(underlying);
    const initialCount=projectSectMoments(next).posts.find(row=>row.post.id===target.id)?.likes??0;
    const read=()=>projectSectMoments(next).posts.find(row=>row.post.id===target.id);
    expect(applySectMomentCommand(next,{kind:'like',postId:target.id})).toBe(true);
    expect(read()?.likes).toBe(initialCount+1);
    expect(applySectMomentCommand(next,{kind:'like',postId:target.id})).toBe(true);
    expect(read()?.likes).toBe(initialCount);
    expect(applySectMomentCommand(next,{kind:'comment',postId:'unknown',text:'问安。'})).toBe(false);
    expect(applySectMomentCommand(next,{kind:'comment',postId:target.id,text:'长'.repeat(81)})).toBe(false);
    for(const text of ['炉火可有先兆？','想来器成炉也凉。','好器物，贺喜。']){
      expect(applySectMomentCommand(next,{kind:'comment',postId:target.id,text})).toBe(true);
      expect(read()?.comments.some(comment=>comment.text===text)).toBe(true);
    }
    expect(applySectMomentCommand(next,{kind:'comment',postId:target.id,text:'第四条。'})).toBe(false);
    expect(applySectMomentCommand(next,{kind:'block',authorId:target.authorId})).toBe(true);
    expect(read()).toBeUndefined();
    expect(applySectMomentCommand(next,{kind:'like',postId:target.id})).toBe(false);
    expect(applySectMomentCommand(next,{kind:'unblock',authorId:target.authorId})).toBe(true);
    expect(read()?.comments.some(comment=>comment.text==='好器物，贺喜。')).toBe(true);
    const {sectManagement:latest,...result}=next;
    expect(result).toEqual(raw);
    expect(latest?.latestReport).toEqual(sectManagement?.latestReport);
  });

  it('真实 JSON 模型决策走同一食事与破境朋友圈，不发送饭堂内容',async()=>{
    const {world,breaker,board}=fixture();
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({
      choices:[{message:{content:JSON.stringify(breakthrough)}}],
    })));
    vi.stubGlobal('fetch',fetchMock);
    llmScheduler.resetTickBudget();
    try{
      const reply=await requestCultivatorLLMDecision(findActor(world,breaker),world,{
        enabled:true,apiBaseUrl:'https://moments-stub.invalid/v1',apiKey:'fixture',model:'fixture',
      },world.tick+1);
      expect(fetchMock).toHaveBeenCalledOnce();
      if(reply?.chosenAction!=='BREAKTHROUGH')throw new Error('Expected mock response to pass the real decision schema');
      const offline=month(world,{[breaker]:breakthrough},board).next;
      const cognitive=month(world,{[breaker]:reply},board,.12,breaker).next;
      expect(book(cognitive)).toEqual(book(offline));
      expect(book(cognitive).posts.map(post=>post.kind).sort()).toEqual(['breakthrough','food']);
      expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('饭堂开了一灶');
    }finally{
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
  });
});
