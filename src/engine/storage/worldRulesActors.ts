import type { Rule } from './primitives';
import { DRAMATIC_BOND_FACTS_MAX, DRAMATIC_BOND_WITNESSES_MAX } from '../dramaticBondTerms';
import { DRAMATIC_BOND_FACT_KINDS } from '../../types/dramaticBond';
import { lastRosterSchema } from '../lastRosterSchema';
import { banquetSeatSchema } from '../banquetSeatSchema';
import { nightDoorSchema } from '../nightDoorSchema';
import { reliefHomecomingSchema } from '../reliefHomecomingSchema';
import { boundaryGapSchema } from '../boundaryGapSchema';
import { abandonedQuarterSchema } from '../abandonedQuarterSchema';
import { furnaceEmergencySchema } from '../furnaceEmergencySchema';
import { apprenticeshipReunionSchema } from '../apprenticeshipReunionSchema';
import { FORBIDDEN_ART_IDS } from '../../types/forbiddenArt';
import { isOrdinaryActionEvidence } from '../ordinaryActionEvidence';
import { CAUSAL_CHRONICLE_MAX_NODES, CAUSAL_CHRONICLE_MAX_PREDECESSORS } from '../chronicleCausalityEngine';
import { TERRAIN_QUIET_CAP, TERRAIN_RECOVERY_LIMIT } from '../terrainSuccessionEngine';
import { validateEraHistoryShape } from '../storageEraHistoryValidation';
import { FLIGHT_HISTORY, FLIGHT_ROUNDS, FLIGHT_OUTCOMES, FLIGHT_REASONS, FLIGHT_MAX_POINTS } from '../../types/protagonistFlight';
import { ARBITRATION_MAX_OBSERVERS, ARBITRATION_MAX_APPOINTMENTS_PER_SIDE } from '../oathArbitrationEngine';
import { VILLAGE_CENSUS_PERIOD_LIMIT } from '../villageCensusEngine';
import { ROAD_PATH_POINT_LIMIT, ROAD_CONDITION_MAX, ROAD_FARE, ROAD_PAID_STRIDE } from '../roadEngine';
import { PILGRIMAGE_TILE_STRIDE } from '../pilgrimageEngine';
import { PROBATION_REQUIRED_RELIEF, PROBATION_REQUIRED_REVIEWS } from '../probationEngine';
import { optional, structure, arr, one, id, tick, month, oid, SAVE_COLLECTION_LIMIT, num, bool, otick, wealth, unsigned32, strings, text, ids, spirit, fictionalGender, sectRank, percentage, realm, fail, affinity, count, otext } from './primitives';
import { ascension, cultivationClans, tianjiGazette, immortalAuction, tournamentWagers, forbiddenContact, beastDuelContact, schoolFormDuel, technique, roguelikeRecord, facilityLevels, herbs, clanHeritage, heavenlyAlchemy, daoPath, destinyTraits, heartAftermath, forbiddenScar, action, editionKind, pills, artifact, memory, source, trueOnly, heartGuide, heartFrame, publicFact, daoActivation, grandSiegeTheatre, tournamentArena, expeditionDungeon, fieldReading, terrainBiome, proposal, vote, anchor, chronicleChapter, protagonistEvidence, waypostPoint, eligibility, observatoryActors, alignedWeatherReport, censusCount, censusNumber, relicSet } from './schemaFields';

export const worldRulesActors: Record<string, Rule> = {
  ascension:optional(ascension),
  cultivationClans:optional(cultivationClans),
  tianjiGazette:optional(tianjiGazette),
  immortalAuction:optional(immortalAuction),
  tournamentWagers:optional(tournamentWagers),
  dramaticBonds:optional(structure({facts:arr(DRAMATIC_BOND_FACTS_MAX,structure({
    kind:one(...DRAMATIC_BOND_FACT_KINDS),sourceEventId:id,tick,year:tick,month,siteId:id,venueKindAtSource:one('market','sect_hq'),actorIds:arr(2,id),
    witnessIds:optional(arr(DRAMATIC_BOND_WITNESSES_MAX,id)),
    alignmentsAtSource:optional(arr(2,one('正道','魔道','中立'))),winnerId:oid,fallenId:oid,
  }))})),
  forbiddenDuels:optional(arr(SAVE_COLLECTION_LIMIT,forbiddenContact)),
  beastDuelContacts:optional(arr(SAVE_COLLECTION_LIMIT,beastDuelContact)),
  schoolFormDuels:optional(arr(SAVE_COLLECTION_LIMIT,schoolFormDuel)),
  anomalyRelays:optional(structure({
    origins:arr(SAVE_COLLECTION_LIMIT,structure({eventId:id,hazardId:id,beastId:id,siteId:id,tileId:id,tick})),
    receipts:arr(SAVE_COLLECTION_LIMIT,structure({
      eventId:id,actorId:id,siteId:id,tick,channel:one('witness','conversation','flying_sword'),
      confidence:num(25,100,true),hops:num(0,4,true),originalWitnessId:id,senderId:oid,senderSiteId:oid,
    })),
  })),
  vacantGate:optional(structure({records:arr(SAVE_COLLECTION_LIMIT,structure({
    siegeId:id,siteId:id,lostActorId:id,lostRole:one('leader','ward_keeper'),lossTick:tick,lossEventId:id,roundTick:tick,
    roundEventId:id,actorId:id,move:one('guard','withdraw'),paidQi:one(0,8),wallSaved:optional(num(1,128,true)),destinationId:oid,
    wardProof:optional(structure({dispatcherId:id,dispatchTick:tick,dutyTick:tick})),
    requestedActorIds:optional(arr(SAVE_COLLECTION_LIMIT,id)),
  }))})),
  lastRosters:optional(lastRosterSchema({optional,structure,arr,one,id,tick},SAVE_COLLECTION_LIMIT)),
  banquetSeats:optional(banquetSeatSchema({optional,structure,arr,one,id,tick},SAVE_COLLECTION_LIMIT)),
  nightDoors:optional(nightDoorSchema({optional,structure,arr,one,id,tick},SAVE_COLLECTION_LIMIT)),
  reliefHomecomings:optional(reliefHomecomingSchema({optional,structure,arr,id,tick},SAVE_COLLECTION_LIMIT)),
  boundaryGapResponses:optional(boundaryGapSchema({optional,structure,arr,one,num,id,tick},SAVE_COLLECTION_LIMIT)),
  abandonedQuarters:optional(abandonedQuarterSchema({optional,structure,arr,id,tick,bool},SAVE_COLLECTION_LIMIT)),
  furnaceEmergencies:optional(furnaceEmergencySchema({optional,structure,arr,num,one,id,tick},SAVE_COLLECTION_LIMIT)),
  apprenticeshipReunions:optional(apprenticeshipReunionSchema({optional,structure,arr,id,tick},SAVE_COLLECTION_LIMIT)),
  pilgrimageForks:optional(structure({forks:arr(SAVE_COLLECTION_LIMIT,structure({
    id,journeyId:id,siteId:id,arrivalTick:tick,arrivalEventId:id,actors:arr(2,id),escortSiteId:id,closedTick:otick,
    choices:arr(2,structure({actorId:id,tick,move:one('escort','detour','remain'),targetLocationId:oid,
      path:optional(arr(6402,structure({x:num(0,1000),y:num(0,600)}))),pathIndex:optional(num(0,6401,true)),
      steps:optional(arr(6402,structure({tick,x:num(0,1000),y:num(0,600)}))),
      status:one('remaining','waiting','traveling','arrived','closed'),paidStones:one(0,8),
    })),
  }))})),
  battlefieldAftermath:optional(structure({
    approaches:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,defenderSectId:id,siteId:id,tick,fromSiteId:id})),
    cases:arr(SAVE_COLLECTION_LIMIT,structure({
      id,siegeId:id,siteId:id,actorId:id,terminalTick:tick,terminalEventId:id,leftTick:otick,
      approach:optional(structure({tick,fromSiteId:id})),
      decision:optional(structure({move:one('remain','return','offer_care','accept_care'),tick,targetLocationId:oid,
        targetCultivatorId:oid,healedHp:optional(num(1,1_000_000_000,true))})),
    })),
  })),
  villageReunions:optional(structure({pairs:arr(SAVE_COLLECTION_LIMIT,structure({
    id,villageId:id,firstVolunteerId:id,secondVolunteerId:id,firstHouseholdId:id,secondHouseholdId:id,
    firstRecruitTick:tick,firstRecruiterId:id,firstActorId:id,secondRecruitTick:otick,secondRecruiterId:oid,secondActorId:oid,
    arrival:optional(structure({tick,siteId:id,fromSiteId:id,actorId:id})),
    decisions:optional(arr(2,structure({actorId:id,tick,move:one('remember','part','offer','accept'),expiresTick:otick}))),refundTick:otick,
  }))})),
  wildMigrations:optional(structure({records:arr(SAVE_COLLECTION_LIMIT,structure({
    id,beastId:id,kind:one('妖兽','凶兽','瑞兽'),tick,sourceEventId:id,
    from:structure({siteId:id,sectId:id,witnessIds:arr(SAVE_COLLECTION_LIMIT,id)}),
    to:structure({siteId:id,sectId:id,witnessIds:arr(SAVE_COLLECTION_LIMIT,id)}),
    fromWeather:structure({season:one('春','夏','秋','冬'),kind:one('平息','灵潮','罡风','霜息'),intensity:num(0,1)}),
    toWeather:structure({season:one('春','夏','秋','冬'),kind:one('平息','灵潮','罡风','霜息'),intensity:num(0,1)}),
    responses:arr(2,structure({side:one('origin','destination'),actorId:id,tick,move:one('let_pass','track','drive'),destinationId:oid,paidQi:one(0,8)})),
  }))})),
  farewellLandings:optional(structure({records:arr(SAVE_COLLECTION_LIMIT,structure({
    id,actorId:id,deceasedId:id,deathEventId:id,sharedEventId:id,visitId:id,siteId:one('frontier-east-dock'),tick,
    move:one('keep_light','farewell'),paidStones:one(0,1),lightUntilTick:otick,
  }))})),
  mercyReunions:optional(structure({cases:arr(SAVE_COLLECTION_LIMIT,structure({
    id,victorId:id,sparedId:id,siteId:id,sparedTick:tick,sourceEventId:id,hpBefore:wealth,lethalDamage:wealth,appliedDamage:wealth,
    departure:optional(structure({actorId:id,fromSiteId:id,toSiteId:id,tick})),
    reunion:optional(structure({actorId:id,siteId:id,tick})),
    aid:optional(structure({offeredTick:tick,proposerId:id,targetId:id,destinationId:id,acceptedTick:otick})),
    outcome:optional(structure({move:one('stand_down','aid','challenge'),actorId:id,tick,sourceEventId:id})),
  }))})),
  pavilionFires:optional(structure({cases:arr(SAVE_COLLECTION_LIMIT,structure({
    id,siteId:id,sectId:id,tileId:id,hazardId:id,sourceEventId:id,openedTick:tick,heatTick:tick,scrollId:id,
    scrollStatus:one('shelved','carried','secured','lost'),copy:optional(technique),carrierId:oid,safeSiteId:oid,
    carriedTick:otick,securedTick:otick,lostTick:otick,ward:optional(structure({actorId:id,targetId:id,tick})),
    heat:optional(structure({tick,damage:arr(SAVE_COLLECTION_LIMIT,structure({cultivatorId:id,amount:wealth})),wardSaved:optional(wealth)})),
  }))})),
  roguelikeEncounters:optional(arr(SAVE_COLLECTION_LIMIT,roguelikeRecord)),
  tick, interventionSequence:tick, year:tick, month,
  random:structure({algorithm:one('mulberry32-v1'),seed:unsigned32,state:unsigned32}),
  sects:arr(SAVE_COLLECTION_LIMIT,structure({id,name:id,alignment:one('正道','魔道','中立'),color:strings(80),doctrine:text,reputation:num(-1_000_000,1_000_000),spiritStones:wealth,headquartersId:id,
    pavilion:arr(350,technique),leaderId:oid,inactiveSinceTick:otick, arrayHp:wealth,arrayMaxHp:wealth,
    facilities:facilityLevels,
    officeVacancy:optional(structure({eventId:id,tick})),
    succession:optional(structure({tick,method:one('election','challenge','coup'),previousLeaderId:oid,leaderId:id,supporterIds:ids})),
    monthlyEconomy:optional(structure({tick,taxes:wealth,mining:wealth,upkeep:wealth,net:num(-1_000_000_000,1_000_000_000)}))})),
  locations:arr(1200,structure({id,name:id,x:num(0,1000),y:num(0,600),type:one('sect_hq','spirit_vein','secret_realm','market','abyss'),spiritRoot:spirit,
    spiritQi:num(0,150),ownerSectId:oid,expeditionOmenId:oid,inheritanceScrolls:arr(350,technique),herbs,herbCapacity:herbs,furnaceGrade:one(0,1,2,3),description:text})),
  cultivators:arr(SAVE_COLLECTION_LIMIT,structure({id,name:id,gender:fictionalGender,clanHeritage:optional(clanHeritage),title:text,sectId:strings(240),sectRank,contribution:wealth,transgressions:percentage,disciplineRevision:otick,realm,realmStage:num(1,9,true),
    publicAlchemy:optional(arr(1200,structure({siteId:id,firstTick:tick,lastTick:tick,successes:num(1,100_000_000,true),bestGrade:one(1,2,3)}))),
    heavenlyAlchemy:optional(heavenlyAlchemy),
    daoPath:optional(daoPath),
    destinyTraits:optional(destinyTraits),
    heartDemonAftermath:optional(heartAftermath),
    forbiddenScars:optional(arr(FORBIDDEN_ART_IDS.length,forbiddenScar)),
    ordinaryActionEvidence:optional((value,path)=>{if(!isOrdinaryActionEvidence(value))fail(path);}),
    qiProgress:percentage,hp:wealth,maxHp:num(1,1_000_000_000),combatPower:wealth,age:wealth,lifespan:wealth,
    personality:one('刚正','阴险','狂傲','苟道','痴情','嗜血','逍遥','诡诈'),locationId:id,positionPlane:optional(one('threshold','upper','frontier','immortal')),spiritStones:wealth,karma:affinity,currentAction:action,
    innerMonologue:text,secretGoal:text,spiritRoot:spirit,technique,techniqueMastery:percentage,authoredTechnique:optional(technique),
    activeEdition:optional(structure({originalId:id,editionId:id,kind:editionKind})),herbs,pills,pillToxicity:percentage,
    exploredTileIds:ids,artifacts:arr(SAVE_COLLECTION_LIMIT,artifact),memories:arr(160,memory),coreMemories:arr(160,memory),memorySequence:tick,
    reflections:arr(100,structure({id,tick,kind:one('belief','obsession','heart_demon'),theme:one('cultivation','conflict','community','heavenly'),intensity:num(1,10),statement:text,sourceMemoryIds:ids,source})),
    rumors:arr(200,structure({id,subject:text,locationId:oid,originTick:tick,learnedTick:tick,provenance:one('witness','conversation','flying_sword','fabricated'),
      confidence:percentage,hops:count,sourceCultivatorId:oid,originEventId:oid,originSourceCultivatorId:oid,
      witnessScope:optional(one('participants')),lead:optional(bool)})),
    activeScheme:optional(structure({id,kind:one('infiltration','foundation_pill','vengeance','artifact_heist'),title:text,status:one('active','completed','failed'),
      startedTick:tick,finishedTick:otick,stepIndex:count,steps:arr(32,structure({label:text,completedTick:otick})),targetCultivatorId:oid,targetLocationId:oid,artifactName:otext,outcome:otext})),
    tribulation:optional(structure({heartTheatreArmed:optional(trueOnly),heartGuide:optional(heartGuide),heartDemon:optional(heartFrame),
      id,targetRealm:realm,startedTick:tick,stage:one('lightning','heart_demon','passed','failed'),nextWave:count,totalWaves:count,
      pressure:percentage,interruptions:count,resolvedTick:otick,lastOutcome:otext,lastActedTick:otick})),
    service:optional(structure({status:one('retired','serving'),changedTick:tick,retiredTick:tick,formerSectId:id,formerRank:sectRank})),
    guardAssignment:optional(structure({locationId:id,assignedTick:tick,expiresTick:tick})),namedHeirId:oid,alive:bool})),
  relationships:arr(SAVE_COLLECTION_LIMIT,structure({fromId:id,toId:id,type:one('师徒','同门','道侣','血仇','挚友','竞争'),affinity,note:text})),
  events:arr(200,structure({...publicFact,dialogueRedacted:optional(trueOnly),daoIntents:optional(arr(2,daoActivation)),forbiddenArt:optional(forbiddenScar),witnessScope:optional(one('participants')),duelWinnerId:oid,damage:optional(arr(SAVE_COLLECTION_LIMIT,structure({cultivatorId:id,amount:wealth})))})),
  chronicleCausality:structure({nextSequence:num(1,Number.MAX_SAFE_INTEGER,true), nodes:arr(CAUSAL_CHRONICLE_MAX_NODES,structure({
    eventId:id,tick,sequence:num(1,Number.MAX_SAFE_INTEGER,true),locationId:oid,entityId:id,
    kind:one('siege_launched','truce_signed','sect_vacancy','sect_election','market_buy_order','market_sell_order','market_shipment','market_settlement'),
    predecessors:arr(CAUSAL_CHRONICLE_MAX_PREDECESSORS,structure({eventId:id,relation:one('withdrew_siege',
      'filled_vacancy','matched_buy_order','matched_sell_order','settled_shipment')})),
    outcome:optional(one('truce_with_withdrawal','truce_signed','elected','local_fill','delivered','route_loss','escort_failed',
      'endpoint_missing','market_closed')),
  }))}),
  diplomacy:arr(1200,structure({sectAId:id,sectBId:id,affinity,pact:one('neutral','alliance','war'),sinceTick:tick,lastActionTick:otick})),
  sieges:arr(2000,structure({id,attackerSectId:id,defenderSectId:id,destinationId:id,participantIds:ids,status:one('marching','sieging','victory','repelled','withdrawn'),
    startedTick:tick,rounds:count,lastResolvedTick:otick,outcome:otext,theatre:optional(grandSiegeTheatre)})),
  tributeDemands:arr(2000,structure({id,demanderSectId:id,targetSectId:id,amount:wealth,status:one('pending','paid','rejected'),startedTick:tick,resolvedTick:otick})),
  occasions:arr(2000,structure({id,kind:one('tournament','expedition'),title:text,locationId:id,startedTick:tick,registrationClosesTick:tick,expiresTick:tick,
    status:one('registration','running','completed','cancelled'),participantIds:ids,remainingIds:ids,
    bouts:arr(30,structure({round:count,firstId:id,secondId:oid,winnerId:id})),
    expeditions:arr(30,structure({cultivatorId:id,tick,outcome:one('loot','wounded','death','escaped'),description:text})),round:count,championId:oid,lastResolvedTick:otick,
    omenId:oid,anchorSiteId:oid,arena:optional(tournamentArena),dungeon:optional(expeditionDungeon)})),
  expeditionOmens:structure({lastCalendarTick:otick,rows:arr(SAVE_COLLECTION_LIMIT,structure({
    id,siteId:id,operatorId:id,openedTick:tick,measuredTick:tick,measuredQi:num(0,150),reading:fieldReading,
    windowStartsTick:tick,windowEndsTick:tick,relay:optional(structure({recipientId:id,tick})),
    opening:optional(structure({tick,qi:num(0,150),reading:fieldReading,occasionId:id})),
  }))}),
  bounties:arr(2000,structure({id,targetCultivatorId:id,reason:text,issuedTick:tick,reward:wealth,status:one('open','claimed','withdrawn'),sponsorSectIds:ids,
    escrow:arr(48,structure({sectId:id,amount:wealth})),hunterId:oid,settledTick:otick})),
  terrain:structure({seed:unsigned32,columns:num(1,80,true),rows:num(1,80,true),tiles:arr(6400,structure({id,col:num(0,79,true),row:num(0,79,true),
    biome:one('灵山','毒沼','剑冢','荒漠','魔渊','坊市'),spiritQi:percentage,ownerSectId:oid}))}),
  mapPresentation:structure({tick,trails:arr(SAVE_COLLECTION_LIMIT,structure({cultivatorId:id,tick,fromLocationId:id,toLocationId:id,
    points:arr(6402,structure({x:num(0,1000),y:num(0,600)}))})),
    effects:arr(SAVE_COLLECTION_LIMIT,structure({id,tick,kind:one('damage','breakthrough','clash','lightning'),locationId:id,actorIds:ids,text:otext}))}),
  terrainSuccession:structure({lastAdvancedTick:otick,cells:arr(6400,structure({
    tileId:id,firstTick:tick,lastStressTick:tick,consecutiveStress:tick,quietTicks:num(0,TERRAIN_QUIET_CAP,true),baselineBiome:terrainBiome,baselineQi:percentage,
    recoverableLoss:percentage,permanentLoss:percentage,affectedBiome:optional(one('毒沼','荒漠')),scarredBiome:optional(one('荒漠')),
    phase:one('stressed','recovering','recovered','scarred'),workCount:num(0,TERRAIN_RECOVERY_LIMIT,true),lastWorkedTick:otick,lastWorkedBy:oid
  }))}),
  mapHazards:arr(1200,structure({id,kind:one('meteor','beast_tide','cursed_miasma'),tileId:id,createdTick:tick,expiresTick:tick,intensity:num(1,3,true)})),
  spiritBeasts:arr(500,structure({id,name:id,kind:one('妖兽','凶兽','瑞兽'),locationId:id,homeLocationId:id,hp:wealth,maxHp:num(1,1_000_000_000),
    power:wealth,cultivation:percentage,alive:bool,tamedBy:oid,nextActionTick:tick})),
  councils:arr(120,structure({id,tick,sectId:id,proposal,voterIds:arr(5,id),title:text,summary:text,
    rounds:arr(2,structure({round:one(1,2),turns:arr(5,structure({voterId:id,text,source}))})),
    ballots:arr(5,structure({voterId:id,vote,reason:text,source})),tally:structure({support:count,oppose:count,abstain:count,required:count}),
    status:one('passed','rejected','stale'),outcome:text})),
  chronicleArchive:structure({anchors:arr(384,anchor),chapters:arr(SAVE_COLLECTION_LIMIT,chronicleChapter)}),
  eraHistory:(value,path)=>validateEraHistoryShape(value,path,fail),
  witnessedPersonalStory:structure({scenes:arr(SAVE_COLLECTION_LIMIT,structure({
    eventId:id,tick,year:tick,month,siteId:id,kind:one('duel','socialize','breakthrough'),actorIds:arr(2,id),witnessIds:ids,
  }))}),
  protagonistSuccession:structure({lastEvaluatedTick:otick,arcs:arr(SAVE_COLLECTION_LIMIT,structure({
    id,actorId:id,openedTick:tick,predecessorArcId:oid,opening:arr(3,protagonistEvidence),support:arr(8,protagonistEvidence),
    endedTick:otick,closeReason:optional(one('public_death','receded','evidence_lost')),death:optional(protagonistEvidence),
    handoff:optional(structure({exitKind:one('public_death','ascension'),exitEventId:id,ties:arr(3,structure({
      kind:one('encounter','practice','duel'),eventId:id,tick,siteId:id,
    }))})),
  }))}),
  protagonistFlights:optional(arr(FLIGHT_HISTORY,structure({
    id,arcId:id,actorId:id,guideId:id,pursuerId:id,bountyId:id,journeyId:id,contactEventId:id,originId:id,destinationId:id,
    openedTick:tick,rounds:arr(FLIGHT_ROUNDS,structure({tick,round:one(1,2,3),outcome:one(...FLIGHT_OUTCOMES),
      reason:optional(one(...FLIGHT_REASONS)),locationId:oid,sourceEventId:oid,points:arr(FLIGHT_MAX_POINTS,waypostPoint)})),
  }))),
  coldHistory:structure({chapters:arr(SAVE_COLLECTION_LIMIT,chronicleChapter),droppedChapters:tick}),
  decisionTrace:structure({records:arr(100,structure({id,actorId:id,tick,source:one('model','utility','avatar'),applied:bool,
    chosenAction:one('REST','CULTIVATE','BREAKTHROUGH','SOCIALIZE','EXPLORE','FACE_TRIBULATION','redacted'),chosenCandidateId:oid,
    candidates:arr(48,structure({id,action:one('REST','CULTIVATE','BREAKTHROUGH','SOCIALIZE','EXPLORE','FACE_TRIBULATION'),
      score:num(-1000,1000),reason:one('recover','cultivate','ready','social','travel','tribulation'),
      targetLocationId:oid,targetCultivatorId:oid,tribulationStance:optional(one('guard','focus','defy'))}))}))}),
  estates:structure({entries:arr(SAVE_COLLECTION_LIMIT,structure({id,deceasedId:id,locationId:id,openedTick:tick,closesTick:tick,
    namedHeirId:oid,sponsorSectId:oid,status:one('open','settled','unclaimed'),
    holdings:structure({stones:wealth,herbs,pills,artifacts:arr(SAVE_COLLECTION_LIMIT,artifact)}),
    distributed:structure({stones:wealth,herbs,pills,artifactIds:ids}),
    eligibleHeirs:arr(SAVE_COLLECTION_LIMIT,structure(eligibility)),claims:arr(SAVE_COLLECTION_LIMIT,structure({...eligibility,tick})),
    beneficiaryId:oid,settledTick:otick,memorial:optional(structure({tick,organizerId:id,attendeeIds:ids,relationshipImpacts:count}))}))}),
  witnesses:structure({nextId:tick,
    facts:arr(240,structure({eventId:id,tick,locationId:id,participantIds:arr(2,id),winnerId:id,witnessIds:ids})),
    claims:arr(80,structure({id,sourceEventId:id,publicationEventId:id,claimantId:id,subjectId:id,locationId:id,
      filedTick:tick,deadlineTick:tick,challengeUntilTick:tick,status:one('pending','disputed','corroborated','retracted'),
      attestations:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,tick,verdict:one('supports','contradicts')})),
      appeal:optional(structure({tick,actorId:id,verdict:one('upheld','rejected'),reason:text})),settledTick:otick,
      reputationSectId:oid,reputationPenalty:percentage,reputationRestored:percentage,reason:otext}))}),
  fieldObservatories:structure({byActor:observatoryActors}),
  alignedWeather:structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),comparisons:arr(SAVE_COLLECTION_LIMIT,structure({
    id,siteId:id,observerAId:id,observerBId:id,measuredTick:tick,offeredTick:tick,expiresTick:tick,
    status:one('offered','compared','declined','withdrawn','expired'),first:alignedWeatherReport,
    second:optional(alignedWeatherReport),settledTick:otick,outcome:optional(one('agrees','uncertain')),
  }))}),
  oathArbitrations:structure({
    observations:arr(SAVE_COLLECTION_LIMIT,structure({oathId:id,tenderTick:tick,siteId:id,observerIds:arr(ARBITRATION_MAX_OBSERVERS,id)})),
    cases:arr(SAVE_COLLECTION_LIMIT,structure({
      id,oathId:id,siteId:id,requesterId:id,providerId:id,tenderTick:tick,openedTick:tick,joinUntilTick:tick,joinedTick:otick,expiresTick:otick,
      status:one('offered','hearing','closed'),closedTick:otick,disposition:optional(one('refund','inconclusive','unjoined','external_settlement')),
      appointments:arr(2 * ARBITRATION_MAX_APPOINTMENTS_PER_SIDE,structure({
        side:one('requester','provider'),appointeeId:id,nominatedTick:tick,acceptedTick:otick,endedTick:otick,
        recusal:optional(one('voluntary','faction','personal_tie','prior_obligation','unavailable')),
        vote:optional(one('refund','inconclusive')),votedTick:otick
      })),
      filing:optional(structure({observerId:id,tick}))
    }))
  }),
  mortalAgeTrackingSinceTick:otick,
  villageCensuses:structure({periods:arr(VILLAGE_CENSUS_PERIOD_LIMIT,structure({
    tick,year:tick,month,opening:arr(SAVE_COLLECTION_LIMIT,censusCount),closing:optional(arr(SAVE_COLLECTION_LIMIT,censusCount)),
    movements:arr(SAVE_COLLECTION_LIMIT,structure({
      id,kind:one('birth','maturation','death','migration','enrollment'),villageId:id,targetVillageId:oid,people:censusNumber,
      volunteerId:oid,cultivatorId:oid,bornTick:otick,deathCause:optional(one('old_age'))
    })),
    observations:arr(SAVE_COLLECTION_LIMIT,structure({villageId:id,observerId:id,count:censusCount,
      sample:optional(structure({householdId:id,adults:censusNumber,juveniles:censusNumber,namedResidents:censusNumber}))}))
  }))}),
  roads:structure({nextId:num(1,100_000_000,true),lastAdvancedTick:otick,links:arr(SAVE_COLLECTION_LIMIT,structure({
    id,sectId:id,anchorSiteId:id,otherSiteId:id,path:arr(ROAD_PATH_POINT_LIMIT,structure({x:num(0,1000),y:num(0,600)})),
    condition:num(0,ROAD_CONDITION_MAX,true),openedTick:tick,lastMaintainedTick:otick,lastMaintainedBy:oid,lastPatrolledTick:otick,
    lastPatrolledBy:oid,closedTick:otick,closeReason:optional(one('title_lost','endpoint_lost'))
  })),crossings:arr(SAVE_COLLECTION_LIMIT,structure({
    id,roadId:id,journeyId:id,legIndex:one(0,1),payerId:id,companionId:id,departedTick:tick,
    fee:num(ROAD_FARE,ROAD_FARE,true),stride:num(ROAD_PAID_STRIDE,ROAD_PAID_STRIDE,true),
    paidSteps:num(1,ROAD_PATH_POINT_LIMIT - 1,true),freeSteps:num(1,6402,true),freeStride:num(PILGRIMAGE_TILE_STRIDE,PILGRIMAGE_TILE_STRIDE,true)
  }))}),
  probation:structure({nextId:num(1,100_000_000,true),expulsions:arr(SAVE_COLLECTION_LIMIT,structure({
    id,actorId:id,sectId:id,tick,transgressions:percentage,disciplineRevision:tick,reinstatedTick:otick,reinstatedRevision:otick,lastCaseClosedTick:otick
  })),cases:arr(SAVE_COLLECTION_LIMIT,structure({
    id,expulsionId:id,actorId:id,sectId:id,villageIds:arr(2,id),disciplineRevision:tick,
    status:one('requested','active','ready','reinstated','withdrawn','rejected','expired'),requestedTick:tick,requestExpiresTick:tick,
    sponsorId:oid,admittedTick:otick,deadlineTick:otick,settledTick:otick,
    reason:optional(one('withdrawn','deadline','new_misconduct','unavailable','review_oppose')),
    relief:arr(PROBATION_REQUIRED_RELIEF,structure({sourceId:id,tick,actorId:id,settlementId:id,stones:wealth,herbs:count})),
    reviews:arr(PROBATION_REQUIRED_REVIEWS,structure({reviewerId:id,tick,vote:one('support','oppose')}))
  }))}),
  relicExhibits:structure({nextId:num(1,100_000_000,true),entries:arr(SAVE_COLLECTION_LIMIT,structure({
    id,artifactId:id,setId:relicSet,ownerId:id,hostSectId:id,hostLeaderId:id,siteId:id,offeredTick:tick,offerExpiresTick:tick,
    status:one('offered','on_display','closed'),acceptedTick:otick,expiresTick:otick,closedTick:otick,
    closeReason:optional(one('declined','withdrawn','offer_expired','item_unavailable','owner_died',
      'recalled','host_closed','term_complete','host_breach')),custody:optional(artifact)
  }))}),
};
