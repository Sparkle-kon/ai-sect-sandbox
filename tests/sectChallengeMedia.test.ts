import {describe,expect,it} from 'vitest';
import {projectSectLiveScene} from '../src/components/sectLiveScene';
import {matchSectChallengeResult} from '../src/engine/sectChallengeProof';
import {requestSectChallenge} from '../src/engine/sectChallenges';
import {projectSectChat} from '../src/engine/sectChat';
import {quoteSectChatModelMonth} from '../src/engine/sectChatModelScope';
import {projectSectLive} from '../src/engine/sectLive';
import {collectSectLiveSources,resolveSectLiveSource} from '../src/engine/sectLiveSources';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {starterSectIdentity} from '../src/types/sectManagement';
import {sectRecurringIdentity} from '../src/types/sectRecurring';
import type {LLMDecisionPayload,WorldEvent,WorldState} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'清闲一月。'};
function turn(world:WorldState){
  const completed:WorldEvent[]=[];
  const next=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,rest])),()=>.2,'utility',undefined,{
    capturePresentation:false,onCompletedEvents:events=>completed.push(...events),
  });
  return {next,completed};
}
function match(){
  const initial=createManagedSectWorld(13071,'classic','drunken-sword-hermitage',0);
  if(!initial)throw new Error('Expected an actual starter sect');
  const {next:opened}=turn(initial);
  const managed=opened.sectManagement;
  if(!managed)throw new Error('Expected management');
  const ids=sectRecurringIdentity(managed.sectId,starterSectIdentity(opened.random.seed,managed.starterId,managed.draw).creditorId);
  const actor=opened.cultivators.find(row=>row.id===managed.foundingDiscipleIds[1]);
  const site=opened.locations.find(row=>row.id===ids.rivalSiteId);
  const tile=site&&terrainTileAt(opened,site.x,site.y);
  if(!actor||!tile)throw new Error('Expected actual challenger and destination');
  if(!actor.exploredTileIds.includes(tile.id))actor.exploredTileIds.push(tile.id);
  if(!requestSectChallenge(opened,actor.id,ids.rivalSectId))throw new Error('Expected eligible challenge');
  const {next:before}=turn(opened);
  const {next,completed}=turn(before);
  const result=next.sectManagement?.challenges?.history.at(-1);
  if(result?.outcome!=='completed')throw new Error('Expected completed gate bout');
  const event=completed.find(row=>row.id===result.eventId);
  const show=projectSectLive(next).shows.find(row=>row.show.sourceEventId===result.eventId)?.show;
  if(!event||!show)throw new Error('Expected supported duel broadcast');
  return {opened,before,next,completed,result,event,show};
}

describe('山门踢馆的擂台、群聊与直播共用真胜负',()=>{
  it('不仅有直播题名，还在擂台与群聊显示原胜者，模型不覆盖这条比分',()=>{
    const {next,result,show}=match();
    const winner=next.cultivators.find(row=>row.id===result.winnerId);
    if(!winner)throw new Error('Expected actual winner');
    expect(projectSectLiveScene(next,show)).toMatchObject({kind:'arena',frame:{kind:'sect_challenge',
      outcome:result.winnerId===result.challengerId?'left':'right',damages:[{
        target:result.loserId===result.challengerId?'left':'right',amount:result.injury,
      }]}});
    const posts=projectSectChat(next).flatMap(room=>room.posts).filter(row=>row.sourceEventId===result.eventId);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every(post=>post.text.includes(winner.name))).toBe(true);
    const quoted=quoteSectChatModelMonth(next).flatMap(batch=>batch.slots.map(slot=>slot.postId));
    expect(posts.some(post=>quoted.includes(post.id))).toBe(false);
  });

  it('来帖与途中没有演出，原事件被撤下或私有化后也不能借旧稿重播',()=>{
    const {opened,before,next,completed,event,result,show}=match();
    expect(projectSectLive(opened).shows.some(row=>row.show.kind==='sect_challenge')).toBe(false);
    expect(projectSectLive(before).shows.some(row=>row.show.kind==='sect_challenge')).toBe(false);
    const missing=structuredClone(next);
    if(!missing.sectManagement?.challenges)throw new Error('Expected original history');
    missing.sectManagement.challenges={...missing.sectManagement.challenges,history:[]};
    expect(matchSectChallengeResult(missing,event)).toBeUndefined();
    expect(resolveSectLiveSource(missing,show)).toBeUndefined();
    expect(projectSectLiveScene(missing,show)).toBeUndefined();
    expect(projectSectChat(missing).some(room=>room.posts.some(post=>post.sourceEventId===result.eventId))).toBe(false);
    expect(collectSectLiveSources(missing,before,completed).some(row=>row.sourceEventId===result.eventId)).toBe(false);
    const sealed=structuredClone(next);
    sealed.events=sealed.events.map(row=>row.id===event.id?{...row,witnessScope:'participants'}:row);
    expect(projectSectLiveScene(sealed,show)).toBeUndefined();
  });
});
