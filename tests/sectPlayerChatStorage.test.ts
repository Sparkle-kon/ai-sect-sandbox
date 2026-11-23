import { describe, expect, it } from 'vitest';
import { buildConfirmedShareSave, prepareShareSavePrivacy } from '../src/engine/shareSavePrivacy';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { isSectPlayerChatText, sectPlayerChatPostId, type SectPlayerChatMonth, type SectPlayerChatPost,
  type SectPlayerChatState } from '../src/types/sectPlayerChat';

const start=()=>createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
function example(){
  const world=start(),tick=world.tick,sect=world.sectManagement!;
  const own:SectPlayerChatPost={id:sectPlayerChatPostId(tick,0),tick,roomId:'own',identity:'leader',
    body:{kind:'free',text:'只请门内弟子备茶。'},intent:{kind:'chat'}};
  const alt:SectPlayerChatPost={id:sectPlayerChatPostId(tick,1),tick,roomId:'jiuzhou',identity:'heaven_alt',
    body:{kind:'free',text:'来过廊下的只是过客。'},intent:{kind:'chat'}};
  const chief:SectPlayerChatPost={id:sectPlayerChatPostId(tick,2),tick,roomId:'jiuzhou',identity:'leader',
    body:{kind:'quick',preset:'recruit_ad'},intent:{kind:'recruit_ad'}};
  const ledger:SectPlayerChatMonth={tick,usedSlots:3,usedEffects:['recruit_ad'],posts:[own,alt,chief]};
  sect.playerChat={months:[ledger],aliases:{heaven_alt:{posts:1}},recruitAd:{postedTick:tick,targetTick:tick+1}};
  return {world,sect,tick,ledger,own,alt,chief};
}

describe('portable authored player chat',()=>{
  it('roundtrips local prose; shared copy drops both private identities’ prose but preserves all used slots and intent cooldown',()=>{
    const old=encodeEraWorldSave(start());
    expect(decodeEraWorldSave(old).sectManagement?.playerChat).toBeUndefined();
    expect(encodeEraWorldSave(decodeEraWorldSave(old))).toBe(old);
    const {world,sect,ledger,chief,own,alt}=example(),bytes=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(bytes))).toBe(bytes);
    const review=prepareShareSavePrivacy(world);
    expect(review).toMatchObject({status:'ready',protectedStateVerified:true,counts:{privateSectPlayerChatPosts:2,privateSectPlayerChatAliases:1}});
    const shared=buildConfirmedShareSave(world,review)!;
    expect(shared.json).not.toContain(own.id);
    expect(shared.json).not.toContain(alt.id);
    expect(shared.json).not.toContain('heaven_alt');
    expect(shared.json).not.toContain('只请门内弟子');
    expect(shared.json).not.toContain('来过廊下的只是过客');
    expect(decodeWorldSave(shared.json).sectManagement?.playerChat).toEqual({...sect.playerChat,aliases:{},months:[{...ledger,posts:[chief]}]});
  });

  it('rejects malformed chronology, fabricated cooldown or alias bookkeeping, authority escalation, and nonplain prose',()=>{
    const {world,sect,tick,ledger,chief,own,alt}=example();
    const state=sect.playerChat!;
    const monthly=(month:Partial<SectPlayerChatMonth>):SectPlayerChatState=>({...state,months:[{...ledger,...month}]});
    const posts=(...messages:SectPlayerChatPost[])=>monthly({posts:messages});
    expect(isSectPlayerChatText('𠀀'.repeat(120))).toBe(true);
    expect(isSectPlayerChatText('𠀀'.repeat(121))).toBe(false);
    for(const invalid of [
      monthly({tick:tick+1}),monthly({usedSlots:2}),monthly({usedEffects:['recruit_ad','recruit_ad']}),
      monthly({usedEffects:['recruit_ad','beg']}),
      posts(alt,own,chief),posts({...own,identity:'heaven_alt'},alt,chief),
      posts({...own,id:sectPlayerChatPostId(tick,3)},alt,chief),
      posts({...own,body:{kind:'free',text:'请见 https://example.test'}},alt,chief),
      posts(own,alt,{...chief,body:{kind:'quick',preset:'provoke'}}),
      posts(own,alt,{...chief,intent:{kind:'provoke',targetSectId:'nowhere'}}),
      {...state,aliases:{}},
      {...state,aliases:{heaven_alt:{posts:2,exposure:{tick,recognizerId:'forged',postId:alt.id}}}},
      {...state,recruitAd:{postedTick:tick,targetTick:tick+2}},
      {...state,recruitAd:{postedTick:tick-1,targetTick:tick}},
    ]){
      sect.playerChat=invalid;
      expect(()=>encodeEraWorldSave(world)).toThrow(/sectManagement.playerChat/u);
    }
  });
});
