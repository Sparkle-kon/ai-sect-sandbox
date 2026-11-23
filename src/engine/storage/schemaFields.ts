import { GRAND_SIEGE_HERO_MOVES } from '../../types/grandSiege';
import { PILGRIMAGE_LEG_COST } from '../pilgrimageEngine';
import { RESOURCE_FLOW_MONTH_LIMIT, RESOURCE_FLOW_DETAIL_LIMIT } from '../resourceFlowEngine';
import { MARKET_FREIGHT_MAX_LOAD } from '../marketFreightTerms';
import { FRONTIER_FARM_REGIONS } from '../frontierTerms';
import { DOCTRINE_MATURITY_HAZARD_TICKS } from '../doctrineMaturityTerms';
import { VILLAGE_SUPPLY_MAX_ROUTE_TILES } from '../villageSupplyAccounting';
import { DISASTER_SHELTER_MAX_PATH } from '../disasterShelterCheckpoint';
import { SCENARIO_MAX_POPULATION_TARGET, SCENARIO_MAX_SITE_QI_TARGET, SCENARIO_MAX_TREASURY_TARGET } from '../scenarioObjectiveEngine';
import { ANNOTATION_MAX_TITLE_CHARS } from '../annotationState';
import { OBSERVATORY_INBOX_LIMIT } from '../fieldObservatoryEngine';
import { ROGUELIKE_ENCOUNTER_KINDS, ROGUELIKE_ENCOUNTER_CHOICES } from '../../types/roguelikeEncounter';
import { DESTINY_TRAIT_IDS } from '../../types/destinyTrait';
import { RING_AUDIENCE_MAX_SESSIONS, RING_AUDIENCE_MAX_TURNS } from '../ringAudienceTerms';
import { RING_AUDIENCE_AIMS } from '../../types/ringAudience';
import { HEART_DEMON_CHOICES } from '../../types/heartDemon';
import { FORBIDDEN_ART_IDS } from '../../types/forbiddenArt';
import { HEAVENLY_ALCHEMY_MAX_ATTEMPTS } from '../heavenlyAlchemyTerms';
import { HEAVENLY_RECIPE_IDS, HEAVENLY_HEATS, HEAVENLY_QUALITIES } from '../../types/heavenlyAlchemy';
import { DAO_PATH_IDS } from '../../types/daoPath';
import { DAO_INTENT_QI, DAO_PATH_MAX_PRACTICES, DAO_INTENT_HISTORY } from '../daoPathTerms';
import { IMMORTAL_AUCTION_PILLS } from '../../types/immortalAuction';
import { IMMORTAL_AUCTION_HISTORY, IMMORTAL_AUCTION_MAX_BID, IMMORTAL_AUCTION_MAX_BIDS } from '../immortalAuctionTerms';
import { TIANJI_GAZETTE_HISTORY, TIANJI_GAZETTE_KINDS } from '../tianjiGazetteTerms';
import { CLAN_INNATE_TRAITS } from '../../types/cultivationClan';
import { CLAN_CEREMONY_QI, CLAN_BIRTH_EARNED_MONTHS } from '../cultivationClanTerms';
import { ASCENSION_OPEN_QI, ASCENSION_WAVES } from '../ascensionTerms';
import { structure, id, optional, sectRank, tick, otick, arr, num, wealth, SAVE_COLLECTION_LIMIT, one, percentage, bool, count, realm, fail, oid, ids, spirit, text, month, otext, strings } from './primitives';
import type { Validator } from './primitives';

export const grandSiegeFighter = structure({ actorId:id, sectId:id, rank:optional(sectRank) });
export const grandSiegeTheatre = structure({
  openedTick:tick, sourceLaunchId:id, arrivedTick:otick,
  rounds:arr(7,structure({
    round:num(1,7,true), tick, sourceEventId:id, wallBefore:wealth, wallAfter:wealth, wallMax:wealth,
    attackers:arr(8,grandSiegeFighter), defenders:arr(SAVE_COLLECTION_LIMIT,grandSiegeFighter),
    clash:optional(structure({ attackerId:id, defenderId:id, winnerId:id, attackerDamage:wealth, defenderDamage:wealth })),
    hero:optional(structure({
      actorId:id, move:one('elder-rescue','leader-last-stand'), origin:one('player','utility','model'), rank:sectRank,
      paidQi:percentage, paidHp:wealth, wallSaved:wealth,
    })),
  })),
  queued:optional(structure({ actorId:id, move:one(...GRAND_SIEGE_HERO_MOVES), queuedTick:tick })),
  terminal:optional(structure({ tick, status:one('victory','repelled','withdrawn'), sourceEventId:id, battlefield:bool })),
});
export const source = one('utility','llm');
export const doctrineTheme = one('cultivation','conflict','community','heavenly');
export const doctrineAmount = num(0, 1_000_000_000, true);
export const eventCategory = one('breakthrough','combat','intrigue','heavenly','death','diplomacy');
export const mode = one('avatar','ring');
export const intent = one('guide','persuade','deceive','interrogate','recruit');
export const vote = one('support','oppose','abstain');
export const action = one(...'CULTIVATE BREAKTHROUGH EXPLORE ROGUELIKE_ENCOUNTER AWAKEN_DESTINY FORBIDDEN_ART BEAST_DUEL_RESPONSE SCHOOL_FORM_DUEL GRAND_SIEGE_HERO BATTLEFIELD_REVISIT CALAMITY_ARRAY FRONTIER_NIGHT_HUNT FRONTIER_GORGE FAREWELL_LANDING WILD_MIGRATION VILLAGE_REUNION APPRENTICESHIP_REUNION PILGRIMAGE_FORK BATTLEFIELD_AFTERMATH VACANT_GATE WITNESS_INQUIRY PAVILION_FIRE MERCY_REUNION AUDIENCE_PLEDGE SOCIALIZE DUEL SCHEMING PURSUE_SCHEME AUTHOR_TECHNIQUE STUDY_TECHNIQUE GATHER_HERBS BREW_PILL HEAVENLY_ALCHEMY DAO_PATH ASCENSION USE_PILL FORGE_ARTIFACT BIND_ARTIFACT REPAIR_ARTIFACT SALVAGE_ARTIFACT AWAKEN_ARTIFACT FACE_TRIBULATION AMBUSH_TRIBULATION CHALLENGE_LEADERSHIP PLOT_COUP BUILD_FACILITY DISPATCH_GUARD GUARD_DUTY OFFER_ALLIANCE DECLARE_WAR DEMAND_TRIBUTE LAUNCH_SIEGE JOIN_OCCASION PURSUE_BOUNTY TAME_BEAST TRADE DUAL_CULTIVATE CULTIVATION_CLAN SECT_DIPLOMACY TEACH ACCEPT_TUITION DECLINE_TUITION OFFER_OATH ACCEPT_OATH DECLINE_OATH FULFILL_OATH APPEAL_OATH PLACE_MARKET_BUY PLACE_MARKET_SELL CANCEL_MARKET_ORDER IMMORTAL_AUCTION RECRUIT_SETTLER DELIVER_RELIEF FILE_WITNESS_CLAIM ATTEST_WITNESS CHALLENGE_WITNESS NAME_HEIR CLAIM_ESTATE HOLD_MEMORIAL DOCTRINE DOCTRINE_FOUNDING DOCTRINE_MATURITY RELOCATE RECOLLECT RELIC SCRIPTURE RANK_SEASON ESCORT MARKET_FREIGHT CEASEFIRE RESEARCH SANCTUARY SECT_CREDIT PILGRIMAGE WAYPOST_MEAL DISASTER_SHELTER CHRONICLE_ERRATA HABITAT INFIRMARY CARE_FOLLOWUP DANXIA_MEDICINE DANXIA_REVIEW FORMATION_NETWORK TERRITORIAL_LEASE HOUSEHOLD_GUARDIAN VILLAGE_WORKS SEALED_COURIER COURIER_HANDOFF SECT_SERVICE SHARED_COMMONS TERRAIN_RECOVERY WORKSHOP CRAFT_TRAINING WORKSHOP_ESTATE WORKSHOP_RELEASE SCRIBE_COMMISSION FURNACE_RESERVATION LAST_ROSTER BANQUET_SEAT NIGHT_DOOR BOUNDARY_GAP ABANDONED_QUARTER FURNACE_EMERGENCY FURNACE_SAFETY DAMAGE_ASSURANCE SPARRING EXPEDITION_RESCUE EXPEDITION_DUNGEON SHORT_SHIFT BOUNDARY_RELIEF MENTOR_TRANSFER APPRENTICE_COHORT SEASONAL_HOUSING HOUSEHOLD_NAME CARAVAN_RESTITUTION VILLAGE_GRANARY VILLAGE_SUPPLY ROUTE_WARNING PAVILION_LOAN WORKSHOP_CAPACITY CIVIC_MEMORIAL VILLAGE_FAIR SECT_STIPEND SEED_CULTURE WATER_VEIN NORTH_MINING_CHARTER NORTH_WELL_REVIEW UPPER_PASSAGE UPPER_ARRAY_FIELD UPPER_ARRAY_FIELD_LOCAL UPPER_ARRAY_FIELD_TRADE NORTH_GATE_RENEWAL FRONTIER FRONTIER_PRODUCTION FRONTIER_TRADE FRONTIER_PORT FRONTIER_PORT_TRADE FRONTIER_DRYLAND FRONTIER_DRYLAND_TRADE TOOL_LOAN RELIC_EXHIBIT PROBATION ROAD VILLAGE_CENSUS OATH_ARBITRATION FIELD_OBSERVATORY ALIGNED_WEATHER SEASON_REVIEW REST'.split(' '));
export const herbs = structure({jade_leaf:count,earth_root:count,star_bloom:count,shadow_moss:count});
export const waypostPoint=structure({x:num(0,1000),y:num(0,600)});
export const waypostVisit=structure({journeyId:id,organizerId:id,companionId:id,spentByEach:one(PILGRIMAGE_LEG_COST,2*PILGRIMAGE_LEG_COST),
  legIndex:one(0,1),pathIndex:num(1,6400,true),reachedTick:tick,originId:id,destinationId:id});

export const marketGood = one('jade_leaf','earth_root','star_bloom','shadow_moss','foundation','golden','barrier','heart_poison');
// A weighted escort may pin one physical shipment, its receipt and two source orders
// from the normal terminal tail, the hot event window, or retained detailed ledgers.
export const marketFreightProofLimit=96+120+RESOURCE_FLOW_MONTH_LIMIT*RESOURCE_FLOW_DETAIL_LIMIT;
export const marketFreightTerms=structure({
  carrierId:id,buyOrderId:id,sellOrderId:id,buyerId:id,unitPrice:num(1,500,true),departedTick:tick,
  good:marketGood,quantity:num(1,12,true),load:num(1,MARKET_FREIGHT_MAX_LOAD,true),band:one('light','medium','heavy'),
  fee:count,rations:one(2,3,4),capability:optional(structure({realm,stage:num(1,9,true),capacity:num(1,MARKET_FREIGHT_MAX_LOAD,true)})),
  dispatchByTick:otick,dispatch:optional(structure({tick,fromTileId:id,toTileId:id,pathIndex:num(1,6401,true)})),
  closedBy:optional(one('declined','withdrawn','expired','incapable','shipment_ended')),
});
export const flowGood = one('stone','jade_seed','frost_dose','ward_reed','frontier_water','reef_salt','port_rigging','rift_salt','stormstone','upper_lattice','jade_leaf','earth_root','star_bloom','shadow_moss','foundation','golden','barrier','heart_poison');
export const flowMeasure = num(0,Number.MAX_SAFE_INTEGER);
export const flowSerial = num(1,Number.MAX_SAFE_INTEGER,true);
export const flowAccount = structure({kind:one('actor','site','sect','order','shipment','oath','relocation','workshop','salvage','granary','village_supply','village_fair','seed_lot','seed_plot','danxia_medicine','upper_passage','frontier_store','upper_array_store','scribe_commission','waypost_meal','craft_training','freight'),id,
  pocket:optional(one('payment','collateral'))});
export const granaryReceipt: Validator = (value, path) => {
  const kind = (value as { kind?: unknown } | null)?.kind;
  if (kind === 'donate' || kind === 'donate_roots' || kind === 'donate_stones') return structure({kind:one(kind),tick,actorId:id})(value,path);
  if (kind === 'draw') return structure({kind:one('draw'),tick,actorId:id,
    stressBefore:percentage,stressAfter:percentage,disasterTick:tick})(value,path);
  return fail(path);
};
export const frontierBatchSlice=structure({batchId:id,amount:num(1,2,true)});
export const frontierCargo=structure({from:one(...FRONTIER_FARM_REGIONS),good:one('frost_dose','ward_reed'),
  lots:arr(2,frontierBatchSlice),loadedTick:tick,residenceId:id,route:one('standard','winter'),
  checkpoints:arr(512,structure({chartId:one('lower-base','chart-north-snow','chart-south-marsh'),tileId:id})),
  winterReeds:optional(arr(1,frontierBatchSlice)),walks:arr(SAVE_COLLECTION_LIMIT,structure({tick,step:num(0,511,true)})),
  winterWaitTicks:arr(SAVE_COLLECTION_LIMIT,tick),cursor:num(0,511,true),
  status:one('in_transit','arrived','returning','home_wait','returned','delivered'),arrivedTick:otick,closedTick:otick});
export const portVoyage=structure({hullId:id,loadResidenceId:id,loadedTick:tick,lots:arr(2,frontierBatchSlice),
  rigging:arr(1,frontierBatchSlice),checkpoints:arr(512,structure({chartId:one('chart-east-offshore','lower-base'),tileId:id})),
  feeStones:one(3),cursor:num(0,511,true),status:one('outbound','awaiting_buyer','returning_roots','returning_salt',
    'home_salt_held','roots_landed','salt_returned'),walks:arr(SAVE_COLLECTION_LIMIT,structure({tick,step:num(0,511,true)})),
  waits:arr(SAVE_COLLECTION_LIMIT,structure({tick,fromStep:num(0,511,true),toStep:num(0,511,true),reason:one('wind_closed','tide_closed')})),
  departedTick:otick,inlandArrivedTick:otick,receivedTick:otick,returnStartedTick:otick,returnedTick:otick,restockedTick:otick});
export const portTrade=structure({nextId:flowSerial,lastAdvancedTick:otick,agreements:arr(SAVE_COLLECTION_LIMIT,structure({
  id,sellerId:id,buyerId:id,offeredTick:tick,status:one('offered','signed','shipping','fulfilled','unfulfilled','expired'),
  signedTick:otick,roots:optional(one('inland_escrow','returning_to_port','landed_at_port','collected_at_port','refundable_inland','refunded_inland')),
  rootsReleasedTick:otick,rootsCollectedResidenceId:oid,closedTick:otick,voyage:optional(portVoyage),
}))});
export const villageSupplySigner = structure({actorId:id,donationTick:tick,donationKind:one('donate','donate_roots','donate_stones')});
export const villageSupplyHazard = structure({id,kind:one('meteor','beast_tide','cursed_miasma'),tileId:id,createdTick:tick,expiresTick:tick,intensity:one(1,2,3)});
export const maturityHazardSample=structure({tick,siteId:id,hazard:villageSupplyHazard});
export const maturityHazards=arr(DOCTRINE_MATURITY_HAZARD_TICKS,maturityHazardSample);
export const maturitySupport:Validator=(value,path)=>{
  const support=value as {kind?: unknown}|null;
  return support?.kind==='sustained_hazard'?
    structure({kind:one('sustained_hazard'),observedTick:tick,siteId:id,samples:maturityHazards})(value,path):
    structure({kind:one('title_lost'),observedTick:tick,siteId:id,previousTick:tick,currentOwnerSectId:oid})(value,path);
};
export const doctrineMaturityMove=one('offer_merge','accept_merge','approve_member','decline_merge','withdraw_merge','finalize_merge');
export const doctrineMaturity=structure({
  latestHazards:maturityHazards,lastTitle:optional(structure({siteId:id,tick})),support:optional(maturitySupport),
  offers:arr(SAVE_COLLECTION_LIMIT,structure({
    openedTick:tick,expiresTick:tick,outgoingLeaderId:id,receivingLeaderId:id,receivingSiteId:id,memberIds:ids,
    wallet:wealth,scriptureId:id,support:maturitySupport,
    consents:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,tick})),acceptedTick:otick,
    status:one('offered','declined','withdrawn','expired','invalidated','merged'),closedTick:otick,closedById:oid,
  })),
  settlement:optional(structure({
    kind:one('merged','dispersed'),tick,siteId:id,receivingSectId:oid,memberIds:ids,transferredStones:wealth,
    retainedStones:wealth,releasedTileId:oid,transferredScriptureId:oid,scriptureAlreadyHeld:optional(bool),
  })),
});
export const supplyCheckpoint = num(0,VILLAGE_SUPPLY_MAX_ROUTE_TILES-1,true);
export const disasterShelterParty=structure({actorId:id,householdId:id,volunteerId:id,settlementId:id,siteId:id});
export const disasterShelterIndex=num(0,DISASTER_SHELTER_MAX_PATH-1,true);
export const routeWarningObservation = structure({
  id,actorId:id,journeyId:id,partyIds:arr(2,id),legIndex:tick,fromPathIndex:tick,toPathIndex:tick,fromTileId:id,toTileId:id,
  exitTileId:oid,exitPathIndex:otick,observedTick:tick,hazard:villageSupplyHazard,
});
export const seedWeather = structure({tick,season:one('春','夏','秋','冬'),kind:one('平息','灵潮','罡风','霜息'),
  intensity:num(0,1),soilQi:percentage,waterDeficit:optional(num(1,3,true))});
export const villageSupplyLeg = structure({good:one('earth_root','stone'),phase:one('outbound','returning','delivered','returned','lost'),
  checkpoint:supplyCheckpoint,lastAdvancedTick:tick,settledTick:otick,loss:optional(villageSupplyHazard),
  turnback:optional(structure({tick,checkpoint:supplyCheckpoint,cause:one('destination_closed','unsafe_next'),hazard:optional(villageSupplyHazard)}))});
export const flowScope = structure({kind:one('observer','known_sites','participants'),siteIds:optional(arr(8,id)),actorIds:optional(arr(8,id))});
export const marketQty = num(1,12,true), marketPrice = num(1,500,true);
export const pills = structure({foundation:count,golden:count,barrier:count,heart_poison:count});
export const technique = structure({id:oid,authorId:oid,createdTick:otick,name:id,spiritRoot:spirit});
export const editionKind = one('gloss','misread','corrected');
export const relicSet = one('star-balance');
export const workshopArtifactOrigin = structure({orderId:id,piece:one(1,2),makerId:id,siteId:id,blankTick:tick,finishedTick:tick});
export const craftTrainingOrigin=structure({projectId:id,blankId:id,siteId:id,keeperId:id,firstTraineeId:id,secondTraineeId:id,blankTick:tick,finishedTick:tick});
export const artifact = structure({craftTrainingOrigin:optional(craftTrainingOrigin),workshopOrigin:optional(workshopArtifactOrigin),relicSetId:optional(relicSet),relicFragmentIds:optional(arr(2,id)),id:oid,tier:optional(one('法器','灵器','法宝','通天灵宝')),durability:optional(wealth),maxDurability:optional(wealth),boundTo:oid,
  soul:optional(structure({name:id,experience:percentage})),resonance:optional(percentage),name:id,spiritRoot:spirit});
export const eligibility = { actorId:id,basis:one('nomination','bond','sect'),strength:num(0,10_000) };
export const memory = structure({id,tick,content:text,importance:num(1,10),emotionalValence:num(-5,5),decayRate:num(0,10),
  consolidatedAtTick:otick,category:one('cultivation','combat','social','heavenly','whisper')});
export const dialogue = structure({kind:one('combat','trade','dual_cultivation','sect_diplomacy'),source,
  turns:arr(24,structure({speakerId:id,speakerName:id,text}))});
export const publicFact = {id,tick,year:tick,month,title:text,description:text,category:eventCategory,actorIds:ids,locationId:oid,dialogue:optional(dialogue)};
export const anchor = structure(publicFact);
export const chapterStoryFocal: Validator = (value,path) => {
  if ((value as {kind?:unknown} | null)?.kind === 'ensemble') return structure({kind:one('ensemble')})(value,path);
  return structure({kind:one('lead'),actorId:id,arcId:id,eventIds:arr(18,id)})(value,path);
};
export const protagonistEvidence=structure({eventId:id,tick,category:eventCategory,
  attribution:one('named_first','direct_quote','named_participant')});
export const chronicleChapter = structure({id,chapterNumber:tick,startTick:tick,endTick:tick,title:text,storyFocal:optional(chapterStoryFocal),
  anchors:arr(18,anchor),biographies:arr(8,structure({actorId:id,name:id,realm,sectName:otext,anchorIds:ids})),body:strings(25_000),source});
export const scenarioObjective: Validator = (value, path) => {
  const kind = (value as {kind?:unknown} | null)?.kind;
  if (kind === 'cultivator_survives') return structure({kind:one(kind),actorId:id})(value,path);
  if (kind === 'living_population') return structure({kind:one(kind),minimum:num(1,SCENARIO_MAX_POPULATION_TARGET,true)})(value,path);
  if (kind === 'site_qi') return structure({kind:one(kind),locationId:id,minimum:num(0,SCENARIO_MAX_SITE_QI_TARGET,true)})(value,path);
  if (kind === 'sect_treasury') return structure({kind:one(kind),sectId:id,minimum:num(0,SCENARIO_MAX_TREASURY_TARGET,true)})(value,path);
  if (kind === 'danxia_medicine_outcome') return structure({kind:one(kind),actorId:id,settlementId:id,
    required:one('delivered','renewed','switched','refused')})(value,path);
  fail(path);
};
export const dispatchPayload: Validator = (value, path) => {
  const kind = (value as {kind?:unknown} | null)?.kind;
  if (kind === 'private_cue') return structure({kind:one(kind),cue:one('request_audience','offer_relief')})(value,path);
  if (kind === 'public_relief') return structure({kind:one(kind),sourceEventId:id,settlementId:id,stones:count,herbs:count})(value,path);
  fail(path);
};
export const scenarioEvidence: Validator = (value, path) => {
  const kind = (value as {kind?:unknown} | null)?.kind;
  if (kind === 'cultivator_survives') return structure({kind:one(kind),found:bool,alive:bool,hp:wealth})(value,path);
  if (kind === 'living_population') return structure({kind:one(kind),count:tick})(value,path);
  if (kind === 'site_qi') return structure({kind:one(kind),found:bool,qi:num(0,150)})(value,path);
  if (kind === 'sect_treasury') return structure({kind:one(kind),found:bool,atSite:wealth,inTransit:wealth,total:num(0,2_000_000_000)})(value,path);
  if (kind === 'danxia_medicine_outcome') return structure({kind:one(kind),verified:bool})(value,path);
  fail(path);
};

export const chronicleReading: Validator = (value, path) => {
  if ((value as {kind?:unknown} | null)?.kind === 'duel') return structure({kind:one('duel'),winnerId:id})(value,path);
  return structure({kind:one('relief'),delivery:one('full_supplies','unfunded')})(value,path);
};
export const errataSourceFact: Validator = (value, path) => {
  const common = { sourceEventId:id,tick,locationId:id };
  if ((value as {kind?:unknown} | null)?.kind === 'duel') {
    return structure({...common,kind:one('duel'),participantIds:arr(2,id),winnerId:id})(value,path);
  }
  return structure({...common,kind:one('relief'),actorId:id,settlementId:id,stones:count,herbs:count})(value,path);
};

export const proposal: Validator = (value, path) => {
  const kind = (value as {kind?:unknown} | null)?.kind;
  if (kind === 'war') return structure({kind:one('war'),targetSectId:id})(value,path);
  if (kind === 'expel') return structure({kind:one('expel'),targetCultivatorId:id})(value,path);
  if (kind === 'allocate_pill') return structure({kind:one('allocate_pill'),targetCultivatorId:id,donorId:id})(value,path);
  fail(path);
};

export const noteTarget: Validator = (value, path) => {
  const kind = (value as {kind?:unknown} | null)?.kind;
  if (kind === 'tile') return structure({ kind:one('tile'),tileId:id })(value,path);
  if (kind === 'site') return structure({ kind:one('site'),locationId:id,tileId:id,siteName:strings(ANNOTATION_MAX_TITLE_CHARS,1) })(value,path);
  fail(path);
};
export const facilityLevels = structure({qi_array:num(0,3,true),alchemy_hall:num(0,3,true),scripture_pavilion:num(0,3,true),defense_array:num(0,3,true),spirit_mine:num(0,3,true)});
export const terrainBiome = one('灵山','毒沼','剑冢','荒漠','魔渊','坊市');
export const fieldReading = structure({kind:one('平息','灵潮','罡风','霜息'),intensity:num(0,1)});
export const observatoryStation = structure({kind:one('edge'),x:num(0,1000),y:num(0,600)});
export const alignedWeatherReport=structure({openedTick:tick,reading:fieldReading,station:optional(observatoryStation)});
export const observatoryActor = structure({
  runs:arr(SAVE_COLLECTION_LIMIT,structure({
    station:optional(observatoryStation),
    locationId:id,openedTick:tick,targetTick:tick,baseline:fieldReading,forecast:fieldReading,
    status:one('pending','measured','missed'),reading:optional(fieldReading),
    relay:optional(structure({recipientId:id,relayedTick:tick}))
  })),
  inbox:arr(OBSERVATORY_INBOX_LIMIT,structure({operatorId:id,openedTick:tick}))
});
export const observatoryActors: Validator = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path);
  for (const [actorId, account] of Object.entries(value)) {
    id(actorId, `${path}.key`);
    observatoryActor(account, `${path}.${actorId}`);
  }
};
export const evolutionStage=one('village','town','ruin');
export const evolutionSample=structure({tick,population:count,juveniles:count,namedRemaining:count,stress:percentage,
  capacity:count,wellId:oid,usableWell:bool,passableCorridors:num(0,47,true),corridorAgreementId:oid});
export const censusNumber = num(0,Number.MAX_SAFE_INTEGER,true);
export const censusCount = structure({villageId:id,population:censusNumber,juveniles:censusNumber});
export const locationKind = one('sect_hq','spirit_vein','secret_realm','market','abyss');

export const roguelikeRecord=structure({
  id,actorId:id,fromSiteId:id,siteId:id,openedTick:tick,kind:one(...ROGUELIKE_ENCOUNTER_KINDS),
  guided:bool,witnessId:oid,status:one('offered','resolved','expired'),resolvedTick:otick,
  choice:optional(one(...ROGUELIKE_ENCOUNTER_CHOICES)),
  outcome:optional(structure({success:bool,qiDelta:num(-100,100),hpDelta:num(-1_000_000_000,1_000_000_000),
    karmaDelta:num(-200,200),lifespanDelta:num(-1_000_000_000,1_000_000_000),affinityDelta:num(-200,200),
    sectReputationDelta:optional(num(0,100))})),
  sectGate:optional(structure({sectId:id,leaderId:id,possessionUntilTick:tick})),
});

export const destinyTraitId=one(...DESTINY_TRAIT_IDS);
export const destinyOfferFields={id,actorId:id,fromRealm:realm,realm,openedTick:tick,sourceEventId:id,options:arr(3,destinyTraitId)};
export const destinyTraits=structure({
  earned:arr(7,structure({...destinyOfferFields,traitId:destinyTraitId,chosenTick:tick})),
  pending:optional(structure(destinyOfferFields)),
});

export const trueOnly:Validator=(value,path)=>{if(value!==true)fail(path);};
export const heartPersonality=one('刚正','阴险','狂傲','苟道','痴情','嗜血','逍遥','诡诈');
export const audienceStance=one('steady','wavering','accepts','rebels');
export const ringAudience=structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),
  sessions:arr(RING_AUDIENCE_MAX_SESSIONS,structure({
    id,role:one('ring','heaven'),targetId:id,aim:one(...RING_AUDIENCE_AIMS),openedTick:tick,
    openingSectId:strings(240),leaderId:oid,personalityAtOpening:heartPersonality,initialWavering:percentage,
    wavering:percentage,stance:audienceStance,status:one('open','sealed','declined','closed','executed','expired'),
    turns:arr(RING_AUDIENCE_MAX_TURNS,structure({index:num(1,RING_AUDIENCE_MAX_TURNS,true),tick,message:text,reply:text,
      source,tone:one('reason','empathy','pressure','quiet'),before:percentage,after:percentage,stance:audienceStance,cost:num(3,4,true)})),
    sealedTick:otick,closedTick:otick,execution:optional(structure({tick,effect:one('left','learned','confronted'),eventId:id})),
  })),
});
export const heartTheme=one('cultivation','conflict','community','heavenly');
export const heartChoice=one(...HEART_DEMON_CHOICES);
export const heartAftermath=structure({trialId:id,resultEventId:id,siteId:id,resolvedTick:tick,choice:heartChoice,
  outcome:one('passed','failed'),endsTick:tick,
  recovery:optional(structure({tick,siteId:id,qiBefore:percentage,qiPaid:one(4,8,12,16),eventId:id})),
});
export const heartGuide=structure({actorId:id,trialId:id,grantedTick:tick,bindingGeneration:tick,originalPossessionUntilTick:tick});
export const heartEvidence:Validator=(value,path)=>{
  const clause=value as {kind?:unknown;source?:{kind?:unknown}|null}|null;
  if(clause?.kind==='reflection')return structure({kind:one('reflection'),reflectionId:id,reflectionTick:tick,
    theme:heartTheme,memoryId:id,memoryTick:tick,memoryCategory:one('cultivation','combat','social','heavenly','whisper')})(value,path);
  if(clause?.kind==='bond')return structure({kind:one('bond'),otherActorId:id,role:one('血仇','道侣','师徒','挚友'),
    source:clause.source?.kind==='lineage'?structure({kind:one('lineage'),mentorId:id,studentId:id,tick}):
      structure({kind:one('scene'),eventId:id,tick})})(value,path);
  return structure({kind:one('mirror')})(value,path);
};
export const heartFrame=structure({id,actorId:id,siteId:id,openedTick:tick,finalWaveEventId:id,evidence:heartEvidence,
  queued:optional(structure({choice:heartChoice,queuedTick:tick})),releasedTick:otick,cancelledTick:otick,
  result:optional(structure({choice:heartChoice,origin:one('player','utility','model'),resolvedTick:tick,
    outcome:one('passed','failed','died'),damage:wealth,karmaDelta:num(-200,200),masteryDelta:num(-100,100),
    personalityBefore:optional(heartPersonality),personalityAfter:optional(heartPersonality)})),
});

export const forbiddenArtId=one(...FORBIDDEN_ART_IDS);
export const forbiddenPaid=structure({hp:wealth,lifespan:wealth,durability:wealth});
export const forbiddenScar=structure({id,contactId:id,artId:forbiddenArtId,ownerId:id,opponentId:id,artifactId:id,siteId:id,
  openedTick:tick,tick,paid:forbiddenPaid,result:one('reversal','escape','survived','fallen'),
  origin:one('player','utility','model')});
export const forbiddenContact=structure({id,attackerId:id,defenderId:id,ownerId:id,artifactId:id,siteId:id,openedTick:tick,
  rolls:arr(4,num(0,1)),guided:bool,
  queued:optional(structure({choice:one(...FORBIDDEN_ART_IDS,'decline'),tick}))});

export const beastDuelContact=structure({id,attackerId:id,defenderId:id,ownerId:id,beastId:id,siteId:id,openedTick:tick,
  rolls:arr(4,num(0,1)),guided:bool,guideUntilTick:optional(tick),guideSwitchTick:optional(tick),
  queued:optional(structure({choice:one('guard','withdraw','decline'),tick,destinationId:oid}))});
export const schoolFormDuel=structure({id,attackerId:id,defenderId:id,lessonId:id,practiceTick:tick,siteId:id,openedTick:tick,rolls:arr(4,num(0,1))});
export const tournamentArena=structure({openedTick:tick,seededIds:arr(16,id),
  rounds:arr(4,structure({round:num(1,4,true),tick,eventId:id,absentIds:arr(16,id),
    bouts:arr(8,structure({firstId:id,secondId:oid,winnerId:id,firstDamage:wealth,secondDamage:optional(wealth)}))})),
  prize:optional(structure({tick,actorId:id,artifactId:id,title:one('百年论剑魁首')})),
  terminal:optional(structure({tick,status:one('completed','cancelled'),eventId:id})),
});

export const tournamentWagers=structure({tickets:arr(32,structure({
  id,arenaId:id,siteId:id,spectatorId:id,contenderId:id,stake:one(5,10,20),placedTick:tick,
  status:one('open','won','lost','refunded','forfeited'),
  settlement:optional(structure({tick,eventId:id,payout:num(0,40,true),award:num(0,20,true),winnerId:oid})),
}))});

export const dungeonStep:Validator=(value,path)=>{
  const move=(value as {move?:unknown}|null)?.move, base={tick,actorId:id,eventId:id};
  if(move==='gather')return structure({...base,move:one('gather'),jadeLeaf:one(1)})(value,path);
  if(move==='break_array')return structure({...base,move:one('break_array'),qiPaid:one(18)})(value,path);
  if(move==='strike')return structure({...base,move:one('strike'),bossBefore:wealth,bossAfter:wealth,hpLost:wealth})(value,path);
  if(move==='claim')return structure({...base,move:one('claim'),stones:one(80),artifactId:id})(value,path);
  return structure({...base,move:one('enter','retreat')})(value,path);
};
export const expeditionDungeon=structure({openedTick:tick,room:one('garden','hall','sanctum'),bossHp:wealth,
  members:arr(2,structure({actorId:id,enteredTick:tick,leftTick:otick,
    exit:optional(one('retreated','escaped','collapse','rescued','lost')),hpLost:optional(wealth)})),
  steps:arr(24,dungeonStep),closedTick:otick,outcome:optional(one('claimed','retreated','collapsed','lost')),
});

export const heavenlyAlchemy = structure({
  attempts:arr(HEAVENLY_ALCHEMY_MAX_ATTEMPTS,structure({
    id,tick,siteId:id,recipeId:one(...HEAVENLY_RECIPE_IDS),heat:one(...HEAVENLY_HEATS),
    roll:num(0,999,true),mastery:percentage,toxicity:percentage,fireRoot:bool,
    quality:optional(one(...HEAVENLY_QUALITIES)),
    use:optional(structure({tick,siteId:id,wardSpentTick:otick,wardTrialId:oid,wardWave:optional(num(1,32,true))})),
  })),
  ward:optional(structure({brewId:id,expiresTick:tick})),
});
export const daoActivation=structure({
  actorId:id,pathId:one(...DAO_PATH_IDS),rank:one(1,2,3),tick,readyTick:tick,readySiteId:id,siteId:id,eventId:id,
  qiPaid:one(DAO_INTENT_QI),artifactId:oid,
});
export const daoPath=structure({
  pathId:one(...DAO_PATH_IDS),chosenTick:tick,chosenSiteId:id,bladeId:oid,lastActedTick:tick,
  practices:arr(DAO_PATH_MAX_PRACTICES,structure({
    tick,siteId:id,qiPaid:percentage,herbPaid:optional(one('earth_root','jade_leaf','shadow_moss')),
    stonesPaid:optional(wealth),hpPaid:optional(wealth),artifactId:oid,durabilityGain:optional(wealth),
  })),
  ready:optional(structure({tick,siteId:id,artifactId:oid})),
  activations:arr(DAO_INTENT_HISTORY,daoActivation),
});
export const auctionAsset:Validator=(value,path)=>{
  const kind=(value as {kind?:unknown}|null)?.kind;
  if(kind==='pill')return structure({kind:one('pill'),pillId:one(...IMMORTAL_AUCTION_PILLS)})(value,path);
  if(kind==='artifact')return structure({kind:one('artifact'),artifactId:id,name:id,tier:one('灵器','法宝','通天灵宝'),
    spiritRoot:spirit,durability:wealth,maxDurability:wealth})(value,path);
  return fail(path);
};
export const immortalAuction=structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),lots:arr(IMMORTAL_AUCTION_HISTORY,structure({
  id,sellerId:id,listedTick:tick,closesTick:tick,minimum:num(1,IMMORTAL_AUCTION_MAX_BID,true),asset:auctionAsset,
  custody:optional(artifact),bids:arr(IMMORTAL_AUCTION_MAX_BIDS,structure({bidderId:id,tick,stones:num(1,IMMORTAL_AUCTION_MAX_BID,true),
    status:one('held','outbid','refunded','paid'),settledTick:otick})),
  terminal:optional(structure({tick,eventId:id,reason:one('sold','withdrawn','no_bid','unavailable'),buyerId:oid,
    stones:optional(num(1,IMMORTAL_AUCTION_MAX_BID,true))})),
  witnessIds:optional(ids),departure:optional(structure({tick,siteId:id})),
}))});
export const gazetteSource={sourceEventId:id,tick,year:tick,month,siteId:id};
export const gazetteEntry:Validator=(value,path)=>{
  const row=value as {kind?:unknown;story?:unknown}|null;
  if(row?.kind==='headline'&&row.story==='siege')return structure({...gazetteSource,kind:one('headline'),story:one('siege'),
    siegeId:id,attackerSectId:id,defenderSectId:id,outcome:one('victory','repelled')})(value,path);
  if(row?.kind==='headline'&&row.story==='tournament')return structure({...gazetteSource,kind:one('headline'),story:one('tournament'),
    occasionId:id,winnerId:id})(value,path);
  if(row?.kind==='dark_horse')return structure({...gazetteSource,kind:one('dark_horse'),occasionId:id,winnerId:id,opponentId:id,
    winnerSeed:num(1,16,true),opponentSeed:num(1,16,true),round:num(1,4,true)})(value,path);
  if(row?.kind==='rivalry')return structure({...gazetteSource,kind:one('rivalry'),actorIds:arr(2,id),earlier:structure(gazetteSource)})(value,path);
  if(row?.kind==='bounty')return structure({...gazetteSource,kind:one('bounty'),bountyId:id,targetActorId:id,sponsorSectId:id,reward:wealth})(value,path);
  return fail(path);
};
export const tianjiGazette=structure({issues:arr(TIANJI_GAZETTE_HISTORY,structure({
  id,tick,year:tick,month,trigger:one('year_turn','battle','finale'),entries:arr(TIANJI_GAZETTE_KINDS.length,gazetteEntry),
}))});
export const clanTrait=one(...CLAN_INNATE_TRAITS);
export const clanHeritage=structure({childId:id,clanId:id,roots:arr(2,spirit),innateTrait:clanTrait});
export const cultivationClans=structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),
  unions:arr(SAVE_COLLECTION_LIMIT,structure({
    id,clanId:id,ancestorClanIds:optional(arr(2,id)),parents:arr(2,id),siteId:id,proposedTick:tick,
    status:one('proposed','accepted','bonded','refused','expired'),acceptedTick:otick,closedTick:otick,
    ceremonyOffer:optional(structure({actorId:id,tick})),ceremony:optional(structure({actorId:id,tick,qiPaidEach:one(CLAN_CEREMONY_QI)})),
    plan:optional(structure({offeredBy:id,offeredTick:tick,status:one('offered','declined','expecting','born','lost'),
      acceptedBy:oid,acceptedTick:otick,earnedTicks:arr(CLAN_BIRTH_EARNED_MONTHS,tick),closedTick:otick,childId:oid})),
  })),
  children:arr(SAVE_COLLECTION_LIMIT,structure({
    id,clanId:id,unionId:id,parentIds:arr(2,id),siteId:id,birthTick:tick,maturesAtTick:tick,name:id,
    gender:one('woman','man'),parentRoots:arr(2,spirit),roots:arr(2,spirit),innateTrait:clanTrait,maturedTick:otick,
  })),
});
export const ascension=structure({trials:arr(SAVE_COLLECTION_LIMIT,structure({
  id,actorId:id,siteId:id,sectIdBefore:strings(240),startedTick:tick,startedYear:tick,startedMonth:month,
  openingQiPaid:one(ASCENSION_OPEN_QI),phase:one('warning','lightning','succeeded','failed','retreated'),
  waves:arr(ASCENSION_WAVES,structure({
    wave:one(1,2,3),tick,year:tick,month,stance:one('guard','advance'),eventId:id,
    maxHp:num(1,1_000_000_000),beforeHp:wealth,afterHp:wealth,qiBefore:percentage,qiPaid:one(4,8),
  })),
  terminal:optional(structure({status:one('succeeded','failed','retreated'),tick,year:tick,month,eventId:id,
    reason:optional(one('lightning','interrupted'))})),
}))});
