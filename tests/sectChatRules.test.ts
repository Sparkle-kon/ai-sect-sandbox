import {describe,expect,it} from 'vitest';
import {projectSectChat,settleSectChatMonth} from '../src/engine/sectChat';
import {witnessEvent} from '../src/engine/rumorEngine';
import {sectComicEventId} from '../src/engine/sectComedy';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {SECT_CHAT_MONTH_LIMIT,SECT_CHAT_POST_LIMIT} from '../src/types/sectChat';
import type {WorldEvent} from '../src/types/world';

function scene(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!world?.sectManagement)throw new Error('Missing managed starter');
  const previous=structuredClone(world),managed=world.sectManagement;
  const speaker=world.cultivators.find(actor=>actor.id===managed.foundingDiscipleIds[0]);
  const stranger=world.cultivators.find(actor=>actor.alive&&actor.sectId!==managed.sectId);
  if(!speaker||!stranger)throw new Error('Missing test voices');
  world.tick++;
  world.month++;
  return {world,previous,managed,speaker,stranger};
}

describe('宗门传音离线话本与封口边界',()=>{
  it('不拿坊市会员身份当见闻；同名伪传音和歧义事件皆不立题',()=>{
    const {world,previous,managed,speaker,stranger}=scene();
    const base={tick:world.tick,year:world.year,month:world.month,locationId:'loc-market',description:'交易告示',category:'diplomacy'} as const;
    const valid:WorldEvent={...base,id:'evt-test-genuine-market',title:'摊主正经挂价',actorIds:[speaker.id]};
    const unverified:WorldEvent={...base,id:'evt-test-forged-market',title:'只存在伪报里的价钱',actorIds:[]};
    const secret:WorldEvent={...base,id:'evt-test-private-bid',title:'私下问价',actorIds:[speaker.id],witnessScope:'participants'};
    const collision:WorldEvent={...base,id:'evt-test-disputed-market',title:'讹传的两幅标题',actorIds:[speaker.id]};
    world.events.push(valid,unverified,secret,collision,{...collision,title:'另一说法'});
    witnessEvent(world,secret);
    stranger.rumors.push({id:`rumor-${unverified.id}`,subject:unverified.title,originTick:world.tick,learnedTick:world.tick,
      provenance:'fabricated',hops:0,confidence:96,originEventId:unverified.id,originSourceCultivatorId:stranger.id});
    settleSectChatMonth(world,previous,[valid,unverified,secret,collision]);
    const sources=managed.chat?.months.flatMap(month=>month.posts.flatMap(post=>post.about.kind==='public_event'?[post.about.eventId]:[]));
    expect(sources).toEqual([valid.id]);
    const market=projectSectChat(world).find(room=>room.id==='market');
    expect(market?.posts).toMatchObject([{senderId:speaker.id,sourceEventId:valid.id,text:expect.stringContaining(valid.title)}]);
  });

  it('工作趣谈只进本门密语，借用安全语气不转发真实未公开结果，换门后原密语仍归原读者',()=>{
    const {world,previous,managed,speaker}=scene();
    const templateId='work-gather-lost-windfall';
    managed.comedy={moments:[{tick:world.tick,speakerId:speaker.id,templateId,effects:[],
      source:{phase:'performed',jobId:'gather',tier:'windfall',reportEventId:'evt-hidden-job'}}]};
    world.events.push({id:sectComicEventId(world.tick,managed.sectId),tick:world.tick,year:world.year,month:world.month,
      title:'宗门月末一记',description:'这一月的宗门小事已记下。',actorIds:[speaker.id],category:'diplomacy',witnessScope:'participants'});
    settleSectChatMonth(world,previous,[]);
    const own=()=>projectSectChat(world).find(room=>room.id==='own');
    const post=own()?.posts.find(row=>row.about==='comic');
    expect(post).toBeDefined();
    expect(post?.text).not.toContain('采药');
    expect(post?.sourceEventId).toBeUndefined();
    expect(managed.chat?.months[0].posts.find(row=>row.about.kind==='comic')?.audience).toEqual([speaker.id,managed.leaderId]);
    expect(projectSectChat(world).filter(room=>room.id!=='own').flatMap(room=>room.posts).some(row=>row.about==='comic')).toBe(false);
    world.tick++;
    speaker.sectId='';
    expect(own()?.posts.find(row=>row.about==='comic')).toEqual(post);
  });

  it('无合规新闻也有真实同门和坊市清谈；同月不会重复发，过一年按月清卷',()=>{
    const {world,previous,managed}=scene();
    settleSectChatMonth(world,previous,[]);
    const old=structuredClone(managed.chat);
    settleSectChatMonth(world,previous,[]);
    expect(managed.chat).toEqual(old);
    for(let i=0;i<SECT_CHAT_MONTH_LIMIT+3;i++){
      const before=structuredClone(world);
      world.tick++;
      settleSectChatMonth(world,before,[]);
    }
    expect(managed.chat?.months).toHaveLength(SECT_CHAT_MONTH_LIMIT);
    for(const month of managed.chat?.months??[]){
      expect(month.posts.length).toBeGreaterThanOrEqual(3);
      expect(month.posts.length).toBeLessThanOrEqual(SECT_CHAT_POST_LIMIT);
      expect(month.posts.every(post=>post.about.kind==='room_greeting')).toBe(true);
    }
  });
});
