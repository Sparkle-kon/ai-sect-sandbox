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
  | 'GATHER_HERBS'
  | 'BREW_PILL'
  | 'USE_PILL'
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

export interface LLMConfig {
  enabled: boolean;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
}

export interface LLMDecisionPayload {
  innerMonologue: string;
  chosenAction: ActionType;
  targetLocationId?: string;
  targetCultivatorId?: string;
  spokenLine?: string;
  rumorIntent?: 'FABRICATE' | 'EXAGGERATE';
  proposedScheme?: SchemeKind;
  targetTuitionId?: string;
  targetOathId?: string;
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
  version: 1;
  ruleset: 1;
  id: string;
  endTick: number;
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

export type PilgrimageMove = 'propose' | 'accept' | 'decline' | 'advance' | 'relieve' | 'withdraw';
export type PilgrimageEndReason = 'declined' | 'offer_expiry' | 'journey_expiry' | 'withdrawn' | 'lost_site' | 'member_missing';
export interface PilgrimageAid {
  tick: number;
  giverId: string;
  receiverId: string;
  locationId: string;
  hpRestored: number;
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
}
export interface PilgrimageState {
  journeys: PilgrimageJourney[];
  nextId: number;
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

export interface WorldState {
  territorialLeases: TerritorialLeaseState;
  formations: FormationNetworkState;
  infirmaries: InfirmaryState;
  habitats: HabitatState;
  chronicleErrata: ChronicleErrataState;
  pilgrimages: PilgrimageState;
  credit: SectCreditState;
  sanctuary: SanctuaryState;
  research: ResearchState;
  ceasefires: CeasefireState;
  annotations: AnnotationState;
  scenarioOrigin?: ScenarioOrigin;
  escorts: EscortState;
  competitions: CompetitionState;
  scriptures: ScriptureState;
  relics: RelicState;
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
  spiritBeasts: SpiritBeast[];
  cultivators: Cultivator[];
  relationships: RelationshipEdge[];
  events: WorldEvent[];
}
