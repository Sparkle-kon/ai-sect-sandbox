import {sectChallengeEventId,sectChallengeId,SECT_CHALLENGE_INJURY_LIMIT,type SectChallengeResult} from '../types/sectChallenge';
import type {WorldEvent,WorldState} from '../types/world';
import {isChronicleStoryFact} from './chronicleLead';

type CompletedChallenge=Extract<SectChallengeResult,{outcome:'completed'}>;

export const SECT_CHALLENGE_PUBLIC_TITLE='山门踢馆';
export const isSectChallengeCut=(event:Pick<WorldEvent,'id'|'title'>):boolean=>
  event.title===SECT_CHALLENGE_PUBLIC_TITLE||/^evt-[0-9]+-sect-challenge-(?:inbound|outbound)-[0-9]+-completed$/.test(event.id);

export function matchesSectChallengeEvent(result:CompletedChallenge,event:WorldEvent):boolean{
  return event.witnessScope===undefined&&event.category==='combat'&&event.title===SECT_CHALLENGE_PUBLIC_TITLE&&
    result.id===sectChallengeId(result.direction,result.createdTick)&&result.resolvedTick===event.tick&&
    result.createdTick<=event.tick&&result.expiresTick>=event.tick&&result.eventId===event.id&&
    result.eventId===sectChallengeEventId(result,event.tick)&&result.siteId===event.locationId&&
    result.challengerSectId!==result.defenderSectId&&result.challengerId!==result.defenderId&&event.actorIds.length===2&&
    event.actorIds[0]===result.challengerId&&event.actorIds[1]===result.defenderId&&
    result.winnerId!==result.loserId&&event.actorIds.includes(result.winnerId)&&event.actorIds.includes(result.loserId)&&
    event.duelWinnerId===result.winnerId&&Number.isSafeInteger(result.injury)&&result.injury>=1&&result.injury<=SECT_CHALLENGE_INJURY_LIMIT&&
    event.damage?.length===1&&event.damage[0].cultivatorId===result.loserId&&event.damage[0].amount===result.injury;
}

/** Only a completed, dated two-party result licenses retelling or arena replay. */
export function matchSectChallengeResult(world:WorldState,event:WorldEvent):CompletedChallenge|undefined{
  const management=world.sectManagement;
  if(!management||event.witnessScope!==undefined||event.category!=='combat'||event.title!==SECT_CHALLENGE_PUBLIC_TITLE||
    !Number.isSafeInteger(event.tick)||!Number.isSafeInteger(event.year)||!Number.isInteger(event.month)||
    event.month<1||event.month>12||(world.year-event.year)*12+world.month-event.month!==world.tick-event.tick||
    !isChronicleStoryFact(event,world.tick))return;
  const rows=management.challenges?.history.filter((row):row is CompletedChallenge=>row.outcome==='completed'&&row.eventId===event.id);
  const result=rows?.length===1?rows[0]:undefined;
  if(!result||(result.direction==='outbound'?result.challengerSectId:result.defenderSectId)!==management.sectId||
    !matchesSectChallengeEvent(result,event))return;
  return result;
}
