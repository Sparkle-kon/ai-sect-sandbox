import type {TianjiGazetteSource,TianjiTabloidChallenge,TianjiTabloidEmbarrassment} from '../types/tianjiGazette';
import type {WorldEvent,WorldState} from '../types/world';
import {matchSectChallengeResult} from './sectChallengeProof';
import {matchesSectLiveEvent} from './sectLiveSources';
import {tianjiGazetteMatchesSource,tianjiGazetteVenue} from './tianjiGazetteTerms';

function exactEvent(world:WorldState,row:TianjiGazetteSource):WorldEvent|undefined{
  const event=world.events.filter(event=>event.id===row.sourceEventId);
  const sites=world.locations.filter(site=>site.id===row.siteId);
  return event.length===1&&sites.length===1&&tianjiGazetteVenue(sites[0])&&
    tianjiGazetteMatchesSource(row,event[0])&&row.tick<=world.tick&&
    (world.year-row.year)*12+world.month-row.month===world.tick-row.tick?event[0]:undefined;
}

export function resolveTabloidChallenge(world:WorldState,row:TianjiTabloidChallenge){
  const event=exactEvent(world,row),result=event&&matchSectChallengeResult(world,event);
  return event&&result&&result.id===row.challengeId?{event,result}:undefined;
}
export function resolveTabloidEmbarrassment(world:WorldState,row:TianjiTabloidEmbarrassment):WorldEvent|undefined{
  const event=exactEvent(world,row);
  return event&&matchesSectLiveEvent(world,{kind:'furnace',tick:row.tick,sourceEventId:row.sourceEventId,
    siteId:row.siteId,castIds:[row.actorId]},event)?event:undefined;
}
