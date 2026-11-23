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
export const TIANJI_TABLOID_HISTORY=8;
export const TIANJI_TABLOID_SPEAKERS=4;
export const tianjiTabloidIssueId=(tick:number)=>`tabloid-${tick}`;
export type TianjiTabloidChallenge=TianjiGazetteSource&{challengeId:string};
export type TianjiTabloidEmbarrassment=TianjiGazetteSource&{actorId:string};
export interface TianjiTabloidHotTopic extends TianjiGazetteSource {
  roomId:'jiuzhou'|'market';speakerIds:string[];speakerCount:number;
}
export interface TianjiTabloidAdvertisement {
  postId:string;postedTick:number;sectId:string;siteId:string;
}
export interface TianjiTabloidIssue {
  id:string;tick:number;year:number;month:number;legacyEntries:TianjiGazetteEntry[];
  challenge?:TianjiTabloidChallenge;
  embarrassment?:TianjiTabloidEmbarrassment;
  hotTopic?:TianjiTabloidHotTopic;
  advertisement?:TianjiTabloidAdvertisement;
}
export interface TianjiGazetteState {issues:TianjiGazetteIssue[];quarterlies?:TianjiTabloidIssue[]}
