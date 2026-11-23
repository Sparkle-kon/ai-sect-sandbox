import type { Rule } from './primitives';
import { UPPER_PASSAGE_PATH } from '../upperPassageTerms';
import { UPPER_ARRAY_FIELD_SITE_IDS, UPPER_ARRAY_FIELD_HOME } from '../upperArrayFieldTerms';
import { validateUpperArrayFieldLocalShape } from '../upperArrayFieldLocalValidation';
import { validateUpperArrayFieldTradeShape } from '../upperArrayFieldTradeTerms';
import { VILLAGE_SUPPLY_MAX_ROUTE_TILES } from '../villageSupplyAccounting';
import { CHRONICLE_ERRATA_MAX_RETELLINGS } from '../chronicleErrataEngine';
import { SCRIBE_COMMISSION_WAGE, SCRIBE_COMMISSION_DEPOSIT, SCRIBE_COMMISSION_INK } from '../../types/scribeCommission';
import { validateEraDesignDraft } from '../eraDesignSchema';
import { SCENARIO_AUDIT_VERSION, SCENARIO_MAX_OBJECTIVES } from '../scenarioObjectiveEngine';
import { VILLAGE_EVOLUTION_SAMPLE_COUNT, VILLAGE_EVOLUTION_MAX_ADULTS_PER_MOVE } from '../villageEvolutionTerms';
import { optional, structure, one, num, arr, SAVE_COLLECTION_LIMIT, id, tick, oid, otick, fail, month, authoredHash, count, ids, strings, authoredEraEffect, unsigned32, bool, wealth, otext, text, percentage, fictionalGender, spirit } from './primitives';
import { censusNumber, relicSet, errataSourceFact, chronicleReading, scenarioObjective, scenarioEvidence, doctrineMaturity, doctrineTheme, doctrineAmount, evolutionStage, evolutionSample, marketFreightProofLimit, marketGood, marketQty, marketPrice, technique } from './schemaFields';

export const worldRulesFrontier: Record<string, Rule> = {
  upperPassage:optional(structure({version:one(1),upperReserve:num(0,Number.MAX_SAFE_INTEGER,true),
    journeys:arr(SAVE_COLLECTION_LIMIT,structure({id,actorId:id,openingId:id,wellProjectId:id,enteredTick:tick,paidStones:one(8),
      direction:one('outbound','inbound'),steps:arr(12,structure({tick,nodeId:one(...UPPER_PASSAGE_PATH),
        direction:one('outbound','inbound'),crossingOpeningId:oid})),returnedTick:otick,deceasedTick:otick,
      reading:optional(structure({tick,openingId:id,wellProjectId:id,veinId:one('north-cold-water'),siteId:one('loc-vein-north'),
        loss:optional(structure({plotId:id,sampleTick:tick,fieldDeficit:num(1,3,true),harvestedTick:tick,yield:one(0,1)}))})),
      petition:optional(structure({tick,paidStones:one(4,10),outcome:one('lower_relief','ordinary'),readingTick:tick})),
    }))})),
  upperArrayField:optional(structure({version:one(1),
    visits:arr(SAVE_COLLECTION_LIMIT,structure({id,actorId:id,journeyId:id,enteredTick:tick,paidStones:one(4),
      steps:arr(SAVE_COLLECTION_LIMIT,structure({tick,siteId:one(...UPPER_ARRAY_FIELD_SITE_IDS)})),exitedTick:otick,deceasedTick:otick})),
    residences:arr(SAVE_COLLECTION_LIMIT,structure({id,actorId:id,visitId:id,homeSiteId:one(UPPER_ARRAY_FIELD_HOME),settledTick:tick,
      paidStones:one(4),paidRoots:one(1)})),
    production:optional((value,path)=>validateUpperArrayFieldLocalShape(value,path,fail)),
    trade:optional((value,path)=>validateUpperArrayFieldTradeShape(value,path,fail)),
  })),
  northWellRevisitLaw:optional(structure({version:one(1),kind:one('authored_old_village_restriction'),id,
    declaredTick:tick,year:tick,month,nativeFrameDigest:authoredHash,sourceCharterId:id,freightClosedTick:tick,
    siteId:one('loc-vein-north'),wellProjectId:id,retainedPopulation:censusNumber})),
  northWellRevisitReviews:optional(structure({version:one(1),decisions:arr(SAVE_COLLECTION_LIMIT,structure({
    id,actorId:id,sourceCharterId:id,freightClosedTick:tick,surveyId:id,tick,year:tick,month,move:one('keep','permit'),paidStones:one(4),
    lawId:oid,permit:optional(structure({validFromTick:tick,expiresTick:tick,spentTick:otick,miningReceiptId:oid})),
  }))})),
  northMiningCharters:optional(structure({version:one(1),charters:arr(SAVE_COLLECTION_LIMIT,structure({
    id,proposedTick:tick,year:tick,month,expiresTick:tick,proposerId:id,stance:one('seal','continue','detour'),
    status:one('proposed','ratified','expired'),siteId:one('loc-vein-north'),settlementId:id,wellProjectId:id,openingId:id,
    plotId:id,fieldObservedTick:tick,fieldDeficit:num(1,3,true),miningReceiptId:id,sponsorSectId:id,
    signatures:arr(3,(value,path)=>{
      const role=(value as {role?:unknown}|null)?.role;
      if(role==='household')return structure({role:one('household'),actorId:id,tick,householdId:id,volunteerId:id,recruitedTick:tick})(value,path);
      if(role==='miner')return structure({role:one('miner'),actorId:id,tick,miningReceiptId:id})(value,path);
      return structure({role:one('sect'),actorId:id,tick,sectId:id})(value,path);
    }),ratifiedTick:otick,paidStones:optional(one(0,24)),
    route:optional(structure({fromSettlementId:id,toSettlementId:id,originalTiles:arr(VILLAGE_SUPPLY_MAX_ROUTE_TILES,id),
      detourTiles:arr(VILLAGE_SUPPLY_MAX_ROUTE_TILES,id)})),
    firstPassage:optional(structure({agreementId:id,tick,good:one('stone','earth_root'),
      checkpoint:num(1,VILLAGE_SUPPLY_MAX_ROUTE_TILES-1,true),tileId:id})),
  }))})),
  coldWaterVein:optional(structure({version:one(1),veinId:one('north-cold-water'),siteId:one('loc-vein-north'),
    settlementId:id,tileIds:arr(3,id),oreRemaining:num(0,18,true),lastAdvancedTick:otick,
    openings:arr(SAVE_COLLECTION_LIMIT,structure({id,openedTick:tick,year:tick,month,openerId:id,sectId:id,wellProjectId:id,
      paidStones:one(40),borrowedUnits:one(0,3,9),renewal:optional(structure({id,stance:one('reuse','sect','accord')})),completedTick:otick})),
    observations:arr(SAVE_COLLECTION_LIMIT,structure({id,actorId:id,tick,year:tick,month,paidStones:num(2,2,true),
      wellDepth:optional(num(21,24,true)),fieldDeficit:optional(num(1,3,true)),mineYield:num(0,2,true),
      symptom:optional(one('well','field','mine','recovered'))})),
    mining:arr(18,structure({id,actorId:id,tick,units:num(1,2,true)})),
  })),
  eraHeritage:optional(structure({version:one(1),
    oaths:arr(SAVE_COLLECTION_LIMIT,structure({tick,year:tick,month,oathId:id,eventId:id,locationId:id,
      requesterId:id,providerId:id,term:one('foundation_pill','jade_herb'),quantity:count,payment:count,collateral:count})),
    artifacts:arr(SAVE_COLLECTION_LIMIT,structure({tick,year:tick,month,artifactId:id,eventId:id,locationId:id,
      makerId:id,setId:relicSet,fragmentIds:arr(2,id)})),
    facts:arr(SAVE_COLLECTION_LIMIT,structure({tick,year:tick,month,source:errataSourceFact,firsthandIds:ids,
      retellings:arr(CHRONICLE_ERRATA_MAX_RETELLINGS,structure({id,sourceEventId:id,authorId:id,tick,reading:chronicleReading})),
      correction:optional(structure({id,sourceEventId:id,editorId:id,tick,reading:chronicleReading,
        contestedRetellingIds:arr(CHRONICLE_ERRATA_MAX_RETELLINGS,id)})),
      relays:arr(SAVE_COLLECTION_LIMIT,structure({learnerId:id,originWitnessId:id,learnedTick:tick}))})),
  })),
  scribeCommissions:optional(structure({version:one(1),nextId:num(1,Number.MAX_SAFE_INTEGER,true),
    commissions:arr(SAVE_COLLECTION_LIMIT,structure({
      id,patronId:id,scribeId:id,siteId:id,sourceEventId:id,sourceTick:tick,offeredTick:tick,offerExpiresTick:tick,
      status:one('offered','accepted','verified','delivered','declined','withdrawn','expired','unavailable'),
      unavailableActorId:oid,escrowStones:one(0,SCRIBE_COMMISSION_WAGE,SCRIBE_COMMISSION_DEPOSIT),refundedStones:one(0,SCRIBE_COMMISSION_WAGE,SCRIBE_COMMISSION_DEPOSIT),acceptedTick:otick,workExpiresTick:otick,closedTick:otick,
      verification:optional(structure({tick,inkPaid:one(SCRIBE_COMMISSION_INK),retellingIds:arr(2,id),correctionId:oid})),
      manuscript:optional(structure({id,tick,wagePaid:one(SCRIBE_COMMISSION_WAGE)})),
    }))
  })),
  regionalSimulation:optional(structure({
    version:one(1),focusSiteId:id,
    promotions:optional(arr(SAVE_COLLECTION_LIMIT,(value,path)=>{
      const base={observedTick:tick,startsTick:tick,throughTick:tick,sourceId:id,
        fromRegionId:one('west','center','east'),toRegionId:one('west','center','east')};
      const row=value as {kind?:unknown}|null;
      if(row?.kind==='courier_crossed'||row?.kind==='escort_crossed'){
        const crossing={...base,startIndex:tick,endIndex:tick,crossedTileIds:arr(32,id),actorId:id};
        if(row.kind==='escort_crossed')return structure({...crossing,kind:one('escort_crossed'),shipmentId:id})(value,path);
        return structure({...crossing,kind:one('courier_crossed')})(value,path);
      }
      const arriving={...base,sourceSiteId:id,destinationSiteId:id};
      if(row?.kind==='siege_arrived')return structure({...arriving,kind:one('siege_arrived'),eventId:id,actorId:id})(value,path);
      return structure({...arriving,kind:one('actor_returned'),eventId:oid,witnessIds:ids})(value,path);
    })),
    registrations:arr(SAVE_COLLECTION_LIMIT,structure({kind:one('actor','site','settlement'),id,
      originRegionId:one('west','center','east'),registeredTick:tick})),
    routes:arr(SAVE_COLLECTION_LIMIT,structure({kind:one('road','courier','escort','relocation','pilgrimage','village_supply','danxia_medicine','boundary_relief','expedition_rescue'),
      id,firstKnownTick:tick,regions:arr(3,one('west','center','east'))})),
    actors:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,regionId:one('west','center','east'),year:tick,
      deferredMonths:num(0,12,true),lastDeferredTick:tick})),
    annual:arr(36,structure({year:tick,tick,regionId:one('west','center','east'),
      actorMonths:num(0,Number.MAX_SAFE_INTEGER,true),waivedActorMonths:num(0,Number.MAX_SAFE_INTEGER,true),
      actors:num(0,Number.MAX_SAFE_INTEGER,true),
      qiAdded:num(0,Number.MAX_SAFE_INTEGER),hpAdded:num(0,Number.MAX_SAFE_INTEGER)})),
  })),
  authoredEraOrigin:optional(structure({version:one(1),id,openedTick:tick,year:tick,month,
    draft:(value,path)=>{try{validateEraDesignDraft(value);}catch{fail(path);}},
    baselineDigest:authoredHash,designDigest:authoredHash,rulesRevision:strings(128,1),openingEventIds:ids,effects:arr(3,authoredEraEffect)})),
  scenarioAudit:optional(structure({version:one(SCENARIO_AUDIT_VERSION),scenarioId:id,seed:unsigned32,profileId:one('classic','spirit-bloom','fractured-frontier'),
    evaluatedTick:num(1,120,true),cards:arr(SCENARIO_MAX_OBJECTIVES,structure({id,objective:scenarioObjective,passed:bool,evidence:scenarioEvidence}))})),
  worldgen:optional(structure({algorithm:one(1),profileId:one('classic','spirit-bloom','fractured-frontier'),
    seed:unsigned32,birthTick:one(1),resources:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,locationId:id,pathSteps:num(0,6402,true)}))})),
  doctrineFoundings:structure({foundings:arr(SAVE_COLLECTION_LIMIT,structure({
    id,schoolId:id,parentSectId:id,independentSectId:id,oldSiteId:id,relocationPlanId:id,abandonedSiteId:id,
    autonomyProposalId:id,scriptureId:id,founderId:id,independentName:id,schoolTreasury:wealth,proposedTick:tick,expiresTick:tick,
    status:one('proposed','established','declined','withdrawn','expired','invalidated'),
    authorization:optional(structure({actorId:id,tick,siteId:id})),
    consents:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,tick,withdrawnTick:otick})),
    settlement:optional(structure({tick,actorId:oid,memberIds:optional(ids),transferredStones:optional(wealth)})),
    continuity:optional(structure({tick,previousLeaderId:id,successorId:id,eventId:id,cause:one('native_succession')})),
    maturity:optional(doctrineMaturity),
  }))}),
  doctrines:structure({nextId:num(1,100_000_000,true),
    schools:arr(SAVE_COLLECTION_LIMIT,structure({id,parentSectId:id,theme:doctrineTheme,founderId:id,stewardId:oid,
      foundedTick:tick,status:one('attached','autonomous','reconciled'),memberIds:ids,treasury:doctrineAmount,foundedSectId:oid,
      lastChangeTick:otick,lastTrainingTick:otick})),
    endorsements:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,sectId:id,schoolId:id,theme:doctrineTheme,tick,
      evidenceCount:num(1,100,true),score:num(0,10_000)})),
    proposals:arr(SAVE_COLLECTION_LIMIT,structure({id,schoolId:id,kind:one('separation','reconciliation'),
      openedTick:tick,expiresTick:tick,stewardId:id,leaderId:id,amount:doctrineAmount,
      status:one('pending','accepted','declined','expired','invalidated'),
      votes:arr(2,structure({actorId:id,tick,verdict:one('accept','decline')})),settledTick:otick,reason:otext})),
    records:arr(128,structure({id,tick,schoolId:id,
      kind:one('endorse','proposal','separation','reconciliation','declined','expired','invalidated','join','leave','training'),
      actorIds:ids,amount:doctrineAmount,support:tick,description:text}))}),
  villageEvolution:structure({
    villages:arr(48,structure({settlementId:id,siteId:id,registeredName:id,status:evolutionStage,
      pendingDepopulationRecordId:oid,samples:arr(VILLAGE_EVOLUTION_SAMPLE_COUNT,evolutionSample),
      changes:arr(SAVE_COLLECTION_LIMIT,structure({tick,from:evolutionStage,to:evolutionStage,
        reason:one('sustained_growth','depopulated','actual_return'),population:count,sourceRecordId:oid,
        growthSamples:optional(arr(VILLAGE_EVOLUTION_SAMPLE_COUNT,evolutionSample))}))})),
    migrations:arr(SAVE_COLLECTION_LIMIT,structure({id,tick,fromSettlementId:id,toSettlementId:id,agreementId:id,
      path:arr(VILLAGE_SUPPLY_MAX_ROUTE_TILES,id),people:num(1,VILLAGE_EVOLUTION_MAX_ADULTS_PER_MOVE,true),
      fromBefore:count,fromAfter:count,toBefore:count,toAfter:count,leftJuveniles:count,leftNamed:count,
      households:arr(VILLAGE_EVOLUTION_MAX_ADULTS_PER_MOVE,structure({householdId:id,adults:num(1,VILLAGE_EVOLUTION_MAX_ADULTS_PER_MOVE,true)}))})),
  }),
  settlements:structure({lastAdvancedTick:otick,
    villages:arr(48,structure({id,locationId:id,name:id,population:count,capacity:count,stress:percentage,
      volunteers:arr(SAVE_COLLECTION_LIMIT,structure({id,name:id,gender:fictionalGender,age:wealth,spiritRoot:spirit,willingness:percentage,aptitude:percentage,
        enlistedCultivatorId:oid,cohortYear:otick})),
      nextVolunteerSequence:optional(num(1,100_000_000,true)),
      juvenileCohorts:optional(arr(200,structure({bornTick:tick,count}))),lastCohortYear:otick,lastRecruitTick:otick,
      lastDisasterTick:otick,lastReliefTick:otick})),
    records:arr(SAVE_COLLECTION_LIMIT,structure({id,tick,kind:one('disaster','migration','relief','recruitment','growth','old_age'),settlementId:id,targetSettlementId:oid,
      actorId:oid,sectId:oid,volunteerId:oid,cultivatorId:oid,people:count,stones:wealth,herbs:count,description:text,
      oldAgeCohorts:optional(arr(SAVE_COLLECTION_LIMIT,structure({householdId:id,bornTick:tick,count:tick})))}))}),
  markets:structure({nextId:tick,
    orders:arr(320+2*marketFreightProofLimit,structure({id,sequence:tick,actorId:id,locationId:id,side:one('buy','sell'),good:marketGood,
      quantity:marketQty,remaining:num(0,12,true),limitPrice:marketPrice,escrowStones:wealth,escrowGoods:num(0,12,true),
      placedTick:tick,expiresTick:tick,status:one('open','filled','cancelled','expired'),settledTick:otick})),
    shipments:arr(160+marketFreightProofLimit,structure({id,sequence:tick,buyOrderId:id,sellOrderId:id,buyerId:id,sellerId:id,originId:id,destinationId:id,
      good:marketGood,quantity:marketQty,unitPrice:marketPrice,departedTick:tick,arrivalTick:tick,
      status:one('in_transit','delivered','lost','returned'),settledTick:otick,reason:otext})),
    receipts:arr(100+marketFreightProofLimit,structure({id,sequence:tick,buyerId:id,sellerId:id,originId:id,destinationId:id,
      good:marketGood,quantity:marketQty,unitPrice:marketPrice,tick,status:one('local_fill','delivered','lost','returned'),shipmentId:oid,reason:otext}))}),
  oaths:structure({nextId:tick,contracts:arr(300,structure({id,requesterId:id,providerId:id,locationId:id,
    term:one('foundation_pill','jade_herb'),quantity:num(1,100,true),payment:wealth,collateral:wealth,
    offeredTick:tick,offerExpiresTick:tick,deadlineTick:otick,appealUntilTick:otick,
    status:one('offered','active','declined','fulfilled','breached','excused','expired'),
    escrow:structure({payment:wealth,collateral:wealth}),
    evidence:arr(60,structure({tick,actorId:id,kind:one('tender','delivery'),locationId:id,quantity:count,requesterPresent:bool})),
    appeal:optional(structure({tick,appellantId:id,status:one('upheld','rejected'),reason:text})),settledTick:otick,outcome:otext}))}),
  mentorship:structure({
    offers:arr(SAVE_COLLECTION_LIMIT,structure({id,mentorId:id,studentId:id,technique,createdTick:tick,expiresTick:tick,
      status:one('pending','accepted','declined','expired'),resolvedTick:otick,outcome:otext,
      swordPractice:optional(structure({tick,siteId:id,masteryBefore:percentage,masteryAfter:percentage}))})),
    lineage:arr(SAVE_COLLECTION_LIMIT,structure({mentorId:id,studentId:id,technique,formedTick:tick,lastLessonTick:tick,lessons:count,flaw:percentage})),
    budgets:arr(SAVE_COLLECTION_LIMIT,structure({mentorId:id,tick,spent:num(0,2,true)})),lastMaintainedTick:otick}),
  mentorTransfers:structure({nextId:tick,
    releases:arr(SAVE_COLLECTION_LIMIT,structure({id,studentId:id,oldMentorId:id,sourceTuitionId:id,techniqueId:id,
      formedTick:tick,lastLessonTick:tick,endedTick:tick,endedById:id})),
    transfers:arr(SAVE_COLLECTION_LIMIT,structure({id,releaseId:id,studentId:id,newMentorId:id,techniqueId:id,sectId:id,siteId:id,
      offeredTick:tick,expiresTick:tick,status:one('offered','accepted','declined','expired','held'),acceptTick:otick,periodTick:otick,
      teachTick:otick,attendTick:otick,closedTick:otick,reason:optional(one('offer_expired','absent_signature','unavailable','no_budget')),
      lesson:optional(structure({tick,masteryBefore:num(0,100),masteryAfter:num(0,100),instructionSpent:num(1,1,true)}))}))}),
};
