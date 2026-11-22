export type TianjiGazetteTrigger='year_turn'|'battle'|'finale';
export interface TianjiGazetteSource {sourceEventId:string;tick:number;year:number;month:number;siteId:string}
export type TianjiGazetteEntry=
  |(TianjiGazetteSource&{kind:'headline';story:'siege';siegeId:string;attackerSectId:string;defenderSectId:string;outcome:'victory'|'repelled'})
  |(TianjiGazetteSource&{kind:'headline';story:'tournament';occasionId:string;winnerId:string})
  |(TianjiGazetteSource&{kind:'dark_horse';occasionId:string;winnerId:string;opponentId:string;winnerSeed:number;opponentSeed:number;round:number})
  |(TianjiGazetteSource&{kind:'rivalry';actorIds:[string,string];earlier:TianjiGazetteSource})
  |(TianjiGazetteSource&{kind:'bounty';bountyId:string;targetActorId:string;sponsorSectId:string;reward:number});
export interface TianjiGazetteIssue {
  id:string;tick:number;year:number;month:number;trigger:TianjiGazetteTrigger;entries:TianjiGazetteEntry[];
}
export interface TianjiGazetteState {issues:TianjiGazetteIssue[]}
