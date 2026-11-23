import {describe,expect,it} from 'vitest';
import {projectSectAliasRivalReply,rememberSectAliasExposure} from '../src/engine/sectPlayerChatMemory';
import {ensureSectRecurringCast} from '../src/engine/sectRecurringCast';
import {availableSettlementActions} from '../src/engine/settlementEngine';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {sectPlayerChatPostId,type SectPlayerChatPost} from '../src/types/sectPlayerChat';
import {sectRecurringIdentity} from '../src/types/sectRecurring';

function fixture(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0),managed=world?.sectManagement;
  if(!world||!managed?.debt)throw Error('Expected a true starter sect and its creditor');
  const leader=world.cultivators.find(row=>row.id===managed.leaderId),sect=world.sects.find(row=>row.id===managed.sectId);
  if(!leader||!sect)throw Error('Expected canonical leader and sect');
  return {world,managed,leader,sect,ids:sectRecurringIdentity(sect.id,managed.debt.creditorId)};
}

describe('九州传音的确定规则',()=>{
  it('把招新告示的效力留给下月，不改本人意愿或替他人付钱',()=>{
    const {world,managed,leader,sect}=fixture();
    const village=world.settlements.villages.find(row=>row.locationId==='loc-market');
    if(!village||village.volunteers.length<2)throw Error('Expected the actual market village');
    leader.locationId=village.locationId;
    village.stress=12;
    for(const person of village.volunteers){person.willingness=0;}
    const [adult,underage]=village.volunteers;
    adult.age=22;adult.aptitude=60;adult.willingness=62;
    underage.age=17;underage.aptitude=100;underage.willingness=100;
    managed.playerChat={months:[],aliases:{},recruitAd:{postedTick:world.tick,targetTick:world.tick+1}};
    const has=(at=world.tick)=>availableSettlementActions(leader,world,at).filter(row=>row.action==='RECRUIT_SETTLER')
      .map(row=>row.targetVolunteerId);
    sect.spiritStones=24;
    expect(has(world.tick+1)).toEqual([]);
    sect.spiritStones=25;
    expect(has()).toEqual([]);
    expect(has(world.tick+1)).toEqual([adult.id]);
    world.tick++;
    expect(has()).toEqual([adult.id]);
    expect(has(world.tick+1)).toEqual([]);
    world.tick++;
    expect(has()).toEqual([]);
    expect(adult.willingness).toBe(62);
    expect(sect.spiritStones).toBe(25);
  });

  it('亲自认出马甲的赵掌门才会谈旧事，不能凭同名、交谈日期或另一条记忆蒙混',()=>{
    const {world,managed,ids}=fixture();
    world.tick++;
    if(!ensureSectRecurringCast(world))throw Error('Expected the canonical rival');
    const rival=world.cultivators.find(row=>row.id===ids.rival);
    if(!rival)throw Error('Expected Zhao');
    const at=world.tick,alias='passing_senior';
    const post:SectPlayerChatPost={id:sectPlayerChatPostId(at,0),tick:at,roomId:'jiuzhou',identity:alias,
      body:{kind:'free',text:'待茶开了，再与道友谈剑。'},intent:{kind:'chat'}};
    const memoryId=rememberSectAliasExposure(rival,at,alias);
    if(!memoryId)throw Error('Expected his retained memory');
    const exposure={tick:at,recognizerId:rival.id,postId:post.id,memoryId};
    const state={months:[{tick:at,usedSlots:1,usedEffects:[],posts:[post]}],aliases:{[alias]:{posts:1,exposure}}};
    managed.playerChat=state;
    expect(projectSectAliasRivalReply(world,rival,at)).toBeUndefined();
    world.tick++;
    expect(projectSectAliasRivalReply(world,rival,world.tick)).toContain('路过的前辈');
    expect(projectSectAliasRivalReply(world,structuredClone(rival),world.tick)).toBeUndefined();
    managed.playerChat={...state,months:[]};
    expect(projectSectAliasRivalReply(world,rival,world.tick)).toBeUndefined();
    world.tick=at+12;
    expect(projectSectAliasRivalReply(world,rival,world.tick)).toContain('路过的前辈');
    rival.memories=rival.memories.filter(memory=>memory.id!==memoryId);
    expect(projectSectAliasRivalReply(world,rival,world.tick)).toBeUndefined();
  });
});
