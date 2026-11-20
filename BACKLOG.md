# BACKLOG.md — Infinite Evolution Task Queue (天道沙盒开发任务队列)

> **Instructions for Autonomous Agent (Dots / GPT / Codex):**
> 1. Always work on the top-most unchecked `- [ ]` task (or a coherent batch of 1-2 closely related tasks).
> 2. Every task requires **full implementation + UI integration + Vitest tests + `npm run verify` + Git commit**.
> 3. **Self-Proliferation**: Whenever unchecked tasks drop below 20, append a new Phase at the bottom with at least 10 new deep mechanics tasks.
> 4. **Never stop after one task**—immediately move to the next `- [ ]` item!

---

## Phase 0: Foundation & Core Loop (已完成基座)
- [x] **[P0-1]** Initialize Vite + React + TypeScript + Tailwind + Vitest workspace.
- [x] **[P0-2]** Define core domain types (`Cultivator`, `Sect`, `LocationNode`, `MemoryEntry`, `RelationshipEdge`, `WorldEvent`, `LLMDecisionPayload`) in `src/types/world.ts`.
- [x] **[P0-3]** Build procedural initial world with 4 distinct Sects, 9 cultivation realms, spirit veins, and initial cultivators in `src/data/initialWorld.ts`.
- [x] **[P0-4]** Implement core tick engine (`advanceWorldTick`, breakthrough/tribulation rolls, combat resolution, relationship updates, God interventions) in `src/engine/worldEngine.ts`.
- [x] **[P0-5]** Implement Dual-Mode AI Brain (`src/engine/llmBrain.ts`) supporting OpenAI/Gemini compatible API structured JSON decisions + offline heuristic Utility AI fallback.
- [x] **[P0-6]** Build interactive 2D World Map Canvas, SVG Relationship Graph, God Intervention Console, Agent Psyche Inspector, and Chronicle Feed.
- [x] **[P0-7]** Establish initial Vitest suite (`tests/worldEngine.test.ts`) verifying tick progression, breakthroughs, and God interventions.

---

## Phase 1: Deep Cognitive Architecture & Memory Reflection (斯坦福小镇式记忆与心魔系统)
- [x] **[P1-1] Episodic Memory Importance & Decay System**: Enhance `MemoryEntry` in `src/types/world.ts` and `src/engine/worldEngine.ts` with `importance` (1-10), `emotionalValence` (-5 to +5), and `decayRate`. Implement automatic memory pruning and long-term core memory consolidation every 12 ticks (1 virtual year). Add unit tests in `tests/memory.test.ts`.
- [x] **[P1-2] Daily/Yearly Self-Reflection Synthesis (记忆反思与道心凝练)**: Create `src/engine/reflectionEngine.ts`. Every 12 ticks, each cultivator synthesizes their recent high-importance memories into higher-level `Belief` / `CoreObsession` (执念/心魔) statements (via LLM or heuristic synthesizer). Display active Obsessions and Heart Demons in `AgentInspector.tsx`.
- [x] **[P1-3] Rumor & Information Propagation Network (修仙界流言与情报网)**: Implement `src/engine/rumorEngine.ts`. Cultivators do not have omniscient knowledge of the world; instead, when an event happens at a location, witnesses record a `Rumor` and spread it to others at the same location or via sect flying swords (飞剑传书). False or exaggerated rumors can be fabricated by deceitful (`阴险`/`诡诈`) NPCs.
- [x] **[P1-4] Secret Schemes & Multi-Tick Goals (长线阴谋与多步计划状态机)**: Add `activeScheme` to `Cultivator` (e.g., "Infiltrate Blood Moon Sect", "Save spirit stones for Foundation Establishment Pill", "Avenge fallen master", "Steal Sect Supreme Artifact"). Break schemes into 3-5 sequential sub-steps tracked across ticks, visible in `AgentInspector.tsx`.
- [x] **[P1-5] Dialogue & Debate Generator (修士论道与对峙剧场)**: When two cultivators meet for combat, trade, dual cultivation, or sect diplomacy, generate a multi-turn dramatic dialogue transcript (`DialogueExchange`) stored in the event log and viewable in a dedicated modal or expandable card in `ChronicleFeed.tsx`.

---

## Phase 2: Rich Cultivation, Alchemy, Artifacts & Techniques (功法、炼丹、炼器与天劫深度演化)
- [x] **[P2-1] Elemental Five-Phases Affinity & Spirit Roots (五行灵根与相生相克)**: Add `SpiritRoot` (`金`, `木`, `水`, `火`, `土`, `雷`, `暗`, `天灵根`) to cultivators, locations, techniques, and artifacts. Implement elemental damage multipliers and cultivation speed modifiers when practicing matching/clashing techniques on elemental spirit veins.
- [x] **[P2-2] Cultivation Technique Mastery & Procedural Scripture Creation (功法参悟与自创神通)**: Allow High-Realm cultivators (`元婴` and above) to author original techniques (`Technique`) named after their personality and history, storing them in their Sect Pavilion (藏经阁) or dropping them as inheritance scrolls upon death.
- [x] **[P2-3] Alchemy System: Herbs, Recipes, Furnaces & Pill Toxicity (炼丹系统与丹毒机制)**: Create `src/engine/alchemyEngine.ts`. Add gatherable spirit herbs on map nodes, alchemy recipes (筑基丹, 九转金丹, 破障丹, 噬心毒丹), crafting success rolls, and `pillToxicity` accumulation on cultivators who over-consume pills.
- [x] **[P2-4] Artifact Forging, Spirit Weapon Souls & Looting (法宝炼制、器灵与杀人夺宝)**: Create `src/engine/artifactEngine.ts`. Support tiered equipment (`法器` -> `灵器` -> `法宝` -> `通天灵宝`), artifact durability, blood-binding (滴血认主), and automatic looting of a slain enemy's storage ring (储物戒) after lethal duels.
- [ ] **[P2-5] Multi-Stage Heavenly Tribulation & Heart Demon Trial (九重雷劫与心魔劫演武)**: Upgrade breakthrough to `金丹`, `元婴`, `化神`, `渡劫` into a multi-wave tribulation event (`src/engine/tribulationEngine.ts`). Include physical lightning waves (mitigated by artifacts/pills), Heart Demon trials (mitigated by Dao Heart stability & low unresolved grudges), and external interference (enemies ambushing a cultivator during their tribulation!).

---

## Phase 3: Sect Politics, Territory Economy & Faction Warfare (宗门内政、领地经济与正魔大战)
- [ ] **[P3-1] Sect Hierarchy, Elections & Coup d'État (宗门职位晋升与夺权政变)**: Implement sect ranks (`外门弟子` -> `内门弟子` -> `真传弟子` -> `长老` -> `太上长老` -> `掌门`). Automatically promote based on realm and sect contribution points (`contribution`). Allow ambitious elders with high power and faction backing to challenge or assassinate the Sect Leader.
- [ ] **[P3-2] Sect Buildings, Spirit Stone Mines & Array Formations (宗门建设与护山大阵)**: Add buildable facilities to Sect headquarters (`聚灵阵`, `炼丹房`, `藏经阁`, `护山大阵`, `灵石矿脉`). Sects collect monthly tax/spirit stones, maintain their defensive array HP, and dispatch disciples to guard resource nodes.
- [ ] **[P3-3] Inter-Sect Diplomacy Matrix & War Declarations (宗门外交矩阵与宗门大战)**: Track bilateral sect relations (-100 Blood Feud to +100 Sworn Alliance). Implement formal War Declarations, Alliance Treaties, Tribute Demands, and full-scale Sect Siege campaigns where 5+ cultivators march together to attack an enemy sect's Protective Array.
- [ ] **[P3-4] Grand Sect Tournament & Secret Realm Expeditions (百年宗门大比与上古秘境开启)**: Every 60 ticks (5 years), spawn either an Inter-Sect Grand Tournament (bracket duel with rich rewards & prestige) or a temporary Ancient Secret Realm (上古秘境) on the map with high mortality and legendary loot.
- [ ] **[P3-5] Demonic Corruption, Bounty Board & Righteous Alliances (魔道悬赏榜与正道讨魔盟)**: Add a global Bounty Board (`天机悬赏榜`). Cultivators who commit mass slaughter or betray their sect gain `karma` (业力/魔气) and get placed on the bounty board, attracting righteous bounty hunters.

---

## Phase 4: Spatial 2D WorldBox Map & Interactive Canvas Upgrades (2D 像素/水墨沙盒地图深度进化)
- [ ] **[P4-1] Grid/Tile Biome Map Generator & Fog of War (多地形网格地图与灵气分布热力图)**: Upgrade `src/components/WorldMapCanvas.tsx` and world data to render rich terrain biomes (灵山, 毒沼, 剑冢, 荒漠, 魔渊, 坊市), animated spirit qi density heatmap overlay, and territory borders colored by controlling sect.
- [ ] **[P4-2] Smooth Entity Pathfinding, Projectiles & Combat VFX (剑光飞行、斗法粒子特效与渡劫雷云)**: Add sub-tick interpolated movement trails (御剑飞行流光), floating damage/breakthrough text popups, sword beam clashes during duels, and dramatic lightning bolts on the Canvas when a tribulation or God Smite occurs.
- [ ] **[P4-3] Map Zoom, Pan, Minimap & Brush Tooling (地图缩放平移与天道地形画笔)**: Implement mouse-wheel zoom, click-and-drag pan, a corner minimap, and WorldBox-style God Brushes (paint Spirit Veins, drop Meteorite, spawn Beast Tide, raise Cursed Miasma directly by clicking/dragging on the canvas).
- [ ] **[P4-4] Roaming Spirit Beasts & Monster Lairs (妖兽森林、护宝灵兽与兽潮爆发)**: Populate wilderness nodes with Spirit Beasts (`妖兽` / `凶兽` / `瑞兽`) that cultivate, guard herbs, attack passing low-realm cultivators, can be tamed as Spirit Pets (`灵宠`), or erupt into periodic Beast Tides (`兽潮`).

---

## Phase 5: Advanced LLM Multi-Agent Orchestration & Token Burners (高阶多智能体博弈与深度烧Token引擎)
- [ ] **[P5-1] Sect Elder Council Multi-Agent Debate (宗门长老议事厅多Agent圆桌辩论)**: Create `src/engine/councilEngine.ts` and `src/components/SectCouncilModal.tsx`. Allow the user (or periodic annual trigger) to convene a Sect Council where 3-5 top elders of a sect conduct a multi-turn LLM debate on sect strategy (declare war, expel a traitor, allocate the last Foundation Pill) and vote on a binding policy.
- [ ] **[P5-2] Heavenly Dao Chronicler & Chapter Novel Generator (天道史官：自动生成连载修仙小说章节)**: Create `src/engine/novelGenerator.ts` and a "藏书阁 / 纪传体史书" UI tab. Accumulate every 12-24 ticks of world events, dialogues, and character arcs and synthesize them into a rich, literary Chinese Xianxia novel chapter (`第X章：...`) with character biographies!
- [ ] **[P5-3] Batch Concurrent LLM Agent Scheduler & Token Telemetry Dashboard (并发Agent推理调度器与Token消耗仪表盘)**: Track real-time prompt tokens, completion tokens, latency, requests per minute, and estimated cost across all NPC brain calls. Add a sleek Telemetry Panel in the header/drawer and support configurable batch concurrency (e.g., running 5 NPC LLM calls in parallel per tick).
- [ ] **[P5-4] Player Avatar Possession & Interactive Chat/Torture/Recruitment (夺舍降临模式：玩家亲自对话、审问或收徒)**: Allow the user to "Possess (夺舍)" any cultivator or speak as an Ancient Ring Grandpa (随身老爷爷) directly via a real-time chat box with that NPC, persuading, deceiving, guiding, or interrogating them in natural language.

---

## Phase 6: Persistence, Time Travel, Analytics & Replay Studio (存档、时间轴回溯与数据大屏)
- [ ] **[P6-1] IndexedDB / LocalStorage Save Slots & JSON World Export/Import (多槽位存档与世界种子导出)**: Build `src/engine/storageEngine.ts` enabling full world snapshot saving, loading, JSON file export/import, and custom World Seed configuration before starting a new universe.
- [ ] **[P6-2] Snapshot Time-Machine & Branching Timelines (时光倒流与平行宇宙分支)**: Keep ring-buffer snapshots of the last 50 ticks so the user can scrub backward on a timeline slider, inspect historical states, and fork a new timeline by injecting a different God Intervention in the past.
- [ ] **[P6-3] Cultivation World Analytics & Demographics Charts (修仙界宏观人口、境界金字塔与灵石经济图表)**: Build `src/components/AnalyticsModal.tsx` showing SVG charts of realm population distribution over time, sect wealth power curves, mortality causes pie chart (天劫 vs 仇杀 vs 寿元耗尽), and top legendary cultivators hall of fame (封神榜 / 陨落榜).
- [ ] **[P6-4] Headless 1000-Tick Stress Benchmark & Balance Auto-Tuner (千轮无头压力测试与天道数值平衡测试集)**: Add `tests/simulationBalance.test.ts` that runs a 500-tick headless simulation verifying that population neither goes extinct nor explodes infinitely, sect wars resolve properly, and memory bounds remain stable.

---

## Phase 7: Living Legacies, Markets & Accountable Institutions (传承、鬼市与宗门制度)

- [ ] **[P7-1] Apprenticeship, Teaching & Inheritance Chains (师徒授艺与衣钵谱系)**: Give mentors a limited teaching budget, allow apprentices to accept or refuse tuition, and propagate unlocked techniques and flawed interpretations along the lineage. Show proficiency changes and an inspectable lineage, and test that unrelated NPCs receive no training benefit.
- [ ] **[P7-2] Sect Contracts & Oath Arbitration (天道契书与宗门仲裁)**: Model scoped terms, collateral escrow, milestones and deadlines. Process fulfillment and breach exactly once, make settlement depend on evidence, and show escrow flow and appeal status in the diplomacy UI.
- [ ] **[P7-3] Seasonal Qi Weather & Resource Migrations (四时灵潮与灵脉迁徙)**: Add deterministic seasonal qi fronts that alter herb regeneration, travel and monster migration without destroying resources arbitrarily. Show forecasts separately from observations and batch-test multiple seeds for bounded resource levels.
- [ ] **[P7-4] Regional Order Books & Merchant Caravans (坊市挂单与跨境商队)**: Turn regional trading into inventory-conserving, price-time matched orders with escrow and caravan transit. Model market closures, partial fills and lost shipments; expose positions, receipts and settlement in the market pane.
- [ ] **[P7-5] Mortal Villages, Recruitment & Relief (凡人村镇与仙门招徕)**: Add settlements with finite populations, willingness to join sects, and relief decisions after disasters. Recruit only eligible volunteers, track migration and sect sponsorship, and inspect population changes on the map.
- [ ] **[P7-6] Witness Attestations & False-Report Appeals (证词、辟谣与名誉修复)**: Keep source lineage separate from agreement count; compare testimony with first-hand events without granting NPCs global knowledge. Give a wrongfully accused actor a bounded challenge route and show corroborated, disputed and retracted claims.
- [ ] **[P7-7] Funeral Rites, Estates & Heir Disputes (归葬、遗产与继承争议)**: Form an estate from assets left after verified loot, resolve named heirs and claims, and hold memorial events that update relationships. Require zero duplicated assets across corpse, estate, heirs and marketplace.
- [ ] **[P7-8] Decision Trace & One-Turn Counterfactuals (天机溯因与单回合假设复盘)**: Record public rationale, legal candidates and deterministic utility scores without exposing hidden reasoning. Let the player replay one turn on an isolated branch with an alternate legal action and compare effects without modifying the original timeline.
- [ ] **[P7-9] Accessible World Map Action Parity (键盘山河图与无障碍操作对等)**: Offer a keyboard-accessible node/agent explorer equivalent to essential Canvas controls, including panning, focus tracking, selected actor quick jumps and live event targets. Test reduced motion, keyboard activation and stable focus after realm changes.
- [ ] **[P7-10] Doctrinal Schools, Schisms & Reconciliation (道统分野与宗门和解)**: Let beliefs aggregate into schools with evidence and dissent thresholds distinct from rank. Resolve negotiation, peaceful separation or reconciliation, conserve members and held assets across changes, and visualize shifting support in a doctrine history panel.
