import {describe,expect,it} from 'vitest';
import {applySectPlayerChat} from '../src/engine/sectPlayerChat';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {collectTabloidSocial,isTabloidAdvertisementProven,isTabloidHotspotProven} from '../src/engine/tianjiTabloidSocial';
import {sectChatPostId,type SectChatPost} from '../src/types/sectChat';
import type {WorldEvent} from '../src/types/world';

function fixture(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  const managed=world?.sectManagement;
  if(!world||!managed)throw new Error('Expected managed sect.');
  return {world,managed};
}

describe('小报群聊与招新来源',()=>{
  it('只统计同一公开群聊的确证发言者，不重计、不转发密语或模型生成的原文',()=>{
    const {world,managed}=fixture();
    const voices=world.cultivators.filter(actor=>actor.alive&&actor.id!==managed.leaderId).slice(0,6).map(actor=>actor.id);
    world.tick++; world.month++;
    const {tick,year,month}=world;
    const event:WorldEvent={id:'evt-verified-tabloid-assembly',tick,year,month,category:'diplomacy',
      title:'众人核对坊市告示',description:'坊市告示。',actorIds:voices.slice(0,5),locationId:'loc-market'};
    world.events.push(event);
    const post=(index:number,senderId:string,roomId:SectChatPost['roomId']='jiuzhou'):SectChatPost=>({
      id:sectChatPostId(managed.sectId,tick,index),tick,roomId,senderId,source:'template',variant:0,
      about:{kind:'public_event',eventId:event.id,eventTick:tick,knowledge:'witness'},
      ...(roomId==='own'?{audience:[senderId,managed.leaderId]}:{})
    });
    const original=post(0,voices[0]);
    const entries=[original,...voices.slice(1,5).map((id,index)=>post(index+1,id)),
      post(5,voices[0]),post(6,voices[5]),post(7,voices[0],'own'),post(8,voices[1],'market')];
    managed.chat={months:[{tick,posts:entries}]};
    const frozen=collectTabloidSocial(world,tick,tick);
    expect(frozen).toEqual({hotspot:{sourceEventId:event.id,tick,year,month,siteId:'loc-market',roomId:'jiuzhou',
      speakerCount:5,speakerIds:voices.slice(0,5).sort().slice(0,4)}});
    managed.chat={months:[{tick,posts:[{...original,source:'llm',text:'不可信的夸张编造'},...entries.slice(1)]}]};
    expect(collectTabloidSocial(world,tick,tick)).toEqual(frozen);
    const topic=frozen.hotspot;
    if(!topic)throw new Error('Expected certified hotspot.');
    expect(isTabloidHotspotProven(world,topic,tick,tick)).toBe(true);
    expect(isTabloidHotspotProven(world,{...topic,speakerCount:6},tick,tick)).toBe(false);
    const venue=world.locations.find(row=>row.id==='loc-market');
    if(!venue)throw new Error('Expected native public venue.');
    for(const type of ['secret_realm','abyss'] as const){
      venue.type=type;
      expect(collectTabloidSocial(world,tick,tick)).toEqual({});
      expect(isTabloidHotspotProven(world,topic,tick,tick)).toBe(false);
    }
    venue.type='market';
    world.events.push({...event,witnessScope:'participants'});
    expect(collectTabloidSocial(world,tick,tick)).toEqual({});
    expect(isTabloidHotspotProven(world,topic,tick,tick)).toBe(false);
  });

  it('只转载实际公频快捷掌门招新，结算助力自然消失后旧报仍可引用原存根',()=>{
    const {world}=fixture();
    const tick=world.tick;
    const publish=(identity:'leader'|'passing_senior',kind:'quick'|'free')=>applySectPlayerChat(world,{
      roomId:'jiuzhou',identity,body:kind==='quick'?{kind,preset:'recruit_ad'}:{kind,text:'来我门下修行。'}
    },'recruit_ad');
    expect(collectTabloidSocial(publish('passing_senior','quick'),tick,tick)).toEqual({});
    expect(collectTabloidSocial(publish('leader','free'),tick,tick)).toEqual({});
    const publicNotice=publish('leader','quick');
    const advertisement=collectTabloidSocial(publicNotice,tick,tick).advertisement;
    if(!advertisement||!publicNotice.sectManagement?.playerChat)throw new Error('Expected real leader advertisement.');
    expect(isTabloidAdvertisementProven(publicNotice,advertisement)).toBe(true);
    expect(isTabloidAdvertisementProven(publicNotice,{...advertisement,siteId:'loc-market'})).toBe(false);
    const {recruitAd:_expired,...archived}=publicNotice.sectManagement.playerChat;
    publicNotice.sectManagement.playerChat=archived;
    expect(isTabloidAdvertisementProven(publicNotice,advertisement)).toBe(false);
    publicNotice.tick+=2;
    expect(isTabloidAdvertisementProven(publicNotice,advertisement)).toBe(true);
  });
});
