import type { BeastDuelChoice, BeastDuelContact } from './beastDuelProtection';
import type { ProtagonistHandoff } from './protagonistHandoff';
import type { ProtagonistFlight } from './protagonistFlight';
import type { AscensionMove, AscensionState } from './ascension';
import type { ClanMove } from './cultivationClan';
import type { CultivationClanHeritage, CultivationClanState } from './cultivationClan';
import type { TianjiGazetteState } from './tianjiGazette';
import type { ImmortalAuctionMove, ImmortalAuctionPillId } from './immortalAuction';
import type { ImmortalAuctionState } from './immortalAuction';
import type { DaoIntentActivation, DaoPathState } from './daoPath';
import type { DaoPathId, DaoPathMove } from './daoPath';
import type { HeavenlyAlchemyMove, HeavenlyHeat, HeavenlyQuality, HeavenlyRecipeId } from './heavenlyAlchemy';
import type { HeavenlyAlchemyState } from './heavenlyAlchemy';
import type {DungeonMove, DungeonRoom, ExpeditionDungeon} from './expeditionDungeon';
import type {TournamentWagerState} from './tournamentWager';
import type {TournamentArena} from './tournamentArena';
import type {RingAudienceState} from './ringAudience';
import type { DramaticBondState } from './dramaticBond';
import type { GrandSiegeHeroMove, GrandSiegeTheatre } from './grandSiege';
import type { ForbiddenArtChoice, ForbiddenArtScar, ForbiddenDuelContact } from './forbiddenArt';
import type { HeartDemonAftermath, HeartDemonChoice, HeartDemonFrame, HeartDemonGuide } from './heartDemon';
import type { DestinyTraitId, DestinyTraitProgress } from './destinyTrait';
import type {RoguelikeEncounterChoice,RoguelikeEncounterRecord} from './roguelikeEncounter';
import type {FrontierAnchorId,FrontierMovementMove,FrontierPositionPlane,FrontierSiteId,FrontierState} from '../engine/frontierTerms';
import type {FrontierProductionMove} from '../engine/frontierProductionTerms';
import type {FrontierTradeMove} from '../engine/frontierTradeTerms';
import type {UpperArrayFieldMovementOption,UpperArrayFieldMove,UpperArrayFieldSiteId,UpperArrayFieldState} from '../engine/upperArrayFieldTerms';
import type {UpperArrayFieldLocalOption,UpperArrayFieldLocalMove} from '../engine/upperArrayFieldLocalTerms';
import type {UpperArrayFieldTradeMove} from '../engine/upperArrayFieldTradeTerms';
import type {FrontierDrylandMove,FrontierDrylandLocalOption} from '../engine/frontierDrylandTerms';
import type {FrontierDrylandTradeMove} from '../engine/frontierDrylandTradeTerms';
import type {FrontierPortLocalMove} from '../engine/frontierPortTerms';
import type {FrontierPortTradeMove} from '../engine/frontierPortTradeTerms';
import type {NorthGateRenewalMove,NorthGateRenewalState} from '../engine/northGateRenewalTerms';
import type {UpperPassageMove,UpperPassageNodeId,UpperPositionPlane,UpperPassageState} from '../engine/upperPassageTerms';

import type { ScribeCommissionMove, ScribeCommissionState } from './scribeCommission';

import type { WaypostMealMove, WaypostMealState, WaypostMealWitness } from './waypostMeal';

import type { CivicMemorialAddition } from './civicMemorialAddition';

import type { MarketFreightMove, MarketFreightTerms } from './marketFreight';

import type { DisasterShelterMove, DisasterShelterState } from './disasterShelter';

import type { CraftTrainingMove, CraftTrainingOrigin, CraftTrainingState } from './craftTraining';

export type SpiritRoot = '金' | '木' | '水' | '火' | '土' | '雷' | '暗' | '天灵根';

export type HerbId = 'jade_leaf' | 'earth_root' | 'star_bloom' | 'shadow_moss';
export type PillId = 'foundation' | 'golden' | 'barrier' | 'heart_poison';

export interface Technique {
  id?: string;
  authorId?: string;
  createdTick?: number;
  name: string;
  spiritRoot: SpiritRoot;
}

export type ArtifactTier = '法器' | '灵器' | '法宝' | '通天灵宝';

/** Canonical delivery provenance, retained even after completed commission details roll away. */
export interface WorkshopArtifactOrigin {
  orderId: string;
  piece: 1 | 2;
  makerId: string;
  siteId: string;
  blankTick: number;
  finishedTick: number;
}

export interface ArtifactSalvageReceipt {
  artifactId: string;
  artifactName: string;
  ownerId: string;
  siteId: string;
  tick: number;
  tier: '法器' | '灵器';
  durability: number;
  maxDurability: number;
  origin: WorkshopArtifactOrigin;
}
/** Exact irreversible artifact identities; this is a receipt ledger, not a stockpile. */
export interface ArtifactSalvageState { receipts: ArtifactSalvageReceipt[] }

export interface Artifact {
  workshopOrigin?: WorkshopArtifactOrigin;
  craftTrainingOrigin?: CraftTrainingOrigin;
  id?: string;
  tier?: ArtifactTier;
  durability?: number;
  maxDurability?: number;
  boundTo?: string;
  soul?: { name: string; experience: number };
  resonance?: number;
  relicSetId?: RelicSetId;
  relicFragmentIds?: [string, string];
  name: string;
  spiritRoot: SpiritRoot;
}

export type CultivationRealm =
  | '练气'
  | '筑基'
  | '金丹'
  | '元婴'
  | '化神'
  | '炼虚'
  | '合体'
  | '大乘'
  | '渡劫';

export type PersonalityTrait =
  | '刚正'
  | '阴险'
  | '狂傲'
  | '苟道'
  | '痴情'
  | '嗜血'
  | '逍遥'
  | '诡诈';

export type ActionType =
  | 'ROGUELIKE_ENCOUNTER'
  | 'AWAKEN_DESTINY'
  | 'FORBIDDEN_ART'
  | 'BEAST_DUEL_RESPONSE'
  | 'GRAND_SIEGE_HERO'
  | 'BATTLEFIELD_REVISIT'
  | 'CALAMITY_ARRAY'
  | 'AUDIENCE_PLEDGE'
  | 'CULTIVATE'
  | 'BREAKTHROUGH'
  | 'EXPLORE'
  | 'SOCIALIZE'
  | 'DUEL'
  | 'SCHEMING'
  | 'PURSUE_SCHEME'
  | 'AUTHOR_TECHNIQUE'
  | 'STUDY_TECHNIQUE'
  | 'TEACH'
  | 'ACCEPT_TUITION'
  | 'DECLINE_TUITION'
  | 'OFFER_OATH'
  | 'ACCEPT_OATH'
  | 'DECLINE_OATH'
  | 'FULFILL_OATH'
  | 'APPEAL_OATH'
  | 'PLACE_MARKET_BUY'
  | 'PLACE_MARKET_SELL'
  | 'CANCEL_MARKET_ORDER'
  | 'RECRUIT_SETTLER'
  | 'DELIVER_RELIEF'
  | 'FILE_WITNESS_CLAIM'
  | 'ATTEST_WITNESS'
  | 'CHALLENGE_WITNESS'
  | 'NAME_HEIR'
  | 'CLAIM_ESTATE'
  | 'HOLD_MEMORIAL'
  | 'DOCTRINE'
  | 'DOCTRINE_FOUNDING'
  | 'DOCTRINE_MATURITY'
  | 'RELOCATE'
  | 'RECOLLECT'
  | 'RELIC'
  | 'SCRIPTURE'
  | 'RANK_SEASON'
  | 'ESCORT'
  | 'CEASEFIRE'
  | 'RESEARCH'
  | 'SANCTUARY'
  | 'SECT_CREDIT'
  | 'PILGRIMAGE'
  | 'CHRONICLE_ERRATA'
  | 'HABITAT'
  | 'INFIRMARY'
  | 'CARE_FOLLOWUP'
  | 'DANXIA_MEDICINE'
  | 'DANXIA_REVIEW'
  | 'FORMATION_NETWORK'
  | 'TERRITORIAL_LEASE'
  | 'HOUSEHOLD_GUARDIAN'
  | 'VILLAGE_WORKS'
  | 'SEALED_COURIER'
  | 'COURIER_HANDOFF'
  | 'SECT_SERVICE'
  | 'SHARED_COMMONS'
  | 'TERRAIN_RECOVERY'
  | 'RELIC_EXHIBIT'
  | 'ROAD'
  | 'GATHER_HERBS'
  | 'BREW_PILL'
  | 'HEAVENLY_ALCHEMY'
  | 'DAO_PATH'
  | 'IMMORTAL_AUCTION'
  | 'CULTIVATION_CLAN'
  | 'ASCENSION'
  | 'USE_PILL'
  | 'VILLAGE_CENSUS'
  | 'FIELD_OBSERVATORY'
  | 'ALIGNED_WEATHER'
  | 'OATH_ARBITRATION'
  | 'SEASON_REVIEW'
  | 'PROBATION'
  | 'SCRIBE_COMMISSION'
  | 'MARKET_FREIGHT'
  | 'DISASTER_SHELTER'
  | 'CRAFT_TRAINING'
  | 'WAYPOST_MEAL'
  | 'WORKSHOP_ESTATE'
  | 'WORKSHOP_RELEASE'
  | 'WORKSHOP'
  | 'FURNACE_RESERVATION'
  | 'FURNACE_SAFETY'
  | 'DAMAGE_ASSURANCE'
  | 'SPARRING'
  | 'EXPEDITION_RESCUE'
  | 'EXPEDITION_DUNGEON'
  | 'SHORT_SHIFT'
  | 'BOUNDARY_RELIEF'
  | 'MENTOR_TRANSFER'
  | 'APPRENTICE_COHORT'
  | 'SEASONAL_HOUSING'
  | 'HOUSEHOLD_NAME'
  | 'CARAVAN_RESTITUTION'
  | 'VILLAGE_GRANARY'
  | 'VILLAGE_SUPPLY'
  | 'ROUTE_WARNING'
  | 'PAVILION_LOAN'
  | 'WORKSHOP_CAPACITY'
  | 'CIVIC_MEMORIAL'
  | 'VILLAGE_FAIR'
  | 'SECT_STIPEND'
  | 'SEED_CULTURE'
  | 'WATER_VEIN'
  | 'NORTH_MINING_CHARTER'
  | 'NORTH_WELL_REVIEW'
  | 'UPPER_PASSAGE'
  | 'UPPER_ARRAY_FIELD'
  | 'UPPER_ARRAY_FIELD_LOCAL'
  | 'UPPER_ARRAY_FIELD_TRADE'
  | 'NORTH_GATE_RENEWAL'
  | 'FRONTIER'
  | 'FRONTIER_PRODUCTION'
  | 'FRONTIER_TRADE'
  | 'FRONTIER_PORT'
  | 'FRONTIER_PORT_TRADE'
  | 'FRONTIER_DRYLAND'
  | 'FRONTIER_DRYLAND_TRADE'
  | 'TOOL_LOAN'
  | 'FORGE_ARTIFACT'
  | 'BIND_ARTIFACT'
  | 'REPAIR_ARTIFACT'
  | 'SALVAGE_ARTIFACT'
  | 'AWAKEN_ARTIFACT'
  | 'FACE_TRIBULATION'
  | 'AMBUSH_TRIBULATION'
  | 'CHALLENGE_LEADERSHIP'
  | 'PLOT_COUP'
  | 'BUILD_FACILITY'
  | 'DISPATCH_GUARD'
  | 'GUARD_DUTY'
  | 'OFFER_ALLIANCE'
  | 'DECLARE_WAR'
  | 'DEMAND_TRIBUTE'
  | 'LAUNCH_SIEGE'
  | 'JOIN_OCCASION'
  | 'PURSUE_BOUNTY'
  | 'TAME_BEAST'
  | 'TRADE'
  | 'DUAL_CULTIVATE'
  | 'SECT_DIPLOMACY'
  | 'REST';

export type RelationType = '师徒' | '同门' | '道侣' | '血仇' | '挚友' | '竞争';

export interface MemoryEntry {
  id: string;
  tick: number;
  content: string;
  importance: number; // 1 to 10, original impact
  emotionalValence: number; // -5 to +5
  decayRate: number; // Exponential forgetting constant per tick
  consolidatedAtTick?: number;
  category: 'cultivation' | 'combat' | 'social' | 'heavenly' | 'whisper';
}

export type ReflectionKind = 'belief' | 'obsession' | 'heart_demon';
export type ReflectionTheme = 'cultivation' | 'conflict' | 'community' | 'heavenly';

export interface CultivatorReflection {
  id: string;
  tick: number;
  kind: ReflectionKind;
  theme: ReflectionTheme;
  intensity: number; // 1–10
  statement: string;
  sourceMemoryIds: string[];
  source: 'utility' | 'llm';
}

export interface RelationshipEdge {
  fromId: string;
  toId: string;
  type: RelationType;
  affinity: number; // -100 to +100
  note: string;
}

export interface LocationNode {
  expeditionOmenId?: string;
  id: string;
  name: string;
  x: number; // 0-1000 canvas coordinate
  y: number; // 0-600 canvas coordinate
  type: 'sect_hq' | 'spirit_vein' | 'secret_realm' | 'market' | 'abyss';
  spiritRoot: SpiritRoot;
  spiritQi: number; // 10 to 100
  ownerSectId?: string;
  inheritanceScrolls: Technique[];
  herbs: Record<HerbId, number>;
  herbCapacity: Record<HerbId, number>;
  furnaceGrade: 0 | 1 | 2 | 3;
  description: string;
}

export type SectRank = '外门弟子' | '内门弟子' | '真传弟子' | '长老' | '太上长老' | '掌门';

export interface SectSuccession {
  tick: number;
  method: 'election' | 'challenge' | 'coup';
  previousLeaderId?: string;
  leaderId: string;
  supporterIds: string[];
}

export type FacilityKind = 'qi_array' | 'alchemy_hall' | 'scripture_pavilion' | 'defense_array' | 'spirit_mine';

export interface SectMonthlyEconomy {
  tick: number;
  taxes: number;
  mining: number;
  upkeep: number;
  net: number;
}

export interface GuardAssignment {
  locationId: string;
  assignedTick: number;
  expiresTick: number;
}

export interface Sect {
  inactiveSinceTick?:number;
  id: string;
  name: string;
  alignment: '正道' | '魔道' | '中立';
  color: string;
  doctrine: string;
  reputation: number;
  spiritStones: number;
  headquartersId: string;
  pavilion: Technique[];
  leaderId?: string;
  officeVacancy?: { eventId: string; tick: number };
  succession?: SectSuccession;
  facilities: Record<FacilityKind, number>;
  arrayHp: number;
  arrayMaxHp: number;
  monthlyEconomy?: SectMonthlyEconomy;
}

export interface Rumor {
  id: string;
  subject: string;
  locationId?: string;
  originTick: number;
  learnedTick: number;
  provenance: 'witness' | 'conversation' | 'flying_sword' | 'fabricated';
  confidence: number; // 0–100, perceived credibility, not objective truth
  hops: number;
  sourceCultivatorId?: string;
  originEventId?: string;
  originSourceCultivatorId?: string;
  witnessScope?: 'participants';
  lead?: boolean;
}

export type SchemeKind = 'infiltration' | 'foundation_pill' | 'vengeance' | 'artifact_heist';

export interface SchemeStep {
  label: string;
  completedTick?: number;
}

export interface CultivatorScheme {
  id: string;
  kind: SchemeKind;
  title: string;
  status: 'active' | 'completed' | 'failed';
  startedTick: number;
  finishedTick?: number;
  stepIndex: number;
  steps: SchemeStep[];
  targetCultivatorId?: string;
  targetLocationId?: string;
  artifactName?: string;
  outcome?: string;
}

export type TribulationStance = 'guard' | 'focus' | 'defy';

export interface TribulationTrial {
  heartTheatreArmed?: true;
  heartGuide?: HeartDemonGuide;
  heartDemon?: HeartDemonFrame;
  id: string;
  targetRealm: CultivationRealm;
  startedTick: number;
  stage: 'lightning' | 'heart_demon' | 'passed' | 'failed';
  nextWave: number;
  totalWaves: number;
  pressure: number; // 0–100
  interruptions: number;
  resolvedTick?: number;
  lastOutcome?: string;
  lastActedTick?: number;
}

/** Compact proven memory for ordinary choices, separate from narrative traces. */
export type OrdinaryAction = 'REST'|'CULTIVATE'|'SOCIALIZE'|'EXPLORE'|'GATHER_HERBS';
export interface OrdinaryActionEvidence {
  readonly action:OrdinaryAction;readonly tick:number;readonly streak:1|2|3;
}
/** Recorded ordinary public furnace successes since this save began using the Hall rules. */
export interface PublicAlchemyPractice {
  siteId: string;
  firstTick: number;
  lastTick: number;
  successes: number;
  bestGrade: 1 | 2 | 3;
}
/** Optional authored metadata for fictional portrait styling only. */
export type FictionalGender = 'woman' | 'man';

export interface Cultivator {
  heartDemonAftermath?: HeartDemonAftermath;
  gender?: FictionalGender;
  clanHeritage?: CultivationClanHeritage;
  publicAlchemy?: PublicAlchemyPractice[];
  heavenlyAlchemy?: HeavenlyAlchemyState;
  daoPath?: DaoPathState;
  destinyTraits?: DestinyTraitProgress;
  forbiddenScars?: ForbiddenArtScar[];
  positionPlane?:UpperPositionPlane|FrontierPositionPlane|'immortal';
  ordinaryActionEvidence?: OrdinaryActionEvidence;
  id: string;
  name: string;
  title: string;
  sectId: string;
  sectRank: SectRank;
  contribution: number;
  transgressions: number;
  disciplineRevision?: number;
  realm: CultivationRealm;
  realmStage: number; // 1-9
  qiProgress: number; // 0-100
  hp: number;
  maxHp: number;
  combatPower: number;
  age: number;
  lifespan: number;
  personality: PersonalityTrait;
  locationId: string;
  spiritStones: number;
  karma: number; // 业力/气运 (-100 to +100)
  currentAction: ActionType;
  innerMonologue: string; // Latest CoT / inner thought
  secretGoal: string;
  spiritRoot: SpiritRoot;
  technique: Technique;
  techniqueMastery: number;
  authoredTechnique?: Technique;
  activeEdition?: ActiveScriptureEdition;
  herbs: Record<HerbId, number>;
  pills: Record<PillId, number>;
  pillToxicity: number;
  exploredTileIds: string[];
  artifacts: Artifact[];
  memories: MemoryEntry[];
  coreMemories: MemoryEntry[];
  memorySequence: number; // Monotonic across evictions
  reflections: CultivatorReflection[];
  rumors: Rumor[];
  activeScheme?: CultivatorScheme;
  tribulation?: TribulationTrial;
  guardAssignment?: GuardAssignment;
  service?: SectServiceStatus;
  namedHeirId?: string;
  alive: boolean;
}

export interface DialogueTurn {
  speakerId: string;
  speakerName: string;
  text: string;
}

export interface DialogueExchange {
  kind: 'combat' | 'trade' | 'dual_cultivation' | 'sect_diplomacy';
  source: 'utility' | 'llm';
  turns: DialogueTurn[];
}

interface EraHistoryIdentity {
  eventId:string; tick:number; year:number; month:number; locationId?:string;
}
export type EraHistoryReceipt = EraHistoryIdentity & (
  | {kind:'death';actorId:string}
  | {kind:'succession';sectId:string;previousLeaderId?:string;leaderId:string;method:'election'|'challenge'|'coup'}
  | {kind:'migration';recordId:string;fromSettlementId:string;toSettlementId:string;people:number}
  | {kind:'workshop';orderId:string;patronId:string;makerId:string;status:'completed'|'expired'|'cancelled';delivered:number}
);
export interface EraHistoryState {receipts:EraHistoryReceipt[]}

export interface WorldEvent {
  daoIntents?: DaoIntentActivation[];
  forbiddenArt?: ForbiddenArtScar;
  id: string;
  tick: number;
  year: number;
  month: number;
  title: string;
  description: string;
  category: 'breakthrough' | 'combat' | 'intrigue' | 'heavenly' | 'death' | 'diplomacy';
  actorIds: string[];
  witnessScope?: 'participants';
  dialogue?: DialogueExchange;
  /** Confirmed-share serialization marker; never a witness for dialogue or a fresh relationship scene. */
  dialogueRedacted?: true;
  duelWinnerId?: string;
  damage?: Array<{ cultivatorId: string; amount: number }>;
  locationId?: string;
}

export type CausalChronicleKind = 'siege_launched' | 'truce_signed' | 'sect_vacancy' | 'sect_election' |
  'market_buy_order' | 'market_sell_order' | 'market_shipment' | 'market_settlement';
export type CausalChronicleRelation = 'withdrew_siege' | 'filled_vacancy' | 'matched_buy_order' |
  'matched_sell_order' | 'settled_shipment';
export type CausalChronicleOutcome = 'truce_with_withdrawal' | 'truce_signed' | 'elected' | 'local_fill' |
  'delivered' | 'route_loss' | 'escort_failed' | 'endpoint_missing' | 'market_closed';
export interface CausalChroniclePredecessor {
  eventId: string;
  relation: CausalChronicleRelation;
}
export interface CausalChronicleNode {
  eventId: string;
  tick: number;
  sequence: number;
  kind: CausalChronicleKind;
  entityId: string;
  locationId?: string;
  predecessors: CausalChroniclePredecessor[];
  outcome?: CausalChronicleOutcome;
}
export interface CausalChronicleState {
  nodes: CausalChronicleNode[];
  nextSequence: number;
}

export interface LLMConfig {
  enabled: boolean;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
}

export interface LLMDecisionPayload {
  targetHeartTrialId?: string;
  heartDemonChoice?: HeartDemonChoice;
  targetHeartDemonAftermathId?: string;
  targetForbiddenDuelId?: string;
  targetBeastDuelId?:string;
  beastDuelChoice?:BeastDuelChoice;
  forbiddenArtChoice?: ForbiddenArtChoice;
  targetGrandSiegeId?: string;
  battlefieldRevisitMove?: 'repair' | 'seek';
  calamityArrayStance?: 'joint' | 'local';
  targetCalamityHazardId?: string;
  targetBattlefieldSiegeId?: string;
  grandSiegeHeroMove?: GrandSiegeHeroMove;
  targetRoguelikeEncounterId?:string;
  roguelikeEncounterChoice?:RoguelikeEncounterChoice;
  targetDestinyOfferId?: string;
  destinyTraitChoice?: DestinyTraitId;
  innerMonologue: string;
  chosenAction: ActionType;
  waterVeinMove?: WaterVeinMove;
  frontierMove?: FrontierMovementMove;
  frontierProductionMove?: FrontierProductionMove;
  frontierTradeMove?: FrontierTradeMove;
  frontierPortMove?: FrontierPortLocalMove;
  frontierPortTradeMove?: FrontierPortTradeMove;
  targetFrontierPortTradeId?: string;
  frontierDrylandMove?: FrontierDrylandMove;
  frontierDrylandFeed?: 'root'|'salt';
  frontierDrylandTradeMove?: FrontierDrylandTradeMove;
  targetFrontierDrylandTradeId?: string;
  targetFrontierSiteId?: FrontierSiteId|FrontierAnchorId;
  targetFrontierTradeId?: string;
  northGateRenewalMove?: NorthGateRenewalMove;
  targetNorthGateRenewalId?: string;
  upperPassageMove?: UpperPassageMove;
  upperArrayFieldMove?: UpperArrayFieldMove;
  upperArrayFieldLocalMove?: UpperArrayFieldLocalMove;
  upperArrayFieldTradeMove?: UpperArrayFieldTradeMove;
  targetUpperArrayFieldSiteId?: UpperArrayFieldSiteId|'realm-upper-council';
  targetUpperArrayFieldTradeId?: string;
  targetUpperPassageNodeId?: UpperPassageNodeId;
  northWellReviewMove?: NorthWellReviewMove;
  northMiningMove?: NorthMiningCharterMove;
  northMiningStance?: NorthMiningStance;
  targetNorthMiningCharterId?: string;
  danxiaMedicineMove?: DanxiaMedicineMove;
  danxiaReviewMove?: DanxiaReviewMove;
  targetDanxiaReviewId?: string;
  targetSettlementRecordId?: string;
  targetDanxiaShortageId?: string;
  targetDanxiaMedicineId?: string;
  observatoryMove?: ObservatoryMove;
  observatoryStation?: 'edge';
  alignedWeatherMove?: AlignedWeatherMove;
  targetAlignedWeatherId?: string;
  targetObservatoryTick?: number;
  targetLocationId?: string;
  targetCultivatorId?: string;
  spokenLine?: string;
  rumorIntent?: 'FABRICATE' | 'EXAGGERATE';
  proposedScheme?: SchemeKind;
  targetTuitionId?: string;
  targetOathId?: string;
  arbitrationMove?: OathArbitrationMove;
  targetTenderTick?: number;
  targetScoreId?: string;
  oathTerm?: OathTerm;
  marketGood?: MarketGood;
  marketQuantity?: number;
  marketLimitPrice?: number;
  targetMarketOrderId?: string;
  targetSettlementId?: string;
  targetVolunteerId?: string;
  targetWitnessEventId?: string;
  targetWitnessClaimId?: string;
  targetEstateId?: string;
  doctrineMove?: DoctrineMove;
  doctrineFoundingMove?:DoctrineFoundingMove;
  doctrineMaturityMove?:DoctrineMaturityMove;
  targetDoctrineFoundingId?:string;
  doctrineTheme?: ReflectionTheme;
  targetDoctrineSchoolId?: string;
  targetDoctrineProposalId?: string;
  relocationMove?: RelocationMove;
  targetRelocationId?: string;
  recollectionMove?: RecollectionMove;
  relicMove?: RelicMove;
  exhibitMove?: RelicExhibitMove;
  targetRelicExhibitId?: string;
  roadMove?: RoadMove;
  targetRoadId?: string;
  targetRelicFragmentId?: string;
  targetRelicSetId?: RelicSetId;
  editionMove?: ScriptureMove;
  targetScriptureOriginalId?: string;
  targetScriptureEditionId?: string;
  seasonMove?: CompetitionMove;
  escortMove?: EscortMove;
  marketFreightMove?: MarketFreightMove;
  targetShipmentId?: string;
  targetEscortId?: string;
  targetHazardId?: string;
  ceasefireMove?: CeasefireMove;
  targetCeasefireId?: string;
  commonsMove?: CommonsMove;
  targetCommonsId?: string;
  targetCommonsThirdSectId?: string;
  targetTerrainTileId?: string;
  serviceMove?: SectServiceMove;
  courierMove?: CourierMove;
  courierHandoffMove?: CourierHandoffMove;
  targetCourierId?: string;
  targetDispatchId?: string;
  targetDispatchSourceId?: string;
  dispatchCue?: DispatchCue;
  villageWorkKind?: VillageWorkKind;
  guardianMove?: HouseholdGuardianMove;
  targetGuardianshipId?: string;
  leaseMove?: TerritorialLeaseMove;
  targetTerritorialLeaseId?: string;
  formationMove?: FormationMove;
  targetFormationLinkId?: string;
  infirmaryMove?: InfirmaryMove;
  careFollowupMove?: CareFollowupMove;
  targetCareFollowupId?: string;
  targetInfirmaryCaseId?: string;
  habitatMove?: HabitatMove;
  targetBeastReleaseId?: string;
  chronicleErrataMove?: ChronicleErrataMove;
  targetChronicleSourceId?: string;
  chronicleReliefReading?: ChronicleReliefReading;
  pilgrimageMove?: PilgrimageMove;
  targetPilgrimageId?: string;
  targetPilgrimageNextStopId?: string;
  creditMove?: SectCreditMove;
  targetCreditId?: string;
  sanctuaryMove?: SanctuaryMove;
  targetSanctuaryId?: string;
  researchMove?: ResearchMove;
  researchTopic?: ResearchTopic;
  targetResearchId?: string;
  researchWithdrawReason?: ResearchWithdrawalReason;
  targetTechniqueId?: string;
  targetHerbId?: HerbId;
  targetPillId?: PillId;
  ascensionMove?: AscensionMove;
  targetAscensionTrialId?: string;
  clanMove?: ClanMove;
  targetCultivationUnionId?: string;
  auctionMove?: ImmortalAuctionMove;
  targetAuctionLotId?: string;
  targetAuctionArtifactId?: string;
  targetAuctionPillId?: ImmortalAuctionPillId;
  auctionBidStones?: number;
  auctionQuoteBidCount?: number;
  targetAuctionAmbushLotId?: string;
  daoPathMove?: DaoPathMove;
  targetDaoPathId?: DaoPathId;
  heavenlyAlchemyMove?: HeavenlyAlchemyMove;
  targetHeavenlyRecipeId?: HeavenlyRecipeId;
  heavenlyAlchemyHeat?: HeavenlyHeat;
  heavenlyAlchemyQuality?: HeavenlyQuality;
  targetArtifactId?: string;
  forgeTier?: ArtifactTier;
  probationMove?: ProbationMove;
  targetProbationId?: string;
  targetExpulsionId?: string;
  probationFirstVillageId?: string;
  probationSecondVillageId?: string;
  probationVote?: ProbationVote;
  workshopMove?: WorkshopMove;
  workshopReleaseMove?: WorkshopReleaseMove;
  workshopEstateMove?: WorkshopEstateMove;
  waypostMealMove?: WaypostMealMove;
  disasterShelterMove?: DisasterShelterMove;
  targetDisasterShelterId?: string;
  craftTrainingMove?: CraftTrainingMove;
  targetCraftTraineeId?: string;
  targetCraftTrainingId?: string;
  targetWaypostMealId?: string;
  scribeCommissionMove?: ScribeCommissionMove;
  targetScribeCommissionId?: string;
  targetWorkshopReleaseId?: string;
  furnaceMove?: 'reserve' | 'cancel';
  furnaceSafetyMove?: FurnaceSafetyMove;
  damageAssuranceMove?: DamageAssuranceMove;
  targetDamageAssuranceId?: string;
  targetFurnaceSafetyId?: string;
  targetFurnaceReservationId?: string;
  sparringMove?: SparringMove;
  sparringRounds?: 1 | 2;
  targetSparringId?: string;
  rescueMove?: ExpeditionRescueMove;
  targetExpeditionRescueId?: string;
  targetDungeonRoomId?: DungeonRoom;
  dungeonMove?: DungeonMove;
  shortShiftMove?: ShortShiftMove;
  targetShortShiftId?: string;
  boundaryReliefMove?: BoundaryReliefMove;
  targetBoundaryReliefId?: string;
  cohortMove?: ApprenticeCohortMove;
  housingMove?: HousingMove;
  targetHousingHouseholdId?: string;
  targetHousingClaimId?: string;
  mentorTransferMove?: MentorTransferMove;
  targetOldMentorId?: string;
  targetMentorReleaseId?: string;
  targetMentorTransferId?: string;
  cohortInviteeIds?: string[];
  targetCohortId?: string;
  nameMove?: HouseholdNameMove;
  householdAlias?: string;
  targetHouseholdNameId?: string;
  restitutionMove?: CaravanRestitutionMove;
  granaryMove?: VillageGranaryMove;
  villageSupplyMove?: VillageSupplyMove;
  routeWarningMove?: RouteWarningMove;
  pavilionLoanMove?: PavilionLoanMove;
  workshopCapacityMove?: WorkshopCapacityMove;
  civicMemorialMove?: CivicMemorialMove;
  villageFairMove?: VillageFairMove;
  stipendMove?:SectStipendMove;
  seedMove?:SeedCultureMove;
  toolLoanMove?:ToolLoanMove;
  targetToolLoanId?:string;
  targetSeedLotId?:string;
  targetSeedPlotId?:string;
  targetStipendId?:string;
  targetVillageFairId?: string;
  targetCivicDeedId?: string;
  targetCivicMemorialId?: string;
  targetPavilionLoanId?: string;
  targetRouteObservationId?: string;
  targetRouteWarningId?: string;
  targetVillageSupplyId?: string;
  targetRestitutionId?: string;
  targetWorkshopId?: string;
  workshopTier?: WorkshopTier;
  workshopQuantity?: 1 | 2;
  workshopQualityFloor?: WorkshopQualityFloor;
  tribulationStance?: TribulationStance;
  facilityKind?: FacilityKind;
  targetSectId?: string;
  targetOccasionId?: string;
  targetBountyId?: string;
  targetBeastId?: string;
}

export interface SectDiplomaticRelation {
  sectAId: string;
  sectBId: string;
  affinity: number; // -100 to 100
  pact: 'neutral' | 'alliance' | 'war';
  sinceTick: number;
  lastActionTick?: number;
}

export interface SectSiege {
  theatre?: GrandSiegeTheatre;
  id: string;
  attackerSectId: string;
  defenderSectId: string;
  destinationId: string;
  participantIds: string[];
  status: 'marching' | 'sieging' | 'victory' | 'repelled' | 'withdrawn';
  startedTick: number;
  rounds: number;
  lastResolvedTick?: number;
  outcome?: string;
}

export interface SectTribute {
  id: string;
  demanderSectId: string;
  targetSectId: string;
  amount: number;
  status: 'pending' | 'paid' | 'rejected';
  startedTick: number;
  resolvedTick?: number;
}

export interface TournamentBout {
  round: number;
  firstId: string;
  secondId?: string;
  winnerId: string;
}

export interface ExpeditionResult {
  cultivatorId: string;
  tick: number;
  outcome: 'loot' | 'wounded' | 'death' | 'escaped';
  description: string;
}

export interface WorldOccasion {
  arena?: TournamentArena;
  dungeon?: ExpeditionDungeon;
  omenId?: string;
  anchorSiteId?: string;
  id: string;
  kind: 'tournament' | 'expedition';
  title: string;
  locationId: string;
  startedTick: number;
  registrationClosesTick: number;
  expiresTick: number;
  status: 'registration' | 'running' | 'completed' | 'cancelled';
  participantIds: string[];
  remainingIds: string[];
  bouts: TournamentBout[];
  expeditions: ExpeditionResult[];
  round: number;
  championId?: string;
  lastResolvedTick?: number;
}

export interface BountyEntry {
  id: string;
  targetCultivatorId: string;
  reason: string;
  issuedTick: number;
  reward: number;
  status: 'open' | 'claimed' | 'withdrawn';
  sponsorSectIds: string[];
  escrow: Array<{ sectId: string; amount: number }>;
  hunterId?: string;
  settledTick?: number;
}

export type TerrainBiome = '灵山' | '毒沼' | '剑冢' | '荒漠' | '魔渊' | '坊市';

export interface MapTile {
  id: string;
  col: number;
  row: number;
  biome: TerrainBiome;
  spiritQi: number;
  ownerSectId?: string;
}

export interface WorldTerrain {
  seed: number;
  columns: number;
  rows: number;
  tiles: MapTile[];
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapMovementTrail {
  cultivatorId: string;
  tick: number;
  fromLocationId: string;
  toLocationId: string;
  points: MapPoint[];
}

export interface MapEffect {
  id: string;
  tick: number;
  kind: 'damage' | 'breakthrough' | 'clash' | 'lightning';
  locationId: string;
  actorIds: string[];
  text?: string;
}

export interface MapPresentation {
  tick: number;
  trails: MapMovementTrail[];
  effects: MapEffect[];
}

export type GodBrushKind = 'paint_vein' | 'meteor' | 'beast_tide' | 'cursed_miasma';

export interface MapHazard {
  id: string;
  kind: Exclude<GodBrushKind, 'paint_vein'>;
  tileId: string;
  createdTick: number;
  expiresTick: number;
  intensity: number;
}

export type RouteWarningMove = 'post'|'corroborate'|'retract';
export type RouteWarningHazardProof = Pick<MapHazard,'id'|'kind'|'tileId'|'createdTick'|'expiresTick'|'intensity'>;
export interface RouteWarningObservation {
  id:string;
  actorId:string;
  journeyId:string;
  partyIds:[string,string];
  legIndex:number;
  fromPathIndex:number;
  toPathIndex:number;
  fromTileId:string;
  toTileId:string;
  exitTileId?:string;
  exitPathIndex?:number;
  observedTick:number;
  hazard:RouteWarningHazardProof;
}
export interface RouteWarningNotice {
  id:string;
  postedTick:number;
  expiresTick:number;
  retractedTick?:number;
  observation:RouteWarningObservation;
  corroboration?:{tick:number;observation:RouteWarningObservation};
}
export type PavilionLoanMove = 'staff'|'shelve'|'checkout'|'read'|'return';
export interface PavilionCopy {
  editionId:string;
  originalId:string;
  sectId:string;
  siteId:string;
  shelvedTick:number;
  shelvedById:string;
  shelvingShiftId:string;
}
export interface PavilionStaffShift {
  id:string;
  actorId:string;
  sectId:string;
  siteId:string;
  signedTick:number;
  startsTick:number;
  endsTick:number;
  lastServedTick?:number;
}
export interface PavilionLoan {
  id:string;
  editionId:string;
  borrowerId:string;
  checkoutTick:number;
  dueTick:number;
  checkoutShiftId:string;
  read?:{tick:number;siteId:string;masteryBefore:number;masteryAfter:number;credited:boolean};
  returned?:{tick:number;shiftId:string};
}
export interface PavilionLoansState {
  copies:PavilionCopy[];
  shifts:PavilionStaffShift[];
  loans:PavilionLoan[];
  nextLoanId:number;
  nextShiftId:number;
}

export interface RouteWarningsState {
  nextId:number;
  nextObservationId:number;
  observations:RouteWarningObservation[];
  notices:RouteWarningNotice[];
}

export interface TerrainSuccessionCell {
  tileId: string;
  firstTick: number;
  lastStressTick: number;
  consecutiveStress: number;
  quietTicks: number;
  baselineBiome: TerrainBiome;
  baselineQi: number;
  recoverableLoss: number;
  permanentLoss: number;
  scarredBiome?: TerrainBiome;
  affectedBiome?: TerrainBiome;
  phase: 'stressed' | 'recovering' | 'recovered' | 'scarred';
  workCount: number;
  lastWorkedTick?: number;
  lastWorkedBy?: string;
}

export interface TerrainSuccessionState {
  cells: TerrainSuccessionCell[];
  lastAdvancedTick?: number;
}

export interface SpiritBeast {
  id: string;
  name: string;
  kind: '妖兽' | '凶兽' | '瑞兽';
  locationId: string;
  homeLocationId: string;
  hp: number;
  maxHp: number;
  power: number;
  cultivation: number;
  alive: boolean;
  tamedBy?: string;
  nextActionTick: number;
}

export type CouncilProposal =
  | { kind: 'war'; targetSectId: string }
  | { kind: 'expel'; targetCultivatorId: string }
  | { kind: 'allocate_pill'; donorId: string; targetCultivatorId: string };
export type CouncilVote = 'support' | 'oppose' | 'abstain';
export type CouncilSource = 'utility' | 'llm';
export interface CouncilPlan {
  id: string;
  tick: number;
  sectId: string;
  proposal: CouncilProposal;
  voterIds: string[];
  title: string;
  summary: string;
}
export interface CouncilBallotReplacement {
  voterId: string;
  vote: CouncilVote;
  reason: string;
  opening?: string;
}
export interface CouncilBallot extends Omit<CouncilBallotReplacement, 'opening'> {
  source: CouncilSource;
}
export interface CouncilRound {
  round: 1 | 2;
  turns: Array<{ voterId: string; text: string; source: CouncilSource }>;
}
export interface CouncilRecord extends CouncilPlan {
  rounds: CouncilRound[];
  ballots: CouncilBallot[];
  tally: { support: number; oppose: number; abstain: number; required: number };
  status: 'passed' | 'rejected' | 'stale';
  outcome: string;
}

export interface ChronicleAnchor {
  id: string;
  tick: number;
  year: number;
  month: number;
  title: string;
  description: string;
  dialogue?: DialogueExchange;
  category: WorldEvent['category'];
  actorIds: string[];
  locationId?: string;
}
export interface ChronicleBiography {
  actorId: string;
  name: string;
  realm: CultivationRealm;
  sectName?: string;
  anchorIds: string[];
}
export type ChapterStoryFocal =
  { kind: 'ensemble' } |
  { kind: 'lead'; actorId: string; arcId: string; eventIds: string[] };

export interface ProtagonistEvidence {
  eventId: string;
  tick: number;
  category: WorldEvent['category'];
  attribution: 'named_first' | 'direct_quote' | 'named_participant';
}
export interface ProtagonistArc {
  id: string;
  actorId: string;
  openedTick: number;
  predecessorArcId?: string;
  handoff?: ProtagonistHandoff;
  opening: ProtagonistEvidence[];
  support: ProtagonistEvidence[];
  endedTick?: number;
  closeReason?: 'public_death' | 'receded' | 'evidence_lost';
  death?: ProtagonistEvidence;
}
export interface WitnessedPersonalScene {
  eventId: string;
  tick: number;
  year: number;
  month: number;
  siteId: string;
  kind: 'duel' | 'socialize' | 'breakthrough';
  actorIds: string[];
  witnessIds: string[];
}
export interface WitnessedPersonalStoryState { scenes: WitnessedPersonalScene[] }

export interface ProtagonistSuccessionState {
  arcs: ProtagonistArc[];
  lastEvaluatedTick?: number;
}
export interface ChronicleChapterPlan {
  storyFocal?: ChapterStoryFocal;
  id: string;
  chapterNumber: number;
  startTick: number;
  endTick: number;
  title: string;
  anchors: ChronicleAnchor[];
  biographies: ChronicleBiography[];
}
export interface ChronicleChapter extends ChronicleChapterPlan {
  body: string;
  source: 'utility' | 'llm';
}
export interface ChronicleArchive {
  anchors: ChronicleAnchor[];
  chapters: ChronicleChapter[];
}

export type AvatarInteractionMode = 'avatar' | 'ring';
export type AvatarIntent = 'guide' | 'persuade' | 'deceive' | 'interrogate' | 'recruit';
export interface AvatarInteractionOption {
  mode: AvatarInteractionMode;
  intent: AvatarIntent;
  targetCultivatorId: string;
}
export interface AvatarInteractionRequest extends AvatarInteractionOption { message: string }
export type AvatarInteractionCommand = AvatarInteractionRequest;
export type AvatarOrder = 'REST' | 'CULTIVATE';
export type AvatarPendingOrder = { actorId: string; queuedTick: number } & (
  | { action: AvatarOrder }
  | {action:'CIVIC_MEMORIAL';civicMemorialMove:'append_relief';targetCivicMemorialId:string;targetCivicDeedId:string}
  | {action:'MARKET_FREIGHT';marketFreightMove:'offer';targetShipmentId:string;targetCultivatorId:string;targetEscortId?:never}
  | {action:'MARKET_FREIGHT';marketFreightMove:'accept'|'decline'|'withdraw';targetEscortId:string;targetShipmentId?:never;targetCultivatorId?:never}
  | {action:'DISASTER_SHELTER';disasterShelterMove:'offer';targetCultivatorId:string;targetDisasterShelterId?:never}
  | {action:'DISASTER_SHELTER';disasterShelterMove:'accept'|'decline'|'withdraw'|'return';targetDisasterShelterId:string;targetCultivatorId?:never}
  | {action:'CRAFT_TRAINING';craftTrainingMove:'offer';targetCultivatorId:string;targetCraftTraineeId:string;targetCraftTrainingId?:never}
  | {action:'CRAFT_TRAINING';craftTrainingMove:'join'|'decline'|'blank'|'finish'|'withdraw';targetCraftTrainingId:string;targetCultivatorId?:never;targetCraftTraineeId?:never}
  | {action:'WAYPOST_MEAL';waypostMealMove:'offer';targetCultivatorId:string;targetWaypostMealId?:never}
  | {action:'WAYPOST_MEAL';waypostMealMove:'accept'|'decline'|'withdraw';targetWaypostMealId:string;targetCultivatorId?:never}
  | {action:'WORKSHOP_ESTATE';workshopEstateMove:'offer'|'accept'|'decline';targetWorkshopId:string}
  | {action:'SCRIBE_COMMISSION';scribeCommissionMove:'offer';targetCultivatorId:string;targetChronicleSourceId:string;targetScribeCommissionId?:never}
  | {action:'SCRIBE_COMMISSION';scribeCommissionMove:'accept'|'decline'|'withdraw'|'verify'|'deliver';targetScribeCommissionId:string;targetCultivatorId?:never;targetChronicleSourceId?:never}
  | {action:'WORKSHOP_RELEASE';workshopReleaseMove:'propose';targetWorkshopId:string;targetWorkshopReleaseId?:never}
  | {action:'WORKSHOP_RELEASE';workshopReleaseMove:'accept'|'decline';targetWorkshopId:string;targetWorkshopReleaseId:string}
  | { action: 'WATER_VEIN'; waterVeinMove: WaterVeinMove; targetLocationId: 'loc-vein-north' }
  | { action:'NORTH_MINING_CHARTER'; northMiningMove:'propose'; northMiningStance:NorthMiningStance; targetNorthMiningCharterId?:never }
  | { action:'NORTH_MINING_CHARTER'; northMiningMove:'sign'; targetNorthMiningCharterId:string; northMiningStance?:never }
  | { action:'NORTH_WELL_REVIEW'; northWellReviewMove:NorthWellReviewMove;targetNorthMiningCharterId:string }
  | { action:'UPPER_PASSAGE';upperPassageMove:UpperPassageMove;targetUpperPassageNodeId:UpperPassageNodeId }
  | UpperArrayFieldMovementOption
  | UpperArrayFieldLocalOption
  | {action:'UPPER_ARRAY_FIELD_TRADE';upperArrayFieldTradeMove:'propose';targetCultivatorId:string}
  | {action:'UPPER_ARRAY_FIELD_TRADE';upperArrayFieldTradeMove:Exclude<UpperArrayFieldTradeMove,'propose'>;targetUpperArrayFieldTradeId:string}
  | { action:'FRONTIER';frontierMove:Exclude<FrontierMovementMove,'exit'>;targetFrontierSiteId:FrontierSiteId }
  | { action:'FRONTIER';frontierMove:'exit';targetFrontierSiteId:FrontierAnchorId }
  | { action:'FRONTIER_PRODUCTION';frontierProductionMove:FrontierProductionMove;targetFrontierSiteId:FrontierSiteId }
  | { action:'FRONTIER_TRADE';frontierTradeMove:'propose';targetCultivatorId:string }
  | { action:'FRONTIER_TRADE';frontierTradeMove:Exclude<FrontierTradeMove,'propose'>;targetFrontierTradeId:string }
  | { action:'FRONTIER_PORT';frontierPortMove:FrontierPortLocalMove;targetFrontierSiteId:FrontierSiteId }
  | { action:'FRONTIER_PORT_TRADE';frontierPortTradeMove:'propose';targetCultivatorId:string }
  | { action:'FRONTIER_PORT_TRADE';frontierPortTradeMove:Exclude<FrontierPortTradeMove,'propose'>;targetFrontierPortTradeId:string }
  | FrontierDrylandLocalOption
  | { action:'FRONTIER_DRYLAND_TRADE';frontierDrylandTradeMove:'propose';targetCultivatorId:string }
  | { action:'FRONTIER_DRYLAND_TRADE';frontierDrylandTradeMove:Exclude<FrontierDrylandTradeMove,'propose'>;targetFrontierDrylandTradeId:string }
  | { action:'NORTH_GATE_RENEWAL';northGateRenewalMove:NorthGateRenewalMove;targetNorthGateRenewalId:string }
  | { action: 'SALVAGE_ARTIFACT'; targetArtifactId: string; targetLocationId: string }
  | { action:'DOCTRINE_MATURITY';doctrineMaturityMove:DoctrineMaturityMove;targetDoctrineFoundingId:string }
  | { action:'DOCTRINE_FOUNDING'; doctrineFoundingMove:DoctrineFoundingMove; targetDoctrineFoundingId?:string;
    targetDoctrineSchoolId?:string;targetRelocationId?:string }
  | { action: 'DANXIA_REVIEW'; danxiaReviewMove: DanxiaReviewMove; targetDanxiaReviewId:string; targetSettlementRecordId?:string }
  | { action: 'DANXIA_MEDICINE'; danxiaMedicineMove: DanxiaMedicineMove; targetDanxiaShortageId?:string; targetDanxiaMedicineId?:string; targetCultivatorId?:string }
);
export interface AvatarTranscriptEntry extends AvatarInteractionRequest {
  id: string;
  tick: number;
  actorId?: string;
  reply: string;
  outcome: 'agreed' | 'resisted' | 'revealed' | 'recruited';
  source: 'utility' | 'llm';
  effect: string;
}
export interface PlayerAvatarState {
  audience?:RingAudienceState;
  possessedId?: string;
  possessionUntilTick?: number;
  switchAvailableTick: number;
  essence: number;
  lastRefreshTick: number;
  pendingOrder?: AvatarPendingOrder;
  transcript: AvatarTranscriptEntry[];
}

export interface WorldRandomState {
  algorithm: 'mulberry32-v1';
  seed: number;
  state: number;
}

export interface TuitionOffer {
  id: string;
  mentorId: string;
  studentId: string;
  technique: Technique;
  createdTick: number;
  expiresTick: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  resolvedTick?: number;
  outcome?: string;
}
export interface MentorshipLineage {
  mentorId: string;
  studentId: string;
  technique: Technique;
  formedTick: number;
  lastLessonTick: number;
  lessons: number;
  flaw: number;
}
export type MentorTransferMove = 'end' | 'offer' | 'accept' | 'decline' | 'teach' | 'attend';
export interface MentorRelease {
  id: string;
  studentId: string;
  oldMentorId: string;
  sourceTuitionId: string;
  techniqueId: string;
  formedTick: number;
  lastLessonTick: number;
  endedTick: number;
  endedById: string;
}
export interface MentorTransfer {
  id: string;
  releaseId: string;
  studentId: string;
  newMentorId: string;
  techniqueId: string;
  sectId: string;
  siteId: string;
  offeredTick: number;
  expiresTick: number;
  status: 'offered' | 'accepted' | 'declined' | 'expired' | 'held';
  acceptTick?: number;
  periodTick?: number;
  teachTick?: number;
  attendTick?: number;
  closedTick?: number;
  reason?: 'offer_expired' | 'absent_signature' | 'unavailable' | 'no_budget';
  lesson?: {tick:number; masteryBefore:number; masteryAfter:number; instructionSpent:1};
}
export interface MentorTransferState { releases: MentorRelease[]; transfers: MentorTransfer[]; nextId: number }
export interface TeachingBudget { mentorId: string; tick: number; spent: number }
export interface MentorshipState {
  offers: TuitionOffer[];
  lineage: MentorshipLineage[];
  budgets: TeachingBudget[];
  lastMaintainedTick?: number;
}

export type OathTerm = 'foundation_pill' | 'jade_herb';
export interface OathEvidence {
  tick: number;
  actorId: string;
  kind: 'tender' | 'delivery';
  locationId: string;
  quantity: number;
  requesterPresent: boolean;
}
export interface OathContract {
  id: string;
  requesterId: string;
  providerId: string;
  locationId: string;
  term: OathTerm;
  quantity: number;
  payment: number;
  collateral: number;
  offeredTick: number;
  offerExpiresTick: number;
  deadlineTick?: number;
  appealUntilTick?: number;
  status: 'offered' | 'active' | 'declined' | 'fulfilled' | 'breached' | 'excused' | 'expired';
  escrow: { payment: number; collateral: number };
  evidence: OathEvidence[];
  appeal?: { tick: number; appellantId: string; status: 'upheld' | 'rejected'; reason: string };
  settledTick?: number;
  outcome?: string;
}
export interface OathState { contracts: OathContract[]; nextId: number }

export type OathArbitrationMove = 'open' | 'join' | 'appoint' | 'accept' | 'recuse' | 'file' | 'vote_refund' | 'vote_inconclusive';
export type ArbitrationRecusal = 'voluntary' | 'faction' | 'personal_tie' | 'prior_obligation' | 'unavailable';
export interface ArbitrationAppointment {
  side: 'requester' | 'provider';
  appointeeId: string;
  nominatedTick: number;
  acceptedTick?: number;
  endedTick?: number;
  recusal?: ArbitrationRecusal;
  vote?: 'refund' | 'inconclusive';
  votedTick?: number;
}
export interface OathTenderObservation {
  oathId: string;
  tenderTick: number;
  siteId: string;
  observerIds: string[];
}
export interface OathArbitrationCase {
  id: string;
  oathId: string;
  siteId: string;
  requesterId: string;
  providerId: string;
  tenderTick: number;
  openedTick: number;
  joinUntilTick: number;
  joinedTick?: number;
  expiresTick?: number;
  status: 'offered' | 'hearing' | 'closed';
  appointments: ArbitrationAppointment[];
  filing?: { observerId: string; tick: number };
  closedTick?: number;
  disposition?: 'refund' | 'inconclusive' | 'unjoined' | 'external_settlement';
}
export interface OathArbitrationState { cases: OathArbitrationCase[]; observations: OathTenderObservation[] }

export type MarketGood = HerbId | PillId;
export interface MarketOrder {
  id: string;
  sequence: number;
  actorId: string;
  locationId: string;
  side: 'buy' | 'sell';
  good: MarketGood;
  quantity: number;
  remaining: number;
  limitPrice: number;
  escrowStones: number;
  escrowGoods: number;
  placedTick: number;
  expiresTick: number;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  settledTick?: number;
}
export interface MarketShipment {
  id: string;
  sequence: number;
  buyOrderId: string;
  sellOrderId: string;
  buyerId: string;
  sellerId: string;
  originId: string;
  destinationId: string;
  good: MarketGood;
  quantity: number;
  unitPrice: number;
  departedTick: number;
  arrivalTick: number;
  status: 'in_transit' | 'delivered' | 'lost' | 'returned';
  settledTick?: number;
  reason?: string;
}
export interface MarketReceipt {
  id: string;
  sequence: number;
  buyerId: string;
  sellerId: string;
  originId: string;
  destinationId: string;
  good: MarketGood;
  quantity: number;
  unitPrice: number;
  tick: number;
  status: 'local_fill' | 'delivered' | 'lost' | 'returned';
  shipmentId?: string;
  reason?: string;
}
export interface MarketState {
  orders: MarketOrder[];
  shipments: MarketShipment[];
  receipts: MarketReceipt[];
  nextId: number;
}

export interface MortalVolunteer {
  gender?: FictionalGender;
  id: string;
  name: string;
  age: number;
  spiritRoot: SpiritRoot;
  willingness: number;
  aptitude: number;
  enlistedCultivatorId?: string;
  cohortYear?: number;
}
export interface MortalSettlement {
  id: string;
  locationId: string;
  name: string;
  population: number;
  capacity: number;
  stress: number;
  volunteers: MortalVolunteer[];
  nextVolunteerSequence: number;
  juvenileCohorts: Array<{ bornTick: number; count: number }>;
  lastCohortYear?: number;
  lastRecruitTick?: number;
  lastDisasterTick?: number;
  lastReliefTick?: number;
}
export interface MortalAgeCohort {
  bornTick: number;
  count: number;
}
export interface MortalOldAgeSlice extends MortalAgeCohort {
  householdId: string;
}
export interface SettlementRecord {
  id: string;
  tick: number;
  kind: 'disaster' | 'migration' | 'relief' | 'recruitment' | 'growth' | 'old_age';
  settlementId: string;
  targetSettlementId?: string;
  actorId?: string;
  sectId?: string;
  volunteerId?: string;
  cultivatorId?: string;
  people: number;
  stones: number;
  herbs: number;
  description: string;
  oldAgeCohorts?: MortalOldAgeSlice[];
}
export type CivicMemorialMove = 'propose'|'verify'|'append_relief';
export interface CivicErrataEvidence {
  retellings:Array<{id:string;tick:number;reading:ChronicleReliefReading}>;
  correction?:{id:string;tick:number;reading:'full_supplies'};
}
export type VillageFairMove = 'announce'|'reserve';
export type VillageFairClosure='site_hazard'|'sponsor_absent'|'venue_missing';
export interface VillageFairStall {
  merchantId:string;
  orderId:string;
  reservedTick:number;
  feeEscrow:number;
  status:'reserved'|'paid'|'refund_due'|'refunded';
  settledTick?:number;
  releaseReason?:'fair_cancelled'|'merchant_absent'|'order_unavailable';
  offering?:{good:MarketGood;quantity:number;unitPrice:number};
}
export interface VillageFair {
  id:string;
  settlementId:string;
  siteId:string;
  sponsorId:string;
  sponsorDonationTick:number;
  sponsorDonationKind:VillageGranaryDonation;
  announcedTick:number;
  claimTick:number;
  opensTick:number;
  endsTick:number;
  status:'announced'|'open'|'ended'|'cancelled';
  closedTick?:number;
  closure?:VillageFairClosure;
  hazard?:Pick<MapHazard,'id'|'kind'|'tileId'|'createdTick'|'expiresTick'|'intensity'>;
  stalls:VillageFairStall[];
}
export interface VillageFairsState { fairs:VillageFair[];nextId:number }

export interface CivicReliefDeed {
  id:string;
  reliefRecordId:string;
  settlementId:string;
  siteId:string;
  subjectId:string;
  volunteerId:string;
  householdId:string;
  name:string;
  enrolledTick:number;
  tick:number;
  stones:number;
  herbs:number;
  witnessIds:string[];
  errata?:CivicErrataEvidence;
}
export interface CivicMemorial {
  additions?: CivicMemorialAddition[];
  id:string;
  deedId:string;
  proposerId:string;
  proposerDonationTick:number;
  proposerDonationKind:VillageGranaryDonation;
  openedTick:number;
  expiresTick:number;
  status:'proposed'|'verified'|'expired';
  verification?:{tick:number;verifierId:string;subjectStatus:'recruited'|'deceased';stonesSpent:number;earthRootsSpent:number};
}
export interface CivicMemorialsState {
  deeds:CivicReliefDeed[];
  memorials:CivicMemorial[];
  nextDeedId:number;
  nextMemorialId:number;
}
export interface SettlementState {
  villages: MortalSettlement[];
  records: SettlementRecord[];
  lastAdvancedTick?: number;
}

export interface WitnessFact {
  eventId: string;
  tick: number;
  locationId: string;
  participantIds: string[];
  winnerId: string;
  witnessIds: string[];
}
export interface WitnessAttestation {
  actorId: string;
  tick: number;
  verdict: 'supports' | 'contradicts';
}
export interface WitnessClaim {
  id: string;
  sourceEventId: string;
  publicationEventId: string;
  claimantId: string;
  subjectId: string;
  locationId: string;
  filedTick: number;
  deadlineTick: number;
  challengeUntilTick: number;
  status: 'pending' | 'disputed' | 'corroborated' | 'retracted';
  attestations: WitnessAttestation[];
  appeal?: { tick: number; actorId: string; verdict: 'upheld' | 'rejected'; reason: string };
  settledTick?: number;
  reputationSectId?: string;
  reputationPenalty: number;
  reputationRestored: number;
  reason?: string;
}
export interface WitnessState {
  facts: WitnessFact[];
  claims: WitnessClaim[];
  nextId: number;
}

export interface EstateAssets {
  stones: number;
  herbs: Record<HerbId, number>;
  pills: Record<PillId, number>;
  artifacts: Artifact[];
}
export interface EstateDistribution extends Omit<EstateAssets, 'artifacts'> {
  artifactIds: string[];
}
export interface EstateEligibility {
  actorId: string;
  basis: 'nomination' | 'bond' | 'sect';
  strength: number;
}
export interface EstateClaim extends EstateEligibility {
  tick: number;
}
export interface EstateRecord {
  id: string;
  deceasedId: string;
  locationId: string;
  openedTick: number;
  closesTick: number;
  namedHeirId?: string;
  sponsorSectId?: string;
  status: 'open' | 'settled' | 'unclaimed';
  holdings: EstateAssets;
  distributed: EstateDistribution;
  eligibleHeirs: EstateEligibility[];
  claims: EstateClaim[];
  beneficiaryId?: string;
  settledTick?: number;
  memorial?: { tick: number; organizerId: string; attendeeIds: string[]; relationshipImpacts: number };
}
export interface EstateState {
  entries: EstateRecord[];
}

export type PublicTraceAction = 'REST' | 'CULTIVATE' | 'BREAKTHROUGH' | 'SOCIALIZE' | 'EXPLORE' | 'FACE_TRIBULATION';
export type TraceReasonCode = 'recover' | 'cultivate' | 'ready' | 'social' | 'travel' | 'tribulation';
export interface DecisionTraceCandidate {
  id: string;
  action: PublicTraceAction;
  score: number;
  reason: TraceReasonCode;
  targetLocationId?: string;
  targetCultivatorId?: string;
  tribulationStance?: TribulationStance;
}
export interface DecisionTraceRecord {
  id: string;
  actorId: string;
  tick: number;
  source: 'utility' | 'model' | 'avatar';
  applied: boolean;
  chosenAction: PublicTraceAction | 'redacted';
  chosenCandidateId?: string;
  candidates: DecisionTraceCandidate[];
}
export interface DecisionTraceState {
  records: DecisionTraceRecord[];
}

export type DoctrineMove = 'endorse' | 'propose_separation' | 'propose_reconciliation' | 'accept' | 'decline' | 'join' | 'leave' | 'fund_training';
export interface DoctrineSchool {
  foundedSectId?:string;
  id: string;
  parentSectId: string;
  theme: ReflectionTheme;
  founderId: string;
  stewardId?: string;
  foundedTick: number;
  status: 'attached' | 'autonomous' | 'reconciled';
  memberIds: string[];
  treasury: number;
  lastChangeTick?: number;
  lastTrainingTick?: number;
}
export interface DoctrineEndorsement {
  actorId: string;
  sectId: string;
  schoolId: string;
  theme: ReflectionTheme;
  tick: number;
  evidenceCount: number;
  score: number;
}
export interface DoctrineProposal {
  id: string;
  schoolId: string;
  kind: 'separation' | 'reconciliation';
  openedTick: number;
  expiresTick: number;
  stewardId: string;
  leaderId: string;
  amount: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'invalidated';
  votes: Array<{ actorId: string; tick: number; verdict: 'accept' | 'decline' }>;
  settledTick?: number;
  reason?: string;
}
export interface DoctrineHistory {
  id: string;
  tick: number;
  schoolId: string;
  kind: 'endorse' | 'proposal' | 'separation' | 'reconciliation' | 'declined' | 'expired' | 'invalidated' | 'join' | 'leave' | 'training';
  actorIds: string[];
  amount: number;
  support: number;
  description: string;
}
export interface DoctrineState {
  schools: DoctrineSchool[];
  endorsements: DoctrineEndorsement[];
  proposals: DoctrineProposal[];
  records: DoctrineHistory[];
  nextId: number;
}

export type WorldgenProfileId = 'classic' | 'spirit-bloom' | 'fractured-frontier';
export interface WorldGeneration {
  algorithm: 1;
  profileId: WorldgenProfileId;
  seed: number;
  birthTick: number;
  resources: Array<{ actorId: string; locationId: string; pathSteps: number }>;
}
export type RelocationMove = 'propose' | 'approve' | 'decline';
export interface RelocationPlan {
  id: string;
  sectId: string;
  originId: string;
  destinationId: string;
  status: 'voting' | 'in_transit' | 'settled' | 'aborted';
  openedTick: number;
  deadlineTick: number;
  proposerId: string;
  voterIds: string[];
  votes: Array<{ actorId: string; tick: number; approve: boolean }>;
  garrisonIds: string[];
  path: MapPoint[];
  pathIndex: number;
  stoneCost: number;
  earthCost: number;
  custody: { stones: number; pavilion: Technique[] };
  spent: boolean;
  departedTick?: number;
  settledTick?: number;
  lastAdvancedTick?: number;
  reason?: string;
}
export interface AbandonedHeadquarters {
  id: string;
  planId: string;
  sectId: string;
  originId: string;
  destinationId: string;
  tick: number;
  originalType: LocationNode['type'];
  facilities: Record<FacilityKind, number>;
  arrayHp: number;
  arrayMaxHp: number;
}
export interface RelocationState {
  plans: RelocationPlan[];
  abandonedSites: AbandonedHeadquarters[];
  nextId: number;
}

export type RecollectionMove = 'consider' | 'dismiss';
export interface ReincarnationCase {
  id: string;
  deceasedId: string;
  deathEventId: string;
  deathTick: number;
  expiresTick: number;
  status: 'awaiting_birth' | 'reserved' | 'volunteer' | 'recruited' | 'expired';
  settlementId?: string;
  birthTick?: number;
  birthSlot?: number;
  maturesTick?: number;
  volunteerId?: string;
  newActorId?: string;
  resolvedTick?: number;
}
export interface RecollectionEcho {
  actorId: string;
  theme: ReflectionTheme;
  confidence: 'faint' | 'uncertain';
  receivedTick: number;
  status: 'unconsidered' | 'considered' | 'dismissed';
  resolvedTick?: number;
}
export interface ReincarnationState {
  cases: ReincarnationCase[];
  echoes: RecollectionEcho[];
}

export type RelicSetId = 'star-balance';
export type RelicSlot = 'frame' | 'core';
export type RelicMove = 'recover' | 'assemble';
export interface RelicFragment {
  readonly id: string;
  readonly setId: RelicSetId;
  readonly slot: RelicSlot;
  readonly source: Readonly<{
    kind: 'wild_cache' | 'expedition';
    locationId: string;
    tick: number;
    eventId?: string;
    occasionId?: string;
  }>;
  holder: { kind: 'site' | 'actor' | 'estate' | 'consumed'; id: string };
}
export interface RelicState {
  fragments: RelicFragment[];
}

export type RelicExhibitMove = 'offer' | 'accept' | 'decline' | 'recall' | 'close';
export type RelicExhibitCloseReason = 'declined' | 'withdrawn' | 'offer_expired' | 'item_unavailable' |
  'owner_died' | 'recalled' | 'host_closed' | 'term_complete' | 'host_breach';
export interface RelicExhibit {
  id: string;
  artifactId: string;
  setId: RelicSetId;
  ownerId: string;
  hostSectId: string;
  hostLeaderId: string;
  siteId: string;
  offeredTick: number;
  offerExpiresTick: number;
  status: 'offered' | 'on_display' | 'closed';
  acceptedTick?: number;
  expiresTick?: number;
  closedTick?: number;
  closeReason?: RelicExhibitCloseReason;
  custody?: Artifact;
}
export interface RelicExhibitState {
  entries: RelicExhibit[];
  nextId: number;
}

export type ScriptureMove = 'annotate' | 'compare' | 'adopt' | 'revert';
export type ScriptureEditionKind = 'gloss' | 'misread' | 'corrected';
export interface ScriptureOriginal {
  readonly id: string;
  readonly technique: Readonly<Technique>;
  readonly firstSeenTick: number;
  readonly source: 'authored' | 'pavilion' | 'inheritance';
  readonly sourceLocationId?: string;
  readonly sourceSectId?: string;
}
export interface ScriptureEdition {
  readonly id: string;
  readonly originalId: string;
  readonly authorId: string;
  readonly kind: ScriptureEditionKind;
  readonly createdTick: number;
  readonly locationId: string;
  readonly parentEditionId?: string;
  readonly evidence?: Readonly<{ kind: 'pavilion' | 'inheritance' | 'author_manuscript'; locationId: string; sectId?: string }>;
}
export interface ActiveScriptureEdition {
  originalId: string;
  editionId: string;
  kind: ScriptureEditionKind;
}
export interface ScriptureState {
  originals: ScriptureOriginal[];
  editions: ScriptureEdition[];
}

export type CompetitionMove = 'join' | 'withdraw';
export type CompetitionRule = 'tournament_win' | 'tournament_champion' | 'major_breakthrough' | 'public_relief';
export interface CompetitionSeason {
  id: string;
  year: number;
  openedTick: number;
  closedTick?: number;
  status: 'open' | 'settled';
}
export interface CompetitionEntry {
  seasonId: string;
  actorId: string;
  joinedTick: number;
  withdrawnTick?: number;
}
export interface CompetitionScore {
  id: string;
  seasonId: string;
  actorId: string;
  sourceId: string;
  tick: number;
  rule: CompetitionRule;
  points: number;
  locationId: string;
}
export interface CompetitionHonor {
  id: string;
  seasonId: string;
  actorId: string;
  place: 1;
  score: number;
  awardedTick: number;
  title: string;
}
export interface CompetitionState {
  seasons: CompetitionSeason[];
  entries: CompetitionEntry[];
  scores: CompetitionScore[];
  honors: CompetitionHonor[];
  optOutActorIds: string[];
}

export type CompetitionReviewProof = {
  id: string;
  seasonId: string;
  sourceId: string;
  tick: number;
  locationId: string;
  actorId: string;
} & (
  | { rule: 'public_relief'; settlementId: string; stones: number; herbs: number }
  | { rule: 'tournament_champion'; occasionId: string; championRound: number; competitiveWinRound: number; opponentId: string }
);
export interface CompetitionReviewCase {
  id: string;
  seasonId: string;
  scoreId: string;
  proofId: string;
  applicantId: string;
  openedTick: number;
  status: 'pending' | 'confirmed' | 'corrected' | 'inconclusive';
  closedTick?: number;
}
export interface CompetitionScoreCorrection {
  scoreId: string;
  proofId: string;
  seasonId: string;
  previousActorId: string;
  newActorId?: string;
  points: number;
  tick: number;
  reason: 'wrong_recipient' | 'recipient_ineligible' | 'duplicate_source';
}
export interface CompetitionHonorChange {
  originalHonorId: string;
  seasonId: string;
  previousActorId: string;
  newActorId?: string;
  score?: number;
  tick: number;
}
export interface CompetitionReviewState {
  proofs: CompetitionReviewProof[];
  cases: CompetitionReviewCase[];
  corrections: CompetitionScoreCorrection[];
  honorChanges: CompetitionHonorChange[];
}

export type EscortMove = 'offer' | 'accept' | 'decline' | 'report';
export interface EscortContract {
  freight?: MarketFreightTerms;
  id: string;
  shipmentId: string;
  clientId: string;
  escortId?: string;
  originId: string;
  destinationId: string;
  status: 'offered' | 'active' | 'delivered' | 'failed' | 'expired';
  offeredTick: number;
  expiresTick: number;
  acceptedTick?: number;
  holdAppliedTick?: number;
  feeEscrow: number;
  feePaid: number;
  feeRefunded: number;
  rationsEscrow: number;
  rationsSpent: number;
  rationsReturned: number;
  path: MapPoint[];
  pathIndex: number;
  stride: number;
  lastAdvancedTick?: number;
  lastCrossedTileIds: string[];
  arrivedTick?: number;
  usedReportIds: string[];
  detours: Array<{ tick: number; reportId: string; extraSteps: number }>;
  settledTick?: number;
  reason?: string;
}
export interface EscortReport {
  id: string;
  contractId: string;
  reporterId: string;
  observedTick: number;
  hazardId: string;
  tileId: string;
  expiresTick: number;
}
export interface EscortState {
  contracts: EscortContract[];
  reports: EscortReport[];
}

export type BuiltinScenarioPresetId = 'storm-at-blood-moon' | 'tournament-eve' | 'cold-jade-disciple';
/** Stable genesis established only after the chosen built-in native opening is proven. */
export interface BuiltinScenarioOrigin {
  readonly version: 1;
  readonly id: BuiltinScenarioPresetId;
  readonly openedTick: number;
}

export interface ScenarioOrigin {
  version: 1 | 2 | 3;
  ruleset: 1;
  id: string;
  endTick: number;
}

export type ScenarioDanxiaOutcome = 'delivered'|'renewed'|'switched'|'refused';
export type ScenarioObjective =
  | { kind: 'cultivator_survives'; actorId: string }
  | { kind: 'living_population'; minimum: number }
  | { kind: 'site_qi'; locationId: string; minimum: number }
  | { kind: 'sect_treasury'; sectId: string; minimum: number }
  | { kind: 'danxia_medicine_outcome'; actorId: string; settlementId: string; required: ScenarioDanxiaOutcome };

export type ScenarioAuditEvidence =
  | { kind: 'cultivator_survives'; found: boolean; alive: boolean; hp: number }
  | { kind: 'living_population'; count: number }
  | { kind: 'site_qi'; found: boolean; qi: number }
  | { kind: 'sect_treasury'; found: boolean; atSite: number; inTransit: number; total: number }
  | { kind: 'danxia_medicine_outcome'; verified: boolean };

export type ScenarioAuditCard = { id: string; passed: boolean } & {
  [Kind in ScenarioObjective['kind']]: {
    objective: Extract<ScenarioObjective, { kind: Kind }>;
    evidence: Extract<ScenarioAuditEvidence, { kind: Kind }>;
  };
}[ScenarioObjective['kind']];

export interface ScenarioAudit {
  version: 1;
  scenarioId: string;
  seed: number;
  profileId: WorldgenProfileId;
  evaluatedTick: number;
  cards: ScenarioAuditCard[];
}

export interface AnnotationBookmark {
  id: string;
  eventId: string;
  eventTick: number;
  createdTick: number;
  title: string;
  category: WorldEvent['category'];
  locationId?: string;
}
export type MapAnnotationTarget =
  | { kind: 'site'; locationId: string; tileId: string; siteName: string }
  | { kind: 'tile'; tileId: string };
export interface MapAnnotation {
  id: string;
  createdTick: number;
  updatedTick: number;
  text: string;
  target: MapAnnotationTarget;
}
export interface AnnotationState {
  bookmarks: AnnotationBookmark[];
  notes: MapAnnotation[];
  nextId: number;
}

export type CeasefireMove = 'offer' | 'accept' | 'decline' | 'break';
export interface SectCeasefire {
  id: string;
  proposerSectId: string;
  targetSectId: string;
  proposerId: string;
  targetLeaderId: string;
  openedTick: number;
  offerExpiresTick: number;
  status: 'offered' | 'active' | 'declined' | 'expired' | 'fulfilled' | 'breached';
  signedTick?: number;
  endsTick?: number;
  terms: { duration: number; bondPerSide: number; aidAmount: number; aidPayerSectId: string; aidRecipientSectId: string };
  escrow: { proposerBond: number; targetBond: number; aid: number };
  aidReleasedTick?: number;
  withdrawnSiegeIds: string[];
  breach?: { offenderSectId: string; tick: number; kind: 'renounced' | 'hostile_damage'; forfeitedBond: number; eventId?: string };
  settledTick?: number;
}
export interface CeasefireState {
  agreements: SectCeasefire[];
  nextId: number;
}

export type ResearchTopic = 'qi_foundation' | 'warding';
export type ResearchMove = 'propose' | 'join' | 'work' | 'withdraw';
export type ResearchWithdrawalReason = 'injury' | 'assignment' | 'relocation' | 'hardship' | 'ineligible';
export interface ResearchMaterialAccount { stones: number; earthRoots: number }
export interface ResearchContribution {
  actorId: string;
  joinedTick: number;
  lastWorkedTick?: number;
  workTurns: number;
  escrow: ResearchMaterialAccount;
  spent: ResearchMaterialAccount;
  withdrawnTick?: number;
  withdrawReason?: ResearchWithdrawalReason;
}
export interface ResearchProject {
  id: string;
  sectId: string;
  topic: ResearchTopic;
  proposerId: string;
  locationId: string;
  startedTick: number;
  deadlineTick: number;
  status: 'open' | 'completed' | 'expired';
  contributors: ResearchContribution[];
  discoveryTechniqueId?: string;
  discoveryLocationId?: string;
  settledTick?: number;
}
export interface ResearchState {
  projects: ResearchProject[];
  nextId: number;
}

export type SanctuaryMove = 'found' | 'take_pass' | 'repair' | 'surrender';
export type SanctuaryCharterEndReason = 'expiry' | 'site_lost';
export type SanctuaryPassEndReason = 'expiry' | 'charter_ended' | 'surrendered' | 'violation' | 'ineligible';
export interface SanctuaryCharter {
  id: string;
  siteId: string;
  sponsorSectId: string;
  founderId: string;
  openedTick: number;
  expiresTick: number;
  status: 'active' | 'ended';
  shieldHp: number;
  maxShieldHp: number;
  stonesSpent: number;
  endedTick?: number;
  endReason?: SanctuaryCharterEndReason;
  lastRepairTick?: number;
}
export interface SanctuaryPass {
  id: string;
  charterId: string;
  actorId: string;
  issuedTick: number;
  expiresTick: number;
  status: 'active' | 'ended';
  endedTick?: number;
  endReason?: SanctuaryPassEndReason;
}
export interface SanctuaryIncident {
  id: string;
  charterId: string;
  tick: number;
  aggressorId: string;
  visitorId: string;
  kind: 'blocked' | 'exhausted' | 'forfeited';
  shieldSpent: number;
  karmaPenalty: number;
  sourceEventId: string;
}
export interface SanctuaryState {
  charters: SanctuaryCharter[];
  passes: SanctuaryPass[];
  incidents: SanctuaryIncident[];
  nextId: number;
}

export type SectCreditMove = 'offer' | 'accept' | 'decline' | 'repay';
export interface SectCreditReceipt {
  tick: number;
  kind: 'voluntary' | 'collection';
  amount: number;
}
export interface SectLoan {
  id: string;
  lenderSectId: string;
  borrowerSectId: string;
  lenderSignerId: string;
  borrowerSignerId: string;
  openedTick: number;
  offerExpiresTick: number;
  status: 'offered' | 'active' | 'paid' | 'defaulted' | 'declined' | 'expired';
  principal: number;
  fundedTick?: number;
  dueTick?: number;
  collectionUntilTick?: number;
  settledTick?: number;
  paidTotal: number;
  writtenOff: number;
  receipts: SectCreditReceipt[];
  lastCollectionTick?: number;
}
export interface SectCreditRestriction {
  sectId: string;
  untilTick: number;
}
export interface SectCreditState {
  loans: SectLoan[];
  restrictions: SectCreditRestriction[];
  nextId: number;
}

export type PilgrimageMove = 'propose' | 'accept' | 'decline' | 'advance' | 'relieve' | 'withdraw' | 'camp' | 'resume' | 'dismantle';
export type PilgrimageEndReason = 'declined' | 'offer_expiry' | 'journey_expiry' | 'withdrawn' | 'lost_site' | 'member_missing';
export interface PilgrimageAid {
  tick: number;
  giverId: string;
  receiverId: string;
  locationId: string;
  hpRestored: number;
}
export interface PilgrimageCamp {
  legIndex: number;
  pathIndex: number;
  tileId: string;
  point: MapPoint;
  openedTick: number;
  payerId: string;
  status: 'pitched' | 'resumed' | 'dismantled' | 'expired' | 'interrupted';
  closedTick?: number;
  recovery?: Array<{ actorId: string; hp: number }>;
}
export interface PilgrimageJourney {
  id: string;
  organizerId: string;
  companionId: string;
  stopIds: [string, string, string];
  stopsVisited: Array<{ locationId: string; tick: number }>;
  status: 'proposed' | 'active' | 'completed' | 'declined' | 'expired' | 'withdrawn' | 'interrupted';
  proposedTick: number;
  offerExpiresTick: number;
  startedTick?: number;
  expiresTick?: number;
  settledTick?: number;
  reason?: PilgrimageEndReason;
  legIndex: number;
  path: MapPoint[];
  pathIndex: number;
  lastMovedTick?: number;
  spentByEach: number;
  aid: PilgrimageAid[];
  camps?: PilgrimageCamp[];
  waypostMealWitnesses?: WaypostMealWitness[];
}
export interface PilgrimageState {
  journeys: PilgrimageJourney[];
  nextId: number;
}

export type RoadMove = 'charter' | 'maintain' | 'patrol';
export interface RoadLink {
  id: string;
  sectId: string;
  anchorSiteId: string;
  otherSiteId: string;
  path: MapPoint[];
  condition: number;
  openedTick: number;
  lastMaintainedTick?: number;
  lastMaintainedBy?: string;
  lastPatrolledTick?: number;
  lastPatrolledBy?: string;
  closedTick?: number;
  closeReason?: 'title_lost' | 'endpoint_lost';
}
export interface RoadCrossing {
  id: string;
  roadId: string;
  journeyId: string;
  legIndex: 0 | 1;
  payerId: string;
  companionId: string;
  departedTick: number;
  fee: number;
  stride: number;
  paidSteps: number;
  freeSteps: number;
  freeStride: number;
}
export interface RoadState {
  links: RoadLink[];
  crossings: RoadCrossing[];
  nextId: number;
  lastAdvancedTick?: number;
}

export type ChronicleErrataMove = 'retell' | 'correct';
export type ChronicleReliefReading = 'full_supplies' | 'unfunded';
export type ChronicleReading = { kind: 'duel'; winnerId: string } | { kind: 'relief'; delivery: ChronicleReliefReading };
interface ChronicleSourceReference { sourceEventId: string; tick: number; locationId: string }
export type ChronicleSourceFact = ChronicleSourceReference & (
  { kind: 'duel'; participantIds: [string, string]; winnerId: string } |
  { kind: 'relief'; actorId: string; settlementId: string; stones: number; herbs: number }
);
export interface ChronicleRetelling {
  id: string;
  sourceEventId: string;
  authorId: string;
  tick: number;
  reading: ChronicleReading;
}
export interface ChronicleCorrection {
  id: string;
  sourceEventId: string;
  editorId: string;
  tick: number;
  reading: ChronicleReading;
  contestedRetellingIds: string[];
}
export interface ChronicleErrataState {
  sources: ChronicleSourceFact[];
  retellings: ChronicleRetelling[];
  corrections: ChronicleCorrection[];
  nextId: number;
}

export type HabitatMove = 'restore' | 'release' | 'survey';
export interface HabitatStewardship {
  id: string;
  siteId: string;
  sponsorSectId: string;
  stewardId: string;
  restoredTick: number;
  expiresTick: number;
  endedTick?: number;
  endReason?: 'expiry' | 'site_lost';
}
export interface BeastRelease {
  id: string;
  beastId: string;
  formerOwnerId: string;
  siteId: string;
  releasedTick: number;
  earliestSurveyTick: number;
  deadlineTick: number;
  status: 'monitoring' | 'sighted' | 'unconfirmed';
  observation?: { observerId: string; tick: number; hp: number };
  settledTick?: number;
}
export interface HabitatState {
  stewardships: HabitatStewardship[];
  releases: BeastRelease[];
  nextId: number;
}

export type StaffedDutyKind = 'observatory' | 'cohort';
export type InfirmaryMove = 'request' | 'staff' | 'accept' | 'accept_handoff' | 'refuse';
export type InfirmaryClosureReason = 'expiry' | 'ineligible' | 'recovered' | 'refused';
export interface InfirmaryReceipt {
  maxHpAtVisit?: number;
  handoff?: { fromShiftId: string; duty: StaffedDutyKind };
  guardId: string;
  shiftId: string;
  tick: number;
  stonesSpent: number;
  herbsSpent: number;
  hpRestored: number;
  toxicityRemoved: number;
}
export interface InfirmaryCase {
  id: string;
  patientId: string;
  sectId: string;
  siteId: string;
  queuedTick: number;
  expiresTick: number;
  status: 'waiting' | 'treated' | 'refused' | 'closed';
  settledTick?: number;
  reason?: InfirmaryClosureReason;
  receipt?: InfirmaryReceipt;
}
export interface InfirmaryShift {
  id: string;
  guardId: string;
  sectId: string;
  siteId: string;
  startedTick: number;
  expiresTick: number;
  lastServedTick?: number;
  lastWithheld?: { tick: number; duty: StaffedDutyKind };
}
export interface InfirmaryState {
  cases: InfirmaryCase[];
  shifts: InfirmaryShift[];
  nextId: number;
}

export type CareFollowupMove = 'schedule' | 'attend' | 'withdraw';
export type CareFollowupClosure = 'patient_absent' | 'patient_ineligible' | 'no_need' | 'staff_unavailable' |
  'supplies_unavailable' | 'bed_unavailable' | 'not_confirmed';
export interface CareFollowup {
  id: string;
  sourceCaseId: string;
  sourceShiftId: string;
  sourceGuardId: string;
  dischargedTick: number;
  patientId: string;
  sectId: string;
  siteId: string;
  scheduledTick: number;
  dueTick: number;
  expiresTick: number;
  status: 'scheduled' | 'attended' | 'closed' | 'withdrawn';
  settledTick?: number;
  closure?: CareFollowupClosure;
  receipt?: { tick: number; guardId: string; shiftId: string; stonesSpent: 6; herbsSpent: 1; maxHpAtVisit: number; hpRestored: number; toxicityRemoved: number };
}
export interface CareFollowupsState { appointments: CareFollowup[]; nextId: number }

export type FormationMove = 'offer' | 'accept' | 'decline' | 'dispatch' | 'overload' | 'draw' | 'repair';
export interface FormationReceipt {
  tick: number;
  kind: 'dispatch' | 'overload' | 'draw' | 'repair' | 'dissipate';
  actorId?: string;
  fromSiteId?: string;
  toSiteId?: string;
  sent?: number;
  delivered?: number;
  lost?: number;
  drawn?: number;
  stonesSpent?: number;
  dissipated?: number;
}
export interface FormationLink {
  id: string;
  sectAId: string;
  sectBId: string;
  siteAId: string;
  siteBId: string;
  proposerId: string;
  recipientLeaderId: string;
  proposerSectId: string;
  openedTick: number;
  offerExpiresTick: number;
  steps: number;
  status: 'offered' | 'active' | 'broken' | 'ended' | 'declined' | 'expired';
  openedPaymentEach: number;
  fundedTick?: number;
  settledTick?: number;
  endReason?: 'site_lost' | 'hostility';
  heldA: number;
  heldB: number;
  sentTotal: number;
  deliveredTotal: number;
  transmissionLoss: number;
  drawnTotal: number;
  dissipatedTotal: number;
  repairTotal: number;
  lastDispatchTick?: number;
  lastDrawTick?: number;
  lastRepairTick?: number;
  brokenTick?: number;
  receipts: FormationReceipt[];
}
export interface FormationNetworkState { links: FormationLink[]; nextId: number }

export type TerritorialLeaseMove = 'offer' | 'accept' | 'decline' | 'surrender';
export type TerritorialLeaseEndReason = 'expiry' | 'title_change' | 'surrender';
export interface TerritorialLeaseReceipt {
  tick: number;
  kind: 'harvest' | 'refund';
  amount: number;
  actorId?: string;
  herbId?: HerbId;
  units?: number;
}
export interface TerritorialLease {
  id: string;
  ownerSectId: string;
  lesseeSectId: string;
  siteId: string;
  ownerSignerId: string;
  lesseeSignerId: string;
  openedTick: number;
  offerExpiresTick: number;
  status: 'offered' | 'active' | 'closed' | 'declined' | 'expired';
  startsTick?: number;
  endsTick?: number;
  settledTick?: number;
  endReason?: TerritorialLeaseEndReason;
  escrow: number;
  rentPaid: number;
  refunded: number;
  usedUnits: number;
  receipts: TerritorialLeaseReceipt[];
}
export interface TerritorialLeaseState { leases: TerritorialLease[]; nextId: number }

export interface HouseholdPresence {
  settlementId: string;
  adults: number;
  adultAgeCohorts?: MortalAgeCohort[];
  juvenileCohorts: Array<{ bornTick: number; count: number }>;
  births: number;
  matured: number;
  migratedIn: number;
  migratedOut: number;
  deaths: number;
}
export interface MortalHousehold {
  id: string;
  originSettlementId: string;
  branch: 'first' | 'second';
  createdTick: number;
  presences: HouseholdPresence[];
}
export interface HouseholdMember {
  volunteerId: string;
  knownBornTick?: number;
  householdId: string;
  settlementId: string;
  registeredTick: number;
  status: 'resident' | 'recruited' | 'retired' | 'deceased';
  recruitedId?: string;
  settledTick?: number;
}
export type HouseholdGuardianMove = 'offer' | 'accept' | 'decline' | 'renounce';
export interface HouseholdGuardianship {
  id: string;
  householdId: string;
  guardianId: string;
  wardId: string;
  openedTick: number;
  expiresTick: number;
  status: 'offered' | 'active' | 'declined' | 'expired' | 'renounced' | 'ended';
  acceptedTick?: number;
  settledTick?: number;
  endReason?: 'declined' | 'expiry' | 'renounced' | 'death';
}
export interface HouseholdState {
  groups: MortalHousehold[];
  members: HouseholdMember[];
  guardianships: HouseholdGuardianship[];
  nextId: number;
}

export type HousingMove = 'offer'|'accept'|'decline'|'check_in'|'withdraw'|'revoke';
export type HousingClaimReason = 'guest_declined'|'guest_withdrew'|'host_revoked'|'offer_expired'|'season_ended'|
  'party_unavailable'|'shelter_unavailable'|'unsafe_shelter'|'route_interrupted'|'no_spare_room';
export interface HousingMovement {tick:number;fromSiteId:string;toSiteId:string}
export interface HousingClaim {
  id:string; householdId:string; hostId:string; guestId:string; settlementId:string; siteId:string; shelterProjectId:string;
  offeredTick:number; expiresTick:number; seasonStartTick:number; seasonEndTick:number;
  status:'offered'|'reserved'|'occupied'|'moved_out'|'closed';
  acceptedTick?:number; arriveByTick?:number; arrival?:HousingMovement; checkedInTick?:number; departure?:HousingMovement;
  endedTick?:number; hazard?:RouteWarningHazardProof; reason?:HousingClaimReason;
}
export interface SeasonalHousingState { claims:HousingClaim[]; nextId:number }

export type VillageWorkKind = 'well' | 'field' | 'shelter';
export type VillageWorkEndReason = 'deadline' | 'abandoned' | 'site_lost';
export interface VillageWorkReceipt { tick: number; labor: number; adultsAvailable: number }
export interface VillageWorkProject {
  id: string;
  settlementId: string;
  sponsorSectId: string;
  sponsorId: string;
  kind: VillageWorkKind;
  startedTick: number;
  deadlineTick: number;
  status: 'building' | 'completed' | 'abandoned';
  laborTotal: number;
  stonesSpent: number;
  rootsSpent: number;
  receipts: VillageWorkReceipt[];
  lastWorkedTick?: number;
  settledTick?: number;
  endReason?: VillageWorkEndReason;
  capacityBefore?: number;
  capacityAfter?: number;
}
export interface VillageWorksState { projects: VillageWorkProject[]; nextId: number }

export type WatchTarget = { kind: 'actor' | 'site' | 'sect'; id: string };
export interface PlayerWatch {
  id: string;
  observerId: string;
  target: WatchTarget;
  label: string;
  createdTick: number;
  readThroughTick: number;
}
export interface WatchDigest {
  watchId: string;
  tick: number;
  buckets: Array<{ category: WorldEvent['category']; count: number }>;
}
export interface WatchlistState {
  watches: PlayerWatch[];
  digests: WatchDigest[];
  nextId: number;
  lastCapturedTick?: number;
}

export type CourierMove = 'send' | 'accept' | 'decline';
export type DispatchCue = 'request_audience' | 'offer_relief';
export type DispatchPayload = { kind: 'private_cue'; cue: DispatchCue } |
  { kind: 'public_relief'; sourceEventId: string; settlementId: string; stones: number; herbs: number };
export type DispatchReason = 'recipient_absent' | 'recipient_unavailable' | 'hazard' | 'courier_death' |
  'route_lost' | 'deadline' | 'declined' | 'offer_expiry';
export type CourierHandoffMove = 'offer' | 'accept' | 'decline';
export interface CourierHandoff {
  postId: string;
  tileId: string;
  path: MapPoint[];
  fromPathIndex: number;
  pathIndex: number;
  arrivedTick: number;
  fromCourierId: string;
  furthestPathIndex: number;
  status: 'arrived' | 'offered' | 'transferred' | 'declined' | 'missed' | 'interrupted';
  candidateId?: string;
  offeredTick?: number;
  lastHeldTick?: number;
  settledTick?: number;
  reason?: 'unoffered' | 'unconfirmed' | 'carrier_unavailable' | 'post_unavailable' | 'hazard' | 'route_interrupted';
  turnback?: { tick: number; pathIndex: number; reason: Extract<DispatchReason, 'recipient_absent' | 'recipient_unavailable' | 'hazard' | 'route_lost'> };
  terminal?: { tick: number; pathIndex: number; courierId: string; status: 'delivered' | 'returned' | 'lost' };
}
export interface SealedDispatch {
  originalCourierId?: string;
  handoff?: CourierHandoff;
  id: string;
  senderId: string;
  recipientId: string;
  courierId: string;
  originId: string;
  destinationId: string;
  openedTick: number;
  offerExpiresTick: number;
  status: 'offered' | 'in_transit' | 'returning' | 'delivered' | 'returned' | 'lost' | 'declined' | 'expired';
  sealed: DispatchPayload;
  acceptedTick?: number;
  deadlineTick?: number;
  settledTick?: number;
  deliveredTick?: number;
  lastAdvancedTick?: number;
  path: MapPoint[];
  pathIndex: number;
  feePaid: number;
  reason?: DispatchReason;
}
export interface SealedCourierState { dispatches: SealedDispatch[]; nextId: number }

export interface ColdHistoryState {
  readonly chapters: readonly ChronicleChapter[];
  readonly droppedChapters: number;
}

export type SectServiceMove = 'retire' | 'return';
export interface SectServiceStatus {
  status: 'retired' | 'serving';
  changedTick: number;
  retiredTick: number;
  formerSectId: string;
  formerRank: SectRank;
}
export interface ServiceRetirementRecord {
  id: string;
  actorId: string;
  sectId: string;
  tick: number;
  kind: SectServiceMove;
  formerRank: SectRank;
  forumReleased: boolean;
  leaderReleased: boolean;
  guardLocationId?: string;
  stewardSchoolIds: string[];
  infirmaryShiftIds: string[];
}
export interface ServiceRetirementState { history: ServiceRetirementRecord[]; nextId: number }

export type SectStipendMove='offer'|'accept'|'adopt'|'decline'|'withdraw';
export interface SectStipendHandoff {fromId:string;toId:string;successionTick:number;adoptedTick:number}
export interface SectStipendPeriod {
  dueTick:number;
  settledTick:number;
  authorityId?:string;
  dueAmount:12;
  paidAmount:0|12;
  status:'paid'|'unpaid';
  reason?:'treasury_short'|'authority_absent'|'recipient_absent'|'title_unavailable'|'recipient_capacity';
}
export interface SectStipend {
  id:string;
  sectId:string;
  siteId:string;
  recipientId:string;
  sponsorId:string;
  service:{retirementId:string;retiredTick:number;caseId:string;shiftId:string;patientId:string;servedTick:number};
  offeredTick:number;
  expiresTick:number;
  status:'offered'|'active'|'completed'|'closed'|'declined'|'withdrawn'|'expired';
  acceptedTick?:number;
  closedTick?:number;
  closedById?:string;
  closure?:'recipient_died'|'returned_to_service'|'affiliation_changed';
  handoffs:SectStipendHandoff[];
  periods:SectStipendPeriod[];
}
export interface SectStipendsState {stipends:SectStipend[];nextId:number}

export type SeedCultureMove='reserve'|'test'|'plant'|'harvest';
export interface SeedWeather {
  waterDeficit?:number;
  tick:number;
  season:'春'|'夏'|'秋'|'冬';
  kind:'平息'|'灵潮'|'罡风'|'霜息';
  intensity:number;
  soilQi:number;
}
export interface SeedTrial {tick:number;weather:SeedWeather;sample:2;sprouted:0|1|2}
export interface SeedLot {
  id:string;
  ownerId:string;
  siteId:string;
  createdTick:number;
  remaining:number;
  tests:SeedTrial[];
  loss?:{tick:number;units:number;reason:'owner_died'|'site_lost'};
}
export interface SeedPlot {
  id:string;
  lotId:string;
  ownerId:string;
  siteId:string;
  plantedTick:number;
  maturesTick:number;
  status:'growing'|'ready'|'harvested'|'lost';
  weather:SeedWeather[];
  maturedTick?:number;
  yield?:0|1|2;
  settledTick?:number;
  loss?:{reason:'site_hazard'|'owner_died'|'site_lost'|'spoiled'|'failed_germination';units:number;good:'jade_seed'|'jade_leaf';
    hazard?:Pick<MapHazard,'id'|'kind'|'tileId'|'createdTick'|'expiresTick'|'intensity'>};
}
export interface SeedCultureState {lots:SeedLot[];plots:SeedPlot[];nextLotId:number;nextPlotId:number}

export type CommonsMove = 'offer' | 'sign' | 'decline';
export type CommonsCloseReason = 'declined' | 'offer_expiry' | 'title_change' | 'site_lost' | 'term_complete' | 'stale_signer';
export interface CommonsParty { sectId: string; signerId: string; share: 1 | 2; signedTick?: number }
export interface CommonsAllocation { sectId: string; maintenanceDue: number; maintenancePaid: number; quota: number; used: number }
export interface CommonsHarvestReceipt { tick: number; actorId: string; sectId: string; units: number }
export interface CommonsQuotaRound {
  startTick: number;
  endsTick: number;
  stockAtOpen: number;
  reserved: number;
  allocations: CommonsAllocation[];
  harvests: CommonsHarvestReceipt[];
}
export interface SharedCommonsPact {
  id: string;
  siteId: string;
  herbId: HerbId;
  proposerSectId: string;
  openedTick: number;
  offerExpiresTick: number;
  status: 'offered' | 'active' | 'closed';
  parties: CommonsParty[];
  activatedTick?: number;
  startsTick?: number;
  endsTick?: number;
  settledTick?: number;
  closeReason?: CommonsCloseReason;
  rounds: CommonsQuotaRound[];
}
export interface SharedCommonsState { pacts: SharedCommonsPact[]; nextId: number }

export type ResourceFlowGood = 'stone' | 'jade_seed' | 'frost_dose' | 'ward_reed' | 'frontier_water' | 'reef_salt' | 'port_rigging' | 'rift_salt' | 'stormstone' | 'upper_lattice' | MarketGood;
export type ResourceFlowMechanism = 'alchemy' | 'market' | 'sect_economy' | 'oath' | 'commons' | 'relocation' | 'terrain' | 'workshop' | 'road' | 'observatory' | 'pilgrimage' | 'granary' | 'furnace_safety' | 'artifact_salvage' | 'village_supply' | 'civic_memorial' | 'village_fair' | 'sect_stipend' | 'seed_culture' | 'care_followup' | 'danxia_medicine' | 'water_vein' | 'north_mining_charter' | 'north_well_review' | 'upper_passage' | 'upper_array_field' | 'frontier' | 'scribe_commission';
export type ResourceFlowAccount =
  | { kind: 'actor' | 'site' | 'sect' | 'order' | 'shipment' | 'relocation' | 'workshop' | 'salvage' | 'granary' | 'village_supply' | 'village_fair' | 'seed_lot' | 'seed_plot' | 'danxia_medicine' | 'upper_passage' | 'frontier_store' | 'upper_array_store' | 'scribe_commission' | 'waypost_meal' | 'craft_training' | 'freight'; id: string }
  | { kind: 'oath'; id: string; pocket: 'payment' | 'collateral' };
export type ResourceFlowVisibility =
  | { kind: 'observer' }
  | { kind: 'known_sites'; siteIds: readonly string[] }
  | { kind: 'participants'; actorIds: readonly string[] };

export type ResourceFlowDraft = {
  mechanism: ResourceFlowMechanism;
  refId: string;
  reason: string;
  good: ResourceFlowGood;
  amount: number;
  visibility: ResourceFlowVisibility;
} & (
  | { kind: 'transfer'; from: ResourceFlowAccount; to: ResourceFlowAccount }
  | { kind: 'production'; to: ResourceFlowAccount }
  | { kind: 'consumption' | 'loss'; from: ResourceFlowAccount }
);
export type ResourceFlowEntry = ResourceFlowDraft & { id: number; tick: number };
export interface ResourceFlowTotal {
  good: ResourceFlowGood;
  transfer: number;
  production: number;
  consumption: number;
  loss: number;
}
export interface ResourceFlowMonth {
  tick: number;
  year: number;
  month: number;
  totalEntries: number;
  totals: ResourceFlowTotal[];
  entries: ResourceFlowEntry[];
}
export interface ResourceFlowState { nextId: number; months: ResourceFlowMonth[] }

export type WorkshopMove = 'offer' | 'accept' | 'work' | 'cancel' | 'decline';
export type WorkshopTier = '法器' | '灵器';
export type WorkshopQualityFloor = 'standard' | 'fine';
export type WorkshopOutputGrade = 'failed' | WorkshopQualityFloor;
export type WorkshopStatus = 'offered' | 'active' | 'probate_hold' | 'completed' | 'cancelled' | 'declined' | 'expired';
export type WorkshopCloseReason = 'patron_cancelled' | 'maker_cancelled' | 'offer_expired' |
  'mutual_release' | 'estate_returned' | 'work_expired' | 'patron_unavailable' | 'maker_unavailable' | 'site_unavailable' | 'institution_closed';

export type ToolLoanMove='offer'|'accept'|'decline'|'withdraw'|'release'|'reclaim';
export interface ToolLoanUse {
  tick:number;
  workshopId:string;
  piece:1|2;
  stage:'finish';
  durabilityBefore:number;
  durabilityAfter:number;
  scoreBonus:2;
}
export interface ToolLoan {
  id:string;
  artifactId:string;
  artifactName:string;
  lenderId:string;
  borrowerId:string;
  siteId:string;
  workshopId:string;
  origin:WorkshopArtifactOrigin;
  initialDurability:number;
  maxDurability:number;
  offeredTick:number;
  expiresTick:number;
  status:'offered'|'active'|'awaiting_recovery'|'returned'|'probate'|'declined'|'withdrawn'|'expired';
  acceptedTick?:number;
  useUntilTick?:number;
  custody?:Artifact;
  wear?:ToolLoanUse;
  release?:{tick:number;reason:'borrower_released'|'term_expired'|'borrower_died'|'workshop_closed'};
  closedTick?:number;
}
export interface ToolLoansState {loans:ToolLoan[];nextId:number}
export interface WorkshopWorkReceipt {
  toolUse?:{loanId:string;baseScore:number;scoreBonus:2};
  tick: number;
  makerId: string;
  piece: 1 | 2;
  stage: 'blank' | 'finish';
  stonesUsed: number;
  herbsUsed: number;
  quality?: WorkshopOutputGrade;
  qualityScore?: number;
  artifactId?: string;
  feePaid?: number;
}
export type WorkshopCapacityMove = 'offer'|'accept';
export interface WorkshopCapacityOffer {
  caseId:string;
  damagedTick:number;
  blankTick:number;
  makerId:string;
  offeredTick:number;
}
export interface WorkshopCapacityAmendment {
  acceptedTick:number;
  patronId:string;
  releasedQuantity:1;
  keptQuantity:1;
  workUntilTick:number;
  releasedStones:number;
  releasedHerbs:number;
}
export type WorkshopReleaseMove = 'propose'|'accept'|'decline';
export interface WorkshopReleaseNegotiation {
  id:string; proposerId:string; offeredTick:number; expiresTick:number;
  firstFinishTick:number; firstOutcome:'delivered'|'stock_unavailable';
  balanceStones:number; balanceHerbs:number;
  status:'offered'|'accepted'|'declined'|'expired'|'superseded';
  closedTick?:number; responderId?:string; returnedStones?:number; returnedHerbs?:number;
  supersededBy?:'work_changed'|'contract_closed';
}
export type WorkshopEstateMove = 'offer' | 'accept' | 'decline';
export type WorkshopEstateReleaseReason = 'unclaimed' | 'declined' | 'lapsed' | 'maker_unavailable' | 'heir_unavailable' | 'site_unavailable';
export interface WorkshopEstateContinuation {
  estateId: string;
  heldTick: number;
  heldStones: number;
  heldHerbs: number;
  phase: 'held' | 'offered' | 'resumed' | 'released' | 'completed';
  beneficiaryId?: string;
  offeredTick?: number;
  replyUntilTick?: number;
  resumeTick?: number;
  workUntilTick?: number;
  closedTick?: number;
  releaseReason?: WorkshopEstateReleaseReason;
}
export interface WorkshopOrder {
  estateContinuation?: WorkshopEstateContinuation;
  releaseNegotiations?:WorkshopReleaseNegotiation[];
  capacityOffer?: WorkshopCapacityOffer;
  capacityAmendment?: WorkshopCapacityAmendment;
  id: string;
  patronId: string;
  makerId: string;
  siteId: string;
  tier: WorkshopTier;
  quantity: 1 | 2;
  qualityFloor: WorkshopQualityFloor;
  status: WorkshopStatus;
  offeredTick: number;
  offerExpiresTick: number;
  acceptedTick?: number;
  deadlineTick?: number;
  settledTick?: number;
  closeReason?: WorkshopCloseReason;
  institution?: {sectId:string;establishedTick:number;arrivalPlanId?:string};
  disbandmentId?: string;
  escrowStones: number;
  escrowHerbs: number;
  refundedStones: number;
  refundedHerbs: number;
  work: WorkshopWorkReceipt[];
}
export interface WorkshopState { orders: WorkshopOrder[]; nextId: number }

export interface WorkshopDisbandReturn {
  orderId: string;
  patronId: string;
  makerId: string;
  acceptedTick: number;
  tier: WorkshopTier;
  quantity: 1 | 2;
  workCount: number;
  consumedStones: number;
  consumedHerbs: number;
  paidWages: number;
  refundedStones: number;
  refundedHerbs: number;
}
export interface WorkshopInstitutionClosure {
  id: string;
  planId: string;
  abandonedSiteId: string;
  sectId: string;
  originId: string;
  destinationId: string;
  tick: number;
  returns: WorkshopDisbandReturn[];
  voidedOfferIds: string[];
}
export interface WorkshopDisbandmentState { closures: WorkshopInstitutionClosure[] }

export type FurnaceUseKind = 'brew' | 'forge' | 'repair' | 'awaken' | 'workshop' | 'relic' | 'salvage';
export interface FurnaceReservation {
  id: string;
  actorId: string;
  siteId: string;
  workshopOrderId?: string;
  suspendedTicks?: number;
  lastSuspendedTick?: number;
  requestedTick: number;
  expiresTick: number;
  status: 'queued' | 'reserved' | 'used' | 'cancelled' | 'expired';
  assignedTick?: number;
  slot?: number;
  closedTick?: number;
  reason?: 'owner_cancelled' | 'actor_unavailable' | 'site_unavailable' | 'workshop_closed' | 'queue_expired' | 'turn_missed';
}
export interface FurnaceUseReceipt {
  siteId: string;
  actorId: string;
  tick: number;
  slot: number;
  kind: FurnaceUseKind;
  workshopOrderId?: string;
  reservationId?: string;
}
export interface FurnaceReservationState {
  reservations: FurnaceReservation[];
  uses: FurnaceUseReceipt[];
  nextId: number;
}

export type FurnaceSafetyMove = 'inspect' | 'repair' | 'reopen';
export interface FurnaceSafetyReceipt {
  assuranceClaimId?: string;
  kind: FurnaceSafetyMove;
  tick: number;
  actorId: string;
  ownerSectId: string;
  integrityBefore: number;
  integrityAfter: number;
}
export interface FurnaceSafetyCase {
  id: string;
  siteId: string;
  ownerAtDamage: string;
  hazardId: string;
  hazardTileId: string;
  hazardCreatedTick: number;
  severity: 1 | 2 | 3;
  damagedTick: number;
  integrityBefore: number;
  integrity: number;
  receipts: FurnaceSafetyReceipt[];
  reopenedTick?: number;
}
export interface FurnaceSafetyState { nextId: number; cases: FurnaceSafetyCase[] }

export type DamageAssuranceMove = 'seal' | 'make_good';
export interface DamageAssuranceWork {
  receiptId: string;
  tick: number;
  actorId: string;
  integrityBefore: number;
  integrityAfter: number;
  creditedPoints: number;
  stonesSpent: 8;
  rootsSpent: 2;
}
export interface DamageAssuranceClaim {
  id: string;
  sourceCaseId: string;
  siteId: string;
  responsibleSectId: string;
  hazardId: string;
  damagedTick: number;
  integrityBefore: number;
  integrityAfterDamage: number;
  initialLoss: number;
  inspectionTick: number;
  inspectorId: string;
  sealedTick: number;
  sealedById: string;
  status: 'open' | 'fulfilled' | 'closed';
  contributions: DamageAssuranceWork[];
  closedTick?: number;
  closure?: 'native_reopened' | 'title_changed' | 'case_superseded';
}
export interface DamageAssuranceState { claims: DamageAssuranceClaim[] }

export type SparringMove = 'offer' | 'accept' | 'decline' | 'withdraw' | 'ready' | 'yield';
export interface SparringRound {
  tick: number;
  members: Array<{ actorId: string; qiSpent: number; masteryGained: number }>;
}
export interface SparringAgreement {
  id: string;
  proposerId: string;
  partnerId: string;
  siteId: string;
  roundsPlanned: 1 | 2;
  offeredTick: number;
  offerExpiresTick: number;
  status: 'offered' | 'active' | 'completed' | 'declined' | 'withdrawn' | 'yielded' | 'expired' | 'interrupted';
  acceptedTick?: number;
  deadlineTick?: number;
  closedTick?: number;
  closedById?: string;
  readiness?: { tick: number; actorIds: string[] };
  rounds: SparringRound[];
}
export interface SparringState { agreements: SparringAgreement[]; nextId: number }

export type ExpeditionRescueMove = 'signal' | 'accept' | 'withdraw';
export interface ExpeditionRescue {
  id: string;
  occasionId: string;
  explorerId: string;
  gateSiteId: string;
  witnessIds: string[];
  openedTick: number;
  offerExpiresTick: number;
  status: 'signaled' | 'extracting' | 'rescued' | 'withdrawn' | 'expired' | 'interrupted';
  rescuerId?: string;
  acceptedTick?: number;
  exitSiteId?: string;
  path: MapPoint[];
  pathIndex: number;
  lastAdvancedTick?: number;
  finishedTick?: number;
  reason?: 'withdrawn' | 'offer_expired' | 'gate_closed' | 'participant_lost' | 'unsafe_route';
  supplySpent?: 1;
  arrivedIds?: string[];
}
export interface ExpeditionRescueState { requests: ExpeditionRescue[]; nextId: number }

export type ShortShiftMove = 'offer' | 'accept' | 'decline' | 'withdraw' | 'work';
export interface ShortShift {
  id: string;
  hostId: string;
  workerId: string;
  hostSectId: string;
  workerSectId: string;
  siteId: string;
  observatoryOpenedTick: number;
  offeredTick: number;
  offerExpiresTick: number;
  status: 'offered' | 'active' | 'completed' | 'declined' | 'withdrawn' | 'revoked' | 'expired';
  acceptedTick?: number;
  shiftTick?: number;
  closedTick?: number;
  closedById?: string;
  closeReason?: 'declined' | 'host_withdrew' | 'worker_withdrew' | 'access_revoked' | 'party_lost' | 'offer_expired' | 'shift_missed';
  escrowStones: number;
  paidStones: number;
  refundedStones: number;
  attendance?: { tick: number; reading: FieldWeatherReading };
}
export interface ShortShiftState { shifts: ShortShift[]; nextId: number }

export type BoundaryReliefMove = 'offer' | 'accept' | 'decline' | 'withdraw';
export type BoundaryCoverageKind = 'incumbent' | 'gap' | 'relief' | 'other';
export interface BoundaryCoverage {
  tick: number;
  kind: BoundaryCoverageKind;
  guardId?: string;
}
export interface BoundaryRelief {
  id: string;
  sectId: string;
  leaderId: string;
  incumbentId: string;
  incomingId: string;
  originSiteId: string;
  postSiteId: string;
  incumbentAssignedTick: number;
  offeredTick: number;
  offerExpiresTick: number;
  status: 'offered' | 'travelling' | 'returning' | 'completed' | 'declined' | 'withdrawn' | 'expired' | 'interrupted';
  acceptedTick?: number;
  deadlineTick?: number;
  path: MapPoint[];
  pathIndex: number;
  lastAdvancedTick?: number;
  outboundSteps: number;
  returnSteps: number;
  strainSpent: number;
  closedTick?: number;
  closedById?: string;
  closeReason?: 'declined' | 'withdrawn' | 'offer_expired' | 'title_lost' | 'conflicting_duty' | 'actor_lost' | 'route_blocked' | 'late';
  coverage: BoundaryCoverage;
  firstGapTick?: number;
}
export interface BoundaryReliefState { cases: BoundaryRelief[]; nextId: number }

export type ApprenticeCohortMove = 'offer' | 'accept' | 'leave' | 'teach' | 'attend' | 'cancel';
export interface ApprenticeCohortSeat {
  studentId: string;
  status: 'invited' | 'accepted' | 'left' | 'missed' | 'attended';
  acceptedTick?: number;
  readyTick?: number;
  leftTick?: number;
  attendedTick?: number;
  masteryGained?: number;
}
export interface ApprenticeCohort {
  id: string;
  mentorId: string;
  sectId: string;
  siteId: string;
  techniqueId: string;
  openedTick: number;
  lessonTick: number;
  status: 'offered' | 'held' | 'cancelled' | 'expired';
  seats: ApprenticeCohortSeat[];
  teachingTick?: number;
  closedTick?: number;
  instructionSpent?: 1;
  reason?: 'mentor_cancelled' | 'mentor_unavailable' | 'no_confirmed_attendance' | 'missed_lesson' | 'no_budget';
}
export interface ApprenticeGraduation {
  cohortId: string;
  studentId: string;
  mentorId: string;
  techniqueId: string;
  tick: number;
  masteryBefore: number;
  masteryAfter: number;
}
export interface ApprenticeCohortState {
  cohorts: ApprenticeCohort[];
  graduations: ApprenticeGraduation[];
  nextId: number;
}

export type HouseholdNameMove = 'offer' | 'offer_clear' | 'verify' | 'withdraw';
export interface HouseholdNameEntry {
  id: string;
  actorId: string;
  volunteerId: string;
  householdId: string;
  settlementId: string;
  kind: 'alias' | 'clear';
  alias?: string;
  openedTick: number;
  expiresTick: number;
  status: 'proposed' | 'verified' | 'withdrawn' | 'expired';
  closedTick?: number;
  witnessId?: string;
}
export interface HouseholdNameState { entries: HouseholdNameEntry[]; nextId: number }

export type CaravanRestitutionMove = 'discover' | 'return';
export interface CaravanRestitutionLot {
  id: string;
  shipmentId: string;
  sourceLossEventId: string;
  siteId: string;
  tileId: string;
  hazardId: string;
  hazardIntensity: 2;
  openedTick: number;
  good: 'jade_leaf' | 'earth_root';
  originalQuantity: number;
  destroyedQuantity: number;
  units: 1;
  buyerId: string;
  sellerId: string;
  status: 'buried' | 'sealed' | 'returned';
  finderId?: string;
  discoveredTick?: number;
  returnedTick?: number;
  returnedById?: string;
}
export interface CaravanRestitutionState { lots: CaravanRestitutionLot[] }

export type VillageGranaryDonation = 'donate' | 'donate_roots' | 'donate_stones';
export type VillageGranaryMove = VillageGranaryDonation | 'draw';
export type VillageGranaryReceipt =
  | { tick: number; actorId: string; kind: VillageGranaryDonation }
  | { tick: number; actorId: string; kind: 'draw'; stressBefore: number; stressAfter: number; disasterTick: number };
export interface VillageGranary {
  settlementId: string;
  roots: number;
  stones: number;
  rootOnlyDonations?: number;
  stoneOnlyDonations?: number;
  donatedRoots: number;
  donatedStones: number;
  spentRoots: number;
  spentStones: number;
  lastDrawTick?: number;
  receipts: VillageGranaryReceipt[];
}
export interface VillageGranariesState { granaries: VillageGranary[] }

export type VillageSupplyMove = 'offer' | 'accept' | 'decline' | 'withdraw';
export interface VillageSupplySigner { actorId:string; donationTick:number; donationKind:VillageGranaryDonation }
export type VillageSupplyHazardProof = Pick<MapHazard,'id'|'kind'|'tileId'|'createdTick'|'expiresTick'|'intensity'>;
export interface VillageSupplyLeg {
  good:'earth_root'|'stone';
  phase:'outbound'|'returning'|'delivered'|'returned'|'lost';
  checkpoint:number;
  lastAdvancedTick:number;
  turnback?:{tick:number;checkpoint:number;cause:'destination_closed'|'unsafe_next';hazard?:VillageSupplyHazardProof};
  settledTick?:number;
  loss?:VillageSupplyHazardProof;
}
export interface VillageSupplyAgreement {
  northMiningCharterId?:string;
  id:string;
  fromSettlementId:string;
  toSettlementId:string;
  proposer:VillageSupplySigner;
  offeredTick:number;
  expiresTick:number;
  status:'offered'|'active'|'completed'|'declined'|'withdrawn'|'expired';
  acceptor?:VillageSupplySigner;
  acceptedTick?:number;
  closedTick?:number;
  path?:string[];
  legs?:[VillageSupplyLeg,VillageSupplyLeg];
}
export interface VillageSupplyState { agreements:VillageSupplyAgreement[]; nextId:number }

export type ProbationMove = 'request' | 'admit' | 'review' | 'withdraw' | 'restore';
export type ProbationVote = 'support' | 'oppose';
export type ProbationStatus = 'requested' | 'active' | 'ready' | 'reinstated' | 'withdrawn' | 'rejected' | 'expired';
export type ProbationReason = 'withdrawn' | 'deadline' | 'new_misconduct' | 'unavailable' | 'review_oppose';
export interface ProbationExpulsion {
  id: string;
  actorId: string;
  sectId: string;
  tick: number;
  transgressions: number;
  disciplineRevision: number;
  lastCaseClosedTick?: number;
  reinstatedTick?: number;
  reinstatedRevision?: number;
}
export interface ProbationReliefReceipt {
  sourceId: string;
  tick: number;
  actorId: string;
  settlementId: string;
  stones: number;
  herbs: number;
}
export interface ProbationReview { reviewerId: string; tick: number; vote: ProbationVote }
export interface ProbationCase {
  id: string;
  expulsionId: string;
  actorId: string;
  sectId: string;
  villageIds: [string, string];
  disciplineRevision: number;
  status: ProbationStatus;
  requestedTick: number;
  requestExpiresTick: number;
  sponsorId?: string;
  admittedTick?: number;
  deadlineTick?: number;
  settledTick?: number;
  reason?: ProbationReason;
  relief: ProbationReliefReceipt[];
  reviews: ProbationReview[];
}
export interface ProbationState { expulsions: ProbationExpulsion[]; cases: ProbationCase[]; nextId: number }

export interface VillageCensusCount {
  villageId: string;
  population: number;
  juveniles: number;
}
export interface VillageCensusMovement {
  id: string;
  deathCause?: 'old_age';
  kind: 'birth' | 'maturation' | 'death' | 'migration' | 'enrollment';
  villageId: string;
  people: number;
  targetVillageId?: string;
  volunteerId?: string;
  cultivatorId?: string;
  bornTick?: number;
}
export interface VillageCensusObservation {
  villageId: string;
  observerId: string;
  count: VillageCensusCount;
  sample?: { householdId: string; adults: number; juveniles: number; namedResidents: number };
}
export interface VillageCensusPeriod {
  tick: number;
  year: number;
  month: number;
  opening: VillageCensusCount[];
  closing?: VillageCensusCount[];
  movements: VillageCensusMovement[];
  observations: VillageCensusObservation[];
}
export interface VillageCensusesState { periods: VillageCensusPeriod[] }

export type ObservatoryMove = 'fund' | 'measure' | 'relay';
export interface FieldWeatherReading { kind: '平息' | '灵潮' | '罡风' | '霜息'; intensity: number }
export interface FieldObservatoryStation { kind: 'edge'; x: number; y: number }
export type FieldObservatoryRun = {
  station?: FieldObservatoryStation;
  locationId: string;
  openedTick: number;
  targetTick: number;
  baseline: FieldWeatherReading;
  forecast: FieldWeatherReading;
} & (
  | { status: 'pending' }
  | { status: 'missed' }
  | { status: 'measured'; reading: FieldWeatherReading; relay?: { recipientId: string; relayedTick: number } }
);
export interface FieldObservatoryInboxEntry { operatorId: string; openedTick: number }
export interface FieldObservatoryActorState { runs: FieldObservatoryRun[]; inbox: FieldObservatoryInboxEntry[] }
export interface FieldObservatoriesState { byActor: Record<string, FieldObservatoryActorState> }

export type AlignedWeatherMove = 'offer' | 'compare' | 'decline' | 'withdraw';
export interface AlignedWeatherReport { openedTick: number; reading: FieldWeatherReading; station?: FieldObservatoryStation }
export interface AlignedWeatherComparison {
  id: string;
  siteId: string;
  observerAId: string;
  observerBId: string;
  measuredTick: number;
  offeredTick: number;
  expiresTick: number;
  status: 'offered' | 'compared' | 'declined' | 'withdrawn' | 'expired';
  first: AlignedWeatherReport;
  second?: AlignedWeatherReport;
  settledTick?: number;
  outcome?: 'agrees' | 'uncertain';
}
export interface AlignedWeatherState { comparisons: AlignedWeatherComparison[]; nextId: number }

export type DanxiaReviewMove = 'propose_renew'|'propose_switch'|'refuse'|'accept'|'decline';
export type DanxiaSeasonOutcome = 'delivered'|'unfulfilled'|'observed'|'no_commitment';
export interface DanxiaSeasonSource {
  outcome:DanxiaSeasonOutcome;finalTick:number;deliveredLeaves:0|2;
}
export interface DanxiaSeasonReliefProof {
  id:string;tick:number;siteId:string;stones:12;herbs:2;
}
export interface DanxiaSeasonReview {
  id:string;shortageId:string;commitmentId?:string;discipleId:string;patientId:string;householdId:string;volunteerId:string;
  settlementId:string;source:DanxiaSeasonSource;openedTick:number;expiresTick:number;
  status:'open'|'proposed'|'renewed'|'switched'|'refused'|'no_agreement';
  proposal?:{kind:'renew'|'switch';representativeId:string;sectId:string;proposedTick:number;relief?:DanxiaSeasonReliefProof};
  decision?:{tick:number;actorId?:string;reason:'signed'|'refused'|'declined'|'expired'};
}
export interface DanxiaReviewsState { reviews:DanxiaSeasonReview[] }

export type VillageEvolutionStage='village'|'town'|'ruin';
export interface VillageEvolutionSample {
  tick:number;population:number;juveniles:number;namedRemaining:number;stress:number;capacity:number;
  wellId?:string;usableWell:boolean;passableCorridors:number;corridorAgreementId?:string;
}
export interface VillageEvolutionChange {
  tick:number;from:VillageEvolutionStage;to:VillageEvolutionStage;
  reason:'sustained_growth'|'depopulated'|'actual_return';population:number;
  sourceRecordId?:string;growthSamples?:VillageEvolutionSample[];
}
export interface VillageEvolutionRecord {
  settlementId:string;siteId:string;registeredName:string;status:VillageEvolutionStage;
  samples:VillageEvolutionSample[];changes:VillageEvolutionChange[];pendingDepopulationRecordId?:string;
}
export interface VillageEvolutionHouseholdMove {householdId:string;adults:number}
export interface VillageEvolutionMigration {
  id:string;tick:number;fromSettlementId:string;toSettlementId:string;agreementId:string;path:string[];people:number;
  fromBefore:number;fromAfter:number;toBefore:number;toAfter:number;leftJuveniles:number;leftNamed:number;
  households:VillageEvolutionHouseholdMove[];
}
export interface VillageEvolutionState {villages:VillageEvolutionRecord[];migrations:VillageEvolutionMigration[]}

export type DoctrineFoundingMove='propose'|'join'|'authorize'|'decline'|'withdraw'|'establish';
export interface DoctrineFoundingMemberConsent {actorId:string;tick:number;withdrawnTick?:number}
export interface DoctrineFounding {
  id:string;schoolId:string;parentSectId:string;independentSectId:string;oldSiteId:string;
  relocationPlanId:string;abandonedSiteId:string;autonomyProposalId:string;scriptureId:string;founderId:string;
  independentName:string;schoolTreasury:number;proposedTick:number;expiresTick:number;
  status:'proposed'|'established'|'declined'|'withdrawn'|'expired'|'invalidated';
  authorization?:{actorId:string;tick:number;siteId:string};
  consents:DoctrineFoundingMemberConsent[];
  settlement?:{tick:number;actorId?:string;memberIds?:string[];transferredStones?:number};
  continuity?:{tick:number;previousLeaderId:string;successorId:string;eventId:string;cause:'native_succession'};
  maturity?:DoctrineMaturity;
}
export interface DoctrineFoundingsState {foundings:DoctrineFounding[]}

export type DoctrineMaturityMove='offer_merge'|'accept_merge'|'approve_member'|'decline_merge'|'withdraw_merge'|'finalize_merge';
export interface DoctrineMaturityHazardSample {tick:number;siteId:string;hazard:RouteWarningHazardProof}
export type DoctrineMaturitySupport =
  | {kind:'sustained_hazard';observedTick:number;siteId:string;samples:DoctrineMaturityHazardSample[]}
  | {kind:'title_lost';observedTick:number;siteId:string;previousTick:number;currentOwnerSectId?:string};
export interface DoctrineMaturityOffer {
  openedTick:number;expiresTick:number;outgoingLeaderId:string;receivingLeaderId:string;receivingSiteId:string;
  memberIds:string[];wallet:number;scriptureId:string;support:DoctrineMaturitySupport;
  consents:Array<{actorId:string;tick:number}>;acceptedTick?:number;
  status:'offered'|'declined'|'withdrawn'|'expired'|'invalidated'|'merged';closedTick?:number;closedById?:string;
}
export interface DoctrineMaturity {
  latestHazards:DoctrineMaturityHazardSample[];
  lastTitle?:{siteId:string;tick:number};
  support?:DoctrineMaturitySupport;
  offers:DoctrineMaturityOffer[];
  settlement?:{kind:'merged'|'dispersed';tick:number;siteId:string;
    receivingSectId?:string;memberIds:string[];transferredStones:number;retainedStones:number;releasedTileId?:string;
    transferredScriptureId?:string;scriptureAlreadyHeld?:boolean};
}

export type AuthoredEraEffect =
  | {kind:'jade_vein_depleted';siteId:string;before:{spiritQi:number;jadeCapacity:number;jade:number};
      after:{spiritQi:number;jadeCapacity:number;jade:number}}
  | {kind:'danxia_branch_moves_north';parentSectId:string;parentSiteId:string;branchSectId:string;
      destinationId:string;tileId:string;memberIds:string[];branchLeaderId:string;parentLeaderId:string;stayingIds:string[];
      parentStonesBefore:number;parentStonesAfter:number;branchStones:number;protectedStones:number}
  | {kind:'village_capacity';settlementId:string;siteId:string;capacityBefore:number;capacityAfter:number;population:number};
export interface AuthoredEraOrigin {
  version:1;id:string;openedTick:number;year:number;month:number;
  draft:import('../engine/eraDesignSchema').EraDesignDraft;
  baselineDigest:string;designDigest:string;rulesRevision:string;
  openingEventIds:string[];
  effects:AuthoredEraEffect[];
}

export type SimulationRegionId='west'|'center'|'east';
export interface RegionalRegistration {
  kind:'actor'|'site'|'settlement';id:string;originRegionId:SimulationRegionId;registeredTick:number;
}
export interface RegionalRoute {
  kind:'road'|'courier'|'escort'|'relocation'|'pilgrimage'|'village_supply'|'danxia_medicine'|'boundary_relief'|'expedition_rescue';
  id:string;firstKnownTick:number;regions:SimulationRegionId[];
}
export interface RegionalDeferredActor {
  actorId:string;regionId:SimulationRegionId;year:number;deferredMonths:number;lastDeferredTick:number;
}
export interface RegionalAnnualSummary {
  year:number;tick:number;regionId:SimulationRegionId;actorMonths:number;waivedActorMonths:number;actors:number;qiAdded:number;hpAdded:number;
}
export interface RegionalPromotionCore {
  observedTick:number;startsTick:number;throughTick:number;fromRegionId:SimulationRegionId;toRegionId:SimulationRegionId;
}
export type RegionalPromotion=RegionalPromotionCore&(
  | {kind:'courier_crossed';sourceId:string;startIndex:number;endIndex:number;crossedTileIds:string[];actorId:string}
  | {kind:'escort_crossed';sourceId:string;shipmentId:string;startIndex:number;endIndex:number;crossedTileIds:string[];actorId:string}
  | {kind:'siege_arrived';sourceId:string;sourceSiteId:string;destinationSiteId:string;eventId:string;actorId:string}
  | {kind:'actor_returned';sourceId:string;sourceSiteId:string;destinationSiteId:string;eventId?:string;witnessIds:string[]}
);

export interface RegionalSimulationState {
  promotions?:RegionalPromotion[];
  version:1;focusSiteId:string;registrations:RegionalRegistration[];routes:RegionalRoute[];
  actors:RegionalDeferredActor[];annual:RegionalAnnualSummary[];
}

export interface EraHeritageDate { tick: number; year: number; month: number }
export interface EraHeritageOath extends EraHeritageDate {
  oathId: string; eventId: string; locationId: string; requesterId: string; providerId: string;
  term: OathTerm; quantity: number; payment: number; collateral: number;
}
export interface EraHeritageArtifact extends EraHeritageDate {
  artifactId: string; eventId: string; locationId: string; makerId: string;
  setId: RelicSetId; fragmentIds: [string, string];
}
export interface EraHeritageRelay { learnerId: string; originWitnessId: string; learnedTick: number }
export interface EraHeritageFact extends EraHeritageDate {
  source: ChronicleSourceFact; firsthandIds: string[]; retellings: ChronicleRetelling[];
  correction?: ChronicleCorrection; relays: EraHeritageRelay[];
}
export interface EraHeritageState {
  version: 1; oaths: EraHeritageOath[]; artifacts: EraHeritageArtifact[]; facts: EraHeritageFact[];
}

export type WaterVeinMove = 'observe' | 'open' | 'mine';
export type WaterVeinSymptom = 'well' | 'field' | 'mine' | 'recovered';
export type WaterVeinRenewalStance = 'reuse'|'sect'|'accord';

export interface WaterVeinOpening {
  id: string;
  openedTick: number; year: number; month: number;
  openerId: string; sectId: string; wellProjectId: string;
  paidStones: number; borrowedUnits: number;
  renewal?: {id:string;stance:WaterVeinRenewalStance};
  completedTick?: number;
}
export interface WaterVeinObservation {
  id: string;
  actorId: string; tick: number; year: number; month: number;
  paidStones: number;
  wellDepth?: number; fieldDeficit?: number; mineYield: number;
  symptom?: WaterVeinSymptom;
}
export interface WaterVeinMiningReceipt {
  id: string; actorId: string; tick: number;
  units: number;
}
export interface ColdWaterVeinState {
  version: 1;
  veinId: 'north-cold-water';
  siteId: 'loc-vein-north';
  settlementId: string;
  tileIds: [string,string,string];
  oreRemaining: number;
  openings: WaterVeinOpening[];
  observations: WaterVeinObservation[];
  mining: WaterVeinMiningReceipt[];
  lastAdvancedTick?: number;
}

export type NorthMiningStance = 'seal'|'continue'|'detour';
export type NorthMiningCharterMove = 'propose'|'sign';
export type NorthMiningCharterSignature =
  | {role:'household';actorId:string;tick:number;householdId:string;volunteerId:string;recruitedTick:number}
  | {role:'miner';actorId:string;tick:number;miningReceiptId:string}
  | {role:'sect';actorId:string;tick:number;sectId:string};
export interface NorthMiningDetour {
  fromSettlementId:string;toSettlementId:string;
  originalTiles:string[];detourTiles:string[];
}
export interface NorthMiningPassage {
  agreementId:string;tick:number;good:'stone'|'earth_root';checkpoint:number;tileId:string;
}
export interface NorthMiningCharter {
  id:string;proposedTick:number;year:number;month:number;expiresTick:number;
  proposerId:string;stance:NorthMiningStance;status:'proposed'|'ratified'|'expired';
  siteId:'loc-vein-north';settlementId:string;wellProjectId:string;openingId:string;
  plotId:string;fieldObservedTick:number;fieldDeficit:number;miningReceiptId:string;sponsorSectId:string;
  signatures:NorthMiningCharterSignature[];ratifiedTick?:number;paidStones?:number;
  route?:NorthMiningDetour;firstPassage?:NorthMiningPassage;
}
export interface NorthMiningCharterState {version:1;charters:NorthMiningCharter[]}

export type NorthWellReviewMove = 'keep'|'permit';
export interface NorthWellRevisitLaw {
  version:1;kind:'authored_old_village_restriction';id:string;
  declaredTick:number;year:number;month:number;nativeFrameDigest:string;
  sourceCharterId:string;freightClosedTick:number;siteId:'loc-vein-north';wellProjectId:string;
  retainedPopulation:number;
}
export interface NorthWellReviewPermit {
  validFromTick:number;expiresTick:number;spentTick?:number;miningReceiptId?:string;
}
export interface NorthWellReviewDecision {
  id:string;actorId:string;sourceCharterId:string;freightClosedTick:number;surveyId:string;
  tick:number;year:number;month:number;move:NorthWellReviewMove;paidStones:number;
  lawId?:string;permit?:NorthWellReviewPermit;
}
export interface NorthWellRevisitReviewState {
  version:1;decisions:NorthWellReviewDecision[];
}

export interface WorldState {
  roguelikeEncounters?:RoguelikeEncounterRecord[];
  forbiddenDuels?: ForbiddenDuelContact[];
  beastDuelContacts?:BeastDuelContact[];
  scribeCommissions?: ScribeCommissionState;
  waypostMeals?: WaypostMealState;
  disasterShelter?: DisasterShelterState;
  craftTraining?: CraftTrainingState;
  upperPassage?:UpperPassageState;
  upperArrayField?:UpperArrayFieldState;
  northGateRenewal?:NorthGateRenewalState;
  frontier?:FrontierState;
  northWellRevisitLaw?:NorthWellRevisitLaw;
  northWellRevisitReviews?:NorthWellRevisitReviewState;
  northMiningCharters?:NorthMiningCharterState;
  coldWaterVein?:ColdWaterVeinState;
  mortalAgeTrackingSinceTick?: number;
  eraHeritage?: EraHeritageState;
  regionalSimulation?:RegionalSimulationState;
  authoredEraOrigin?:AuthoredEraOrigin;
  fieldObservatories: FieldObservatoriesState;
  danxiaShortages: DanxiaShortagesState;
  danxiaMedicine: DanxiaMedicineState;
  danxiaReviews: DanxiaReviewsState;
  expeditionOmens: ExpeditionOmensState;
  alignedWeather: AlignedWeatherState;
  villageCensuses: VillageCensusesState;
  probation: ProbationState;
  workshops: WorkshopState;
  artifactSalvages: ArtifactSalvageState;
  workshopDisbandments: WorkshopDisbandmentState;
  furnaceReservations: FurnaceReservationState;
  furnaceSafety: FurnaceSafetyState;
  damageAssurance: DamageAssuranceState;
  sparring: SparringState;
  expeditionRescues: ExpeditionRescueState;
  shortShifts: ShortShiftState;
  boundaryReliefs: BoundaryReliefState;
  apprenticeCohorts: ApprenticeCohortState;
  householdNames: HouseholdNameState;
  caravanRestitution: CaravanRestitutionState;
  villageGranaries: VillageGranariesState;
  villageSupply: VillageSupplyState;
  routeWarnings: RouteWarningsState;
  pavilionLoans: PavilionLoansState;
  civicMemorials: CivicMemorialsState;
  villageFairs: VillageFairsState;
  sectStipends: SectStipendsState;
  seedCulture: SeedCultureState;
  toolLoans: ToolLoansState;
  resourceFlow: ResourceFlowState;
  roads: RoadState;
  sharedCommons: SharedCommonsState;
  serviceRetirement: ServiceRetirementState;
  coldHistory: ColdHistoryState;
  couriers: SealedCourierState;
  watchlists: WatchlistState;
  villageWorks: VillageWorksState;
  households: HouseholdState;
  seasonalHousing: SeasonalHousingState;
  eraHistory:EraHistoryState;
  territorialLeases: TerritorialLeaseState;
  formations: FormationNetworkState;
  infirmaries: InfirmaryState;
  careFollowups: CareFollowupsState;
  habitats: HabitatState;
  chronicleErrata: ChronicleErrataState;
  chronicleCausality: CausalChronicleState;
  pilgrimages: PilgrimageState;
  credit: SectCreditState;
  sanctuary: SanctuaryState;
  research: ResearchState;
  ceasefires: CeasefireState;
  annotations: AnnotationState;
  builtinScenarioOrigin?: BuiltinScenarioOrigin;
  scenarioOrigin?: ScenarioOrigin;
  scenarioAudit?: ScenarioAudit;
  escorts: EscortState;
  competitions: CompetitionState;
  competitionReviews: CompetitionReviewState;
  scriptures: ScriptureState;
  relics: RelicState;
  relicExhibits: RelicExhibitState;
  reincarnation: ReincarnationState;
  relocations: RelocationState;
  worldgen?: WorldGeneration;
  doctrines: DoctrineState;
  doctrineFoundings:DoctrineFoundingsState;
  decisionTrace: DecisionTraceState;
  estates: EstateState;
  witnesses: WitnessState;
  settlements: SettlementState;
  villageEvolution:VillageEvolutionState;
  markets: MarketState;
  immortalAuction?: ImmortalAuctionState;
  tianjiGazette?: TianjiGazetteState;
  cultivationClans?: CultivationClanState;
  ascension?: AscensionState;
  oaths: OathState;
  oathArbitrations: OathArbitrationState;
  mentorship: MentorshipState;
  mentorTransfers: MentorTransferState;
  random: WorldRandomState;
  playerAvatar: PlayerAvatarState;
  chronicleArchive: ChronicleArchive;
  protagonistSuccession: ProtagonistSuccessionState;
  protagonistFlights?: ProtagonistFlight[];
  witnessedPersonalStory: WitnessedPersonalStoryState;
  dramaticBonds?: DramaticBondState;
  councils: CouncilRecord[];
  tick: number;
  interventionSequence: number;
  year: number;
  month: number;
  sects: Sect[];
  diplomacy: SectDiplomaticRelation[];
  sieges: SectSiege[];
  tributeDemands: SectTribute[];
  occasions: WorldOccasion[];
  tournamentWagers?: TournamentWagerState;
  bounties: BountyEntry[];
  locations: LocationNode[];
  terrain: WorldTerrain;
  mapPresentation: MapPresentation;
  mapHazards: MapHazard[];
  terrainSuccession: TerrainSuccessionState;
  spiritBeasts: SpiritBeast[];
  cultivators: Cultivator[];
  relationships: RelationshipEdge[];
  events: WorldEvent[];
}
export interface ExpeditionOmen {
  id:string;siteId:string;operatorId:string;openedTick:number;measuredTick:number;measuredQi:number;reading:FieldWeatherReading;
  windowStartsTick:number;windowEndsTick:number;relay?:{recipientId:string;tick:number};
  opening?:{tick:number;qi:number;reading:FieldWeatherReading;occasionId:string};
}
export interface ExpeditionOmensState { rows: ExpeditionOmen[]; lastCalendarTick?:number }

export interface DanxiaRegrowthSample extends FieldWeatherReading { tick:number;siteId:string;before:number;grown:number;capacity:number }
export interface DanxiaShortage {
  id:string;siteId:string;openedTick:number;regrowth:DanxiaRegrowthSample;discipleId:string;patientId:string;settlementId:string;
  householdId:string;volunteerId:string;appointmentId:string;sourceCaseId:string;demandIds:string[];requiredLeaves:number;availableLeaves:number;
  status:'open'|'closed';resolution?:{tick:number;reason:'adequate_stock'|'commitment_ended'|'authority_lost';requiredLeaves:number;availableLeaves:number};
}
export interface DanxiaShortagesState { cases:DanxiaShortage[] }

export type DanxiaMedicineMove = 'observe'|'retain'|'offer_ship'|'brew'|'accept'|'decline'|'receive'|'recover';
export type DanxiaMedicineStatus = 'observed'|'retained'|'offered'|'in_transit'|'arrived'|'returning'|'recoverable'|
  'brewed'|'brew_failed'|'received'|'recovered'|'lost';
export interface DanxiaMedicineCommitment {
  id:string; shortageId:string; sourceCaseId:string; appointmentId:string; discipleId:string; patientId:string;
  householdId:string; volunteerId:string; settlementId:string; originId:string; destinationId:string; escortId?:string;
  choice:'observe'|'retain'|'offer_ship'; startedTick:number; offerUntilTick:number; status:DanxiaMedicineStatus; escrow:0|2;
  reservedTick?:number; acceptedTick?:number; departedTick?:number; arrivedTick?:number; receiveUntilTick?:number;
  path?:MapPoint[]; pathIndex?:number; lastMovedTick?:number; returnStartedTick?:number; returnedTick?:number;
  disposition?:{tick:number;reason:'offer_expired'|'escort_declined'|'recipient_declined'|'recipient_missed'|'title_lost'|'disciple_lost'|'route_lost'|'escort_lost'};
  hazard?:RouteWarningHazardProof;
  settlement?:{tick:number;kind:'observed'|'brewed'|'brew_failed'|'received'|'recovered'|'lost'; actorId:string;artifactEventId?:string};
}
export interface DanxiaMedicineState { commitments:DanxiaMedicineCommitment[] }
