import { SECT_CHALLENGE_PUBLIC_TITLE } from './sectChallengeProof';
import { sectChallengeEventId, sectChallengeId, SECT_CHALLENGE_HISTORY_LIMIT, SECT_CHALLENGE_EXPIRY_MONTHS, SECT_CHALLENGE_INJURY_LIMIT } from '../types/sectChallenge';
import type { SectChallengeOffer, SectChallengeResult, SectChallengeState } from '../types/sectChallenge';
import { starterSectIdentity } from '../types/sectManagement';
import { sectRecurringIdentity } from '../types/sectRecurring';
import type { Cultivator, LLMDecisionPayload, LocationNode, Sect, WorldEvent, WorldState } from '../types/world';
import { apprenticeshipPhysicallyAt } from './apprenticeshipPresence';
import { sectRelation } from './diplomacyEngine';
import { directorKnownReachableSites, directorRoll, directorSiteIsSafe } from './director/nudgeIntegrations';

const OFFER_COOLDOWN=3;
const ADVERSARY_INTERVAL=6;
const lexical=(a:string,b:string)=>a<b?-1:a>b?1:0;
const outOfBounds=(actor:Cultivator,world:WorldState)=>
  world.playerAvatar.possessedId===actor.id&&(world.playerAvatar.possessionUntilTick??0)>world.tick;
function exact<T extends {id:string}>(rows:readonly T[],id:string):T|undefined{
  const matches=rows.filter(row=>row.id===id);
  return matches.length===1?matches[0]:undefined;
}
function ordinaryPresence(world:WorldState,actor:Cultivator):boolean{
  return actor.hp>=Math.max(2,actor.maxHp*.55)&&!outOfBounds(actor,world)&&
    !(actor.guardAssignment&&actor.guardAssignment.expiresTick>world.tick)&&
    (!actor.tribulation||actor.tribulation.stage==='passed'||actor.tribulation.stage==='failed')&&
    apprenticeshipPhysicallyAt(world,actor,actor.locationId,world.tick);
}
function headquarters(world:WorldState,sect:Sect):LocationNode|undefined{
  const site=exact(world.locations,sect.headquartersId);
  return sect.inactiveSinceTick===undefined&&site?.type==='sect_hq'&&site.ownerSectId===sect.id&&directorSiteIsSafe(world,site)?site:undefined;
}
function managed(world:WorldState){
  const management=world.sectManagement;
  if(!management||management.growth?.failure)return;
  const origin=starterSectIdentity(world.random.seed,management.starterId,management.draw);
  if(management.sectId!==origin.sectId||management.leaderId!==origin.leaderId||management.homeSiteId!==origin.homeSiteId)return;
  const sect=exact(world.sects,management.sectId),leader=exact(world.cultivators,management.leaderId);
  if(!sect||!leader?.alive||leader.hp<=0||leader.sectId!==sect.id||sect.leaderId!==leader.id||
    sect.headquartersId!==management.homeSiteId||!headquarters(world,sect))return;
  return {management,sect,leader,rival:sectRecurringIdentity(sect.id,origin.creditorId)};
}
function atOrReachable(world:WorldState,actor:Cultivator,site:LocationNode):boolean{
  return ordinaryPresence(world,actor)&&(actor.locationId===site.id||directorKnownReachableSites(world,actor).includes(site));
}
function openSlot(state:SectChallengeState|undefined,tick:number):boolean{
  return !state?.pending&&(state?.lastOfferTick===undefined||tick-state.lastOfferTick>=OFFER_COOLDOWN);
}
function mayAccept(world:WorldState,challengerSectId:string,defenderSectId:string):boolean{
  const relation=sectRelation(world,challengerSectId,defenderSectId);
  return relation?.pact!=='war'&&(relation?.affinity??0)>=-35;
}

export interface SectChallengeTarget {
  readonly sectId:string;
  readonly sectName:string;
  readonly defenderId:string;
  readonly defenderName:string;
  readonly siteId:string;
  readonly siteName:string;
}
export function listSectChallengeDisciples(world:WorldState):Cultivator[]{
  const active=managed(world);
  return active?world.cultivators.filter(actor=>actor.id!==active.leader.id&&actor.sectId===active.sect.id&&
    ordinaryPresence(world,actor)).sort((a,b)=>lexical(a.id,b.id)):[];
}
export function listSectChallengeTargets(world:WorldState,discipleId:string):SectChallengeTarget[]{
  const active=managed(world),actor=listSectChallengeDisciples(world).find(row=>row.id===discipleId);
  if(!active||!actor||!openSlot(active.management.challenges,world.tick))return [];
  return world.sects.flatMap(sect=>{
    if(sect.id===active.sect.id||!sect.leaderId||sectRelation(world,active.sect.id,sect.id)?.pact==='war')return [];
    const site=headquarters(world,sect),defender=exact(world.cultivators,sect.leaderId);
    if(!site||!defender||defender.sectId!==sect.id||defender.locationId!==site.id||
       !ordinaryPresence(world,defender)||!atOrReachable(world,actor,site))return [];
    return [{sectId:sect.id,sectName:sect.name,defenderId:defender.id,defenderName:defender.name,siteId:site.id,siteName:site.name}];
  }).sort((a,b)=>Number(b.sectId===active.rival.rivalSectId)-Number(a.sectId===active.rival.rivalSectId)||lexical(a.sectId,b.sectId));
}
function placeOffer(world:WorldState,direction:SectChallengeOffer['direction'],challenger:Cultivator,defender:Cultivator,siteId:string):void{
  const management=world.sectManagement;
  if(!management)return;
  const tick=world.tick;
  management.challenges={history:management.challenges?.history??[],lastOfferTick:tick,
    pending:{id:sectChallengeId(direction,tick),createdTick:tick,expiresTick:tick+SECT_CHALLENGE_EXPIRY_MONTHS,
      direction,challengerId:challenger.id,defenderId:defender.id,challengerSectId:challenger.sectId,
      defenderSectId:defender.sectId,siteId,phase:'awaiting_response'}};
}
export function requestSectChallenge(world:WorldState,discipleId:string,defenderSectId:string):boolean{
  const selected=listSectChallengeTargets(world,discipleId).find(target=>target.sectId===defenderSectId);
  const challenger=selected&&exact(world.cultivators,discipleId),defender=selected&&exact(world.cultivators,selected.defenderId);
  if(!selected||!challenger||!defender)return false;
  placeOffer(world,'outbound',challenger,defender,selected.siteId);
  return true;
}
function pair(world:WorldState,offer:SectChallengeOffer){
  const active=managed(world);
  const challengerSect=exact(world.sects,offer.challengerSectId),defenderSect=exact(world.sects,offer.defenderSectId);
  const challenger=exact(world.cultivators,offer.challengerId),defender=exact(world.cultivators,offer.defenderId);
  if(!active||!challengerSect||!defenderSect||!challenger?.alive||!defender?.alive||challenger.hp<=0||defender.hp<=0||
    challenger.sectId!==challengerSect.id||defender.sectId!==defenderSect.id||challengerSect.id===defenderSect.id||
    sectRelation(world,challengerSect.id,defenderSect.id)?.pact==='war'||!headquarters(world,challengerSect))return;
  const site=headquarters(world,defenderSect);
  if(!site||site.id!==offer.siteId)return;
  if(offer.direction==='outbound'?challengerSect!==active.sect||challenger===active.leader||defenderSect.leaderId!==defender.id:
    defenderSect!==active.sect||defender===active.leader||challengerSect.leaderId!==challenger.id)return;
  return {challenger,defender,challengerSect,defenderSect,site};
}
function finish(world:WorldState,result:SectChallengeResult):void{
  const management=world.sectManagement,state=management?.challenges;
  if(management&&state)management.challenges={lastOfferTick:state.lastOfferTick,
    history:[...state.history,result].slice(-SECT_CHALLENGE_HISTORY_LIMIT)};
}
function closeUnsettled(world:WorldState,offer:SectChallengeOffer,outcome:'refused'|'expired'):void{
  const {phase: _phase,...identity}=offer;
  finish(world,{...identity,resolvedTick:world.tick,outcome});
}
export function answerSectChallenge(world:WorldState,offerId:string,accept:boolean):boolean{
  const active=managed(world),state=active?.management.challenges,offer=state?.pending;
  if(!active||!state||!offer||offer.id!==offerId||offer.direction!=='inbound'||offer.phase!=='awaiting_response'||
    world.tick>=offer.expiresTick)return false;
  if(!accept){closeUnsettled(world,offer,'refused');return true;}
  const parties=pair(world,offer);
  if(!parties||!atOrReachable(world,parties.challenger,parties.site)||!atOrReachable(world,parties.defender,parties.site))return false;
  active.management.challenges={...state,pending:{...offer,phase:'traveling'}};
  return true;
}
export type SectChallengeCommand={kind:'request';discipleId:string;defenderSectId:string}|{kind:'answer';offerId:string;accept:boolean};
export function applySectChallengeCommand(world:WorldState,command:SectChallengeCommand):boolean{
  return command.kind==='request'?requestSectChallenge(world,command.discipleId,command.defenderSectId):
    answerSectChallenge(world,command.offerId,command.accept);
}

/** Only a living contender with a separately accepted, dated public invitation gets a native travel order. */
export function chooseSectChallengeAction(world:WorldState,actor:Cultivator):LLMDecisionPayload|undefined{
  const offer=world.sectManagement?.challenges?.pending;
  if(!offer||offer.createdTick>=world.tick||offer.expiresTick<world.tick||
    actor.id!==offer.challengerId&&actor.id!==offer.defenderId)return;
  const parties=pair(world,offer);
  if(!parties||actor!==parties.challenger&&actor!==parties.defender||!atOrReachable(world,actor,parties.site))return;
  if(offer.phase!=='traveling'){
    if(offer.direction==='outbound'&&actor===parties.defender&&actor.locationId===parties.site.id&&
      mayAccept(world,offer.challengerSectId,offer.defenderSectId))
      return {chosenAction:'REST',innerMonologue:'来帖写得明白，先在山门等一句正式回话。'};
    return;
  }
  return actor.locationId===parties.site.id?{chosenAction:'REST',innerMonologue:'已到山门演武处，点到即止。'}:
    {chosenAction:'EXPLORE',targetLocationId:parties.site.id,innerMonologue:'持已应下的比试帖，沿实路赴约。'};
}
function maybeInvite(world:WorldState):void{
  const active=managed(world);
  if(!active||!openSlot(active.management.challenges,world.tick)||world.tick<active.management.foundedTick+3)return;
  const site=headquarters(world,active.sect);
  const defender=site&&listSectChallengeDisciples(world).filter(actor=>actor.locationId===site.id)
    .sort((a,b)=>b.combatPower-a.combatPower||lexical(a.id,b.id))[0];
  if(!site||!defender)return;
  const last=active.management.challenges?.history.at(-1);
  for(const sect of [...world.sects].sort((a,b)=>Number(b.id===active.rival.rivalSectId)-Number(a.id===active.rival.rivalSectId)||lexical(a.id,b.id))){
    if(sect===active.sect||!sect.leaderId||!headquarters(world,sect))continue;
    const outsider=exact(world.cultivators,sect.leaderId);
    if(!outsider||outsider.sectId!==sect.id||!atOrReachable(world,outsider,site))continue;
    const relation=sectRelation(world,sect.id,active.sect.id),affinity=relation?.affinity??0;
    if(relation?.pact==='war'||relation?.pact==='alliance')continue;
    const rival=!!active.management.recurring&&sect.id===active.rival.rivalSectId&&outsider.id===active.rival.rival;
    const rematch=last?.direction==='outbound'&&last.outcome==='completed'&&last.defenderSectId===sect.id&&
      world.tick-last.resolvedTick<=ADVERSARY_INTERVAL;
    if(!rematch&&affinity>-6&&(!rival||last&&world.tick-last.resolvedTick<ADVERSARY_INTERVAL))continue;
    placeOffer(world,'inbound',outsider,defender,site.id);
    return;
  }
}
export function advanceSectChallenges(world:WorldState,events:WorldEvent[]):void{
  const state=world.sectManagement?.challenges,offer=state?.pending;
  if(!offer){maybeInvite(world);return;}
  if(offer.createdTick>=world.tick)return;
  const parties=pair(world,offer);
  if(!parties||world.tick>offer.expiresTick||offer.phase==='awaiting_response'&&world.tick===offer.expiresTick){
    closeUnsettled(world,offer,'expired');
    return;
  }
  const {challenger,defender,challengerSect,defenderSect,site}=parties;
  if(offer.phase==='awaiting_response'){
    if(offer.direction==='inbound')return;
    if(!mayAccept(world,challengerSect.id,defenderSect.id)){
      closeUnsettled(world,offer,'refused');return;
    }
    if(ordinaryPresence(world,defender)&&defender.locationId===site.id&&world.sectManagement&&state)
      world.sectManagement.challenges={...state,pending:{...offer,phase:'traveling'}};
    return;
  }
  if(!ordinaryPresence(world,challenger)||!ordinaryPresence(world,defender)||
     challenger.locationId!==site.id||defender.locationId!==site.id){
    if(world.tick===offer.expiresTick)closeUnsettled(world,offer,'expired');
    return;
  }
  const score=(actor:Cultivator)=>Math.log2(Math.max(1,actor.combatPower))*13+
    actor.hp/actor.maxHp*10+directorRoll(world,world.tick,[offer.id,actor.id,'sect-challenge'])/2;
  const winner=score(challenger)>=score(defender)?challenger:defender;
  const loser=winner===challenger?defender:challenger;
  const winners=winner===challenger?challengerSect:defenderSect,losers=winner===challenger?defenderSect:challengerSect;
  const injury=Math.min(SECT_CHALLENGE_INJURY_LIMIT,Math.floor(loser.hp-1),Math.max(1,Math.round(loser.maxHp*.045)));
  const reputationMoved=winners.reputation<=99&&losers.reputation>=1?1:0;
  loser.hp-=injury;
  winners.reputation+=reputationMoved;
  losers.reputation-=reputationMoved;
  const {phase:_phase,...identity}=offer,eventId=sectChallengeEventId(offer,world.tick);
  finish(world,{...identity,resolvedTick:world.tick,outcome:'completed',eventId,winnerId:winner.id,loserId:loser.id,injury,reputationMoved});
  events.push({id:eventId,tick:world.tick,year:world.year,month:world.month,title:SECT_CHALLENGE_PUBLIC_TITLE,
    description:`【${site.name}】摆下公开演武席。${challenger.name}递帖，${defender.name}应约；${winner.name}胜，${loser.name}受了${injury}点轻伤。${reputationMoved?'两宗依约转移一点名望。':'两宗名望并未变动。'}`,
    category:'combat',actorIds:[challenger.id,defender.id],locationId:site.id,duelWinnerId:winner.id,
    damage:[{cultivatorId:loser.id,amount:injury}]});
}
