import {describe,expect,it} from 'vitest';
import {projectSectChat,settleSectChatMonth} from '../src/engine/sectChat';
import {quoteSectChatModelMonth,SECT_CHAT_MODEL_BATCH_LIMIT} from '../src/engine/sectChatModelScope';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {sectPairDramaEventId} from '../src/types/sectPairDrama';
import type {WorldEvent} from '../src/types/world';
import type {SectChatPost} from '../src/types/sectChat';

function fixture(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  const managed=world?.sectManagement;
  if(!world||!managed)throw new Error('Expected a founded sect');
  const previous=structuredClone(world);
  world.tick++;
  world.month++;
  const people=managed.foundingDiscipleIds.flatMap(id=>world.cultivators.filter(row=>row.id===id));
  return {world,managed,previous,people};
}

describe('大模型传音：同一公开话题的演员席位',()=>{
  it('平月也有三位有话可说的公开发言，定额、房间及话题可复现',()=>{
    const {world,previous,managed}=fixture();
    settleSectChatMonth(world,previous,[]);
    const manifest=quoteSectChatModelMonth(world);
    expect(manifest.length).toBeLessThanOrEqual(SECT_CHAT_MODEL_BATCH_LIMIT);
    const slots=manifest.flatMap(batch=>batch.slots);
    expect(slots.length).toBeGreaterThanOrEqual(3);
    expect(new Set(slots.map(row=>row.senderId)).size).toBeGreaterThanOrEqual(3);
    expect(manifest.every(batch=>batch.trigger===undefined&&batch.recentMessages.length===0)).toBe(true);
    expect(manifest.flatMap(row=>row.slots).every(row=>row.knowledge===undefined)).toBe(true);
    expect(quoteSectChatModelMonth(structuredClone(world))).toEqual(manifest);
    const native=managed.chat?.months.at(-1);
    expect(native?.posts.every(row=>row.source==='template')).toBe(true);
  });

  it('真正大事追加经验证的知情人，同名事件和私事不共享话题',()=>{
    const {world,previous,managed,people}=fixture();
    const [a,b,c]=people;
    a.innerMonologue='私下口诀落霞针';
    const base={tick:world.tick,month:world.month,year:world.year,title:'本月确有劫光',description:'史册私余话落霞针',category:'breakthrough'} as const;
    const skyOne:WorldEvent={...base,id:'evt-true-major-one',actorIds:[a.id,b.id]};
    const skyTwo:WorldEvent={...base,id:'evt-true-major-two',actorIds:[c.id]};
    const secret:WorldEvent={...base,id:sectPairDramaEventId(world.tick,managed.sectId),title:'众人不得知',actorIds:[a.id],witnessScope:'participants'};
    world.events.push(skyOne,skyTwo,secret);
    settleSectChatMonth(world,previous,[skyOne,skyTwo,secret]);
    const native=managed.chat?.months.at(-1);
    if(!native)throw new Error('Missing native posts');
    const majors=native.posts.filter(row=>row.about.kind==='public_event');
    expect(majors).toHaveLength(3);
    expect(majors.every(row=>row.roomId==='jiuzhou')).toBe(true);
    const manifest=quoteSectChatModelMonth(world);
    expect(JSON.stringify(manifest)).not.toMatch(/落霞针|众人不得知|true-major/);
    const topics=manifest.filter(row=>row.trigger?.title===skyOne.title);
    expect(topics.map(row=>row.slots.length).sort()).toEqual([1,2]);
    expect(topics.every(row=>row.slots.every(slot=>slot.knowledge==='witness'))).toBe(true);
  });

  it('只有保有真凭据才显示模型句和同题回复，过期时恢复离线安全提示',()=>{
    const {world,previous,managed,people}=fixture();
    const event:WorldEvent={id:'evt-verified-scene',tick:world.tick,month:world.month,year:world.year,
      title:'剑光越长亭',description:'在场的人听见一声响。',actorIds:people.slice(0,2).map(row=>row.id),category:'combat'};
    world.events.push(event);
    settleSectChatMonth(world,previous,[event]);
    const native=managed.chat?.months.at(-1);
    if(!native)throw new Error('Missing native chat');
    const prior=native.posts.find(row=>row.about.kind==='public_event'&&row.about.eventId===event.id);
    const later=native.posts.find(row=>row.about.kind==='public_event'&&row.about.eventId===event.id&&row.id!==prior?.id);
    if(!prior||!later)throw new Error('Expected two different witnesses');
    const line:SectChatPost={...later,source:'llm',text:'道友好眼力，此事我也看见了。',replyTo:prior.id};
    managed.chat={months:[{...native,posts:native.posts.map(row=>row.id===line.id?line:row)}]};
    const read=()=>projectSectChat(world).flatMap(room=>room.posts).find(row=>row.id===line.id);
    expect(read()).toMatchObject({source:'llm',text:line.text,replyTo:prior.id,sourceEventId:event.id});
    world.events=world.events.filter(row=>row.id!==event.id);
    world.tick++;
    expect(read()).toMatchObject({source:'template',text:'这条旧讯已收卷。'});
    expect(read()?.replyTo).toBeUndefined();
    expect(read()?.sourceEventId).toBeUndefined();
  });
});
