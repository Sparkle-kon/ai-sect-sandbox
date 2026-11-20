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

export interface Cultivator {
  id: string;
  name: string;
  title: string;
  sectId: string;
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
  artifacts: Artifact[];
  memories: MemoryEntry[];
  coreMemories: MemoryEntry[];
  memorySequence: number; // Monotonic across evictions
  reflections: CultivatorReflection[];
  rumors: Rumor[];
  activeScheme?: CultivatorScheme;
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
}

export interface WorldState {
  tick: number;
  interventionSequence: number;
  year: number;
  month: number;
  sects: Sect[];
  locations: LocationNode[];
  cultivators: Cultivator[];
  relationships: RelationshipEdge[];
  events: WorldEvent[];
}
