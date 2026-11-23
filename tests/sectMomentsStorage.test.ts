import {describe,expect,it} from 'vitest';
import {buildConfirmedShareSave,prepareShareSavePrivacy} from '../src/engine/shareSavePrivacy';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {isSectMomentComment,type SectMomentPost} from '../src/types/sectMoments';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候一月。'};
const start=()=>createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
function month(world:WorldState,orders:Readonly<Record<string,LLMDecisionPayload>>={},cook?:string){
  const choices=Object.fromEntries(world.cultivators.map(actor=>[actor.id,orders[actor.id]??rest]));
  return advanceWorldTick(world,choices,()=>.12,'utility',undefined,{
    sectJobAssignments:cook?[{discipleId:cook,jobId:'kitchen'}]:undefined,
    captureTrace:false,capturePresentation:false,
  });
}
function fixture(){
  const beginning=start(),[cook,breaker]=beginning.sectManagement!.foundingDiscipleIds;
  beginning.cultivators.find(actor=>actor.id===breaker)!.qiProgress=100;
  beginning.cultivators.find(actor=>actor.id===cook)!.herbs.jade_leaf=2;
  const world=month(beginning,{[breaker]:{chosenAction:'BREAKTHROUGH',innerMonologue:'闭目叩关。'}},cook);
  const management=world.sectManagement!,moments=management.moments!;
  const meal=moments.posts.find(post=>post.kind==='food');
  const breakthrough=moments.posts.find(post=>post.kind==='breakthrough');
  if(!meal||!breakthrough)throw new Error('Expected an actual performed kitchen order and successful breakthrough');
  return {world,management,meal,breakthrough};
}

describe('portable moments and share projection',()=>{
  it('keeps old save bytes and preserves public ratios while never sharing the private card or block list',()=>{
    const legacy=encodeEraWorldSave(start());
    expect(decodeEraWorldSave(legacy).sectManagement?.moments).toBeUndefined();
    expect(encodeEraWorldSave(decodeEraWorldSave(legacy))).toBe(legacy);
    const {world,management,meal,breakthrough}=fixture();
    const secret={...meal,playerComments:['这句话只给同桌听。']};
    const publicPost={...breakthrough,playerLiked:true as const,playerComments:['恭喜道友破关。']};
    const posts=management.moments!.posts.map(row=>row===meal?secret:row===breakthrough?publicPost:row);
    const blocked=['npc-4'];
    management.moments={posts,blockedAuthorIds:blocked};
    const full=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(full))).toBe(full);
    const review=prepareShareSavePrivacy(world);
    expect(review).toMatchObject({status:'ready',protectedStateVerified:true,counts:{privateSectMomentsPosts:1,privateSectMomentsBlocks:1}});
    const exported=buildConfirmedShareSave(world,review);
    expect(exported).toBeDefined();
    expect(exported!.json).not.toContain(secret.id);
    expect(exported!.json).not.toContain('这句话只给同桌听');
    expect(decodeWorldSave(exported!.json).sectManagement?.moments)
      .toEqual({posts:posts.filter(row=>row!==secret)});
    expect(encodeEraWorldSave(world)).toBe(full);
  });

  it('rejects reused native events, fresh invented receipts, forged audience, unsupported likes and excessive comments',()=>{
    const {world,management,meal,breakthrough}=fixture();
    expect(isSectMomentComment('𠀀'.repeat(80))).toBe(true);
    expect(isSectMomentComment('𠀀'.repeat(81))).toBe(false);
    const invalid:readonly (readonly SectMomentPost[])[]=[
      [{...meal,audience:undefined}],
      [{...meal,audience:[...meal.audience!,'npc-4'].sort()}],
      [{...meal,kind:'travel',audience:undefined}],
      [{...breakthrough,id:`sect-moment-${world.tick}-4`}],
      [{...breakthrough,sourceEventId:`evt-${world.tick}-nobody-break`}],
      [{...breakthrough,reactions:[{actorId:management.leaderId,liked:true}]}],
      [{...breakthrough,playerComments:['<i>伪帖</i>']}],
      [{...breakthrough,playerComments:['一','二','三','四']}],
      [breakthrough,breakthrough],
    ];
    for(const posts of invalid){
      management.moments={posts};
      expect(()=>encodeEraWorldSave(world)).toThrow(/sectManagement.moments/u);
    }
  });

  it('omits all-private moments entirely and rejects a missing source still inside the retained hot tail',()=>{
    const {world,management,meal}=fixture();
    management.moments={posts:[meal]};
    const review=prepareShareSavePrivacy(world);
    expect(review.status).toBe('ready');
    expect(decodeWorldSave(buildConfirmedShareSave(world,review)!.json).sectManagement?.moments).toBeUndefined();
    world.events=world.events.filter(event=>event.id!==meal.sourceEventId);
    expect(()=>encodeEraWorldSave(world)).toThrow(/sectManagement.moments.source/u);
  });
});
