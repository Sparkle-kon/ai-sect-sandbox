import {
  SECT_CHALLENGE_DIRECTIONS,SECT_CHALLENGE_EXPIRY_MONTHS,SECT_CHALLENGE_HISTORY_LIMIT,SECT_CHALLENGE_INJURY_LIMIT,
  sectChallengeEventId,sectChallengeId,type SectChallengeIdentity,type SectChallengeResult,type SectChallengeState,
} from '../../types/sectChallenge';
import type {SectManagementState} from '../../types/sectManagement';
import type {WorldState} from '../../types/world';
import {isChronicleStoryFact} from '../chronicleLead';
import {matchSectChallengeResult,SECT_CHALLENGE_PUBLIC_TITLE} from '../sectChallengeProof';
import {arr,fail as rejectShape,id,num,one,optional,structure,tick,type Validator} from './primitives';

const identity={id,createdTick:tick,expiresTick:tick,direction:one(...SECT_CHALLENGE_DIRECTIONS),
  challengerId:id,defenderId:id,challengerSectId:id,defenderSectId:id,siteId:id};
const offer=structure({...identity,phase:one('awaiting_response','traveling')});
const completed=structure({...identity,resolvedTick:tick,outcome:one('completed'),eventId:id,
  winnerId:id,loserId:id,injury:num(1,SECT_CHALLENGE_INJURY_LIMIT,true),reputationMoved:one(0,1)});
const other=structure({...identity,resolvedTick:tick,outcome:one('refused','expired')});
const result:Validator=(value,path)=>{
  if(!value||typeof value!=='object'||!('outcome' in value))return rejectShape(path);
  (value.outcome==='completed'?completed:other)(value,path);
};
export const sectChallengeShape=structure({
  pending:optional(offer),history:arr(SECT_CHALLENGE_HISTORY_LIMIT,result),lastOfferTick:optional(tick),
});

function supportsCompleted(world:WorldState,row:Extract<SectChallengeResult,{outcome:'completed'}>):boolean{
  if(row.eventId!==sectChallengeEventId(row,row.resolvedTick)||row.winnerId===row.loserId||
    ![row.challengerId,row.defenderId].includes(row.winnerId)||![row.challengerId,row.defenderId].includes(row.loserId))
    return false;
  const live=world.events.filter(event=>event.id===row.eventId);
  if(live.length>1)return false;
  const chapters=[...world.chronicleArchive.chapters,...world.coldHistory.chapters];
  const archives=[...world.chronicleArchive.anchors,
    ...chapters.filter(chapter=>chapter.startTick<=row.resolvedTick&&chapter.endTick>=row.resolvedTick).flatMap(chapter=>chapter.anchors)]
    .filter(event=>event.id===row.eventId);
  const sameWitness=(event:typeof world.events[number])=>
    isChronicleStoryFact(event,row.resolvedTick)&&event.tick===row.resolvedTick&&event.month>=1&&event.month<=12&&
    world.tick-event.tick===(world.year-event.year)*12+world.month-event.month&&
    event.category==='combat'&&event.title===SECT_CHALLENGE_PUBLIC_TITLE&&event.locationId===row.siteId&&event.actorIds.length===2&&
    event.actorIds[0]===row.challengerId&&event.actorIds[1]===row.defenderId;
  if(live.some(event=>matchSectChallengeResult(world,event)!==row)||archives.some(event=>!sameWitness(event)))return false;
  if(live.length)return true;
  if(row.resolvedTick===world.tick)return false;
  if(archives.length)return true;
  // The result stays bounded, even if the mutable event/anchor windows have compacted.
  return row.resolvedTick<world.tick&&world.events.length>=120&&!world.events.some(event=>event.tick<row.resolvedTick);
}

export function validateSectChallenges(world:WorldState,management:SectManagementState,state:SectChallengeState,
  fail:(field:string)=>never):void{
  const latestTick=management.growth?.failure?.tick??world.tick;
  const actors=new Set(world.cultivators.map(actor=>actor.id)),sects=new Set(world.sects.map(sect=>sect.id));
  const sites=new Map(world.locations.map(site=>[site.id,site]));
  const supportsIdentity=(row:SectChallengeIdentity)=>{
    const site=sites.get(row.siteId);
    return row.id===sectChallengeId(row.direction,row.createdTick)&&row.createdTick>=management.foundedTick&&
      row.createdTick<=latestTick&&row.expiresTick===row.createdTick+SECT_CHALLENGE_EXPIRY_MONTHS&&
      row.challengerId!==row.defenderId&&actors.has(row.challengerId)&&actors.has(row.defenderId)&&
      row.challengerSectId!==row.defenderSectId&&sects.has(row.challengerSectId)&&sects.has(row.defenderSectId)&&
      (row.direction==='outbound'?row.challengerSectId===management.sectId&&row.challengerId!==management.leaderId:
        row.defenderSectId===management.sectId&&row.defenderId!==management.leaderId&&row.siteId===management.homeSiteId)&&!!site&&site.type!=='secret_realm'&&site.expeditionOmenId===undefined;
  };
  let previousCreated=-1,previousResolved=-1;
  for(const entry of state.history){
    if(!supportsIdentity(entry)||entry.createdTick<=previousCreated||entry.createdTick<previousResolved||
      entry.resolvedTick<entry.createdTick||entry.resolvedTick>latestTick||
      entry.resolvedTick>entry.expiresTick+1||
      entry.outcome==='completed'&&(entry.resolvedTick===entry.createdTick||entry.resolvedTick>entry.expiresTick)||
      entry.outcome==='refused'&&entry.resolvedTick>=entry.expiresTick)
      return fail('sectManagement.challenges.history');
    previousCreated=entry.createdTick;
    previousResolved=entry.resolvedTick;
    if(entry.outcome==='completed'&&!supportsCompleted(world,entry))return fail('sectManagement.challenges.result');
  }
  const pending=state.pending;
  if(pending){
    const site=sites.get(pending.siteId);
    const challenger=world.cultivators.find(actor=>actor.id===pending.challengerId);
    const defender=world.cultivators.find(actor=>actor.id===pending.defenderId);
    const visitorSect=world.sects.find(sect=>sect.id===(pending.direction==='outbound'?pending.defenderSectId:pending.challengerSectId));
    if(!supportsIdentity(pending)||pending.createdTick<=previousCreated||pending.createdTick<previousResolved||
      latestTick>pending.expiresTick||site?.type!=='sect_hq'||site.ownerSectId!==pending.defenderSectId||
      pending.createdTick===world.tick&&(challenger?.sectId!==pending.challengerSectId||
        defender?.sectId!==pending.defenderSectId||visitorSect?.leaderId!==(pending.direction==='outbound'?pending.defenderId:pending.challengerId)||
        pending.direction==='outbound'&&pending.phase!=='awaiting_response'))
      return fail('sectManagement.challenges.pending');
  }
  const latestOffer=pending?.createdTick??state.history.at(-1)?.createdTick;
  if(state.lastOfferTick!==latestOffer)return fail('sectManagement.challenges.lastOfferTick');
}
