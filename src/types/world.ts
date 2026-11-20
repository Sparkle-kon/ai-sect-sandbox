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
  status: 'marching' | 'sieging' | 'victory' | 'repelled';
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

export interface WorldState {
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
  cultivators: Cultivator[];
  relationships: RelationshipEdge[];
  events: WorldEvent[];
}
