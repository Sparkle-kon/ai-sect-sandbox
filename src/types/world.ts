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

export interface Artifact {
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
  | 'FORMATION_NETWORK'
  | 'TERRITORIAL_LEASE'
  | 'HOUSEHOLD_GUARDIAN'
  | 'VILLAGE_WORKS'
  | 'SEALED_COURIER'
  | 'SECT_SERVICE'
  | 'SHARED_COMMONS'
  | 'TERRAIN_RECOVERY'
  | 'RELIC_EXHIBIT'
  | 'ROAD'
  | 'GATHER_HERBS'
  | 'BREW_PILL'
  | 'USE_PILL'
  | 'VILLAGE_CENSUS'
  | 'FIELD_OBSERVATORY'
  | 'OATH_ARBITRATION'
  | 'SEASON_REVIEW'
  | 'PROBATION'
  | 'WORKSHOP'
  | 'FURNACE_RESERVATION'
  | 'SPARRING'
  | 'EXPEDITION_RESCUE'
  | 'SHORT_SHIFT'
  | 'BOUNDARY_RELIEF'
  | 'APPRENTICE_COHORT'
  | 'HOUSEHOLD_NAME'
  | 'FORGE_ARTIFACT'
  | 'BIND_ARTIFACT'
  | 'REPAIR_ARTIFACT'
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

export interface Cultivator {
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

export interface WorldEvent {
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
  innerMonologue: string;
  chosenAction: ActionType;
  observatoryMove?: ObservatoryMove;
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
  targetArtifactId?: string;
  forgeTier?: ArtifactTier;
  probationMove?: ProbationMove;
  targetProbationId?: string;
  targetExpulsionId?: string;
  probationFirstVillageId?: string;
  probationSecondVillageId?: string;
  probationVote?: ProbationVote;
  workshopMove?: WorkshopMove;
  furnaceMove?: 'reserve' | 'cancel';
  targetFurnaceReservationId?: string;
  sparringMove?: SparringMove;
  sparringRounds?: 1 | 2;
  targetSparringId?: string;
  rescueMove?: ExpeditionRescueMove;
  targetExpeditionRescueId?: string;
  shortShiftMove?: ShortShiftMove;
  targetShortShiftId?: string;
  boundaryReliefMove?: BoundaryReliefMove;
  targetBoundaryReliefId?: string;
  cohortMove?: ApprenticeCohortMove;
  cohortInviteeIds?: string[];
  targetCohortId?: string;
  nameMove?: HouseholdNameMove;
  householdAlias?: string;
  targetHouseholdNameId?: string;
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
export interface ChronicleChapterPlan {
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
  possessedId?: string;
  possessionUntilTick?: number;
  switchAvailableTick: number;
  essence: number;
  lastRefreshTick: number;
  pendingOrder?: { actorId: string; action: AvatarOrder; queuedTick: number };
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
export interface SettlementRecord {
  id: string;
  tick: number;
  kind: 'disaster' | 'migration' | 'relief' | 'recruitment' | 'growth';
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

export interface ScenarioOrigin {
  version: 1 | 2;
  ruleset: 1;
  id: string;
  endTick: number;
}

export type ScenarioObjective =
  | { kind: 'cultivator_survives'; actorId: string }
  | { kind: 'living_population'; minimum: number }
  | { kind: 'site_qi'; locationId: string; minimum: number }
  | { kind: 'sect_treasury'; sectId: string; minimum: number };

export type ScenarioAuditEvidence =
  | { kind: 'cultivator_survives'; found: boolean; alive: boolean; hp: number }
  | { kind: 'living_population'; count: number }
  | { kind: 'site_qi'; found: boolean; qi: number }
  | { kind: 'sect_treasury'; found: boolean; atSite: number; inTransit: number; total: number };

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

export type InfirmaryMove = 'request' | 'staff' | 'accept' | 'refuse';
export type InfirmaryClosureReason = 'expiry' | 'ineligible' | 'recovered' | 'refused';
export interface InfirmaryReceipt {
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
}
export interface InfirmaryState {
  cases: InfirmaryCase[];
  shifts: InfirmaryShift[];
  nextId: number;
}

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
export interface SealedDispatch {
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

export type ResourceFlowGood = 'stone' | MarketGood;
export type ResourceFlowMechanism = 'alchemy' | 'market' | 'sect_economy' | 'oath' | 'commons' | 'relocation' | 'terrain' | 'workshop' | 'road' | 'observatory' | 'pilgrimage';
export type ResourceFlowAccount =
  | { kind: 'actor' | 'site' | 'sect' | 'order' | 'shipment' | 'relocation' | 'workshop'; id: string }
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
export type WorkshopStatus = 'offered' | 'active' | 'completed' | 'cancelled' | 'declined' | 'expired';
export type WorkshopCloseReason = 'patron_cancelled' | 'maker_cancelled' | 'offer_expired' |
  'work_expired' | 'patron_unavailable' | 'maker_unavailable' | 'site_unavailable';

export interface WorkshopWorkReceipt {
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
export interface WorkshopOrder {
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
  escrowStones: number;
  escrowHerbs: number;
  refundedStones: number;
  refundedHerbs: number;
  work: WorkshopWorkReceipt[];
}
export interface WorkshopState { orders: WorkshopOrder[]; nextId: number }

export type FurnaceUseKind = 'brew' | 'forge' | 'repair' | 'awaken' | 'workshop' | 'relic';
export interface FurnaceReservation {
  id: string;
  actorId: string;
  siteId: string;
  workshopOrderId?: string;
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
export type FieldObservatoryRun = {
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

export interface WorldState {
  fieldObservatories: FieldObservatoriesState;
  villageCensuses: VillageCensusesState;
  probation: ProbationState;
  workshops: WorkshopState;
  furnaceReservations: FurnaceReservationState;
  sparring: SparringState;
  expeditionRescues: ExpeditionRescueState;
  shortShifts: ShortShiftState;
  boundaryReliefs: BoundaryReliefState;
  apprenticeCohorts: ApprenticeCohortState;
  householdNames: HouseholdNameState;
  resourceFlow: ResourceFlowState;
  roads: RoadState;
  sharedCommons: SharedCommonsState;
  serviceRetirement: ServiceRetirementState;
  coldHistory: ColdHistoryState;
  couriers: SealedCourierState;
  watchlists: WatchlistState;
  villageWorks: VillageWorksState;
  households: HouseholdState;
  territorialLeases: TerritorialLeaseState;
  formations: FormationNetworkState;
  infirmaries: InfirmaryState;
  habitats: HabitatState;
  chronicleErrata: ChronicleErrataState;
  chronicleCausality: CausalChronicleState;
  pilgrimages: PilgrimageState;
  credit: SectCreditState;
  sanctuary: SanctuaryState;
  research: ResearchState;
  ceasefires: CeasefireState;
  annotations: AnnotationState;
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
  decisionTrace: DecisionTraceState;
  estates: EstateState;
  witnesses: WitnessState;
  settlements: SettlementState;
  markets: MarketState;
  oaths: OathState;
  oathArbitrations: OathArbitrationState;
  mentorship: MentorshipState;
  random: WorldRandomState;
  playerAvatar: PlayerAvatarState;
  chronicleArchive: ChronicleArchive;
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
