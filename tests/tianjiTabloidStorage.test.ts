import {describe,expect,it} from 'vitest';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {buildConfirmedShareSave,prepareShareSavePrivacy} from '../src/engine/shareSavePrivacy';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {applySectPlayerChat} from '../src/engine/sectPlayerChat';
import {sectPlayerChatPostId} from '../src/types/sectPlayerChat';
import {type TianjiTabloidIssue} from '../src/types/tianjiGazette';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const start=()=>createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'且看山云。'};
const next=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,rest])),
  ()=>.2,'utility',undefined,{captureTrace:false,capturePresentation:false});
function quarter(world:WorldState){
  for(let count=0;count<4;count++){
    world=next(world);
    if(world.month%3===0)return world;
  }
  throw Error('Expected completed quarter');
}
function latest(world:WorldState):TianjiTabloidIssue{
  const issue=world.tianjiGazette?.quarterlies?.at(-1);
  if(!issue)throw Error('Expected a published quarterly issue');
  return issue;
}
function reject(world:WorldState,edit:(issue:TianjiTabloidIssue,world:WorldState)=>void,field:RegExp){
  const changed=structuredClone(world);
  edit(latest(changed),changed);
  expect(()=>encodeEraWorldSave(changed)).toThrow(field);
}

describe('portable Jianghu tabloid proof',()=>{
  it('keeps a legacy absent journal byte-identical and roundtrips a new managed quarterly',()=>{
    const old=encodeEraWorldSave(start());
    expect(decodeEraWorldSave(old).tianjiGazette).toBeUndefined();
    expect(encodeEraWorldSave(decodeEraWorldSave(old))).toBe(old);
    const world=quarter(start()),bytes=encodeEraWorldSave(world),page=latest(world);
    expect(page).toMatchObject({id:`tabloid-${world.tick}`,tick:world.tick,month:world.month});
    expect(encodeEraWorldSave(decodeEraWorldSave(bytes))).toBe(bytes);
    reject(world,issue=>{issue.month=6;},/tianjiGazette.quarterly/u);
    reject(world,issue=>{issue.id='a-page-from-the-future';},/tianjiGazette.quarterly/u);
    reject(world,(issue,changed)=>{changed.tianjiGazette!.quarterlies!.push(issue);},/tianjiGazette.quarterly/u);
    reject(world,issue=>{Object.assign(issue,{rumorText:'这掌门昨夜驾鹤了。'});},/rumorText/u);
  });

  it('preserves a genuine public recruitment notice across a share and rejects fabricated columns',()=>{
    const ready=next(start()),postedTick=ready.tick,postId=sectPlayerChatPostId(postedTick,0);
    const initial=applySectPlayerChat(ready,{identity:'leader',roomId:'jiuzhou',
      body:{kind:'quick',preset:'recruit_ad',optionId:'recruit_ad'}});
    expect(initial.sectManagement?.playerChat?.months[0]?.posts[0]?.id).toBe(postId);
    const world=quarter(initial),page=latest(world),sponsor=world.sectManagement!;
    expect(page.advertisement).toMatchObject({postId,postedTick,sectId:sponsor.sectId,siteId:sponsor.homeSiteId});
    const review=prepareShareSavePrivacy(world);
    expect(review).toMatchObject({status:'ready',protectedStateVerified:true});
    expect(decodeWorldSave(buildConfirmedShareSave(world,review)!.json).tianjiGazette?.quarterlies).toEqual(world.tianjiGazette?.quarterlies);
    reject(world,issue=>{issue.advertisement!.postId=sectPlayerChatPostId(postedTick,1);},/tianjiGazette.quarterly.advertisement/u);
    const [first,second]=world.cultivators.map(actor=>actor.id).filter(id=>id!==sponsor.leaderId).sort();
    const fake={sourceEventId:`evt-${page.tick}-${first}-alchemy-burst-golden`,tick:page.tick,year:page.year,month:page.month,siteId:sponsor.homeSiteId};
    reject(world,issue=>{issue.hotTopic={...fake,roomId:'jiuzhou',speakerIds:[first,second],speakerCount:2};},/tianjiGazette.quarterly.hotTopic/u);
    reject(world,issue=>{issue.embarrassment={...fake,actorId:first};},/tianjiGazette.quarterly.embarrassment/u);
    reject(world,issue=>{issue.challenge={...fake,challengeId:`sect-challenge-inbound-${page.tick}`};},/tianjiGazette.quarterly.challenge/u);
  });
});
