import { isPrivateBanquetSeatEvent, settleBanquetSeats } from '../banquetSeats';
import { advanceNightDoors, recordNightDoorArrival, recordNightDoorBlocked } from '../nightDoor';
import { advanceReliefHomecomings } from '../reliefHomecoming';
import { advanceBoundaryGapResponses, isPrivateBoundaryGapEvent } from '../boundaryGap';
import { advanceFurnaceEmergencies, isPrivateFurnaceEmergencyEvent } from '../furnaceEmergency';
import { recordApprenticeshipReunionRounds } from '../apprenticeshipReunion';
import { advancePilgrimageForks, isPrivatePilgrimageForkEvent } from '../pilgrimageFork';
import { advanceVillageReunions, isPrivateVillageReunionEvent } from '../villageReunion';
import { isPrivateVacantGateEvent } from '../vacantGate';
import { advancePavilionFires } from '../pavilionFire';
import { reconcileAscensionInterruptions } from '../ascensionEngine';
import { advanceCultivationClans } from '../cultivationClanEngine';
import { advanceImmortalAuctions } from '../immortalAuctionEngine';
import { availableGrandSiegeHeroActions } from '../grandSiegeTheatreEngine';
import { advanceUpperArrayFieldTrade } from '../upperArrayFieldTradeEngine';
import { advanceFrontierTrade } from '../frontierTradeEngine';
import { advanceFrontierPortTrade } from '../frontierPortTradeEngine';
import { advanceFrontierDrylandTrade } from '../frontierDrylandTradeEngine';
import { recordRegionalLatePromotions } from '../regionalPromotionEngine';
import { finishRegionalSimulationTurn } from '../regionalSimulationEngine';
import { advanceDoctrineMaturity } from '../doctrineMaturityEngine';
import { advanceDoctrineFoundings } from '../doctrineFoundingEngine';
import { advanceDanxiaShortages } from '../danxiaShortageEngine';
import { advanceSeasonalHousing } from '../seasonalHousingEngine';
import { advanceMentorTransfers } from '../mentorTransferEngine';
import { advanceSeasonReviews } from '../seasonReviewEngine';
import { advanceDamageAssurance } from '../damageAssuranceEngine';
import { advanceProbation } from '../probationEngine';
import { advanceRelicExhibits } from '../relicExhibitEngine';
import { advanceScribeCommissions } from '../scribeCommissionEngine';
import { advanceWorkshops } from '../workshopEngine';
import { advanceSparring } from '../sparringEngine';
import { advanceShortShifts } from '../shortShiftEngine';
import { advanceBoundaryReliefs } from '../boundaryReliefEngine';
import { advanceApprenticeCohorts } from '../apprenticeCohortEngine';
import { advanceHouseholdNames } from '../householdNameEngine';
import { advanceCivicMemorials } from '../civicMemorialEngine';
import { advanceSectStipends } from '../sectStipendEngine';
import { advanceToolLoans } from '../toolLoanEngine';
import { reconcileCourierDeaths } from '../sealedCourierEngine';
import { advanceHouseholds } from '../householdEngine';
import { advanceTerritorialLeases } from '../territorialLeaseEngine';
import { advanceFormations } from '../formationNetworkEngine';
import { advanceCareFollowups } from '../careFollowupEngine';
import { advanceInfirmaries } from '../infirmaryEngine';
import { advanceHabitats } from '../habitatEngine';
import { advanceCraftTraining } from '../craftTrainingEngine';
import { advanceDisasterShelters } from '../disasterShelterEngine';
import { advanceWaypostMeals } from '../waypostMealEngine';
import { advancePilgrimages } from '../pilgrimageEngine';
import { advanceSectCredit } from '../sectCreditEngine';
import { advanceSanctuaries } from '../sanctuaryEngine';
import { advanceResearch } from '../researchEngine';
import { publicCompetitionStandings } from '../competitionEngine';
import { advanceDoctrines } from '../doctrineEngine';
import { recordDecisionTrace, rememberReplayDecision } from '../decisionTraceEngine';
import { advanceEstates } from '../estateEngine';
import { advanceWitnesses } from '../witnessEngine';
import { advanceMarkets } from '../marketEngine';
import { advanceOaths } from '../oathEngine';
import { activeRoguelikeEncounter } from '../roguelikeEncounterEngine';
import { activeDestinyTraitOffer } from '../destinyTraitEngine';
import type { LLMDecisionPayload, WorldEvent } from '../../types/world';
import { maintainMemories } from '../memoryEngine';
import { synthesizeReflections } from '../reflectionEngine';
import { witnessEvent } from '../rumorEngine';
import { expireScheme } from '../schemeEngine';
import { maintainSectPolitics } from '../sectPoliticsEngine';
import { advanceDiplomacy } from '../diplomacyEngine';
import { advanceOccasions } from '../occasionEngine';
import { isPrivateTournamentBanquetEvent } from '../tournamentBanquet';
import { advanceBounties } from '../bountyEngine';
import type { TickActionPorts, WorldTickContext } from './tickContext';
import { defineTickPlugins, runTickPlugins, type TickPlugin } from './tickPlugins';

type GrandReplies = ReadonlyMap<string, { actorId: string; decision: LLMDecisionPayload }>;

function institutionEvents(
  id: string,
  advance: (context: WorldTickContext, grandReplies: GrandReplies) => readonly WorldEvent[],
): TickPlugin<WorldTickContext, [WorldEvent[], GrandReplies]> {
  return { id, run: (context, events, grandReplies) => { for (const event of advance(context, grandReplies)) events.push(event); } };
}

const institutionEventPlugins = defineTickPlugins<WorldTickContext, [WorldEvent[], GrandReplies]>([
  institutionEvents('advanceApprenticeCohorts', ({ nextState }) => advanceApprenticeCohorts(nextState)),
  institutionEvents('advanceBoundaryReliefs', ({ nextState }) => advanceBoundaryReliefs(nextState)),
  institutionEvents('advanceShortShifts', ({ nextState }) => advanceShortShifts(nextState)),
  institutionEvents('advanceSparring', ({ nextState }) => advanceSparring(nextState)),
  institutionEvents('advanceDiplomacy', ({ nextState, rng, traceOptions, recordDecisionEffect }, grandReplies) =>
    advanceDiplomacy(nextState, rng, {
      chosenHero:siege=>grandReplies.get(siege.id),
      heldByModel:(siege,actorId)=>{
        const held=grandReplies.get(siege.id);
        if(held?.actorId!==actorId||held.decision.grandSiegeHeroMove!=='hold')return;
        if(traceOptions?.tape)rememberReplayDecision(traceOptions.tape,actorId,held.decision,0,false,false,true);
        recordDecisionEffect?.(actorId,true);
      },
      applied:(siege,result)=>{
        const decision:LLMDecisionPayload={chosenAction:'GRAND_SIEGE_HERO',targetGrandSiegeId:siege.id,grandSiegeHeroMove:result.move,
          innerMonologue:'山门前亲身护阵，所付代价已经落定。'};
        const actor=nextState.cultivators.find(person=>person.id===result.actorId);
        if(actor?.alive){
          actor.currentAction='GRAND_SIEGE_HERO';actor.innerMonologue=decision.innerMonologue;
          // The current turn's redacted frontline action supersedes its ordinary receipt, not earlier retained facts.
          if(actor.ordinaryActionEvidence?.tick===nextState.tick)delete actor.ordinaryActionEvidence;
        }
        if(traceOptions?.tape)rememberReplayDecision(traceOptions.tape,result.actorId,decision,0,false,false,result.origin==='model');
        if(result.origin==='model')recordDecisionEffect?.(result.actorId,true);
        traceOptions?.onActor?.(result.actorId,[],true);
        if(traceOptions?.captureTrace!==false)recordDecisionTrace(nextState,result.actorId,[],decision,
          result.origin==='player'?'avatar':result.origin,true);
      },
    }),
  ),
  institutionEvents('advanceOccasions', ({ nextState, rng }) => advanceOccasions(nextState, rng)),
  institutionEvents('advanceOaths', ({ nextState }) => advanceOaths(nextState)),
  institutionEvents('advanceMarkets', ({ nextState }) => advanceMarkets(nextState)),
  institutionEvents('advanceWitnesses', ({ nextState }) => advanceWitnesses(nextState)),
  institutionEvents('advanceSeasonReviews', ({ nextState }) => advanceSeasonReviews(nextState, (state, seasonId) =>
      publicCompetitionStandings(state, seasonId).find(({ rank }) => rank === 1))),
  institutionEvents('maintainSectPolitics', ({ nextState }) => maintainSectPolitics(nextState)),
  institutionEvents('advanceDoctrineFoundings', ({ nextState }) => advanceDoctrineFoundings(nextState)),
  institutionEvents('advanceDoctrineMaturity', ({ nextState, prevState }) => advanceDoctrineMaturity(nextState,prevState)),
  institutionEvents('advanceBounties', ({ nextState }) => advanceBounties(nextState)),
  institutionEvents('advanceResearch', ({ nextState }) => advanceResearch(nextState)),
  institutionEvents('advanceWorkshops', ({ nextState }) => advanceWorkshops(nextState)),
  institutionEvents('advanceCraftTraining', ({ nextState }) => advanceCraftTraining(nextState)),
  institutionEvents('advanceScribeCommissions', ({ nextState }) => advanceScribeCommissions(nextState)),
  institutionEvents('advanceDamageAssurance', ({ nextState }) => advanceDamageAssurance(nextState)),
  institutionEvents('advanceRelicExhibits', ({ nextState }) => advanceRelicExhibits(nextState)),
  institutionEvents('advanceProbation', ({ nextState }) => advanceProbation(nextState)),
  institutionEvents('advanceToolLoans', ({ nextState }) => advanceToolLoans(nextState)),
  institutionEvents('advanceWaypostMeals', ({ nextState }) => advanceWaypostMeals(nextState)),
  institutionEvents('advanceImmortalAuctions', ({ nextState }) => advanceImmortalAuctions(nextState)),
  institutionEvents('advanceVillageReunions', ({ nextState }) => advanceVillageReunions(nextState)),
  institutionEvents('advancePilgrimageForks', ({ nextState }) => advancePilgrimageForks(nextState,{blocked:recordNightDoorBlocked,arrived:recordNightDoorArrival})),
  institutionEvents('advanceEstates', ({ nextState }) => advanceEstates(nextState)),
  institutionEvents('advanceDoctrines', ({ nextState }) => advanceDoctrines(nextState)),
  institutionEvents('advanceSectCredit', ({ nextState }) => advanceSectCredit(nextState)),
  institutionEvents('advanceSanctuaries', ({ nextState }) => advanceSanctuaries(nextState)),
  institutionEvents('advancePilgrimages', ({ nextState }) => advancePilgrimages(nextState)),
  institutionEvents('advanceHabitats', ({ nextState }) => advanceHabitats(nextState)),
  institutionEvents('advanceInfirmaries', ({ nextState }) => advanceInfirmaries(nextState)),
  institutionEvents('advanceCareFollowups', ({ nextState }) => advanceCareFollowups(nextState)),
  institutionEvents('advanceDanxiaShortages', ({ nextState }) => advanceDanxiaShortages(nextState)),
  institutionEvents('advanceFormations', ({ nextState }) => advanceFormations(nextState)),
  institutionEvents('advanceTerritorialLeases', ({ nextState }) => advanceTerritorialLeases(nextState)),
  institutionEvents('reconcileCourierDeaths', ({ nextState }) => reconcileCourierDeaths(nextState)),
  institutionEvents('advanceHouseholds', ({ nextState }) => advanceHouseholds(nextState)),
  institutionEvents('advanceHouseholdNames', ({ nextState }) => advanceHouseholdNames(nextState)),
  institutionEvents('advanceCultivationClans', ({ nextState }) => advanceCultivationClans(nextState)),
]);

export function runInstitutionAndWorld(
  context: WorldTickContext,
  { closeInterruptedTrial }: Pick<TickActionPorts, 'closeInterruptedTrial'>,
): void {
  const { nextState, prevState, newEvents, regionalTurn, pendingGateEffects,
    precomputedDecisions, recordDecisionEffect, traceOptions } = context;
  for (const cultivator of nextState.cultivators) {
    if (cultivator.positionPlane === 'immortal') continue;
    expireScheme(cultivator, nextState.tick);
    if (!cultivator.alive) {
      closeInterruptedTrial(cultivator, nextState.tick);
      continue;
    }
    const yearly = nextState.month === 1;
    maintainMemories(cultivator, nextState.tick, yearly);
    if (yearly) cultivator.reflections = synthesizeReflections(cultivator, nextState.tick);
  }

  for(const event of advancePavilionFires(nextState)){
    newEvents.push(event);
    if(event.witnessScope===undefined)witnessEvent(nextState,event);
  }
  advanceUpperArrayFieldTrade(nextState);
  for(const event of [...advanceFrontierTrade(nextState),...advanceFrontierPortTrade(nextState),...advanceFrontierDrylandTrade(nextState)]){
    newEvents.push(event);
    witnessEvent(nextState,event);
  }
  finishRegionalSimulationTurn(nextState,regionalTurn);
  const grandReplies=new Map<string, { actorId: string; decision: LLMDecisionPayload }>();
  if(precomputedDecisions&&prevState.sieges.some(siege=>siege.status==='sieging'&&siege.theatre)){
    for(const actor of prevState.cultivators){
      if(!traceOptions?.modelActors?.has(actor.id)&&!traceOptions?.replayGrandSiegeModelActors?.has(actor.id))continue;
      const answer=Object.hasOwn(precomputedDecisions,actor.id)?precomputedDecisions[actor.id]:undefined;
      if(answer?.chosenAction!=='GRAND_SIEGE_HERO'||!answer.targetGrandSiegeId||!answer.grandSiegeHeroMove||
        !Object.keys(answer).every(key=>key==='chosenAction'||key==='targetGrandSiegeId'||key==='grandSiegeHeroMove'||key==='innerMonologue')||
        (prevState.roguelikeEncounters?.length&&activeRoguelikeEncounter(prevState,actor))||activeDestinyTraitOffer(prevState,actor)||
        grandReplies.has(answer.targetGrandSiegeId)||!availableGrandSiegeHeroActions(actor,prevState).some(option=>
          option.targetGrandSiegeId===answer.targetGrandSiegeId&&option.grandSiegeHeroMove===answer.grandSiegeHeroMove))continue;
      grandReplies.set(answer.targetGrandSiegeId,{actorId:actor.id,decision:answer});
    }
  }
  // Keep this batch together: each institution settles before its events are witnessed.
  const institutionBatch: WorldEvent[] = [];
  runTickPlugins(context, institutionEventPlugins, institutionBatch, grandReplies);
  for (const event of institutionBatch) {
    newEvents.push(event);
    if(!isPrivateTournamentBanquetEvent(event)&&!isPrivateVacantGateEvent(event)&&!isPrivateVillageReunionEvent(event)&&!isPrivatePilgrimageForkEvent(event))witnessEvent(nextState, event);
  }
  if(pendingGateEffects.size){
    const executed=new Set(newEvents.filter(event=>event.actorIds.length===1&&isPrivateVacantGateEvent(event)).flatMap(event=>[...event.actorIds]));
    for(const [actorId,planned] of pendingGateEffects){
      const applied=executed.has(actorId);
      if(planned.supplied)recordDecisionEffect?.(actorId,applied&&!planned.avatar);
      traceOptions?.onActor?.(actorId,[],applied);
      if(traceOptions?.captureTrace!==false)recordDecisionTrace(nextState,actorId,[],planned.decision,
        planned.avatar?'avatar':planned.model?'model':'utility',applied);
    }
  }
  for(const event of [...advanceDisasterShelters(nextState),
    ...advanceSeasonalHousing(nextState),
    ...advanceMentorTransfers(nextState),
    ...advanceSectStipends(nextState)]) {
    newEvents.push(event);
    witnessEvent(nextState,event);
  }
  for (const event of reconcileAscensionInterruptions(nextState)) {
    newEvents.push(event);
    witnessEvent(nextState, event);
  }
  for(const actual of settleBanquetSeats(nextState)){
    newEvents.push(actual);
    if(!isPrivateBanquetSeatEvent(actual))witnessEvent(nextState,actual);
  }
  for(const actual of advanceBoundaryGapResponses(nextState)){
    newEvents.push(actual);
    if(!isPrivateBoundaryGapEvent(actual))witnessEvent(nextState,actual);
  }
  for(const actual of advanceFurnaceEmergencies(nextState)){
    newEvents.push(actual);
    if(!isPrivateFurnaceEmergencyEvent(actual))witnessEvent(nextState,actual);
  }
  for(const publicPractice of recordApprenticeshipReunionRounds(nextState,newEvents)){
    newEvents.push(publicPractice);witnessEvent(nextState,publicPractice);
  }
  recordRegionalLatePromotions(nextState,prevState,newEvents);
  advanceCivicMemorials(nextState);
  advanceReliefHomecomings(nextState);
  advanceNightDoors(nextState);
}
