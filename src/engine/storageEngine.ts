import { createCompetitionReviewState, SEASON_REVIEW_CASE_LIMIT, SEASON_REVIEW_WINDOW, seasonReviewProofId } from './seasonReviewEngine';
import { OBSERVATORY_INBOX_LIMIT, OBSERVATORY_LEAD_TICKS, OBSERVATORY_RETENTION_TICKS, OBSERVATORY_TERMINAL_LIMIT, createFieldObservatoriesState } from './fieldObservatoryEngine';
import { ARBITRATION_HEARING_WINDOW, ARBITRATION_JOIN_WINDOW, ARBITRATION_MAX_APPOINTMENTS_PER_SIDE, ARBITRATION_MAX_OBSERVERS, createOathArbitrationState } from './oathArbitrationEngine';
import { createVillageCensusesState, VILLAGE_CENSUS_PERIOD_LIMIT } from './villageCensusEngine';
import { createRoadState, ROAD_CONDITION_MAX, ROAD_FARE, ROAD_PAID_STRIDE, ROAD_PATH_POINT_LIMIT, ROAD_PATH_TILE_LIMIT } from './roadEngine';
import { createProbationState, PROBATION_REQUEST_TICKS, PROBATION_REQUIRED_RELIEF, PROBATION_REQUIRED_REVIEWS, PROBATION_SERVICE_TICKS } from './probationEngine';
import { createRelicExhibitState, RELIC_EXHIBIT_DURATION, RELIC_EXHIBIT_OFFER_TICKS } from './relicExhibitEngine';
import { validateWorkshopInstitutionHistory } from './storageWorkshopValidation';
import { validateArtifactSalvageHistory } from './storageSalvageValidation';
import { createArtifactSalvageState } from './artifactSalvageEngine';
import { WORKSHOP_ACTIVE_TICKS, WORKSHOP_MAX_WORK_RECEIPTS, WORKSHOP_OFFER_TICKS, createWorkshopState, workshopGradeForScore, workshopTerms } from './workshopEngine';
import { createFurnaceSafetyState } from './furnaceSafetyEngine';
import { createFurnaceReservationState, FURNACE_QUEUE_TICKS, FURNACE_TERMINAL_LIMIT, FURNACE_USE_RETENTION_TICKS } from './furnaceReservationEngine';
import { createSparringState, SPARRING_MASTERY_MAX, SPARRING_QI_COST } from './sparringEngine';
import { validateSparringRelationships, validateExpeditionRescueRelationships, validateShortShiftRelationships,
  validateBoundaryReliefRelationships, validateApprenticeCohortRelationships, validateHouseholdNameRelationships,
  validateCaravanRestitutionRelationships, validateVillageGranaryRelationships, validateFurnaceSafetyRelationships } from './storageActivityValidation';
import { createExpeditionRescueState } from './expeditionRescueEngine';
import { createShortShiftState, SHORT_SHIFT_WAGE } from './shortShiftEngine';
import { createBoundaryReliefState, BOUNDARY_RELIEF_MAX_PATH_STEPS } from './boundaryReliefEngine';
import { createApprenticeCohortState, COHORT_MAX_INVITEES } from './apprenticeCohortEngine';
import { createHouseholdNameState, HOUSEHOLD_NAME_ALIASES } from './householdNameEngine';
import { createVillageSupplyState } from './villageSupplyEngine';
import { VILLAGE_SUPPLY_MAX_ROUTE_TILES } from './villageSupplyAccounting';
import { validateVillageSupplyHistory } from './storageVillageSupplyValidation';
import { createRouteWarningsState } from './routeWarningEngine';
import { createPavilionLoansState } from './pavilionLoanEngine';
import { validatePavilionLoanHistory } from './storagePavilionLoanValidation';
import { createCivicMemorialsState } from './civicMemorialEngine';
import { validateCivicMemorialHistory } from './storageCivicMemorialValidation';
import { effectiveWorkshopDeadline, effectiveWorkshopQuantity } from './workshopCapacityTerms';
import { validateWorkshopCapacityClauses } from './storageWorkshopCapacityValidation';
import { validateRouteWarningHistory } from './storageRouteWarningValidation';
import { createVillageGranariesState, VILLAGE_GRANARY_CAPACITY, VILLAGE_GRANARY_RECEIPT_LIMIT } from './villageGranaryEngine';
import { createCaravanRestitutionState } from './caravanRestitutionEngine';
import { createTerrainSuccessionState, TERRAIN_QUIET_CAP, TERRAIN_RECOVERY_LIMIT } from './terrainSuccessionEngine';
import { createResourceFlowState, RESOURCE_FLOW_DETAIL_LIMIT, RESOURCE_FLOW_MONTH_LIMIT, RESOURCE_FLOW_REASON, sameFlowAccount } from './resourceFlowEngine';
import { COMMONS_MAINTENANCE_UNIT, COMMONS_MAX_RESERVE, COMMONS_OFFER_TICKS, COMMONS_ROUND_TICKS, COMMONS_TERM_TICKS, commonsQuotaShares, createSharedCommonsState } from './sharedCommonsEngine';
import { createServiceRetirementState, SERVICE_RETIREMENT_HISTORY_LIMIT, SERVICE_RETIREMENT_MIN_TICKS, isRetiredFromService } from './serviceRetirementEngine';
import { COLD_HISTORY_MIN_AGE_TICKS, createColdHistoryState, freezeColdHistory } from './coldHistoryEngine';
import { COURIER_OFFER_TICKS, COURIER_ROUTE_TICKS, COURIER_SERVICE_FEE, createSealedCourierState } from './sealedCourierEngine';
import { createWatchlistState, WATCHLIST_BUCKET_MAX_COUNT, WATCHLIST_MAX_DIGESTS,
  WATCHLIST_MAX_LABEL_CHARS, WATCHLIST_MAX_WATCHES } from './watchlistEngine';
import { createVillageWorksState, VILLAGE_WORK_ADULTS_PER_LABOR, VILLAGE_WORK_MAX_LABOR_PER_TICK, VILLAGE_WORK_RULES } from './villageWorksEngine';
import { createHouseholdState, HOUSEHOLD_GUARDIAN_OFFER_TICKS, initializeHouseholds } from './householdEngine';
import { normalizeScenarioObjectives, SCENARIO_AUDIT_VERSION, SCENARIO_MAX_OBJECTIVES, SCENARIO_MAX_POPULATION_TARGET,
  SCENARIO_MAX_SITE_QI_TARGET, SCENARIO_MAX_TREASURY_TARGET, scenarioObjectivePassed } from './scenarioObjectiveEngine';
import { createTerritorialLeaseState, LEASE_DEPOSIT, LEASE_OFFER_TICKS, LEASE_QUOTA, LEASE_TERM_TICKS, LEASE_UNIT_RENT, territorialLeaseAvailability } from './territorialLeaseEngine';
import { createFormationNetworkState, FORMATION_BUFFER_CAP, FORMATION_DISPATCH_QI, FORMATION_DRAW_CAP,
  FORMATION_MAX_THROUGHPUT, FORMATION_OFFER_TICKS, FORMATION_OVERLOAD_QI, FORMATION_RECEIPT_LIMIT,
  FORMATION_REPAIR_COST, FORMATION_SETUP_COST, formationLinkAvailability } from './formationNetworkEngine';
import { createInfirmaryState, INFIRMARY_DETOX_MAX, INFIRMARY_HEAL_FRACTION, INFIRMARY_MAX_BEDS, INFIRMARY_QUEUE_TICKS,
  INFIRMARY_SHIFT_TICKS, INFIRMARY_TREATMENT_HERBS, INFIRMARY_TREATMENT_STONES } from './infirmaryEngine';
import { createHabitatState, HABITAT_MIN_HEALTH, HABITAT_RESTORATION_TICKS,
  HABITAT_SURVEY_DELAY, HABITAT_SURVEY_WINDOW } from './habitatEngine';
import { CHRONICLE_ERRATA_MAX_RETELLINGS, CHRONICLE_ERRATA_WINDOW, createChronicleErrataState } from './chronicleErrataEngine';
import { CAUSAL_CHRONICLE_MAX_NODES, CAUSAL_CHRONICLE_MAX_PREDECESSORS, causalChronicleOutcomeCompatible,
  causalPredecessorCompatible, createCausalChronicleState } from './chronicleCausalityEngine';
import { terrainTileAt } from './terrainEngine';
import { createPilgrimageState, PILGRIMAGE_ACTIVE_TICKS, PILGRIMAGE_CAMP_RECOVERY_HP, PILGRIMAGE_LEG_COST, PILGRIMAGE_OFFER_TICKS, PILGRIMAGE_RELIEF_HP, PILGRIMAGE_TILE_STRIDE } from './pilgrimageEngine';
import { createSectCreditState, SECT_CREDIT_COLLECTION_TICKS, SECT_CREDIT_OFFER_TICKS,
  SECT_CREDIT_PAYMENT_MAX, SECT_CREDIT_PRINCIPAL, SECT_CREDIT_TERM_TICKS } from './sectCreditEngine';
import { createSanctuaryState, SANCTUARY_BLOCK_HP, SANCTUARY_CHARTER_TICKS, SANCTUARY_FOUND_COST,
  SANCTUARY_KARMA_PENALTY, SANCTUARY_MAX_SHIELD, SANCTUARY_PASS_TICKS, SANCTUARY_REPAIR_COST } from './sanctuaryEngine';
import { createResearchState, researchTechniqueId, RESEARCH_DEPOSIT, RESEARCH_PROJECT_TICKS,
  RESEARCH_REQUIRED_RESEARCHERS, RESEARCH_REQUIRED_TURNS, RESEARCH_WORK_COST } from './researchEngine';
import { CEASEFIRE_AID_DELAY, CEASEFIRE_BOND, CEASEFIRE_DURATION, CEASEFIRE_OFFER_TICKS, createCeasefireState } from './ceasefireEngine';
import { ANNOTATION_MAX_BOOKMARKS, ANNOTATION_MAX_NOTES, ANNOTATION_MAX_NOTE_CHARS, ANNOTATION_MAX_TITLE_CHARS, createAnnotationState } from './annotationState';
import { createEscortState, ESCORT_FEE, ESCORT_RATIONS } from './escortEngine';
import { COMPETITION_RULES, createCompetitionState, publicCompetitionStandings } from './competitionEngine';
import { createScriptureState } from './scriptureEngine';
import { createRelicState } from './relicEngine';
import { createReincarnationState, MORTAL_MATURITY_TICKS } from './reincarnationEngine';
import { createRelocationState } from './relocationEngine';
import { isWorldgenProfileId } from './worldgenProfiles';
import { createDoctrineState } from './doctrineEngine';
import { createSettlementState, SETTLEMENT_RELIEF } from './settlementEngine';
import { OATH_TERMS } from './oathEngine';
import type { WorldgenProfileId, WorldState } from '../types/world';

export const WORLD_SAVE_MAX_BYTES = 8 * 1024 * 1024;
export const WORLD_SAVE_MAX_SLOTS = 12;
const FORMAT = 'ai-sect-sandbox';
const VERSION = 1;
// Variable-size roster ledgers are constrained by the file byte budget, not an NPC-count limit.
const SAVE_COLLECTION_LIMIT = WORLD_SAVE_MAX_BYTES;
type ErrorCode = 'size' | 'json' | 'version' | 'invalid_world' | 'invalid_slot' | 'slot_limit' | 'not_found' | 'storage' | 'slot_conflict' | 'storage_read_only' | 'integrity' | 'storage_blocked';
export class WorldSaveError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message); this.name = 'WorldSaveError'; }
}

type Validator = (value: unknown, path: string) => void;
type Rule = Validator | { optional: Validator };
const fail = (path: string): never => { throw new WorldSaveError('invalid_world', `无法验证存档字段：${path}`); };
const optional = (value: Validator) => ({ optional: value });
const strings = (max = 9000, min = 0): Validator => (v, path) => {
  if (typeof v !== 'string' || v.length > max || v.length < min) fail(path);
};
const num = (min: number, max: number, integer = false): Validator => (v, path) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isSafeInteger(v))) fail(path);
};
const one = (...values: (string | number)[]): Validator => (v, path) => {
  if (!values.some((entry) => entry === v)) fail(path);
};
const arr = (max: number, rule: Validator): Validator => (v, path) => {
  if (!Array.isArray(v) || v.length > max) return fail(path);
  v.forEach((item, i) => rule(item, `${path}[${i}]`));
};
const structure = (rules: Record<string, Rule>): Validator => (v, path) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(path);
  const rec = v as Record<string, unknown>;
  for (const key of Object.keys(rec)) if (!Object.hasOwn(rules, key)) fail(`${path}.${key}`);
  for (const [key, rule] of Object.entries(rules)) {
    const child = `${path}.${key}`;
    if (typeof rule === 'function') rule(rec[key], child);
    else if (rec[key] !== undefined) rule.optional(rec[key], child);
  }
};
const id = strings(240, 1);
const text = strings();
const bool: Validator = (v, path) => { if (typeof v !== 'boolean') fail(path); };
const tick = num(0, 100_000_000, true);
const unsigned32 = num(0, 0xffffffff, true);
const wealth = num(0, 1_000_000_000);
const percentage = num(0, 100);
const affinity = num(-100, 100);
const count = num(0, 10_000, true);
const month = num(1, 12, true);
const ids = arr(SAVE_COLLECTION_LIMIT, id);
const oid = optional(id), otick = optional(tick), otext = optional(text);
const spirit = one('金','木','水','火','土','雷','暗','天灵根');
const realm = one('练气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫');
const sectRank = one('外门弟子','内门弟子','真传弟子','长老','太上长老','掌门');
const source = one('utility','llm');
const doctrineTheme = one('cultivation','conflict','community','heavenly');
const doctrineAmount = num(0, 1_000_000_000, true);
const eventCategory = one('breakthrough','combat','intrigue','heavenly','death','diplomacy');
const mode = one('avatar','ring');
const intent = one('guide','persuade','deceive','interrogate','recruit');
const vote = one('support','oppose','abstain');
const action = one(...'CULTIVATE BREAKTHROUGH EXPLORE SOCIALIZE DUEL SCHEMING PURSUE_SCHEME AUTHOR_TECHNIQUE STUDY_TECHNIQUE GATHER_HERBS BREW_PILL USE_PILL FORGE_ARTIFACT BIND_ARTIFACT REPAIR_ARTIFACT SALVAGE_ARTIFACT AWAKEN_ARTIFACT FACE_TRIBULATION AMBUSH_TRIBULATION CHALLENGE_LEADERSHIP PLOT_COUP BUILD_FACILITY DISPATCH_GUARD GUARD_DUTY OFFER_ALLIANCE DECLARE_WAR DEMAND_TRIBUTE LAUNCH_SIEGE JOIN_OCCASION PURSUE_BOUNTY TAME_BEAST TRADE DUAL_CULTIVATE SECT_DIPLOMACY TEACH ACCEPT_TUITION DECLINE_TUITION OFFER_OATH ACCEPT_OATH DECLINE_OATH FULFILL_OATH APPEAL_OATH PLACE_MARKET_BUY PLACE_MARKET_SELL CANCEL_MARKET_ORDER RECRUIT_SETTLER DELIVER_RELIEF FILE_WITNESS_CLAIM ATTEST_WITNESS CHALLENGE_WITNESS NAME_HEIR CLAIM_ESTATE HOLD_MEMORIAL DOCTRINE RELOCATE RECOLLECT RELIC SCRIPTURE RANK_SEASON ESCORT CEASEFIRE RESEARCH SANCTUARY SECT_CREDIT PILGRIMAGE CHRONICLE_ERRATA HABITAT INFIRMARY FORMATION_NETWORK TERRITORIAL_LEASE HOUSEHOLD_GUARDIAN VILLAGE_WORKS SEALED_COURIER SECT_SERVICE SHARED_COMMONS TERRAIN_RECOVERY WORKSHOP FURNACE_RESERVATION FURNACE_SAFETY SPARRING EXPEDITION_RESCUE SHORT_SHIFT BOUNDARY_RELIEF APPRENTICE_COHORT HOUSEHOLD_NAME CARAVAN_RESTITUTION VILLAGE_GRANARY VILLAGE_SUPPLY ROUTE_WARNING PAVILION_LOAN WORKSHOP_CAPACITY CIVIC_MEMORIAL RELIC_EXHIBIT PROBATION ROAD VILLAGE_CENSUS OATH_ARBITRATION FIELD_OBSERVATORY SEASON_REVIEW REST'.split(' '));
const herbs = structure({jade_leaf:count,earth_root:count,star_bloom:count,shadow_moss:count});
const marketGood = one('jade_leaf','earth_root','star_bloom','shadow_moss','foundation','golden','barrier','heart_poison');
const flowGood = one('stone','jade_leaf','earth_root','star_bloom','shadow_moss','foundation','golden','barrier','heart_poison');
const flowMeasure = num(0,Number.MAX_SAFE_INTEGER);
const flowSerial = num(1,Number.MAX_SAFE_INTEGER,true);
const flowAccount = structure({kind:one('actor','site','sect','order','shipment','oath','relocation','workshop','salvage','granary','village_supply'),id,
  pocket:optional(one('payment','collateral'))});
const granaryReceipt: Validator = (value, path) => {
  const kind = (value as { kind?: unknown } | null)?.kind;
  if (kind === 'donate' || kind === 'donate_roots' || kind === 'donate_stones') return structure({kind:one(kind),tick,actorId:id})(value,path);
  if (kind === 'draw') return structure({kind:one('draw'),tick,actorId:id,
    stressBefore:percentage,stressAfter:percentage,disasterTick:tick})(value,path);
  return fail(path);
};
const villageSupplySigner = structure({actorId:id,donationTick:tick,donationKind:one('donate','donate_roots','donate_stones')});
const villageSupplyHazard = structure({id,kind:one('meteor','beast_tide','cursed_miasma'),tileId:id,createdTick:tick,expiresTick:tick,intensity:one(1,2,3)});
const supplyCheckpoint = num(0,VILLAGE_SUPPLY_MAX_ROUTE_TILES-1,true);
const routeWarningObservation = structure({
  id,actorId:id,journeyId:id,partyIds:arr(2,id),legIndex:tick,fromPathIndex:tick,toPathIndex:tick,fromTileId:id,toTileId:id,
  exitTileId:oid,exitPathIndex:otick,observedTick:tick,hazard:villageSupplyHazard,
});
const villageSupplyLeg = structure({good:one('earth_root','stone'),phase:one('outbound','returning','delivered','returned','lost'),
  checkpoint:supplyCheckpoint,lastAdvancedTick:tick,settledTick:otick,loss:optional(villageSupplyHazard),
  turnback:optional(structure({tick,checkpoint:supplyCheckpoint,cause:one('destination_closed','unsafe_next'),hazard:optional(villageSupplyHazard)}))});
const flowScope = structure({kind:one('observer','known_sites','participants'),siteIds:optional(arr(8,id)),actorIds:optional(arr(8,id))});
const marketQty = num(1,12,true), marketPrice = num(1,500,true);
const pills = structure({foundation:count,golden:count,barrier:count,heart_poison:count});
const technique = structure({id:oid,authorId:oid,createdTick:otick,name:id,spiritRoot:spirit});
const editionKind = one('gloss','misread','corrected');
const relicSet = one('star-balance');
const workshopArtifactOrigin = structure({orderId:id,piece:one(1,2),makerId:id,siteId:id,blankTick:tick,finishedTick:tick});
const artifact = structure({workshopOrigin:optional(workshopArtifactOrigin),relicSetId:optional(relicSet),relicFragmentIds:optional(arr(2,id)),id:oid,tier:optional(one('法器','灵器','法宝','通天灵宝')),durability:optional(wealth),maxDurability:optional(wealth),boundTo:oid,
  soul:optional(structure({name:id,experience:percentage})),resonance:optional(percentage),name:id,spiritRoot:spirit});
const eligibility = { actorId:id,basis:one('nomination','bond','sect'),strength:num(0,10_000) };
const memory = structure({id,tick,content:text,importance:num(1,10),emotionalValence:num(-5,5),decayRate:num(0,10),
  consolidatedAtTick:otick,category:one('cultivation','combat','social','heavenly','whisper')});
const dialogue = structure({kind:one('combat','trade','dual_cultivation','sect_diplomacy'),source,
  turns:arr(24,structure({speakerId:id,speakerName:id,text}))});
const publicFact = {id,tick,year:tick,month,title:text,description:text,category:eventCategory,actorIds:ids,locationId:oid,dialogue:optional(dialogue)};
const anchor = structure(publicFact);
const chronicleChapter = structure({id,chapterNumber:tick,startTick:tick,endTick:tick,title:text,
  anchors:arr(18,anchor),biographies:arr(8,structure({actorId:id,name:id,realm,sectName:otext,anchorIds:ids})),body:strings(25_000),source});
const scenarioObjective: Validator = (value, path) => {
  const kind = (value as {kind?:unknown} | null)?.kind;
  if (kind === 'cultivator_survives') return structure({kind:one(kind),actorId:id})(value,path);
  if (kind === 'living_population') return structure({kind:one(kind),minimum:num(1,SCENARIO_MAX_POPULATION_TARGET,true)})(value,path);
  if (kind === 'site_qi') return structure({kind:one(kind),locationId:id,minimum:num(0,SCENARIO_MAX_SITE_QI_TARGET,true)})(value,path);
  if (kind === 'sect_treasury') return structure({kind:one(kind),sectId:id,minimum:num(0,SCENARIO_MAX_TREASURY_TARGET,true)})(value,path);
  fail(path);
};
const dispatchPayload: Validator = (value, path) => {
  const kind = (value as {kind?:unknown} | null)?.kind;
  if (kind === 'private_cue') return structure({kind:one(kind),cue:one('request_audience','offer_relief')})(value,path);
  if (kind === 'public_relief') return structure({kind:one(kind),sourceEventId:id,settlementId:id,stones:count,herbs:count})(value,path);
  fail(path);
};
const scenarioEvidence: Validator = (value, path) => {
  const kind = (value as {kind?:unknown} | null)?.kind;
  if (kind === 'cultivator_survives') return structure({kind:one(kind),found:bool,alive:bool,hp:wealth})(value,path);
  if (kind === 'living_population') return structure({kind:one(kind),count:tick})(value,path);
  if (kind === 'site_qi') return structure({kind:one(kind),found:bool,qi:num(0,150)})(value,path);
  if (kind === 'sect_treasury') return structure({kind:one(kind),found:bool,atSite:wealth,inTransit:wealth,total:num(0,2_000_000_000)})(value,path);
  fail(path);
};

const chronicleReading: Validator = (value, path) => {
  if ((value as {kind?:unknown} | null)?.kind === 'duel') return structure({kind:one('duel'),winnerId:id})(value,path);
  return structure({kind:one('relief'),delivery:one('full_supplies','unfunded')})(value,path);
};
const errataSourceFact: Validator = (value, path) => {
  const common = { sourceEventId:id,tick,locationId:id };
  if ((value as {kind?:unknown} | null)?.kind === 'duel') {
    return structure({...common,kind:one('duel'),participantIds:arr(2,id),winnerId:id})(value,path);
  }
  return structure({...common,kind:one('relief'),actorId:id,settlementId:id,stones:count,herbs:count})(value,path);
};

const proposal: Validator = (value, path) => {
  const kind = (value as {kind?:unknown} | null)?.kind;
  if (kind === 'war') return structure({kind:one('war'),targetSectId:id})(value,path);
  if (kind === 'expel') return structure({kind:one('expel'),targetCultivatorId:id})(value,path);
  if (kind === 'allocate_pill') return structure({kind:one('allocate_pill'),targetCultivatorId:id,donorId:id})(value,path);
  fail(path);
};

const noteTarget: Validator = (value, path) => {
  const kind = (value as {kind?:unknown} | null)?.kind;
  if (kind === 'tile') return structure({ kind:one('tile'),tileId:id })(value,path);
  if (kind === 'site') return structure({ kind:one('site'),locationId:id,tileId:id,siteName:strings(ANNOTATION_MAX_TITLE_CHARS,1) })(value,path);
  fail(path);
};
const facilityLevels = structure({qi_array:num(0,3,true),alchemy_hall:num(0,3,true),scripture_pavilion:num(0,3,true),defense_array:num(0,3,true),spirit_mine:num(0,3,true)});
const terrainBiome = one('灵山','毒沼','剑冢','荒漠','魔渊','坊市');
const fieldReading = structure({kind:one('平息','灵潮','罡风','霜息'),intensity:num(0,1)});
const observatoryActor = structure({
  runs:arr(OBSERVATORY_TERMINAL_LIMIT + 1,structure({
    locationId:id,openedTick:tick,targetTick:tick,baseline:fieldReading,forecast:fieldReading,
    status:one('pending','measured','missed'),reading:optional(fieldReading),
    relay:optional(structure({recipientId:id,relayedTick:tick}))
  })),
  inbox:arr(OBSERVATORY_INBOX_LIMIT,structure({operatorId:id,openedTick:tick}))
});
const observatoryActors: Validator = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path);
  for (const [actorId, account] of Object.entries(value)) {
    id(actorId, `${path}.key`);
    observatoryActor(account, `${path}.${actorId}`);
  }
};
const censusNumber = num(0,Number.MAX_SAFE_INTEGER,true);
const censusCount = structure({villageId:id,population:censusNumber,juveniles:censusNumber});
const locationKind = one('sect_hq','spirit_vein','secret_realm','market','abyss');

const shape = structure({
  tick, interventionSequence:tick, year:tick, month,
  random:structure({algorithm:one('mulberry32-v1'),seed:unsigned32,state:unsigned32}),
  sects:arr(48,structure({id,name:id,alignment:one('正道','魔道','中立'),color:strings(80),doctrine:text,reputation:num(-1_000_000,1_000_000),spiritStones:wealth,headquartersId:id,
    pavilion:arr(350,technique),leaderId:oid, arrayHp:wealth,arrayMaxHp:wealth,
    facilities:facilityLevels,
    officeVacancy:optional(structure({eventId:id,tick})),
    succession:optional(structure({tick,method:one('election','challenge','coup'),previousLeaderId:oid,leaderId:id,supporterIds:ids})),
    monthlyEconomy:optional(structure({tick,taxes:wealth,mining:wealth,upkeep:wealth,net:num(-1_000_000_000,1_000_000_000)}))})),
  locations:arr(1200,structure({id,name:id,x:num(0,1000),y:num(0,600),type:one('sect_hq','spirit_vein','secret_realm','market','abyss'),spiritRoot:spirit,
    spiritQi:num(0,150),ownerSectId:oid,inheritanceScrolls:arr(350,technique),herbs,herbCapacity:herbs,furnaceGrade:one(0,1,2,3),description:text})),
  cultivators:arr(SAVE_COLLECTION_LIMIT,structure({id,name:id,title:text,sectId:strings(240),sectRank,contribution:wealth,transgressions:percentage,disciplineRevision:otick,realm,realmStage:num(1,9,true),
    qiProgress:percentage,hp:wealth,maxHp:num(1,1_000_000_000),combatPower:wealth,age:wealth,lifespan:wealth,
    personality:one('刚正','阴险','狂傲','苟道','痴情','嗜血','逍遥','诡诈'),locationId:id,spiritStones:wealth,karma:affinity,currentAction:action,
    innerMonologue:text,secretGoal:text,spiritRoot:spirit,technique,techniqueMastery:percentage,authoredTechnique:optional(technique),
    activeEdition:optional(structure({originalId:id,editionId:id,kind:editionKind})),herbs,pills,pillToxicity:percentage,
    exploredTileIds:ids,artifacts:arr(SAVE_COLLECTION_LIMIT,artifact),memories:arr(160,memory),coreMemories:arr(160,memory),memorySequence:tick,
    reflections:arr(100,structure({id,tick,kind:one('belief','obsession','heart_demon'),theme:one('cultivation','conflict','community','heavenly'),intensity:num(1,10),statement:text,sourceMemoryIds:ids,source})),
    rumors:arr(200,structure({id,subject:text,locationId:oid,originTick:tick,learnedTick:tick,provenance:one('witness','conversation','flying_sword','fabricated'),
      confidence:percentage,hops:count,sourceCultivatorId:oid,originEventId:oid,originSourceCultivatorId:oid,
      witnessScope:optional(one('participants')),lead:optional(bool)})),
    activeScheme:optional(structure({id,kind:one('infiltration','foundation_pill','vengeance','artifact_heist'),title:text,status:one('active','completed','failed'),
      startedTick:tick,finishedTick:otick,stepIndex:count,steps:arr(32,structure({label:text,completedTick:otick})),targetCultivatorId:oid,targetLocationId:oid,artifactName:otext,outcome:otext})),
    tribulation:optional(structure({id,targetRealm:realm,startedTick:tick,stage:one('lightning','heart_demon','passed','failed'),nextWave:count,totalWaves:count,
      pressure:percentage,interruptions:count,resolvedTick:otick,lastOutcome:otext,lastActedTick:otick})),
    service:optional(structure({status:one('retired','serving'),changedTick:tick,retiredTick:tick,formerSectId:id,formerRank:sectRank})),
    guardAssignment:optional(structure({locationId:id,assignedTick:tick,expiresTick:tick})),namedHeirId:oid,alive:bool})),
  relationships:arr(SAVE_COLLECTION_LIMIT,structure({fromId:id,toId:id,type:one('师徒','同门','道侣','血仇','挚友','竞争'),affinity,note:text})),
  events:arr(200,structure({...publicFact,witnessScope:optional(one('participants')),duelWinnerId:oid,damage:optional(arr(SAVE_COLLECTION_LIMIT,structure({cultivatorId:id,amount:wealth})))})),
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
    startedTick:tick,rounds:count,lastResolvedTick:otick,outcome:otext})),
  tributeDemands:arr(2000,structure({id,demanderSectId:id,targetSectId:id,amount:wealth,status:one('pending','paid','rejected'),startedTick:tick,resolvedTick:otick})),
  occasions:arr(2000,structure({id,kind:one('tournament','expedition'),title:text,locationId:id,startedTick:tick,registrationClosesTick:tick,expiresTick:tick,
    status:one('registration','running','completed','cancelled'),participantIds:ids,remainingIds:ids,
    bouts:arr(30,structure({round:count,firstId:id,secondId:oid,winnerId:id})),
    expeditions:arr(30,structure({cultivatorId:id,tick,outcome:one('loot','wounded','death','escaped'),description:text})),round:count,championId:oid,lastResolvedTick:otick})),
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
  villageCensuses:structure({periods:arr(VILLAGE_CENSUS_PERIOD_LIMIT,structure({
    tick,year:tick,month,opening:arr(SAVE_COLLECTION_LIMIT,censusCount),closing:optional(arr(SAVE_COLLECTION_LIMIT,censusCount)),
    movements:arr(SAVE_COLLECTION_LIMIT,structure({
      id,kind:one('birth','maturation','death','migration','enrollment'),villageId:id,targetVillageId:oid,people:censusNumber,
      volunteerId:oid,cultivatorId:oid,bornTick:otick
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
  workshops:structure({nextId:num(1,100_000_000,true),orders:arr(SAVE_COLLECTION_LIMIT,structure({
    capacityOffer:optional(structure({caseId:id,damagedTick:tick,blankTick:tick,makerId:id,offeredTick:tick})),
    capacityAmendment:optional(structure({acceptedTick:tick,patronId:id,releasedQuantity:one(1),keptQuantity:one(1),
      workUntilTick:tick,releasedStones:count,releasedHerbs:count})),
    id,patronId:id,makerId:id,siteId:id,tier:one('法器','灵器'),quantity:one(1,2),qualityFloor:one('standard','fine'),
    status:one('offered','active','completed','cancelled','declined','expired'),
    offeredTick:tick,offerExpiresTick:tick,acceptedTick:otick,deadlineTick:otick,settledTick:otick,
    closeReason:optional(one('patron_cancelled','maker_cancelled','offer_expired','work_expired','patron_unavailable','maker_unavailable','site_unavailable','institution_closed')),
    institution:optional(structure({sectId:id,establishedTick:tick,arrivalPlanId:oid})),disbandmentId:oid,
    escrowStones:count,escrowHerbs:count,refundedStones:count,refundedHerbs:count,
    work:arr(WORKSHOP_MAX_WORK_RECEIPTS,structure({tick,makerId:id,piece:one(1,2),stage:one('blank','finish'),
      stonesUsed:count,herbsUsed:count,quality:optional(one('failed','standard','fine')),
      qualityScore:optional(num(0,100,true)),artifactId:oid,feePaid:optional(count)}))
  }))}),
  artifactSalvages:structure({receipts:arr(SAVE_COLLECTION_LIMIT,structure({
    artifactId:id,artifactName:id,ownerId:id,siteId:id,tick,tier:one('法器','灵器'),durability:wealth,maxDurability:wealth,
    origin:workshopArtifactOrigin,
  }))}),
  workshopDisbandments:structure({closures:arr(88,structure({
    id,planId:id,abandonedSiteId:id,sectId:id,originId:id,destinationId:id,tick,
    returns:arr(SAVE_COLLECTION_LIMIT,structure({orderId:id,patronId:id,makerId:id,acceptedTick:tick,
      tier:one('法器','灵器'),quantity:one(1,2),workCount:num(0,WORKSHOP_MAX_WORK_RECEIPTS-1,true),
      consumedStones:count,consumedHerbs:count,paidWages:count,refundedStones:count,refundedHerbs:count})),
    voidedOfferIds:arr(SAVE_COLLECTION_LIMIT,id),
  }))}),
  furnaceReservations:structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),reservations:arr(SAVE_COLLECTION_LIMIT,structure({
    id,actorId:id,siteId:id,workshopOrderId:oid,requestedTick:tick,expiresTick:tick,
    suspendedTicks:optional(num(1,100_000_000,true)),lastSuspendedTick:otick,
    status:one('queued','reserved','used','cancelled','expired'),assignedTick:otick,slot:optional(one(1,2,3)),closedTick:otick,
    reason:optional(one('owner_cancelled','actor_unavailable','site_unavailable','workshop_closed','queue_expired','turn_missed')),
  })),uses:arr(SAVE_COLLECTION_LIMIT,structure({
    siteId:id,actorId:id,tick,slot:one(1,2,3),kind:one('brew','forge','repair','awaken','workshop','relic','salvage'),
    workshopOrderId:oid,reservationId:oid,
  }))}),
  furnaceSafety:structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),cases:arr(SAVE_COLLECTION_LIMIT,structure({
    id,siteId:id,ownerAtDamage:id,hazardId:id,hazardTileId:id,hazardCreatedTick:tick,severity:one(1,2,3),damagedTick:tick,
    integrityBefore:num(0,100,true),integrity:num(0,100,true),reopenedTick:otick,
    receipts:arr(8,structure({kind:one('inspect','repair','reopen'),tick,actorId:id,ownerSectId:id,
      integrityBefore:num(0,100,true),integrityAfter:num(0,100,true)}))
  }))}),
  sparring:structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),agreements:arr(SAVE_COLLECTION_LIMIT,structure({
    id,proposerId:id,partnerId:id,siteId:id,roundsPlanned:one(1,2),offeredTick:tick,offerExpiresTick:tick,
    status:one('offered','active','completed','declined','withdrawn','yielded','expired','interrupted'),
    acceptedTick:otick,deadlineTick:otick,closedTick:otick,closedById:oid,
    readiness:optional(structure({tick,actorIds:arr(2,id)})),
    rounds:arr(2,structure({tick,members:arr(2,structure({actorId:id,qiSpent:one(SPARRING_QI_COST),
      masteryGained:num(0,SPARRING_MASTERY_MAX)}))})),
  }))}),
  expeditionRescues:structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),requests:arr(SAVE_COLLECTION_LIMIT,structure({
    id,occasionId:id,explorerId:id,gateSiteId:id,witnessIds:arr(8,id),openedTick:tick,offerExpiresTick:tick,
    status:one('signaled','extracting','rescued','withdrawn','expired','interrupted'),
    rescuerId:oid,acceptedTick:otick,exitSiteId:oid,path:arr(6402,structure({x:num(0,1000),y:num(0,600)})),
    pathIndex:num(0,6401,true),lastAdvancedTick:otick,finishedTick:otick,
    reason:optional(one('withdrawn','offer_expired','gate_closed','participant_lost','unsafe_route')),
    supplySpent:optional(one(1)),arrivedIds:optional(arr(2,id)),
  }))}),
  shortShifts:structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),shifts:arr(SAVE_COLLECTION_LIMIT,structure({
    id,hostId:id,workerId:id,hostSectId:id,workerSectId:id,siteId:id,observatoryOpenedTick:tick,offeredTick:tick,offerExpiresTick:tick,
    status:one('offered','active','completed','declined','withdrawn','revoked','expired'),
    acceptedTick:otick,shiftTick:otick,closedTick:otick,closedById:oid,
    closeReason:optional(one('declined','host_withdrew','worker_withdrew','access_revoked','party_lost','offer_expired','shift_missed')),
    escrowStones:one(0,SHORT_SHIFT_WAGE),paidStones:one(0,SHORT_SHIFT_WAGE),refundedStones:one(0,SHORT_SHIFT_WAGE),
    attendance:optional(structure({tick,reading:structure({kind:one('平息','灵潮','罡风','霜息'),intensity:num(0,1)})})),
  }))}),
  boundaryReliefs:structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),cases:arr(SAVE_COLLECTION_LIMIT,structure({
    id,sectId:id,leaderId:id,incumbentId:id,incomingId:id,originSiteId:id,postSiteId:id,incumbentAssignedTick:tick,
    offeredTick:tick,offerExpiresTick:tick,status:one('offered','travelling','returning','completed','declined','withdrawn','expired','interrupted'),
    acceptedTick:otick,deadlineTick:otick,path:arr(BOUNDARY_RELIEF_MAX_PATH_STEPS + 1,structure({x:num(0,1000),y:num(0,600)})),
    pathIndex:num(0,BOUNDARY_RELIEF_MAX_PATH_STEPS,true),lastAdvancedTick:otick,outboundSteps:count,returnSteps:count,
    strainSpent:count,closedTick:otick,closedById:oid,
    closeReason:optional(one('declined','withdrawn','offer_expired','title_lost','conflicting_duty','actor_lost','route_blocked','late')),
    coverage:structure({tick,kind:one('incumbent','gap','relief','other'),guardId:oid}),firstGapTick:otick,
  }))}),
  apprenticeCohorts:structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),
    cohorts:arr(SAVE_COLLECTION_LIMIT,structure({id,mentorId:id,sectId:id,siteId:id,techniqueId:id,openedTick:tick,lessonTick:tick,
      status:one('offered','held','cancelled','expired'),teachingTick:otick,closedTick:otick,instructionSpent:optional(one(1)),
      reason:optional(one('mentor_cancelled','mentor_unavailable','no_confirmed_attendance','missed_lesson','no_budget')),
      seats:arr(COHORT_MAX_INVITEES,structure({studentId:id,status:one('invited','accepted','left','missed','attended'),
        acceptedTick:otick,readyTick:otick,leftTick:otick,attendedTick:otick,masteryGained:optional(num(0,1))})),
    })),graduations:arr(SAVE_COLLECTION_LIMIT,structure({cohortId:id,studentId:id,mentorId:id,techniqueId:id,tick,
      masteryBefore:percentage,masteryAfter:percentage})),
  }),
  householdNames:structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),entries:arr(SAVE_COLLECTION_LIMIT,structure({
    id,actorId:id,volunteerId:id,householdId:id,settlementId:id,kind:one('alias','clear'),
    alias:optional(one(...HOUSEHOLD_NAME_ALIASES)),openedTick:tick,expiresTick:tick,
    status:one('proposed','verified','withdrawn','expired'),closedTick:otick,witnessId:oid,
  }))}),
  caravanRestitution:structure({lots:arr(SAVE_COLLECTION_LIMIT,structure({
    id,shipmentId:id,sourceLossEventId:id,siteId:id,tileId:id,hazardId:id,hazardIntensity:one(2),openedTick:tick,
    good:one('jade_leaf','earth_root'),originalQuantity:count,destroyedQuantity:count,units:one(1),buyerId:id,sellerId:id,
    status:one('buried','sealed','returned'),finderId:oid,discoveredTick:otick,returnedTick:otick,returnedById:oid,
  }))}),
  villageGranaries:structure({granaries:arr(SAVE_COLLECTION_LIMIT,structure({
    settlementId:id,roots:num(0,VILLAGE_GRANARY_CAPACITY.roots,true),stones:num(0,VILLAGE_GRANARY_CAPACITY.stones,true),
    rootOnlyDonations:optional(num(1,Number.MAX_SAFE_INTEGER,true)),stoneOnlyDonations:optional(num(1,Number.MAX_SAFE_INTEGER,true)),
    donatedRoots:num(0,Number.MAX_SAFE_INTEGER,true),donatedStones:num(0,Number.MAX_SAFE_INTEGER,true),
    spentRoots:num(0,Number.MAX_SAFE_INTEGER,true),spentStones:num(0,Number.MAX_SAFE_INTEGER,true),
    lastDrawTick:otick,receipts:arr(VILLAGE_GRANARY_RECEIPT_LIMIT,granaryReceipt),
  }))}),
  civicMemorials:structure({nextDeedId:num(1,Number.MAX_SAFE_INTEGER,true),nextMemorialId:num(1,Number.MAX_SAFE_INTEGER,true),
    deeds:arr(SAVE_COLLECTION_LIMIT,structure({
      id,reliefRecordId:id,settlementId:id,siteId:id,subjectId:id,volunteerId:id,householdId:id,name:id,enrolledTick:tick,
      tick,stones:count,herbs:count,witnessIds:ids,
      errata:optional(structure({retellings:arr(SAVE_COLLECTION_LIMIT,structure({id,tick,reading:one('full_supplies','unfunded')})),
        correction:optional(structure({id,tick,reading:one('full_supplies')}))})),
    })),
    memorials:arr(SAVE_COLLECTION_LIMIT,structure({id,deedId:id,proposerId:id,
      proposerDonationTick:tick,proposerDonationKind:one('donate','donate_roots','donate_stones'),openedTick:tick,expiresTick:tick,
      status:one('proposed','verified','expired'),verification:optional(structure({tick,verifierId:id,
        subjectStatus:one('recruited','deceased'),stonesSpent:count,earthRootsSpent:count}))})),
  }),
  pavilionLoans:structure({nextLoanId:num(1,Number.MAX_SAFE_INTEGER,true),nextShiftId:num(1,Number.MAX_SAFE_INTEGER,true),
    copies:arr(SAVE_COLLECTION_LIMIT,structure({editionId:id,originalId:id,sectId:id,siteId:id,shelvedTick:tick,shelvedById:id,shelvingShiftId:id})),
    shifts:arr(SAVE_COLLECTION_LIMIT,structure({id,actorId:id,sectId:id,siteId:id,signedTick:tick,startsTick:tick,
      endsTick:tick,lastServedTick:otick})),
    loans:arr(SAVE_COLLECTION_LIMIT,structure({id,editionId:id,borrowerId:id,checkoutTick:tick,dueTick:tick,checkoutShiftId:id,
      read:optional(structure({tick,siteId:id,masteryBefore:percentage,masteryAfter:percentage,credited:bool})),
      returned:optional(structure({tick,shiftId:id}))})),
  }),
  routeWarnings:structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),nextObservationId:num(1,Number.MAX_SAFE_INTEGER,true),
    observations:arr(SAVE_COLLECTION_LIMIT,routeWarningObservation),
    notices:arr(SAVE_COLLECTION_LIMIT,structure({id,postedTick:tick,expiresTick:tick,retractedTick:otick,
      observation:routeWarningObservation,corroboration:optional(structure({tick,observation:routeWarningObservation}))})),
  }),
  villageSupply:structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),agreements:arr(SAVE_COLLECTION_LIMIT,structure({
    id,fromSettlementId:id,toSettlementId:id,proposer:villageSupplySigner,offeredTick:tick,expiresTick:tick,
    status:one('offered','active','completed','declined','withdrawn','expired'),acceptor:optional(villageSupplySigner),
    acceptedTick:otick,closedTick:otick,path:optional(arr(VILLAGE_SUPPLY_MAX_ROUTE_TILES,id)),legs:optional(arr(2,villageSupplyLeg)),
  }))}),
  resourceFlow:structure({nextId:flowSerial,months:arr(RESOURCE_FLOW_MONTH_LIMIT,structure({
    tick,year:tick,month,totalEntries:num(0,Number.MAX_SAFE_INTEGER,true),
    totals:arr(9,structure({good:flowGood,transfer:flowMeasure,production:flowMeasure,consumption:flowMeasure,loss:flowMeasure})),
    entries:arr(RESOURCE_FLOW_DETAIL_LIMIT,structure({
      id:flowSerial,tick,mechanism:one('alchemy','market','sect_economy','oath','commons','relocation','terrain','workshop','road','observatory','pilgrimage','granary','furnace_safety','artifact_salvage','village_supply','civic_memorial'),
      refId:id,reason:strings(40,1),good:flowGood,amount:flowMeasure,visibility:flowScope,
      kind:one('transfer','production','consumption','loss'),from:optional(flowAccount),to:optional(flowAccount)
    }))
  }))}),
  sharedCommons:structure({nextId:num(1,100_000_000,true),pacts:arr(SAVE_COLLECTION_LIMIT,structure({
    id,siteId:id,herbId:one('jade_leaf','earth_root','star_bloom','shadow_moss'),proposerSectId:id,openedTick:tick,offerExpiresTick:tick,
    status:one('offered','active','closed'),activatedTick:otick,startsTick:otick,endsTick:otick,settledTick:otick,
    closeReason:optional(one('declined','offer_expiry','title_change','site_lost','term_complete','stale_signer')),
    parties:arr(3,structure({sectId:id,signerId:id,share:one(1,2),signedTick:otick})),
    rounds:arr(COMMONS_TERM_TICKS / COMMONS_ROUND_TICKS,structure({
      startTick:tick,endsTick:tick,stockAtOpen:count,reserved:num(0,COMMONS_MAX_RESERVE,true),
      allocations:arr(3,structure({sectId:id,maintenanceDue:num(1,2*COMMONS_MAINTENANCE_UNIT,true),
        maintenancePaid:num(0,2*COMMONS_MAINTENANCE_UNIT,true),quota:num(0,COMMONS_MAX_RESERVE,true),used:num(0,COMMONS_MAX_RESERVE,true)})),
      harvests:arr(COMMONS_MAX_RESERVE,structure({tick,actorId:id,sectId:id,units:num(1,2,true)}))
    }))
  }))}),
  serviceRetirement:structure({nextId:num(1,100_000_000,true),history:arr(SERVICE_RETIREMENT_HISTORY_LIMIT,structure({
    id,actorId:id,sectId:id,tick,kind:one('retire','return'),formerRank:sectRank,forumReleased:bool,leaderReleased:bool,
    guardLocationId:oid,stewardSchoolIds:ids,infirmaryShiftIds:ids
  }))}),
  couriers:structure({nextId:num(1,100_000_000,true),dispatches:arr(SAVE_COLLECTION_LIMIT,structure({
    id,senderId:id,recipientId:id,courierId:id,originId:id,destinationId:id,openedTick:tick,offerExpiresTick:tick,
    status:one('offered','in_transit','returning','delivered','returned','lost','declined','expired'),sealed:dispatchPayload,
    acceptedTick:otick,deadlineTick:otick,settledTick:otick,deliveredTick:otick,lastAdvancedTick:otick,
    path:arr(6402,structure({x:num(0,1000),y:num(0,600)})),pathIndex:num(0,6401,true),feePaid:num(0,COURIER_SERVICE_FEE,true),
    reason:optional(one('recipient_absent','recipient_unavailable','hazard','courier_death','route_lost','deadline','declined','offer_expiry'))
  }))}),
  watchlists:structure({nextId:num(1,100_000_000,true),lastCapturedTick:otick,
    watches:arr(WATCHLIST_MAX_WATCHES,structure({id,observerId:id,target:structure({kind:one('actor','site','sect'),id}),label:strings(WATCHLIST_MAX_LABEL_CHARS,1),
      createdTick:tick,readThroughTick:tick})),
    digests:arr(WATCHLIST_MAX_DIGESTS,structure({watchId:id,tick,buckets:arr(6,structure({category:eventCategory,count:num(1,WATCHLIST_BUCKET_MAX_COUNT,true)}))}))}),
  villageWorks:structure({nextId:num(1,100_000_000,true),projects:arr(SAVE_COLLECTION_LIMIT,structure({
    id,settlementId:id,sponsorSectId:id,sponsorId:id,kind:one('well','field','shelter'),startedTick:tick,deadlineTick:tick,
    status:one('building','completed','abandoned'),laborTotal:count,stonesSpent:count,rootsSpent:count,
    receipts:arr(8,structure({tick,labor:num(1,VILLAGE_WORK_MAX_LABOR_PER_TICK,true),adultsAvailable:tick})),lastWorkedTick:otick,
    settledTick:otick,endReason:optional(one('deadline','abandoned','site_lost')),capacityBefore:otick,capacityAfter:otick
  }))}),
  households:structure({nextId:num(1,100_000_000,true),
    groups:arr(SAVE_COLLECTION_LIMIT,structure({id,originSettlementId:id,branch:one('first','second'),createdTick:tick,
      presences:arr(SAVE_COLLECTION_LIMIT,structure({settlementId:id,adults:tick,juvenileCohorts:arr(200,structure({bornTick:tick,count:tick})),
        births:tick,matured:tick,migratedIn:tick,migratedOut:tick,deaths:tick}))})),
    members:arr(SAVE_COLLECTION_LIMIT,structure({volunteerId:id,householdId:id,settlementId:id,registeredTick:tick,
      status:one('resident','recruited','retired','deceased'),recruitedId:oid,settledTick:otick})),
    guardianships:arr(SAVE_COLLECTION_LIMIT,structure({id,householdId:id,guardianId:id,wardId:id,openedTick:tick,expiresTick:tick,
      status:one('offered','active','declined','expired','renounced','ended'),acceptedTick:otick,settledTick:otick,
      endReason:optional(one('declined','expiry','renounced','death'))}))}),
  territorialLeases:structure({nextId:num(1,100_000_000,true),leases:arr(SAVE_COLLECTION_LIMIT,structure({
    id,ownerSectId:id,lesseeSectId:id,siteId:id,ownerSignerId:id,lesseeSignerId:id,openedTick:tick,offerExpiresTick:tick,
    status:one('offered','active','closed','declined','expired'),startsTick:otick,endsTick:otick,settledTick:otick,
    endReason:optional(one('expiry','title_change','surrender')),escrow:num(0,LEASE_DEPOSIT,true),rentPaid:num(0,LEASE_DEPOSIT,true),
    refunded:num(0,LEASE_DEPOSIT,true),usedUnits:num(0,LEASE_QUOTA,true),receipts:arr(LEASE_QUOTA + LEASE_DEPOSIT,structure({
      tick,kind:one('harvest','refund'),amount:num(1,LEASE_DEPOSIT,true),actorId:oid,
      herbId:optional(one('jade_leaf','earth_root','star_bloom','shadow_moss')),units:optional(num(1,2,true))
    }))
  }))}),
  formations:structure({nextId:num(1,100_000_000,true),links:arr(SAVE_COLLECTION_LIMIT,structure({
    id,sectAId:id,sectBId:id,siteAId:id,siteBId:id,proposerId:id,recipientLeaderId:id,proposerSectId:id,
    openedTick:tick,offerExpiresTick:tick,steps:num(1,160,true),status:one('offered','active','broken','ended','declined','expired'),
    openedPaymentEach:count,fundedTick:otick,settledTick:otick,endReason:optional(one('site_lost','hostility')),
    heldA:num(0,FORMATION_BUFFER_CAP,true),heldB:num(0,FORMATION_BUFFER_CAP,true),sentTotal:doctrineAmount,deliveredTotal:doctrineAmount,transmissionLoss:doctrineAmount,
    drawnTotal:doctrineAmount,dissipatedTotal:doctrineAmount,repairTotal:doctrineAmount,lastDispatchTick:otick,lastDrawTick:otick,
    lastRepairTick:otick,brokenTick:otick,receipts:arr(FORMATION_RECEIPT_LIMIT,structure({tick,
      kind:one('dispatch','overload','draw','repair','dissipate'),actorId:oid,fromSiteId:oid,toSiteId:oid,
      sent:optional(count),delivered:optional(count),lost:optional(count),drawn:optional(count),stonesSpent:optional(count),dissipated:optional(count)}))
  }))}),
  infirmaries:structure({nextId:num(1,100_000_000,true),
    shifts:arr(SAVE_COLLECTION_LIMIT,structure({id,guardId:id,sectId:id,siteId:id,startedTick:tick,expiresTick:tick,lastServedTick:otick,
      lastWithheld:optional(structure({tick,duty:one('observatory','cohort')}))})),
    cases:arr(SAVE_COLLECTION_LIMIT,structure({id,patientId:id,sectId:id,siteId:id,queuedTick:tick,expiresTick:tick,
      status:one('waiting','treated','refused','closed'),settledTick:otick,reason:optional(one('expiry','ineligible','recovered','refused')),
      receipt:optional(structure({guardId:id,shiftId:id,tick,stonesSpent:count,herbsSpent:count,
        handoff:optional(structure({fromShiftId:id,duty:one('observatory','cohort')})),
        hpRestored:num(Number.MIN_VALUE,1_000_000_000),toxicityRemoved:num(0,INFIRMARY_DETOX_MAX)}))}))}),
  habitats:structure({nextId:num(1,100_000_000,true),
    stewardships:arr(SAVE_COLLECTION_LIMIT,structure({id,siteId:id,sponsorSectId:id,stewardId:id,restoredTick:tick,expiresTick:tick,
      endedTick:otick,endReason:optional(one('expiry','site_lost'))})),
    releases:arr(SAVE_COLLECTION_LIMIT,structure({id,beastId:id,formerOwnerId:id,siteId:id,releasedTick:tick,earliestSurveyTick:tick,
      deadlineTick:tick,status:one('monitoring','sighted','unconfirmed'),
      observation:optional(structure({observerId:id,tick,hp:num(Number.MIN_VALUE,1_000_000)})),settledTick:otick}))}),
  chronicleErrata:structure({nextId:num(1,100_000_000,true),
    sources:arr(SAVE_COLLECTION_LIMIT,errataSourceFact),
    retellings:arr(SAVE_COLLECTION_LIMIT,structure({id,sourceEventId:id,authorId:id,tick,reading:chronicleReading})),
    corrections:arr(SAVE_COLLECTION_LIMIT,structure({id,sourceEventId:id,editorId:id,tick,reading:chronicleReading,
      contestedRetellingIds:arr(CHRONICLE_ERRATA_MAX_RETELLINGS,id)}))}),
  pilgrimages:structure({nextId:num(1,100_000_000,true),journeys:arr(SAVE_COLLECTION_LIMIT,structure({
    id,organizerId:id,companionId:id,stopIds:arr(3,id),stopsVisited:arr(3,structure({locationId:id,tick})),
    status:one('proposed','active','completed','declined','expired','withdrawn','interrupted'),
    proposedTick:tick,offerExpiresTick:tick,startedTick:otick,expiresTick:otick,settledTick:otick,
    reason:optional(one('declined','offer_expiry','journey_expiry','withdrawn','lost_site','member_missing')),
    legIndex:num(0,2,true),path:arr(6402,structure({x:num(0,1000),y:num(0,600)})),
    pathIndex:num(0,6401,true),lastMovedTick:otick,spentByEach:num(0,2 * PILGRIMAGE_LEG_COST,true),
    aid:arr(4,structure({tick,giverId:id,receiverId:id,locationId:id,hpRestored:num(Number.MIN_VALUE,PILGRIMAGE_RELIEF_HP)})),
    camps:optional(arr(2,structure({legIndex:one(0,1),pathIndex:num(1,6400,true),tileId:id,
      point:structure({x:num(0,1000),y:num(0,600)}),openedTick:tick,payerId:id,
      status:one('pitched','resumed','dismantled','expired','interrupted'),closedTick:otick,
      recovery:optional(arr(2,structure({actorId:id,hp:num(Number.MIN_VALUE,PILGRIMAGE_CAMP_RECOVERY_HP)})))}))),
  }))}),
  credit:structure({nextId:num(1,100_000_000,true),
    loans:arr(SAVE_COLLECTION_LIMIT,structure({id,lenderSectId:id,borrowerSectId:id,lenderSignerId:id,borrowerSignerId:id,
      openedTick:tick,offerExpiresTick:tick,status:one('offered','active','paid','defaulted','declined','expired'),
      principal:doctrineAmount,fundedTick:otick,dueTick:otick,collectionUntilTick:otick,settledTick:otick,
      paidTotal:doctrineAmount,writtenOff:doctrineAmount,lastCollectionTick:otick,
      receipts:arr(SAVE_COLLECTION_LIMIT,structure({tick,kind:one('voluntary','collection'),amount:num(1,SECT_CREDIT_PAYMENT_MAX,true)}))})),
    restrictions:arr(SAVE_COLLECTION_LIMIT,structure({sectId:id,untilTick:tick}))}),
  sanctuary:structure({nextId:num(1,100_000_000,true),
    charters:arr(SAVE_COLLECTION_LIMIT,structure({id,siteId:id,sponsorSectId:id,founderId:id,openedTick:tick,
      expiresTick:tick,status:one('active','ended'),shieldHp:doctrineAmount,maxShieldHp:doctrineAmount,
      stonesSpent:doctrineAmount,endedTick:otick,endReason:optional(one('expiry','site_lost')),lastRepairTick:otick})),
    passes:arr(SAVE_COLLECTION_LIMIT,structure({id,charterId:id,actorId:id,issuedTick:tick,expiresTick:tick,status:one('active','ended'),
      endedTick:otick,endReason:optional(one('expiry','charter_ended','surrendered','violation','ineligible'))})),
    incidents:arr(SAVE_COLLECTION_LIMIT,structure({id,charterId:id,tick,aggressorId:id,visitorId:id,
      kind:one('blocked','exhausted','forfeited'),shieldSpent:doctrineAmount,karmaPenalty:num(0,SANCTUARY_KARMA_PENALTY),sourceEventId:id}))}),
  research:structure({nextId:num(1,100_000_000,true),projects:arr(SAVE_COLLECTION_LIMIT,structure({id,sectId:id,topic:one('qi_foundation','warding'),
    proposerId:id,locationId:id,startedTick:tick,deadlineTick:tick,status:one('open','completed','expired'),
    contributors:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,joinedTick:tick,lastWorkedTick:otick,workTurns:num(0,RESEARCH_DEPOSIT.earthRoots / RESEARCH_WORK_COST.earthRoots,true),
      escrow:structure({stones:doctrineAmount,earthRoots:count}),spent:structure({stones:doctrineAmount,earthRoots:count}),
      withdrawnTick:otick,withdrawReason:optional(one('injury','assignment','relocation','hardship','ineligible'))})),
    discoveryTechniqueId:oid,discoveryLocationId:oid,settledTick:otick}))}),
  ceasefires:structure({nextId:num(1,100_000_000,true),agreements:arr(SAVE_COLLECTION_LIMIT,structure({id,
    proposerSectId:id,targetSectId:id,proposerId:id,targetLeaderId:id,openedTick:tick,offerExpiresTick:tick,
    status:one('offered','active','declined','expired','fulfilled','breached'),signedTick:otick,endsTick:otick,
    terms:structure({duration:num(1,100,true),bondPerSide:doctrineAmount,aidAmount:doctrineAmount,aidPayerSectId:id,aidRecipientSectId:id}),
    escrow:structure({proposerBond:doctrineAmount,targetBond:doctrineAmount,aid:doctrineAmount}),aidReleasedTick:otick,
    withdrawnSiegeIds:ids,breach:optional(structure({offenderSectId:id,tick,kind:one('renounced','hostile_damage'),
      forfeitedBond:doctrineAmount,eventId:oid})),settledTick:otick}))}),
  annotations:structure({nextId:num(1,100_000_000,true),
    bookmarks:arr(ANNOTATION_MAX_BOOKMARKS,structure({id,eventId:id,eventTick:tick,createdTick:tick,title:strings(ANNOTATION_MAX_TITLE_CHARS,1),category:eventCategory,locationId:oid})),
    notes:arr(ANNOTATION_MAX_NOTES,structure({id,createdTick:tick,updatedTick:tick,text:strings(ANNOTATION_MAX_NOTE_CHARS,1),target:noteTarget}))}),
  escorts:structure({
    contracts:arr(SAVE_COLLECTION_LIMIT,structure({id,shipmentId:id,clientId:id,escortId:oid,originId:id,destinationId:id,
      status:one('offered','active','delivered','failed','expired'),offeredTick:tick,expiresTick:tick,acceptedTick:otick,holdAppliedTick:otick,
      feeEscrow:doctrineAmount,feePaid:doctrineAmount,feeRefunded:doctrineAmount,rationsEscrow:count,rationsSpent:count,rationsReturned:count,
      path:arr(6402,structure({x:num(0,1000),y:num(0,600)})),pathIndex:num(0,6402,true),stride:num(0,6402,true),lastAdvancedTick:otick,
      lastCrossedTileIds:ids,arrivedTick:otick,usedReportIds:ids,detours:arr(2,structure({tick,reportId:id,extraSteps:count})),
      settledTick:otick,reason:otext})),
    reports:arr(SAVE_COLLECTION_LIMIT,structure({id,contractId:id,reporterId:id,observedTick:tick,hazardId:id,tileId:id,expiresTick:tick}))}),
  competitionReviews:structure({
    proofs:arr(SAVE_COLLECTION_LIMIT,structure({
      id,seasonId:id,sourceId:id,tick,locationId:id,actorId:id,rule:one('public_relief','tournament_champion'),
      settlementId:oid,stones:optional(num(SETTLEMENT_RELIEF.stones,SETTLEMENT_RELIEF.stones,true)),
      herbs:optional(num(SETTLEMENT_RELIEF.jade_leaf,SETTLEMENT_RELIEF.jade_leaf,true)),
      occasionId:oid,championRound:otick,competitiveWinRound:otick,opponentId:oid
    })),
    cases:arr(SAVE_COLLECTION_LIMIT,structure({
      id,seasonId:id,scoreId:id,proofId:id,applicantId:id,openedTick:tick,
      status:one('pending','confirmed','corrected','inconclusive'),closedTick:otick
    })),
    corrections:arr(SAVE_COLLECTION_LIMIT,structure({
      scoreId:id,proofId:id,seasonId:id,previousActorId:id,newActorId:oid,points:count,tick,
      reason:one('wrong_recipient','recipient_ineligible','duplicate_source')
    })),
    honorChanges:arr(SAVE_COLLECTION_LIMIT,structure({originalHonorId:id,seasonId:id,previousActorId:id,newActorId:oid,score:optional(wealth),tick}))
  }),
  competitions:structure({
    optOutActorIds:ids,
    seasons:arr(8,structure({id,year:tick,openedTick:tick,closedTick:otick,status:one('open','settled')})),
    entries:arr(SAVE_COLLECTION_LIMIT,structure({seasonId:id,actorId:id,joinedTick:tick,withdrawnTick:otick})),
    scores:arr(SAVE_COLLECTION_LIMIT,structure({id,seasonId:id,actorId:id,sourceId:id,tick,
      rule:one('tournament_win','tournament_champion','major_breakthrough','public_relief'),points:num(1,20,true),locationId:id})),
    honors:arr(SAVE_COLLECTION_LIMIT,structure({id,seasonId:id,actorId:id,place:one(1),score:num(1,100_000_000,true),awardedTick:tick,title:text}))}),
  scriptures:structure({
    originals:arr(SAVE_COLLECTION_LIMIT,structure({id,technique,firstSeenTick:tick,source:one('authored','pavilion','inheritance'),
      sourceLocationId:oid,sourceSectId:oid})),
    editions:arr(SAVE_COLLECTION_LIMIT,structure({id,originalId:id,authorId:id,kind:editionKind,createdTick:tick,
      locationId:id,parentEditionId:oid,evidence:optional(structure({kind:one('pavilion','inheritance','author_manuscript'),
        locationId:id,sectId:oid}))}))}),
  relics:structure({fragments:arr(SAVE_COLLECTION_LIMIT,structure({id,setId:relicSet,slot:one('frame','core'),
    source:structure({kind:one('wild_cache','expedition'),locationId:id,tick,eventId:oid,occasionId:oid}),
    holder:structure({kind:one('site','actor','estate','consumed'),id})}))}),
  reincarnation:structure({
    cases:arr(SAVE_COLLECTION_LIMIT,structure({id,deceasedId:id,deathEventId:id,deathTick:tick,expiresTick:tick,
      status:one('awaiting_birth','reserved','volunteer','recruited','expired'),settlementId:oid,birthTick:otick,
      birthSlot:optional(count),maturesTick:otick,volunteerId:oid,newActorId:oid,resolvedTick:otick})),
    echoes:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,theme:doctrineTheme,confidence:one('faint','uncertain'),
      receivedTick:tick,status:one('unconsidered','considered','dismissed'),resolvedTick:otick}))}),
  relocations:structure({nextId:num(1,100_000_000,true),
    plans:arr(SAVE_COLLECTION_LIMIT,structure({id,sectId:id,originId:id,destinationId:id,status:one('voting','in_transit','settled','aborted'),
      openedTick:tick,deadlineTick:tick,proposerId:id,voterIds:ids,votes:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,tick,approve:bool})),
      garrisonIds:ids,path:arr(6402,structure({x:num(0,1000),y:num(0,600)})),pathIndex:num(0,6402,true),
      stoneCost:doctrineAmount,earthCost:count,custody:structure({stones:wealth,pavilion:arr(350,technique)}),spent:bool,
      departedTick:otick,settledTick:otick,lastAdvancedTick:otick,reason:otext})),
    abandonedSites:arr(SAVE_COLLECTION_LIMIT,structure({id,planId:id,sectId:id,originId:id,destinationId:id,tick,
      originalType:locationKind,facilities:facilityLevels,arrayHp:wealth,arrayMaxHp:wealth}))}),
  scenarioOrigin:optional(structure({version:one(1,2),ruleset:one(1),id:strings(100,1),endTick:num(1,120,true)})),
  scenarioAudit:optional(structure({version:one(SCENARIO_AUDIT_VERSION),scenarioId:id,seed:unsigned32,profileId:one('classic','spirit-bloom','fractured-frontier'),
    evaluatedTick:num(1,120,true),cards:arr(SCENARIO_MAX_OBJECTIVES,structure({id,objective:scenarioObjective,passed:bool,evidence:scenarioEvidence}))})),
  worldgen:optional(structure({algorithm:one(1),profileId:one('classic','spirit-bloom','fractured-frontier'),
    seed:unsigned32,birthTick:one(1),resources:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,locationId:id,pathSteps:num(0,6402,true)}))})),
  doctrines:structure({nextId:num(1,100_000_000,true),
    schools:arr(SAVE_COLLECTION_LIMIT,structure({id,parentSectId:id,theme:doctrineTheme,founderId:id,stewardId:oid,
      foundedTick:tick,status:one('attached','autonomous','reconciled'),memberIds:ids,treasury:doctrineAmount,
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
  settlements:structure({lastAdvancedTick:otick,
    villages:arr(48,structure({id,locationId:id,name:id,population:count,capacity:count,stress:percentage,
      volunteers:arr(SAVE_COLLECTION_LIMIT,structure({id,name:id,age:wealth,spiritRoot:spirit,willingness:percentage,aptitude:percentage,
        enlistedCultivatorId:oid,cohortYear:otick})),
      nextVolunteerSequence:optional(num(1,100_000_000,true)),
      juvenileCohorts:optional(arr(200,structure({bornTick:tick,count}))),lastCohortYear:otick,lastRecruitTick:otick,
      lastDisasterTick:otick,lastReliefTick:otick})),
    records:arr(100,structure({id,tick,kind:one('disaster','migration','relief','recruitment','growth'),settlementId:id,targetSettlementId:oid,
      actorId:oid,sectId:oid,volunteerId:oid,cultivatorId:oid,people:count,stones:wealth,herbs:count,description:text}))}),
  markets:structure({nextId:tick,
    orders:arr(320,structure({id,sequence:tick,actorId:id,locationId:id,side:one('buy','sell'),good:marketGood,
      quantity:marketQty,remaining:num(0,12,true),limitPrice:marketPrice,escrowStones:wealth,escrowGoods:num(0,12,true),
      placedTick:tick,expiresTick:tick,status:one('open','filled','cancelled','expired'),settledTick:otick})),
    shipments:arr(160,structure({id,sequence:tick,buyOrderId:id,sellOrderId:id,buyerId:id,sellerId:id,originId:id,destinationId:id,
      good:marketGood,quantity:marketQty,unitPrice:marketPrice,departedTick:tick,arrivalTick:tick,
      status:one('in_transit','delivered','lost','returned'),settledTick:otick,reason:otext})),
    receipts:arr(100,structure({id,sequence:tick,buyerId:id,sellerId:id,originId:id,destinationId:id,
      good:marketGood,quantity:marketQty,unitPrice:marketPrice,tick,status:one('local_fill','delivered','lost','returned'),shipmentId:oid,reason:otext}))}),
  oaths:structure({nextId:tick,contracts:arr(300,structure({id,requesterId:id,providerId:id,locationId:id,
    term:one('foundation_pill','jade_herb'),quantity:num(1,100,true),payment:wealth,collateral:wealth,
    offeredTick:tick,offerExpiresTick:tick,deadlineTick:otick,appealUntilTick:otick,
    status:one('offered','active','declined','fulfilled','breached','excused','expired'),
    escrow:structure({payment:wealth,collateral:wealth}),
    evidence:arr(60,structure({tick,actorId:id,kind:one('tender','delivery'),locationId:id,quantity:count,requesterPresent:bool})),
    appeal:optional(structure({tick,appellantId:id,status:one('upheld','rejected'),reason:text})),settledTick:otick,outcome:otext}))}),
  mentorship:structure({
    offers:arr(240,structure({id,mentorId:id,studentId:id,technique,createdTick:tick,expiresTick:tick,
      status:one('pending','accepted','declined','expired'),resolvedTick:otick,outcome:otext})),
    lineage:arr(SAVE_COLLECTION_LIMIT,structure({mentorId:id,studentId:id,technique,formedTick:tick,lastLessonTick:tick,lessons:count,flaw:percentage})),
    budgets:arr(SAVE_COLLECTION_LIMIT,structure({mentorId:id,tick,spent:num(0,2,true)})),lastMaintainedTick:otick}),
  playerAvatar:structure({possessedId:oid,possessionUntilTick:otick,switchAvailableTick:tick,essence:percentage,lastRefreshTick:tick,
    pendingOrder:optional((value,path) => (value as {action?:unknown} | null)?.action === 'SALVAGE_ARTIFACT' ?
      structure({actorId:id,action:one('SALVAGE_ARTIFACT'),queuedTick:tick,targetArtifactId:id,targetLocationId:id})(value,path) :
      structure({actorId:id,action:one('REST','CULTIVATE'),queuedTick:tick})(value,path)),
    transcript:arr(72,structure({id,tick,mode,intent,targetCultivatorId:id,message:text,actorId:oid,reply:text,
      outcome:one('agreed','resisted','revealed','recruited'),source,effect:text}))}),
});

function unique<T>(items: T[], key: (item: T) => string, path: string): Set<string> {
  const keys = new Set(items.map(key));
  if (keys.size !== items.length) fail(path);
  return keys;
}
function verifyWorld(value: unknown): WorldState {
  const candidate = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? { ...value,
      ...(!Object.hasOwn(value, 'mentorship') ? { mentorship: { offers: [], lineage: [], budgets: [] } } : {}),
      ...(!Object.hasOwn(value, 'decisionTrace') ? { decisionTrace: { records: [] } } : {}),
      ...(!Object.hasOwn(value, 'coldHistory') ? { coldHistory: createColdHistoryState() } : {}),
      ...(!Object.hasOwn(value, 'competitionReviews') ? { competitionReviews: createCompetitionReviewState() } : {}),
      ...(!Object.hasOwn(value, 'fieldObservatories') ? { fieldObservatories: createFieldObservatoriesState() } : {}),
      ...(!Object.hasOwn(value, 'oathArbitrations') ? { oathArbitrations: createOathArbitrationState() } : {}),
      ...(!Object.hasOwn(value, 'villageCensuses') ? { villageCensuses: createVillageCensusesState() } : {}),
      ...(!Object.hasOwn(value, 'roads') ? { roads: createRoadState() } : {}),
      ...(!Object.hasOwn(value, 'probation') ? { probation: createProbationState() } : {}),
      ...(!Object.hasOwn(value, 'relicExhibits') ? { relicExhibits: createRelicExhibitState() } : {}),
      ...(!Object.hasOwn(value, 'workshopDisbandments') ? { workshopDisbandments: {closures:[]} } : {}),
      ...(!Object.hasOwn(value, 'workshops') ? { workshops: createWorkshopState() } : {}),
      ...(!Object.hasOwn(value, 'artifactSalvages') ? { artifactSalvages: createArtifactSalvageState() } : {}),
      ...(!Object.hasOwn(value, 'furnaceSafety') ? { furnaceSafety: createFurnaceSafetyState() } : {}),
      ...(!Object.hasOwn(value, 'furnaceReservations') ? { furnaceReservations: createFurnaceReservationState() } : {}),
      ...(!Object.hasOwn(value, 'sparring') ? { sparring: createSparringState() } : {}),
      ...(!Object.hasOwn(value, 'expeditionRescues') ? { expeditionRescues: createExpeditionRescueState() } : {}),
      ...(!Object.hasOwn(value, 'shortShifts') ? { shortShifts: createShortShiftState() } : {}),
      ...(!Object.hasOwn(value, 'boundaryReliefs') ? { boundaryReliefs: createBoundaryReliefState() } : {}),
      ...(!Object.hasOwn(value, 'apprenticeCohorts') ? { apprenticeCohorts: createApprenticeCohortState() } : {}),
      ...(!Object.hasOwn(value, 'householdNames') ? { householdNames: createHouseholdNameState() } : {}),
      ...(!Object.hasOwn(value, 'villageGranaries') ? { villageGranaries: createVillageGranariesState() } : {}),
      ...(!Object.hasOwn(value, 'villageSupply') ? { villageSupply: createVillageSupplyState() } : {}),
      ...(!Object.hasOwn(value, 'routeWarnings') ? { routeWarnings: createRouteWarningsState() } : {}),
      ...(!Object.hasOwn(value, 'pavilionLoans') ? { pavilionLoans: createPavilionLoansState() } : {}),
      ...(!Object.hasOwn(value, 'civicMemorials') ? { civicMemorials: createCivicMemorialsState() } : {}),
      ...(!Object.hasOwn(value, 'caravanRestitution') ? { caravanRestitution: createCaravanRestitutionState() } : {}),
      ...(!Object.hasOwn(value, 'terrainSuccession') ? { terrainSuccession: createTerrainSuccessionState() } : {}),
      ...(!Object.hasOwn(value, 'resourceFlow') ? { resourceFlow: createResourceFlowState() } : {}),
      ...(!Object.hasOwn(value, 'sharedCommons') ? { sharedCommons: createSharedCommonsState() } : {}),
      ...(!Object.hasOwn(value, 'serviceRetirement') ? { serviceRetirement: createServiceRetirementState() } : {}),
      ...(!Object.hasOwn(value, 'couriers') ? { couriers: createSealedCourierState() } : {}),
      ...(!Object.hasOwn(value, 'watchlists') ? { watchlists: createWatchlistState() } : {}),
      ...(!Object.hasOwn(value, 'villageWorks') ? { villageWorks: createVillageWorksState() } : {}),
      ...(!Object.hasOwn(value, 'households') ? { households: createHouseholdState() } : {}),
      ...(!Object.hasOwn(value, 'territorialLeases') ? { territorialLeases: createTerritorialLeaseState() } : {}),
      ...(!Object.hasOwn(value, 'formations') ? { formations: createFormationNetworkState() } : {}),
      ...(!Object.hasOwn(value, 'infirmaries') ? { infirmaries: createInfirmaryState() } : {}),
      ...(!Object.hasOwn(value, 'habitats') ? { habitats: createHabitatState() } : {}),
      ...(!Object.hasOwn(value, 'chronicleErrata') ? { chronicleErrata: createChronicleErrataState() } : {}),
      ...(!Object.hasOwn(value, 'chronicleCausality') ? { chronicleCausality: createCausalChronicleState() } : {}),
      ...(!Object.hasOwn(value, 'pilgrimages') ? { pilgrimages: createPilgrimageState() } : {}),
      ...(!Object.hasOwn(value, 'credit') ? { credit: createSectCreditState() } : {}),
      ...(!Object.hasOwn(value, 'sanctuary') ? { sanctuary: createSanctuaryState() } : {}),
      ...(!Object.hasOwn(value, 'research') ? { research: createResearchState() } : {}),
      ...(!Object.hasOwn(value, 'ceasefires') ? { ceasefires: createCeasefireState() } : {}),
      ...(!Object.hasOwn(value, 'annotations') ? { annotations: createAnnotationState() } : {}),
      ...(!Object.hasOwn(value, 'escorts') ? { escorts: createEscortState() } : {}),
      ...(!Object.hasOwn(value, 'competitions') ? { competitions: { seasons: [], entries: [], scores: [], honors: [], optOutActorIds: [] } } : {}),
      ...(!Object.hasOwn(value, 'scriptures') ? { scriptures: createScriptureState() } : {}),
      ...(!Object.hasOwn(value, 'relics') ? { relics: { fragments: [] } } : {}),
      ...(!Object.hasOwn(value, 'reincarnation') ? { reincarnation: createReincarnationState() } : {}),
      ...(!Object.hasOwn(value, 'relocations') ? { relocations: createRelocationState() } : {}),
      ...(!Object.hasOwn(value, 'doctrines') ? { doctrines: createDoctrineState() } : {}),
      ...(!Object.hasOwn(value, 'estates') ? { estates: { entries: [] } } : {}),
      ...(!Object.hasOwn(value, 'witnesses') ? { witnesses: { facts: [], claims: [], nextId: 1 } } : {}),
      ...(!Object.hasOwn(value, 'settlements') ? { settlements: { villages: [], records: [] } } : {}),
      ...(!Object.hasOwn(value, 'markets') ? { markets: { orders: [], shipments: [], receipts: [], nextId: 1 } } : {}),
      ...(!Object.hasOwn(value, 'oaths') ? { oaths: { contracts: [], nextId: 1 } } : {}),
    } : value;
  shape(candidate, 'world');
  const w = candidate as WorldState;
  if (!w.cultivators.length || !w.locations.length) fail('world.minimum_entities');
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'settlements')) {
    w.settlements = createSettlementState(w.locations, w.random.seed);
  }
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'relics')) {
    w.relics = createRelicState(w.locations, w.random.seed);
  }
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'competitions')) {
    w.competitions = createCompetitionState(w.year, w.tick);
  }
  const actor = unique(w.cultivators, (item) => item.id, 'cultivators.id');
  const sector = unique(w.sects, (item) => item.id, 'sects.id');
  const locations = unique(w.locations, (item) => item.id, 'locations.id');
  const causalNodes = new Map(w.chronicleCausality.nodes.map((node) => [node.eventId, node]));
  for (const sect of w.sects) if (sect.officeVacancy) {
    const { eventId, tick: opened } = sect.officeVacancy;
    const evidence = causalNodes.get(eventId);
    if (sect.leaderId !== undefined || opened > w.tick || eventId !== `evt-${opened}-${sect.id}-leadership-office-vacant` ||
        (evidence && (evidence.kind !== 'sect_vacancy' || evidence.entityId !== sect.id || evidence.tick !== opened))) {
      fail('sects.officeVacancy.source');
    }
  }
  if (causalNodes.size !== w.chronicleCausality.nodes.length) fail('chronicleCausality.events.unique');
  if (causalNodes.size) {
    const liveFacts = new Map<string, typeof w.events>();
    for (const fact of w.events) if (causalNodes.has(fact.id)) {
      const matching = liveFacts.get(fact.id);
      if (matching) matching.push(fact);
      else liveFacts.set(fact.id, [fact]);
    }
    let previousSequence = 0;
    let previousTick = 0;
    for (const node of w.chronicleCausality.nodes) {
      const live = liveFacts.get(node.eventId);
      if (node.sequence <= previousSequence || node.sequence >= w.chronicleCausality.nextSequence ||
          node.tick < previousTick || node.tick > w.tick || !causalChronicleOutcomeCompatible(node.kind, node.outcome) ||
          (live && (live.length !== 1 || live[0].tick !== node.tick || live[0].locationId !== node.locationId ||
            live[0].witnessScope === 'participants' || live[0].category !== 'diplomacy')) ||
          node.eventId.startsWith('evt-sealed-dispatch-')) fail('chronicleCausality.events.source');
      previousSequence = node.sequence;
      previousTick = node.tick;
      unique(node.predecessors, ({ eventId }) => eventId, 'chronicleCausality.predecessors.unique');
      unique(node.predecessors.filter(({ relation }) => relation !== 'withdrew_siege'),
        ({ relation }) => relation, 'chronicleCausality.predecessors.role');
      for (const edge of node.predecessors) {
        const source = causalNodes.get(edge.eventId);
        if (!source || source.sequence >= node.sequence || source.tick > node.tick ||
            !causalPredecessorCompatible(node, source, edge.relation)) fail('chronicleCausality.predecessors.reference');
      }
    }
  }
  const map = unique(w.terrain.tiles, (item) => item.id, 'terrain.tiles.id');
  if ((w.terrainSuccession.lastAdvancedTick ?? 0) > w.tick) fail('terrainSuccession.lastAdvancedTick');
  unique(w.terrainSuccession.cells, ({ tileId }) => tileId, 'terrainSuccession.cells.tile');
  for (const cell of w.terrainSuccession.cells) {
    if (!map.has(cell.tileId) || cell.firstTick > cell.lastStressTick || cell.lastStressTick > w.tick ||
        cell.consecutiveStress > cell.lastStressTick - cell.firstTick + 1 ||
        cell.recoverableLoss + cell.permanentLoss > cell.baselineQi + 1e-8 ||
        (cell.lastWorkedTick !== undefined && (cell.lastWorkedTick < cell.firstTick || cell.lastWorkedTick > w.tick)) ||
        (cell.lastWorkedTick === undefined) !== (cell.lastWorkedBy === undefined) ||
        (cell.lastWorkedBy !== undefined && !actor.has(cell.lastWorkedBy)) ||
        (cell.workCount > 0 && cell.lastWorkedTick === undefined)) fail('terrainSuccession.cells.references');
  }
  const fieldActorStates = new Map(Object.entries(w.fieldObservatories.byActor));
  const readingValid = ({ kind, intensity }: { kind: string; intensity: number }) =>
    Math.abs(intensity * 100 - Math.round(intensity * 100)) <= 1e-8 &&
    (kind === '平息' ? intensity === 0 : intensity >= .05);
  for (const [operatorId, entry] of fieldActorStates) {
    if (!actor.has(operatorId) || (!entry.runs.length && !entry.inbox.length) ||
        entry.runs.filter(({ status }) => status === 'pending').length > 1 ||
        entry.runs.filter(({ status }) => status !== 'pending').length > OBSERVATORY_TERMINAL_LIMIT)
      fail('fieldObservatories.byActor.references');
    unique(entry.runs, ({ openedTick }) => String(openedTick), 'fieldObservatories.runs.tick');
    unique(entry.inbox, ({ operatorId, openedTick }) => JSON.stringify([operatorId, openedTick]), 'fieldObservatories.inbox.source');
    for (const run of entry.runs) {
      if (!locations.has(run.locationId) || run.openedTick > w.tick || run.targetTick !== run.openedTick + OBSERVATORY_LEAD_TICKS ||
          !readingValid(run.baseline) || run.forecast.kind !== run.baseline.kind || run.forecast.intensity !== run.baseline.intensity ||
          (run.status === 'measured' ? run.targetTick > w.tick || !run.reading || !readingValid(run.reading) :
            ('reading' in run || 'relay' in run || (run.status === 'missed' && run.targetTick > w.tick))) ||
          (run.status === 'measured' && run.relay && (!actor.has(run.relay.recipientId) || run.relay.recipientId === operatorId ||
            run.relay.relayedTick <= run.targetTick || run.relay.relayedTick > w.tick || run.relay.relayedTick > run.targetTick + OBSERVATORY_RETENTION_TICKS)))
        fail('fieldObservatories.runs.references');
    }
    for (const inbox of entry.inbox) {
      const actual = fieldActorStates.get(inbox.operatorId)?.runs.find(({ openedTick }) => openedTick === inbox.openedTick);
      if (!actual || actual.status !== 'measured' || actual.relay?.recipientId !== operatorId) fail('fieldObservatories.inbox.references');
    }
  }
  unique(w.oathArbitrations.cases, ({ oathId }) => oathId, 'oathArbitrations.cases.oath');
  const tenderKey = (oathId: string, at: number) => JSON.stringify([oathId, at]);
  unique(w.oathArbitrations.observations, ({ oathId, tenderTick }) => tenderKey(oathId, tenderTick), 'oathArbitrations.observations.tender');
  const actualOaths = new Map(w.oaths.contracts.map((row) => [row.id, row]));
  const observations = new Map(w.oathArbitrations.observations.map((row) => [tenderKey(row.oathId, row.tenderTick), row]));
  const caseOaths = new Set(w.oathArbitrations.cases.map(({ oathId }) => oathId));
  for (const row of w.oathArbitrations.observations) {
    const oath = actualOaths.get(row.oathId);
    if (row.tenderTick > w.tick || !row.observerIds.length || row.observerIds.some((id) => !actor.has(id)) ||
        (oath ? row.siteId !== oath.locationId || row.observerIds.includes(oath.requesterId) || row.observerIds.includes(oath.providerId) ||
          !oath.evidence.some((item) => item.kind === 'tender' && item.actorId === oath.providerId && !item.requesterPresent &&
            item.locationId === row.siteId && item.tick === row.tenderTick && item.quantity === oath.quantity) : !caseOaths.has(row.oathId)))
      fail('oathArbitrations.observations.references');
    unique(row.observerIds, (id) => id, 'oathArbitrations.observations.observer');
  }
  for (const panel of w.oathArbitrations.cases) {
    const oath = actualOaths.get(panel.oathId);
    const observed = observations.get(tenderKey(panel.oathId, panel.tenderTick));
    const joined = panel.joinedTick;
    const closed = panel.closedTick;
    if (panel.id !== `arbitration-${panel.oathId}` || !observed || observed.siteId !== panel.siteId ||
        !actor.has(panel.requesterId) || !actor.has(panel.providerId) || panel.requesterId === panel.providerId ||
        observed.observerIds.includes(panel.requesterId) || observed.observerIds.includes(panel.providerId) ||
        (oath && (oath.requesterId !== panel.requesterId || oath.providerId !== panel.providerId || oath.locationId !== panel.siteId)) ||
        panel.tenderTick > panel.openedTick || panel.openedTick > w.tick || panel.joinUntilTick <= panel.openedTick ||
        panel.joinUntilTick > panel.openedTick + ARBITRATION_JOIN_WINDOW ||
        (panel.status === 'closed' ? closed === undefined || !panel.disposition || closed < (joined ?? panel.openedTick) || closed > w.tick :
          closed !== undefined || panel.disposition !== undefined || !oath || oath.settledTick !== undefined) ||
        (joined === undefined ? panel.status === 'hearing' || panel.expiresTick !== undefined || !!panel.filing || panel.appointments.length > 0 :
          panel.status === 'offered' || joined < panel.openedTick || joined >= panel.joinUntilTick || joined > w.tick ||
          panel.expiresTick === undefined || panel.expiresTick < joined + ARBITRATION_HEARING_WINDOW ||
          (oath && panel.expiresTick !== Math.max(oath.deadlineTick ?? joined, joined) + ARBITRATION_HEARING_WINDOW)) ||
        (panel.disposition === 'unjoined' && joined !== undefined) ||
        (panel.disposition === 'refund' && (joined === undefined || !panel.filing ||
          (oath && (oath.status !== 'excused' || oath.settledTick !== closed))))) fail('oathArbitrations.cases.references');
    const seated = panel.appointments.filter(({ endedTick }) => endedTick === undefined);
    unique(seated, ({ side }) => side, 'oathArbitrations.appointments.side');
    unique(seated, ({ appointeeId }) => appointeeId, 'oathArbitrations.appointments.adjudicator');
    for (const side of ['requester','provider'] as const) if (panel.appointments.filter((row) => row.side === side).length > ARBITRATION_MAX_APPOINTMENTS_PER_SIDE)
      fail('oathArbitrations.appointments.history');
    for (const judge of panel.appointments) {
      if (!actor.has(judge.appointeeId) || judge.appointeeId === panel.requesterId || judge.appointeeId === panel.providerId ||
          observed?.observerIds.includes(judge.appointeeId) || judge.nominatedTick < (joined ?? Infinity) ||
          judge.nominatedTick >= (panel.expiresTick ?? 0) || judge.nominatedTick > (closed ?? w.tick) ||
          (judge.acceptedTick !== undefined && (judge.acceptedTick < judge.nominatedTick || judge.acceptedTick > (judge.endedTick ?? closed ?? w.tick))) ||
          (judge.endedTick === undefined) !== (judge.recusal === undefined) ||
          (judge.endedTick !== undefined && (judge.endedTick < judge.nominatedTick || judge.endedTick > (closed ?? w.tick))) ||
          (judge.vote === undefined) !== (judge.votedTick === undefined) ||
          (judge.votedTick !== undefined && (judge.votedTick <= (judge.acceptedTick ?? Infinity) ||
            judge.votedTick >= (panel.expiresTick ?? 0) || judge.votedTick > (judge.endedTick ?? closed ?? w.tick) ||
            (judge.vote === 'refund' && (!panel.filing || judge.votedTick < panel.filing.tick))))) fail('oathArbitrations.appointments.references');
    }
    if (panel.filing && (!observed?.observerIds.includes(panel.filing.observerId) || panel.filing.tick < (joined ?? Infinity) ||
        panel.filing.tick >= (panel.expiresTick ?? 0) || panel.filing.tick > (closed ?? w.tick))) fail('oathArbitrations.filing.references');
    if (panel.disposition === 'refund' && (seated.length !== 2 || seated.some(({ vote, acceptedTick }) => vote !== 'refund' || acceptedTick === undefined)))
      fail('oathArbitrations.refund.proof');
  }
  let lastCensusTick = -1;
  const censusSources = new Map(w.settlements.records.map((row) => [row.id, row]));
  const currentCensusVillages = new Set(w.settlements.villages.map(({ id }) => id));
  const censusReceipts = new Set<string>();
  for (const period of w.villageCensuses.periods) {
    if (period.tick <= lastCensusTick || period.tick > w.tick || (period.tick === w.tick &&
        (period.year !== w.year || period.month !== w.month))) fail('villageCensuses.periods.window');
    lastCensusTick = period.tick;
    const openingIds = unique(period.opening, ({ villageId }) => villageId, 'villageCensuses.opening.village');
    const checkCensusCount = ({ villageId, population, juveniles }: typeof period.opening[number]) => {
      if (!currentCensusVillages.has(villageId) || juveniles > population) fail('villageCensuses.count.references');
    };
    period.opening.forEach(checkCensusCount);
    if (period.closing) {
      unique(period.closing, ({ villageId }) => villageId, 'villageCensuses.closing.village');
      period.closing.forEach(checkCensusCount);
    }
    const movementSource = { birth:'growth', death:'disaster', migration:'migration', enrollment:'recruitment' } as const;
    for (const row of period.movements) {
      const existing = censusSources.get(row.id);
      if (censusReceipts.has(row.id) || !openingIds.has(row.villageId) || row.people < 1 ||
          (row.kind === 'migration' ? !row.targetVillageId || row.targetVillageId === row.villageId || !openingIds.has(row.targetVillageId)
            : row.targetVillageId !== undefined) ||
          (row.kind === 'enrollment' ? row.people !== 1 || !row.volunteerId || !row.cultivatorId ||
            row.cultivatorId !== `recruit-${row.volunteerId}` || !actor.has(row.cultivatorId)
            : row.volunteerId !== undefined || row.cultivatorId !== undefined) ||
          (row.kind === 'maturation' ? row.bornTick === undefined || period.tick - row.bornTick < MORTAL_MATURITY_TICKS ||
            row.id !== `mature-${period.tick}-${row.villageId}-${row.bornTick}`
            : row.kind === 'birth' ? row.bornTick !== period.tick : row.bornTick !== undefined) ||
          (existing && (row.kind === 'maturation' || existing.kind !== movementSource[row.kind] ||
            existing.tick !== period.tick || existing.settlementId !== row.villageId || existing.targetSettlementId !== row.targetVillageId ||
            existing.people !== row.people || existing.volunteerId !== row.volunteerId || existing.cultivatorId !== row.cultivatorId)))
        fail('villageCensuses.movements.references');
      censusReceipts.add(row.id);
    }
    unique(period.observations, ({ villageId }) => villageId, 'villageCensuses.observations.village');
    for (const local of period.observations) {
      checkCensusCount(local.count);
      if (local.count.villageId !== local.villageId || !openingIds.has(local.villageId) || !actor.has(local.observerId) ||
          (local.sample && (local.sample.juveniles > local.count.juveniles ||
            local.sample.adults + local.sample.namedResidents > local.count.population - local.count.juveniles)))
        fail('villageCensuses.observations.references');
    }
  }
  if ((w.roads.lastAdvancedTick ?? 0) > w.tick) fail('roads.lastAdvancedTick');
  unique(w.roads.links, ({ id }) => id, 'roads.links.id');
  unique(w.roads.links.filter(({ closedTick }) => closedTick === undefined),
    ({ anchorSiteId, otherSiteId }) => JSON.stringify([anchorSiteId, otherSiteId].sort()), 'roads.links.activePair');
  unique(w.roads.crossings, ({ id }) => id, 'roads.crossings.id');
  unique(w.roads.crossings, ({ journeyId, legIndex }) => JSON.stringify([journeyId, legIndex]), 'roads.crossings.leg');
  const roadsById = new Map(w.roads.links.map((road) => [road.id, road]));
  const roadSerials = new Set<number>();
  const walksById = new Map(w.pilgrimages.journeys.map((journey) => [journey.id, journey]));
  for (const link of w.roads.links) {
    const serial = Number(link.id.match(/^road-([1-9][0-9]*)$/)?.[1]);
    const closed = link.closedTick;
    const from = w.locations.find(({ id }) => id === link.anchorSiteId);
    const to = w.locations.find(({ id }) => id === link.otherSiteId);
    if (!Number.isSafeInteger(serial) || serial >= w.roads.nextId || roadSerials.has(serial) || !sector.has(link.sectId) || link.anchorSiteId === link.otherSiteId ||
        link.openedTick > w.tick || (closed === undefined ? link.closeReason !== undefined || !from || !to :
          !link.closeReason || closed < link.openedTick || closed > w.tick) ||
        (link.lastMaintainedTick === undefined) !== (link.lastMaintainedBy === undefined) ||
        (link.lastPatrolledTick === undefined) !== (link.lastPatrolledBy === undefined) ||
        (link.lastMaintainedTick !== undefined && (link.lastMaintainedTick < link.openedTick || link.lastMaintainedTick > (closed ?? w.tick) ||
          !actor.has(link.lastMaintainedBy!))) ||
        (link.lastPatrolledTick !== undefined && (link.lastPatrolledTick < link.openedTick || link.lastPatrolledTick > (closed ?? w.tick) ||
          !actor.has(link.lastPatrolledBy!))) || link.path.length < 2 ||
        (from && (link.path[0].x !== from.x || link.path[0].y !== from.y)) ||
        (to && (link.path.at(-1)?.x !== to.x || link.path.at(-1)?.y !== to.y))) fail('roads.links.references');
    roadSerials.add(serial);
    const points = link.path.map(({ x, y }) => terrainTileAt(w, x, y));
    const walked = points.filter((cell, index) => index === 0 || cell?.id !== points[index - 1]?.id);
    if (points.some((tile) => !tile) || walked.length < 2 || walked.length > ROAD_PATH_TILE_LIMIT || walked.length !== points.length ||
        new Set(walked.map((cell) => cell?.id)).size !== walked.length ||
        walked.some((cell, index) => index > 0 && (!cell ||
          Math.abs(cell.col - walked[index - 1]!.col) + Math.abs(cell.row - walked[index - 1]!.row) !== 1))) fail('roads.links.path');
  }
  for (const crossing of w.roads.crossings) {
    const serial = Number(crossing.id.match(/^crossing-([1-9][0-9]*)$/)?.[1]);
    const road = roadsById.get(crossing.roadId);
    const journey = walksById.get(crossing.journeyId);
    const from = journey?.stopIds[crossing.legIndex], to = journey?.stopIds[crossing.legIndex + 1];
    if (!Number.isSafeInteger(serial) || serial >= w.roads.nextId || roadSerials.has(serial) || !road || !actor.has(crossing.payerId) || !actor.has(crossing.companionId) || crossing.payerId === crossing.companionId ||
        crossing.departedTick < road.openedTick || crossing.departedTick > w.tick ||
        (road.closedTick !== undefined && crossing.departedTick > road.closedTick) ||
        crossing.paidSteps !== road.path.length - 1 ||
        Math.ceil(crossing.paidSteps / crossing.stride) >= Math.ceil(crossing.freeSteps / crossing.freeStride) ||
        (journey && (journey.organizerId !== crossing.payerId || journey.companionId !== crossing.companionId ||
          crossing.departedTick <= (journey.startedTick ?? Infinity) || crossing.departedTick >= (journey.expiresTick ?? 0) ||
          !((from === road.anchorSiteId && to === road.otherSiteId) || (from === road.otherSiteId && to === road.anchorSiteId)) ||
          (journey.status === 'active' && journey.legIndex === crossing.legIndex && (journey.path.length !== crossing.paidSteps + 1 ||
            journey.path.some(({ x, y }, index) => {
              const step = road.path[from === road.anchorSiteId ? index : road.path.length - index - 1];
              return !step || x !== step.x || y !== step.y;
            })))))) fail('roads.crossings.references');
    roadSerials.add(serial);
  }
  unique(w.probation.expulsions, ({ id }) => id, 'probation.expulsions.id');
  unique(w.probation.cases, ({ id }) => id, 'probation.cases.id');
  const activeProbation = (status: WorldState['probation']['cases'][number]['status']) => status === 'requested' || status === 'active' || status === 'ready';
  unique(w.probation.cases.filter(({ status }) => activeProbation(status)), ({ actorId }) => actorId, 'probation.cases.openActor');
  const expulsions = new Map(w.probation.expulsions.map((row) => [row.id, row]));
  const storedCouncils = new Map(w.councils.map((row) => [row.id, row]));
  const villagers = new Set(w.settlements.villages.map(({ id }) => id));
  for (const anchor of w.probation.expulsions) {
    const subject = w.cultivators.find(({ id }) => id === anchor.actorId);
    const historical = storedCouncils.get(anchor.id);
    if (!subject || !sector.has(anchor.sectId) || anchor.tick > w.tick ||
        anchor.id !== `council-${anchor.tick}-${anchor.sectId}-expel:${anchor.actorId}` ||
        anchor.transgressions < 4 || anchor.disciplineRevision > (subject.disciplineRevision ?? 0) ||
        (historical && (historical.status !== 'passed' || historical.proposal.kind !== 'expel' ||
          historical.proposal.targetCultivatorId !== anchor.actorId || historical.tick !== anchor.tick || historical.sectId !== anchor.sectId)) ||
        (anchor.lastCaseClosedTick !== undefined && (anchor.lastCaseClosedTick < anchor.tick || anchor.lastCaseClosedTick > w.tick)) ||
        (anchor.reinstatedTick === undefined ? anchor.reinstatedRevision !== undefined :
          anchor.reinstatedTick < anchor.tick || anchor.reinstatedTick > w.tick ||
          anchor.reinstatedRevision === undefined || anchor.reinstatedRevision < anchor.disciplineRevision ||
          anchor.reinstatedRevision > (subject.disciplineRevision ?? 0))) fail('probation.expulsions.references');
  }
  const creditedRelief = new Set<string>();
  const actualVillageReceipts = new Map(w.settlements.records.map((row) => [row.id, row]));
  for (const plan of w.probation.cases) {
    const serial = Number(plan.id.match(/^probation-([1-9][0-9]*)$/)?.[1]);
    const anchor = expulsions.get(plan.expulsionId);
    const admitted = plan.admittedTick;
    const settled = plan.settledTick;
    const live = activeProbation(plan.status);
    if (!Number.isSafeInteger(serial) || serial >= w.probation.nextId || !anchor || anchor.actorId !== plan.actorId ||
        anchor.sectId !== plan.sectId || plan.disciplineRevision < anchor.disciplineRevision ||
        plan.disciplineRevision > (w.cultivators.find(({ id }) => id === plan.actorId)?.disciplineRevision ?? 0) ||
        plan.requestedTick < anchor.tick ||
        plan.requestedTick > w.tick || plan.requestExpiresTick !== plan.requestedTick + PROBATION_REQUEST_TICKS ||
        plan.villageIds.length !== 2 || plan.villageIds[0] === plan.villageIds[1] || plan.villageIds.some((id) => !villagers.has(id)) ||
        (live ? settled !== undefined || plan.reason !== undefined :
          settled === undefined || settled < (admitted ?? plan.requestedTick) || settled > w.tick) ||
        (admitted === undefined ? plan.sponsorId !== undefined || plan.deadlineTick !== undefined || plan.relief.length > 0 || plan.reviews.length > 0 :
          !plan.sponsorId || plan.sponsorId === plan.actorId || !actor.has(plan.sponsorId) ||
          admitted < plan.requestedTick || admitted >= plan.requestExpiresTick || admitted > w.tick || plan.deadlineTick !== admitted + PROBATION_SERVICE_TICKS) ||
        (plan.status === 'requested' && admitted !== undefined) || (plan.status === 'active' && admitted === undefined) ||
        (plan.status === 'withdrawn' && plan.reason !== 'withdrawn') ||
        (plan.status === 'expired' && (plan.reason !== 'deadline' || (settled ?? 0) < (plan.deadlineTick ?? plan.requestExpiresTick))) ||
        (plan.status === 'rejected' && plan.reason !== 'review_oppose' && plan.reason !== 'unavailable' && plan.reason !== 'new_misconduct') ||
        (plan.status === 'reinstated' && (anchor.reinstatedTick !== settled || anchor.reinstatedRevision !== plan.disciplineRevision || plan.reason !== undefined)) ||
        ((plan.status === 'ready' || plan.status === 'reinstated') &&
          (plan.relief.length !== PROBATION_REQUIRED_RELIEF || plan.reviews.length !== PROBATION_REQUIRED_REVIEWS ||
            plan.reviews.some(({ vote }) => vote !== 'support')))) fail('probation.cases.references');
    unique(plan.relief, ({ tick }) => String(tick), 'probation.relief.tick');
    unique(plan.relief, ({ settlementId }) => settlementId, 'probation.relief.village');
    unique(plan.reviews, ({ reviewerId }) => reviewerId, 'probation.reviews.reviewer');
    for (const receipt of plan.relief) {
      const source = actualVillageReceipts.get(receipt.sourceId);
      if (creditedRelief.has(receipt.sourceId) || receipt.actorId !== plan.actorId ||
          receipt.sourceId !== `settlement-${receipt.tick}-relief-${receipt.settlementId}-${receipt.actorId}` ||
          !plan.villageIds.includes(receipt.settlementId) || receipt.stones !== SETTLEMENT_RELIEF.stones || receipt.herbs !== SETTLEMENT_RELIEF.jade_leaf ||
          (source && (source.kind !== 'relief' || source.actorId !== receipt.actorId || source.tick !== receipt.tick ||
            source.settlementId !== receipt.settlementId || source.stones !== receipt.stones || source.herbs !== receipt.herbs)) ||
          receipt.tick <= (admitted ?? Infinity) || receipt.tick >= (plan.deadlineTick ?? 0) || receipt.tick > (settled ?? w.tick))
        fail('probation.relief.references');
      creditedRelief.add(receipt.sourceId);
    }
    const provedAt = Math.max(...plan.relief.map(({ tick }) => tick));
    if (plan.reviews.length && plan.relief.length !== PROBATION_REQUIRED_RELIEF) fail('probation.reviews.proof');
    for (const review of plan.reviews) {
      if (!actor.has(review.reviewerId) || review.reviewerId === plan.sponsorId || review.reviewerId === plan.actorId ||
          review.tick < provedAt || review.tick >= (plan.deadlineTick ?? 0) || review.tick > (settled ?? w.tick) ||
          (review.vote === 'oppose' && (plan.status !== 'rejected' || plan.reason !== 'review_oppose'))) fail('probation.reviews.references');
    }
  }
  unique(w.workshops.orders, ({ id }) => id, 'workshops.orders.id');
  const activeWorkshops = w.workshops.orders.filter(({ status }) => status === 'active');
  unique(activeWorkshops, ({ makerId }) => makerId, 'workshops.orders.activeMaker');
  unique(activeWorkshops, ({ siteId }) => siteId, 'workshops.orders.activeSite');
  const makerWorkTicks = new Set<string>();
  for (const order of w.workshops.orders) {
    const serial = Number(order.id.match(/^commission-([1-9][0-9]*)$/)?.[1]);
    const accepted = order.acceptedTick;
    const settled = order.settledTick;
    const live = order.status === 'offered' || order.status === 'active';
    const terms = workshopTerms(order.tier, order.quantity);
    const effectiveQuantity = effectiveWorkshopQuantity(order);
    const effectiveDeadline = effectiveWorkshopDeadline(order);
    if (!Number.isSafeInteger(serial) || serial >= w.workshops.nextId || order.patronId === order.makerId ||
        !actor.has(order.patronId) || !actor.has(order.makerId) || (live && !locations.has(order.siteId)) ||
        order.offeredTick > w.tick || order.offerExpiresTick !== order.offeredTick + WORKSHOP_OFFER_TICKS ||
        (live && (settled !== undefined || order.closeReason !== undefined)) ||
        (!live && (settled === undefined || settled < (accepted ?? order.offeredTick) || settled > w.tick)) ||
        (order.status === 'completed' && (order.closeReason !== undefined || order.work.length !== effectiveQuantity * 2)) ||
        (order.status === 'declined' && (order.closeReason !== undefined || (settled ?? 0) >= order.offerExpiresTick)) ||
        (order.status === 'cancelled' && (order.closeReason === undefined || order.closeReason === 'offer_expired' || order.closeReason === 'work_expired')) ||
        (order.status === 'expired' && (accepted === undefined ?
          order.closeReason !== 'offer_expired' || (settled ?? 0) < order.offerExpiresTick :
          order.closeReason !== 'work_expired' || (settled ?? 0) < (effectiveDeadline ?? Infinity))) ||
        (order.status === 'active' && (accepted === undefined || order.work.length >= effectiveQuantity * 2)) ||
        ((order.status === 'offered' || order.status === 'declined') && accepted !== undefined) ||
        (accepted === undefined && (order.deadlineTick !== undefined || order.work.length !== 0 || order.status === 'completed')) ||
        (accepted !== undefined && (accepted < order.offeredTick || accepted >= order.offerExpiresTick || accepted > w.tick ||
          order.deadlineTick !== accepted + WORKSHOP_ACTIVE_TICKS)) ||
        (live && (order.refundedStones !== (order.capacityAmendment?.releasedStones ?? 0) ||
          order.refundedHerbs !== (order.capacityAmendment?.releasedHerbs ?? 0))) ||
        (!live && (order.escrowStones !== 0 || order.escrowHerbs !== 0))) fail('workshops.orders.references');
    let usedStones = 0;
    let usedHerbs = 0;
    let previousWorkTick = accepted ?? Infinity;
    for (const [index, receipt] of order.work.entries()) {
      const blank = index % 2 === 0;
      const piece = Math.floor(index / 2) + 1;
      const workKey = JSON.stringify([receipt.makerId, receipt.tick]);
      if (receipt.makerId !== order.makerId || makerWorkTicks.has(workKey) ||
          receipt.tick <= previousWorkTick || receipt.tick > w.tick || receipt.tick >= (effectiveDeadline ?? 0) ||
          (settled !== undefined && receipt.tick > settled) || receipt.piece !== piece || piece > effectiveQuantity ||
          receipt.stage !== (blank ? 'blank' : 'finish') || receipt.herbsUsed !== 1 ||
          receipt.stonesUsed !== (blank ? terms.blankFuel : terms.finishFuel)) fail('workshops.work.sequence');
      makerWorkTicks.add(workKey);
      previousWorkTick = receipt.tick;
      usedStones += receipt.stonesUsed;
      usedHerbs += receipt.herbsUsed;
      if (blank) {
        if (receipt.quality !== undefined || receipt.qualityScore !== undefined || receipt.artifactId !== undefined ||
            receipt.feePaid !== undefined) fail('workshops.work.blank');
      } else {
        const score = receipt.qualityScore;
        const grade = score === undefined ? undefined : workshopGradeForScore(score);
        const passed = grade === 'fine' || (grade === 'standard' && order.qualityFloor === 'standard');
        if (grade === undefined || grade !== receipt.quality ||
            (passed ? receipt.artifactId !== `workshop-artifact-${order.id}-${piece}` || receipt.feePaid !== terms.feePerPiece :
              receipt.artifactId !== undefined || (receipt.feePaid !== undefined && receipt.feePaid !== 0))) fail('workshops.work.quality');
        usedStones += receipt.feePaid ?? 0;
      }
    }
    if (order.escrowStones + order.refundedStones + usedStones !== (accepted === undefined ? 0 : terms.totalStones) ||
        order.escrowHerbs + order.refundedHerbs + usedHerbs !== (accepted === undefined ? 0 : terms.totalHerbs))
      fail('workshops.orders.custody');
  }
  validateWorkshopCapacityClauses(w,fail);
  validateWorkshopInstitutionHistory(w, actor, sector, locations, fail);
  const furnace = w.furnaceReservations;
  unique(furnace.reservations, ({ id }) => id, 'furnaceReservations.reservations.id');
  unique(furnace.uses, ({ siteId, tick, slot }) => JSON.stringify([siteId, tick, slot]), 'furnaceReservations.uses.siteTurn');
  unique(furnace.uses, ({ actorId, tick }) => JSON.stringify([actorId, tick]), 'furnaceReservations.uses.actorTurn');
  const activeFurnace = furnace.reservations.filter(({ status }) => status === 'queued' || status === 'reserved');
  unique(activeFurnace, ({ actorId }) => actorId, 'furnaceReservations.active.actor');
  unique(activeFurnace.filter(({ status }) => status === 'reserved'), ({ siteId, assignedTick, slot }) =>
    JSON.stringify([siteId, assignedTick, slot]), 'furnaceReservations.active.siteTurn');
  const furnaceById = new Map(furnace.reservations.map((row) => [row.id, row]));
  const furnaceSitesById = new Map(w.locations.map((site) => [site.id, site]));
  const workshopById = new Map(w.workshops.orders.map((order) => [order.id, order]));
  const furnaceActorsById = new Map(w.cultivators.map((person) => [person.id, person]));
  const usageByReservation = new Set<string>();
  for (const use of furnace.uses) {
    const reservation = use.reservationId ? furnaceById.get(use.reservationId) : undefined;
    const order = use.workshopOrderId ? workshopById.get(use.workshopOrderId) : undefined;
    if (!actor.has(use.actorId) || use.tick > w.tick || w.tick - use.tick >= FURNACE_USE_RETENTION_TICKS ||
        (use.kind === 'workshop') !== Boolean(use.workshopOrderId) ||
        (use.reservationId !== undefined && (!reservation || usageByReservation.has(use.reservationId) ||
          reservation.status !== 'used' || reservation.actorId !== use.actorId || reservation.siteId !== use.siteId ||
          reservation.assignedTick !== use.tick || reservation.slot !== use.slot ||
          reservation.workshopOrderId !== use.workshopOrderId)) ||
        (order && (order.makerId !== use.actorId || order.siteId !== use.siteId || !order.work.some(({ tick }) => tick === use.tick))))
      fail('furnaceReservations.uses.source');
    if (use.reservationId) usageByReservation.add(use.reservationId);
  }
  if (furnace.reservations.filter((row) => row.closedTick !== undefined && !usageByReservation.has(row.id)).length > FURNACE_TERMINAL_LIMIT)
    fail('furnaceReservations.reservations.history');
  for (const row of furnace.reservations) {
    const serial = Number(row.id.match(/^furnace-([1-9][0-9]*)$/)?.[1]);
    const site = furnaceSitesById.get(row.siteId);
    const order = row.workshopOrderId ? workshopById.get(row.workshopOrderId) : undefined;
    const maker = furnaceActorsById.get(row.actorId);
    const isActive = row.status === 'queued' || row.status === 'reserved';
    const assigned = row.assignedTick;
    if (!Number.isSafeInteger(serial) || serial >= furnace.nextId || !actor.has(row.actorId) ||
        row.requestedTick > w.tick || row.expiresTick !== row.requestedTick + FURNACE_QUEUE_TICKS + (row.suspendedTicks ?? 0) ||
        (row.suspendedTicks === undefined) !== (row.lastSuspendedTick === undefined) ||
        (row.lastSuspendedTick !== undefined && (row.lastSuspendedTick > (row.closedTick ?? w.tick) ||
          row.lastSuspendedTick < row.requestedTick + (row.suspendedTicks ?? 0) ||
          (assigned !== undefined && row.lastSuspendedTick >= assigned))) ||
        (assigned === undefined) !== (row.slot === undefined) ||
        (assigned !== undefined && (assigned <= row.requestedTick || assigned >= row.expiresTick || assigned > w.tick)) ||
        (isActive && (!site?.furnaceGrade || !maker?.alive || maker.hp <= 0 || maker.locationId !== row.siteId ||
          row.expiresTick <= w.tick || row.closedTick !== undefined || row.reason !== undefined ||
          (row.status === 'queued' ? assigned !== undefined : assigned !== w.tick || (row.slot ?? 0) > site.furnaceGrade))) ||
        (!isActive && (row.closedTick === undefined || row.closedTick < (assigned ?? row.requestedTick) || row.closedTick > w.tick)) ||
        (row.status === 'used' && (assigned === undefined || row.closedTick !== assigned || row.reason !== undefined ||
          (w.tick - assigned < FURNACE_USE_RETENTION_TICKS && !usageByReservation.has(row.id)))) ||
        (row.status === 'cancelled' && (!row.reason || row.reason === 'queue_expired' || row.reason === 'turn_missed')) ||
        (row.status === 'expired' && (row.reason !== 'queue_expired' && row.reason !== 'turn_missed')) ||
        (row.reason === 'queue_expired' && (assigned !== undefined || (row.closedTick ?? 0) < row.expiresTick)) ||
        (row.reason === 'turn_missed' && (assigned === undefined || (row.closedTick ?? 0) < assigned)) ||
        (isActive && row.workshopOrderId && (!order || order.status !== 'active')) ||
        (order && (order.makerId !== row.actorId || order.siteId !== row.siteId)))
      fail('furnaceReservations.reservations.source');
  }
  validateSparringRelationships(w, actor, locations, fail);
  validateExpeditionRescueRelationships(w, actor, fail);
  validateShortShiftRelationships(w, actor, sector, fail);
  validateBoundaryReliefRelationships(w, actor, sector, fail);
  validateApprenticeCohortRelationships(w, actor, sector, locations, fail);
  validateHouseholdNameRelationships(w, actor, fail);
  validateCaravanRestitutionRelationships(w, actor, fail);
  validateCivicMemorialHistory(w, actor, fail);
  validatePavilionLoanHistory(w, actor, sector, fail);
  validateRouteWarningHistory(w, actor, fail);
  validateVillageSupplyHistory(w, actor, fail);
  validateVillageGranaryRelationships(w, actor, fail);
  validateFurnaceSafetyRelationships(w, actor, sector, fail);
  let previousFlowTick = -1;
  let previousFlowId = 0;
  for (const book of w.resourceFlow.months) {
    if (book.tick <= previousFlowTick || book.tick > w.tick || (book.tick === w.tick && (book.year !== w.year || book.month !== w.month)) ||
        book.entries.length !== Math.min(book.totalEntries, RESOURCE_FLOW_DETAIL_LIMIT)) fail('resourceFlow.months.window');
    previousFlowTick = book.tick;
    unique(book.totals, ({ good }) => good, 'resourceFlow.months.totals');
    const recorded = new Map(book.totals.map(({ good }) => [good, { transfer:0, production:0, consumption:0, loss:0 }]));
    for (const entry of book.entries) {
      if (entry.id <= previousFlowId || entry.id >= w.resourceFlow.nextId || entry.tick !== book.tick || entry.amount <= 0 ||
          !RESOURCE_FLOW_REASON.test(entry.reason)) fail('resourceFlow.entries.reference');
      previousFlowId = entry.id;
      const hasFrom = 'from' in entry && !!entry.from;
      const hasTo = 'to' in entry && !!entry.to;
      if (hasFrom !== (entry.kind !== 'production') || hasTo !== (entry.kind === 'transfer' || entry.kind === 'production'))
        fail('resourceFlow.entries.endpoints');
      if (entry.kind === 'transfer' && sameFlowAccount(entry.from, entry.to)) fail('resourceFlow.entries.sameEndpoint');
      const accounts = [...('from' in entry ? [entry.from] : []), ...('to' in entry ? [entry.to] : [])];
      for (const account of accounts) {
        if (!account || (account.kind === 'oath') !== ('pocket' in account)) fail('resourceFlow.entries.account');
      }
      const scope = entry.visibility;
      if (scope.kind === 'observer' && ('siteIds' in scope || 'actorIds' in scope)) fail('resourceFlow.entries.scope');
      if (scope.kind === 'participants') {
        if ('siteIds' in scope || !scope.actorIds.length) fail('resourceFlow.entries.scope');
        unique([...scope.actorIds], (value) => value, 'resourceFlow.entries.participants');
      }
      if (scope.kind === 'known_sites') {
        if ('actorIds' in scope || !scope.siteIds.length) fail('resourceFlow.entries.scope');
        unique([...scope.siteIds], (value) => value, 'resourceFlow.entries.sites');
      }
      const total = recorded.get(entry.good);
      if (!total) fail('resourceFlow.entries.unaccounted');
      else total[entry.kind] += entry.amount;
    }
    for (const total of book.totals) {
      const stored = recorded.get(total.good)!;
      if (!(total.transfer > 0 || total.production > 0 || total.consumption > 0 || total.loss > 0)) fail('resourceFlow.totals.empty');
      for (const kind of ['transfer','production','consumption','loss'] as const) {
        const precision = Math.max(1, total[kind], stored[kind]) * 1e-10;
        if (stored[kind] - total[kind] > precision ||
            (book.totalEntries === book.entries.length && Math.abs(stored[kind] - total[kind]) > precision)) fail('resourceFlow.totals.accounting');
      }
    }
  }
  unique(w.sharedCommons.pacts, ({ id }) => id, 'sharedCommons.pacts.id');
  unique(w.sharedCommons.pacts.filter(({ status }) => status !== 'closed'), ({ siteId }) => siteId, 'sharedCommons.openSite');
  for (const pact of w.sharedCommons.pacts) {
    const serial = Number(pact.id.match(/^shared-commons-([1-9][0-9]*)$/)?.[1]);
    unique(pact.parties, ({ sectId }) => sectId, 'sharedCommons.parties.sect');
    const parties = new Map(pact.parties.map((party) => [party.sectId, party]));
    unique(pact.parties, ({ signerId }) => signerId, 'sharedCommons.parties.signer');
    const proposer = parties.get(pact.proposerSectId);
    const activated = pact.activatedTick;
    const start = pact.startsTick;
    const end = pact.endsTick;
    if (!Number.isSafeInteger(serial) || serial >= w.sharedCommons.nextId || pact.parties.length !== 3 ||
        pact.openedTick > w.tick || pact.offerExpiresTick !== pact.openedTick + COMMONS_OFFER_TICKS ||
        !proposer || proposer.signedTick !== pact.openedTick || proposer.share !== 2 ||
        pact.parties.some((party) => !sector.has(party.sectId) || !actor.has(party.signerId) ||
          (party.sectId !== pact.proposerSectId && party.share !== 1) ||
          (party.signedTick !== undefined && (party.signedTick < pact.openedTick || party.signedTick >= pact.offerExpiresTick || party.signedTick > w.tick)))) fail('sharedCommons.pacts.parties');
    if (activated === undefined) {
      if (pact.status === 'active' || start !== undefined || end !== undefined || pact.rounds.length ||
          pact.parties.every(({ signedTick }) => signedTick !== undefined)) fail('sharedCommons.pacts.notActivated');
    } else if (pact.status === 'offered' || activated > w.tick || activated >= pact.offerExpiresTick ||
        start !== activated + 1 || end !== start + COMMONS_TERM_TICKS ||
        pact.parties.some(({ signedTick }) => signedTick === undefined || signedTick > activated) ||
        !pact.parties.some(({ signedTick }) => signedTick === activated)) fail('sharedCommons.pacts.activation');
    if (pact.status === 'closed') {
      if (pact.settledTick === undefined || !pact.closeReason || pact.settledTick > w.tick ||
          pact.settledTick < (activated ?? pact.openedTick) ||
          (pact.closeReason === 'offer_expiry' && (activated !== undefined || pact.settledTick < pact.offerExpiresTick)) ||
          (pact.closeReason === 'term_complete' && (end === undefined || pact.settledTick < end))) fail('sharedCommons.pacts.settlement');
    } else if (pact.settledTick !== undefined || pact.closeReason !== undefined || !locations.has(pact.siteId)) fail('sharedCommons.pacts.live');
    let previousRoundIndex = -1;
    for (const round of pact.rounds) {
      const allocated = unique(round.allocations, ({ sectId }) => sectId, 'sharedCommons.allocations.sect');
      unique(round.harvests, ({ tick, actorId }) => JSON.stringify([tick, actorId]), 'sharedCommons.harvests.oneTurn');
      const roundIndex = (round.startTick - (start ?? Infinity)) / COMMONS_ROUND_TICKS;
      if (!Number.isSafeInteger(roundIndex) || roundIndex <= previousRoundIndex || roundIndex >= COMMONS_TERM_TICKS / COMMONS_ROUND_TICKS ||
          round.startTick > w.tick || (pact.settledTick !== undefined && round.startTick > pact.settledTick) ||
          round.endsTick !== round.startTick + COMMONS_ROUND_TICKS || round.allocations.length !== 3 || round.reserved > round.stockAtOpen ||
          round.allocations.reduce((sum, row) => sum + row.quota, 0) !== round.reserved) fail('sharedCommons.rounds.window');
      previousRoundIndex = roundIndex;
      const shares = commonsQuotaShares(round.stockAtOpen, pact.parties, roundIndex);
      const entitled = new Map(pact.parties.map(({ sectId }, index) => [sectId, shares[index]]));
      const used = new Map<string, number>();
      for (const harvest of round.harvests) {
        if (!actor.has(harvest.actorId) || !allocated.has(harvest.sectId) || harvest.tick < round.startTick ||
            harvest.tick >= round.endsTick || harvest.tick > w.tick ||
            (pact.settledTick !== undefined && harvest.tick > pact.settledTick)) fail('sharedCommons.harvests.references');
        used.set(harvest.sectId, (used.get(harvest.sectId) ?? 0) + harvest.units);
      }
      for (const entry of round.allocations) {
        const signed = parties.get(entry.sectId);
        if (!signed || entry.maintenanceDue !== signed.share * COMMONS_MAINTENANCE_UNIT ||
            (entry.maintenancePaid !== 0 && entry.maintenancePaid !== entry.maintenanceDue) ||
            entry.quota !== (entry.maintenancePaid === 0 ? 0 : entitled.get(entry.sectId)) || entry.used > entry.quota ||
            entry.used !== (used.get(entry.sectId) ?? 0)) fail('sharedCommons.allocations.accounting');
      }
    }
  }
  unique(w.serviceRetirement.history, ({ id }) => id, 'serviceRetirement.history.id');
  unique(w.serviceRetirement.history, ({ actorId, tick }) => JSON.stringify([actorId, tick]), 'serviceRetirement.history.action');
  const lastService = new Map<string, typeof w.serviceRetirement.history[number]>();
  for (const entry of w.serviceRetirement.history) {
    const serial = Number(entry.id.match(/^service-record-([1-9][0-9]*)$/)?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.serviceRetirement.nextId || !actor.has(entry.actorId) ||
        !sector.has(entry.sectId) || entry.tick > w.tick ||
        (entry.kind === 'return' && (entry.leaderReleased || entry.forumReleased || entry.guardLocationId ||
          entry.stewardSchoolIds.length || entry.infirmaryShiftIds.length))) fail('serviceRetirement.history.references');
    unique(entry.stewardSchoolIds, (id) => id, 'serviceRetirement.history.school');
    unique(entry.infirmaryShiftIds, (id) => id, 'serviceRetirement.history.shift');
    const previous = lastService.get(entry.actorId);
    if (!previous || entry.tick > previous.tick) lastService.set(entry.actorId, entry);
  }
  for (const person of w.cultivators) {
    const stamp = person.service;
    const latest = lastService.get(person.id);
    if (!stamp) {
      if (latest) fail('serviceRetirement.current.missing');
      continue;
    }
    if (!sector.has(stamp.formerSectId) || stamp.changedTick > w.tick ||
        (stamp.status === 'retired' ? stamp.changedTick !== stamp.retiredTick || !!person.guardAssignment ||
          w.sects.some(({ leaderId }) => leaderId === person.id) :
          stamp.changedTick < stamp.retiredTick + SERVICE_RETIREMENT_MIN_TICKS) ||
        (latest && (latest.tick !== stamp.changedTick ||
          latest.kind !== (isRetiredFromService(person) ? 'retire' : 'return') || latest.formerRank !== stamp.formerRank))) fail('serviceRetirement.current.references');
  }
  unique(w.couriers.dispatches, ({ id }) => id, 'couriers.dispatches.id');
  unique(w.couriers.dispatches.filter(({ status }) => status === 'in_transit' || status === 'returning'),
    ({ courierId }) => courierId, 'couriers.dispatches.active_courier');
  const courierSites = new Map(w.locations.map((site) => [site.id, site]));
  for (const row of w.couriers.dispatches) {
    const serial = Number(row.id.match(/^sealed-dispatch-([1-9][0-9]*)$/)?.[1]);
    const traveling = row.status === 'in_transit' || row.status === 'returning';
    const open = row.status === 'offered' || traveling;
    const accepted = row.acceptedTick !== undefined;
    const delivered = row.status === 'delivered';
    const allowedReason = row.status === 'declined' ? row.reason === 'declined' :
      row.status === 'expired' ? row.reason === 'offer_expiry' || row.reason === 'courier_death' :
      row.status === 'returned' ? ['recipient_absent','recipient_unavailable','route_lost'].some((reason) => reason === row.reason) :
      row.status === 'returning' ?
        ['recipient_absent','recipient_unavailable','hazard','route_lost'].some((reason) => reason === row.reason) :
      row.status === 'lost' ? ['hazard','courier_death','route_lost','deadline'].some((reason) => reason === row.reason) :
      row.reason === undefined;
    if (!Number.isSafeInteger(serial) || serial >= w.couriers.nextId || row.originId === row.destinationId ||
        new Set([row.senderId,row.recipientId,row.courierId]).size !== 3 ||
        [row.senderId,row.recipientId,row.courierId].some((id) => !actor.has(id)) ||
        row.openedTick > w.tick || row.offerExpiresTick !== row.openedTick + COURIER_OFFER_TICKS ||
        ((row.status === 'offered' || row.status === 'declined' || row.status === 'expired') && accepted) ||
        ((traveling || delivered || row.status === 'returned') && !accepted) ||
        (row.status === 'offered' && row.offerExpiresTick <= w.tick) ||
        (accepted !== (row.deadlineTick !== undefined)) || row.feePaid !== (accepted ? COURIER_SERVICE_FEE : 0) ||
        (row.acceptedTick !== undefined && (row.acceptedTick < row.openedTick || row.acceptedTick >= row.offerExpiresTick ||
          row.acceptedTick > w.tick || row.deadlineTick !== row.acceptedTick + COURIER_ROUTE_TICKS)) ||
        (open !== (row.settledTick === undefined)) ||
        (row.settledTick !== undefined && (row.settledTick > w.tick || row.settledTick < (row.acceptedTick ?? row.openedTick))) ||
        (row.status === 'expired' && row.reason === 'offer_expiry' && row.settledTick! < row.offerExpiresTick) ||
        (row.status === 'declined' && row.settledTick! >= row.offerExpiresTick) ||
        (traveling && row.deadlineTick! <= w.tick) || !allowedReason ||
        (delivered !== (row.deliveredTick !== undefined)) ||
        (delivered && (row.deliveredTick !== row.settledTick || row.deliveredTick !== row.lastAdvancedTick ||
          row.deliveredTick! >= row.deadlineTick!)) ||
        (row.lastAdvancedTick !== undefined && (!accepted || row.lastAdvancedTick <= row.acceptedTick! ||
          row.lastAdvancedTick > (row.settledTick ?? w.tick)))) fail('couriers.dispatches.references');
    if (traveling) {
      const start = courierSites.get(row.originId), end = courierSites.get(row.destinationId);
      if (row.path.length < 2 || row.pathIndex >= row.path.length || (!start && !end)) fail('couriers.dispatches.path');
      const first = row.path[0], last = row.path.at(-1)!;
      if (start && (first.x !== start.x || first.y !== start.y) ||
          end && (last.x !== end.x || last.y !== end.y)) fail('couriers.dispatches.path_ends');
      const tiles = row.path.map((p) => terrainTileAt(w, p.x, p.y));
      if (tiles.some((tile, i) => !tile || (i > 0 && (!tiles[i - 1] ||
        Math.abs(tile.col - tiles[i - 1]!.col) + Math.abs(tile.row - tiles[i - 1]!.row) > 1)))) fail('couriers.dispatches.path_tiles');
    } else if (row.path.length || row.pathIndex !== 0) fail('couriers.dispatches.path_closed');
    if (row.sealed.kind === 'public_relief') {
      const stamp = row.sealed;
      const sourceTick = Number(stamp.sourceEventId.match(/^evt-settlement-(\d+)-relief-/)?.[1]);
      const record = w.settlements.records.find(({ id }) => 'evt-' + id === stamp.sourceEventId);
      if (!Number.isSafeInteger(sourceTick) || sourceTick > row.openedTick ||
          stamp.sourceEventId !== 'evt-settlement-' + sourceTick + '-relief-' + stamp.settlementId + '-' + row.senderId ||
          stamp.stones !== SETTLEMENT_RELIEF.stones || stamp.herbs !== SETTLEMENT_RELIEF.jade_leaf ||
          (record && (record.tick !== sourceTick || record.kind !== 'relief' || record.settlementId !== stamp.settlementId ||
            record.actorId !== row.senderId || record.stones !== stamp.stones || record.herbs !== stamp.herbs))) fail('couriers.dispatches.public_proof');
    }
  }
  unique(w.watchlists.watches, ({ id }) => id, 'watchlists.watches.id');
  unique(w.watchlists.watches, ({ observerId, target }) => JSON.stringify([observerId, target.kind, target.id]), 'watchlists.watches.target');
  const watchById = new Map(w.watchlists.watches.map((row) => [row.id, row]));
  if (w.watchlists.lastCapturedTick !== undefined && w.watchlists.lastCapturedTick > w.tick) fail('watchlists.lastCapturedTick');
  for (const watch of w.watchlists.watches) {
    const serial = Number(watch.id.match(/^watch-([1-9][0-9]*)$/)?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.watchlists.nextId || !actor.has(watch.observerId) ||
        watch.createdTick > w.tick || watch.readThroughTick < watch.createdTick || watch.readThroughTick > w.tick ||
        !watch.label.trim() || /[\u0000-\u001f\u007f]/.test(watch.label)) fail('watchlists.watches.references');
  }
  unique(w.watchlists.digests, ({ watchId, tick }) => JSON.stringify([watchId, tick]), 'watchlists.digests.tick');
  for (const row of w.watchlists.digests) {
    const watch = watchById.get(row.watchId);
    if (!watch || row.tick <= watch.createdTick || row.tick > (w.watchlists.lastCapturedTick ?? -1) || !row.buckets.length) fail('watchlists.digests.references');
    unique(row.buckets, ({ category }) => category, 'watchlists.digests.category');
  }
  unique(w.territorialLeases.leases, ({ id }) => id, 'territorialLeases.leases.id');
  unique(w.territorialLeases.leases.filter(({ status }) => status === 'active'), ({ siteId }) => siteId,
    'territorialLeases.leases.active_site');
  for (const lease of w.territorialLeases.leases) {
    const serial = Number(lease.id.match(/^territorial-lease-([1-9][0-9]*)$/)?.[1]);
    const funded = lease.status === 'active' || lease.status === 'closed';
    const live = lease.status === 'active' || lease.status === 'offered';
    const receiptTimes = new Set<string>();
    if (!Number.isSafeInteger(serial) || serial >= w.territorialLeases.nextId ||
        lease.ownerSectId === lease.lesseeSectId || !sector.has(lease.ownerSectId) || !sector.has(lease.lesseeSectId) ||
        !actor.has(lease.ownerSignerId) || !actor.has(lease.lesseeSignerId) || lease.ownerSignerId === lease.lesseeSignerId ||
        lease.openedTick > w.tick || lease.offerExpiresTick !== lease.openedTick + LEASE_OFFER_TICKS ||
        (funded !== (lease.startsTick !== undefined)) || (funded !== (lease.endsTick !== undefined)) ||
        (lease.startsTick !== undefined && (lease.startsTick < lease.openedTick || lease.startsTick >= lease.offerExpiresTick ||
          lease.startsTick > w.tick || lease.endsTick !== lease.startsTick + LEASE_TERM_TICKS)) ||
        (live !== (lease.settledTick === undefined)) ||
        (lease.settledTick !== undefined && (lease.settledTick < (lease.startsTick ?? lease.openedTick) || lease.settledTick > w.tick)) ||
        (lease.status === 'active' && (!locations.has(lease.siteId) || lease.endsTick! <= w.tick || territorialLeaseAvailability(w, lease) === 'title_change')) ||
        (lease.status === 'offered' && lease.offerExpiresTick <= w.tick) ||
        (lease.status === 'declined' && lease.settledTick! >= lease.offerExpiresTick) ||
        (lease.status === 'expired' && lease.settledTick! < lease.offerExpiresTick) ||
        ((lease.status === 'closed') !== (lease.endReason !== undefined)) ||
        (lease.endReason === 'expiry' && lease.settledTick! < lease.endsTick!) ||
        (lease.endReason === 'surrender' && lease.settledTick! >= lease.endsTick!)) fail('territorialLeases.leases.references');
    if (lease.escrow + lease.rentPaid + lease.refunded !== (funded ? LEASE_DEPOSIT : 0) ||
        lease.usedUnits * LEASE_UNIT_RENT !== lease.rentPaid || (lease.status !== 'closed' && lease.refunded !== 0) ||
        (!funded && (lease.receipts.length || lease.usedUnits))) fail('territorialLeases.leases.balance');
    let summedUsed = 0, summedRent = 0, summedRefund = 0, lastTick = -1;
    for (const receipt of lease.receipts) {
      const key = JSON.stringify([receipt.tick, receipt.kind, receipt.actorId]);
      if (!funded || receipt.tick < (lease.startsTick ?? Infinity) || receipt.tick > w.tick || receipt.tick < lastTick || receiptTimes.has(key)) {
        fail('territorialLeases.leases.receipts.references');
      }
      receiptTimes.add(key); lastTick = receipt.tick;
      if (receipt.kind === 'harvest') {
        if (!receipt.actorId || !actor.has(receipt.actorId) || !receipt.herbId || !receipt.units ||
            receipt.amount !== receipt.units * LEASE_UNIT_RENT || receipt.tick >= lease.endsTick! ||
            receipt.tick > (lease.settledTick ?? w.tick)) fail('territorialLeases.leases.receipts.harvest');
        summedUsed += receipt.units ?? 0; summedRent += receipt.amount;
      } else {
        if (receipt.actorId !== undefined || receipt.herbId !== undefined || receipt.units !== undefined ||
            lease.status !== 'closed' || receipt.tick < lease.settledTick!) fail('territorialLeases.leases.receipts.refund');
        summedRefund += receipt.amount;
      }
    }
    if (summedUsed !== lease.usedUnits || summedRent !== lease.rentPaid || summedRefund !== lease.refunded) fail('territorialLeases.leases.receipts.totals');
  }
  unique(w.formations.links, ({ id }) => id, 'formations.links.id');
  unique(w.formations.links.filter(({ status }) => status === 'offered' || status === 'active' || status === 'broken'),
    ({ sectAId, sectBId }) => JSON.stringify([sectAId, sectBId]), 'formations.links.active_pair');
  for (const link of w.formations.links) {
    const serial = Number(link.id.match(/^formation-link-([1-9][0-9]*)$/)?.[1]);
    const funded = link.status === 'active' || link.status === 'broken' || link.status === 'ended';
    const open = link.status === 'offered' || link.status === 'active' || link.status === 'broken';
    if (!Number.isSafeInteger(serial) || serial >= w.formations.nextId || link.sectAId >= link.sectBId ||
        !sector.has(link.sectAId) || !sector.has(link.sectBId) || link.siteAId === link.siteBId ||
        !actor.has(link.proposerId) || !actor.has(link.recipientLeaderId) || link.proposerId === link.recipientLeaderId ||
        (link.proposerSectId !== link.sectAId && link.proposerSectId !== link.sectBId) ||
        link.openedTick > w.tick || link.offerExpiresTick !== link.openedTick + FORMATION_OFFER_TICKS ||
        (funded !== (link.fundedTick !== undefined)) || link.openedPaymentEach !== (funded ? FORMATION_SETUP_COST : 0) ||
        (link.fundedTick !== undefined && (link.fundedTick < link.openedTick || link.fundedTick >= link.offerExpiresTick || link.fundedTick > w.tick)) ||
        (open !== (link.settledTick === undefined)) ||
        (link.settledTick !== undefined && (link.settledTick < (link.fundedTick ?? link.openedTick) || link.settledTick > w.tick)) ||
        (link.status === 'offered' && link.offerExpiresTick <= w.tick) ||
        (link.status === 'expired' && link.settledTick! < link.offerExpiresTick) ||
        (link.status === 'declined' && link.settledTick! >= link.offerExpiresTick) ||
        (link.status === 'ended' ? link.endReason !== 'site_lost' : link.endReason !== undefined)) fail('formations.links.references');
    if ((link.status === 'active' || link.status === 'broken') && formationLinkAvailability(w, link) === 'site_lost') fail('formations.links.endpoints');
    const stamps = [link.lastDispatchTick, link.lastDrawTick, link.lastRepairTick, link.brokenTick];
    if (stamps.some((stamp) => stamp !== undefined && (!funded || stamp < link.fundedTick! || stamp > (link.settledTick ?? w.tick))) ||
        (link.status === 'broken' && (link.brokenTick === undefined || (link.lastRepairTick ?? -1) >= link.brokenTick)) ||
        (link.status === 'active' && link.brokenTick !== undefined && (link.lastRepairTick ?? -1) <= link.brokenTick) ||
        ((link.repairTotal > 0) !== (link.lastRepairTick !== undefined)) ||
        (link.lastRepairTick !== undefined && link.brokenTick === undefined)) fail('formations.links.timestamps');
    if (link.sentTotal !== link.transmissionLoss + link.deliveredTotal ||
        link.deliveredTotal !== link.drawnTotal + link.dissipatedTotal + link.heldA + link.heldB ||
        link.repairTotal % FORMATION_REPAIR_COST !== 0 ||
        (!funded && [link.sentTotal,link.drawnTotal,link.repairTotal,link.receipts.length].some(Boolean)) ||
        (link.status === 'ended' ? (link.heldA !== 0 || link.heldB !== 0) : link.dissipatedTotal !== 0) ||
        ((link.sentTotal > 0) !== (link.lastDispatchTick !== undefined)) ||
        ((link.drawnTotal > 0) !== (link.lastDrawTick !== undefined))) fail('formations.links.conservation');
    const observed = { sent:0, delivered:0, lost:0, drawn:0, dissipated:0, stonesSpent:0 };
    const uses = new Set<string>();
    const latest = new Map<string, number>();
    for (const receipt of link.receipts) {
      const { tick: when, kind, actorId, fromSiteId, toSiteId, sent, delivered, lost, drawn, stonesSpent, dissipated } = receipt;
      const category = kind === 'dispatch' || kind === 'overload' ? 'transfer' : kind;
      const use = JSON.stringify([category, when]);
      const keys = Object.keys(receipt);
      const exactShape = (fields: readonly string[]) => keys.length === fields.length && keys.every((key) => fields.includes(key));
      const base = ['tick','kind','actorId','fromSiteId'];
      if (!funded || when < link.fundedTick! || when > (link.settledTick ?? w.tick) || uses.has(use) ||
          (kind !== 'dissipate' && (!actorId || !actor.has(actorId) || (fromSiteId !== link.siteAId && fromSiteId !== link.siteBId)))) fail('formations.links.receipts.references');
      uses.add(use);
      if ((latest.get(category) ?? -1) > when) fail('formations.links.receipts.order');
      latest.set(category, when);
      if (kind === 'dispatch' || kind === 'overload') {
        const amount = kind === 'dispatch' ? FORMATION_DISPATCH_QI : FORMATION_OVERLOAD_QI;
        const through = Math.min(amount, FORMATION_MAX_THROUGHPUT);
        const maximum = Math.max(0, through - Math.ceil(through / 5) - Math.ceil(link.steps / 6));
        if (!exactShape([...base,'toSiteId','sent','delivered','lost']) || sent !== amount || delivered === undefined || lost === undefined ||
            toSiteId !== (fromSiteId === link.siteAId ? link.siteBId : link.siteAId) ||
            sent !== delivered + lost || delivered > maximum) fail('formations.links.receipts.transfer');
        observed.sent += sent ?? 0; observed.delivered += delivered ?? 0; observed.lost += lost ?? 0;
        if (kind === 'overload') latest.set('overload', when);
      } else if (kind === 'draw') {
        if (!exactShape([...base,'drawn']) || !(drawn && drawn <= FORMATION_DRAW_CAP)) fail('formations.links.receipts.draw');
        observed.drawn += drawn ?? 0;
      } else if (kind === 'repair') {
        if (!exactShape([...base,'stonesSpent']) || stonesSpent !== FORMATION_REPAIR_COST) fail('formations.links.receipts.repair');
        observed.stonesSpent += stonesSpent ?? 0;
      } else {
        if (!exactShape(['tick','kind','dissipated']) || link.status !== 'ended' || when !== link.settledTick ||
            dissipated !== link.dissipatedTotal) fail('formations.links.receipts.dissipate');
        observed.dissipated += dissipated ?? 0;
      }
    }
    if ((link.status === 'ended') !== latest.has('dissipate') ||
        [...latest].some(([key, when]) => key !== 'dissipate' && when !==
          (key === 'transfer' ? link.lastDispatchTick : key === 'draw' ? link.lastDrawTick : key === 'overload' ? link.brokenTick : link.lastRepairTick))) fail('formations.links.receipts.last');
    const totals = [link.sentTotal,link.deliveredTotal,link.transmissionLoss,link.drawnTotal,link.dissipatedTotal,link.repairTotal];
    if (Object.values(observed).some((amount,index) => amount > totals[index] ||
        (link.receipts.length < FORMATION_RECEIPT_LIMIT && amount !== totals[index]))) fail('formations.links.receipts.totals');
  }
  const infirmarySerials = new Set<number>();
  const infirmaryShifts = new Map(w.infirmaries.shifts.map((shift) => [shift.id, shift]));
  const infirmaryPatientMax = new Map(w.cultivators.map(({ id, maxHp }) => [id, maxHp]));
  const validInfirmarySerial = (id: string, kind: 'shift' | 'case') => {
    const serial = Number(id.match(new RegExp('^infirmary-' + kind + '-([1-9][0-9]*)$'))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.infirmaries.nextId || infirmarySerials.has(serial)) fail('infirmaries.nextId');
    infirmarySerials.add(serial);
  };
  unique(w.infirmaries.shifts.filter(({ expiresTick }) => expiresTick > w.tick), ({ guardId }) => guardId, 'infirmaries.shifts.active_guard');
  for (const shift of w.infirmaries.shifts) {
    validInfirmarySerial(shift.id, 'shift');
    if (!actor.has(shift.guardId) || !sector.has(shift.sectId) || shift.startedTick > w.tick ||
        shift.expiresTick !== shift.startedTick + INFIRMARY_SHIFT_TICKS ||
        (shift.lastServedTick !== undefined && (shift.lastServedTick <= shift.startedTick || shift.lastServedTick >= shift.expiresTick ||
          shift.lastServedTick > w.tick)) ||
        (shift.lastWithheld && (shift.lastWithheld.tick <= shift.startedTick || shift.lastWithheld.tick >= shift.expiresTick ||
          shift.lastWithheld.tick > w.tick || shift.lastWithheld.tick === shift.lastServedTick))) fail('infirmaries.shifts.references');
  }
  unique(w.infirmaries.cases.filter(({ status }) => status === 'waiting'), ({ patientId }) => patientId, 'infirmaries.cases.active_patient');
  const serviceUses = new Set<string>(), bedUses = new Map<string, number>();
  for (const row of w.infirmaries.cases) {
    validInfirmarySerial(row.id, 'case');
    const waiting = row.status === 'waiting';
    const treated = row.status === 'treated';
    if (!actor.has(row.patientId) || !sector.has(row.sectId) || row.queuedTick > w.tick ||
        row.expiresTick !== row.queuedTick + INFIRMARY_QUEUE_TICKS ||
        (waiting !== (row.settledTick === undefined)) || (treated !== (row.receipt !== undefined)) ||
        (waiting && (row.expiresTick <= w.tick || !locations.has(row.siteId))) ||
        (row.settledTick !== undefined && (row.settledTick < row.queuedTick || row.settledTick > w.tick)) ||
        (row.status === 'refused' ? row.reason !== 'refused' || row.settledTick! >= row.expiresTick :
          row.status === 'closed' ? !row.reason || row.reason === 'refused' ||
            (row.reason === 'expiry' ? row.settledTick! < row.expiresTick : row.settledTick! >= row.expiresTick) :
            row.reason !== undefined)) fail('infirmaries.cases.references');
    const receipt = row.receipt;
    if (!receipt) continue;
    const shift = infirmaryShifts.get(receipt.shiftId);
    const serviceKey = JSON.stringify([receipt.shiftId, receipt.tick]);
    const bedKey = JSON.stringify([row.sectId, row.siteId, receipt.tick]);
    const uses = (bedUses.get(bedKey) ?? 0) + 1;
    if (receipt.handoff) {
      const primary = infirmaryShifts.get(receipt.handoff.fromShiftId);
      if (!primary || primary.id === receipt.shiftId || primary.guardId === receipt.guardId || primary.guardId === row.patientId ||
          primary.sectId !== row.sectId || primary.siteId !== row.siteId ||
          receipt.tick <= primary.startedTick || receipt.tick >= primary.expiresTick ||
          !primary.lastWithheld || primary.lastWithheld.tick < receipt.tick ||
          (primary.lastWithheld.tick === receipt.tick && primary.lastWithheld.duty !== receipt.handoff.duty) ||
          primary.lastServedTick === receipt.tick) fail('infirmaries.cases.handoff');
    }
    if (!shift || receipt.guardId !== shift.guardId || receipt.guardId === row.patientId || shift.sectId !== row.sectId ||
        shift.siteId !== row.siteId || receipt.tick !== row.settledTick || receipt.tick <= row.queuedTick ||
        receipt.tick >= row.expiresTick || receipt.tick <= shift.startedTick || receipt.tick >= shift.expiresTick ||
        shift.lastServedTick === undefined || receipt.tick > shift.lastServedTick || serviceUses.has(serviceKey) || uses > INFIRMARY_MAX_BEDS ||
        receipt.stonesSpent !== INFIRMARY_TREATMENT_STONES || receipt.herbsSpent !== INFIRMARY_TREATMENT_HERBS ||
        receipt.hpRestored > Math.round((infirmaryPatientMax.get(row.patientId) ?? 0) * INFIRMARY_HEAL_FRACTION)) fail('infirmaries.cases.receipt');
    serviceUses.add(serviceKey);
    bedUses.set(bedKey, uses);
  }
  const habitatSerials = new Set<number>();
  const habitatBeasts = new Map(w.spiritBeasts.map((animal) => [animal.id, animal]));
  const habitatSites = new Map(w.locations.map((site) => [site.id, site]));
  const habitatSerial = (id: string, kind: 'restoration' | 'release') => {
    const serial = Number(id.match(new RegExp('^habitat-' + kind + '-([1-9][0-9]*)$'))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.habitats.nextId || habitatSerials.has(serial)) fail('habitats.nextId');
    habitatSerials.add(serial);
  };
  unique(w.habitats.stewardships.filter(({ endedTick }) => endedTick === undefined),
    ({ siteId }) => siteId, 'habitats.stewardships.active_site');
  for (const row of w.habitats.stewardships) {
    habitatSerial(row.id, 'restoration');
    const site = habitatSites.get(row.siteId);
    if (!actor.has(row.stewardId) || !sector.has(row.sponsorSectId) || row.restoredTick > w.tick ||
        row.expiresTick !== row.restoredTick + HABITAT_RESTORATION_TICKS ||
        ((row.endedTick === undefined) !== (row.endReason === undefined)) ||
        (row.endedTick === undefined && (row.expiresTick <= w.tick || site?.type !== 'spirit_vein' ||
          Boolean(site.ownerSectId && site.ownerSectId !== row.sponsorSectId) ||
          w.sects.some(({ headquartersId }) => headquartersId === row.siteId))) ||
        (row.endedTick !== undefined && (row.endedTick < row.restoredTick || row.endedTick > w.tick ||
          (row.endReason === 'expiry' ? row.endedTick < row.expiresTick : row.endedTick >= row.expiresTick)))) {
      fail('habitats.stewardships.references');
    }
  }
  unique(w.habitats.releases.filter(({ status }) => status === 'monitoring'),
    ({ beastId }) => beastId, 'habitats.releases.monitoring_beast');
  for (const row of w.habitats.releases) {
    habitatSerial(row.id, 'release');
    const beast = habitatBeasts.get(row.beastId);
    if (!beast || !actor.has(row.formerOwnerId) || row.releasedTick > w.tick ||
        row.earliestSurveyTick !== row.releasedTick + HABITAT_SURVEY_DELAY || row.deadlineTick !== row.releasedTick + HABITAT_SURVEY_WINDOW ||
        (row.status === 'monitoring' && (row.settledTick !== undefined || row.deadlineTick <= w.tick)) ||
        (row.status !== 'monitoring' && (row.settledTick === undefined || row.settledTick > w.tick)) ||
        (row.status === 'unconfirmed' && row.settledTick! < row.deadlineTick)) fail('habitats.releases.references');
    const eye = row.observation;
    const maxBeastHp = beast?.maxHp ?? 0;
    if ((row.status === 'sighted') !== (eye !== undefined) ||
        (eye && (eye.observerId === row.formerOwnerId || !actor.has(eye.observerId) || eye.tick !== row.settledTick ||
          eye.tick < row.earliestSurveyTick || eye.tick >= row.deadlineTick || eye.hp > maxBeastHp ||
          eye.hp < maxBeastHp * HABITAT_MIN_HEALTH))) fail('habitats.releases.sighting');
  }
  unique(w.chronicleErrata.sources, ({ sourceEventId }) => sourceEventId, 'chronicleErrata.sources.id');
  const errataSources = new Map(w.chronicleErrata.sources.map((row) => [row.sourceEventId, row]));
  const errataVenues = new Map(w.locations.map(({ id, type }) => [id, type]));
  const errataPrivate = new Set(w.events.filter(({ witnessScope, tick }) => witnessScope === 'participants' || tick > w.tick).map(({ id }) => id));
  for (const fact of errataSources.values()) {
    const type = errataVenues.get(fact.locationId);
    if (fact.tick > w.tick || errataPrivate.has(fact.sourceEventId) || type === 'secret_realm') {
      fail('chronicleErrata.sources.public_time');
    }
    if (fact.kind === 'duel') {
      const liveFact = w.witnesses.facts.find(({ eventId }) => eventId === fact.sourceEventId);
      const publicEvent = w.events.find(({ id }) => id === fact.sourceEventId);
      if (fact.participantIds.length !== 2 || new Set(fact.participantIds).size !== 2 ||
          fact.participantIds.some((id) => !actor.has(id)) || !fact.participantIds.includes(fact.winnerId) ||
          !['duel', 'kill'].some((suffix) => fact.sourceEventId === 'evt-' + fact.tick + '-' + fact.participantIds[0] + '-' + suffix) ||
          (liveFact && (liveFact.tick !== fact.tick || liveFact.locationId !== fact.locationId || liveFact.winnerId !== fact.winnerId ||
            fact.participantIds.some((id) => !liveFact.participantIds.includes(id)))) ||
          (publicEvent && (publicEvent.tick !== fact.tick || publicEvent.locationId !== fact.locationId || publicEvent.duelWinnerId !== fact.winnerId ||
            fact.participantIds.some((id) => !publicEvent.actorIds.includes(id))))) fail('chronicleErrata.sources.duel_proof');
    } else {
      const recordId = 'settlement-' + fact.tick + '-relief-' + fact.settlementId + '-' + fact.actorId;
      const receipt = w.settlements.records.find(({ id }) => id === recordId);
      if ((type && type !== 'market') || !actor.has(fact.actorId) || fact.sourceEventId !== 'evt-' + recordId ||
          fact.stones !== SETTLEMENT_RELIEF.stones || fact.herbs !== SETTLEMENT_RELIEF.jade_leaf ||
          (receipt && (receipt.kind !== 'relief' || receipt.tick !== fact.tick || receipt.actorId !== fact.actorId ||
            receipt.settlementId !== fact.settlementId || receipt.stones !== fact.stones || receipt.herbs !== fact.herbs))) fail('chronicleErrata.sources.relief_proof');
    }
  }
  const errataSerials = new Set<number>();
  const validateErrataSerial = (id: string, kind: 'retelling' | 'correction') => {
    const serial = Number(id.match(new RegExp('^chronicle-' + kind + '-([1-9][0-9]*)$'))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.chronicleErrata.nextId || errataSerials.has(serial)) fail('chronicleErrata.nextId');
    errataSerials.add(serial);
  };
  const errataClaims = new Map<string, typeof w.chronicleErrata.retellings>();
  unique(w.chronicleErrata.retellings, ({ sourceEventId, authorId }) => JSON.stringify([sourceEventId, authorId]), 'chronicleErrata.retellings.once');
  const errataKey = (reading: typeof w.chronicleErrata.retellings[number]['reading']) =>
    reading.kind === 'duel' ? reading.winnerId : reading.delivery;
  for (const row of w.chronicleErrata.retellings) {
    validateErrataSerial(row.id, 'retelling');
    const fact = errataSources.get(row.sourceEventId);
    if (!fact || !actor.has(row.authorId) || row.tick < fact.tick || row.tick > w.tick ||
        row.tick >= fact.tick + CHRONICLE_ERRATA_WINDOW || row.reading.kind !== fact.kind ||
        (fact.kind === 'duel' && row.reading.kind === 'duel' && !fact.participantIds.includes(row.reading.winnerId))) fail('chronicleErrata.retellings.provenance');
    const claims = errataClaims.get(row.sourceEventId) ?? [];
    if (claims.length >= CHRONICLE_ERRATA_MAX_RETELLINGS) fail('chronicleErrata.retellings.count');
    claims.push(row); errataClaims.set(row.sourceEventId, claims);
  }
  unique(w.chronicleErrata.corrections, ({ sourceEventId }) => sourceEventId, 'chronicleErrata.corrections.once');
  for (const row of w.chronicleErrata.corrections) {
    validateErrataSerial(row.id, 'correction');
    const fact = errataSources.get(row.sourceEventId);
    const claims = errataClaims.get(row.sourceEventId) ?? [];
    const ids = new Set(row.contestedRetellingIds);
    if (!fact || !actor.has(row.editorId) || row.tick < fact.tick || row.tick > w.tick || row.tick >= fact.tick + CHRONICLE_ERRATA_WINDOW ||
        (fact.kind === 'duel' ? fact.participantIds.includes(row.editorId) : fact.actorId === row.editorId) ||
        row.reading.kind !== fact.kind || errataKey(row.reading) !== (fact.kind === 'duel' ? fact.winnerId : 'full_supplies') ||
        ids.size !== claims.length || ids.size !== row.contestedRetellingIds.length ||
        new Set(claims.map(({ reading }) => errataKey(reading))).size < 2 ||
        claims.some((claim) => claim.authorId === row.editorId || claim.tick >= row.tick || !ids.has(claim.id))) fail('chronicleErrata.corrections.provenance');
  }
  unique(w.pilgrimages.journeys, ({ id }) => id, 'pilgrimages.journeys.id');
  const reservedPilgrims = new Set<string>();
  const pilgrimageSites = new Map(w.locations.map((site) => [site.id, site]));
  for (const row of w.pilgrimages.journeys) {
    const serial = Number(row.id.match(/^pilgrimage-([1-9][0-9]*)$/)?.[1]);
    const pending = row.status === 'proposed';
    const active = row.status === 'active';
    const existing = pending || active;
    const started = row.startedTick !== undefined && row.expiresTick !== undefined;
    const moving = row.path.length > 0;
    const validReason = row.status === 'withdrawn' ? row.reason === 'withdrawn' :
      row.status === 'declined' ? row.reason === 'declined' :
      row.status === 'interrupted' ? row.reason === 'member_missing' || row.reason === 'lost_site' :
      row.status === 'expired' ? row.reason === (started ? 'journey_expiry' : 'offer_expiry') : row.reason === undefined;
    if (!Number.isSafeInteger(serial) || serial >= w.pilgrimages.nextId ||
        row.stopIds.length !== 3 || new Set(row.stopIds).size !== 3 ||
        row.organizerId === row.companionId || !actor.has(row.organizerId) || !actor.has(row.companionId) ||
        row.proposedTick > w.tick || row.offerExpiresTick !== row.proposedTick + PILGRIMAGE_OFFER_TICKS ||
        ((row.startedTick === undefined) !== (row.expiresTick === undefined)) ||
        (started && (row.startedTick! < row.proposedTick || row.startedTick! >= row.offerExpiresTick ||
          row.expiresTick !== row.startedTick! + PILGRIMAGE_ACTIVE_TICKS || row.startedTick! > w.tick)) ||
        (existing !== (row.settledTick === undefined)) ||
        (row.settledTick !== undefined && (row.settledTick > w.tick || row.settledTick < (row.startedTick ?? row.proposedTick))) ||
        !validReason || (active && (!started || row.expiresTick! <= w.tick)) ||
        (pending && (started || row.offerExpiresTick <= w.tick)) ||
        (row.status === 'declined' && started) ||
        (row.status === 'completed' ? !started || row.legIndex !== 2 : row.legIndex > 1) ||
        (row.status === 'expired' && row.settledTick! < (started ? row.expiresTick! : row.offerExpiresTick)) ||
        (existing && row.stopIds.some((id) => !pilgrimageSites.has(id) || pilgrimageSites.get(id)?.type === 'secret_realm'))) fail('pilgrimages.journeys.references');
    if (existing) {
      for (const memberId of [row.organizerId, row.companionId]) {
        if (reservedPilgrims.has(memberId)) fail('pilgrimages.journeys.membership');
        reservedPilgrims.add(memberId);
      }
    }
    if (active && [row.organizerId, row.companionId].some((id) => !w.cultivators.some((member) =>
      member.id === id && member.alive && member.hp > 0 && member.locationId === row.stopIds[row.legIndex]))) fail('pilgrimages.journeys.occupants');
    if (row.stopsVisited.length !== (started ? row.legIndex + 1 : 0) || (!started && row.legIndex !== 0) ||
        row.stopsVisited.some((stop, index) => stop.locationId !== row.stopIds[index] ||
          (index === 0 ? stop.tick !== row.startedTick : stop.tick <= row.stopsVisited[index - 1].tick) ||
          stop.tick >= (row.expiresTick ?? 0) || stop.tick > (row.settledTick ?? w.tick))) fail('pilgrimages.journeys.arrivals');
    const launched = row.spentByEach / PILGRIMAGE_LEG_COST;
    if (!Number.isInteger(launched) || launched < row.legIndex || launched > row.legIndex + 1 ||
        (!started && launched !== 0) || (active && launched !== row.legIndex + Number(moving)) ||
        (row.status === 'withdrawn' && launched !== row.legIndex) ||
        (Boolean(launched) !== (row.lastMovedTick !== undefined)) ||
        (row.lastMovedTick !== undefined && (row.lastMovedTick <= (row.startedTick ?? Infinity) ||
          row.lastMovedTick < (row.stopsVisited.at(-1)?.tick ?? 0) ||
          row.lastMovedTick > (row.settledTick ?? w.tick) || row.lastMovedTick >= (row.expiresTick ?? 0)))) fail('pilgrimages.journeys.spend');
    if (moving) {
      const origin = pilgrimageSites.get(row.stopIds[row.legIndex]);
      const dest = pilgrimageSites.get(row.stopIds[row.legIndex + 1]);
      const first = row.path[0], last = row.path.at(-1);
      if (!active || !origin || !dest || !last || row.path.length < 3 || row.pathIndex < 1 || row.pathIndex >= row.path.length - 1 ||
          first.x !== origin.x || first.y !== origin.y || last.x !== dest.x || last.y !== dest.y) fail('pilgrimages.journeys.path');
      const tilePath = row.path.map((point) => terrainTileAt(w, point.x, point.y));
      if (tilePath.some((tile, index) => {
        const earlier = tilePath[index - 1];
        return !tile || (index > 0 && (!earlier || Math.abs(tile.col - earlier.col) + Math.abs(tile.row - earlier.row) > 1));
      })) fail('pilgrimages.journeys.path_tile');
    } else if (row.pathIndex !== 0) fail('pilgrimages.journeys.path_index');
    unique(row.aid, ({ giverId, locationId }) => JSON.stringify([giverId, locationId]), 'pilgrimages.journeys.aid_once');
    if (row.aid.some((given) => {
      const hit = row.stopsVisited.findIndex(({ locationId }) => locationId === given.locationId);
      const nextArrival = row.stopsVisited[hit + 1];
      return !(given.giverId === row.organizerId && given.receiverId === row.companionId ||
        given.giverId === row.companionId && given.receiverId === row.organizerId) ||
        hit < 0 || hit >= 2 || given.tick <= row.stopsVisited[hit].tick ||
        given.tick >= (row.expiresTick ?? 0) || given.tick > (row.settledTick ?? w.tick) ||
        Boolean(nextArrival && given.tick > nextArrival.tick);
    })) fail('pilgrimages.journeys.aid_references');
    const camps = row.camps ?? [];
    unique(camps, ({ legIndex }) => String(legIndex), 'pilgrimages.journeys.camp_leg_once');
    for (const camp of camps) {
      const reached = row.stopsVisited[camp.legIndex];
      const following = row.stopsVisited[camp.legIndex + 1];
      const at = terrainTileAt(w, camp.point.x, camp.point.y);
      const closed = camp.closedTick;
      const ready = camp.openedTick + 1;
      const activePoint = row.path[camp.pathIndex];
      const recovery = camp.recovery ?? [];
      unique(recovery, ({ actorId }) => actorId, 'pilgrimages.journeys.camp_recovered_once');
      if (!started || !reached || at?.id !== camp.tileId || camp.payerId !== row.organizerId ||
          launched <= camp.legIndex || camp.openedTick <= reached.tick || camp.openedTick > w.tick ||
          ready >= (row.expiresTick ?? 0) || (following && (closed === undefined || following.tick < closed)) ||
          (camp.status === 'pitched' && (!active || closed !== undefined || w.tick > ready || row.legIndex !== camp.legIndex ||
            row.pathIndex !== camp.pathIndex || activePoint?.x !== camp.point.x || activePoint?.y !== camp.point.y ||
            (row.lastMovedTick ?? Infinity) >= camp.openedTick)) ||
          (camp.status !== 'pitched' && (closed === undefined || closed < camp.openedTick || closed > (row.settledTick ?? w.tick))) ||
          ((camp.status === 'resumed' || camp.status === 'dismantled') && closed !== ready) ||
          (camp.status === 'expired' && (closed ?? 0) <= ready) ||
          (camp.status === 'resumed' && (row.lastMovedTick ?? 0) < ready) ||
          (camp.status !== 'resumed' && camp.recovery !== undefined) ||
          recovery.some(({ actorId }) => actorId !== row.organizerId && actorId !== row.companionId)) {
        fail('pilgrimages.journeys.camp_source');
      }
    }
  }
  unique(w.credit.loans, ({ id }) => id, 'credit.loans.id');
  unique(w.credit.loans.filter(({ status }) => status === 'offered' || status === 'active'),
    ({ borrowerSectId }) => borrowerSectId, 'credit.loans.active_borrower');
  unique(w.credit.restrictions, ({ sectId }) => sectId, 'credit.restrictions.sect');
  if (w.credit.restrictions.some(({ sectId }) => !sector.has(sectId))) fail('credit.restrictions.references');
  for (const loan of w.credit.loans) {
    const funded = loan.status === 'active' || loan.status === 'paid' || loan.status === 'defaulted';
    const closed = loan.status !== 'offered' && loan.status !== 'active';
    const serial = Number(loan.id.match(/^sect-credit-([1-9][0-9]*)$/)?.[1]);
    const paidByTick = new Map<number,number>();
    for (const row of loan.receipts) paidByTick.set(row.tick, (paidByTick.get(row.tick) ?? 0) + row.amount);
    if ([...paidByTick.values()].some((amount) => amount > SECT_CREDIT_PAYMENT_MAX)) fail('credit.loans.payment_tick');
    if (!Number.isSafeInteger(serial) || serial >= w.credit.nextId || loan.lenderSectId === loan.borrowerSectId ||
        !sector.has(loan.lenderSectId) || !sector.has(loan.borrowerSectId) || !actor.has(loan.lenderSignerId) ||
        !actor.has(loan.borrowerSignerId) || loan.lenderSignerId === loan.borrowerSignerId ||
        loan.openedTick > w.tick || loan.offerExpiresTick !== loan.openedTick + SECT_CREDIT_OFFER_TICKS ||
        funded !== (loan.fundedTick !== undefined) || funded !== (loan.dueTick !== undefined) ||
        funded !== (loan.collectionUntilTick !== undefined) || closed !== (loan.settledTick !== undefined) ||
        (loan.fundedTick !== undefined && (loan.fundedTick < loan.openedTick || loan.fundedTick > w.tick ||
          loan.fundedTick >= loan.offerExpiresTick || loan.dueTick !== loan.fundedTick + SECT_CREDIT_TERM_TICKS ||
          loan.collectionUntilTick !== loan.dueTick + SECT_CREDIT_COLLECTION_TICKS)) ||
        (loan.settledTick !== undefined && (loan.settledTick < (loan.fundedTick ?? loan.openedTick) || loan.settledTick > w.tick)) ||
        (loan.lastCollectionTick !== undefined && (loan.dueTick === undefined || loan.collectionUntilTick === undefined ||
          loan.lastCollectionTick < loan.dueTick || loan.lastCollectionTick >= loan.collectionUntilTick || loan.lastCollectionTick > w.tick)) ||
        loan.receipts.some((row) => loan.fundedTick === undefined || row.tick < loan.fundedTick || row.tick > w.tick ||
          (loan.settledTick !== undefined && row.tick > loan.settledTick) ||
          (row.kind === 'collection' && (loan.dueTick === undefined || loan.collectionUntilTick === undefined ||
            row.tick < loan.dueTick || row.tick >= loan.collectionUntilTick)))) fail('credit.loans.references');
    const paid = loan.receipts.reduce((sum,row) => sum + row.amount, 0);
    if (loan.principal !== SECT_CREDIT_PRINCIPAL || loan.paidTotal !== paid || loan.paidTotal + loan.writtenOff > loan.principal ||
        (!funded && (paid !== 0 || loan.writtenOff !== 0)) ||
        (loan.status === 'active' && paid >= loan.principal) ||
        (loan.status === 'paid' && paid !== loan.principal) ||
        (loan.status === 'defaulted' ? (loan.writtenOff <= 0 || loan.paidTotal + loan.writtenOff !== loan.principal)
          : loan.writtenOff !== 0)) fail('credit.loans.principal');
  }
  const sanctuaryIds = new Set<number>();
  const sanctuaryIndex = new Map(w.sanctuary.charters.map((charter) => [charter.id, charter]));
  const validSanctuarySerial = (id: string, kind: 'charter' | 'pass' | 'incident') => {
    const serial = Number(id.match(new RegExp(`^sanctuary-${kind}-([1-9][0-9]*)$`))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.sanctuary.nextId || sanctuaryIds.has(serial)) fail('sanctuary.nextId');
    sanctuaryIds.add(serial);
  };
  unique(w.sanctuary.charters.filter(({ status, expiresTick }) => status === 'active' && expiresTick > w.tick),
    ({ siteId }) => siteId, 'sanctuary.charters.active_site');
  unique(w.sanctuary.passes.filter(({ status, expiresTick }) => status === 'active' && expiresTick > w.tick),
    ({ actorId }) => actorId, 'sanctuary.passes.active_actor');
  unique(w.sanctuary.passes, ({ charterId, actorId }) => JSON.stringify([charterId,actorId]), 'sanctuary.passes.identity');
  for (const row of w.sanctuary.charters) {
    validSanctuarySerial(row.id, 'charter');
    if (!sector.has(row.sponsorSectId) || !actor.has(row.founderId) || (row.status === 'active' && !locations.has(row.siteId)) ||
        row.openedTick > w.tick || row.expiresTick !== row.openedTick + SANCTUARY_CHARTER_TICKS ||
        (row.status === 'ended') !== (row.endedTick !== undefined) || (row.endedTick !== undefined) !== (row.endReason !== undefined) ||
        (row.endedTick !== undefined && (row.endedTick < row.openedTick || row.endedTick > w.tick)) ||
        (row.lastRepairTick !== undefined && (row.lastRepairTick < row.openedTick || row.lastRepairTick > w.tick)) ||
        row.maxShieldHp !== SANCTUARY_MAX_SHIELD || row.shieldHp > row.maxShieldHp ||
        row.stonesSpent < SANCTUARY_FOUND_COST || (row.stonesSpent - SANCTUARY_FOUND_COST) % SANCTUARY_REPAIR_COST !== 0) fail('sanctuary.charters.references');
  }
  for (const row of w.sanctuary.passes) {
    validSanctuarySerial(row.id, 'pass');
    const charter = sanctuaryIndex.get(row.charterId);
    if (!charter || !actor.has(row.actorId) || row.issuedTick < charter.openedTick || row.issuedTick > w.tick ||
        row.expiresTick <= row.issuedTick || row.expiresTick !== Math.min(row.issuedTick + SANCTUARY_PASS_TICKS, charter.expiresTick) ||
        (row.status === 'ended') !== (row.endedTick !== undefined) || (row.endedTick !== undefined) !== (row.endReason !== undefined) ||
        (row.endedTick !== undefined && (row.endedTick < row.issuedTick || row.endedTick > w.tick))) fail('sanctuary.passes.references');
  }
  for (const row of w.sanctuary.incidents) {
    validSanctuarySerial(row.id, 'incident');
    const charter = sanctuaryIndex.get(row.charterId);
    if (!charter || !actor.has(row.aggressorId) || !actor.has(row.visitorId) || row.aggressorId === row.visitorId ||
        row.tick < charter.openedTick || row.tick > w.tick || row.sourceEventId !== `evt-${row.id}` ||
        row.shieldSpent !== (row.kind === 'blocked' ? SANCTUARY_BLOCK_HP : 0) ||
        row.karmaPenalty > SANCTUARY_KARMA_PENALTY) fail('sanctuary.incidents.references');
  }
  const bookmarkRows = w.annotations.bookmarks;
  const noteRows = w.annotations.notes;
  unique([...bookmarkRows,...noteRows], ({ id }) => id, 'annotations.id');
  unique(bookmarkRows, ({ eventId }) => eventId, 'annotations.bookmarks.eventId');
  const annotationSerials = new Set<number>();
  for (const item of [...bookmarkRows, ...noteRows]) {
    const prefix = 'eventId' in item ? 'bookmark' : 'annotation';
    const serial = Number(item.id.match(new RegExp(`^${prefix}-([1-9][0-9]*)$`))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.annotations.nextId || annotationSerials.has(serial)) fail('annotations.nextId');
    annotationSerials.add(serial);
  }
  const privateEvents = new Set(w.events.filter(({ witnessScope }) => witnessScope === 'participants').map(({ id }) => id));
  for (const row of bookmarkRows) if (row.eventTick > row.createdTick || row.createdTick > w.tick ||
      privateEvents.has(row.eventId) || /[\u0000-\u001f\u007f]/.test(row.title)) fail('annotations.bookmarks.references');
  for (const row of noteRows) if (!map.has(row.target.tileId) || row.createdTick > row.updatedTick ||
      row.updatedTick > w.tick || !row.text.trim() || /[\u0000-\u001f\u007f]/.test(row.text) ||
      (row.target.kind === 'site' && /[\u0000-\u001f\u007f]/.test(row.target.siteName))) fail('annotations.notes.references');
  if (w.scenarioOrigin && (w.scenarioOrigin.endTick > w.tick || !w.worldgen ||
      !/^scenario-[0-9a-f]{32}$/.test(w.scenarioOrigin.id))) fail('scenarioOrigin.references');
  if (Boolean(w.scenarioAudit) !== (w.scenarioOrigin?.version === 2)) fail('scenarioAudit.authority');
  if (w.scenarioAudit) {
    const { scenarioId, seed, profileId, evaluatedTick, cards } = w.scenarioAudit;
    if (!w.scenarioOrigin || scenarioId !== w.scenarioOrigin.id || evaluatedTick !== w.scenarioOrigin.endTick ||
        evaluatedTick > w.tick || seed !== w.random.seed || profileId !== w.worldgen?.profileId) fail('scenarioAudit.authority');
    try { normalizeScenarioObjectives(cards.map(({ objective }) => objective)); }
    catch { fail('scenarioAudit.objectives'); }
    for (const [index, card] of cards.entries()) {
      const { objective, evidence, passed } = card;
      if (card.id !== 'objective-' + (index + 1) || objective.kind !== evidence.kind) fail('scenarioAudit.cards.identity');
      if (passed !== scenarioObjectivePassed(objective, evidence)) fail('scenarioAudit.cards.verdict');
      if (evidence.kind === 'cultivator_survives' &&
          ((!evidence.found && (evidence.alive || evidence.hp !== 0)) || (evidence.alive && evidence.hp <= 0))) fail('scenarioAudit.cards.survival');
      if (evidence.kind === 'site_qi' && !evidence.found && evidence.qi !== 0) fail('scenarioAudit.cards.qi');
      if (evidence.kind === 'sect_treasury' &&
          (evidence.total !== evidence.atSite + evidence.inTransit || (!evidence.found && evidence.total !== 0))) fail('scenarioAudit.cards.treasury');
    }
  }
  if (w.worldgen) {
    const birthActors = unique(w.worldgen.resources, (item) => item.actorId, 'worldgen.resources.actorId');
    if (w.worldgen.seed !== w.random.seed || w.worldgen.birthTick > w.tick ||
        birthActors.size === 0 || w.worldgen.resources.some(({ actorId, locationId }) => !actor.has(actorId) || !locations.has(locationId))) {
      fail('worldgen.references');
    }
  }
  if (w.terrain.tiles.length !== w.terrain.columns * w.terrain.rows) fail('terrain.tiles.length');
  if (w.terrain.tiles.some((tile, index) => tile.col !== index % w.terrain.columns ||
      tile.row !== Math.floor(index / w.terrain.columns) || (tile.ownerSectId && !sector.has(tile.ownerSectId)))) fail('terrain.tiles.grid');
  for (const sect of w.sects) {
    if (!locations.has(sect.headquartersId) || sect.arrayHp > sect.arrayMaxHp ||
        (sect.leaderId && !w.cultivators.some((person) => person.id === sect.leaderId && person.sectId === sect.id))) fail('sects.references');
  }
  for (const site of w.locations) if (site.ownerSectId && !sector.has(site.ownerSectId)) fail('locations.ownerSectId');
  for (const person of w.cultivators) {
    if ((person.sectId && !sector.has(person.sectId)) || (person.alive && !locations.has(person.locationId)) || person.hp > person.maxHp ||
        (person.namedHeirId && (!actor.has(person.namedHeirId) || person.namedHeirId === person.id)) ||
        person.exploredTileIds.some((id) => !map.has(id)) || person.artifacts.some((art) => art.boundTo && !actor.has(art.boundTo))) fail('cultivators.references');
  }
  for (const edge of w.relationships) if (!actor.has(edge.fromId) || !actor.has(edge.toId) || edge.fromId === edge.toId) fail('relationships.references');
  for (const relation of w.diplomacy) if (!sector.has(relation.sectAId) || !sector.has(relation.sectBId) || relation.sectAId === relation.sectBId) fail('diplomacy.references');
  unique(w.diplomacy, (r) => [r.sectAId,r.sectBId].sort().join('|'), 'diplomacy.pairs');
  for (const siege of w.sieges) if (!sector.has(siege.attackerSectId) || !sector.has(siege.defenderSectId) ||
      siege.attackerSectId === siege.defenderSectId || siege.participantIds.some((id) => !actor.has(id))) fail('sieges.references');
  for (const tribute of w.tributeDemands) if (!sector.has(tribute.demanderSectId) || !sector.has(tribute.targetSectId) ||
      tribute.demanderSectId === tribute.targetSectId) fail('tributeDemands.references');
  for (const meeting of w.occasions) if (((meeting.status === 'registration' || meeting.status === 'running') && !locations.has(meeting.locationId)) ||
      meeting.participantIds.some((id) => !actor.has(id))) fail('occasions.references');
  for (const bounty of w.bounties) if (!actor.has(bounty.targetCultivatorId) || bounty.sponsorSectIds.some((id) => !sector.has(id)) ||
      bounty.escrow.some((item) => !sector.has(item.sectId)) || (bounty.hunterId && !actor.has(bounty.hunterId))) fail('bounties.references');
  unique(w.sieges, ({ id }) => id, 'sieges.id'); unique(w.tributeDemands, ({ id }) => id, 'tributeDemands.id');
  unique(w.ceasefires.agreements, ({ id }) => id, 'ceasefires.id');
  const liveAgreements = w.ceasefires.agreements.filter(({ status }) => status === 'offered' || status === 'active');
  const pairKey = (a: string, b: string) => JSON.stringify([a,b].sort());
  unique(liveAgreements, (item) => pairKey(item.proposerSectId, item.targetSectId), 'ceasefires.active.pair');
  const siegeById = new Map(w.sieges.map((siege) => [siege.id, siege]));
  for (const agreement of w.ceasefires.agreements) {
    const { terms, escrow } = agreement;
    const pair = new Set([agreement.proposerSectId, agreement.targetSectId]);
    const signed = agreement.status === 'active' || agreement.status === 'fulfilled' || agreement.status === 'breached';
    const resolved = agreement.status !== 'offered' && agreement.status !== 'active';
    const serial = Number(agreement.id.match(/^ceasefire-([1-9][0-9]*)$/)?.[1]);
    unique(agreement.withdrawnSiegeIds, (id) => id, 'ceasefires.withdrawal.ids');
    if (!Number.isSafeInteger(serial) || serial >= w.ceasefires.nextId || pair.size !== 2 ||
        [...pair].some((id) => !sector.has(id)) || !actor.has(agreement.proposerId) || !actor.has(agreement.targetLeaderId) ||
        agreement.proposerId === agreement.targetLeaderId || agreement.openedTick > w.tick || agreement.offerExpiresTick !== agreement.openedTick + CEASEFIRE_OFFER_TICKS ||
        !pair.has(terms.aidPayerSectId) || !pair.has(terms.aidRecipientSectId) || terms.aidPayerSectId === terms.aidRecipientSectId ||
        signed !== (agreement.signedTick !== undefined) || signed !== (agreement.endsTick !== undefined) ||
        (agreement.signedTick !== undefined && (agreement.signedTick < agreement.openedTick || agreement.signedTick > w.tick ||
          agreement.signedTick > agreement.offerExpiresTick || agreement.endsTick !== agreement.signedTick + terms.duration)) ||
        (agreement.aidReleasedTick !== undefined && (agreement.signedTick === undefined || agreement.endsTick === undefined ||
          agreement.aidReleasedTick < agreement.signedTick + CEASEFIRE_AID_DELAY || agreement.aidReleasedTick > w.tick ||
          (agreement.settledTick !== undefined && agreement.aidReleasedTick > agreement.settledTick))) ||
        (resolved !== (agreement.settledTick !== undefined)) ||
        (agreement.settledTick !== undefined && (agreement.settledTick < (agreement.signedTick ?? agreement.openedTick) || agreement.settledTick > w.tick)) ||
        (agreement.status === 'breached') !== (agreement.breach !== undefined) ||
        (agreement.breach !== undefined && (!pair.has(agreement.breach.offenderSectId) || agreement.breach.tick !== agreement.settledTick ||
          agreement.breach.forfeitedBond !== terms.bondPerSide)) ||
        (!signed && agreement.withdrawnSiegeIds.length > 0) ||
        agreement.withdrawnSiegeIds.some((id) => {
          const siege = siegeById.get(id);
          return siege && (siege.status !== 'withdrawn' || pairKey(siege.attackerSectId, siege.defenderSectId) !== pairKey(agreement.proposerSectId, agreement.targetSectId));
        })) fail('ceasefires.references');
    if (terms.duration !== CEASEFIRE_DURATION || terms.bondPerSide !== CEASEFIRE_BOND || terms.aidAmount < 30 || terms.aidAmount > 120 ||
        (agreement.status === 'active' ? (escrow.proposerBond !== terms.bondPerSide || escrow.targetBond !== terms.bondPerSide ||
          escrow.aid !== (agreement.aidReleasedTick === undefined ? terms.aidAmount : 0))
          : (escrow.proposerBond !== 0 || escrow.targetBond !== 0 || escrow.aid !== 0))) fail('ceasefires.escrow');
  }
  unique(w.occasions, ({ id }) => id, 'occasions.id'); unique(w.bounties, ({ id }) => id, 'bounties.id');
  unique(w.mapHazards, ({ id }) => id, 'mapHazards.id'); unique(w.spiritBeasts, ({ id }) => id, 'spiritBeasts.id');
  for (const item of w.mapHazards) if (!map.has(item.tileId) || item.expiresTick <= item.createdTick) fail('mapHazards.references');
  for (const beast of w.spiritBeasts) if ((beast.alive && !locations.has(beast.locationId)) || beast.hp > beast.maxHp ||
      (beast.tamedBy && !actor.has(beast.tamedBy))) fail('spiritBeasts.references');
  if ((w.playerAvatar.possessedId && !actor.has(w.playerAvatar.possessedId)) ||
      (w.playerAvatar.pendingOrder && w.playerAvatar.pendingOrder.actorId !== w.playerAvatar.possessedId) ||
      w.playerAvatar.transcript.some((entry) => !actor.has(entry.targetCultivatorId) || (entry.actorId && !actor.has(entry.actorId)))) fail('playerAvatar.references');
  unique(w.decisionTrace.records, ({id}) => id, 'decisionTrace.id');
  for (const row of w.decisionTrace.records) {
    unique(row.candidates, ({id}) => id, 'decisionTrace.candidateId');
    if (!actor.has(row.actorId) || row.tick > w.tick ||
        (row.chosenCandidateId && !row.candidates.some(({id,action}) => id === row.chosenCandidateId && action === row.chosenAction)) ||
        row.candidates.some((candidate) => candidate.targetCultivatorId && !actor.has(candidate.targetCultivatorId))) fail('decisionTrace.references');
  }
  unique(w.estates.entries, ({id}) => id, 'estates.id');
  unique(w.estates.entries, ({deceasedId}) => deceasedId, 'estates.deceasedId');
  const knownArtefacts = new Set(w.cultivators.flatMap((person) => person.artifacts.flatMap(({id}) => id ? [id] : [])));
  for (const estate of w.estates.entries) {
    if (!w.cultivators.some(({id,alive}) => id === estate.deceasedId && !alive) ||
        (estate.namedHeirId && !actor.has(estate.namedHeirId)) || (estate.beneficiaryId && !actor.has(estate.beneficiaryId)) ||
        (estate.sponsorSectId && !sector.has(estate.sponsorSectId)) || estate.closesTick < estate.openedTick ||
        estate.eligibleHeirs.some(({actorId}) => !actor.has(actorId) || actorId === estate.deceasedId) ||
        estate.claims.some(({actorId}) => !estate.eligibleHeirs.some((person) => person.actorId === actorId)) ||
        (estate.memorial && (!actor.has(estate.memorial.organizerId) || estate.memorial.attendeeIds.some((id) => !actor.has(id))))) fail('estates.references');
    unique(estate.eligibleHeirs, ({actorId}) => actorId, 'estates.eligibleHeirs');
    unique(estate.claims, ({actorId}) => actorId, 'estates.claims');
    for (const artifact of estate.holdings.artifacts) {
      if (artifact.id && knownArtefacts.has(artifact.id)) fail('estates.duplicate_asset');
      if (artifact.id) knownArtefacts.add(artifact.id);
    }
  }
  const factIds = unique(w.witnesses.facts, ({eventId}) => eventId, 'witnesses.facts.id');
  unique(w.witnesses.claims, ({id}) => id, 'witnesses.claims.id');
  for (const fact of w.witnesses.facts) {
    if (fact.participantIds.length !== 2 || new Set(fact.participantIds).size !== 2 ||
        !fact.participantIds.includes(fact.winnerId) || fact.participantIds.some((id) => !actor.has(id)) ||
        new Set(fact.witnessIds).size !== fact.witnessIds.length ||
        fact.witnessIds.some((id) => !actor.has(id) || fact.participantIds.includes(id))) fail('witnesses.facts.references');
  }
  for (const claim of w.witnesses.claims) {
    if (!actor.has(claim.claimantId) || !actor.has(claim.subjectId) ||
        (claim.settledTick === undefined && !factIds.has(claim.sourceEventId)) ||
        (claim.reputationSectId && !sector.has(claim.reputationSectId)) || claim.reputationRestored > claim.reputationPenalty ||
        (claim.appeal && claim.appeal.actorId !== claim.subjectId) ||
        new Set(claim.attestations.map(({ actorId }) => actorId)).size !== claim.attestations.length ||
        claim.attestations.some(({ actorId }) => !actor.has(actorId))) fail('witnesses.claims.references');
  }
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'witnesses')) {
    const historicalPrivate = new Set(w.events.filter(({ witnessScope }) => witnessScope === 'participants').map(({ id }) => `rumor-${id}`));
    for (const person of w.cultivators) for (const rumor of person.rumors) {
      if (historicalPrivate.has(rumor.id)) rumor.witnessScope = 'participants';
    }
  }
  unique(w.relocations.plans, ({ id }) => id, 'relocations.plans.id');
  unique(w.relocations.abandonedSites, ({ id }) => id, 'relocations.abandonedSites.id');
  const openRelocations = w.relocations.plans.filter(({ status }) => status === 'voting' || status === 'in_transit');
  unique(openRelocations, ({ sectId }) => sectId, 'relocations.active.sect');
  unique(openRelocations, ({ destinationId }) => destinationId, 'relocations.active.destination');
  for (const plan of w.relocations.plans) {
    const voterIds = unique(plan.voterIds, (id) => id, 'relocations.plans.voters');
    unique(plan.votes, ({ actorId }) => actorId, 'relocations.plans.votes');
    unique(plan.garrisonIds, (id) => id, 'relocations.plans.garrison');
    if (!sector.has(plan.sectId) || !locations.has(plan.originId) || !locations.has(plan.destinationId) || plan.originId === plan.destinationId ||
        !voterIds.has(plan.proposerId) || plan.voterIds.some((id) => !actor.has(id)) || plan.garrisonIds.some((id) => !actor.has(id)) ||
        plan.path.length < 2 || plan.pathIndex >= plan.path.length || plan.openedTick > w.tick || plan.deadlineTick <= plan.openedTick ||
        plan.votes.some((vote) => !voterIds.has(vote.actorId) || vote.tick < plan.openedTick || vote.tick > w.tick || vote.tick > plan.deadlineTick) ||
        (plan.departedTick !== undefined && (plan.departedTick < plan.openedTick || plan.departedTick > w.tick)) ||
        (plan.lastAdvancedTick !== undefined && (plan.lastAdvancedTick < (plan.departedTick ?? plan.openedTick) || plan.lastAdvancedTick > w.tick)) ||
        (plan.settledTick !== undefined && (plan.settledTick < (plan.departedTick ?? plan.openedTick) || plan.settledTick > w.tick)) ||
        ((plan.status === 'settled' || plan.status === 'aborted') !== (plan.settledTick !== undefined)) ||
        plan.spent !== (plan.departedTick !== undefined) ||
        (plan.status === 'voting' && plan.spent) || ((plan.status === 'in_transit' || plan.status === 'settled') && !plan.spent) ||
        (plan.status === 'settled' && plan.pathIndex !== plan.path.length - 1) ||
        (plan.status !== 'in_transit' && (plan.custody.stones !== 0 || plan.custody.pavilion.length > 0))) fail('relocations.plans.references');
  }
  for (const row of w.relocations.abandonedSites) {
    if (!sector.has(row.sectId) || !locations.has(row.originId) || !locations.has(row.destinationId) ||
        row.originId === row.destinationId || row.tick > w.tick || row.arrayHp > row.arrayMaxHp) fail('relocations.abandonedSites.references');
  }
  const { seasons, entries: competitionEntries, scores: competitionScores, honors: competitionHonors } = w.competitions;
  unique(w.competitions.optOutActorIds, (id) => id, 'competitions.optout.id');
  if (w.competitions.optOutActorIds.some((id) => !actor.has(id))) fail('competitions.optout.references');
  unique(seasons, ({ id }) => id, 'competitions.seasons.id');
  unique(seasons, ({ year }) => String(year), 'competitions.seasons.year');
  const seasonById = new Map(seasons.map((season) => [season.id, season]));
  const entryKey = ({ seasonId, actorId }: { seasonId: string; actorId: string }) => JSON.stringify([seasonId, actorId]);
  unique(competitionEntries, entryKey, 'competitions.entries.identity');
  unique(competitionScores, ({ id }) => id, 'competitions.scores.id');
  unique(competitionScores, ({ seasonId, actorId, sourceId, rule }) => JSON.stringify([seasonId, actorId, sourceId, rule]), 'competitions.scores.source');
  unique(competitionHonors, ({ id }) => id, 'competitions.honors.id');
  unique(competitionHonors, ({ seasonId }) => seasonId, 'competitions.honors.season');
  if (seasons.filter(({ status }) => status === 'open').length !== 1) fail('competitions.seasons.active');
  for (const season of seasons) if (season.openedTick > w.tick ||
      ((season.status === 'settled') !== (season.closedTick !== undefined)) ||
      (season.closedTick !== undefined && (season.closedTick < season.openedTick || season.closedTick > w.tick))) {
    fail('competitions.seasons.references');
  }
  const entryByIdentity = new Map(competitionEntries.map((entry) => [entryKey(entry), entry]));
  for (const entry of competitionEntries) {
    const season = seasonById.get(entry.seasonId);
    if (!season || !actor.has(entry.actorId) || entry.joinedTick < season.openedTick || entry.joinedTick > w.tick ||
        (season.closedTick !== undefined && entry.joinedTick >= season.closedTick) ||
        (entry.withdrawnTick !== undefined && (entry.withdrawnTick < entry.joinedTick || entry.withdrawnTick > w.tick ||
          (season.closedTick !== undefined && entry.withdrawnTick >= season.closedTick)))) fail('competitions.entries.references');
  }
  for (const row of competitionScores) {
    const entry = entryByIdentity.get(entryKey(row));
    const season = seasonById.get(row.seasonId);
    if (!entry || !season || row.tick <= entry.joinedTick || row.tick > w.tick ||
        (entry.withdrawnTick !== undefined && row.tick > entry.withdrawnTick) ||
        (season.closedTick !== undefined && row.tick >= season.closedTick) ||
        row.points !== COMPETITION_RULES[row.rule].points) fail('competitions.scores.references');
  }
  for (const honor of competitionHonors) {
    const season = seasonById.get(honor.seasonId);
    if (!actor.has(honor.actorId) || honor.awardedTick > w.tick ||
        (season && (season.status !== 'settled' || honor.awardedTick !== season.closedTick))) fail('competitions.honors.references');
  }
  unique(w.competitionReviews.proofs, ({ id }) => id, 'competitionReviews.proofs.id');
  unique(w.competitionReviews.proofs, ({ seasonId, sourceId, rule }) => JSON.stringify([seasonId, sourceId, rule]), 'competitionReviews.proofs.source');
  unique(w.competitionReviews.cases, ({ scoreId }) => scoreId, 'competitionReviews.cases.score');
  unique(w.competitionReviews.corrections, ({ scoreId }) => scoreId, 'competitionReviews.corrections.score');
  unique(w.competitionReviews.honorChanges, ({ seasonId }) => seasonId, 'competitionReviews.honorChanges.season');
  const reviewProofs = new Map(w.competitionReviews.proofs.map((proof) => [proof.id, proof]));
  const scoreById = new Map(competitionScores.map((row) => [row.id, row]));
  const reviewCases = new Map(w.competitionReviews.cases.map((row) => [row.scoreId, row]));
  const originalHonors = new Map(competitionHonors.map((row) => [row.id, row]));
  const reviewCorrections = new Set(w.competitionReviews.corrections.map(({ scoreId }) => scoreId));
  const retainedRelief = new Map(w.settlements.records.map((row) => [row.id, row]));
  const retainedTournaments = new Map(w.occasions.map((row) => [row.id, row]));
  const stageCounts = new Map<string, number>();
  const pinnedWinners = new Set(w.competitionReviews.corrections.filter(({ newActorId }) => !!newActorId).map(({ proofId }) => proofId));
  if (pinnedWinners.size !== w.competitionReviews.corrections.filter(({ newActorId }) => !!newActorId).length)
    fail('competitionReviews.corrections.oneAward');
  for (const proof of w.competitionReviews.proofs) {
    const current = seasons.find(({ id }) => id === proof.seasonId);
    if (!current || proof.tick < current.openedTick || proof.tick >= (current.closedTick ?? Infinity) || proof.tick > w.tick ||
        !actor.has(proof.actorId) || !locations.has(proof.locationId) || proof.id !== seasonReviewProofId(proof.rule, proof.sourceId, proof.seasonId)) fail('competitionReviews.proofs.references');
    if (proof.rule === 'public_relief') {
      const historic = retainedRelief.get(proof.sourceId);
      if (!proof.settlementId || proof.stones !== SETTLEMENT_RELIEF.stones || proof.herbs !== SETTLEMENT_RELIEF.jade_leaf ||
          'occasionId' in proof || 'championRound' in proof || 'competitiveWinRound' in proof || 'opponentId' in proof ||
          !villagers.has(proof.settlementId) ||
          w.settlements.villages.find(({ id }) => id === proof.settlementId)?.locationId !== proof.locationId ||
          (historic && (historic.kind !== 'relief' || historic.settlementId !== proof.settlementId ||
            historic.stones !== proof.stones || historic.herbs !== proof.herbs || historic.actorId !== proof.actorId || historic.tick !== proof.tick)))
        fail('competitionReviews.proofs.relief');
    } else {
      const actual = retainedTournaments.get(proof.occasionId);
      if (!proof.occasionId || proof.sourceId !== `${proof.occasionId}:champion` || !proof.opponentId ||
          !actor.has(proof.opponentId) || proof.opponentId === proof.actorId ||
          proof.championRound < 1 || proof.competitiveWinRound < 1 || proof.competitiveWinRound > proof.championRound ||
          'settlementId' in proof || 'stones' in proof || 'herbs' in proof ||
          (actual && (actual.kind !== 'tournament' || actual.status !== 'completed' || actual.lastResolvedTick !== proof.tick ||
            actual.championId !== proof.actorId || actual.locationId !== proof.locationId || actual.round !== proof.championRound ||
            !actual.bouts.some(({ winnerId, firstId, secondId, round }) => winnerId === proof.actorId &&
              round === proof.competitiveWinRound && [firstId, secondId].includes(proof.opponentId) &&
              [firstId, secondId].includes(proof.actorId))))) fail('competitionReviews.proofs.tournament');
    }
  }
  for (const row of w.competitionReviews.cases) {
    const season = seasons.find(({ id }) => id === row.seasonId);
    const score = scoreById.get(row.scoreId);
    const proof = reviewProofs.get(row.proofId);
    const separate = (stageCounts.get(row.seasonId) ?? 0) + 1;
    stageCounts.set(row.seasonId, separate);
    if (!season || season.closedTick === undefined || separate > SEASON_REVIEW_CASE_LIMIT ||
        !score || !proof || score.seasonId !== row.seasonId || proof.seasonId !== row.seasonId ||
        score.sourceId !== proof.sourceId || score.rule !== proof.rule || row.id !== `review-${row.scoreId}` ||
        !competitionEntries.some((entry) => entry.seasonId === row.seasonId && entry.actorId === row.applicantId && entry.withdrawnTick === undefined) ||
        row.openedTick < season.closedTick || row.openedTick >= season.closedTick + SEASON_REVIEW_WINDOW || row.openedTick > w.tick ||
        (row.status === 'pending' ? row.closedTick !== undefined :
          row.closedTick === undefined || row.closedTick < season.closedTick + SEASON_REVIEW_WINDOW || row.closedTick > w.tick) ||
        (row.status === 'corrected') !== reviewCorrections.has(row.scoreId)) fail('competitionReviews.cases.references');
  }
  for (const correction of w.competitionReviews.corrections) {
    const original = scoreById.get(correction.scoreId);
    const proof = reviewProofs.get(correction.proofId);
    const review = reviewCases.get(correction.scoreId);
    if (!original || !proof || !review || review.proofId !== proof.id || review.closedTick !== correction.tick ||
        original.actorId !== correction.previousActorId || original.seasonId !== correction.seasonId || original.points !== correction.points ||
        (correction.reason === 'wrong_recipient' ? correction.newActorId !== proof.actorId || correction.newActorId === original.actorId ||
          !competitionEntries.some((entry) => entry.seasonId === correction.seasonId && entry.actorId === correction.newActorId &&
            entry.joinedTick < proof.tick && (entry.withdrawnTick === undefined || entry.withdrawnTick > proof.tick)) :
          correction.newActorId !== undefined)) fail('competitionReviews.corrections.references');
  }
  for (const adjustment of w.competitionReviews.honorChanges) {
    const original = originalHonors.get(adjustment.originalHonorId);
    const stillKnown = seasons.some(({ id }) => id === adjustment.seasonId);
    const expected = stillKnown ? publicCompetitionStandings(w, adjustment.seasonId).find(({ rank }) => rank === 1) : undefined;
    if (!original || original.seasonId !== adjustment.seasonId || original.actorId !== adjustment.previousActorId ||
        adjustment.tick < original.awardedTick + SEASON_REVIEW_WINDOW || adjustment.tick > w.tick ||
        (adjustment.newActorId ? !actor.has(adjustment.newActorId) || adjustment.score === undefined || adjustment.score <= 0
          : adjustment.score !== undefined) ||
        (stillKnown && (expected?.actorId !== adjustment.newActorId || expected?.score !== adjustment.score ||
          !w.competitionReviews.corrections.some(({ seasonId, tick }) =>
            seasonId === adjustment.seasonId && tick === adjustment.tick)))) fail('competitionReviews.honorChanges.references');
  }

  unique(w.scriptures.originals, ({ id }) => id, 'scriptures.originals.id');
  unique(w.scriptures.editions, ({ id }) => id, 'scriptures.editions.id');
  unique(w.scriptures.editions.filter(({ kind }) => kind !== 'corrected'),
    ({ originalId, authorId }) => JSON.stringify([originalId, authorId]), 'scriptures.editions.annotator');
  unique(w.scriptures.editions.filter(({ kind }) => kind === 'corrected'),
    ({ parentEditionId }) => parentEditionId ?? '', 'scriptures.editions.correction');
  const originalById = new Map(w.scriptures.originals.map((original) => [original.id, original]));
  const editionById = new Map(w.scriptures.editions.map((edition) => [edition.id, edition]));
  for (const original of w.scriptures.originals) {
    if (original.id !== original.technique.id || original.firstSeenTick > w.tick ||
        (original.technique.createdTick !== undefined && original.technique.createdTick > original.firstSeenTick) ||
        (original.technique.authorId && !actor.has(original.technique.authorId)) ||
        (original.sourceSectId && !sector.has(original.sourceSectId))) fail('scriptures.originals.references');
  }
  for (const edition of w.scriptures.editions) {
    const original = originalById.get(edition.originalId);
    const parent = edition.parentEditionId ? editionById.get(edition.parentEditionId) : undefined;
    if (!original || !actor.has(edition.authorId) || edition.createdTick > w.tick || edition.createdTick < original.firstSeenTick ||
        (edition.kind === 'corrected' && (!parent || parent.id === edition.id || parent.originalId !== original.id ||
          parent.kind !== 'misread' || parent.createdTick > edition.createdTick || !edition.evidence)) ||
        (edition.kind !== 'corrected' && (edition.parentEditionId !== undefined || edition.evidence !== undefined)) ||
        (edition.evidence && (edition.evidence.locationId !== edition.locationId ||
          (edition.evidence.kind === 'pavilion') !== (edition.evidence.sectId !== undefined))) ||
        (edition.evidence?.sectId && !sector.has(edition.evidence.sectId))) fail('scriptures.editions.references');
  }
  for (const person of w.cultivators) if (person.activeEdition) {
    const active = person.activeEdition;
    const edition = editionById.get(active.editionId);
    const original = originalById.get(active.originalId)?.technique;
    if (!edition || !original || active.originalId !== person.technique.id || edition.originalId !== active.originalId ||
        edition.kind !== active.kind || original.name !== person.technique.name || original.spiritRoot !== person.technique.spiritRoot ||
        original.authorId !== person.technique.authorId || original.createdTick !== person.technique.createdTick) {
      fail('scriptures.active.references');
    }
  }
  unique(w.research.projects, ({ id }) => id, 'research.projects.id');
  unique(w.research.projects.filter(({ status }) => status === 'open'), ({ sectId }) => sectId, 'research.projects.active');
  unique(w.research.projects.filter(({ status }) => status === 'completed'),
    ({ sectId, topic }) => JSON.stringify([sectId, topic]), 'research.projects.discovery');
  for (const project of w.research.projects) {
    unique(project.contributors, ({ actorId }) => actorId, 'research.projects.contributors');
    const serial = Number(project.id.match(/^research-([1-9][0-9]*)$/)?.[1]);
    const completed = project.status === 'completed';
    if (!Number.isSafeInteger(serial) || serial >= w.research.nextId || !sector.has(project.sectId) || !actor.has(project.proposerId) ||
        !locations.has(project.locationId) || project.startedTick > w.tick || project.deadlineTick !== project.startedTick + RESEARCH_PROJECT_TICKS ||
        (project.status === 'open') === (project.settledTick !== undefined) ||
        (project.settledTick !== undefined && (project.settledTick < project.startedTick || project.settledTick > w.tick)) ||
        completed !== (project.discoveryTechniqueId !== undefined) || completed !== (project.discoveryLocationId !== undefined) ||
        (completed && (project.discoveryTechniqueId !== researchTechniqueId(project.sectId, project.topic) ||
          !originalById.has(project.discoveryTechniqueId ?? '') || !locations.has(project.discoveryLocationId!) ||
          project.contributors.filter(({ workTurns }) => workTurns > 0).length < RESEARCH_REQUIRED_RESEARCHERS ||
          project.contributors.reduce((total, row) => total + row.workTurns, 0) < RESEARCH_REQUIRED_TURNS))) fail('research.projects.references');
    for (const row of project.contributors) {
      const held = project.status === 'open' && row.withdrawnTick === undefined;
      if (!actor.has(row.actorId) || row.joinedTick < project.startedTick || row.joinedTick >= project.deadlineTick || row.joinedTick > w.tick ||
          (row.workTurns > 0) !== (row.lastWorkedTick !== undefined) ||
          (row.lastWorkedTick !== undefined && (row.lastWorkedTick <= row.joinedTick || row.lastWorkedTick >= project.deadlineTick || row.lastWorkedTick > w.tick)) ||
          (row.withdrawnTick !== undefined) !== (row.withdrawReason !== undefined) ||
          (row.withdrawnTick !== undefined && (row.withdrawnTick < (row.lastWorkedTick ?? row.joinedTick) || row.withdrawnTick > w.tick))) {
        fail('research.projects.work');
      }
      if (row.spent.stones !== row.workTurns * RESEARCH_WORK_COST.stones || row.spent.earthRoots !== row.workTurns * RESEARCH_WORK_COST.earthRoots ||
          (held ? (row.escrow.stones + row.spent.stones !== RESEARCH_DEPOSIT.stones || row.escrow.earthRoots + row.spent.earthRoots !== RESEARCH_DEPOSIT.earthRoots)
            : (row.escrow.stones !== 0 || row.escrow.earthRoots !== 0))) fail('research.projects.escrow');
    }
  }
  const fragmentById = new Map(w.relics.fragments.map((fragment) => [fragment.id, fragment]));
  unique(w.relics.fragments, ({ id }) => id, 'relics.fragments.id');
  const estateIds = new Set(w.estates.entries.map(({ id }) => id));
  unique(w.relicExhibits.entries, ({ id }) => id, 'relicExhibits.entries.id');
  unique(w.relicExhibits.entries.filter(({ status }) => status !== 'closed'),
    ({ artifactId }) => artifactId, 'relicExhibits.entries.openArtifact');
  const displays = w.relicExhibits.entries.filter(({ status }) => status === 'on_display');
  unique(displays, ({ siteId }) => siteId, 'relicExhibits.entries.activeSite');
  for (const entry of w.relicExhibits.entries) {
    const serial = Number(entry.id.match(/^exhibit-([1-9][0-9]*)$/)?.[1]);
    const accepted = entry.acceptedTick, closed = entry.closedTick;
    if (!Number.isSafeInteger(serial) || serial >= w.relicExhibits.nextId ||
        !actor.has(entry.ownerId) || !actor.has(entry.hostLeaderId) || entry.ownerId === entry.hostLeaderId ||
        !sector.has(entry.hostSectId) || entry.offeredTick > w.tick ||
        entry.offerExpiresTick !== entry.offeredTick + RELIC_EXHIBIT_OFFER_TICKS ||
        (entry.status !== 'closed' && (closed !== undefined || entry.closeReason !== undefined || !locations.has(entry.siteId))) ||
        (entry.status === 'closed' && (closed === undefined || !entry.closeReason || closed > w.tick || closed < (accepted ?? entry.offeredTick))) ||
        (entry.status === 'offered' && accepted !== undefined) ||
        (accepted === undefined ? entry.expiresTick !== undefined :
          accepted < entry.offeredTick || accepted >= entry.offerExpiresTick || accepted > w.tick ||
          entry.expiresTick !== accepted + RELIC_EXHIBIT_DURATION) ||
        (entry.status === 'on_display' ? (accepted === undefined || !entry.custody || entry.custody.id !== entry.artifactId ||
          entry.custody.relicSetId !== entry.setId || (entry.custody.boundTo && entry.custody.boundTo !== entry.ownerId)) :
          entry.custody !== undefined) ||
        (entry.closeReason === 'offer_expired' && (accepted !== undefined || (closed ?? 0) < entry.offerExpiresTick)) ||
        (entry.closeReason === 'term_complete' && (accepted === undefined || (closed ?? 0) < (entry.expiresTick ?? Infinity))) ||
        ((entry.closeReason === 'declined' || entry.closeReason === 'withdrawn' || entry.closeReason === 'item_unavailable') && accepted !== undefined) ||
        ((entry.closeReason === 'recalled' || entry.closeReason === 'host_closed') && accepted === undefined)) fail('relicExhibits.entries.references');
  }
  const exhibitItems = displays.flatMap(({ custody }) => custody ? [custody] : []);
  const canonicalArtifacts = [...w.cultivators.flatMap((person) => person.artifacts),
    ...w.estates.entries.flatMap((estate) => estate.holdings.artifacts), ...exhibitItems];
  validateArtifactSalvageHistory(w, canonicalArtifacts, actor, fail);
  const displayIds = new Set(displays.map(({ artifactId }) => artifactId));
  unique(canonicalArtifacts.filter((item) => item.id && displayIds.has(item.id)), (item) => item.id!, 'relicExhibits.custody.unique');
  const relicArtifacts = new Set<string>();
  const usedFragments = new Set<string>();
  for (const item of canonicalArtifacts) {
    if (item.relicSetId === undefined && item.relicFragmentIds === undefined) continue;
    const [frame, core] = item.relicFragmentIds ?? [];
    if (!item.relicSetId || !item.id || !frame || !core || frame === core || relicArtifacts.has(item.id) ||
        usedFragments.has(frame) || usedFragments.has(core)) return fail('relics.artifact.references');
    for (const [fragmentId, slot] of [[frame, 'frame'], [core, 'core']] as const) {
      const fragment = fragmentById.get(fragmentId);
      if (!fragment || fragment.slot !== slot || fragment.setId !== item.relicSetId ||
          fragment.holder.kind !== 'consumed' || fragment.holder.id !== item.id) fail('relics.artifact.parts');
      usedFragments.add(fragmentId);
    }
    relicArtifacts.add(item.id);
  }
  const expeditionProofs = new Set<string>();
  for (const fragment of w.relics.fragments) {
    const { source, holder } = fragment;
    if (source.tick > w.tick ||
        (source.kind === 'wild_cache' && (!locations.has(source.locationId) || source.eventId !== undefined || source.occasionId !== undefined)) ||
        (holder.kind === 'site' && !locations.has(holder.id)) ||
        (holder.kind === 'actor' && !actor.has(holder.id)) ||
        (holder.kind === 'estate' && !estateIds.has(holder.id)) ||
        (holder.kind === 'consumed' && (!relicArtifacts.has(holder.id) || !usedFragments.has(fragment.id)))) fail('relics.fragments.references');
    if (source.kind === 'expedition') {
      if (!source.eventId || !source.occasionId || expeditionProofs.has(source.eventId)) return fail('relics.fragments.provenance');
      expeditionProofs.add(source.eventId);
    }
  }
  const doctrineSchoolById = new Map(w.doctrines.schools.map((school) => [school.id, school]));
  unique(w.doctrines.schools, ({ id }) => id, 'doctrines.schools.id');
  unique(w.doctrines.schools, ({ parentSectId, theme }) => JSON.stringify([parentSectId, theme]), 'doctrines.schools.theme');
  unique(w.doctrines.endorsements, ({ actorId }) => actorId, 'doctrines.endorsements.actorId');
  unique(w.doctrines.proposals, ({ id }) => id, 'doctrines.proposals.id');
  unique(w.doctrines.proposals.filter(({ status }) => status === 'pending'), ({ schoolId }) => schoolId, 'doctrines.proposals.pending');
  unique(w.doctrines.records, ({ id }) => id, 'doctrines.records.id');
  const doctrineSequence = new Set<number>();
  for (const row of [...w.doctrines.proposals, ...w.doctrines.records]) {
    const prefix = 'votes' in row ? 'proposal' : 'record';
    const serial = Number(row.id.match(new RegExp(`^doctrine-${prefix}-([1-9][0-9]*)$`))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.doctrines.nextId || doctrineSequence.has(serial)) fail('doctrines.nextId');
    doctrineSequence.add(serial);
  }
  const doctrineMembers = new Set<string>();
  for (const school of w.doctrines.schools) {
    if (!sector.has(school.parentSectId) || !actor.has(school.founderId) ||
        (school.stewardId && (!actor.has(school.stewardId) || !school.memberIds.includes(school.stewardId))) || school.foundedTick > w.tick ||
        (school.lastChangeTick !== undefined && (school.lastChangeTick < school.foundedTick || school.lastChangeTick > w.tick)) ||
        (school.lastTrainingTick !== undefined && (school.lastTrainingTick < school.foundedTick || school.lastTrainingTick > w.tick)) ||
        (school.status !== 'autonomous' && (school.treasury !== 0 || school.memberIds.length !== 0))) fail('doctrines.schools.references');
    for (const member of school.memberIds) {
      if (!actor.has(member) || doctrineMembers.has(member)) fail('doctrines.schools.members');
      doctrineMembers.add(member);
    }
  }
  for (const row of w.doctrines.endorsements) {
    const school = doctrineSchoolById.get(row.schoolId);
    if (!actor.has(row.actorId) || !school || school.parentSectId !== row.sectId ||
        school.theme !== row.theme || row.tick < school.foundedTick || row.tick > w.tick) fail('doctrines.endorsements.references');
  }
  for (const row of w.doctrines.proposals) {
    const school = doctrineSchoolById.get(row.schoolId);
    unique(row.votes, ({ actorId }) => actorId, 'doctrines.proposals.vote');
    if (!school || row.openedTick < school.foundedTick || row.openedTick > w.tick || row.openedTick >= row.expiresTick ||
        !actor.has(row.stewardId) || !actor.has(row.leaderId) || row.stewardId === row.leaderId ||
        (row.status === 'pending') !== (row.settledTick === undefined) ||
        row.votes.length !== (row.status === 'accepted' || row.status === 'declined' ? 2 : 1) ||
        row.votes[0]?.verdict !== 'accept' ||
        (row.status === 'accepted' && row.votes[1]?.verdict !== 'accept') ||
        (row.status === 'declined' && row.votes[1]?.verdict !== 'decline') ||
        (row.settledTick !== undefined && (row.settledTick < row.openedTick || row.settledTick > w.tick)) ||
        row.votes.some((vote) => (vote.actorId !== row.stewardId && vote.actorId !== row.leaderId) ||
          vote.tick < row.openedTick || vote.tick > w.tick || vote.tick > row.expiresTick)) fail('doctrines.proposals.references');
  }
  for (const row of w.doctrines.records) if (!doctrineSchoolById.has(row.schoolId) || row.tick > w.tick ||
      row.actorIds.some((actorId) => !actor.has(actorId))) fail('doctrines.records.references');
  for (const village of w.settlements.villages) {
    // Older snapshots have the original numbered volunteers but no cohort metadata.
    if (village.nextVolunteerSequence === undefined) {
      const highest = village.volunteers.reduce((max, item) => {
        const ordinal = Number(item.id.match(/-vol-(\d+)$/)?.[1] ?? 0);
        return Number.isSafeInteger(ordinal) ? Math.max(max, ordinal) : max;
      }, 4);
      village.nextVolunteerSequence = highest + 1;
    }
    village.juvenileCohorts ??= [];
    if (village.juvenileCohorts.some(({ bornTick }) => bornTick > w.tick) ||
        village.juvenileCohorts.reduce((sum, group) => sum + group.count, 0) > village.population) fail('settlements.cohorts');
  }
  const settlementIds = unique(w.settlements.villages, ({id}) => id, 'settlements.villages.id');
  const volunteers = w.settlements.villages.flatMap((village) => village.volunteers);
  const volunteerIds = unique(volunteers, ({id}) => id, 'settlements.volunteers.id');
  unique(w.settlements.records, ({id}) => id, 'settlements.records.id');
  for (const village of w.settlements.villages) {
    if (!locations.has(village.locationId) || village.population > village.capacity ||
        village.volunteers.some((volunteer) => volunteer.enlistedCultivatorId &&
          (volunteer.enlistedCultivatorId !== `recruit-${volunteer.id}` || !actor.has(volunteer.enlistedCultivatorId)))) fail('settlements.villages.references');
  }
  for (const row of w.settlements.records) {
    if (!settlementIds.has(row.settlementId) || (row.targetSettlementId && !settlementIds.has(row.targetSettlementId)) ||
        (row.actorId && !actor.has(row.actorId)) || (row.sectId && !sector.has(row.sectId)) ||
        (row.volunteerId && !volunteerIds.has(row.volunteerId)) || (row.cultivatorId && !actor.has(row.cultivatorId))) fail('settlements.records.references');
  }
  unique(w.villageWorks.projects, ({ id }) => id, 'villageWorks.projects.id');
  unique(w.villageWorks.projects.filter(({ status }) => status === 'building'), ({ settlementId }) => settlementId,
    'villageWorks.projects.active_village');
  unique(w.villageWorks.projects.filter(({ status }) => status === 'completed'),
    ({ settlementId, kind }) => JSON.stringify([settlementId, kind]), 'villageWorks.projects.completed_kind');
  for (const project of w.villageWorks.projects) {
    const serial = Number(project.id.match(/^village-work-([1-9][0-9]*)$/)?.[1]);
    const rule = VILLAGE_WORK_RULES[project.kind];
    const complete = project.status === 'completed';
    const building = project.status === 'building';
    if (!Number.isSafeInteger(serial) || serial >= w.villageWorks.nextId || !sector.has(project.sponsorSectId) ||
        !actor.has(project.sponsorId) || project.startedTick > w.tick || project.deadlineTick !== project.startedTick + rule.ticks ||
        project.stonesSpent !== rule.stones || project.rootsSpent !== rule.roots ||
        (building !== (project.settledTick === undefined)) ||
        (building && (project.deadlineTick <= w.tick || !settlementIds.has(project.settlementId))) ||
        (project.settledTick !== undefined && (project.settledTick <= project.startedTick || project.settledTick > w.tick)) ||
        ((project.status === 'abandoned') !== (project.endReason !== undefined)) ||
        (project.endReason === 'deadline' && project.settledTick! < project.deadlineTick)) fail('villageWorks.projects.references');
    let total = 0, recent = project.startedTick;
    for (const row of project.receipts) {
      if (row.tick <= recent || row.tick >= project.deadlineTick || row.tick > (project.settledTick ?? w.tick) ||
          row.labor > Math.floor(row.adultsAvailable / VILLAGE_WORK_ADULTS_PER_LABOR)) fail('villageWorks.projects.labor_receipt');
      total += row.labor; recent = row.tick;
    }
    if (project.laborTotal !== total || total > rule.labor ||
        (project.receipts.at(-1)?.tick !== project.lastWorkedTick) ||
        (complete ? total !== rule.labor || project.settledTick !== project.lastWorkedTick : total >= rule.labor)) fail('villageWorks.projects.labor_total');
    if (complete ? project.capacityBefore === undefined || project.capacityAfter !== project.capacityBefore + rule.capacityGain :
        project.capacityBefore !== undefined || project.capacityAfter !== undefined) fail('villageWorks.projects.capacity');
  }
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'households')) initializeHouseholds(w);
  const groups = new Map(w.households.groups.map((row) => [row.id, row]));
  unique(w.households.groups, ({ id }) => id, 'households.groups.id');
  const residentCount = new Map<string, number>(), trackedAdults = new Map<string, number>();
  const canonicalCohorts = new Map<string, number>(), trackedCohorts = new Map<string, number>();
  const settlers = new Map(w.settlements.villages.map((row) => [row.id, row]));
  const actualPeople = new Map(w.cultivators.map((row) => [row.id, row]));
  const villageVolunteers = new Map(w.settlements.villages.flatMap((village) =>
    village.volunteers.map((person) => [person.id, { village, person }] as const)));
  for (const village of w.settlements.villages) for (const row of village.juvenileCohorts) {
    const key = JSON.stringify([village.id, row.bornTick]);
    canonicalCohorts.set(key, (canonicalCohorts.get(key) ?? 0) + row.count);
  }
  for (const group of w.households.groups) {
    if (!settlementIds.has(group.originSettlementId) || group.createdTick > w.tick ||
        group.id !== 'household-' + group.originSettlementId + '-' + group.branch ||
        !group.presences.some(({ settlementId }) => settlementId === group.originSettlementId)) fail('households.groups.references');
    unique(group.presences, ({ settlementId }) => settlementId, 'households.groups.presence');
    for (const row of group.presences) {
      if (!settlementIds.has(row.settlementId)) fail('households.presences.references');
      trackedAdults.set(row.settlementId, (trackedAdults.get(row.settlementId) ?? 0) + row.adults);
      unique(row.juvenileCohorts, ({ bornTick }) => String(bornTick), 'households.presences.cohort');
      for (const { bornTick, count } of row.juvenileCohorts) {
        const key = JSON.stringify([row.settlementId, bornTick]);
        const accounted = (trackedCohorts.get(key) ?? 0) + count;
        if (count < 1 || bornTick > w.tick || accounted > (canonicalCohorts.get(key) ?? 0)) fail('households.presences.cohort_budget');
        trackedCohorts.set(key, accounted);
      }
    }
  }
  unique(w.households.members, ({ volunteerId }) => volunteerId, 'households.members.volunteer');
  const recruitedMembers = new Map<string, typeof w.households.members[number]>();
  for (const row of w.households.members) {
    const group = groups.get(row.householdId);
    const actual = villageVolunteers.get(row.volunteerId);
    const recruit = row.recruitedId && actualPeople.get(row.recruitedId);
    const isRecruit = row.status === 'recruited' || row.status === 'deceased';
    if (!group?.presences.some(({ settlementId }) => settlementId === row.settlementId) ||
        row.registeredTick > w.tick || (row.status === 'resident') !== (row.settledTick === undefined) ||
        (row.settledTick !== undefined && (row.settledTick < row.registeredTick || row.settledTick > w.tick)) ||
        (isRecruit !== (row.recruitedId !== undefined)) ||
        (isRecruit && (!recruit || row.recruitedId !== 'recruit-' + row.volunteerId)) ||
        (row.status === 'resident' && (!actual || actual.village.id !== row.settlementId || actual.person.enlistedCultivatorId))) fail('households.members.references');
    if (row.status === 'resident') residentCount.set(row.settlementId, (residentCount.get(row.settlementId) ?? 0) + 1);
    if (row.recruitedId) {
      if (recruitedMembers.has(row.recruitedId)) fail('households.members.recruit');
      recruitedMembers.set(row.recruitedId, row);
    }
  }
  for (const [siteId, village] of settlers) {
    const currentYoung = village.juvenileCohorts.reduce((sum, cohort) => sum + cohort.count, 0);
    const currentNamed = village.volunteers.filter(({ enlistedCultivatorId }) => !enlistedCultivatorId).length;
    if ((trackedAdults.get(siteId) ?? 0) > Math.max(0, village.population - currentYoung - currentNamed) ||
        (residentCount.get(siteId) ?? 0) > currentNamed) fail('households.population_budget');
  }
  unique(w.households.guardianships, ({ id }) => id, 'households.guardianships.id');
  const guardianNext = new Map<string, string>();
  const activeWards = new Set<string>();
  for (const row of w.households.guardianships) {
    const serial = Number(row.id.match(/^household-guardian-([1-9][0-9]*)$/)?.[1]);
    const unsettled = row.status === 'offered' || row.status === 'active';
    const member = recruitedMembers.get(row.wardId);
    if (!Number.isSafeInteger(serial) || serial >= w.households.nextId || row.guardianId === row.wardId ||
        !actor.has(row.guardianId) || !actor.has(row.wardId) || member?.householdId !== row.householdId ||
        row.openedTick > w.tick || row.expiresTick !== row.openedTick + HOUSEHOLD_GUARDIAN_OFFER_TICKS ||
        ((row.status === 'active' || row.status === 'offered') !== (row.settledTick === undefined)) ||
        (row.status === 'active' && row.acceptedTick === undefined) ||
        (['offered','declined','expired'].includes(row.status) && row.acceptedTick !== undefined) ||
        (row.acceptedTick !== undefined && (row.acceptedTick < row.openedTick || row.acceptedTick >= row.expiresTick || row.acceptedTick > w.tick)) ||
        (row.status === 'offered' && row.expiresTick <= w.tick) ||
        (row.settledTick !== undefined && (row.settledTick < (row.acceptedTick ?? row.openedTick) || row.settledTick > w.tick)) ||
        (row.status === 'ended' ? row.endReason !== 'death' :
          row.status === 'expired' ? row.endReason !== 'expiry' || row.settledTick! < row.expiresTick :
          row.status === 'declined' ? row.endReason !== 'declined' :
          row.status === 'renounced' ? row.endReason !== 'renounced' : row.endReason !== undefined)) fail('households.guardianships.references');
    if (unsettled) {
      if (guardianNext.has(row.guardianId) || activeWards.has(row.wardId)) fail('households.guardianships.exclusivity');
      guardianNext.set(row.guardianId, row.wardId); activeWards.add(row.wardId);
    }
  }
  const verifiedGuardianPaths = new Set<string>();
  for (const start of guardianNext.keys()) {
    const path = new Set<string>();
    let current: string | undefined = start;
    while (current !== undefined && !verifiedGuardianPaths.has(current)) {
      if (path.has(current)) fail('households.guardianships.cycle');
      path.add(current);
      current = guardianNext.get(current);
    }
    for (const person of path) verifiedGuardianPaths.add(person);
  }
  const deceasedActors = new Set(w.cultivators.filter(({ alive, hp }) => !alive && hp === 0).map(({ id }) => id));
  unique(w.reincarnation.cases, ({ id }) => id, 'reincarnation.cases.id');
  unique(w.reincarnation.cases, ({ deceasedId }) => deceasedId, 'reincarnation.cases.deceased');
  const registeredCases = new Set<string>();
  const reservedBirths = new Set<string>();
  const reborn = new Set<string>();
  for (const row of w.reincarnation.cases) {
    const hasBirth = row.settlementId !== undefined || row.birthTick !== undefined ||
      row.maturesTick !== undefined || row.birthSlot !== undefined;
    if (!deceasedActors.has(row.deceasedId) || row.deathTick > w.tick || row.expiresTick <= row.deathTick ||
        ((row.status === 'recruited' || row.status === 'expired') !== (row.resolvedTick !== undefined)) ||
        (row.resolvedTick !== undefined && (row.resolvedTick < row.deathTick || row.resolvedTick > w.tick)) ||
        (row.status === 'awaiting_birth' && (hasBirth || row.volunteerId || row.newActorId)) ||
        ((row.status === 'reserved' || row.status === 'volunteer' || row.status === 'recruited') && !hasBirth) ||
        ((row.status === 'volunteer' || row.status === 'recruited') && !row.volunteerId) ||
        (row.status === 'reserved' && row.volunteerId) ||
        (row.volunteerId !== undefined && (!hasBirth || row.maturesTick === undefined || row.maturesTick > w.tick)) ||
        ((row.status === 'recruited') !== (row.newActorId !== undefined))) fail('reincarnation.cases.references');
    if (hasBirth) {
      if (!row.settlementId || !settlementIds.has(row.settlementId) || row.birthTick === undefined ||
          row.birthTick <= row.deathTick || row.birthTick > row.expiresTick || row.birthTick > w.tick ||
          row.maturesTick !== row.birthTick + MORTAL_MATURITY_TICKS || row.birthSlot === undefined) fail('reincarnation.cases.birth');
      const birthKey = JSON.stringify([row.settlementId, row.birthTick, row.birthSlot]);
      if (reservedBirths.has(birthKey)) fail('reincarnation.cases.birth');
      reservedBirths.add(birthKey);
    }
    if (row.volunteerId) {
      if (registeredCases.has(row.volunteerId) ||
          (row.status === 'volunteer' && !volunteerIds.has(row.volunteerId))) fail('reincarnation.cases.volunteer');
      registeredCases.add(row.volunteerId);
    }
    if (row.newActorId) {
      if (!actor.has(row.newActorId) || row.newActorId === row.deceasedId || row.newActorId !== `recruit-${row.volunteerId}` ||
          reborn.has(row.newActorId)) fail('reincarnation.cases.recruit');
      reborn.add(row.newActorId);
    }
  }
  unique(w.reincarnation.echoes, ({ actorId }) => actorId, 'reincarnation.echoes.actor');
  for (const row of w.reincarnation.echoes) if (!actor.has(row.actorId) || row.receivedTick > w.tick ||
      ((row.status === 'unconsidered') !== (row.resolvedTick === undefined)) ||
      (row.resolvedTick !== undefined && (row.resolvedTick < row.receivedTick || row.resolvedTick > w.tick))) fail('reincarnation.echoes.references');
  const marketLocations = new Set(w.locations.filter(({type}) => type === 'market').map(({id}) => id));
  const marketOrders = unique(w.markets.orders, ({id}) => id, 'markets.orders.id');
  unique(w.markets.shipments, ({id}) => id, 'markets.shipments.id');
  unique(w.markets.receipts, ({id}) => id, 'markets.receipts.id');
  for (const order of w.markets.orders) {
    if (!actor.has(order.actorId) || (order.status === 'open' && !marketLocations.has(order.locationId)) ||
        order.remaining > order.quantity || order.expiresTick <= order.placedTick ||
        order.escrowStones !== (order.status === 'open' && order.side === 'buy' ? order.remaining * order.limitPrice : 0) ||
        order.escrowGoods !== (order.status === 'open' && order.side === 'sell' ? order.remaining : 0)) fail('markets.orders.references');
  }
  for (const shipment of w.markets.shipments) {
    if (!actor.has(shipment.buyerId) || !actor.has(shipment.sellerId) || shipment.buyerId === shipment.sellerId ||
        shipment.originId === shipment.destinationId || shipment.arrivalTick <= shipment.departedTick ||
        (shipment.status === 'in_transit' && (!marketOrders.has(shipment.buyOrderId) || !marketOrders.has(shipment.sellOrderId)))) fail('markets.shipments.references');
  }
  const escortContractById = new Map(w.escorts.contracts.map((contract) => [contract.id, contract]));
  const shipmentById = new Map(w.markets.shipments.map((shipment) => [shipment.id, shipment]));
  unique(w.escorts.contracts, ({ id }) => id, 'escorts.contracts.id');
  unique(w.escorts.contracts, ({ shipmentId }) => shipmentId, 'escorts.contracts.shipment');
  unique(w.escorts.contracts.filter(({ status }) => status === 'active'), ({ escortId }) => escortId ?? '', 'escorts.contracts.active_actor');
  unique(w.escorts.reports, ({ id }) => id, 'escorts.reports.id');
  for (const contract of w.escorts.contracts) {
    const shipment = shipmentById.get(contract.shipmentId);
    const activeContract = contract.status === 'offered' || contract.status === 'active';
    unique(contract.usedReportIds, (id) => id, 'escorts.contracts.used_reports');
    unique(contract.detours, ({ reportId }) => reportId, 'escorts.contracts.detours');
    if (!actor.has(contract.clientId) || contract.originId === contract.destinationId ||
        (contract.escortId !== undefined && (!actor.has(contract.escortId) || contract.escortId === contract.clientId)) ||
        (shipment && (shipment.sellerId !== contract.clientId || shipment.originId !== contract.originId || shipment.destinationId !== contract.destinationId)) ||
        (activeContract && (!shipment || shipment.status !== 'in_transit' || !locations.has(contract.originId) || !locations.has(contract.destinationId))) ||
        contract.offeredTick > w.tick || contract.expiresTick <= contract.offeredTick ||
        (contract.acceptedTick !== undefined && (contract.acceptedTick < contract.offeredTick || contract.acceptedTick > w.tick ||
          contract.acceptedTick > contract.expiresTick)) ||
        ((contract.escortId !== undefined) !== (contract.acceptedTick !== undefined)) ||
        (contract.status === 'active' && (contract.acceptedTick === undefined || contract.path.length < 2 || contract.stride <= 0)) ||
        (contract.pathIndex >= Math.max(1,contract.path.length)) ||
        (contract.arrivedTick !== undefined && (contract.arrivedTick > w.tick || contract.pathIndex !== contract.path.length - 1)) ||
        (contract.holdAppliedTick !== undefined && (contract.holdAppliedTick < contract.offeredTick || contract.holdAppliedTick > w.tick)) ||
        (contract.lastAdvancedTick !== undefined && (contract.lastAdvancedTick < (contract.acceptedTick ?? contract.offeredTick) || contract.lastAdvancedTick > w.tick)) ||
        (activeContract === (contract.settledTick !== undefined)) ||
        (contract.settledTick !== undefined && (contract.settledTick < contract.offeredTick || contract.settledTick > w.tick)) ||
        contract.lastCrossedTileIds.some((id) => !map.has(id)) ||
        contract.detours.some((data) => !contract.usedReportIds.includes(data.reportId) || data.tick > w.tick || data.tick < (contract.acceptedTick ?? contract.offeredTick))) {
      fail('escorts.contracts.references');
    }
    if (contract.feeEscrow + contract.feePaid + contract.feeRefunded !== ESCORT_FEE ||
        contract.rationsEscrow + contract.rationsSpent + contract.rationsReturned !== (contract.acceptedTick !== undefined ? ESCORT_RATIONS : 0) ||
        (activeContract ? (contract.feeEscrow !== ESCORT_FEE || contract.feePaid !== 0 || contract.feeRefunded !== 0)
          : (contract.feeEscrow !== 0 || contract.rationsEscrow !== 0)) ||
        (contract.status === 'delivered' && (contract.feePaid !== ESCORT_FEE || contract.acceptedTick === undefined)) ||
        ((contract.status === 'failed' || contract.status === 'expired') && contract.feeRefunded !== ESCORT_FEE)) fail('escorts.contracts.escrow');
  }
  for (const report of w.escorts.reports) {
    if (!escortContractById.has(report.contractId) || !actor.has(report.reporterId) || !map.has(report.tileId) ||
        report.observedTick > w.tick || report.expiresTick <= report.observedTick) fail('escorts.reports.references');
  }
  for (const receipt of w.markets.receipts) {
    if (!actor.has(receipt.buyerId) || !actor.has(receipt.sellerId) || receipt.buyerId === receipt.sellerId) fail('markets.receipts.references');
  }
  unique(w.oaths.contracts, ({ id }) => id, 'oaths.contracts.id');
  for (const oath of w.oaths.contracts) {
    const terms = OATH_TERMS[oath.term];
    const pendingEscrow = oath.settledTick === undefined && (oath.status === 'active' || oath.status === 'breached');
    const next = Number(oath.id.split('-').at(-1));
    if (!/^oath-[1-9]\d*$/.test(oath.id) || !Number.isSafeInteger(next) || next >= w.oaths.nextId ||
        !actor.has(oath.requesterId) || !actor.has(oath.providerId) || oath.requesterId === oath.providerId ||
        oath.payment !== terms.payment || oath.collateral !== terms.collateral || oath.quantity !== terms.quantity ||
        oath.escrow.payment !== (pendingEscrow ? terms.payment : 0) || oath.escrow.collateral !== (pendingEscrow ? terms.collateral : 0) ||
        ((oath.status === 'offered' || pendingEscrow) && !locations.has(oath.locationId)) ||
        (oath.appeal && oath.appeal.appellantId !== oath.providerId) ||
        oath.evidence.some((row) => row.actorId !== oath.providerId || row.locationId !== oath.locationId ||
          row.quantity !== oath.quantity || row.tick > w.tick)) fail('oaths.references');
  }
  unique(w.mentorship.offers, ({ id }) => id, 'mentorship.offers.id');
  for (const record of [...w.mentorship.offers, ...w.mentorship.lineage]) {
    if (!actor.has(record.mentorId) || !actor.has(record.studentId) || record.mentorId === record.studentId) fail('mentorship.references');
  }
  if (w.mentorship.budgets.some(({ mentorId }) => !actor.has(mentorId))) fail('mentorship.budgets.references');
  unique(w.mentorship.budgets, ({ mentorId, tick }) => `${mentorId}:${tick}`, 'mentorship.budgets.key');
  unique(w.mentorship.lineage, ({ studentId }) => studentId, 'mentorship.lineage.student');
  const parents = new Map(w.mentorship.lineage.map(({ studentId, mentorId }) => [studentId, mentorId]));
  for (const student of parents.keys()) {
    const visited = new Set<string>();
    let cursor: string | undefined = student;
    while (cursor) {
      if (visited.has(cursor)) fail('mentorship.lineage.cycle');
      visited.add(cursor);
      cursor = parents.get(cursor);
    }
  }
  for (const council of w.councils) if (!sector.has(council.sectId) || council.voterIds.some((id) => !actor.has(id))) fail('councils.references');
  const chapters = [...w.chronicleArchive.chapters, ...w.coldHistory.chapters];
  unique(chapters, ({ id }) => id, 'coldHistory.chapters.id');
  unique(chapters, ({ chapterNumber }) => String(chapterNumber), 'coldHistory.chapters.number');
  const latestHot = w.chronicleArchive.chapters.reduce((latest, { chapterNumber }) => Math.max(latest, chapterNumber), 0);
  if (w.coldHistory.chapters.some((row) => row.endTick > w.tick - COLD_HISTORY_MIN_AGE_TICKS || row.chapterNumber >= latestHot)) {
    fail('coldHistory.chapters.age');
  }
  for (const chapter of chapters) {
    const anchors = unique(chapter.anchors, ({ id }) => id, 'coldHistory.chapters.anchor');
    if (chapter.chapterNumber < 1 || chapter.startTick < 1 || chapter.startTick > chapter.endTick || chapter.endTick > w.tick ||
        chapter.anchors.some(({ tick: at }) => at < chapter.startTick || at > chapter.endTick) ||
        chapter.biographies.some((entry) => entry.anchorIds.some((id) => !anchors.has(id)))) fail('coldHistory.chapters.references');
  }
  w.coldHistory = freezeColdHistory(w.coldHistory);
  return w;
}

function checkSize(text: string): void {
  if (text.length > WORLD_SAVE_MAX_BYTES || new TextEncoder().encode(text).byteLength > WORLD_SAVE_MAX_BYTES) {
    throw new WorldSaveError('size', '存档超过 8 MiB。');
  }
}

function serializeWorldSave(world: WorldState): string {
  try { return JSON.stringify({ format: FORMAT, version: VERSION, world }); }
  catch { throw new WorldSaveError('json', '当前世界不能序列化为 JSON。'); }
}

/** Exact UTF-8 export envelope size, separate from in-memory objects and independent of the file acceptance limit. */
export function worldSaveByteCount(world: WorldState): number {
  return new TextEncoder().encode(serializeWorldSave(world)).byteLength;
}

export function encodeWorldSave(world: WorldState): string {
  const raw = serializeWorldSave(world);
  checkSize(raw);
  decodeWorldSave(raw);
  return raw;
}

export function decodeWorldSave(text: string): WorldState {
  if (typeof text !== 'string') throw new WorldSaveError('json', '存档必须是 JSON 文本。');
  checkSize(text);
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { throw new WorldSaveError('json', '存档不是有效的 JSON。'); }
  const envelope = payload as { format?:unknown; version?:unknown; world?:unknown } | null;
  if (!envelope || typeof envelope !== 'object' || envelope.format !== FORMAT || envelope.version !== VERSION) {
    throw new WorldSaveError('version', '不支持这个存档格式或版本。');
  }
  if (Object.keys(envelope).some((key) => !['format','version','world'].includes(key))) return fail('envelope');
  return verifyWorld(envelope.world);
}

export interface SaveSlotSummary { id: string; label: string; savedAt: number; tick: number; year: number; month: number; seed: number; profileId?: WorldgenProfileId }
export interface SaveBranchSource { branchId: string; label?: string; timelineId?: string }
export type SaveSlotRevision = string;
export type SaveSlotExpected = SaveSlotRevision | null;
export type SavePointKind = 'current' | 'previous';
export interface SavePointSelection {
  slotId: string;
  headRevision: SaveSlotExpected;
  point: SavePointKind;
  revision: SaveSlotRevision;
  formatVersion: typeof VERSION;
  sourceBranch?: SaveBranchSource;
  seal: string;
}
export interface SavePointInfo { summary: SaveSlotSummary; selection: SavePointSelection }
export interface SaveSlotInspection {
  id: string;
  headRevision: SaveSlotExpected;
  current?: SavePointInfo;
  previous?: SavePointInfo;
  currentDamaged: boolean;
  previousDamaged: boolean;
}
export interface SaveCapabilities { backend: 'indexeddb' | 'localstorage' | 'memory'; writable: boolean; recovery: boolean; crossTab: boolean }

interface SaveJournal { revision: SaveSlotRevision; formatVersion: typeof VERSION; sourceBranch?: SaveBranchSource; seal: string }
interface SaveSlot { summary: SaveSlotSummary; content: string; journal?: SaveJournal }
interface SealedSlot extends SaveSlot { journal: SaveJournal }
interface SaveIndexRow extends SaveSlotSummary { revision: SaveSlotRevision }
interface RawSlotSnapshot { index: unknown; current: unknown; previous: unknown }
type SaveCommit = { id: string; inspected: RawSlotSnapshot } &
  ({ kind: 'write'; current: SealedSlot; previous?: SealedSlot } | { kind: 'remove' });
export interface SaveBackend {
  capabilities: SaveCapabilities;
  list(): Promise<unknown[]>;
  read(id: string): Promise<RawSlotSnapshot>;
  commit(change: SaveCommit): Promise<void>;
}

const PREFIX = 'ai-sect-sandbox:saves:v1:';
const SAVE_DATABASE = 'ai-sect-sandbox-saves';
const DATABASE_VERSION = 2;
const storageError = () => new WorldSaveError('storage', '无法访问浏览器存档。存储可能被禁用或已满，已有存档未清除。');
const conflictError = () => new WorldSaveError('slot_conflict', '此槽已在另一操作中变化，未执行。请刷新后重新选择。');
const limitError = () => new WorldSaveError('slot_limit', '存档位已满。');
const readOnlyError = () => new WorldSaveError('storage_read_only', '当前后端只能读取旧档；不能安全覆盖、删除或建立恢复点。可使用 JSON 文件。');
const integrityError = () => new WorldSaveError('integrity', '此存档版本无法通过完整性校验。不会自动改读其他版本或替换当前世界。');
const blockedError = () => new WorldSaveError('storage_blocked', '浏览器存档正在切换版本；请关闭其他旧游戏标签后刷新重试。');
const rightId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(id);
const goodRevision = (revision: unknown): revision is SaveSlotRevision => typeof revision === 'string' &&
  /^(?:r:[0-9a-f]{32}|legacy:[0-9a-f]{64})$/.test(revision);
const validSeal = (seal: unknown): seal is string => typeof seal === 'string' && /^[0-9a-f]{64}$/.test(seal);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const ownsOnly = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
function checkId(id: unknown): asserts id is string {
  if (!rightId(id)) throw new WorldSaveError('invalid_slot', '存档位编号无效。');
}

function checkSummary(summary: unknown): SaveSlotSummary {
  if (!isRecord(summary)) throw integrityError();
  const { id, label, savedAt, tick, year, month, seed, profileId } = summary;
  const safeNumber = (value: unknown, lo: number, hi = Number.MAX_SAFE_INTEGER): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= lo && value <= hi;
  if (!rightId(id) || typeof label !== 'string' || !label || label.length > 60 ||
      !safeNumber(savedAt, 0) || !safeNumber(tick, 0) || !safeNumber(year, 0) || !safeNumber(month, 1, 12) ||
      !safeNumber(seed, 0, 0xffffffff) || (profileId !== undefined && !isWorldgenProfileId(profileId))) throw integrityError();
  return { id, label, savedAt, tick, year, month, seed, ...(profileId === undefined ? {} : { profileId }) };
}

function checkBranch(source: unknown): SaveBranchSource | undefined {
  if (source === undefined) return undefined;
  const safeKey = (key: unknown): key is string => typeof key === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(key);
  if (!isRecord(source) || !ownsOnly(source, ['branchId','label','timelineId']) || !safeKey(source.branchId) ||
      (source.timelineId !== undefined && !safeKey(source.timelineId)) ||
      (source.label !== undefined && (typeof source.label !== 'string' || !source.label.trim() || source.label.length > 80 ||
        /[\u0000-\u001f\u007f]/.test(source.label)))) throw integrityError();
  const { branchId, label, timelineId } = source;
  return { branchId, ...(label === undefined ? {} : { label }), ...(timelineId === undefined ? {} : { timelineId }) };
}

function indexRevision(raw: unknown, id: string): SaveSlotRevision | undefined {
  if (!isRecord(raw) || !goodRevision(raw.revision)) return undefined;
  try { return checkSummary(raw).id === id ? raw.revision : undefined; } catch { return undefined; }
}
const summaryKey = (s: SaveSlotSummary) => [s.id,s.label,s.savedAt,s.tick,s.year,s.month,s.seed,s.profileId ?? null];
const branchKey = (branch?: SaveBranchSource) => branch ? [branch.branchId,branch.label ?? null,branch.timelineId ?? null] : null;
const sameSummary = (left: SaveSlotSummary, right: SaveSlotSummary) => JSON.stringify(summaryKey(left)) === JSON.stringify(summaryKey(right));
const sameBranch = (left?: SaveBranchSource, right?: SaveBranchSource) => JSON.stringify(branchKey(left)) === JSON.stringify(branchKey(right));
const toHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const createRevision = () => `r:${toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)))}`;
const validStorageCrypto = () => Boolean(globalThis.crypto?.subtle && globalThis.crypto?.getRandomValues);
async function digest(value: unknown) {
  if (!validStorageCrypto()) throw storageError();
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return toHex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)));
}
const legacyDigest = (summary: SaveSlotSummary, content: string) =>
  digest([FORMAT,VERSION,'legacy',summaryKey(summary),content]);
const slotSeal = (summary: SaveSlotSummary, content: string, revision: SaveSlotRevision, sourceBranch?: SaveBranchSource) =>
  digest([FORMAT,VERSION,'journal',summaryKey(summary),revision,branchKey(sourceBranch),content]);

interface ValidPoint {
  summary: SaveSlotSummary;
  content: string;
  world: WorldState;
  revision: SaveSlotRevision;
  seal: string;
  sourceBranch?: SaveBranchSource;
  legacy: boolean;
}
async function readPoint(raw: unknown, id: string, point: SavePointKind): Promise<ValidPoint | undefined> {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || !ownsOnly(raw, ['summary','content','journal']) || typeof raw.content !== 'string' ||
      !isRecord(raw.summary) || !ownsOnly(raw.summary, ['id','label','savedAt','tick','year','month','seed','profileId'])) throw integrityError();
  const summary = checkSummary(raw.summary);
  if (summary.id !== id) throw integrityError();
  const world = decodeWorldSave(raw.content);
  if (summary.tick !== world.tick || summary.year !== world.year || summary.month !== world.month || summary.seed !== world.random.seed ||
      (summary.profileId !== undefined && summary.profileId !== world.worldgen?.profileId)) throw integrityError();
  if (raw.journal === undefined) {
    if (point === 'previous') throw integrityError();
    const seal = await legacyDigest(summary, raw.content);
    return { summary, content: raw.content, world, revision: `legacy:${seal}`, seal, legacy: true };
  }
  const j = raw.journal;
  if (!isRecord(j) || !ownsOnly(j, ['formatVersion','revision','sourceBranch','seal']) ||
      j.formatVersion !== VERSION || !goodRevision(j.revision) || !validSeal(j.seal)) throw integrityError();
  const sourceBranch = checkBranch(j.sourceBranch);
  const legacy = j.revision.startsWith('legacy:');
  if (!legacy && summary.profileId !== world.worldgen?.profileId) throw integrityError();
  if (legacy && (point !== 'previous' || sourceBranch || j.revision !== `legacy:${await legacyDigest(summary, raw.content)}`)) throw integrityError();
  if (j.seal !== await slotSeal(summary, raw.content, j.revision, sourceBranch)) throw integrityError();
  return { summary, content: raw.content, world, revision: j.revision, seal: j.seal, sourceBranch, legacy };
}

function requireCurrentIndex(raw: RawSlotSnapshot, validated: ValidPoint, id: string) {
  if (indexRevision(raw.index, id) === validated.revision && sameSummary(checkSummary(raw.index), validated.summary)) return;
  if (!validated.legacy) throw integrityError();
  // An actual v1 IndexedDB slot always has an index. The legacy local fallback also exposes the same view.
  if (!isRecord(raw.index) || Object.hasOwn(raw.index, 'revision') || !sameSummary(checkSummary(raw.index), validated.summary)) throw integrityError();
}
function rawEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    // Payloads can be 8 MiB; compare their original bytes as strings, without serializing
    // another full pair inside an active write transaction.
    if (isRecord(a) && isRecord(b) && Object.hasOwn(a, 'content') && Object.hasOwn(b, 'content')) {
      const { content: left, ...aMeta } = a;
      const { content: right, ...bMeta } = b;
      return left === right && JSON.stringify(aMeta) === JSON.stringify(bMeta);
    }
    return JSON.stringify(a) === JSON.stringify(b);
  }
  catch { return false; }
}
function sameRawSnapshot(left: RawSlotSnapshot, right: RawSlotSnapshot) {
  return rawEqual(left.index,right.index) && rawEqual(left.current,right.current) && rawEqual(left.previous,right.previous);
}
const emptySnapshot = (row: RawSlotSnapshot) => row.current === undefined && row.index === undefined && row.previous === undefined;
const getIndex = (slot: SealedSlot): SaveIndexRow => ({ ...slot.summary, revision: slot.journal.revision });

export function createMemorySaveBackend(): SaveBackend {
  const rows = new Map<string, RawSlotSnapshot>();
  const lookup = (id: string): RawSlotSnapshot => rows.get(id) ?? { index: undefined, current: undefined, previous: undefined };
  return {
    capabilities: { backend: 'memory', writable: true, recovery: true, crossTab: false },
    list: async () => [...rows.values()].map(row => structuredClone(row.index)).filter(index => index !== undefined),
    read: async (id) => structuredClone(lookup(id)),
    commit: async (change) => {
      const current = lookup(change.id);
      if (!sameRawSnapshot(current, change.inspected)) throw conflictError();
      if (change.kind === 'remove') { rows.delete(change.id); return; }
      if (emptySnapshot(current) && rows.size >= WORLD_SAVE_MAX_SLOTS) throw limitError();
      rows.set(change.id, structuredClone({ index: getIndex(change.current), current: change.current, previous: change.previous }));
    },
  };
}

function localBackend(storage: Storage): SaveBackend {
  const get = (id: string): unknown => {
    const raw = storage.getItem(PREFIX + id);
    if (raw === null) return undefined;
    try { return JSON.parse(raw) as unknown; } catch { return null; }
  };
  return {
    capabilities: { backend: 'localstorage', writable: false, recovery: false, crossTab: false },
    list: async () => {
      const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
      return keys.flatMap(key => {
        if (!key?.startsWith(PREFIX)) return [];
        const row = get(key.slice(PREFIX.length));
        return isRecord(row) ? [row.summary] : [];
      });
    },
    read: async (id) => {
      const current = get(id);
      return { index: isRecord(current) ? current.summary : undefined, current, previous: undefined };
    },
    commit: async () => { throw readOnlyError(); },
  };
}

const SAVE_TABLES = ['worlds','summaries','recoveries'];
function readIndexedSlot(tx: IDBTransaction, id: string, got: (row: RawSlotSnapshot) => void) {
  const index = tx.objectStore('summaries').get(id);
  const current = tx.objectStore('worlds').get(id);
  const previous = tx.objectStore('recoveries').get(id);
  let remaining = 3;
  index.onsuccess = current.onsuccess = previous.onsuccess = () => {
    if (--remaining === 0) got({ index: index.result as unknown, current: current.result as unknown, previous: previous.result as unknown });
  };
}

function indexedBackend(db: IDBDatabase): SaveBackend {
  return {
    capabilities: { backend: 'indexeddb', writable: true, recovery: true, crossTab: true },
    list: () => new Promise((resolve, reject) => {
      const tx = db.transaction('summaries', 'readonly');
      const req = tx.objectStore('summaries').getAll();
      tx.oncomplete = () => resolve(req.result as unknown[]);
      tx.onabort = () => reject(storageError());
    }),
    read: (id) => new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE_TABLES, 'readonly');
      let result: RawSlotSnapshot;
      readIndexedSlot(tx, id, row => { result = row; });
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(storageError());
    }),
    commit: (change) => new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE_TABLES, 'readwrite');
      const world = tx.objectStore('worlds');
      const index = tx.objectStore('summaries');
      const recovery = tx.objectStore('recoveries');
      let failure: WorldSaveError | undefined;
      const abort = (error: WorldSaveError) => { failure = error; tx.abort(); };
      const put = () => {
        try {
          if (change.kind === 'remove') { world.delete(change.id); index.delete(change.id); recovery.delete(change.id); }
          else {
            if (change.previous) recovery.put(change.previous);
            world.put(change.current);
            index.put(getIndex(change.current));
          }
        } catch { abort(storageError()); }
      };
      readIndexedSlot(tx, change.id, row => {
        // No promises in the write transaction: the completed preflight is compared to the exact three rows
        // observed now, then all mutations and the capacity check remain inside this transaction.
        if (!sameRawSnapshot(row, change.inspected)) { abort(conflictError()); return; }
        if (change.kind === 'write' && emptySnapshot(row)) {
          const count = world.count();
          count.onsuccess = () => { if (count.result >= WORLD_SAVE_MAX_SLOTS) abort(limitError()); else put(); };
        } else put();
      });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? storageError());
    }),
  };
}

async function browserBackend(): Promise<SaveBackend> {
  // Do not mistake an upgrade-blocked or denied open for a separate, empty namespace.
  if (typeof indexedDB !== 'undefined') {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      let finished = false;
      const req = indexedDB.open(SAVE_DATABASE, DATABASE_VERSION);
      const finish = (db?: IDBDatabase, error?: WorldSaveError) => {
        if (finished) { db?.close(); return; }
        finished = true;
        clearTimeout(timer);
        if (db) resolve(db); else reject(error ?? storageError());
      };
      const timer = setTimeout(() => finish(undefined, blockedError()), 3000);
      req.onupgradeneeded = () => {
        if (finished) { req.transaction?.abort(); return; }
        if (!req.result.objectStoreNames.contains('worlds')) req.result.createObjectStore('worlds', { keyPath: 'summary.id' });
        if (!req.result.objectStoreNames.contains('summaries')) req.result.createObjectStore('summaries', { keyPath: 'id' });
        if (!req.result.objectStoreNames.contains('recoveries')) req.result.createObjectStore('recoveries', { keyPath: 'summary.id' });
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => req.result.close();
        finish(req.result);
      };
      req.onerror = () => finish(undefined, req.error?.name === 'VersionError' ? blockedError() : storageError());
      req.onblocked = () => finish(undefined, blockedError());
    });
    return indexedBackend(db);
  }
  try {
    if (typeof localStorage !== 'undefined') {
      void localStorage.length;
      return localBackend(localStorage);
    }
  } catch { /* a browser may deny even read access */ }
  throw storageError();
}

const infoFor = (id: string, headRevision: SaveSlotExpected, point: SavePointKind, value: ValidPoint): SavePointInfo => ({
  summary: value.summary,
  selection: {
    slotId: id, headRevision, point, revision: value.revision, seal: value.seal, formatVersion: VERSION,
    ...(value.sourceBranch === undefined ? {} : { sourceBranch: value.sourceBranch }),
  },
});

async function pointOrDamage(raw: RawSlotSnapshot, id: string, kind: SavePointKind) {
  try {
    const validated = await readPoint(raw[kind], id, kind);
    if (kind === 'current' && validated) requireCurrentIndex(raw, validated, id);
    return { validated, damaged: kind === 'current' && !validated && raw.index !== undefined };
  } catch { return { validated: undefined, damaged: true }; }
}
const headFor = (raw: RawSlotSnapshot, id: string, current?: ValidPoint): SaveSlotExpected =>
  indexRevision(raw.index, id) ?? current?.revision ?? null;

export function createSaveStore(backend?: SaveBackend, now: () => number = Date.now) {
  let opened: Promise<SaveBackend> | undefined;
  const pick = () => backend ? Promise.resolve(backend) : (opened ??= browserBackend().catch((error) => { opened = undefined; throw error; }));
  let tail: Promise<unknown> = Promise.resolve();
  function operations<T>(work: (store: SaveBackend) => Promise<T>): Promise<T> {
    const run = tail.then(() => pick()).then(work).catch((error: unknown) => { throw error instanceof WorldSaveError ? error : storageError(); });
    tail = run.catch(() => undefined);
    return run;
  }
  return {
    capabilities: () => operations(async (store) => ({ ...store.capabilities,
      writable: store.capabilities.writable && validStorageCrypto(), recovery: store.capabilities.recovery && validStorageCrypto() })),
    list: () => operations(async (store) => (await store.list()).flatMap(row => {
      try { return [checkSummary(row)]; } catch { return []; }
    }).sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id))),
    inspect: (id: string) => operations(async (store): Promise<SaveSlotInspection> => {
      checkId(id);
      const raw = await store.read(id);
      const [current, previous] = await Promise.all([pointOrDamage(raw,id,'current'),pointOrDamage(raw,id,'previous')]);
      const headRevision = headFor(raw, id, current.validated);
      return { id, headRevision, currentDamaged: current.damaged, previousDamaged: previous.damaged,
        ...(current.validated ? { current: infoFor(id,headRevision,'current',current.validated) } : {}),
        ...(previous.validated ? { previous: infoFor(id,headRevision,'previous',previous.validated) } : {}) };
    }),
    load: (id: string) => operations(async (store) => {
      checkId(id);
      const raw = await store.read(id);
      const current = await readPoint(raw.current, id, 'current');
      if (!current) { if (!emptySnapshot(raw)) throw integrityError(); throw new WorldSaveError('not_found', '这个存档位是空的。'); }
      requireCurrentIndex(raw, current, id);
      return current.world;
    }),
    loadSelected: (selection: SavePointSelection) => {
      // Clone the reviewed selector before asynchronous browser work; callers cannot mutate it while queued.
      let wanted: SavePointSelection;
      try { wanted = structuredClone(selection); } catch { return Promise.reject<WorldState>(integrityError()); }
      return operations(async (store) => {
        checkId(wanted?.slotId);
        if ((wanted.point !== 'current' && wanted.point !== 'previous') || wanted.formatVersion !== VERSION ||
          !goodRevision(wanted.revision) || !validSeal(wanted.seal) || (wanted.headRevision !== null && !goodRevision(wanted.headRevision))) throw integrityError();
        const sourceBranch = checkBranch(wanted.sourceBranch);
        const raw = await store.read(wanted.slotId);
        let current: ValidPoint | undefined;
        if (!indexRevision(raw.index, wanted.slotId) || wanted.point === 'current') {
          current = (await pointOrDamage(raw,wanted.slotId,'current')).validated;
        }
        if (headFor(raw,wanted.slotId,current) !== wanted.headRevision) throw conflictError();
        const value = wanted.point === 'current' ? current : (await pointOrDamage(raw,wanted.slotId,'previous')).validated;
        if (!value) {
          if (raw[wanted.point] === undefined) throw conflictError();
          throw integrityError();
        }
        if (value.revision !== wanted.revision || value.seal !== wanted.seal || !sameBranch(value.sourceBranch, sourceBranch)) throw conflictError();
        if (!sameRawSnapshot(raw, await store.read(wanted.slotId))) throw conflictError();
        return value.world;
      });
    },
    save: (id: string, label: string, world: WorldState, expected: SaveSlotExpected = null, source?: SaveBranchSource) => {
      let content: string;
      let summary: SaveSlotSummary;
      let sourceBranch: SaveBranchSource | undefined;
      try {
        checkId(id);
        if (expected !== null && !goodRevision(expected)) throw conflictError();
        const name = typeof label === 'string' ? label.trim() : '';
        if (!name || name.length > 60) throw new WorldSaveError('invalid_slot', '存档名称须为 1 至 60 个字符。');
        sourceBranch = checkBranch(source);
        // Snapshot at call time, not after waiting for a backend operation or SHA-256.
        content = encodeWorldSave(world);
        summary = checkSummary({ id, label: name, savedAt: now(), tick: world.tick, year: world.year, month: world.month, seed: world.random.seed, profileId: world.worldgen?.profileId });
      } catch (error) { return Promise.reject<SaveSlotSummary>(error); }
      return operations(async (store) => {
        if (!store.capabilities.writable || !validStorageCrypto()) throw readOnlyError();
        const raw = await store.read(id);
        let previous: SealedSlot | undefined;
        if (expected === null) { if (!emptySnapshot(raw)) throw conflictError(); }
        else {
          const current = await readPoint(raw.current,id,'current');
          if (!current || current.revision !== expected) throw conflictError();
          requireCurrentIndex(raw,current,id);
          summary.savedAt = Math.max(summary.savedAt, current.summary.savedAt + 1);
          checkSummary(summary);
          const seal = current.legacy ? await slotSeal(current.summary,current.content,current.revision) : current.seal;
          previous = {
            summary: current.summary, content: current.content,
            journal: { revision: current.revision, formatVersion: VERSION, seal,
              ...(current.sourceBranch === undefined ? {} : { sourceBranch: current.sourceBranch }) },
          };
        }
        const revision = createRevision();
        const seal = await slotSeal(summary,content,revision,sourceBranch);
        const current: SealedSlot = { summary, content, journal: { revision, formatVersion: VERSION, seal,
          ...(sourceBranch === undefined ? {} : { sourceBranch }) } };
        await store.commit({ kind: 'write', id, inspected: raw, current, previous });
        return { ...summary };
      });
    },
    delete: (id: string, expected: SaveSlotRevision) => operations(async (store) => {
      checkId(id);
      if (!goodRevision(expected)) throw conflictError();
      if (!store.capabilities.writable || !validStorageCrypto()) throw readOnlyError();
      const raw = await store.read(id);
      const current = indexRevision(raw.index,id) ? undefined : (await pointOrDamage(raw,id,'current')).validated;
      if (headFor(raw,id,current) !== expected) throw conflictError();
      await store.commit({ kind: 'remove', id, inspected: raw });
      return true;
    }),
  };
}

export const worldSaveStore = createSaveStore();
