import { describe, expect, it } from 'vitest';
import { buildConfirmedShareSave, prepareShareSavePrivacy } from '../src/engine/shareSavePrivacy';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { isSectChatModelText, sectChatPostId, type SectChatModelPost, type SectChatPost, type SectChatState } from '../src/types/sectChat';
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


describe('portable model flavor is limited to public dated slots',()=>{
  it('roundtrips public model prose and strictly scoped replies, while shares keep no private chat IDs',()=>{
    const {world,own,market,privatePost,publicPost,peer}=fixture(),state=world.sectManagement!;
    const body='茶价且慢议，先掂掂秤。';
    const reply:SectChatModelPost={...market,source:'llm',id:sectChatPostId(state.sectId,world.tick,4),
      senderId:peer,text:body,replyTo:market.id};
    const first:SectChatModelPost={...publicPost,source:'llm',text:'那时我只闻一阵钟声。'};
    const chat={months:[{tick:world.tick,posts:[own,first,privatePost,market,reply]}]};
    state.chat=chat;
    const bytes=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(bytes))).toBe(bytes);
    expect(decodeEraWorldSave(bytes).sectManagement?.chat).toEqual(chat);
    const review=prepareShareSavePrivacy(world);
    expect(review.status).toBe('ready');
    const shared=buildConfirmedShareSave(world,review)!;
    expect(shared.json).toContain(body);
    expect(shared.json).not.toContain(own.id);
    expect(shared.json).not.toContain(privatePost.id);
    expect(decodeWorldSave(shared.json).sectManagement?.chat?.months[0].posts).toEqual([first,market,reply]);
  });

  it('rejects model prose in private rooms, malformed prose and later/foreign/different-fact replies',()=>{
    const {world,own,market,privatePost,publicPost,peer}=fixture(),state=world.sectManagement!;
    const reply:SectChatModelPost={...market,source:'llm',id:sectChatPostId(state.sectId,world.tick,4),
      senderId:peer,text:'茶盏尚热。',replyTo:market.id};
    const future:SectChatPost={...market,id:sectChatPostId(state.sectId,world.tick,5),senderId:privatePost.senderId};
    const greeting:SectChatPost={...publicPost,about:{kind:'room_greeting',kindOfGreeting:'jiuzhou'}};
    const wrongFact:SectChatModelPost={...publicPost,id:reply.id,source:'llm',text:'说得极是。',replyTo:greeting.id};
    const invalidText=['', ' 茶热。', '茶热。 ', '茶。\n盏。', '茶\u2028热。', '茶\u200b盏。','茶。<b>热</b>',
      '&lt;茶&gt;', '[茶](https://example.test)', 'example.test', '茶。'.repeat(21)];
    expect(isSectChatModelText('𠀀'.repeat(40))).toBe(true);
    expect(isSectChatModelText('𠀀'.repeat(41))).toBe(false);
    expect(isSectChatModelText('「却说昨日」……')).toBe(true);
    const cases:readonly (readonly SectChatPost[])[]=[
      [{...own,source:'llm',text:reply.text}],
      [{...privatePost,source:'llm',text:reply.text}],
      [market,{...reply,replyTo:reply.id}],
      [market,{...reply,replyTo:future.id},future],
      [own,market,{...reply,replyTo:own.id}],
      [publicPost,market,{...reply,replyTo:publicPost.id}],
      [greeting,wrongFact],
      [market,Object.assign({...reply},{targetLocationId:'loc-market'})],
      ...invalidText.map(text=>[market,{...reply,text}]),
    ];
    for(const posts of cases){
      state.chat={months:[{tick:world.tick,posts}]};
      expect(()=>encodeEraWorldSave(world)).toThrow(/sectManagement.chat/u);
    }
  });
});
