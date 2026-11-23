import { describe, expect, it } from 'vitest';
import { buildConfirmedShareSave, prepareShareSavePrivacy } from '../src/engine/shareSavePrivacy';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { sectChatPostId, type SectChatPost, type SectChatState } from '../src/types/sectChat';
import { sectRecurringEventId } from '../src/types/sectRecurring';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'先缓一口气。'};
const start=()=>createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
function fixture(){
  const before=start(),old=before.sectManagement!, [sender,peer]=old.foundingDiscipleIds;
  const orders=Object.fromEntries(before.cultivators.map(actor=>[actor.id,rest]));
  orders[sender]={chosenAction:'SOCIALIZE',targetCultivatorId:peer,innerMonologue:'与同门坐一会。'};
  const world:WorldState=advanceWorldTick(before,orders,undefined,'utility');
  const state=world.sectManagement!,tick=world.tick;
  const visit=state.recurring?.encounters.find(row=>row.role==='wang'&&row.tick===tick);
  const spoken=world.events.find(event=>event.id===`evt-${tick}-${sender}-social`);
  if(!visit||!spoken||spoken.witnessScope!==undefined)throw new Error('Expected a real public conversation and Wang private visit');
  const post=(index:number,fields:Pick<SectChatPost,'roomId'|'senderId'|'about'|'audience'>):SectChatPost=>
    ({source:'template',tick,id:sectChatPostId(state.sectId,tick,index),variant:0,...fields});
  const own=post(0,{roomId:'own',senderId:sender,about:{kind:'room_greeting',kindOfGreeting:'own'},audience:[sender,state.leaderId]});
  const publicPost=post(1,{roomId:'jiuzhou',senderId:sender,about:{kind:'public_event',eventId:spoken.id,eventTick:tick,knowledge:'witness'}});
  const privatePost=post(2,{roomId:'leaders',senderId:visit.entityId,about:{kind:'recurring',role:'wang',outcome:visit.outcome},
    audience:[visit.entityId,state.leaderId]});
  const market=post(3,{roomId:'market',senderId:sender,about:{kind:'room_greeting',kindOfGreeting:'market'}});
  const chat={months:[{tick,posts:[own,publicPost,privatePost,market]}]} satisfies SectChatState;
  state.chat=chat;
  return {world,chat,own,publicPost,privatePost,market,visitorEventId:sectRecurringEventId(tick,state.sectId,'wang'),peer};
}

describe('portable sect chat and share transcript redaction',()=>{
  it('keeps player saves byte exact, strips only whole private posts, keeps original public indices',()=>{
    const legacy=encodeEraWorldSave(start());
    expect(decodeEraWorldSave(legacy).sectManagement?.chat).toBeUndefined();
    expect(encodeEraWorldSave(decodeEraWorldSave(legacy))).toBe(legacy);
    const {world,chat,publicPost,market}=fixture();
    const raw=encodeEraWorldSave(world),roundTrip=decodeEraWorldSave(raw);
    expect(roundTrip.sectManagement?.chat).toEqual(chat);
    expect(encodeEraWorldSave(roundTrip)).toBe(raw);
    const review=prepareShareSavePrivacy(world);
    expect(review).toMatchObject({status:'ready',protectedStateVerified:true,counts:{privateSectChatPosts:2}});
    const exported=buildConfirmedShareSave(world,review);
    expect(exported).toBeDefined();
    const shared=decodeWorldSave(exported!.json);
    expect(shared.sectManagement?.chat).toEqual({months:[{tick:world.tick,posts:[publicPost,market]}]});
    expect(world.sectManagement?.chat).toBe(chat);
    expect(prepareShareSavePrivacy(shared).counts.privateSectChatPosts).toBe(0);
  });

  it('allows dropping an all-private chat without creating a new month',()=>{
    const {world,own,privatePost}=fixture();
    world.sectManagement!.chat={months:[{tick:world.tick,posts:[own,privatePost]}]};
    const review=prepareShareSavePrivacy(world);
    const exported=buildConfirmedShareSave(world,review);
    expect(exported&&decodeWorldSave(exported.json).sectManagement?.chat).toBeUndefined();
    expect(world.sectManagement?.chat?.months).toHaveLength(1);
  });


  it('roundtrips the live bounded monthly ledger after sources and recipients move on',()=>{
    let world=start();
    for(let i=0;i<16;i++){
      const orders=Object.fromEntries(world.cultivators.map(actor=>[actor.id,rest]));
      world=advanceWorldTick(world,orders,undefined,'utility',undefined,{captureTrace:false,capturePresentation:false});
      const bytes=encodeEraWorldSave(world);
      expect(encodeEraWorldSave(decodeEraWorldSave(bytes))).toBe(bytes);
    }
    const months=world.sectManagement?.chat?.months;
    expect(months?.length).toBeGreaterThan(0);
    expect(months?.length).toBeLessThanOrEqual(12);
  });

  it('rejects forged authors, duplicate/reordered ordinals, wrong dates, and no private event is promoted nationally',()=>{
    const {world,own,publicPost,privatePost,visitorEventId,peer}=fixture(),state=world.sectManagement!;
    for(const posts of [
      [{...own,senderId:'unknown',audience:['unknown',state.leaderId]}],
      [{...own,audience:[own.senderId,peer]}],
      [{...own,audience:undefined}],
      [{...own,audience:[state.leaderId,own.senderId]}],
      [{...own,tick:world.tick+1}],
      [{...own,text:'任意文本'}],
      [privatePost,publicPost],
      [own,own],
      [{...publicPost,senderId:privatePost.senderId}],
      [{...publicPost,senderId:state.leaderId,about:{kind:'public_event',eventTick:world.tick,eventId:visitorEventId,knowledge:'witness'}}],
      [{...privatePost,roomId:'jiuzhou',audience:undefined}],
      [{...privatePost,about:{kind:'recurring',role:'wang',outcome:'market_remark'}}],
    ]){
      state.chat={months:[{tick:world.tick,posts:posts as readonly SectChatPost[]}]};
      expect(()=>encodeEraWorldSave(world)).toThrow(/sectManagement.chat/u);
    }
  });
});
