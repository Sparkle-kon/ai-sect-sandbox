# BACKLOG.md — Infinite Evolution Task Queue (天道沙盒开发任务队列)

> **接续方法：** 从顶部第一个未勾选项开始，每项独立实现、测试、验证和发布；完成后接下一项，不等人为确认。
> **完成标准：** 双引擎、相关 UI/Canvas、确定性测试、`npm run verify`、更新 CHANGELOG、单独提交并核对远端。
> **补队列：** 完成后若剩少于 20 项，追加一个包含 10 项具体可验收机制的新阶段。
> **运行边界：** 同一次运行里逐项连续做，不设置周期唤醒。遇系统硬上限时保存检查点，未验证的工作不勾选。完整规则见 [AGENTS.md](AGENTS.md)。

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
- [x] **[P2-5] Multi-Stage Heavenly Tribulation & Heart Demon Trial (九重雷劫与心魔劫演武)**: Upgrade breakthrough to `金丹`, `元婴`, `化神`, `渡劫` into a multi-wave tribulation event (`src/engine/tribulationEngine.ts`). Include physical lightning waves (mitigated by artifacts/pills), Heart Demon trials (mitigated by Dao Heart stability & low unresolved grudges), and external interference (enemies ambushing a cultivator during their tribulation!).

---

## Phase 3: Sect Politics, Territory Economy & Faction Warfare (宗门内政、领地经济与正魔大战)
- [x] **[P3-1] Sect Hierarchy, Elections & Coup d'État (宗门职位晋升与夺权政变)**: Implement sect ranks (`外门弟子` -> `内门弟子` -> `真传弟子` -> `长老` -> `太上长老` -> `掌门`). Automatically promote based on realm and sect contribution points (`contribution`). Allow ambitious elders with high power and faction backing to challenge or assassinate the Sect Leader.
- [x] **[P3-2] Sect Buildings, Spirit Stone Mines & Array Formations (宗门建设与护山大阵)**: Add buildable facilities to Sect headquarters (`聚灵阵`, `炼丹房`, `藏经阁`, `护山大阵`, `灵石矿脉`). Sects collect monthly tax/spirit stones, maintain their defensive array HP, and dispatch disciples to guard resource nodes.
- [x] **[P3-3] Inter-Sect Diplomacy Matrix & War Declarations (宗门外交矩阵与宗门大战)**: Track bilateral sect relations (-100 Blood Feud to +100 Sworn Alliance). Implement formal War Declarations, Alliance Treaties, Tribute Demands, and full-scale Sect Siege campaigns where 5+ cultivators march together to attack an enemy sect's Protective Array.
- [x] **[P3-4] Grand Sect Tournament & Secret Realm Expeditions (百年宗门大比与上古秘境开启)**: Every 60 ticks (5 years), spawn either an Inter-Sect Grand Tournament (bracket duel with rich rewards & prestige) or a temporary Ancient Secret Realm (上古秘境) on the map with high mortality and legendary loot.
- [x] **[P3-5] Demonic Corruption, Bounty Board & Righteous Alliances (魔道悬赏榜与正道讨魔盟)**: Add a global Bounty Board (`天机悬赏榜`). Cultivators who commit mass slaughter or betray their sect gain `karma` (业力/魔气) and get placed on the bounty board, attracting righteous bounty hunters.

---

## Phase 4: Spatial 2D WorldBox Map & Interactive Canvas Upgrades (2D 像素/水墨沙盒地图深度进化)
- [x] **[P4-1] Grid/Tile Biome Map Generator & Fog of War (多地形网格地图与灵气分布热力图)**: Upgrade `src/components/WorldMapCanvas.tsx` and world data to render rich terrain biomes (灵山, 毒沼, 剑冢, 荒漠, 魔渊, 坊市), animated spirit qi density heatmap overlay, and territory borders colored by controlling sect.
- [x] **[P4-2] Smooth Entity Pathfinding, Projectiles & Combat VFX (剑光飞行、斗法粒子特效与渡劫雷云)**: Add sub-tick interpolated movement trails (御剑飞行流光), floating damage/breakthrough text popups, sword beam clashes during duels, and dramatic lightning bolts on the Canvas when a tribulation or God Smite occurs.
- [x] **[P4-3] Map Zoom, Pan, Minimap & Brush Tooling (地图缩放平移与天道地形画笔)**: Implement mouse-wheel zoom, click-and-drag pan, a corner minimap, and WorldBox-style God Brushes (paint Spirit Veins, drop Meteorite, spawn Beast Tide, raise Cursed Miasma directly by clicking/dragging on the canvas).
- [x] **[P4-4] Roaming Spirit Beasts & Monster Lairs (妖兽森林、护宝灵兽与兽潮爆发)**: Populate wilderness nodes with Spirit Beasts (`妖兽` / `凶兽` / `瑞兽`) that cultivate, guard herbs, attack passing low-realm cultivators, can be tamed as Spirit Pets (`灵宠`), or erupt into periodic Beast Tides (`兽潮`).

---

## Phase 5: Advanced LLM Multi-Agent Orchestration & Token Burners (高阶多智能体博弈与深度烧Token引擎)
- [x] **[P5-1] Sect Elder Council Multi-Agent Debate (宗门长老议事厅多Agent圆桌辩论)**: Create `src/engine/councilEngine.ts` and `src/components/SectCouncilModal.tsx`. Allow the user (or periodic annual trigger) to convene a Sect Council where 3-5 top elders of a sect conduct a multi-turn LLM debate on sect strategy (declare war, expel a traitor, allocate the last Foundation Pill) and vote on a binding policy.
- [x] **[P5-2] Heavenly Dao Chronicler & Chapter Novel Generator (天道史官：自动生成连载修仙小说章节)**: Create `src/engine/novelGenerator.ts` and a "藏书阁 / 纪传体史书" UI tab. Accumulate every 12-24 ticks of world events, dialogues, and character arcs and synthesize them into a rich, literary Chinese Xianxia novel chapter (`第X章：...`) with character biographies!
- [x] **[P5-3] Batch Concurrent LLM Agent Scheduler & Token Telemetry Dashboard (并发Agent推理调度器与Token消耗仪表盘)**: Track real-time prompt tokens, completion tokens, latency, requests per minute, and estimated cost across all NPC brain calls. Add a sleek Telemetry Panel in the header/drawer and support configurable batch concurrency (e.g., running 5 NPC LLM calls in parallel per tick).
- [x] **[P5-4] Player Avatar Possession & Interactive Chat/Torture/Recruitment (夺舍降临模式：玩家亲自对话、审问或收徒)**: Allow the user to "Possess (夺舍)" any cultivator or speak as an Ancient Ring Grandpa (随身老爷爷) directly via a real-time chat box with that NPC, persuading, deceiving, guiding, or interrogating them in natural language.

---

## Phase 6: Persistence, Time Travel, Analytics & Replay Studio (存档、时间轴回溯与数据大屏)
- [x] **[P6-1] IndexedDB / LocalStorage Save Slots & JSON World Export/Import (多槽位存档与世界种子导出)**: Build `src/engine/storageEngine.ts` enabling full world snapshot saving, loading, JSON file export/import, and custom World Seed configuration before starting a new universe.
- [x] **[P6-2] Snapshot Time-Machine & Branching Timelines (时光倒流与平行宇宙分支)**: Keep ring-buffer snapshots of the last 50 ticks so the user can scrub backward on a timeline slider, inspect historical states, and fork a new timeline by injecting a different God Intervention in the past.
- [x] **[P6-3] Cultivation World Analytics & Demographics Charts (修仙界宏观人口、境界金字塔与灵石经济图表)**: Build `src/components/AnalyticsModal.tsx` showing SVG charts of realm population distribution over time, sect wealth power curves, mortality causes pie chart (天劫 vs 仇杀 vs 寿元耗尽), and top legendary cultivators hall of fame (封神榜 / 陨落榜).
- [x] **[P6-4] Headless 1000-Tick Stress Benchmark & Balance Auto-Tuner (千轮无头压力测试与天道数值平衡测试集)**: Add `tests/simulationBalance.test.ts` that runs a 500-tick headless simulation verifying that population neither goes extinct nor explodes infinitely, sect wars resolve properly, and memory bounds remain stable.

---

## Phase 7: Living Legacies, Markets & Accountable Institutions (传承、鬼市与宗门制度)

- [x] **[P7-1] Apprenticeship, Teaching & Inheritance Chains (师徒授艺与衣钵谱系)**: Give mentors a limited teaching budget, allow apprentices to accept or refuse tuition, and propagate unlocked techniques and flawed interpretations along the lineage. Show proficiency changes and an inspectable lineage, and test that unrelated NPCs receive no training benefit.
- [x] **[P7-2] Sect Contracts & Oath Arbitration (天道契书与宗门仲裁)**: Model scoped terms, collateral escrow, milestones and deadlines. Process fulfillment and breach exactly once, make settlement depend on evidence, and show escrow flow and appeal status in the diplomacy UI.
- [x] **[P7-3] Seasonal Qi Weather & Resource Migrations (四时灵潮与灵脉迁徙)**: Add deterministic seasonal qi fronts that alter herb regeneration, travel and monster migration without destroying resources arbitrarily. Show forecasts separately from observations and batch-test multiple seeds for bounded resource levels.
- [x] **[P7-4] Regional Order Books & Merchant Caravans (坊市挂单与跨境商队)**: Turn regional trading into inventory-conserving, price-time matched orders with escrow and caravan transit. Model market closures, partial fills and lost shipments; expose positions, receipts and settlement in the market pane.
- [x] **[P7-5] Mortal Villages, Recruitment & Relief (凡人村镇与仙门招徕)**: Add settlements with finite populations, willingness to join sects, and relief decisions after disasters. Recruit only eligible volunteers, track migration and sect sponsorship, and inspect population changes on the map.
- [x] **[P7-6] Witness Attestations & False-Report Appeals (证词、辟谣与名誉修复)**: Keep source lineage separate from agreement count; compare testimony with first-hand events without granting NPCs global knowledge. Give a wrongfully accused actor a bounded challenge route and show corroborated, disputed and retracted claims.
- [x] **[P7-7] Funeral Rites, Estates & Heir Disputes (归葬、遗产与继承争议)**: Form an estate from assets left after verified loot, resolve named heirs and claims, and hold memorial events that update relationships. Require zero duplicated assets across corpse, estate, heirs and marketplace.
- [x] **[P7-8] Decision Trace & One-Turn Counterfactuals (天机溯因与单回合假设复盘)**: Record public rationale, legal candidates and deterministic utility scores without exposing hidden reasoning. Let the player replay one turn on an isolated branch with an alternate legal action and compare effects without modifying the original timeline.
- [x] **[P7-9] Accessible World Map Action Parity (键盘山河图与无障碍操作对等)**: Offer a keyboard-accessible node/agent explorer equivalent to essential Canvas controls, including panning, focus tracking, selected actor quick jumps and live event targets. Test reduced motion, keyboard activation and stable focus after realm changes.
- [x] **[P7-10] Doctrinal Schools, Schisms & Reconciliation (道统分野与宗门和解)**: Let beliefs aggregate into schools with evidence and dissent thresholds distinct from rank. Resolve negotiation, peaceful separation or reconciliation, conserve members and held assets across changes, and visualize shifting support in a doctrine history panel.

---

## Phase 8: Deep Time, Relic Economies & Scenario Tools (长纪元、古器经济与沙盒共创)

- [x] **[P8-1] Living Worldgen Profiles (世界生成谱系)**: Select seeded climate, faction distributions and scarcity profiles; certify that every world has reachable starting resources and distinguish world-generation choices from later interventions.
- [x] **[P8-2] Displacement & Sect Resettlement (山门迁移与流亡重建)**: Let damaged sects relocate using supplies, a real route and relocation votes; move treasury, pavilions and garrisons exactly once and preserve abandoned-site history.
- [x] **[P8-3] Reincarnation & Uncertain Recollection (轮回与残响)**: Add rare rebirth from a recorded death with explicit probability, uncertain narrative fragments and no duplicated possessions, office or ground-truth knowledge.
- [x] **[P8-4] Relic Fragments & Set Resonance (碎片重铸与套装共鸣)**: Define provenance for each fragment, recover missing components through multiple play paths, assemble them at a valid site and show actual nonstacking set effects.
- [x] **[P8-5] Scripture Translation and Competing Editions (经义校勘与异本参修)**: Track inherited originals, glosses and corrected editions; allow mistranslations to alter mastery tradeoffs, with comparisons and independently testable correction.
- [x] **[P8-6] Public Competitions and Rank Seasons (赛季榜与参赛资格)**: Score achievements against a typed rulebook, award seasonal honors exactly once, separate private schemes from public rankings, and preserve opt-out choices.
- [x] **[P8-7] Movement Hazards and Escort Logistics (驿路护镖与险区规避)**: Make escort paths account for travel risk, supplies and visibility; distinguish client cargo from escort possessions and show route changes driven by trusted reports.
- [x] **[P8-8] Scenario Authoring & Fixture Exchange (剧本编辑与复演交换)**: Let players compose a constrained initial scenario, validate references before import and export a seed-plus-command fixture that replays deterministically without exporting credentials.
- [x] **[P8-9] Chronicle Bookmarks & Annotated Maps (纪年书签与地图批注)**: Bookmark public events and add map annotations scoped to the timeline; preserve them across save/export and prevent spoilers from another branch.
- [x] **[P8-10] Ceasefire, Relief & Reconstruction (止戈、救济与战后重建)**: Allow war-weary sects to negotiate arms pauses, withdraw armies, escrow reconstruction aid, and record breaches with visible consequences for the signatories.

---

## Phase 9: Institutions, Stewardship & Long-Horizon Play (制度、守护与纪元经营)

- [x] **[P9-1] Research Assemblies & Shared Discoveries (论道会与共研创法)**: Let sect members pool explicitly committed time and materials on a bounded research question, attribute contributions, permit justified withdrawal, and unlock one reproducible discovery without duplicating pavilion copies.
- [x] **[P9-2] Sanctuary Charters & Safe Conduct (避难所与通行敕令)**: Establish bounded protection for eligible visitors at specific sites, honor access independently of faction alliance, and show when and why sanctuary rights or shields expire or are violated.
- [x] **[P9-3] Sect Credit, Repayment & Insolvency (宗门信贷与清算)**: Keep internal loans distinct from trade and oath collateral, reject overcommitted lenders, settle repayments and bounded defaults from actual holdings exactly once, and expose the surviving exposure by sect.
- [x] **[P9-4] Pilgrimages & Shared Vows (朝山巡礼与共愿)**: Plan multi-stop noncombat journeys with companionship, tangible travel costs and known-route constraints. Track partial completion and relief for companions without instantly revealing undiscovered locations.
- [x] **[P9-5] Conflicting Chronicles & Errata (纪传异闻与勘误)**: Link public retellings to stable source facts, flag contradictory claims without choosing truth from prose alone, and add corrections without rewriting simulation facts or leaking participant-only knowledge.
- [x] **[P9-6] Habitat Stewardship & Beast Rewilding (灵兽栖息地与放归)**: Let qualified stewards spend fixed resources to restore habitats and release eligible pets. Use carrying capacities and follow-up sightings to distinguish successful rewilding from runaway spawns.
- [x] **[P9-7] Sect Infirmaries & Recovery Triage (宗门静养院与救治调度)**: Queue fictional injury recovery by need, capacity and guard availability; consume real supplies, permit refusal, and compare treatment, wait and field rest in deterministic scenarios.
- [x] **[P9-8] Interlinked Formations & Qi Dispatch (阵网连通与灵气调拨)**: Make array links relay bounded qi through actual owned facilities, account for losses and overloads, and draw active/broken links on the map with nonexplosive conservation tests.
- [x] **[P9-9] Territorial Leases & Resource Access (地契租赁与采集许可)**: Allow reversible, time-limited site rights without transferring sovereignty, validate lessee use and payments, and restore access correctly at expiry or after an ownership transition.
- [x] **[P9-10] Era Objectives & Scenario Audit Cards (纪元目标与完成凭证)**: Compose challenge objectives from independently testable conditions and a frozen scenario seed. Publish precise completion or failure evidence for each objective without mutating other branches or awarding achievements twice.

---

## Phase 10: Readable Long Worlds and Local Institutions (长局可读性与地方制度)

- [x] **[P10-1] Households and Generational Registers (家户谱系与代际坊籍)**: Track kinship and voluntary guardianship separately from sect rank. Use actual birth cohorts, migration and deaths to carry household membership forward without doubling village or recruit counts.
- [x] **[P10-2] Village Works and Carrying Capacity (村镇工役与承载增长)**: Let residents contribute bounded labor and sect sponsors spend real materials on wells, fields or shelters. Show completed capacity changes and maintain valid birth/abandonment paths after disasters.
- [x] **[P10-3] Large-Roster Map Aggregation (大规模名册与地图聚合)**: Cluster visible markers by screen scale while preserving every reachable individual through the searchable index. Add a selected-person relationship neighborhood and paged full relations instead of a global ring. Benchmark/map-test 48 and 526 actor fixtures at narrow viewports, test touch drill-down, and prevent counts from exposing fog-hidden occupants.
- [x] **[P10-4] Quiet Player Watchlists (静默关注与推演摘要)**: Let players opt in to in-game actor, site and sect watches. Coalesce repeat events into a small per-tick digest, preserve the uncluttered default, and keep watch data and unread state tied to the right branch.
- [x] **[P10-5] Sealed Couriers and Lost Dispatches (密函递送与消息失联)**: Route actual public or private dispatches through legal couriers with delivery dates and custody. Resolve loss or return once and distinguish received facts, unresolved reports and unauthorized recipients.
- [x] **[P10-6] Deep-History Archives with Active References (远纪档案与活跃引用)**: Separate archival records from active simulation without dropping living people or pending contractual references. Measure full snapshot memory and serialized save bytes separately, then verify branch isolation, budget behavior and identical results when moving old records to cold history.
- [x] **[P10-7] Voluntary Retirement and Return to Service (告老退居与自愿复出)**: Release actual guard, stewardship and council duties while preserving personal assets and rank history. Reassign service once, record voluntary return and test seamless operation when key officers retire together.
- [x] **[P10-8] Shared Commons and Joint Quotas (灵地公域与共管配额)**: Let several sects fund a common site through explicit agreements, allocate real harvest and maintenance by signed shares, and settle unpaid commitments without duplicating stock or forcing territorial transfer.
- [x] **[P10-9] Resource Flow Reconciliation (物资流向与月度对账)**: Show accountable transfers between people, sites, caravans, clan chests and escrow without counting the same goods in multiple ledgers. Distinguish production, consumption and losses in deterministic monthly receipts.
- [x] **[P10-10] Long-Term Terrain Recovery and Succession (地脉修复与长期演替)**: Track irreversible and recoverable ecological changes after prolonged stress. Follow bounded recovery work and terrain state transitions; prove routes remain connected or show a valid alternate route in the map index.

---

## Phase 11: Accountable Institutions & Resilient Play (可核查制度与耐久体验)

- [x] **[P11-1] Commissioned Workshops & Quality Receipts (工坊委制与品质交割)**: Commission bounded craft batches with actual materials, work turns and agreed quality grades. Attribute inputs and deeds, settle acceptable products once, and return unused supplies without copying failed pieces.
- [x] **[P11-2] Temporary Relic Exhibits & Custody (古器陈列与限期保管)**: Let a pavilion accept a real provenance-backed relic on loan. Remove it from the owner's active equipment, track consent and custody, and return possession exactly once after closure or a documented breach.
- [x] **[P11-3] Restorative Probation & Reinstatement (赎责见习与宗籍复核)**: Let censured or expelled characters request a finite, voluntary remedial plan. Score actual completed service and independent reviews, not model prose, before lifting specific restrictions without rewriting prior misconduct.
- [x] **[P11-4] Road Maintenance & Crossing Rights (驿路修缮与关津权限)**: Contract for real maintenance materials and patrol time on specific map links. Show deterioration, restored route costs and lawful crossing fees without charging twice or blocking an unrepresented alternative.
- [x] **[P11-5] Village Census & Count Reconciliation (坊籍核点与人口口径)**: Distinguish counted residents, sampled households and unobserved migrants. Reconcile verified births, departures and recruit rollovers by actual event evidence without setting a world population cap or leaking hidden settlements.
- [x] **[P11-6] Conflict-of-Interest Arbitration Panels (回避裁断与多方担保)**: Let disputants choose eligible, neutral adjudicators for real multi-party obligations; require disclosed conflicts and independently filed facts. Hold each party's assets once and apply one audited disposition.
- [x] **[P11-7] Field Weather Observatories (观象台与区域实测校准)**: Fund local observations and measure forecast errors against later real readings. Age and relay timestamped observations without treating stale predictions as current facts or revealing fog-hidden sites.
- [ ] **[P11-8] Season Honor Review & Corrections (赛季荣誉复核与更正)**: Allow bounded review of a public scoring receipt using actual event evidence. Preserve the original record, publish justified corrections and move an honor at most once without rewriting private actions.
- [ ] **[P11-9] Recoverable Save Journals (事务存档与恢复点)**: Keep a separately validated previous snapshot when a browser save is interrupted. Restore only after explicit selection and validate slot identity, version, branch and integrity without silently clearing older progress.
- [ ] **[P11-10] Pause-Safe Long-World Fast Forward (长局快进与可取消回放)**: Advance through budgeted chunks on an isolated branch, keep pause/cancel responsive and commit only checked checkpoints. Test equivalence to ordinary ticks and compare latency on growing rosters without dropping people.

---

## Phase 12: Touch Control, Legible Causality & Fair Autonomy (触屏可控、因果可读与均衡自治)

- [ ] **[P12-1] Two-Finger Map and Brush Interlock (双指山河与画笔防误触)**: Keep zoom anchored under the gesture centroid and preserve single-touch scrolling and panning. A second pointer or canceled gesture must disarm an unfinished brush stroke without changing the world. Verify actual touch input on narrow layouts and safe-area controls.
- [ ] **[P12-2] Narrow-Screen Focus Links and Back Context (专注词条与窄屏返回)**: Link an observed chronicle fact to the relevant map, actor or institution without opening another main panel. Back restores the exact branch, filter and scroll context; a missing or fogged target gets a safe receipt instead of guessed coordinates. Verify 360px and 390px layouts with touch and keyboard.
- [ ] **[P12-3] Reverse Chronicle and Proven Causality (逆向纪事与可证原因链)**: Start with siege-to-truce, vacancy-to-election and market-to-settlement chains. Record typed public predecessor IDs, show terminal cause and deliberately omit private or missing links. Test same-name events, fork isolation and a 526-actor long-world fixture.
- [ ] **[P12-4] Fair Model Turns and Unstarved Utility Fallback (轮值推理与无饥饿回退)**: Rotate bounded model slots across actual eligible actors by wait age; every unscheduled actor still acts through Utility. Reject stale responses and expose coverage and longest wait without private reasoning. With 526 actors and a tiny mocked budget, verify no roster truncation or permanent favorites.
- [ ] **[P12-5] Atomic Reservations for Scarce Facility Turns (同刻稀缺设施预约)**: Reserve an actual furnace slot and time exactly once, then release it on cancellation, death or expiry. Publish queue order and real custody; test stable ties, one winner for a last slot and unchanged actor counts in both 48- and 526-person fixtures.
- [ ] **[P12-6] Overnight Camps and Honest Journey Resumption (夜宿营地与行程接续)**: Let delayed travelers spend real provisions on a temporary camp. Resume only from a verified checkpoint and dismantle once. Show only visible camps, never treating them as extra destinations or land titles. Test concurrent arrivals, shortages and cancellation.
- [ ] **[P12-7] Consensual Sparring and Timely Yield (同契切磋与及时认输)**: Require mutually accepted practice terms, honor a valid yield and stop without lethal loot, criminal penalties or tournament points. Apply actual practice and fatigue once; show agreed limits and the stop reason, and test refusal and stale actions.
- [ ] **[P12-8] Expedition Distress and Proven Extraction (秘境求援与实际撤离)**: Let an eligible expedition participant signal only to reachable witnesses. A consenting rescuer spends real supplies and completes one route-backed extraction without teleporting or copying loot. Show observed status and the real outcome; reject stale or impossible efforts.
- [ ] **[P12-9] Cross-Sect Short Shifts and Two-Sided Exit (跨宗短聘与双向退出)**: Staff one actual noncombat workshop or observatory shift with a named worker, real pay, and voluntary entry or exit. Do not transfer rank or membership. Audit attendance and settlement once under revoked access, withdrawal and expiry.
- [ ] **[P12-10] Boundary Patrol and Physical Relief (巡界阵位与换防交接)**: Hand duty between two existing service actors only after an actual checkpoint arrival. Account for route, strain and coverage gaps without phantom guards; publish the latest confirmed coverage without remote hidden positions. Test late relief, death and conflicting duties.

---

## Phase 13: Legible Long Lives & Civic Resilience (长世易读与城镇韧性)

- [ ] **[P13-1] Mobile Attention Budget & Saved Folds (窄屏注意力与折叠记忆)**: Keep one primary task and one explicit next interaction above the fold at 360px, and remember expanded subpanels by workspace without adding a home entry. Roll back invalid actor, branch or imported-world focus; test keyboard and touch with both 48 and 526 real selectable actors.
- [ ] **[P13-2] Apprenticeship Cohorts & Proven Graduation (合班学徒与实绩出师)**: Let one consenting teacher spend one actual instruction period on a finite local cohort. Credit attendance and independently demonstrated skill, track genuine departures without erasing lineage, and award any graduation just once without limiting world population.
- [ ] **[P13-3] Household Name Register & Identity Disputes (家户称名与同名核验)**: Attach locally known names and aliases to actual stable people, never infer kinship from a name. Verify voluntary changes and disambiguate same-name living, deceased and arriving actors across forks, with unknown identities safely remaining unmerged.
- [ ] **[P13-4] Found Caravan Goods & Proven Restitution (遗货寻回与归还凭据)**: When a tracked cargo loss physically leaves recoverable stock, place only the survived units in one real custody record. Require actual discovery and prove custody before restitution; never return the same goods twice or undo the original cash settlement.
- [ ] **[P13-5] Public Granaries & Shortage Drawdowns (义仓库存与短缺支取)**: Let villages hold donated existing roots and spirit stones in one local buffer, release finite rations only to actual shortages, and disclose the remaining balance without minting residents, supply or debt. Verify interrupted deliveries and concurrent demands.
- [ ] **[P13-6] Conflicting Duties & Explicit Handoffs (并行职责冲突与明确交棒)**: Prevent the same actor from completing incompatible staffed duties in one real period. Use reproducible priorities, actual presence and accepted handoffs; expose the withheld or rescheduled duty without replaying payments or exposing private movement.
- [ ] **[P13-7] Building Inspection & Safe Reopening (设施复检与有据复开)**: Close a genuinely damaged facility's applicable service for a specific condition, let local qualified actors spend real materials to inspect or remediate, and reopen only after a verified physical threshold. Protect pending reservations and receipts without inventing replacements.
- [ ] **[P13-8] Long-World Topic Digest Without Extra Alerts (长局主题摘要与静默回看)**: Group already observable chapter, village and trading outcomes by cause and period inside the chronicle, preserving direct proof links and independent conflicting evidence. Keep summary generation read-only and on demand; never add automatic alerts or claim omitted facts did not happen.
- [ ] **[P13-9] Disbanded Institutions & Surviving Obligations (机构撤并与未清义务)**: Close an actual failing institution without deleting its people or outstanding custody. Use explicit successor consent or an audited return for each enforceable obligation; show old and new scopes and prove no duplicate asset transfer.
- [ ] **[P13-10] Large-Save Preview & Honest Capacity Advice (大存档预检与容量指引)**: Estimate exported UTF-8 bytes and distinguish retained snapshot pressure from file size before an optional export or fast-forward. Offer a separate explicitly confirmed archive optimization; it may move eligible narrative only and may not remove any person, unsettled contract or branch proof.
