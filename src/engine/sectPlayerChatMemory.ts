import {sectAliasExposureMemoryText,sectAliasRivalReply} from '../data/sectPlayerChatLines';
import {starterSectIdentity} from '../types/sectManagement';
import {SECT_PLAYER_CHAT_ALIASES,SECT_PLAYER_CHAT_MONTH_LIMIT,SECT_PLAYER_CHAT_POST_LIMIT,sectPlayerChatPostId,
  type SectPlayerChatAlias} from '../types/sectPlayerChat';
import {sectRecurringIdentity} from '../types/sectRecurring';
import type {Cultivator,WorldState} from '../types/world';
import {recallMemories,recordMemory} from './memoryEngine';
import {isSectActive} from './sectActivity';
import {isRetiredFromService} from './serviceRetirementEngine';
import {onLowerPlane} from './upperPassageIsolation';

export function rememberSectAliasExposure(actor:Cultivator,tick:number,alias:SectPlayerChatAlias):string|undefined{
  recordMemory(actor,tick,sectAliasExposureMemoryText(alias),10,'social',4);
  const id=`mem-${tick}-${actor.id}-${actor.memorySequence}`;
  return actor.memories.some(memory=>memory.id===id)?id:undefined;
}

/** Private recipient only. A post, alias name or impostor without the original memory cannot unlock this line. */
export function projectSectAliasRivalReply(world:WorldState,actor:Cultivator,spokenTick:number):string|undefined{
  const managed=world.sectManagement,visits=managed?.recurring,ledger=managed?.playerChat;
  if(!managed||!visits||!ledger||spokenTick>world.tick||spokenTick<visits.openedTick||
      !actor.alive||actor.hp<=0||!onLowerPlane(actor)||isRetiredFromService(actor))return;
  const ids=sectRecurringIdentity(managed.sectId,starterSectIdentity(world.random.seed,managed.starterId,managed.draw).creditorId);
  const people=world.cultivators.filter(row=>row.id===ids.rival),sects=world.sects.filter(row=>row.id===ids.rivalSectId);
  if(people.length!==1||people[0]!==actor||sects.length!==1||!isSectActive(sects[0])||
      actor.sectId!==ids.rivalSectId||sects[0].leaderId!==actor.id)return;
  const retained=recallMemories(actor,world.tick,Infinity);
  const verified=SECT_PLAYER_CHAT_ALIASES.flatMap(alias=>{
    const exposure=ledger.aliases[alias]?.exposure;
    if(!exposure?.memoryId||exposure.recognizerId!==actor.id||exposure.tick>=spokenTick||exposure.tick<visits.openedTick||
        !Array.from({length:SECT_PLAYER_CHAT_POST_LIMIT},(_,i)=>sectPlayerChatPostId(exposure.tick,i)).includes(exposure.postId))return [];
    const months=ledger.months.filter(month=>month.tick===exposure.tick);
    if(months.length||world.tick-exposure.tick<SECT_PLAYER_CHAT_MONTH_LIMIT){
      const sources=months.flatMap(month=>month.posts.filter(post=>post.id===exposure.postId));
      if(sources.length!==1||sources[0].tick!==exposure.tick||sources[0].roomId!=='jiuzhou'||sources[0].identity!==alias)return [];
    }
    const matching=retained.filter(memory=>memory.id===exposure.memoryId);
    return matching.length===1&&matching[0].tick===exposure.tick&&matching[0].category==='social'&&
      matching[0].content===sectAliasExposureMemoryText(alias)?[{alias,tick:exposure.tick}]:[];
  }).sort((a,b)=>b.tick-a.tick)[0];
  return verified?sectAliasRivalReply(verified.alias,spokenTick):undefined;
}
