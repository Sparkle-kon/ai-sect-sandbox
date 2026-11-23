import {describe,expect,it} from 'vitest';
import {applySectPlayerChat,prepareSectPlayerChat,projectSectPlayerChat,quoteSectPlayerChatOptions} from '../src/engine/sectPlayerChat';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {fabricateRumor} from '../src/engine/rumorEngine';
import {sectRelation} from '../src/engine/diplomacyEngine';
import type {SectPlayerChatDraft} from '../src/types/sectPlayerChat';

function setup(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  const managed=world?.sectManagement;
  const leader=world?.cultivators.find(row=>row.id===managed?.leaderId),sect=world?.sects.find(row=>row.id===managed?.sectId);
  if(!world||!managed||!leader||!sect)throw new Error('Expected canonical managed sect');
  return {world,managed,leader,sect};
}
const free=(text:string,identity:SectPlayerChatDraft['identity']='leader'):SectPlayerChatDraft=>({roomId:'jiuzhou',identity,body:{kind:'free',text}});

describe('掌门传音的选项与真实结算',()=>{
  it('自由狠话默认只是台词，假目标、过期选择与私聊马甲都不生效',()=>{
    const {world,sect}=setup();
    const text='我要带弟子去踢馆。';
    const draft=free(text,'passing_senior');
    const quote=prepareSectPlayerChat(world,draft);
    expect(quote).toMatchObject({intent:{kind:'chat'},text});
    const next=applySectPlayerChat(world,draft);
    expect(next).not.toBe(world);
    expect(next.diplomacy).toEqual(world.diplomacy);
    expect(next.sieges).toEqual(world.sieges);
    expect(next.random).toEqual(world.random);
    expect(next.sects.find(row=>row.id===sect.id)?.reputation).toBe(sect.reputation);
    expect(projectSectPlayerChat(next)).toEqual([expect.objectContaining({identity:'passing_senior',name:'路过的前辈',exposed:false,text})]);
    expect(JSON.stringify(projectSectPlayerChat(next))).not.toContain(world.sectManagement?.leaderId);
    expect(applySectPlayerChat(world,draft,'provoke:made-up')).toBe(world);
    expect(applySectPlayerChat(world,{...draft,roomId:'own'})).toBe(world);
    expect(applySectPlayerChat(next,free('迟来的话。'))).not.toBe(next);
  });

  it('快捷动作可磨坏真实邦交，却不能制造战争；同月份不得借自由文重触发',()=>{
    const {world,leader,sect}=setup();
    const [target,other]=world.sects.filter(row=>row.id!==sect.id&&row.leaderId);
    if(!target||!other)throw new Error('Missing neighboring sects');
    for(const neighbor of [target,other])world.diplomacy.push(
      {sectAId:sect.id,sectBId:neighbor.id,affinity:-43,pact:'neutral',sinceTick:world.tick});
    const choice=quoteSectPlayerChatOptions(world,'jiuzhou','leader').find(row=>row.intent.kind==='provoke'&&row.intent.targetSectId===target.id);
    if(!choice)throw new Error('Missing actual named provocation');
    const draft:SectPlayerChatDraft={roomId:'jiuzhou',identity:'leader',body:{kind:'quick',preset:'provoke',optionId:choice.id}};
    expect(prepareSectPlayerChat(world,{...draft,body:{kind:'quick',preset:'provoke'}})).toBeUndefined();
    expect(prepareSectPlayerChat(world,draft)?.effect).toContain(target.name);
    const next=applySectPlayerChat(world,draft);
    expect(sectRelation(next,sect.id,target.id)).toMatchObject({affinity:-49,pact:'neutral'});
    expect(next.sieges).toEqual(world.sieges);
    expect(next.cultivators.find(row=>row.id===leader.id)?.hp).toBe(leader.hp);
    expect(applySectPlayerChat(next,free('再说一遍，放马过来。'),choice.id)).toBe(next);
  });

  it('只能辟当事人真听到的伪传音，不压掉有证据的同题事实',()=>{
    const {world,leader}=setup();
    const author=world.cultivators.find(row=>row.id!==leader.id&&row.alive&&row.positionPlane===undefined);
    if(!author)throw new Error('Missing source actor');
    author.locationId=leader.locationId;
    author.personality='诡诈';
    fabricateRumor(world,author,leader,'FABRICATE');
    const rumor=leader.rumors.find(row=>row.id.startsWith('rumor-forged-'));
    if(!rumor)throw new Error('Missing actual forged packet');
    leader.rumors.push({...rumor,id:'rumor-public-witness',originEventId:'evt-verified-public',provenance:'witness',confidence:100});
    const choice=quoteSectPlayerChatOptions(world,'jiuzhou','leader').find(row=>row.intent.kind==='debunk');
    if(!choice)throw new Error('Missing actual known debunk option');
    const next=applySectPlayerChat(world,{roomId:'jiuzhou',identity:'leader',body:{kind:'quick',preset:'debunk'}},choice.id);
    const read=next.cultivators.find(row=>row.id===leader.id);
    expect(read?.rumors.find(row=>row.id===rumor.id)).toMatchObject({confidence:rumor.confidence-15,lead:false});
    expect(read?.rumors.find(row=>row.id==='rumor-public-witness')?.confidence).toBe(100);
    expect(leader.rumors.find(row=>row.id===rumor.id)?.confidence).toBe(55);
  });
  it('广告只留到下月；过期时可重新登报而不是永久禁用',()=>{
    const {world}=setup();
    const draft:SectPlayerChatDraft={roomId:'jiuzhou',identity:'leader',body:{kind:'quick',preset:'recruit_ad'}};
    const posted=applySectPlayerChat(world,draft);
    expect(posted.sectManagement?.playerChat?.recruitAd).toEqual({postedTick:world.tick,targetTick:world.tick+1});
    expect(applySectPlayerChat(posted,draft)).toBe(posted);
    posted.tick++;
    const next=applySectPlayerChat(posted,draft);
    expect(next).not.toBe(posted);
    expect(next.sectManagement?.playerChat?.recruitAd).toEqual({postedTick:posted.tick,targetTick:posted.tick+1});
  });

});
