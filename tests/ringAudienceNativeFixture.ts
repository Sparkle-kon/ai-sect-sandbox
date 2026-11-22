import { expect } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableRingAudienceAims, exchangeRingAudience, openRingAudience } from '../src/engine/ringAudienceEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { RingAudienceAim, RingAudienceRole, RingAudienceSession } from '../src/types/ringAudience';
import type { LLMDecisionPayload,WorldState } from '../src/types/world';

export const audienceId='npc-6';
export const audienceActor=(world:WorldState,id=audienceId)=>world.cultivators.find(row=>row.id===id)!;
export const audienceRow=(world:WorldState):RingAudienceSession=>world.playerAvatar.audience!.sessions.at(-1)!;
export const privateLines=[
  '我理解你要留一条退路。不必勉强，由你自己选择。',
  '我理解你怕连续受制。不必勉强，先听你自己的顾虑。',
  '先讲清楚实在的道理，再由你自己选择；不替你做主。',
  '不必勉强。我理解你宁可先一步离去，也不想妨害旁人。',
] as const;
const noAct:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静守原处。'};
export function audienceTurn(world:WorldState, decisions:Record<string,LLMDecisionPayload>={}){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,decisions[row.id]??noAct])),()=>.8,'utility');
}
export const audienceCursor=(row:RingAudienceSession)=>({
  sessionId:row.id,targetId:row.targetId,role:row.role,expectedTurn:row.turns.length,
});

export function actualAcceptedAudience(role:RingAudienceRole='ring',aim:RingAudienceAim='leave_sect',
  initial=createInitialWorld(1,'spirit-bloom'),targetId=audienceId){
  expect(availableRingAudienceAims(initial,targetId,role)).toContain(aim);
  const opened=openRingAudience(initial,{role,targetId,aim});
  expect(opened).not.toBe(initial);
  const exchangeWorlds:WorldState[]=[];
  let world=opened;
  for(const message of privateLines){
    if(audienceRow(world).stance==='accepts')break;
    const previous=world,old=audienceRow(previous);
    world=exchangeRingAudience(previous,{...audienceCursor(old),message});
    expect(world).not.toBe(previous);
    expect(world.tick).toBe(previous.tick);
    expect(audienceRow(world).turns).toHaveLength(old.turns.length+1);
    exchangeWorlds.push(world);
  }
  const row=audienceRow(world);
  expect(row).toMatchObject({stance:'accepts',status:'open',openingSectId:audienceActor(initial,targetId).sectId});
  return {initial,opened,world,row,exchangeWorlds};
}
